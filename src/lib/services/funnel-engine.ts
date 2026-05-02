import type { CampaignIntent } from "@/lib/campaign-intent";
import { enhanceOffer, extractOfferData } from "@/lib/copy/offer-enhancement";
import type { CampaignCategory } from "@/lib/services/campaign-creative-strategy";
import {
  getCategoryCtaOptions,
  selectMediaBuyerCta,
} from "@/lib/optimization-engine/media-buying-rules";

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
  headline?: string;
  subheadline?: string;
  mechanism?: string;
  pain_points?: string[];
  market_type?: FunnelMarketType;
  funnel_goal?: FunnelGoal;
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

  if (input.marketType === "investor" || /invest|roi|yield|cash[- ]?flow|rental|off[- ]market deal/.test(haystack)) {
    return "investor";
  }

  return "buyer";
}

function capitalize(value: string) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function trimWords(value: string, maxWords: number) {
  const words = safeText(value).split(/\s+/).filter(Boolean);

  if (words.length <= maxWords) {
    return words.join(" ");
  }

  return words.slice(0, maxWords).join(" ");
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
  const audience = safeText(parsed.audience || input.audience);
  const time = parsed.timeHorizon;
  const promise = sentence(parsed.promise).replace(/\.$/, "");

  if (parsed.offerClass === "investor") {
    return uniqueFragments([
      time && /guarantee/i.test(promise)
        ? `We Guarantee You a Cash-Flow Positive ${parsed.assetType} in the Next ${time}`
        : "",
      `Get ${parsed.assetType} opportunities in ${market} built for cash flow`,
      `${capitalize(audience || "Investors")}: lock in cash-flow positive deals in ${market}`,
      `Secure a cash-flow positive ${parsed.assetType} before weaker deals waste your time`,
    ]).map((text) => trimWords(text, 16));
  }

  if (parsed.offerClass === "approval") {
    return uniqueFragments([
      promise,
      `${capitalize(audience || "Buyers")} in ${market}: stop assuming you cannot qualify`,
      `Get approved faster for the right ${parsed.assetType} in ${market}`,
    ]).map((text) => trimWords(text, 16));
  }

  if (parsed.offerClass === "guarantee" || parsed.offerClass === "seller") {
    return uniqueFragments([
      promise,
      time ? `Sell your home in ${time} or less in ${market}` : "",
      `${capitalize(audience || "Homeowners")}: stop letting your home sit in ${market}`,
    ]).map((text) => trimWords(text, 16));
  }

  return uniqueFragments([
    promise,
    `Access off-market ${parsed.assetType} in ${market}`,
    `${capitalize(audience || "Buyers")}: get a tighter path to ${parsed.outcome} in ${market}`,
  ]).map((text) => trimWords(text, 16));
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
  if (!includesOfferConcept(variation.headline, input.offer)) offerAlignment -= 3;
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
      ? "Qualified buyer positioning"
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

export function generateFunnel(input?: FunnelEngineInput | null): FunnelBlueprint {
  const raw = input || {};
  const normalized = normalizeInput(raw);
  const bestVariation = pickBestFunnelVariation(normalized);
  let headline = safeText(raw.headline) || safeText(bestVariation?.headline);
  let subheadline = safeText(raw.subheadline) || safeText(bestVariation?.subheadline);
  let mechanism = safeText(raw.mechanism) || normalized.mechanism;
  const audience = safeText(raw.audience) || normalized.audience;
  const parsed = parseOffer(normalized);
  const cta =
    normalized.marketType === "approval" || parsed.offerClass === "approval"
      ? "See If You Qualify"
      : selectMediaBuyerCta(normalized.campaignCategory);

  if (!headline) {
    headline = safeText(parseOffer(normalized).promise) || "Your campaign is ready";
  }

  if (!includesOfferConcept(headline, normalized.offer)) {
    headline = safeText(bestVariation?.headline) || headline;
  }

  if (!mechanism) {
    mechanism = "A system designed to filter weak-fit inventory and book better next steps";
  }

  if (!subheadline) {
    subheadline = `${mechanism} for ${audience || "your audience"} in ${normalized.location}.`;
  }

  headline = trimWords(headline, 18);
  subheadline = trimWords(subheadline, 32);

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
