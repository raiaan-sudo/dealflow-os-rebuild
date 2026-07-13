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

function normalizeDurableMediaUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      parsed.hostname.toLowerCase(),
    );
    if (
      parsed.username ||
      parsed.password ||
      (parsed.protocol !== "https:" &&
        !(loopback && process.env.ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT === "true"))
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function getDurableVideoProvider(): DurableVideoProviderName | null {
  const higgsfield = getHiggsfieldGenerationEnv();
  if (higgsfield?.apiKey && higgsfield.apiSecret && higgsfield.credentialsValid) {
    return "higgsfield";
  }

  // A partial Higgsfield configuration is an operator error, not permission to
  // silently switch vendors. HeyGen remains a separately enabled legacy path.
  if (higgsfield) return null;

  const heygen = getVideoGenerationEnv();
  if (
    process.env.ALLOW_HEYGEN_LEGACY_FALLBACK === "true" &&
    process.env.ALLOW_HEYGEN_VIDEO_GENERATION === "true" &&
    heygen?.apiKey
  ) {
    return "heygen";
  }
  return null;
}

export function isDurableVideoProviderAuthorized(provider: DurableVideoProviderName) {
  if (provider === "higgsfield") {
    const higgsfield = getHiggsfieldGenerationEnv();
    return Boolean(
      process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION === "true" &&
      higgsfield?.apiKey &&
      higgsfield.apiSecret &&
      higgsfield.credentialsValid,
    );
  }

  return Boolean(
    process.env.ALLOW_HEYGEN_LEGACY_FALLBACK === "true" &&
    process.env.ALLOW_HEYGEN_VIDEO_GENERATION === "true" &&
    getVideoGenerationEnv()?.apiKey,
  );
}

export function getDurableVideoProviderUnavailableReason(params: {
  provider: DurableVideoProviderName | null;
  inputImageUrl?: string | null;
}) {
  if (!params.provider) {
    return "Video generation is not configured. Configure Higgsfield credentials; HeyGen is available only through the explicitly enabled legacy fallback.";
  }
  if (!isDurableVideoProviderAuthorized(params.provider)) {
    return params.provider === "higgsfield"
      ? "Higgsfield video generation is configured but its paid-generation authorization is disabled."
      : "The HeyGen legacy fallback is not explicitly authorized.";
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
      metadata: { model: result.model, status: result.status },
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
      status: result.status,
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
  const videoUrl = normalizeDurableMediaUrl(result.videoUrl);
  const thumbnailUrl = normalizeDurableMediaUrl(result.thumbnailUrl);
  if (result.status === "completed" && !videoUrl) {
    throw new Error(
      "HeyGen reported completion without a safe credential-free video URL.",
    );
  }
  return {
    provider: params.provider,
    providerAssetId: result.videoId,
    status: result.status,
    videoUrl,
    thumbnailUrl,
    error: result.error,
    raw: result.raw,
  };
}
