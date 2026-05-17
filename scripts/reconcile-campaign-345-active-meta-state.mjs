#!/usr/bin/env node

import { createDecipheriv, createHash } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import {
  CAMPAIGN_345_ACTIVE_META,
  appRuntimeReflectsActiveMeta,
  asRecord,
  buildActiveRuntimePatch,
  getMetaProofFailures,
  latestSnapshotIsFreshActive,
} from "./meta-app-state-drift-utils.mjs";

nextEnv.loadEnvConfig(process.cwd());

const APPLY_ACK = "reconcile-campaign-345-active-meta-state";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
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

function destinationFromCreative(creative) {
  const spec = asRecord(creative.object_story_spec);
  return (
    asRecord(asRecord(spec.link_data).call_to_action).value?.link ??
    asRecord(spec.link_data).link ??
    asRecord(asRecord(spec.video_data).call_to_action).value?.link ??
    null
  );
}

async function fetchMetaProof({ supabase, campaignRow }) {
  const { data, error } = await supabase
    .from("marketing_accounts")
    .select("id,organization_id,platform,status,account_name,external_account_id,pixel_id,connection_metadata,access_token_encrypted")
    .eq("organization_id", campaignRow.organization_id)
    .eq("platform", "meta_ads")
    .limit(1);

  if (error) throw new Error(`marketing_accounts: ${error.message}`);
  const account = data?.[0] ?? null;
  if (!account?.access_token_encrypted) {
    throw new Error("Meta connection has no encrypted token for read-only verification.");
  }

  const accessToken = decryptSecret(account.access_token_encrypted, requireEnv("META_TOKEN_ENCRYPTION_KEY"));

  async function graph(path, fields) {
    const url = new URL(`https://graph.facebook.com/v19.0/${path}`);
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url);
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`${path}: ${response.status} ${body?.error?.message ?? "Meta request failed"}`);
    }
    return body;
  }

  const [campaign, adset, ad, creative] = await Promise.all([
    graph(CAMPAIGN_345_ACTIVE_META.metaCampaignId, "id,name,status,effective_status,configured_status,objective,buying_type"),
    graph(CAMPAIGN_345_ACTIVE_META.metaAdSetId, "id,name,status,effective_status,configured_status,daily_budget,campaign_id,destination_type,promoted_object"),
    graph(CAMPAIGN_345_ACTIVE_META.metaAdId, "id,name,status,effective_status,configured_status,campaign_id,adset_id,creative{id},tracking_specs"),
    graph(CAMPAIGN_345_ACTIVE_META.metaCreativeId, "id,name,object_story_spec"),
  ]);

  return {
    account: {
      id: account.id,
      organization_id: account.organization_id,
      status: account.status,
      account_name: account.account_name ?? null,
      external_account_id: account.external_account_id,
      pixel_id: account.pixel_id ?? asRecord(account.connection_metadata).pixel_id ?? null,
      domain_verified: asRecord(account.connection_metadata).domain_verified ?? null,
      launch_domain: asRecord(account.connection_metadata).launch_domain ?? null,
      hasAccessToken: Boolean(account.access_token_encrypted),
    },
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      effective_status: campaign.effective_status,
      configured_status: campaign.configured_status,
      objective: campaign.objective,
      buying_type: campaign.buying_type,
    },
    adset: {
      id: adset.id,
      name: adset.name,
      status: adset.status,
      effective_status: adset.effective_status,
      configured_status: adset.configured_status,
      daily_budget: adset.daily_budget ?? null,
      campaign_id: adset.campaign_id,
      destination_type: adset.destination_type,
      promoted_object_keys: Object.keys(asRecord(adset.promoted_object)),
    },
    ad: {
      id: ad.id,
      name: ad.name,
      status: ad.status,
      effective_status: ad.effective_status,
      configured_status: ad.configured_status,
      campaign_id: ad.campaign_id,
      adset_id: ad.adset_id,
      creative_id: ad.creative?.id ?? null,
      trackingSpecsCount: Array.isArray(ad.tracking_specs) ? ad.tracking_specs.length : 0,
    },
    creative: {
      id: creative.id,
      name: creative.name,
      destinationLink: destinationFromCreative(creative),
    },
  };
}

