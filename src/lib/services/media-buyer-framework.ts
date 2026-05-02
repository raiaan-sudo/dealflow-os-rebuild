import type { CampaignCategory } from "@/lib/services/campaign-creative-strategy";

export type MediaBuyerCoreStep =
  | "pattern_interrupt"
  | "internal_problem"
  | "mechanism"
  | "proof_outcome"
  | "low_friction_cta";

export type MediaBuyerCategoryStrategy = {
  category: CampaignCategory;
  psychology: string[];
  triggerConditions: string[];
  internalTensions: string[];
  winningAngles: string[];
  approvedHookPatterns: string[];
  forbiddenHookPatterns: string[];
  mechanismStyles: string[];
  proofStyles: string[];
  visualLogic: string[];
  overlayLogic: string[];
  lowFrictionCtas: string[];
  antiPatterns: string[];
};

export type OfferQualityEvaluation = {
  accepted: boolean;
  score: number;
  components: {
    specificOutcome: number;
    numberOrQuantifier: number;
    timeframe: number;
    riskReversal: number;
    mechanismClarity: number;
    audienceSpecificity: number;
    lowFrictionNextStep: number;
  };
  hardFailures: string[];
  improvementHints: string[];
  safeOffer: string;
};

export type CreativeQualityEvaluation = {
  accepted: boolean;
  score: number;
  components: {
    offerStrength: number;
    hookStrength: number;
    mechanismClarity: number;
    proofStrength: number;
    visualSpecificity: number;
    ctaFriction: number;
    categoryFit: number;
    antiGenericRisk: number;
  };
  hardFailures: string[];
  improvementHints: string[];
};

export const MEDIA_BUYER_CORE_STRUCTURE: MediaBuyerCoreStep[] = [
  "pattern_interrupt",
  "internal_problem",
  "mechanism",
  "proof_outcome",
  "low_friction_cta",
];

export const MEDIA_BUYER_CATEGORY_STRATEGIES: Record<
  CampaignCategory,
  MediaBuyerCategoryStrategy
