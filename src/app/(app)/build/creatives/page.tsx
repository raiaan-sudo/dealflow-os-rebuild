import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { CreativeWizard } from "./creative-wizard";

async function loadStoredCampaignPayload(campaignId: string) {
  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("campaign_plans")
    .select("plan")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    return null;
  }

  const row = (data as { plan?: unknown } | null) ?? null;

  return row?.plan && typeof row.plan === "object" && !Array.isArray(row.plan)
    ? (row.plan as Record<string, unknown>)
    : null;
}

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
    redirect("/onboarding");
  }

  const activeCampaign = await resolveActiveCampaignRecord(campaignId).catch(() => null);
  const record = activeCampaign?.record ?? null;
  const storedPlan = await loadStoredCampaignPayload(campaignId);
  const campaignPayload =
    storedPlan?.campaign_payload &&
    typeof storedPlan.campaign_payload === "object" &&
    !Array.isArray(storedPlan.campaign_payload)
      ? (storedPlan.campaign_payload as Record<string, unknown>)
      : null;
  const missingArtifacts: string[] = [];

  if (!record) {
    missingArtifacts.push("campaign record");
  }

  if (!campaignPayload) {
    missingArtifacts.push("campaign payload");
  }

  if (!record?.creatives?.staticAds?.length) {
    missingArtifacts.push("creatives");
  }

  if (missingArtifacts.length > 0) {
    redirect("/onboarding");
  }

  if (!record) {
    redirect("/onboarding");
  }

  const ensuredRecord = record;

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
