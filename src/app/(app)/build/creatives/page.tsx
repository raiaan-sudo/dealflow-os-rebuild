import { redirect } from "next/navigation";
import { ArtifactRecoveryPanel } from "@/components/app/artifact-recovery-panel";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { getRequestProductI18n } from "@/lib/i18n/server";
import { CreativeWizard } from "./creative-wizard";

type MissingCreativeArtifact =
  | "campaignRecord"
  | "campaignPayload"
  | "creatives"
  | "ugcPreviews";

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
  const { href, t } = await getRequestProductI18n();
  const params = searchParams ? await searchParams : {};
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0
      ? params.campaignId
      : null;

  if (!campaignId) {
    redirect(href("/onboarding"));
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
  const missingArtifacts: MissingCreativeArtifact[] = [];

  if (!record) {
    missingArtifacts.push("campaignRecord");
  }

  if (!campaignPayload) {
    missingArtifacts.push("campaignPayload");
  }

  if (!record?.creatives?.staticAds?.length) {
    missingArtifacts.push("creatives");
  }

  if ((record?.creatives?.videoAds?.length ?? 0) < 2) {
    missingArtifacts.push("ugcPreviews");
  }

  if (missingArtifacts.length > 0) {
    return (
      <div className="mx-auto w-full max-w-[900px] space-y-8 p-6 sm:p-8">
        <WizardSteps current="creatives" />
        <PageHeader
          eyebrow={t("build.eyebrow")}
          title={t("build.creatives.missingTitle")}
          description={t("build.creatives.missingDescription")}
        />
        <ArtifactRecoveryPanel
          campaignId={campaignId}
          title={t("build.creatives.recoverTitle")}
          description={t("build.creatives.recoverDescription")}
          missingArtifacts={missingArtifacts.map((artifact) =>
            t(`build.artifact.${artifact}`),
          )}
          recoverySteps={[
            ...(missingArtifacts.includes("creatives") || missingArtifacts.includes("ugcPreviews") ? (["generate-creatives"] as const) : []),
            ...(missingArtifacts.includes("campaignPayload") ? (["build-campaign"] as const) : []),
          ]}
        />
      </div>
    );
  }

  if (!record) {
    redirect(href("/onboarding"));
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
        headline: ad.headline || t("build.creatives.untitledAd"),
        primaryText: ad.primaryText || matchingCopy?.primary_text || "",
        cta: ad.cta || matchingCopy?.cta || t("build.creatives.learnMore"),
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
  const ugcOptions = ensuredRecord.creatives.videoAds.slice(0, 2).map((video, index) => ({
    id: video.id || `ugc-${index + 1}`,
    title: video.title || t("build.creatives.ugcConcept", { number: index + 1 }),
    hook: video.hook || "",
    script: Array.isArray(video.script) ? video.script : [],
    shotList: Array.isArray(video.shotList) ? video.shotList : [],
    onScreenText: Array.isArray(video.onScreenText) ? video.onScreenText : [],
    cta: video.cta || t("build.creatives.seeIfQualify"),
    creatorStyle: video.creatorStyle || t("build.creatives.ugcCreator"),
    format: video.conceptType === "customer_ugc" ? t("build.creatives.customerPov") : t("build.creatives.expertPov"),
  }));

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-8 p-6 sm:p-8">
      <WizardSteps current="creatives" />
      <PageHeader
        eyebrow={t("build.eyebrow")}
        title={t("build.creatives.chooseTitle")}
        description={t("build.creatives.chooseDescription")}
      />

      <CreativeWizard campaignId={ensuredRecord.campaign.id} creatives={creativeOptions} ugcConcepts={ugcOptions} />
    </div>
  );
}