> = {
  seller: {
    category: "seller",
    psychology: [
      "fear of underpricing",
      "fear of bad timing",
      "fear of choosing the wrong agent",
      "ego that the home may be worth more than expected",
      "risk aversion before listing",
    ],
    triggerConditions: [
      "living in home 5+ years",
      "area appreciation",
      "seeing neighbors sell",
      "thinking about selling this year",
    ],
    internalTensions: [
      "not knowing if listing now is the right move",
      "fear of losing money before the home is even listed",
      "worry that demand was never tested before pricing",
    ],
    winningAngles: [
      "sitting on more equity than expected",
      "most sellers lose money before they list",
      "timing the market incorrectly costs more than commission",
    ],
    approvedHookPatterns: [
      "Before you sell your home in {market}, watch this.",
      "Most homeowners in {market} are making this mistake right now.",
      "If you're thinking about selling this year, don't list before this step.",
    ],
    forbiddenHookPatterns: [
      "what is your home worth",
      "sell your home fast",
      "free home evaluation",
      "attention homeowners",
      "learn more",
    ],
    mechanismStyles: [
      "pre-market positioning strategy",
      "demand test before listing",
      "buyer attraction plan before going live",
    ],
    proofStyles: [
      "price comparison overlay",
      "equity delta proof",
      "timing certainty proof",
      "before-and-after sale numbers",
    ],
    visualLogic: [
      "map overlays",
      "zestimate-style comparisons",
      "before-after price numbers",
      "clean suburban homes",
      "demand indicators",
    ],
    overlayLogic: [
      "price overlays",
      "home-value update banners",
      "numbers before adjectives",
      "location-led equity proof",
    ],
    lowFrictionCtas: [
      "Get My Price Update",
      "See My Value Gap",
      "Check Pre-Listing Demand",
    ],
    antiPatterns: [
      "empty luxury shots",
      "pitchy agent hero visuals",
      "generic curb appeal",
      "agent-first bragging",
    ],
  },
  buyer: {
    category: "buyer",
    psychology: [
      "fear of missing out",
      "confusion and overwhelm",
      "hope for upgrade",
      "affordability anxiety",
    ],
    triggerConditions: [
      "renting frustration",
      "life upgrade",
      "market uncertainty",
      "looking to upsize",
    ],
    internalTensions: [
      "not knowing what is still affordable",
      "getting beat before the best homes go public",
      "worrying that waiting means missing the right home",
    ],
    winningAngles: [
      "homes you did not know you could afford",
      "off-market hidden inventory",
      "buying with less down",
    ],
    approvedHookPatterns: [
      "If you're looking to upsize in {market}, stop scrolling.",
      "Most buyers don't know this about {market}.",
      "By the time you see the listing, it may already be gone.",
    ],
    forbiddenHookPatterns: [
      "new listing alert",
      "dream home",
      "attention buyers",
      "learn more",
    ],
    mechanismStyles: [
      "off-market access system",
      "deal-structure matching process",
      "property matching workflow before homes hit MLS",
    ],
    proofStyles: [
      "monthly payment anchor",
      "affordability comparison",
      "inventory access proof",
      "early-access proof",
    ],
    visualLogic: [
      "walkthrough clips",
      "warm livable interiors",
      "family using space",
      "backyard and kitchen focus",
    ],
    overlayLogic: [
      "price anchors",
      "monthly payment overlays",
      "under-budget callouts",
      "early-access callouts",
    ],
    lowFrictionCtas: [
      "Get Access",
      "See Homes That Match",
      "See If You Qualify",
    ],
    antiPatterns: [
      "overly staged empty homes",
      "property-only listing ads",
      "agent-first branding",
      "generic lifestyle stock shots",
    ],
  },
  precon: {
    category: "precon",
    psychology: [
      "timeline arbitrage",
      "risk-aware upside",
      "low-entry leverage",
      "belief that the area will develop",
    ],
    triggerConditions: [
      "cannot afford resale now",
      "low entry desire",
      "belief market will go up",
    ],
    internalTensions: [
      "wanting into the market without full resale-level cash today",
      "fear of waiting while future pricing moves up",
      "uncertainty about which projects have real upside",
    ],
    winningAngles: [
      "lock today's price and pay later",
      "10 percent down with future completion",
      "area developing toward future value",
    ],
    approvedHookPatterns: [
      "This is how people are buying real estate without paying full price today.",
      "You don't need a full down payment to secure this in {market}.",
      "Invest early before this area changes.",
    ],
    forbiddenHookPatterns: [
      "new condo release",
      "register now",
      "exclusive opportunity",
      "learn more",
    ],
    mechanismStyles: [
      "phased deposit structure",
      "interest-earning deposit path",
      "assignment-ready purchase structure",
    ],
    proofStyles: [
      "deposit schedule proof",
      "completion timeline proof",
      "current-versus-future value proof",
    ],
    visualLogic: [
      "current versus future split scenes",
      "construction plus finished render",
      "development pins",
      "timeline graphics",
    ],
    overlayLogic: [
      "2026 to 2028 timeline",
      "10 percent deposit callout",
      "below-market entry pricing",
      "completion year anchor",
    ],
    lowFrictionCtas: [
      "Get The List",
      "View Deposit Options",
      "Check Entry Pricing",
    ],
    antiPatterns: [
      "final render only",
      "brochure-only glamour",
      "no timeline context",
      "generic condo promo",
    ],
  },
  luxury: {
    category: "luxury",
    psychology: [
      "status signaling",
      "exclusivity",
      "identity alignment",
      "desire for uniqueness",
    ],
    triggerConditions: [
      "high income or wealth",
      "social positioning",
      "desire for uniqueness",
    ],
    internalTensions: [
      "wanting private access before everyone else sees it",
      "needing the property to match identity",
      "rejecting public-market sameness",
    ],
    winningAngles: [
      "not publicly available",
      "only a few units like this",
      "designed for a certain type of buyer",
    ],
    approvedHookPatterns: [
      "This isn't for everyone.",
      "If you know, you know.",
      "Rare opportunity in {market}.",
    ],
    forbiddenHookPatterns: [
      "new listing alert",
      "luxury living",
      "exclusive deal",
      "learn more",
    ],
    mechanismStyles: [
      "private access network",
      "off-market curation process",
      "curated listing circle",
    ],
    proofStyles: [
      "scarcity proof",
      "private access proof",
      "identity-aligned exclusivity",
    ],
    visualLogic: [
      "penthouse views",
      "marble glass skyline",
      "night city lighting",
      "subtle motion feel",
    ],
    overlayLogic: [
      "minimal text",
      "quiet private access cue",
      "rare availability",
      "subtle location-led exclusivity",
    ],
    lowFrictionCtas: [
      "Request Private Access",
      "View The Private Release",
      "See If This Fits",
    ],
    antiPatterns: [
      "overloaded text",
      "discount-style promo overlays",
      "cheap urgency language",
      "generic empty luxury rooms",
    ],
  },
  investor: {
    category: "investor",
    psychology: [
      "return",
      "risk mitigation",
      "data-backed decisions",
      "asset-class comparison",
    ],
    triggerConditions: [
      "capital sitting idle",
      "looking for yield",
      "comparing asset classes",
    ],
    internalTensions: [
      "capital sitting still while better opportunities compound",
      "not knowing which market actually outperforms",
      "underwriting the wrong deals",
    ],
    winningAngles: [
      "outperforming traditional investments",
      "cash flow plus appreciation",
      "data-backed opportunity",
    ],
    approvedHookPatterns: [
      "If your money is sitting in the bank, watch this.",
      "Here's what smart investors are doing in {market} right now.",
      "This market is being overlooked.",
    ],
    forbiddenHookPatterns: [
      "dream investment",
      "beautiful property",
      "new listing alert",
      "learn more",
    ],
    mechanismStyles: [
      "micro-market analysis system",
      "undervalued-area selection process",
      "long-term growth underwriting framework",
    ],
    proofStyles: [
      "ROI projection overlay",
      "rental yield comparison",
      "rent-versus-price comparison",
      "cash-flow plus appreciation proof",
    ],
    visualLogic: [
      "clean dashboards",
      "charts plus buildings",
      "ROI projections",
      "rent versus price comparisons",
    ],
    overlayLogic: [
      "ROI percentages",
      "rental yield overlays",
      "micro-market data callouts",
      "cash-flow numbers",
    ],
    lowFrictionCtas: [
      "View Available Deals",
      "See Available Cash-Flow Deals",
      "Review The Deal Breakdown",
    ],
    antiPatterns: [
      "emotional lifestyle shots",
      "generic luxury interiors",
      "vague appreciation promises",
      "property-beauty-first framing",
    ],
  },
};

