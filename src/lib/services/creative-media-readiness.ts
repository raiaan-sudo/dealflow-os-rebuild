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

export type VideoCreativeReadinessInput = {
  id?: string | null;
  videoUrl?: string | null;
  videoGenerationState?: string | null;
  videoGenerationMessage?: string | null;
  providerName?: string | null;
  providerAssetId?: string | null;
  providerStatus?: string | null;
  storageNormalized?: boolean | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  storageContentType?: string | null;
  storageByteSize?: number | null;
  sourceStaticAssetId?: string | null;
  sourceImageUrl?: string | null;
  sourceStaticAccepted?: boolean | null;
  promptUsed?: string | null;
  promptSource?: string | null;
  promptHash?: string | null;
  scriptHash?: string | null;
  campaignSpecificContext?: {
    campaignId?: string | null;
    audience?: string | null;
    location?: string | null;
    offer?: string | null;
    cta?: string | null;
    persona?: string | null;
  } | null;
  videoQualityGate?: {
    accepted?: boolean | null;
    usable?: boolean | null;
    decision?: string | null;
    reasons?: string[] | null;
  } | null;
  videoQa?: {
    usable?: boolean | null;
    decision?: string | null;
    reasons?: string[] | null;
  } | null;
  sampleOnly?: boolean | null;
};

export type VideoQualityGateDecision = {
  accepted: boolean;
  usable: boolean;
  decision: "accept" | "review";
  reasons: string[];
  evaluatedAt: string;
  mode: "deterministic_provenance";
};

