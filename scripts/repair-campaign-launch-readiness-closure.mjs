#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

export const CAMPAIGN_LAUNCH_READINESS_TARGET = {
  campaignId: "ccbfbfce-5070-4621-8ca4-d074d732b964",
  organizationId: "a848a680-9dd1-45e7-84d1-65bcc9a6292a",
  userId: "14c0efb4-8006-4924-814e-3cd353eb3341",
  publicSlug: "raiaan-broker-toronto-on-ccbfbfce",
  applyConfirm: "REPAIR_CAMPAIGN_LAUNCH_READINESS",
  minimumStaticCreativeCount: 3,
  canonicalFunnelVersion: "winning_funnel_v1",
};

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function unique(values, max = Number.POSITIVE_INFINITY) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, max);
}

function metadataString(metadata, key) {
  return typeof metadata?.[key] === "string" && metadata[key].trim() ? metadata[key].trim() : null;
}

function metadataNumber(metadata, key) {
  return typeof metadata?.[key] === "number" && Number.isFinite(metadata[key]) ? metadata[key] : null;
}

function sameCampaignStaticAssetKey(row, metadata) {
  const campaignId = typeof row.campaign_id === "string" ? row.campaign_id : "";
  const creativeId = typeof row.creative_id === "string" && row.creative_id.trim() ? row.creative_id.trim() : row.id;
  const staticAssetId = metadataString(metadata, "staticAssetId");

  if (staticAssetId && (staticAssetId === creativeId || (campaignId && staticAssetId.startsWith(`${campaignId}-`)))) {
    return staticAssetId;
  }

  return creativeId;
}

function hasTextFreeBackgroundContract(asset) {
  const prompt = [
    asset.imagePrompt,
    asset.imagePromptConfig?.prompt,
    asset.visualPromptBrief?.visualAssetContract,
    asset.visualPromptBrief?.visualAssetRole,
  ]
    .map((value) => (typeof value === "string" ? value.toLowerCase() : ""))
    .join(" ");

  return prompt.includes("text_free_background") || prompt.includes("text-free background");
}

export function isLaunchReadyStaticAsset(asset) {
  if (!asset?.imageUrl || asset.imageGenerationState === "failed") {
    return false;
  }

  if (asset.storageNormalized !== true) {
    return false;
  }

  if (asset.qualityGate?.accepted !== true) {
    return false;
  }

  if (asset.imageQa && (asset.imageQa.usable === false || asset.imageQa.decision !== "accept")) {
    return false;
  }

  if (asset.imageQa?.mode === "finished_ad") {
    return true;
  }

  return hasTextFreeBackgroundContract(asset);
}

