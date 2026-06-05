import type { CampaignIntent } from "@/lib/campaign-intent";
import { enhanceOffer, extractOfferData } from "@/lib/copy/offer-enhancement";
import {
  buildDirectResponseFunnel,
  resolveDirectResponseFunnelVariant,
  type DirectResponseAudienceType,
  type DirectResponseFormMode,
  type DirectResponseFunnelMetadata,
  type DirectResponseFunnelVariant,
  type DirectResponseOfferType,
} from "@/lib/direct-response-funnel";
import type { CampaignCategory } from "@/lib/services/campaign-creative-strategy";
import {
  getCategoryCtaOptions,
  selectMediaBuyerCta,
} from "@/lib/optimization-engine/media-buying-rules";
import { selectMediaBuyerCampaignPackage } from "@/lib/services/media-buyer-framework";

export type FunnelMarketType = CampaignIntent;
export type FunnelGoal = "lead_form" | "survey" | "book_call";
export type FunnelType =
  | "landing_page_form"
  | "landing_page_survey"
  | "landing_page_book_call";

export type FunnelSectionType =
  | "hero"
  | "trust_bar"
  | "benefits"
  | "proof_metrics"
  | "social_proof"
  | "market_snapshot"
  | "objections"
  | "process"
  | "faq"
  | "vsl"
  | "image"
  | "form"
  | "closing_cta";

export type FunnelSectionStyle = {
  spacing: "compact" | "comfortable" | "spacious";
  width: "full" | "content" | "narrow";
  align: "left" | "center";
  theme: "light" | "dark" | "accent";
};

export type FunnelSectionMedia = {
  kind: "video" | "image";
  assetId?: string;
  url?: string;
  thumbnailAssetId?: string;
  thumbnailUrl?: string;
  label?: string;
  caption?: string;
};

export type FunnelEngineInput = {
  location?: string;
  audience?: string;
  offer?: string;
  key_offer?: string;
  agentName?: string;
  agent_name?: string;
  brokerage?: string;
  partnerName?: string;
  partner_name?: string;
  whiteLabelEnabled?: boolean;
  white_label_enabled?: boolean;
  brandMode?: "dealflow" | "partner" | "agent";
  brand_mode?: "dealflow" | "partner" | "agent";
  headline?: string;
  subheadline?: string;
  mechanism?: string;
  pain_points?: string[];
  market_type?: FunnelMarketType;
  funnel_goal?: FunnelGoal;
  funnelVariant?: DirectResponseFunnelVariant;
  funnel_variant?: DirectResponseFunnelVariant;
  audienceType?: DirectResponseAudienceType;
  audience_type?: DirectResponseAudienceType;
  offerType?: DirectResponseOfferType;
  offer_type?: DirectResponseOfferType;
  market?: string;
  priceThreshold?: string;
  price_threshold?: string;
  leadMagnetTitle?: string;
  lead_magnet_title?: string;
  primaryCTA?: string;
  primary_cta?: string;
  formMode?: DirectResponseFormMode;
  form_mode?: DirectResponseFormMode;
  messageMatchSource?: string;
  message_match_source?: string;
  adHook?: string;
  ad_hook?: string;
};

export type FunnelSection = {
  id: string;
  type: FunnelSectionType;
  variant: string;
  title: string;
  content: string[];
  visible: boolean;
  style: FunnelSectionStyle;
  media?: FunnelSectionMedia | null;
};

export type FunnelBlueprint = {
  funnel_type: FunnelType;
  headline: string;
  subheadline: string;
  cta: string;
  sections: FunnelSection[];
  form_fields: string[];
  follow_up_action: string;
  optimization_notes: string[];
  personalization_version?: "v1" | "funnel_strategy_v2";
  strategy_brief?: FunnelStrategyBriefV2;
  render_schema?: FunnelRenderV2;
  qa_result?: FunnelQaResultV2;
  fallback_used?: boolean;
} & Partial<DirectResponseFunnelMetadata>;

export type FunnelArchetypeId =
  | "local_expert_buyer"
  | "local_expert_seller"
  | "home_valuation"
  | "first_time_buyer"
  | "luxury_listing"
  | "relocation"
  | "investor_opportunity"
  | "new_construction"
  | "downsizer"
  | "move_up_buyer"
  | "expired_listing"
  | "open_house_followup"
  | "generic_buyer_seller_fallback";

export type FunnelCampaignTypeV2 =
  | "buyer"
  | "seller"
  | "both"
  | "investor"
  | "relocation"
  | "luxury"
  | "new_construction"
  | "home_valuation"
  | "first_time_buyer"
  | "downsizer"
  | "move_up_buyer"
  | "expired_listing"
  | "open_house_followup"
  | "generic";

export type FunnelStrategyBriefV2 = {
  version: "funnel_strategy_v2";
  campaign_id: string;
  workspace_id: string;
  agent: {
    name: string;
    brokerage: string;
    market: string;
    state_or_province: string;
    brand_assets_available: boolean;
  };
  white_label: {
    enabled: boolean;
    partner_name: string;
    brand_mode: "dealflow" | "partner" | "agent";
  };
  campaign: {
    type: FunnelCampaignTypeV2;
    offer: string;
    primary_goal: string;
    audience: string;
    lead_magnet: string;
    cta: string;
  };
  archetype: {
    id: FunnelArchetypeId;
    name: string;
    reason: string;
  };
  copy_direction: {
    tone: string;
    headline_angle: string;
    trust_angle: string;
    urgency_angle: string;
    objection_handling: string[];
  };
  visual_direction: {
    style: string;
    layout: string;
    color_direction: string;
    imagery_direction: string;
    brokerage_branding_mode: "none" | "subtle" | "strong" | "partner_brand" | "agent_brand";
  };
  sections: string[];
  qa_requirements: {
    must_include: string[];
    must_avoid: string[];
    compliance_notes: string[];
  };
};

export type FunnelRenderV2 = {
  version: "funnel_render_v2";
  strategy_id: string;
  campaign_id: string;
  theme: {
    mode: "dealflow" | "partner" | "agent";
    accent: string;
    typography: string;
    visualStyle: string;
  };
  sections: {
    id: string;
    type: FunnelSectionType;
    headline: string;
    subheadline: string;
    body: string;
    cta: string;
    proof_items: string[];
    visual_notes: string;
  }[];
  form: {
    fields: string[];
    cta: string;
  };
  tracking: Record<string, string | boolean>;
  compliance: {
    fairHousing: boolean;
    consentCopyRequired: boolean;
    unsupportedClaimsBlocked: boolean;
  };
  metadata: {
    archetype_id: FunnelArchetypeId;
    generated_at: string;
    fallback_used: boolean;
  };
};

export type FunnelQaResultV2 = {
  status: "pass" | "warning" | "block";
  hardFailures: string[];
  warnings: string[];
  checkedAt: string;
};

type NormalizedInput = {
  location: string;
  audience: string;
  offer: string;
  mechanism: string;
  painPoints: string[];
  marketType: FunnelMarketType;
  campaignCategory: CampaignCategory;
  funnelGoal: FunnelGoal;
};

type ParsedOffer = {
  promise: string;
  timeHorizon: string;
  outcome: string;
  audience: string;
  market: string;
  riskReversal: string;
  assetType: string;
  offerClass: "guarantee" | "investor" | "approval" | "seller" | "buyer";
};

type FunnelVariation = {
  headline: string;
  subheadline: string;
  cta: string;
  reason: string;
  score: {
    specificity: number;
    directness: number;
    promiseStrength: number;
    offerAlignment: number;
    total: number;
  };
};

type FunnelArchetypeDefinition = {
  id: FunnelArchetypeId;
  name: string;
  whenToUse: string[];
  targetAudience: string;
  headlineStyle: string;
  sectionStructure: FunnelSectionType[];
  ctaStyle: string;
  trustProofStyle: string;
  visualDirection: string;
  goodOutputExamples: string[];
  avoidExamples: string[];
  complianceConstraints: string[];
  fallbackConditions: string[];
};

const FUNNEL_TYPE_BY_GOAL: Record<FunnelGoal, FunnelType> = {
  lead_form: "landing_page_form",
  survey: "landing_page_survey",
  book_call: "landing_page_book_call",
};

const FORM_FIELDS_BY_GOAL: Record<FunnelGoal, string[]> = {
  lead_form: ["name", "phone", "email"],
  survey: ["name", "phone", "email"],
  book_call: ["name", "phone", "email"],
};

const FOLLOW_UP_ACTION_BY_GOAL: Record<FunnelGoal, FunnelBlueprint["follow_up_action"]> = {
  lead_form: "send_to_follow_up_sequence",
  survey: "show_thank_you_page",
  book_call: "redirect_to_calendar",
};