const CATEGORY_SAFE_OFFERS: Record<CampaignCategory, string> = {
  seller: "Get a price-and-demand update before you list",
  buyer: "Get early access to homes that match your budget",
  precon: "View deposit and completion options before prices move",
  luxury: "Request private access to rare listings",
  investor: "Get off-market properties matched to your ROI criteria",
};

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: unknown) {
  return safeText(value).toLowerCase();
}

function clampScore(value: number) {
  return Math.max(0, Math.min(10, Number(value.toFixed(2))));
}

function containsAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => {
    const normalized = normalize(pattern).replace(/[^\w\s$%+-]+/g, " ").trim();
    return normalized.length > 2 && text.includes(normalized);
  });
}

function hasNumberOrQuantifier(text: string) {
  return (
    /\d|\$|%|\b(one|two|three|four|five|six|seven|eight|nine|ten|few|multiple|under|over|below|above)\b/.test(text)
  );
}

function hasTimeframe(text: string) {
  return /\b(today|now|daily|weekly|month|monthly|year|days?|weeks?|30|60|90|202\d|completion|deadline|before|early)\b/.test(text);
}

function hasRiskReversal(text: string, category: CampaignCategory) {
  if (category === "luxury") {
    return /\b(private|request|limited|rare|not publicly available|preview)\b/.test(text);
  }

  return /\b(guarantee|free|no obligation|without|before|off-market|private access|qualify|priority|low deposit|below-market|under|list|preview|refund|work for free)\b/.test(text);
}

