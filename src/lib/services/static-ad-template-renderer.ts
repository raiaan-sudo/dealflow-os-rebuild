import type { CampaignCategory } from "@/lib/services/campaign-creative-strategy";
import {
  evaluateStaticVisualAssetDecision,
} from "@/lib/services/static-creative-visual-qa";

export type StaticAdTemplateKind =
  | "seller_value_map"
  | "seller_price_comparison"
  | "seller_homeowner_callout"
  | "seller_price_update"
  | "buyer_listing_collage"
  | "buyer_affordability"
  | "buyer_payment_anchor"
  | "buyer_feature_collage"
  | "precon_breaking_news"
  | "precon_current_future"
  | "precon_deposit_timeline"
  | "precon_price_anchor"
  | "investor_roi_dashboard"
  | "investor_rent_price"
  | "investor_map_data"
  | "commercial_space_match"
  | "commercial_location_map"
  | "commercial_lease_purchase"
  | "luxury_private_access"
  | "luxury_cinematic"
  | "luxury_scarcity";

export type StaticAdTemplateStatus =
  | "final_composed"
  | "template_fallback"
  | "background_generating"
  | "background_rejected"
  | "background_failed";

export type StaticAdTemplateInput = {
  id?: string | null;
  category?: CampaignCategory | string | null;
  location?: string | null;
  offer?: string | null;
  imageUrl?: string | null;
  storageNormalized?: boolean | null;
  appComposedFinal?: boolean | null;
  imageGenerationState?: string | null;
  imageGenerationMessage?: string | null;
  imagePrompt?: string | null;
  imagePromptConfig?: {
    prompt?: string | null;
    negativePrompt?: string | null;
  } | null;
  visualPromptBrief?: {
    category?: CampaignCategory | string | null;
    visualAssetContract?: string | null;
    visualAssetRole?: string | null;
    proofStyle?: string | null;
    mechanism?: string | null;
    visualLogic?: string[] | null;
    overlayLogic?: string[] | null;
  } | null;
  hook?: string | null;
  overlayText?: string | null;
  headline?: string | null;
  primaryText?: string | null;
  cta?: string | null;
  score?: number | null;
  qualityGate?: {
    score?: number | null;
    accepted?: boolean | null;
    hardFailures?: string[] | null;
  } | null;
  imageQa?: {
    usable?: boolean | null;
    decision?: "accept" | "reject" | "review" | string | null;
    reasons?: string[] | null;
    textDensity?: number | null;
    layoutRisk?: number | null;
    detectedTextSamples?: string[] | null;
  } | null;
  offerQuality?: {
    score?: number | null;
    accepted?: boolean | null;
    missingElements?: string[] | null;
  } | null;
};

export type ComposedStaticAdPreview = {
  templateId: StaticAdTemplateKind;
  category: CampaignCategory;
  status: StaticAdTemplateStatus;
  aspectRatio: "1:1" | "16:9";
  backgroundImageUrl: string | null;
  rawBackgroundAvailable: boolean;
  location: string;
  eyebrow: string;
  headline: string;
  overlayText: string;
  primaryText: string;
  cta: string;
  proofChips: string[];
  designBadges: string[];
  visualRules: string[];
  qualityScore: number | null;
  qualityAccepted: boolean | null;
  overflowRisk: boolean;
  backgroundMessage: string;
};

const CATEGORY_LABELS: Record<CampaignCategory, string> = {
  buyer: "Buyer opportunity",
  seller: "Homeowner update",
  investor: "Investor brief",
  commercial: "Commercial brief",
  precon: "Pre-con release",
  luxury: "Private access",
};

const CATEGORY_CTAS: Record<CampaignCategory, string> = {
  buyer: "See Matching Homes",
  seller: "Check Your Home Value",
  investor: "Get Deal Flow",
  commercial: "See Matching Spaces",
  precon: "Get the Full List",
  luxury: "Request Private Access",
};

const CATEGORY_RULES: Record<CampaignCategory, string[]> = {
  seller: [
    "map or value comparison",
    "before/after pricing cue",
    "demand indicator",
    "suburban homeowner context",
  ],
  buyer: [
    "warm lived-in interior",
    "affordability or payment cue",
    "home feature collage",
    "opportunity framing",
  ],
  precon: [
    "current vs future context",
    "deposit or timeline proof",
    "construction plus render cue",
    "price anchor",
  ],
  investor: [
    "ROI or yield proof",
    "rent vs price comparison",
    "map or market data",
    "clean dashboard layout",
  ],
  commercial: [
    "space-fit proof",
    "availability map",
    "lease or purchase comparison",
    "operator-focused layout",
  ],
  luxury: [
    "minimal premium text",
    "private-access signal",
    "cinematic depth",
    "scarcity cue",
  ],
};

