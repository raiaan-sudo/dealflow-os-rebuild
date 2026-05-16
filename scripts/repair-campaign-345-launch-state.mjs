#!/usr/bin/env node

import { createDecipheriv, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

export const CAMPAIGN_345_REPAIR = {
  campaignId: "345dcc04-8e87-4ead-b71a-40236e2ef52e",
  organizationId: "8b82dea3-54da-4ccb-accc-81931513436c",
  ownerId: "8b82dea3-54da-4ccb-accc-81931513436c",
  userId: "ddaff253-807d-419e-8411-7b276558f05e",
  canonicalSlug: "raiaan-broker-toronto-on-ccbfbfce",
  aliasSlug: "raiaan-realty",
  meta: {
    campaignId: "120248208607670616",
    adSetId: "120248208608400616",
    creativeId: "1387185106767238",
    adId: "120248208609740616",
    dailyBudget: "300",
  },
  applyAck: "repair-campaign-345-paused-launch-state",
};

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function unique(values, max = Number.POSITIVE_INFINITY) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, max);
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

function normalizedPrompt(input, includeNegativePrompt = false) {
  return [
    input.imagePrompt,
    input.imagePromptConfig?.prompt,
    includeNegativePrompt ? input.imagePromptConfig?.negativePrompt : null,
  ]
    .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
    .filter(Boolean)
    .join(" ");
}

function hasTextFreeBackgroundContract(input) {
  const contract = optionalText(input.visualPromptBrief?.visualAssetContract)?.toLowerCase() ?? "";
  const role = optionalText(input.visualPromptBrief?.visualAssetRole)?.toLowerCase() ?? "";
  const prompt = normalizedPrompt(input);

  return (
    contract === "text_free_background_v2" ||
    role === "text_free_background" ||
    prompt.includes("text-free background asset only")
  );
}

function hasLegacyFinishedAdPromptRisk(input) {
  return /\b(finished,\s*high-converting|finished paid social|finished paid-social|ad creative frame|proof modules|dashboard grids|brochure-style ad layout|poster-like typography|cta-safe bottom)\b/.test(
    normalizedPrompt(input),
  );
}

export function evaluateStaticVisualAssetDecision(input) {
  if (!optionalText(input.imageUrl)) {
    return { usable: false, reason: "missing_image" };
  }

  if (input.qualityGate?.accepted !== true) {
    return { usable: false, reason: "quality_gate_not_accepted" };
  }

  if (input.imageQa && (input.imageQa.usable === false || input.imageQa.decision !== "accept")) {
    return { usable: false, reason: "image_qa_not_accepted" };
  }

  if (input.imageQa?.mode === "finished_ad") {
    return input.storageNormalized === true
      ? { usable: true, reason: null }
      : { usable: false, reason: "storage_not_normalized" };
  }

  if (!hasTextFreeBackgroundContract(input)) {
    return { usable: false, reason: "missing_text_free_background_contract" };
  }

  if (input.storageNormalized !== true) {
    return { usable: false, reason: "storage_not_normalized" };
  }

  if (hasLegacyFinishedAdPromptRisk(input)) {
    return { usable: false, reason: "legacy_finished_ad_prompt_risk" };
  }

  return { usable: true, reason: null };
}

function staticDraftFromRow(row) {
  const metadata = asRecord(row.metadata);
  const imageUrl = row.file_url ?? row.thumbnail_url ?? "";
  return {
    id: (optionalText(metadata.staticAssetId) ?? row.creative_id ?? row.id),
    imageUrl,
    storageNormalized:
      metadata.storageNormalized === true ||
      (metadata.storageNormalizationReusedExistingAppAsset === true && typeof metadata.storagePath === "string"),
    imagePrompt: typeof metadata.imagePrompt === "string" ? metadata.imagePrompt : "",
    imagePromptConfig: asRecord(metadata.imagePromptConfig),
    visualPromptBrief: asRecord(metadata.visualPromptBrief),
    qualityGate: asRecord(metadata.qualityGate),
    imageQa: asRecord(metadata.imageQa),
    score: typeof metadata.score === "number" ? metadata.score : 0,
    role: optionalText(metadata.role),
    formatLabel: optionalText(metadata.formatLabel),
    status: row.status,
  };
}

