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
import {
  beginPaidCreativeDispatch,
  executePaidCreativeDispatch,
  finalizePaidCreativeProjection,
  fingerprintPaidCreativeRequest,
  recordPaidCreativeProviderOutcome,
  type PaidCreativeDispatchExecution,
} from "@/lib/services/paid-creative-dispatch-service";
import { importGeneratedVideoToCanonicalStorage } from "@/lib/services/generated-video-storage-service";
import { createHiggsfieldSourceProxyUrl } from "@/lib/services/higgsfield-source-proxy";
import { assertVideoGenerationClaims } from "@/lib/advertising-claim-boundaries";

type VideoPersistenceClient = SupabaseClient<Database>;
type CampaignPlanRow = Database["public"]["Tables"]["campaign_plans"]["Row"];

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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
  inputImageAssetId: string | null;
  inputImagePaidCreativeDispatchId: string | null;
  providerName?: DurableVideoProviderName;
  force: boolean;
};

export type VideoGenerationStatusJobPayload = {
  assetId: string;
  providerAssetId: string;
  providerName?: DurableVideoProviderName;
  paidCreativeDispatchId?: string;
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
  providerName: DurableVideoProviderName;
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
  const matchingVideos = existingVideoAds.filter(
    (video) =>
      video.providerAssetId === params.providerAssetId &&
      (!video.videoProvider || video.videoProvider === params.providerName),
  );
  if (matchingVideos.length !== 1) {
    throw new ApiError(
      409,
      "Video customer state did not resolve to one exact provider asset.",
      "campaign_video_provider_identity_mismatch",
    );
  }
  const nextVideoAds = existingVideoAds.map((video) =>
    video === matchingVideos[0]
      ? {
          ...video,
          videoProvider: params.providerName,
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
  providerName: DurableVideoProviderName;
  insertedAssetMetadata: CreativeAsset["metadata"];
  code: string;
  message: string;
  raw?: Record<string, unknown> | null;
}) {
  const nextMetadata = {
    ...(typeof params.insertedAssetMetadata === "object" && params.insertedAssetMetadata
      ? (params.insertedAssetMetadata as Record<string, unknown>)
      : {}),
    videoProvider: params.providerName,
    videoProviderStatus: "failed",
    videoProviderError: params.message,
    videoProviderErrorCode: params.code,
    videoProviderResponseRecorded: Boolean(params.raw),
  } satisfies Record<string, unknown>;

  const { error: assetUpdateError } = await params.supabase
    .from("creative_assets")
    .update({
      status: "failed",
      metadata: nextMetadata as Json,
      error_message: params.message,
    } as never)
    .eq("id", params.assetId)
    .eq("campaign_id", params.campaignId)
    .eq("user_id", params.userId);
  if (assetUpdateError) {
    throw new ApiError(
      500,
      assetUpdateError.message ?? "Failed video state could not be persisted.",
      "creative_asset_update_failed",
    );
  }

  await persistVideoStateToCampaignPlan({
    supabase: params.supabase,
    organizationId: params.organizationId,
    userId: params.userId,
    campaignId: params.campaignId,
    providerAssetId: params.providerAssetId,
    providerName: params.providerName,
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
  paidCreativeDispatchId: string;
}) {
  const idempotencyKey =
    `video_generation_status:${params.organizationId ?? params.userId}:${params.campaignId}:${params.providerName}:${params.providerAssetId}`;
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
      paidCreativeDispatchId: params.paidCreativeDispatchId,
      pollAttempt: 0,
    } satisfies VideoGenerationStatusJobPayload,
    idempotency_key: idempotencyKey,
    // Each non-terminal provider poll is a fresh claim attempt. This covers
    // the bounded 120-poll window plus lease-reclaim/projection headroom.
    max_attempts: 128,
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

async function verifyBoundHiggsfieldSourceAsset(params: {
  supabase: VideoPersistenceClient;
  organizationId: string;
  userId: string;
  campaignId: string;
  payload: VideoGenerationJobPayload;
}) {
  if (
    !isUuid(params.payload.inputImageAssetId) ||
    !isUuid(params.payload.inputImagePaidCreativeDispatchId)
  ) {
    throw new ApiError(
      409,
      "Higgsfield requires an exact paid static creative bound to this campaign.",
      "video_source_asset_identity_missing",
    );
  }

  const { data, error } = await (params.supabase as any)
    .from("creative_assets")
    .select("id,user_id,campaign_id,provider_name,status,file_url,paid_creative_dispatch_id")
    .eq("id", params.payload.inputImageAssetId)
    .eq("user_id", params.userId)
    .eq("campaign_id", params.campaignId)
    .eq("provider_name", "openai")
    .eq("status", "ready")
    .eq("paid_creative_dispatch_id", params.payload.inputImagePaidCreativeDispatchId)
    .maybeSingle();
  if (error) {
    throw new ApiError(
      503,
      error.message ?? "Higgsfield source creative could not be verified.",
      "video_source_asset_lookup_failed",
    );
  }
  if (!data) {
    throw new ApiError(
      409,
      "Higgsfield source creative is not bound to this tenant and campaign.",
      "video_source_asset_scope_mismatch",
    );
  }
  const dispatchLookup = await (params.supabase as any)
    .from("paid_creative_dispatches")
    .select("id")
    .eq("id", params.payload.inputImagePaidCreativeDispatchId)
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .eq("campaign_id", params.campaignId)
    .eq("provider", "openai")
    .eq("operation", "openai_image_generation")
    .eq("state", "projected")
    .maybeSingle();
  if (dispatchLookup.error) {
    throw new ApiError(
      503,
      dispatchLookup.error.message ?? "Higgsfield source dispatch could not be verified.",
      "video_source_dispatch_lookup_failed",
    );
  }
  if (!dispatchLookup.data) {
    throw new ApiError(
      409,
      "Higgsfield source dispatch is not finalized for this tenant and campaign.",
      "video_source_dispatch_scope_mismatch",
    );
  }
  if (typeof data.file_url !== "string" || !data.file_url.trim()) {
    throw new ApiError(
      409,
      "Higgsfield source creative has no canonical provider asset URL.",
      "video_source_asset_url_missing",
    );
  }
  return createHiggsfieldSourceProxyUrl({
    assetId: params.payload.inputImageAssetId,
    dispatchId: params.payload.inputImagePaidCreativeDispatchId,
    organizationId: params.organizationId,
    userId: params.userId,
    campaignId: params.campaignId,
  });
}

export async function runVideoGenerationJob(params: {
  supabase: VideoPersistenceClient;
  organizationId: string;
  userId: string;
  campaignId: string;
  payload: VideoGenerationJobPayload;
  providerUsageAttemptKey: string;
}) {
  assertVideoGenerationClaims(params.payload);
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
  const providerUsageAttemptKey = `provider_usage_attempt:${params.providerUsageAttemptKey}:${params.payload.creativeIndex}`;

  if (
    params.payload.force !== true &&
    existingVideo &&
    existingVideo.videoGenerationState === "generated"
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

  if (params.payload.force !== true && existingVideo?.videoGenerationState === "generating") {
    const matchingDispatch = await (params.supabase as any)
      .from("paid_creative_dispatches")
      .select("id")
      .eq("organization_id", params.organizationId)
      .eq("user_id", params.userId)
      .eq("campaign_id", params.campaignId)
      .eq("attempt_key", providerUsageAttemptKey)
      .maybeSingle();
    if (matchingDispatch.error) {
      throw new ApiError(
        500,
        matchingDispatch.error.message ?? "Video dispatch recovery lookup failed.",
        "paid_creative_dispatch_lookup_failed",
      );
    }
    if (!matchingDispatch.data) {
      throw new ApiError(
        409,
        "Video state says generation started, but no durable dispatch identity exists.",
        "video_generation_dispatch_identity_missing",
      );
    }
  }

  const configuredProvider = getDurableVideoProvider();
  const videoProvider = params.payload.providerName ?? configuredProvider;
  // New jobs pin the provider selected by the API. Preserve that identity on
  // crash recovery even if configuration changes after the provider accepted
  // the request; the dispatch ledger decides whether a POST is permitted.
  const unavailableReason = params.payload.providerName
    ? null
    : getDurableVideoProviderUnavailableReason({
        provider: videoProvider,
        inputImageUrl: params.payload.inputImageAssetId ? "bound-source-asset" : null,
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
      videoProvider: videoProvider ?? undefined,
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

  const verifiedInputImageUrl = videoProvider === "higgsfield"
    ? await verifyBoundHiggsfieldSourceAsset({
        supabase: params.supabase,
        organizationId: params.organizationId,
        userId: params.userId,
        campaignId: params.campaignId,
        payload: params.payload,
      })
    : null;

  const budgetReservation = await consumeSessionCostBudget({
    bucket: `${videoProvider}_video_generation`,
    userId: params.userId,
    organizationId: row.organization_id,
    campaignId: params.campaignId,
    idempotencyKey: `${videoProvider}_video_generation:${row.organization_id}:${params.userId}:${params.campaignId}:${params.payload.creativeIndex}:${params.providerUsageAttemptKey}`,
    attemptKey: providerUsageAttemptKey,
  });

  if (!budgetReservation.eventId) {
    throw new ApiError(
      503,
      "Paid video generation requires a durable provider usage event.",
      "provider_usage_guard_unavailable",
    );
  }

  const providerRequest = {
    provider: videoProvider,
    script: params.payload.scriptText,
    inputImageAssetId: params.payload.inputImageAssetId,
    inputImagePaidCreativeDispatchId: params.payload.inputImagePaidCreativeDispatchId,
    avatarId: params.payload.avatarProfileId ?? null,
    voiceId: params.payload.voiceProfile ?? null,
    title: params.payload.title,
  };
  let dispatchExecution: PaidCreativeDispatchExecution<
    Awaited<ReturnType<typeof createDurableVideoRender>>
  >;
  try {
    dispatchExecution = await executePaidCreativeDispatch({
    begin: () =>
      beginPaidCreativeDispatch({
        supabase: params.supabase as any,
        providerUsageEventId: budgetReservation.eventId as string,
        organizationId: row.organization_id,
        userId: params.userId,
        campaignId: params.campaignId,
        provider: videoProvider,
        operation: `${videoProvider}_video_generation`,
        attemptKey: providerUsageAttemptKey,
        requestFingerprint: fingerprintPaidCreativeRequest(providerRequest),
        requestPayload: providerRequest,
      }),
    dispatch: () =>
      createDurableVideoRender({
        provider: videoProvider,
        script: params.payload.scriptText,
        inputImageUrl: verifiedInputImageUrl,
        avatarId: params.payload.avatarProfileId ?? undefined,
        voiceId: params.payload.voiceProfile ?? undefined,
        title: params.payload.title,
      }),
    classifyResult: (output) => ({
      outcome: "accepted",
      providerRequestId: output.providerAssetId,
      errorCode: null,
    }),
    classifyError: (error) => {
      const usageOutcome = getDurableVideoProviderUsageOutcome(videoProvider, error);
      return {
        outcome: usageOutcome === "operator_action_required" ? "uncertain" : "rejected",
        errorCode:
          usageOutcome === "operator_action_required"
            ? "video_provider_dispatch_ambiguous"
            : "video_provider_dispatch_rejected",
      };
    },
    record: ({
      handle,
      outcome,
      providerRequestId,
      providerOutput,
      errorCode,
    }) =>
      recordPaidCreativeProviderOutcome({
        supabase: params.supabase as any,
        handle,
        organizationId: row.organization_id,
        userId: params.userId,
        outcome,
        providerRequestId,
        providerOutput,
        errorCode,
      }),
    });
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.code === "paid_creative_dispatch_outcome_persist_failed"
    ) {
      await markSessionCostBudgetEvent({
        ...budgetReservation,
        status: "operator_action_required",
        metadata: {
          operation: `${videoProvider}_video_generation`,
          reason: error.message,
          providerOutcome: "ambiguous_after_dispatch",
        },
      }).catch(() => null);
    }
    throw error;
  }

  if (dispatchExecution.outcome !== "accepted" || !dispatchExecution.output) {
    const liveDispatchPossiblyStillRunning =
      dispatchExecution.recovered && dispatchExecution.dispatchState === "dispatching";
    if (!liveDispatchPossiblyStillRunning) {
      await markSessionCostBudgetEvent({
        ...budgetReservation,
        status:
          dispatchExecution.outcome === "rejected"
            ? "rejected"
            : "operator_action_required",
        metadata: {
          operation: `${videoProvider}_video_generation`,
          paidCreativeDispatchId: dispatchExecution.dispatchId,
          reason:
            dispatchExecution.error instanceof Error
              ? dispatchExecution.error.message
              : "Video provider dispatch requires reconciliation.",
          providerOutcome: dispatchExecution.outcome,
        },
      }).catch(() => null);
    }
    if (dispatchExecution.error) {
      throw toVideoProviderApiError(dispatchExecution.error, "start");
    }
    throw new ApiError(
      409,
      "Video provider dispatch is ambiguous and requires operator reconciliation before retry.",
      "paid_creative_dispatch_operator_action_required",
    );
  }

  const providerVideo = dispatchExecution.output as Awaited<
    ReturnType<typeof createDurableVideoRender>
  >;
  if (!providerVideo.providerAssetId?.trim()) {
    throw new ApiError(
      500,
      "Recovered video provider output is missing its request identity.",
      "paid_creative_dispatch_output_invalid",
    );
  }

  const existingAssetLookup = await (params.supabase as any)
    .from("creative_assets")
    .select("*")
    .eq("paid_creative_dispatch_id", dispatchExecution.dispatchId)
    .maybeSingle();
  if (existingAssetLookup.error) {
    throw new ApiError(
      500,
      existingAssetLookup.error.message ?? "Paid video asset recovery lookup failed.",
      "creative_asset_lookup_failed",
    );
  }

  let insertedAssetRaw = existingAssetLookup.data;
  let error: { message?: string | null; code?: string | null } | null = null;
  if (!insertedAssetRaw) {
    const insertResult = await params.supabase.from("creative_assets").insert({
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
      paid_creative_dispatch_id: dispatchExecution.dispatchId,
      file_url: null,
      thumbnail_url: null,
      metadata: {
        hook: params.payload.hook,
        body: params.payload.body,
        cta: params.payload.cta,
        scriptText: params.payload.scriptText,
        scenes: params.payload.scenes,
        inputImageAssetId: params.payload.inputImageAssetId,
        inputImagePaidCreativeDispatchId: params.payload.inputImagePaidCreativeDispatchId,
        videoProvider,
        providerStatus: providerVideo.status,
        providerMetadata: providerVideo.metadata,
        paidCreativeDispatchId: dispatchExecution.dispatchId,
      } as Json,
    } as never)
    .select("*")
    .single();
    insertedAssetRaw = insertResult.data;
    error = insertResult.error;
    if (error && (error as { code?: string }).code === "23505") {
      const replayLookup = await (params.supabase as any)
        .from("creative_assets")
        .select("*")
        .eq("paid_creative_dispatch_id", dispatchExecution.dispatchId)
        .maybeSingle();
      insertedAssetRaw = replayLookup.data;
      error = replayLookup.error;
    }
  }
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
      `Generating video with ${videoProvider === "higgsfield" ? "Higgsfield" : "HeyGen"}. The durable status job will reconcile completion.`,
    providerAssetId: providerVideo.providerAssetId,
    videoProvider,
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
    paidCreativeDispatchId: dispatchExecution.dispatchId,
  });

  return {
    assetId: insertedAsset.id,
    providerAssetId: providerVideo.providerAssetId,
    providerName: videoProvider,
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

  const persistedProvider =
    asset.provider_name === "higgsfield" || asset.provider_name === "heygen"
      ? asset.provider_name
      : null;
  const providerName = params.payload.providerName ?? persistedProvider;
  const assetMetadata =
    asset.metadata && typeof asset.metadata === "object"
      ? asset.metadata as Record<string, unknown>
      : {};
  const paidCreativeDispatchId =
    params.payload.paidCreativeDispatchId ??
    (typeof assetMetadata.paidCreativeDispatchId === "string"
      ? assetMetadata.paidCreativeDispatchId
      : null);
  if (
    !providerName ||
    (persistedProvider && persistedProvider !== providerName) ||
    asset.provider_asset_id !== params.payload.providerAssetId ||
    !isUuid(paidCreativeDispatchId)
  ) {
    throw new ApiError(
      409,
      "Video status reconciliation could not prove one exact provider identity.",
      "video_generation_provider_identity_mismatch",
    );
  }

  let finalStatus;

  try {
    finalStatus = await retryRouteStep(
      () =>
        getDurableVideoRenderStatus({
          provider: providerName,
          providerAssetId: params.payload.providerAssetId,
        }),
      {
        retries: 2,
        delayMs: 1_000,
      },
    );
  } catch (error) {
    finalStatus = {
      provider: providerName,
      providerAssetId: params.payload.providerAssetId,
      status: "unknown" as const,
      videoUrl: null,
      thumbnailUrl: null,
      error: error instanceof Error ? error.message : "Provider status is temporarily unavailable.",
      raw: null,
    };
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
        providerName,
        insertedAssetMetadata: asset.metadata,
        code: "video_generation_reconciliation_exhausted",
        message: failureMessage,
        raw: finalStatus.raw,
      });
      await retryRouteStep(
        () => markSessionCostBudgetEvent({
          eventId: params.payload.providerUsageEventId,
          organizationId: params.organizationId,
          userId: params.userId,
          settlementToken: params.payload.providerUsageSettlementToken,
          settlementGeneration: params.payload.providerUsageSettlementGeneration,
          status: "operator_action_required",
          metadata: {
            operation: `${providerName}_video_generation`,
            providerAssetId: params.payload.providerAssetId,
            providerAccepted: true,
            reconciliationExhausted: true,
          },
        }),
        { retries: 2, delayMs: 250 },
      );
      throw new ApiError(
        409,
        failureMessage,
        "video_generation_reconciliation_exhausted",
      );
    }
    return {
      assetId: asset.id,
      providerAssetId: params.payload.providerAssetId,
      providerName,
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
      providerName,
      insertedAssetMetadata: asset.metadata,
      code: "video_generation_failed",
      message: failureMessage,
      raw: finalStatus.raw,
    });

    await retryRouteStep(
      () => markSessionCostBudgetEvent({
        eventId: params.payload.providerUsageEventId,
        organizationId: params.organizationId,
        userId: params.userId,
        settlementToken: params.payload.providerUsageSettlementToken,
        settlementGeneration: params.payload.providerUsageSettlementGeneration,
        status: "released",
        metadata: {
          operation: `${providerName}_video_generation`,
          providerAssetId: params.payload.providerAssetId,
          reason: failureMessage,
          providerAccepted: true,
          providerRenderFailed: true,
          customerCreditsReleased: true,
        },
      }),
      { retries: 2, delayMs: 250 },
    );

    throw new ApiError(502, failureMessage, "video_generation_failed");
  }

  if (!finalStatus.videoUrl) {
    throw new ApiError(
      502,
      "The video provider reported completion without a video URL.",
      "video_generation_missing_url",
    );
  }

  const storedVideo = await importGeneratedVideoToCanonicalStorage({
    client: params.supabase,
    organizationId: params.organizationId,
    userId: params.userId,
    campaignId: params.campaignId,
    providerName,
    providerAssetId: params.payload.providerAssetId,
    assetId: asset.id,
    sourceUrl: finalStatus.videoUrl,
  });

  const nextMetadata = {
    ...(typeof asset.metadata === "object" && asset.metadata
      ? (asset.metadata as Record<string, unknown>)
      : {}),
    videoProvider: providerName,
    videoProviderStatus: finalStatus.status,
    generatedVideoStorageSha256: storedVideo.contentSha256,
    generatedVideoStorageBytes: storedVideo.contentLength,
    generatedVideoStorageMimeType: storedVideo.mimeType,
    generatedVideoStorageReused: storedVideo.reusedExistingObject,
  } satisfies Record<string, unknown>;

  const { data: updatedAssetRaw, error: updateError } = await params.supabase
    .from("creative_assets")
    .update({
      status: "ready",
      file_url: storedVideo.publicUrl,
      thumbnail_url: null,
      metadata: nextMetadata as Json,
    } as never)
    .eq("id", asset.id)
    .eq("campaign_id", params.campaignId)
    .eq("user_id", params.userId)
    .eq("storage_bucket", storedVideo.storageBucket)
    .eq("storage_path", storedVideo.storagePath)
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
    providerName,
    status: "generated",
    videoUrl: storedVideo.publicUrl,
    message: null,
  });

  await finalizePaidCreativeProjection({
    supabase: params.supabase as any,
    dispatchId: paidCreativeDispatchId,
    organizationId: params.organizationId,
    userId: params.userId,
    projectionReceipt: {
      kind: "video_generation",
      campaignId: params.campaignId,
      creativeAssetId: asset.id,
      providerAssetId: params.payload.providerAssetId,
      providerName,
      outputStatus: "completed",
      storageBucket: storedVideo.storageBucket,
      storagePath: storedVideo.storagePath,
      contentSha256: storedVideo.contentSha256,
    },
  });

  return {
    assetId: asset.id,
    providerAssetId: params.payload.providerAssetId,
    providerName,
    status: "completed",
    asset: updatedAssetRaw as CreativeAsset,
    videoUrl: storedVideo.publicUrl,
  };
}
