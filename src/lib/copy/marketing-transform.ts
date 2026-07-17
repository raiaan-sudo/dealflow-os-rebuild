import {
  isBuyerLikeCampaignIntent,
  isInvestorCampaignIntent,
  isSellerCampaignIntent,
} from "@/lib/campaign-intent";
import type { CampaignIntent, OnboardingInput } from "@/lib/services/campaign-plan-service";
import {
  inferCampaignCategory,
  type CampaignCreativeStrategy,
} from "@/lib/services/campaign-creative-strategy";
import { getCategoryRulePack } from "@/lib/services/campaign-category-rule-packs";
import { fillPattern } from "@/lib/knowledge/real-estate";
import { sanitizeAdClaimText } from "@/lib/copy/claim-safety";

export type MarketingContext = {
  intent: CampaignIntent;
  market: string;
  audience: string;
  propertyType: string;
  keyOffer: string;
  mechanism: string;
  painPoints: string[];
  primaryGoal: string;
  outcome: string;
};

type CopyStack = {
  hook: string;
  problem: string;
  mechanism: string;
  proof: string;
  outcome: string;
  cta: string;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sentenceCase(value: string) {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return "";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function stripTrailingPunctuation(value: string) {
  return value.replace(/[.!?,;:]+$/g, "").trim();
}

function ensureSentenceEnding(value: string, punctuation = ".") {
  const cleaned = stripTrailingPunctuation(value);

  if (!cleaned) {
    return "";
  }

  return `${cleaned}${punctuation}`;
}

function ensureQuestionEnding(value: string) {
  const cleaned = stripTrailingPunctuation(value);

  if (!cleaned) {
    return "";
  }

  return `${cleaned}?`;
}

function toSingularProperty(value: string) {
  if (value.endsWith("ies")) {
    return `${value.slice(0, -3)}y`;
  }

  if (value.endsWith("s")) {
    return value.slice(0, -1);
  }

  return value;
}

function removeFiller(raw: string) {
  return normalizeWhitespace(
    raw
      .replace(/\b(i have|we have|we offer|i offer|we help|i help|looking for|trying to|want to|need to)\b/gi, "")
      .replace(/\ba lot of\b/gi, "")
      .replace(/\breally\b/gi, "")
      .replace(/\bjust\b/gi, "")
      .replace(/\s+/g, " "),
  );
}

function removeWeakOpeners(raw: string) {
  return normalizeWhitespace(
    raw
      .replace(/\b(first-time buyers?|buyers?|sellers?) are tired of\b/gi, "")
      .replace(/\b(first-time buyers?|buyers?|sellers?) are\b/gi, "")
      .replace(/\bpeople are\b/gi, "")
      .replace(/\bthat\b/gi, " ")
      .replace(/\s+/g, " "),
  );
}

function cleanGeneratedCopy(text: string) {
  const normalized = normalizeWhitespace(text)
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\b(\w+)\s+\1\b/gi, "$1")
    .replace(/\.\s*\./g, ".")
    .replace(/\?\s*\?/g, "?")
    .replace(/\s{2,}/g, " ");

  if (!normalized) {
    return "";
  }

  return sentenceCase(normalized);
}

function cleanQuestionCopy(text: string) {
  const cleaned = cleanGeneratedCopy(text);

  if (!cleaned) {
    return "";
  }

  return ensureQuestionEnding(cleaned);
}

function cleanSentenceCopy(text: string) {
  const cleaned = cleanGeneratedCopy(text);

  if (!cleaned) {
    return "";
  }

  return ensureSentenceEnding(cleaned);
}

export function normalizeAudienceLabel(value: string, intent: CampaignIntent) {
  const normalized = removeFiller(value).toLowerCase();
  const isSeller = isSellerCampaignIntent(intent);
  const isInvestor = isInvestorCampaignIntent(intent);
  const isBuyerLike = isBuyerLikeCampaignIntent(intent);

  if (!normalized) {
    return isSeller ? "motivated sellers" : isInvestor ? "active investors" : "first-time buyers";
  }

  if (isInvestor) {
    if (normalized.includes("cash") || normalized.includes("invest")) {
      return "cash-flow investors";
    }
    if (!normalized.includes("investor")) {
      return `${normalized} investors`;
    }
  } else if (isBuyerLike) {
    if (normalized.includes("first") && normalized.includes("buyer")) {
      return "first-time buyers";
    }
    if (normalized.includes("invest")) {
      return "investors";
    }
    if (normalized.includes("move-up")) {
      return "move-up buyers";
    }
    if (normalized.includes("downsiz")) {
      return "downsizers";
    }
    if (!normalized.includes("buyer")) {
      return `${normalized} buyers`;
    }
  } else {
    if (normalized.includes("distress")) {
      return "distressed sellers";
    }
    if (normalized.includes("homeowner")) {
      return "homeowners ready to list";
    }
    if (normalized.includes("downsiz")) {
      return "downsizers ready to sell";
    }
    if (!normalized.includes("seller")) {
      return `${normalized} sellers`;
    }
  }

  return normalized;
}

export function normalizePropertyLabel(value: string, intent: CampaignIntent) {
  const normalized = removeFiller(value).toLowerCase();
  const isSeller = isSellerCampaignIntent(intent);
  const isInvestor = isInvestorCampaignIntent(intent);

  if (!normalized) {
    return isInvestor ? "investment properties" : isSeller ? "homes" : "condos";
  }

  if (normalized.includes("condo")) {
    return "condos";
  }
  if (normalized.includes("lux")) {
    return "luxury homes";
  }
  if (normalized.includes("invest")) {
    return "investment properties";
  }
  if (normalized.includes("detached") || normalized.includes("house")) {
    return "houses";
  }

  return normalized;
}

export function normalizeOfferLabel(value: string, propertyType: string, intent: CampaignIntent) {
  const normalized = removeWeakOpeners(removeFiller(value)).toLowerCase();
  const rawNormalized = normalizeWhitespace(value);
  const singularProperty = toSingularProperty(propertyType || "home");
  const creditMatch = normalized.match(/\d+/);
  const creditScore = creditMatch?.[0] ?? null;
  const isSeller = isSellerCampaignIntent(intent);
  const isInvestor = isInvestorCampaignIntent(intent);
  const isBuyerLike = isBuyerLikeCampaignIntent(intent);

  if (!normalized) {
    return isSeller
      ? `Get a faster, clearer path to selling your ${singularProperty}`
      : isInvestor
        ? `See stronger ${propertyType} opportunities with better cash-flow potential`
        : isBuyerLike
      ? `Get matched with the right ${singularProperty} faster`
      : `Get a clearer path to the right ${singularProperty}`;
  }

  if (rawNormalized) {
    return cleanGeneratedCopy(rawNormalized);
  }
  if (isInvestor) {
    return cleanSentenceCopy(`Get a clearer path to stronger ${singularProperty} opportunities`);
  }

  if (isBuyerLike) {
    return cleanSentenceCopy(`Get a clearer path to the right ${singularProperty}`);
  }

  return cleanSentenceCopy(`Get a stronger selling angle`);
}

export function normalizeMechanismLabel(value: string, intent: CampaignIntent) {
  const normalized = removeFiller(value).toLowerCase();
  const isSeller = isSellerCampaignIntent(intent);
  const isInvestor = isInvestorCampaignIntent(intent);

  if (!normalized) {
    return isSeller ? "a tailored launch system" : isInvestor ? "an investor deal-filtering system" : "a custom matching system";
  }

  if (normalized.includes("match")) {
    return "a custom matching system";
  }

  if (normalized.includes("approval")) {
    return "an approval-first process";
  }

  if (normalized.includes("list")) {
    return "a tighter property selection process";
  }

  const withArticle =
    normalized.startsWith("a ") || normalized.startsWith("an ")
      ? normalized
      : /^[aeiou]/i.test(normalized)
        ? `an ${normalized}`
        : `a ${normalized}`;

  return cleanGeneratedCopy(withArticle).toLowerCase();
}

export function normalizePainPoint(value: string, intent: CampaignIntent) {
  const normalized = removeWeakOpeners(removeFiller(value)).toLowerCase();
  const isBuyerLike = isBuyerLikeCampaignIntent(intent);
  const isInvestor = isInvestorCampaignIntent(intent);

  if (!normalized) {
    return isInvestor
      ? "Missing the best investor deals before they disappear?"
      : isBuyerLike
      ? "Missing the best homes before they are gone?"
      : "Waiting too long to make the right move?";
  }

  if (normalized.includes("can't get approved") || normalized.includes("cant get approved")) {
    return "Struggling to get approved?";
  }

  if (normalized.includes("get approved") && normalized.includes("first-time")) {
    return "Struggling to get approved as a first-time buyer?";
  }

  if (normalized.includes("overwhelmed") && normalized.includes("listing")) {
    return "Feeling overwhelmed by too many listings?";
  }

  if (normalized.includes("missing") && (normalized.includes("deal") || normalized.includes("home"))) {
    return "Missing the best deals before they disappear?";
  }

  if (normalized.includes("bad listing")) {
    return "Wasting time on the wrong listings?";
  }

  if (normalized.includes("agent")) {
    return "Getting pushed toward the wrong homes?";
  }

  if (normalized.startsWith("can't ") || normalized.startsWith("cant ")) {
    return cleanQuestionCopy(`Struggling to ${normalized.replace(/^can't\s+|^cant\s+/i, "")}`);
  }

  if (normalized.startsWith("missing ")) {
    return cleanQuestionCopy(`Missing ${normalized.replace(/^missing\s+/i, "")}`);
  }

  if (normalized.startsWith("stuck on ")) {
    return cleanQuestionCopy(`Stuck on ${normalized.replace(/^stuck on\s+/i, "")}`);
  }

  if (normalized.startsWith("tired of ")) {
    return cleanQuestionCopy(`Tired of ${normalized.replace(/^tired of\s+/i, "")}`);
  }

  if (isBuyerLike && normalized.includes("approved")) {
    return cleanQuestionCopy(`Struggling to get approved as ${normalizeAudienceLabel("first-time buyers", "buyer")}`);
  }

  return cleanQuestionCopy(normalized);
}

export function normalizePainPoints(values: string[], intent: CampaignIntent) {
  const normalized = values
    .map((value) => normalizePainPoint(value, intent))
    .filter(Boolean);

  if (normalized.length > 0) {
    return Array.from(new Set(normalized));
  }

  return isBuyerLikeCampaignIntent(intent)
    ? ["Struggling to get approved?", "Missing the best deals before they disappear?"]
    : isInvestorCampaignIntent(intent)
      ? ["Missing the best deals before they disappear?", "Unclear which opportunities are actually cash-flow positive?"]
      : ["Waiting too long to make the right move?", "Unclear about the right pricing strategy?"];
}

function normalizeGoal(value: string, intent: CampaignIntent) {
  const normalized = removeFiller(value);

  if (!normalized) {
    return isSellerCampaignIntent(intent)
      ? "Get more qualified seller leads"
      : isInvestorCampaignIntent(intent)
        ? "Get more qualified investor leads"
        : "Get more qualified buyer leads";
  }

  return cleanGeneratedCopy(normalized);
}

function inferOutcome(intent: CampaignIntent, offer: string, propertyType: string) {
  const singularProperty = toSingularProperty(propertyType || "home");

  if (isInvestorCampaignIntent(intent)) {
    if (/off-market/i.test(offer)) {
      return `See stronger off-market ${propertyType} before everyone else does`;
    }

    return `Find stronger investor-grade ${propertyType} with less wasted time`;
  }

  if (isBuyerLikeCampaignIntent(intent)) {
    if (/approved|approval/i.test(offer)) {
      return `Get approved and move on the right ${singularProperty} faster`;
    }

    if (/off-market/i.test(offer)) {
      return `See better ${propertyType} before everyone else does`;
    }

    return `Find the right ${singularProperty} faster with less wasted time`;
  }

  if (/clos/i.test(offer)) {
    return `Sell your ${singularProperty} faster without the usual friction`;
  }

  return `Get a clearer path to selling your ${singularProperty}`;
}

export function buildMarketingContext(input: OnboardingInput | {
  intent: CampaignIntent;
  market: string;
  primaryGoal: string;
  audience: string;
  propertyType: string;
  keyOffer: string;
  painPoints: string[];
  mechanism: string;
}) {
  const market = normalizeWhitespace(input.market) || "Toronto";
  const audience = normalizeAudienceLabel(input.audience, input.intent);
  const propertyType = normalizePropertyLabel(input.propertyType, input.intent);
  const sanitize = (value: unknown, fallback?: string) => sanitizeAdClaimText(value, {
    intent: input.intent,
    location: market,
    fallback,
  });
  const keyOffer = sanitize(normalizeOfferLabel(input.keyOffer, propertyType, input.intent));
  const mechanism = sanitize(normalizeMechanismLabel(input.mechanism, input.intent));
  const painPoints = normalizePainPoints(input.painPoints, input.intent).map((value) => sanitize(value));
  const primaryGoal = sanitize(normalizeGoal(input.primaryGoal, input.intent));
  const outcome = sanitize(inferOutcome(input.intent, keyOffer, propertyType));

  return {
    intent: input.intent,
    market,
    audience: sanitize(audience),
    propertyType,
    keyOffer,
    mechanism,
    painPoints,
    primaryGoal,
    outcome,
  } satisfies MarketingContext;
}

export function ensureCopyContext(
  text: string,
  context: Pick<MarketingContext, "audience" | "propertyType" | "keyOffer" | "market">,
) {
  const cleaned = cleanSentenceCopy(text);
  return cleaned;
}

function buildLowFrictionCta(
  category: CampaignCreativeStrategy["campaignCategory"],
  context: MarketingContext,
) {
  if (category === "seller") {
    return "Get My Price Update";
  }

  if (category === "investor") {
    return "See The Deal Breakdown";
  }

  if (category === "precon") {
    return "See The Deposit Structure";
  }

  if (category === "luxury") {
    return "Request Private Access";
  }

  return /approval|approved|credit/i.test(context.keyOffer)
    ? "See My Approval Path"
    : /off-market/i.test(context.keyOffer)
      ? "See Off-Market Options"
      : "See Matching Homes";
}

function buildProofLine(
  category: CampaignCreativeStrategy["campaignCategory"],
  context: MarketingContext,
  proofStyle: string,
) {
  if (category === "seller") {
    return cleanSentenceCopy(
      `See the pricing gap, timing risk, and home-value comparison before you list in ${context.market}`,
    );
  }

  if (category === "investor") {
    return cleanSentenceCopy(
      `See the yield spread, downside filters, and cash-flow case before you commit capital in ${context.market}`,
    );
  }

  if (category === "precon") {
    return cleanSentenceCopy(
      `See the deposit timeline, entry point, and future-value comparison before you commit in ${context.market}`,
    );
  }

  if (category === "luxury") {
    return cleanSentenceCopy(
      `See the private-access path, rarity, and fit signal before these opportunities circulate widely in ${context.market}`,
    );
  }

  if (/payment|affordability/i.test(proofStyle)) {
    return cleanSentenceCopy(
      `See the payment path, stronger-fit inventory, and monthly number range before the public scramble in ${context.market}`,
    );
  }

  return cleanSentenceCopy(
    `See the stronger-fit options, less wasted time, and clearer next step before most people react in ${context.market}`,
  );
}

function buildStructuredHook(context: MarketingContext, rawHook: string) {
  const category = inferCampaignCategory({
    intent: context.intent,
    audience: context.audience,
    propertyType: context.propertyType,
    keyOffer: context.keyOffer,
    mechanism: context.mechanism,
    primaryGoal: context.primaryGoal,
    painPoints: context.painPoints,
  });
  const rulePack = getCategoryRulePack(category);
  return cleanGeneratedCopy(
    rawHook || fillPattern(rulePack.approvedHookStructures[0] || "{keyOffer} in {market}", {
      audience: context.audience,
      propertyType: context.propertyType,
      keyOffer: context.keyOffer,
      market: context.market,
      mechanism: context.mechanism,
    }),
  );
}

export function buildMediaBuyingCopy(
  context: MarketingContext,
  rawHook: string,
  strategy?: Partial<CampaignCreativeStrategy> | null,
) {
  const normalizedStrategy = {
    campaignCategory: inferCampaignCategory({
      intent: context.intent,
      audience: context.audience,
      propertyType: context.propertyType,
      keyOffer: context.keyOffer,
      mechanism: context.mechanism,
      primaryGoal: context.primaryGoal,
      painPoints: context.painPoints,
    }),
    triggerCondition: context.primaryGoal,
    internalTension: context.painPoints[0] ?? "",
    mechanism: context.mechanism,
    proofStyle: "",
    ctaStyle: "low_friction",
    visualLogic: [],
    overlayStyle: [],
    complianceNotes: [],
    ...(strategy ?? {}),
  } satisfies CampaignCreativeStrategy;
  const hook = buildStructuredHook(context, rawHook);
  const problem = cleanSentenceCopy(
    normalizedStrategy.internalTension || context.painPoints[0] || "The usual path creates too much uncertainty too early",
  );
  const mechanism = cleanSentenceCopy(
    `${sentenceCase(normalizedStrategy.mechanism || context.mechanism)} gives ${context.audience} a tighter path through ${context.market}`,
  );
  const proof = buildProofLine(
    normalizedStrategy.campaignCategory,
    context,
    normalizedStrategy.proofStyle,
  );
  const outcome = cleanSentenceCopy(context.outcome);
  const cta = buildLowFrictionCta(normalizedStrategy.campaignCategory, context);
  const sanitize = (value: unknown) => sanitizeAdClaimText(value, {
    intent: context.intent,
    location: context.market,
  });

  return {
    hook: sanitize(hook),
    problem: sanitize(problem),
    mechanism: sanitize(mechanism),
    proof: sanitize(proof),
    outcome: sanitize(outcome),
    cta: sanitize(cta),
    headline: sanitize(ensureCopyContext(hook, context)),
    subheadline: sanitize(cleanSentenceCopy(`${problem} ${mechanism} ${proof}`)),
    body: sanitize([problem, mechanism, proof, outcome, cta].map((line) => ensureSentenceEnding(line)).join(" ")),
  };
}

export function buildCreativeMessages(
  context: MarketingContext,
  rawHook: string,
  angleLabel: string,
) {
  void angleLabel;
  const structured = buildMediaBuyingCopy(context, rawHook);
  const supportingLine = cleanSentenceCopy(`${structured.mechanism} ${structured.proof}`);
  const offerLine = cleanSentenceCopy(`${context.keyOffer}. ${structured.outcome}`);
  const sanitize = (value: unknown) => sanitizeAdClaimText(value, {
    intent: context.intent,
    location: context.market,
  });

  return {
    hook: sanitize(cleanGeneratedCopy(structured.hook)),
    headline: sanitize(structured.headline),
    body: sanitize(structured.body),
    supportingLine: sanitize(cleanSentenceCopy(supportingLine)),
    offer: sanitize(cleanSentenceCopy(offerLine)),
  };
}
