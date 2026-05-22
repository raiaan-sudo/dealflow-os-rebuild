#!/usr/bin/env node

import Module from "node:module";
import path from "node:path";
import { createRequire } from "node:module";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

nextEnv.loadEnvConfig(process.cwd());

const TARGET_CAMPAIGN_ID = "cb74e0fa-730e-491c-9916-f1437ef9f384";
const APPLY_ACK = "repair-app-composed-static-finals";
const repoRoot = process.cwd();
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

Module._load = function load(request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }

  return originalLoad.call(this, request, parent, isMain);
};

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolve.call(
      this,
      path.join(repoRoot, "src", request.slice(2)),
      parent,
      isMain,
      options,
    );
  }

  return originalResolve.call(this, request, parent, isMain, options);
};

Module._extensions[".ts"] = function loadTs(module, filename) {
  const source = ts.sys.readFile(filename);
  const output = ts.transpileModule(source ?? "", {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
    fileName: filename,
  });

  module._compile(output.outputText, filename);
};

const require = createRequire(import.meta.url);
const {
  regenerateStaticCreativeAssetsForUser,
} = require("../src/lib/services/campaign-persistence.ts");
const {
  isLaunchReadyStaticCreative,
} = require("../src/lib/services/creative-media-readiness.ts");
const {
  getApprovedCreativeIntakeGenerationContext,
} = require("../src/lib/services/creative-chat-intake-service.ts");

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function selectedIdsFromPlan(plan) {
  const document = asRecord(plan);
  const payload = asRecord(document.campaign_payload);
  return Array.from(new Set([
    ...asArray(document.selected_ad_ids),
    ...asArray(payload.selected_ad_ids),
    document.selected_ad_id,
    payload.selected_ad_id,
  ].map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))).slice(0, 6);
}

function readinessContextFromPlan(plan) {
  const context = getApprovedCreativeIntakeGenerationContext(plan);
  return context
    ? {
        staticBriefHash: context.staticBriefHash,
        offerHash: context.offerHash,
        ctaHash: context.ctaHash,
        brandHash: context.brandHash,
      }
    : null;
}

function summarizeRows(rows) {
  const staticRows = rows.filter((row) => asRecord(row.metadata).source === "static_ad");
  return {
    totalStaticRows: staticRows.length,
    appComposedFinalRows: staticRows.filter((row) => asRecord(row.metadata).appComposedFinal === true).length,
    readyAppComposedFinalRows: staticRows.filter((row) =>
      row.status === "ready" &&
      asRecord(row.metadata).appComposedFinal === true &&
      asRecord(row.metadata).imageQa?.decision === "accept"
    ).length,
    failedOrReviewOnlyRows: staticRows.filter((row) => row.status !== "ready" || asRecord(row.metadata).appComposedFinal !== true).length,
  };
}

function selectReadyIdsFromRows(rows, readinessContext) {
  const staticRows = rows.filter((row) => {
    const metadata = asRecord(row.metadata);
    const imageQa = asRecord(metadata.imageQa);
    const qualityGate = asRecord(metadata.qualityGate);
    return (
      asRecord(row.metadata).source === "static_ad" &&
      row.status === "ready" &&
      metadata.appComposedFinal === true &&
      metadata.storageNormalized === true &&
      imageQa.mode === "app_composed_final" &&
      imageQa.decision === "accept" &&
      qualityGate.accepted === true &&
      (!readinessContext?.staticBriefHash || metadata.staticBriefHash === readinessContext.staticBriefHash) &&
      (!readinessContext?.offerHash || metadata.offerHash === readinessContext.offerHash) &&
      (!readinessContext?.ctaHash || metadata.ctaHash === readinessContext.ctaHash) &&
      (!readinessContext?.brandHash || metadata.brandHash === readinessContext.brandHash)
    );
  });

  return Array.from(new Map(
    staticRows
      .sort((left, right) => (asRecord(right.metadata).score ?? 0) - (asRecord(left.metadata).score ?? 0))
      .map((row) => {
        const metadata = asRecord(row.metadata);
        const id = typeof metadata.staticAssetId === "string" && metadata.staticAssetId.trim()
          ? metadata.staticAssetId.trim()
          : row.creative_id;
        return [id, id];
      })
      .filter(([id]) => typeof id === "string" && id.trim()),
  ).values()).slice(0, 6);
}

function summarizeAssets(staticAds, readinessContext) {
  const launchReady = staticAds
    .filter((asset) => isLaunchReadyStaticCreative(asset, readinessContext))
    .sort((left, right) => Number(right.recommended) - Number(left.recommended) || (right.score ?? 0) - (left.score ?? 0));

  return {
    staticConceptCount: staticAds.length,
    launchReadyAppComposedCount: launchReady.length,
    selectedLaunchReadyIds: launchReady.slice(0, Math.min(6, Math.max(4, launchReady.length))).map((asset) => asset.id),
  };
}

async function loadCampaign(supabase) {
  const { data, error } = await supabase
    .from("campaign_plans")
    .select("id,user_id,organization_id,plan,launch_status")
    .eq("id", TARGET_CAMPAIGN_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`campaign_plans query failed: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Target campaign not found: ${TARGET_CAMPAIGN_ID}`);
  }

  return data;
}