export const FUNNEL_ARCHETYPES_V2: Record<FunnelArchetypeId, FunnelArchetypeDefinition> = {
  local_expert_buyer: {
    id: "local_expert_buyer",
    name: "Local Expert Buyer",
    whenToUse: ["buyer campaigns", "market-specific buyer access", "general home search leads"],
    targetAudience: "Move-ready buyers comparing local options",
    headlineStyle: "market-specific buyer access with clear outcome",
    sectionStructure: ["hero", "trust_bar", "market_snapshot", "process", "benefits", "faq", "form", "closing_cta"],
    ctaStyle: "show matching homes or get shortlist",
    trustProofStyle: "local market filtering and fast qualification",
    visualDirection: "local neighborhood, clean listings, practical buyer path",
    goodOutputExamples: ["See Greater Austin homes that match your timing and budget"],
    avoidExamples: ["Generic dream home copy", "unsupported private inventory promises"],
    complianceConstraints: ["No steering language", "No protected-class targeting"],
    fallbackConditions: ["missing campaign type", "missing market"],
  },
  local_expert_seller: {
    id: "local_expert_seller",
    name: "Local Expert Seller",
    whenToUse: ["seller campaigns", "listing consultation", "homeowner demand capture"],
    targetAudience: "Homeowners considering selling",
    headlineStyle: "local sale clarity before listing",
    sectionStructure: ["hero", "trust_bar", "proof_metrics", "market_snapshot", "process", "objections", "faq", "form", "closing_cta"],
    ctaStyle: "get sale plan or request pricing update",
    trustProofStyle: "pricing, demand, and positioning proof",
    visualDirection: "calm seller strategy, home value, neighborhood demand",
    goodOutputExamples: ["See what serious buyers may pay for your home in this market"],
    avoidExamples: ["Guaranteed sale claims", "fake buyer demand"],
    complianceConstraints: ["No guaranteed sale unless explicitly approved", "No fake testimonials"],
    fallbackConditions: ["seller intent unclear"],
  },
  home_valuation: {
    id: "home_valuation",
    name: "Home Valuation",
    whenToUse: ["home value", "valuation", "CMA", "price check"],
    targetAudience: "Homeowners curious about current value",
    headlineStyle: "current value range and timing clarity",
    sectionStructure: ["hero", "trust_bar", "proof_metrics", "process", "faq", "form", "closing_cta"],
    ctaStyle: "check my value",
    trustProofStyle: "market signals and pricing factors",
    visualDirection: "valuation dashboard, neighborhood price cues",
    goodOutputExamples: ["Check your home's current value range before you make a move"],
    avoidExamples: ["Instant exact appraisal", "guaranteed price"],
    complianceConstraints: ["No appraisal replacement claims"],
    fallbackConditions: ["no property/market signal"],
  },
  first_time_buyer: {
    id: "first_time_buyer",
    name: "First-Time Buyer",
    whenToUse: ["first-time buyer", "approval", "credit", "starter home"],
    targetAudience: "First-time buyers who need buying-path clarity",
    headlineStyle: "qualification clarity and realistic first step",
    sectionStructure: ["hero", "trust_bar", "market_snapshot", "process", "objections", "faq", "form", "closing_cta"],
    ctaStyle: "see if you qualify",
    trustProofStyle: "budget fit and approval path",
    visualDirection: "approachable, clear steps, no pressure",
    goodOutputExamples: ["Know what you can buy before touring the wrong homes"],
    avoidExamples: ["Guaranteed approval", "credit repair promises"],
    complianceConstraints: ["No guaranteed lending outcome"],
    fallbackConditions: ["buyer offer lacks finance context"],
  },
  luxury_listing: {
    id: "luxury_listing",
    name: "Luxury Listing",
    whenToUse: ["luxury", "premium listing", "high-end property"],
    targetAudience: "Luxury buyers or sellers",
    headlineStyle: "private, selective, high-signal inventory or positioning",
    sectionStructure: ["hero", "image", "trust_bar", "proof_metrics", "process", "form", "closing_cta"],
    ctaStyle: "request private details",
    trustProofStyle: "discretion, selectivity, market expertise",
    visualDirection: "editorial luxury, restrained color, premium photography",
    goodOutputExamples: ["Request private details for select Miami luxury opportunities"],
    avoidExamples: ["Cheap urgency", "loud template copy"],
    complianceConstraints: ["No exclusionary language"],
    fallbackConditions: ["luxury signal weak"],
  },
  relocation: {
    id: "relocation",
    name: "Relocation",
    whenToUse: ["relocation", "moving to", "out of state", "new city"],
    targetAudience: "People relocating into a market",
    headlineStyle: "move plan and neighborhood clarity",
    sectionStructure: ["hero", "trust_bar", "market_snapshot", "benefits", "process", "faq", "form", "closing_cta"],
    ctaStyle: "get relocation shortlist",
    trustProofStyle: "local orientation and timing fit",
    visualDirection: "neighborhood guide, move timeline, helpful concierge",
    goodOutputExamples: ["Plan your Tampa move with a clearer shortlist"],
    avoidExamples: ["Best neighborhood for families", "protected-class steering"],
    complianceConstraints: ["No steering by protected class"],
    fallbackConditions: ["market missing"],
  },
  investor_opportunity: {
    id: "investor_opportunity",
    name: "Investor Opportunity",
    whenToUse: ["investor", "cash flow", "ROI", "rental", "deal flow"],
    targetAudience: "Real estate investors underwriting opportunities",
    headlineStyle: "numbers-first opportunity filtering",
    sectionStructure: ["hero", "proof_metrics", "market_snapshot", "process", "objections", "form", "closing_cta"],
    ctaStyle: "see matching deals",
    trustProofStyle: "underwriting criteria and deal-fit filters",
    visualDirection: "analytical deal cards, yield context, no hype",
    goodOutputExamples: ["Review Dallas deals filtered for cash-flow fit"],
    avoidExamples: ["Guaranteed ROI", "risk-free investment"],
    complianceConstraints: ["No guaranteed returns"],
    fallbackConditions: ["no investor signal"],
  },
  new_construction: {
    id: "new_construction",
    name: "New Construction",
    whenToUse: ["new construction", "pre-construction", "builder", "deposit"],
    targetAudience: "Buyers comparing new-build options",
    headlineStyle: "builder inventory and timeline clarity",
    sectionStructure: ["hero", "trust_bar", "market_snapshot", "process", "benefits", "faq", "form", "closing_cta"],
    ctaStyle: "view new-build options",
    trustProofStyle: "deposit, completion, and builder comparison",
    visualDirection: "clean builder/community visuals and timeline cues",
    goodOutputExamples: ["Compare Orlando new-build options before incentives change"],
    avoidExamples: ["Guaranteed appreciation"],
    complianceConstraints: ["No investment return promises"],
    fallbackConditions: ["new construction signal weak"],
  },
  downsizer: {
    id: "downsizer",
    name: "Downsizer",
    whenToUse: ["downsizer", "right-size", "empty nester"],
    targetAudience: "Owners planning a simpler next move",
    headlineStyle: "sell-and-buy transition clarity",
    sectionStructure: ["hero", "trust_bar", "process", "benefits", "objections", "faq", "form", "closing_cta"],
    ctaStyle: "plan my next move",
    trustProofStyle: "timing, equity, and transition clarity",
    visualDirection: "calm, refined, practical transition",
    goodOutputExamples: ["Plan a simpler Scottsdale move before listing"],
    avoidExamples: ["Age-targeting or protected-class framing"],
    complianceConstraints: ["Avoid protected-class or age-discriminatory language"],
    fallbackConditions: ["downsizer signal weak"],
  },
  move_up_buyer: {
    id: "move_up_buyer",
    name: "Move-Up Buyer",
    whenToUse: ["move-up", "bigger home", "sell and buy"],
    targetAudience: "Owners buying their next larger home",
    headlineStyle: "coordinate sell and buy without chaos",
    sectionStructure: ["hero", "trust_bar", "market_snapshot", "process", "benefits", "faq", "form", "closing_cta"],
    ctaStyle: "map my move-up plan",
    trustProofStyle: "timing and equity coordination",
    visualDirection: "next-home planning, practical upgrade path",
    goodOutputExamples: ["Map your Denver move-up plan before making an offer"],
    avoidExamples: ["Guaranteed home sale timing"],
    complianceConstraints: ["No fake guarantee"],
    fallbackConditions: ["move-up signal weak"],
  },
  expired_listing: {
    id: "expired_listing",
    name: "Expired Listing",
    whenToUse: ["expired listing", "didn't sell", "relist"],
    targetAudience: "Owners whose listing did not sell",
    headlineStyle: "diagnose why it did not sell and relaunch better",
    sectionStructure: ["hero", "proof_metrics", "market_snapshot", "process", "objections", "form", "closing_cta"],
    ctaStyle: "get relaunch plan",
    trustProofStyle: "pricing, positioning, and demand diagnosis",
    visualDirection: "diagnostic, professional, direct",
    goodOutputExamples: ["Find out why your Atlanta listing did not sell"],
    avoidExamples: ["Blaming prior agent", "guaranteed sale"],
    complianceConstraints: ["No disparagement", "No guaranteed outcome"],
    fallbackConditions: ["expired signal weak"],
  },
  open_house_followup: {
    id: "open_house_followup",
    name: "Open House Follow-Up",
    whenToUse: ["open house", "event follow-up", "visitor"],
    targetAudience: "Open house visitors and warm prospects",
    headlineStyle: "specific follow-up and next-best option",
    sectionStructure: ["hero", "trust_bar", "process", "benefits", "form", "closing_cta"],
    ctaStyle: "get the follow-up list",
    trustProofStyle: "property fit and next-step clarity",
    visualDirection: "warm follow-up, property recap, simple CTA",
    goodOutputExamples: ["Get the Charlotte open-house follow-up and matching options"],
    avoidExamples: ["Cold traffic scare tactics"],
    complianceConstraints: ["No misleading scarcity"],
    fallbackConditions: ["event context missing"],
  },
  generic_buyer_seller_fallback: {
    id: "generic_buyer_seller_fallback",
    name: "Generic Buyer/Seller Fallback",
    whenToUse: ["missing data", "unclear campaign type"],
    targetAudience: "Qualified local prospects",
    headlineStyle: "clear local next step",
    sectionStructure: ["hero", "trust_bar", "process", "benefits", "faq", "form", "closing_cta"],
    ctaStyle: "request details",
    trustProofStyle: "local clarity and fast follow-up",
    visualDirection: "neutral, clean, non-branded",
    goodOutputExamples: ["See the best next step for your local move"],
    avoidExamples: ["Generic futuristic SaaS copy"],
    complianceConstraints: ["No fake claims", "No protected-class language"],
    fallbackConditions: ["strategy input insufficient"],
  },
};

