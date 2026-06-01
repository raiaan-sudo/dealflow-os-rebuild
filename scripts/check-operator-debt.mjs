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

async function fetchCampaignPlanRowsPaged(supabase, selectColumns, options = {}) {
  const pageSize = options.pageSize ?? 100;
  const rows = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("campaign_plans")
      .select(selectColumns)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`campaign_plans paged scan: ${error.message}`);
    }

    rows.push(...(data ?? []));

    if (!data || data.length < pageSize) {
      return rows;
    }
  }
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

function stringArray(value) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function selectedStaticIdsFromPlan(plan) {
  const record = asRecord(plan);
  const payload = asRecord(record.campaign_payload);
  const nestedPlan = asRecord(record.plan);
  const nestedPayload = asRecord(nestedPlan.campaign_payload);

  return unique([
    ...stringArray(record.selected_ad_ids),
    ...stringArray(payload.selected_ad_ids),
    ...stringArray(nestedPlan.selected_ad_ids),
    ...stringArray(nestedPayload.selected_ad_ids),
  ]);
}

function staticAdsFromPlan(plan) {
  const record = asRecord(plan);
  const nestedPlan = asRecord(record.plan);
  const creatives = asRecord(record.creatives);
  const nestedCreatives = asRecord(nestedPlan.creatives);

  return [
    ...(Array.isArray(record.staticAds) ? record.staticAds : []),
    ...(Array.isArray(nestedPlan.staticAds) ? nestedPlan.staticAds : []),
    ...(Array.isArray(creatives.staticAds) ? creatives.staticAds : []),
    ...(Array.isArray(nestedCreatives.staticAds) ? nestedCreatives.staticAds : []),
  ].filter((item) => item && typeof item === "object" && !Array.isArray(item));
}

function selectedStaticIdForCreative(creative) {
  const record = asRecord(creative);
  return String(record.id ?? record.creativeId ?? record.creative_id ?? "").trim();
}

function hasBlockedStaticCreativeProvenance(value) {
  const record = asRecord(value);
  const metadata = asRecord(record.metadata);
  const sourceImageQa = asRecord(record.sourceImageQa ?? metadata.sourceImageQa);
  const generationMethod = String(record.generation_method ?? record.generationMethod ?? "").toLowerCase();
  const providerName = String(record.provider_name ?? record.providerName ?? "").toLowerCase();
  const compositionVersion = String(record.compositionVersion ?? metadata.compositionVersion ?? "").toLowerCase();

  return (
    generationMethod === "app_composed_static" ||
    providerName === "dealflow_app_composer" ||
    record.appComposedFinal === true ||
    metadata.appComposedFinal === true ||
    compositionVersion === "app_composed_static_v2" ||
    sourceImageQa.mode === "background_only"
  );
}

async function getSelectedBlockedStaticAssetDebt(supabase) {
  const campaigns = await fetchCampaignPlanRowsPaged(supabase, "id,plan");

  const selectedByCampaign = new Map();
  const blocked = [];

  for (const campaign of campaigns) {
    const selectedIds = selectedStaticIdsFromPlan(campaign.plan);
    if (selectedIds.length === 0) continue;

    selectedByCampaign.set(campaign.id, new Set(selectedIds));

    for (const creative of staticAdsFromPlan(campaign.plan)) {
      const id = selectedStaticIdForCreative(creative);
      if (id && selectedIds.includes(id) && hasBlockedStaticCreativeProvenance(creative)) {
        blocked.push(`${campaign.id}:${id}`);
      }
    }
  }

  if (selectedByCampaign.size === 0) {
    return { count: 0, affectedIds: [] };
  }

  const campaignIds = [...selectedByCampaign.keys()];
  const { data: assets, error: assetError } = await supabase
    .from("creative_assets")
    .select("id,campaign_id,creative_id,generation_method,provider_name,metadata")
    .in("campaign_id", campaignIds);

  if (assetError) {
    throw new Error(`creative_assets selected static scan: ${assetError.message}`);
  }

  const assetsBySelectedId = new Map();

  for (const asset of assets ?? []) {
    const selectedIds = selectedByCampaign.get(asset.campaign_id);
    if (!selectedIds) continue;

    const assetIds = [asset.id, asset.creative_id].map((id) => String(id ?? "").trim()).filter(Boolean);
    for (const id of assetIds) {
      if (!selectedIds.has(id)) continue;
      const key = `${asset.campaign_id}:${id}`;
      const current = assetsBySelectedId.get(key) ?? [];
      current.push(asset);
      assetsBySelectedId.set(key, current);
    }
  }

  for (const [key, matchingAssets] of assetsBySelectedId) {
    if (matchingAssets.length > 0 && matchingAssets.every(hasBlockedStaticCreativeProvenance)) {
      blocked.push(key);
    }
  }

  return {
    count: unique(blocked).length,
    affectedIds: unique(blocked).slice(0, 12),
  };
}

