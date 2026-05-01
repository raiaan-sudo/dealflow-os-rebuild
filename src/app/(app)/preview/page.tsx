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
      </PageShell>
    );
  }

  const safeCampaign = normalizeCampaign(validated);
  const previewPlan = safeCampaign.plan;
  const expectedOutcomes = getExpectedOutcomes(previewPlan);
  const selectedAds = previewPlan.creatives.staticAds.filter((ad) => selectedAdIds.includes(ad.id));
  const campaignIdForFlow = record?.campaign.id ?? null;

  return (
    <PageShell className="max-w-[900px]">
      <WizardSteps current="review" />
      <PageHeader
        eyebrow="Preview"
        title="Final preview"
        description="Review the selected funnel and creative test set, then move into launch."
      />

      <section className="surface-strong space-y-4 rounded-df-card border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-foreground">Selected funnel</h2>
        <FunnelPreview
          plan={previewPlan}
          expectedOutcomes={expectedOutcomes}
          strategyWhy={getStrategyWhy(previewPlan)}
        />
      </section>

      <section className="surface-strong space-y-4 rounded-df-card border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-foreground">Selected creative test set</h2>
        {selectedAds.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {selectedAds.map((selectedAd) => (
              <StaticCreativePreviewCard
                compact={selectedAds.length > 1}
                cta={selectedAd.cta}
                headline={selectedAd.headline}
                imageGenerationMessage={selectedAd.imageGenerationMessage}
                imageGenerationState={selectedAd.imageGenerationState}
                imageUrl={selectedAd.imageUrl}
                key={selectedAd.id}
                offer={previewPlan.offerSummary || previewPlan.keyOffer}
                overlayText={selectedAd.overlayText}
                primaryText={selectedAd.primaryText}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-df-card border border-white/10 bg-white/[0.035] p-6 text-sm text-muted-foreground">
            No saved creative test set is ready yet. Go back to creatives and choose the ads you want to test first.
          </div>
        )}
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
