import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { StaticCreativePreviewCard } from "@/components/campaign/static-creative-preview-card";
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
import {
  buildOfferFirstBody,
  buildOfferFirstHeadline,
  textPreservesOfferConcept,
} from "@/lib/copy/offer-consistency";

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
    return (
      <PageShell className="max-w-[900px]">
        <WizardSteps current="review" />
        <PageHeader
          eyebrow="Preview"
          title="Campaign preview unavailable"
          description="Complete onboarding first, then unlock review to see the campaign package."
        />
        <EmptyState
          title="No campaign available yet"
          description="Finish onboarding to create a campaign before opening review."
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/onboarding">Start onboarding</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/onboarding">Continue onboarding</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  const validated = validateCampaign({ plan });

  if (!validated) {
    return (
      <PageShell className="max-w-[900px]">
        <WizardSteps current="review" />
        <PageHeader
          eyebrow="Preview"
          title="Campaign preview unavailable"
          description="Some campaign details are still missing, so this review page could not load correctly."
        />
        <EmptyState
          title="Preview data incomplete"
          description="Some campaign details are missing. Update or regenerate the campaign, then return to review."
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link
              href={
                resolvedCampaignId
                  ? `/onboarding?campaignId=${encodeURIComponent(resolvedCampaignId)}`
                  : "/onboarding"
              }
            >
              Continue onboarding
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/onboarding">Restart onboarding</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  const safeCampaign = normalizeCampaign(validated);
  const previewPlan = safeCampaign.plan;
  const offer = textPreservesOfferConcept(previewPlan.offerSummary, previewPlan.keyOffer)
    ? previewPlan.offerSummary
    : previewPlan.keyOffer || previewPlan.offerSummary;
  const offerFirstPlan = {
    ...previewPlan,
    funnel: {
      ...previewPlan.funnel,
      headline: buildOfferFirstHeadline({
        headline: previewPlan.funnel.headline,
        offer,
        market: previewPlan.market,
      }) || previewPlan.funnel.headline,
      subheadline: buildOfferFirstBody({
        body: previewPlan.funnel.subheadline,
        offer,
      }) || previewPlan.funnel.subheadline,
    },
  };
  const expectedOutcomes = getExpectedOutcomes(previewPlan);
  const selectedAds = previewPlan.creatives.staticAds.filter((ad) => selectedAdIds.includes(ad.id));
  const visibleStaticAds =
    selectedAds.length > 0
      ? selectedAds
      : [...previewPlan.creatives.staticAds].sort((left, right) => (right.score ?? 0) - (left.score ?? 0)).slice(0, 3);
  const visibleUgcAds = previewPlan.creatives.videoAds.slice(0, 2);
  const campaignIdForFlow = record?.campaign.id ?? null;

  return (
    <PageShell className="max-w-[1280px]">
      <WizardSteps current="review" />
      <PageHeader
        eyebrow="Preview"
        title="Final preview"
        description="Review the creative test set and funnel promise before launch."
      />

      <section className="surface-strong space-y-4 rounded-df-card border border-white/10 p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Creative preview</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">
              Selected creative test set
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {visibleStaticAds.length + visibleUgcAds.length} previews ready
          </p>
        </div>
        {visibleStaticAds.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleStaticAds.map((selectedAd) => (
              <StaticCreativePreviewCard
                category={previewPlan.creativeStrategy.campaignCategory}
                compact
                cta={selectedAd.cta}
                headline={selectedAd.headline}
                imageGenerationMessage={selectedAd.imageGenerationMessage}
                imageGenerationState={selectedAd.imageGenerationState}
                imageUrl={selectedAd.imageUrl}
                location={previewPlan.market}
                key={selectedAd.id}
                offer={offer}
                overlayText={selectedAd.overlayText}
                primaryText={selectedAd.primaryText}
                qualityGate={selectedAd.qualityGate}
                score={selectedAd.score}
                selectedCount={visibleStaticAds.length}
                visualPromptBrief={selectedAd.visualPromptBrief}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-df-card border border-white/10 bg-white/[0.035] p-6 text-sm text-muted-foreground">
            No saved creative test set is ready yet. Go back to creatives and choose the ads you want to test first.
          </div>
        )}
        {visibleUgcAds.length > 0 ? (
          <>
          <div className="pt-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">AI UGC previews</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleUgcAds.map((video, index) => (
              <div key={video.id || index} className="rounded-df-card border border-cyan-200/15 bg-cyan-300/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/70">AI UGC concept {index + 1}</p>
                <h3 className="mt-2 line-clamp-2 text-base font-semibold leading-6">{video.title}</h3>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{video.hook}</p>
                <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Script preview</p>
                  <p className="mt-2 line-clamp-4 text-sm leading-6">{video.script.slice(0, 4).join(" ")}</p>
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">{video.cta}</p>
              </div>
            ))}
          </div>
          </>
        ) : (
          <div className="rounded-df-card border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
            UGC concepts are missing. Return to creative recovery so DealFlow can regenerate the two required UGC previews.
          </div>
        )}
      </section>

      <section className="surface-strong space-y-4 rounded-df-card border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-foreground">Selected funnel</h2>
        <FunnelPreview
          plan={offerFirstPlan}
          expectedOutcomes={expectedOutcomes}
          strategyWhy={getStrategyWhy(offerFirstPlan)}
        />
      </section>

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-between">
        <Button asChild size="lg" variant="secondary">
          <Link href={campaignIdForFlow ? `/build/creatives?campaignId=${encodeURIComponent(campaignIdForFlow)}` : "/build/creatives"}>
            Back
          </Link>
        </Button>
        <Button asChild size="lg">
          <Link href={campaignIdForFlow ? `/launch?campaignId=${encodeURIComponent(campaignIdForFlow)}` : "/launch"}>
            Next → Launch
          </Link>
        </Button>
      </div>
    </PageShell>
  );
}