function safeText(input: any): string {
  if (input === null || input === undefined) {
    return "";
  }

  if (typeof input !== "string") {
    return String(input);
  }

  return input.trim();
}

function normalizeText(input?: string): string {
  return safeText(input);
}

const safeArray = (arr: any[]) =>
  Array.isArray(arr) ? arr.map(safeText).filter(Boolean) : [];

import { debugLog } from "@/lib/debug";

function normalizeInput(input?: FunnelEngineInput | null): NormalizedInput {
  const raw = input || {};

  if (process.env.NODE_ENV !== "production") {
    const invalidInput =
      !input ||
      typeof raw.location !== "string" ||
      typeof raw.audience !== "string" ||
      typeof raw.offer !== "string";

    if (invalidInput) {
      debugLog("invalid-funnel-input", raw as Record<string, unknown>);
    }
  }

  const location = normalizeText(raw.location) || "your market";
  const audience = normalizeText(raw.audience) || "qualified local prospects";
  const offer = normalizeText(raw.key_offer) || normalizeText(raw.offer) || "a clearer next step";
  const mechanism = normalizeText(raw.mechanism);
  const painPoints = safeArray(raw.pain_points ?? []);
  const category = inferFunnelCampaignCategory({
    marketType: raw.market_type ?? "buyer",
    audience,
    offer,
    mechanism,
    painPoints,
  });

  return {
    location,
    audience,
    offer,
    mechanism,
    painPoints,
    marketType: raw.market_type ?? "buyer",
    campaignCategory: category,
    funnelGoal: raw.funnel_goal ?? "survey",
  };
}

function inferFunnelCampaignCategory(input: {
  marketType: FunnelMarketType;
  audience: string;
  offer: string;
  mechanism: string;
  painPoints: string[];
}): CampaignCategory {
  const haystack = [
    input.marketType,
    input.audience,
    input.offer,
    input.mechanism,
    ...input.painPoints,
  ]
    .join(" ")
    .toLowerCase();

  if (/pre[- ]?con|new build|construction|deposit|completion|assignment/.test(haystack)) {
    return "precon";
  }

  if (/luxury|private|rare|penthouse|high[- ]?net|exclusive|curated/.test(haystack)) {
    return "luxury";
  }

  if (input.marketType === "seller" || /seller|homeowner|home value|sell|listing/.test(haystack)) {
    return "seller";
  }

  if (input.marketType === "commercial" || /commercial|office|retail|industrial|warehouse|mixed[- ]use|tenant|lease|owner[- ]user/.test(haystack)) {
    return "commercial";
  }

  if (input.marketType === "investor" || /invest|roi|yield|cash[- ]?flow|rental|off[- ]market deal/.test(haystack)) {
    return "investor";
  }

  return "buyer";
}

function trimWords(value: string, maxWords: number) {
  const words = safeText(value).split(/\s+/).filter(Boolean);

  if (words.length <= maxWords) {
    return words.join(" ");
  }

  return words.slice(0, maxWords).join(" ");
}

function cleanMarketingCopy(value: string) {
  return safeText(value)
    .replace(/\s+/g, " ")
    .replace(/\$\s*([0-9]+)\s*k/gi, "$$$1k")
    .replace(/([0-9])\s+k\b/gi, "$1k")
    .replace(/\btoronto,\s*on\s+in\s+toronto,\s*on\b/gi, "Toronto, ON")
    .replace(/\bpayment comparison overlay\b/gi, "budget comparison")
    .replace(/\bbetter houses options\b/gi, "better home options")
    .trim();
}

function conciseOfferPhrase(offer: string) {
  return trimWords(
    cleanMarketingCopy(offer)
      .replace(/^get\s+/i, "")
      .replace(/^free\s+/i, "")
      .replace(/[.!?]+$/g, ""),
    7,
  );
}

