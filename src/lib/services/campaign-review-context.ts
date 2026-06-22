import { normalizeCampaignIntent } from "@/lib/campaign-intent";
import type { CampaignPlan } from "@/lib/services/campaign-plan-service";
import type { CreativeIntakeGenerationContext } from "@/lib/services/creative-chat-intake-service";

export function applyCreativeIntakeReviewContext(
  plan: CampaignPlan,
  context: CreativeIntakeGenerationContext | null,
): CampaignPlan {
  if (!context) {
    return plan;
  }

  const nextOffer = context.requiredOfferTitle || context.requiredOffer || plan.keyOffer;
  const nextCta = context.requiredCta || plan.funnel.cta;
  const nextMarket = context.market || plan.market;
  const nextAudience = context.targetAudience || plan.audience;
  const nextPropertyType = context.propertyType || plan.propertyType;
  const campaignType = normalizeCampaignIntent(context.campaignType, plan.intent);
  const isSeller = campaignType === "seller";
  const sellerTrust = [
    `Focused on ${nextMarket}`,
    "Local sale comparison",
    "Pricing and demand clarity",
    "Seller timing check",
  ];
  const sections = (plan.funnel.sections ?? []).map((section) => {
    if (isSeller && section.type === "trust_bar") {
      return { ...section, content: sellerTrust };
    }

    if (!isSeller) {
      return section;
    }

    return {
      ...section,
      content: section.content.map((item) =>
        item
          .replace(/\bQualified buyer positioning\b/gi, "Pricing and demand clarity")
          .replace(/\bprivate-access path\b/gi, "local sale comparison")
          .replace(/\bprivate access\b/gi, "sale comparison")
          .replace(/\bRequest Private Access\b/gi, nextCta || "Check My Sale Plan"),
      ),
    };
  });

  return {
    ...plan,
    intent: campaignType,
    market: nextMarket,
    audience: nextAudience,
    keyOffer: nextOffer,
    offerSummary: nextOffer,
    propertyType: nextPropertyType,
    businessName: context.brokerageBrand || plan.businessName,
    funnel: {
      ...plan.funnel,
      cta: nextCta,
      headline: isSeller ? `${nextOffer} for ${nextMarket} homeowners` : plan.funnel.headline,
      subheadline: isSeller
        ? `${nextAudience} can compare local pricing, buyer demand, and timing before deciding whether to list.`
        : plan.funnel.subheadline,
      sections,
    },
  };
}