function staticAssetFromRow(key, row) {
  const metadata = asRecord(row.metadata);
  const imageUrl = row.file_url ?? row.thumbnail_url ?? "";
  const imageQa = asRecord(metadata.imageQa);
  const qualityGate = asRecord(metadata.qualityGate);
  const visualQualityGate = asRecord(metadata.visualQualityGate);
  const premiumQualityGate = asRecord(metadata.premiumQualityGate);
  const sourceImageQa = asRecord(metadata.sourceImageQa);
  const offerQuality = asRecord(metadata.offerQuality);
  const providerName = metadataString(metadata, "imageGenerationProvider") ?? row.provider_name ?? null;
  const isHiggsfieldFinishedAd =
    providerName === "higgsfield_marketing_studio" &&
    imageQa.mode === "finished_ad" &&
    imageQa.decision === "accept" &&
    imageUrl;

  return {
    id: key,
    angle: ["guarantee", "urgency", "contrarian", "authority"].includes(metadata.angle) ? metadata.angle : "opportunity",
    imageUrl,
    storageNormalized:
      metadata.storageNormalized === true ||
      (metadata.storageNormalizationReusedExistingAppAsset === true && typeof metadata.storagePath === "string"),
    imageGenerationState: imageUrl ? "generated" : row.status === "failed" ? "failed" : "unavailable",
    imageGenerationMessage: typeof metadata.imageGenerationMessage === "string" ? metadata.imageGenerationMessage : null,
    imageGenerationModel: metadataString(metadata, "imageGenerationModel"),
    imageGenerationProvider: providerName,
    generationMethod: isHiggsfieldFinishedAd
      ? "higgsfield_marketing_studio"
      : row.generation_method ?? null,
    providerName,
    generationMode: isHiggsfieldFinishedAd
      ? "finished_ad"
      : metadataString(metadata, "generationMode"),
    assetRole: isHiggsfieldFinishedAd
      ? "final_static_ad"
      : metadataString(metadata, "assetRole"),
    visualConcept: typeof metadata.visualConcept === "string" ? metadata.visualConcept : "",
    appComposedFinal: metadata.appComposedFinal === true,
    qualityTier: isHiggsfieldFinishedAd
      ? "higgsfield_finished_ad"
      : metadataString(metadata, "qualityTier"),
    compositionVersion: metadataString(metadata, "compositionVersion"),
    sourceBackgroundKind: metadataString(metadata, "sourceBackgroundKind"),
    sourceBackgroundProvider: metadataString(metadata, "sourceBackgroundProvider"),
    sourceBackgroundAssetId: metadataString(metadata, "sourceBackgroundAssetId"),
    imagePrompt: typeof metadata.imagePrompt === "string" ? metadata.imagePrompt : "",
    imagePromptConfig: asRecord(metadata.imagePromptConfig),
    visualPromptBrief: asRecord(metadata.visualPromptBrief),
    imageQa: Object.keys(imageQa).length > 0 ? imageQa : null,
    sourceImageQa: Object.keys(sourceImageQa).length > 0 ? sourceImageQa : null,
    visualQualityGate: Object.keys(visualQualityGate).length > 0 ? visualQualityGate : null,
    premiumQualityGate: Object.keys(premiumQualityGate).length > 0 ? premiumQualityGate : null,
    offerQuality: Object.keys(offerQuality).length > 0 ? offerQuality : null,
    qualityGate: Object.keys(qualityGate).length > 0 ? qualityGate : null,
    hook: typeof metadata.overlayText === "string" ? metadata.overlayText : "",
    overlayText: typeof metadata.overlayText === "string" ? metadata.overlayText : "",
    primaryText: typeof metadata.primaryText === "string" ? metadata.primaryText : "",
    headline: typeof metadata.headline === "string" ? metadata.headline : "",
    cta: typeof metadata.cta === "string" ? metadata.cta : "",
    staticBriefHash: metadataString(metadata, "staticBriefHash"),
    offerHash: metadataString(metadata, "offerHash"),
    ctaHash: metadataString(metadata, "ctaHash"),
    brandHash: metadataString(metadata, "brandHash"),
    approvedOfferTitle: metadataString(metadata, "approvedOfferTitle"),
    approvedCta: metadataString(metadata, "approvedCta"),
    approvedBrand: metadataString(metadata, "approvedBrand"),
    location: metadataString(metadata, "location"),
    audience: metadataString(metadata, "audience"),
    score: metadataNumber(metadata, "score") ?? 0,
    recommended: metadata.recommended === true,
    launchReadinessSource: {
      creativeAssetRowId: row.id,
      creativeId: row.creative_id ?? null,
      staticAssetId: metadataString(metadata, "staticAssetId"),
      storagePath: metadataString(metadata, "storagePath"),
    },
  };
}

export function mapStaticCreativeAssetsForLaunch(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const metadata = asRecord(row.metadata);
    if (metadata.source !== "static_ad") {
      continue;
    }

    const key = sameCampaignStaticAssetKey(row, metadata);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return Array.from(grouped.entries()).map(([key, groupRows]) => {
    const preferred =
      groupRows.find((row) => {
        const metadata = asRecord(row.metadata);
        const asset = staticAssetFromRow(key, row);
        return metadata.role === "higgsfield_finished_static_ad" && row.status === "ready" && isLaunchReadyStaticAsset(asset);
      }) ??
      groupRows.find((row) => {
        const metadata = asRecord(row.metadata);
        const asset = staticAssetFromRow(key, row);
        return metadata.role === "app_composed_final_static" && row.status === "ready" && isLaunchReadyStaticAsset(asset);
      }) ??
      groupRows.find((row) => {
        const metadata = asRecord(row.metadata);
        const asset = staticAssetFromRow(key, row);
        return metadata.role === "background_image" && row.status === "ready" && isLaunchReadyStaticAsset(asset);
      }) ??
      groupRows.find((row) => row.status === "ready" && isLaunchReadyStaticAsset(staticAssetFromRow(key, row))) ??
      groupRows.find((row) => row.file_url) ??
      groupRows[0];

    return staticAssetFromRow(key, preferred);
  });
}

