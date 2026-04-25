import { z } from "zod";
import { generateAiJson } from "@/lib/ai/client";
import type { CampaignIntent } from "@/lib/campaign-intent";
import { logWarn } from "@/lib/logging";
import type { CreativeAngle, CreativeFormat } from "@/lib/services/creative-engine";
import {
  inferCampaignCategory,
} from "@/lib/services/campaign-creative-strategy";
import { getCategoryRulePack } from "@/lib/services/campaign-category-rule-packs";
import {
  enhanceOffer,
  extractOfferData,
  formatAudience,
  generateOfferVariations,
} from "@/lib/copy/offer-enhancement";
import {
  formatAudience as normalizeAudienceInput,
  normalizeInput as normalizeLooseInput,
  normalizeMarket,
  normalizeOffer as normalizeOfferInput,
} from "@/lib/copy/input-normalization";

export type CopyEngineCreativeInput = {
  hook: string;
  angle: CreativeAngle;
  format: CreativeFormat;
  concept: string;
};

export type CopyEngineInput = {
  creatives: CopyEngineCreativeInput[];
  location: string;
  audience: string;
  offer: string;
  price_point?: string;
  market_type?: CampaignIntent;
  funnel_goal?: "lead_form" | "survey" | "book_call";
  risk_reversal?: string;
  mechanism?: string;
  urgency?: string;
};

export type AdCopyOutput = {
  hook: string;
  primary_text: string;
  script: string;
  headline: string;
  cta: string;
};

export type CreativeCopyAssistantInput = {
  offer?: string;
  market?: string;
  location?: string;
  audience?: string;
  price_point?: string;
  market_type?: CampaignIntent;
  funnel_goal?: "lead_form" | "survey" | "book_call";
  risk_reversal?: string;
  mechanism?: string;
  urgency?: string;
};

type CopyScoreBreakdown = {
  clarity: number;
  specificity: number;
  offerStrength: number;
  directResponse: number;
};

type ScoredVariation = {
  text: string;
  reason: string;
  score: number;
  breakdown: CopyScoreBreakdown;
};

export type CreativeCopyAssistantOutput = {
  hook: string;
  problem: string;
  mechanism: string;
  solution: string;
  offer: string;
  cta: string;
  headline: string;
  subheadline: string;
  recommendationWhy: string;
  alternatives: {
    offer: ScoredVariation[];
    headline: ScoredVariation[];
    subheadline: ScoredVariation[];
    hook: ScoredVariation[];
    primaryText: ScoredVariation[];
  };
};

export type GptCopyAssistantEnhancement = {
  hook: string;
  problem: string;
  mechanism: string;
  offer: string;
  cta: string;
  headline: string;
  subheadline: string;
  primaryText: string;
  recommendationWhy: string;
};

export type ImproveCopyFieldType =
  | "hook"
  | "headline"
  | "overlay"
  | "primary"
  | "script";

export type UGCScriptOutput = {
  hook: string;
  body: string;
  cta: string;
  style?: "casual_ugc" | "testimonial" | "founder_expert" | "pain_first";
};

export type UGCScene = {
  type: "hook" | "body" | "cta";
  text: string;
};

type RequiredInput = {
  creatives: CopyEngineCreativeInput[];
  location: string;
  audience: string;
  offer: string;
  pricePoint: string;
  marketType: CampaignIntent;
  funnelGoal: "lead_form" | "survey" | "book_call";
  riskReversal: string;
  mechanism: string;
  urgency: string;
};

type OfferClass = "investor" | "approval" | "seller" | "first_time_buyer" | "buyer";

const gptCopyAssistantSchema = z.object({
  hook: z.string().optional(),
  problem: z.string().optional(),
  mechanism: z.string().optional(),
  offer: z.string().optional(),
  cta: z.string().optional(),
  headline: z.string().optional(),
  subheadline: z.string().optional(),
  primaryText: z.string().optional(),
  recommendationWhy: z.string().optional(),
});

const CTA_BY_MARKET: Record<RequiredInput["marketType"], string> = {
  buyer: "See Homes That Match",
  seller: "Get Your Sale Plan",
  investor: "See Available Cash-Flow Deals",
  approval: "See If You Qualify",
  refinance: "See Refinance Options",
  other: "See Available Opportunities",
};

function safeString(value: unknown) {
  return (value ?? "").toString().trim();
}

