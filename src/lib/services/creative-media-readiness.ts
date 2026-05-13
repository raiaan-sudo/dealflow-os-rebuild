import { evaluateStaticVisualAssetDecision } from "@/lib/services/static-creative-visual-qa";
type StaticCreativeReadinessInput = {
  id: string;
  imageUrl?: string | null;
  storageNormalized?: boolean | null;
  imageGenerationState?: string | null;
  imagePrompt?: string | null;
  imagePromptConfig?: {
    prompt?: string | null;
    negativePrompt?: string | null;
  } | null;
  visualPromptBrief?: {
    visualAssetContract?: string | null;
    visualAssetRole?: string | null;
  } | null;
  qualityGate?: {
    accepted?: boolean | null;
  } | null;
  imageQa?: {
    usable?: boolean | null;
    decision?: string | null;
    mode?: string | null;
    reasons?: string[] | null;
  } | null;
};

type VideoCreativeReadinessInput = {
  videoUrl?: string | null;
  videoGenerationState?: string | null;
  videoGenerationMessage?: string | null;
};

export type StaticCreativeReadiness = {
  totalCount: number;
  selectedCount: number;
  selectedReadyCount: number;
  launchReadyCount: number;
  retryCount: number;
  missingCount: number;
  selectedBlockedCount: number;
  recommendedRequiredCount: number;
  allSelectedReady: boolean;
  selectionLabel: string;
  readyLabel: string;
  issueLabel: string | null;
};

export function pluralizeCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function isLaunchReadyStaticCreative(creative: Pick<
  StaticCreativeReadinessInput,
  | "imageUrl"
  | "storageNormalized"
  | "imagePrompt"
  | "imagePromptConfig"
  | "visualPromptBrief"
  | "qualityGate"
  | "imageQa"
>) {
  return evaluateStaticVisualAssetDecision(creative).usable;
}

export function getStaticCreativeReadiness(
  creatives: StaticCreativeReadinessInput[],
  selectedIds: string[],
): StaticCreativeReadiness {
  const selectedIdSet = new Set(selectedIds);
  const selectedCreatives = creatives.filter((creative) => selectedIdSet.has(creative.id));
  const launchReadyCreatives = creatives.filter(isLaunchReadyStaticCreative);
  const retryCount = creatives.filter((creative) => {
    if (isLaunchReadyStaticCreative(creative)) {
      return false;
    }

    return (
      creative.imageGenerationState === "failed" ||
      creative.qualityGate?.accepted === false ||
      Boolean(creative.imageUrl)
    );
  }).length;
  const missingCount = creatives.filter(
    (creative) =>
      !creative.imageUrl &&
      creative.imageGenerationState !== "failed" &&
      creative.qualityGate?.accepted !== false,
  ).length;
  const selectedReadyCount = selectedCreatives.filter(isLaunchReadyStaticCreative).length;
  const selectedBlockedCount = selectedCreatives.length - selectedReadyCount;
  const recommendedRequiredCount = Math.min(3, creatives.length);
  const optionalIssueCount = Math.max(0, retryCount + missingCount - selectedBlockedCount);

  return {
    totalCount: creatives.length,
    selectedCount: selectedCreatives.length,
    selectedReadyCount,
    launchReadyCount: launchReadyCreatives.length,
    retryCount,
    missingCount,
    selectedBlockedCount,
    recommendedRequiredCount,
    allSelectedReady: selectedCreatives.length > 0 && selectedBlockedCount === 0,
    selectionLabel:
      selectedCreatives.length === 1
        ? "1 primary creative selected"
        : `${selectedCreatives.length} creatives selected`,
    readyLabel:
      launchReadyCreatives.length === 1
        ? "1 launch-ready preview available"
        : `${launchReadyCreatives.length} launch-ready previews available`,
    issueLabel:
      selectedBlockedCount > 0
        ? `${selectedBlockedCount} selected ${selectedBlockedCount === 1 ? "creative needs" : "creatives need"} retry before launch`
        : optionalIssueCount > 0
          ? `${optionalIssueCount} optional ${optionalIssueCount === 1 ? "variant needs" : "variants need"} retry`
          : null,
  };
}

export function getStaticPreviewStatusMessage(readiness: StaticCreativeReadiness) {
  if (readiness.totalCount === 0) {
    return null;
  }

  const requiredText =
    readiness.recommendedRequiredCount > 0
      ? `${readiness.recommendedRequiredCount} recommended for the launch test set`
      : null;
  const base = requiredText
    ? `${readiness.readyLabel}; ${requiredText}.`
    : `${readiness.readyLabel}.`;

  if (readiness.selectedBlockedCount > 0) {
    return `${base} ${readiness.issueLabel}.`;
  }

  if (readiness.issueLabel) {
    return `${base} ${readiness.issueLabel}; launch can continue with the selected ready creatives.`;
  }

  return base;
}

export function isPlayableVideoCreative(video: VideoCreativeReadinessInput | null | undefined) {
  return Boolean(video?.videoUrl) && video?.videoGenerationState !== "failed";
}

export function getVideoReadinessLabel(video: VideoCreativeReadinessInput | null | undefined) {
  if (isPlayableVideoCreative(video)) {
    return "Playable video ready";
  }

  if (video?.videoGenerationState === "generating") {
    return "Rendering";
  }

  if (video?.videoGenerationState === "failed") {
    return "Needs retry";
  }

  return "Concept ready, render needed";
}

export function getVideoReadinessMessage(video: VideoCreativeReadinessInput | null | undefined) {
  if (isPlayableVideoCreative(video)) {
    return "Rendered app-owned video preview is ready to review.";
  }

  if (video?.videoGenerationState === "generating") {
    return "Video preview is rendering. This page will update when the playable file is ready.";
  }

  if (video?.videoGenerationState === "failed") {
    return "Video preview needs another render attempt before it can be used for launch review.";
  }

  return "Script and concept are ready. Render the video preview before treating it as playable media.";
}
