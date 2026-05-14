import { createHash } from "node:crypto";
import { ApiError, retryRouteStep } from "@/lib/api/route";
import { getHeyGenVideoStatus } from "@/lib/ai/heygen";
import { getHiggsfieldGenerationStatus } from "@/lib/ai/higgsfield";
import {
  getCreativeAssetsSchemaCompatibilityMessage,
  toVideoProviderApiError,
} from "@/lib/ai/video-generation-errors";
import { getAvatarVideoProvider } from "@/lib/integrations/creative/avatar-provider";
import { getSavedCampaignDocumentFromRow } from "@/lib/services/canonical-campaign";
import { persistCampaignPlanDocumentUpdate } from "@/lib/services/campaign-plan-persistence-service";
import type { StaticCreativeAsset, VideoCreativeAsset } from "@/lib/services/creative-engine";
import {
  getApprovedCreativeIntakeGenerationContext,
  hasSameCreativeIntakeGenerationContext,
  isCreativeChatIntakeEnabled,
  type CreativeIntakeGenerationContext,
} from "@/lib/services/creative-chat-intake-service";
import type { Database, Json } from "@/lib/supabase/types";
import type { CreativeAsset } from "@/lib/types/creative-assets";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  consumeSessionCostBudget,
  markSessionCostBudgetEvent,
} from "@/lib/services/session-cost-guard";
import {
  isAppOwnedCreativeAssetUrl,
  normalizeGeneratedVideoProviderFile,
} from "@/lib/services/static-creative-storage-normalization";
import { evaluateGeneratedVideoQualityGate } from "@/lib/services/creative-media-readiness";
import { evaluateStaticVisualAssetDecision } from "@/lib/services/static-creative-visual-qa";

type VideoPersistenceClient = SupabaseClient<Database>;
type CampaignPlanRow = Database["public"]["Tables"]["campaign_plans"]["Row"];

export type VideoGenerationJobPayload = {
  creativeIndex: number;
  creativeId: string | null;
  copyId: string | null;
  creativeFormat: string | null;
  title: string;
  hook: string;
  body: string;
  cta: string;
  scriptText: string;
  scriptLines: string[];
  scenes: Array<{ id: string; text: string }>;
  avatarProfileId: string | null;
  voiceProfile: string | null;
  audience: string | null;
  location: string | null;
  force: boolean;
  targetDurationSeconds?: number | null;
  creativeIntake?: CreativeIntakeGenerationContext | null;
};

export type VideoGenerationStatusJobPayload = {
  assetId: string;
  providerAssetId: string;
  providerUsageEventId: string | null;
  providerName?: string | null;
  pollAttempt?: number;
};

function createDefaultVideoState(payload: VideoGenerationJobPayload): VideoCreativeAsset {
  return {
    id: `video-${payload.creativeIndex}`,
    conceptType: "customer_ugc",
    title: payload.title,
    hook: payload.hook,
    script: payload.scriptLines,
    shotList: payload.scenes.map((scene) => scene.text),
    onScreenText: [payload.hook, payload.cta],
    cta: payload.cta,
    creatorStyle: "ugc",
    voiceStyle: "clear and direct",
        avatarProfile: {
          id: "trusted_expert",
          genderPresentation: "polished professional",
          ageRange: "30-45",
          stylePersona: "trusted real estate expert",
          energy: "calm and decisive",
          nicheFit: payload.audience || payload.location || "",
        },
    voiceProfile: {
      id: "authoritative",
      tone: "authoritative and clear",
      accent: "local neutral",
      speed: "measured",
      authorityLevel: "high",
    },
  };
}

const SAFE_VIDEO_FAILURE_MESSAGE =
  "Video preview is temporarily unavailable. Your campaign can continue reviewing static creatives while we finish video rendering.";
