import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import {
  isCreativeChatIntakeEnabled,
  readCreativeChatIntakeFromPlan,
  type CreativeIntakeCampaignDefaults,
} from "@/lib/services/creative-chat-intake-service";
import { createClient } from "@/lib/supabase/server";
import { CreativeChatIntake } from "./creative-chat-intake";
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
  const creativeIntakeEnabled = isCreativeChatIntakeEnabled();
  const supabase = creativeIntakeEnabled ? await createClient() : null;
  let intakePlanValue: unknown = null;
  if (supabase) {
    const { data } = await supabase
      .from("campaign_plans")
      .select("plan")
      .eq("id", ensuredRecord.campaign.id)
      .maybeSingle() as { data: { plan?: unknown } | null; error: Error | null };
    intakePlanValue = data?.plan ?? null;
  }
  const creativeIntake = readCreativeChatIntakeFromPlan(intakePlanValue);
  const creativeIntakeApproved =
    creativeIntake?.approvalStatus === "approved" &&
    creativeIntake.brief?.completion.complete === true &&
    Boolean(creativeIntake.promptVersion?.generatedPrompt);
  const creativeIntakeDefaults: CreativeIntakeCampaignDefaults = {
    campaignId: ensuredRecord.campaign.id,
    market: plan.market,
    audience: plan.audience,
    offer: plan.offerSummary || plan.keyOffer,
    propertyType: plan.propertyType,
    campaignType: plan.intent,
    cta: ensuredRecord.funnel.cta || plan.funnel?.cta || null,
    brand: plan.businessName,
  };

  if (creativeIntakeEnabled && !creativeIntakeApproved) {
    return (
      <div className="mx-auto w-full max-w-[1320px] space-y-4 p-5 sm:p-6">
        <WizardSteps current="creatives" />
        <PageHeader
          eyebrow="Build"
          title="Shape the creative direction"
          description="Review the structured creative brief before DealFlow prepares paid image or video renders."
        />
        <CreativeChatIntake
          campaignId={ensuredRecord.campaign.id}
          defaults={creativeIntakeDefaults}
          initialIntake={creativeIntake}
          mode="gate"
        />
      </div>
    );
  }

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
        {creativeIntakeEnabled ? (
          <CreativeChatIntake
            campaignId={ensuredRecord.campaign.id}
            defaults={creativeIntakeDefaults}
            initialIntake={creativeIntake}
            mode="compact"
          />
        ) : null}
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
        imagePrompt: ad.imagePrompt ?? null,
        imagePromptConfig: ad.imagePromptConfig ?? null,
        overlayText: ad.overlayText ?? null,
        formatLabel: /\bugc\b/i.test(`${ad.id} ${ad.visualConcept} ${ad.hook}`)
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
  const videoOptions = ensuredRecord.creatives.videoAds
    .slice(0, 3)
    .map((video, index) => ({
      id: video.id || `video-${index + 1}`,
      index,
      conceptType: video.conceptType,
      title: video.title || `AI UGC video ${index + 1}`,
      hook: video.hook || video.script[0] || "",
      script: video.script,
      shotList: video.shotList,
      onScreenText: video.onScreenText,
      cta: video.cta || ensuredRecord.funnel.cta || "Learn More",
      creatorStyle: video.creatorStyle,
      voiceStyle: video.voiceStyle,
      videoUrl: video.videoUrl ?? null,
      videoGenerationState: video.videoGenerationState ?? null,
      videoGenerationMessage: video.videoGenerationMessage ?? null,
      qualityGate: video.qualityGate ?? null,
    }));

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 p-5 sm:p-6">
      <WizardSteps current="creatives" />
      <PageHeader
        eyebrow="Build"
        title="Choose your creative test set"
        description="Select 2-6 recommended creatives. DealFlow will preserve the full test set so your launch can compare multiple angles instead of betting on one ad."
      />
      {creativeIntakeEnabled ? (
        <CreativeChatIntake
          campaignId={ensuredRecord.campaign.id}
          defaults={creativeIntakeDefaults}
          initialIntake={creativeIntake}
          mode="compact"
        />
      ) : null}

      <CreativeWizard campaignId={ensuredRecord.campaign.id} creatives={creativeOptions} videoCreatives={videoOptions} />
    </div>
  );
}
