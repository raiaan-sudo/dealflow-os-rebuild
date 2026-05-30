import { evaluateStaticVisualAssetDecision } from "@/lib/services/static-creative-visual-qa";
import type { FallbackLaunchQaResult } from "@/lib/services/creative-asset-status";
export const STATIC_LAUNCH_MIN_CREATIVE_COUNT = 4;
export const STATIC_LAUNCH_MAX_CREATIVE_COUNT = 6;

type StaticCreativeReadinessInput = {
  id: string;
  creativeAssetSource?: string | null;
  creativeAssetStatus?: string | null;
  creativeAssetQaStatus?: string | null;
  fallbackLaunchQa?: FallbackLaunchQaResult | null;
  imageUrl?: string | null;
  storageNormalized?: boolean | null;
  appComposedFinal?: boolean | null;
  qualityTier?: string | null;
  compositionVersion?: string | null;
  sourceBackgroundKind?: string | null;
  sourceBackgroundProvider?: string | null;
  sourceBackgroundAssetId?: string | null;
  imageGenerationState?: string | null;
  imageGenerationProvider?: string | null;
  generationMethod?: string | null;
  providerName?: string | null;
  generationMode?: string | null;
  assetRole?: string | null;
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
  visualQualityGate?: {
    accepted?: boolean | null;
  } | null;
  premiumQualityGate?: {
    accepted?: boolean | null;
  } | null;
  imageQa?: {
    usable?: boolean | null;
    decision?: string | null;
    mode?: string | null;
    reasons?: string[] | null;
  } | null;
  sourceImageQa?: {
    usable?: boolean | null;
    decision?: string | null;
    mode?: string | null;
    reasons?: string[] | null;
  } | null;
  staticBriefHash?: string | null;
  offerHash?: string | null;
  ctaHash?: string | null;
  brandHash?: string | null;
  approvedOfferTitle?: string | null;
  approvedCta?: string | null;
  approvedBrand?: string | null;
};