function isLaunchReadyStaticRow(row) {
  return row.status === "ready" && evaluateStaticVisualAssetDecision(staticDraftFromRow(row)).usable;
}

export function summarizeStaticGroups(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const metadata = asRecord(row.metadata);
    if (metadata.source !== "static_ad") {
      continue;
    }

    const id = optionalText(metadata.staticAssetId) ?? row.creative_id ?? row.id;
    grouped.set(id, [...(grouped.get(id) ?? []), row]);
  }

  return Array.from(grouped.entries()).map(([id, groupRows]) => {
    const preferred =
      groupRows.find((row) => staticDraftFromRow(row).role === "background_image" && isLaunchReadyStaticRow(row)) ??
      groupRows.find(isLaunchReadyStaticRow) ??
      groupRows.find((row) => staticDraftFromRow(row).role === "background_image" && row.status === "ready" && Boolean(row.file_url)) ??
      groupRows.find((row) => staticDraftFromRow(row).role === "background_image" && Boolean(row.file_url)) ??
      groupRows.find((row) => row.file_url) ??
      groupRows[0];
    const draft = staticDraftFromRow(preferred);
    const decision = evaluateStaticVisualAssetDecision(draft);

    return {
      id,
      rowCount: groupRows.length,
      readyRows: groupRows.filter((row) => row.status === "ready").length,
      launchReady: preferred.status === "ready" && decision.usable,
      blockedReason: decision.reason,
      hasAppOwnedFile: Boolean(draft.imageUrl),
      storageNormalized: draft.storageNormalized === true,
      qualityAccepted: draft.qualityGate?.accepted === true,
      imageQaDecision: draft.imageQa?.decision ?? null,
      imageQaMode: draft.imageQa?.mode ?? null,
      score: draft.score,
      isUgcStyle: /\bugc\b/i.test(`${id} ${draft.formatLabel ?? ""}`),
    };
  });
}

export function chooseSelectedStaticIds(staticGroups) {
  const launchReady = staticGroups
    .filter((group) => group.launchReady)
    .sort((left, right) => Number(right.isUgcStyle) - Number(left.isUgcStyle) || right.score - left.score || left.id.localeCompare(right.id));

  if (launchReady.length < 4) {
    return [];
  }

  return unique(launchReady.map((group) => group.id), Math.min(6, launchReady.length));
}

function hasProviderError(video) {
  return /providererror|provider error|failed|sample|demo|placeholder/i.test(video.videoGenerationMessage ?? "");
}

function looksLikeSampleVideo(video) {
  return video.sampleOnly === true || /\b(sample|demo|mock|placeholder|template)\b/i.test(
    [video.id, video.videoUrl, video.providerAssetId, video.promptSource].filter(Boolean).join(" "),
  );
}

function hasAcceptedProductQualityGate(video) {
  const gate = asRecord(video.videoProductQualityGate);
  const checks = asRecord(gate.checks);
  return Boolean(
    gate.accepted === true &&
      gate.usable !== false &&
      checks.hook === true &&
      checks.marketProblem === true &&
      checks.creatorPointOfView === true &&
      checks.mechanism === true &&
      checks.sourceRelevance === true &&
      checks.cta === true &&
      checks.duration !== false,
  );
}

function hasAcceptedVideoQa(video) {
  return Boolean(
    video.videoQualityGate?.accepted === true ||
      video.videoQualityGate?.usable === true ||
      video.videoQa?.usable === true ||
      video.videoQa?.decision === "accept",
  );
}

function hasPromptProvenance(video) {
  return Boolean(
    (video.promptHash || video.promptUsed) &&
      (video.promptSource === "creative_intake" || video.promptSource === "campaign_specific_fallback"),
  );
}

function isSupportedVideoContentType(contentType) {
  return /^(video\/mp4|video\/webm|video\/quicktime)\b/i.test(contentType ?? "");
}

