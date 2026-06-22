#!/usr/bin/env node

import { createDecipheriv, createHash } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const TARGET = {
  campaignId: "957014e8-870f-40e1-9f71-ea7256b09482",
  organizationId: "42e2ccc8-8515-48c3-b105-df531f82031d",
};

const CONFIRMATION = "RECONCILE_MARTINE_META_RUNTIME_READBACK";

function parseArgs(argv) {
  const args = {
    apply: false,
    dryRun: false,
    confirm: null,
    proofRunId: null,
  };

  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    if (arg === "--dry-run") args.dryRun = true;
    if (arg.startsWith("--confirm=")) args.confirm = arg.slice("--confirm=".length);
    if (arg.startsWith("--proof-run-id=")) args.proofRunId = arg.slice("--proof-run-id=".length);
  }

  return args;
}

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

function launchRuntimeFromPlan(plan) {
  const record = asRecord(plan);
  const nestedPlan = asRecord(record.plan);
  const rootRuntime = asRecord(record.launch_runtime);
  return Object.keys(rootRuntime).length > 0 ? rootRuntime : asRecord(nestedPlan.launch_runtime);
}

function setLaunchRuntimeCreativeIds(plan, nextCreativeIds, audit) {
  const nextPlan = structuredClone(asRecord(plan));
  const rootRuntime = asRecord(nextPlan.launch_runtime);
  const nestedPlan = asRecord(nextPlan.plan);
  const nestedRuntime = asRecord(nestedPlan.launch_runtime);
  const hasRootRuntime = Object.keys(rootRuntime).length > 0;
  const hasNestedRuntime = Object.keys(nestedRuntime).length > 0;

  if (hasRootRuntime || !hasNestedRuntime) {
    nextPlan.launch_runtime = {
      ...rootRuntime,
      creative_ids: nextCreativeIds,
    };
  }

  if (hasNestedRuntime) {
    nextPlan.plan = {
      ...nestedPlan,
      launch_runtime: {
        ...nestedRuntime,
        creative_ids: nextCreativeIds,
      },
    };
  }

  nextPlan.martineMetaRuntimeReconciliation = audit;
  return nextPlan;
}

async function querySingle(supabase, label, query) {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data;
}

async function graphGet(accessToken, path, fields) {
  const url = new URL(`https://graph.facebook.com/v19.0/${path.replace(/^\//, "")}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, { method: "GET" });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const code = body?.error?.code ? ` code=${body.error.code}` : "";
    const message = body?.error?.message ?? "Meta request failed";
    throw new Error(`${path}: ${response.status}${code} ${message}`);
  }

  return body;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.apply ? "apply" : "dry-run";

  if (args.apply && args.confirm !== CONFIRMATION) {
    throw new Error(`Apply requires --confirm=${CONFIRMATION}`);
  }

  const proofRunId = args.proofRunId?.trim();
  if (!proofRunId) {
    throw new Error("Missing required --proof-run-id=<id>");
  }

  const supabase = createSupabase();
  const campaign = await querySingle(
    supabase,
    "campaign_plans",
    supabase
      .from("campaign_plans")
      .select("id,organization_id,plan")
      .eq("id", TARGET.campaignId)
      .maybeSingle(),
  );

  if (!campaign) {
    throw new Error(`Martine campaign not found: ${TARGET.campaignId}`);
  }

  if (campaign.organization_id !== TARGET.organizationId) {
    throw new Error(`Refusing to repair unexpected organization: ${campaign.organization_id}`);
  }

  const runtime = launchRuntimeFromPlan(campaign.plan);
  const runtimeAdIds = stringArray(runtime.ad_ids);
  const previousCreativeIds = stringArray(runtime.creative_ids);

  if (runtimeAdIds.length !== 3) {
    throw new Error(`Expected exactly three runtime ad ids before repair; found ${runtimeAdIds.length}`);
  }

  const marketingAccount = await querySingle(
    supabase,
    "marketing_accounts",
    supabase
      .from("marketing_accounts")
      .select("id,organization_id,access_token_encrypted")
      .eq("organization_id", TARGET.organizationId)
      .eq("platform", "meta_ads")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );

  if (!marketingAccount?.access_token_encrypted) {
    throw new Error("Martine Meta connection has no encrypted access token.");
  }

  const accessToken = decryptSecret(marketingAccount.access_token_encrypted, requireEnv("META_TOKEN_ENCRYPTION_KEY"));
  const metaAds = await Promise.all(
    runtimeAdIds.map((adId) =>
      graphGet(accessToken, adId, "id,campaign_id,adset_id,creative{id},status,effective_status,configured_status"),
    ),
  );

  const nextCreativeIds = metaAds.map((ad) => String(asRecord(ad.creative).id ?? "")).filter(Boolean);
  if (nextCreativeIds.length !== 3) {
    throw new Error(`Expected exactly three Meta creative ids from readback; found ${nextCreativeIds.length}`);
  }

  const changed = JSON.stringify(previousCreativeIds) !== JSON.stringify(nextCreativeIds);
  const now = new Date().toISOString();
  const audit = {
    reconciled_from_meta_readback: true,
    proof_run_id: proofRunId,
    reconciled_at: now,
    previous_creative_ids: previousCreativeIds,
    meta_readback_creative_ids: nextCreativeIds,
    ad_ids: runtimeAdIds,
    mutation_scope: "campaign_plans.plan.launch_runtime.creative_ids only",
  };
  const nextPlan = changed ? setLaunchRuntimeCreativeIds(campaign.plan, nextCreativeIds, audit) : campaign.plan;

  const result = {
    mode,
    proofRunId,
    campaignId: TARGET.campaignId,
    organizationId: TARGET.organizationId,
    changed,
    previousCreativeIds,
    nextCreativeIds,
    adIds: runtimeAdIds,
    metaAds: metaAds.map((ad) => ({
      id: ad.id,
      creativeId: asRecord(ad.creative).id ?? null,
      status: ad.status ?? null,
      effectiveStatus: ad.effective_status ?? null,
      configuredStatus: ad.configured_status ?? null,
    })),
    safety: {
      metaMutation: false,
      creativeAssetsTouched: false,
      systemJobsTouched: false,
      selectedCreativeIdsTouched: false,
      scope: "campaign_plans row only",
    },
  };

  if (args.apply && changed) {
    const { error } = await supabase
      .from("campaign_plans")
      .update({ plan: nextPlan })
      .eq("id", TARGET.campaignId)
      .eq("organization_id", TARGET.organizationId);

    if (error) {
      throw new Error(`campaign_plans update failed: ${error.message}`);
    }
    result.applied = true;
  } else {
    result.applied = false;
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