const VAGUE_CTA_PATTERN = /learn more|submit|contact us|book a call/i;

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function titleCase(value: string) {
  return compactWhitespace(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stripCustomerFacingMechanism(value: string) {
  return compactWhitespace(value)
    .replace(/^preview\s+/i, "")
    .replace(/[.!?]\s+(?:delivered|powered|built)\s+through\b[\s\S]*$/i, "")
    .replace(/\b(?:delivered|powered|built)\s+through\b[\s\S]*$/i, "")
    .replace(/\bthrough\s+a\s+buyer\s+consultation(?:\s+and\s+qualification\s+system)?\b[\s\S]*$/i, "")
    .replace(/\bfor\s+home\s+buyers\b[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/\s+[.!?,:;]$/g, "")
    .trim();
}

function hasBuyerLanguage(value: string) {
  return /\b(buyer consultation|home buyers|buying power|pre[-\s]?approval|credit score|mortgage approval)\b/i.test(value);
}

function buildSellerFallbackLine(offer: string) {
  const cleanOffer = stripCustomerFacingMechanism(offer);
  return cleanOffer
    ? `${cleanOffer} helps homeowners review pricing, demand, and the next move before they list.`
    : "Review pricing, demand, and the next move before you list.";
}

function cleanCustomerFacingStaticCopy(value: string, category: CampaignCategory, fallback?: string) {
  const stripped = stripCustomerFacingMechanism(value);

  if (category === "seller" && hasBuyerLanguage(stripped)) {
    return compactWhitespace(fallback || buildSellerFallbackLine(stripped));
  }

  return stripped;
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

export function normalizeStaticAdTemplateCategory(input: StaticAdTemplateInput): CampaignCategory {
  const explicit = safeText(input.category || input.visualPromptBrief?.category).toLowerCase();

  if (
    explicit === "seller" ||
    explicit === "buyer" ||
    explicit === "investor" ||
    explicit === "commercial" ||
    explicit === "precon" ||
    explicit === "luxury"
  ) {
    return explicit;
  }

  const haystack = [
    input.offer,
    input.hook,
    input.overlayText,
    input.headline,
    input.primaryText,
    input.visualPromptBrief?.proofStyle,
    input.visualPromptBrief?.mechanism,
    ...(input.visualPromptBrief?.visualLogic ?? []),
    ...(input.visualPromptBrief?.overlayLogic ?? []),
  ]
    .map((item) => safeText(item).toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (includesAny(haystack, [/pre[- ]?con|construction|deposit|completion|202[6-9]|assignment potential|developer/])) {
    return "precon";
  }

  if (includesAny(haystack, [/luxury|private access|exclusive|penthouse|skyline|marble|off[- ]market network|rare opportunity/])) {
    return "luxury";
  }

  if (includesAny(haystack, [/commercial|office|retail|industrial|warehouse|mixed[- ]use|tenant|lease|owner[- ]user|sq\.?\s*ft|square feet/])) {
    return "commercial";
  }

  if (includesAny(haystack, [/invest|roi|yield|cash ?flow|rent vs|rental|cap rate|undervalued/])) {
    return "investor";
  }

  if (includesAny(haystack, [/seller|homeowner|home value|what.*worth|before you sell|listing|price update|valuation/])) {
    return "seller";
  }

  return "buyer";
}

function selectTemplateKind(category: CampaignCategory, input: StaticAdTemplateInput): StaticAdTemplateKind {
  const haystack = [
    input.offer,
    input.hook,
    input.overlayText,
    input.headline,
    input.primaryText,
    input.visualPromptBrief?.proofStyle,
  ]
    .map((item) => safeText(item).toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (category === "seller") {
    if (/2019|202[0-9]|\$|price comparison|before.*after|vs/.test(haystack)) return "seller_price_comparison";
    if (/homeowner|neighborhood|area|street/.test(haystack)) return "seller_homeowner_callout";
    if (/value|worth|valuation|price update/.test(haystack)) return "seller_price_update";
    return "seller_value_map";
  }

  if (category === "buyer") {
    if (/payment|monthly|afford|down payment|under \$/.test(haystack)) return "buyer_affordability";
    if (/new listing|listing alert|bed|bath|feature|backyard|kitchen/.test(haystack)) return "buyer_feature_collage";
    if (/\$|price|under/.test(haystack)) return "buyer_payment_anchor";
    return "buyer_listing_collage";
  }

  if (category === "precon") {
    if (/breaking|arrived|news/.test(haystack)) return "precon_breaking_news";
    if (/202[6-9]|timeline|completion/.test(haystack)) return "precon_deposit_timeline";
    if (/current|future|render|crane|construction/.test(haystack)) return "precon_current_future";
    return "precon_price_anchor";
  }

  if (category === "investor") {
    if (/rent|price|cash ?flow/.test(haystack)) return "investor_rent_price";
    if (/map|micro-market|area|location/.test(haystack)) return "investor_map_data";
    return "investor_roi_dashboard";
  }

  if (category === "commercial") {
    if (/lease|purchase|owner[- ]user|buy/.test(haystack)) return "commercial_lease_purchase";
    if (/map|area|location|corridor|trade area/.test(haystack)) return "commercial_location_map";
    return "commercial_space_match";
  }

  if (/scarce|few|limited|rare/.test(haystack)) return "luxury_scarcity";
  if (/cinematic|skyline|night|marble|glass/.test(haystack)) return "luxury_cinematic";
  return "luxury_private_access";
}

function extractNumberTokens(input: StaticAdTemplateInput) {
  const source = [
    input.offer,
    input.overlayText,
    input.headline,
    input.primaryText,
    input.visualPromptBrief?.proofStyle,
  ].join(" ");
  const matches = source.match(/(?:\$[\d,.]+[mk]?|\d+%|\d+\s*-\s*\d+|\d+\+?|202[6-9])/gi) ?? [];
  return Array.from(new Set(matches.map((item) => item.trim()))).slice(0, 3);
}

function trimForSlot(value: string, maxChars: number) {
  const text = compactWhitespace(value);
  if (text.length <= maxChars) {
    return text;
  }

  const ellipsis = "...";
  const bodyLimit = Math.max(0, maxChars - ellipsis.length);
  const trimmed = text.slice(0, bodyLimit).replace(/\s+\S*$/, "");
  return `${trimmed || text.slice(0, bodyLimit)}${ellipsis}`.slice(0, maxChars);
}

export function fitStaticAdText(input: {
  headline: string;
  overlayText: string;
  primaryText: string;
  cta: string;
  category: CampaignCategory;
}) {
  const luxury = input.category === "luxury";
  const headlineLimit = luxury ? 58 : 72;
  const overlayLimit = luxury ? 52 : 82;
  const primaryLimit = 150;
  const ctaLimit = 34;
  const overflowRisk =
    input.headline.length > headlineLimit ||
    input.overlayText.length > overlayLimit ||
    input.primaryText.length > primaryLimit ||
    input.cta.length > ctaLimit;

  return {
    headline: trimForSlot(input.headline, headlineLimit),
    overlayText: trimForSlot(input.overlayText, overlayLimit),
    primaryText: trimForSlot(input.primaryText, primaryLimit),
    cta: trimForSlot(input.cta, ctaLimit),
    overflowRisk,
  };
}

function buildStatus(input: StaticAdTemplateInput): StaticAdTemplateStatus {
  if (input.imageUrl && input.appComposedFinal === true) {
    return evaluateStaticVisualAssetDecision(input).usable ? "final_composed" : "background_rejected";
  }

  if (input.imageUrl) {
    return "background_rejected";
  }

  if (input.imageGenerationState === "generating") {
    return "background_generating";
  }

  if (input.imageGenerationState === "failed") {
    return "background_failed";
  }

  return "template_fallback";
}

function buildBackgroundMessage(input: StaticAdTemplateInput, status: StaticAdTemplateStatus) {
  const customerSafeImageMessage =
    input.imageGenerationMessage &&
    !/provider usage guard|explicitly enabled|generation is disabled|provider|configured|credentials|api key|schema|rpc|open\s*ai|higgs?field|hey\s*gen|gpt-image|model|timed?\s*out|timeout|api\.|https?:\/\//i.test(input.imageGenerationMessage)
      ? input.imageGenerationMessage
      : null;

  if (status === "final_composed") {
    return "Final ad ready with exact approved copy.";
  }

  if (status === "background_generating") {
    return customerSafeImageMessage || "Premium visual polish is preparing; final ads remain visible.";
  }

  if (status === "background_rejected") {
    return "Premium visual polish needs another attempt. Launch-ready final ads remain available when selected.";
  }

  if (status === "background_failed") {
    return customerSafeImageMessage || "Premium visual polish needs another attempt. Final ads remain visible.";
  }

  return "Concept preview is ready while final ads are prepared.";
}

function buildEyebrow(category: CampaignCategory, location: string, templateId: StaticAdTemplateKind) {
  if (category === "seller") return `${location} homeowners`;
  if (category === "precon") return /breaking/.test(templateId) ? "Breaking news" : `${location} pre-con`;
  if (category === "investor") return `${location} investors`;
  if (category === "commercial") return `${location} commercial`;
  if (category === "luxury") return "Private release";
  return `${location} opportunity`;
}

function fallbackHeadline(category: CampaignCategory, location: string) {
  if (category === "seller") return `What is your ${location} home worth?`;
  if (category === "precon") return `New ${location} pre-con opportunities`;
  if (category === "investor") return `${location} deal flow brief`;
  if (category === "commercial") return `${location} commercial space brief`;
  if (category === "luxury") return `Private access in ${location}`;
  return `New homes available in ${location}`;
}

export function buildComposedStaticAdPreview(input: StaticAdTemplateInput): ComposedStaticAdPreview {
  const category = normalizeStaticAdTemplateCategory(input);
  const templateId = selectTemplateKind(category, input);
  const location = titleCase(safeText(input.location) || "Your Market");
  const numbers = extractNumberTokens(input);
  const status = buildStatus(input);
  const backgroundDecision = evaluateStaticVisualAssetDecision(input);
  const rawCta = safeText(input.cta);
  const safeCta = rawCta
    ? cleanCustomerFacingStaticCopy(rawCta, category, CATEGORY_CTAS[category])
    : CATEGORY_CTAS[category];
  const cleanOffer = cleanCustomerFacingStaticCopy(safeText(input.offer), category);
  const headlineSourceRaw = safeText(input.headline) || safeText(input.hook) || cleanOffer || fallbackHeadline(category, location);
  const headlineSource = cleanCustomerFacingStaticCopy(headlineSourceRaw, category, cleanOffer || fallbackHeadline(category, location));
  const overlaySource =
    cleanCustomerFacingStaticCopy(safeText(input.overlayText), category, cleanOffer) ||
    cleanOffer ||
    cleanCustomerFacingStaticCopy(safeText(input.visualPromptBrief?.proofStyle), category, cleanOffer) ||
    headlineSource;
  const primaryFallback = category === "seller"
    ? buildSellerFallbackLine(cleanOffer || headlineSource)
    : `Use this ${CATEGORY_LABELS[category].toLowerCase()} to reduce uncertainty before the next move.`;
  const primarySource =
    cleanCustomerFacingStaticCopy(safeText(input.primaryText), category, primaryFallback) ||
    cleanOffer ||
    primaryFallback;
  const fitted = fitStaticAdText({
    headline: headlineSource,
    overlayText: overlaySource,
    primaryText: primarySource,
    cta: safeCta,
    category,
  });
  const proofChips = [
    ...numbers,
    safeText(input.visualPromptBrief?.proofStyle),
    safeText(input.visualPromptBrief?.mechanism),
  ].filter(Boolean).slice(0, 4);

  return {
    templateId,
    category,
    status,
    aspectRatio: category === "luxury" ? "16:9" : "1:1",
    backgroundImageUrl: backgroundDecision.usable ? safeText(input.imageUrl) || null : null,
    rawBackgroundAvailable: Boolean(input.imageUrl),
    location,
    eyebrow: buildEyebrow(category, location, templateId),
    headline: fitted.headline,
    overlayText: fitted.overlayText,
    primaryText: fitted.primaryText,
    cta: fitted.cta,
    proofChips,
    designBadges: [CATEGORY_LABELS[category], templateId.replace(/_/g, " ")],
    visualRules: CATEGORY_RULES[category],
    qualityScore: input.qualityGate?.score ?? input.offerQuality?.score ?? input.score ?? null,
    qualityAccepted: input.qualityGate?.accepted ?? input.offerQuality?.accepted ?? null,
    overflowRisk: fitted.overflowRisk,
    backgroundMessage: buildBackgroundMessage(input, status),
  };
}