const VIDEO_STATUS_POLL_MAX_ATTEMPTS = 12;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildVideoProductQualityGate(params: {
  promptUsed: string;
  scriptText: string;
  body: string;
  cta: string;
  sourceStaticAccepted: boolean;
  targetDurationSeconds?: number | null;
}) {
  const text = `${params.promptUsed}\n${params.scriptText}\n${params.body}\n${params.cta}`.toLowerCase();
  const targetDurationSeconds =
    typeof params.targetDurationSeconds === "number" && Number.isFinite(params.targetDurationSeconds)
      ? params.targetDurationSeconds
      : null;
  const checks = {
    hook: /\b(first|before|if you|stop|don'?t|most buyers|closer than|private|600\+|approved|approval)\b/.test(text),
    marketProblem: /\b(buyer|buyers|market|listing|approval|credit|afford|public search|competition|crowded|toronto|home)\b/.test(text),
    creatorPointOfView: /\b(i|me|my|agent|creator|walkthrough|show you|here'?s|let me)\b/.test(text),
    mechanism: /\b(shortlist|options|qualify|qualification|matching|private listings|approval path|strategy|help|get better)\b/.test(text),
    sourceRelevance: params.sourceStaticAccepted,
    cta: Boolean(params.cta.trim()) && /\b(get|see|check|book|start|request|tap|learn)\b/.test(params.cta.toLowerCase()),
    duration: targetDurationSeconds === null || targetDurationSeconds >= 15,
  };
  const failed = Object.entries(checks)
    .filter(([, accepted]) => !accepted)
    .map(([key]) => `${key}_missing`);
  const accepted = failed.length === 0;

  return {
    accepted,
    usable: accepted,
    decision: accepted ? "accept" : "review",
    reasons: failed,
    checks,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asStaticPromptConfig(value: unknown): StaticCreativeAsset["imagePromptConfig"] {
  return asRecord(value) as StaticCreativeAsset["imagePromptConfig"];
}

function asStaticVisualPromptBrief(value: unknown): StaticCreativeAsset["visualPromptBrief"] {
  return asRecord(value) as StaticCreativeAsset["visualPromptBrief"];
}

function asStaticImageQa(value: unknown): StaticCreativeAsset["imageQa"] {
  return asRecord(value) as StaticCreativeAsset["imageQa"];
}

function asStaticQualityGate(value: unknown): StaticCreativeAsset["qualityGate"] {
  return asRecord(value) as StaticCreativeAsset["qualityGate"];
}

function readSelectedStaticIds(savedDocument: unknown) {
  const record = asRecord(savedDocument) ?? {};
  const direct = Array.isArray(record.selected_ad_ids)
    ? record.selected_ad_ids
    : [];
  const payload = asRecord(record.campaign_payload);
  const nested = Array.isArray(payload?.selected_ad_ids)
    ? payload.selected_ad_ids
    : [];

  return [...direct, ...nested]
    .map((value) => typeof value === "string" ? value.trim() : "")
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index);
}

function staticAssetIdForRow(row: CreativeAsset) {
  const metadata = asRecord(row.metadata);
  return (
    (typeof metadata?.staticAssetId === "string" && metadata.staticAssetId.trim()) ||
    row.creative_id ||
    row.id
  );
}

function isLaunchReadyStaticSourceRow(row: CreativeAsset) {
  const metadata = asRecord(row.metadata);
  const imageUrl = row.file_url ?? row.thumbnail_url ?? "";
  const storageNormalized =
    metadata?.storageNormalized === true ||
    (metadata?.storageNormalizationReusedExistingAppAsset === true &&
      typeof metadata?.storagePath === "string");

  if (metadata?.source !== "static_ad" || row.status !== "ready" || !imageUrl) {
    return false;
  }

  if (!isAppOwnedCreativeAssetUrl(imageUrl)) {
    return false;
  }

  return evaluateStaticVisualAssetDecision({
    imageUrl,
    storageNormalized,
    imagePrompt: typeof metadata?.imagePrompt === "string" ? metadata.imagePrompt : "",
    imagePromptConfig: asStaticPromptConfig(metadata?.imagePromptConfig),
    visualPromptBrief: asStaticVisualPromptBrief(metadata?.visualPromptBrief),
    qualityGate: asStaticQualityGate(metadata?.qualityGate),
    imageQa: asStaticImageQa(metadata?.imageQa),
  }).usable;
}

async function getLaunchReadyStaticVideoSource(params: {
  supabase: VideoPersistenceClient;
  userId: string;
  campaignId: string;
  savedDocument: unknown;
  selectedIndex: number;
}) {
  const { data, error } = await params.supabase
    .from("creative_assets")
    .select("*")
    .eq("campaign_id", params.campaignId)
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false });

  if (error || !Array.isArray(data)) {
    return null;
  }

  const selectedIds = readSelectedStaticIds(params.savedDocument);
  const readyRows = (data as CreativeAsset[])
    .filter(isLaunchReadyStaticSourceRow)
    .map((row) => ({
      row,
      staticAssetId: staticAssetIdForRow(row),
      imageUrl: row.file_url ?? row.thumbnail_url ?? "",
    }))
    .filter((candidate) => candidate.imageUrl);
  const selectedIndexById = new Map(selectedIds.map((id, index) => [id, index]));
  const selectedReadyRows = readyRows
    .filter((candidate) => selectedIndexById.has(candidate.staticAssetId))
    .sort((left, right) =>
      (selectedIndexById.get(left.staticAssetId) ?? Number.MAX_SAFE_INTEGER) -
      (selectedIndexById.get(right.staticAssetId) ?? Number.MAX_SAFE_INTEGER),
    );
  const selectedCandidate = selectedReadyRows[params.selectedIndex] ?? selectedReadyRows[0] ?? null;
  const fallbackCandidate = readyRows[params.selectedIndex] ?? readyRows[0] ?? null;
  const chosen = selectedCandidate ?? fallbackCandidate;

  if (!chosen) {
    return null;
  }

  return {
    imageUrl: chosen.imageUrl,
    staticAssetId: chosen.staticAssetId,
    accepted: true,
  };
}

async function getVideoSourceImageUrl(params: {
  supabase: VideoPersistenceClient;
  userId: string;
  campaignId: string;
  savedDocument: unknown;
  selectedIndex: number;
}) {
  const readyStaticSource = await getLaunchReadyStaticVideoSource(params);

  if (readyStaticSource) {
    return readyStaticSource;
  }

  const record = params.savedDocument && typeof params.savedDocument === "object"
    ? (params.savedDocument as Record<string, unknown>)
    : {};
  const staticAds = Array.isArray(record.staticAds)
    ? (record.staticAds as StaticCreativeAsset[])
    : [];
  const candidates = [
    staticAds[params.selectedIndex],
    ...staticAds,
  ].filter(Boolean);

  for (const asset of candidates) {
    const imageUrl = typeof asset.imageUrl === "string" ? asset.imageUrl.trim() : "";

    if (
      imageUrl &&
      asset.imageGenerationState === "generated" &&
      asset.qualityGate?.accepted !== false &&
      isAppOwnedCreativeAssetUrl(imageUrl)
    ) {
      return {
        imageUrl,
        staticAssetId: asset.id,
        accepted: true,
      };
    }
  }

  return null;
}

function mergeVideoAdState(
  existing: VideoCreativeAsset[],
  nextVideo: VideoCreativeAsset,
  selectedIndex: number,
) {
  const next = [...existing];
  const existingIndex = next.findIndex((video) => video.id === nextVideo.id);
  const targetIndex = existingIndex >= 0 ? existingIndex : selectedIndex;

  if (targetIndex >= 0 && targetIndex < next.length) {
    next[targetIndex] = {
      ...next[targetIndex],
      ...nextVideo,
    };
    return next;
  }

  next.push(nextVideo);
  return next;
}

function buildCreativeIntakeAssetMetadata(
  creativeIntake?: CreativeIntakeGenerationContext | null,
) {
  if (!creativeIntake) {
    return {
      creativeIntakePromptVersionUsed: null,
      creativeIntakeGenerationContext: null,
    };
  }

  return {
    creativeIntakePromptVersionUsed: creativeIntake.promptVersion,
    creativeIntakeGenerationContext: {
      version: creativeIntake.version,
      conversationId: creativeIntake.conversationId,
      campaignId: creativeIntake.campaignId,
      revisionNumber: creativeIntake.revisionNumber,
      approvedAt: creativeIntake.approvedAt,
      outputMode: creativeIntake.outputMode,
      generationPhase: creativeIntake.generationPhase,
      ugcStyleBrief: creativeIntake.ugcStyleBrief ?? null,
      promptVersionCreatedAt: creativeIntake.promptVersion.createdAt,
    },
  };
}

function resolveDurableVideoCreativeIntake(
  savedDocument: unknown,
  payloadContext?: CreativeIntakeGenerationContext | null,
) {
  if (!isCreativeChatIntakeEnabled()) {
    return payloadContext ?? null;
  }

  const durableCreativeIntake = getApprovedCreativeIntakeGenerationContext(savedDocument);

  if (!durableCreativeIntake || durableCreativeIntake.generationPhase !== "ugc_video") {
    throw new ApiError(
      409,
      "Review and approve the video creative brief before rendering paid video previews.",
      "creative_brief_review_required",
    );
  }

  if (
    payloadContext &&
    !hasSameCreativeIntakeGenerationContext(payloadContext, durableCreativeIntake)
  ) {
    throw new ApiError(
      409,
      "The queued video creative job no longer matches the approved creative brief.",
      "creative_brief_version_mismatch",
    );
  }

  return durableCreativeIntake;
}

async function loadCampaignPlanRow(
  supabase: VideoPersistenceClient,
  userId: string,
  campaignId: string,
) {
  const { data, error } = await supabase
    .from("campaign_plans")
    .select("*")
    .eq("id", campaignId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "Campaign not found.", "campaign_not_found");
  }

  return data as CampaignPlanRow;
}