export function getVideoLaunchReadinessReason(video, acceptedStaticIds = new Set()) {
  if (!video) return "missing_video";
  if (!video.videoUrl || video.videoGenerationState === "failed") return "missing_playable_video";
  if (looksLikeSampleVideo(video)) return "sample_or_template_video";
  if (video.storageNormalized !== true || video.storageBucket !== "creative-assets") return "storage_not_normalized";
  if (!isSupportedVideoContentType(video.storageContentType)) return "missing_supported_video_storage_metadata";
  if (typeof video.storageByteSize !== "number" || video.storageByteSize <= 0) return "missing_storage_size";
  if (typeof video.durationSeconds !== "number" || !Number.isFinite(video.durationSeconds)) return "missing_video_duration_metadata";
  if (video.durationSeconds < 15) return "video_duration_too_short";
  if (!video.providerName || !video.providerAssetId) return "missing_provider_provenance";
  if (hasProviderError(video)) return "provider_reported_issue";
  if (!video.sourceStaticAssetId || !video.sourceImageUrl) return "missing_source_static_asset";
  if (!acceptedStaticIds.has(video.sourceStaticAssetId)) return "source_static_not_accepted";
  if (!hasPromptProvenance(video) || !video.scriptHash) return "missing_prompt_or_script_provenance";
  if (!video.campaignSpecificContext?.campaignId) return "missing_campaign_context";
  if (!hasAcceptedVideoQa(video)) return "missing_video_quality_acceptance";
  if (!hasAcceptedProductQualityGate(video)) return "missing_product_quality_acceptance";
  return null;
}

export function summarizeVideos(rows, acceptedStaticIds) {
  return rows
    .filter((row) => ["talking_head_video", "ugc_video", "montage_video", "video"].includes(String(row.asset_type ?? "")))
    .map((row, index) => {
      const metadata = asRecord(row.metadata);
      const promptVersion = asRecord(metadata.creativeIntakePromptVersionUsed);
      const intakeContext = asRecord(metadata.creativeIntakeGenerationContext);
      const video = {
        id: row.creative_id || row.id,
        conceptType: row.asset_type === "talking_head_video" ? "founder_expert" : "customer_ugc",
        title: optionalText(metadata.title) ?? `UGC video ${index + 1}`,
        videoUrl: row.status === "ready" && row.file_url ? row.file_url : null,
        videoGenerationState: row.status === "ready" && row.file_url ? "generated" : row.status === "failed" ? "failed" : "generating",
        videoGenerationMessage: optionalText(metadata.videoGenerationMessage) ?? null,
        providerName: row.provider_name ?? null,
        providerAssetId: row.provider_asset_id ?? null,
        storageNormalized: metadata.storageNormalized === true,
        storageBucket: optionalText(metadata.storageBucket),
        storageContentType: optionalText(metadata.storageContentType),
        storageByteSize: typeof metadata.storageByteSize === "number" ? metadata.storageByteSize : null,
        durationSeconds: typeof metadata.durationSeconds === "number" ? metadata.durationSeconds : null,
        sourceStaticAssetId: optionalText(metadata.sourceStaticAssetId),
        sourceImageUrl: optionalText(metadata.sourceImageUrl),
        promptUsed:
          optionalText(metadata.promptUsed) ??
          optionalText(metadata.generationPrompt) ??
          optionalText(promptVersion.generatedPrompt),
        promptSource: optionalText(metadata.promptSource),
        promptHash: optionalText(metadata.promptHash),
        scriptHash: optionalText(metadata.scriptHash),
        sampleOnly: metadata.sampleOnly === true,
        campaignSpecificContext:
          asRecord(metadata.campaignSpecificContext).campaignId || intakeContext.campaignId
            ? { ...asRecord(metadata.campaignSpecificContext), campaignId: optionalText(asRecord(metadata.campaignSpecificContext).campaignId) ?? optionalText(intakeContext.campaignId) }
            : null,
        videoQualityGate: asRecord(metadata.videoQualityGate),
        videoProductQualityGate: asRecord(metadata.videoProductQualityGate),
        videoQa: asRecord(metadata.videoQa),
      };
      const reason = getVideoLaunchReadinessReason(video, acceptedStaticIds);

      return {
        id: video.id,
        conceptType: video.conceptType,
        status: row.status,
        launchReady: reason === null,
        blockedReason: reason,
        hasAppOwnedFile: Boolean(video.videoUrl),
        storageNormalized: video.storageNormalized,
        sourceStaticAssetId: video.sourceStaticAssetId,
        sampleOnly: video.sampleOnly,
        durationSeconds: video.durationSeconds,
      };
    });
}

export function chooseSelectedUgcVideoIds(videos) {
  return videos
    .filter((video) => video.conceptType === "customer_ugc" && video.launchReady)
    .map((video) => video.id)
    .slice(0, 3);
}

