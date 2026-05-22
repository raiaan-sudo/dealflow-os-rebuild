#!/usr/bin/env node

import nextEnv from "@next/env";
import { createDecipheriv, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  CAMPAIGN_345_ACTIVE_META,
  appRuntimeReflectsActiveMeta,
  appRuntimeReflectsPausedMeta,
  asRecord,
  getMetaProofFailures,
  latestSnapshotIsFreshActive,
  metaProofIsCampaignLevelPaused,
} from "./meta-app-state-drift-utils.mjs";

nextEnv.loadEnvConfig(process.cwd());

const MARKETING_STUDIO_WORKER_DEFERRED_UNTIL_MS = Date.parse("2099-01-01T00:00:00.000Z");

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function pass(name, detail = "") {
  console.log(`PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name, detail = "") {
  console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  process.exitCode = 1;
}

function warn(name, detail = "") {
  console.log(`WARN  ${name}${detail ? ` - ${detail}` : ""}`);
}

async function countRows(supabase, table, queryBuilder) {
  const query = queryBuilder(
    supabase.from(table).select("id", { count: "exact", head: true }),
  );
  const { count, error } = await query;
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function countUnreviewedFailedProviderEvents(supabase) {
  const { data, error } = await supabase
    .from("provider_usage_events")
    .select("id,metadata")
    .eq("status", "failed");

  if (error) {
    throw new Error(`provider_usage_events: ${error.message}`);
  }

  return (data ?? []).filter((row) => !row.metadata?.operatorReviewedAt).length;
}

async function countStaleDeferredCreativeJobs(supabase) {
  const { data, error } = await supabase
    .from("system_jobs")
    .select("id,kind,status,next_run_at,created_at,reviewed_at")
    .in("kind", ["static_creative_generation", "video_generation"])
    .eq("status", "pending")
    .is("reviewed_at", null);

  if (error) {
    throw new Error(`system_jobs stale deferred creative query: ${error.message}`);
  }

  const staleBefore = Date.now() - 15 * 60 * 1000;
  return (data ?? []).filter((row) => {
    const nextRunAt = Date.parse(row.next_run_at ?? "");
    const createdAt = Date.parse(row.created_at ?? "");
    return (
      Number.isFinite(nextRunAt) &&
      nextRunAt >= MARKETING_STUDIO_WORKER_DEFERRED_UNTIL_MS &&
      Number.isFinite(createdAt) &&
      createdAt < staleBefore
    );
  }).length;
}

function decryptSecret(payload, secret) {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function readDestinationLink(creative) {
  const spec = asRecord(creative.object_story_spec);
  return (
    asRecord(asRecord(spec.link_data).call_to_action).value?.link ??
    asRecord(spec.link_data).link ??
    asRecord(asRecord(spec.video_data).call_to_action).value?.link ??
    null
  );
}

async function fetchMetaProofForCampaign345(supabase) {
  const { data: campaigns, error: campaignError } = await supabase
    .from("campaign_plans")
    .select("id,organization_id,user_id,launch_status,plan")
    .eq("id", CAMPAIGN_345_ACTIVE_META.campaignId)
    .limit(1);
  if (campaignError) throw new Error(`campaign_plans: ${campaignError.message}`);

  const campaignRow = campaigns?.[0] ?? null;
  if (!campaignRow) {
    return {
      campaignRow: null,
      latestSnapshot: null,
      proof: null,
      errors: ["campaign_345_missing"],
    };
  }

  const { data: accounts, error: accountError } = await supabase
    .from("marketing_accounts")
    .select("id,organization_id,platform,access_token_encrypted")
    .eq("organization_id", CAMPAIGN_345_ACTIVE_META.organizationId)
    .eq("platform", "meta_ads")
    .limit(1);
  if (accountError) throw new Error(`marketing_accounts: ${accountError.message}`);

  const account = accounts?.[0] ?? null;
  const encryptionKey = process.env.META_TOKEN_ENCRYPTION_KEY?.trim();
  if (!account?.access_token_encrypted || !encryptionKey) {
    return {
      campaignRow,
      latestSnapshot: null,
      proof: null,
      errors: ["meta_read_only_verification_unavailable"],
    };
  }

  const accessToken = decryptSecret(account.access_token_encrypted, encryptionKey);
  async function graph(path, fields) {
    const url = new URL(`https://graph.facebook.com/v19.0/${path}`);
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url);
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`${path}: ${response.status} ${body?.error?.code ?? "meta_request_failed"}`);
    }
    return body;
  }

  const [campaign, adset, ad, creative] = await Promise.all([
    graph(CAMPAIGN_345_ACTIVE_META.metaCampaignId, "id,status,effective_status,configured_status"),
    graph(CAMPAIGN_345_ACTIVE_META.metaAdSetId, "id,status,effective_status,configured_status,daily_budget,campaign_id"),
    graph(CAMPAIGN_345_ACTIVE_META.metaAdId, "id,status,effective_status,configured_status,campaign_id,adset_id,creative{id}"),
    graph(CAMPAIGN_345_ACTIVE_META.metaCreativeId, "id,object_story_spec"),
  ]);

  const proof = {
    campaign,
    adset,
    ad: {
      ...ad,
      creative_id: ad.creative?.id ?? null,
    },
    creative: {
      id: creative.id,
      destinationLink: readDestinationLink(creative),
    },
  };

  const { data: snapshots, error: snapshotError } = await supabase
    .from("campaign_sync_snapshots")
    .select("id,meta_campaign_id,campaign_status,ad_set_statuses,ad_statuses,synced_at")
    .eq("organization_id", CAMPAIGN_345_ACTIVE_META.organizationId)
    .eq("user_id", CAMPAIGN_345_ACTIVE_META.userId)
    .eq("meta_campaign_id", CAMPAIGN_345_ACTIVE_META.metaCampaignId)
    .order("synced_at", { ascending: false })
    .limit(1);
  if (snapshotError) throw new Error(`campaign_sync_snapshots: ${snapshotError.message}`);

  return {
    campaignRow,
    latestSnapshot: snapshots?.[0] ?? null,
    proof,
    errors: getMetaProofFailures(proof),
  };
}