async function loadCreativeAssetRows(supabase, userId) {
  const { data, error } = await supabase
    .from("creative_assets")
    .select("id,creative_id,status,metadata")
    .eq("campaign_id", TARGET_CAMPAIGN_ID)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`creative_assets query failed: ${error.message}`);
  }

  return data ?? [];
}

async function updateSelectedStaticIds(supabase, row, selectedIds) {
  const currentPlan = asRecord(row.plan);
  const payload = asRecord(currentPlan.campaign_payload);
  const nextPlan = {
    ...currentPlan,
    selected_ad_id: selectedIds[0] ?? null,
    selected_ad_ids: selectedIds,
    campaign_payload: {
      ...payload,
      selected_ad_id: selectedIds[0] ?? null,
      selected_ad_ids: selectedIds,
    },
  };

  const { error } = await supabase
    .from("campaign_plans")
    .update({ plan: nextPlan })
    .eq("id", TARGET_CAMPAIGN_ID)
    .eq("user_id", row.user_id);

  if (error) {
    throw new Error(`selected static update failed: ${error.message}`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const ack = process.argv.find((arg) => arg.startsWith("--ack="))?.slice("--ack=".length) ?? "";

  if (apply && ack !== APPLY_ACK) {
    throw new Error(`Apply requires --ack=${APPLY_ACK}`);
  }

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const before = await loadCampaign(supabase);
  const beforeRows = await loadCreativeAssetRows(supabase, before.user_id);
  const beforeContext = readinessContextFromPlan(before.plan);
  const beforeSelectedIds = selectedIdsFromPlan(before.plan);
  const beforeReadyIds = selectReadyIdsFromRows(beforeRows, beforeContext);

  if (!apply) {
    console.log(JSON.stringify({
      mode: "dry_run",
      targetCampaignId: TARGET_CAMPAIGN_ID,
      mutatesMeta: false,
      publishesFunnel: false,
      runsProviderGeneration: false,
      selectedStaticIds: beforeSelectedIds,
      selectableReadyAppComposedIds: beforeReadyIds,
      staticAssetRows: summarizeRows(beforeRows),
      hasApprovedStaticBrief: Boolean(beforeContext),
      wouldApply: [
        "regenerate current static concepts/finals with maxGenerations=0",
        "store 4-6 app-composed final statics in app-owned storage",
        "select the first 4-6 current launch-ready app-composed static IDs",
        "preserve historical failed/provider rows as evidence",
      ],
      applyCommand: `node ./scripts/repair-app-composed-static-finals.mjs --apply --ack=${APPLY_ACK}`,
      rollback: {
        scope: `campaign_plans row ${TARGET_CAMPAIGN_ID} and newly inserted creative_assets/storage objects for this campaign only`,
        action: "Restore the previous campaign_plans.plan from pre-apply output or Supabase PITR; leave historical evidence rows unless owner explicitly approves cleanup.",
      },
    }, null, 2));
    return;
  }

  let repaired = null;
  if (beforeReadyIds.length < 4) {
    repaired = await regenerateStaticCreativeAssetsForUser(TARGET_CAMPAIGN_ID, before.user_id, {
      force: true,
      missingOnly: true,
      maxGenerations: 0,
      supabase,
      providerUsageRunId: "repair-app-composed-static-finals",
    });
  }
  const after = await loadCampaign(supabase);
  const afterContext = readinessContextFromPlan(after.plan);
  const afterRowsBeforeSelection = await loadCreativeAssetRows(supabase, before.user_id);
  const selectedReadyIds = selectReadyIdsFromRows(afterRowsBeforeSelection, afterContext);
  const assetSummary = repaired
    ? summarizeAssets(repaired.creatives.staticAds, afterContext)
    : {
        staticConceptCount: 0,
        launchReadyAppComposedCount: selectedReadyIds.length,
        selectedLaunchReadyIds: selectedReadyIds,
      };

  if (selectedReadyIds.length < 4) {
    throw new Error(`Repair found only ${selectedReadyIds.length} launch-ready app-composed static ads.`);
  }

  await updateSelectedStaticIds(supabase, after, selectedReadyIds.slice(0, 4));

  const verificationRow = await loadCampaign(supabase);
  const afterRows = await loadCreativeAssetRows(supabase, before.user_id);
  console.log(JSON.stringify({
    mode: "apply",
    targetCampaignId: TARGET_CAMPAIGN_ID,
    mutatesMeta: false,
    publishesFunnel: false,
    runsProviderGeneration: false,
    before: {
      selectedStaticIds: beforeSelectedIds,
      staticAssetRows: summarizeRows(beforeRows),
    },
    after: {
      selectedStaticIds: selectedIdsFromPlan(verificationRow.plan),
      staticAssetRows: summarizeRows(afterRows),
      staticConceptCount: assetSummary.staticConceptCount,
      launchReadyAppComposedCount: selectedReadyIds.length,
    },
    rollback: {
      scope: `campaign_plans row ${TARGET_CAMPAIGN_ID} and newly inserted creative_assets/storage objects for this campaign only`,
      action: "Restore the previous campaign_plans.plan from pre-apply output or Supabase PITR; leave historical evidence rows unless owner explicitly approves cleanup.",
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