function buildAliasMap(staticAds, rows) {
  const canonicalIds = new Set(staticAds.map((asset) => asset.id));
  const aliasToCanonical = new Map(staticAds.map((asset) => [asset.id, asset.id]));
  const staticAssetCandidates = new Map();

  for (const row of rows) {
    const creativeId = optionalText(row.creative_id);
    if (!creativeId || !canonicalIds.has(creativeId)) {
      continue;
    }

    aliasToCanonical.set(row.id, creativeId);
    const staticAssetId = metadataString(asRecord(row.metadata), "staticAssetId");
    if (staticAssetId) {
      staticAssetCandidates.set(staticAssetId, new Set([...(staticAssetCandidates.get(staticAssetId) ?? []), creativeId]));
    }
  }

  for (const [staticAssetId, candidates] of staticAssetCandidates.entries()) {
    if (candidates.size === 1) {
      aliasToCanonical.set(staticAssetId, Array.from(candidates)[0]);
    }
  }

  return aliasToCanonical;
}

function readSelectedMedia(plan) {
  const current = asRecord(plan);
  const payload = asRecord(current.campaign_payload);
  const camelPayload = asRecord(current.campaignPayload);
  const nestedPlan = asRecord(current.plan);
  const nestedPayload = asRecord(nestedPlan.campaign_payload);
  const selectedAdIds = unique([
    ...asArray(current.selected_ad_ids).map(String),
    ...asArray(current.selectedAdIds).map(String),
    ...asArray(payload.selected_ad_ids).map(String),
    ...asArray(payload.selectedAdIds).map(String),
    ...asArray(camelPayload.selected_ad_ids).map(String),
    ...asArray(camelPayload.selectedAdIds).map(String),
    ...asArray(nestedPlan.selected_ad_ids).map(String),
    ...asArray(nestedPlan.selectedAdIds).map(String),
    ...asArray(nestedPayload.selected_ad_ids).map(String),
    ...asArray(nestedPayload.selectedAdIds).map(String),
    optionalText(current.selected_ad_id),
    optionalText(current.selectedAdId),
    optionalText(payload.selected_ad_id),
    optionalText(payload.selectedAdId),
    optionalText(nestedPlan.selected_ad_id),
    optionalText(nestedPlan.selectedAdId),
    optionalText(nestedPayload.selected_ad_id),
    optionalText(nestedPayload.selectedAdId),
  ], 6);
  const selectedUgcVideoIds = unique([
    ...asArray(current.selected_ugc_video_ids).map(String),
    ...asArray(current.selectedUgcVideoIds).map(String),
    ...asArray(payload.selected_ugc_video_ids).map(String),
    ...asArray(payload.selectedUgcVideoIds).map(String),
    ...asArray(camelPayload.selected_ugc_video_ids).map(String),
    ...asArray(camelPayload.selectedUgcVideoIds).map(String),
    ...asArray(nestedPlan.selected_ugc_video_ids).map(String),
    ...asArray(nestedPlan.selectedUgcVideoIds).map(String),
    ...asArray(nestedPayload.selected_ugc_video_ids).map(String),
    ...asArray(nestedPayload.selectedUgcVideoIds).map(String),
    optionalText(current.selected_ugc_video_id),
    optionalText(current.selectedUgcVideoId),
    optionalText(payload.selected_ugc_video_id),
    optionalText(payload.selectedUgcVideoId),
  ], 3);

  return { selectedAdIds, selectedUgcVideoIds };
}

function normalizeFunnelText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

function funnelSignature(value) {
  const record = asRecord(value);
  const campaign = asRecord(record.campaign);
  const funnel = asRecord(record.funnel);
  const fallbackFunnel = asRecord(campaign.funnel);
  const resolved = Object.keys(funnel).length > 0 ? funnel : fallbackFunnel;

  if (Object.keys(resolved).length === 0) {
    return null;
  }

  return [
    normalizeFunnelText(resolved.headline),
    normalizeFunnelText(resolved.subheadline),
    normalizeFunnelText(resolved.cta),
  ].join("|");
}

