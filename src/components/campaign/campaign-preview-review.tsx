"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getCampaignIntentLabel } from "@/lib/campaign-intent";
import { FunnelPreview } from "@/components/funnel/funnel-preview";
import { PreviewActions } from "@/components/billing/preview-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreativeOpsQaCard } from "@/components/campaign/creative-ops-qa-card";
import { CreativeStrategySummary } from "@/components/campaign/creative-strategy-summary";
import { StaticAdComposedPreview } from "@/components/campaign/static-ad-composed-preview";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";
import { assessCreativeOpsQuality } from "@/lib/services/creative-ops-qa-service";
import type {
  CampaignPlan,
  ExpectedOutcomes,
} from "@/lib/services/campaign-plan-service";
import type {
  StaticCreativeAsset,
  VideoCreativeAsset,
} from "@/lib/services/creative-engine";

type PreviewTab = "Funnel" | "Ads" | "Assets" | "Follow-up";

type PreviewAsset = {
  id: string;
  label: string;
  previewUrl: string | null;
  kind: "image" | "video";
  state: "available" | "generating" | "unavailable" | "failed";
  message: string | null;
};

type SystemJobStatus = "pending" | "processing" | "completed" | "failed";

type SystemJob = {
  id: string;
  kind: string;
  status: SystemJobStatus;
  result?: {
    staticAds?: StaticCreativeAsset[];
  } | null;
  error_message?: string | null;
};

export function getAdPreviewStatusLabel(ad: Pick<StaticCreativeAsset, "recommended" | "score" | "angle" | "imageGenerationState">, index: number) {
  if (ad.recommended) {
    return `Recommended • Score ${ad.score ?? 0}/10`;
  }

  if (ad.imageGenerationState === "failed") {
    return "Preview failed";
  }

  if (ad.imageGenerationState === "unavailable") {
    return "Preview not ready yet";
  }

  return ad.angle ? `${ad.angle} concept` : `Ad concept ${index + 1}`;
}

export function getAdPreviewFallbackMessage(imageGenerationState?: StaticCreativeAsset["imageGenerationState"]) {
  if (imageGenerationState === "failed") {
    return "The image preview failed, but the concept, copy, and strategy are still ready to review.";
  }

  return "The concept is ready. The image preview has not finished yet.";
}

export function getAssetStateLabel(state: PreviewAsset["state"]) {
  if (state === "available") {
    return "Ready";
  }

  if (state === "generating") {
    return "Generating now";
  }

  if (state === "failed") {
    return "Needs attention";
  }

  return "Not ready yet";
}

export function getAssetEmptyMessage(asset: Pick<PreviewAsset, "kind" | "state">) {
  if (asset.state === "generating") {
    return `Your ${asset.kind} preview is being generated now.`;
  }

  if (asset.state === "failed") {
    return `This ${asset.kind} preview could not be generated.`;
  }

  return `No ${asset.kind} preview is available for this item yet.`;
}

type Props = {
  campaignId?: string | null;
  plan: CampaignPlan;
  expectedOutcomes: ExpectedOutcomes;
  strategyWhy: string[];
  brandName: string;
  previewAds: StaticCreativeAsset[];
  previewVideos: VideoCreativeAsset[];
};

function PreviewTabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-primary text-primary-foreground"
          : "border border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function trimWords(value: string, maxWords: number) {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : `${words.slice(0, maxWords).join(" ")}...`;
}

