import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import {
  mapStaticCreativeAssets,
  mapVideoCreativeAssets,
} from "@/lib/services/campaign-persistence";
import {
  getSelectedAdIdsFromPlan,
  getSelectedUgcVideoIdsFromPlan,
} from "@/lib/services/campaign-plan-document";
import {
  isCreativeChatIntakeEnabled,
  readCreativeChatIntakeFromPlan,
  type CreativeIntakeCampaignDefaults,
} from "@/lib/services/creative-chat-intake-service";
import { getCreativeAssetTierLabel } from "@/lib/services/creative-asset-status";
import { normalizeCreativeOfferTitle } from "@/lib/services/creative-ugc-script-service";
import { getCreditSummaryForCurrentUser } from "@/lib/services/credit-service";
import { createClient } from "@/lib/supabase/server";
import { CreativeChatIntake } from "./creative-chat-intake";
import { CreativeWizard } from "./creative-wizard";
import { GenerateCreativesPanel } from "./generate-creatives-panel";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function resolveCustomerFacingOfferTitle(params: {
  intake: ReturnType<typeof readCreativeChatIntakeFromPlan>;
  plan: ReturnType<typeof canonicalCampaignToPlan>;
}) {
  return normalizeCreativeOfferTitle({
    value:
      params.intake?.brief?.offerTitle ||
      params.plan.keyOffer ||
      params.plan.offerSummary ||
      "Campaign offer",
    campaignType: params.plan.intent,
    audience: params.plan.audience,
  });
}

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
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
  const editCreativeBrief = params.creativeBrief === "edit";
  const supabase = await createClient();
  let intakePlanValue: unknown = null;
  let persistedSelectedAdIds: string[] = [];
  let persistedSelectedUgcVideoIds: string[] = [];
  let persistedStaticAds = ensuredRecord.creatives.staticAds;
  let persistedVideoAds = ensuredRecord.creatives.videoAds;
  let activeRenderJobs: NonNullable<Parameters<typeof CreativeWizard>[0]["initialRenderJobs"]> = [];
  const generationCredits = await getCreditSummaryForCurrentUser().catch(() => null);
  const generationCreditOverrideActive =
    generationCredits?.creditOverride === true ||
    generationCredits?.qaGenerationCreditOverride === true;

  if (supabase) {
    const { data } = await supabase
      .from("campaign_plans")
      .select("plan")
      .eq("id", ensuredRecord.campaign.id)
      .maybeSingle() as { data: { plan?: unknown } | null; error: Error | null };
    intakePlanValue = data?.plan ?? null;
    persistedSelectedAdIds = getSelectedAdIdsFromPlan(intakePlanValue);
    persistedSelectedUgcVideoIds = getSelectedUgcVideoIdsFromPlan(intakePlanValue);

    const { data: jobsData } = await supabase
      .from("system_jobs")
      .select("id,kind,status,error_message,result,next_run_at,locked_by,locked_until,created_at,started_at,completed_at,retry_count,attempt_count,max_attempts,payload,last_error_code,reviewed_at,dead_lettered_at")
      .eq("campaign_id", ensuredRecord.campaign.id)
      .in("kind", ["static_creative_generation", "video_generation", "video_generation_status"])
      .in("status", ["pending", "processing", "failed"])
      .is("reviewed_at", null)
      .is("dead_lettered_at", null)
      .order("created_at", { ascending: false })
      .limit(12);
    activeRenderJobs = Array.isArray(jobsData)
      ? jobsData as NonNullable<Parameters<typeof CreativeWizard>[0]["initialRenderJobs"]>
      : [];

    const { data: staticAssetData } = await supabase
      .from("creative_assets")
      .select("*")
      .eq("campaign_id", ensuredRecord.campaign.id)
      .eq("user_id", ensuredRecord.campaign.user_id)
      .in("asset_type", ["image_frame", "thumbnail", "static_image", "image"])
      .order("created_at", { ascending: false });
    const mappedStaticAssets = mapStaticCreativeAssets(Array.isArray(staticAssetData) ? staticAssetData : []);
    if (mappedStaticAssets.length > 0) {
      persistedStaticAds = mappedStaticAssets;
    }

    const { data: videoAssetData } = await supabase
      .from("creative_assets")
      .select("*")
      .eq("campaign_id", ensuredRecord.campaign.id)
      .eq("user_id", ensuredRecord.campaign.user_id)
      .in("asset_type", ["ugc_video", "talking_head_video", "montage_video", "video"])
      .order("created_at", { ascending: false });
    const mappedVideoAssets = mapVideoCreativeAssets(Array.isArray(videoAssetData) ? videoAssetData : []);
    if (mappedVideoAssets.length > 0) {
      persistedVideoAds = mappedVideoAssets;
    }
  }
  const creativeIntake = readCreativeChatIntakeFromPlan(intakePlanValue);
  const creativeIntakeApproved =
    creativeIntake?.approvalStatus === "approved" &&
    creativeIntake.brief?.completion.complete === true &&
    Boolean(creativeIntake.promptVersion?.generatedPrompt);
  const customerOfferTitle = resolveCustomerFacingOfferTitle({ intake: creativeIntake, plan });
  const approvedUgcScriptLines = creativeIntake?.brief?.ugcStyleBrief?.approvedScript?.lines ?? [];
  const approvedUgcScriptHash =
    creativeIntake?.brief?.ugcScriptHash ??
    (approvedUgcScriptLines.length > 0
      ? sha256Text(approvedUgcScriptLines.join("\n"))
      : null);
  const approvedBriefContext = creativeIntake?.brief
    ? {
        offerTitle: creativeIntake.brief.offerTitle,
        audience: creativeIntake.brief.targetAudience,
        market: creativeIntake.brief.market,
        brand: creativeIntake.brief.brokerageBrand,
        cta: creativeIntake.brief.cta,
        staticStyle: creativeIntake.brief.staticStyle ?? creativeIntake.brief.creativeStyle,
        revisionNumber: creativeIntake.revisionNumber,
        briefHash: creativeIntake.brief.briefHash ?? null,
        staticBriefHash: creativeIntake.brief.staticBriefHash ?? null,
        offerHash: creativeIntake.brief.offerHash ?? null,
        ctaHash: creativeIntake.brief.ctaHash ?? null,
        brandHash: creativeIntake.brief.brandHash ?? null,
        ugcScriptHash: creativeIntake.brief.ugcScriptHash ?? approvedUgcScriptHash,
      }
    : null;
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

  if (creativeIntakeEnabled && (!creativeIntakeApproved || editCreativeBrief)) {
    return (
      <div className="mx-auto w-full max-w-[1320px] space-y-4 p-5 sm:p-6">
        <WizardSteps current="creatives" />
        <PageHeader
          eyebrow="Build"
          title="Shape the creative direction"
          description="Review the structured creative brief before paid image or video renders are prepared."
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

  if (!persistedStaticAds.length) {
    return (
      <div className="mx-auto w-full max-w-[1320px] space-y-4 p-5 sm:p-6">
        <WizardSteps current="creatives" />
        <PageHeader
          eyebrow="Build"
          title="Generate your creative test set"
          description="Your campaign details prepare static ads, copy angles, and video concepts before final review."
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

  const creativeOptions = persistedStaticAds
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
        creativeAssetSource: ad.creativeAssetSource ?? null,
        creativeAssetStatus: ad.creativeAssetStatus ?? null,
        creativeAssetQaStatus: ad.creativeAssetQaStatus ?? null,
        fallbackLaunchQa: ad.fallbackLaunchQa ?? null,
        storageNormalized: ad.storageNormalized ?? null,
        appComposedFinal: ad.appComposedFinal ?? null,
        qualityTier: ad.qualityTier ?? null,
        compositionVersion: ad.compositionVersion ?? null,
        sourceBackgroundKind: ad.sourceBackgroundKind ?? null,
        sourceBackgroundProvider: ad.sourceBackgroundProvider ?? null,
        sourceBackgroundAssetId: ad.sourceBackgroundAssetId ?? null,
        imageGenerationState: ad.imageGenerationState ?? null,
        imageGenerationProvider: ad.imageGenerationProvider ?? null,
        generationMethod: ad.generationMethod ?? null,
        providerName: ad.providerName ?? null,
        generationMode: ad.generationMode ?? null,
        assetRole: ad.assetRole ?? null,
        imageGenerationMessage: ad.imageGenerationMessage ?? null,
        imagePrompt: ad.imagePrompt ?? null,
        imagePromptConfig: ad.imagePromptConfig ?? null,
        overlayText: ad.overlayText ?? null,
        formatLabel:
          getCreativeAssetTierLabel(ad) ??
          (/\bugc\b/i.test(`${ad.id} ${ad.visualConcept} ${ad.hook}`)
            ? "Native-style static ad"
            : null),
        category: ad.visualPromptBrief?.category ?? ensuredRecord.plan.creative_strategy?.campaignCategory ?? null,
        location: ensuredRecord.plan.market || null,
        qualityGate: ad.qualityGate ?? null,
        imageQa: ad.imageQa ?? null,
        sourceImageQa: ad.sourceImageQa ?? null,
        visualQualityGate: ad.visualQualityGate ?? null,
        premiumQualityGate: ad.premiumQualityGate ?? null,
        visualPromptBrief: ad.visualPromptBrief ?? null,
        briefHash: ad.briefHash ?? ad.creativeIntake?.briefHash ?? null,
        staticBriefHash: ad.staticBriefHash ?? ad.creativeIntake?.staticBriefHash ?? null,
        offerHash: ad.offerHash ?? ad.creativeIntake?.offerHash ?? null,
        ctaHash: ad.ctaHash ?? ad.creativeIntake?.ctaHash ?? null,
        brandHash: ad.brandHash ?? ad.creativeIntake?.brandHash ?? null,
        approvedOfferTitle: ad.approvedOfferTitle ?? ad.creativeIntake?.requiredOfferTitle ?? null,
        approvedCta: ad.approvedCta ?? ad.creativeIntake?.requiredCta ?? null,
        approvedBrand: ad.approvedBrand ?? ad.creativeIntake?.brokerageBrand ?? null,
        offer: customerOfferTitle,
        breakdown: {
          hook: ad.hook || matchingCopy?.hook || "",
          concept: ad.visualConcept || "",
        },
      };
    });
  const videoOptions = persistedVideoAds
    .slice(0, 3)
    .map((video, index) => ({
      id: video.id || `video-${index + 1}`,
      index,
      conceptType: video.conceptType,
      title: video.title || `UGC video ${index + 1}`,
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
      providerName: video.providerName ?? null,
      providerAssetId: video.providerAssetId ?? null,
      providerStatus: video.providerStatus ?? null,
      storageNormalized: video.storageNormalized ?? null,
      storageBucket: video.storageBucket ?? null,
      storagePath: video.storagePath ?? null,
      storageContentType: video.storageContentType ?? null,
      storageByteSize: video.storageByteSize ?? null,
      durationSeconds: video.durationSeconds ?? null,
      targetDurationSeconds: video.targetDurationSeconds ?? null,
      sourceStaticAssetId: video.sourceStaticAssetId ?? null,
      sourceImageUrl: video.sourceImageUrl ?? null,
      sourceStaticAccepted: video.sourceStaticAccepted ?? null,
      promptUsed: video.promptUsed ?? null,
      promptSource: video.promptSource ?? null,
      promptHash: video.promptHash ?? null,
      scriptHash: video.ugcScriptHash ?? video.scriptHash ?? null,
      briefHash: video.briefHash ?? null,
      ugcScriptHash: video.ugcScriptHash ?? video.scriptHash ?? null,
      briefRevisionNumber: video.briefRevisionNumber ?? null,
      campaignSpecificContext: video.campaignSpecificContext ?? null,
      videoQualityGate: video.videoQualityGate ?? null,
      videoProductQualityGate: video.videoProductQualityGate ?? null,
      videoQa: video.videoQa ?? null,
      sampleOnly: video.sampleOnly ?? null,
      qualityGate: video.qualityGate ?? null,
    }));

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 p-5 sm:p-6">
      <WizardSteps current="creatives" />
      <PageHeader
        eyebrow="Build"
        title="Choose your creative test set"
        description="Select at least 3 launch-ready static ads, add up to 6 for larger split tests, and choose one approved AI UGC video. The full launch package stays synced across Preview and Launch."
      />
      {creativeIntakeEnabled ? (
        <CreativeChatIntake
          campaignId={ensuredRecord.campaign.id}
          defaults={creativeIntakeDefaults}
          initialIntake={creativeIntake}
          mode="compact"
        />
      ) : null}

      <CreativeWizard
        approvedUgcScriptHash={approvedUgcScriptHash}
        approvedUgcScriptLines={approvedUgcScriptLines}
        approvedBriefContext={approvedBriefContext}
        campaignId={ensuredRecord.campaign.id}
        creatives={creativeOptions}
        generationCreditOverrideActive={generationCreditOverrideActive}
        initialRenderJobs={activeRenderJobs}
        persistedSelectedAdIds={persistedSelectedAdIds}
        persistedSelectedUgcVideoIds={persistedSelectedUgcVideoIds}
        videoCreatives={videoOptions}
      />
    </div>
  );
}
