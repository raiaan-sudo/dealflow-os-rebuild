"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { Captions, Clapperboard, Gauge, Image as ImageIcon, Mic2, Sparkles } from "lucide-react";
import {
  StaticCreativePreviewCard,
} from "@/components/campaign/static-creative-preview-card";
import { CustomerVideoPlayer } from "@/components/campaign/customer-video-player";
import { GenerationCreditTopUpPanel } from "@/components/billing/generation-credit-top-up-panel";
import { Button } from "@/components/ui/button";
import {
  classifyCreativeRenderJob,
  isMarketingStudioWorkerDeferredRunAt,
  type CreativeRenderStateView,
} from "@/lib/services/creative-render-state";
import {
  getStaticCreativeReadiness,
  getStaticCreativeBriefMismatchReason,
  getStaticPreviewStatusMessage,
  getVideoReadinessLabel,
  getVideoReadinessMessage,
  getVideoLaunchReadinessReason,
  isLaunchReadyStaticCreative,
  isLaunchReadyVideoCreative,
  isPlayableVideoCreative,
  STATIC_LAUNCH_MAX_CREATIVE_COUNT,
  STATIC_LAUNCH_MIN_CREATIVE_COUNT,
} from "@/lib/services/creative-media-readiness";
import type { CampaignCategory } from "@/lib/services/campaign-creative-strategy";
import {
  evaluateStaticCreativeLaunchSafety,
  evaluateStaticCreativeQualityAdvisory,
} from "@/lib/services/static-creative-visual-qa";

type CreativeOption = {
  id: string;
  headline: string;
  primaryText: string;
  cta: string;
  score: number;
  recommended?: boolean;
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
  imageGenerationMessage?: string | null;
  imagePrompt?: string | null;
  imagePromptConfig?: {
    prompt?: string | null;
    negativePrompt?: string | null;
  } | null;
  overlayText?: string | null;
  offer?: string | null;
  category?: CampaignCategory | string | null;
  location?: string | null;
  formatLabel?: string | null;
  qualityGate?: {
    score?: number | null;
    accepted?: boolean | null;
    hardFailures?: string[] | null;
  } | null;
  visualQualityGate?: {
    accepted?: boolean | null;
    mode?: string | null;
    reasons?: string[] | null;
  } | null;
  premiumQualityGate?: {
    accepted?: boolean | null;
    mode?: string | null;
    reasons?: string[] | null;
  } | null;
  imageQa?: {
    usable?: boolean | null;
    decision?: "accept" | "reject" | "review" | string | null;
    mode?: string | null;
    reasons?: string[] | null;
    textDensity?: number | null;
    layoutRisk?: number | null;
    detectedTextSamples?: string[] | null;
  } | null;
  sourceImageQa?: {
    usable?: boolean | null;
    decision?: "accept" | "reject" | "review" | string | null;
    mode?: string | null;
    reasons?: string[] | null;
    textDensity?: number | null;
    layoutRisk?: number | null;
    detectedTextSamples?: string[] | null;
  } | null;
  visualPromptBrief?: {
    category?: CampaignCategory | string | null;
    visualAssetContract?: string | null;
    visualAssetRole?: string | null;
    proofStyle?: string | null;
    mechanism?: string | null;
    visualLogic?: string[] | null;
    overlayLogic?: string[] | null;
  } | null;
  briefHash?: string | null;
  staticBriefHash?: string | null;
  offerHash?: string | null;
  ctaHash?: string | null;
  brandHash?: string | null;
  approvedOfferTitle?: string | null;
  approvedCta?: string | null;
  approvedBrand?: string | null;
  breakdown?: {
    hook?: string;
    concept?: string;
  };
};

