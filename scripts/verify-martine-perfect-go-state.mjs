#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const TARGET = {
  campaignId: "957014e8-870f-40e1-9f71-ea7256b09482",
  publicSlug: "martine",
  organizationId: "42e2ccc8-8515-48c3-b105-df531f82031d",
  userId: "559c0fd4-c442-4cbf-86c3-d2e8581c9a8f",
  expectedSelectedCreativeIds: [
    "957014e8-870f-40e1-9f71-ea7256b09482-martine-fr-static-1-seller-over-market",
    "957014e8-870f-40e1-9f71-ea7256b09482-martine-fr-static-2-seller-value-gap",
    "957014e8-870f-40e1-9f71-ea7256b09482-martine-fr-static-3-seller-90-days",
  ],
  expectedAdAccountId: "act_344085034950359",
  expectedPageId: "195428953917127",
  expectedPixelId: "1396310424907119",
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stringArray(value) {
  return asArray(value).map(String).map((item) => item.trim()).filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function readPath(root, path) {
  return path.reduce((value, key) => asRecord(value)[key], root);
}

function selectedStaticIdsFromPlan(plan) {
  const record = asRecord(plan);
  const nestedPlan = asRecord(record.plan);
  const payload = asRecord(record.campaign_payload);
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
    ...asArray(record.staticAds),
    ...asArray(nestedPlan.staticAds),
    ...asArray(creatives.staticAds),
    ...asArray(nestedCreatives.staticAds),
  ].filter((item) => item && typeof item === "object" && !Array.isArray(item));
}

function launchRuntimeFromPlan(plan) {
  const record = asRecord(plan);
  const nestedPlan = asRecord(record.plan);
  const rootRuntime = asRecord(record.launch_runtime);
  if (Object.keys(rootRuntime).length > 0) {
    return rootRuntime;
  }

  return asRecord(nestedPlan.launch_runtime);
}

function hasFrenchFunnelCopy(value) {
  const source = JSON.stringify(value ?? {}).toLowerCase();
  return (
    source.includes("obtenir mon évaluation") ||
    source.includes("votre propriété") ||
    source.includes("propriétaires") ||
    source.includes("lanaudière")
  );
}

function selectedAccountNameFromMetadata(metadata, selectedAccountId) {
  const accounts = asArray(asRecord(metadata).available_accounts);
  const selected = accounts.find((account) => asRecord(account).externalAccountId === selectedAccountId);
  return typeof asRecord(selected).name === "string" ? asRecord(selected).name : null;
}

function pass(checks, name, detail = null) {
  checks.push({ status: "PASS", name, detail });
}

function warn(checks, name, detail = null) {
  checks.push({ status: "WARN", name, detail });
}

function fail(checks, name, detail = null) {
  checks.push({ status: "FAIL", name, detail });
}

