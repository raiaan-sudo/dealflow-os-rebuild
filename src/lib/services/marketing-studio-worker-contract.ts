import {
  creativeIntakeIncludesStatic,
  creativeIntakeIncludesUgcVideo,
  type CreativeIntakeGenerationContext,
} from "@/lib/services/creative-chat-intake-service";
import { getMediaGenerationProvider } from "@/lib/env";

export const MARKETING_STUDIO_WORKER_RUNTIME = "marketing_studio_cli_worker";
export const MARKETING_STUDIO_WORKER_DEFERRED_UNTIL = "2099-01-01T00:00:00.000Z";

type StaticCreativeGenerationPayload = {
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
    creativeIntake.outputMode === "finished_ad" &&
    creativeIntakeIncludesStatic(String(creativeIntake.generationPhase))
  );
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
  return (
    params.kind === "video_generation" &&
    (getMediaGenerationProvider() === "higgsfield_marketing_studio" ||
      isMarketingStudioVideoGenerationPayload(params.payload))
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