async function getOffboardingDebt(supabase) {
  const staleBefore = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const [failedJobs, staleJobs, campaignRows] = await Promise.all([
    countRows(supabase, "system_jobs", (query) =>
      query
        .eq("kind", "campaign_offboarding_cleanup")
        .eq("status", "failed")
        .is("reviewed_at", null),
    ),
    countRows(supabase, "system_jobs", (query) =>
      query
        .eq("kind", "campaign_offboarding_cleanup")
        .in("status", ["pending", "processing"])
        .lt("created_at", staleBefore)
        .is("reviewed_at", null),
    ),
    fetchCampaignPlanRowsPaged(supabase, "id,launch_status,publish_state,plan"),
  ]);

  let offboardedPublished = 0;
  let activeOffboardedRuntime = 0;

  for (const row of campaignRows) {
    const plan = asRecord(row.plan);
    const runtime = asRecord(plan.runtime);
    const offboardingStatus = String(runtime.offboardingStatus ?? asRecord(plan.offboarding).status ?? "");
    const isOffboarded =
      row.launch_status === "offboarded" ||
      offboardingStatus === "deleted" ||
      offboardingStatus === "blocked_review";
    if (
      isOffboarded &&
      row.publish_state === "published" &&
      (runtime.status === "live" || runtime.safetyState === "live")
    ) {
      offboardedPublished += 1;
    }

    if (
      (row.launch_status === "offboarded" || row.launch_status === "paused") &&
      (runtime.metaPushStatus === "published" || runtime.status === "live" || runtime.safetyState === "live")
    ) {
      activeOffboardedRuntime += 1;
    }
  }

  return {
    failedJobs,
    staleJobs,
    offboardedPublished,
    activeOffboardedRuntime,
  };
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
    failedPerformanceLeadBillingEvents,
    pendingPerformanceLeadBillingEvents,
    failedProviderEvents,
    staleProviderReservations,
    staleDeferredCreativeJobs,
    selectedBlockedStaticAssetDebt,
    deliveredNotificationStatusDrift,
    failedNotificationStatusDrift,
    campaign345MetaDebt,
    offboardingDebt,
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
    countRows(supabase, "lead_billing_events", (query) =>
      query.eq("status", "failed"),
    ),
    countRows(supabase, "lead_billing_events", (query) =>
      query
        .eq("status", "pending")
        .lt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()),
    ),
    countUnreviewedFailedProviderEvents(supabase),
    countRows(supabase, "provider_usage_events", (query) =>
      query
        .eq("status", "reserved")
        .lt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()),
    ),
    countStaleDeferredCreativeJobs(supabase),
    getSelectedBlockedStaticAssetDebt(supabase),
    countRows(supabase, "lead_notifications", (query) =>
      query.not("delivered_at", "is", null).neq("status", "delivered"),
    ),
    countRows(supabase, "lead_notifications", (query) =>
      query.not("failed_at", "is", null).neq("status", "failed"),
    ),
    getCampaign345MetaDebt(supabase),
    getOffboardingDebt(supabase),
  ]);

  const summary = {
    unresolvedFailedJobs,
    unresolvedDeadLetterJobs,
    unresolvedStripeFailures,
    failedPerformanceLeadBillingEvents,
    pendingPerformanceLeadBillingEvents,
    failedProviderEvents,
    staleProviderReservations,
    staleDeferredCreativeJobs,
    selectedBlockedStaticAssets: selectedBlockedStaticAssetDebt.count,
    deliveredNotificationStatusDrift,
    failedNotificationStatusDrift,
    metaReadOnlyVerificationErrors: campaign345MetaDebt.metaReadOnlyVerificationErrors,
    metaAppStatusDrift: campaign345MetaDebt.metaAppStatusDrift,
    staleMetaSyncSnapshots: campaign345MetaDebt.staleMetaSyncSnapshots,
    offboardingFailedJobs: offboardingDebt.failedJobs,
    offboardingStaleJobs: offboardingDebt.staleJobs,
    offboardedPublishedFunnels: offboardingDebt.offboardedPublished,
    offboardedActiveLaunchRuntime: offboardingDebt.activeOffboardedRuntime,
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

  if (failedPerformanceLeadBillingEvents === 0 && pendingPerformanceLeadBillingEvents === 0) {
    pass("Performance lead billing events", "no failed events or stale pending usage");
  } else {
    fail(
      "Performance lead billing events",
      `${failedPerformanceLeadBillingEvents} failed usage event(s), ${pendingPerformanceLeadBillingEvents} stale pending usage event(s)`,
    );
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

  if (selectedBlockedStaticAssetDebt.count === 0) {
    pass("Selected app-composed/fallback static assets", "none");
  } else {
    fail(
      "Selected app-composed/fallback static assets",
      `${selectedBlockedStaticAssetDebt.count} selected blocked asset(s): ${selectedBlockedStaticAssetDebt.affectedIds.join(", ")}`,
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

  if (
    offboardingDebt.failedJobs === 0 &&
    offboardingDebt.staleJobs === 0 &&
    offboardingDebt.offboardedPublished === 0 &&
    offboardingDebt.activeOffboardedRuntime === 0
  ) {
    pass("Campaign offboarding cleanup debt", "none");
  } else {
    fail(
      "Campaign offboarding cleanup debt",
      [
        `${offboardingDebt.failedJobs} failed cleanup job(s)`,
        `${offboardingDebt.staleJobs} stale cleanup job(s)`,
        `${offboardingDebt.offboardedPublished} offboarded published funnel(s)`,
        `${offboardingDebt.activeOffboardedRuntime} active launch runtime drift issue(s)`,
      ].join("; "),
    );
  }
}

main().catch((error) => {
  fail("Operator debt check crashed", error instanceof Error ? error.message : String(error));
});