function readSelectedMedia(plan) {
  const value = asRecord(plan);
  const payload = asRecord(value.campaign_payload);
  const nestedPlan = asRecord(value.plan);
  const nestedPayload = asRecord(nestedPlan.campaign_payload);
  const camelPayload = asRecord(value.campaignPayload);
  return {
    selectedAdIds: unique([
      ...asArray(value.selected_ad_ids),
      ...asArray(value.selectedAdIds),
      ...asArray(payload.selected_ad_ids),
      ...asArray(camelPayload.selectedAdIds),
      ...asArray(nestedPlan.selected_ad_ids),
      ...asArray(nestedPlan.selectedAdIds),
      ...asArray(nestedPayload.selected_ad_ids),
      optionalText(value.selected_ad_id),
      optionalText(value.selectedAdId),
      optionalText(payload.selected_ad_id),
      optionalText(nestedPlan.selected_ad_id),
      optionalText(nestedPayload.selected_ad_id),
    ], 6),
    selectedUgcVideoIds: unique([
      ...asArray(value.selected_ugc_video_ids),
      ...asArray(value.selectedUgcVideoIds),
      ...asArray(payload.selected_ugc_video_ids),
      ...asArray(camelPayload.selectedUgcVideoIds),
      ...asArray(nestedPlan.selected_ugc_video_ids),
      ...asArray(nestedPlan.selectedUgcVideoIds),
      ...asArray(nestedPayload.selected_ugc_video_ids),
      optionalText(value.selected_ugc_video_id),
      optionalText(value.selectedUgcVideoId),
      optionalText(payload.selected_ugc_video_id),
      optionalText(nestedPlan.selected_ugc_video_id),
      optionalText(nestedPayload.selected_ugc_video_id),
    ], 3),
  };
}

function buildPausedRuntime(now) {
  return {
    status: "paused",
    safetyState: "paused",
    launchMode: "live",
    lastAction: "Paused Meta objects recorded; owner activation remains blocked until funding and explicit approval.",
    statusUpdatedAt: now,
    launchedAt: null,
    campaignId: CAMPAIGN_345_REPAIR.meta.campaignId,
    adSetId: CAMPAIGN_345_REPAIR.meta.adSetId,
    adId: CAMPAIGN_345_REPAIR.meta.adId,
    metaAdSetIds: [CAMPAIGN_345_REPAIR.meta.adSetId],
    metaAdIds: [CAMPAIGN_345_REPAIR.meta.adId],
    pausedAdIds: [CAMPAIGN_345_REPAIR.meta.adId],
    budgetDaily: 3,
    budgetDailyInput: 3,
    metaPushStatus: "paused",
    metaLastMessage: "Meta campaign, ad set, creative, and ad were verified read-only as PAUSED. No live spend has been activated.",
  };
}

function buildLaunchRuntime(now) {
  return {
    current_stage: "ad",
    status: "paused",
    step_status: "paused",
    campaign_id: CAMPAIGN_345_REPAIR.meta.campaignId,
    adset_id: CAMPAIGN_345_REPAIR.meta.adSetId,
    creative_id: CAMPAIGN_345_REPAIR.meta.creativeId,
    ad_id: CAMPAIGN_345_REPAIR.meta.adId,
    updated_at: now,
  };
}

export function buildRepairedPlan(plan, params) {
  const current = asRecord(plan);
  const payload = asRecord(current.campaign_payload);
  const now = params.now;
  const selectedUgcVideoId = params.selectedUgcVideoIds[0] ?? null;
  return {
    ...current,
    version: typeof current.version === "number" ? current.version : 3,
    selected_ad_id: params.selectedStaticIds[0] ?? null,
    selected_ad_ids: params.selectedStaticIds,
    selected_ugc_video_id: selectedUgcVideoId,
    selected_ugc_video_ids: params.selectedUgcVideoIds,
    launch_status: "paused",
    campaign_payload: {
      ...payload,
      selected_ad_id: params.selectedStaticIds[0] ?? null,
      selected_ad_ids: params.selectedStaticIds,
      selected_ugc_video_id: selectedUgcVideoId,
      selected_ugc_video_ids: params.selectedUgcVideoIds,
    },
    runtime: {
      ...asRecord(current.runtime),
      ...buildPausedRuntime(now),
    },
    launch_runtime: {
      ...asRecord(current.launch_runtime),
      ...buildLaunchRuntime(now),
    },
  };
}

