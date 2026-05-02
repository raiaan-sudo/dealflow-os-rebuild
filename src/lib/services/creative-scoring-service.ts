import type { StaticCreativeAsset } from "@/lib/services/creative-engine";
import type { CampaignCreativeStrategy } from "@/lib/services/campaign-creative-strategy";
import { getCategoryRulePack } from "@/lib/services/campaign-category-rule-packs";

export type CreativeScoreBreakdown = {
  categoryFit: number;
  triggerClarity: number;
  mechanismClarity: number;
  proofStrength: number;
  visualSpecificity: number;
  overlayUsefulness: number;
  ctaFriction: number;
  antiGenericPenalty: number;
};

export type ScoredStaticCreativeAsset = StaticCreativeAsset & {
  scoreBreakdown: CreativeScoreBreakdown;
};

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string) {
  return safeText(value).toLowerCase();
}

function containsAny(text: string, candidates: string[]) {
  return candidates.some((candidate) => {
    const token = normalize(candidate).replace(/[^\w\s-]+/g, " ").trim();
    if (!token) {
      return false;
    }

    return text.includes(token);
  });
}

function countOverlayLines(text: string) {
  return safeText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function scoreCtaFriction(cta: string) {
  const normalized = normalize(cta);

  if (/request private access/.test(normalized)) {
    return 9;
  }

  if (/see|view|request|check|explore/.test(normalized)) {
    return 9;
  }

  if (/get|unlock|learn/.test(normalized)) {
    return 7;
  }

  if (/book|buy|claim|apply now/.test(normalized)) {
    return 4;
  }

  return 6;
}

function scoreOverlayUsefulness(asset: StaticCreativeAsset, market: string) {
  const overlay = normalize(asset.overlayText);
  let score = 4;

  if (overlay.length >= 8 && overlay.length <= 60) score += 2;
  if (/\d|\$|%|20\d\d|under|from|free|before/.test(overlay)) score += 2;
  if (/roi|yield|payment|price|value|deposit|closing costs|interest/.test(overlay)) score += 1;
  if (market && overlay.includes(normalize(market))) score += 1;
  if (overlay.split(/\s+/).length <= 8) score += 1;
  if (countOverlayLines(asset.overlayText) > 2) score -= 3;

  return Math.min(10, score);
}

function scoreVisualSpecificity(asset: StaticCreativeAsset) {
  const prompt = normalize(asset.imagePrompt);
  const visualConcept = normalize(asset.visualConcept);
  let score = 4;

  if (asset.visualPromptBrief?.visualLogic.length) score += 2;
  if (asset.visualPromptBrief?.forbiddenPatterns.length) score += 1;
  if (/kitchen|backyard|skyline|suburban|dashboard|construction|penthouse|marble|map|chart|timeline|deposit|yield|payment|comparison/.test(prompt)) score += 2;
  if (visualConcept.split(/\s+/).length >= 6) score += 1;

  return Math.min(10, score);
}

function categoryAngleAdjustment(asset: StaticCreativeAsset, strategy: CampaignCreativeStrategy) {
  if (strategy.campaignCategory === "seller") {
    if (asset.angle === "guarantee" || asset.angle === "contrarian") {
      return 0.55;
    }

    return asset.angle === "opportunity" ? -0.45 : 0;
  }

  if (strategy.campaignCategory === "investor") {
    if (asset.angle === "guarantee" || asset.angle === "authority" || asset.angle === "contrarian") {
      return 0.45;
    }

    return asset.angle === "opportunity" ? -0.35 : 0;
  }

  if (strategy.campaignCategory === "luxury") {
    if (asset.angle === "authority") {
      return 0.7;
    }

    if (
      asset.angle === "opportunity" &&
      /private|rare|exclusive|curated|access/.test(normalize(`${asset.hook} ${asset.headline} ${asset.overlayText}`))
    ) {
      return 0.35;
    }

    return asset.angle === "opportunity" ? -0.4 : 0;
  }

  if (strategy.campaignCategory === "precon") {
    return asset.angle === "urgency" || asset.angle === "opportunity" ? 0.4 : 0;
  }

  return 0;
}

function getGenerationPriority(asset: StaticCreativeAsset) {
  if (asset.imageGenerationState === "generated" && asset.imageUrl) {
    return 2;
  }

  if (asset.imageGenerationState === "unavailable") {
    return 1;
  }

  return 0;
}

export function scoreStaticCreativeAsset(
  asset: StaticCreativeAsset,
  strategy: CampaignCreativeStrategy,
  context?: { market?: string | null },
): CreativeScoreBreakdown {
  const rulePack = getCategoryRulePack(strategy.campaignCategory);
  const text = normalize(
    [asset.hook, asset.overlayText, asset.primaryText, asset.headline, asset.imagePrompt, asset.visualConcept].join(" "),
  );
  const mechanism = normalize(strategy.mechanism);
  const trigger = normalize(strategy.triggerCondition);
  const proof = normalize(strategy.proofStyle);
  const market = safeText(context?.market);
  const hook = normalize(asset.hook);
  const cta = normalize(asset.cta);

  const categoryFit = Math.min(
    10,
    4 +
      (containsAny(text, rulePack.visualLogic) ? 2 : 0) +
      (containsAny(text, rulePack.winningAngles) ? 2 : 0) +
      (containsAny(text, rulePack.proofStyles) ? 1 : 0) +
      (containsAny(hook, rulePack.triggerConditions) || containsAny(hook, rulePack.internalTensions) ? 1 : 0),
  );

  const triggerClarity = Math.min(
    10,
    4 +
      (trigger && text.includes(trigger) ? 4 : 0) +
      (containsAny(text, rulePack.triggerConditions) ? 2 : 0),
  );

  const mechanismClarity = Math.min(
    10,
    3 +
      (mechanism && text.includes(mechanism) ? 5 : 0) +
      (containsAny(text, rulePack.approvedMechanismStyles) ? 2 : 0) +
      (/\bsystem\b|\bprocess\b|\bframework\b|\bstrategy\b|\bnetwork\b/.test(text) ? 1 : 0),
  );

  const proofStrength = Math.min(
    10,
    3 +
      (proof && text.includes(proof) ? 4 : 0) +
      (containsAny(text, rulePack.proofStyles) ? 2 : 0) +
      (/\d|\$|%|before|after|timeline|proof|yield|payment|price/.test(text) ? 1 : 0),
  );

  const visualSpecificity = scoreVisualSpecificity(asset);
  const overlayUsefulness = scoreOverlayUsefulness(asset, market);
  const ctaFriction = scoreCtaFriction(asset.cta);
  const antiGenericPenalty = Math.min(
    10,
    (containsAny(text, rulePack.antiPatterns) ? 4 : 0) +
      (/dream home|learn more about our process|premium service|modern real estate ad|our team|our service|beautiful property/.test(text) ? 4 : 0) +
      (/generic|beautiful home|luxury shot|stunning home|expert team|top agent/.test(text) ? 4 : 0) +
      (/agent-first|listing-first/.test(text) ? 2 : 0) +
      (containsAny(hook, rulePack.forbiddenHookPatterns) ? 4 : 0) +
      (/what is your home worth|new listing alert|exclusive opportunity/.test(hook) ? 4 : 0) +
      (!/\bsee\b|\bget\b|\bcheck\b|\brequest\b|\bview\b|\bqualify\b/.test(cta) ? 2 : 0),
  );

  return {
    categoryFit,
    triggerClarity,
    mechanismClarity,
    proofStrength,
    visualSpecificity,
    overlayUsefulness,
    ctaFriction,
    antiGenericPenalty,
  };
}

export function totalCreativeScore(breakdown: CreativeScoreBreakdown) {
  const positive =
    breakdown.categoryFit * 0.17 +
    breakdown.triggerClarity * 0.11 +
    breakdown.mechanismClarity * 0.18 +
    breakdown.proofStrength * 0.17 +
    breakdown.visualSpecificity * 0.13 +
    breakdown.overlayUsefulness * 0.12 +
    breakdown.ctaFriction * 0.12;
  const penalty = breakdown.antiGenericPenalty * 0.16;
  return Math.max(0, Math.min(10, Number((positive - penalty).toFixed(2))));
}

export function rankStaticCreativeAssets(
  assets: StaticCreativeAsset[],
  strategy: CampaignCreativeStrategy,
  context?: { market?: string | null },
): ScoredStaticCreativeAsset[] {
  const scored = assets.map((asset) => {
    const scoreBreakdown = scoreStaticCreativeAsset(asset, strategy, context);
    const mediaBuyerGateScore =
      typeof asset.qualityGate?.score === "number" ? asset.qualityGate.score : null;
    const adjustedScore =
      mediaBuyerGateScore === null
        ? totalCreativeScore(scoreBreakdown) + categoryAngleAdjustment(asset, strategy)
        : Math.min(
            mediaBuyerGateScore,
            totalCreativeScore(scoreBreakdown) + categoryAngleAdjustment(asset, strategy),
          );
    return {
      ...asset,
      scoreBreakdown,
      score: Math.max(0, Math.min(10, Number(adjustedScore.toFixed(2)))),
    };
  });

  const ranked = [...scored].sort((left, right) => {
    const generationDelta = getGenerationPriority(right) - getGenerationPriority(left);

    if (generationDelta !== 0) {
      return generationDelta;
    }

    return right.score - left.score;
  });
  const topId = ranked[0]?.id ?? null;

  return ranked.map((asset) => ({
    ...asset,
    recommended: asset.id === topId,
  }));
}
