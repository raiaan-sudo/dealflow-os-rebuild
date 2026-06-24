#!/usr/bin/env node

import { createDecipheriv, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const TARGET = {
  campaignId: "957014e8-870f-40e1-9f71-ea7256b09482",
  organizationId: "42e2ccc8-8515-48c3-b105-df531f82031d",
  reportPath: "docs/launch-reports/MARTINE_OPTIMIZATION_DIAGNOSTIC_20260624.md",
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

function launchRuntimeFromPlan(plan) {
  const record = asRecord(plan);
  const nestedPlan = asRecord(record.plan);
  const rootRuntime = asRecord(record.launch_runtime);
  return Object.keys(rootRuntime).length > 0 ? rootRuntime : asRecord(nestedPlan.launch_runtime);
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

function redactId(value) {
  const text = String(value ?? "");
  if (text.length <= 10) {
    return text;
  }
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function safeJson(value) {
  return JSON.stringify(value, null, 2).replace(/access_token[^,\n}]*/gi, "access_token_redacted");
}

async function query(label, request) {
  const { data, error } = await request;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data;
}

async function graphGet(accessToken, pathValue, fields) {
  const pathValueString = String(pathValue ?? "").trim();
  if (!pathValueString) {
    return { ok: false, status: null, error: "missing_object_id" };
  }

  const url = new URL(`https://graph.facebook.com/v19.0/${pathValueString.replace(/^\//, "")}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, { method: "GET" });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: body?.error?.code ?? null,
      subcode: body?.error?.error_subcode ?? null,
      type: body?.error?.type ?? null,
      message: body?.error?.message ?? "Meta request failed",
    };
  }

  return {
    ok: true,
    status: response.status,
    id: body?.id ?? pathValueString,
    name: body?.name ?? null,
    effective_status: body?.effective_status ?? null,
    configured_status: body?.configured_status ?? null,
    raw_status: body?.status ?? null,
  };
}

function metricsSummary(value) {
  const row = asRecord(value);
  return {
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    leads: Number(row.leads ?? 0),
  };
}

function classifyIssue({ graphResults, snapshots, performanceRows }) {
  const unreadable = graphResults.filter((item) => !item.result.ok);
  const latestSnapshot = snapshots?.[0] ?? null;
  const latestMetrics = metricsSummary(latestSnapshot?.delivery_metrics);
  const latestSyncedAt = latestSnapshot?.synced_at ? Date.parse(latestSnapshot.synced_at) : NaN;
  const stale = !Number.isFinite(latestSyncedAt) || Date.now() - latestSyncedAt > 6 * 60 * 60 * 1000;
  const emptyMetrics =
    latestMetrics.spend <= 0 &&
    latestMetrics.impressions <= 0 &&
    latestMetrics.clicks <= 0 &&
    latestMetrics.leads <= 0;

  if (unreadable.length > 0) {
    return {
      status: "sync_degraded",
      reason: "At least one stored Meta object ID is unreadable through Graph readback.",
      unreadable: unreadable.map((item) => `${item.stage}:${redactId(item.id)}`),
    };
  }

  if (stale) {
    return {
      status: "stale_sync",
      reason: "Latest campaign sync snapshot is outside the freshness window.",
      unreadable: [],
    };
  }

  if (emptyMetrics && (performanceRows ?? []).length === 0) {
    return {
      status: "waiting_for_delivery_or_missing_metrics",
      reason: "Meta readback is available, but no delivery metrics or performance_tracking rows are present.",
      unreadable: [],
    };
  }

  return {
    status: "ready_to_optimize",
    reason: "Meta readback and local performance data are available.",
    unreadable: [],
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const shouldWrite = args.has("--write-report") || !args.has("--no-write-report");
  const supabase = createSupabase();

  const campaign = await query(
    "campaign_plans",
    supabase
      .from("campaign_plans")
      .select("id,organization_id,user_id,public_slug,launch_status,publish_state,plan")
      .eq("id", TARGET.campaignId)
      .maybeSingle(),
  );

  if (!campaign) {
    throw new Error(`Martine campaign not found: ${TARGET.campaignId}`);
  }

  const runtime = launchRuntimeFromPlan(campaign.plan);
  const runtimeCampaignId = String(runtime.campaign_id ?? runtime.campaignId ?? "").trim();
  const runtimeAdSetIds = unique([
    ...stringArray(runtime.adset_ids),
    ...stringArray(runtime.ad_set_ids),
    String(runtime.adset_id ?? runtime.ad_set_id ?? "").trim(),
  ]);
  const runtimeAdIds = unique([
    ...stringArray(runtime.ad_ids),
    ...stringArray(runtime.metaAdIds),
  ]);
  const runtimeCreativeIds = unique([
    ...stringArray(runtime.creative_ids),
    ...stringArray(runtime.creativeIds),
  ]);

  const [marketingAccount, snapshots, performanceRows, autonomyRows, billingRows, creativeRows] = await Promise.all([
    query(
      "marketing_accounts",
      supabase
        .from("marketing_accounts")
        .select("id,organization_id,status,platform,external_account_id,account_name,connection_metadata,pixel_id,access_token_encrypted,last_sync_at,updated_at")
        .eq("organization_id", TARGET.organizationId)
        .eq("platform", "meta_ads")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
    query(
      "campaign_sync_snapshots",
      supabase
        .from("campaign_sync_snapshots")
        .select("id,sync_result,meta_campaign_id,meta_ad_set_ids,meta_ad_ids,campaign_status,ad_set_statuses,ad_statuses,delivery_metrics,sync_metadata,sync_errors,synced_at")
        .eq("organization_id", TARGET.organizationId)
        .eq("meta_campaign_id", runtimeCampaignId)
        .order("synced_at", { ascending: false })
        .limit(5),
    ),
    query(
      "performance_tracking",
      supabase
        .from("performance_tracking")
        .select("id,campaign_id,source_snapshot_id,spend,impressions,clicks,leads,ctr,cpl,synced_at")
        .eq("organization_id", TARGET.organizationId)
        .eq("campaign_id", runtimeCampaignId)
        .order("synced_at", { ascending: false })
        .limit(5),
    ),
    query(
      "campaign_autonomy_settings",
      supabase
        .from("campaign_autonomy_settings")
        .select("id,campaign_id,mode,daily_budget_cap_cents,monthly_budget_cap_cents,kill_switch_enabled,disabled_at,updated_at")
        .eq("campaign_id", TARGET.campaignId)
        .limit(5),
    ).catch((error) => [{ diagnostic_error: error.message }]),
    query(
      "billing_subscriptions",
      supabase
        .from("billing_subscriptions")
        .select("id,organization_id,plan_tier,status,current_period_end,updated_at")
        .eq("organization_id", TARGET.organizationId)
        .order("updated_at", { ascending: false })
        .limit(5),
    ).catch((error) => [{ diagnostic_error: error.message }]),
    query(
      "creative_assets",
      supabase
        .from("creative_assets")
        .select("id,creative_id,status,provider_name,generation_method,metadata,created_at")
        .eq("campaign_id", TARGET.campaignId)
        .order("created_at", { ascending: false })
        .limit(20),
    ),
  ]);

  const metadata = asRecord(marketingAccount?.connection_metadata);
  const tokenConfigured = Boolean(marketingAccount?.access_token_encrypted);
  const selectedAccountId =
    typeof metadata.selected_external_account_id === "string"
      ? metadata.selected_external_account_id
      : marketingAccount?.external_account_id;
  const selectedPageId = typeof metadata.selected_page_id === "string" ? metadata.selected_page_id : null;
  const selectedPixelId =
    typeof metadata.selected_pixel_id === "string" ? metadata.selected_pixel_id : marketingAccount?.pixel_id;

  let graphResults = [];
  if (tokenConfigured) {
    const accessToken = decryptSecret(marketingAccount.access_token_encrypted, requireEnv("META_TOKEN_ENCRYPTION_KEY"));
    const objectReads = [
      { stage: "campaign", id: runtimeCampaignId, fields: "id,name,status,effective_status,configured_status" },
      ...runtimeAdSetIds.map((id) => ({ stage: "ad_set", id, fields: "id,name,status,effective_status,configured_status,campaign_id,daily_budget" })),
      ...runtimeAdIds.map((id) => ({ stage: "ad", id, fields: "id,name,status,effective_status,configured_status,campaign_id,adset_id,creative{id}" })),
      ...runtimeCreativeIds.map((id) => ({ stage: "creative", id, fields: "id,name,object_story_spec" })),
      { stage: "insights", id: `${runtimeCampaignId}/insights`, fields: "spend,impressions,clicks,actions" },
    ];

    graphResults = await Promise.all(
      objectReads.map(async (read) => ({
        stage: read.stage,
        id: read.id,
        result: await graphGet(accessToken, read.id, read.fields),
      })),
    );
  }

  const classification = classifyIssue({ graphResults, snapshots, performanceRows });
  const latestSnapshot = snapshots?.[0] ?? null;

  const summary = {
    generatedAt: new Date().toISOString(),
    campaign: {
      id: campaign.id,
      organizationId: campaign.organization_id,
      userId: campaign.user_id,
      publicSlug: campaign.public_slug,
      launchStatus: campaign.launch_status,
      publishState: campaign.publish_state,
      selectedStaticCreativeIds: selectedStaticIdsFromPlan(campaign.plan),
    },
    metaRuntime: {
      campaignId: runtimeCampaignId,
      adSetIds: runtimeAdSetIds,
      adIds: runtimeAdIds,
      creativeIds: runtimeCreativeIds,
    },
    metaConnection: {
      status: marketingAccount?.status ?? null,
      accountId: selectedAccountId ?? null,
      accountName: marketingAccount?.account_name ?? null,
      pageId: selectedPageId,
      pixelId: selectedPixelId,
      tokenConfigured,
      lastSyncAt: marketingAccount?.last_sync_at ?? null,
    },
    latestSnapshot: latestSnapshot
      ? {
          id: latestSnapshot.id,
          syncResult: latestSnapshot.sync_result,
          campaignStatus: latestSnapshot.campaign_status,
          syncedAt: latestSnapshot.synced_at,
          deliveryMetrics: metricsSummary(latestSnapshot.delivery_metrics),
          syncErrors: latestSnapshot.sync_errors ?? [],
          syncMetadata: latestSnapshot.sync_metadata ?? {},
        }
      : null,
    performanceTrackingRows: (performanceRows ?? []).map((row) => ({
      id: row.id,
      sourceSnapshotId: row.source_snapshot_id,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      leads: row.leads,
      syncedAt: row.synced_at,
    })),
    entitlement: {
      billingRows,
      autonomyRows,
    },
    creativeAssetSummary: (creativeRows ?? []).map((row) => ({
      id: row.id,
      creativeId: row.creative_id,
      status: row.status,
      reviewStatus: asRecord(row.metadata).reviewStatus ?? asRecord(row.metadata).review_status ?? null,
      selectedForLaunch: asRecord(row.metadata).selectedForLaunch ?? asRecord(row.metadata).selected_for_launch ?? null,
      launchReady: asRecord(row.metadata).launchReady ?? asRecord(row.metadata).launch_ready ?? null,
      providerName: row.provider_name,
    })),
    graphReadback: graphResults.map((item) => ({
      stage: item.stage,
      id: redactId(item.id),
      result: item.result.ok
        ? {
            ok: true,
            effectiveStatus: item.result.effective_status,
            configuredStatus: item.result.configured_status,
            rawStatus: item.result.raw_status,
          }
        : {
            ok: false,
            status: item.result.status,
            code: item.result.code,
            subcode: item.result.subcode,
            type: item.result.type,
            message: item.result.message,
          },
    })),
    classification,
  };

  const report = [
    "# Martine Optimization Diagnostic - 2026-06-24",
    "",
    "Read-only diagnostic. No Meta mutation and no database mutation were performed by this script.",
    "",
    `- Generated at: ${summary.generatedAt}`,
    `- Campaign: ${summary.campaign.id}`,
    `- Organization: ${summary.campaign.organizationId}`,
    `- Classification: ${classification.status}`,
    `- Reason: ${classification.reason}`,
    "",
    "## Redacted Summary",
    "",
    "```json",
    safeJson(summary),
    "```",
    "",
  ].join("\n");

  if (shouldWrite) {
    await mkdir(path.dirname(TARGET.reportPath), { recursive: true });
    await writeFile(TARGET.reportPath, report);
  }

  console.log(JSON.stringify({
    status: classification.status,
    reason: classification.reason,
    reportPath: shouldWrite ? TARGET.reportPath : null,
    unreadable: classification.unreadable,
    latestSnapshotId: latestSnapshot?.id ?? null,
    performanceRows: performanceRows?.length ?? 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
