import type {
  CampaignIntent,
  CampaignPlan,
  OnboardingInput,
} from "@/lib/services/campaign-plan-service";

export type KnowledgeIndustry = "real_estate";
export type KnowledgeAudienceType =
  | "first_time_buyers"
  | "move_up_buyers"
  | "investors"
  | "sellers"
  | "downsizers"
  | "generic_buyers"
  | "generic_sellers";
export type KnowledgeFunnelType = "buyer_match" | "seller_valuation";
export type KnowledgeAdAngle =
  | "approval"
  | "urgency"
  | "speed"
  | "pain"
  | "authority"
  | "exclusivity";

export type KnowledgeHook = {
  id: string;
  industry: KnowledgeIndustry;
  audienceType: KnowledgeAudienceType;
  funnelType: KnowledgeFunnelType;
  adAngle: KnowledgeAdAngle;
  label: string;
  pattern: string;
};

export type FunnelFramework = {
  id: string;
  industry: KnowledgeIndustry;
  audienceType: KnowledgeAudienceType;
  funnelType: KnowledgeFunnelType;
  name: string;
  heroPattern: string;
  bodySteps: string[];
};

export type TargetingStrategy = {
  id: string;
  industry: KnowledgeIndustry;
  audienceType: KnowledgeAudienceType;
  funnelType: KnowledgeFunnelType;
  name: string;
  summaryPattern: string;
};

export type OfferStructure = {
  id: string;
  industry: KnowledgeIndustry;
  audienceType: KnowledgeAudienceType;
  funnelType: KnowledgeFunnelType;
  name: string;
  summaryPattern: string;
};

export const HIGH_PERFORMING_AD_HOOKS: KnowledgeHook[] = [
  {
    id: "buyers-approval-1",
    industry: "real_estate",
    audienceType: "first_time_buyers",
    funnelType: "buyer_match",
    adAngle: "approval",
    label: "Approval relief",
    pattern: "{audience} looking for {market} {propertyType}? {keyOffer}.",
  },
  {
    id: "buyers-speed-1",
    industry: "real_estate",
    audienceType: "first_time_buyers",
    funnelType: "buyer_match",
    adAngle: "speed",
    label: "Market speed",
    pattern: "Stop missing the best {market} {propertyType}. {keyOffer}.",
  },
  {
    id: "buyers-urgency-1",
    industry: "real_estate",
    audienceType: "generic_buyers",
    funnelType: "buyer_match",
    adAngle: "urgency",
    label: "Fast inventory pressure",
    pattern: "The best {market} {propertyType} go fast. {audience} need {keyOffer} before they disappear.",
  },
  {
    id: "buyers-pain-1",
    industry: "real_estate",
    audienceType: "generic_buyers",
    funnelType: "buyer_match",
    adAngle: "pain",
    label: "Listing fatigue",
    pattern: "Tired of wasting time on the wrong {propertyType}? {keyOffer}.",
  },
  {
    id: "investors-exclusivity-1",
    industry: "real_estate",
    audienceType: "investors",
    funnelType: "buyer_match",
    adAngle: "exclusivity",
    label: "Deal access",
    pattern: "{audience} in {market}: get tighter {propertyType} opportunities with {keyOffer}.",
  },
  {
    id: "sellers-speed-1",
    industry: "real_estate",
    audienceType: "sellers",
    funnelType: "seller_valuation",
    adAngle: "speed",
    label: "Fast clarity",
    pattern: "{audience} in {market}: move your {propertyType} faster with {keyOffer}.",
  },
  {
    id: "sellers-pain-1",
    industry: "real_estate",
    audienceType: "generic_sellers",
    funnelType: "seller_valuation",
    adAngle: "pain",
    label: "Unclear next step",
    pattern: "Still waiting on a better plan for your {propertyType}? {keyOffer}.",
  },
  {
    id: "sellers-authority-1",
    industry: "real_estate",
    audienceType: "downsizers",
    funnelType: "seller_valuation",
    adAngle: "authority",
    label: "Experienced guidance",
    pattern: "{audience} in {market} can get a clearer sale path with {keyOffer}.",
  },
];

export const FUNNEL_FRAMEWORKS: FunnelFramework[] = [
  {
    id: "buyer-direct-response",
    industry: "real_estate",
    audienceType: "generic_buyers",
    funnelType: "buyer_match",
    name: "Direct-response buyer match",
    heroPattern: "The best {market} {propertyType} move fast. {audience} need {keyOffer} before the right options disappear.",
    bodySteps: [
      "Open with listing fatigue, missed inventory, and the cost of seeing bad-fit {propertyType}.",
      "Introduce {mechanism} as the reason the shortlist feels tighter than a normal home search.",
      "Close with a low-friction form and a direct CTA built around {keyOffer}.",
    ],
  },
  {
    id: "seller-valuation-response",
    industry: "real_estate",
    audienceType: "generic_sellers",
    funnelType: "seller_valuation",
    name: "Seller urgency valuation",
    heroPattern: "{audience} in {market} need a faster path to clarity. {keyOffer} makes the next move obvious.",
    bodySteps: [
      "Surface uncertainty around timing, pricing, and weak agent advice.",
      "Position {mechanism} as the reason the seller gets a cleaner plan than a generic valuation request.",
      "Use a short form and a next-step CTA that reinforces {keyOffer}.",
    ],
  },
];

