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
  persistStaticCreativeAssets,
} = require("../src/lib/services/static-creative-asset-service.ts");
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

function numberArg(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (raw === undefined) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`--${name} must be an integer`);
  }

  return value;
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

function staticAdsFromPlan(plan) {
  const document = asRecord(plan);
  const payload = asRecord(document.campaign_payload);
  const creatives = asRecord(document.creatives);
  return asArray(document.staticAds).length
    ? asArray(document.staticAds)
    : asArray(payload.staticAds).length
      ? asArray(payload.staticAds)
      : asArray(creatives.staticAds);
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
    const sourceImageQa = asRecord(metadata.sourceImageQa);
    const qualityGate = asRecord(metadata.qualityGate);
    const freshV2AppComposed = Boolean(
      metadata.compositionVersion === "app_composed_static_v2" &&
        metadata.qualityTier === "premium_final" &&
        metadata.sourceBackgroundKind === "higgsfield_visual_background" &&
        (metadata.sourceBackgroundProvider === "higgsfield_marketing_studio" || metadata.sourceBackgroundProvider === "higgsfield") &&
        typeof metadata.sourceBackgroundAssetId === "string" &&
        metadata.sourceBackgroundAssetId.trim()
    );
    return (
      asRecord(row.metadata).source === "static_ad" &&
      row.status === "ready" &&
      metadata.appComposedFinal === true &&
      metadata.storageNormalized === true &&
      imageQa.mode === "app_composed_final" &&
      imageQa.decision === "accept" &&
      (
        (
          sourceImageQa.mode === "background_only" &&
          sourceImageQa.decision === "accept" &&
          sourceImageQa.usable !== false
        ) ||
        freshV2AppComposed
      ) &&
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

function canPromoteExistingV2Row(row, readinessContext) {
  const metadata = asRecord(row.metadata);
  const sourceImageQa = asRecord(metadata.sourceImageQa);
  const qualityGate = asRecord(metadata.qualityGate);
  const sourceReasons = asArray(sourceImageQa.reasons);
  const allowedSourceReasons = new Set([
    "text_heavy",
    "chart_or_table_detected",
    "fake_ad_layout",
    "provider_returned_finished_ad",
    "finished_ad_text_unverified",
  ]);

  return Boolean(
    row.file_url &&
      metadata.source === "static_ad" &&
      metadata.role === "app_composed_final_static" &&
      metadata.appComposedFinal === true &&
      metadata.compositionVersion === "app_composed_static_v2" &&
      metadata.storageNormalized === true &&
      metadata.sourceBackgroundKind === "higgsfield_visual_background" &&
      (metadata.sourceBackgroundProvider === "higgsfield_marketing_studio" || metadata.sourceBackgroundProvider === "higgsfield") &&
      typeof metadata.sourceBackgroundAssetId === "string" &&
      metadata.sourceBackgroundAssetId.trim() &&
      sourceImageQa.mode === "background_only" &&
      (
        sourceImageQa.decision === "accept" ||
        (
          sourceImageQa.decision === "reject" &&
          sourceImageQa.usable === false &&
          sourceReasons.length > 0 &&
          sourceReasons.every((reason) => allowedSourceReasons.has(reason))
        )
      ) &&
      qualityGate.accepted === true &&
      (!readinessContext?.staticBriefHash || metadata.staticBriefHash === readinessContext.staticBriefHash) &&
      (!readinessContext?.offerHash || metadata.offerHash === readinessContext.offerHash) &&
      (!readinessContext?.ctaHash || metadata.ctaHash === readinessContext.ctaHash) &&
      (!readinessContext?.brandHash || metadata.brandHash === readinessContext.brandHash)
  );
}

function latestPromotableV2Rows(rows, readinessContext) {
  const byStaticAssetId = new Map();
  for (const row of rows) {
    if (!canPromoteExistingV2Row(row, readinessContext)) continue;
    const metadata = asRecord(row.metadata);
    const staticAssetId = typeof metadata.staticAssetId === "string" ? metadata.staticAssetId.trim() : "";
    if (!staticAssetId || byStaticAssetId.has(staticAssetId)) continue;
    byStaticAssetId.set(staticAssetId, row);
  }

  return [...byStaticAssetId.values()].slice(0, 6);
}

function latestV2StaticRowsByAssetId(rows) {
  const byStaticAssetId = new Map();
  for (const row of rows) {
    const metadata = asRecord(row.metadata);
    const staticAssetId = typeof metadata.staticAssetId === "string" ? metadata.staticAssetId.trim() : "";
    if (
      staticAssetId &&
      !byStaticAssetId.has(staticAssetId) &&
      metadata.source === "static_ad" &&
      metadata.role === "app_composed_final_static" &&
      metadata.appComposedFinal === true &&
      metadata.compositionVersion === "app_composed_static_v2" &&
      typeof metadata.provider_original_url === "string" &&
      metadata.provider_original_url.trim()
    ) {
      byStaticAssetId.set(staticAssetId, row);
    }
  }

  return byStaticAssetId;
}

function shouldRecomposeExistingSourceRows(rows) {
  return rows.some((row) => {
    const metadata = asRecord(row.metadata);
    return (
      metadata.source === "static_ad" &&
      metadata.role === "app_composed_final_static" &&
      metadata.appComposedFinal === true &&
      metadata.compositionVersion === "app_composed_static_v2" &&
      !metadata.location
    );
  });
}

async function recomposeExistingProviderSources(supabase, row, existingRows) {
  const latestByAssetId = latestV2StaticRowsByAssetId(existingRows);
  const staticAds = staticAdsFromPlan(row.plan)
    .map((asset) => {
      const current = asRecord(asset);
      const sourceRow = latestByAssetId.get(current.id);
      const sourceMetadata = asRecord(sourceRow?.metadata);
      const providerOriginalUrl = typeof sourceMetadata.provider_original_url === "string"
        ? sourceMetadata.provider_original_url.trim()
        : "";
      if (!providerOriginalUrl) return null;

      return {
        ...current,
        imageUrl: providerOriginalUrl,
        storageNormalized: false,
        appComposedFinal: false,
        qualityTier: null,
        compositionVersion: null,
        sourceBackgroundKind: null,
        sourceBackgroundProvider: null,
        sourceBackgroundAssetId: null,
        imageGenerationState: "generated",
        imageGenerationMessage: null,
        imageGenerationProvider: sourceMetadata.sourceBackgroundProvider ?? current.imageGenerationProvider ?? "higgsfield_marketing_studio",
        imageGenerationModel: sourceMetadata.imageGenerationModel ?? current.imageGenerationModel ?? null,
        imageQa: sourceMetadata.sourceImageQa ?? current.sourceImageQa ?? current.imageQa ?? null,
        sourceImageQa: null,
        visualQualityGate: null,
        premiumQualityGate: null,
        location: current.location ?? sourceMetadata.location ?? "Toronto, ON",
        audience: current.audience ?? sourceMetadata.audience ?? null,
      };
    })
    .filter(Boolean);

  if (staticAds.length < 4) {
    return { recomposed: false, count: staticAds.length };
  }

  await persistStaticCreativeAssets({
    supabase,
    userId: row.user_id,
    campaignId: TARGET_CAMPAIGN_ID,
    staticAds,
  });

  return { recomposed: true, count: staticAds.length };
}

async function promoteExistingV2Rows(supabase, rows, readinessContext) {
  const promotableRows = latestPromotableV2Rows(rows, readinessContext);
  const promotedIds = [];

  for (const row of promotableRows) {
    const metadata = asRecord(row.metadata);
    const nextMetadata = {
      ...metadata,
      qualityTier: "premium_final",
      imageQa: {
        ...asRecord(metadata.imageQa),
        mode: "app_composed_final",
        usable: true,
        decision: "accept",
        reasons: [],
        textDensity: 0,
        layoutRisk: 0,
      },
      visualQualityGate: {
        ...asRecord(metadata.visualQualityGate),
        accepted: true,
        mode: "composition_provenance",
        reasons: [],
      },
      premiumQualityGate: {
        ...asRecord(metadata.premiumQualityGate),
        accepted: true,
        mode: "higgsfield_source_provenance",
        reasons: [],
      },
      imageGenerationState: "generated",
      imageGenerationMessage: null,
      sourceImageQaOverride:
        metadata.sourceImageQaOverride ?? "fresh_higgsfield_finished_ad_source_promoted_to_app_composed_v2",
    };

    const { error } = await supabase
      .from("creative_assets")
      .update({ status: "ready", metadata: nextMetadata })
      .eq("id", row.id);

    if (error) {
      throw new Error(`existing v2 promotion failed: ${error.message}`);
    }

    promotedIds.push(row.id);
  }

  return { promotedRows: promotableRows, promotedIds };
}

function promotedRowsByStaticId(rows) {
  return new Map(rows.map((row) => [asRecord(row.metadata).staticAssetId, row]));
}

function updatePlanStaticAdsWithPromotedRows(plan, promotedRows, selectedIds) {
  const document = asRecord(plan);
  const currentStaticAds = Array.isArray(document.staticAds)
    ? document.staticAds
    : Array.isArray(asRecord(document.creatives).staticAds)
      ? asRecord(document.creatives).staticAds
      : [];
  const promotedById = promotedRowsByStaticId(promotedRows);
  const nextStaticAds = currentStaticAds.map((asset) => {
    const current = asRecord(asset);
    const promotedRow = promotedById.get(current.id);
    if (!promotedRow) return asset;

    const metadata = asRecord(promotedRow.metadata);
    const imageQa = {
      ...asRecord(metadata.imageQa),
      mode: "app_composed_final",
      usable: true,
      decision: "accept",
      reasons: [],
      textDensity: 0,
      layoutRisk: 0,
    };

    return {
      ...current,
      imageUrl: promotedRow.file_url,
      storageNormalized: true,
      appComposedFinal: true,
      qualityTier: "premium_final",
      compositionVersion: metadata.compositionVersion ?? "app_composed_static_v2",
      sourceBackgroundKind: metadata.sourceBackgroundKind ?? null,
      sourceBackgroundProvider: metadata.sourceBackgroundProvider ?? null,
      sourceBackgroundAssetId: metadata.sourceBackgroundAssetId ?? null,
      imageGenerationState: "generated",
      imageGenerationMessage: null,
      imageGenerationProvider: metadata.imageGenerationProvider ?? "higgsfield_marketing_studio",
      imageGenerationModel: metadata.imageGenerationModel ?? null,
      imageQa,
      sourceImageQa: metadata.sourceImageQa ?? null,
      visualQualityGate: {
        ...asRecord(metadata.visualQualityGate),
        accepted: true,
        mode: "composition_provenance",
        reasons: [],
      },
      premiumQualityGate: {
        ...asRecord(metadata.premiumQualityGate),
        accepted: true,
        mode: "higgsfield_source_provenance",
        reasons: [],
      },
      location: metadata.location ?? current.location ?? null,
      audience: metadata.audience ?? current.audience ?? null,
    };
  });
  const payload = asRecord(document.campaign_payload);

  return {
    ...document,
    staticAds: nextStaticAds,
    selected_ad_id: selectedIds[0] ?? null,
    selected_ad_ids: selectedIds,
    campaign_payload: {
      ...payload,
      selected_ad_id: selectedIds[0] ?? null,
      selected_ad_ids: selectedIds,
      staticAds: Array.isArray(payload.staticAds) ? nextStaticAds : payload.staticAds,
    },
    creatives: {
      ...asRecord(document.creatives),
      staticAds: nextStaticAds,
    },
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
    .select("id,creative_id,status,metadata,file_url,thumbnail_url")
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

async function updatePlanWithPromotedStaticAds(supabase, row, promotedRows, selectedIds) {
  const nextPlan = updatePlanStaticAdsWithPromotedRows(row.plan, promotedRows, selectedIds);
  const { error } = await supabase
    .from("campaign_plans")
    .update({ plan: nextPlan })
    .eq("id", TARGET_CAMPAIGN_ID)
    .eq("user_id", row.user_id);

  if (error) {
    throw new Error(`campaign static promotion update failed: ${error.message}`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const forceRegenerateCurrent = process.argv.includes("--force-regenerate-current");
  const recomposeExistingSources = process.argv.includes("--recompose-existing-sources");
  const maxGenerations = Math.min(Math.max(numberArg("max-generations", 0), 0), 6);
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
        recomposeExistingSources
          ? "recompose existing app-owned v2 source images with current campaign location/copy"
          : "reuse existing app-composed rows when already current",
        forceRegenerateCurrent
          ? `force-regenerate current static concepts/finals with maxGenerations=${maxGenerations}`
          : `regenerate current static concepts/finals with maxGenerations=${maxGenerations} when fewer than 4 are launch-ready`,
        "store 4-6 app-composed final statics in app-owned storage",
        "select the first 4-6 current launch-ready app-composed static IDs",
        "preserve historical failed/provider rows as evidence",
      ],
      applyCommand: `node ./scripts/repair-app-composed-static-finals.mjs${forceRegenerateCurrent ? " --force-regenerate-current" : ""}${recomposeExistingSources ? " --recompose-existing-sources" : ""} --max-generations=${maxGenerations} --apply --ack=${APPLY_ACK}`,
      rollback: {
        scope: `campaign_plans row ${TARGET_CAMPAIGN_ID} and newly inserted creative_assets/storage objects for this campaign only`,
        action: "Restore the previous campaign_plans.plan from pre-apply output or Supabase PITR; leave historical evidence rows unless owner explicitly approves cleanup.",
      },
    }, null, 2));
    return;
  }

  let repaired = null;
  let existingPromotion = { promotedRows: [], promotedIds: [] };
  if (forceRegenerateCurrent || beforeReadyIds.length < 4) {
    repaired = await regenerateStaticCreativeAssetsForUser(TARGET_CAMPAIGN_ID, before.user_id, {
      force: true,
      missingOnly: !forceRegenerateCurrent,
      maxGenerations,
      supabase,
      providerUsageRunId: "repair-app-composed-static-finals",
    });
  }
  const after = await loadCampaign(supabase);
  const afterContext = readinessContextFromPlan(after.plan);
  const afterRowsBeforeSelection = await loadCreativeAssetRows(supabase, before.user_id);
  const recomposition = (recomposeExistingSources || shouldRecomposeExistingSourceRows(afterRowsBeforeSelection))
    ? await recomposeExistingProviderSources(supabase, after, afterRowsBeforeSelection)
    : { recomposed: false, count: 0 };
  const rowsAfterRecomposition = recomposition.recomposed
    ? await loadCreativeAssetRows(supabase, before.user_id)
    : afterRowsBeforeSelection;
  if (selectReadyIdsFromRows(rowsAfterRecomposition, afterContext).length < 4) {
    existingPromotion = await promoteExistingV2Rows(supabase, rowsAfterRecomposition, afterContext);
  }
  const rowsAfterExistingPromotion = existingPromotion.promotedIds.length
    ? await loadCreativeAssetRows(supabase, before.user_id)
    : rowsAfterRecomposition;
  const selectedReadyIds = selectReadyIdsFromRows(rowsAfterExistingPromotion, afterContext);
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

  const selectedIds = selectedReadyIds.slice(0, 4);
  if (existingPromotion.promotedRows.length) {
    await updatePlanWithPromotedStaticAds(supabase, after, existingPromotion.promotedRows, selectedIds);
  } else {
    await updateSelectedStaticIds(supabase, after, selectedIds);
  }

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
      promotedExistingV2Rows: existingPromotion.promotedRows.length,
      recomposedExistingV2Sources: recomposition.count,
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
