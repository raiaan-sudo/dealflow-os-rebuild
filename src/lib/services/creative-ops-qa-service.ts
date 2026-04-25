import type { CampaignCreativeStrategy } from "@/lib/services/campaign-creative-strategy";
import type { CreativeScoreBreakdown } from "@/lib/services/creative-scoring-service";

export type CreativeQaTone = "good" | "warn" | "bad";

export type CreativeOpsQaAssessment = {
  categoryFit: { label: string; tone: CreativeQaTone };
  mechanismClarity: { label: string; tone: CreativeQaTone };
  proofClarity: { label: string; tone: CreativeQaTone };
  overlayUsefulness: { label: string; tone: CreativeQaTone };
  antiGenericWarning: { label: string; tone: CreativeQaTone };
  summary: string;
  usable: boolean;
};

type AssessmentInput = {
  strategy: CampaignCreativeStrategy;
  scoreBreakdown?: CreativeScoreBreakdown | null;
  hook?: string | null;
  overlayText?: string | null;
  primaryText?: string | null;
  headline?: string | null;
};

function safeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalize(value: string | null | undefined) {
  return safeText(value).toLowerCase();
}

function scoreToSignal(
  score: number,
  labels: { good: string; warn: string; bad: string },
): { label: string; tone: CreativeQaTone } {
  if (score >= 7.5) {
    return { label: labels.good, tone: "good" };
  }

  if (score >= 5) {
    return { label: labels.warn, tone: "warn" };
  }

  return { label: labels.bad, tone: "bad" };
}

function penaltyToSignal(score: number) {
  if (score <= 2.5) {
    return { label: "Low generic risk", tone: "good" as const };
  }

  if (score <= 5.5) {
    return { label: "Some generic drift", tone: "warn" as const };
  }

  return { label: "High generic risk", tone: "bad" as const };
}

function heuristicScore(params: AssessmentInput) {
  const text = normalize(
    [params.hook, params.overlayText, params.primaryText, params.headline].join(" "),
  );
  const categoryTokens = [
    params.strategy.triggerCondition,
    params.strategy.internalTension,
    ...params.strategy.visualLogic,
  ]
    .map(normalize)
    .filter(Boolean);
  const mechanism = normalize(params.strategy.mechanism);
  const proof = normalize(params.strategy.proofStyle);
  const overlay = normalize(params.overlayText);
  const hook = normalize(params.hook);

  const categoryFit =
    (categoryTokens.some((token) => text.includes(token)) ? 8 : 5) +
    (text.includes(normalize(params.strategy.campaignCategory)) ? 1 : 0) +
    ((hook.includes(normalize(params.strategy.triggerCondition)) || hook.includes(normalize(params.strategy.internalTension))) ? 1 : 0);
  const mechanismClarity =
    mechanism && text.includes(mechanism) ? 8.5 : mechanism ? 4.5 : 5;
  const proofClarity =
    proof && text.includes(proof)
      ? 8
      : /\d|\$|%|before|after|payment|yield|price|value|timeline/.test(text)
        ? 6.5
        : 4;
  const overlayUsefulness =
    overlay.length >= 8 && /\d|\$|%|under|from|free|before|after/.test(overlay) ? 8 : 4.5;
  const antiGenericPenalty =
    /dream home|premium service|learn more|beautiful property|our team|stunning home|modern real estate ad|what is your home worth|new listing alert/.test(text)
      ? 7.5
      : 2.5;

  return {
    categoryFit: Math.min(categoryFit, 10),
    mechanismClarity: Math.min(mechanismClarity, 10),
    proofStrength: Math.min(proofClarity, 10),
    overlayUsefulness: Math.min(overlayUsefulness, 10),
    antiGenericPenalty: Math.min(antiGenericPenalty, 10),
  } satisfies Pick<
    CreativeScoreBreakdown,
    "categoryFit" | "mechanismClarity" | "proofStrength" | "overlayUsefulness" | "antiGenericPenalty"
  >;
}

export function assessCreativeOpsQuality(input: AssessmentInput): CreativeOpsQaAssessment {
  const breakdown =
    input.scoreBreakdown ??
    ({
      ...heuristicScore(input),
      triggerClarity: 0,
      visualSpecificity: 0,
      ctaFriction: 0,
    } satisfies CreativeScoreBreakdown);

  const categoryFit = scoreToSignal(breakdown.categoryFit, {
    good: "Category fit is strong",
    warn: "Category fit is decent",
    bad: "Category fit is weak",
  });
  const mechanismClarity = scoreToSignal(breakdown.mechanismClarity, {
    good: "Mechanism is clear",
    warn: "Mechanism could be clearer",
    bad: "Mechanism is buried",
  });
  const proofClarity = scoreToSignal(breakdown.proofStrength, {
    good: "Proof is strong",
    warn: "Proof is moderate",
    bad: "Proof is weak",
  });
  const overlayUsefulness = scoreToSignal(breakdown.overlayUsefulness, {
    good: "Overlay is useful",
    warn: "Overlay is acceptable",
    bad: "Overlay needs work",
  });
  const antiGenericWarning = penaltyToSignal(breakdown.antiGenericPenalty);

  const warningCount = [
    categoryFit,
    mechanismClarity,
    proofClarity,
    overlayUsefulness,
    antiGenericWarning,
  ].filter((item) => item.tone === "bad").length;

  return {
    categoryFit,
    mechanismClarity,
    proofClarity,
    overlayUsefulness,
    antiGenericWarning,
    summary:
      warningCount === 0
        ? "Usable as-is for review."
        : warningCount === 1
          ? "Usable, but one quality signal needs attention."
          : "Needs review before release.",
    usable: warningCount <= 1,
  };
}
