"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  StaticCreativePreviewCard,
} from "@/components/campaign/static-creative-preview-card";
import { Button } from "@/components/ui/button";
import {
  getStaticCreativeReadiness,
  getStaticPreviewStatusMessage,
  getVideoReadinessLabel,
  getVideoReadinessMessage,
  isLaunchReadyStaticCreative,
  isLaunchReadyVideoCreative,
  isPlayableVideoCreative,
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
  sourceStaticAssetId?: string | null;
  sourceImageUrl?: string | null;
  sourceStaticAccepted?: boolean | null;
  promptUsed?: string | null;
  promptSource?: string | null;
  promptHash?: string | null;
  scriptHash?: string | null;
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
  persistedSelectedAdIds?: string[];
  videoCreatives?: VideoCreativeOption[];
};

type StudioPhase = "static_ads" | "ugc_videos";

type SystemJob = {
  id: string;
  kind?: string | null;
  status?: string | null;
  error_message?: string | null;
  result?: {
    staticAds?: CreativeOption[] | null;
  } | null;
};

function isUgcCreative(creative: CreativeOption) {
  return /\bugc\b/i.test(`${creative.id} ${creative.formatLabel ?? ""} ${creative.breakdown?.concept ?? ""}`);
}

function creativeNeedsImageGeneration(creative: CreativeOption) {
  return !creative.imageUrl ||
    creative.imageGenerationState === "failed" ||
    !evaluateStaticVisualAssetDecision(creative).usable;
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
  persistedSelectedAdIds = [],
  videoCreatives = [],
}: CreativeWizardProps) {
  const router = useRouter();
  const jobStreamsRef = useRef<Map<string, EventSource>>(new Map());
  const autoVideoStartedRef = useRef(false);
  const buildHref = `/builder?campaignId=${encodeURIComponent(campaignId)}`;
  const rankedCreatives = useMemo(
    () => [...creatives].sort((left, right) => {
      const readinessDelta = Number(isLaunchReadyStaticCreative(right)) - Number(isLaunchReadyStaticCreative(left));
      return readinessDelta || (right.score ?? 0) - (left.score ?? 0);
    }),
    [creatives],
  );
  const topCreatives = rankedCreatives.slice(0, 3);
  const topUgcCreatives = rankedCreatives
    .filter((creative) => /\bugc\b/i.test(`${creative.id} ${creative.formatLabel ?? ""}`))
    .slice(0, 2);
  const availableIds = new Set(rankedCreatives.map((creative) => creative.id));
  const savedSelectedIds = persistedSelectedAdIds.filter((id) => availableIds.has(id)).slice(0, 6);
  const recommendedSelectedIds = topCreatives.length > 0
    ? Array.from(
        new Set(
          topUgcCreatives.length > 0
            ? [
                ...topCreatives
                  .filter((creative) => !topUgcCreatives.some((ugcCreative) => ugcCreative.id === creative.id))
                  .slice(0, Math.max(1, 3 - topUgcCreatives.length)),
                ...topUgcCreatives,
              ].map((creative) => creative.id)
            : topCreatives.map((creative) => creative.id),
        ),
      )
    : rankedCreatives.slice(0, 1).map((creative) => creative.id);
  const defaultSelectedIds = savedSelectedIds.length > 0 ? savedSelectedIds : recommendedSelectedIds;
  const minSelected = Math.min(2, rankedCreatives.length);
  const maxSelected = Math.min(6, rankedCreatives.length);
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultSelectedIds);
  const [saving, setSaving] = useState(false);
  const [renderingImages, setRenderingImages] = useState(false);
  const [renderingVideo, setRenderingVideo] = useState(false);
  const [activeImageJobId, setActiveImageJobId] = useState<string | null>(null);
  const [activeVideoJobId, setActiveVideoJobId] = useState<string | null>(null);
  const [renderMessage, setRenderMessage] = useState<string | null>(null);
  const [videoMessage, setVideoMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullVideoOpen, setFullVideoOpen] = useState(false);
  const [activePhase, setActivePhase] = useState<StudioPhase>("static_ads");
  const [activeCreativeId, setActiveCreativeId] = useState<string | null>(
    defaultSelectedIds[0] ?? rankedCreatives[0]?.id ?? null,
  );
  const selectedCreatives = rankedCreatives.filter((creative) => selectedIds.includes(creative.id));
  const staticReadiness = getStaticCreativeReadiness(rankedCreatives, selectedIds);
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
  const needsImageGeneration = rankedCreatives.some(creativeNeedsImageGeneration);
  const selectedNeedsImageGeneration = selectedCreatives.some(creativeNeedsImageGeneration);
  const hasGeneratedImages = rankedCreatives.some((creative) => Boolean(creative.imageUrl));
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
  const primaryVideoCreative =
    videoCreatives.find((video) => video.conceptType === "customer_ugc") ??
    videoCreatives[0] ??
    null;
  const [activeVideoId, setActiveVideoId] = useState<string | null>(primaryVideoCreative?.id ?? null);
  const activeVideoCreative =
    videoCreatives.find((video) => video.id === activeVideoId) ??
    primaryVideoCreative;
  const videoNeedsGeneration = Boolean(
    primaryVideoCreative &&
    !primaryVideoCreative.videoUrl &&
    primaryVideoCreative.videoGenerationState !== "generating" &&
    primaryVideoCreative.videoGenerationState !== "generated",
  );

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

        if (job.status === "completed") {
          if (surface === "video") {
            setVideoMessage("Video preview is processing. This page will update when it is ready.");
          } else {
            const staticAds = job.result?.staticAds ?? [];
            setRenderMessage(
              getImageLimitMessage(staticAds) ??
                getStaticPreviewStatusMessage(getStaticCreativeReadiness(staticAds, selectedIds)) ??
                "Image previews are ready.",
            );
          }
          source.close();
          jobStreamsRef.current.delete(jobId);
          clearActiveJob();
          router.refresh();
        } else if (job.status === "failed") {
          if (surface === "video") {
            setVideoMessage(customerVideoMessage(job.error_message) || "Video preview rendering failed.");
          } else {
            setRenderMessage(customerImageMessage(job.error_message) || "Image preview rendering failed.");
          }
          source.close();
          jobStreamsRef.current.delete(jobId);
          clearActiveJob();
          router.refresh();
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
  }, [router, selectedIds]);

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
        | { job?: SystemJob | null; error?: string | null }
        | null;

      if (!response.ok || !data?.job?.id) {
        throw new Error(data?.error || "Image preview rendering could not start.");
      }

      setRenderMessage("Image previews are being prepared. This page will update when the visuals are ready.");
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
  }, [campaignId, renderingImages, subscribeToJob]);

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

      setVideoMessage("Video preview is processing. This page will update when it is ready.");
      subscribeToJob(data.job.id, "video");
    } catch (videoError) {
      setVideoMessage(null);
      setError(
        customerVideoMessage(videoError instanceof Error ? videoError.message : null) ??
          "Video preview rendering could not start.",
      );
    } finally {
      setRenderingVideo(false);
    }
  }, [activeVideoCreative, campaignId, renderingVideo, setActiveVideoId, subscribeToJob]);

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
    if (!activeVideoId || videoCreatives.some((video) => video.id === activeVideoId)) {
      return;
    }

    setActiveVideoId(primaryVideoCreative?.id ?? videoCreatives[0]?.id ?? null);
  }, [activeVideoId, primaryVideoCreative?.id, videoCreatives]);

  useEffect(() => {
    if (!activeCreativeId || rankedCreatives.some((creative) => creative.id === activeCreativeId)) {
      return;
    }

    setActiveCreativeId(primaryCreative?.id ?? rankedCreatives[0]?.id ?? null);
  }, [activeCreativeId, primaryCreative?.id, rankedCreatives]);

  function toggleCreative(creativeId: string) {
    setActiveCreativeId(creativeId);
    setSelectedIds((current) => {
      if (current.includes(creativeId)) {
        return current.filter((id) => id !== creativeId);
      }

      if (current.length >= maxSelected) {
        return current;
      }

      return [...current, creativeId];
    });
    setError(null);
  }

  async function handleNext() {
    if (saving) {
      return;
    }

    if (!canContinue || !primaryCreative) {
      setError(
        rankedCreatives.length >= 2
          ? `Select ${minSelected}-${maxSelected} creatives to continue.`
          : "Select at least one creative to continue.",
      );
      return;
    }

    if (!ugcQuotaSatisfied) {
      setError("Keep at least one native-style concept in the selected creative set.");
      return;
    }

    if (!selectedMediaReady) {
      setError("Refresh unfinished previews before saving this launch set.");
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

      const params = new URLSearchParams();
      params.set("campaignId", campaignId);
      params.set("selectedAdId", persistedSelectedAdId);
      if (persistedSelectedAdIds.length > 0) {
        params.set("selectedAdIds", persistedSelectedAdIds.join(","));
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
  const imageRenderPending = renderingImages || Boolean(activeImageJobId);
  const imageActionPending = renderingImages || Boolean(activeImageJobId);
  const videoActionPending = renderingVideo || Boolean(activeVideoJobId);
  const imagePendingMessage = "Image preview is being prepared. This page will update when the visual is ready.";
  const imageStatusMessage = selectedNeedsImageGeneration
    ? imageLimitMessage ??
      (allImagesMissing
      ? "Creating the full visual set now. The cards below stay visible while final images render."
      : getStaticPreviewStatusMessage(staticReadiness) ??
        "Some optional previews need another attempt. Launch-ready selected previews stay available.")
    : null;
  const getDisplayCreative = (creative: CreativeOption): CreativeOption =>
    imageRenderPending && creativeNeedsImageGeneration(creative)
      ? {
          ...creative,
          imageGenerationState: "generating",
          imageGenerationMessage: imagePendingMessage,
        }
      : creative;
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
              The creative brief approval is saved in the intake step. Static ads are image-based launch variants; UGC videos are separate creator-style video concepts for review.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] px-4 py-3 text-sm leading-6 text-emerald-100 lg:max-w-md">
            Approved brief source: saved creative intake. This screen only selects creatives, reviews variants, and starts explicit preview renders.
          </div>
          <div className="rounded-2xl border border-cyan-300/18 bg-cyan-300/[0.06] px-4 py-3 text-sm leading-6 text-cyan-100 lg:max-w-md">
            Full-resolution creative files stay inside DealFlow. Preview, approve, request revisions, and use assets through the launch workflow.
          </div>
        </div>

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
            {activePhase === "static_ads" ? "Static ads are the launch test set" : "UGC videos are supporting review assets"}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {activePhase === "static_ads"
              ? "Pick one primary creative for the default preview and keep the remaining selected ads as review variants for launch comparison."
              : "Review UGC video scripts and rendered previews separately from the native-style static ads. Video review does not change the saved static launch set."}
          </p>
        </div>
      </section>

      <section className={`${activePhase === "static_ads" ? "grid" : "hidden"} gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5 xl:grid-cols-[minmax(420px,0.9fr)_minmax(420px,1.1fr)]`}>
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
            location={displayActiveCreative.location}
            formatLabel={displayActiveCreative.formatLabel}
            offer={displayActiveCreative.offer}
            overlayText={displayActiveCreative.overlayText}
            primaryText={displayActiveCreative.primaryText}
            qualityGate={displayActiveCreative.qualityGate}
            imageQa={displayActiveCreative.imageQa}
            score={displayActiveCreative.score}
            selectedCount={selectedCreatives.length}
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
                ? `${staticReadiness.selectedReadyLabel}. DealFlow will use the first saved ad as the primary creative and keep the rest as review variants once every launch gate is ready.`
                : `${staticReadiness.selectedReadyLabel}. Save the primary creative and review variants before launch can continue.`}
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
                  disabled={imageActionPending || Boolean(imageLimitMessage)}
                >
                  {imageLimitMessage
                    ? "Daily image limit reached"
                    : imageActionPending
                    ? "Refreshing previews..."
                    : needsImageGeneration
                      ? "Refresh unfinished previews"
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

          <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-1">
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
                    location={displayCreative.location}
                    offer={displayCreative.offer}
                    overlayText={displayCreative.overlayText}
                    primaryText={displayCreative.primaryText}
                    qualityGate={displayCreative.qualityGate}
                    imageQa={displayCreative.imageQa}
                    score={displayCreative.score}
                    selectedCount={selectedCreatives.length}
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
              <Button onClick={() => void handleNext()} type="button" disabled={saving || !canContinue || !ugcQuotaSatisfied || !selectedMediaReady}>
                {saving ? "Saving..." : "Save test set"}
              </Button>
            </div>
            <p className={error ? "mt-3 text-sm text-rose-400" : "mt-3 text-sm text-muted-foreground"}>
              {error ??
                (!selectedMediaReady
                  ? staticReadiness.selectedBlockedCount > 0
                    ? "Refresh selected previews before saving this launch set."
                    : "Select launch-ready previews before saving this launch set."
                  : !savedSelectionMatchesCurrent
                    ? "Draft selection only. Launch remains blocked until this set is saved."
                    : rankedCreatives.length >= 2
                      ? `Use ${minSelected}-${maxSelected} creatives. The recommended set keeps at least one native-style concept selected.`
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
                isLaunchReadyVideoCreative(activeVideoCreative)
                  ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"
                  : isPlayableVideoCreative(activeVideoCreative)
                    ? "border-amber-300/25 bg-amber-300/[0.08] text-amber-100"
                    : "border-white/10 bg-white/[0.04] text-muted-foreground"
              }`}>
                {getVideoReadinessLabel(activeVideoCreative)}
              </span>
            </div>
            <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[18px] border border-white/10 bg-black/28">
              {isPlayableVideoCreative(activeVideoCreative) ? (
                <video
                  className="aspect-[9/16] max-h-[70dvh] w-full bg-black object-contain"
                  controls
                  controlsList="nodownload noplaybackrate"
                  disablePictureInPicture
                  playsInline
                  preload="metadata"
                  src={activeVideoCreative.videoUrl ?? undefined}
                />
              ) : (
                <div className="grid aspect-[9/16] place-items-center bg-[linear-gradient(135deg,rgba(94,234,212,0.12),rgba(139,92,246,0.12)),radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_24%)] p-5 text-center">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {videoActionPending ? "Rendering" : getVideoReadinessLabel(activeVideoCreative)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {getVideoReadinessMessage(activeVideoCreative)}
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
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void queueVideoPreview({
                    force: activeVideoCreative.videoGenerationState === "failed",
                    video: activeVideoCreative,
                  })}
                  disabled={videoActionPending || activeVideoCreative.videoGenerationState === "generating"}
                >
                  {videoActionPending || activeVideoCreative.videoGenerationState === "generating"
                    ? "Rendering video..."
                    : activeVideoCreative.videoGenerationState === "failed"
                      ? "Retry video preview"
                      : "Render video preview"}
                </Button>
              )}
              {customerVideoMessage(videoMessage || activeVideoCreative.videoGenerationMessage) ? (
                <span className="text-sm leading-6 text-muted-foreground">
                  {customerVideoMessage(videoMessage || activeVideoCreative.videoGenerationMessage)}
                </span>
              ) : null}
            </div>
            {videoCreatives.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {videoCreatives.map((video, index) => {
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
                      onClick={() => setActiveVideoId(video.id)}
                      aria-label={`View ${video.title}`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Video {index + 1}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-foreground">
                        {video.title}
                      </p>
                      <p className={isLaunchReadyVideoCreative(video) ? "mt-2 text-[11px] text-emerald-200" : "mt-2 text-[11px] text-muted-foreground"}>
                        {video.id === activeVideoId && activeVideoJobId ? "Rendering" : getVideoReadinessLabel(video)}
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
                {activeVideoCreative.script.slice(0, 6).map((line, index) => (
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
                <video
                  className="mx-auto max-h-[calc(100dvh-7rem)] w-full max-w-[520px] bg-black object-contain"
                  controls
                  controlsList="nodownload noplaybackrate"
                  disablePictureInPicture
                  playsInline
                  preload="metadata"
                  src={activeVideoCreative.videoUrl ?? undefined}
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
              View all creatives and choose {minSelected}-{maxSelected}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Click any card to view it large above. {selectedCreatives.length}/{maxSelected} selected.
          </p>
        </div>
        <div className="mt-5 flex snap-x gap-4 overflow-x-auto pb-3">
          {rankedCreatives.map((creative, index) => {
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
                    location={displayCreative.location}
                    offer={displayCreative.offer}
                    overlayText={displayCreative.overlayText}
                    primaryText={displayCreative.primaryText}
                    qualityGate={displayCreative.qualityGate}
                    imageQa={displayCreative.imageQa}
                    score={displayCreative.score}
                    selectedCount={selectedCreatives.length}
                    visualPromptBrief={displayCreative.visualPromptBrief}
                  />
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