function mergeLaunchMediaIntoPlan(currentPlan, params) {
  const current = asRecord(currentPlan);
  const existingCreatives = asRecord(current.creatives);
  const payload = asRecord(current.campaign_payload);
  const selectedAdId = params.selectedAdIds[0] ?? null;
  const selectedUgcVideoId = params.selectedUgcVideoIds[0] ?? null;
  const now = params.now;

  return {
    ...current,
    version: typeof current.version === "number" ? current.version : 3,
    staticAds: params.staticAds,
    creatives: {
      ...existingCreatives,
      staticAds: params.staticAds,
    },
    selected_ad_id: selectedAdId,
    selected_ad_ids: params.selectedAdIds,
    selected_ugc_video_id: selectedUgcVideoId,
    selected_ugc_video_ids: params.selectedUgcVideoIds,
    campaign_payload: {
      ...payload,
      selected_ad_id: selectedAdId,
      selected_ad_ids: params.selectedAdIds,
      selected_ugc_video_id: selectedUgcVideoId,
      selected_ugc_video_ids: params.selectedUgcVideoIds,
    },
    launchReadinessClosure: {
      operator_assisted_meta: true,
      proof_run_id: params.proofRunId,
      refreshed_at: now,
      canonical_funnel_version: CAMPAIGN_LAUNCH_READINESS_TARGET.canonicalFunnelVersion,
      selected_static_ad_ids: params.selectedAdIds,
      selected_ugc_video_ids: params.selectedUgcVideoIds,
      existing_asset_only: true,
      provider_generation_called: false,
      live_meta_mutation_called: false,
    },
  };
}

function refreshSnapshot(snapshot, nextPlan, params) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return snapshot;
  }

  return {
    ...snapshot,
    plan: asRecord(snapshot.plan),
    funnel: asRecord(nextPlan.funnel),
    ads: Array.isArray(nextPlan.ads) ? nextPlan.ads : snapshot.ads,
    staticAds: nextPlan.staticAds,
    videoAds: Array.isArray(nextPlan.videoAds) ? nextPlan.videoAds : snapshot.videoAds,
    launch: nextPlan.launch ?? snapshot.launch,
    results: nextPlan.results ?? snapshot.results,
    launchReadinessClosure: {
      operator_assisted_meta: true,
      proof_run_id: params.proofRunId,
      refreshed_at: params.now,
      canonical_funnel_version: CAMPAIGN_LAUNCH_READINESS_TARGET.canonicalFunnelVersion,
      public_funnel_snapshot_refreshed: true,
    },
  };
}

function hasEquivalentStaticSet(value, expectedStaticAds) {
  const existing = Array.isArray(value) ? value : [];
  if (existing.length < expectedStaticAds.length) {
    return false;
  }

  const existingById = new Map(existing.map((asset) => [asset?.id, asRecord(asset)]));
  return expectedStaticAds.every((expected) => {
    const current = existingById.get(expected.id);
    return Boolean(
      current &&
        current.imageUrl === expected.imageUrl &&
        current.storageNormalized === expected.storageNormalized &&
        current.imageGenerationProvider === expected.imageGenerationProvider &&
        current.generationMethod === expected.generationMethod &&
        current.providerName === expected.providerName &&
        current.generationMode === expected.generationMode &&
        current.assetRole === expected.assetRole &&
        current.qualityTier === expected.qualityTier &&
        asRecord(current.qualityGate).accepted === asRecord(expected.qualityGate).accepted &&
        asRecord(current.imageQa).decision === asRecord(expected.imageQa).decision,
    );
  });
}

function validateTarget(row) {
  const failures = [];
  if (row.id !== CAMPAIGN_LAUNCH_READINESS_TARGET.campaignId) failures.push("campaign_id_mismatch");
  if (row.organization_id !== CAMPAIGN_LAUNCH_READINESS_TARGET.organizationId) failures.push("organization_id_mismatch");
  if (row.user_id !== CAMPAIGN_LAUNCH_READINESS_TARGET.userId) failures.push("user_id_mismatch");
  if (row.public_slug !== CAMPAIGN_LAUNCH_READINESS_TARGET.publicSlug) failures.push("public_slug_mismatch");
  if (row.publish_state !== "published") failures.push("campaign_not_published");
  return failures;
}