type VideoCreativeOption = {
  id: string;
  index: number;
  conceptType: "founder_expert" | "customer_ugc";
  title: string;
  hook: string;
  script: string[];
  shotList: string[];
  onScreenText: string[];
  cta: string;
  creatorStyle: string;
  voiceStyle: string;
  videoUrl?: string | null;
  videoGenerationState?: "generated" | "generating" | "failed" | "unavailable" | string | null;
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
  briefHash?: string | null;
  ugcScriptHash?: string | null;
  briefRevisionNumber?: number | null;
  campaignSpecificContext?: {
    campaignId?: string | null;
    creativeId?: string | null;
    copyId?: string | null;
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
  qualityGate?: {
    score?: number | null;
    accepted?: boolean | null;
    hardFailures?: string[] | null;
  } | null;
};

type CreativeWizardProps = {
  campaignId: string;
  creatives: CreativeOption[];
  approvedBriefContext?: {
    offerTitle?: string | null;
    audience?: string | null;
    market?: string | null;
    brand?: string | null;
    cta?: string | null;
    staticStyle?: string | null;
    revisionNumber?: number | null;
    briefHash?: string | null;
    staticBriefHash?: string | null;
    offerHash?: string | null;
    ctaHash?: string | null;
    brandHash?: string | null;
    ugcScriptHash?: string | null;
  } | null;
  approvedUgcScriptHash?: string | null;
  approvedUgcScriptLines?: string[];
  persistedSelectedAdIds?: string[];
  persistedSelectedUgcVideoIds?: string[];
  videoCreatives?: VideoCreativeOption[];
  initialRenderJobs?: SystemJob[];
  generationCreditOverrideActive?: boolean;
};

type StudioPhase = "static_ads" | "ugc_videos";

type SystemJob = {
  id: string;
  kind?: string | null;
  status?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  next_run_at?: string | null;
  locked_by?: string | null;
  locked_until?: string | null;
  attempt_count?: number | null;
  retry_count?: number | null;
  max_attempts?: number | null;
  reviewed_at?: string | null;
  dead_lettered_at?: string | null;
  last_error_code?: string | null;
  error_message?: string | null;
  payload?: {
    creativeIndex?: number | null;
    creativeIntake?: {
      ugcScriptHash?: string | null;
      briefHash?: string | null;
      staticBriefHash?: string | null;
    } | null;
  } | null;
  result?: {
    staticAds?: CreativeOption[] | null;
  } | null;
  renderState?: CreativeRenderStateView | null;
};

function jobRenderView(job: SystemJob | null | undefined) {
  return job?.renderState ?? classifyCreativeRenderJob(job);
}

function isOpenRenderJob(job: SystemJob | null | undefined) {
  if (job?.reviewed_at || job?.dead_lettered_at) {
    return false;
  }

  return job?.status === "pending" || job?.status === "processing";
}

function upsertRenderJob(jobs: SystemJob[], job: SystemJob) {
  return [job, ...jobs.filter((candidate) => candidate.id !== job.id)].slice(0, 12);
}

function isUgcCreative(creative: CreativeOption) {
  return /\bugc\b/i.test(`${creative.id} ${creative.formatLabel ?? ""} ${creative.breakdown?.concept ?? ""}`);
}

function videoMatchesApprovedScript(video: VideoCreativeOption, approvedUgcScriptHash?: string | null) {
  return !approvedUgcScriptHash || video.ugcScriptHash === approvedUgcScriptHash || video.scriptHash === approvedUgcScriptHash;
}

function creativeNeedsImageGeneration(creative: CreativeOption, approvedBriefContext?: CreativeWizardProps["approvedBriefContext"]) {
  const launchSafety = evaluateStaticCreativeLaunchSafety(creative);

  return !creative.imageUrl ||
    !launchSafety.passed ||
    getStaticCreativeBriefMismatchReason(creative, approvedBriefContext) !== null;
}

function customerVideoMessage(message?: string | null) {
  const text = message?.trim();

  if (!text) {
    return null;
  }

  if (/operator diagnostics|provider usage guard|explicitly enabled|generation is disabled|provider|configured|credentials/i.test(text)) {
    return "Video preview is temporarily unavailable. Your campaign can continue with static creatives while we resolve video rendering.";
  }

  return text;
}

function customerImageMessage(message?: string | null) {
  const text = message?.trim();

  if (!text) {
    return null;
  }

  if (
    /provider usage guard|explicitly enabled|generation is disabled|provider|configured|credentials|api key|schema|rpc/i.test(text) ||
    /open\s*ai|higgs?field|hey\s*gen|gpt-image|model|timed?\s*out|timeout|api\.|https?:\/\//i.test(text)
  ) {
    return "Image preview rendering needs another attempt.";
  }

  return text;
}

const STATIC_RENDER_TIMEFRAME_MESSAGE =
  "Sent for generation. Usually takes 90 seconds to 3 minutes. Preview renders unlock when they are ready.";

const STATIC_RENDER_READY_TO_LOAD_MESSAGE =
  "Preview renders are ready. Click Show preview renders to load the finished assets into this page.";

function isCreditsInsufficient(code?: string | null, message?: string | null) {
  return code === "credits_insufficient" || /credits?\s+insufficient|generation credits/i.test(message ?? "");
}

function getImageLimitMessage(creatives: CreativeOption[]) {
  const blockedCreative = creatives.find((creative) =>
    /maximum \d+ AI image generation|maximum \d+ AI image generations|daily image generation limit|provider_usage_limit_reached|session already used the maximum/i.test(
      creative.imageGenerationMessage ?? "",
    ),
  );

  return blockedCreative
    ? "Daily image refresh limit reached for this campaign. Instant composed previews stay available; try again after the daily limit resets."
    : null;
}

export function CreativeWizard({
  campaignId,
  creatives,
  approvedBriefContext = null,
  approvedUgcScriptHash = null,
  approvedUgcScriptLines = [],
  initialRenderJobs = [],
  persistedSelectedAdIds = [],
  persistedSelectedUgcVideoIds = [],
  videoCreatives = [],
  generationCreditOverrideActive = false,
}: CreativeWizardProps) {
  const router = useRouter();
  const jobStreamsRef = useRef<Map<string, EventSource>>(new Map());
  const autoVideoStartedRef = useRef(false);
  const staticBriefReadinessContext = useMemo(() => approvedBriefContext
    ? {
        staticBriefHash: approvedBriefContext.staticBriefHash,
        offerHash: approvedBriefContext.offerHash,
        ctaHash: approvedBriefContext.ctaHash,
        brandHash: approvedBriefContext.brandHash,
      }
    : null, [approvedBriefContext]);
  const isStaticLaunchReady = useCallback(
    (creative: CreativeOption) => isLaunchReadyStaticCreative(creative, staticBriefReadinessContext),
    [staticBriefReadinessContext],
  );
  const buildHref = `/builder?campaignId=${encodeURIComponent(campaignId)}`;
  const rankedCreatives = useMemo(
    () => [...creatives].sort((left, right) => {
      const readinessDelta = Number(isStaticLaunchReady(right)) - Number(isStaticLaunchReady(left));
      return readinessDelta || (right.score ?? 0) - (left.score ?? 0);
    }),
    [creatives, isStaticLaunchReady],
  );
  const launchReadyCreatives = rankedCreatives.filter(isStaticLaunchReady);
  const recommendedStaticCount =
    launchReadyCreatives.length >= STATIC_LAUNCH_MIN_CREATIVE_COUNT
      ? STATIC_LAUNCH_MIN_CREATIVE_COUNT
      : launchReadyCreatives.length;
  const topCreatives = launchReadyCreatives.slice(0, recommendedStaticCount);
  const topUgcCreatives = launchReadyCreatives
    .filter((creative) => /\bugc\b/i.test(`${creative.id} ${creative.formatLabel ?? ""}`))
    .slice(0, 2);
  const availableIds = useMemo(() => new Set(rankedCreatives.map((creative) => creative.id)), [rankedCreatives]);
  const launchReadyIds = useMemo(() => new Set(launchReadyCreatives.map((creative) => creative.id)), [launchReadyCreatives]);
  const savedSelectedIds = persistedSelectedAdIds
    .filter((id) => availableIds.has(id) && launchReadyIds.has(id))
    .slice(0, 6);
  const recommendedSelectedIds = topCreatives.length > 0
    ? Array.from(
        new Set(
          topUgcCreatives.length > 0
            ? [
                ...topCreatives
                  .filter((creative) => !topUgcCreatives.some((ugcCreative) => ugcCreative.id === creative.id))
                  .slice(0, Math.max(1, recommendedStaticCount - topUgcCreatives.length)),
                ...topUgcCreatives,
              ].map((creative) => creative.id)
            : topCreatives.map((creative) => creative.id),
        ),
      )
    : [];
  const defaultSelectedIds = savedSelectedIds.length > 0 ? savedSelectedIds : recommendedSelectedIds;
  const minSelected = rankedCreatives.length >= STATIC_LAUNCH_MIN_CREATIVE_COUNT
    ? STATIC_LAUNCH_MIN_CREATIVE_COUNT
    : rankedCreatives.length;
  const maxSelected = Math.min(
    STATIC_LAUNCH_MAX_CREATIVE_COUNT,
    Math.max(minSelected, launchReadyCreatives.length || rankedCreatives.length),
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultSelectedIds);
  const [saving, setSaving] = useState(false);
  const [renderingImages, setRenderingImages] = useState(false);
  const [renderingVideo, setRenderingVideo] = useState(false);
  const [activeImageJobId, setActiveImageJobId] = useState<string | null>(null);
  const [activeVideoJobId, setActiveVideoJobId] = useState<string | null>(null);
  const [renderJobs, setRenderJobs] = useState<SystemJob[]>(initialRenderJobs);
  const [renderMessage, setRenderMessage] = useState<string | null>(null);
  const [previewRendersReadyToLoad, setPreviewRendersReadyToLoad] = useState(false);
  const [previewRendersLoading, setPreviewRendersLoading] = useState(false);
  const [videoMessage, setVideoMessage] = useState<string | null>(null);
  const [renderClockMs, setRenderClockMs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [creditTopUpSurface, setCreditTopUpSurface] = useState<"image" | "video" | null>(null);
  const [fullVideoOpen, setFullVideoOpen] = useState(false);
  const [expandedStaticCreativeId, setExpandedStaticCreativeId] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<StudioPhase>("static_ads");
  const [activeCreativeId, setActiveCreativeId] = useState<string | null>(
    defaultSelectedIds[0] ?? rankedCreatives[0]?.id ?? null,
  );
  const selectedCreatives = rankedCreatives.filter((creative) => selectedIds.includes(creative.id));
  const selectedLaunchReadyCreatives = selectedCreatives.filter(isStaticLaunchReady);
  const launchPackageCreatives = selectedLaunchReadyCreatives.slice(0, maxSelected);
  const staticReadiness = getStaticCreativeReadiness(rankedCreatives, selectedIds, staticBriefReadinessContext);
  const primaryCreative = selectedCreatives[0] ?? rankedCreatives[0] ?? null;
  const activeCreative =
    rankedCreatives.find((creative) => creative.id === activeCreativeId) ??
    primaryCreative;
  const activeCreativeLaunchReady = activeCreative ? isStaticLaunchReady(activeCreative) : false;
  const activeCreativeLaunchSafety = activeCreative ? evaluateStaticCreativeLaunchSafety(activeCreative) : null;
  const activeCreativeQualityAdvisory = activeCreative ? evaluateStaticCreativeQualityAdvisory(activeCreative) : null;
  const activeCreativeHardBlocked = Boolean(
    activeCreative &&
    !activeCreativeLaunchReady &&
    (
      activeCreative.imageGenerationState === "failed" ||
      (activeCreativeLaunchSafety?.blockers.length ?? 0) > 0
    ),
  );
  const canContinue = selectedCreatives.length >= minSelected && selectedCreatives.length <= maxSelected;
  const selectedMediaReady =
    staticReadiness.allSelectedReady;
  const savedSelectionMatchesCurrent =
    savedSelectedIds.length === selectedIds.length &&
    savedSelectedIds.every((selectedId, index) => selectedId === selectedIds[index]);
  const allImagesMissing = rankedCreatives.every((creative) => !creative.imageUrl);
  const needsImageGeneration = rankedCreatives.some((creative) => creativeNeedsImageGeneration(creative, approvedBriefContext));
  const selectedNeedsImageGeneration = selectedCreatives.some((creative) => creativeNeedsImageGeneration(creative, approvedBriefContext));
  const hasGeneratedImages = rankedCreatives.some((creative) => Boolean(creative.imageUrl));
  const hasCurrentStaticVideoSource = launchReadyCreatives.some((creative) => Boolean(creative.imageUrl));
  const hasAttemptedImageGeneration = rankedCreatives.some(
    (creative) => Boolean(creative.imageGenerationMessage) || Boolean(creative.imageGenerationState),
  );
  const hasPersistedCreditBlocker = rankedCreatives.some((creative) =>
    /insufficient credits|add at least/i.test(creative.imageGenerationMessage ?? ""),
  );
  const hasCreditBlocker = !generationCreditOverrideActive && hasPersistedCreditBlocker;
  const imageLimitMessage = getImageLimitMessage(rankedCreatives);
  const ugcQuotaAvailable = rankedCreatives.some(isUgcCreative);
  const selectedUgcCount = selectedCreatives.filter(isUgcCreative).length;
  const ugcQuotaSatisfied = !ugcQuotaAvailable || selectedUgcCount >= 1;
  const isCurrentLaunchReadyVideo = (video: VideoCreativeOption) =>
    isLaunchReadyVideoCreative(video) &&
    videoMatchesApprovedScript(video, approvedUgcScriptHash);
  const launchReadyVideoCreatives = videoCreatives.filter(isCurrentLaunchReadyVideo);
  const reviewableVideoCreatives =
    launchReadyVideoCreatives.length > 0 ? launchReadyVideoCreatives : videoCreatives;
  const savedSelectedUgcVideoIds = persistedSelectedUgcVideoIds
    .filter((id) => videoCreatives.some((video) => video.id === id && isCurrentLaunchReadyVideo(video)))
    .slice(0, 3);
  const primaryVideoCreative =
    reviewableVideoCreatives.find((video) => savedSelectedUgcVideoIds.includes(video.id)) ??
    reviewableVideoCreatives.find((video) => video.conceptType === "customer_ugc" && isCurrentLaunchReadyVideo(video)) ??
    reviewableVideoCreatives.find((video) => video.conceptType === "customer_ugc") ??
    reviewableVideoCreatives[0] ??
    null;
  const [selectedUgcVideoIds, setSelectedUgcVideoIds] = useState<string[]>(savedSelectedUgcVideoIds);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(primaryVideoCreative?.id ?? null);
  const activeVideoCreative =
    reviewableVideoCreatives.find((video) => video.id === activeVideoId) ??
    primaryVideoCreative;
  const activeVideoMatchesApprovedScript = activeVideoCreative
    ? videoMatchesApprovedScript(activeVideoCreative, approvedUgcScriptHash)
    : false;
  const activeVideoLaunchReady = Boolean(
    activeVideoCreative &&
    activeVideoCreative.conceptType === "customer_ugc" &&
    isCurrentLaunchReadyVideo(activeVideoCreative),
  );
  const activeVideoHasCurrentPlayableRender = Boolean(
    activeVideoCreative &&
    activeVideoMatchesApprovedScript &&
    isPlayableVideoCreative(activeVideoCreative),
  );
  const activeVideoLaunchReadinessReason =
    activeVideoCreative && !activeVideoLaunchReady
      ? getVideoLaunchReadinessReason(activeVideoCreative)
      : null;
  const activeVideoPlayableReviewOnly = Boolean(
    activeVideoCreative &&
    isPlayableVideoCreative(activeVideoCreative) &&
    !activeVideoLaunchReady,
  );
  const activeVideoDisplayScript =
    !activeVideoMatchesApprovedScript && approvedUgcScriptLines.length > 0
      ? approvedUgcScriptLines
      : activeVideoCreative?.script ?? [];
  const selectedUgcVideos = videoCreatives.filter((video) => selectedUgcVideoIds.includes(video.id));
  const selectedLaunchReadyUgcVideos = selectedUgcVideos.filter(
    (video) => video.conceptType === "customer_ugc" && isCurrentLaunchReadyVideo(video),
  );
  const videoSelectionRequired = false;
  const selectedUgcReady = !videoSelectionRequired || selectedLaunchReadyUgcVideos.length > 0;
  const staticLaunchPackageReady = canContinue && selectedMediaReady;
  const videoNeedsGeneration = Boolean(
    primaryVideoCreative &&
    !primaryVideoCreative.videoUrl &&
    primaryVideoCreative.videoGenerationState !== "generating" &&
    primaryVideoCreative.videoGenerationState !== "generated",
  );
  const currentImageJob =
    renderJobs.find((job) =>
      job.kind === "static_creative_generation" &&
      isOpenRenderJob(job),
    ) ?? null;
  const currentImageRenderView = currentImageJob ? jobRenderView(currentImageJob) : null;
  const currentVideoJob =
    activeVideoCreative
      ? renderJobs.find((job) =>
          job.kind === "video_generation" &&
          isOpenRenderJob(job) &&
          Number(job.payload?.creativeIndex ?? 0) === activeVideoCreative.index &&
          (!approvedUgcScriptHash || job.payload?.creativeIntake?.ugcScriptHash === approvedUgcScriptHash),
        ) ?? null
      : null;
  const currentVideoStatusJob =
    activeVideoCreative
      ? renderJobs.find((job) =>
          job.kind === "video_generation_status" &&
          isOpenRenderJob(job),
        ) ?? null
      : null;
  const currentVideoRenderJob = currentVideoJob ?? currentVideoStatusJob;
  const currentVideoRenderView = currentVideoRenderJob ? jobRenderView(currentVideoRenderJob) : null;

  useEffect(() => {
    if (!currentImageJob) {
      return;
    }

    setRenderClockMs(Date.now());
    const interval = window.setInterval(() => setRenderClockMs(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [currentImageJob?.id]);

  useEffect(() => {
    if (!currentVideoRenderJob && !activeVideoJobId) {
      return;
    }

    const interval = window.setInterval(() => {
      router.refresh();
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [activeVideoJobId, currentVideoRenderJob?.id, currentVideoRenderJob?.status, router]);

  const subscribeToJob = useCallback((jobId: string, surface: "image" | "video") => {
    if (jobStreamsRef.current.has(jobId)) {
      return;
    }

    const source = new EventSource(`/api/system-jobs/${encodeURIComponent(jobId)}/stream`);
    jobStreamsRef.current.set(jobId, source);
    if (surface === "video") {
      setActiveVideoJobId(jobId);
    } else {
      setActiveImageJobId(jobId);
    }

    const clearActiveJob = () => {
      if (surface === "video") {
        setActiveVideoJobId((current) => current === jobId ? null : current);
      } else {
        setActiveImageJobId((current) => current === jobId ? null : current);
      }
    };
    source.addEventListener("job", (event) => {
      try {
        const job = JSON.parse((event as MessageEvent).data) as SystemJob;
        const renderView = jobRenderView(job);
        setRenderJobs((current) => upsertRenderJob(current, job));

        if (job.status === "completed") {
          if (surface === "video") {
            setVideoMessage("Video preview is processing. This page will update when it is ready.");
          } else {
            setPreviewRendersReadyToLoad(true);
            setRenderMessage(STATIC_RENDER_READY_TO_LOAD_MESSAGE);
          }
          source.close();
          jobStreamsRef.current.delete(jobId);
          clearActiveJob();
          if (surface === "video") {
            router.refresh();
          }
        } else if (job.status === "failed") {
          if (isCreditsInsufficient(job.last_error_code, job.error_message)) {
            setCreditTopUpSurface(surface);
          }
          if (surface === "video") {
            setVideoMessage(customerVideoMessage(renderView.customerMessage || job.error_message) || "Render needs retry.");
          } else {
            setRenderMessage(customerImageMessage(renderView.customerMessage || job.error_message) || "Render needs retry.");
          }
          source.close();
          jobStreamsRef.current.delete(jobId);
          clearActiveJob();
          if (surface === "video") {
            router.refresh();
          }
        } else if (isMarketingStudioWorkerDeferredRunAt(job.next_run_at)) {
          if (surface === "video") {
            setVideoMessage(renderView.customerMessage);
          } else {
            setRenderMessage(renderView.customerMessage);
          }
        } else if (job.status === "pending" || job.status === "processing") {
          if (surface === "video") {
            setVideoMessage(renderView.customerMessage);
          } else {
            setRenderMessage(renderView.customerMessage);
          }
        }
      } catch {
        source.close();
        jobStreamsRef.current.delete(jobId);
        clearActiveJob();
      }
    });

    source.addEventListener("error", () => {
      source.close();
      jobStreamsRef.current.delete(jobId);
      clearActiveJob();
    });
  }, [router, selectedIds, staticBriefReadinessContext]);

  const queueImagePreviews = useCallback(async ({ force = false, automatic = false, missingOnly = false } = {}) => {
    if (renderingImages) {
      return;
    }

    setRenderingImages(true);
    setError(null);
    setCreditTopUpSurface(null);
    setPreviewRendersReadyToLoad(false);
    setPreviewRendersLoading(false);
    setRenderMessage(STATIC_RENDER_TIMEFRAME_MESSAGE);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/generate-static-ads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          force,
          missingOnly,
          maxGenerations: STATIC_LAUNCH_MIN_CREATIVE_COUNT,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { job?: SystemJob | null; error?: string | null; code?: string | null; previewUpdated?: boolean }
        | null;

      if (!response.ok || !data?.job?.id) {
        if (isCreditsInsufficient(data?.code, data?.error)) {
          setCreditTopUpSurface("image");
          setRenderMessage(null);
          return;
        }
        throw new Error(data?.error || "Image preview rendering could not start.");
      }

      const renderView = jobRenderView(data.job);
      setRenderJobs((current) => upsertRenderJob(current, data.job as SystemJob));
      setRenderMessage(
        data.previewUpdated
          ? "Draft previews are visible while final ads render."
          : renderView.customerMessage || STATIC_RENDER_TIMEFRAME_MESSAGE,
      );
      subscribeToJob(data.job.id, "image");
    } catch (renderError) {
      setRenderMessage(null);
      setError(
        customerImageMessage(renderError instanceof Error ? renderError.message : null) ??
          "Image preview rendering could not start.",
      );
    } finally {
      setRenderingImages(false);
    }
  }, [campaignId, renderingImages, router, subscribeToJob]);

  useEffect(() => {
    if (!currentImageJob?.id) {
      return;
    }

    subscribeToJob(currentImageJob.id, "image");
  }, [currentImageJob?.id, subscribeToJob]);

  const showPreviewRenders = useCallback(() => {
    if (!previewRendersReadyToLoad || previewRendersLoading) {
      return;
    }

    setPreviewRendersLoading(true);
    setRenderMessage("Loading finished preview renders...");
    router.refresh();
  }, [previewRendersLoading, previewRendersReadyToLoad, router]);

  const queueVideoPreview = useCallback(async ({
    force = false,
    automatic = false,
    video,
  }: {
    force?: boolean;
    automatic?: boolean;
    video?: VideoCreativeOption | null;
  } = {}) => {
    const selectedVideo = video ?? activeVideoCreative;

    if (renderingVideo || !selectedVideo) {
      return;
    }

    if (!hasCurrentStaticVideoSource) {
      setVideoMessage("Render at least one current static creative first. UGC video preview needs a launch-ready image source before video rendering can start.");
      return;
    }

    setActiveVideoId(selectedVideo.id);
    setRenderingVideo(true);
    setError(null);
    setCreditTopUpSurface(null);
    setVideoMessage(
      automatic
        ? "Preparing video preview automatically. You can keep choosing static creatives while it renders."
        : "Preparing video preview.",
    );

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/generate-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          creativeIndex: selectedVideo.index,
          force,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { job?: SystemJob | null; error?: string | null; code?: string | null }
        | null;

      if (!response.ok || !data?.job?.id) {
        if (isCreditsInsufficient(data?.code, data?.error)) {
          setCreditTopUpSurface("video");
          setVideoMessage(null);
          return;
        }
        throw new Error(data?.error || "Video preview rendering could not start.");
      }

      const renderView = jobRenderView(data.job);
      setRenderJobs((current) => upsertRenderJob(current, data.job as SystemJob));
      setActiveVideoJobId(data.job.id);
      setVideoMessage(renderView.customerMessage);
      if (!isMarketingStudioWorkerDeferredRunAt(data.job.next_run_at)) {
        subscribeToJob(data.job.id, "video");
      } else {
        router.refresh();
      }
    } catch (videoError) {
      const customerMessage =
        customerVideoMessage(videoError instanceof Error ? videoError.message : null) ??
        "Video preview rendering could not start.";
      setVideoMessage(customerMessage);
      setError(customerMessage);
    } finally {
      setRenderingVideo(false);
    }
  }, [activeVideoCreative, campaignId, hasCurrentStaticVideoSource, renderingVideo, router, setActiveVideoId, subscribeToJob]);

  useEffect(() => {
    const streams = jobStreamsRef.current;

    return () => {
      streams.forEach((source) => source.close());
      streams.clear();
    };
  }, []);

  useEffect(() => {
    if (!videoNeedsGeneration || autoVideoStartedRef.current) {
      return;
    }

    autoVideoStartedRef.current = true;
    setVideoMessage("Video concept is drafted. Render and approve a campaign-specific preview before treating it as launch-ready UGC.");
  }, [videoNeedsGeneration]);

  useEffect(() => {
    if (!activeVideoId || reviewableVideoCreatives.some((video) => video.id === activeVideoId)) {
      return;
    }

    setActiveVideoId(primaryVideoCreative?.id ?? reviewableVideoCreatives[0]?.id ?? null);
  }, [activeVideoId, primaryVideoCreative?.id, reviewableVideoCreatives]);

  useEffect(() => {
    if (!activeCreativeId || rankedCreatives.some((creative) => creative.id === activeCreativeId)) {
      return;
    }

    setActiveCreativeId(primaryCreative?.id ?? rankedCreatives[0]?.id ?? null);
  }, [activeCreativeId, primaryCreative?.id, rankedCreatives]);

  useEffect(() => {
    if (!expandedStaticCreativeId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpandedStaticCreativeId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedStaticCreativeId]);

  useEffect(() => {
    if (recommendedSelectedIds.length === 0) {
      return;
    }

    setSelectedIds((current) => {
      const currentLaunchReadyIds = current.filter((id) => launchReadyIds.has(id)).slice(0, maxSelected);

      if (currentLaunchReadyIds.length >= STATIC_LAUNCH_MIN_CREATIVE_COUNT) {
        return currentLaunchReadyIds.length === current.length ? current : currentLaunchReadyIds;
      }

      const fillCandidateIds = Array.from(
        new Set([
          ...recommendedSelectedIds,
          ...launchReadyCreatives.map((creative) => creative.id),
        ]),
      );
      const reconciled = [...currentLaunchReadyIds];
      for (const id of fillCandidateIds) {
        if (reconciled.length >= STATIC_LAUNCH_MIN_CREATIVE_COUNT) {
          break;
        }

        if (!reconciled.includes(id) && launchReadyIds.has(id)) {
          reconciled.push(id);
        }
      }

      return reconciled.length === current.length && reconciled.every((id, index) => id === current[index])
        ? current
        : reconciled;
    });

    setActiveCreativeId((current) =>
      current && launchReadyIds.has(current)
        ? current
        : recommendedSelectedIds.find((id) => launchReadyIds.has(id)) ?? current,
    );
  }, [launchReadyCreatives, launchReadyIds, maxSelected, recommendedSelectedIds]);

  function selectUgcVideo(video: VideoCreativeOption) {
    setActiveVideoId(video.id);
    setSelectedUgcVideoIds(isCurrentLaunchReadyVideo(video) && video.conceptType === "customer_ugc" ? [video.id] : []);
    setError(null);
  }

  async function handleNext() {
    if (saving) {
      return;
    }

    if (!canContinue || !primaryCreative) {
      setError(
        rankedCreatives.length >= STATIC_LAUNCH_MIN_CREATIVE_COUNT
          ? `Select ${STATIC_LAUNCH_MIN_CREATIVE_COUNT}-${maxSelected} launch-ready static ads to continue.`
          : `${STATIC_LAUNCH_MIN_CREATIVE_COUNT} launch-ready static ads are required. Refresh or generate more static ads before launch.`,
      );
      return;
    }

    if (!selectedMediaReady) {
      setError(staticReadiness.selectedStaleCount > 0
        ? "Regenerate stale creatives before saving this launch set."
        : "Refresh unfinished previews before saving this launch set.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/select-ad`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selectedAdId: primaryCreative.id,
            selectedAdIds: selectedCreatives.map((creative) => creative.id),
            selectedUgcVideoId: selectedLaunchReadyUgcVideos[0]?.id,
            selectedUgcVideoIds: selectedLaunchReadyUgcVideos.map((video) => video.id),
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Failed to save selected ad.");
      }

      const persistedSelectedAdIds = Array.isArray(data?.selected_ad_ids)
        ? data.selected_ad_ids.map(String).filter(Boolean)
        : [];
      const persistedSelectedAdId =
        typeof data?.selected_ad_id === "string" && data.selected_ad_id.length > 0
          ? data.selected_ad_id
          : primaryCreative.id;
      const persistedSelectedUgcVideoIds = Array.isArray(data?.selected_ugc_video_ids)
        ? data.selected_ugc_video_ids.map(String).filter(Boolean)
        : [];

      const params = new URLSearchParams();
      params.set("campaignId", campaignId);
      params.set("selectedAdId", persistedSelectedAdId);
      if (persistedSelectedAdIds.length > 0) {
        params.set("selectedAdIds", persistedSelectedAdIds.join(","));
      }
      if (persistedSelectedUgcVideoIds.length > 0) {
        params.set("selectedUgcVideoIds", persistedSelectedUgcVideoIds.join(","));
      }

      router.push(`/preview?${params.toString()}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save selected ad.");
    } finally {
      setSaving(false);
    }
  }

  if (!primaryCreative || !activeCreative) {
    return (
      <div className="rounded-2xl border border-border p-6 text-sm text-muted-foreground">
        No saved creative options are ready yet. Go back and generate creatives first.
      </div>
    );
  }

  const imageRenderActive = Boolean(currentImageRenderView?.active);
  const imageOperatorActionRequired = currentImageRenderView?.state === "operator_action_required";
  const imageWorkerQueued = currentImageRenderView?.state === "deferred_worker_required";
  const imageRenderPending = renderingImages || imageRenderActive || imageWorkerQueued || Boolean(activeImageJobId);
  const imageActionPending = imageRenderPending;
  const showPreviewRendersVisible =
    previewRendersReadyToLoad ||
    imageActionPending ||
    Boolean(activeImageJobId) ||
    Boolean(currentImageJob);
  const videoActionPending = renderingVideo || Boolean(currentVideoJob);
  const imageWorkerDeferred = Boolean(
    currentImageJob && isMarketingStudioWorkerDeferredRunAt(currentImageJob.next_run_at),
  );
  const optionalOnlyNeedsPolish =
    staticReadiness.allSelectedReady &&
    staticReadiness.optionalIssueCount > 0 &&
    staticReadiness.selectedBlockedCount === 0 &&
    staticReadiness.selectedStaleCount === 0;
  const imageRenderStartedAtMs = currentImageJob?.created_at ? Date.parse(currentImageJob.created_at) : null;
  const imageRenderElapsedMs = imageRenderStartedAtMs ? Math.max(0, renderClockMs - imageRenderStartedAtMs) : 0;
  const imageRenderPastThreeMinutes = imageActionPending && imageRenderElapsedMs >= 180_000;
  const requiredStaticProgressLabel = `${staticReadiness.requiredReadyCount}/${staticReadiness.minimumRequiredCount} launch-ready static ads ready`;
  const staticProgressTitle = hasCreditBlocker
    ? "Add credits to render final ads"
    : staticReadiness.selectedMinimumMet
      ? "First 3 static ads are launch-ready"
      : imageRenderPastThreeMinutes
        ? "Final ads are still rendering in the background"
        : imageActionPending || imageWorkerQueued
          ? "Preparing first 3 launch-ready ads"
          : staticReadiness.requiredReadyCount > 0
            ? requiredStaticProgressLabel
            : "Final static ads are not ready yet";
  const staticProgressBody = hasCreditBlocker
    ? "Top up generation credits to start paid rendering. Draft previews stay visible, but Launch remains blocked until 3 final ads are ready."
    : staticReadiness.selectedMinimumMet
      ? "You can save the required static set now. Optional 5th and 6th polish variants can finish later and do not block the first launch package."
    : imageRenderPastThreeMinutes
        ? `${requiredStaticProgressLabel}. You can keep setting up Meta, billing, and preview while final ads finish. Launch unlocks only after 3 ads are ready.`
        : imageActionPending || imageWorkerQueued
          ? `${requiredStaticProgressLabel}. The first 3 required ads are prioritized before optional polish variants.`
          : `${requiredStaticProgressLabel}. Click Render assets to render the launch floor first. Optional polish variants do not need to finish before setup can continue.`;
  const staticProgressTone = hasCreditBlocker
    ? "border-amber-400/24 bg-amber-400/10 text-amber-50"
    : staticReadiness.selectedMinimumMet
      ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-50"
      : "border-cyan-300/18 bg-cyan-300/[0.07] text-cyan-50";
  const videoBlockedByMissingStaticSource = !hasCurrentStaticVideoSource;
  const imagePendingMessage = "Image preview is being prepared. This page will update when the visual is ready.";
  const imageStatusMessage = selectedNeedsImageGeneration
    ? imageLimitMessage ??
      (allImagesMissing
      ? "Creating the full visual set now. The cards below stay visible while final images render."
      : getStaticPreviewStatusMessage(staticReadiness) ??
        "Some optional previews need another attempt. Launch-ready selected previews stay available.")
    : null;
  const getDisplayCreative = (creative: CreativeOption): CreativeOption => {
    const staleReason = getStaticCreativeBriefMismatchReason(creative, staticBriefReadinessContext);

    if (staleReason) {
      return {
        ...creative,
        imageGenerationState: "failed",
        imageGenerationMessage: "Older render, needs refresh to match the approved brief.",
        qualityGate: {
          ...(creative.qualityGate ?? {}),
          accepted: false,
          hardFailures: Array.from(new Set([...(creative.qualityGate?.hardFailures ?? []), staleReason])),
        },
      };
    }

    return imageRenderPending && creativeNeedsImageGeneration(creative, approvedBriefContext)
      ? {
          ...creative,
          imageGenerationState:
            currentImageRenderView?.state === "processing" ||
            currentImageRenderView?.state === "provider_processing"
              ? "generating"
              : creative.imageGenerationState ?? "unavailable",
          imageGenerationMessage: currentImageRenderView?.customerMessage ?? imagePendingMessage,
        }
      : creative;
  };
  const launchReviewCandidateCreatives = selectedCreatives.length > 0 ? selectedCreatives : rankedCreatives;
  const visibleStaticReviewCreatives = [
    ...launchPackageCreatives,
    ...launchReviewCandidateCreatives.filter(
      (creative) => !launchPackageCreatives.some((launchCreative) => launchCreative.id === creative.id),
    ),
  ].slice(0, STATIC_LAUNCH_MIN_CREATIVE_COUNT);
  const expandedStaticCreative = expandedStaticCreativeId
    ? rankedCreatives.find((creative) => creative.id === expandedStaticCreativeId) ?? null
    : null;
  const currentPhaseLabel = activePhase === "static_ads" ? "Static Ads" : "UGC Videos";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Creative review workspace
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              Review the launch-ready creative set
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              DealFlow automatically keeps the launch-ready static ads selected and shows the required set side by side. Use Marketing Studio only when you need to adjust the brief before rendering or launch review.
            </p>
          </div>
        </div>
        {approvedBriefContext ? (
          <div className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-black/18 p-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <BriefSummaryItem label="Offer" value={approvedBriefContext.offerTitle} />
            <BriefSummaryItem label="Audience" value={approvedBriefContext.audience} />
            <BriefSummaryItem label="Market" value={approvedBriefContext.market} />
            <BriefSummaryItem label="Brand" value={approvedBriefContext.brand} />
            <BriefSummaryItem label="CTA" value={approvedBriefContext.cta} />
            <BriefSummaryItem label="UGC script" value={approvedBriefContext.ugcScriptHash ? `Revision ${approvedBriefContext.revisionNumber ?? 0}` : "Not approved"} />
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-stretch lg:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Creative Studio phases">
            {([
              ["static_ads", "Static Ads", "Native-style static ads and composed image variants"],
              ["ugc_videos", "UGC Videos", "Creator-style scripts and video preview renders"],
            ] as const).map(([phase, label, description]) => {
              const active = activePhase === phase;
              return (
                <button
                  key={phase}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-primary/50 bg-primary/12 text-foreground"
                      : "border-white/10 bg-black/18 text-muted-foreground hover:border-white/20"
                  }`}
                  onClick={() => setActivePhase(phase)}
                >
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-1 block text-xs leading-5">{description}</span>
                </button>
              );
            })}
          </div>
          <Button
            asChild
            type="button"
            variant="secondary"
            className="!h-auto min-h-[72px] w-full justify-center rounded-2xl px-5 py-3 text-center lg:w-auto lg:min-w-[280px]"
          >
            <Link href={`/build/creatives?campaignId=${encodeURIComponent(campaignId)}&creativeBrief=edit`}>
              Open Marketing Studio chat
            </Link>
          </Button>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/18 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {currentPhaseLabel} review
          </p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">
            {activePhase === "static_ads" ? "Static ads are the launch test set" : "Optional UGC videos"}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {activePhase === "static_ads"
              ? `Pick at least ${STATIC_LAUNCH_MIN_CREATIVE_COUNT} launch-ready static ads. Up to ${STATIC_LAUNCH_MAX_CREATIVE_COUNT} can be used for higher-budget split tests; draft/retry concepts do not count toward the saved launch package.`
              : "Review scripts and render video only when needed. UGC is optional and does not block the static launch package."}
          </p>
        </div>
      </section>

      <section className={`${activePhase === "static_ads" ? "block" : "hidden"} rounded-2xl border border-border bg-card p-4 sm:p-5`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Launch package</p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">{staticReadiness.selectionLabel}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {savedSelectionMatchesCurrent && staticReadiness.allSelectedReady
                ? `${staticReadiness.selectedReadyLabel}. These are the static ads DealFlow will send into the launch review.`
                : staticReadiness.selectedMinimumMet
                  ? `${staticReadiness.selectedReadyLabel}. Save the 3 static ads now; UGC can be added later if needed.`
                  : `${requiredStaticProgressLabel}. The first 3 required ads render before optional polish variants; Launch stays blocked until the required set passes review.`}
            </p>
          </div>
          <span className="w-fit rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {selectedCreatives.length}/{maxSelected} selected
          </span>
        </div>

        <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm leading-6 ${staticProgressTone}`} aria-live="polite">
          <p className="font-semibold">{staticProgressTitle}</p>
          <p className="mt-1 text-white/72">{staticProgressBody}</p>
          {staticReadiness.issueLabel ? (
            <p className={staticReadiness.selectedBlockedCount > 0 ? "mt-2 text-amber-100" : "mt-2 text-white/72"}>
              {staticReadiness.issueLabel}
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {needsImageGeneration || hasGeneratedImages ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void queueImagePreviews({
                force: hasCreditBlocker,
                missingOnly: true,
              })}
              disabled={imageActionPending || imageWorkerDeferred || Boolean(imageLimitMessage)}
            >
              {imageLimitMessage
                ? "Daily image limit reached"
                : imageOperatorActionRequired
                ? "Retry render"
                : imageWorkerQueued
                ? "Render assets"
                : imageActionPending
                ? "Render assets"
                : optionalOnlyNeedsPolish
                  ? "Render assets"
                  : needsImageGeneration
                    ? staticReadiness.staleCount > 0
                    ? "Regenerate stale render assets"
                    : "Render assets"
                  : "Render assets"}
            </Button>
          ) : null}
          {showPreviewRendersVisible ? (
            <Button
              type="button"
              variant={previewRendersReadyToLoad ? "default" : "secondary"}
              onClick={showPreviewRenders}
              disabled={!previewRendersReadyToLoad || previewRendersLoading}
            >
              {previewRendersLoading
                ? "Loading preview renders..."
                : previewRendersReadyToLoad
                  ? "Show preview renders"
                  : "Preview renders locked until ready"}
            </Button>
          ) : null}
          {activeCreativeHardBlocked ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void queueImagePreviews({ force: imageOperatorActionRequired, missingOnly: true })}
              disabled={imageActionPending || Boolean(imageLimitMessage)}
            >
              {imageLimitMessage
                ? "Daily image limit reached"
                : imageActionPending
                ? "Retrying..."
                : "Retry render"}
            </Button>
          ) : null}
        </div>

        {activeCreativeLaunchReady && activeCreativeQualityAdvisory?.canImproveLater ? (
          <div className="mt-4 rounded-2xl border border-cyan-300/16 bg-cyan-300/[0.055] px-4 py-3 text-sm leading-6 text-cyan-100" aria-live="polite">
            <span className="font-semibold text-cyan-50">Optional polish.</span>{" "}
            This creative is launch-ready. Quality notes can be improved later.
          </div>
        ) : null}
        {renderMessage ? (
          <div className="mt-4 rounded-2xl border border-cyan-300/16 bg-cyan-300/[0.055] px-4 py-3 text-sm leading-6 text-cyan-100" aria-live="polite">
            {renderMessage}
          </div>
        ) : null}
        {creditTopUpSurface === "image" || hasCreditBlocker ? (
          <div className="mt-4">
            <GenerationCreditTopUpPanel surface="image" />
          </div>
        ) : null}
        {selectedNeedsImageGeneration ? (
          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
            {hasCreditBlocker
              ? "Your strategy, copy, and creative concepts are ready. Add credits to render paid premium ads."
              : imageStatusMessage}
            {hasCreditBlocker ? (
              <button
                type="button"
                className="ml-2 font-semibold text-amber-50 underline decoration-amber-200/50 underline-offset-4"
                onClick={() => void queueImagePreviews({ force: true, missingOnly: true })}
                disabled={imageActionPending}
              >
                Retry image previews
              </button>
            ) : hasAttemptedImageGeneration && !imageActionPending && !imageLimitMessage ? (
              <button
                type="button"
                className="ml-2 font-semibold text-amber-50 underline decoration-amber-200/50 underline-offset-4"
                onClick={() => void queueImagePreviews({ force: imageOperatorActionRequired, missingOnly: true })}
              >
                Retry render
              </button>
            ) : null}
          </div>
        ) : null}

        {visibleStaticReviewCreatives.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {visibleStaticReviewCreatives.map((creative, index) => {
              const displayCreative = getDisplayCreative(creative);
              const launchReady = isStaticLaunchReady(creative);
              const active = activeCreative.id === creative.id;

              return (
                <article
                  className={`group flex min-w-0 flex-col rounded-2xl border p-3 transition ${
                    active
                      ? "border-primary/70 bg-primary/[0.09]"
                      : launchReady
                        ? "border-primary/35 bg-primary/[0.045] hover:border-primary/60 hover:bg-primary/[0.075]"
                        : "border-white/10 bg-black/16 hover:border-white/20"
                  }`}
                  key={creative.id}
                >
                  <button
                    type="button"
                    className="block min-w-0 rounded-[18px] text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                    onClick={() => {
                      setActiveCreativeId(creative.id);
                      setExpandedStaticCreativeId(creative.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveCreativeId(creative.id);
                        setExpandedStaticCreativeId(creative.id);
                      }
                    }}
                    aria-label={`Open launch creative ${index + 1}`}
                  >
                    <StaticCreativePreviewCard
                      category={displayCreative.category}
                      compact
                      cta={displayCreative.cta}
                      formatLabel={displayCreative.formatLabel}
                      headline={displayCreative.headline}
                      imageGenerationMessage={displayCreative.imageGenerationMessage}
                      imageGenerationProvider={displayCreative.imageGenerationProvider}
                      imageGenerationState={displayCreative.imageGenerationState}
                      generationMethod={displayCreative.generationMethod}
                      providerName={displayCreative.providerName}
                      generationMode={displayCreative.generationMode}
                      assetRole={displayCreative.assetRole}
                      imagePrompt={displayCreative.imagePrompt}
                      imagePromptConfig={displayCreative.imagePromptConfig}
                      imageUrl={displayCreative.imageUrl}
                      storageNormalized={displayCreative.storageNormalized}
                      appComposedFinal={displayCreative.appComposedFinal}
                      qualityTier={displayCreative.qualityTier}
                      compositionVersion={displayCreative.compositionVersion}
                      sourceBackgroundKind={displayCreative.sourceBackgroundKind}
                      sourceBackgroundProvider={displayCreative.sourceBackgroundProvider}
                      sourceBackgroundAssetId={displayCreative.sourceBackgroundAssetId}
                      location={displayCreative.location}
                      offer={displayCreative.offer}
                      overlayText={displayCreative.overlayText}
                      primaryText={displayCreative.primaryText}
                      qualityGate={displayCreative.qualityGate}
                      visualQualityGate={displayCreative.visualQualityGate}
                      premiumQualityGate={displayCreative.premiumQualityGate}
                      imageQa={displayCreative.imageQa}
                      sourceImageQa={displayCreative.sourceImageQa}
                      score={displayCreative.score}
                      selectedCount={launchReady ? staticReadiness.selectedReadyCount : null}
                      launchReady={launchReady}
                      visualPromptBrief={displayCreative.visualPromptBrief}
                    />
                  </button>
                  <div className="mt-3 grid flex-1 gap-3 rounded-[18px] border border-white/10 bg-black/18 p-3 text-sm">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Headline</p>
                      <p className="mt-1 line-clamp-2 font-semibold leading-5 text-foreground">{displayCreative.headline}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Primary text</p>
                      <p className="mt-1 line-clamp-3 leading-5 text-muted-foreground">{displayCreative.primaryText}</p>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">CTA</p>
                        <p className="mt-1 truncate font-semibold text-foreground">{displayCreative.cta}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                        launchReady
                          ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"
                          : "border-amber-300/20 bg-amber-300/[0.08] text-amber-100"
                      }`}>
                        {launchReady ? "Ready" : "Rendering"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-center text-xs font-semibold text-cyan-100 opacity-80 transition group-hover:opacity-100">
                    Open preview
                  </p>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-white/10 bg-black/14 p-4 text-sm leading-6 text-muted-foreground">
            Generate or refresh the static set to create launch-ready ads. Nothing is sent to Meta until launch review.
          </p>
        )}

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/18 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <Button asChild type="button" variant="secondary">
              <Link href={buildHref}>
                Back to build
              </Link>
            </Button>
            <Button onClick={() => void handleNext()} type="button" disabled={saving || !staticLaunchPackageReady}>
              {saving ? "Saving..." : "Save launch package and continue"}
            </Button>
          </div>
          <p className={error ? "mt-3 text-sm text-rose-400" : "mt-3 text-sm text-muted-foreground"}>
            {error ??
              (!selectedMediaReady
                ? staticReadiness.selectedStaleCount > 0
                  ? "Regenerate stale selected premium ads before saving this launch set."
                  : staticReadiness.selectedBlockedCount > 0
                  ? "Prepare selected premium ads before saving this launch set."
                  : "Select premium launch-ready ads before saving this launch set."
                : !savedSelectionMatchesCurrent
                  ? "Draft selection only. Launch remains blocked until this set is saved."
                  : rankedCreatives.length >= 2
                    ? selectedUgcReady
                      ? `Use at least ${STATIC_LAUNCH_MIN_CREATIVE_COUNT} static ads. The recommended set keeps at least one native-style concept selected; 5-6 static ads are optional for larger budgets.`
                      : "Save the static launch set now. UGC video can be added later."
                    : "Select at least one creative to continue.")}
          </p>
        </div>

        <details className="mt-4 rounded-2xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            View creative reasoning
          </summary>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p><strong className="text-foreground">Hook:</strong> {activeCreative.breakdown?.hook || "Not available"}</p>
            <p><strong className="text-foreground">Concept:</strong> {activeCreative.breakdown?.concept || "Not available"}</p>
          </div>
        </details>

        {expandedStaticCreative ? (
          <div
            aria-modal="true"
            className="fixed inset-0 z-50 grid place-items-center bg-black/82 p-4"
            role="dialog"
            onClick={() => setExpandedStaticCreativeId(null)}
          >
            <div
              className="max-h-[calc(100dvh-2rem)] w-full max-w-[980px] overflow-y-auto rounded-[22px] border border-white/12 bg-background shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Launch creative
                  </p>
                  <h3 className="mt-1 truncate text-sm font-semibold text-foreground">
                    {getDisplayCreative(expandedStaticCreative).headline}
                  </h3>
                </div>
                <button
                  type="button"
                  aria-label="Close launch creative preview"
                  className="shrink-0 rounded-full border border-white/12 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/10"
                  onClick={() => setExpandedStaticCreativeId(null)}
                >
                  Close
                </button>
              </div>
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(360px,0.9fr)_minmax(0,1fr)]">
                <StaticCreativePreviewCard
                  category={getDisplayCreative(expandedStaticCreative).category}
                  cta={getDisplayCreative(expandedStaticCreative).cta}
                  formatLabel={getDisplayCreative(expandedStaticCreative).formatLabel}
                  headline={getDisplayCreative(expandedStaticCreative).headline}
                  imageGenerationMessage={getDisplayCreative(expandedStaticCreative).imageGenerationMessage}
                  imageGenerationProvider={getDisplayCreative(expandedStaticCreative).imageGenerationProvider}
                  imageGenerationState={getDisplayCreative(expandedStaticCreative).imageGenerationState}
                  generationMethod={getDisplayCreative(expandedStaticCreative).generationMethod}
                  providerName={getDisplayCreative(expandedStaticCreative).providerName}
                  generationMode={getDisplayCreative(expandedStaticCreative).generationMode}
                  assetRole={getDisplayCreative(expandedStaticCreative).assetRole}
                  imagePrompt={getDisplayCreative(expandedStaticCreative).imagePrompt}
                  imagePromptConfig={getDisplayCreative(expandedStaticCreative).imagePromptConfig}
                  imageUrl={getDisplayCreative(expandedStaticCreative).imageUrl}
                  storageNormalized={getDisplayCreative(expandedStaticCreative).storageNormalized}
                  appComposedFinal={getDisplayCreative(expandedStaticCreative).appComposedFinal}
                  qualityTier={getDisplayCreative(expandedStaticCreative).qualityTier}
                  compositionVersion={getDisplayCreative(expandedStaticCreative).compositionVersion}
                  sourceBackgroundKind={getDisplayCreative(expandedStaticCreative).sourceBackgroundKind}
                  sourceBackgroundProvider={getDisplayCreative(expandedStaticCreative).sourceBackgroundProvider}
                  sourceBackgroundAssetId={getDisplayCreative(expandedStaticCreative).sourceBackgroundAssetId}
                  location={getDisplayCreative(expandedStaticCreative).location}
                  offer={getDisplayCreative(expandedStaticCreative).offer}
                  overlayText={getDisplayCreative(expandedStaticCreative).overlayText}
                  primaryText={getDisplayCreative(expandedStaticCreative).primaryText}
                  qualityGate={getDisplayCreative(expandedStaticCreative).qualityGate}
                  visualQualityGate={getDisplayCreative(expandedStaticCreative).visualQualityGate}
                  premiumQualityGate={getDisplayCreative(expandedStaticCreative).premiumQualityGate}
                  imageQa={getDisplayCreative(expandedStaticCreative).imageQa}
                  sourceImageQa={getDisplayCreative(expandedStaticCreative).sourceImageQa}
                  score={getDisplayCreative(expandedStaticCreative).score}
                  selectedCount={isStaticLaunchReady(expandedStaticCreative) ? staticReadiness.selectedReadyCount : null}
                  launchReady={isStaticLaunchReady(expandedStaticCreative)}
                  showFullCreativeButton={false}
                  visualPromptBrief={getDisplayCreative(expandedStaticCreative).visualPromptBrief}
                />
                <div className="space-y-4 rounded-2xl border border-white/10 bg-black/18 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Headline</p>
                    <p className="mt-2 text-xl font-semibold leading-7 text-foreground">
                      {getDisplayCreative(expandedStaticCreative).headline}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Primary text</p>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      {getDisplayCreative(expandedStaticCreative).primaryText}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">CTA</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {getDisplayCreative(expandedStaticCreative).cta}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {activePhase === "ugc_videos" && activeVideoCreative ? (
        <section className="grid min-w-0 gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5 lg:grid-cols-[minmax(280px,0.82fr)_minmax(0,1.18fr)]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  UGC video preview
                </p>
                <h3 className="mt-1 text-xl font-semibold text-foreground">{activeVideoCreative.title}</h3>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                activeVideoLaunchReady
                  ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"
                  : isPlayableVideoCreative(activeVideoCreative)
                    ? "border-amber-300/25 bg-amber-300/[0.08] text-amber-100"
                    : "border-white/10 bg-white/[0.04] text-muted-foreground"
              }`}>
                {currentVideoRenderView?.customerLabel ??
                  (!activeVideoMatchesApprovedScript && isPlayableVideoCreative(activeVideoCreative)
                    ? "Render needed for approved script"
                    : getVideoReadinessLabel(activeVideoCreative))}
              </span>
            </div>
            <div className="mx-auto w-full max-w-full overflow-hidden rounded-[18px] border border-white/10 bg-black/28 sm:max-w-[360px]">
              {activeVideoHasCurrentPlayableRender ? (
                <CustomerVideoPlayer
                  className="border-0"
                  videoClassName="aspect-[9/16] max-h-[70dvh] w-full bg-black object-contain"
                  controlsList="nodownload noplaybackrate"
                  disablePictureInPicture
                  playsInline
                  src={activeVideoCreative.videoUrl}
                  title={activeVideoCreative.title}
                />
              ) : (
                <div className="grid aspect-[9/16] place-items-center bg-[linear-gradient(135deg,rgba(94,234,212,0.12),rgba(139,92,246,0.12)),radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_24%)] p-5 text-center">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {!activeVideoMatchesApprovedScript && isPlayableVideoCreative(activeVideoCreative)
                        ? "Fresh UGC render required"
                        : currentVideoRenderView?.customerLabel ?? getVideoReadinessLabel(activeVideoCreative)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {!activeVideoMatchesApprovedScript && isPlayableVideoCreative(activeVideoCreative)
                      ? "The approved script needs a current campaign-specific render. Prepare a current static source, then render the video."
                      : currentVideoRenderView?.customerMessage ?? getVideoReadinessMessage(activeVideoCreative)}
                    {videoBlockedByMissingStaticSource ? (
                      <span className="mt-2 block text-cyan-100">
                        Render static creatives first so the video preview has a current image source.
                      </span>
                    ) : null}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {activeVideoHasCurrentPlayableRender ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setFullVideoOpen(true)}
                >
                  View full video
                </Button>
              ) : null}
              {activeVideoPlayableReviewOnly && activeVideoMatchesApprovedScript ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void queueVideoPreview({
                    force: true,
                    video: activeVideoCreative,
                  })}
                  disabled={videoBlockedByMissingStaticSource || videoActionPending}
                >
                  {videoBlockedByMissingStaticSource
                    ? "Render static creatives first"
                    : videoActionPending
                    ? "Retrying UGC video..."
                    : "Retry UGC video"}
                </Button>
              ) : null}
              {!activeVideoMatchesApprovedScript && isPlayableVideoCreative(activeVideoCreative) ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (videoBlockedByMissingStaticSource) {
                      void queueImagePreviews({ missingOnly: true });
                      return;
                    }

                    void queueVideoPreview({
                      force: true,
                      video: activeVideoCreative,
                    });
                  }}
                  disabled={videoActionPending || imageActionPending || Boolean(imageLimitMessage)}
                >
                  {videoBlockedByMissingStaticSource
                    ? imageActionPending
                      ? "Preparing current static source..."
                      : imageLimitMessage
                        ? "Daily image limit reached"
                        : "Prepare current static source"
                    : videoActionPending
                    ? "Rendering approved script..."
                    : "Render fresh UGC video"}
                </Button>
              ) : !isPlayableVideoCreative(activeVideoCreative) ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (videoBlockedByMissingStaticSource) {
                      void queueImagePreviews({ missingOnly: true });
                      return;
                    }

                    void queueVideoPreview({
                      force: activeVideoCreative.videoGenerationState === "failed",
                      video: activeVideoCreative,
                    });
                  }}
                  disabled={videoActionPending || imageActionPending || Boolean(imageLimitMessage) || (
                    activeVideoCreative.videoGenerationState === "generating" &&
                    Boolean(activeVideoCreative.providerAssetId || activeVideoCreative.providerStatus)
                  )}
                >
                  {videoBlockedByMissingStaticSource
                    ? imageActionPending
                      ? "Preparing current static source..."
                      : imageLimitMessage
                        ? "Daily image limit reached"
                        : "Prepare current static source"
                    : currentVideoRenderView?.state === "deferred_worker_required" ||
                  currentVideoRenderView?.state === "operator_action_required"
                    ? "Video render preparing"
                    : videoActionPending || (
                      activeVideoCreative.videoGenerationState === "generating" &&
                      (activeVideoCreative.providerAssetId || activeVideoCreative.providerStatus)
                    )
                    ? "Rendering video..."
                    : activeVideoCreative.videoGenerationState === "failed"
                      ? "Retry video preview"
                      : "Render fresh UGC video"}
                </Button>
              ) : null}
              {activeVideoLaunchReady ? (
                <Button
                  type="button"
                  variant={selectedUgcVideoIds.includes(activeVideoCreative.id) ? "default" : "secondary"}
                  onClick={() => selectUgcVideo(activeVideoCreative)}
                >
                  {selectedUgcVideoIds.includes(activeVideoCreative.id) ? "Selected for launch" : "Select UGC for launch"}
                </Button>
              ) : !activeVideoMatchesApprovedScript && isPlayableVideoCreative(activeVideoCreative) ? (
                <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-2 text-xs font-semibold text-amber-100">
                  Approved script needs a current video
                </span>
              ) : (
                <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-2 text-xs font-semibold text-amber-100">
                  Review-only until accepted for launch
                </span>
              )}
              {activeVideoLaunchReadinessReason ? (
                <span className="text-sm leading-6 text-amber-100">
                  {activeVideoLaunchReadinessReason}
                </span>
              ) : null}
              {customerVideoMessage(videoMessage || activeVideoCreative.videoGenerationMessage) ? (
                <span className="text-sm leading-6 text-muted-foreground">
                  {customerVideoMessage(videoMessage || activeVideoCreative.videoGenerationMessage)}
                </span>
              ) : null}
              {creditTopUpSurface === "video" ? (
                <div className="w-full">
                  <GenerationCreditTopUpPanel surface="video" />
                </div>
              ) : null}
            </div>
            {reviewableVideoCreatives.length > 1 ? (
              <div className="grid max-w-full gap-2 sm:flex sm:overflow-x-auto sm:pb-1">
                {reviewableVideoCreatives.map((video, index) => {
                  const active = video.id === activeVideoCreative.id;
                  return (
                    <button
                      key={video.id}
                      type="button"
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition sm:min-w-[150px] sm:max-w-[240px] ${
                        active
                          ? "border-emerald-300/35 bg-emerald-300/[0.08]"
                          : "border-white/10 bg-black/18 hover:border-white/20"
                      }`}
                      onClick={() => {
                        setActiveVideoId(video.id);
                        if (isCurrentLaunchReadyVideo(video) && video.conceptType === "customer_ugc") {
                          setSelectedUgcVideoIds([video.id]);
                        }
                      }}
                      aria-label={`View ${video.title}`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Video {index + 1}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-foreground">
                        {video.title}
                      </p>
                      <p className={isCurrentLaunchReadyVideo(video) ? "mt-2 text-[11px] text-emerald-200" : "mt-2 text-[11px] text-muted-foreground"}>
                        {selectedUgcVideoIds.includes(video.id)
                          ? "Selected UGC"
                          : video.id === activeVideoId && currentVideoRenderView
                            ? currentVideoRenderView.customerLabel
                            : !videoMatchesApprovedScript(video, approvedUgcScriptHash) && isPlayableVideoCreative(video)
                              ? "Needs approved-script render"
                            : getVideoReadinessLabel(video)}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="grid min-w-0 gap-3">
            <div className="rounded-2xl border border-cyan-300/15 bg-[radial-gradient(circle_at_10%_0%,rgba(103,232,249,0.12),transparent_34%),linear-gradient(135deg,rgba(8,14,26,0.95),rgba(5,9,18,0.86))] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/80">Creator studio</p>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">Script, source, and render controls</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    Review the presenter style, voice, pacing, source static, captions, and energy before rendering or approving this campaign-specific video.
                  </p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                  activeVideoLaunchReady
                    ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"
                    : "border-amber-300/20 bg-amber-300/[0.08] text-amber-100"
                }`}>
                  {activeVideoLaunchReady ? "Launch-ready" : "Review needed"}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <CreatorStudioSetting icon={Clapperboard} label="Presenter" value={activeVideoCreative.creatorStyle} />
                <CreatorStudioSetting icon={Mic2} label="Voice" value={activeVideoCreative.voiceStyle} />
                <CreatorStudioSetting icon={Gauge} label="Pacing" value={activeVideoCreative.targetDurationSeconds ? `${activeVideoCreative.targetDurationSeconds}s target` : "Fast direct response"} />
                <CreatorStudioSetting icon={ImageIcon} label="Source static" value={videoBlockedByMissingStaticSource ? "Current static needed" : activeVideoCreative.sourceStaticAssetId ? "Current static selected" : "Static source pending"} />
                <CreatorStudioSetting icon={Captions} label="Captions" value={activeVideoCreative.onScreenText?.[0] || "Hook captions ready"} />
                <CreatorStudioSetting icon={Sparkles} label="Energy" value={activeVideoCreative.conceptType === "customer_ugc" ? "Customer-style proof" : "Expert explainer"} />
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/18 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Script</p>
              <div className="mt-3 space-y-2">
                {activeVideoDisplayScript.slice(0, 6).map((line, index) => (
                  <p className="text-sm leading-6 text-foreground" key={`${activeVideoCreative.id}-script-${index}`}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/18 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Shot list</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  {activeVideoCreative.shotList.slice(0, 4).map((shot, index) => (
                    <li key={`${activeVideoCreative.id}-shot-${index}`}>{shot}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/18 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">CTA</p>
                <p className="mt-3 text-sm font-semibold text-foreground">{activeVideoCreative.cta}</p>
                {typeof activeVideoCreative.qualityGate?.score === "number" ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Creative score {activeVideoCreative.qualityGate.score.toFixed(1)}/10
                  </p>
                ) : null}
              </div>
            </div>
          </div>
          {fullVideoOpen && isPlayableVideoCreative(activeVideoCreative) ? (
            <div
              aria-modal="true"
              className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4"
              role="dialog"
              onClick={() => setFullVideoOpen(false)}
            >
              <div
                className="w-full max-w-5xl overflow-hidden rounded-[20px] border border-white/12 bg-background shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Full video preview
                    </p>
                    <h3 className="mt-1 truncate text-sm font-semibold text-foreground">{activeVideoCreative.title}</h3>
                  </div>
                  <button
                    type="button"
                    aria-label="Close full video"
                    className="shrink-0 rounded-full border border-white/12 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/10"
                    onClick={() => setFullVideoOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <CustomerVideoPlayer
                  className="mx-auto border-0"
                  videoClassName="max-h-[calc(100dvh-7rem)] w-full max-w-[520px] bg-black object-contain"
                  controlsList="nodownload noplaybackrate"
                  disablePictureInPicture
                  playsInline
                  src={activeVideoCreative.videoUrl}
                  title={activeVideoCreative.title}
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

    </div>
  );
}

function BriefSummaryItem({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value || "Not set"}</p>
    </div>
  );
}

function CreatorStudioSetting({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/18 p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl border border-cyan-300/18 bg-cyan-300/[0.07] text-cyan-100">
          <Icon className="size-4" />
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-3 text-sm font-semibold leading-5 text-foreground">{value || "Ready for review"}</p>
    </div>
  );
}