function safePlanRuntime(plan) {
  const value = asRecord(plan);
  return {
    launch_status: value.launch_status ?? null,
    public_slug: value.public_slug ?? null,
    runtime: {
      status: asRecord(value.runtime).status ?? null,
      safetyState: asRecord(value.runtime).safetyState ?? null,
      launchMode: asRecord(value.runtime).launchMode ?? null,
      campaignId: asRecord(value.runtime).campaignId ?? null,
      adSetId: asRecord(value.runtime).adSetId ?? null,
      adId: asRecord(value.runtime).adId ?? null,
      metaPushStatus: asRecord(value.runtime).metaPushStatus ?? null,
      metaAdSetIds: asArray(asRecord(value.runtime).metaAdSetIds),
      metaAdIds: asArray(asRecord(value.runtime).metaAdIds),
      budgetDailyInput: asRecord(value.runtime).budgetDailyInput ?? null,
    },
    launch_runtime: {
      status: asRecord(value.launch_runtime).status ?? null,
      step_status: asRecord(value.launch_runtime).step_status ?? null,
      campaign_id: asRecord(value.launch_runtime).campaign_id ?? null,
      adset_id: asRecord(value.launch_runtime).adset_id ?? null,
      creative_id: asRecord(value.launch_runtime).creative_id ?? null,
      ad_id: asRecord(value.launch_runtime).ad_id ?? null,
    },
  };
}

function validateMetaProof(metaProof) {
  const failures = [];
  if (metaProof.campaign?.id !== CAMPAIGN_345_REPAIR.meta.campaignId) failures.push("campaign_id_mismatch");
  if (metaProof.campaign?.status !== "PAUSED" || metaProof.campaign?.effective_status !== "PAUSED") failures.push("campaign_not_paused");
  if (metaProof.adset?.id !== CAMPAIGN_345_REPAIR.meta.adSetId) failures.push("adset_id_mismatch");
  if (metaProof.adset?.campaign_id !== CAMPAIGN_345_REPAIR.meta.campaignId) failures.push("adset_campaign_mismatch");
  if (metaProof.adset?.daily_budget !== CAMPAIGN_345_REPAIR.meta.dailyBudget) failures.push("adset_daily_budget_mismatch");
  if (metaProof.adset?.status !== "PAUSED" || metaProof.adset?.effective_status !== "PAUSED") failures.push("adset_not_paused");
  if (metaProof.ad?.id !== CAMPAIGN_345_REPAIR.meta.adId) failures.push("ad_id_mismatch");
  if (metaProof.ad?.campaign_id !== CAMPAIGN_345_REPAIR.meta.campaignId) failures.push("ad_campaign_mismatch");
  if (metaProof.ad?.adset_id !== CAMPAIGN_345_REPAIR.meta.adSetId) failures.push("ad_adset_mismatch");
  if (metaProof.ad?.creative_id !== CAMPAIGN_345_REPAIR.meta.creativeId) failures.push("ad_creative_mismatch");
  if (metaProof.ad?.status !== "PAUSED" || metaProof.ad?.effective_status !== "PAUSED") failures.push("ad_not_paused");
  if (metaProof.creative?.id !== CAMPAIGN_345_REPAIR.meta.creativeId) failures.push("creative_id_mismatch");
  return failures;
}