function splitCopyLines(value: string) {
  const normalized = safeString(value);

  if (!normalized) {
    return [];
  }

  const paragraphLines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (paragraphLines.length >= 3) {
    return paragraphLines;
  }

  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeText(value: unknown, fallback = "") {
  const normalized = safeString(value);
  return normalized || fallback;
}

function fillRulePattern(
  pattern: string,
  values: {
    audience: string;
    propertyType: string;
    keyOffer: string;
    market: string;
    mechanism: string;
  },
) {
  return pattern.replace(/\{(audience|propertyType|keyOffer|market|mechanism)\}/g, (_, key) => {
    return values[key as keyof typeof values] ?? "";
  });
}

function trimWords(value: string, maxWords: number) {
  const words = safeString(value).split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : words.slice(0, maxWords).join(" ");
}

function isFirstTimeBuyerAudience(input: Pick<RequiredInput, "audience" | "offer">) {
  const combined = `${input.audience} ${input.offer}`.toLowerCase();
  return /first[\s-]*time|new buyer|starter|renting|renters|600\+?\s*credit|credit score|approved|approval/.test(
    combined,
  );
}

function buildPersonaLabel(input: RequiredInput) {
  const audience = formatAudience(input.audience).replace(/-/g, " ");
  const offerClass = classifyOffer(input);

  if (offerClass === "approval" || isFirstTimeBuyerAudience(input)) {
    return audience || "first-time buyers";
  }

  if (offerClass === "seller") {
    return audience || "homeowners";
  }

  if (offerClass === "investor") {
    return audience || "investors";
  }

  return audience || "buyers";
}

function buildProblemLine(input: RequiredInput) {
  const offerClass = classifyOffer(input);

  if (offerClass === "approval" || isFirstTimeBuyerAudience(input)) {
    return `Most first-time buyers in ${input.location} waste time touring homes before they even know what they can get approved for.`;
  }

  if (offerClass === "seller") {
    return `Most sellers in ${input.location} either price too low, sit too long, or list before real buyer demand is measured.`;
  }

  if (offerClass === "investor") {
    return `Most investors in ${input.location} see polished listings, not the real numbers that decide whether the deal actually works.`;
  }

  return `Most buyers in ${input.location} keep reacting too late, which means the strongest-fit homes are gone before they move.`;
}

function buildMechanismLine(input: RequiredInput) {
  const offerClass = classifyOffer(input);

  if (input.mechanism) {
    return ensureSentence(input.mechanism);
  }

  if (offerClass === "approval" || isFirstTimeBuyerAudience(input)) {
    return "We start with an approval-first buying plan so you know your budget, payment range, and next move before you compete for the wrong home.";
  }

  if (offerClass === "seller") {
    return "We use a pre-market demand and pricing plan so you know how to position the home before you go live.";
  }

  if (offerClass === "investor") {
    return "We filter opportunities through yield, downside, and micro-market data before a deal ever reaches your shortlist.";
  }

  return "We use a tighter property-match process so the right homes surface faster and the dead-end options fall away early.";
}

function buildProofLine(input: RequiredInput) {
  const offerClass = classifyOffer(input);

  if (offerClass === "approval" || isFirstTimeBuyerAudience(input)) {
    return `That means you stop guessing, stop chasing the wrong listings, and move on homes that actually fit your approval path in ${input.location}.`;
  }

  if (offerClass === "seller") {
    return `That gives you clearer pricing, cleaner timing, and a stronger launch before stale-listing risk shows up.`;
  }

  if (offerClass === "investor") {
    return `That lets you review the cash-flow logic, rent assumptions, and downside before tying up capital in the wrong deal.`;
  }

  return `That gives you more clarity on fit, timing, and next step before the broader market reacts.`;
}

function buildHookLine(input: RequiredInput, creative?: CopyEngineCreativeInput | null) {
  const offerClass = classifyOffer(input);
  const persona = buildPersonaLabel(input);
  const priceAnchor = safeString(extractOfferData(input.offer).pricePoint);

  if (creative?.hook) {
    return ensureSentence(creative.hook).replace(/\.$/, "");
  }

  if (offerClass === "approval" || isFirstTimeBuyerAudience(input)) {
    const creditScore = extractOfferData(input.offer).creditScore;
    if (creditScore) {
      return `First-time buyers with ${creditScore}+ credit in ${input.location}: watch this before you book another showing`;
    }

    return `First-time buyers in ${input.location}: do not start with listings before you know this`;
  }

  if (offerClass === "seller") {
    return `Homeowners in ${input.location}: do not list before you see this first`;
  }

  if (offerClass === "investor") {
    return `Investors in ${input.location}: look at this before you put more capital into the next deal`;
  }

  if (priceAnchor) {
    return `${persona} in ${input.location}: here is how people are getting into ${priceAnchor} homes with less friction right now`;
  }

  return `${persona} in ${input.location}: this is how people are getting to the right homes before everyone else reacts`;
}

function buildUgcFromInput(input: RequiredInput, creative?: CopyEngineCreativeInput | null): UGCScriptOutput {
  const hook = sanitizeScriptLine(
    buildHookLine(input, creative),
    "Buyers in your market: watch this before you make the wrong move",
  );
  const problem = sanitizeScriptLine(buildProblemLine(input), "Most buyers move too late and miss the right fit");
  const mechanism = sanitizeScriptLine(buildMechanismLine(input), "We use a tighter process so the right options show up faster");
  const proof = sanitizeScriptLine(buildProofLine(input), "That gives you more clarity before you commit");
  const cta = sanitizeScriptLine(buildCta(input), "See what matches now");

  return {
    hook,
    body: `${problem} ${mechanism} ${proof}`.trim(),
    cta,
    style:
      classifyOffer(input) === "seller"
        ? "founder_expert"
        : classifyOffer(input) === "investor"
          ? "founder_expert"
          : "pain_first",
  };
}

function sanitizeScriptLine(value: string, fallback: string) {
  const cleaned = safeString(value)
    .replace(/^quick one\s*[—-]\s*/i, "")
    .replace(/^nobody is talking about/i, "Most people miss")
    .replace(/^claim your buyer list$/i, "See available homes")
    .trim();

  return ensureSentence(cleaned || fallback) || ensureSentence(fallback) || "";
}

function detectScriptStyle(lines: string[]) {
  const combined = lines.join(" ").toLowerCase();

  if (/most|overpay|lose|wrong|stuck|miss/.test(combined)) {
    return "pain_first" as const;
  }

  if (/we |our team|i help|i source|i screen|expert/.test(combined)) {
    return "founder_expert" as const;
  }

  if (/i was|we were|before i|before we|now i|now we/.test(combined)) {
    return "testimonial" as const;
  }

  return "casual_ugc" as const;
}

function scoreUgcText(text: string) {
  const normalized = safeString(text).toLowerCase();
  let score = 5;

  if (/guarantee|cash[- ]flow|off-market|approved|credit|qualify|sell/.test(normalized)) score += 2;
  if (/most|stop|before|wrong|faster|better/.test(normalized)) score += 1;
  if (!/quick one|nobody is talking about|claim your buyer list/.test(normalized)) score += 2;

  return score;
}

function inferLooseOfferClassFromText(text: string): OfferClass {
  const normalized = safeString(text).toLowerCase();

  if (/\bapproval|approved|credit|mortgage|qualif|pre-approv|down payment|deposit\b/.test(normalized)) {
    return "approval";
  }

  if (/\binvestor|cash ?flow|off-market|cap rate|underwriting|yield|deal flow|rental\b/.test(normalized)) {
    return "investor";
  }

  if (/\bseller|sell|homeowner|listing|buyer network|home value|price update\b/.test(normalized)) {
    return "seller";
  }

  if (/\bfirst[\s-]*time|new buyer|starter|renting|renters\b/.test(normalized)) {
    return "first_time_buyer";
  }

  return "buyer";
}

function getUgcFallbackSections(offerClass: OfferClass) {
  if (offerClass === "approval" || offerClass === "first_time_buyer") {
    return {
      hook: "First-time buyers: stop touring homes before you know what you qualify for.",
      problem: "Most first-time buyers waste time on listings that never fit their approval path.",
      mechanism: "We start with an approval-first buying plan so you know your number, payment range, and best next move first.",
      cta: "See if you qualify now.",
    };
  }

  if (offerClass === "seller") {
    return {
      hook: "Homeowners: do not list before you see this first.",
      problem: "Most sellers either price too low, sit too long, or launch before real demand is measured.",
      mechanism: "We use a pre-market pricing and demand plan so you know how to position the home before it goes live.",
      cta: "Get your sale plan now.",
    };
  }

  if (offerClass === "investor") {
    return {
      hook: "Investors: look at this before you put more capital into the next deal.",
      problem: "Most investors see polished listings, not the real numbers that decide whether the deal actually works.",
      mechanism: "We filter opportunities through yield, downside, and micro-market data before a deal ever reaches your shortlist.",
      cta: "Review the deal breakdown now.",
    };
  }

  return {
    hook: "Buyers: watch this before you make the wrong move.",
    problem: "Most buyers react too late and miss the strongest-fit homes before they move.",
    mechanism: "We use a tighter property-match process so the right homes surface faster and the dead-end options fall away early.",
    cta: "See homes that match now.",
  };
}

function buildUgcVariations(lines: string[]) {
  const cleanLines = lines.map((line) => safeString(line)).filter(Boolean);
  const offerClass = inferLooseOfferClassFromText(cleanLines.join(" "));
  const fallback = getUgcFallbackSections(offerClass);
  const first = cleanLines[0] || fallback.hook;
  const second = cleanLines[1] || `${fallback.problem} ${fallback.mechanism}`;
  const third = cleanLines[2] || fallback.cta;
  const style = detectScriptStyle(cleanLines);
  const mechanismLine = sanitizeScriptLine(
    second,
    `${fallback.problem} ${fallback.mechanism}`,
  );
  const proofLine = sanitizeScriptLine(
    cleanLines[3]
      || (offerClass === "approval" || offerClass === "first_time_buyer"
        ? "That means you stop guessing and move on homes that actually fit your approval path"
        : offerClass === "seller"
          ? "That gives you clearer pricing, cleaner timing, and a stronger launch before stale-listing risk shows up"
          : offerClass === "investor"
            ? "That lets you review the yield logic and downside before tying up capital in the wrong deal"
            : "That gives you more clarity on fit, timing, and next step before the broader market reacts"),
    offerClass === "approval" || offerClass === "first_time_buyer"
      ? "That means you stop guessing and move on homes that actually fit your approval path"
      : offerClass === "seller"
        ? "That gives you clearer pricing, cleaner timing, and a stronger launch before stale-listing risk shows up"
        : offerClass === "investor"
          ? "That lets you review the yield logic and downside before tying up capital in the wrong deal"
          : "That gives you more clarity on fit, timing, and next step before the broader market reacts",
  );
  const ctaLine = sanitizeScriptLine(third, fallback.cta);

  const variations: UGCScriptOutput[] = [
    {
      hook: sanitizeScriptLine(first, fallback.hook),
      body: sanitizeScriptLine(
        `${mechanismLine} ${proofLine}`,
        `${fallback.mechanism} ${proofLine}`,
      ),
      cta: ctaLine,
      style,
    },
    {
      hook: sanitizeScriptLine(
        offerClass === "approval" || offerClass === "first_time_buyer"
          ? "If you are a first-time buyer, stop starting with listings before your number is clear"
          : offerClass === "seller"
            ? "If you want to sell, stop following the same launch process as everyone else"
            : offerClass === "investor"
              ? "If you are serious about returns, stop following the same deal process as everyone else"
              : "If you are serious about buying, stop following the same slow process as everyone else",
        fallback.hook,
      ),
      body: sanitizeScriptLine(
        `${sanitizeScriptLine(first, fallback.hook)} ${mechanismLine}`,
        `${fallback.problem} ${fallback.mechanism}`,
      ),
      cta: ctaLine,
      style: "pain_first",
    },
    {
      hook: sanitizeScriptLine(
        offerClass === "approval" || offerClass === "first_time_buyer"
          ? "Here is the move that helps first-time buyers get approval clarity before they shop"
          : offerClass === "seller"
            ? "Here is the move that helps sellers launch with a stronger plan"
            : offerClass === "investor"
              ? "Here is the move that helps investors screen the right deals faster"
              : "Here is the move that helps serious buyers get to the right opportunities faster",
        fallback.hook,
      ),
      body: sanitizeScriptLine(
        `${mechanismLine} ${proofLine}`,
        `${fallback.mechanism} ${proofLine}`,
      ),
      cta: ctaLine,
      style: "founder_expert",
    },
  ];

  return variations.sort((left, right) => {
    const rightScore = scoreUgcText(`${right.hook} ${right.body} ${right.cta}`);
    const leftScore = scoreUgcText(`${left.hook} ${left.body} ${left.cta}`);
    return rightScore - leftScore;
  });
}

export function generateUGCScript(primaryText: string): UGCScriptOutput {
  const lines = splitCopyLines(primaryText);
  const offerClass = inferLooseOfferClassFromText(primaryText);
  const fallback = getUgcFallbackSections(offerClass);
  const fallbackHook = ensureSentence(fallback.hook);
  const fallbackBody = ensureSentence(`${fallback.problem} ${fallback.mechanism}`);
  const fallbackCta = ensureSentence(fallback.cta);

  if (lines.length === 0) {
    return {
      hook: fallbackHook,
      body: fallbackBody,
      cta: fallbackCta,
      style: "casual_ugc",
    };
  }

  const ctaCandidate = lines.findLast((line) =>
    /click|tap|book|get|claim|see|check|comment|apply|qualif/i.test(line),
  );
  const middleLines = lines.filter((line) => line !== lines[0] && line !== ctaCandidate);
  const seededLines = [
    sanitizeScriptLine(lines[0] || fallbackHook, fallbackHook),
    sanitizeScriptLine(middleLines.join(" ") || lines[1] || fallbackBody, fallbackBody),
    sanitizeScriptLine(ctaCandidate || lines[lines.length - 1] || fallbackCta, fallbackCta),
  ];

  return buildUgcVariations(seededLines)[0] ?? {
    hook: fallbackHook,
    body: fallbackBody,
    cta: fallbackCta,
    style: "casual_ugc",
  };
}

export function buildScenes(script: UGCScriptOutput): UGCScene[] {
  const hook = sanitizeScriptLine(script.hook, "Most people miss the best opportunities because they move too late");
  const body = sanitizeScriptLine(script.body, "We filter the market around the offer so the strongest options show up first");
  const cta = sanitizeScriptLine(script.cta, "See what is available now");

  return [
    { type: "hook", text: hook },
    { type: "body", text: body },
    { type: "cta", text: cta },
  ];
}

function ensureSentence(value: string) {
  const trimmed = safeString(value).replace(/[.!?]+$/, "");
  return trimmed ? `${trimmed}.` : "";
}

function clampScore(value: number) {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function toLower(value: string) {
  return safeString(value).toLowerCase();
}

function inferMarketType(params: {
  audience: string;
  offer: string;
  provided?: CampaignIntent;
}) {
  if (params.provided) {
    return params.provided;
  }

  const audience = toLower(params.audience);
  const offer = toLower(params.offer);

  if (/seller|homeowner|listing|sell/.test(audience) || /sell|buyer network|home sold/.test(offer)) {
    return "seller" as const;
  }

  if (/investor|cashflow|rental|off-market/.test(audience) || /cashflow|off-market|deal flow/.test(offer)) {
    return "investor" as const;
  }

  return "buyer" as const;
}

function classifyOffer(input: RequiredInput): OfferClass {
  const offer = toLower(input.offer);
  const audience = toLower(input.audience);

  if (input.marketType === "investor" || /investor|cashflow|cash flow|off-market|rental/.test(offer + audience)) {
    return "investor";
  }

  if (/approval|approved|credit|mortgage|refinance|qualif/.test(offer + audience)) {
    return "approval";
  }

  if (input.marketType === "seller" || /seller|sell|homeowner|listing|buyer network/.test(offer + audience)) {
    return "seller";
  }

  if (/first[\s-]*time|new buyer|starter/.test(audience)) {
    return "first_time_buyer";
  }

  return "buyer";
}

function normalizeInput(input?: CopyEngineInput | null): RequiredInput {
  const audience = normalizeAudienceInput(normalizeText(input?.audience, "qualified buyers"));
  const offer = normalizeOfferInput(normalizeText(input?.offer, "a stronger real estate opportunity"));

  return {
    creatives: Array.isArray(input?.creatives) ? input!.creatives : [],
    location: normalizeMarket(normalizeText(input?.location, "your market")),
    audience,
    offer,
    pricePoint: normalizeLooseInput(normalizeText(input?.price_point)),
    marketType: inferMarketType({
      audience,
      offer,
      provided: input?.market_type,
    }),
    funnelGoal: input?.funnel_goal ?? "survey",
    riskReversal: normalizeText(input?.risk_reversal),
    mechanism: normalizeText(input?.mechanism),
    urgency: normalizeText(input?.urgency),
  };
}

function buildRiskReversal(input: RequiredInput) {
  if (input.riskReversal) {
    return ensureSentence(input.riskReversal);
  }

  const offer = toLower(input.offer);

  if (input.marketType === "seller" && /guarantee|90 days|sold/.test(offer)) {
    return "If it doesn't sell, you don't pay.";
  }

  if (input.marketType === "buyer" && /qualif|approval|credit/.test(offer)) {
    return "No downside if your profile does not qualify.";
  }

  return "";
}

function buildOfferLedPromise(input: RequiredInput) {
  const offer = safeString(input.offer);
  const normalized = toLower(offer);
  const extracted = extractOfferData(offer);
  const offerClass = classifyOffer(input);
  const timeline = extracted.timeline ? ` in ${extracted.timeline}` : "";

  if (offerClass === "investor") {
    if (/guarantee|guaranteed/.test(normalized) && /cash ?flow/.test(normalized)) {
      return `We guarantee you a cash-flow positive property${timeline}`;
    }

    if (/off-market/.test(normalized)) {
      return `Get access to off-market investment properties in ${input.location}`;
    }

    if (/cash ?flow/.test(normalized)) {
      return `See cash-flow positive properties in ${input.location}`;
    }
  }

  if (offerClass === "approval") {
    if (extracted.creditScore) {
      return `Get approved with just a ${extracted.creditScore}+ credit score`;
    }

    return enhanceOffer(offer, "buyer") || `Get approved faster in ${input.location}`;
  }

  if (offerClass === "seller") {
    return enhanceOffer(offer, "seller") || `Sell your home faster in ${input.location}`;
  }

  return enhanceOffer(offer, input.marketType) || ensureSentence(offer);
}

function buildDynamicApprovalHeadline(input: RequiredInput) {
  const data = extractOfferData(input.offer);

  if (!data.creditScore) {
    return "";
  }

  const propertyLabel = input.pricePoint ? `a home ${input.pricePoint}` : "a condo";
  return `Get Approved for ${propertyLabel} with Just a ${data.creditScore}+ Credit Score`;
}

function buildTimelineHeadline(input: RequiredInput) {
  const data = extractOfferData(input.offer);

  if (!data.timeline) {
    return "";
  }

  if (input.marketType === "seller") {
    return `Sell Your Home in ${data.timeline} or Less`;
  }

  return `Move Faster in ${input.location} with a ${data.timeline} Plan`;
}

function sharpenOffer(input: RequiredInput) {
  const offer = normalizeText(input.offer, "a stronger offer");
  const normalized = toLower(offer);
  const extracted = extractOfferData(offer);
  const offerClass = classifyOffer(input);

  if (offerClass === "investor") {
    if (/guarantee|guaranteed/.test(normalized) && /cash ?flow/.test(normalized)) {
      return `We guarantee you a cash-flow positive property${extracted.timeline ? ` in ${extracted.timeline}` : ""}.`;
    }

    if (/off-market/.test(normalized)) {
      return `Get off-market investment opportunities in ${input.location} before other investors move.`;
    }

    if (/cash ?flow/.test(normalized)) {
      return `See investment properties in ${input.location} that are built for cash flow.`;
    }
  }

  if (offerClass === "approval") {
    if (extracted.creditScore) {
      return `Get approved for the right property with just a ${extracted.creditScore}+ credit score.`;
    }

    return ensureSentence(enhanceOffer(offer, "buyer") || offer);
  }

  if (offerClass === "seller" && /off market buyers|buyer network/.test(normalized)) {
    return "Access our off-market buyer network and put your home in front of serious buyers.";
  }

  return ensureSentence(buildOfferLedPromise(input) || offer);
}

function buildProblem(input: RequiredInput) {
  return buildProblemLine(input);
}

function buildMechanism(input: RequiredInput) {
  return buildMechanismLine(input);
}

function buildOfferBlock(input: RequiredInput) {
  const sharpened = sharpenOffer(input);
  const risk = buildRiskReversal(input);
  return [sharpened, risk].filter(Boolean).join(" ");
}

function buildCta(input: RequiredInput) {
  const category = inferCampaignCategory({
    intent: input.marketType,
    audience: input.audience,
    propertyType: input.offer,
    keyOffer: input.offer,
    mechanism: input.mechanism,
  });

  if (category === "seller") return "Get My Sale Plan";
  if (category === "investor") return "Review The Deal Breakdown";
  if (category === "precon") return "See The Deposit Plan";
  if (category === "luxury") return "Request Private Access";
  if (classifyOffer(input) === "approval") return "See If You Qualify";
  return "See Homes That Match";
}

function buildHookVariations(input: RequiredInput, offerBlock: string): ScoredVariation[] {
  const location = input.location;
  const audience = buildPersonaLabel(input);
  const category = inferCampaignCategory({
    intent: input.marketType,
    audience: input.audience,
    propertyType: input.offer,
    keyOffer: input.offer,
    mechanism: input.mechanism,
  });
  const rulePack = getCategoryRulePack(category);
  const directPersonaHooks = [
    {
      text: buildHookLine(input),
      reason: "Persona-led hook that calls out the ICP immediately.",
    },
    {
      text: buildProblemLine(input).replace(/^Most\s+/i, ""),
      reason: "Pain-led hook that opens with the real friction point.",
    },
    {
      text: trimWords(sharpenOffer(input).replace(/[.!?]+$/, ""), 12),
      reason: "Offer-led hook that opens on the concrete promise or claim.",
    },
  ];
  const patterns = [
    ...directPersonaHooks,
    ...rulePack.approvedHookStructures.slice(0, 5).map((pattern, index) => ({
      text: fillRulePattern(pattern, {
        audience: audience || "buyers",
        propertyType: input.offer || "homes",
      keyOffer: offerBlock || input.offer,
      market: location,
      mechanism: input.mechanism || rulePack.approvedMechanismStyles[0] || "process",
    }),
      reason:
        index === 0
          ? `Situation-based hook built from the ${category} rule pack.`
          : `Rule-pack variation tied to the ${rulePack.winningAngles[index] ?? rulePack.winningAngles[0]} angle.`,
    })),
  ];

  return patterns.map((pattern) => ({
    ...pattern,
    ...scoreVariation(pattern.text, input),
  }));
}

function buildHeadlineVariations(input: RequiredInput, offerBlock: string): ScoredVariation[] {
  const extracted = extractOfferData(input.offer);
  const base = input.marketType === "seller"
    ? [
        {
          text: offerBlock,
          reason: "Recommended because it is offer-first and direct-response ready.",
        },
        {
          text: `Get your home sold with a stronger plan in ${input.location}.`,
          reason: "Direct seller outcome with market specificity.",
        },
        {
          text: `Reach qualified buyers faster in ${input.location}.`,
          reason: "Clear seller benefit without filler.",
        },
      ]
    : [
        {
          text: offerBlock,
          reason: "Recommended because it leads with the clearest promise.",
        },
        ...(extracted.pricePoint
          ? [
              {
                text: `See homes ${extracted.pricePoint} in ${input.location}.`,
                reason: "Keeps the exact price anchor and market in the headline.",
              },
              {
                text: `Find better-fit homes ${extracted.pricePoint} in ${input.location}.`,
                reason: "Specific buyer outcome with the real price anchor preserved.",
              },
            ]
          : []),
        {
          text: `We build you a faster path to ${input.offer} in ${input.location}.`,
          reason: "Outcome-led headline with stronger direct-response framing.",
        },
        {
          text: `Get a tighter buying system for ${input.offer} in ${input.location}.`,
          reason: "Mechanism-led headline with clearer promise strength.",
        },
      ];

  return base.map((variation) => ({
    ...variation,
    ...scoreVariation(variation.text, input),
  }));
}

function buildOfferVariations(input: RequiredInput): ScoredVariation[] {
  const enhanced = sharpenOffer(input);
  const generated = generateOfferVariations(input.offer, input.marketType);
  const uniqueTexts = Array.from(
    new Set(
      [enhanced, ...generated]
        .map((value) => safeString(value))
        .filter(Boolean),
    ),
  );

  return uniqueTexts.map((text) => ({
    text: ensureSentence(text),
    reason: /guarantee|don’t pay|buy it/i.test(text)
      ? "Includes a guarantee and risk reversal."
      : "Enhances the actual offer without replacing the core promise.",
    ...scoreVariation(text, input),
  }));
}

function buildPrimaryTextVariations(input: RequiredInput, sections: {
  hook: string;
  problem: string;
  mechanism: string;
  offer: string;
  cta: string;
}): ScoredVariation[] {
  const hookLine = ensureSentence(sections.hook);
  const problemLine = ensureSentence(sections.problem);
  const mechanismLine = ensureSentence(sections.mechanism);
  const offerLine = ensureSentence(sections.offer);
  const ctaLine = ensureSentence(sections.cta);
  const proofLine = ensureSentence(buildProofLine(input));

  const variations = [
    {
      text: [hookLine, problemLine, mechanismLine, proofLine, ctaLine].join("\n\n"),
      reason: "Recommended because it follows the full pattern interrupt → problem → mechanism → proof → CTA structure.",
    },
    {
      text: [hookLine, problemLine, proofLine, ctaLine].join("\n\n"),
      reason: "Shorter version that keeps tension, proof, and CTA tight.",
    },
    {
      text: [hookLine, mechanismLine, proofLine, ctaLine].join("\n\n"),
      reason: "Mechanism-led variation for colder traffic that still keeps the CTA direct.",
    },
    {
      text: [hookLine, problemLine, mechanismLine, offerLine, ctaLine].join("\n\n"),
      reason: "Faster-moving version that leads with mechanism and offer strength.",
    },
    {
      text: [hookLine, problemLine, offerLine, proofLine, ctaLine].join("\n\n"),
      reason: "Offer-led version that keeps proof closer to the call to act.",
    },
  ];

  return variations.map((variation) => ({
    ...variation,
    ...scoreVariation(variation.text, input),
  }));
}

function buildSubheadlineVariations(input: RequiredInput, mechanism: string): ScoredVariation[] {
  const location = input.location;
  const offer = buildOfferBlock(input);
  const audience = buildPersonaLabel(input).replace(/-/g, " ");
  const category = inferCampaignCategory({
    intent: input.marketType,
    audience: input.audience,
    propertyType: input.offer,
    keyOffer: input.offer,
    mechanism: input.mechanism,
  });
  const rulePack = getCategoryRulePack(category);
  const proof = rulePack.proofStyles[0] ?? "proof";
  const variations = [
    {
      text: `${ensureSentence(mechanism)} This helps ${audience || "buyers"} in ${location} move with more certainty before they waste time on the wrong path.`,
      reason: "Mechanism-led subheadline that reduces uncertainty.",
    },
    {
      text: `${offer} with ${proof.toLowerCase()} and a cleaner next step before the broader market reacts.`,
      reason: "Offer and proof combined in one lower-friction line.",
    },
    {
      text: `Built for ${audience || "buyers"} in ${location} who want less wasted motion, a clearer process, and a direct path to the right move.`,
      reason: "Outcome-led framing that keeps commitment low.",
    },
  ];

  return variations.map((variation) => ({
    ...variation,
    ...scoreVariation(variation.text, input),
  }));
}

function scoreVariation(
  text: string,
  input: RequiredInput,
): {
  score: number;
  breakdown: CopyScoreBreakdown;
} {
  const normalized = toLower(text);
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sentences = normalized
    .split(/[.!?]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const words = normalized.split(/\s+/).filter(Boolean);
  const offerTokens = toLower(input.offer)
    .split(/[^a-z0-9+]+/)
    .filter((token) => token.length > 3);
  const audienceTokens = toLower(input.audience)
    .split(/[^a-z0-9+]+/)
    .filter((token) => token.length > 3);
  const locationToken = toLower(input.location);

  let clarity = 8;
  let specificity = 4;
  let offerStrength = 4;
  let directResponse = 4;

  if (words.length <= 12) {
    clarity += 2;
  } else if (words.length <= 24) {
    clarity += 1;
  } else if (words.length > 45) {
    clarity -= 2;
  }

  if (sentences.every((sentence) => sentence.split(/\s+/).length <= 18)) {
    clarity += 1;
  }

  if (!/unlock|experience|we help you|dream|excellence|nobody is talking about|learn more about our process/.test(normalized)) {
    clarity += 1;
  } else {
    clarity -= 3;
  }

  if (locationToken && normalized.includes(locationToken)) {
    specificity += 3;
  }

  if (audienceTokens.some((token) => normalized.includes(token))) {
    specificity += 2;
  }

  if (
    /90 days|under \$|under £|under €|pre-qualified|qualified buyers|off-market|cashflow|\d+\+?\s*credit|before the public/.test(
      normalized,
    )
  ) {
    specificity += 3;
  }

  if (input.pricePoint && normalized.includes(toLower(input.pricePoint))) {
    specificity += 2;
  }

  if (offerTokens.some((token) => normalized.includes(token))) {
    offerStrength += 3;
  }

  if (/guarantee|guaranteed|or we.?ll buy it|don.?t pay|risk|qualifies/.test(normalized)) {
    offerStrength += 3;
  }

  if (/access|buyers|homes|sale plan|cash-flow|cashflow|qualify|off-market|home value|investor deals/.test(normalized)) {
    offerStrength += 2;
  }

  if (/get access|see if|check|claim|get your|today|before|stop|qualif|view off-market|cash-flow deals|available homes/.test(normalized)) {
    directResponse += 3;
  }

  if (/most|longer|overpay|lose buyers|sit on the market|wrong condo|margin is gone/.test(normalized)) {
    directResponse += 2;
  }

  if (/(learn more|discover more|find out more)$/.test(normalized) || /learn more/.test(normalized)) {
    directResponse -= 3;
  }

  if (lines.length >= 3) {
    directResponse += 1;
  }

  clarity = clampScore(clarity);
  specificity = clampScore(specificity);
  offerStrength = clampScore(offerStrength);
  directResponse = clampScore(directResponse);

  const score = Number(
    (
      clarity * 0.3 +
      specificity * 0.2 +
      offerStrength * 0.3 +
      directResponse * 0.2
    ).toFixed(1),
  );

  return {
    score,
    breakdown: {
      clarity,
      specificity,
      offerStrength,
      directResponse,
    },
  };
}

function pickBestVariation(variations: ScoredVariation[]) {
  return rankVariations(variations)[0];
}

function rankVariations(variations: ScoredVariation[]) {
  return [...variations].sort((left, right) => right.score - left.score);
}

function comparableText(value: string) {
  return safeString(value)
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickImprovedVariation(variations: ScoredVariation[], currentText: string) {
  const current = comparableText(currentText);

  return (
    rankVariations(variations).find((variation) => comparableText(variation.text) !== current)
    || rankVariations(variations)[0]
  );
}

function preservesOfferSpecificity(candidate: string, input: RequiredInput, currentText = "") {
  const offer = safeString(input.offer);
  const current = safeString(currentText);
  const candidateNormalized = safeString(candidate).toLowerCase().replace(/\s+/g, "");
  const currentNormalized = current.toLowerCase().replace(/\s+/g, "");
  const extracted = extractOfferData(offer);

  if (extracted.pricePoint) {
    const normalizedPricePoint = extracted.pricePoint.toLowerCase().replace(/\s+/g, "");
    if (!candidateNormalized.includes(normalizedPricePoint)) {
      return false;
    }
  }

  const requiredTerms = offer
    .toLowerCase()
    .match(/under|below|over|credit|approved|cash ?flow|off-market/g);

  if (requiredTerms?.length) {
    for (const term of requiredTerms) {
      const normalizedTerm = term.replace(/\s+/g, "");
      if (currentNormalized.includes(normalizedTerm) && !candidateNormalized.includes(normalizedTerm)) {
        return false;
      }
    }
  }

  return true;
}

function pickImprovedVariationWithGuardrails(
  variations: ScoredVariation[],
  currentText: string,
  input: RequiredInput,
) {
  const current = comparableText(currentText);
  const currentScore = scoreVariation(currentText, input).score;

  return rankVariations(variations).find((variation) =>
    comparableText(variation.text) !== current
      && variation.score >= currentScore
      && preservesOfferSpecificity(variation.text, input, currentText),
  );
}

function toOverlayLine(value: string) {
  return trimWords(
    ensureSentence(value).replace(/[.!?]+$/, ""),
    7,
  );
}

function buildImprovedPrimaryText(
  input: RequiredInput,
  currentText: string,
  assistant: CreativeCopyAssistantOutput,
) {
  const lines = splitCopyLines(currentText);
  const currentHook = lines[0] || assistant.hook;
  const improvedHook =
    pickImprovedVariation(buildHookVariations(input, assistant.offer), currentHook)?.text
    || assistant.hook;

  const variations = buildPrimaryTextVariations(input, {
    hook: improvedHook,
    problem: assistant.problem,
    mechanism: assistant.mechanism,
    offer: assistant.offer,
    cta: assistant.cta,
  });

  return pickImprovedVariation(variations, currentText)?.text || assistant.alternatives.primaryText[0]?.text || currentText;
}

function buildOfferTokens(offer: string) {
  return safeString(offer)
    .toLowerCase()
    .split(/[^a-z0-9$+]+/)
    .filter((token) => token.length > 2)
    .filter((token) => !["the", "and", "for", "with", "your"].includes(token));
}

function hasOfferSignal(text: string, input: RequiredInput) {
  const normalized = toLower(text);
  const extracted = extractOfferData(input.offer);

  if (extracted.pricePoint && normalized.includes(toLower(extracted.pricePoint))) {
    return true;
  }

  const tokens = buildOfferTokens(input.offer);
  return tokens.some((token) => normalized.includes(token));
}

function hasWeakHook(text: string) {
  const normalized = toLower(text);
  return (
    normalized.length < 18
    || /^(learn more|discover|attention|are you ready|looking for|want to)\b/.test(normalized)
    || /quick one|nobody is talking about|claim your buyer list|dream home|unlock your future/.test(normalized)
  );
}

function hasWeakCta(text: string) {
  const normalized = toLower(text);
  return (
    !/(see|get|book|apply|view|reach|watch|start|qualify|find)/.test(normalized)
    || /learn more|discover more|click here|submit|contact us/.test(normalized)
  );
}

function hasAudienceDrift(text: string, input: RequiredInput) {
  const normalized = toLower(text);
  const offerClass = classifyOffer(input);

  if (offerClass !== "approval" && /\bcredit|approved|approval|qualify\b/.test(normalized)) {
    return true;
  }

  if (offerClass !== "investor" && /\bcash ?flow|off-market|cap rate|underwriting\b/.test(normalized)) {
    return true;
  }

  if (offerClass !== "seller" && /\bsell your home|listing strategy|buyer network\b/.test(normalized)) {
    return true;
  }

  return false;
}

function hasGenericCopy(text: string) {
  const normalized = toLower(text);
  return /tailored solution|trusted team|best-in-class|seamless process|we help you|results that matter|designed to help/.test(normalized);
}

type GptCopyValidation = {
  accepted: boolean;
  score: number;
  failures: string[];
};

function validateGptCopyAssistantEnhancement(
  input: RequiredInput,
  candidate: GptCopyAssistantEnhancement,
): GptCopyValidation {
  const failures: string[] = [];
  let score = 10;

  if (!hasOfferSignal(`${candidate.offer} ${candidate.headline} ${candidate.primaryText}`, input)) {
    failures.push("Output does not preserve the actual offer.");
    score -= 4;
  }

  if (hasWeakHook(candidate.hook)) {
    failures.push("Hook is too weak or generic.");
    score -= 2;
  }

  if (hasWeakCta(candidate.cta)) {
    failures.push("CTA is weak or not direct-response.");
    score -= 2;
  }

  if (
    hasGenericCopy(candidate.hook)
    || hasGenericCopy(candidate.subheadline)
    || hasGenericCopy(candidate.primaryText)
  ) {
    failures.push("Output is too generic.");
    score -= 2;
  }

  if (
    hasAudienceDrift(candidate.problem, input)
    || hasAudienceDrift(candidate.mechanism, input)
    || hasAudienceDrift(candidate.offer, input)
    || hasAudienceDrift(candidate.primaryText, input)
  ) {
    failures.push("Output drifted into the wrong audience or offer logic.");
    score -= 4;
  }

  return {
    accepted: failures.length === 0 && score >= 6,
    score,
    failures,
  };
}

export function buildUGCPrompt(params: {
  offer: string;
  audience: string;
  market: string;
  marketType?: CampaignIntent;
  mechanism?: string;
  base: CreativeCopyAssistantOutput;
  attempt?: number;
  previousFailures?: string[];
}) {
  const retryBlock = params.attempt && params.previousFailures?.length
    ? `Previous attempt failed for these reasons:\n- ${params.previousFailures.join("\n- ")}\nFix all of them.\n`
    : "";

  return `
Write a high-converting real-estate UGC ad package.

Offer: ${params.offer}
Audience: ${params.audience}
Market: ${params.market}
Intent: ${params.marketType ?? "buyer"}
Mechanism: ${params.mechanism || "Use the most direct mechanism that matches the offer."}

Rules:
- Strong hook
- Real pain point
- Clear mechanism
- Must include the real offer
- Direct CTA
- No generic phrases
- No filler language
- Do not drift into mortgage, credit, seller, or investor language unless the offer truly requires it
- Keep the language specific, sales-ready, and realistic

Structure:
Hook
Problem
Mechanism
Offer
CTA

Use this deterministic baseline as quality context, but improve it:
${JSON.stringify({
    hook: params.base.hook,
    problem: params.base.problem,
    mechanism: params.base.mechanism,
    offer: params.base.offer,
    cta: params.base.cta,
    headline: params.base.headline,
    subheadline: params.base.subheadline,
  })}

${retryBlock}
Return JSON only with this exact shape:
{
  "hook": "string",
  "problem": "string",
  "mechanism": "string",
  "offer": "string",
  "cta": "string",
  "headline": "string",
  "subheadline": "string",
  "primaryText": "string",
  "recommendationWhy": "string"
}
`.trim();
}

export async function generateCreativeCopyAssistantGptEnhancement(
  input?: CreativeCopyAssistantInput | null,
  baseInput?: CreativeCopyAssistantOutput,
): Promise<GptCopyAssistantEnhancement | null> {
  const normalized = normalizeInput({
    location: input?.location ?? input?.market ?? "",
    audience: input?.audience ?? "",
    offer: input?.offer ?? "",
    price_point: input?.price_point,
    market_type: input?.market_type,
    funnel_goal: input?.funnel_goal,
    risk_reversal: input?.risk_reversal,
    mechanism: input?.mechanism,
    urgency: input?.urgency,
    creatives: [],
  });
  const base = baseInput ?? generateCreativeCopyAssistant(input);
  let previousFailures: string[] = [];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await generateAiJson([
      {
        role: "system",
        content:
          "You are a real-estate copy chief. Produce direct-response copy that stays faithful to the exact offer, audience, and market. Return JSON only.",
      },
      {
        role: "user",
        content: buildUGCPrompt({
          offer: normalized.offer,
          audience: normalized.audience,
          market: normalized.location,
          marketType: normalized.marketType,
          mechanism: normalized.mechanism,
          base,
          attempt,
          previousFailures,
        }),
      },
    ]);

    if (!response.ok || !response.content) {
      return null;
    }

    try {
      const parsed = gptCopyAssistantSchema.parse(JSON.parse(response.content));
      const candidate: GptCopyAssistantEnhancement = {
        hook: safeString(parsed.hook) || base.hook,
        problem: safeString(parsed.problem) || base.problem,
        mechanism: safeString(parsed.mechanism) || base.mechanism,
        offer: safeString(parsed.offer) || base.offer,
        cta: safeString(parsed.cta) || base.cta,
        headline: safeString(parsed.headline) || base.headline,
        subheadline: safeString(parsed.subheadline) || base.subheadline,
        primaryText: safeString(parsed.primaryText)
          || [safeString(parsed.hook), safeString(parsed.problem), safeString(parsed.mechanism), safeString(parsed.offer), safeString(parsed.cta)]
            .filter(Boolean)
            .join("\n\n")
          || base.alternatives.primaryText[0]?.text
          || "",
        recommendationWhy: safeString(parsed.recommendationWhy) || "Selected for stronger direct-response quality.",
      };

      const validation = validateGptCopyAssistantEnhancement(normalized, candidate);
      if (validation.accepted) {
        return candidate;
      }

      previousFailures = validation.failures;
      logWarn("GPT copy enhancement rejected", {
        score: validation.score,
        failures: validation.failures,
      });
    } catch {
      logWarn("GPT copy enhancement parse failed");
      return null;
    }
  }

  return null;
}

export function generateCreativeCopyAssistant(
  input?: CreativeCopyAssistantInput | null,
): CreativeCopyAssistantOutput {
  const normalized = normalizeInput({
    location: input?.location ?? input?.market ?? "",
    audience: input?.audience ?? "",
    offer: input?.offer ?? "",
    price_point: input?.price_point,
    market_type: input?.market_type,
    funnel_goal: input?.funnel_goal,
    risk_reversal: input?.risk_reversal,
    mechanism: input?.mechanism,
    urgency: input?.urgency,
    creatives: [],
  });
  const problem = buildProblem(normalized);
  const mechanism = buildMechanism(normalized);
  const offer = buildOfferBlock(normalized);
  const cta = buildCta(normalized);
  const offerVariations = buildOfferVariations(normalized);
  const headlineVariations = buildHeadlineVariations(normalized, offer);
  const hookVariations = buildHookVariations(normalized, offer);
  const subheadlineVariations = buildSubheadlineVariations(normalized, mechanism);
  const rankedOfferVariations = rankVariations(offerVariations);
  const rankedHeadlineVariations = rankVariations(headlineVariations);
  const rankedHookVariations = rankVariations(hookVariations);
  const rankedSubheadlineVariations = rankVariations(subheadlineVariations);
  const bestHeadline = pickBestVariation(rankedHeadlineVariations);
  const bestHook = pickBestVariation(rankedHookVariations);
  const bestSubheadline = pickBestVariation(rankedSubheadlineVariations);
  const primaryTextVariations = buildPrimaryTextVariations(normalized, {
    hook: bestHook.text,
    problem,
    mechanism,
    offer,
    cta,
  });
  const rankedPrimaryTextVariations = rankVariations(primaryTextVariations);
  const bestPrimaryText = pickBestVariation(rankedPrimaryTextVariations);
  const bestOffer = pickBestVariation(rankedOfferVariations);

  return {
    hook: bestHook.text,
    problem,
    mechanism,
    solution: mechanism,
    offer: bestOffer.text,
    cta,
    headline: bestHeadline.text,
    subheadline: bestSubheadline.text,
    recommendationWhy: `Selected because it scored highest for offer alignment, direct-response strength, and specificity. ${bestHook.reason}`,
    alternatives: {
      offer: rankedOfferVariations,
      headline: rankedHeadlineVariations,
      subheadline: rankedSubheadlineVariations,
      hook: rankedHookVariations,
      primaryText: rankedPrimaryTextVariations,
    },
  };
}

export function improveCopyText(
  text: string,
  type: ImproveCopyFieldType = "hook",
  input?: CreativeCopyAssistantInput | null,
) {
  const normalized = normalizeInput({
    location: input?.location ?? input?.market ?? "",
    audience: input?.audience ?? "",
    offer: input?.offer ?? "",
    price_point: input?.price_point,
    market_type: input?.market_type,
    funnel_goal: input?.funnel_goal,
    risk_reversal: input?.risk_reversal,
    mechanism: input?.mechanism,
    urgency: input?.urgency,
    creatives: [],
  });
  const assistant = generateCreativeCopyAssistant(input);
  const currentText = safeString(text);

  if (type === "primary") {
    return buildImprovedPrimaryText(normalized, currentText, assistant);
  }

  if (type === "script") {
    const improvedPrimary = buildImprovedPrimaryText(normalized, currentText, assistant);
    const script = generateUGCScript(improvedPrimary);
    return [script.hook, script.body, script.cta].filter(Boolean).join("\n");
  }

  if (type === "headline") {
    return pickImprovedVariationWithGuardrails(assistant.alternatives.headline, currentText, normalized)?.text
      || (preservesOfferSpecificity(assistant.headline, normalized, currentText) ? assistant.headline : currentText);
  }

  if (type === "overlay") {
    const improvedHook =
      pickImprovedVariationWithGuardrails(assistant.alternatives.hook, currentText, normalized)?.text
      || assistant.hook;
    return toOverlayLine(improvedHook);
  }

  return pickImprovedVariationWithGuardrails(assistant.alternatives.hook, currentText, normalized)?.text
    || (preservesOfferSpecificity(assistant.hook, normalized, currentText) ? assistant.hook : currentText);
}

export function generateAdCopy(input?: CopyEngineInput | null): AdCopyOutput[] {
  const normalized = normalizeInput(input);

  return (normalized.creatives || []).filter(Boolean).map((creative) => {
    const creativeInput = {
      ...normalized,
      creatives: [creative],
    };
    const assistant = generateCreativeCopyAssistant(creativeInput);
    const ugcScript = buildUgcFromInput(normalized, creative);
    const cta = buildCta(normalized);
    const hook = creative?.hook
      ? ensureSentence(creative.hook).replace(/\.$/, "")
      : assistant.hook;
    const primaryText =
      assistant.alternatives.primaryText[0]?.text ||
      [
        hook,
        buildProblemLine(normalized),
        buildMechanismLine(normalized),
        buildProofLine(normalized),
        cta,
      ].join("\n\n");

    return {
      hook,
      primary_text: primaryText,
      script: [ugcScript.hook, ugcScript.body, ugcScript.cta].filter(Boolean).join("\n"),
      headline: assistant.headline,
      cta,
    };
  });
}