function hasMechanismSignal(text: string) {
  return /\b(system|process|strategy|framework|network|filter|matching|access|pre-market|demand test|phased|micro-market|underwriting|sequence|workflow|structure)\b/.test(text);
}

function hasLowFrictionStep(text: string) {
  return /\b(see|view|get|check|request|access|qualify|review|preview|list|breakdown)\b/.test(text);
}

function hasAudienceSpecificity(text: string, category: CampaignCategory) {
  const categoryTerms: Record<CampaignCategory, RegExp> = {
    seller: /\b(seller|homeowners?|home|listing|pre-list|property price|price-and-demand|value)\b/,
    buyer: /\b(buyer|home|homes|upsize|monthly payment|afford|access)\b/,
    precon: /\b(pre-con|precon|new build|deposit|completion|assignment|construction)\b/,
    luxury: /\b(luxury|private|rare|penthouse|exclusive|high-net|curated)\b/,
    investor: /\b(investor|roi|yield|cash-flow|cash flow|rental|deal|underwriting)\b/,
  };

  return categoryTerms[category].test(text);
}

function countVagueWords(text: string) {
  const matches = text.match(/\b(more|better|quality|grow|growth|leads|solutions?|service|help)\b/g);
  return matches?.length ?? 0;
}

function isB2BAgentAudience(audience: string) {
  return /\b(agent|realtor|broker|real estate professional|team leader)\b/.test(normalize(audience));
}

function containsB2BAgentOfferLeak(text: string) {
  return /\b(listing appointments?|homeowner appointments?|seller leads?|buyer leads?|realtors?|agents?|pay again|work for free|ad spend|lead quality)\b/.test(text);
}

function containsUnsafeGuarantee(text: string) {
  return /\b(guaranteed income|guaranteed deals?|guaranteed roi|guaranteed profit|guaranteed revenue|guaranteed return)\b/.test(text);
}

function componentScore(condition: boolean, strong = 10, weak = 0) {
  return condition ? strong : weak;
}

export function getMediaBuyerCategoryStrategy(category: CampaignCategory) {
  return MEDIA_BUYER_CATEGORY_STRATEGIES[category];
}

export function getCategorySafeOffer(category: CampaignCategory) {
  return CATEGORY_SAFE_OFFERS[category];
}