function uniqueFragments(parts: string[]) {
  const seen = new Set<string>();

  return parts.filter((part) => {
    const normalized = safeText(part).toLowerCase();

    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function toConceptPhrase(value: string) {
  const normalized = safeText(value).toLowerCase();

  if (!normalized) {
    return "";
  }

  if (/guaranteed cashflow/.test(normalized)) {
    return "properties that deliver guaranteed cashflow";
  }

  if (/off[- ]market/.test(normalized)) {
    return "off-market properties before they hit the wider market";
  }

  if (/cash offer/.test(normalized)) {
    return "a direct cash offer without the usual delays";
  }

  if (/home value|valuation/.test(normalized)) {
    return "a clear home value picture before you make your next move";
  }

  if (/under\s*\$|under\s*\d/.test(normalized)) {
    return safeText(value).toLowerCase().startsWith("homes")
      ? normalized
      : `homes ${normalized}`;
  }

  if (/access|get|see|find/.test(normalized)) {
    return normalized;
  }

  return `access to ${normalized}`;
}

function includesOfferConcept(headline: string, offer: string) {
  const normalizedHeadline = safeText(headline).toLowerCase();
  const offerTokens = safeText(offer)
    .toLowerCase()
    .split(/[^a-z0-9$]+/i)
    .filter((token) => token.length > 3);

  if (!normalizedHeadline || offerTokens.length === 0) {
    return true;
  }

  return offerTokens.some((token) => normalizedHeadline.includes(token));
}

function sentence(value: string) {
  const normalized = safeText(value).replace(/[.!?]+$/, "");
  return normalized ? `${normalized}.` : "";
}

function parseOffer(input: NormalizedInput): ParsedOffer {
  const offer = safeText(input.offer);
  const normalized = offer.toLowerCase();
  const extracted = extractOfferData(offer);
  const timeHorizon = safeText(extracted.timeline);
  const audience = safeText(extracted.audience) || safeText(input.audience);
  const market = safeText(input.location);
  const riskReversal =
    extracted.hasGuarantee && input.marketType === "seller"
      ? "If it does not sell, you do not pay"
      : extracted.hasGuarantee
        ? "We do the filtering so you do not waste months on weak deals"
        : "";
  const assetType =
    /condo|property|properties|home|homes|rental|deal|deals/i.exec(normalized)?.[0] || "property";

  if (input.marketType === "investor" || /cash ?flow|off-market|investor/.test(normalized)) {
    return {
      promise: extracted.hasGuarantee
        ? `We guarantee you a cash-flow positive ${assetType}`
        : `Get access to ${assetType} opportunities built for cash flow`,
      timeHorizon,
      outcome: /cash ?flow/.test(normalized) ? "cash-flow positive property" : "stronger investor-grade opportunities",
      audience,
      market,
      riskReversal,
      assetType,
      offerClass: "investor",
    };
  }

  if (/approv|credit|mortgage/.test(normalized)) {
    return {
      promise: enhanceOffer(offer, "buyer") || `Get approved faster in ${market}`,
      timeHorizon,
      outcome: extracted.creditScore ? `approval with a ${extracted.creditScore}+ credit score` : "faster approval",
      audience,
      market,
      riskReversal: riskReversal || "No downside if your profile does not qualify",
      assetType,
      offerClass: "approval",
    };
  }

  if (input.marketType === "seller" || /sell|buyer network|home sold|homeowners?/.test(normalized)) {
    return {
      promise: enhanceOffer(offer, "seller") || `Sell your home faster in ${market}`,
      timeHorizon,
      outcome: timeHorizon ? `sell in ${timeHorizon}` : "sell faster",
      audience,
      market,
      riskReversal,
      assetType: /home|property/i.exec(normalized)?.[0] || "home",
      offerClass: extracted.hasGuarantee ? "guarantee" : "seller",
    };
  }

  return {
    promise: enhanceOffer(offer, "buyer") || `Access stronger opportunities in ${market}`,
    timeHorizon,
    outcome: /off-market/.test(normalized) ? "off-market access" : "better-fit properties",
    audience,
    market,
    riskReversal,
    assetType,
    offerClass: extracted.hasGuarantee ? "guarantee" : "buyer",
  };
}

function buildHeadlineVariations(input: NormalizedInput, parsed: ParsedOffer) {
  const market = parsed.market || input.location;
  const time = parsed.timeHorizon;
  const offer = conciseOfferPhrase(input.offer || parsed.promise);

  if (parsed.offerClass === "investor") {
    return uniqueFragments([
      time ? `Review cash-flow opportunities before the next ${time}` : "",
      "Find investor opportunities with clearer numbers",
      `${market} deal flow filtered around ${offer}`,
      "See value-add options before weak deals waste your time",
    ]).map((text) => trimWords(cleanMarketingCopy(text), 12));
  }

  if (parsed.offerClass === "approval") {
    return uniqueFragments([
      "Know your buying path before touring homes",
      "Find homes that fit your approval path",
      `${market} buyers can start with clarity`,
    ]).map((text) => trimWords(cleanMarketingCopy(text), 12));
  }

  if (parsed.offerClass === "guarantee" || parsed.offerClass === "seller") {
    return uniqueFragments([
      /value|worth|valuation/i.test(input.offer)
        ? "See what your home could sell for"
        : "Build a stronger sale plan before listing",
      time ? `Plan your ${market} sale before the next ${time}` : "",
      "Understand buyer demand before you list",
    ]).map((text) => trimWords(cleanMarketingCopy(text), 12));
  }

  if (input.campaignCategory === "commercial") {
    return uniqueFragments([
      "Find commercial spaces that fit your next move",
      `${market} options shaped around ${offer}`,
      "Compare lease and purchase paths before touring",
    ]).map((text) => trimWords(cleanMarketingCopy(text), 12));
  }

  return uniqueFragments([
    /listing|shortlist|home|buyer/i.test(input.offer)
      ? `Get a ${market} home shortlist built around your budget`
      : "See better-fit homes before wasting weekends",
    `Private access to better-fit ${parsed.assetType}`,
    "Find homes that match your next move",
  ]).map((text) => trimWords(cleanMarketingCopy(text), 12));
}

function buildSubheadlineVariations(input: NormalizedInput, parsed: ParsedOffer) {
  const market = parsed.market || input.location;
  const audience = parsed.audience || input.audience;
  const mechanism = safeText(input.mechanism);

  if (parsed.offerClass === "investor") {
    return uniqueFragments([
      `Our team sources and filters investor-grade opportunities in ${market} so ${audience || "investors"} can lock in stronger cash flow without wasting months chasing the wrong deals.`,
      `${mechanism ? sentence(mechanism).replace(/\.$/, "") : "We source and filter investor-grade opportunities"} in ${market} so you can move on properties that are built for cash flow, not just hype.`,
      `We screen ${parsed.assetType} opportunities for cash flow, risk, and speed in ${market} so you see better deals before they get picked over.`,
    ]);
  }

  if (parsed.offerClass === "approval") {
    return uniqueFragments([
      `We show ${audience || "buyers"} in ${market} approval-friendly options and financing angles so you can move faster with less friction.`,
      `${mechanism ? sentence(mechanism).replace(/\.$/, "") : "We match you with approval-friendly opportunities"} in ${market} so the right listings and the right path show up together.`,
      `Our process filters out weak-fit listings and surfaces homes you can actually move on in ${market}.`,
    ]);
  }

  if (parsed.offerClass === "guarantee" || parsed.offerClass === "seller") {
    return uniqueFragments([
      `We position your ${parsed.assetType} in front of qualified buyers in ${market} so you can move faster without wasting time on weak interest.`,
      `${mechanism ? sentence(mechanism).replace(/\.$/, "") : "We connect your listing directly with serious demand"} in ${market} so the path to sold is faster and clearer.`,
      `Our team handles the pricing, positioning, and buyer reach needed to turn a strong promise into a real sale outcome in ${market}.`,
    ]);
  }

  return uniqueFragments([
    `We build a tighter inbound path to stronger-fit ${parsed.assetType} in ${market} so ${audience || "buyers"} can move before the best options disappear.`,
    `${mechanism ? sentence(mechanism).replace(/\.$/, "") : "We narrow the market around your offer"} so qualified calls and better-fit inventory show up faster in ${market}.`,
    `Our process is built to surface the right inventory and book the right next step in ${market}, not send you into the same public scramble as everyone else.`,
  ]);
}

function buildCtaVariations(input: NormalizedInput, parsed: ParsedOffer) {
  if (parsed.offerClass === "approval") {
    return ["See If You Qualify", "Check Available Homes", "Get My Approval Options"];
  }

  const ctas = getCategoryCtaOptions(input.campaignCategory);
  const primary = selectMediaBuyerCta(input.campaignCategory);

  return uniqueFragments([
    primary,
    ...ctas,
    input.campaignCategory === "buyer" ? "See Homes That Match" : "",
    input.campaignCategory === "precon" ? "Get The List" : "",
  ]);
}

function scoreFunnelVariation(variation: Omit<FunnelVariation, "score">, input: NormalizedInput, parsed: ParsedOffer): FunnelVariation {
  const combined = `${variation.headline} ${variation.subheadline} ${variation.cta}`.toLowerCase();
  let specificity = 4;
  let directness = 4;
  let promiseStrength = 4;
  let offerAlignment = 4;

  if (combined.includes((parsed.market || input.location).toLowerCase())) specificity += 2;
  if (parsed.timeHorizon && combined.includes(parsed.timeHorizon.toLowerCase())) specificity += 2;
  if (/cash ?flow|off-market|approved|credit|sell|buyers|investor/.test(combined)) specificity += 2;

  if (/we guarantee|get|see|access|qualify|sell/.test(combined)) directness += 3;
  if (variation.cta.length <= 22) directness += 1;

  if (/guarantee|cash-flow positive|approved|off-market/.test(combined)) promiseStrength += 3;
  if (parsed.riskReversal && combined.includes(parsed.riskReversal.toLowerCase().split(" ")[0] || "")) promiseStrength += 1;

  const offerTokens = safeText(input.offer).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3);
  const matchedTokens = offerTokens.filter((token) => combined.includes(token)).length;
  offerAlignment += Math.min(4, matchedTokens);

  if (/get approved faster/.test(variation.subheadline.toLowerCase()) && parsed.offerClass === "investor") offerAlignment -= 4;
  if (!includesOfferConcept(`${variation.headline} ${variation.subheadline} ${variation.cta}`, input.offer)) offerAlignment -= 1;
  if (/get access/.test(variation.cta.toLowerCase()) && parsed.offerClass === "guarantee") offerAlignment -= 1;

  const total = specificity + directness + promiseStrength + offerAlignment;

  return {
    ...variation,
    score: {
      specificity,
      directness,
      promiseStrength,
      offerAlignment,
      total,
    },
  };
}

function pickBestFunnelVariation(input: NormalizedInput) {
  const parsed = parseOffer(input);
  const headlines = buildHeadlineVariations(input, parsed);
  const subheadlines = buildSubheadlineVariations(input, parsed);
  const ctas = buildCtaVariations(input, parsed);

  const variations = headlines.flatMap((headline, index) =>
    subheadlines.slice(0, 3).map((subheadline, subIndex) =>
      scoreFunnelVariation(
        {
          headline,
          subheadline,
          cta: ctas[Math.min(index + subIndex, ctas.length - 1)] || ctas[0] || "See Homes That Match",
          reason: "Selected because it leads with the strongest direct promise and keeps the offer aligned through the CTA.",
        },
        input,
        parsed,
      ),
    ),
  );

  return variations
    .filter((variation) => variation.score.offerAlignment > 1)
    .sort((left, right) => right.score.total - left.score.total)[0];
}

function buildBenefits(input: NormalizedInput) {
  if (input.marketType === "seller") {
    return [
      "Get a pricing and positioning plan built for the current market",
      "See how qualified buyer demand is likely to respond before listing",
      "Avoid weak listing strategy, stale pricing, and wasted time",
      "Move toward a cleaner sale without guessing the next step",
    ];
  }

  if (input.marketType === "investor") {
    return [
      "See investor-grade opportunities filtered for speed, fit, and upside",
      "Avoid wasting time on overexposed deals that look better than they perform",
      "Move on cash-flow opportunities faster with a tighter acquisition path",
      "Keep your pipeline focused on properties worth underwriting",
    ];
  }

  if (input.marketType === "approval" || input.marketType === "refinance") {
    return [
      "See the path to qualification more clearly before you waste time on the wrong listings",
      "Move faster with approval-aware positioning and cleaner next steps",
      "Reduce uncertainty around credit, financing, and timing",
      "Turn early interest into a realistic buying plan",
    ];
  }

  return [
    "See stronger-fit homes and opportunities without sorting through the wrong inventory",
    "Move faster in your market with a cleaner first step and less friction",
    "Get clearer visibility into what actually fits your goals and budget",
    "Turn interest into action before the best options disappear",
  ];
}

function buildProcess(input: NormalizedInput) {
  if (input.funnelGoal === "book_call") {
    return [
      "Review the offer and confirm the right fit",
      "See the mechanism and proof before committing to a call",
      "Choose a time only after the offer makes sense",
    ];
  }

  if (input.funnelGoal === "lead_form") {
    return [
      "Submit your details",
      "Get the next available options or plan",
      "Move forward when the timing is right",
    ];
  }

  return [
    "Answer a few short qualification questions",
    "See the strongest next step based on your goals",
    "Expect a fast follow-up if the fit is clear",
  ];
}

function buildFaq(input: NormalizedInput) {
  if (input.marketType === "seller") {
    return [
      "There is no commitment required to request a pricing and sale plan.",
      "You can review your options before deciding whether to list.",
      "The process is designed to be fast, clear, and low friction.",
    ];
  }

  if (input.marketType === "investor") {
    return [
      "You can review opportunities before making a buying commitment.",
      "Deal flow is filtered to reduce noise, not overwhelm you with listings.",
      "The process is designed to help you move faster on the right properties.",
    ];
  }

  return [
    "There is no cost to review your options.",
    "You can check fit before making a bigger commitment.",
    "The form is intentionally short so you can get answers faster.",
  ];
}

function buildSocialProof(input: NormalizedInput) {
  void input;
  return safeArray([]);
}

function buildOptimizationNotes(input: NormalizedInput) {
  const notes = [
    "Keep the first CTA and first trust signal above the fold on mobile",
    "Use concise, low-reading-level copy for cold traffic",
    "Keep the form short and move friction below proof sections",
  ];

  if (input.funnelGoal === "lead_form") {
    notes.push("If lead quality is poor, switch to survey flow");
  } else if (input.funnelGoal === "survey") {
    notes.push("If completion rate drops, remove one qualification field");
  } else {
    notes.push("If booking rate is low, test a softer pre-call CTA");
  }

  return safeArray(notes);
}

function buildTrustBar(input: NormalizedInput, parsed: ParsedOffer) {
  const base = [
    `Focused on ${input.location}`,
    input.marketType === "seller"
      ? "Pricing and demand clarity"
      : input.marketType === "investor"
        ? "Investor-grade filtering"
        : "Fast qualification path",
  ];

  if (parsed.timeHorizon) {
    base.push(`${parsed.timeHorizon} offer window`);
  }

  if (parsed.riskReversal) {
    base.push(parsed.riskReversal);
  }

  return uniqueFragments(base).slice(0, 4);
}

function buildProofMetrics(input: NormalizedInput, parsed: ParsedOffer) {
  const proof = [
    parsed.timeHorizon ? `${parsed.timeHorizon} timing context` : "",
    parsed.riskReversal || (input.campaignCategory === "seller" ? "No-obligation price update" : ""),
    input.campaignCategory === "investor"
      ? "ROI and deal-fit filtering"
      : input.campaignCategory === "precon"
        ? "Deposit and completion timeline"
        : input.campaignCategory === "buyer"
          ? "Early-access inventory path"
          : input.campaignCategory === "luxury"
            ? "Private-access availability"
            : "Demand and pricing clarity",
  ];

  return uniqueFragments(proof).slice(0, 4);
}

function buildObjections(input: NormalizedInput, parsed: ParsedOffer) {
  if (input.marketType === "seller") {
    return [
      "Not sure if now is the right time to list? Start with the plan, not the commitment.",
      "Worried about pricing wrong? The page frames the next step around clarity before action.",
      "Do not want to waste time with weak demand? The promise centers on qualified buyer intent.",
    ];
  }

  if (input.marketType === "investor") {
    return [
      "Concerned the best deals are already gone? The angle is built around seeing stronger opportunities faster.",
      "Tired of noisy listings that do not pencil? The mechanism emphasizes filtering before follow-up.",
      parsed.timeHorizon
        ? `Need a clear acquisition window? The offer keeps the timeline explicit at ${parsed.timeHorizon}.`
        : "Need cleaner underwriting opportunities? The page keeps the offer tied to deal quality, not hype.",
    ];
  }

  if (parsed.offerClass === "approval") {
    return [
      "Not sure you qualify yet? The page lowers friction and keeps the path clear.",
      "Afraid of wasting time on the wrong listings? The message stays tied to approval fit.",
      "Do not want to fill out a huge form? The first step stays short.",
    ];
  }

  return [
    "Not sure which homes actually fit? The page narrows the next step instead of overwhelming you.",
    "Worried about missing the best options? The offer keeps speed and fit front and center.",
    "Do not want a complicated process? The CTA is designed to move you forward with minimal friction.",
  ];
}

function buildMarketSnapshot(input: NormalizedInput, parsed: ParsedOffer) {
  const tension =
    input.painPoints[0] ||
    (input.campaignCategory === "seller"
      ? "pricing wrong before listing"
      : input.campaignCategory === "investor"
        ? "underwriting the wrong deals"
        : input.campaignCategory === "precon"
          ? "waiting until future pricing moves"
          : input.campaignCategory === "luxury"
            ? "seeing rare inventory too late"
            : "missing the best-fit option before it goes public");

  return [
    `Problem: ${tension}`,
    `Mechanism: ${input.mechanism || "filtered access process"}`,
    parsed.riskReversal ? `Risk reversal: ${parsed.riskReversal}` : `Low-friction next step: ${selectMediaBuyerCta(input.campaignCategory)}`,
  ];
}

function createSection(
  type: FunnelSectionType,
  title: string,
  content: string[],
  options?: {
    variant?: string;
    visible?: boolean;
    style?: Partial<FunnelSectionStyle>;
    media?: FunnelSectionMedia | null;
  },
): FunnelSection {
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 10)}`,
    type,
    variant: options?.variant || "default",
    title: safeText(title),
    content: safeArray(content),
    visible: options?.visible ?? true,
    style: {
      spacing: options?.style?.spacing || (type === "hero" ? "spacious" : "comfortable"),
      width: options?.style?.width || (type === "hero" ? "content" : "full"),
      align: options?.style?.align || (type === "hero" ? "left" : "left"),
      theme:
        options?.style?.theme ||
        (type === "hero" || type === "form" || type === "closing_cta" ? "dark" : "light"),
    },
    media: options?.media ?? null,
  };
}

function buildSections(input: NormalizedInput, parsed: ParsedOffer, headline: string, subheadline: string, cta: string) {
  const benefits = buildBenefits(input);
  const process = buildProcess(input);
  const faq = buildFaq(input);
  const trustBar = buildTrustBar(input, parsed);
  const proofMetrics = buildProofMetrics(input, parsed);
  const objections = buildObjections(input, parsed);
  const snapshot = buildMarketSnapshot(input, parsed);
  const formTitle =
    input.funnelGoal === "book_call"
      ? "Book your next step"
      : input.marketType === "seller"
        ? "Get your sale plan"
        : input.marketType === "investor"
          ? "See available opportunities"
          : "See homes that match";

  return [
    createSection("hero", headline, [subheadline, `Primary CTA: ${cta}`], {
      variant: "offer-led",
      style: { spacing: "spacious", width: "content", align: "left", theme: "dark" },
    }),
    createSection("trust_bar", "Why this page is worth your attention", trustBar, {
      variant: "signal-strip",
      style: { spacing: "compact", width: "full", align: "left", theme: "accent" },
    }),
    createSection("proof_metrics", "Proof before commitment", proofMetrics, {
      variant: "metrics-strip",
      style: { spacing: "compact", width: "full", align: "left", theme: "accent" },
    }),
    createSection(
      "market_snapshot",
      input.marketType === "seller"
        ? "The problem this solves"
        : input.marketType === "investor"
          ? "Why generic deal flow breaks down"
          : "Why the normal search path creates friction",
      snapshot,
      {
        variant: "problem-brief",
        style: { spacing: "comfortable", width: "full", align: "left", theme: "light" },
      },
    ),
    createSection("process", "How the mechanism works", process, {
      variant: "mechanism-steps",
      style: { spacing: "comfortable", width: "content", align: "left", theme: "light" },
    }),
    createSection(
      "benefits",
      input.marketType === "seller"
        ? "What you get from this process"
        : input.marketType === "investor"
          ? "What makes this better than generic deal flow"
          : "What you get from this next step",
      benefits,
      {
        variant: "stacked-cards",
        style: { spacing: "comfortable", width: "full", align: "left", theme: "light" },
      },
    ),
    createSection("objections", "Offer and risk reversal", objections, {
      variant: "risk-reversal",
      style: { spacing: "comfortable", width: "content", align: "left", theme: "light" },
    }),
    createSection(
      "vsl",
      input.marketType === "investor" ? "Deal breakdown video" : "Watch the quick breakdown",
      [
        input.marketType === "seller"
          ? "Use this section for a short seller explanation or listing strategy breakdown."
        : input.marketType === "investor"
          ? "Use this section for a short underwriting or opportunity breakdown."
            : "Use this section for a short walkthrough, proof breakdown, or opportunity explanation.",
      ],
      {
        variant: "embedded-video",
        visible: false,
        style: { spacing: "comfortable", width: "content", align: "center", theme: "dark" },
        media: {
          kind: "video",
          label: "VSL Placeholder",
          caption: "Drop in a Loom, YouTube, Vimeo, or hosted explainer video.",
        },
      },
    ),
    createSection(
      "image",
      "Visual proof",
      [
        input.marketType === "seller"
          ? "Use this block for neighborhood visuals, demand proof, or before-and-after value visuals."
          : input.marketType === "investor"
            ? "Use this block for property photos, deal snapshots, or underwriting visuals."
            : "Use this block for listing photos, neighborhood shots, or branded imagery.",
      ],
      {
        variant: "image-feature",
        visible: false,
        style: { spacing: "comfortable", width: "content", align: "center", theme: "light" },
        media: {
          kind: "image",
          label: "Image Placeholder",
          caption: "Add listing photos, team imagery, or market visuals here.",
        },
      },
    ),
    createSection("faq", "Questions prospects ask before converting", faq, {
      variant: "accordion",
      style: { spacing: "comfortable", width: "content", align: "left", theme: "light" },
    }),
    createSection(
      "form",
      formTitle,
      [
        input.funnelGoal === "book_call"
          ? "Collect only the details needed to confirm fit and a preferred time."
          : "Use a short form to capture intent without overwhelming cold traffic.",
        input.funnelGoal === "book_call"
          ? "After you submit, you can choose a time if the offer is a fit."
          : "After you submit, expect a call or text in 5-15 minutes when the team is available.",
        `Primary CTA: ${cta}`,
      ],
      {
        variant: "capture-card",
        style: { spacing: "comfortable", width: "content", align: "left", theme: "dark" },
      },
    ),
    createSection("closing_cta", "Ready for the next step?", [subheadline, `Primary CTA: ${cta}`], {
      variant: "final-push",
      style: { spacing: "spacious", width: "content", align: "left", theme: "accent" },
    }),
  ];
}

function getFunnelPersonalizationV2Enabled() {
  return process.env.FUNNEL_PERSONALIZATION_V2 === "true";
}

function inferCampaignTypeV2(input: NormalizedInput, raw: FunnelEngineInput): FunnelCampaignTypeV2 {
  const haystack = [
    raw.market_type,
    raw.audienceType,
    raw.audience_type,
    raw.offerType,
    raw.offer_type,
    raw.funnelVariant,
    raw.funnel_variant,
    raw.headline,
    raw.subheadline,
    input.audience,
    input.offer,
    input.mechanism,
    ...input.painPoints,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/expired|relist|didn'?t sell|withdrawn/.test(haystack)) return "expired_listing";
  if (/open house|event follow[- ]?up|visitor/.test(haystack)) return "open_house_followup";
  if (/first[- ]?time|starter home|approval|credit|see if you qualify|pre[- ]?qualif|mortgage qualif/.test(haystack)) return "first_time_buyer";
  if (/home value|valuation|cma|price update|what.*worth/.test(haystack)) return "home_valuation";
  if (/\bluxury\b|luxury listing|estate home|premium listing|private listing|high[- ]end|waterfront|penthouse/.test(haystack)) return "luxury";
  if (/relocat|moving to|out of state|new city/.test(haystack)) return "relocation";
  if (/new construction|pre[- ]?construction|builder|new build|deposit|completion/.test(haystack)) return "new_construction";
  if (/downsizer|right[- ]?size|empty nester|simpler next move/.test(haystack)) return "downsizer";
  if (/move[- ]?up|bigger home|upgrade|sell and buy/.test(haystack)) return "move_up_buyer";
  if (/invest|cash[- ]?flow|roi|rental|deal flow|cap rate/.test(haystack) || input.marketType === "investor") return "investor";
  if (/seller|homeowner|sell|listing/.test(haystack) || input.marketType === "seller") return "seller";
  if (/buyer|homes|listings|inventory|shortlist/.test(haystack) || input.marketType === "buyer") return "buyer";

  return "generic";
}

function selectFunnelArchetypeV2(
  input: NormalizedInput,
  raw: FunnelEngineInput,
): { archetype: FunnelArchetypeDefinition; campaignType: FunnelCampaignTypeV2; reason: string } {
  const campaignType = inferCampaignTypeV2(input, raw);
  const map: Record<FunnelCampaignTypeV2, FunnelArchetypeId> = {
    buyer: "local_expert_buyer",
    seller: "local_expert_seller",
    both: "generic_buyer_seller_fallback",
    investor: "investor_opportunity",
    relocation: "relocation",
    luxury: "luxury_listing",
    new_construction: "new_construction",
    home_valuation: "home_valuation",
    first_time_buyer: "first_time_buyer",
    downsizer: "downsizer",
    move_up_buyer: "move_up_buyer",
    expired_listing: "expired_listing",
    open_house_followup: "open_house_followup",
    generic: "generic_buyer_seller_fallback",
  };
  const id = map[campaignType] || "generic_buyer_seller_fallback";

  return {
    archetype: FUNNEL_ARCHETYPES_V2[id],
    campaignType,
    reason: `${FUNNEL_ARCHETYPES_V2[id].name} selected from campaign type "${campaignType}", market "${input.location}", and offer "${input.offer}".`,
  };
}

function stateOrProvinceFromLocation(location: string) {
  const parts = safeText(location).split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function buildFunnelStrategyBriefV2(
  raw: FunnelEngineInput,
  input: NormalizedInput,
  selected: ReturnType<typeof selectFunnelArchetypeV2>,
): FunnelStrategyBriefV2 {
  const agentName = safeText(raw.agentName) || safeText(raw.agent_name);
  const brokerage = safeText(raw.brokerage);
  const partnerName = safeText(raw.partnerName) || safeText(raw.partner_name);
  const brandMode = raw.brandMode || raw.brand_mode || (partnerName ? "partner" : brokerage || agentName ? "agent" : "dealflow");
  const parsed = parseOffer(input);
  const cta =
    safeText(raw.primaryCTA) ||
    safeText(raw.primary_cta) ||
    (selected.campaignType === "home_valuation"
      ? "Check My Value"
      : selected.campaignType === "seller"
        ? "Get My Sale Plan"
        : selected.campaignType === "investor"
          ? "See Matching Deals"
          : selected.campaignType === "relocation"
            ? "Get My Shortlist"
            : selectMediaBuyerCta(input.campaignCategory));

  return {
    version: "funnel_strategy_v2",
    campaign_id: safeText((raw as any).campaign_id) || safeText((raw as any).campaignId),
    workspace_id: safeText((raw as any).workspace_id) || safeText((raw as any).workspaceId),
    agent: {
      name: agentName,
      brokerage,
      market: input.location,
      state_or_province: stateOrProvinceFromLocation(input.location),
      brand_assets_available: Boolean(brokerage || agentName || partnerName),
    },
    white_label: {
      enabled: Boolean(raw.whiteLabelEnabled || raw.white_label_enabled || partnerName),
      partner_name: partnerName,
      brand_mode: brandMode,
    },
    campaign: {
      type: selected.campaignType,
      offer: input.offer,
      primary_goal: input.funnelGoal,
      audience: input.audience,
      lead_magnet: safeText(raw.leadMagnetTitle) || safeText(raw.lead_magnet_title) || conciseOfferPhrase(input.offer),
      cta,
    },
    archetype: {
      id: selected.archetype.id,
      name: selected.archetype.name,
      reason: selected.reason,
    },
    copy_direction: {
      tone:
        selected.campaignType === "luxury"
          ? "restrained, premium, direct"
          : selected.campaignType === "investor"
            ? "analytical, specific, no-hype"
            : "clear, local, practical",
      headline_angle: selected.archetype.headlineStyle,
      trust_angle: selected.archetype.trustProofStyle,
      urgency_angle: parsed.timeHorizon || "current market timing without fake scarcity",
      objection_handling: buildObjections(input, parsed).slice(0, 3),
    },
    visual_direction: {
      style: selected.archetype.visualDirection,
      layout: selected.archetype.sectionStructure.join(" -> "),
      color_direction:
        brandMode === "partner"
          ? "partner brand colors with DealFlow readability constraints"
          : brokerage
            ? "brokerage-aware accenting without copying trademarked assets unless provided"
            : "DealFlow default contrast with local imagery",
      imagery_direction: selected.archetype.visualDirection,
      brokerage_branding_mode: brandMode === "partner" ? "partner_brand" : brokerage ? "subtle" : "none",
    },
    sections: selected.archetype.sectionStructure,
    qa_requirements: {
      must_include: [
        input.location,
        input.offer,
        input.audience,
        cta,
        selected.archetype.name,
      ].filter(Boolean),
      must_avoid: selected.archetype.avoidExamples,
      compliance_notes: selected.archetype.complianceConstraints,
    },
  };
}

function sectionCopyForV2(
  type: FunnelSectionType,
  strategy: FunnelStrategyBriefV2,
  input: NormalizedInput,
  parsed: ParsedOffer,
): FunnelRenderV2["sections"][number] {
  const market = strategy.agent.market || input.location;
  const offer = strategy.campaign.offer || input.offer;
  const audience = strategy.campaign.audience || input.audience;
  const cta = strategy.campaign.cta;
  const brokeragePrefix = strategy.agent.brokerage ? `${strategy.agent.brokerage} context: ` : "";
  const archetype = strategy.archetype.name;

  const copyByType: Record<FunnelSectionType, { headline: string; body: string; proof: string[]; notes: string }> = {
    hero: {
      headline:
        strategy.campaign.type === "seller"
          ? `${market} homeowners can get a clearer sale plan`
          : strategy.campaign.type === "home_valuation"
            ? `Check your ${market} home value before you decide`
            : strategy.campaign.type === "investor"
              ? `${market} investment opportunities filtered for fit`
              : strategy.campaign.type === "luxury"
                ? `Private ${market} opportunities with a sharper next step`
                : `${market} ${archetype.replace(/local expert /i, "").toLowerCase()} campaign built around ${conciseOfferPhrase(offer)}`,
      body: `${brokeragePrefix}${audience} get a focused path around ${conciseOfferPhrase(offer)} without a generic landing page or vague follow-up.`,
      proof: buildTrustBar(input, parsed).slice(0, 3),
      notes: "Above-fold message must mirror campaign offer, audience, market, and CTA.",
    },
    trust_bar: {
      headline: `Why this ${market} page is different`,
      body: `The page leads with ${strategy.copy_direction.headline_angle}, then supports the offer with ${strategy.copy_direction.trust_angle}.`,
      proof: buildTrustBar(input, parsed),
      notes: "Short credibility strip below hero.",
    },
    benefits: {
      headline: "What prospects get from this next step",
      body: buildBenefits(input).join(" "),
      proof: buildBenefits(input).slice(0, 3),
      notes: "Benefit cards stay concrete and market-specific.",
    },
    proof_metrics: {
      headline: "Proof before commitment",
      body: `Use concrete market signals, fit filters, and process clarity before asking ${audience} to submit the form.`,
      proof: buildProofMetrics(input, parsed),
      notes: "Avoid fake metrics; proof items are qualitative unless supplied.",
    },
    social_proof: {
      headline: "Local context that builds confidence",
      body: `${market} context and a clear follow-up path make the offer feel specific without inventing testimonials.`,
      proof: [`Focused on ${market}`, "No fake testimonials", "Offer-matched follow-up"],
      notes: "No fabricated reviews.",
    },
    market_snapshot: {
      headline:
        strategy.campaign.type === "seller"
          ? `What ${market} sellers need to know before listing`
          : strategy.campaign.type === "investor"
            ? `Why generic ${market} deal flow wastes time`
            : `Why the normal ${market} search path creates friction`,
      body: buildMarketSnapshot(input, parsed).join(" "),
      proof: buildMarketSnapshot(input, parsed),
      notes: "Problem and mechanism must be tied to the approved campaign.",
    },
    objections: {
      headline: "Questions to answer before the form",
      body: strategy.copy_direction.objection_handling.join(" "),
      proof: strategy.copy_direction.objection_handling,
      notes: "Objection handling is advisory and non-pressuring.",
    },
    process: {
      headline: "How it works",
      body: buildProcess(input).join(" "),
      proof: buildProcess(input),
      notes: "Three-step path from interest to follow-up.",
    },
    faq: {
      headline: "Common questions before moving forward",
      body: buildFaq(input).join(" "),
      proof: buildFaq(input),
      notes: "FAQ reduces friction without making unsupported claims.",
    },
    vsl: {
      headline: "Optional quick breakdown",
      body: `Use this slot for a short explanation of ${conciseOfferPhrase(offer)} if the campaign needs more education.`,
      proof: ["Optional video", "Not required for launch"],
      notes: "Hidden by default unless a video exists.",
    },
    image: {
      headline: "Visual proof area",
      body: `Use app-owned images that match ${market}, ${audience}, and the approved offer.`,
      proof: ["App-owned media only", "Current campaign context"],
      notes: "No provider/private URLs.",
    },
    form: {
      headline:
        strategy.campaign.type === "seller"
          ? "Request the sale plan"
          : strategy.campaign.type === "home_valuation"
            ? "Request the value check"
            : strategy.campaign.type === "investor"
              ? "Request matching opportunities"
              : "Request the shortlist",
      body: `Collect the minimum fields needed to follow up on ${conciseOfferPhrase(offer)} in ${market}.`,
      proof: [`CTA: ${cta}`, `Fields: ${FORM_FIELDS_BY_GOAL[input.funnelGoal].join(", ")}`],
      notes: "Form stays short and consent copy remains outside this strategy layer.",
    },
    closing_cta: {
      headline: "Ready for the next step?",
      body: `${audience} can use ${cta} to move from interest to a clear follow-up on ${conciseOfferPhrase(offer)}.`,
      proof: [`Primary CTA: ${cta}`, `Market: ${market}`],
      notes: "Final CTA repeats approved message match.",
    },
  };

  const base = copyByType[type] || copyByType.benefits;

  return {
    id: type,
    type,
    headline: trimWords(cleanMarketingCopy(base.headline), 14),
    subheadline: trimWords(cleanMarketingCopy(base.body), 28),
    body: cleanMarketingCopy(base.body),
    cta,
    proof_items: uniqueFragments(base.proof).slice(0, 4),
    visual_notes: base.notes,
  };
}

function buildFunnelRenderV2(
  strategy: FunnelStrategyBriefV2,
  raw: FunnelEngineInput,
  input: NormalizedInput,
  fallback: FunnelBlueprint,
): FunnelRenderV2 {
  const parsed = parseOffer(input);
  const sectionTypes = strategy.sections.length ? strategy.sections : FUNNEL_ARCHETYPES_V2.generic_buyer_seller_fallback.sectionStructure;
  const sections = uniqueFragments(sectionTypes).map((type) =>
    sectionCopyForV2(type as FunnelSectionType, strategy, input, parsed),
  );

  if (!sections.some((section) => section.type === "hero")) {
    sections.unshift(sectionCopyForV2("hero", strategy, input, parsed));
  }

  if (!sections.some((section) => section.type === "form")) {
    sections.push(sectionCopyForV2("form", strategy, input, parsed));
  }

  if (!sections.some((section) => section.type === "closing_cta")) {
    sections.push(sectionCopyForV2("closing_cta", strategy, input, parsed));
  }

  return {
    version: "funnel_render_v2",
    strategy_id: `${strategy.archetype.id}:${strategy.agent.market}:${strategy.campaign.offer}`.toLowerCase().replace(/[^a-z0-9:]+/g, "-"),
    campaign_id: strategy.campaign_id,
    theme: {
      mode: strategy.white_label.brand_mode,
      accent:
        strategy.white_label.brand_mode === "partner"
          ? "partner-accent"
          : strategy.agent.brokerage
            ? "brokerage-aware"
            : "dealflow-cyan",
      typography: "clear high-contrast sans-serif",
      visualStyle: strategy.visual_direction.style,
    },
    sections,
    form: {
      fields: fallback.form_fields.length ? fallback.form_fields : FORM_FIELDS_BY_GOAL[input.funnelGoal],
      cta: strategy.campaign.cta || fallback.cta,
    },
    tracking: {
      archetype: strategy.archetype.id,
      market: strategy.agent.market,
      whiteLabel: strategy.white_label.enabled,
    },
    compliance: {
      fairHousing: true,
      consentCopyRequired: true,
      unsupportedClaimsBlocked: true,
    },
    metadata: {
      archetype_id: strategy.archetype.id,
      generated_at: new Date(0).toISOString(),
      fallback_used: false,
    },
  };
}

function validateFunnelStrategyBriefV2(strategy: FunnelStrategyBriefV2) {
  const failures: string[] = [];

  if (strategy.version !== "funnel_strategy_v2") failures.push("strategy_version_invalid");
  if (!strategy.agent.market) failures.push("strategy_market_missing");
  if (!strategy.campaign.offer) failures.push("strategy_offer_missing");
  if (!strategy.campaign.audience) failures.push("strategy_audience_missing");
  if (!strategy.campaign.cta) failures.push("strategy_cta_missing");
  if (!FUNNEL_ARCHETYPES_V2[strategy.archetype.id]) failures.push("strategy_archetype_unknown");
  if (!strategy.sections.length) failures.push("strategy_sections_missing");

  return failures;
}

function validateFunnelRenderV2(render: FunnelRenderV2) {
  const failures: string[] = [];

  if (render.version !== "funnel_render_v2") failures.push("render_version_invalid");
  if (!render.sections.some((section) => section.type === "hero")) failures.push("render_hero_missing");
  if (!render.sections.some((section) => section.type === "form")) failures.push("render_form_missing");
  if (!render.sections.some((section) => section.type === "closing_cta")) failures.push("render_closing_cta_missing");
  if (!render.form.fields.length) failures.push("render_form_fields_missing");
  if (!render.form.cta) failures.push("render_form_cta_missing");
  for (const section of render.sections) {
    if (!section.headline || !section.body) failures.push(`render_section_incomplete:${section.type}`);
  }

  return failures;
}

function qaFunnelRenderV2(strategy: FunnelStrategyBriefV2, render: FunnelRenderV2): FunnelQaResultV2 {
  const hardFailures = [
    ...validateFunnelStrategyBriefV2(strategy),
    ...validateFunnelRenderV2(render),
  ];
  const warnings: string[] = [];
  const joined = JSON.stringify(render).toLowerCase();
  const customerCopy = JSON.stringify(
    render.sections.map((section) => ({
      headline: section.headline,
      subheadline: section.subheadline,
      body: section.body,
      cta: section.cta,
      proof_items: section.proof_items,
    })),
  ).toLowerCase();
  const market = strategy.agent.market.toLowerCase();
  const offerTokens = strategy.campaign.offer
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 4);

  if (market && !joined.includes(market)) hardFailures.push("market_missing_from_render");
  if (offerTokens.length && !offerTokens.some((token) => joined.includes(token))) hardFailures.push("offer_missing_from_render");
  if (strategy.campaign.cta && !joined.includes(strategy.campaign.cta.toLowerCase())) hardFailures.push("cta_missing_from_render");
  if (/\b(guaranteed|guarantee)\s+(approval|profit|roi|sale|return|appreciation|availability)\b/i.test(customerCopy)) {
    hardFailures.push("unsupported_guarantee_or_claim");
  }
  if (/\b(families with kids|family neighborhood|safe neighborhood|low crime|good schools|christian|muslim|jewish|asian|black|white|hispanic)\b/i.test(customerCopy)) {
    hardFailures.push("protected_class_or_steering_language");
  }
  if (strategy.campaign.type === "seller" && /\bbuy your next home\b/i.test(joined)) {
    hardFailures.push("buyer_seller_mismatch");
  }
  if (strategy.campaign.type === "buyer" && /\bsell your home\b/i.test(joined)) {
    hardFailures.push("buyer_seller_mismatch");
  }
  if (/futuristic|ai-powered real estate portal|generic lead page/i.test(joined)) {
    warnings.push("generic_or_futuristic_template_language");
  }
  if (!strategy.agent.brokerage) warnings.push("brokerage_missing");
  if (render.sections.length < 6) warnings.push("section_depth_low");

  return {
    status: hardFailures.length ? "block" : warnings.length ? "warning" : "pass",
    hardFailures: uniqueFragments(hardFailures),
    warnings: uniqueFragments(warnings),
    checkedAt: new Date(0).toISOString(),
  };
}

function sectionStyleForV2(type: FunnelSectionType): FunnelSectionStyle {
  return {
    spacing: type === "hero" || type === "closing_cta" ? "spacious" : type === "trust_bar" ? "compact" : "comfortable",
    width: type === "hero" || type === "form" || type === "closing_cta" ? "content" : "full",
    align: type === "hero" ? "left" : "left",
    theme: type === "hero" || type === "form" || type === "closing_cta" ? "dark" : type === "trust_bar" || type === "proof_metrics" ? "accent" : "light",
  };
}

function renderV2ToBlueprint(
  strategy: FunnelStrategyBriefV2,
  render: FunnelRenderV2,
  qa: FunnelQaResultV2,
  input: NormalizedInput,
  fallback: FunnelBlueprint,
): FunnelBlueprint {
  const hero = render.sections.find((section) => section.type === "hero") || render.sections[0];
  const sections: FunnelSection[] = render.sections.map((section) => ({
    id: `${render.metadata.archetype_id}-${section.id}`,
    type: section.type,
    variant: render.metadata.archetype_id,
    title: section.headline,
    content: uniqueFragments([
      section.subheadline,
      section.body,
      ...section.proof_items,
      `Primary CTA: ${section.cta}`,
    ]).filter(Boolean),
    visible: section.type !== "vsl" && section.type !== "image",
    style: sectionStyleForV2(section.type),
    media:
      section.type === "vsl"
        ? { kind: "video" as const, label: "Optional Video", caption: "Add an app-owned explainer video if available." }
        : section.type === "image"
          ? { kind: "image" as const, label: "Optional Image", caption: "Add app-owned market or listing imagery if available." }
          : null,
  }));

  return {
    ...fallback,
    funnel_type: FUNNEL_TYPE_BY_GOAL[input.funnelGoal],
    headline: hero?.headline || fallback.headline,
    subheadline: hero?.subheadline || fallback.subheadline,
    cta: render.form.cta || fallback.cta,
    sections,
    form_fields: render.form.fields,
    follow_up_action:
      input.funnelGoal === "book_call"
        ? FOLLOW_UP_ACTION_BY_GOAL[input.funnelGoal]
        : "show_thank_you_page_call_5_15_minutes",
    optimization_notes: uniqueFragments([
      `Funnel Personalization V2 selected ${strategy.archetype.name}.`,
      `Strategy reason: ${strategy.archetype.reason}`,
      ...qa.warnings.map((warning) => `Advisory: ${warning}`),
      ...buildOptimizationNotes(input),
    ]),
    personalization_version: "funnel_strategy_v2",
    strategy_brief: strategy,
    render_schema: render,
    qa_result: qa,
    fallback_used: false,
  };
}

function generatePersonalizedFunnelV2(input?: FunnelEngineInput | null, fallback?: FunnelBlueprint): FunnelBlueprint {
  const raw = input || {};
  const normalized = normalizeInput(raw);
  const selected = selectFunnelArchetypeV2(normalized, raw);
  const strategy = buildFunnelStrategyBriefV2(raw, normalized, selected);
  const stableFallback = fallback || generateFunnelV1(input);
  const render = buildFunnelRenderV2(strategy, raw, normalized, stableFallback);
  const qa = qaFunnelRenderV2(strategy, render);

  if (qa.status === "block") {
    throw new Error(`funnel_personalization_v2_qa_block:${qa.hardFailures.join(",")}`);
  }

  return renderV2ToBlueprint(strategy, render, qa, normalized, stableFallback);
}

function generateFunnelV1(input?: FunnelEngineInput | null): FunnelBlueprint {
  const raw = input || {};

  if (resolveDirectResponseFunnelVariant(raw)) {
    return buildDirectResponseFunnel({
      ...raw,
      market: raw.market || raw.location,
    });
  }

  const normalized = normalizeInput(raw);
  const bestVariation = pickBestFunnelVariation(normalized);
  const selectedPackage = selectMediaBuyerCampaignPackage(normalized.campaignCategory, {
    offer: normalized.offer,
    audience: normalized.audience,
    mechanism: normalized.mechanism,
  });
  let headline = safeText(raw.headline) || safeText(selectedPackage?.funnelHeadline) || safeText(bestVariation?.headline);
  let subheadline = safeText(raw.subheadline) || safeText(selectedPackage?.funnelSubheadline) || safeText(bestVariation?.subheadline);
  let mechanism = safeText(raw.mechanism) || normalized.mechanism;
  const audience = safeText(raw.audience) || normalized.audience;
  const parsed = parseOffer(normalized);
  const cta =
    normalized.marketType === "approval" || parsed.offerClass === "approval"
      ? "See If You Qualify"
      : selectedPackage?.cta ?? selectMediaBuyerCta(normalized.campaignCategory);

  if (!headline) {
    headline = safeText(parseOffer(normalized).promise) || "Your campaign is ready";
  }

  if (!mechanism) {
    mechanism = "A system designed to filter weak-fit inventory and book better next steps";
  }

  if (!subheadline) {
    subheadline = `${mechanism} for ${audience || "your audience"} in ${normalized.location}.`;
  }

  headline = trimWords(cleanMarketingCopy(headline), 14);
  subheadline = trimWords(cleanMarketingCopy(subheadline), 30);

  return {
    funnel_type: FUNNEL_TYPE_BY_GOAL[normalized.funnelGoal],
    headline,
    subheadline,
    cta,
    sections: buildSections(normalized, parsed, headline, subheadline, cta),
    form_fields: FORM_FIELDS_BY_GOAL[normalized.funnelGoal],
    follow_up_action:
      normalized.funnelGoal === "book_call"
        ? FOLLOW_UP_ACTION_BY_GOAL[normalized.funnelGoal]
        : "show_thank_you_page_call_5_15_minutes",
    optimization_notes: buildOptimizationNotes(normalized),
  };
}

export function generateFunnel(input?: FunnelEngineInput | null): FunnelBlueprint {
  const raw = input || {};

  if (resolveDirectResponseFunnelVariant(raw)) {
    return buildDirectResponseFunnel({
      ...raw,
      market: raw.market || raw.location,
    });
  }

  const fallback = {
    ...generateFunnelV1(input),
    personalization_version: "v1" as const,
  };

  if (!getFunnelPersonalizationV2Enabled()) {
    return fallback;
  }

  try {
    return generatePersonalizedFunnelV2(input, fallback);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      ...fallback,
      fallback_used: true,
      optimization_notes: uniqueFragments([
        ...fallback.optimization_notes,
        `Funnel Personalization V2 fallback used: ${message}`,
      ]),
    };
  }
}
