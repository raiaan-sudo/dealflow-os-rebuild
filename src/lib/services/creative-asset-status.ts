import type { StaticCreativeAsset } from "@/lib/services/creative-engine";

export type CreativeAssetSource = "fallback" | "branded_static" | "higgsfield" | "manual";

export type CreativeAssetLifecycleStatus =
  | "queued"
  | "running"
  | "fallback_ready"
  | "provider_ready"
  | "provider_failed"
  | "provider_timeout"
  | "qa_failed"
  | "qa_approved"
  | "launch_approved";

export type CreativeAssetQaStatus = "pending" | "passed" | "failed" | "operator_approved";

export type FallbackLaunchQaResult = {
  passed?: boolean | null;
  checkedAt?: string | null;
  reasons?: string[] | null;
  approvedBy?: string | null;
};

const FALLBACK_MESSAGE = "Preview creative ready. Premium render still preparing.";

export function markInstantFallbackStaticAsset(
  asset: StaticCreativeAsset,
  index: number,
  options?: {
    generatedAt?: string | null;
    durationMs?: number | null;
  },
): StaticCreativeAsset {
  if (asset.creativeAssetSource || asset.creativeAssetStatus || asset.imageGenerationState === "generated") {
    return asset;
  }

  return {
    ...asset,
    creativeAssetSource: "fallback",
    creativeAssetStatus: "fallback_ready",
    creativeAssetQaStatus: "pending",
    fallbackUsed: true,
    durationMs: options?.durationMs ?? 0,
    errorReason: null,
    storagePath: asset.storagePath ?? null,
    imageGenerationState: asset.imageUrl ? "generated" : "unavailable",
    imageGenerationMessage:
      asset.imageGenerationMessage && !/image preview has not been generated yet/i.test(asset.imageGenerationMessage)
        ? asset.imageGenerationMessage
        : FALLBACK_MESSAGE,
    fallbackLaunchQa: {
      passed: false,
      checkedAt: options?.generatedAt ?? null,
      reasons: [`instant_fallback_preview_${index + 1}`],
      approvedBy: null,
    },
  };
}

export function markInstantFallbackStaticAssets(
  assets: StaticCreativeAsset[],
  options?: {
    generatedAt?: string | null;
    durationMs?: number | null;
  },
): StaticCreativeAsset[] {
  return assets.map((asset, index) => markInstantFallbackStaticAsset(asset, index, options));
}

export function isFallbackLaunchApproved(asset: {
  creativeAssetSource?: string | null;
  creativeAssetStatus?: string | null;
  creativeAssetQaStatus?: string | null;
  fallbackLaunchQa?: FallbackLaunchQaResult | null;
}) {
  if (asset.creativeAssetSource !== "fallback") {
    return false;
  }

  return (
    asset.creativeAssetStatus === "launch_approved" &&
    (asset.creativeAssetQaStatus === "operator_approved" || asset.fallbackLaunchQa?.passed === true)
  );
}

export function getCreativeAssetTierLabel(asset: {
  creativeAssetSource?: string | null;
  generationMethod?: string | null;
  providerName?: string | null;
  imageGenerationProvider?: string | null;
}) {
  if (asset.creativeAssetSource === "higgsfield" || /higgsfield/i.test(`${asset.providerName ?? ""} ${asset.imageGenerationProvider ?? ""}`)) {
    return "Premium Higgsfield";
  }

  if (asset.creativeAssetSource === "manual") {
    return "Manual upload";
  }

  if (asset.creativeAssetSource === "branded_static") {
    return "Branded static";
  }

  if (asset.creativeAssetSource === "fallback" || asset.generationMethod === "fallback") {
    return "Instant draft";
  }

  return null;
}

function rankScore(asset: StaticCreativeAsset) {
  if (asset.creativeAssetStatus === "launch_approved" && asset.creativeAssetSource === "higgsfield") {
    return 500;
  }

  if (asset.creativeAssetStatus === "launch_approved") {
    return 450;
  }

  if (asset.creativeAssetStatus === "qa_approved" && asset.creativeAssetSource === "branded_static") {
    return 400;
  }

  if (asset.creativeAssetStatus === "qa_approved" || asset.creativeAssetQaStatus === "passed") {
    return 350;
  }

  if (asset.creativeAssetStatus === "fallback_ready") {
    return 250;
  }

  if (asset.imageGenerationState === "generated" && asset.imageUrl) {
    return 200;
  }

  return 100;
}

export function rankBestAvailableStaticCreatives(assets: StaticCreativeAsset[]) {
  return [...assets].sort((left, right) => {
    const scoreDelta = rankScore(right) - rankScore(left);

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return (right.score ?? 0) - (left.score ?? 0);
  });
}