export function evaluateOfferQuality(params: {
  category: CampaignCategory;
  offer: string;
  mechanism?: string | null;
  audience?: string | null;
  cta?: string | null;
}): OfferQualityEvaluation {
  const category = params.category;
  const offer = safeText(params.offer);
  const audience = safeText(params.audience);
  const cta = safeText(params.cta);
  const text = normalize([offer, params.mechanism, audience, cta].filter(Boolean).join(" "));
  const b2bAgentCampaign = isB2BAgentAudience(audience);
  const components = {
    specificOutcome: componentScore(hasAudienceSpecificity(text, category)),
    numberOrQuantifier: componentScore(hasNumberOrQuantifier(text), 10, 3),
    timeframe: componentScore(hasTimeframe(text), 10, 3),
    riskReversal: componentScore(hasRiskReversal(text, category), 10, 4),
    mechanismClarity: componentScore(hasMechanismSignal(text), 10, 2),
    audienceSpecificity: componentScore(hasAudienceSpecificity(text, category), 10, 4),
    lowFrictionNextStep: componentScore(hasLowFrictionStep(text), 10, 5),
  };
  const hardFailures: string[] = [];
  const improvementHints: string[] = [];

  if (!offer) {
    hardFailures.push("Offer is missing.");
    improvementHints.push(`Use a category-safe offer such as: ${CATEGORY_SAFE_OFFERS[category]}.`);
  }

  if (!hasNumberOrQuantifier(text)) {
    hardFailures.push("Offer needs a number, price, percentage, or quantifier.");
    improvementHints.push("Add a concrete number, price anchor, percentage, or quantity.");
  }

  if (!hasTimeframe(text)) {
    hardFailures.push("Offer needs a timeframe or timing context.");
    improvementHints.push("Add a timeframe such as 30-90 days, this month, completion year, or before listing.");
  }

  if (!hasRiskReversal(text, category)) {
    hardFailures.push("Offer needs risk reversal, access, or a lower-friction promise.");
    improvementHints.push("Add low-risk language such as no obligation, preview, qualify, private access, or below-market access.");
  }

  if (!hasMechanismSignal(text)) {
    hardFailures.push("Offer needs a named mechanism or process.");
    improvementHints.push("Name the process that makes the offer believable.");
  }

  if (!hasAudienceSpecificity(text, category)) {
    hardFailures.push(`Offer is not specific enough for ${category} campaigns.`);
    improvementHints.push(`Tie the offer to ${category} psychology and the selected market.`);
  }

  if (countVagueWords(text) >= 2) {
    hardFailures.push("Offer uses too many vague performance words.");
    improvementHints.push("Replace vague words with a specific outcome, proof point, or next step.");
  }

  if (!b2bAgentCampaign && containsB2BAgentOfferLeak(text)) {
    hardFailures.push("Consumer-facing campaign contains B2B agent-acquisition language.");
    improvementHints.push(`Use consumer-facing language instead: ${CATEGORY_SAFE_OFFERS[category]}.`);
  }

  if (containsUnsafeGuarantee(text)) {
    hardFailures.push("Offer contains unsafe guaranteed-income/deal language.");
    improvementHints.push("Use effort, appointment, access, or qualification guarantees instead of revenue/deal guarantees.");
  }

  const rawScore =
    components.specificOutcome * 0.17 +
    components.numberOrQuantifier * 0.12 +
    components.timeframe * 0.12 +
    components.riskReversal * 0.14 +
    components.mechanismClarity * 0.18 +
    components.audienceSpecificity * 0.14 +
    components.lowFrictionNextStep * 0.13 -
    Math.min(3, countVagueWords(text) * 0.8) -
    (containsUnsafeGuarantee(text) ? 4 : 0) -
    (!b2bAgentCampaign && containsB2BAgentOfferLeak(text) ? 4 : 0);
  const score = clampScore(rawScore);

  return {
    accepted: score >= 7 && hardFailures.length === 0,
    score,
    components,
    hardFailures,
    improvementHints,
    safeOffer:
      !b2bAgentCampaign && containsB2BAgentOfferLeak(text)
        ? CATEGORY_SAFE_OFFERS[category]
        : offer || CATEGORY_SAFE_OFFERS[category],
  };
}

