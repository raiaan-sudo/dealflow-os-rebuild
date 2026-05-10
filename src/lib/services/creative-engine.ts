import { inferCampaignIntent, type CampaignIntent } from "@/lib/campaign-intent";
import {
  buildCreativeBrief,
  type CreativeBrief,
} from "@/lib/ai/creative-brief";
import type { ImagePromptConfig } from "@/lib/types/creative-assets";
import {
  createImageAd,
  createVideoAd,
  selectAvatarProfile,
  selectVoiceProfile,
  type ImageProviderUsageContext,
  type AvatarProfile,
  type VoiceProfile,
} from "@/lib/ai/providers";
import type { CampaignCreativeStrategy } from "@/lib/services/campaign-creative-strategy";
import {
  buildDefaultCreativeStrategy,
} from "@/lib/services/campaign-creative-strategy";
import { getCategoryRulePack } from "@/lib/services/campaign-category-rule-packs";
import {
  buildStaticVisualPromptBrief,
  type OpenAiImageModel,
  type StaticVisualPromptBrief,
} from "@/lib/services/campaign-visual-prompt-builder";
import {
  rankStaticCreativeAssets,
  type CreativeScoreBreakdown,
} from "@/lib/services/creative-scoring-service";
import {
  evaluateCreativeQuality,
  evaluateOfferQuality,
  getCategorySafeOffer,
  getMediaBuyerCategoryStrategy,
  getMediaBuyerCampaignPackages,
  type CreativeQualityEvaluation,
  type OfferQualityEvaluation,
} from "@/lib/services/media-buyer-framework";
import { selectMediaBuyerCta } from "@/lib/optimization-engine/media-buying-rules";

export type CreativeEngineInput = {
  location: string;
  audience: string;
  offer: string;
  price_point?: string;
  property_type?: string;
  mechanism?: string;
  desired_result?: string;
  pain_points?: string[];
  market_type?: CampaignIntent;
  creative_strategy?: CampaignCreativeStrategy;
  provider_usage_context?: {
    createForAsset: (asset: StaticCreativeAsset) => ImageProviderUsageContext | null;
  };
};

export type CreativeAngle = "opportunity" | "pain" | "authority" | "curiosity";
export type CreativeFormat = "talking_head" | "ugc" | "montage";

export type StaticCreativeAsset = {
  id: string;
  angle: "guarantee" | "urgency" | "contrarian" | "opportunity" | "authority";
  imageUrl: string;
  imageGenerationState: "generated" | "generating" | "unavailable" | "failed";
  imageGenerationMessage: string | null;
  imageGenerationModel: string | null;
  imageGenerationProvider?: string | null;
  visualConcept: string;
  imagePrompt: string;
  imagePromptConfig: ImagePromptConfig | null;
  preferredImageModel: OpenAiImageModel;
  visualPromptBrief: StaticVisualPromptBrief | null;
  scoreBreakdown: CreativeScoreBreakdown | null;
  hook: string;
  overlayText: string;
  primaryText: string;
  headline: string;
  cta: string;
  score: number;
  recommended: boolean;
  offerQuality?: OfferQualityEvaluation | null;
  qualityGate?: CreativeQualityEvaluation | null;
};

export type VideoCreativeAsset = {
  id: string;
  conceptType: "founder_expert" | "customer_ugc";
  title: string;
  hook: string;
  script: string[];
  shotList: string[];
  onScreenText: string[];
  videoUrl?: string;
  videoGenerationState?: "generated" | "generating" | "failed" | "unavailable";
  videoGenerationMessage?: string | null;
  providerAssetId?: string | null;
  cta: string;
  creatorStyle: string;
  voiceStyle: string;
  avatarProfile: AvatarProfile;
  voiceProfile: VoiceProfile;
  qualityGate?: CreativeQualityEvaluation | null;
};

export type CanonicalCreativeItem = {
  id: string;
  kind: "static" | "video";
  angle: string;
  format: CreativeFormat;
  title: string;
  hook: string;
  overlayText: string;
  primaryText: string;
  headline: string;
  cta: string;
  score: number;
  recommended: boolean;
  concept: string;
  visualDirection: string;
  imagePrompt: string;
  scriptLines: string[];
  sceneDescriptions: string[];
  onScreenText: string[];
  assetRefs: {
    imageUrl: string | null;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    voiceUrl: string | null;
  };
  creatorStyle?: string;
  voiceStyle?: string;
  conceptType?: "founder_expert" | "customer_ugc";
};

export type CreativePackage = {
  brief: CreativeBrief;
  items: CanonicalCreativeItem[];
  staticAds: StaticCreativeAsset[];
  videoAds: VideoCreativeAsset[];
};

export type CreativeIdea = {
  hook: string;
  angle: CreativeAngle;
  format: CreativeFormat;
  concept: string;
  visual_direction: string;
};

type RequiredCreativeInput = {
  location: string;
  audience: string;
  offer: string;
  rawOffer: string;
  pricePoint: string | null;
  propertyType: string;
  mechanism: string;
  desiredResult: string;
  painPoints: string[];
  marketType: CampaignIntent;
  creativeStrategy: CampaignCreativeStrategy;
};

function safeText(input: unknown): string {
  if (input === null || input === undefined) {
    return "";
  }

  return String(input).trim();
}

function safeArray(input: unknown): string[] {
  return Array.isArray(input) ? input.map((item) => safeText(item)).filter(Boolean) : [];
}

