#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const TARGET = {
  jobId: "9453a87d-4e99-4d2f-91e5-05cc4b16d87c",
  campaignId: "957014e8-870f-40e1-9f71-ea7256b09482",
  organizationId: "42e2ccc8-8515-48c3-b105-df531f82031d",
  expectedAdAccountId: "act_344085034950359",
  expectedPageId: "195428953917127",
  expectedPixelId: "1396310424907119",
  confirm: "ACKNOWLEDGE_MARTINE_META_SYNC_STALE_DEBT",
};

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createSupabase() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringArray(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function parseArgs(argv) {
  const args = {
    apply: false,
    dryRun: false,
    confirm: null,
  };

  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    if (arg === "--dry-run") args.dryRun = true;
    if (arg.startsWith("--confirm=")) args.confirm = arg.slice("--confirm=".length);
  }

  if (!args.apply && !args.dryRun) {
    args.dryRun = true;
  }

  if (args.apply && args.confirm !== TARGET.confirm) {
    throw new Error(`Apply requires --confirm=${TARGET.confirm}`);
  }

  return args;
}

function pass(name, detail = "") {
  console.log(`PASS ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name, detail = "") {
  throw new Error(`${name}${detail ? ` - ${detail}` : ""}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createSupabase();

  const { data: job, error: jobError } = await supabase
    .from("system_jobs")
    .select("id,kind,status,campaign_id,organization_id,error_message,last_error_code,dead_lettered_at,dead_letter_reason,reviewed_at,payload,created_at")
    .eq("id", TARGET.jobId)
    .maybeSingle();

  if (jobError) fail("Read target job", jobError.message);
  if (!job) fail("Target Martine meta_sync job exists", TARGET.jobId);
  if (job.reviewed_at) fail("Target job is still unreviewed", job.reviewed_at);
  if (job.kind !== "meta_sync") fail("Target job kind is meta_sync", String(job.kind));
  if (job.status !== "failed") fail("Target job status is failed", String(job.status));
  if (job.campaign_id !== TARGET.campaignId) fail("Target job belongs to Martine campaign", String(job.campaign_id));
  if (job.organization_id !== TARGET.organizationId) fail("Target job belongs to Martine organization", String(job.organization_id));
  if (job.last_error_code !== "meta_not_connected") fail("Target job error code is historical meta_not_connected", String(job.last_error_code));
  if (job.error_message !== "Connect a Meta ad account before syncing status.") {
    fail("Target job error message matches historical missing connection failure", String(job.error_message));
  }
  pass("Target stale meta_sync job matches expected invariant", job.id);

  const { data: campaign, error: campaignError } = await supabase
    .from("campaign_plans")
    .select("id,organization_id,public_slug,launch_status,plan")
    .eq("id", TARGET.campaignId)
    .maybeSingle();

  if (campaignError) fail("Read Martine campaign", campaignError.message);
  if (!campaign) fail("Martine campaign exists", TARGET.campaignId);
  if (campaign.organization_id !== TARGET.organizationId) fail("Martine campaign organization matches", String(campaign.organization_id));
  const runtime = asRecord(asRecord(campaign.plan).launch_runtime);
  const adIds = stringArray(runtime.ad_ids);
  if (!runtime.campaign_id || !runtime.adset_id || adIds.length < 3) {
    fail("Martine launch runtime has campaign, ad set, and three ad ids", JSON.stringify({
      campaignId: runtime.campaign_id ?? null,
      adSetId: runtime.adset_id ?? null,
      adIds,
    }));
  }
  pass("Martine launch runtime proves later Meta launch succeeded", `${runtime.campaign_id} / ${adIds.length} ads`);

  const { data: marketingAccount, error: marketingError } = await supabase
    .from("marketing_accounts")
    .select("id,status,organization_id,external_account_id,account_name,access_token_encrypted,connection_metadata,pixel_id")
    .eq("organization_id", TARGET.organizationId)
    .eq("platform", "meta_ads")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (marketingError) fail("Read Martine Meta connection", marketingError.message);
  if (!marketingAccount) fail("Martine Meta connection exists");
  const metadata = asRecord(marketingAccount.connection_metadata);
  const selectedAccountId = metadata.selected_external_account_id ?? marketingAccount.external_account_id;
  const selectedPageId = metadata.selected_page_id;
  const selectedPixelId = metadata.selected_pixel_id ?? marketingAccount.pixel_id;
  if (marketingAccount.status !== "connected") fail("Martine Meta connection is connected", String(marketingAccount.status));
  if (!marketingAccount.access_token_encrypted) fail("Martine Meta token is configured");
  if (selectedAccountId !== TARGET.expectedAdAccountId) fail("Martine selected ad account matches", String(selectedAccountId));
  if (selectedPageId !== TARGET.expectedPageId) fail("Martine selected page matches", String(selectedPageId));
  if (selectedPixelId !== TARGET.expectedPixelId) fail("Martine selected pixel matches", String(selectedPixelId));
  pass("Martine Meta connection now valid", `${marketingAccount.account_name ?? selectedAccountId}`);

  if (args.dryRun) {
    console.log("DRY_RUN No rows updated.");
    return;
  }

  const reviewedAt = new Date().toISOString();
  const resolutionNote =
    "Reviewed after Martine launch proof. This meta_sync failure is historical/stale: current campaign launch runtime has Meta campaign/ad set/three ad ids and Martine Meta account/page/pixel connection is valid. No retry or external Meta mutation performed.";

  const { error: updateError } = await supabase
    .from("system_jobs")
    .update({
      reviewed_at: reviewedAt,
      reviewed_by: "codex-martine-perfect-go",
      resolution_note: resolutionNote,
    })
    .eq("id", TARGET.jobId)
    .is("reviewed_at", null);

  if (updateError) fail("Acknowledge target Martine meta_sync debt", updateError.message);
  pass("Acknowledged target Martine meta_sync debt", reviewedAt);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
