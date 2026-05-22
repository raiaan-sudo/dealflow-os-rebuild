"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  StaticCreativePreviewCard,
} from "@/components/campaign/static-creative-preview-card";
import { CustomerVideoPlayer } from "@/components/campaign/customer-video-player";
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
  isLaunchReadyStaticCreative,
  isLaunchReadyVideoCreative,
  isPlayableVideoCreative,
  STATIC_LAUNCH_MAX_CREATIVE_COUNT,
  STATIC_LAUNCH_MIN_CREATIVE_COUNT,
} from "@/lib/services/creative-media-readiness";
import type { CampaignCategory } from "@/lib/services/campaign-creative-strategy";
import { evaluateStaticVisualAssetDecision } from "@/lib/services/static-creative-visual-qa";

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
  imageGenerationState?: string | null;
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
  imageQa?: {
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
  return !creative.imageUrl ||
    creative.imageGenerationState === "failed" ||
    !evaluateStaticVisualAssetDecision(creative).usable ||
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
  const availableIds = new Set(rankedCreatives.map((creative) => creative.id));
  const launchReadyIds = new Set(launchReadyCreatives.map((creative) => creative.id));
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
  const [videoMessage, setVideoMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullVideoOpen, setFullVideoOpen] = useState(false);
  const [activePhase, setActivePhase] = useState<StudioPhase>("static_ads");
  const [activeCreativeId, setActiveCreativeId] = useState<string | null>(
    defaultSelectedIds[0] ?? rankedCreatives[0]?.id ?? null,
  );
  const selectedCreatives = rankedCreatives.filter((creative) => selectedIds.includes(creative.id));
  const selectedLaunchReadyCreatives = selectedCreatives.filter(isStaticLaunchReady);
  const selectedLaunchReadyIds = new Set(selectedLaunchReadyCreatives.map((creative) => creative.id));
  const unselectedLaunchReadyCreatives = launchReadyCreatives.filter(
    (creative) => !selectedLaunchReadyIds.has(creative.id),
  );
  const draftCreatives = rankedCreatives.filter((creative) => !isStaticLaunchReady(creative));
  const selectableCreatives =
    selectedLaunchReadyCreatives.length > 0
      ? selectedLaunchReadyCreatives
      : launchReadyCreatives.length > 0
        ? launchReadyCreatives
        : rankedCreatives;
  const carouselMaxSelected = Math.min(maxSelected, Math.max(minSelected, selectableCreatives.length || rankedCreatives.length));
  const staticReadiness = getStaticCreativeReadiness(rankedCreatives, selectedIds, staticBriefReadinessContext);
  const primaryCreative = selectedCreatives[0] ?? rankedCreatives[0] ?? null;
  const activeCreative =
    rankedCreatives.find((creative) => creative.id === activeCreativeId) ??
    primaryCreative;
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
  const hasCreditBlocker = rankedCreatives.some((creative) =>
    /insufficient credits|add at least/i.test(creative.imageGenerationMessage ?? ""),
  );
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
  const activeVideoDisplayScript =
    !activeVideoMatchesApprovedScript && approvedUgcScriptLines.length > 0
      ? approvedUgcScriptLines
      : activeVideoCreative?.script ?? [];
  const selectedUgcVideos = videoCreatives.filter((video) => selectedUgcVideoIds.includes(video.id));
  const selectedLaunchReadyUgcVideos = selectedUgcVideos.filter(
    (video) => video.conceptType === "customer_ugc" && isCurrentLaunchReadyVideo(video),
  );
  const videoSelectionRequired = true;
  const selectedUgcReady = !videoSelectionRequired || selectedLaunchReadyUgcVideos.length > 0;
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
  const currentVideoRenderView = currentVideoJob ? jobRenderView(currentVideoJob) : null;

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
    const clearTrackedJob = () => {
      setRenderJobs((current) => current.filter((job) => job.id !== jobId));
      clearActiveJob();
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
            const staticAds = job.result?.staticAds ?? [];
            setRenderMessage(
              getImageLimitMessage(staticAds) ??
                getStaticPreviewStatusMessage(getStaticCreativeReadiness(staticAds, selectedIds, staticBriefReadinessContext)) ??
                "Image previews are ready.",
            );
          }
          source.close();
          jobStreamsRef.current.delete(jobId);
          clearActiveJob();
          router.refresh();
        } else if (job.status === "failed") {
          if (surface === "video") {
            setVideoMessage(customerVideoMessage(renderView.customerMessage || job.error_message) || "Render needs retry.");
          } else {
            setRenderMessage(customerImageMessage(renderView.customerMessage || job.error_message) || "Render needs retry.");
          }
          source.close();
          jobStreamsRef.current.delete(jobId);
          clearActiveJob();
          router.refresh();
        } else if (isMarketingStudioWorkerDeferredRunAt(job.next_run_at)) {
          if (surface === "video") {
            setVideoMessage(renderView.customerMessage);
          } else {
            setRenderMessage(renderView.customerMessage);
          }
          source.close();
          jobStreamsRef.current.delete(jobId);
          clearTrackedJob();
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
    setRenderMessage(
      automatic
        ? "Preparing image previews automatically. You can review the creative set while visuals finish."
        : "Preparing image previews.",
    );

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/generate-static-ads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          force,
          missingOnly,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { job?: SystemJob | null; error?: string | null; previewUpdated?: boolean }
        | null;

      if (!response.ok || !data?.job?.id) {
        throw new Error(data?.error || "Image preview rendering could not start.");
      }

      const renderView = jobRenderView(data.job);
      const deferredWorkerJob = isMarketingStudioWorkerDeferredRunAt(data.job.next_run_at);
      setRenderJobs((current) =>
        deferredWorkerJob
          ? current.filter((job) => job.kind !== "static_creative_generation")
          : upsertRenderJob(current, data.job as SystemJob),
      );
      setRenderMessage(
        deferredWorkerJob
          ? "Optional premium polish is preparing in the background. Your launch-ready ads are available now."
          : data.previewUpdated
            ? "Creative concepts are visible now. Launch-ready ads stay available while optional polish prepares."
            : renderView.customerMessage,
      );
      if (data.previewUpdated) {
        router.refresh();
      }
      if (!deferredWorkerJob) {
        subscribeToJob(data.job.id, "image");
      }
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
        | { job?: SystemJob | null; error?: string | null }
        | null;

      if (!response.ok || !data?.job?.id) {
        throw new Error(data?.error || "Video preview rendering could not start.");
      }

      const renderView = jobRenderView(data.job);
      setRenderJobs((current) => upsertRenderJob(current, data.job as SystemJob));
      setVideoMessage(renderView.customerMessage);
      if (!isMarketingStudioWorkerDeferredRunAt(data.job.next_run_at)) {
        subscribeToJob(data.job.id, "video");
      }
    } catch (videoError) {
      setVideoMessage(null);
      setError(
        customerVideoMessage(videoError instanceof Error ? videoError.message : null) ??
          "Video preview rendering could not start.",
      );
    } finally {
      setRenderingVideo(false);
    }
  }, [activeVideoCreative, campaignId, hasCurrentStaticVideoSource, renderingVideo, setActiveVideoId, subscribeToJob]);

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

  function toggleCreative(creativeId: string) {
    setActiveCreativeId(creativeId);
    const launchReady = launchReadyIds.has(creativeId);
    setSelectedIds((current) => {
      if (current.includes(creativeId)) {
        return current.filter((id) => id !== creativeId);
      }

      if (!launchReady) {
        return current;
      }

      if (current.length >= maxSelected) {
        return current;
      }

      return [...current, creativeId];
    });
    setError(null);
  }

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

    if (!ugcQuotaSatisfied) {
      setError("Keep at least one native-style concept in the selected creative set.");
      return;
    }

    if (!selectedMediaReady) {
      setError(staticReadiness.selectedStaleCount > 0
        ? "Regenerate stale creatives before saving this launch set."
        : "Refresh unfinished previews before saving this launch set.");
      return;
    }

    if (!selectedUgcReady) {
      setError("Select one launch-ready AI UGC video before saving the launch package.");
      setActivePhase("ugc_videos");
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

  const activeCreativeIndex = Math.max(0, rankedCreatives.findIndex((creative) => creative.id === activeCreative.id));
  const activeCreativeSelected = selectedIds.includes(activeCreative.id);
  const imageRenderPending = renderingImages || Boolean(currentImageJob);
  const imageActionPending = renderingImages || Boolean(currentImageJob);
  const videoActionPending = renderingVideo || Boolean(currentVideoJob);
  const imageWorkerDeferred = Boolean(
    currentImageJob && isMarketingStudioWorkerDeferredRunAt(currentImageJob.next_run_at),
  );
  const optionalOnlyNeedsPolish =
    staticReadiness.allSelectedReady &&
    staticReadiness.optionalIssueCount > 0 &&
    staticReadiness.selectedBlockedCount === 0 &&
    staticReadiness.selectedStaleCount === 0;
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
  const displayActiveCreative = getDisplayCreative(activeCreative);
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
              Choose the launch test set from the approved brief
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The creative brief approval is saved in the intake step. Select at least 4 launch-ready static ads, add up to 6 for higher-budget split tests, and choose one launch-ready AI UGC video for the final launch package.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] px-4 py-3 text-sm leading-6 text-emerald-100 lg:max-w-md">
            Approved brief source: saved creative intake. Current offer, brand, CTA, and script version control which assets can become launch-ready.
          </div>
          <div className="rounded-2xl border border-cyan-300/18 bg-cyan-300/[0.06] px-4 py-3 text-sm leading-6 text-cyan-100 lg:max-w-md">
            Full-resolution creative files stay inside DealFlow. Preview, approve, request revisions, and use assets through the launch workflow.
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

        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Creative Studio phases">
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

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/18 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {currentPhaseLabel} review
          </p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">
            {activePhase === "static_ads" ? "Static ads are the launch test set" : "AI UGC videos are selectable launch ads"}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {activePhase === "static_ads"
              ? `Pick at least ${STATIC_LAUNCH_MIN_CREATIVE_COUNT} launch-ready static ads. Up to ${STATIC_LAUNCH_MAX_CREATIVE_COUNT} can be used for higher-budget split tests; draft/retry concepts do not count toward the saved launch package.`
              : "Review scripts, render only when the brief is ready, and select one launch-ready campaign-specific UGC video for Preview and Launch."}
          </p>
        </div>
      </section>

      <section className={`${activePhase === "static_ads" ? "grid" : "hidden"} gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5 lg:grid-cols-[minmax(340px,0.82fr)_minmax(420px,1.18fr)]`}>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Creative {activeCreativeIndex + 1}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">
                {activeCreativeSelected ? "Selected creative preview" : "Creative preview"}
              </h2>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {selectedCreatives.length}/{maxSelected} selected
            </span>
          </div>
          <StaticCreativePreviewCard
            category={displayActiveCreative.category}
            cta={displayActiveCreative.cta}
            headline={displayActiveCreative.headline}
            imageGenerationMessage={displayActiveCreative.imageGenerationMessage}
            imageGenerationState={displayActiveCreative.imageGenerationState}
            imagePrompt={displayActiveCreative.imagePrompt}
            imagePromptConfig={displayActiveCreative.imagePromptConfig}
            imageUrl={displayActiveCreative.imageUrl}
            storageNormalized={displayActiveCreative.storageNormalized}
            appComposedFinal={displayActiveCreative.appComposedFinal}
            location={displayActiveCreative.location}
            formatLabel={displayActiveCreative.formatLabel}
            offer={displayActiveCreative.offer}
            overlayText={displayActiveCreative.overlayText}
            primaryText={displayActiveCreative.primaryText}
            qualityGate={displayActiveCreative.qualityGate}
            imageQa={displayActiveCreative.imageQa}
            score={displayActiveCreative.score}
            selectedCount={activeCreativeSelected && activeCreative && isStaticLaunchReady(activeCreative) ? staticReadiness.selectedReadyCount : null}
            visualPromptBrief={displayActiveCreative.visualPromptBrief}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Recommended test set</p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">
              {staticReadiness.selectionLabel}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {savedSelectionMatchesCurrent
                ? `${staticReadiness.selectedReadyLabel}. DealFlow will use the first saved ad as the primary creative and keep the rest as static launch variants once every launch gate is ready.`
                : `${staticReadiness.selectedReadyLabel}. Save at least 4 static ads plus one approved UGC video before launch can continue; 5-6 static ads are optional for larger budgets.`}
            </p>
            {staticReadiness.issueLabel ? (
              <p className={staticReadiness.selectedBlockedCount > 0 ? "mt-2 text-sm leading-6 text-amber-200" : "mt-2 text-sm leading-6 text-muted-foreground"}>
                {staticReadiness.issueLabel}
              </p>
            ) : null}
          </div>
          {needsImageGeneration || hasGeneratedImages ? (
            <div className="flex flex-wrap items-center gap-3">
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
                    : imageWorkerDeferred
                    ? optionalOnlyNeedsPolish
                      ? "Optional polish preparing"
                      : "Premium polish preparing"
                    : imageActionPending
                    ? "Preparing previews..."
                    : optionalOnlyNeedsPolish
                    ? "Prepare optional polish"
                    : needsImageGeneration
                      ? staticReadiness.staleCount > 0
                        ? "Regenerate stale creatives"
                        : "Refresh unfinished previews"
                      : "Refresh image previews"}
                </Button>
              ) : null}
              {activeCreative.imageGenerationState === "failed" || activeCreative.qualityGate?.accepted === false ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void queueImagePreviews({ missingOnly: true })}
                  disabled={imageActionPending || Boolean(imageLimitMessage)}
                >
                  {imageLimitMessage ? "Daily image limit reached" : imageActionPending ? "Retrying..." : "Retry preview render"}
                </Button>
              ) : null}
            </div>
          ) : null}
          {renderMessage ? (
            <div className="rounded-2xl border border-cyan-300/16 bg-cyan-300/[0.055] px-4 py-3 text-sm leading-6 text-cyan-100" aria-live="polite">
              {renderMessage}
            </div>
          ) : null}
          {selectedNeedsImageGeneration ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
              {hasCreditBlocker
                ? "Your strategy, copy, and creative concepts are ready. The previous render stopped before credit overdraft was enabled."
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
                  onClick={() => void queueImagePreviews({ missingOnly: true })}
                >
                  Retry image previews
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="grid content-start gap-3 xl:grid-cols-2">
            {selectedCreatives.map((creative, index) => {
              const displayCreative = getDisplayCreative(creative);
              return (
                <div className="space-y-2" key={displayCreative.id}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {index === 0 ? "Primary creative" : `Review variant ${index}`}
                  </p>
                  <StaticCreativePreviewCard
                    category={displayCreative.category}
                    compact
                    cta={displayCreative.cta}
                    formatLabel={displayCreative.formatLabel}
                    headline={displayCreative.headline}
                    imageGenerationMessage={displayCreative.imageGenerationMessage}
                    imageGenerationState={displayCreative.imageGenerationState}
                    imagePrompt={displayCreative.imagePrompt}
                    imagePromptConfig={displayCreative.imagePromptConfig}
                    imageUrl={displayCreative.imageUrl}
                    storageNormalized={displayCreative.storageNormalized}
                    appComposedFinal={displayCreative.appComposedFinal}
                    location={displayCreative.location}
                    offer={displayCreative.offer}
                    overlayText={displayCreative.overlayText}
                    primaryText={displayCreative.primaryText}
                    qualityGate={displayCreative.qualityGate}
                    imageQa={displayCreative.imageQa}
                    score={displayCreative.score}
                    selectedCount={isStaticLaunchReady(creative) ? staticReadiness.selectedReadyCount : null}
                    visualPromptBrief={displayCreative.visualPromptBrief}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-auto rounded-2xl border border-white/10 bg-black/18 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <Button asChild type="button" variant="secondary">
                <Link href={buildHref}>
                  Back to build
                </Link>
              </Button>
              <Button onClick={() => void handleNext()} type="button" disabled={saving || !canContinue || !ugcQuotaSatisfied || !selectedMediaReady || !selectedUgcReady}>
                {saving ? "Saving..." : "Save launch package"}
              </Button>
            </div>
            <p className={error ? "mt-3 text-sm text-rose-400" : "mt-3 text-sm text-muted-foreground"}>
              {error ??
                (!selectedMediaReady
                  ? staticReadiness.selectedStaleCount > 0
                    ? "Regenerate stale selected creatives before saving this launch set."
                    : staticReadiness.selectedBlockedCount > 0
                    ? "Refresh selected previews before saving this launch set."
                    : "Select launch-ready previews before saving this launch set."
                  : !savedSelectionMatchesCurrent
                    ? "Draft selection only. Launch remains blocked until this set is saved."
                    : rankedCreatives.length >= 2
                      ? selectedUgcReady
                        ? `Use at least ${STATIC_LAUNCH_MIN_CREATIVE_COUNT} static ads. The recommended set keeps at least one native-style concept selected; 5-6 static ads are optional for larger budgets.`
                        : "Select a launch-ready AI UGC video before saving the launch package."
                      : "Select at least one creative to continue.")}
            </p>
          </div>

          <details className="rounded-2xl border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              View creative reasoning
            </summary>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p><strong className="text-foreground">Hook:</strong> {activeCreative.breakdown?.hook || "Not available"}</p>
              <p><strong className="text-foreground">Concept:</strong> {activeCreative.breakdown?.concept || "Not available"}</p>
            </div>
          </details>
        </div>
      </section>

      {activePhase === "ugc_videos" && activeVideoCreative ? (
        <section className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5 lg:grid-cols-[minmax(280px,0.82fr)_minmax(0,1.18fr)]">
          <div className="space-y-3">
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
            <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[18px] border border-white/10 bg-black/28">
              {isPlayableVideoCreative(activeVideoCreative) ? (
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
                      {currentVideoRenderView?.customerLabel ?? getVideoReadinessLabel(activeVideoCreative)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {currentVideoRenderView?.customerMessage ?? getVideoReadinessMessage(activeVideoCreative)}
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
              {isPlayableVideoCreative(activeVideoCreative) ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setFullVideoOpen(true)}
                >
                  View full video
                </Button>
              ) : null}
              {!activeVideoMatchesApprovedScript && isPlayableVideoCreative(activeVideoCreative) ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void queueVideoPreview({
                    force: true,
                    video: activeVideoCreative,
                  })}
                  disabled={videoActionPending || videoBlockedByMissingStaticSource}
                >
                  {videoBlockedByMissingStaticSource
                    ? "Render static creatives first"
                    : videoActionPending
                    ? "Rendering approved script..."
                    : "Render approved script"}
                </Button>
              ) : !isPlayableVideoCreative(activeVideoCreative) ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void queueVideoPreview({
                    force: activeVideoCreative.videoGenerationState === "failed",
                    video: activeVideoCreative,
                  })}
                  disabled={videoBlockedByMissingStaticSource || videoActionPending || (
                    activeVideoCreative.videoGenerationState === "generating" &&
                    Boolean(activeVideoCreative.providerAssetId || activeVideoCreative.providerStatus)
                  )}
                >
                  {videoBlockedByMissingStaticSource
                    ? "Render static creatives first"
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
                      : "Render video preview"}
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
                  Older render; approved script needs a fresh video
                </span>
              ) : (
                <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-2 text-xs font-semibold text-amber-100">
                  Review-only until DealFlow accepts it for launch
                </span>
              )}
              {customerVideoMessage(videoMessage || activeVideoCreative.videoGenerationMessage) ? (
                <span className="text-sm leading-6 text-muted-foreground">
                  {customerVideoMessage(videoMessage || activeVideoCreative.videoGenerationMessage)}
                </span>
              ) : null}
            </div>
            {reviewableVideoCreatives.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {reviewableVideoCreatives.map((video, index) => {
                  const active = video.id === activeVideoCreative.id;
                  return (
                    <button
                      key={video.id}
                      type="button"
                      className={`min-w-[180px] rounded-2xl border px-3 py-3 text-left transition ${
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
          <div className="grid gap-3">
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

      <section className={`${activePhase === "static_ads" ? "block" : "hidden"} rounded-2xl border border-border bg-card p-4 sm:p-5`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Creative carousel</p>
            <h3 className="mt-1 text-xl font-semibold text-foreground">
              {launchReadyCreatives.length > 0
                ? `${staticReadiness.selectedReadyLabel} selected`
                : `View all creatives and choose ${minSelected}-${maxSelected}`}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Click any card to view it large above. Selected launch-ready cards are shown first. {selectedLaunchReadyCreatives.length || selectedCreatives.length}/{carouselMaxSelected} selected.
          </p>
        </div>
        {draftCreatives.length > 0 && launchReadyCreatives.length > 0 ? (
          <p className="mt-3 rounded-[14px] border border-amber-300/16 bg-amber-300/[0.075] px-3 py-2 text-sm leading-6 text-amber-100">
            Showing {selectedLaunchReadyCreatives.length || launchReadyCreatives.length} launch-ready candidate{(selectedLaunchReadyCreatives.length || launchReadyCreatives.length) === 1 ? "" : "s"}.
            {" "}
            {draftCreatives.length} draft concept{draftCreatives.length === 1 ? "" : "s"} need regeneration and are separated below.
            {unselectedLaunchReadyCreatives.length > 0 ? ` ${unselectedLaunchReadyCreatives.length} optional launch-ready candidate${unselectedLaunchReadyCreatives.length === 1 ? "" : "s"} can be added after review.` : ""}
          </p>
        ) : null}
        <div className="mt-5 flex snap-x gap-4 overflow-x-auto pb-3">
          {selectableCreatives.map((creative, index) => {
            const displayCreative = getDisplayCreative(creative);
            const selected = selectedIds.includes(creative.id);
            const active = activeCreative.id === creative.id;
            return (
              <article
                className={`min-w-[min(84vw,430px)] max-w-[430px] snap-start rounded-2xl border p-3 transition ${
                  active
                    ? "border-primary bg-primary/10"
                    : selected
                      ? "border-primary/40 bg-primary/[0.06]"
                      : "border-border bg-background"
                }`}
                key={creative.id}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 text-left text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground transition hover:text-foreground"
                    onClick={() => setActiveCreativeId(creative.id)}
                  >
                    Creative {index + 1}
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "secondary"}
                    onClick={() => toggleCreative(creative.id)}
                  >
                    {selected
                      ? selectedIds[0] === creative.id
                        ? "Primary creative"
                        : "Review variant"
                      : "Add to review set"}
                  </Button>
                </div>
                <button
                  type="button"
                  className="block w-full rounded-[16px] text-left"
                  onClick={() => setActiveCreativeId(creative.id)}
                >
                  <StaticCreativePreviewCard
                    category={displayCreative.category}
                    compact
                    cta={displayCreative.cta}
                    formatLabel={displayCreative.formatLabel}
                    headline={displayCreative.headline}
                    imageGenerationMessage={displayCreative.imageGenerationMessage}
                    imageGenerationState={displayCreative.imageGenerationState}
                    imagePrompt={displayCreative.imagePrompt}
                    imagePromptConfig={displayCreative.imagePromptConfig}
                    imageUrl={displayCreative.imageUrl}
                    storageNormalized={displayCreative.storageNormalized}
                    appComposedFinal={displayCreative.appComposedFinal}
                    location={displayCreative.location}
                    offer={displayCreative.offer}
                    overlayText={displayCreative.overlayText}
                    primaryText={displayCreative.primaryText}
                    qualityGate={displayCreative.qualityGate}
                    imageQa={displayCreative.imageQa}
                    score={displayCreative.score}
                    selectedCount={selected ? selectedCreatives.length : null}
                    visualPromptBrief={displayCreative.visualPromptBrief}
                  />
                </button>
              </article>
            );
          })}
        </div>
        {draftCreatives.length > 0 ? (
          <details className="mt-4 rounded-2xl border border-white/10 bg-black/14 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              {draftCreatives.length} draft concept{draftCreatives.length === 1 ? "" : "s"} need regeneration
            </summary>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              These concepts are not launch-ready and are not selectable as final launch media until accepted app-owned imagery is generated.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              {draftCreatives.map((creative, index) => {
                const displayCreative = getDisplayCreative(creative);
                const active = activeCreative.id === creative.id;

                return (
                  <article
                    className={`rounded-2xl border p-3 transition ${
                      active ? "border-amber-300/35 bg-amber-300/[0.06]" : "border-white/10 bg-background/70"
                    }`}
                    key={creative.id}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        className="min-w-0 text-left text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground transition hover:text-foreground"
                        onClick={() => setActiveCreativeId(creative.id)}
                      >
                        Draft concept {index + 1}
                      </button>
                      <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                        Needs regeneration
                      </span>
                    </div>
                    <button
                      type="button"
                      className="block w-full rounded-[16px] text-left"
                      onClick={() => setActiveCreativeId(creative.id)}
                    >
                      <StaticCreativePreviewCard
                        category={displayCreative.category}
                        compact
                        cta={displayCreative.cta}
                        formatLabel={displayCreative.formatLabel}
                        headline={displayCreative.headline}
                        imageGenerationMessage={displayCreative.imageGenerationMessage}
                        imageGenerationState={displayCreative.imageGenerationState}
                        imagePrompt={displayCreative.imagePrompt}
                        imagePromptConfig={displayCreative.imagePromptConfig}
                        imageUrl={displayCreative.imageUrl}
                        storageNormalized={displayCreative.storageNormalized}
                        appComposedFinal={displayCreative.appComposedFinal}
                        location={displayCreative.location}
                        offer={displayCreative.offer}
                        overlayText={displayCreative.overlayText}
                        primaryText={displayCreative.primaryText}
                        qualityGate={displayCreative.qualityGate}
                        imageQa={displayCreative.imageQa}
                        score={displayCreative.score}
                        selectedCount={null}
                        visualPromptBrief={displayCreative.visualPromptBrief}
                      />
                    </button>
                  </article>
                );
              })}
            </div>
          </details>
        ) : null}
      </section>
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