function toTitleCase(value: string) {
  return safeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeInput(input?: CreativeEngineInput | null): RequiredCreativeInput {
  const raw: Partial<CreativeEngineInput> = input ?? {};
  const marketType = raw.market_type ?? "buyer";
  const audience = safeText(raw.audience) || "motivated local buyers";
  const propertyType = safeText(raw.property_type) || "homes";
  const offer = safeText(raw.offer) || "a stronger buying opportunity";
  const mechanism = safeText(raw.mechanism) || "a simpler path to move faster";
  const desiredResult = safeText(raw.desired_result) || "more qualified leads";
  const painPoints = safeArray(raw.pain_points);

  return {
    location: safeText(raw.location) || "your market",
    audience,
    offer,
    rawOffer: offer,
    pricePoint: safeText(raw.price_point) || null,
    propertyType,
    mechanism,
    desiredResult,
    painPoints,
    marketType,
    creativeStrategy:
      raw.creative_strategy ??
      buildDefaultCreativeStrategy({
        intent: marketType,
        audience,
        propertyType,
        keyOffer: offer,
        mechanism,
        primaryGoal: desiredResult,
        painPoints,
      }),
  };
}

function inferDesiredResult(input: RequiredCreativeInput) {
  if (/approval|financ|mortgage|credit/i.test(input.offer)) {
    return "faster approval and a clearer path to buy";
  }

  if (input.marketType === "seller") {
    return "more seller conversations and pricing confidence";
  }

  if (input.marketType === "investor") {
    return "more deal flow and faster acquisition decisions";
  }

  return input.desiredResult;
}

function shortPain(input: RequiredCreativeInput) {
  const firstPain = input.painPoints[0];

  if (firstPain) {
    return firstPain;
  }

  if (input.marketType === "seller") {
    return "guessing your next move";
  }

  if (input.marketType === "investor") {
    return "missing the best deals";
  }

  return "getting beat by faster buyers";
}

function localVisual(input: RequiredCreativeInput) {
  const propertyType = input.propertyType.toLowerCase();

  if (/condo/.test(propertyType)) {
    return `${toTitleCase(input.location)} skyline, modern condo interiors, and phone-first listing views`;
  }

  if (/townhome|townhouse/.test(propertyType)) {
    return `${toTitleCase(input.location)} townhome rows, front-porch shots, and neighborhood walkthrough visuals`;
  }

  if (/detached|family/.test(propertyType)) {
    return `${toTitleCase(input.location)} family-home streets, driveway shots, and open-house style visuals`;
  }

  return `${toTitleCase(input.location)} neighborhoods, active listings, and local market visuals`;
}

function trimWords(value: string, maxWords: number) {
  const words = safeText(value).split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : words.slice(0, maxWords).join(" ");
}

function shortSentence(value: string) {
  return safeText(value).replace(/[.!?]+$/, "");
}

function sentenceCase(value: string) {
  const cleaned = shortSentence(value);

  if (!cleaned) {
    return "";
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function isApprovalFocusedContext(params: {
  audience: string;
  offer: string;
  mechanism: string;
  painPoints?: string[];
}) {
  const haystack = [
    params.audience,
    params.offer,
    params.mechanism,
    ...(params.painPoints ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /approv|qualif|credit|mortgage|pre-approv|down payment|deposit|financ/.test(haystack);
}

function normalizeOfferPhrase(value: string) {
  return shortSentence(value).replace(/^(see|get|view|find)\s+/i, "").trim();
}

function fillTemplate(template: string, params: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_match, token: string) => params[token] ?? "");
}

function normalizeText(value: string) {
  return safeText(value).toLowerCase();
}

function hookLooksGeneric(hook: string, forbiddenPatterns: string[]) {
  const normalized = normalizeText(hook);
  const genericPatterns = [
    "what is your home worth",
    "new listing alert",
    "learn more",
    "dream home",
    "exclusive opportunity",
  ];

  return [...genericPatterns, ...forbiddenPatterns.map((pattern) => normalizeText(pattern))].some(
    (pattern) => pattern && normalized.includes(pattern),
  );
}

function clampOverlayLine(line: string) {
  return trimWords(shortSentence(line), 6);
}

function buildOverlayText(input: {
  category: CampaignCreativeStrategy["campaignCategory"];
  market: string;
  base: string;
  trigger: string;
  proof: string;
}) {
  const market = toTitleCase(input.market);
  const base = clampOverlayLine(input.base);
  const proofHint = clampOverlayLine(
    input.category === "luxury"
      ? input.proof || "Private Access"
      : input.category === "precon"
        ? input.proof || "Timeline Proof"
        : input.trigger || input.proof || market,
  );
  const firstLine =
    /\d|\$|%/.test(base) || base.toLowerCase().includes(market.toLowerCase()) ? base : clampOverlayLine(`${market} ${base}`);

  return [firstLine, proofHint]
    .filter(Boolean)
    .slice(0, input.category === "luxury" ? 1 : 2)
    .join("\n");
}

function ensureMechanism(value: string, fallback: string) {
  const mechanism = shortSentence(value) || shortSentence(fallback);
  return mechanism || "a clearer decision system";
}

function preserveExplicitConsumerAudienceCategory(
  strategy: CampaignCreativeStrategy,
  audience: string,
  offer: string,
): CampaignCreativeStrategy {
  const haystack = `${audience} ${offer}`.toLowerCase();

  if (/\b(buyer|buyers|homebuyer|homebuyers|first[- ]time|upsize|downsize)\b/.test(haystack) && !/\b(investor|investors|roi|yield|cash[- ]?flow|rental)\b/.test(haystack)) {
    const buyerRules = getCategoryRulePack("buyer");
    return {
      ...strategy,
      campaignCategory: "buyer",
      proofStyle: buyerRules.proofStyles[0] || strategy.proofStyle,
      ctaStyle: buyerRules.explicitLowFrictionCtas[0] || strategy.ctaStyle,
      visualLogic: buyerRules.visualLogic,
      overlayStyle: buyerRules.overlayLogic,
    };
  }

  if (/\b(seller|sellers|homeowner|homeowners|sell|listing|home value)\b/.test(haystack) && !/\b(agent|realtor|broker)\b/.test(haystack)) {
    const sellerRules = getCategoryRulePack("seller");
    return {
      ...strategy,
      campaignCategory: "seller",
      proofStyle: sellerRules.proofStyles[0] || strategy.proofStyle,
      ctaStyle: sellerRules.explicitLowFrictionCtas[0] || strategy.ctaStyle,
      visualLogic: sellerRules.visualLogic,
      overlayStyle: sellerRules.overlayLogic,
    };
  }

  return strategy;
}

function buildDecisionTension(strategy: CampaignCreativeStrategy, rulePack: ReturnType<typeof getCategoryRulePack>) {
  return shortSentence(strategy.internalTension || rulePack.internalTensions[0] || "the wrong move feels too expensive");
}

function buildSituationHook(params: {
  category: CampaignCreativeStrategy["campaignCategory"];
  market: string;
  propertyType: string;
  trigger: string;
  tension: string;
  mechanism: string;
  rulePack: ReturnType<typeof getCategoryRulePack>;
  templateParams: Record<string, string>;
}) {
  const templated = fillTemplate(params.rulePack.approvedHookStructures[0], params.templateParams);

  if (!hookLooksGeneric(templated, params.rulePack.forbiddenHookPatterns)) {
    return templated;
  }

  if (params.category === "seller") {
    return `Before you list in ${params.market}, fix the ${trimWords(params.tension, 6)} first.`;
  }

  if (params.category === "investor") {
    return `If your capital is stuck in ${params.trigger}, ${params.market} deserves a closer look.`;
  }

  if (params.category === "precon") {
    return `If resale feels out of reach, ${params.market} has a lower-entry move most buyers miss.`;
  }

  if (params.category === "luxury") {
    return "This isn't for everyone.";
  }

  return `If ${params.trigger} sounds familiar in ${params.market}, ${params.mechanism} changes the next move.`;
}

function scoreStaticAd(ad: Pick<StaticCreativeAsset, "hook" | "overlayText" | "primaryText" | "cta">) {
  const combined = `${ad.hook} ${ad.overlayText} ${ad.primaryText} ${ad.cta}`.toLowerCase();
  let score = 5;

  if (/guarantee|cash[- ]flow|off-market|approved|credit|qualify|demand test|private access|deposit/.test(combined)) score += 2;
  if (/see|get|view|check|qualify|request/.test(ad.cta.toLowerCase())) score += 1;
  if (shortSentence(ad.hook).toLowerCase() !== shortSentence(ad.overlayText).toLowerCase()) score += 1;
  if (combined.length > 80 && combined.length < 260) score += 1;
  if (/timing|mistake|underperform|miss|before|too late|underpricing|sitting in the bank/.test(combined)) score += 1;
  if (/client|buyer we helped|homeowner we helped|testimonial|story|case study|famil(y|ies)/.test(combined)) score += 1;
  if (/problem|solution|without|so you can|results|outcome|step-by-step/.test(combined)) score += 1;

  return Math.min(10, score);
}

function buildStructuredPrimaryText(params: {
  hook: string;
  problem: string;
  outcome: string;
  cta: string;
}) {
  return `${shortSentence(params.hook)} ${sentenceCase(params.problem)} ${sentenceCase(params.outcome)} ${params.cta}.`;
}

function normalizeForOfferMatch(value: string) {
  return safeText(value).toLowerCase().replace(/[^\w\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function textIncludesOffer(text: string, offer: string) {
  const normalizedText = normalizeForOfferMatch(text);
  const normalizedOffer = normalizeForOfferMatch(offer);

  if (!normalizedText || !normalizedOffer) {
    return false;
  }

  if (normalizedText.includes(normalizedOffer)) {
    return true;
  }

  const offerTokens = normalizedOffer.split(" ").filter((token) => token.length > 2);
  const matchedTokens = offerTokens.filter((token) => normalizedText.includes(token));
  return offerTokens.length > 0 && matchedTokens.length / offerTokens.length >= 0.72;
}

function buildCompliantOfferLead(offer: string, category: CampaignCreativeStrategy["campaignCategory"]) {
  const cleanOffer = shortSentence(offer);

  if (!cleanOffer) {
    return "";
  }

  if (category === "seller" && /guarantee|guaranteed/i.test(cleanOffer)) {
    return `See if your home qualifies for: ${cleanOffer}`;
  }

  return cleanOffer;
}

function isTimeboxedSellerOffer(offer: string, category: CampaignCreativeStrategy["campaignCategory"]) {
  return (
    category === "seller" &&
    /\b(guarantee|guaranteed|sold|sale|sell)\b/i.test(offer) &&
    /\b\d{1,3}\s*(day|days|week|weeks)\b/i.test(offer)
  );
}

function shouldPreserveExplicitOffer(
  offer: string,
  category: CampaignCreativeStrategy["campaignCategory"],
) {
  return isTimeboxedSellerOffer(offer, category) || /\b(guarantee|guaranteed|off-market|cash[- ]?flow|deposit|private)\b/i.test(offer);
}

function buildOfferAlignedCta(
  offer: string,
  category: CampaignCreativeStrategy["campaignCategory"],
  fallback: string,
) {
  if (isTimeboxedSellerOffer(offer, category)) {
    return "Check My 90-Day Sale Plan";
  }

  if (category === "seller" && /\bguarantee|guaranteed\b/i.test(offer)) {
    return "Check My Sale Plan";
  }

  if (/\boff-market\b/i.test(offer)) {
    return "See Off-Market Options";
  }

  if (/\bcash[- ]?flow|yield|roi\b/i.test(offer)) {
    return "Review The Deal Plan";
  }

  return fallback;
}

function buildOfferLedHeadline(params: {
  offer: string;
  market: string;
  category: CampaignCreativeStrategy["campaignCategory"];
  fallback: string;
}) {
  const cleanOffer = shortSentence(params.offer);

  if (!cleanOffer) {
    return cleanCreativeCopy(params.fallback);
  }

  if (isTimeboxedSellerOffer(cleanOffer, params.category)) {
    return `${cleanOffer} in ${params.market}`;
  }

  if (shouldPreserveExplicitOffer(cleanOffer, params.category)) {
    return `${trimWords(cleanOffer, 8)} for ${params.market}`;
  }

  return cleanCreativeCopy(params.fallback);
}

function buildOfferLedHook(params: {
  offer: string;
  market: string;
  audience: string;
  category: CampaignCreativeStrategy["campaignCategory"];
  fallback: string;
}) {
  const cleanOffer = shortSentence(params.offer);

  if (isTimeboxedSellerOffer(cleanOffer, params.category)) {
    return `${params.market} sellers: review the ${cleanOffer.toLowerCase()} before you list.`;
  }

  if (shouldPreserveExplicitOffer(cleanOffer, params.category)) {
    return `${params.audience} in ${params.market}: compare your next move against ${cleanOffer}.`;
  }

  return cleanCreativeCopy(params.fallback);
}

function buildOfferLedPrimaryText(params: {
  hook: string;
  offer: string;
  market: string;
  audience: string;
  mechanism: string;
  proof: string;
  cta: string;
  category: CampaignCreativeStrategy["campaignCategory"];
  fallback: string;
}) {
  const cleanOffer = shortSentence(params.offer);

  if (!shouldPreserveExplicitOffer(cleanOffer, params.category)) {
    return cleanCreativeCopy(params.fallback);
  }

  const problem =
    params.category === "seller"
      ? `Most homeowners wait until they are already listing to discover pricing gaps, timing risk, and weak demand signals.`
      : `Most ${params.audience} wait until the obvious move is already crowded.`;
  const outcome =
    params.category === "seller"
      ? `${sentenceCase(params.mechanism)} keeps ${cleanOffer} at the center with ${params.proof.toLowerCase()} before you commit to the wrong listing path.`
      : `${sentenceCase(params.mechanism)} keeps ${cleanOffer} at the center with ${params.proof.toLowerCase()} so the next move is easier to judge.`;

  return buildStructuredPrimaryText({
    hook: params.hook,
    problem,
    outcome,
    cta: params.cta,
  });
}

function cleanCreativeCopy(value: string) {
  return shortSentence(value)
    .replace(/\$\s*([0-9]+)\s*k/gi, "$$$1k")
    .replace(/([0-9])\s+k\b/gi, "$1k")
    .replace(/\bpayment comparison overlay\b/gi, "budget comparison")
    .replace(/\bbetter houses options\b/gi, "better home options")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureOfferDrivenStaticAd(
  ad: StaticCreativeAsset,
  strategy: CampaignCreativeStrategy,
  offer: string,
): StaticCreativeAsset {
  const offerLead = buildCompliantOfferLead(offer, strategy.campaignCategory);
  const alignedCta = buildOfferAlignedCta(offerLead, strategy.campaignCategory, ad.cta);

  if (!offerLead) {
    return ad;
  }

  const headline =
    textIncludesOffer(ad.headline, offer)
      ? cleanCreativeCopy(ad.headline)
      : buildOfferLedHeadline({
          offer: offerLead,
          market: "",
          category: strategy.campaignCategory,
          fallback: ad.headline,
        }).replace(/\s+for\s*$/i, "");
  const primaryText =
    textIncludesOffer(ad.primaryText, offer)
      ? cleanCreativeCopy(ad.primaryText)
      : cleanCreativeCopy(`${ad.primaryText} ${offerLead}. ${alignedCta}.`);
  const overlayText =
    textIncludesOffer(ad.overlayText, offer)
      ? clampOverlayLine(ad.overlayText)
      : clampOverlayLine(offerLead);

  return {
    ...ad,
    headline,
    primaryText,
    overlayText,
    cta: alignedCta,
    visualConcept: textIncludesOffer(ad.visualConcept, offer)
      ? ad.visualConcept
      : `${ad.visualConcept} using the offer "${shortSentence(offer)}"`,
  };
}

function creativeAngleLabel(ad: StaticCreativeAsset) {
  if (ad.id.includes("problem")) return "Problem-solution";
  if (ad.id.includes("offer")) return "Offer-led";
  if (ad.id.includes("authority")) return "Expert angle";
  if (ad.id.includes("testimonial")) return "Proof story";
  if (ad.id.includes("opportunity")) return "Opportunity";
  return ad.angle;
}

function preventDuplicateStaticCreativeCopy(ads: StaticCreativeAsset[]) {
  const seen = new Set<string>();

  return ads.map((ad, index) => {
    const key = normalizeForOfferMatch(`${ad.headline}|${ad.primaryText}|${ad.cta}`);
    if (!seen.has(key)) {
      seen.add(key);
      return ad;
    }

    const label = creativeAngleLabel(ad);
    const headline = cleanCreativeCopy(`${label}: ${ad.headline}`);
    const primaryText = cleanCreativeCopy(`${ad.primaryText} This variation tests the ${label.toLowerCase()} angle.`);
    seen.add(normalizeForOfferMatch(`${headline}|${primaryText}|${ad.cta}|${index}`));

    return {
      ...ad,
      headline,
      primaryText,
      hook: cleanCreativeCopy(`${label}: ${ad.hook}`),
      visualConcept: `${ad.visualConcept} Variation angle: ${label}.`,
    };
  });
}

function fillMediaBuyerPattern(pattern: string, params: {
  market: string;
  propertyType: string;
}) {
  return pattern
    .replace(/\{market\}/g, params.market)
    .replace(/\{propertyType\}/g, params.propertyType)
    .trim();
}

function repairStaticCreativeForMediaBuyerQuality(params: {
  ad: StaticCreativeAsset;
  strategy: CampaignCreativeStrategy;
  offer: string;
  market: string;
  audience: string;
  propertyType: string;
}) {
  const mediaBuyer = getMediaBuyerCategoryStrategy(params.strategy.campaignCategory);
  const offerQuality = evaluateOfferQuality({
    category: params.strategy.campaignCategory,
    offer: params.offer,
    mechanism: params.strategy.mechanism,
    audience: params.audience,
    cta: params.ad.cta,
  });
  const initialQuality = evaluateCreativeQuality({
    category: params.strategy.campaignCategory,
    offer: params.offer,
    mechanism: params.strategy.mechanism,
    audience: params.audience,
    hook: params.ad.hook,
    primaryText: params.ad.primaryText,
    headline: params.ad.headline,
    overlayText: params.ad.overlayText,
    cta: params.ad.cta,
    visualConcept: params.ad.visualConcept,
    imagePrompt: params.ad.imagePrompt,
  });

  if (initialQuality.accepted) {
    return {
      ...params.ad,
      offerQuality,
      qualityGate: initialQuality,
    };
  }

  const safeOffer = shouldPreserveExplicitOffer(params.offer, params.strategy.campaignCategory)
    ? shortSentence(params.offer)
    : offerQuality.safeOffer || getCategorySafeOffer(params.strategy.campaignCategory);
  const mechanism =
    safeText(params.strategy.mechanism) ||
    mediaBuyer.mechanismStyles[0] ||
    "a clearer decision process";
  const proof =
    safeText(params.strategy.proofStyle) ||
    mediaBuyer.proofStyles[0] ||
    "clearer proof before the next step";
  const hook = fillMediaBuyerPattern(
    mediaBuyer.approvedHookPatterns[0] || params.ad.hook,
    {
      market: params.market,
      propertyType: params.propertyType,
    },
  );
  const cta = buildOfferAlignedCta(
    safeOffer,
    params.strategy.campaignCategory,
    mediaBuyer.lowFrictionCtas.find((candidate) => /see|view|get|check|request|access|review/i.test(candidate)) ||
      params.ad.cta,
  );
  const proofLead = /\d|\$|%|under|below|before|after|timeline|deposit|roi|yield|price|value/i.test(safeOffer)
    ? safeOffer
    : proof;
  const repairedPrompt =
    `${params.ad.imagePrompt.replace(params.offer, safeOffer)} Core offer: ${safeOffer}. Avoid agent-acquisition lead promises unless the audience is explicitly real estate agents.`;
  const repaired: StaticCreativeAsset = {
    ...params.ad,
    hook,
    overlayText: clampOverlayLine(proofLead),
    headline: `${shortSentence(safeOffer)}: ${shortSentence(proof)}`,
    primaryText: `${hook} ${sentenceCase(mechanism)} gives you ${proof.toLowerCase()} around ${shortSentence(safeOffer)}. ${cta}.`,
    cta,
    visualConcept: `${mediaBuyer.visualLogic[0] || params.ad.visualConcept} with ${mediaBuyer.overlayLogic[0] || "numbers-first overlay"} for ${shortSentence(safeOffer)}`,
    imagePrompt: repairedPrompt,
    imagePromptConfig: params.ad.imagePromptConfig
      ? {
          ...params.ad.imagePromptConfig,
          prompt: repairedPrompt,
        }
      : null,
  };
  const finalOfferQuality = evaluateOfferQuality({
    category: params.strategy.campaignCategory,
    offer: safeOffer,
    mechanism,
    audience: params.audience,
    cta,
  });
  const finalQuality = evaluateCreativeQuality({
    category: params.strategy.campaignCategory,
    offer: safeOffer,
    mechanism,
    audience: params.audience,
    hook: repaired.hook,
    primaryText: repaired.primaryText,
    headline: repaired.headline,
    overlayText: repaired.overlayText,
    cta: repaired.cta,
    visualConcept: repaired.visualConcept,
    imagePrompt: repaired.imagePrompt,
  });

  return {
    ...repaired,
    offerQuality: finalOfferQuality,
    qualityGate: finalQuality.accepted
      ? finalQuality
      : {
          ...finalQuality,
          hardFailures: Array.from(
            new Set([...finalQuality.hardFailures, ...initialQuality.hardFailures]),
          ),
          improvementHints: Array.from(
            new Set([...finalQuality.improvementHints, ...initialQuality.improvementHints]),
          ),
        },
  };
}

function buildStaticCreatives(
  brief: CreativeBrief,
  strategy: CampaignCreativeStrategy,
  rawOffer?: string | null,
): StaticCreativeAsset[] {
  const market = toTitleCase(brief.location);
  const audience = brief.audience;
  const offer = brief.keyOffer;
  const cleanOffer = normalizeOfferPhrase(rawOffer ?? "") || normalizeOfferPhrase(offer) || shortSentence(offer);
  const normalizedOffer = safeText(cleanOffer).toLowerCase();
  const rulePack = getCategoryRulePack(strategy.campaignCategory);
  const trigger = shortSentence(strategy.triggerCondition || rulePack.triggerConditions[0] || "market shift");
  const mechanism = ensureMechanism(strategy.mechanism, rulePack.approvedMechanismStyles[0] || brief.mechanism);
  const proof = shortSentence(strategy.proofStyle || rulePack.proofStyles[0] || "clearer proof");
  const tension = buildDecisionTension(strategy, rulePack);
  const approvalFocused =
    strategy.campaignCategory === "buyer" &&
    isApprovalFocusedContext({
      audience,
      offer,
      mechanism,
      painPoints: brief.painPoints,
    });

  const baseCta =
    approvalFocused
      ? "See If You Qualify"
      : rulePack.explicitLowFrictionCtas.find((candidate) => {
          const normalizedCta = candidate.toLowerCase();
          return (
            (strategy.campaignCategory === "seller" && /price|value|demand/.test(normalizedCta)) ||
            (strategy.campaignCategory === "investor" && /deal|yield|cash-flow/.test(normalizedCta)) ||
            (strategy.campaignCategory === "commercial" && /space|option|fit/.test(normalizedCta)) ||
            (strategy.campaignCategory === "precon" && /deposit|timeline|entry/.test(normalizedCta)) ||
            (strategy.campaignCategory === "luxury" && /private|fits|release/.test(normalizedCta)) ||
            (strategy.campaignCategory === "buyer" && /homes|qualify|payment/.test(normalizedCta))
          );
        }) ??
        rulePack.explicitLowFrictionCtas[0] ??
        "See The Next Step";
  const cta = buildOfferAlignedCta(cleanOffer, strategy.campaignCategory, baseCta);

  const categoryOverlays = {
    buyer: [
      trimWords(`Homes in ${market} you may not know you can afford`, 8),
      trimWords(`Before other buyers see them in ${market}`, 8),
      trimWords(`${market} payment path made clearer`, 7),
    ],
    seller: [
      trimWords(shouldPreserveExplicitOffer(cleanOffer, "seller") ? cleanOffer : `${market} home value update`, 7),
      trimWords(shouldPreserveExplicitOffer(cleanOffer, "seller") ? `See if you qualify in ${market}` : `What is your ${market} home worth now?`, 8),
      trimWords(shouldPreserveExplicitOffer(cleanOffer, "seller") ? `Before you list in ${market}` : `Most sellers lose money before they list`, 8),
    ],
    investor: [
      trimWords(`${market} yield breakdown`, 5),
      trimWords(`Cash flow plus appreciation in ${market}`, 7),
      trimWords(`If your money is sitting still, watch this`, 8),
    ],
    commercial: [
      trimWords(`${market} space-fit brief`, 5),
      trimWords(`Compare better-fit commercial options`, 5),
      trimWords(`Before you lease or buy in ${market}`, 8),
    ],
    precon: [
      trimWords(`Buy now. Pay later in ${market}`, 7),
      trimWords(`10% down style entry in ${market}`, 6),
      trimWords(`${market} pre-con timeline opportunity`, 6),
    ],
    luxury: [
      trimWords(`Rare access in ${market}`, 4),
      trimWords(`This is not for everyone`, 5),
      trimWords(`Private inventory in ${market}`, 4),
    ],
  } as const;

  const templateParams = {
    market,
    audience,
    propertyType: brief.propertyType,
    keyOffer: cleanOffer,
    mechanism,
  };
  const baseHook = buildSituationHook({
    category: strategy.campaignCategory,
    market,
    propertyType: brief.propertyType,
    trigger,
    tension,
    mechanism,
    rulePack,
    templateParams,
  });

  const mediaBuyerPackageAds = getMediaBuyerCampaignPackages(strategy.campaignCategory)
    .slice(0, 3)
    .map((campaignPackage, index): StaticCreativeAsset => {
      const angle = (["guarantee", "urgency", "authority"] as const)[index] ?? "opportunity";
      const packageHook = buildOfferLedHook({
        offer: cleanOffer,
        market,
        audience,
        category: strategy.campaignCategory,
        fallback: campaignPackage.hook,
      });
      const packageHeadline = buildOfferLedHeadline({
        offer: cleanOffer,
        market,
        category: strategy.campaignCategory,
        fallback: campaignPackage.headline,
      });
      const packagePrimaryText = buildOfferLedPrimaryText({
        hook: packageHook,
        offer: cleanOffer,
        market,
        audience,
        mechanism,
        proof,
        cta,
        category: strategy.campaignCategory,
        fallback: campaignPackage.primaryText,
      });

      return {
        id: `static-${campaignPackage.id}`,
        angle,
        imageUrl: "",
        imageGenerationState: "unavailable",
        imageGenerationMessage: null,
        imageGenerationModel: null,
        visualConcept: `${campaignPackage.creativeDirection} Offer: ${cleanOffer}.`,
        imagePrompt: "",
        imagePromptConfig: null,
        preferredImageModel: "gpt-image-1.5",
        visualPromptBrief: null,
        scoreBreakdown: null,
        hook: packageHook,
        overlayText: clampOverlayLine(cleanOffer || packageHeadline),
        primaryText: packagePrimaryText,
        headline: packageHeadline,
        cta,
        score: 0,
        recommended: index === 0,
      };
    });

  const ads: StaticCreativeAsset[] = [
    ...mediaBuyerPackageAds,
    {
      id: "static-ugc-proof",
      angle: "contrarian",
      imageUrl: "",
      imageGenerationState: "unavailable",
      imageGenerationMessage: null,
      imageGenerationModel: null,
      visualConcept: `UGC creator proof frame showing a relatable ${audience} decision moment around ${cleanOffer}`,
      imagePrompt: "",
      imagePromptConfig: null,
      preferredImageModel: "gpt-image-1.5",
      visualPromptBrief: null,
      scoreBreakdown: null,
      hook:
        approvalFocused
          ? `POV: you stopped touring before knowing what you can actually qualify for in ${market}.`
          : strategy.campaignCategory === "seller"
            ? `POV: you checked demand before guessing your list price in ${market}.`
            : strategy.campaignCategory === "investor"
              ? `POV: you stopped chasing weak-fit deals and screened the numbers first.`
              : `POV: you checked the real path before everyone else reacted in ${market}.`,
      overlayText: buildOverlayText({
        category: strategy.campaignCategory,
        market,
        base: approvalFocused ? "Approval-first POV" : "Real buyer POV",
        trigger,
        proof,
      }),
      primaryText: buildStructuredPrimaryText({
        hook: `Most ${audience} in ${market} do the normal search first and ask the hard questions too late.`,
        problem: `That makes the process feel busier than it needs to be.`,
        outcome: `${sentenceCase(mechanism)} turns ${cleanOffer} into a clearer next step with ${proof.toLowerCase()} and a more believable reason to respond.`,
        cta,
      }),
      headline: approvalFocused
        ? `The buyer POV before the search starts`
        : `A more believable path to ${trimWords(cleanOffer, 6)}`,
      cta,
      score: 0,
      recommended: false,
    },
    {
      id: "static-ugc-walkthrough",
      angle: "opportunity",
      imageUrl: "",
      imageGenerationState: "unavailable",
      imageGenerationMessage: null,
      imageGenerationModel: null,
      visualConcept: `UGC-style walkthrough still with native social energy and proof around ${cleanOffer}`,
      imagePrompt: "",
      imagePromptConfig: null,
      preferredImageModel: "gpt-image-1.5",
      visualPromptBrief: null,
      scoreBreakdown: null,
      hook:
        approvalFocused
          ? `This is what most ${market} buyers should check before they fall in love with a listing.`
          : strategy.campaignCategory === "seller"
            ? `Before listing, this is the demand signal most ${market} homeowners miss.`
            : strategy.campaignCategory === "luxury"
              ? `This is the quieter way serious buyers review rare ${market} inventory.`
              : `This is the simple check most ${audience} should do before the market gets crowded.`,
      overlayText: buildOverlayText({
        category: strategy.campaignCategory,
        market,
        base: approvalFocused ? "Before you tour" : "Watch this first",
        trigger,
        proof,
      }),
      primaryText: buildStructuredPrimaryText({
        hook: `The strongest creative should feel native to the feed, not like a generic real estate flyer.`,
        problem: `Most ads look polished but do not make the viewer feel the problem.`,
        outcome: `${sentenceCase(mechanism)} gives this UGC-style angle a concrete reason to care about ${cleanOffer} before the next click.`,
        cta,
      }),
      headline: `UGC-style angle for ${trimWords(cleanOffer, 6)}`,
      cta,
      score: 0,
      recommended: false,
    },
    {
      id: "static-problem-solution",
      angle: "guarantee",
      imageUrl: "",
      imageGenerationState: "unavailable",
      imageGenerationMessage: null,
      imageGenerationModel: null,
      visualConcept: `${market} problem-solution ad focused on ${cleanOffer}`,
      imagePrompt: "",
      imagePromptConfig: null,
      preferredImageModel: "gpt-image-1.5",
      visualPromptBrief: null,
      scoreBreakdown: null,
      hook:
        approvalFocused
          ? `Most first-time buyers in ${market} start with listings instead of buying power.`
          : /guarantee|guaranteed/.test(normalizedOffer) && !hookLooksGeneric(cleanOffer, rulePack.forbiddenHookPatterns)
          ? shortSentence(cleanOffer)
          : `If ${tension.toLowerCase()} is slowing you down in ${market}, there is a simpler next step.`,
      overlayText: buildOverlayText({
        category: strategy.campaignCategory,
        market,
        base: approvalFocused
          ? trimWords(`Approval first in ${market}`, 5)
          : categoryOverlays[strategy.campaignCategory][0],
        trigger,
        proof,
      }),
      primaryText: approvalFocused
        ? buildStructuredPrimaryText({
            hook: `Most ${audience} in ${market} waste time shopping before they understand approval.`,
            problem: `That creates confusion, delays, and missed-fit homes.`,
            outcome: `${sentenceCase(mechanism)} gives them a clearer approval-first path with ${proof.toLowerCase()} so they can move faster on the right ${brief.propertyType}.`,
            cta,
          })
        : buildStructuredPrimaryText({
            hook: `${audience} in ${market} keep losing momentum because ${tension.toLowerCase()}.`,
            problem: `The usual process creates noise instead of clarity.`,
            outcome: `${sentenceCase(mechanism)} turns that into a simple path toward ${cleanOffer} with ${proof.toLowerCase()} so the next move feels obvious.`,
            cta,
          }),
      headline:
        approvalFocused
          ? `Know what you qualify for before you shop in ${market}`
          : strategy.campaignCategory === "seller"
          ? `Fix the pricing problem before you list in ${market}`
          : strategy.campaignCategory === "investor"
            ? `Solve the deal-selection problem before capital moves`
            : `A simpler path to ${trimWords(cleanOffer, 6)}`,
      cta,
      score: 0,
      recommended: false,
    },
    {
      id: "static-offer-driven",
      angle: "urgency",
      imageUrl: "",
      imageGenerationState: "unavailable",
      imageGenerationMessage: null,
      imageGenerationModel: null,
      visualConcept: `Offer-driven ad built around speed and ${cleanOffer}`,
      imagePrompt: "",
      imagePromptConfig: null,
      preferredImageModel: "gpt-image-1.5",
      visualPromptBrief: null,
      scoreBreakdown: null,
      hook:
        approvalFocused
          ? `Most first-time buyers in ${market} do not realize how close they are to the right next step.`
          : strategy.campaignCategory === "precon"
          ? fillTemplate(rulePack.approvedHookStructures[2], templateParams)
          : strategy.campaignCategory === "luxury"
            ? fillTemplate(rulePack.approvedHookStructures[2], templateParams)
            : `If you want ${trimWords(cleanOffer, 6)}, this is the clearest path we have right now.`,
      overlayText: buildOverlayText({
        category: strategy.campaignCategory,
        market,
        base: approvalFocused
          ? trimWords(`Qualify before you shop`, 5)
          : categoryOverlays[strategy.campaignCategory][1],
        trigger,
        proof,
      }),
      primaryText: approvalFocused
        ? buildStructuredPrimaryText({
            hook: `Most ${audience} wait too long because the path feels unclear.`,
            problem: `That hesitation turns good-fit options into missed opportunities.`,
            outcome: `${sentenceCase(mechanism)} makes the offer easier to understand so buyers can act with confidence instead of guessing.`,
            cta,
          })
        : buildStructuredPrimaryText({
            hook: `If you are trying to secure ${cleanOffer} in ${market}, timing matters.`,
            problem: `Most ${audience} do not move until broad attention shows up.`,
            outcome: `${sentenceCase(mechanism)} gives a faster path around ${trigger.toLowerCase()} so you can act on the offer before the crowd catches up.`,
            cta,
          }),
      headline:
        approvalFocused
          ? `See the offer before you waste time touring`
          : strategy.campaignCategory === "precon"
          ? `Lock today's entry path before the next shift in ${market}`
          : strategy.campaignCategory === "luxury"
            ? `Rare opportunity in ${market} for the right buyer`
            : `Get the offer-driven edge before the market reacts`,
      cta,
      score: 0,
      recommended: false,
    },
    {
      id: "static-testimonial",
      angle: "contrarian",
      imageUrl: "",
      imageGenerationState: "unavailable",
      imageGenerationMessage: null,
      imageGenerationModel: null,
      visualConcept: `Testimonial-style ad that reframes how ${audience} achieve ${cleanOffer}`,
      imagePrompt: "",
      imagePromptConfig: null,
      preferredImageModel: "gpt-image-1.5",
      visualPromptBrief: null,
      scoreBreakdown: null,
      hook:
        approvalFocused
          ? `One buyer in ${market} stopped guessing and finally bought with confidence.`
          : strategy.campaignCategory === "investor"
          ? `One investor used this process to stop chasing weak-fit deals.`
          : strategy.campaignCategory === "seller"
            ? `One homeowner fixed the pricing mistake before listing in ${market}.`
            : `This is the kind of result people talk about after the right move in ${market}.`,
      overlayText: buildOverlayText({
        category: strategy.campaignCategory,
        market,
        base: approvalFocused
          ? trimWords(`Most buyers start backwards`, 4)
          : categoryOverlays[strategy.campaignCategory][2],
        trigger,
        proof,
      }),
      primaryText: approvalFocused
        ? buildStructuredPrimaryText({
            hook: `A recent ${audience.slice(0, -1) || "buyer"} in ${market} stopped reacting to listing noise before understanding approval.`,
            problem: `They were close to making the same mistakes most buyers make.`,
            outcome: `${sentenceCase(mechanism)} gave them next-step clarity and ${proof.toLowerCase()} so they could move with confidence instead of guesswork.`,
            cta,
          })
        : buildStructuredPrimaryText({
            hook: `We keep seeing the same story from ${audience} in ${market}.`,
            problem: `They spend too long reacting to surface-level options and weak-fit opportunities.`,
            outcome: `${sentenceCase(mechanism)} helps them reach ${cleanOffer} with ${proof.toLowerCase()} and a clearer path to the right outcome.`,
            cta,
          }),
      headline:
        approvalFocused
          ? `A better buyer outcome starts with clarity`
          : strategy.campaignCategory === "seller"
          ? `The seller result most homeowners want in ${market}`
          : strategy.campaignCategory === "investor"
            ? `What a stronger investor result looks like in ${market}`
            : `The result people want from the right ${brief.propertyType}`,
      cta,
      score: 0,
      recommended: false,
    },
    {
      id: "static-opportunity",
      angle: "opportunity",
      imageUrl: "",
      imageGenerationState: "unavailable",
      imageGenerationMessage: null,
      imageGenerationModel: null,
      visualConcept: `Opportunity ad anchored in access and ${cleanOffer}`,
      imagePrompt: "",
      imagePromptConfig: null,
      preferredImageModel: "gpt-image-1.5",
      visualPromptBrief: null,
      scoreBreakdown: null,
      hook:
        approvalFocused
          ? `See the right ${brief.propertyType} in ${market} after your approval path is clear`
          : strategy.campaignCategory === "buyer"
          ? fillTemplate(rulePack.approvedHookStructures[2], templateParams)
          : strategy.campaignCategory === "luxury"
            ? fillTemplate(rulePack.approvedHookStructures[2], templateParams)
          : strategy.campaignCategory === "precon"
            ? fillTemplate(rulePack.approvedHookStructures[1], templateParams)
            : /off-market/.test(normalizedOffer)
              ? `See off-market ${brief.propertyType} in ${market} before other buyers do`
              : /cash ?flow/.test(normalizedOffer)
                ? `See cash-flow deals in ${market} before the crowd moves`
                : `See better-fit ${brief.propertyType} in ${market} before everyone else`,
      overlayText:
        buildOverlayText({
          category: strategy.campaignCategory,
          market,
          base:
            approvalFocused
              ? "After Approval Clarity"
            : strategy.campaignCategory === "buyer"
              ? "Before Other Buyers Do"
              : strategy.campaignCategory === "luxury"
                ? "Private Access"
                : /off-market/.test(normalizedOffer)
                  ? "Before They Hit The Market"
                  : "Before Everyone Else",
          trigger,
          proof,
        }),
      primaryText:
        approvalFocused
          ? `${audience} in ${market} miss the strongest opportunities because they are unsure what they can actually buy. ${sentenceCase(mechanism)} brings approval-ready matches forward with ${proof.toLowerCase()} before everyone else reacts. ${cta}.`
        : strategy.campaignCategory === "luxury"
          ? `${sentenceCase(mechanism)} brings rare ${brief.propertyType} in ${market} to the right buyer with ${proof.toLowerCase()} and the tension of ${tension.toLowerCase()} before they become broadly visible. ${cta}.`
          : `${audience} in ${market} miss the strongest opportunities because ${tension.toLowerCase()}. ${sentenceCase(mechanism)} brings the strongest matches forward with ${proof.toLowerCase()} before everyone else reacts. ${cta}.`,
      headline:
        approvalFocused
          ? `Find homes that fit your approval path in ${market}`
        : strategy.campaignCategory === "buyer"
          ? `See homes you may not know you can afford in ${market}`
          : strategy.campaignCategory === "luxury"
            ? `Private access to rare ${brief.propertyType} in ${market}`
          : `Access stronger ${brief.propertyType} in ${market}`,
      cta,
      score: 0,
      recommended: false,
    },
    {
      id: "static-direct-offer",
      angle: "guarantee",
      imageUrl: "",
      imageGenerationState: "unavailable",
      imageGenerationMessage: null,
      imageGenerationModel: null,
      visualConcept: `Direct response offer ad centered on ${cleanOffer}`,
      imagePrompt: "",
      imagePromptConfig: null,
      preferredImageModel: "gpt-image-1.5",
      visualPromptBrief: null,
      scoreBreakdown: null,
      hook:
        strategy.campaignCategory === "seller"
          ? `${market} sellers: this is the offer to review before you list.`
          : `${market}: compare your next move against ${trimWords(cleanOffer, 7)}.`,
      overlayText: buildOverlayText({
        category: strategy.campaignCategory,
        market,
        base: cleanOffer,
        trigger,
        proof,
      }),
      primaryText: buildStructuredPrimaryText({
        hook: `${audience} in ${market} need the offer clear before they decide.`,
        problem: `Most campaigns bury the strongest reason to respond behind generic market copy.`,
        outcome: `${sentenceCase(mechanism)} keeps ${cleanOffer} at the center with ${proof.toLowerCase()} so the next step is easier to take.`,
        cta,
      }),
      headline: `${trimWords(cleanOffer, 8)} in ${market}`,
      cta,
      score: 0,
      recommended: false,
    },
  ].slice(0, 6) as StaticCreativeAsset[];

  return preventDuplicateStaticCreativeCopy(rankStaticCreativeAssets(
    ads.map((ad): StaticCreativeAsset => {
      const visualBrief = buildStaticVisualPromptBrief({
        location: market,
        audience,
        propertyType: brief.propertyType,
        keyOffer: cleanOffer,
        angle: ad.angle,
        strategy,
      });
      const isUgcStaticAd = /\bugc\b/i.test(`${ad.id} ${ad.visualConcept} ${ad.hook}`);
      const imagePromptConfig = isUgcStaticAd
        ? {
            ...visualBrief.promptConfig,
            prompt: [
              visualBrief.promptConfig.prompt,
              "UGC-specific execution: make this a native social ad frame with a believable creator POV, a phone-camera or handheld walkthrough feel, a real decision moment, and enough polish for paid acquisition. The subject should feel like a real buyer/seller/investor/customer perspective, not an influencer photoshoot.",
            ].join(" "),
          }
        : visualBrief.promptConfig;

      const offerDrivenAd = ensureOfferDrivenStaticAd({
        ...ad,
        hook: hookLooksGeneric(ad.hook, rulePack.forbiddenHookPatterns) ? baseHook : ad.hook,
        angle: ad.angle as StaticCreativeAsset["angle"],
        imageUrl: "",
        imageGenerationState: "unavailable",
        imageGenerationMessage: "Image preview has not been generated yet.",
        imageGenerationModel: null,
        imagePrompt: imagePromptConfig.prompt ?? "",
        imagePromptConfig,
        preferredImageModel: visualBrief.preferredModel,
        visualPromptBrief: visualBrief,
        visualConcept: visualBrief.visualConcept,
        score: scoreStaticAd(ad),
        offerQuality: null,
        qualityGate: null,
      }, strategy, cleanOffer);

      return repairStaticCreativeForMediaBuyerQuality({
        ad: offerDrivenAd,
        strategy,
        offer: cleanOffer,
        market,
        audience,
        propertyType: brief.propertyType,
      });
    }),
    strategy,
    { market },
  ));
}

async function buildVideoCreatives(brief: CreativeBrief): Promise<VideoCreativeAsset[]> {
  const market = toTitleCase(brief.location);
  const strategy = preserveExplicitConsumerAudienceCategory(buildDefaultCreativeStrategy({
    intent: inferCampaignIntent({
      audience: brief.audience,
      offer: brief.keyOffer,
      mechanism: brief.mechanism,
    }),
    audience: brief.audience,
    propertyType: brief.propertyType,
    keyOffer: brief.keyOffer,
    mechanism: brief.mechanism,
    primaryGoal: brief.angles[0],
    painPoints: brief.painPoints,
  }), brief.audience, brief.keyOffer);
  const mediaBuyer = getMediaBuyerCategoryStrategy(strategy.campaignCategory);
  const proof = strategy.proofStyle || mediaBuyer.proofStyles[0] || "clearer proof before the next step";
  const mechanism = strategy.mechanism || mediaBuyer.mechanismStyles[0] || brief.mechanism;
  const cta = buildOfferAlignedCta(brief.keyOffer, strategy.campaignCategory, selectMediaBuyerCta(strategy.campaignCategory));
  const baseAvatar = selectAvatarProfile(brief);
  const baseVoice = selectVoiceProfile(brief);
  const founderAvatar: AvatarProfile = {
    ...baseAvatar,
    id: "trusted_expert",
    stylePersona: "trusted real estate expert",
    energy: "calm and decisive",
  };
  const founderVoice: VoiceProfile = {
    ...baseVoice,
    id: "authoritative",
    tone: "authoritative and clear",
    speed: "measured",
    authorityLevel: "high",
  };
  const customerAvatar: AvatarProfile = {
    ...baseAvatar,
    id: /first|new|starter/i.test(brief.audience) ? "young_agent" : "ugc_casual",
    stylePersona: /first|new|starter/i.test(brief.audience) ? "young local agent" : "casual UGC creator",
    energy: /first|new|starter/i.test(brief.audience) ? "upbeat" : "warm and conversational",
  };
  const customerVoice: VoiceProfile = {
    ...baseVoice,
    id: /investor|investment|cashflow/i.test(brief.audience)
      ? "authoritative"
      : /first|new|starter/i.test(brief.audience)
        ? "friendly"
        : "confident",
    tone: /investor|investment|cashflow/i.test(brief.audience)
      ? "authoritative and sharp"
      : /first|new|starter/i.test(brief.audience)
        ? "friendly and reassuring"
        : "confident and clear",
  };
  const [founderVideo, customerVideo] = await Promise.all([
    createVideoAd(brief, founderAvatar, founderVoice),
    createVideoAd(brief, customerAvatar, customerVoice),
  ]);
  const founderFallbackScript = buildVideoArchetype({
    category: strategy.campaignCategory,
    market,
    audience: brief.audience,
    propertyType: brief.propertyType,
    offer: brief.keyOffer,
    mechanism,
    proof,
    cta,
    hookFallback: brief.hooks[0] ?? mediaBuyer.approvedHookPatterns[0] ?? "Nobody is talking about this.",
    painFallback: brief.painPoints[0] ?? mediaBuyer.internalTensions[0] ?? "The normal search path creates too much noise.",
  });
  const ugcFallbackScript = buildVideoArchetype({
    category: strategy.campaignCategory,
    market,
    audience: brief.audience,
    propertyType: brief.propertyType,
    offer: brief.keyOffer,
    mechanism,
    proof,
    cta,
    hookFallback: brief.hooks[1] ?? mediaBuyer.approvedHookPatterns[1] ?? "You may be looking in the wrong place.",
    painFallback: brief.painPoints[1] ?? mediaBuyer.internalTensions[0] ?? "Most people wait until the opportunity is already obvious.",
  });
  const founderScript = founderFallbackScript;
  const ugcScript = ugcFallbackScript;
  const founderQuality = evaluateVideoScriptQuality({
    category: strategy.campaignCategory,
    script: founderScript,
    offer: brief.keyOffer,
    mechanism,
    audience: brief.audience,
    cta,
    visualConcept: mediaBuyer.visualLogic[0] || "casual talking head",
  });
  const ugcQuality = evaluateVideoScriptQuality({
    category: strategy.campaignCategory,
    script: ugcScript,
    offer: brief.keyOffer,
    mechanism,
    audience: brief.audience,
    cta,
    visualConcept: "casual UGC talking head with proof overlay",
  });

  return [
    {
      id: "video-founder",
      conceptType: "founder_expert",
      title: `${market} expert breakdown`,
      hook: founderScript[0] || founderVideo.hook,
      script: founderScript,
      shotList: founderVideo.scenes.length > 0
        ? founderVideo.scenes.map((scene) => scene.description)
        : ["Hook", "Problem", "Mechanism", "Proof", "Offer", "CTA"],
      onScreenText: [
        `${market} ${brief.audience}`,
        brief.keyOffer,
        proof,
      ],
      videoUrl: founderVideo.videoUrl,
      videoGenerationState: founderVideo.videoUrl ? "generated" : "unavailable",
      videoGenerationMessage: founderVideo.videoUrl ? null : "This video preview is not ready yet.",
      providerAssetId: null,
      cta,
      creatorStyle: "founder / local expert",
      voiceStyle: brief.scriptStyle === "authority" ? "clear, decisive, high-authority" : "clear and direct",
      avatarProfile: founderVideo.avatar,
      voiceProfile: founderVideo.voice,
      qualityGate: founderQuality,
    },
    {
      id: "video-ugc",
      conceptType: "customer_ugc",
      title: strategy.campaignCategory === "seller" ? `${market} seller POV` : `${market} buyer POV`,
      hook: ugcScript[0] || customerVideo.hook,
      script: ugcScript,
      shotList: customerVideo.scenes.length > 0
        ? customerVideo.scenes.map((scene) => scene.description)
        : ["Hook", "Problem", "Mechanism", "Proof", "Offer", "CTA"],
      onScreenText: [
        `Tired of losing in ${market}?`,
        brief.keyOffer,
        cta,
      ],
      videoUrl: customerVideo.videoUrl,
      videoGenerationState: customerVideo.videoUrl ? "generated" : "unavailable",
      videoGenerationMessage: customerVideo.videoUrl ? null : "This video preview is not ready yet.",
      providerAssetId: null,
      cta,
      creatorStyle: "customer / relatable UGC",
      voiceStyle: "fast, authentic, reassuring",
      avatarProfile: customerVideo.avatar,
      voiceProfile: customerVideo.voice,
      qualityGate: ugcQuality,
    },
  ];
}

function buildVideoCreativeDrafts(brief: CreativeBrief, rawOffer?: string): VideoCreativeAsset[] {
  const market = toTitleCase(brief.location);
  const videoOffer = safeText(rawOffer) || brief.keyOffer;
  const strategy = preserveExplicitConsumerAudienceCategory(buildDefaultCreativeStrategy({
    intent: inferCampaignIntent({
      audience: brief.audience,
      offer: videoOffer,
      mechanism: brief.mechanism,
    }),
    audience: brief.audience,
    propertyType: brief.propertyType,
    keyOffer: videoOffer,
    mechanism: brief.mechanism,
    primaryGoal: brief.angles[0],
    painPoints: brief.painPoints,
  }), brief.audience, videoOffer);
  const mediaBuyer = getMediaBuyerCategoryStrategy(strategy.campaignCategory);
  const proof = strategy.proofStyle || mediaBuyer.proofStyles[0] || "clearer proof before the next step";
  const mechanism = strategy.mechanism || mediaBuyer.mechanismStyles[0] || brief.mechanism;
  const founderCta = buildOfferAlignedCta(videoOffer, strategy.campaignCategory, selectMediaBuyerCta(strategy.campaignCategory));
  const founderScript = buildVideoArchetype({
    category: strategy.campaignCategory,
    market,
    audience: brief.audience,
    propertyType: brief.propertyType,
    offer: videoOffer,
    mechanism,
    proof,
    cta: founderCta,
    hookFallback: brief.hooks[0] || fillMediaBuyerPattern(mediaBuyer.approvedHookPatterns[0] || `${market}: stop missing the strongest opportunities`, {
      market,
      propertyType: brief.propertyType,
    }),
    painFallback: brief.painPoints[0] || mediaBuyer.internalTensions[0] || `Most ${brief.audience} wait until the obvious move is already crowded.`,
  });
  const ugcScript = buildVideoArchetype({
    category: strategy.campaignCategory,
    market,
    audience: brief.audience,
    propertyType: brief.propertyType,
    offer: videoOffer,
    mechanism,
    proof,
    cta: founderCta,
    hookFallback: brief.hooks[1] || `Most ${brief.audience} are still looking in the wrong places`,
    painFallback: brief.painPoints[1] || `The problem is not effort; it is not knowing which option is actually worth acting on.`,
  });
  const founderQuality = evaluateVideoScriptQuality({
    category: strategy.campaignCategory,
    script: founderScript,
    offer: videoOffer,
    mechanism,
    audience: brief.audience,
    cta: founderCta,
    visualConcept: mediaBuyer.visualLogic[0],
  });
  const ugcQuality = evaluateVideoScriptQuality({
    category: strategy.campaignCategory,
    script: ugcScript,
    offer: videoOffer,
    mechanism,
    audience: brief.audience,
    cta: founderCta,
    visualConcept: "casual UGC talking head with proof overlay",
  });

  return [
    {
      id: "video-founder",
      conceptType: "founder_expert",
      title: `${market} expert breakdown`,
      hook: founderScript[0],
      script: founderScript,
      shotList: ["Hook", "Problem", "Mechanism", "Proof", "Offer", "CTA"],
      onScreenText: [market, videoOffer, proof, founderCta],
      videoUrl: undefined,
      videoGenerationState: "unavailable",
      videoGenerationMessage: "This video preview is not ready yet.",
      providerAssetId: null,
      cta: founderCta,
      creatorStyle: "founder / local expert",
      voiceStyle: "clear and direct",
      avatarProfile: selectAvatarProfile(brief),
      voiceProfile: selectVoiceProfile(brief),
      qualityGate: founderQuality,
    },
    {
      id: "video-ugc",
      conceptType: "customer_ugc",
      title: `${market} customer POV`,
      hook: ugcScript[0],
      script: ugcScript,
      shotList: ["Hook", "Problem", "Mechanism", "Proof", "Offer", "CTA"],
      onScreenText: [brief.audience, videoOffer, proof, founderCta],
      videoUrl: undefined,
      videoGenerationState: "unavailable",
      videoGenerationMessage: "This video preview is not ready yet.",
      providerAssetId: null,
      cta: founderCta,
      creatorStyle: "customer / relatable UGC",
      voiceStyle: "warm and conversational",
      avatarProfile: selectAvatarProfile(brief),
      voiceProfile: selectVoiceProfile(brief),
      qualityGate: ugcQuality,
    },
  ];
}

function buildVideoArchetype(params: {
  category: ReturnType<typeof buildDefaultCreativeStrategy>["campaignCategory"];
  market: string;
  audience: string;
  propertyType: string;
  offer: string;
  mechanism: string;
  proof: string;
  cta: string;
  hookFallback: string;
  painFallback: string;
}) {
  const { category, market, audience, propertyType, offer, mechanism, proof, cta, hookFallback, painFallback } = params;
  const cleanOffer = shortSentence(offer);
  const sellerOfferHook = isTimeboxedSellerOffer(cleanOffer, category)
    ? `${market} sellers: the ${cleanOffer} only matters if you know whether your home qualifies.`
    : `Before you sell in ${market}, make the offer and the risk clear first.`;
  const archetypes = {
    seller: {
      hook: sellerOfferHook,
      problem: `Most homeowners do not lose money after listing; they lose it when they price too late, wait too long, or guess at demand.`,
      mechanism: `${sentenceCase(mechanism)} compares your pricing, timing, and demand signals before the listing goes public.`,
      proof: `${sentenceCase(proof)} shows whether the path is strong enough before you commit to the wrong move.`,
      offer: isTimeboxedSellerOffer(cleanOffer, category)
        ? `The core offer is ${cleanOffer}, built around a clearer 90-day sale plan.`
        : cleanOffer,
      cta,
    },
    buyer: {
      hook: `By the time most buyers see the listing in ${market}, it may already be gone.`,
      problem: `The issue is not effort; it is getting access and affordability clarity too late.`,
      mechanism: `${sentenceCase(mechanism)} filters homes around fit, timing, and budget before the broad market reacts.`,
      proof: `${sentenceCase(proof)} shows the path before you waste time chasing the wrong ${propertyType}.`,
      offer: cleanOffer,
      cta,
    },
    precon: {
      hook: `You do not always need the full resale down payment to get into ${market}.`,
      problem: `The risk is waiting until completion or future pricing makes the entry harder.`,
      mechanism: `${sentenceCase(mechanism)} uses deposit timing and project selection instead of a normal resale search.`,
      proof: `${sentenceCase(proof)} makes the upside and timeline easier to compare.`,
      offer: cleanOffer,
      cta,
    },
    investor: {
      hook: `If you are still searching public listings for deals in ${market}, you may already be late.`,
      problem: `The best investor opportunities usually get filtered before they look obvious to everyone else.`,
      mechanism: `${sentenceCase(mechanism)} screens markets around ROI, risk, and timing.`,
      proof: `${sentenceCase(proof)} gives you a cleaner reason to review the deal before capital moves.`,
      offer: cleanOffer,
      cta,
    },
    commercial: {
      hook: `If your business needs space in ${market}, the wrong shortlist can waste weeks.`,
      problem: `Most commercial searches break down because availability, timing, and operating requirements are compared too late.`,
      mechanism: `${sentenceCase(mechanism)} filters options around fit, location, and timing before the search gets noisy.`,
      proof: `${sentenceCase(proof)} gives you a cleaner way to compare the right ${propertyType}.`,
      offer: cleanOffer,
      cta,
    },
    luxury: {
      hook: `This kind of ${market} opportunity is not meant for everyone.`,
      problem: `Public-market luxury inventory often loses the privacy and fit that serious buyers actually want.`,
      mechanism: `${sentenceCase(mechanism)} keeps access curated before the release becomes broadly visible.`,
      proof: `${sentenceCase(proof)} gives the right buyer a quieter path to review it.`,
      offer: cleanOffer,
      cta,
    },
  } as const;
  const selected = archetypes[category] ?? {
    hook: hookFallback,
    problem: painFallback,
    mechanism: `${sentenceCase(mechanism)} creates a clearer path than generic browsing.`,
    proof: `${sentenceCase(proof)} reduces uncertainty before the next step.`,
    offer: cleanOffer,
    cta,
  };

  return [
    selected.hook,
    selected.problem,
    selected.mechanism,
    selected.proof,
    selected.offer,
    selected.cta,
  ].map((line) => line.replace(/\bhi,?\s+my name is\b/gi, "").trim()).filter(Boolean);
}

function evaluateVideoScriptQuality(params: {
  category: ReturnType<typeof buildDefaultCreativeStrategy>["campaignCategory"];
  script: string[];
  offer: string;
  mechanism: string;
  audience: string;
  cta: string;
  visualConcept: string;
}) {
  return evaluateCreativeQuality({
    category: params.category,
    offer: params.offer,
    mechanism: params.mechanism,
    audience: params.audience,
    hook: params.script[0] || "",
    cta: params.cta,
    visualConcept: params.visualConcept,
    scriptLines: params.script,
  });
}

function toCanonicalCreativeItems(params: {
  staticAds: StaticCreativeAsset[];
  videoAds: VideoCreativeAsset[];
}): CanonicalCreativeItem[] {
  const staticItems = params.staticAds.map((ad): CanonicalCreativeItem => ({
    id: ad.id,
    kind: "static",
    angle: ad.angle,
    format: "ugc",
    title: ad.headline,
    hook: ad.hook,
    overlayText: ad.overlayText,
    primaryText: ad.primaryText,
    headline: ad.headline,
    cta: ad.cta,
    score: ad.score,
    recommended: ad.recommended,
    concept: ad.visualConcept,
    visualDirection: ad.visualConcept,
    imagePrompt: ad.imagePrompt,
    scriptLines: [ad.hook, ad.primaryText, ad.cta],
    sceneDescriptions: ["Hook frame", "Body frame", "CTA frame"],
    onScreenText: [ad.overlayText, ad.headline, ad.cta],
    assetRefs: {
      imageUrl: ad.imageUrl || null,
      videoUrl: null,
      thumbnailUrl: ad.imageUrl || null,
      voiceUrl: null,
    },
  }));

  const videoItems = params.videoAds.map((video, index): CanonicalCreativeItem => ({
    id: video.id,
    kind: "video",
    angle: index === 0 ? "authority" : "opportunity",
    format: video.conceptType === "founder_expert" ? "talking_head" : "ugc",
    title: video.title,
    hook: video.hook,
    overlayText: video.onScreenText[0] || video.hook,
    primaryText: video.script.slice(0, -1).join(" "),
    headline: video.title,
    cta: video.cta,
    score: index === 0 ? 8.8 : 8.4,
    recommended: index === 0,
    concept: video.title,
    visualDirection: video.creatorStyle,
    imagePrompt: "",
    scriptLines: video.script,
    sceneDescriptions: video.shotList,
    onScreenText: video.onScreenText,
    assetRefs: {
      imageUrl: null,
      videoUrl: video.videoUrl || null,
      thumbnailUrl: null,
      voiceUrl: null,
    },
    creatorStyle: video.creatorStyle,
    voiceStyle: video.voiceStyle,
    conceptType: video.conceptType,
  }));

  return [...staticItems, ...videoItems];
}

export function buildCreativeSystem(input?: CreativeEngineInput | null): CreativePackage {
  const normalized = normalizeInput(input);
  const brief = buildCreativeBrief({
    location: normalized.location,
    audience: normalized.audience,
    property_type: normalized.propertyType,
    offer: normalized.offer,
    mechanism: normalized.mechanism,
    desired_result: inferDesiredResult(normalized),
    pain_points: normalized.painPoints.length > 0 ? normalized.painPoints : [shortPain(normalized)],
    market_type: normalized.marketType,
  });
  const staticAds = buildStaticCreatives(brief, normalized.creativeStrategy, normalized.rawOffer);
  const videoAds = buildVideoCreativeDrafts(brief, normalized.rawOffer || normalized.offer);

  return {
    brief,
    items: toCanonicalCreativeItems({ staticAds, videoAds }),
    staticAds,
    videoAds,
  };
}

export async function generateStaticCreativeAds(
  input?: CreativeEngineInput | null,
): Promise<StaticCreativeAsset[]> {
  const baseSystem = buildCreativeSystem(input);
  const brief = baseSystem.brief;
  const baseStaticAds = baseSystem.staticAds;
  const generatedStaticAds = await Promise.all(
    baseStaticAds.map(async (asset) => {
      try {
        const providerUsage = input?.provider_usage_context?.createForAsset(asset) ?? null;
        const imageAd = await createImageAd(brief, asset, providerUsage);
        return {
          ...asset,
          imageUrl: imageAd.imageUrl ?? "",
          imageGenerationState: imageAd.generationState,
          imageGenerationMessage: imageAd.generationMessage,
          imageGenerationModel: imageAd.generationModel,
          imageGenerationProvider: imageAd.generationProvider,
        };
      } catch (error) {
        return {
          ...asset,
          imageUrl: "",
          imageGenerationState: "failed" as const,
          imageGenerationMessage:
            error instanceof Error ? error.message : "Static image generation failed.",
          imageGenerationModel: asset.preferredImageModel,
          imageGenerationProvider: null,
        };
      }
    }),
  );
  const normalized = normalizeInput(input);

  return rankStaticCreativeAssets(generatedStaticAds, normalized.creativeStrategy, {
    market: normalized.location,
  });
}

export async function generateCreativePackage(input?: CreativeEngineInput | null): Promise<CreativePackage> {
  const baseSystem = buildCreativeSystem(input);
  const brief = baseSystem.brief;
  const staticAds = await generateStaticCreativeAds(input);
  const videoAds = await buildVideoCreatives(brief);

  return {
    brief,
    items: toCanonicalCreativeItems({ staticAds, videoAds }),
    staticAds,
    videoAds,
  };
}

export function generateCreativeIdeas(input?: CreativeEngineInput | null): CreativeIdea[] {
  return buildCreativeSystem(input).items.map((item) => ({
    hook: item.overlayText || item.hook,
    angle:
      item.angle === "opportunity" || item.angle === "guarantee" || item.angle === "urgency"
        ? "opportunity"
        : item.angle === "contrarian"
          ? "pain"
          : item.angle === "authority"
            ? "authority"
            : "curiosity",
    format: item.format,
    concept: item.concept,
    visual_direction: item.visualDirection || item.imagePrompt,
  }));
}
