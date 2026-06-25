import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { isInstantFormCampaign } from "@/lib/campaign-destination";
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
import { applyCreativeIntakeReviewContext } from "@/lib/services/campaign-review-context";
import {
  getStaticCreativeReadiness,
  getVideoReadinessLabel,
  getVideoReadinessMessage,
  isLaunchReadyStaticCreative,
  isLaunchReadyVideoCreative,
  isPlayableVideoCreative,
} from "@/lib/services/creative-media-readiness";
import {
  getCreativeAssetTierLabel,
} from "@/lib/services/creative-asset-status";
import {
  getApprovedCreativeIntakeGenerationContext,
  isCreativeChatIntakeEnabled,
} from "@/lib/services/creative-chat-intake-service";
import {
  buildCreativeStudioHref,
  buildOnboardingHref,
  buildLaunchHref,
} from "@/lib/routing/campaign-routes";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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
        imageGenerationMessage="Review-only placeholder. Select at least 3 launch-ready static ads in Creative Studio before launch."
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

function InstantFormPreviewPanel({ plan }: { plan: CampaignPlan }) {
  const fields = ["Full name", "Email", "Phone number"];

  return (
    <div className="grid h-full min-h-[420px] content-start gap-4 rounded-[22px] border border-cyan-300/14 bg-[radial-gradient(circle_at_top_left,rgba(103,232,249,0.14),transparent_32%),linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,6,23,0.99))] p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/72">Meta Instant Form Setup</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-white">
          Native lead form preview
        </h3>
        <p className="mt-2 text-sm leading-6 text-white/62">
          {plan.keyOffer || plan.offerSummary || "This campaign"} collects leads inside Facebook and Instagram. There is no public funnel preview or public funnel publish gate for this destination.
        </p>
      </div>
      <div className="rounded-[18px] border border-white/10 bg-black/18 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/44">Required fields</p>
        <div className="mt-3 grid gap-2">
          {fields.map((field) => (
            <div key={field} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm">
              <span className="font-medium text-white/84">{field}</span>
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200">Required</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        {[
          "Meta ad account and Facebook Page must be selected",
          "Operator verifies the native form and privacy policy",
          "GHL contact and opportunity delivery runs only when configured",
          "No Meta form, campaign, SMS, email, provider job, or public lead is created from preview",
        ].map((item) => (
          <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm leading-6 text-white/64">
            {item}
          </div>
        ))}
      </div>
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
    redirect("/onboarding");
  }

  const validated = validateCampaign({ plan });

  if (!validated) {
    redirect(buildOnboardingHref(resolvedCampaignId));
  }

  const safeCampaign = normalizeCampaign(validated);
  const previewPlan = applyCreativeIntakeReviewContext(safeCampaign.plan, creativeIntakeContext);
  const instantFormCampaign = record
    ? isInstantFormCampaign({
        funnel: record.funnel,
        plan: record.plan,
        strategy: record.strategy,
      }) || isInstantFormCampaign(previewPlan)
    : isInstantFormCampaign(previewPlan);
  const expectedOutcomes = getExpectedOutcomes(previewPlan);
  const selectedAds = previewPlan.creatives.staticAds
    .filter((ad) => selectedAdIds.includes(ad.id))
    .sort((left, right) => selectedAdIds.indexOf(left.id) - selectedAdIds.indexOf(right.id));
  const displayStaticAds = selectedAds;
  const usingInstantFallbackPreview = false;
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
  const isCurrentLaunchReadyStatic = (ad: (typeof previewPlan.creatives.staticAds)[number] | null | undefined) => {
    if (!ad) {
      return false;
    }

    return isLaunchReadyStaticCreative(ad, staticBriefReadinessContext);
  };
  const selectedStaticMediaReady = staticReadiness.allSelectedReady;
  const selectedUgcVideos = selectedUgcVideoIds.length > 0
    ? dedupeVideoIds(videoAds
        .filter((video) => selectedUgcVideoIds.includes(video.id))
        .filter(isCurrentLaunchReadyUgcVideo)
        .sort((left, right) => selectedUgcVideoIds.indexOf(left.id) - selectedUgcVideoIds.indexOf(right.id)))
    : [];
  const selectedLaunchReadyVideos = selectedUgcVideos;
  const displayVideoAds = selectedUgcVideoIds.length > 0 ? selectedUgcVideos : [];
  const launchReadyVideoCount = selectedLaunchReadyVideos.length;
  const videoMediaReady = launchReadyVideoCount > 0;
  const mediaReadyForLaunch = selectedStaticMediaReady;
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
    <PageShell className="max-w-[1720px]">
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(390px,0.82fr)_minmax(760px,1.18fr)] xl:items-start">
        <div className="space-y-4">
          <WizardSteps current="review" />
          <PageHeader
            eyebrow="Preview"
            title="Final preview"
            description={
              instantFormCampaign
                ? "Review the native Meta Instant Form setup and creative test set, then move into launch readiness."
                : "Review the selected funnel and creative test set, then move into launch."
            }
          />
          <section className="surface-strong rounded-df-card border border-white/10 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {instantFormCampaign ? "Selected destination" : "Selected funnel"}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  {instantFormCampaign ? "Meta Instant Form preview" : "Canonical funnel preview"}
                </h2>
              </div>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">
                Preview
              </span>
            </div>
            <div className="relative h-[520px] overflow-hidden rounded-[22px] border border-white/8 bg-white/[0.03]">
              {instantFormCampaign ? (
                <InstantFormPreviewPanel plan={previewPlan} />
              ) : (
                <>
                  <FunnelPreview
                    compact
                    plan={previewPlan}
                    expectedOutcomes={expectedOutcomes}
                    strategyWhy={getStrategyWhy(previewPlan)}
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#06101d] to-transparent" />
                </>
              )}
            </div>
          </section>
        </div>

        <aside className="surface-strong min-w-0 rounded-df-card border border-white/10 p-4 sm:p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Selected creative test set</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {selectedAds.length > 0
                ? staticReadiness.selectionLabel
                : usingInstantFallbackPreview
                  ? "Instant creative preview"
                  : "Review-only creative preview"}
            </h2>
            {selectedAds.length > 0 ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {staticReadiness.selectedReadyLabel}
                {staticReadiness.issueLabel ? `; ${staticReadiness.issueLabel}` : ""}
              </p>
            ) : usingInstantFallbackPreview ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Preview creatives are available now. Premium launch-ready renders still need review before they can satisfy launch gates.
              </p>
            ) : null}
            {selectedAds.length > 0 && !selectedStaticMediaReady ? (
              <p className="mt-2 rounded-[14px] border border-amber-300/18 bg-amber-300/[0.08] px-3 py-2 text-sm leading-6 text-amber-100">
                Selected creative media is not launch-ready yet. Return to Creative Studio and refresh the selected previews before launch.
              </p>
            ) : usingInstantFallbackPreview ? (
              <p className="mt-2 rounded-[14px] border border-cyan-300/18 bg-cyan-300/[0.08] px-3 py-2 text-sm leading-6 text-cyan-100">
                These instant fallback creatives keep Preview usable while premium renders prepare. They are not launch-approved and cannot satisfy Meta launch gates until QA-approved.
              </p>
            ) : null}
          </div>
          {displayStaticAds.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {displayStaticAds.map((selectedAd, index) => (
                <StaticCreativeSummaryCard
                  angleLabel={selectedAd.angle}
                  category={previewPlan.creativeStrategy.campaignCategory}
                  cta={selectedAd.cta || "Learn More"}
                  headline={selectedAd.headline || previewPlan.keyOffer}
                  imageGenerationMessage={selectedAd.imageGenerationMessage}
                  imageGenerationProvider={selectedAd.imageGenerationProvider}
                  imageGenerationState={selectedAd.imageGenerationState}
                  imagePrompt={selectedAd.imagePrompt}
                  imagePromptConfig={selectedAd.imagePromptConfig}
                  imageUrl={selectedAd.imageUrl}
                  storageNormalized={selectedAd.storageNormalized}
                  appComposedFinal={selectedAd.appComposedFinal}
                  qualityTier={selectedAd.qualityTier}
                  compositionVersion={selectedAd.compositionVersion}
                  sourceBackgroundKind={selectedAd.sourceBackgroundKind}
                  sourceBackgroundProvider={selectedAd.sourceBackgroundProvider}
                  sourceBackgroundAssetId={selectedAd.sourceBackgroundAssetId}
                  formatLabel={getCreativeAssetTierLabel(selectedAd)}
                  index={index}
                  key={selectedAd.id}
                  location={previewPlan.market}
                  offer={previewPlan.keyOffer}
                  overlayText={selectedAd.overlayText}
                  primaryText={selectedAd.primaryText || previewPlan.offerSummary || previewPlan.keyOffer}
                  qualityGate={selectedAd.qualityGate}
                  visualQualityGate={selectedAd.visualQualityGate}
                  premiumQualityGate={selectedAd.premiumQualityGate}
                  imageQa={selectedAd.imageQa}
                  sourceImageQa={selectedAd.sourceImageQa}
                  prominent
                  score={selectedAd.score}
                  selected={selectedAds.length > 0}
                  selectedCount={displayStaticAds.length}
                  launchReady={isCurrentLaunchReadyStatic(selectedAd)}
                  visualPromptBrief={selectedAd.visualPromptBrief}
                />
              ))}
            </div>
          ) : (
            <ReviewOnlyCreativePreview plan={previewPlan} />
          )}
          {displayVideoAds.length > 0 ? (
            <section className="mt-5 border-t border-white/10 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Selected UGC video ads
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
                <p className="mt-3 rounded-[14px] border border-cyan-300/18 bg-cyan-300/[0.08] px-3 py-2 text-sm leading-6 text-cyan-100">
                  UGC video is optional and can be added later. The static ad set is the media requirement for moving into launch review.
                </p>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-between">
        <Button asChild size="lg" variant="secondary">
          <Link href={buildCreativeStudioHref(campaignIdForFlow)}>
            Back to Creative Studio
          </Link>
        </Button>
        {mediaReadyForLaunch ? (
          <Button asChild size="lg">
            <Link href={buildLaunchHref(campaignIdForFlow)}>
              Next → Launch
            </Link>
          </Button>
        ) : (
          <Button size="lg" disabled>
            Static review needed
          </Button>
        )}
      </div>
    </PageShell>
  );
}
