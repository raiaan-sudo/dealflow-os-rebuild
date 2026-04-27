import { ApiError, retryRouteStep } from "@/lib/api/route";
import { createHeyGenVideo, getHeyGenVideoStatus } from "@/lib/ai/heygen";
import {
  getCreativeAssetsSchemaCompatibilityMessage,
  toVideoProviderApiError,
} from "@/lib/ai/video-generation-errors";
import { getAvatarVideoProvider } from "@/lib/integrations/creative/avatar-provider";
import { getSavedCampaignDocumentFromRow } from "@/lib/services/canonical-campaign";
import { persistCampaignPlanDocumentUpdate } from "@/lib/services/campaign-plan-persistence-service";
import type { VideoCreativeAsset } from "@/lib/services/creative-engine";
import type { Database, Json } from "@/lib/supabase/types";
import type { CreativeAsset } from "@/lib/types/creative-assets";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    heygenStatus: "failed",
    heygenError: params.message,
    heygenErrorCode: params.code,
    heygenRaw: params.raw ?? null,
  } satisfies Record<string, unknown>;

  await params.supabase
    .from("creative_assets")
    .update({
      status: "failed",
      metadata: nextMetadata as Json,
      error_message: params.message,
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

async function waitForHeyGenCompletion(videoId: string) {
  const maxAttempts = 120;
  const delayMs = 5_000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let status;

    try {
      status = await retryRouteStep(() => getHeyGenVideoStatus(videoId), {
        retries: 2,
        delayMs: 1_000,
      });
    } catch (error) {
      throw toVideoProviderApiError(error, "check");
    }

    if (status.status === "completed" || status.status === "failed") {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new ApiError(504, "Video generation timed out.", "video_generation_timeout");
}

export async function runVideoGenerationJob(params: {
  supabase: VideoPersistenceClient;
  userId: string;
  campaignId: string;
  payload: VideoGenerationJobPayload;
}) {
  const row = await loadCampaignPlanRow(params.supabase, params.userId, params.campaignId);
  const savedDocument = getSavedCampaignDocumentFromRow(row) ?? {};
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

  if (!avatarProvider.isConfigured()) {
    const unavailableState: VideoCreativeAsset = {
      ...(existingVideo ?? defaultState),
      hook: params.payload.hook,
      script: params.payload.scriptLines,
      shotList: params.payload.scenes.map((scene) => scene.text),
      videoUrl: undefined,
      videoGenerationState: "unavailable",
      videoGenerationMessage:
        "HeyGen is not configured. Add HEYGEN_API_KEY before generating videos.",
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
          unavailableReason:
            "HeyGen is not configured. Add HEYGEN_API_KEY before generating videos.",
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

  let heyGenVideo;

  try {
    heyGenVideo = await createHeyGenVideo({
      script: params.payload.scriptText,
      avatarId: params.payload.avatarProfileId ?? undefined,
      voiceId: params.payload.voiceProfile ?? undefined,
      title: params.payload.title,
      aspectRatio: "9:16",
      resolution: "720p",
    });
  } catch (error) {
    throw toVideoProviderApiError(error, "start");
  }

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
      status: "generating",
      provider_name: "heygen",
      provider_asset_id: heyGenVideo.videoId,
      file_url: null,
      thumbnail_url: null,
      metadata: {
        hook: params.payload.hook,
        body: params.payload.body,
        cta: params.payload.cta,
        scriptText: params.payload.scriptText,
        scenes: params.payload.scenes,
        avatarId: heyGenVideo.avatarId,
        voiceId: heyGenVideo.voiceId,
        heygenStatus: heyGenVideo.status,
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
      throw new ApiError(500, schemaMessage, "creative_assets_schema_incompatible");
    }

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
    videoUrl: undefined,
    videoGenerationState: "generating",
    videoGenerationMessage:
      "Generating video with HeyGen. This can take a minute while the render job completes.",
    providerAssetId: heyGenVideo.videoId,
  };

  await persistVideoAdsToCampaignPlan({
    supabase: params.supabase,
    userId: params.userId,
    campaignId: params.campaignId,
    videoAds: mergeVideoAdState(existingVideoAds, queuedVideoState, params.payload.creativeIndex),
  });

  let finalStatus;

  try {
    finalStatus = await waitForHeyGenCompletion(heyGenVideo.videoId);
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError(502, "Video generation failed.", "video_generation_failed");

    await persistVideoFailure({
      supabase: params.supabase,
      userId: params.userId,
      campaignId: params.campaignId,
      assetId: insertedAsset.id,
      providerAssetId: heyGenVideo.videoId,
      insertedAssetMetadata: insertedAsset.metadata,
      code: apiError.code,
      message: apiError.message,
    });

    throw apiError;
  }

  if (finalStatus.status === "failed") {
    const failureMessage = finalStatus.error ?? "Video generation failed.";

    await persistVideoFailure({
      supabase: params.supabase,
      userId: params.userId,
      campaignId: params.campaignId,
      assetId: insertedAsset.id,
      providerAssetId: heyGenVideo.videoId,
      insertedAssetMetadata: insertedAsset.metadata,
      code: "video_generation_failed",
      message: failureMessage,
      raw: finalStatus.raw,
    });

    throw new ApiError(
      502,
      failureMessage,
      "video_generation_failed",
    );
  }

  const nextMetadata = {
    ...(typeof insertedAsset.metadata === "object" && insertedAsset.metadata
      ? (insertedAsset.metadata as Record<string, unknown>)
      : {}),
    heygenStatus: finalStatus.status,
    heygenRaw: finalStatus.raw,
  } satisfies Record<string, unknown>;

  const { data: updatedAssetRaw, error: updateError } = await params.supabase
    .from("creative_assets")
    .update({
      status: "ready",
      file_url: finalStatus.videoUrl,
      thumbnail_url: finalStatus.thumbnailUrl,
      metadata: nextMetadata as Json,
    } as never)
    .eq("id", insertedAsset.id)
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
    providerAssetId: heyGenVideo.videoId,
    status: "generated",
    videoUrl: finalStatus.videoUrl,
    message: null,
  });

  return {
    assetId: insertedAsset.id,
    providerAssetId: heyGenVideo.videoId,
    status: "completed",
    asset: updatedAssetRaw as CreativeAsset,
    video: {
      url: finalStatus.videoUrl || "",
      hook: params.payload.hook,
      script: params.payload.scriptLines,
      scenes: params.payload.scenes.map((scene) => scene.text),
    },
  };
}
