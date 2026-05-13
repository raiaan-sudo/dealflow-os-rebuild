import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import { getSelectedAdIdsFromPlan, readCampaignPlanDocument } from "@/lib/services/campaign-plan-document";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import {
  getExpectedOutcomes,
  getStrategyWhy,
} from "@/lib/services/campaign-plan-service";
import {
  normalizeCampaign,
  validateCampaign,
} from "@/lib/services/campaign-validation";
import { FunnelPreview } from "@/components/funnel/funnel-preview";
import { recordActivationEventForCurrentUser } from "@/lib/services/activation-telemetry-service";
import { CustomerVideoPlayer } from "@/components/campaign/customer-video-player";
import { StaticCreativeSummaryCard } from "@/components/campaign/static-creative-preview-card";
import {
  getStaticCreativeReadiness,
  getVideoReadinessLabel,
  getVideoReadinessMessage,
  isLaunchReadyVideoCreative,
  isPlayableVideoCreative,
} from "@/lib/services/creative-media-readiness";

function customerVideoMessage(message?: string | null) {
  const text = message?.trim();

  if (!text) {
    return null;
  }

  if (/provider usage guard|explicitly enabled|provider|higgsfield|heygen|openai|configured|credentials/i.test(text)) {
    return "AI video rendering is not ready yet.";
  }

  return text;
}

async function loadPersistedSelectedAdIds(campaignId: string | null) {
  if (!campaignId) {
    return [];
  }

  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("campaign_plans")
    .select("plan")
    .eq("id", campaignId)
    .maybeSingle();

  const row = (data as { plan?: unknown } | null) ?? null;
  return getSelectedAdIdsFromPlan(readCampaignPlanDocument(row?.plan));
}

