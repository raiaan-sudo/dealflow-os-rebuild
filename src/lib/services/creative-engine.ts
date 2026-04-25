import type { CampaignIntent } from "@/lib/campaign-intent";
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

  return Math.min(10, score);
}

function buildStaticCreatives(
  brief: CreativeBrief,
  strategy: CampaignCreativeStrategy,
): StaticCreativeAsset[] {
  const market = toTitleCase(brief.location);
  const audience = brief.audience;
  const offer = brief.keyOffer;
  const cleanOffer = normalizeOfferPhrase(offer) || shortSentence(offer);
  const normalizedOffer = safeText(offer).toLowerCase();
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

  const cta =
    approvalFocused
      ? "See If You Qualify"
      : rulePack.explicitLowFrictionCtas.find((candidate) => {
          const normalizedCta = candidate.toLowerCase();
          return (
            (strategy.campaignCategory === "seller" && /price|value|demand/.test(normalizedCta)) ||
            (strategy.campaignCategory === "investor" && /deal|yield|cash-flow/.test(normalizedCta)) ||
            (strategy.campaignCategory === "precon" && /deposit|timeline|entry/.test(normalizedCta)) ||
            (strategy.campaignCategory === "luxury" && /private|fits|release/.test(normalizedCta)) ||
            (strategy.campaignCategory === "buyer" && /homes|qualify|payment/.test(normalizedCta))
          );
        }) ??
        rulePack.explicitLowFrictionCtas[0] ??
        "See The Next Step";

  const categoryOverlays = {
    buyer: [
      trimWords(`Homes in ${market} you may not know you can afford`, 8),
      trimWords(`Before other buyers see them in ${market}`, 8),
      trimWords(`${market} payment path made clearer`, 7),
    ],
    seller: [
      trimWords(`${market} home value update`, 6),
      trimWords(`What is your ${market} home worth now?`, 8),
      trimWords(`Most sellers lose money before they list`, 8),
    ],
    investor: [
      trimWords(`${market} yield breakdown`, 5),
      trimWords(`Cash flow plus appreciation in ${market}`, 7),
      trimWords(`If your money is sitting still, watch this`, 8),
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

  const ads: StaticCreativeAsset[] = [
    {
      id: "static-guarantee",
      angle: "guarantee",
      imageUrl: "",
      imageGenerationState: "unavailable",
      imageGenerationMessage: null,
      imageGenerationModel: null,
      visualConcept: `${market} guarantee-led ad focused on ${cleanOffer}`,
      imagePrompt: "",
      imagePromptConfig: null,
      preferredImageModel: "gpt-image-1.5",
      visualPromptBrief: null,
      scoreBreakdown: null,
      hook:
        approvalFocused
          ? `First-time buyers in ${market}: know what you qualify for first.`
          : /guarantee|guaranteed/.test(normalizedOffer) && !hookLooksGeneric(cleanOffer, rulePack.forbiddenHookPatterns)
          ? shortSentence(cleanOffer)
          : baseHook,
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
        ? `${audience} in ${market} lose momentum because they tour properties before they know what they can actually qualify for. ${sentenceCase(mechanism)} gives them a clearer approval-first path with ${proof.toLowerCase()} so they can move on the right ${brief.propertyType} with confidence. ${cta}.`
        : `${audience} in ${market} keep stalling because ${tension.toLowerCase()}. ${sentenceCase(mechanism)} is the mechanism that moves them around ${cleanOffer} with ${proof.toLowerCase()} instead of broad market guesswork. ${cta}.`,
      headline:
        approvalFocused
          ? `Know what you qualify for before you shop in ${market}`
          : strategy.campaignCategory === "seller"
          ? `See your pricing gap before you list in ${market}`
          : strategy.campaignCategory === "investor"
            ? `See the deal breakdown before capital moves in ${market}`
            : shortSentence(offer) || `See ${cleanOffer} in ${market}`,
      cta,
      score: 0,
      recommended: false,
    },
    {
      id: "static-urgency",
      angle: "urgency",
      imageUrl: "",
      imageGenerationState: "unavailable",
      imageGenerationMessage: null,
      imageGenerationModel: null,
      visualConcept: `Urgency ad built around speed and ${cleanOffer}`,
      imagePrompt: "",
      imagePromptConfig: null,
      preferredImageModel: "gpt-image-1.5",
      visualPromptBrief: null,
      scoreBreakdown: null,
      hook:
        approvalFocused
          ? `Most first-time buyers in ${market} start in the wrong place.`
          : strategy.campaignCategory === "precon"
          ? fillTemplate(rulePack.approvedHookStructures[2], templateParams)
          : strategy.campaignCategory === "luxury"
            ? fillTemplate(rulePack.approvedHookStructures[2], templateParams)
            : `Move before the best ${brief.propertyType} in ${market} disappear.`,
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
        ? `Most ${audience} react too late because they burn time on homes that never fit their approval reality. ${sentenceCase(mechanism)} creates a faster approval-first path so the strongest-fit options show up before the scramble. ${cta}.`
        : `Most ${audience} react too late once broad market attention shows up. ${sentenceCase(mechanism)} creates a faster path around ${trigger.toLowerCase()} and the tension of ${tension.toLowerCase()} so the strongest fit shows up before the scramble. ${cta}.`,
      headline:
        approvalFocused
          ? `Stop touring before you know your number in ${market}`
          : strategy.campaignCategory === "precon"
          ? `Lock today's entry before the next shift in ${market}`
          : strategy.campaignCategory === "luxury"
            ? `Rare opportunity in ${market} for the right buyer`
            : `The best ${brief.propertyType} in ${market} move fast`,
      cta,
      score: 0,
      recommended: false,
    },
    {
      id: "static-contrarian",
      angle: "contrarian",
      imageUrl: "",
      imageGenerationState: "unavailable",
      imageGenerationMessage: null,
      imageGenerationModel: null,
      visualConcept: `Contrarian ad that reframes how ${audience} chase ${cleanOffer}`,
      imagePrompt: "",
      imagePromptConfig: null,
      preferredImageModel: "gpt-image-1.5",
      visualPromptBrief: null,
      scoreBreakdown: null,
      hook:
        approvalFocused
          ? `Looking at listings first is what slows most buyers down.`
          : strategy.campaignCategory === "investor"
          ? "The way most investors find deals is broken"
          : strategy.campaignCategory === "seller"
            ? fillTemplate(rulePack.approvedHookStructures[1], templateParams)
            : `The old way is costing you the right move in ${market}.`,
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
        ? `Most ${audience} are still reacting to listing noise before they know their approval ceiling. ${sentenceCase(mechanism)} reframes the decision around buying power, next-step clarity, and ${proof.toLowerCase()} instead of guesswork. ${cta}.`
        : `Most ${audience} are still reacting to surface-level options. ${sentenceCase(mechanism)} reframes the decision around ${cleanOffer} and the tension of ${tension.toLowerCase()} with ${proof.toLowerCase()} instead of generic listing noise. ${cta}.`,
      headline:
        approvalFocused
          ? `The old home-search order is costing buyers time`
          : strategy.campaignCategory === "seller"
          ? `Most homeowners in ${market} are making this mistake`
          : strategy.campaignCategory === "investor"
            ? `Stop chasing weak-fit deals in ${market}`
            : `Stop chasing the wrong ${brief.propertyType}`,
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
      id: "static-authority",
      angle: "authority",
      imageUrl: "",
      imageGenerationState: "unavailable",
      imageGenerationMessage: null,
      imageGenerationModel: null,
      visualConcept: `Authority ad positioned as an expert path to ${cleanOffer}`,
      imagePrompt: "",
      imagePromptConfig: null,
      preferredImageModel: "gpt-image-1.5",
      visualPromptBrief: null,
      scoreBreakdown: null,
      hook:
        approvalFocused
          ? `${market} buyers: there is a smarter path than guessing first.`
        : strategy.campaignCategory === "luxury"
          ? fillTemplate(rulePack.approvedHookStructures[0], templateParams)
          : `${market} ${audience}: there is a smarter path to ${trimWords(cleanOffer, 6)}.`,
      overlayText:
        approvalFocused
          ? "Approval-Led Strategy"
        : strategy.campaignCategory === "luxury"
          ? "Private Access"
          : "Expert-Led Advantage",
      primaryText: approvalFocused
        ? `Most ${audience} rely on broad public-market noise and hope the numbers work later. ${sentenceCase(mechanism)} keeps the decision anchored in approval clarity, realistic buying power, and ${proof.toLowerCase()} so the next move feels clearer. ${cta}.`
        : `Most ${audience} rely on broad public-market noise. ${sentenceCase(mechanism)} keeps the decision anchored in ${trigger.toLowerCase()}, the tension of ${tension.toLowerCase()}, and ${proof.toLowerCase()} so the next move feels clearer. ${cta}.`,
      headline:
        approvalFocused
          ? `A clearer path to buying power in ${market}`
        : strategy.campaignCategory === "luxury"
          ? `Private access to rare ${brief.propertyType} in ${market}`
          : `A clearer path to ${trimWords(cleanOffer, 6)}`,
      cta,
      score: 0,
      recommended: false,
    },
  ] as StaticCreativeAsset[];

  return rankStaticCreativeAssets(
    ads.map((ad): StaticCreativeAsset => {
      const visualBrief = buildStaticVisualPromptBrief({
        location: market,
        audience,
        propertyType: brief.propertyType,
        keyOffer: cleanOffer,
        angle: ad.angle,
        strategy,
      });

      return {
        ...ad,
        hook: hookLooksGeneric(ad.hook, rulePack.forbiddenHookPatterns) ? baseHook : ad.hook,
        angle: ad.angle as StaticCreativeAsset["angle"],
        imageUrl: "",
        imageGenerationState: "unavailable",
        imageGenerationMessage: "Image preview has not been generated yet.",
        imageGenerationModel: null,
        imagePrompt: visualBrief.promptConfig.prompt,
        imagePromptConfig: visualBrief.promptConfig,
        preferredImageModel: visualBrief.preferredModel,
        visualPromptBrief: visualBrief,
        visualConcept: visualBrief.visualConcept,
        score: scoreStaticAd(ad),
      };
    }),
    strategy,
    { market },
  );
}

async function buildVideoCreatives(brief: CreativeBrief): Promise<VideoCreativeAsset[]> {
  const market = toTitleCase(brief.location);
  const desiredOutcome =
    safeText(brief.angles[0]) ||
    `Move faster with ${brief.keyOffer}`;
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

  return [
    {
      id: "video-founder",
      conceptType: "founder_expert",
      title: `${market} expert breakdown`,
      hook: founderVideo.hook,
      script: founderVideo.script.length > 0
        ? founderVideo.script
        : [
            `Quick one — ${brief.hooks[0] ?? "nobody is talking about this"}`,
            `${brief.keyOffer} is still available in ${market}.`,
            `Comment 'LIST' and I will send it.`,
          ],
      shotList: founderVideo.scenes.map((scene) => scene.description),
      onScreenText: [
        `${market} ${brief.audience}`,
        brief.keyOffer,
        "Move faster now",
      ],
      videoUrl: founderVideo.videoUrl,
      videoGenerationState: founderVideo.videoUrl ? "generated" : "unavailable",
      videoGenerationMessage: founderVideo.videoUrl ? null : "This video preview is not ready yet.",
      providerAssetId: null,
      cta: /cash ?flow|investor|off-market/i.test(brief.keyOffer) ? "See Available Cash-Flow Deals" : "Book My Strategy Call",
      creatorStyle: "founder / local expert",
      voiceStyle: brief.scriptStyle === "authority" ? "clear, decisive, high-authority" : "clear and direct",
      avatarProfile: founderVideo.avatar,
      voiceProfile: founderVideo.voice,
    },
    {
      id: "video-ugc",
      conceptType: "customer_ugc",
      title: `${market} buyer POV`,
      hook: customerVideo.hook,
      script: customerVideo.script.length > 0
        ? customerVideo.script
        : [
            `Quick one — ${brief.hooks[1] ?? `stop ${brief.painPoints[0] ?? "missing deals"}`}`,
            `Most buyers in ${market} do not know where to find ${brief.keyOffer}.`,
            `Comment 'ACCESS' and I will send the list.`,
          ],
      shotList: customerVideo.scenes.map((scene) => scene.description),
      onScreenText: [
        `Tired of losing in ${market}?`,
        brief.keyOffer,
        "Get the list now",
      ],
      videoUrl: customerVideo.videoUrl,
      videoGenerationState: customerVideo.videoUrl ? "generated" : "unavailable",
      videoGenerationMessage: customerVideo.videoUrl ? null : "This video preview is not ready yet.",
      providerAssetId: null,
      cta: /cash ?flow|investor|off-market/i.test(brief.keyOffer) ? "See Available Cash-Flow Deals" : "Book My Strategy Call",
      creatorStyle: "customer / relatable UGC",
      voiceStyle: "fast, authentic, reassuring",
      avatarProfile: customerVideo.avatar,
      voiceProfile: customerVideo.voice,
    },
  ];
}

function buildVideoCreativeDrafts(brief: CreativeBrief): VideoCreativeAsset[] {
  const market = toTitleCase(brief.location);
  const founderCta =
    /cash ?flow|investor|off-market/i.test(brief.keyOffer) ? "See Available Cash-Flow Deals" : "See If You Qualify";
  const founderScript = [
    brief.hooks[0] || `${market}: stop missing the strongest opportunities`,
    `${brief.keyOffer} is easier to act on when the process is built around ${brief.mechanism || "speed and fit"}.`,
    founderCta,
  ];
  const ugcScript = [
    brief.hooks[1] || `Most ${brief.audience} are still looking in the wrong places`,
    `Instead of chasing crowded inventory, focus on ${brief.keyOffer} with a tighter path in ${market}.`,
    founderCta,
  ];

  return [
    {
      id: "video-founder",
      conceptType: "founder_expert",
      title: `${market} expert breakdown`,
      hook: founderScript[0],
      script: founderScript,
      shotList: ["Pattern interrupt", "Mechanism", "CTA"],
      onScreenText: [market, brief.keyOffer, founderCta],
      videoUrl: undefined,
      videoGenerationState: "unavailable",
      videoGenerationMessage: "This video preview is not ready yet.",
      providerAssetId: null,
      cta: founderCta,
      creatorStyle: "founder / local expert",
      voiceStyle: "clear and direct",
      avatarProfile: selectAvatarProfile(brief),
      voiceProfile: selectVoiceProfile(brief),
    },
    {
      id: "video-ugc",
      conceptType: "customer_ugc",
      title: `${market} customer POV`,
      hook: ugcScript[0],
      script: ugcScript,
      shotList: ["Pain", "Reframe", "CTA"],
      onScreenText: [brief.audience, brief.keyOffer, founderCta],
      videoUrl: undefined,
      videoGenerationState: "unavailable",
      videoGenerationMessage: "This video preview is not ready yet.",
      providerAssetId: null,
      cta: founderCta,
      creatorStyle: "customer / relatable UGC",
      voiceStyle: "warm and conversational",
      avatarProfile: selectAvatarProfile(brief),
      voiceProfile: selectVoiceProfile(brief),
    },
  ];
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
  const staticAds = buildStaticCreatives(brief, normalized.creativeStrategy);
  const videoAds = buildVideoCreativeDrafts(brief);

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
        const imageAd = await createImageAd(brief, asset);
        return {
          ...asset,
          imageUrl: imageAd.imageUrl ?? "",
          imageGenerationState: imageAd.generationState,
          imageGenerationMessage: imageAd.generationMessage,
          imageGenerationModel: imageAd.generationModel,
        };
      } catch (error) {
        return {
          ...asset,
          imageUrl: "",
          imageGenerationState: "failed" as const,
          imageGenerationMessage:
            error instanceof Error ? error.message : "Static image generation failed.",
          imageGenerationModel: asset.preferredImageModel,
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