async function fetchMetaProof(supabase, row) {
  const { data, error } = await supabase
    .from("marketing_accounts")
    .select("id,organization_id,platform,status,account_name,external_account_id,pixel_id,connection_metadata,access_token_encrypted")
    .eq("organization_id", row.organization_id)
    .eq("platform", "meta_ads")
    .limit(1);

  if (error) {
    throw new Error(`marketing_accounts: ${error.message}`);
  }

  const account = data?.[0] ?? null;
  if (!account?.access_token_encrypted) {
    throw new Error("Meta connection has no encrypted token for read-only verification.");
  }

  const encryptionKey = process.env.META_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encryptionKey) {
    throw new Error("META_TOKEN_ENCRYPTION_KEY is missing.");
  }

  const accessToken = decryptSecret(account.access_token_encrypted, encryptionKey);
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
    graph(CAMPAIGN_345_REPAIR.meta.campaignId, "id,name,status,effective_status,configured_status,objective,buying_type"),
    graph(CAMPAIGN_345_REPAIR.meta.adSetId, "id,name,status,effective_status,configured_status,daily_budget,campaign_id,destination_type,promoted_object"),
    graph(CAMPAIGN_345_REPAIR.meta.adId, "id,name,status,effective_status,configured_status,campaign_id,adset_id,creative{id},tracking_specs"),
    graph(CAMPAIGN_345_REPAIR.meta.creativeId, "id,name,object_story_spec"),
  ]);

  const creativeSpec = asRecord(creative.object_story_spec);
  const destinationLink =
    optionalText(asRecord(asRecord(creativeSpec.link_data).call_to_action).value?.link) ??
    optionalText(asRecord(creativeSpec.link_data).link) ??
    optionalText(asRecord(asRecord(creativeSpec.video_data).call_to_action).value?.link);

  return {
    account: {
      id: account.id,
      organization_id: account.organization_id,
      status: account.status,
      external_account_id: account.external_account_id,
      selected_external_account_id: asRecord(account.connection_metadata).selected_external_account_id ?? null,
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
      destinationLink,
    },
  };
}

export function buildRepairDecision({ campaignRow, assets, metaProof, now = new Date().toISOString() }) {
  const currentSelected = readSelectedMedia(campaignRow.plan);
  const staticGroups = summarizeStaticGroups(assets);
  const acceptedStaticIds = new Set(staticGroups.filter((group) => group.launchReady).map((group) => group.id));
  const selectedStaticIds = currentSelected.selectedAdIds.length >= 4
    ? currentSelected.selectedAdIds
    : chooseSelectedStaticIds(staticGroups);
  const videos = summarizeVideos(assets, acceptedStaticIds);
  const selectedUgcVideoIds = currentSelected.selectedUgcVideoIds.length > 0
    ? currentSelected.selectedUgcVideoIds
    : chooseSelectedUgcVideoIds(videos);
  const beforePlan = campaignRow.plan ?? {};
  const afterPlan = buildRepairedPlan(beforePlan, {
    selectedStaticIds,
    selectedUgcVideoIds,
    now,
  });

  const blockers = [];
  if (campaignRow.id !== CAMPAIGN_345_REPAIR.campaignId) blockers.push("target_campaign_mismatch");
  if (campaignRow.organization_id !== CAMPAIGN_345_REPAIR.organizationId) blockers.push("organization_mismatch");
  if (campaignRow.owner_id !== CAMPAIGN_345_REPAIR.ownerId) blockers.push("owner_mismatch");
  if (campaignRow.user_id !== CAMPAIGN_345_REPAIR.userId) blockers.push("user_mismatch");
  if (selectedStaticIds.length < 4) blockers.push("insufficient_launch_ready_static_media");
  if (selectedUgcVideoIds.length < 1) blockers.push("insufficient_launch_ready_ugc_media");
  blockers.push(...validateMetaProof(metaProof));

  const afterSelected = readSelectedMedia(afterPlan);
  const alreadyMatches =
    JSON.stringify(currentSelected.selectedAdIds) === JSON.stringify(afterSelected.selectedAdIds) &&
    JSON.stringify(currentSelected.selectedUgcVideoIds) === JSON.stringify(afterSelected.selectedUgcVideoIds) &&
    JSON.stringify(safePlanRuntime(beforePlan)) === JSON.stringify(safePlanRuntime(afterPlan)) &&
    campaignRow.launch_status === "paused";

  return {
    mode: "dry_run",
    targetCampaignId: CAMPAIGN_345_REPAIR.campaignId,
    mutatesData: false,
    blockers,
    sufficientEvidence: blockers.length === 0,
    idempotentNoop: blockers.length === 0 && alreadyMatches,
    before: {
      row: {
        id: campaignRow.id,
        owner_id: campaignRow.owner_id ?? null,
        user_id: campaignRow.user_id ?? null,
        organization_id: campaignRow.organization_id ?? null,
        launch_status: campaignRow.launch_status ?? null,
        public_slug: campaignRow.public_slug ?? null,
        publish_state: campaignRow.publish_state ?? null,
        hasPublishedSnapshot: Boolean(campaignRow.published_snapshot),
      },
      selectedMedia: currentSelected,
      runtime: safePlanRuntime(beforePlan),
    },
    evidence: {
      staticGroups,
      selectedStaticIds,
      videoAssets: videos,
      selectedUgcVideoIds,
      metaProof,
    },
    after: {
      row: {
        launch_status: "paused",
        public_slug: campaignRow.public_slug ?? null,
      },
      selectedMedia: afterSelected,
      runtime: safePlanRuntime(afterPlan),
    },
    rollback: {
      update: "Restore campaign_plans.plan and launch_status for only campaign 345 from the before snapshot printed by this script or from Supabase point-in-time backup.",
      scope: "campaign_plans row id 345dcc04-8e87-4ead-b71a-40236e2ef52e only",
    },
    nextAction: blockers.length === 0
      ? `Apply with --apply --ack=${CAMPAIGN_345_REPAIR.applyAck} if this before/after is approved.`
      : "Do not write. Resolve the listed evidence blockers first.",
    _afterPlan: afterPlan,
  };
}