export default async function PreviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0
      ? params.campaignId
      : null;
  const activeCampaign = await resolveActiveCampaignRecord(campaignId).catch(() => null);
  let record = activeCampaign?.record ?? null;
  let plan = record ? canonicalCampaignToPlan(record) : null;
  const resolvedCampaignId = record?.campaign.id ?? campaignId;
  const selectedAdIds = await loadPersistedSelectedAdIds(resolvedCampaignId);

  if (!plan) {
    redirect("/builder");
  }

  const validated = validateCampaign({ plan });

  if (!validated) {
    redirect(resolvedCampaignId ? `/builder?campaignId=${encodeURIComponent(resolvedCampaignId)}` : "/builder");
  }

  const safeCampaign = normalizeCampaign(validated);
  const previewPlan = safeCampaign.plan;
  const expectedOutcomes = getExpectedOutcomes(previewPlan);
  const selectedAds = previewPlan.creatives.staticAds
    .filter((ad) => selectedAdIds.includes(ad.id))
    .sort((left, right) => selectedAdIds.indexOf(left.id) - selectedAdIds.indexOf(right.id));
  const videoAds = previewPlan.creatives.videoAds;
  const staticReadiness = getStaticCreativeReadiness(previewPlan.creatives.staticAds, selectedAdIds);
  const selectedStaticMediaReady = staticReadiness.allSelectedReady;
  const launchReadyVideos = videoAds.filter(isLaunchReadyVideoCreative);
  const displayVideoAds = launchReadyVideos.length > 0 ? launchReadyVideos : videoAds;
  const launchReadyVideoCount = launchReadyVideos.length;
  const videoMediaReady = launchReadyVideoCount > 0;
  const mediaReadyForLaunch = selectedStaticMediaReady && videoMediaReady;
  const campaignIdForFlow = record?.campaign.id ?? null;

  if (selectedAds.length === 0) {
    redirect(campaignIdForFlow ? `/build/creatives?campaignId=${encodeURIComponent(campaignIdForFlow)}` : "/builder");
  }
  await recordActivationEventForCurrentUser({
    eventName: "preview_generated_or_viewed",
    campaignId: campaignIdForFlow,
    source: "preview_page",
    metadata: {
      route: "preview",
      selectedCreativeCount: selectedAds.length,
      mode: previewPlan.intent,
    },
    idempotencyKey: `preview_generated_or_viewed:${campaignIdForFlow ?? "unknown"}`,
  }).catch(() => undefined);

  return (
    <PageShell className="max-w-[1500px]">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] xl:items-start">
        <div className="space-y-4">
          <WizardSteps current="review" />
          <PageHeader
            eyebrow="Preview"
            title="Final preview"
            description="Review the selected funnel and creative test set, then move into launch."
          />
          <section className="surface-strong rounded-df-card border border-white/10 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Selected funnel</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">Landing page preview</h2>
              </div>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">
                Preview
              </span>
            </div>
            <div className="relative h-[520px] overflow-hidden rounded-[22px] border border-white/8 bg-white/[0.03]">
              <FunnelPreview
                compact
                plan={previewPlan}
                expectedOutcomes={expectedOutcomes}
                strategyWhy={getStrategyWhy(previewPlan)}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#06101d] to-transparent" />
            </div>
          </section>
        </div>

        <aside className="surface-strong min-w-0 rounded-df-card border border-white/10 p-4 sm:p-5 xl:sticky xl:top-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Selected creative test set</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {selectedAds.length > 0 ? staticReadiness.selectionLabel : "Creative selection needed"}
            </h2>
            {selectedAds.length > 0 ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {staticReadiness.selectedReadyLabel}
                {staticReadiness.issueLabel ? `; ${staticReadiness.issueLabel}` : ""}
              </p>
            ) : null}
            {selectedAds.length > 0 && !selectedStaticMediaReady ? (
              <p className="mt-2 rounded-[14px] border border-amber-300/18 bg-amber-300/[0.08] px-3 py-2 text-sm leading-6 text-amber-100">
                Selected creative media is not launch-ready yet. Return to Creative Studio and refresh the selected previews before launch.
              </p>
            ) : null}
          </div>
          {selectedAds.length > 0 ? (
            <div className="space-y-3">
              <div className="rounded-df-card border border-primary/30 bg-primary/[0.08] p-3">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                  Primary creative
                </p>
                <StaticCreativeSummaryCard
                  angleLabel={selectedAds[0]?.angle}
                  category={previewPlan.creativeStrategy.campaignCategory}
                  className="border-primary/35 bg-black/18"
                  cta={selectedAds[0]?.cta || "Learn More"}
                  headline={selectedAds[0]?.headline || previewPlan.keyOffer}
                  imageGenerationMessage={selectedAds[0]?.imageGenerationMessage}
                  imageGenerationState={selectedAds[0]?.imageGenerationState}
                  imagePrompt={selectedAds[0]?.imagePrompt}
                  imagePromptConfig={selectedAds[0]?.imagePromptConfig}
                  imageUrl={selectedAds[0]?.imageUrl}
                  storageNormalized={selectedAds[0]?.storageNormalized}
                  index={0}
                  location={previewPlan.market}
                  offer={previewPlan.keyOffer}
                  overlayText={selectedAds[0]?.overlayText}
                  primaryText={selectedAds[0]?.primaryText || previewPlan.offerSummary || previewPlan.keyOffer}
                  qualityGate={selectedAds[0]?.qualityGate}
                  imageQa={selectedAds[0]?.imageQa}
                  score={selectedAds[0]?.score}
                  selected
                  selectedCount={selectedAds.length}
                  visualPromptBrief={selectedAds[0]?.visualPromptBrief}
                />
              </div>

              {selectedAds.length > 1 ? (
                <div className="grid gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Review variants
                  </p>
                  {selectedAds.slice(1).map((selectedAd, index) => (
                    <StaticCreativeSummaryCard
                      angleLabel={selectedAd.angle}
                      category={previewPlan.creativeStrategy.campaignCategory}
                      cta={selectedAd.cta || "Learn More"}
                      headline={selectedAd.headline || previewPlan.keyOffer}
                      imageGenerationMessage={selectedAd.imageGenerationMessage}
                      imageGenerationState={selectedAd.imageGenerationState}
                      imagePrompt={selectedAd.imagePrompt}
                      imagePromptConfig={selectedAd.imagePromptConfig}
                      imageUrl={selectedAd.imageUrl}
                      storageNormalized={selectedAd.storageNormalized}
                      index={index + 1}
                      key={selectedAd.id}
                      location={previewPlan.market}
                      offer={previewPlan.keyOffer}
                      overlayText={selectedAd.overlayText}
                      primaryText={selectedAd.primaryText || previewPlan.offerSummary || previewPlan.keyOffer}
                      qualityGate={selectedAd.qualityGate}
                      imageQa={selectedAd.imageQa}
                      score={selectedAd.score}
                      selectedCount={selectedAds.length}
                      visualPromptBrief={selectedAd.visualPromptBrief}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-df-card border border-white/10 bg-white/[0.035] p-5 text-sm text-muted-foreground">
              No saved creative test set is ready yet. Go back to creatives and choose the ads you want to test first.
            </div>
          )}
          {displayVideoAds.length > 0 ? (
            <section className="mt-5 border-t border-white/10 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                UGC video concepts
              </p>
              <div className="mt-3 grid gap-3">
                {displayVideoAds.map((video, index) => (
                  <div className="rounded-[18px] border border-white/10 bg-white/[0.035] p-3" key={video.id}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-semibold text-foreground">
                        Video {index + 1}: {video.title || video.hook}
                      </p>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {getVideoReadinessLabel(video)}
                      </span>
                    </div>
                    {isPlayableVideoCreative(video) ? (
                      <div className="mx-auto max-w-[280px] overflow-hidden rounded-[14px] border border-white/10 bg-black">
                        <CustomerVideoPlayer
                          className="border-0"
                          controlsList="nodownload noplaybackrate"
                          disablePictureInPicture
                          playsInline
                          src={video.videoUrl}
                          title={video.title || video.hook}
                        />
                      </div>
                    ) : (
                      <div className="grid aspect-video place-items-center rounded-[14px] border border-dashed border-white/12 bg-black/22 p-4 text-center text-sm text-muted-foreground">
                        {customerVideoMessage(video.videoGenerationMessage) ?? getVideoReadinessMessage(video)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {!videoMediaReady ? (
                <p className="mt-3 rounded-[14px] border border-amber-300/18 bg-amber-300/[0.08] px-3 py-2 text-sm leading-6 text-amber-100">
                  Video is review-only until campaign-specific prompt, source, and QA metadata are accepted for launch.
                </p>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-between">
        <Button asChild size="lg" variant="secondary">
          <Link href={campaignIdForFlow ? `/builder?campaignId=${encodeURIComponent(campaignIdForFlow)}` : "/builder"}>
            Back to build
          </Link>
        </Button>
        {mediaReadyForLaunch ? (
          <Button asChild size="lg">
            <Link href={campaignIdForFlow ? `/launch?campaignId=${encodeURIComponent(campaignIdForFlow)}` : "/launch"}>
              Next → Launch
            </Link>
          </Button>
        ) : (
          <Button size="lg" disabled>
            Media review needed
          </Button>
        )}
      </div>
    </PageShell>
  );
}