async function getCampaign345MetaDebt(supabase) {
  const result = await fetchMetaProofForCampaign345(supabase);
  const campaignPausedAtMeta = result.proof && metaProofIsCampaignLevelPaused(result.proof);
  const verificationErrors = campaignPausedAtMeta ? 0 : result.errors.length;
  const appStatusDrift =
    result.proof && (
      campaignPausedAtMeta
        ? !appRuntimeReflectsPausedMeta(result.campaignRow)
        : result.errors.length === 0 && !appRuntimeReflectsActiveMeta(result.campaignRow)
    )
      ? 1
      : 0;
  const staleSyncSnapshot =
    result.proof && !campaignPausedAtMeta && result.errors.length === 0 && !latestSnapshotIsFreshActive(result.latestSnapshot, result.proof) ? 1 : 0;

  return {
    metaReadOnlyVerificationErrors: verificationErrors,
    metaAppStatusDrift: appStatusDrift,
    staleMetaSyncSnapshots: staleSyncSnapshot,
    metaDebtDetails: campaignPausedAtMeta ? ["campaign_intentionally_paused_non_blocking"] : result.errors,
  };
}

async function main() {
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const [
    unresolvedFailedJobs,
    unresolvedDeadLetterJobs,
    unresolvedStripeFailures,
    failedProviderEvents,
    staleProviderReservations,
    staleDeferredCreativeJobs,
    deliveredNotificationStatusDrift,
    failedNotificationStatusDrift,
    campaign345MetaDebt,
  ] = await Promise.all([
    countRows(supabase, "system_jobs", (query) =>
      query.eq("status", "failed").is("reviewed_at", null),
    ),
    countRows(supabase, "system_jobs", (query) =>
      query.not("dead_lettered_at", "is", null).is("reviewed_at", null),
    ),
    countRows(supabase, "stripe_webhook_events", (query) =>
      query.eq("status", "failed").is("reviewed_at", null),
    ),
    countUnreviewedFailedProviderEvents(supabase),
    countRows(supabase, "provider_usage_events", (query) =>
      query
        .eq("status", "reserved")
        .lt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()),
    ),
    countStaleDeferredCreativeJobs(supabase),
    countRows(supabase, "lead_notifications", (query) =>
      query.not("delivered_at", "is", null).neq("status", "delivered"),
    ),
    countRows(supabase, "lead_notifications", (query) =>
      query.not("failed_at", "is", null).neq("status", "failed"),
    ),
    getCampaign345MetaDebt(supabase),
  ]);

  const summary = {
    unresolvedFailedJobs,
    unresolvedDeadLetterJobs,
    unresolvedStripeFailures,
    failedProviderEvents,
    staleProviderReservations,
    staleDeferredCreativeJobs,
    deliveredNotificationStatusDrift,
    failedNotificationStatusDrift,
    metaReadOnlyVerificationErrors: campaign345MetaDebt.metaReadOnlyVerificationErrors,
    metaAppStatusDrift: campaign345MetaDebt.metaAppStatusDrift,
    staleMetaSyncSnapshots: campaign345MetaDebt.staleMetaSyncSnapshots,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (unresolvedFailedJobs === 0) {
    pass("Unresolved failed jobs", "none");
  } else {
    fail("Unresolved failed jobs", `${unresolvedFailedJobs} require retry, review, or resolution`);
  }

  if (unresolvedDeadLetterJobs === 0) {
    pass("Unresolved dead-letter jobs", "none");
  } else {
    fail("Unresolved dead-letter jobs", `${unresolvedDeadLetterJobs} require retry, review, or resolution`);
  }

  if (unresolvedStripeFailures === 0) {
    pass("Unresolved Stripe webhook failures", "none");
  } else {
    fail("Unresolved Stripe webhook failures", `${unresolvedStripeFailures} require replay, resync, or review`);
  }

  if (failedProviderEvents === 0 && staleProviderReservations === 0) {
    pass("Provider usage debt", "no failed events or stale reservations");
  } else {
    warn(
      "Provider usage debt",
      `${failedProviderEvents} failed events, ${staleProviderReservations} stale reservations`,
    );
    process.exitCode = 1;
  }

  if (staleDeferredCreativeJobs === 0) {
    pass("Stale deferred creative render jobs", "none");
  } else {
    fail(
      "Stale deferred creative render jobs",
      `${staleDeferredCreativeJobs} worker-required creative job(s) need worker readiness, operator review, or scoped requeue`,
    );
  }

  if (deliveredNotificationStatusDrift === 0 && failedNotificationStatusDrift === 0) {
    pass("Lead notification status drift", "none");
  } else {
    fail(
      "Lead notification status drift",
      `${deliveredNotificationStatusDrift} delivered rows and ${failedNotificationStatusDrift} failed rows have stale status`,
    );
  }

  if (
    campaign345MetaDebt.metaReadOnlyVerificationErrors === 0 &&
    campaign345MetaDebt.metaAppStatusDrift === 0 &&
    campaign345MetaDebt.staleMetaSyncSnapshots === 0
  ) {
    pass("Campaign 345 Meta/app status drift", "none");
  } else {
    fail(
      "Campaign 345 Meta/app status drift",
      [
        `${campaign345MetaDebt.metaReadOnlyVerificationErrors} read-only verification issue(s)`,
        `${campaign345MetaDebt.metaAppStatusDrift} app runtime drift issue(s)`,
        `${campaign345MetaDebt.staleMetaSyncSnapshots} stale sync snapshot issue(s)`,
        campaign345MetaDebt.metaDebtDetails.length
          ? `details: ${campaign345MetaDebt.metaDebtDetails.join(", ")}`
          : null,
      ].filter(Boolean).join("; "),
    );
  }
}

main().catch((error) => {
  fail("Operator debt check crashed", error instanceof Error ? error.message : String(error));
});