export const TARGETING_STRATEGIES: TargetingStrategy[] = [
  {
    id: "buyer-high-intent",
    industry: "real_estate",
    audienceType: "generic_buyers",
    funnelType: "buyer_match",
    name: "High-intent buyer slice",
    summaryPattern:
      "Target {audience} actively looking for {market} {propertyType}, then narrow toward people most likely to respond to {keyOffer} instead of broad awareness traffic.",
  },
  {
    id: "investor-deal-seekers",
    industry: "real_estate",
    audienceType: "investors",
    funnelType: "buyer_match",
    name: "Deal-seeking investors",
    summaryPattern:
      "Target {audience} searching for {market} {propertyType} and lead with {keyOffer} so the message stays focused on stronger deal intent.",
  },
  {
    id: "seller-ready-movers",
    industry: "real_estate",
    audienceType: "generic_sellers",
    funnelType: "seller_valuation",
    name: "Ready-to-move sellers",
    summaryPattern:
      "Target {audience} in {market} who are likely to act within the current cycle, then filter around response to {keyOffer} rather than broad homeowner interest.",
  },
];

export const OFFER_STRUCTURES: OfferStructure[] = [
  {
    id: "buyer-curated-access",
    industry: "real_estate",
    audienceType: "generic_buyers",
    funnelType: "buyer_match",
    name: "Curated match offer",
    summaryPattern:
      "{keyOffer}. Delivered through {mechanism} for {audience} who want better {propertyType} options in {market} without wasting time.",
  },
  {
    id: "seller-clarity-offer",
    industry: "real_estate",
    audienceType: "generic_sellers",
    funnelType: "seller_valuation",
    name: "Clarity-first seller offer",
    summaryPattern:
      "{keyOffer}. Delivered through {mechanism} for {audience} in {market} who want a cleaner next step for their {propertyType}.",
  },
];

type TemplateContext = {
  audience: string;
  propertyType: string;
  keyOffer: string;
  market: string;
  mechanism: string;
};

function inferAudienceType(audience: string, intent: CampaignIntent): KnowledgeAudienceType {
  const normalized = audience.toLowerCase();

  if (normalized.includes("first-time")) {
    return "first_time_buyers";
  }

  if (normalized.includes("investor")) {
    return "investors";
  }

  if (normalized.includes("move-up")) {
    return "move_up_buyers";
  }

  if (normalized.includes("downsizer")) {
    return "downsizers";
  }

  if (intent === "seller") {
    return normalized.includes("seller") ? "sellers" : "generic_sellers";
  }

  return "generic_buyers";
}

export function getKnowledgeProfile(
  source: Pick<OnboardingInput, "intent" | "audience" | "propertyType" | "keyOffer" | "market" | "mechanism">,
) {
  const audienceType = inferAudienceType(source.audience, source.intent);
  const funnelType: KnowledgeFunnelType = source.intent === "buyer" ? "buyer_match" : "seller_valuation";

  return {
    industry: "real_estate" as const,
    audienceType,
    funnelType,
    context: {
      audience: source.audience,
      propertyType: source.propertyType,
      keyOffer: source.keyOffer,
      market: source.market,
      mechanism: source.mechanism,
    },
  };
}

export function fillPattern(pattern: string, context: TemplateContext) {
  return pattern
    .replaceAll("{audience}", context.audience)
    .replaceAll("{propertyType}", context.propertyType)
    .replaceAll("{keyOffer}", context.keyOffer)
    .replaceAll("{market}", context.market)
    .replaceAll("{mechanism}", context.mechanism);
}

function matchAudience<T extends { audienceType: KnowledgeAudienceType; funnelType: KnowledgeFunnelType }>(
  items: T[],
  audienceType: KnowledgeAudienceType,
  funnelType: KnowledgeFunnelType,
) {
  return items.filter(
    (item) =>
      item.funnelType === funnelType &&
      (item.audienceType === audienceType ||
        item.audienceType === (funnelType === "buyer_match" ? "generic_buyers" : "generic_sellers")),
  );
}

export function selectFunnelFramework(source: Pick<CampaignPlan, "intent" | "audience" | "propertyType" | "keyOffer" | "market" | "mechanism">) {
  const profile = getKnowledgeProfile(source);
  return matchAudience(FUNNEL_FRAMEWORKS, profile.audienceType, profile.funnelType)[0] ?? FUNNEL_FRAMEWORKS[0];
}

export function selectTargetingStrategy(source: Pick<CampaignPlan, "intent" | "audience" | "propertyType" | "keyOffer" | "market" | "mechanism">) {
  const profile = getKnowledgeProfile(source);
  return matchAudience(TARGETING_STRATEGIES, profile.audienceType, profile.funnelType)[0] ?? TARGETING_STRATEGIES[0];
}

export function selectOfferStructure(source: Pick<CampaignPlan, "intent" | "audience" | "propertyType" | "keyOffer" | "market" | "mechanism">) {
  const profile = getKnowledgeProfile(source);
  return matchAudience(OFFER_STRUCTURES, profile.audienceType, profile.funnelType)[0] ?? OFFER_STRUCTURES[0];
}

export function selectAdHooks(source: Pick<CampaignPlan, "intent" | "audience" | "propertyType" | "keyOffer" | "market" | "mechanism">) {
  const profile = getKnowledgeProfile(source);
  const matched = matchAudience(HIGH_PERFORMING_AD_HOOKS, profile.audienceType, profile.funnelType);
  return matched.length > 0 ? matched : HIGH_PERFORMING_AD_HOOKS.slice(0, 3);
}

export function getKnowledgeContextForPlan(plan: CampaignPlan) {
  const profile = getKnowledgeProfile(plan);
  const funnelFramework = selectFunnelFramework(plan);
  const targetingStrategy = selectTargetingStrategy(plan);
  const offerStructure = selectOfferStructure(plan);
  const adHooks = selectAdHooks(plan);

  return {
    profile,
    funnelFramework,
    targetingStrategy,
    offerStructure,
    adHooks,
  };
}