export function buildCampaignLaunchReadinessRepair(row, assetRows, options = {}) {
  const proofRunId = options.proofRunId ?? "campaign_launch_readiness_closure_local";
  const now = options.now ?? new Date().toISOString();
  const targetFailures = validateTarget(row);
  const currentPlan = asRecord(row.plan);
  const selectedBefore = readSelectedMedia(currentPlan);
  const staticAds = mapStaticCreativeAssetsForLaunch(assetRows);
  const launchReadyStaticAds = staticAds.filter(isLaunchReadyStaticAsset);
  const aliasMap = buildAliasMap(staticAds, assetRows);
  let selectedAdIds = unique(selectedBefore.selectedAdIds.map((id) => aliasMap.get(id) ?? id), 6)
    .filter((id) => launchReadyStaticAds.some((asset) => asset.id === id));

  if (selectedAdIds.length < CAMPAIGN_LAUNCH_READINESS_TARGET.minimumStaticCreativeCount) {
    selectedAdIds = launchReadyStaticAds.map((asset) => asset.id).slice(0, 6);
  }

  const selectedUgcVideoIds = selectedBefore.selectedUgcVideoIds;
  const blockers = [
    ...targetFailures,
    ...(launchReadyStaticAds.length < CAMPAIGN_LAUNCH_READINESS_TARGET.minimumStaticCreativeCount
      ? ["insufficient_launch_ready_static_creatives"]
      : []),
    ...(selectedAdIds.length < CAMPAIGN_LAUNCH_READINESS_TARGET.minimumStaticCreativeCount
      ? ["selected_static_minimum_not_met"]
      : []),
    ...(Object.keys(asRecord(currentPlan.funnel)).length === 0 ? ["current_plan_funnel_missing"] : []),
  ];
  const nextPlan = mergeLaunchMediaIntoPlan(currentPlan, {
    staticAds,
    selectedAdIds,
    selectedUgcVideoIds,
    proofRunId,
    now,
  });
  const nextStagedSnapshot = refreshSnapshot(row.staged_snapshot, nextPlan, { proofRunId, now });
  const nextPublishedSnapshot = refreshSnapshot(row.published_snapshot, nextPlan, { proofRunId, now });
  const beforePublishedSignature = funnelSignature(row.published_snapshot);
  const afterPublishedSignature = funnelSignature(nextPublishedSnapshot);
  const currentSignature = funnelSignature(nextPlan);
  const changes = [];

  if (!hasEquivalentStaticSet(currentPlan.staticAds, nextPlan.staticAds)) {
    changes.push("plan.staticAds");
  }
  if (!hasEquivalentStaticSet(asRecord(currentPlan.creatives).staticAds, nextPlan.staticAds)) {
    changes.push("plan.creatives.staticAds");
  }
  if (JSON.stringify(selectedBefore.selectedAdIds) !== JSON.stringify(selectedAdIds)) {
    changes.push("plan.selected_ad_ids");
    changes.push("plan.campaign_payload.selected_ad_ids");
  }
  if (beforePublishedSignature !== afterPublishedSignature || currentSignature !== beforePublishedSignature) {
    changes.push("published_snapshot.funnel");
    changes.push("staged_snapshot.funnel");
  }

  return {
    proofRunId,
    blockers,
    changes: unique(changes),
    mutationCount: blockers.length === 0 ? 1 : 0,
    selectedBefore,
    selectedAfter: { selectedAdIds, selectedUgcVideoIds },
    staticSummary: {
      totalGroups: staticAds.length,
      launchReadyCount: launchReadyStaticAds.length,
      launchReadyIds: launchReadyStaticAds.map((asset) => asset.id),
      selectedReadyCount: selectedAdIds.filter((id) => launchReadyStaticAds.some((asset) => asset.id === id)).length,
    },
    snapshotSummary: {
      currentSignature,
      beforePublishedSignature,
      afterPublishedSignature,
      publicFunnelSnapshotCurrentAfter: Boolean(currentSignature && currentSignature === afterPublishedSignature),
    },
    safety: {
      campaignPlansOnly: true,
      creativeAssetsTouched: false,
      systemJobsTouched: false,
      providerCalls: false,
      liveMetaMutation: false,
      ghlTouched: false,
      stripeTouched: false,
      smsEmailTouched: false,
    },
    nextRow: {
      plan: nextPlan,
      staged_snapshot: nextStagedSnapshot,
      published_snapshot: nextPublishedSnapshot,
    },
  };
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    apply: false,
    campaignId: CAMPAIGN_LAUNCH_READINESS_TARGET.campaignId,
    proofRunId: `campaign_launch_readiness_closure_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`,
    confirm: null,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--campaign-id=")) args.campaignId = arg.slice("--campaign-id=".length);
    else if (arg.startsWith("--proof-run-id=")) args.proofRunId = arg.slice("--proof-run-id=".length);
    else if (arg.startsWith("--confirm=")) args.confirm = arg.slice("--confirm=".length);
  }

  return args;
}

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error("Supabase URL or service role env is missing.");
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.apply === args.dryRun) {
    throw new Error("Pass exactly one of --dry-run or --apply.");
  }
  if (args.campaignId !== CAMPAIGN_LAUNCH_READINESS_TARGET.campaignId) {
    throw new Error("This repair is scoped only to the approved target campaign.");
  }
  if (args.apply && args.confirm !== CAMPAIGN_LAUNCH_READINESS_TARGET.applyConfirm) {
    throw new Error(`Apply requires --confirm=${CAMPAIGN_LAUNCH_READINESS_TARGET.applyConfirm}.`);
  }

  const supabase = createSupabaseClient();
  const { data: row, error: rowError } = await supabase
    .from("campaign_plans")
    .select("id,user_id,organization_id,owner_id,public_slug,publish_state,plan,staged_snapshot,published_snapshot,staged_at,published_at")
    .eq("id", args.campaignId)
    .eq("organization_id", CAMPAIGN_LAUNCH_READINESS_TARGET.organizationId)
    .maybeSingle();

  if (rowError) throw rowError;
  if (!row) throw new Error("Target campaign row not found.");

  const { data: assetRows, error: assetError } = await supabase
    .from("creative_assets")
    .select("*")
    .eq("campaign_id", args.campaignId)
    .eq("user_id", CAMPAIGN_LAUNCH_READINESS_TARGET.userId)
    .in("asset_type", ["image_frame", "thumbnail", "static_image", "image"])
    .order("created_at", { ascending: false });

  if (assetError) throw assetError;

  const result = buildCampaignLaunchReadinessRepair(row, Array.isArray(assetRows) ? assetRows : [], {
    proofRunId: args.proofRunId,
  });

  const output = {
    mode: args.apply ? "apply" : "dry_run",
    scanned_campaigns: 1,
    affected_campaigns: result.changes.length > 0 ? 1 : 0,
    campaign_id: args.campaignId,
    proof_run_id: result.proofRunId,
    blockers: result.blockers,
    changes: result.changes,
    mutation_count: args.apply && result.blockers.length === 0 ? result.mutationCount : 0,
    selected_before: result.selectedBefore,
    selected_after: result.selectedAfter,
    static_summary: result.staticSummary,
    snapshot_summary: result.snapshotSummary,
    safety: result.safety,
  };

  if (result.blockers.length > 0) {
    console.log(JSON.stringify(output, null, 2));
    throw new Error(`Repair blocked: ${result.blockers.join(", ")}`);
  }

  if (args.apply && result.changes.length > 0) {
    const now = new Date().toISOString();
    const { data: updatedRow, error: updateError } = await supabase
      .from("campaign_plans")
      .update({
        plan: result.nextRow.plan,
        staged_snapshot: result.nextRow.staged_snapshot,
        published_snapshot: result.nextRow.published_snapshot,
        staged_at: row.staged_snapshot ? now : row.staged_at,
        published_at: row.published_snapshot ? now : row.published_at,
      })
      .eq("id", args.campaignId)
      .eq("organization_id", CAMPAIGN_LAUNCH_READINESS_TARGET.organizationId)
      .eq("user_id", CAMPAIGN_LAUNCH_READINESS_TARGET.userId)
      .select("id,public_slug,publish_state,published_at,staged_at")
      .maybeSingle();

    if (updateError) throw updateError;
    output.updated_row = updatedRow;
  }

  console.log(JSON.stringify(output, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