export type StaticCreativeBriefReadinessContext = {
  staticBriefHash?: string | null;
  offerHash?: string | null;
  ctaHash?: string | null;
  brandHash?: string | null;
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
  durationSeconds?: number | null;
  targetDurationSeconds?: number | null;
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
  videoProductQualityGate?: {
    accepted?: boolean | null;
    usable?: boolean | null;
    decision?: string | null;
    reasons?: string[] | null;
    checks?: {
      hook?: boolean | null;
      marketProblem?: boolean | null;
      creatorPointOfView?: boolean | null;
      mechanism?: boolean | null;
      sourceRelevance?: boolean | null;
      cta?: boolean | null;
      duration?: boolean | null;
    } | null;
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
  requiredReadyCount: number;
  requiredMissingCount: number;
  optionalReadyCount: number;
  retryCount: number;
  missingCount: number;
  selectedBlockedCount: number;
  optionalIssueCount: number;
  recommendedRequiredCount: number;
  minimumRequiredCount: number;
  selectedMinimumMet: boolean;
  allSelectedReady: boolean;
  selectedReadyLabel: string;
  availableReadyLabel: string;
  selectionLabel: string;
  readyLabel: string;
  issueLabel: string | null;
  staleCount: number;
  selectedStaleCount: number;
};

export function pluralizeCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function getStaticCreativeBriefMismatchReason(
  creative: Pick<StaticCreativeReadinessInput, "staticBriefHash" | "offerHash" | "ctaHash" | "brandHash">,
  context?: StaticCreativeBriefReadinessContext | null,
) {
  if (!context?.staticBriefHash) {
    return null;
  }

  if (!creative.staticBriefHash || creative.staticBriefHash !== context.staticBriefHash) {
    return "brief_hash_mismatch";
  }

  if (context.offerHash && creative.offerHash !== context.offerHash) {
    return "offer_hash_mismatch";
  }

  if (context.ctaHash && creative.ctaHash !== context.ctaHash) {
    return "cta_hash_mismatch";
  }

  if (context.brandHash && creative.brandHash !== context.brandHash) {
    return "brand_hash_mismatch";
  }

  return null;
}

export function isLaunchReadyStaticCreative(creative: Pick<
  StaticCreativeReadinessInput,
    | "creativeAssetSource"
    | "creativeAssetStatus"
    | "creativeAssetQaStatus"
    | "fallbackLaunchQa"
    | "imageUrl"
    | "storageNormalized"
    | "appComposedFinal"
    | "qualityTier"
    | "compositionVersion"
    | "imageGenerationProvider"
    | "generationMethod"
    | "providerName"
    | "generationMode"
    | "assetRole"
    | "sourceBackgroundKind"
    | "sourceBackgroundProvider"
    | "sourceBackgroundAssetId"
    | "imagePrompt"
    | "imagePromptConfig"
    | "visualPromptBrief"
    | "qualityGate"
    | "visualQualityGate"
    | "premiumQualityGate"
    | "imageQa"
    | "sourceImageQa"
    | "staticBriefHash"
    | "offerHash"
    | "ctaHash"
    | "brandHash"
>, context?: StaticCreativeBriefReadinessContext | null) {
  if (getStaticCreativeBriefMismatchReason(creative, context) !== null) {
    return false;
  }

  const explicitlyLaunchApproved =
    creative.creativeAssetStatus === "launch_approved" &&
    Boolean(creative.imageUrl) &&
    creative.storageNormalized === true &&
    (
      creative.creativeAssetQaStatus === "operator_approved" ||
      creative.creativeAssetQaStatus === "passed" ||
      (creative.creativeAssetSource === "fallback" && creative.fallbackLaunchQa?.passed === true)
    ) &&
    (
      creative.creativeAssetSource === "fallback" ||
      creative.creativeAssetSource === "branded_static" ||
      creative.creativeAssetSource === "manual"
    );

  if (explicitlyLaunchApproved) {
    return true;
  }

  return evaluateStaticVisualAssetDecision(creative).usable;
}

export function getStaticCreativeReadiness(
  creatives: StaticCreativeReadinessInput[],
  selectedIds: string[],
  context?: StaticCreativeBriefReadinessContext | null,
): StaticCreativeReadiness {
  const selectedIdSet = new Set(selectedIds);
  const selectedCreatives = creatives.filter((creative) => selectedIdSet.has(creative.id));
  const isCurrentLaunchReady = (creative: StaticCreativeReadinessInput) =>
    isLaunchReadyStaticCreative(creative, context);
  const staleCreatives = creatives.filter((creative) =>
    Boolean(creative.imageUrl) && getStaticCreativeBriefMismatchReason(creative, context) !== null,
  );
  const selectedStaleCount = selectedCreatives.filter((creative) =>
    getStaticCreativeBriefMismatchReason(creative, context) !== null,
  ).length;
  const launchReadyCreatives = creatives.filter(isCurrentLaunchReady);
  const retryCount = creatives.filter((creative) => {
    if (isCurrentLaunchReady(creative)) {
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
  const selectedReadyCount = selectedCreatives.filter(isCurrentLaunchReady).length;
  const selectedBlockedCount = selectedCreatives.length - selectedReadyCount;
  const minimumRequiredCount = STATIC_LAUNCH_MIN_CREATIVE_COUNT;
  const recommendedRequiredCount = STATIC_LAUNCH_MIN_CREATIVE_COUNT;
  const selectedMinimumMet = selectedReadyCount >= minimumRequiredCount;
  const optionalIssueCount = Math.max(0, retryCount + missingCount - selectedBlockedCount);
  const launchReadyMissingCount = Math.max(0, minimumRequiredCount - launchReadyCreatives.length);
  const requiredReadyCount = Math.min(launchReadyCreatives.length, minimumRequiredCount);
  const requiredMissingCount = Math.max(0, minimumRequiredCount - requiredReadyCount);
  const optionalReadyCount = Math.max(0, launchReadyCreatives.length - minimumRequiredCount);
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
    requiredReadyCount,
    requiredMissingCount,
    optionalReadyCount,
    retryCount,
    missingCount,
    selectedBlockedCount,
    optionalIssueCount,
    recommendedRequiredCount,
    minimumRequiredCount,
    selectedMinimumMet,
    allSelectedReady: selectedCreatives.length > 0 && selectedBlockedCount === 0 && selectedMinimumMet,
    selectedReadyLabel,
    availableReadyLabel,
    selectionLabel:
      selectedCreatives.length === 1
        ? "1 primary creative selected"
        : `${selectedCreatives.length} creatives selected`,
    readyLabel: selectedCreatives.length > 0 ? selectedReadyLabel : availableReadyLabel,
    issueLabel:
      selectedStaleCount > 0
        ? `Older render, needs refresh: ${selectedStaleCount} selected ${selectedStaleCount === 1 ? "creative" : "creatives"}`
        : selectedBlockedCount > 0
        ? `${selectedBlockedCount} selected ${selectedBlockedCount === 1 ? "creative needs" : "creatives need"} retry before launch`
        : selectedCreatives.length > 0 && !selectedMinimumMet
          ? `${minimumRequiredCount} launch-ready static ads required; select ${Math.max(0, minimumRequiredCount - selectedReadyCount)} more`
        : launchReadyMissingCount > 0
          ? `${minimumRequiredCount} launch-ready static ads required; ${launchReadyCreatives.length} available now. ${optionalIssueCount > 0 ? `${optionalIssueCount} ${optionalIssueCount === 1 ? "creative is" : "creatives are"} still preparing` : "Prepare premium ads before launch"}`
        : optionalIssueCount > 0
          ? `${optionalIssueCount} optional ${optionalIssueCount === 1 ? "polish variant is" : "polish variants are"} still preparing; launch-ready ads are available now`
          : null,
    staleCount: staleCreatives.length,
    selectedStaleCount,
  };
}

export function getStaticPreviewStatusMessage(readiness: StaticCreativeReadiness) {
  if (readiness.totalCount === 0) {
    return null;
  }

  const requiredText =
    readiness.recommendedRequiredCount > 0
      ? `${readiness.recommendedRequiredCount} required for launch`
      : null;
  const readyText = readiness.selectedCount > 0 ? readiness.selectedReadyLabel : readiness.availableReadyLabel;
  const base = requiredText
    ? `${readyText}; ${requiredText}.`
    : `${readyText}.`;

  if (readiness.selectedBlockedCount > 0) {
    return `${base} ${readiness.issueLabel}.`;
  }

  if (readiness.selectedCount > 0 && !readiness.selectedMinimumMet) {
    return `${base} ${readiness.issueLabel}.`;
  }

  if (readiness.issueLabel && readiness.selectedMinimumMet) {
    return `${base} ${readiness.issueLabel}; launch can continue with the selected ready creatives.`;
  }

  if (readiness.issueLabel) {
    return `${base} ${readiness.issueLabel}.`;
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

function hasAcceptedProductQualityGate(video: VideoCreativeReadinessInput) {
  const gate = video.videoProductQualityGate;
  const checks = gate?.checks;

  return Boolean(
    gate?.accepted === true &&
      gate?.usable !== false &&
      checks?.hook === true &&
      checks?.marketProblem === true &&
      checks?.creatorPointOfView === true &&
      checks?.mechanism === true &&
      checks?.sourceRelevance === true &&
      checks?.cta === true &&
      checks?.duration !== false,
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

function hasSupportedLaunchVideoContentType(contentType?: string | null) {
  return /^(video\/mp4|video\/webm|video\/quicktime)\b/i.test(contentType ?? "");
}

function hasLaunchQualityDuration(video: VideoCreativeReadinessInput) {
  return typeof video.durationSeconds === "number" && Number.isFinite(video.durationSeconds) && video.durationSeconds >= 15;
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

  if (!hasSupportedLaunchVideoContentType(video.storageContentType)) {
    reasons.push("missing_supported_video_storage_metadata");
  }

  if (typeof video.storageByteSize !== "number" || video.storageByteSize <= 0) {
    reasons.push("missing_storage_size");
  }

  if (typeof video.durationSeconds !== "number" || !Number.isFinite(video.durationSeconds)) {
    reasons.push("missing_video_duration_metadata");
  } else if (!hasLaunchQualityDuration(video)) {
    reasons.push("video_duration_too_short");
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

  if (!hasAcceptedProductQualityGate(video)) {
    reasons.push("missing_product_quality_acceptance");
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
    return "The playable video still needs final DealFlow preparation before launch.";
  }

  if (!hasSupportedLaunchVideoContentType(video.storageContentType)) {
    return "The playable video still needs final file verification before launch.";
  }

  if (typeof video.storageByteSize !== "number" || video.storageByteSize <= 0) {
    return "The playable video still needs final file verification before launch.";
  }

  if (typeof video.durationSeconds !== "number" || !Number.isFinite(video.durationSeconds)) {
    return "The playable video is missing verified duration metadata; confirm it is a 15-30 second UGC ad before launch.";
  }

  if (!hasLaunchQualityDuration(video)) {
    return "The playable video is too short for launch-quality UGC; render a 15-30 second version before launch.";
  }

  if (!video.providerName || !video.providerAssetId) {
    return "The playable video is missing final render proof.";
  }

  if (hasProviderError(video)) {
    return "The video render reported an issue, so this asset needs review before launch.";
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
    return "The playable video is review-only until DealFlow review accepts it for launch.";
  }

  if (!hasAcceptedProductQualityGate(video)) {
    return "The playable video is review-only until DealFlow review confirms the hook, market problem, creator point of view, source relevance, and CTA.";
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

  if (
    video?.videoGenerationState === "deferred_worker_required" ||
    video?.videoGenerationState === "operator_action_required"
  ) {
    return "Video render preparing";
  }

  if (video?.videoGenerationState === "queued") {
    return "Video render preparing";
  }

  if (video?.videoGenerationState === "generating") {
    return video.providerAssetId || video.providerStatus
      ? "Rendering"
      : "Video render preparing";
  }

  if (video?.videoGenerationState === "failed") {
    return "Render needs retry";
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

  if (
    video?.videoGenerationState === "deferred_worker_required" ||
    video?.videoGenerationState === "operator_action_required"
  ) {
    return "Video render is preparing. We'll update this when rendering starts.";
  }

  if (video?.videoGenerationState === "queued") {
    return "Video render is preparing. We'll update this when rendering starts.";
  }

  if (video?.videoGenerationState === "generating") {
    return video.providerAssetId || video.providerStatus
      ? "Rendering video..."
      : "Video render is preparing. We'll update this when rendering starts.";
  }

  if (video?.videoGenerationState === "failed") {
    return "Render needs retry.";
  }

  return "Script and concept are ready. Render the video preview before treating it as playable media.";
}