export type StaticCreativeReadiness = {
  totalCount: number;
  selectedCount: number;
  selectedReadyCount: number;
  launchReadyCount: number;
  retryCount: number;
  missingCount: number;
  selectedBlockedCount: number;
  optionalIssueCount: number;
  recommendedRequiredCount: number;
  allSelectedReady: boolean;
  selectedReadyLabel: string;
  availableReadyLabel: string;
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
  const selectedReadyLabel =
    selectedReadyCount === 1
      ? "1 selected launch-ready preview"
      : `${selectedReadyCount} selected launch-ready previews`;
  const availableReadyLabel =
    launchReadyCreatives.length === 1
      ? "1 launch-ready preview available"
      : `${launchReadyCreatives.length} launch-ready previews available`;

  return {
    totalCount: creatives.length,
    selectedCount: selectedCreatives.length,
    selectedReadyCount,
    launchReadyCount: launchReadyCreatives.length,
    retryCount,
    missingCount,
    selectedBlockedCount,
    optionalIssueCount,
    recommendedRequiredCount,
    allSelectedReady: selectedCreatives.length > 0 && selectedBlockedCount === 0,
    selectedReadyLabel,
    availableReadyLabel,
    selectionLabel:
      selectedCreatives.length === 1
        ? "1 primary creative selected"
        : `${selectedCreatives.length} creatives selected`,
    readyLabel: selectedCreatives.length > 0 ? selectedReadyLabel : availableReadyLabel,
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
  const readyText = readiness.selectedCount > 0 ? readiness.selectedReadyLabel : readiness.availableReadyLabel;
  const base = requiredText
    ? `${readyText}; ${requiredText}.`
    : `${readyText}.`;

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

function hasProviderError(video: VideoCreativeReadinessInput) {
  const message = video.videoGenerationMessage ?? "";

  return /providererror|provider error|failed|sample|demo|placeholder/i.test(message);
}

function hasPromptProvenance(video: VideoCreativeReadinessInput) {
  return Boolean(
    (video.promptHash || video.promptUsed) &&
      (video.promptSource === "creative_intake" ||
        video.promptSource === "campaign_specific_fallback"),
  );
}

function hasAcceptedVideoQa(video: VideoCreativeReadinessInput) {
  return (
    video.videoQualityGate?.accepted === true ||
    video.videoQualityGate?.usable === true ||
    video.videoQa?.usable === true ||
    video.videoQa?.decision === "accept"
  );
}

function looksLikeSampleVideo(video: VideoCreativeReadinessInput) {
  const value = [
    video.id,
    video.videoUrl,
    video.providerAssetId,
    video.promptSource,
  ].filter(Boolean).join(" ");

  return video.sampleOnly === true || /\b(sample|demo|mock|placeholder|template)\b/i.test(value);
}

export function evaluateGeneratedVideoQualityGate(
  video: VideoCreativeReadinessInput,
  now = new Date(),
): VideoQualityGateDecision {
  const reasons: string[] = [];

  if (!isPlayableVideoCreative(video)) {
    reasons.push("missing_playable_video");
  }

  if (looksLikeSampleVideo(video)) {
    reasons.push("sample_or_template_video");
  }

  if (video.storageNormalized !== true || video.storageBucket !== "creative-assets") {
    reasons.push("storage_not_normalized");
  }

  if (!/^video\/mp4\b/i.test(video.storageContentType ?? "")) {
    reasons.push("missing_mp4_storage_metadata");
  }

  if (typeof video.storageByteSize !== "number" || video.storageByteSize <= 0) {
    reasons.push("missing_storage_size");
  }

  if (!video.providerName || !video.providerAssetId) {
    reasons.push("missing_provider_provenance");
  }

  if (hasProviderError(video)) {
    reasons.push("provider_reported_issue");
  }

  if (!video.sourceStaticAssetId || !video.sourceImageUrl) {
    reasons.push("missing_source_static_asset");
  }

  if (video.sourceStaticAccepted !== true) {
    reasons.push("source_static_not_accepted");
  }

  if (!hasPromptProvenance(video)) {
    reasons.push("missing_prompt_provenance");
  }

  if (!video.scriptHash) {
    reasons.push("missing_script_hash");
  }

  if (!video.campaignSpecificContext?.campaignId) {
    reasons.push("missing_campaign_context");
  }

  const accepted = reasons.length === 0;

  return {
    accepted,
    usable: accepted,
    decision: accepted ? "accept" : "review",
    reasons,
    evaluatedAt: now.toISOString(),
    mode: "deterministic_provenance",
  };
}

export function getVideoLaunchReadinessReason(video: VideoCreativeReadinessInput | null | undefined) {
  if (!video) {
    return "No video concept is available yet.";
  }

  if (!isPlayableVideoCreative(video)) {
    return "No playable app-owned video file is available yet.";
  }

  if (looksLikeSampleVideo(video)) {
    return "This playable video is marked as a sample/template and is excluded from launch readiness.";
  }

  if (video.storageNormalized !== true || video.storageBucket !== "creative-assets") {
    return "The playable video is not normalized into DealFlow creative storage.";
  }

  if (!/^video\/mp4\b/i.test(video.storageContentType ?? "")) {
    return "The playable video is missing verified MP4 storage metadata.";
  }

  if (typeof video.storageByteSize !== "number" || video.storageByteSize <= 0) {
    return "The playable video is missing verified file size metadata.";
  }

  if (!video.providerName || !video.providerAssetId) {
    return "The playable video is missing provider job provenance.";
  }

  if (hasProviderError(video)) {
    return "The provider reported a video issue, so this asset needs review before launch.";
  }

  if (!video.sourceStaticAssetId || !video.sourceImageUrl) {
    return "The playable video is missing a campaign-specific source creative reference.";
  }

  if (video.sourceStaticAccepted !== true) {
    return "The playable video source creative has not passed the static media quality gate.";
  }

  if (!hasPromptProvenance(video) || !video.scriptHash) {
    return "The playable video is missing campaign-specific prompt or script provenance.";
  }

  if (!video.campaignSpecificContext?.campaignId) {
    return "The playable video is missing campaign-specific context metadata.";
  }

  if (!hasAcceptedVideoQa(video)) {
    return "The playable video is review-only until video QA accepts it for launch.";
  }

  return null;
}

export function isLaunchReadyVideoCreative(video: VideoCreativeReadinessInput | null | undefined) {
  return getVideoLaunchReadinessReason(video) === null;
}

export function getVideoReadinessLabel(video: VideoCreativeReadinessInput | null | undefined) {
  if (isLaunchReadyVideoCreative(video)) {
    return "Campaign-specific UGC ready";
  }

  if (isPlayableVideoCreative(video)) {
    return "Playable review sample";
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
  if (isLaunchReadyVideoCreative(video)) {
    return "Campaign-specific app-owned UGC video is ready for launch review.";
  }

  if (isPlayableVideoCreative(video)) {
    return getVideoLaunchReadinessReason(video) ??
      "Playable video is available for review, but it is not launch-ready UGC yet.";
  }

  if (video?.videoGenerationState === "generating") {
    return "Video preview is rendering. This page will update when the playable file is ready.";
  }

  if (video?.videoGenerationState === "failed") {
    return "Video preview needs another render attempt before it can be used for launch review.";
  }

  return "Script and concept are ready. Render the video preview before treating it as playable media.";
}
