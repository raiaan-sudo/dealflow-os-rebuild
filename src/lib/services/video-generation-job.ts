import { ApiError, retryRouteStep } from "@/lib/api/route";
import {
  createDurableVideoRender,
  getDurableVideoProvider,
  getDurableVideoProviderUnavailableReason,
  getDurableVideoProviderUsageOutcome,
  getDurableVideoRenderStatus,
  type DurableVideoProviderName,
} from "@/lib/ai/video-provider";
import {
  getCreativeAssetsSchemaCompatibilityMessage,
  toVideoProviderApiError,
} from "@/lib/ai/video-generation-errors";
import { getSavedCampaignDocumentFromRow } from "@/lib/services/canonical-campaign";
import { persistCampaignPlanDocumentUpdate } from "@/lib/services/campaign-plan-persistence-service";
import type { VideoCreativeAsset } from "@/lib/services/creative-engine";
import type { Database, Json } from "@/lib/supabase/types";
import type { CreativeAsset } from "@/lib/types/creative-assets";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  consumeSessionCostBudget,
  markSessionCostBudgetEvent,
} from "@/lib/services/session-cost-guard";

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
  inputImageUrl: string | null;
  force: boolean;
};

export type VideoGenerationStatusJobPayload = {
  assetId: string;
  providerAssetId: string;
  providerName?: DurableVideoProviderName;
  providerUsageEventId: string | null;
  providerUsageSettlementToken: string | null;
  providerUsageSettlementGeneration: number | null;
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
  organizationId: string,
  userId: string,
  campaignId: string,
) {
  const { data, error } = await supabase
    .from("campaign_plans")
    .select("*")
    .eq("id", campaignId)
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "Campaign not found.", "campaign_not_found");
  }

  return data as CampaignPlanRow;
}