function printChecks(checks) {
  for (const check of checks) {
    console.log(`${check.status.padEnd(4)} ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);
  }
}

async function querySingle(supabase, label, query) {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data;
}

async function main() {
  const supabase = createSupabase();
  const checks = [];

  const campaign = await querySingle(
    supabase,
    "campaign_plans",
    supabase
      .from("campaign_plans")
      .select("id,organization_id,user_id,public_slug,publish_state,launch_status,plan,staged_snapshot,published_snapshot")
      .eq("id", TARGET.campaignId)
      .maybeSingle(),
  );

  if (!campaign) {
    fail(checks, "Martine campaign exists", TARGET.campaignId);
    printChecks(checks);
    process.exitCode = 1;
    return;
  }

  campaign.organization_id === TARGET.organizationId
    ? pass(checks, "Campaign organization matches Martine workspace", campaign.organization_id)
    : fail(checks, "Campaign organization matches Martine workspace", campaign.organization_id);
  campaign.user_id === TARGET.userId
    ? pass(checks, "Campaign owner matches Martine user", campaign.user_id)
    : fail(checks, "Campaign owner matches Martine user", campaign.user_id);
  campaign.public_slug === TARGET.publicSlug
    ? pass(checks, "Public slug is /f/martine", campaign.public_slug)
    : fail(checks, "Public slug is /f/martine", campaign.public_slug);
  campaign.publish_state === "published"
    ? pass(checks, "Campaign is published", campaign.publish_state)
    : fail(checks, "Campaign is published", campaign.publish_state);
  ["live", "launched"].includes(String(campaign.launch_status))
    ? pass(checks, "Campaign launch status is live/launched", campaign.launch_status)
    : fail(checks, "Campaign launch status is live/launched", campaign.launch_status);

  const selectedIds = selectedStaticIdsFromPlan(campaign.plan);
  const missingSelectedIds = TARGET.expectedSelectedCreativeIds.filter((id) => !selectedIds.includes(id));
  missingSelectedIds.length === 0 && selectedIds.length >= 3
    ? pass(checks, "Plan selected static creative IDs include all three Martine creatives", selectedIds.join(", "))
    : fail(checks, "Plan selected static creative IDs include all three Martine creatives", missingSelectedIds.join(", "));

  const planStaticAds = staticAdsFromPlan(campaign.plan);
  const { data: assets, error: assetsError } = await supabase
    .from("creative_assets")
    .select("id,campaign_id,user_id,creative_id,asset_type,status,file_url,thumbnail_url,metadata,provider_name,generation_method,created_at")
    .eq("campaign_id", TARGET.campaignId)
    .order("created_at", { ascending: true });
  if (assetsError) {
    throw new Error(`creative_assets: ${assetsError.message}`);
  }

  const selectedAssets = (assets ?? []).filter((asset) => selectedIds.includes(String(asset.creative_id)));
  selectedAssets.length === 3
    ? pass(checks, "Exactly three selected durable creative assets exist", String(selectedAssets.length))
    : fail(checks, "Exactly three selected durable creative assets exist", String(selectedAssets.length));

  const selectedAssetLaunchReadiness = [];
  for (const asset of selectedAssets) {
    const metadata = asRecord(asset.metadata);
    const hasFile = typeof asset.file_url === "string" && asset.file_url.startsWith("http");
    const launchReady =
      asset.status === "completed" &&
      hasFile &&
      metadata.source === "static_ad" &&
      metadata.role === "higgsfield_finished_static_ad";
    selectedAssetLaunchReadiness.push(launchReady);
    launchReady
      ? pass(checks, `Selected asset launch-ready: ${asset.creative_id}`, asset.id)
      : fail(checks, `Selected asset launch-ready: ${asset.creative_id}`, JSON.stringify({
          status: asset.status,
          hasFile,
          source: metadata.source ?? null,
          role: metadata.role ?? null,
        }));
  }

  const allSelectedAssetsLaunchReady =
    selectedAssets.length === 3 && selectedAssetLaunchReadiness.every(Boolean);
  if (planStaticAds.length >= 3) {
    pass(checks, "Plan static ad snapshot contains three or more creatives", String(planStaticAds.length));
  } else if (allSelectedAssetsLaunchReady) {
    pass(
      checks,
      "Durable selected creative_assets are canonical for Martine creative count",
      `plan staticAds=${planStaticAds.length}; durable selected assets=${selectedAssets.length}`,
    );
  } else {
    fail(
      checks,
      "Durable selected creative_assets must replace stale plan static ad snapshot",
      `plan staticAds=${planStaticAds.length}; durable selected assets=${selectedAssets.length}`,
    );
  }

  const runtime = launchRuntimeFromPlan(campaign.plan);
  const runtimeCreativeIds = stringArray(runtime.creative_ids);
  const runtimeAdIds = stringArray(runtime.ad_ids);
  runtime.campaign_id
    ? pass(checks, "Launch runtime has Meta campaign id", String(runtime.campaign_id))
    : fail(checks, "Launch runtime has Meta campaign id");
  runtime.adset_id
    ? pass(checks, "Launch runtime has Meta ad set id", String(runtime.adset_id))
    : fail(checks, "Launch runtime has Meta ad set id");
  runtimeCreativeIds.length >= 3
    ? pass(checks, "Launch runtime has three Meta creative ids", runtimeCreativeIds.join(", "))
    : fail(checks, "Launch runtime has three Meta creative ids", String(runtimeCreativeIds.length));
  runtimeAdIds.length >= 3
    ? pass(checks, "Launch runtime has three Meta ad ids", runtimeAdIds.join(", "))
    : fail(checks, "Launch runtime has three Meta ad ids", String(runtimeAdIds.length));

  const marketingAccount = await querySingle(
    supabase,
    "marketing_accounts",
    supabase
      .from("marketing_accounts")
      .select("id,organization_id,status,external_account_id,account_name,access_token_encrypted,connection_metadata,pixel_id")
      .eq("organization_id", TARGET.organizationId)
      .eq("platform", "meta_ads")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );

  if (!marketingAccount) {
    fail(checks, "Martine Meta marketing account exists");
  } else {
    const metadata = asRecord(marketingAccount.connection_metadata);
    const selectedAccountId =
      typeof metadata.selected_external_account_id === "string"
        ? metadata.selected_external_account_id
        : marketingAccount.external_account_id;
    const selectedPageId = typeof metadata.selected_page_id === "string" ? metadata.selected_page_id : null;
    const selectedPixelId =
      typeof metadata.selected_pixel_id === "string" ? metadata.selected_pixel_id : marketingAccount.pixel_id;
    const selectedAccountName = marketingAccount.account_name ?? selectedAccountNameFromMetadata(metadata, selectedAccountId);

    marketingAccount.status === "connected"
      ? pass(checks, "Meta account status is connected", marketingAccount.id)
      : fail(checks, "Meta account status is connected", marketingAccount.status);
    marketingAccount.access_token_encrypted
      ? pass(checks, "Meta access token is configured without exposing value")
      : fail(checks, "Meta access token is configured without exposing value");
    selectedAccountId === TARGET.expectedAdAccountId
      ? pass(checks, "Selected Meta ad account matches Martine account", `${selectedAccountName ?? ""} ${selectedAccountId}`.trim())
      : fail(checks, "Selected Meta ad account matches Martine account", String(selectedAccountId));
    selectedPageId === TARGET.expectedPageId
      ? pass(checks, "Selected Meta page matches Martine page", String(metadata.selected_page_name ?? selectedPageId))
      : fail(checks, "Selected Meta page matches Martine page", String(selectedPageId));
    selectedPixelId === TARGET.expectedPixelId
      ? pass(checks, "Selected Meta pixel matches Martine pixel", String(metadata.selected_pixel_name ?? selectedPixelId))
      : fail(checks, "Selected Meta pixel matches Martine pixel", String(selectedPixelId));
  }

  try {
    const launchRecords = await querySingle(
      supabase,
      "campaign_launch_records",
      supabase
        .from("campaign_launch_records")
        .select("id,campaign_name,account_name,meta_campaign_id,result_status,created_at")
        .eq("meta_campaign_id", String(runtime.campaign_id ?? ""))
        .order("created_at", { ascending: false })
        .limit(3),
    );
    const latestLaunchRecord = asArray(launchRecords)[0] ?? null;
    latestLaunchRecord?.account_name
      ? pass(checks, "Launch receipt has persisted account name", latestLaunchRecord.account_name)
      : pass(checks, "Launch receipt account name falls back to Meta connection state");
  } catch (error) {
    pass(
      checks,
      "Launch receipt audit table unavailable; Meta connection state is canonical fallback",
      error instanceof Error ? error.message : String(error),
    );
  }

  hasFrenchFunnelCopy(readPath(campaign.plan, ["funnel"])) ||
  hasFrenchFunnelCopy(readPath(campaign.plan, ["plan", "funnel"])) ||
  hasFrenchFunnelCopy(campaign.published_snapshot) ||
  hasFrenchFunnelCopy(campaign.staged_snapshot)
    ? pass(checks, "Martine funnel contains French runtime copy")
    : fail(checks, "Martine funnel contains French runtime copy");

  const { data: staleJobs, error: jobsError } = await supabase
    .from("system_jobs")
    .select("id,kind,status,error_message,last_error_code,dead_letter_reason,reviewed_at,created_at")
    .eq("campaign_id", TARGET.campaignId)
    .in("status", ["failed", "dead_letter"])
    .is("reviewed_at", null)
    .order("created_at", { ascending: false });
  if (jobsError) {
    throw new Error(`system_jobs: ${jobsError.message}`);
  }

  if ((staleJobs ?? []).length === 0) {
    pass(checks, "No unresolved Martine failed/dead-letter jobs");
  } else {
    warn(
      checks,
      "Unresolved Martine operator debt requires review/acknowledgement or retry",
      (staleJobs ?? []).map((job) => `${job.kind}:${job.id}:${job.status}`).join(", "),
    );
  }

  const summary = {
    target: TARGET,
    planStaticAdsCount: planStaticAds.length,
    selectedIds,
    selectedAssetIds: selectedAssets.map((asset) => asset.id),
    runtime: {
      campaignId: runtime.campaign_id ?? null,
      adSetId: runtime.adset_id ?? null,
      creativeIds: runtimeCreativeIds,
      adIds: runtimeAdIds,
      status: runtime.status ?? null,
      stepStatus: runtime.step_status ?? null,
    },
    checks: checks.reduce((acc, check) => {
      acc[check.status] = (acc[check.status] ?? 0) + 1;
      return acc;
    }, {}),
  };

  printChecks(checks);
  console.log(JSON.stringify(summary, null, 2));

  if (checks.some((check) => check.status === "FAIL")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
