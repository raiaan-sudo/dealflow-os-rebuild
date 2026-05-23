import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import {
  getSelectedAdIdsFromPlan,
  getSelectedUgcVideoIdsFromPlan,
  readCampaignPlanDocument,
} from "@/lib/services/campaign-plan-document";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import {
  getExpectedOutcomes,
  getStrategyWhy,
  type CampaignPlan,
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
import {
  getApprovedCreativeIntakeGenerationContext,
  isCreativeChatIntakeEnabled,
} from "@/lib/services/creative-chat-intake-service";

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

function ReviewOnlyCreativePreview({ plan }: { plan: CampaignPlan }) {
  const headline = plan.funnel?.headline || plan.keyOffer || "Campaign preview creative";
  const primaryText =
    plan.offerSummary ||
    `Review how the ${plan.market} campaign message will appear before launch-ready media is selected.`;
  const cta = plan.funnel?.cta || "Learn More";

  return (
    <div className="space-y-3">
      <div className="rounded-[18px] border border-amber-300/18 bg-amber-300/[0.08] px-4 py-3 text-sm leading-6 text-amber-100">
        Review-only creative preview. This placeholder proves the Preview layout and message match, but it is not launch-ready, is not selected media, and cannot satisfy Meta launch gates.
      </div>
      <StaticCreativeSummaryCard
        category={plan.creativeStrategy.campaignCategory}
        className="border-amber-300/18 bg-black/18"
        cta={cta}
        headline={headline}
        imageGenerationMessage="Review-only placeholder. Select at least 4 launch-ready static ads in Creative Studio before launch."
        imageGenerationState="unavailable"
        imagePrompt={null}
        imagePromptConfig={null}
        imageUrl={null}
        storageNormalized={false}
        appComposedFinal={false}
        index={0}
        location={plan.market}
        offer={plan.keyOffer}
        overlayText={plan.keyOffer}
        primaryText={primaryText}
        qualityGate={{ accepted: false, hardFailures: ["review_only_preview"] }}
        imageQa={{ usable: false, decision: "review", mode: "background_only", reasons: ["review_only_preview"] }}
        score={0}
        selectedCount={0}
        visualPromptBrief={{
          category: plan.creativeStrategy.campaignCategory,
          visualAssetContract: "review-only preview placeholder",
          visualAssetRole: "layout_acceptance_only",
        }}
      />
    </div>
  );
}

async function loadPersistedLaunchMediaSelection(campaignId: string | null) {
  if (!campaignId) {
    return { selectedAdIds: [], selectedUgcVideoIds: [], creativeIntakeContext: null };
  }

  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    return { selectedAdIds: [], selectedUgcVideoIds: [], creativeIntakeContext: null };
  }

  const { data } = await supabase
    .from("campaign_plans")
    .select("plan")
    .eq("id", campaignId)
    .maybeSingle();

  const row = (data as { plan?: unknown } | null) ?? null;
  const plan = readCampaignPlanDocument(row?.plan);

  return {
    selectedAdIds: getSelectedAdIdsFromPlan(plan),
    selectedUgcVideoIds: getSelectedUgcVideoIdsFromPlan(plan),
    creativeIntakeContext: isCreativeChatIntakeEnabled()
      ? getApprovedCreativeIntakeGenerationContext(plan)
      : null,
  };
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
  const launchMediaSelection = await loadPersistedLaunchMediaSelection(resolvedCampaignId);
  const selectedAdIds = launchMediaSelection.selectedAdIds;
  const selectedUgcVideoIds = launchMediaSelection.selectedUgcVideoIds;
  const creativeIntakeContext = launchMediaSelection.creativeIntakeContext;
  const staticBriefReadinessContext = creativeIntakeContext
    ? {
        staticBriefHash: creativeIntakeContext.staticBriefHash,
        offerHash: creativeIntakeContext.offerHash,
        ctaHash: creativeIntakeContext.ctaHash,
        brandHash: creativeIntakeContext.brandHash,
      }
    : null;

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
  const isCurrentLaunchReadyUgcVideo = (video: (typeof videoAds)[number]) =>
    video.conceptType === "customer_ugc" &&
    isLaunchReadyVideoCreative(video) &&
    (!creativeIntakeContext?.ugcScriptHash || video.ugcScriptHash === creativeIntakeContext.ugcScriptHash || video.scriptHash === creativeIntakeContext.ugcScriptHash);
  const dedupeVideoIds = (videos: typeof videoAds) => {
    const seen = new Set<string>();
    return videos.filter((video) => {
      if (seen.has(video.id)) {
        return false;
      }

      seen.add(video.id);
      return true;
    });
  };
  const staticReadiness = getStaticCreativeReadiness(previewPlan.creatives.staticAds, selectedAdIds, staticBriefReadinessContext);
  const selectedStaticMediaReady = staticReadiness.allSelectedReady;
  const selectedUgcVideos = selectedUgcVideoIds.length > 0
    ? dedupeVideoIds(videoAds
        .filter((video) => selectedUgcVideoIds.includes(video.id))
        .filter(isCurrentLaunchReadyUgcVideo)
        .sort((left, right) => selectedUgcVideoIds.indexOf(left.id) - selectedUgcVideoIds.indexOf(right.id)))
    : [];
  const selectedLaunchReadyVideos = selectedUgcVideos;
  const launchReadyVideos = dedupeVideoIds(videoAds.filter(isCurrentLaunchReadyUgcVideo));
  const displayVideoAds = selectedUgcVideos.length > 0
    ? selectedUgcVideos
    : launchReadyVideos.length > 0
      ? launchReadyVideos
      : videoAds;
  const launchReadyVideoCount = selectedLaunchReadyVideos.length;
  const videoMediaReady = launchReadyVideoCount > 0;
  const mediaReadyForLaunch = selectedStaticMediaReady && videoMediaReady;
  const campaignIdForFlow = record?.campaign.id ?? null;

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
              {selectedAds.length > 0 ? staticReadiness.selectionLabel : "Review-only creative preview"}
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
	                  appComposedFinal={selectedAds[0]?.appComposedFinal}
                  qualityTier={selectedAds[0]?.qualityTier}
                  sourceBackgroundKind={selectedAds[0]?.sourceBackgroundKind}
                  sourceBackgroundProvider={selectedAds[0]?.sourceBackgroundProvider}
                  sourceBackgroundAssetId={selectedAds[0]?.sourceBackgroundAssetId}
                  index={0}
                  location={previewPlan.market}
                  offer={previewPlan.keyOffer}
                  overlayText={selectedAds[0]?.overlayText}
                  primaryText={selectedAds[0]?.primaryText || previewPlan.offerSummary || previewPlan.keyOffer}
                  qualityGate={selectedAds[0]?.qualityGate}
                  visualQualityGate={selectedAds[0]?.visualQualityGate}
                  premiumQualityGate={selectedAds[0]?.premiumQualityGate}
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
	                      appComposedFinal={selectedAd.appComposedFinal}
                      qualityTier={selectedAd.qualityTier}
                      sourceBackgroundKind={selectedAd.sourceBackgroundKind}
                      sourceBackgroundProvider={selectedAd.sourceBackgroundProvider}
                      sourceBackgroundAssetId={selectedAd.sourceBackgroundAssetId}
                      index={index + 1}
                      key={selectedAd.id}
                      location={previewPlan.market}
                      offer={previewPlan.keyOffer}
                      overlayText={selectedAd.overlayText}
                      primaryText={selectedAd.primaryText || previewPlan.offerSummary || previewPlan.keyOffer}
                      qualityGate={selectedAd.qualityGate}
                      visualQualityGate={selectedAd.visualQualityGate}
                      premiumQualityGate={selectedAd.premiumQualityGate}
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
            <ReviewOnlyCreativePreview plan={previewPlan} />
          )}
          {displayVideoAds.length > 0 ? (
            <section className="mt-5 border-t border-white/10 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {selectedUgcVideoIds.length > 0 ? "Selected UGC video ads" : "UGC video options"}
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
                  Video is review-only until the campaign-specific source and DealFlow review are accepted for launch.
                  {selectedUgcVideoIds.length === 0 ? " Choose an approved UGC video in Creative Studio before launch." : ""}
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