async function persistVideoAdsToCampaignPlan(params: {
  supabase: VideoPersistenceClient;
  userId: string;
  campaignId: string;
  videoAds: VideoCreativeAsset[];
}) {
  const row = await loadCampaignPlanRow(params.supabase, params.userId, params.campaignId);
  const savedDocument = getSavedCampaignDocumentFromRow(row) ?? {};
  const nextPlan = {
    ...(savedDocument as Record<string, unknown>),
    videoAds: params.videoAds,
  } as Json;

  try {
    await persistCampaignPlanDocumentUpdate({
      supabase: params.supabase,
      campaignId: params.campaignId,
      userId: params.userId,
      plan: nextPlan,
      source: "campaign_video_ads_save",
      existingRow: row,
    });
  } catch (error) {
    throw new ApiError(500, error instanceof Error ? error.message : "Campaign video ads could not be saved.", "campaign_video_ads_save_failed");
  }
}

async function persistVideoStateToCampaignPlan(params: {
  supabase: VideoPersistenceClient;
  userId: string;
  campaignId: string;
  providerAssetId: string;
  status: "generated" | "failed";
  videoUrl: string | null;
  message: string | null;
  videoPatch?: Partial<VideoCreativeAsset>;
}) {
  const row = await loadCampaignPlanRow(params.supabase, params.userId, params.campaignId);
  const savedDocument = getSavedCampaignDocumentFromRow(row) ?? {};
  const existingVideoAds = Array.isArray(savedDocument.videoAds)
    ? (savedDocument.videoAds as VideoCreativeAsset[])
    : [];
  const nextVideoAds = existingVideoAds.map((video) =>
    video.providerAssetId === params.providerAssetId
      ? {
          ...video,
          ...(params.videoPatch ?? {}),
          videoUrl: params.videoUrl ?? undefined,
          videoGenerationState: params.status,
          videoGenerationMessage: params.message,
        }
      : video,
  );

  try {
    await persistCampaignPlanDocumentUpdate({
      supabase: params.supabase,
      campaignId: params.campaignId,
      userId: params.userId,
      plan: {
        ...(savedDocument as Record<string, unknown>),
        videoAds: nextVideoAds,
      } as Json,
      source: "campaign_video_generation_state_save",
      existingRow: row,
    });
  } catch (error) {
    throw new ApiError(
      500,
      error instanceof Error ? error.message : "Campaign video ads could not be saved.",
      "campaign_video_ads_save_failed",
    );
  }
}

async function persistVideoFailure(params: {
  supabase: VideoPersistenceClient;
  userId: string;
  campaignId: string;
  assetId: string;
  providerAssetId: string;
  insertedAssetMetadata: CreativeAsset["metadata"];
  code: string;
  message: string;
  raw?: Record<string, unknown> | null;
}) {
  const nextMetadata = {
    ...(typeof params.insertedAssetMetadata === "object" && params.insertedAssetMetadata
      ? (params.insertedAssetMetadata as Record<string, unknown>)
      : {}),
    providerStatus: "failed",
    providerError: params.message,
    providerErrorCode: params.code,
    providerRaw: params.raw ?? null,
  } satisfies Record<string, unknown>;

  await params.supabase
    .from("creative_assets")
    .update({
      status: "failed",
      metadata: nextMetadata as Json,
    } as never)
    .eq("id", params.assetId)
    .eq("user_id", params.userId);

  await persistVideoStateToCampaignPlan({
    supabase: params.supabase,
    userId: params.userId,
    campaignId: params.campaignId,
    providerAssetId: params.providerAssetId,
    status: "failed",
    videoUrl: null,
    message: params.message,
  });
}

async function queueVideoStatusPollJob(params: {
  supabase: VideoPersistenceClient;
  organizationId: string | null;
  userId: string;
  campaignId: string;
  assetId: string;
  providerAssetId: string;
  providerUsageEventId: string | null | undefined;
  providerName?: string | null;
}) {
  const idempotencyKey = `video_generation_status:${params.providerAssetId}`;
  const { error } = await params.supabase.from("system_jobs").insert({
    organization_id: params.organizationId ?? params.userId,
    user_id: params.userId,
    campaign_id: params.campaignId,
    kind: "video_generation_status",
    status: "pending",
    payload: {
      assetId: params.assetId,
      providerAssetId: params.providerAssetId,
      providerUsageEventId: params.providerUsageEventId ?? null,
      providerName: params.providerName ?? null,
      pollAttempt: 0,
    } satisfies VideoGenerationStatusJobPayload,
    idempotency_key: idempotencyKey,
    max_attempts: VIDEO_STATUS_POLL_MAX_ATTEMPTS,
    next_run_at: new Date(Date.now() + 60_000).toISOString(),
  } as never);

  const errorCode =
    error && typeof error === "object" && "code" in error ? String(error.code) : null;

  if (error && errorCode !== "23505") {
    throw new ApiError(
      500,
      error.message ?? "Video status poll job could not be queued.",
      "video_status_job_create_failed",
    );
  }
}

async function loadCreativeAssetForVideoStatus(params: {
  supabase: VideoPersistenceClient;
  userId: string;
  assetId: string;
}) {
  const { data, error } = await params.supabase
    .from("creative_assets")
    .select("*")
    .eq("id", params.assetId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "creative_asset_lookup_failed");
  }

  if (!data) {
    throw new ApiError(404, "Video asset was not found.", "creative_asset_not_found");
  }

  return data as CreativeAsset;
}