async function persistVideoAdsToCampaignPlan(params: {
  supabase: VideoPersistenceClient;
  organizationId: string;
  userId: string;
  campaignId: string;
  videoAds: VideoCreativeAsset[];
}) {
  const row = await loadCampaignPlanRow(
    params.supabase,
    params.organizationId,
    params.userId,
    params.campaignId,
  );
  const savedDocument = getSavedCampaignDocumentFromRow(row) ?? {};
  const nextPlan = {
    ...(savedDocument as Record<string, unknown>),
    videoAds: params.videoAds,
  } as Json;

  try {
    await persistCampaignPlanDocumentUpdate({
      supabase: params.supabase,
      campaignId: params.campaignId,
      organizationId: params.organizationId,
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
  organizationId: string;
  userId: string;
  campaignId: string;
  providerAssetId: string;
  status: "generated" | "failed";
  videoUrl: string | null;
  message: string | null;
}) {
  const row = await loadCampaignPlanRow(
    params.supabase,
    params.organizationId,
    params.userId,
    params.campaignId,
  );
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
      organizationId: params.organizationId,
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
  organizationId: string;
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
    videoProviderStatus: "failed",
    videoProviderError: params.message,
    videoProviderErrorCode: params.code,
    videoProviderRaw: params.raw ?? null,
  } satisfies Record<string, unknown>;

  await params.supabase
    .from("creative_assets")
    .update({
      status: "failed",
      metadata: nextMetadata as Json,
      error_message: params.message,
    } as never)
    .eq("id", params.assetId)
    .eq("campaign_id", params.campaignId)
    .eq("user_id", params.userId);

  await persistVideoStateToCampaignPlan({
    supabase: params.supabase,
    organizationId: params.organizationId,
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
  providerName: DurableVideoProviderName;
  providerUsageEventId: string | null | undefined;
  providerUsageSettlementToken: string | null | undefined;
  providerUsageSettlementGeneration: number | null | undefined;
}) {
  const idempotencyKey = `video_generation_status:${params.providerName}:${params.providerAssetId}`;
  const { error } = await params.supabase.from("system_jobs").insert({
    organization_id: params.organizationId ?? params.userId,
    user_id: params.userId,
    campaign_id: params.campaignId,
    kind: "video_generation_status",
    status: "pending",
    payload: {
      assetId: params.assetId,
      providerAssetId: params.providerAssetId,
      providerName: params.providerName,
      providerUsageEventId: params.providerUsageEventId ?? null,
      providerUsageSettlementToken: params.providerUsageSettlementToken ?? null,
      providerUsageSettlementGeneration:
        params.providerUsageSettlementGeneration ?? null,
      pollAttempt: 0,
    } satisfies VideoGenerationStatusJobPayload,
    idempotency_key: idempotencyKey,
    max_attempts: 1,
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
  campaignId: string;
  assetId: string;
}) {
  const { data, error } = await params.supabase
    .from("creative_assets")
    .select("*")
    .eq("id", params.assetId)
    .eq("campaign_id", params.campaignId)
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
  organizationId: string;
  userId: string;
  campaignId: string;
  payload: VideoGenerationJobPayload;
  providerUsageAttemptKey: string;
}) {
  const row = await loadCampaignPlanRow(
    params.supabase,
    params.organizationId,
    params.userId,
    params.campaignId,
  );
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

  const videoProvider = getDurableVideoProvider();
  const unavailableReason = getDurableVideoProviderUnavailableReason({
    provider: videoProvider,
    inputImageUrl: params.payload.inputImageUrl,
  });
  const defaultState = createDefaultVideoState(params.payload);

  if (!videoProvider || unavailableReason) {
    const unavailableState: VideoCreativeAsset = {
      ...(existingVideo ?? defaultState),
      hook: params.payload.hook,
      script: params.payload.scriptLines,
      shotList: params.payload.scenes.map((scene) => scene.text),
      videoUrl: undefined,
      videoGenerationState: "unavailable",
      videoGenerationMessage: unavailableReason,
      providerAssetId: null,
    };

    await persistVideoAdsToCampaignPlan({
      supabase: params.supabase,
      organizationId: params.organizationId,
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
        provider_name: videoProvider ?? "unconfigured",
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
          unavailableReason,
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

  const budgetReservation = await consumeSessionCostBudget({
    bucket: `${videoProvider}_video_generation`,
    userId: params.userId,
    organizationId: row.organization_id,
    campaignId: params.campaignId,
    idempotencyKey: `${videoProvider}_video_generation:${row.organization_id}:${params.userId}:${params.campaignId}:${params.payload.creativeIndex}:${params.providerUsageAttemptKey}`,
    attemptKey: `provider_usage_attempt:${params.providerUsageAttemptKey}:${params.payload.creativeIndex}`,
  });

  let providerVideo;

  try {
    providerVideo = await createDurableVideoRender({
      provider: videoProvider,
      script: params.payload.scriptText,
      inputImageUrl: params.payload.inputImageUrl,
      avatarId: params.payload.avatarProfileId ?? undefined,
      voiceId: params.payload.voiceProfile ?? undefined,
      title: params.payload.title,
    });
  } catch (error) {
    await markSessionCostBudgetEvent({
      ...budgetReservation,
      status: getDurableVideoProviderUsageOutcome(videoProvider, error),
      metadata: {
        operation: `${videoProvider}_video_generation`,
        reason: error instanceof Error ? error.message : "Video generation failed to start.",
      },
    }).catch(() => null);
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
      provider_name: videoProvider,
      provider_asset_id: providerVideo.providerAssetId,
      file_url: null,
      thumbnail_url: null,
      metadata: {
        hook: params.payload.hook,
        body: params.payload.body,
        cta: params.payload.cta,
        scriptText: params.payload.scriptText,
        scenes: params.payload.scenes,
        inputImageUrl: params.payload.inputImageUrl,
        videoProvider,
        providerStatus: providerVideo.status,
        providerMetadata: providerVideo.metadata,
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
        ...budgetReservation,
        status: "consumed",
        metadata: {
          operation: `${videoProvider}_video_generation`,
          providerAssetId: providerVideo.providerAssetId,
          reason: schemaMessage,
          providerAccepted: true,
          localPersistenceFailed: true,
        },
      }).catch(() => null);
      throw new ApiError(500, schemaMessage, "creative_assets_schema_incompatible");
    }

    await markSessionCostBudgetEvent({
      ...budgetReservation,
      status: "consumed",
      metadata: {
        operation: `${videoProvider}_video_generation`,
        providerAssetId: providerVideo.providerAssetId,
        reason: error?.message ?? "Video asset could not be created.",
        providerAccepted: true,
        localPersistenceFailed: true,
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
    videoUrl: undefined,
    videoGenerationState: "generating",
    videoGenerationMessage:
      `Generating video with ${videoProvider === "higgsfield" ? "Higgsfield" : "HeyGen"}. The durable status job will reconcile completion.`,
    providerAssetId: providerVideo.providerAssetId,
  };

  await persistVideoAdsToCampaignPlan({
    supabase: params.supabase,
    organizationId: params.organizationId,
    userId: params.userId,
    campaignId: params.campaignId,
    videoAds: mergeVideoAdState(existingVideoAds, queuedVideoState, params.payload.creativeIndex),
  });

  await queueVideoStatusPollJob({
    supabase: params.supabase,
    organizationId: row.organization_id,
    userId: params.userId,
    campaignId: params.campaignId,
    assetId: insertedAsset.id,
    providerAssetId: providerVideo.providerAssetId,
    providerName: videoProvider,
    providerUsageEventId: budgetReservation.eventId,
    providerUsageSettlementToken: budgetReservation.settlementToken,
    providerUsageSettlementGeneration: budgetReservation.settlementGeneration,
  });

  return {
    assetId: insertedAsset.id,
    providerAssetId: providerVideo.providerAssetId,
    status: "processing",
    asset: insertedAsset,
    video: {
      url: "",
      hook: params.payload.hook,
      script: params.payload.scriptLines,
      scenes: params.payload.scenes.map((scene) => scene.text),
    },
  };
}

export async function pollVideoGenerationStatusJob(params: {
  supabase: VideoPersistenceClient;
  organizationId: string;
  userId: string;
  campaignId: string;
  payload: VideoGenerationStatusJobPayload;
}) {
  await loadCampaignPlanRow(
    params.supabase,
    params.organizationId,
    params.userId,
    params.campaignId,
  );

  const asset = await loadCreativeAssetForVideoStatus({
    supabase: params.supabase,
    userId: params.userId,
    campaignId: params.campaignId,
    assetId: params.payload.assetId,
  });

  let finalStatus;

  try {
    finalStatus = await retryRouteStep(
      () =>
        getDurableVideoRenderStatus({
          provider: params.payload.providerName ?? "heygen",
          providerAssetId: params.payload.providerAssetId,
        }),
      {
        retries: 2,
        delayMs: 1_000,
      },
    );
  } catch (error) {
    throw toVideoProviderApiError(error, "check");
  }

  if (
    finalStatus.status === "pending" ||
    finalStatus.status === "waiting" ||
    finalStatus.status === "processing" ||
    finalStatus.status === "unknown"
  ) {
    if ((params.payload.pollAttempt ?? 0) >= 120) {
      const failureMessage =
        "Video provider reconciliation exceeded the bounded polling window and requires operator review.";
      await persistVideoFailure({
        supabase: params.supabase,
        organizationId: params.organizationId,
        userId: params.userId,
        campaignId: params.campaignId,
        assetId: asset.id,
        providerAssetId: params.payload.providerAssetId,
        insertedAssetMetadata: asset.metadata,
        code: "video_generation_reconciliation_exhausted",
        message: failureMessage,
        raw: finalStatus.raw,
      });
      await markSessionCostBudgetEvent({
        eventId: params.payload.providerUsageEventId,
        organizationId: params.organizationId,
        userId: params.userId,
        settlementToken: params.payload.providerUsageSettlementToken,
        settlementGeneration: params.payload.providerUsageSettlementGeneration,
        status: "consumed",
        metadata: {
          operation: `${params.payload.providerName ?? "heygen"}_video_generation`,
          providerAssetId: params.payload.providerAssetId,
          providerAccepted: true,
          reconciliationExhausted: true,
        },
      }).catch(() => null);
      throw new ApiError(
        409,
        failureMessage,
        "video_generation_reconciliation_exhausted",
      );
    }
    return {
      assetId: asset.id,
      providerAssetId: params.payload.providerAssetId,
      status: "processing",
      providerStatus: finalStatus.status,
      videoUrl: null,
    };
  }

  if (finalStatus.status === "failed") {
    const failureMessage = finalStatus.error ?? "Video generation failed.";

    await persistVideoFailure({
      supabase: params.supabase,
      organizationId: params.organizationId,
      userId: params.userId,
      campaignId: params.campaignId,
      assetId: asset.id,
      providerAssetId: params.payload.providerAssetId,
      insertedAssetMetadata: asset.metadata,
      code: "video_generation_failed",
      message: failureMessage,
      raw: finalStatus.raw,
    });

    await markSessionCostBudgetEvent({
      eventId: params.payload.providerUsageEventId,
      organizationId: params.organizationId,
      userId: params.userId,
      settlementToken: params.payload.providerUsageSettlementToken,
      settlementGeneration: params.payload.providerUsageSettlementGeneration,
      status: "consumed",
      metadata: {
        operation: `${params.payload.providerName ?? "heygen"}_video_generation`,
        providerAssetId: params.payload.providerAssetId,
        reason: failureMessage,
        providerAccepted: true,
        providerRenderFailed: true,
      },
    }).catch(() => null);

    throw new ApiError(502, failureMessage, "video_generation_failed");
  }

  if (!finalStatus.videoUrl) {
    throw new ApiError(
      502,
      "The video provider reported completion without a video URL.",
      "video_generation_missing_url",
    );
  }

  const nextMetadata = {
    ...(typeof asset.metadata === "object" && asset.metadata
      ? (asset.metadata as Record<string, unknown>)
      : {}),
    videoProvider: params.payload.providerName ?? "heygen",
    videoProviderStatus: finalStatus.status,
    videoProviderRaw: finalStatus.raw,
  } satisfies Record<string, unknown>;

  const { data: updatedAssetRaw, error: updateError } = await params.supabase
    .from("creative_assets")
    .update({
      status: "ready",
      file_url: finalStatus.videoUrl,
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
    organizationId: params.organizationId,
    userId: params.userId,
    campaignId: params.campaignId,
    providerAssetId: params.payload.providerAssetId,
    status: "generated",
    videoUrl: finalStatus.videoUrl,
    message: null,
  });

  await markSessionCostBudgetEvent({
    eventId: params.payload.providerUsageEventId,
    organizationId: params.organizationId,
    userId: params.userId,
    settlementToken: params.payload.providerUsageSettlementToken,
    settlementGeneration: params.payload.providerUsageSettlementGeneration,
    status: "consumed",
    metadata: {
      operation: `${params.payload.providerName ?? "heygen"}_video_generation`,
      providerAssetId: params.payload.providerAssetId,
    },
  });

  return {
    assetId: asset.id,
    providerAssetId: params.payload.providerAssetId,
    status: "completed",
    asset: updatedAssetRaw as CreativeAsset,
    videoUrl: finalStatus.videoUrl,
  };
}
