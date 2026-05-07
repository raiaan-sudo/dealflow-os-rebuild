import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { StaticCreativeSummaryCard } from "@/components/campaign/static-creative-preview-card";
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
      <PageShell className="max-w-[1180px]">
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
            <Link href="/builder">Open builder</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  const validated = validateCampaign({ plan });

  if (!validated) {
    return (
      <PageShell className="max-w-[1180px]">
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
            <Link href={resolvedCampaignId ? `/builder?campaignId=${encodeURIComponent(resolvedCampaignId)}` : "/builder"}>
              Open builder
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
  const expectedOutcomes = getExpectedOutcomes(previewPlan);
  const selectedAds = previewPlan.creatives.staticAds.filter((ad) => selectedAdIds.includes(ad.id));
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
    <PageShell className="max-w-[1640px]">
      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1.08fr)_minmax(520px,0.92fr)] 2xl:items-start">
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
            <div className="max-h-[680px] overflow-y-auto rounded-[24px] border border-white/8">
              <FunnelPreview
                compact
                plan={previewPlan}
                expectedOutcomes={expectedOutcomes}
                strategyWhy={getStrategyWhy(previewPlan)}
              />
            </div>
          </section>
        </div>

        <aside className="surface-strong min-w-0 rounded-df-card border border-white/10 p-4 sm:p-5 2xl:sticky 2xl:top-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Selected creative test set</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {selectedAds.length > 0 ? `${selectedAds.length} creatives ready` : "Creative selection needed"}
            </h2>
          </div>
          {selectedAds.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-1">
              {selectedAds.map((selectedAd, index) => (
                <StaticCreativeSummaryCard
                  category={previewPlan.creativeStrategy.campaignCategory}
                  cta={selectedAd.cta}
                  headline={selectedAd.headline}
                  imageGenerationMessage={selectedAd.imageGenerationMessage}
                  imageGenerationState={selectedAd.imageGenerationState}
                  imageUrl={selectedAd.imageUrl}
                  location={previewPlan.market}
                  key={selectedAd.id}
                  offer={previewPlan.offerSummary || previewPlan.keyOffer}
                  overlayText={selectedAd.overlayText}
                  primaryText={selectedAd.primaryText}
                  qualityGate={selectedAd.qualityGate}
                  score={selectedAd.score}
                  index={index}
                  selected
                  selectedCount={selectedAds.length}
                  visualPromptBrief={selectedAd.visualPromptBrief}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-df-card border border-white/10 bg-white/[0.035] p-5 text-sm text-muted-foreground">
              No saved creative test set is ready yet. Go back to creatives and choose the ads you want to test first.
            </div>
          )}
        </aside>
      </div>

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
