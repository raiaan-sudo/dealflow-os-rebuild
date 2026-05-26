import {
  creativeIntakeIncludesStatic,
  creativeIntakeIncludesUgcVideo,
  type CreativeIntakeGenerationContext,
} from "@/lib/services/creative-chat-intake-service";
import {
  getHiggsfieldMarketingStudioEnv,
  getMediaGenerationFallbackProvider,
  getMediaGenerationProvider,
  validateHiggsfieldEnv,
} from "@/lib/env";
import {
  MARKETING_STUDIO_WORKER_DEFERRED_UNTIL,
  MARKETING_STUDIO_WORKER_RUNTIME,
} from "@/lib/services/creative-render-state";

export { MARKETING_STUDIO_WORKER_DEFERRED_UNTIL, MARKETING_STUDIO_WORKER_RUNTIME };

type StaticCreativeGenerationPayload = {
  outputMode?: string | null;
  provider?: string | null;
  creativeIntake?: CreativeIntakeGenerationContext | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isMarketingStudioStaticGenerationPayload(
  payload: unknown,
): payload is StaticCreativeGenerationPayload {
  if (!isRecord(payload)) {
    return false;
  }

  const creativeIntake = payload.creativeIntake;

  if (!isRecord(creativeIntake)) {
    return false;
  }

  return (
    paramsOutputMode(payload) === "finished_ad" &&
    paramsProvider(payload) === "higgsfield_marketing_studio" &&
    creativeIntake.outputMode === "finished_ad" &&
    creativeIntakeIncludesStatic(String(creativeIntake.generationPhase))
  );
}

function paramsOutputMode(payload: StaticCreativeGenerationPayload) {
  return typeof payload.outputMode === "string" ? payload.outputMode : null;
}

function paramsProvider(payload: StaticCreativeGenerationPayload) {
  return typeof payload.provider === "string" ? payload.provider : null;
}

export function isMarketingStudioWorkerRuntimeEnabled() {
  return process.env.MARKETING_STUDIO_WORKER_ENABLED === "true";
}

export function isMarketingStudioStaticGenerationJob(params: {
  kind?: string | null;
  payload?: unknown;
}) {
  return (
    params.kind === "static_creative_generation" &&
    isMarketingStudioStaticGenerationPayload(params.payload)
  );
}

export function isMarketingStudioVideoGenerationPayload(
  payload: unknown,
): payload is StaticCreativeGenerationPayload {
  if (!isRecord(payload)) {
    return false;
  }

  const creativeIntake = payload.creativeIntake;

  if (!isRecord(creativeIntake)) {
    return false;
  }

  return creativeIntakeIncludesUgcVideo(String(creativeIntake.generationPhase));
}

export function isMarketingStudioVideoGenerationJob(params: {
  kind?: string | null;
  payload?: unknown;
}) {
  if (params.kind !== "video_generation") {
    return false;
  }

  if (getMediaGenerationProvider() !== "higgsfield_marketing_studio") {
    return false;
  }

  const fallbackIsConfigured =
    getMediaGenerationFallbackProvider() === "higgsfield" &&
    process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION === "true" &&
    validateHiggsfieldEnv().configured;

  if (fallbackIsConfigured) {
    return false;
  }

  return (
    getHiggsfieldMarketingStudioEnv().ugcVideoModel === "marketing_studio_video" &&
    isMarketingStudioVideoGenerationPayload(params.payload)
  );
}

export function isMarketingStudioWorkerOwnedJob(params: {
  kind?: string | null;
  payload?: unknown;
}) {
  return (
    isMarketingStudioStaticGenerationJob(params) ||
    isMarketingStudioVideoGenerationJob(params)
  );
}

export function shouldDeferMarketingStudioStaticGenerationToWorker(params: {
  kind?: string | null;
  payload?: unknown;
}) {
  return (
    isMarketingStudioWorkerOwnedJob(params) &&
    !isMarketingStudioWorkerRuntimeEnabled()
  );
}