function printableDecision(decision) {
  const { _afterPlan, ...printable } = decision;
  void _afterPlan;
  return printable;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const ackArg = process.argv.find((arg) => arg.startsWith("--ack="));
  const ack = ackArg?.slice("--ack=".length) ?? "";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  if (apply && ack !== CAMPAIGN_345_REPAIR.applyAck) {
    throw new Error(`Apply requires --ack=${CAMPAIGN_345_REPAIR.applyAck}.`);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: campaignRows, error: campaignError } = await supabase
    .from("campaign_plans")
    .select("*")
    .eq("id", CAMPAIGN_345_REPAIR.campaignId);
  if (campaignError) {
    throw new Error(`campaign_plans: ${campaignError.message}`);
  }
  if (!campaignRows || campaignRows.length !== 1) {
    throw new Error(`Expected exactly one campaign row, found ${campaignRows?.length ?? 0}.`);
  }

  const campaignRow = campaignRows[0];
  const { data: assets, error: assetError } = await supabase
    .from("creative_assets")
    .select("id,campaign_id,creative_id,asset_type,status,generation_method,provider_name,provider_asset_id,file_url,thumbnail_url,metadata,created_at")
    .eq("campaign_id", CAMPAIGN_345_REPAIR.campaignId)
    .limit(1000);
  if (assetError) {
    throw new Error(`creative_assets: ${assetError.message}`);
  }

  const metaProof = await fetchMetaProof(supabase, campaignRow);
  const decision = buildRepairDecision({
    campaignRow,
    assets: assets ?? [],
    metaProof,
  });

  if (!apply) {
    console.log(JSON.stringify(printableDecision(decision), null, 2));
    process.exitCode = decision.sufficientEvidence ? 0 : 1;
    return;
  }

  if (!decision.sufficientEvidence) {
    console.log(JSON.stringify(printableDecision(decision), null, 2));
    throw new Error(`Repair evidence insufficient: ${decision.blockers.join(", ")}`);
  }

  if (!decision.idempotentNoop) {
    const { error: updateError } = await supabase
      .from("campaign_plans")
      .update({
        plan: decision._afterPlan,
        launch_status: "paused",
      })
      .eq("id", CAMPAIGN_345_REPAIR.campaignId)
      .eq("organization_id", CAMPAIGN_345_REPAIR.organizationId)
      .eq("owner_id", CAMPAIGN_345_REPAIR.ownerId);

    if (updateError) {
      throw new Error(`campaign_plans update failed: ${updateError.message}`);
    }
  }

  const verifyRows = await supabase
    .from("campaign_plans")
    .select("*")
    .eq("id", CAMPAIGN_345_REPAIR.campaignId);
  if (verifyRows.error) {
    throw new Error(`campaign_plans verify failed: ${verifyRows.error.message}`);
  }

  const postDecision = buildRepairDecision({
    campaignRow: verifyRows.data?.[0],
    assets: assets ?? [],
    metaProof,
  });

  console.log(JSON.stringify({
    applied: !decision.idempotentNoop,
    dryRunBeforeApply: printableDecision(decision),
    verificationAfterApply: printableDecision(postDecision),
  }, null, 2));

  if (!postDecision.sufficientEvidence || !postDecision.idempotentNoop) {
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