export async function runVideoGenerationJob(params: {
  supabase: VideoPersistenceClient;
  userId: string;
  campaignId: string;
  payload: VideoGenerationJobPayload;
  providerUsageRunId?: string | null;
}) {
  const row = await loadCampaignPlanRow(params.supabase, params.userId, params.campaignId);
  const savedDocument = getSavedCampaignDocumentFromRow(row) ?? {};
  const creativeIntake = resolveDurableVideoCreativeIntake(savedDocument, params.payload.creativeIntake);
  const existingVideoAds = Array.isArray(savedDocument.videoAds)
    ? (savedDocument.videoAds as VideoCreativeAsset[])
    : [];
  const existingVideo = existingVideoAds[params.payload.creativeIndex] ?? null;

  if (
    params.payload.force !== true &&
    existingVideo &&
    (existingVideo.videoGenerationState === "generated" ||
      existingVideo.videoGenerationState === "generating")
  ) {
    return {
      assetId: null,
      providerAssetId: existingVideo.providerAssetId ?? null,
      status:
        existingVideo.videoGenerationState === "generated" ? "completed" : "processing",
      video: {
        url: existingVideo.videoUrl || "",
        hook: existingVideo.hook,
        script: existingVideo.script,
        scenes: existingVideo.shotList,
      },
    };
  }

  const avatarProvider = getAvatarVideoProvider();
  const defaultState = createDefaultVideoState(params.payload);
  const videoSourceImage = await getVideoSourceImageUrl({
    supabase: params.supabase,
    userId: params.userId,
    campaignId: params.campaignId,
    savedDocument,
    selectedIndex: params.payload.creativeIndex,
  });

  if (!avatarProvider.isConfigured()) {
    const unavailableState: VideoCreativeAsset = {
      ...(existingVideo ?? defaultState),
      hook: params.payload.hook,
      script: params.payload.scriptLines,
      shotList: params.payload.scenes.map((scene) => scene.text),
      videoUrl: undefined,
      videoGenerationState: "unavailable",
      videoGenerationMessage: "AI video generation is not configured yet.",
      providerAssetId: null,
    };

    await persistVideoAdsToCampaignPlan({
      supabase: params.supabase,
      userId: params.userId,
      campaignId: params.campaignId,
      videoAds: mergeVideoAdState(
        existingVideoAds,
        unavailableState,
        params.payload.creativeIndex,
      ),
    });

    const { data: insertedAssetRaw, error } = await params.supabase
      .from("creative_assets")
      .insert({
        user_id: params.userId,
        campaign_id: params.campaignId,
        creative_id: params.payload.creativeId,
        copy_id: params.payload.copyId,
        asset_type:
          params.payload.creativeFormat === "ugc" ? "ugc_video" : "talking_head_video",
        format: "9:16",
        generation_method: "blueprint_only",
        status: "requires_review",
        provider_name: avatarProvider.name,
        provider_asset_id: null,
        file_url: null,
        thumbnail_url: null,
        metadata: {
          hook: params.payload.hook,
          body: params.payload.body,
          cta: params.payload.cta,
          scriptText: params.payload.scriptText,
          scenes: params.payload.scenes,
          avatarId: params.payload.avatarProfileId,
          voiceId: params.payload.voiceProfile,
          unavailableReason: "AI video generation is not configured yet.",
          ...buildCreativeIntakeAssetMetadata(creativeIntake),
        } as Json,
      } as never)
      .select("*")
      .single();
    const insertedAsset = insertedAssetRaw as CreativeAsset | null;

    if (error || !insertedAsset) {
      const schemaMessage = getCreativeAssetsSchemaCompatibilityMessage(
        error,
        "store the generated video blueprint",
      );

      if (schemaMessage) {
        throw new ApiError(500, schemaMessage, "creative_assets_schema_incompatible");
      }

      throw new ApiError(
        500,
        error?.message ?? "Video blueprint could not be created.",
        "creative_asset_create_failed",
      );
    }

    return {
      assetId: insertedAsset.id,
      providerAssetId: null,
      status: "requires_review",
      video: {
        url: "",
        hook: params.payload.hook,
        script: params.payload.scriptLines,
        scenes: params.payload.scenes.map((scene) => scene.text),
      },
    };
  }

  if (!videoSourceImage) {
    const unavailableState: VideoCreativeAsset = {
      ...(existingVideo ?? defaultState),
      hook: params.payload.hook,
      script: params.payload.scriptLines,
      shotList: params.payload.scenes.map((scene) => scene.text),
      videoUrl: undefined,
      videoGenerationState: "unavailable",
      videoGenerationMessage: "Render a ready static creative first, then retry the UGC video preview.",
      providerAssetId: null,
    };

    await persistVideoAdsToCampaignPlan({
      supabase: params.supabase,
      userId: params.userId,
      campaignId: params.campaignId,
      videoAds: mergeVideoAdState(
        existingVideoAds,
        unavailableState,
        params.payload.creativeIndex,
      ),
    });

    return {
      assetId: null,
      providerAssetId: null,
      status: "requires_static_source",
      video: {
        url: "",
        hook: params.payload.hook,
        script: params.payload.scriptLines,
        scenes: params.payload.scenes.map((scene) => scene.text),
      },
    };
  }

  const budgetReservation = await consumeSessionCostBudget({
    bucket: "video_generation",
    userId: params.userId,
    organizationId: row.organization_id,
    campaignId: params.campaignId,
    idempotencyKey: `video_generation:${avatarProvider.name}:${row.organization_id ?? "org"}:${params.userId}:${params.campaignId}:${params.payload.creativeIndex}:${params.providerUsageRunId ?? "default"}`,
  });

  const approvedPrompt = creativeIntake?.promptVersion.generatedPrompt ?? null;
  const fallbackPrompt = [
    "Create a polished native UGC-style vertical video for a real estate lead generation campaign.",
    "Target duration is 15-30 seconds. Do not render a 5-second sample, teaser, or generic placeholder clip.",
    "Structure: hook in the first 1-2 seconds, specific buyer pain or market problem, relatable creator/agent POV, clear mechanism, source-creative visual relevance, and a direct CTA.",
    "Show a believable creator/customer/agent in a real home or market setting with natural phone-camera energy, not a generic stock talking-head clip.",
    "Mechanism should explain how the buyer gets better options, a shortlist, qualification help, or early access before public search feels crowded.",
    "Use the accepted static source image as visual context and keep the setting aligned with the campaign market, offer, audience, and CTA.",
    "Do not use fake documents, fake UI, fake testimonials, unsupported guarantees, readable pricing cards, logos, watermarks, or on-screen text inside the video.",
    "Use the provided script as spoken direction only.",
    params.payload.title,
    params.payload.hook,
    params.payload.body,
    params.payload.cta,
    params.payload.scriptText,
  ].filter(Boolean).join("\n");
  const promptUsed = approvedPrompt ?? fallbackPrompt;
  const promptSource = approvedPrompt ? "creative_intake" : "campaign_specific_fallback";
  const promptHash = sha256(promptUsed);
  const scriptHash = sha256(params.payload.scriptText);
  const videoProductQualityGate = buildVideoProductQualityGate({
    promptUsed,
    scriptText: params.payload.scriptText,
    body: params.payload.body,
    cta: params.payload.cta,
    sourceStaticAccepted: videoSourceImage.accepted,
    targetDurationSeconds: params.payload.targetDurationSeconds ?? 15,
  });
  let providerVideo;

  try {
    providerVideo = avatarProvider.parseResult(await avatarProvider.execute({
      script: params.payload.scriptText,
      prompt: promptUsed,
      title: params.payload.title,
      aspectRatio: "9:16",
      avatarId: params.payload.avatarProfileId ?? undefined,
      voiceProfile: params.payload.voiceProfile ?? undefined,
      metadata: {
        scenes: params.payload.scenes,
        audience: params.payload.audience,
        location: params.payload.location,
        sourceStaticAssetId: videoSourceImage.staticAssetId,
      },
      inputImageUrl: videoSourceImage.imageUrl,
    }));

    if (!providerVideo.ok || !providerVideo.providerAssetId) {
      await markSessionCostBudgetEvent({
        eventId: budgetReservation.eventId,
        status: "released",
        metadata: {
          operation: "video_generation",
          provider: avatarProvider.name,
          reason: providerVideo.error ?? "AI video generation could not start.",
          providerJobCreated: false,
        },
      }).catch(() => null);

      const failedState: VideoCreativeAsset = {
        ...(existingVideo ?? defaultState),
        hook: params.payload.hook,
        script: params.payload.scriptLines,
        shotList: params.payload.scenes.map((scene) => scene.text),
        videoUrl: undefined,
        videoGenerationState: "failed",
        videoGenerationMessage: SAFE_VIDEO_FAILURE_MESSAGE,
        providerAssetId: null,
      };

      await persistVideoAdsToCampaignPlan({
        supabase: params.supabase,
        userId: params.userId,
        campaignId: params.campaignId,
        videoAds: mergeVideoAdState(existingVideoAds, failedState, params.payload.creativeIndex),
      });

      return {
        assetId: null,
        providerAssetId: null,
        providerUsageEventId: budgetReservation.eventId,
        status: "failed",
        failureMode: "provider_start_failed",
        video: {
          url: "",
          hook: params.payload.hook,
          script: params.payload.scriptLines,
          scenes: params.payload.scenes.map((scene) => scene.text),
        },
      };
    }
  } catch (error) {
    await markSessionCostBudgetEvent({
      eventId: budgetReservation.eventId,
      status: "released",
      metadata: {
        operation: "video_generation",
        provider: avatarProvider.name,
        reason: error instanceof Error ? error.message : "Video generation failed to start.",
        providerJobCreated: false,
      },
    }).catch(() => null);

    const failedState: VideoCreativeAsset = {
      ...(existingVideo ?? defaultState),
      hook: params.payload.hook,
      script: params.payload.scriptLines,
      shotList: params.payload.scenes.map((scene) => scene.text),
      videoUrl: undefined,
      videoGenerationState: "failed",
      videoGenerationMessage: SAFE_VIDEO_FAILURE_MESSAGE,
      providerAssetId: null,
    };

    await persistVideoAdsToCampaignPlan({
      supabase: params.supabase,
      userId: params.userId,
      campaignId: params.campaignId,
      videoAds: mergeVideoAdState(existingVideoAds, failedState, params.payload.creativeIndex),
    });

    return {
      assetId: null,
      providerAssetId: null,
      providerUsageEventId: budgetReservation.eventId,
      status: "failed",
      failureMode: toVideoProviderApiError(error, "start").code,
      video: {
        url: "",
        hook: params.payload.hook,
        script: params.payload.scriptLines,
        scenes: params.payload.scenes.map((scene) => scene.text),
      },
    };
  }

  let durableVideo:
    | Awaited<ReturnType<typeof normalizeGeneratedVideoProviderFile>>
    | null = null;

  if (providerVideo.fileUrl) {
    try {
      durableVideo = await normalizeGeneratedVideoProviderFile({
        supabase: params.supabase,
        userId: params.userId,
        campaignId: params.campaignId,
        creativeId: params.payload.creativeId ?? `video-${params.payload.creativeIndex}`,
        generationBatchId: providerVideo.providerAssetId,
        providerUrl: providerVideo.fileUrl,
      });
    } catch (error) {
      await markSessionCostBudgetEvent({
        eventId: budgetReservation.eventId,
        status: "released",
        metadata: {
          operation: "video_generation",
          provider: avatarProvider.name,
          providerAssetId: providerVideo.providerAssetId,
          reason: error instanceof Error ? error.message : "Generated video could not be stored durably.",
        },
      }).catch(() => null);

      const failedState: VideoCreativeAsset = {
        ...(existingVideo ?? defaultState),
        hook: params.payload.hook,
        script: params.payload.scriptLines,
        shotList: params.payload.scenes.map((scene) => scene.text),
        videoUrl: undefined,
        videoGenerationState: "failed",
        videoGenerationMessage: SAFE_VIDEO_FAILURE_MESSAGE,
        providerAssetId: providerVideo.providerAssetId,
      };

      await persistVideoAdsToCampaignPlan({
        supabase: params.supabase,
        userId: params.userId,
        campaignId: params.campaignId,
        videoAds: mergeVideoAdState(existingVideoAds, failedState, params.payload.creativeIndex),
      });

      return {
        assetId: null,
        providerAssetId: providerVideo.providerAssetId,
        providerUsageEventId: budgetReservation.eventId,
        status: "failed",
        failureMode: "video_storage_normalization_failed",
        video: {
          url: "",
          hook: params.payload.hook,
          script: params.payload.scriptLines,
          scenes: params.payload.scenes.map((scene) => scene.text),
        },
      };
    }
  }

  const durableVideoUrl = durableVideo?.durableUrl ?? providerVideo.fileUrl ?? null;
  const campaignSpecificContext = {
    campaignId: params.campaignId,
    creativeId: params.payload.creativeId,
    copyId: params.payload.copyId,
    audience: params.payload.audience,
    location: params.payload.location,
    offer: params.payload.body,
    cta: params.payload.cta,
    persona: params.payload.avatarProfileId ?? "provider_default_avatar",
  };
  const videoQualityGate = durableVideoUrl
    ? evaluateGeneratedVideoQualityGate({
        id: params.payload.creativeId ?? `video-${params.payload.creativeIndex}`,
        videoUrl: durableVideoUrl,
        videoGenerationState: "generated",
        providerName: avatarProvider.name,
        providerAssetId: providerVideo.providerAssetId,
        providerStatus: providerVideo.status,
        storageNormalized: true,
        storageBucket: durableVideo?.storageBucket ?? null,
        storagePath: durableVideo?.storagePath ?? null,
        storageContentType: durableVideo?.contentType ?? null,
        storageByteSize: durableVideo?.byteSize ?? null,
        durationSeconds: durableVideo?.durationSeconds ?? null,
        targetDurationSeconds: params.payload.targetDurationSeconds ?? 15,
        sourceStaticAssetId: videoSourceImage.staticAssetId,
        sourceImageUrl: videoSourceImage.imageUrl,
        sourceStaticAccepted: videoSourceImage.accepted,
        promptUsed,
        promptSource,
        promptHash,
        scriptHash,
        campaignSpecificContext,
        videoProductQualityGate,
      })
    : null;

  const { data: insertedAssetRaw, error } = await params.supabase
    .from("creative_assets")
    .insert({
      user_id: params.userId,
      campaign_id: params.campaignId,
      creative_id: params.payload.creativeId,
      copy_id: params.payload.copyId,
      asset_type: params.payload.creativeFormat === "ugc" ? "ugc_video" : "talking_head_video",
      format: "9:16",
      generation_method: "avatar_provider",
      status: durableVideoUrl ? "ready" : "generating",
      provider_name: avatarProvider.name,
      provider_asset_id: providerVideo.providerAssetId,
      file_url: durableVideoUrl,
      thumbnail_url: providerVideo.thumbnailUrl ?? null,
      metadata: {
        hook: params.payload.hook,
        body: params.payload.body,
        cta: params.payload.cta,
        scriptText: params.payload.scriptText,
        scenes: params.payload.scenes,
        provider: avatarProvider.name,
        providerStatus: providerVideo.status,
        providerMetadata: providerVideo.metadata ?? null,
        provider_original_url: providerVideo.fileUrl ?? null,
        sourceStaticAssetId: videoSourceImage.staticAssetId,
        sourceImageUrl: videoSourceImage.imageUrl,
        sourceStaticAccepted: videoSourceImage.accepted,
        promptUsed,
        promptSource,
        promptHash,
        scriptHash,
        audience: params.payload.audience,
        location: params.payload.location,
        offer: params.payload.body,
        persona: params.payload.avatarProfileId ?? "provider_default_avatar",
        campaignSpecificContext,
        videoQualityGate,
        videoProductQualityGate,
        storageNormalized: Boolean(durableVideoUrl),
        storageBucket: durableVideo?.storageBucket ?? null,
        storagePath: durableVideo?.storagePath ?? null,
        storageContentType: durableVideo?.contentType ?? null,
        storageByteSize: durableVideo?.byteSize ?? null,
        durationSeconds: durableVideo?.durationSeconds ?? null,
        targetDurationSeconds: params.payload.targetDurationSeconds ?? 15,
        qualityGateStatus: durableVideoUrl ? "candidate_ready" : "processing",
        ...buildCreativeIntakeAssetMetadata(creativeIntake),
      } as Json,
    } as never)
    .select("*")
    .single();
  const insertedAsset = insertedAssetRaw as CreativeAsset | null;

  if (error || !insertedAsset) {
    const schemaMessage = getCreativeAssetsSchemaCompatibilityMessage(
      error,
      "store the generated video job",
    );

    if (schemaMessage) {
      await markSessionCostBudgetEvent({
        eventId: budgetReservation.eventId,
        status: "failed",
        metadata: {
          operation: "video_generation",
          provider: avatarProvider.name,
          providerAssetId: providerVideo.providerAssetId,
          reason: schemaMessage,
        },
      }).catch(() => null);
      throw new ApiError(500, schemaMessage, "creative_assets_schema_incompatible");
    }

    await markSessionCostBudgetEvent({
      eventId: budgetReservation.eventId,
      status: "failed",
      metadata: {
        operation: "video_generation",
        provider: avatarProvider.name,
        providerAssetId: providerVideo.providerAssetId,
        reason: error?.message ?? "Video asset could not be created.",
      },
    }).catch(() => null);
    throw new ApiError(
      500,
      error?.message ?? "Video asset could not be created.",
      "creative_asset_create_failed",
    );
  }

  const queuedVideoState: VideoCreativeAsset = {
    ...(existingVideo ?? defaultState),
    hook: params.payload.hook,
    script: params.payload.scriptLines,
    shotList: params.payload.scenes.map((scene) => scene.text),
    videoUrl: durableVideoUrl ?? undefined,
    videoGenerationState: durableVideoUrl ? "generated" : "generating",
    videoGenerationMessage:
      durableVideoUrl
        ? null
        : "Generating video. This can take a minute while the render job completes.",
    providerName: avatarProvider.name,
    providerAssetId: providerVideo.providerAssetId,
    providerStatus: providerVideo.status,
    storageNormalized: Boolean(durableVideoUrl),
    storageBucket: durableVideo?.storageBucket ?? null,
    storagePath: durableVideo?.storagePath ?? null,
    storageContentType: durableVideo?.contentType ?? null,
    storageByteSize: durableVideo?.byteSize ?? null,
    durationSeconds: durableVideo?.durationSeconds ?? null,
    targetDurationSeconds: params.payload.targetDurationSeconds ?? 15,
    sourceStaticAssetId: videoSourceImage.staticAssetId,
    sourceImageUrl: videoSourceImage.imageUrl,
    sourceStaticAccepted: videoSourceImage.accepted,
    promptUsed,
    promptSource,
    promptHash,
    scriptHash,
    campaignSpecificContext,
    videoQualityGate,
    videoProductQualityGate,
  };

  await persistVideoAdsToCampaignPlan({
    supabase: params.supabase,
    userId: params.userId,
    campaignId: params.campaignId,
    videoAds: mergeVideoAdState(existingVideoAds, queuedVideoState, params.payload.creativeIndex),
  });

  if (durableVideoUrl) {
    await markSessionCostBudgetEvent({
      eventId: budgetReservation.eventId,
      status: "consumed",
      metadata: {
        operation: "video_generation",
        provider: avatarProvider.name,
        providerAssetId: providerVideo.providerAssetId,
      },
    });
  } else {
    await queueVideoStatusPollJob({
      supabase: params.supabase,
      organizationId: row.organization_id,
      userId: params.userId,
      campaignId: params.campaignId,
      assetId: insertedAsset.id,
      providerAssetId: providerVideo.providerAssetId,
      providerUsageEventId: budgetReservation.eventId,
      providerName: avatarProvider.name,
    });
  }

  return {
    assetId: insertedAsset.id,
    providerAssetId: providerVideo.providerAssetId,
    status: durableVideoUrl ? "completed" : "processing",
    asset: insertedAsset,
    video: {
      url: durableVideoUrl ?? "",
      hook: params.payload.hook,
      script: params.payload.scriptLines,
      scenes: params.payload.scenes.map((scene) => scene.text),
    },
  };
}

