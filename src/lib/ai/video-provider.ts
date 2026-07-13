import { getHiggsfieldGenerationEnv, getVideoGenerationEnv } from "@/lib/env";
import {
  createHiggsfieldVideo,
  getHiggsfieldProviderUsageOutcome,
  getHiggsfieldVideoStatus,
} from "@/lib/ai/higgsfield";
import {
  createHeyGenVideo,
  getHeyGenProviderUsageOutcome,
  getHeyGenVideoStatus,
} from "@/lib/ai/heygen";

export type DurableVideoProviderName = "higgsfield" | "heygen";

export function getDurableVideoProvider(): DurableVideoProviderName | null {
  const higgsfield = getHiggsfieldGenerationEnv();
  if (higgsfield?.apiKey && higgsfield.apiSecret && higgsfield.credentialsValid) {
    return "higgsfield";
  }
  const heygen = getVideoGenerationEnv();
  if (heygen?.apiKey) return "heygen";
  return null;
}

export function getDurableVideoProviderUnavailableReason(params: {
  provider: DurableVideoProviderName | null;
  inputImageUrl?: string | null;
}) {
  if (!params.provider) {
    return "Video generation is not configured. Configure Higgsfield credentials to render video.";
  }
  if (params.provider === "higgsfield" && !params.inputImageUrl) {
    return "Higgsfield requires a generated source image before video rendering can start.";
  }
  return null;
}

export async function createDurableVideoRender(params: {
  provider: DurableVideoProviderName;
  script: string;
  title: string;
  inputImageUrl?: string | null;
  avatarId?: string | null;
  voiceId?: string | null;
}) {
  if (params.provider === "higgsfield") {
    const result = await createHiggsfieldVideo({
      prompt: params.script,
      inputImageUrl: params.inputImageUrl ?? "",
    });
    return {
      provider: "higgsfield" as const,
      providerAssetId: result.requestId,
      status: result.status,
      metadata: { model: result.model, raw: result.raw },
    };
  }

  const result = await createHeyGenVideo({
    script: params.script,
    avatarId: params.avatarId,
    voiceId: params.voiceId,
    title: params.title,
    aspectRatio: "9:16",
    resolution: "720p",
  });
  return {
    provider: "heygen" as const,
    providerAssetId: result.videoId,
    status: result.status,
    metadata: {
      avatarId: result.avatarId,
      voiceId: result.voiceId,
      raw: result.raw,
    },
  };
}

export function getDurableVideoProviderUsageOutcome(
  provider: DurableVideoProviderName,
  error: unknown,
) {
  return provider === "higgsfield"
    ? getHiggsfieldProviderUsageOutcome(error)
    : getHeyGenProviderUsageOutcome(error);
}

export async function getDurableVideoRenderStatus(params: {
  provider: DurableVideoProviderName;
  providerAssetId: string;
}) {
  if (params.provider === "higgsfield") {
    const result = await getHiggsfieldVideoStatus(params.providerAssetId);
    return {
      provider: params.provider,
      providerAssetId: result.requestId,
      status:
        result.status === "queued"
          ? ("pending" as const)
          : result.status === "in_progress"
            ? ("processing" as const)
            : result.status === "completed"
              ? ("completed" as const)
              : result.status === "failed" || result.status === "nsfw"
                ? ("failed" as const)
                : ("unknown" as const),
      videoUrl: result.videoUrl,
      thumbnailUrl: null,
      error: result.error,
      raw: result.raw,
    };
  }

  const result = await getHeyGenVideoStatus(params.providerAssetId);
  return {
    provider: params.provider,
    providerAssetId: result.videoId,
    status: result.status,
    videoUrl: result.videoUrl,
    thumbnailUrl: result.thumbnailUrl,
    error: result.error,
    raw: result.raw,
  };
}
