import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { CreativeWizard } from "./creative-wizard";
import { GenerateCreativesPanel } from "./generate-creatives-panel";

export default async function BuildCreativesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0
      ? params.campaignId
      : null;

  if (!campaignId) {
    redirect("/builder");
  }

  const activeCampaign = await resolveActiveCampaignRecord(campaignId).catch(() => null);
  const record = activeCampaign?.record ?? null;

  if (!record) {
    redirect(`/builder?campaignId=${encodeURIComponent(campaignId)}`);
  }

  const ensuredRecord = record;
  const plan = canonicalCampaignToPlan(ensuredRecord);

  if (!ensuredRecord.creatives.staticAds.length) {
    return (
      <div className="mx-auto w-full max-w-[1320px] space-y-4 p-5 sm:p-6">
        <WizardSteps current="creatives" />
        <PageHeader
          eyebrow="Build"
          title="Generate your creative test set"
          description="DealFlow uses the campaign you just built to prepare static ads, copy angles, and video concepts before final review."
        />
        <GenerateCreativesPanel
          campaignId={ensuredRecord.campaign.id}
          campaignName={plan.businessName || ensuredRecord.campaign.name}
          market={plan.market}
          offer={plan.offerSummary || plan.keyOffer}
        />
      </div>
    );
  }

  const creativeOptions = ensuredRecord.creatives.staticAds
    .slice()
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, 6)
    .map((ad) => {
      const matchingCopy = ensuredRecord.creatives.copy?.find(
        (item) => item.headline === ad.headline || item.primary_text === ad.primaryText,
      );

      return {
        id: ad.id,
        headline: ad.headline || "Untitled ad",
        primaryText: ad.primaryText || matchingCopy?.primary_text || "",
        cta: ad.cta || matchingCopy?.cta || "Learn More",
        score: ad.score ?? 0,
        recommended: ad.recommended ?? false,
        imageUrl: ad.imageUrl ?? null,
        imageGenerationState: ad.imageGenerationState ?? null,
        imageGenerationMessage: ad.imageGenerationMessage ?? null,
        overlayText: ad.overlayText ?? null,
        formatLabel: /ugc|pov|creator|customer|walkthrough/i.test(`${ad.id} ${ad.visualConcept} ${ad.hook}`)
          ? "AI UGC concept"
          : null,
        category: ad.visualPromptBrief?.category ?? ensuredRecord.plan.creative_strategy?.campaignCategory ?? null,
        location: ensuredRecord.plan.market || null,
        qualityGate: ad.qualityGate ?? null,
        visualPromptBrief: ad.visualPromptBrief ?? null,
        offer: ensuredRecord.plan.offer_summary || ensuredRecord.plan.offer || null,
        breakdown: {
          hook: ad.hook || matchingCopy?.hook || "",
          concept: ad.visualConcept || "",
        },
      };
    });

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 p-5 sm:p-6">
      <WizardSteps current="creatives" />
      <PageHeader
        eyebrow="Build"
        title="Choose your creative test set"
        description="Select 2-6 recommended creatives. DealFlow will preserve the full test set so your launch can compare multiple angles instead of betting on one ad."
      />

      <CreativeWizard campaignId={ensuredRecord.campaign.id} creatives={creativeOptions} />
    </div>
  );
}