export function evaluateCreativeQuality(params: {
  category: CampaignCategory;
  offer: string;
  mechanism?: string | null;
  audience?: string | null;
  hook?: string | null;
  primaryText?: string | null;
  headline?: string | null;
  overlayText?: string | null;
  cta?: string | null;
  visualConcept?: string | null;
  imagePrompt?: string | null;
  scriptLines?: string[] | null;
}): CreativeQualityEvaluation {
  const strategy = MEDIA_BUYER_CATEGORY_STRATEGIES[params.category];
  const offerQuality = evaluateOfferQuality({
    category: params.category,
    offer: params.offer,
    mechanism: params.mechanism,
    audience: params.audience,
    cta: params.cta,
  });
  const hook = normalize(params.hook);
  const cta = normalize(params.cta);
  const combined = normalize(
    [
      params.hook,
      params.primaryText,
      params.headline,
      params.overlayText,
      params.cta,
      params.visualConcept,
      params.imagePrompt,
      ...(params.scriptLines ?? []),
    ].join(" "),
  );
  const script = normalize((params.scriptLines ?? []).join(" "));
  const hardFailures: string[] = [...offerQuality.hardFailures];
  const improvementHints: string[] = [...offerQuality.improvementHints];
  const blockedHook =
    containsAny(hook, strategy.forbiddenHookPatterns) ||
    /^(attention realtors|attention homeowners|looking for motivated sellers|we help businesses grow|learn more)\b/.test(hook);
  const longIntro = /^(hi|hey|hello),?\s+(my name is|i am|i'm)\b/.test(script || hook);
  const noFirstHook = (params.scriptLines?.[0] ?? params.hook ?? "").trim().length < 12;
  const genericPropertyFirst =
    /\b(beautiful property|stunning home|dream home|new listing alert|luxury living|exclusive opportunity)\b/.test(combined);
  const agentFirst = /\b(top agent|award-winning agent|our team|my clients|i'm an agent|i am an agent)\b/.test(combined);
  const overlyPolished = /\b(overly polished|cinematic only|brochure|showroom|stock photo|generic luxury)\b/.test(combined);

  if (blockedHook) hardFailures.push("Hook matches a blocked/generic media-buyer pattern.");
  if (longIntro) hardFailures.push("Script starts with a slow self-introduction.");
  if (noFirstHook) hardFailures.push("Creative needs a stronger first-three-seconds hook.");
  if (genericPropertyFirst) hardFailures.push("Creative is property-first or generic instead of decision-point-first.");
  if (agentFirst) hardFailures.push("Creative is agent-first instead of audience-tension-first.");
  if (overlyPolished) hardFailures.push("Creative leans too polished/generic for cold traffic.");

  if (blockedHook) improvementHints.push("Rewrite the hook as a situation or decision moment, not an obvious marketing callout.");
  if (genericPropertyFirst) improvementHints.push("Lead with the internal tension, mechanism, or proof instead of the property itself.");
  if (agentFirst) improvementHints.push("Remove agent bragging and make the audience's decision point the opening.");

  const hasPatternInterrupt = /\b(before|most|if you|still|nobody|you don't|by the time|this is how|here's how|stop|watch|isn't for everyone)\b/.test(hook);
  const hasMechanism = hasMechanismSignal(normalize([params.mechanism, combined].join(" ")));
  const hasProof =
    /\d|\$|%|roi|yield|payment|price|value|timeline|before|after|proof|deposit|completion/.test(combined) ||
    containsAny(combined, strategy.proofStyles);
  const visualSpecific =
    containsAny(combined, strategy.visualLogic) ||
    /\b(map|chart|dashboard|timeline|kitchen|backyard|construction|skyline|marble|yield|roi|price comparison)\b/.test(combined);
  const categoryFit =
    containsAny(combined, strategy.triggerConditions) ||
    containsAny(combined, strategy.internalTensions) ||
    containsAny(combined, strategy.winningAngles) ||
    containsAny(combined, strategy.mechanismStyles);
  const antiGenericRisk = clampScore(
    (blockedHook ? 4 : 0) +
      (genericPropertyFirst ? 3 : 0) +
      (agentFirst ? 3 : 0) +
      (overlyPolished ? 2 : 0) +
      (containsAny(combined, strategy.antiPatterns) ? 3 : 0) +
      (/generic|vague|learn more|contact us|click here/.test(combined) ? 2 : 0),
  );
  const components = {
    offerStrength: offerQuality.score,
    hookStrength: clampScore((hasPatternInterrupt ? 8 : 4) + (blockedHook ? -5 : 0)),
    mechanismClarity: clampScore(hasMechanism ? 8.5 : 3),
    proofStrength: clampScore(hasProof ? 8 : 3.5),
    visualSpecificity: clampScore(visualSpecific ? 8 : 4),
    ctaFriction: clampScore(hasLowFrictionStep(cta) && !/book a call|learn more|contact us/.test(cta) ? 8.5 : 4),
    categoryFit: clampScore(categoryFit ? 8.5 : 4),
    antiGenericRisk,
  };
  const score = clampScore(
    (components.offerStrength +
      components.hookStrength +
      components.mechanismClarity +
      components.proofStrength +
      components.visualSpecificity +
      components.ctaFriction +
      components.categoryFit +
      (10 - components.antiGenericRisk)) /
      8,
  );

  if (score < 7) {
    improvementHints.push("Regenerate or repair this creative until the media-buyer quality score is at least 7.");
  }

  return {
    accepted: score >= 7 && hardFailures.length === 0,
    score,
    components,
    hardFailures: Array.from(new Set(hardFailures)),
    improvementHints: Array.from(new Set(improvementHints)),
  };
}