function formatStatus(status?: string) {
  if (!status) {
    return "Unavailable";
  }

  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function getReviewSystemMessage(plan: CampaignPlan) {
  return `This campaign review was prepared from your setup answers for ${plan.market}. Check the funnel, ad ideas, and asset status before you move into account connection.`;
}

export function CampaignPreviewReview({
  campaignId = null,
  plan,
  expectedOutcomes,
  strategyWhy,
  brandName,
  previewAds,
  previewVideos,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PreviewTab>("Funnel");
  const [adsState, setAdsState] = useState(previewAds);
  const [isGeneratingAds, setIsGeneratingAds] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const jobStreamsRef = useRef<Map<string, EventSource>>(new Map());

  useEffect(() => {
    setAdsState(previewAds);
  }, [previewAds]);

  const visibleAds = [...adsState]
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
  const allStaticAdsMissing =
    adsState.length > 0 &&
    adsState.every((ad) => ad.imageGenerationState !== "generated" || !ad.imageUrl);
  const hasPendingStaticAssets = adsState.some(
    (ad) =>
      ad.imageGenerationState === "generating" ||
      ad.imageGenerationState === "unavailable" ||
      !ad.imageUrl,
  );
  const hasPendingVideoAssets = previewVideos.some(
    (video) =>
      video.videoGenerationState === "generating" ||
      video.videoGenerationState === "unavailable",
  );
  const shouldRefreshForAssets =
    Boolean(campaignId) && !isGeneratingAds && (hasPendingStaticAssets || hasPendingVideoAssets);
  const assetItems: PreviewAsset[] = [
    ...[...adsState].sort((left, right) => right.score - left.score).slice(0, 4).map((ad, index) => ({
      id: `static-${ad.id}`,
      label: ad.headline || ad.hook || `Static creative ${index + 1}`,
      previewUrl: ad.imageUrl || null,
      kind: "image" as const,
      state:
        ad.imageGenerationState === "generated" && ad.imageUrl
          ? "available" as const
          : ad.imageGenerationState === "failed"
            ? "failed" as const
          : "unavailable" as const,
      message: ad.imageGenerationMessage,
    })),
    ...previewVideos.slice(0, 2).map((video, index) => ({
      id: `video-${video.id}`,
      label: video.title || video.hook || `Video creative ${index + 1}`,
      previewUrl: video.videoUrl || null,
      kind: "video" as const,
      state:
        video.videoGenerationState === "generated" && video.videoUrl
          ? "available" as const
          : video.videoGenerationState === "generating"
            ? "generating" as const
          : video.videoGenerationState === "failed"
            ? "failed" as const
          : "unavailable" as const,
      message: video.videoGenerationMessage ?? null,
    })),
  ];
  const intentLabel = getCampaignIntentLabel(plan.intent, { capitalized: true });
  const intentLabelPlural = getCampaignIntentLabel(plan.intent, {
    plural: true,
    capitalized: true,
  });
  const systemMessage = getReviewSystemMessage(plan);
  const adsGridClass =
    visibleAds.length <= 1
      ? "grid max-w-2xl gap-5"
      : visibleAds.length === 2
        ? "grid gap-5 xl:grid-cols-2"
        : "grid gap-5 lg:grid-cols-2 2xl:grid-cols-3";
  const assetsGridClass =
    assetItems.length <= 1
      ? "grid max-w-xl gap-4"
      : assetItems.length === 2
        ? "grid gap-4 xl:grid-cols-2"
        : "grid gap-4 sm:grid-cols-2 2xl:grid-cols-3";
  const videoAssetsGridClass =
    previewVideos.length <= 1 ? "grid max-w-xl gap-4" : "grid gap-4 xl:grid-cols-2";

  const canGenerateStaticAds = Boolean(campaignId);

  const subscribeToJob = useCallback((jobId: string) => {
    if (jobStreamsRef.current.has(jobId)) {
      return;
    }

    const source = new EventSource(`/api/system-jobs/${encodeURIComponent(jobId)}/stream`);
    jobStreamsRef.current.set(jobId, source);

    source.addEventListener("job", (event) => {
      try {
        const job = JSON.parse((event as MessageEvent).data) as SystemJob;

        if (job.kind === "static_creative_generation" && Array.isArray(job.result?.staticAds)) {
          setAdsState(job.result.staticAds);
        }

        if (job.status === "completed") {
          if (job.kind === "static_creative_generation") {
            setGenerationMessage("Static creative job completed.");
          }
          source.close();
          jobStreamsRef.current.delete(jobId);
          router.refresh();
        } else if (job.status === "failed") {
          setGenerationMessage(job.error_message || "Background generation failed.");
          source.close();
          jobStreamsRef.current.delete(jobId);
          router.refresh();
        }
      } catch {
        source.close();
        jobStreamsRef.current.delete(jobId);
      }
    });

    source.addEventListener("error", () => {
      source.close();
      jobStreamsRef.current.delete(jobId);
    });
  }, [router]);

  async function generateStaticAds() {
    if (!campaignId || isGeneratingAds) {
      return;
    }

    setIsGeneratingAds(true);
    setGenerationMessage("Generating static creative previews.");

    try {
      const response = await fetchWithRetry(`/api/campaigns/${encodeURIComponent(campaignId)}/generate-static-ads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          force: !allStaticAdsMissing,
        }),
        retries: 0,
        timeoutMs: 90000,
      });
      const data = (await response.json()) as {
        success?: boolean;
        job?: SystemJob;
        error?: string;
      };

      if (!response.ok || !data.job?.id) {
        throw new Error(data.error || "Static creative generation failed.");
      }

      setGenerationMessage("Static creative job queued.");
      subscribeToJob(data.job.id);
    } catch (error) {
      setGenerationMessage(
        error instanceof Error ? error.message : "Static creative generation failed.",
      );
    } finally {
      setIsGeneratingAds(false);
    }
  }

  useEffect(() => {
    if (!campaignId || !shouldRefreshForAssets) {
      return;
    }

    let cancelled = false;

    void fetchWithRetry(
      `/api/system-jobs?campaignId=${encodeURIComponent(campaignId)}&status=pending,processing`,
      {
        method: "GET",
        retries: 0,
        timeoutMs: 10000,
      },
    )
      .then(async (response) => {
        const data = (await response.json()) as { jobs?: SystemJob[] };

        if (!response.ok || cancelled || !Array.isArray(data.jobs)) {
          return;
        }

        data.jobs.forEach((job) => {
          if (job.status === "pending" || job.status === "processing") {
            subscribeToJob(job.id);
          }
        });
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [campaignId, shouldRefreshForAssets, subscribeToJob]);

  useEffect(() => {
    const jobStreams = jobStreamsRef.current;

    return () => {
      jobStreams.forEach((stream) => stream.close());
      jobStreams.clear();
    };
  }, []);

  return (
    <div className="w-full space-y-6 overflow-visible px-4 sm:px-6">
      <div className="rounded-[22px] border border-primary/15 bg-primary/[0.05] px-5 py-4 text-sm font-medium text-primary">
        {systemMessage}
      </div>

      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Onboarding summary
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                {plan.market} {intentLabel} campaign package
              </h2>
              <p className="mt-3 max-w-[720px] text-sm leading-7 text-muted-foreground">
                This is the saved campaign package built from your setup answers. Review it here first, then move into account connection and launch setup.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2">
                Campaign: {plan.market} {intentLabelPlural}
              </div>
              <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2">
                Audience: {plan.audience}
              </div>
              <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2">
                Intent: {intentLabel}
              </div>
              <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2">
                Offer: {plan.keyOffer}
              </div>
              <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2">
                Current state: {formatStatus(plan.runtime.status)}
              </div>
            </div>
          </div>
          <Badge className="border-primary/15 bg-primary/10 text-primary">Generated from onboarding</Badge>
        </div>
      </Card>

      <CreativeStrategySummary
        strategy={plan.creativeStrategy}
        title="Campaign strategy"
        description="A concise explanation of the category, mechanism, proof angle, and trigger driving this generated package."
      />

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap gap-3">
          {(["Funnel", "Ads", "Assets", "Follow-up"] as PreviewTab[]).map((tab) => (
            <PreviewTabButton key={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)}>
              {tab}
            </PreviewTabButton>
          ))}
        </div>
      </Card>

      {activeTab === "Funnel" ? (
        <Card className="p-6 sm:p-7">
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Funnel
              </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                  What prospects will see first
                </h2>
                <p className="mt-2 max-w-[720px] text-sm leading-7 text-muted-foreground">
                  This section shows the current landing page draft generated from your offer, audience, property focus, and market inputs.
                </p>
              </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Headline
                </p>
                <p className="mt-2 text-sm leading-6">{plan.funnel.headline || "Campaign headline unavailable"}</p>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Subheadline
                </p>
                <p className="mt-2 text-sm leading-6">{plan.funnel.subheadline || "Campaign subheadline unavailable"}</p>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  CTA
                </p>
                <p className="mt-2 text-sm leading-6">{plan.funnel.cta || "Campaign CTA unavailable"}</p>
              </div>
            </div>
            <FunnelPreview
              plan={plan}
              expectedOutcomes={expectedOutcomes}
              strategyWhy={strategyWhy}
            />
          </div>
        </Card>
      ) : null}

      {activeTab === "Ads" ? (
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Ads
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                  Ad concept review
                </h2>
                <p className="mt-2 max-w-[720px] text-sm leading-7 text-muted-foreground">
                  Review the ad ideas first. Copy, ranking, and QA are ready immediately, while image previews may finish a little later.
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
                <Badge className="border-white/8 bg-white/[0.03] text-muted-foreground">
                  {visibleAds.length} ad {visibleAds.length === 1 ? "concept" : "concepts"}
                </Badge>
                {canGenerateStaticAds ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-10 whitespace-nowrap"
                    onClick={() => void generateStaticAds()}
                    disabled={isGeneratingAds}
                  >
                    {isGeneratingAds
                      ? "Generating image previews..."
                      : allStaticAdsMissing
                        ? "Generate image previews"
                        : "Regenerate image previews"}
                  </Button>
                ) : null}
              </div>
            </div>
            {generationMessage ? (
              <div className="mt-4 rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-muted-foreground">
                {generationMessage}
              </div>
            ) : null}
            {allStaticAdsMissing ? (
              <div className="mt-4 rounded-[16px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Your ad ideas are ready now. Image previews will show up here once generation finishes, and you can still regenerate them manually if needed.
              </div>
            ) : null}
          </Card>
          <div className={adsGridClass}>
          {visibleAds.map((ad, index) => (
            <Card key={ad.id} className="h-full overflow-hidden p-0">
              <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e7eefc] text-sm font-semibold text-[#315b96]">
                    {brandName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{brandName}</p>
                    <p className="truncate text-xs text-muted-foreground">Sponsored</p>
                  </div>
                </div>
                {ad?.recommended ? (
                  <Badge className="max-w-full border-primary/15 bg-primary/10 text-primary">
                    🔥 {getAdPreviewStatusLabel(ad, index)}
                  </Badge>
                ) : (
                  <Badge className="max-w-full border-white/8 bg-white/[0.03] text-muted-foreground">
                    {getAdPreviewStatusLabel(ad, index)}
                  </Badge>
                )}
              </div>
              <StaticAdComposedPreview
                category={plan.creativeStrategy.campaignCategory}
                compact
                cta={ad.cta}
                headline={ad.headline}
                imageGenerationMessage={ad.imageGenerationMessage}
                imageGenerationState={ad.imageGenerationState}
                imageUrl={ad.imageUrl}
                location={plan.market}
                offer={plan.offerSummary || plan.keyOffer}
                overlayText={ad.overlayText || ad.hook}
                primaryText={ad.primaryText}
                qualityGate={ad.qualityGate}
                score={ad.score}
                selectedCount={visibleAds.length}
                showRawAssetState={false}
                visualPromptBrief={ad.visualPromptBrief}
              />
              <div className="space-y-3 px-4 py-4 sm:px-5">
                <CreativeOpsQaCard
                  compact
                  assessment={assessCreativeOpsQuality({
                    strategy: plan.creativeStrategy,
                    scoreBreakdown: ad?.scoreBreakdown ?? null,
                    hook: ad?.hook,
                    overlayText: ad?.overlayText,
                    primaryText: ad?.primaryText,
                    headline: ad?.headline,
                  })}
                />
                {ad?.imageGenerationMessage ? (
                  <div className="rounded-[14px] border border-white/8 bg-black/20 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Image status
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {ad.imageGenerationMessage}
                    </p>
                  </div>
                ) : null}
                <div className="rounded-[14px] border border-white/8 bg-black/20 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Hook
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm leading-6">{ad?.hook || ad?.overlayText || ""}</p>
                </div>
                <div className="rounded-[14px] border border-white/8 bg-black/20 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Primary text
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm leading-6">{trimWords(ad?.primaryText || "", 24)}</p>
                </div>
                <div className="rounded-[14px] border border-white/8 bg-black/20 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Angle
                  </p>
                  <p className="mt-2 text-sm leading-6">{ad?.angle || "static ad"}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
                  <p className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-5">{ad?.headline || ""}</p>
                  <Button type="button" size="sm" className="whitespace-nowrap">
                    {ad?.cta === "Comment 'LIST'" || ad?.cta === "Comment 'ACCESS'" ? "Get Access" : ad?.cta || "Get Access"}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          </div>
        </div>
      ) : null}

      {activeTab === "Assets" ? (
        <Card className="p-6 sm:p-7">
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Assets
              </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                  Asset availability
                </h2>
                <p className="mt-2 max-w-[720px] text-sm leading-7 text-muted-foreground">
                  This section shows the real saved asset state for this campaign, including what is ready, what is still being prepared, and what needs attention.
                </p>
              </div>
            <div className={assetsGridClass}>
              {assetItems.map((asset) => (
                <Card
                  key={asset.id}
                  className="overflow-hidden rounded-[20px] border border-white/8 bg-white/[0.03] p-0"
                >
                  {asset.previewUrl ? (
                    <div
                      className="aspect-[16/10] bg-cover bg-center"
                      style={{ backgroundImage: `url(${asset.previewUrl})` }}
                    />
                  ) : (
                    <div className="flex aspect-[16/10] items-center justify-center bg-black/20 px-4 text-center text-sm text-muted-foreground">
                      {getAssetEmptyMessage(asset)}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <p className="line-clamp-2 text-sm font-medium leading-6">{asset.label}</p>
                    <Badge
                      className={
                        asset.state === "available"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                          : asset.state === "generating"
                            ? "border-sky-500/20 bg-sky-500/10 text-sky-300"
                          : asset.state === "failed"
                            ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                            : "border-white/10 bg-white/[0.06] text-muted-foreground"
                      }
                    >
                      {asset.state === "available"
                        ? getAssetStateLabel(asset.state)
                        : asset.state === "generating"
                          ? getAssetStateLabel(asset.state)
                          : asset.state === "failed"
                            ? getAssetStateLabel(asset.state)
                            : getAssetStateLabel(asset.state)}
                    </Badge>
                  </div>
                  {asset.message ? (
                    <div className="px-4 pb-4">
                      <p className="text-sm leading-6 text-muted-foreground">{asset.message}</p>
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
            {assetItems.length === 0 ? (
              <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5 text-sm leading-7 text-muted-foreground">
                Assets are still being prepared for this campaign. As generation completes, this section will fill with the real saved image and video previews.
              </div>
            ) : null}
            {previewVideos.length > 0 ? (
              <div className={videoAssetsGridClass}>
                {previewVideos.slice(0, 2).map((video) => (
                  <Card key={video.id} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                    {video.videoGenerationState === "generated" && video.videoUrl ? (
                      <div className="mb-4 overflow-hidden rounded-[16px] border border-white/8 bg-black">
                        <video
                          src={video.videoUrl}
                          controls
                          playsInline
                          preload="metadata"
                          className="aspect-[9/16] w-full bg-black object-cover"
                        />
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-6">{video.title}</p>
                      <Badge className="border-white/8 bg-white/[0.03] text-muted-foreground">
                        {video.videoGenerationState === "generated" && video.videoUrl
                          ? "Ready"
                          : video.videoGenerationState === "generating"
                            ? "Generating now"
                            : video.videoGenerationState === "failed"
                              ? "Needs attention"
                              : video.videoGenerationState === "unavailable"
                                ? "Not ready yet"
                                : "Concept ready"}
                      </Badge>
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{video.hook}</p>
                    {video.videoGenerationMessage ? (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{video.videoGenerationMessage}</p>
                    ) : null}
                  </Card>
                ))}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {activeTab === "Follow-up" ? (
        <Card className="p-6 sm:p-7">
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Follow-up
              </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                  Follow-up configuration
                </h2>
                <p className="mt-2 max-w-[720px] text-sm leading-7 text-muted-foreground">
                  Follow-up only appears here once real messaging or workflow automation has been configured for this campaign.
                </p>
              </div>
            <div className="rounded-[28px] border border-white/8 bg-[#0f172a] p-5 text-sm leading-7 text-muted-foreground shadow-[0_28px_90px_-48px_rgba(0,0,0,0.68)]">
              No follow-up messaging has been configured for this campaign yet. This step stays empty until real SMS or workflow automation content exists.
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="border-primary/15 bg-primary/[0.04] p-6 sm:p-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Next step
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">Connect your accounts and domain</h2>
          <p className="mt-3 max-w-[720px] text-sm leading-7 text-muted-foreground">
            Your review is done. Next, connect the ad account, confirm the domain, and finish the launch-readiness checks.
          </p>
          <p className="mt-2 max-w-[640px] text-sm leading-7 text-muted-foreground">
            You are not launching yet. This next step is only for account, domain, and tracking setup.
          </p>
        </div>
        <div className="mt-6 flex w-full justify-center">
          <PreviewActions campaignId={campaignId} />
        </div>
      </Card>
    </div>
  );
}
