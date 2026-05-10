import type { StaticCreativeAsset, VideoCreativeAsset } from "@/lib/services/creative-engine";

export type AssetGenerationStatus =
  | "idle"
  | "generating"
  | "generated"
  | "partial"
  | "failed"
  | "unavailable";

export type AssetGenerationLifecycle = {
  status: AssetGenerationStatus;
  requestedAt?: string | null;
  completedAt?: string | null;
  attemptCount?: number;
  lastError?: string | null;
};

export type PersistedAssetGenerationState = {
  staticAds?: AssetGenerationLifecycle | null;
  videoAds?: AssetGenerationLifecycle | null;
};

export function normalizeAssetGenerationLifecycle(
  value: unknown,
): AssetGenerationLifecycle | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const status = String(record.status ?? "idle");
  const safeStatus: AssetGenerationStatus =
    status === "generating" ||
    status === "generated" ||
    status === "partial" ||
    status === "failed" ||
    status === "unavailable"
      ? status
      : "idle";

  return {
    status: safeStatus,
    requestedAt: typeof record.requestedAt === "string" ? record.requestedAt : null,
    completedAt: typeof record.completedAt === "string" ? record.completedAt : null,
    attemptCount: typeof record.attemptCount === "number" ? record.attemptCount : 0,
    lastError: typeof record.lastError === "string" ? record.lastError : null,
  };
}

export function readPersistedAssetGenerationState(
  value: unknown,
): PersistedAssetGenerationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;

  return {
    staticAds: normalizeAssetGenerationLifecycle(record.staticAds),
    videoAds: normalizeAssetGenerationLifecycle(record.videoAds),
  };
}

export function deriveStaticGenerationStatus(staticAds: StaticCreativeAsset[]): AssetGenerationStatus {
  if (!Array.isArray(staticAds) || staticAds.length === 0) {
    return "idle";
  }

  const generatedCount = staticAds.filter(
    (asset) =>
      asset.imageGenerationState === "generated" &&
      Boolean(asset.imageUrl) &&
      asset.qualityGate?.accepted !== false,
  ).length;
  const failedCount = staticAds.filter((asset) => asset.imageGenerationState === "failed").length;
  const unavailableCount = staticAds.filter(
    (asset) => asset.imageGenerationState === "unavailable",
  ).length;

  if (generatedCount === staticAds.length) {
    return "generated";
  }

  if (generatedCount > 0) {
    return "partial";
  }

  if (failedCount > 0) {
    return failedCount === staticAds.length ? "failed" : "partial";
  }

  if (unavailableCount === staticAds.length) {
    return "unavailable";
  }

  return "partial";
}

export function deriveVideoGenerationStatus(videoAds: VideoCreativeAsset[]): AssetGenerationStatus {
  if (!Array.isArray(videoAds) || videoAds.length === 0) {
    return "idle";
  }

  if (
    videoAds.some(
      (asset) => asset.videoGenerationState === "generated" && Boolean(asset.videoUrl),
    )
  ) {
    const allGenerated = videoAds.every(
      (asset) => asset.videoGenerationState === "generated" && Boolean(asset.videoUrl),
    );
    return allGenerated ? "generated" : "partial";
  }

  if (videoAds.some((asset) => asset.videoGenerationState === "generating")) {
    return "generating";
  }

  if (videoAds.every((asset) => asset.videoGenerationState === "failed")) {
    return "failed";
  }

  if (videoAds.every((asset) => asset.videoGenerationState === "unavailable")) {
    return "unavailable";
  }

  return "partial";
}

export function shouldReuseStaticGeneration(params: {
  force?: boolean;
  missingOnly?: boolean;
  lifecycle?: AssetGenerationLifecycle | null;
  staticAds: StaticCreativeAsset[];
}) {
  if (params.force) {
    return false;
  }

  const lifecycle = params.lifecycle;
  const currentStatus = deriveStaticGenerationStatus(params.staticAds);

  if (params.missingOnly) {
    return currentStatus === "generated";
  }

  if (lifecycle?.status === "generating") {
    return true;
  }

  if (lifecycle && lifecycle.status !== "idle" && (lifecycle.attemptCount ?? 0) > 0) {
    return true;
  }

  if (currentStatus !== "idle") {
    return true;
  }

  return false;
}

export function startAssetGenerationLifecycle(
  previous?: AssetGenerationLifecycle | null,
): AssetGenerationLifecycle {
  return {
    status: "generating",
    requestedAt: new Date().toISOString(),
    completedAt: null,
    attemptCount: (previous?.attemptCount ?? 0) + 1,
    lastError: null,
  };
}

export function completeAssetGenerationLifecycle(params: {
  previous?: AssetGenerationLifecycle | null;
  status: AssetGenerationStatus;
  error?: string | null;
}): AssetGenerationLifecycle {
  return {
    status: params.status,
    requestedAt: params.previous?.requestedAt ?? new Date().toISOString(),
    completedAt: new Date().toISOString(),
    attemptCount: params.previous?.attemptCount ?? 1,
    lastError: params.error ?? null,
  };
}
