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

function getVideoSourceImageUrl(savedDocument: unknown, selectedIndex: number) {
  const record = savedDocument && typeof savedDocument === "object"
    ? (savedDocument as Record<string, unknown>)
    : {};
  const staticAds = Array.isArray(record.staticAds)
    ? (record.staticAds as StaticCreativeAsset[])
    : [];
  const candidates = [
    staticAds[selectedIndex],
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
  const videoSourceImage = getVideoSourceImageUrl(savedDocument, params.payload.creativeIndex);

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

  let providerVideo;

  try {
    const approvedPrompt = creativeIntake?.promptVersion.generatedPrompt ?? null;
    providerVideo = avatarProvider.parseResult(await avatarProvider.execute({
      script: params.payload.scriptText,
      prompt: approvedPrompt ?? [
        "Create a polished native UGC-style vertical video for a real estate lead generation campaign.",
        "Show a believable creator/customer/agent in a real home or market setting with natural phone-camera energy.",
        "Use the provided script as spoken direction only. Do not render captions, lower thirds, pricing cards, UI screens, logos, watermarks, fake documents, or on-screen text inside the video.",
        params.payload.title,
        params.payload.hook,
        params.payload.body,
        params.payload.cta,
        params.payload.scriptText,
      ].filter(Boolean).join("\n"),
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
        storageNormalized: Boolean(durableVideoUrl),
        storageBucket: durableVideo?.storageBucket ?? null,
        storagePath: durableVideo?.storagePath ?? null,
        storageContentType: durableVideo?.contentType ?? null,
        storageByteSize: durableVideo?.byteSize ?? null,
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
    providerAssetId: providerVideo.providerAssetId,
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

  const nextMetadata = {
    ...(typeof asset.metadata === "object" && asset.metadata
      ? (asset.metadata as Record<string, unknown>)
      : {}),
    providerStatus: finalStatus.status,
    providerRaw: finalStatus.raw,
    provider_original_url: finalStatus.videoUrl,
    storageNormalized: true,
    storageBucket: durableVideo.storageBucket,
    storagePath: durableVideo.storagePath,
    storageContentType: durableVideo.contentType,
    storageByteSize: durableVideo.byteSize,
    qualityGateStatus: "candidate_ready",
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