export async function pollVideoGenerationStatusJob(params: {
  supabase: VideoPersistenceClient;
  userId: string;
  campaignId: string;
  payload: VideoGenerationStatusJobPayload;
}) {
  const asset = await loadCreativeAssetForVideoStatus({
    supabase: params.supabase,
    userId: params.userId,
    assetId: params.payload.assetId,
  });

  let finalStatus: {
    status: "pending" | "waiting" | "processing" | "completed" | "failed" | "unknown";
    videoUrl: string | null;
    thumbnailUrl: string | null;
    error: string | null;
    raw: Record<string, unknown> | null;
  };

  try {
    if ((asset.provider_name ?? params.payload.providerName) === "higgsfield") {
      const status = await retryRouteStep(
        () => getHiggsfieldGenerationStatus(params.payload.providerAssetId),
        {
          retries: 2,
          delayMs: 1_000,
        },
      );
      finalStatus = {
        status:
          status.status === "completed"
            ? "completed"
            : status.status === "failed" || status.status === "nsfw"
              ? "failed"
              : status.status === "queued" || status.status === "in_progress"
                ? "processing"
                : "unknown",
        videoUrl: status.fileUrl,
        thumbnailUrl: status.thumbnailUrl,
        error:
          status.status === "nsfw"
            ? "Video generation was rejected by provider safety checks."
            : null,
        raw: {
          provider: "higgsfield",
          requestId: status.requestId,
          providerStatus: status.status,
        },
      };
    } else {
      finalStatus = await retryRouteStep(
        () => getHeyGenVideoStatus(params.payload.providerAssetId),
        {
          retries: 2,
          delayMs: 1_000,
        },
      );
    }
  } catch (error) {
    const pollAttempt = params.payload.pollAttempt ?? 0;

    if (pollAttempt < 8) {
      return {
        assetId: asset.id,
        providerAssetId: params.payload.providerAssetId,
        status: "processing",
        providerStatus: "status_unavailable",
        videoUrl: null,
      };
    }

    const failure = toVideoProviderApiError(error, "check");

    await persistVideoFailure({
      supabase: params.supabase,
      userId: params.userId,
      campaignId: params.campaignId,
      assetId: asset.id,
      providerAssetId: params.payload.providerAssetId,
      insertedAssetMetadata: asset.metadata,
      code: failure.code,
      message: SAFE_VIDEO_FAILURE_MESSAGE,
      raw: {
        provider: asset.provider_name ?? params.payload.providerName ?? "unknown",
        providerStatus: "status_unavailable",
      },
    });

    await markSessionCostBudgetEvent({
      eventId: params.payload.providerUsageEventId,
      status: "released",
      metadata: {
        operation: "video_generation",
        provider: asset.provider_name ?? params.payload.providerName ?? "unknown",
        providerAssetId: params.payload.providerAssetId,
        reason: failure.code,
      },
    }).catch(() => null);

    return {
      assetId: asset.id,
      providerAssetId: params.payload.providerAssetId,
      status: "failed",
      providerStatus: "status_unavailable",
      videoUrl: null,
    };
  }

  if (
    finalStatus.status === "pending" ||
    finalStatus.status === "waiting" ||
    finalStatus.status === "processing" ||
    finalStatus.status === "unknown"
  ) {
    return {
      assetId: asset.id,
      providerAssetId: params.payload.providerAssetId,
      status: "processing",
      providerStatus: finalStatus.status,
      videoUrl: null,
    };
  }

  if (finalStatus.status === "failed") {
    const failureMessage = finalStatus.error ?? SAFE_VIDEO_FAILURE_MESSAGE;

    await persistVideoFailure({
      supabase: params.supabase,
      userId: params.userId,
      campaignId: params.campaignId,
      assetId: asset.id,
      providerAssetId: params.payload.providerAssetId,
      insertedAssetMetadata: asset.metadata,
      code: "video_generation_failed",
      message: SAFE_VIDEO_FAILURE_MESSAGE,
      raw: finalStatus.raw,
    });

    await markSessionCostBudgetEvent({
      eventId: params.payload.providerUsageEventId,
      status: "released",
      metadata: {
        operation: "video_generation",
        provider: asset.provider_name ?? params.payload.providerName ?? "unknown",
        providerAssetId: params.payload.providerAssetId,
        reason: failureMessage,
      },
    }).catch(() => null);

    return {
      assetId: asset.id,
      providerAssetId: params.payload.providerAssetId,
      status: "failed",
      providerStatus: finalStatus.status,
      videoUrl: null,
    };
  }

  if (!finalStatus.videoUrl) {
    await persistVideoFailure({
      supabase: params.supabase,
      userId: params.userId,
      campaignId: params.campaignId,
      assetId: asset.id,
      providerAssetId: params.payload.providerAssetId,
      insertedAssetMetadata: asset.metadata,
      code: "video_generation_missing_url",
      message: SAFE_VIDEO_FAILURE_MESSAGE,
      raw: finalStatus.raw,
    });

    await markSessionCostBudgetEvent({
      eventId: params.payload.providerUsageEventId,
      status: "released",
      metadata: {
        operation: "video_generation",
        provider: asset.provider_name ?? params.payload.providerName ?? "unknown",
        providerAssetId: params.payload.providerAssetId,
        reason: "video_generation_missing_url",
      },
    }).catch(() => null);

    return {
      assetId: asset.id,
      providerAssetId: params.payload.providerAssetId,
      status: "failed",
      providerStatus: finalStatus.status,
      videoUrl: null,
    };
  }

  let durableVideo: Awaited<ReturnType<typeof normalizeGeneratedVideoProviderFile>>;

  try {
    durableVideo = await normalizeGeneratedVideoProviderFile({
      supabase: params.supabase,
      userId: params.userId,
      campaignId: params.campaignId,
      creativeId: asset.creative_id ?? asset.id,
      generationBatchId: params.payload.providerAssetId,
      providerUrl: finalStatus.videoUrl,
    });
  } catch (error) {
    await persistVideoFailure({
      supabase: params.supabase,
      userId: params.userId,
      campaignId: params.campaignId,
      assetId: asset.id,
      providerAssetId: params.payload.providerAssetId,
      insertedAssetMetadata: asset.metadata,
      code: "video_storage_normalization_failed",
      message: SAFE_VIDEO_FAILURE_MESSAGE,
      raw: finalStatus.raw,
    });

    await markSessionCostBudgetEvent({
      eventId: params.payload.providerUsageEventId,
      status: "released",
      metadata: {
        operation: "video_generation",
        provider: asset.provider_name ?? params.payload.providerName ?? "unknown",
        providerAssetId: params.payload.providerAssetId,
        reason: error instanceof Error ? error.message : "Generated video could not be stored durably.",
      },
    }).catch(() => null);

    return {
      assetId: asset.id,
      providerAssetId: params.payload.providerAssetId,
      status: "failed",
      providerStatus: finalStatus.status,
      videoUrl: null,
    };
  }

  const existingMetadata = asRecord(asset.metadata) ?? {};
  const existingVideoProductQualityGate =
    existingMetadata.videoProductQualityGate &&
    typeof existingMetadata.videoProductQualityGate === "object" &&
    !Array.isArray(existingMetadata.videoProductQualityGate)
      ? existingMetadata.videoProductQualityGate as VideoCreativeAsset["videoProductQualityGate"]
      : null;
  const nextVideoQualityGate = evaluateGeneratedVideoQualityGate({
    id: asset.creative_id ?? asset.id,
    videoUrl: durableVideo.durableUrl,
    videoGenerationState: "generated",
    providerName: asset.provider_name ?? params.payload.providerName ?? null,
    providerAssetId: params.payload.providerAssetId,
    providerStatus: finalStatus.status,
    storageNormalized: true,
    storageBucket: durableVideo.storageBucket,
    storagePath: durableVideo.storagePath,
    storageContentType: durableVideo.contentType,
    storageByteSize: durableVideo.byteSize,
    durationSeconds: durableVideo.durationSeconds ?? null,
    sourceStaticAssetId:
      typeof existingMetadata.sourceStaticAssetId === "string"
        ? existingMetadata.sourceStaticAssetId
        : null,
    sourceImageUrl:
      typeof existingMetadata.sourceImageUrl === "string"
        ? existingMetadata.sourceImageUrl
        : null,
    sourceStaticAccepted: existingMetadata.sourceStaticAccepted === true,
    promptUsed:
      typeof existingMetadata.promptUsed === "string"
        ? existingMetadata.promptUsed
        : null,
    promptSource:
      typeof existingMetadata.promptSource === "string"
        ? existingMetadata.promptSource
        : null,
    promptHash:
      typeof existingMetadata.promptHash === "string"
        ? existingMetadata.promptHash
        : null,
    scriptHash:
      typeof existingMetadata.scriptHash === "string"
        ? existingMetadata.scriptHash
        : null,
    campaignSpecificContext:
      existingMetadata.campaignSpecificContext &&
      typeof existingMetadata.campaignSpecificContext === "object"
        ? existingMetadata.campaignSpecificContext as VideoCreativeAsset["campaignSpecificContext"]
        : null,
    videoProductQualityGate: existingVideoProductQualityGate,
  });
  const nextMetadata = {
    ...existingMetadata,
    providerStatus: finalStatus.status,
    providerRaw: finalStatus.raw,
    provider_original_url: finalStatus.videoUrl,
    storageNormalized: true,
    storageBucket: durableVideo.storageBucket,
    storagePath: durableVideo.storagePath,
    storageContentType: durableVideo.contentType,
    storageByteSize: durableVideo.byteSize,
    durationSeconds: durableVideo.durationSeconds ?? null,
    qualityGateStatus: "candidate_ready",
    videoQualityGate: nextVideoQualityGate,
    providerError: null,
    providerErrorCode: null,
  } satisfies Record<string, unknown>;

  const { data: updatedAssetRaw, error: updateError } = await params.supabase
    .from("creative_assets")
    .update({
      status: "ready",
      file_url: durableVideo.durableUrl,
      thumbnail_url: finalStatus.thumbnailUrl,
      metadata: nextMetadata as Json,
    } as never)
    .eq("id", asset.id)
    .eq("user_id", params.userId)
    .select("*")
    .single();

  if (updateError || !updatedAssetRaw) {
    throw new ApiError(
      500,
      updateError?.message ?? "Completed video asset could not be updated.",
      "creative_asset_update_failed",
    );
  }

  await persistVideoStateToCampaignPlan({
    supabase: params.supabase,
    userId: params.userId,
    campaignId: params.campaignId,
    providerAssetId: params.payload.providerAssetId,
    status: "generated",
    videoUrl: durableVideo.durableUrl,
    message: null,
    videoPatch: {
      providerName: asset.provider_name ?? params.payload.providerName ?? null,
      providerAssetId: params.payload.providerAssetId,
      providerStatus: finalStatus.status,
      storageNormalized: true,
      storageBucket: durableVideo.storageBucket,
      storagePath: durableVideo.storagePath,
      storageContentType: durableVideo.contentType,
      storageByteSize: durableVideo.byteSize,
      durationSeconds: durableVideo.durationSeconds ?? null,
      sourceStaticAssetId:
        typeof existingMetadata.sourceStaticAssetId === "string"
          ? existingMetadata.sourceStaticAssetId
          : null,
      sourceImageUrl:
        typeof existingMetadata.sourceImageUrl === "string"
          ? existingMetadata.sourceImageUrl
          : null,
      sourceStaticAccepted: existingMetadata.sourceStaticAccepted === true,
      promptUsed:
        typeof existingMetadata.promptUsed === "string"
          ? existingMetadata.promptUsed
          : null,
      promptSource:
        typeof existingMetadata.promptSource === "string"
          ? existingMetadata.promptSource
          : null,
      promptHash:
        typeof existingMetadata.promptHash === "string"
          ? existingMetadata.promptHash
          : null,
      scriptHash:
        typeof existingMetadata.scriptHash === "string"
          ? existingMetadata.scriptHash
          : null,
      campaignSpecificContext:
        existingMetadata.campaignSpecificContext &&
        typeof existingMetadata.campaignSpecificContext === "object"
          ? existingMetadata.campaignSpecificContext as VideoCreativeAsset["campaignSpecificContext"]
          : null,
      videoQualityGate: nextVideoQualityGate,
      videoProductQualityGate: existingVideoProductQualityGate,
    },
  });

  await markSessionCostBudgetEvent({
    eventId: params.payload.providerUsageEventId,
    status: "consumed",
    metadata: {
      operation: "video_generation",
      provider: asset.provider_name ?? params.payload.providerName ?? "unknown",
      providerAssetId: params.payload.providerAssetId,
    },
  });

  return {
    assetId: asset.id,
    providerAssetId: params.payload.providerAssetId,
    status: "completed",
    asset: updatedAssetRaw as CreativeAsset,
    videoUrl: durableVideo.durableUrl,
  };
}
