import type { CreativeIntakeGenerationContext } from "@/lib/services/creative-chat-intake-service";

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
    creativeIntake.generationPhase === "static"
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

export function shouldDeferMarketingStudioStaticGenerationToWorker(params: {
  kind?: string | null;
  payload?: unknown;
}) {
  return (
    isMarketingStudioStaticGenerationJob(params) &&
    !isMarketingStudioWorkerRuntimeEnabled()
  );
}
