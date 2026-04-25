import { inferCampaignIntent } from "@/lib/campaign-intent";
import { normalizeCanonicalFunnelSections } from "@/lib/services/canonical-campaign";
import { debugLog } from "@/lib/debug";
import type {
  CampaignAd,
  CampaignCreatives,
  CampaignPlan,
} from "@/lib/services/campaign-plan-service";

type CampaignEnvelope = {
  plan: CampaignPlan;
};

function safeText(value: unknown) {
  return (value ?? "").toString().trim();
}

function normalizeRequiredText(value: unknown, errorMessage: string) {
  const normalized = safeText(value);

  if (!normalized) {
    throw new Error(errorMessage);
  }

  return normalized;
}

function normalizeOptionalText(value: unknown) {
  return safeText(value);
}

function normalizePainPoints(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => safeText(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeAds(value: unknown): CampaignAd[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((ad) => {
    const source = (ad ?? {}) as Partial<CampaignAd>;

    return {
      variant: normalizeOptionalText(source.variant),
      angle: source.angle,
      sourcePatternId: source.sourcePatternId ?? null,
      overlayText: normalizeOptionalText(source.overlayText),
      headline: normalizeOptionalText(source.headline),
      body: normalizeOptionalText(source.body),
      cta: normalizeOptionalText(source.cta),
      image: normalizeOptionalText(source.image),
    };
  });
}

function normalizeCreatives(value: unknown): CampaignCreatives {
  const creatives = (value ?? {}) as Partial<CampaignCreatives>;

  return {
    staticAds: Array.isArray(creatives.staticAds) ? creatives.staticAds : [],
    videoAds: Array.isArray(creatives.videoAds) ? creatives.videoAds : [],
  };
}

function hasRenderableMarketContext(plan: Partial<CampaignPlan>) {
  return Boolean(
    safeText(plan.market) ||
      safeText(plan.audience) ||
      safeText(plan.targetingSummary) ||
      safeText(plan.funnel?.headline) ||
      safeText(plan.funnel?.subheadline),
  );
}

function hasRenderableOfferContext(plan: Partial<CampaignPlan>) {
  const hasAdCopy = Array.isArray(plan.ads)
    ? plan.ads.some((ad) => Boolean(safeText(ad?.headline) || safeText(ad?.body) || safeText(ad?.overlayText)))
    : false;

  return Boolean(
    safeText(plan.keyOffer) ||
      safeText(plan.offerSummary) ||
      safeText(plan.summary) ||
      safeText(plan.mechanism) ||
      safeText(plan.funnel?.headline) ||
      safeText(plan.funnel?.subheadline) ||
      hasAdCopy,
  );
}

export function validateCampaign(campaign: any) {
  if (!campaign) {
    debugLog("campaign-validation-missing");
    return null;
  }

  const normalizedCampaign = {
    ...campaign,
    plan: campaign.plan ?? {},
  };

  if (!normalizedCampaign.plan.intent) {
    debugLog("campaign-validation-intent-missing");
  }

  if (!normalizedCampaign.plan.market && !hasRenderableMarketContext(normalizedCampaign.plan)) {
    debugLog("campaign-validation-market-missing");
  }

  if (!normalizedCampaign.plan.keyOffer && !hasRenderableOfferContext(normalizedCampaign.plan)) {
    debugLog("campaign-validation-offer-missing");
  }

  return normalizedCampaign as CampaignEnvelope;
}

export function normalizeCampaign(campaign: CampaignEnvelope): CampaignEnvelope {
  const plan = campaign.plan ?? ({} as CampaignPlan);
  const fallbackSections = Array.isArray(plan.funnel?.sections) ? plan.funnel.sections : [];

  return {
    ...campaign,
    plan: {
      ...plan,
      intent: inferCampaignIntent({
        intent: plan.intent,
        marketType: (plan as Partial<CampaignPlan>).intent,
        offer: plan.keyOffer,
        audience: plan.audience,
        primaryGoal: plan.primaryGoal,
        mechanism: plan.mechanism,
      }),
      market: normalizeOptionalText(plan.market),
      audience: normalizeOptionalText(plan.audience),
      keyOffer: normalizeOptionalText(plan.keyOffer),
      businessName: normalizeOptionalText(plan.businessName),
      propertyType: normalizeOptionalText(plan.propertyType),
      primaryGoal: normalizeOptionalText(plan.primaryGoal),
      timeline: normalizeOptionalText(plan.timeline),
      mechanism: normalizeOptionalText(plan.mechanism),
      summary: normalizeOptionalText(plan.summary),
      targetingSummary: normalizeOptionalText(plan.targetingSummary),
      offerSummary: normalizeOptionalText(plan.offerSummary),
      funnelType: normalizeOptionalText(plan.funnelType),
      painPoints: normalizePainPoints(plan.painPoints),
      funnelSteps: Array.isArray(plan.funnelSteps) ? plan.funnelSteps : [],
      creatives: normalizeCreatives(plan.creatives),
      ads: normalizeAds(plan.ads),
      funnel: {
        funnelType: normalizeOptionalText(plan.funnel?.funnelType ?? plan.funnelType),
        headline: normalizeOptionalText(plan.funnel?.headline),
        subheadline: normalizeOptionalText(plan.funnel?.subheadline),
        cta: normalizeOptionalText(plan.funnel?.cta),
        sections: normalizeCanonicalFunnelSections(plan.funnel?.sections, fallbackSections),
        formFields: Array.isArray(plan.funnel?.formFields) ? plan.funnel.formFields : [],
        followUpAction: normalizeOptionalText(plan.funnel?.followUpAction),
        optimizationNotes: Array.isArray(plan.funnel?.optimizationNotes) ? plan.funnel.optimizationNotes : [],
      },
    },
  };
}