async function loadLatestSnapshot(supabase) {
  const { data, error } = await supabase
    .from("campaign_sync_snapshots")
    .select("id,meta_campaign_id,campaign_status,ad_set_statuses,ad_statuses,synced_at")
    .eq("organization_id", CAMPAIGN_345_ACTIVE_META.organizationId)
    .eq("user_id", CAMPAIGN_345_ACTIVE_META.userId)
    .eq("meta_campaign_id", CAMPAIGN_345_ACTIVE_META.metaCampaignId)
    .order("synced_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`campaign_sync_snapshots: ${error.message}`);
  return data?.[0] ?? null;
}

function buildSnapshotInsert({ campaignRow, proof, now }) {
  return {
    organization_id: CAMPAIGN_345_ACTIVE_META.organizationId,
    user_id: CAMPAIGN_345_ACTIVE_META.userId,
    campaign_name: proof.campaign.name ?? "Campaign 345 active Meta reconciliation",
    account_name: proof.account.account_name,
    launch_mode: "live",
    sync_result: "success",
    meta_campaign_id: CAMPAIGN_345_ACTIVE_META.metaCampaignId,
    meta_ad_set_ids: [CAMPAIGN_345_ACTIVE_META.metaAdSetId],
    meta_ad_ids: [CAMPAIGN_345_ACTIVE_META.metaAdId],
    campaign_status: proof.campaign.status,
    ad_set_statuses: [
      {
        id: proof.adset.id,
        name: proof.adset.name,
        status: proof.adset.status,
        effective_status: proof.adset.effective_status,
        daily_budget: proof.adset.daily_budget,
      },
    ],
    ad_statuses: [
      {
        id: proof.ad.id,
        name: proof.ad.name,
        status: proof.ad.status,
        effective_status: proof.ad.effective_status,
      },
    ],
    delivery_metrics: {},
    sync_metadata: {
      source: "campaign_345_active_meta_reconciliation",
      read_only_meta_verification: true,
      app_campaign_id: campaignRow.id,
      destination_url: proof.creative.destinationLink,
      budget_daily_cents: proof.adset.daily_budget,
    },
    sync_errors: [],
    synced_at: now,
  };
}

function summarize({ campaignRow, proof, latestSnapshot, afterPlan, now }) {
  const failures = getMetaProofFailures(proof);
  return {
    targetCampaignId: CAMPAIGN_345_ACTIVE_META.campaignId,
    mutatesMeta: false,
    metaProofFailures: failures,
    sufficientEvidence: failures.length === 0,
    before: {
      launch_status: campaignRow.launch_status ?? null,
      runtime_status: asRecord(campaignRow.plan?.runtime).status ?? null,
      runtime_safety_state: asRecord(campaignRow.plan?.runtime).safetyState ?? null,
      runtime_meta_push_status: asRecord(campaignRow.plan?.runtime).metaPushStatus ?? null,
      latest_sync_status: latestSnapshot?.campaign_status ?? null,
      latest_sync_at: latestSnapshot?.synced_at ?? null,
    },
    meta: {
      campaign_status: proof.campaign.status,
      campaign_effective_status: proof.campaign.effective_status,
      adset_status: proof.adset.status,
      adset_effective_status: proof.adset.effective_status,
      ad_status: proof.ad.status,
      ad_effective_status: proof.ad.effective_status,
      daily_budget: proof.adset.daily_budget,
      destination: proof.creative.destinationLink,
    },
    after: {
      launch_status: "live",
      runtime_status: afterPlan.runtime.status,
      runtime_safety_state: afterPlan.runtime.safetyState,
      runtime_meta_push_status: afterPlan.runtime.metaPushStatus,
      launch_runtime_status: afterPlan.launch_runtime.status,
      launch_runtime_step_status: afterPlan.launch_runtime.step_status,
      snapshot_synced_at: now,
    },
    rollback: {
      scope: "campaign_plans row id 345dcc04-8e87-4ead-b71a-40236e2ef52e and the inserted campaign_sync_snapshots row only",
      action:
        "Restore the previous campaign_plans.plan/launch_status from Supabase PITR or pre-apply output, and delete only the inserted reconciliation snapshot if needed.",
    },
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const ack = process.argv.find((arg) => arg.startsWith("--ack="))?.slice("--ack=".length) ?? "";
  if (apply && ack !== APPLY_ACK) throw new Error(`Apply requires --ack=${APPLY_ACK}.`);

  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error } = await supabase
    .from("campaign_plans")
    .select("*")
    .eq("id", CAMPAIGN_345_ACTIVE_META.campaignId);
  if (error) throw new Error(`campaign_plans: ${error.message}`);
  if (!rows || rows.length !== 1) throw new Error(`Expected one campaign row, found ${rows?.length ?? 0}.`);
  const campaignRow = rows[0];
  if (campaignRow.organization_id !== CAMPAIGN_345_ACTIVE_META.organizationId) throw new Error("organization_mismatch");
  if (campaignRow.user_id !== CAMPAIGN_345_ACTIVE_META.userId) throw new Error("user_mismatch");

  const now = new Date().toISOString();
  const proof = await fetchMetaProof({ supabase, campaignRow });
  const latestSnapshot = await loadLatestSnapshot(supabase);
  const afterPlan = buildActiveRuntimePatch(campaignRow.plan ?? {}, proof, now);
  const decision = summarize({ campaignRow, proof, latestSnapshot, afterPlan, now });

  if (!decision.sufficientEvidence) {
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry_run", ...decision }, null, 2));
    process.exitCode = 1;
    return;
  }

  const alreadyReconciled =
    appRuntimeReflectsActiveMeta(campaignRow) && latestSnapshotIsFreshActive(latestSnapshot, proof);

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry_run", alreadyReconciled, ...decision }, null, 2));
    return;
  }

  let insertedSnapshotId = null;
  if (!appRuntimeReflectsActiveMeta(campaignRow)) {
    const { error: updateError } = await supabase
      .from("campaign_plans")
      .update({
        plan: afterPlan,
        launch_status: "live",
      })
      .eq("id", CAMPAIGN_345_ACTIVE_META.campaignId)
      .eq("organization_id", CAMPAIGN_345_ACTIVE_META.organizationId)
      .eq("user_id", CAMPAIGN_345_ACTIVE_META.userId);
    if (updateError) throw new Error(`campaign_plans update failed: ${updateError.message}`);
  }

  if (!latestSnapshotIsFreshActive(latestSnapshot, proof)) {
    const { data: inserted, error: insertError } = await supabase
      .from("campaign_sync_snapshots")
      .insert(buildSnapshotInsert({ campaignRow, proof, now }))
      .select("id")
      .single();
    if (insertError) throw new Error(`campaign_sync_snapshots insert failed: ${insertError.message}`);
    insertedSnapshotId = inserted?.id ?? null;
  }

  if (proof.account.id) {
    await supabase.from("marketing_accounts").update({ last_sync_at: now }).eq("id", proof.account.id);
  }

  const { data: verifyRows, error: verifyError } = await supabase
    .from("campaign_plans")
    .select("*")
    .eq("id", CAMPAIGN_345_ACTIVE_META.campaignId);
  if (verifyError) throw new Error(`campaign_plans verify failed: ${verifyError.message}`);
  const verifySnapshot = await loadLatestSnapshot(supabase);

  console.log(JSON.stringify({
    mode: "apply",
    appliedRuntimeUpdate: !appRuntimeReflectsActiveMeta(campaignRow),
    insertedSnapshotId,
    beforeAfter: decision,
    verification: {
      appRuntimeReflectsActiveMeta: appRuntimeReflectsActiveMeta(verifyRows?.[0]),
      latestSnapshotIsFreshActive: latestSnapshotIsFreshActive(verifySnapshot, proof),
      latestSnapshotId: verifySnapshot?.id ?? null,
      latestSnapshotStatus: verifySnapshot?.campaign_status ?? null,
      latestSnapshotSyncedAt: verifySnapshot?.synced_at ?? null,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
