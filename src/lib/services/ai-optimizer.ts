import { getCategoryRulePack } from "@/lib/services/campaign-category-rule-packs";
import type { CampaignCreativeStrategy } from "@/lib/services/campaign-creative-strategy";
import {
  buildMarketingOptimizationBlueprint,
  evaluatePerformance,
  type CampaignInput,
} from "@/lib/optimization-engine";

export type CampaignAnalysisInput = {
  ctr: number;
  cpc: number;
  cpl: number;
  frequency: number;
  spend: number;
  leads: number;
  lp_cvr: number;
};

export type CampaignAnalysisStatus = "kill" | "scale" | "stable" | "iterate";

export type CampaignAnalysisContext = {
  creativeStrategy?: CampaignCreativeStrategy | null;
  audience?: string | null;
  market?: string | null;
  propertyType?: string | null;
  keyOffer?: string | null;
  currentAngles?: string[] | null;
  winningAngle?: string | null;
  budget?: number | null;
};

export type CampaignAnalysisResult = {
  status: CampaignAnalysisStatus;
  reasons: string[];
  actions: string[];
  strategySummary?: string[];
  testingRecommendations?: string[];
  regenerationSuggestions?: string[];
  recommendationFocus?: "pause" | "promote" | "iterate" | "monitor";
  enginePlan?: ReturnType<typeof buildMarketingOptimizationBlueprint>;
};

export function buildHeldCampaignAnalysis(reason: string): CampaignAnalysisResult {
  return {
    status: "stable",
    reasons: [reason],
    actions: ["Wait for confirmed, policy-eligible delivery evidence before changing the campaign."],
    strategySummary: [],
    testingRecommendations: [],
    regenerationSuggestions: [],
    recommendationFocus: "monitor",
  };
}

const KILL_ACTIONS = [
  "Pause this creative immediately",
  "Replace with new creative concepts",
] as const;

const SCALE_ACTIONS = [
  "Duplicate this creative",
  "Increase budget through duplication",
  "Do NOT modify original creative",
] as const;

const ITERATE_ACTIONS = [
  "Test new hooks",
  "Adjust landing page",
  "Refine messaging",
] as const;

const STABLE_ACTIONS = [
  "Monitor performance",
  "Do not change yet",
] as const;

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function isFiniteNumber(value: number) {
  return Number.isFinite(value);
}

function safeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function safeLower(value: string | null | undefined) {
  return safeText(value).toLowerCase();
}

function buildStrategySummary(context: CampaignAnalysisContext | undefined) {
  const strategy = context?.creativeStrategy;

  if (!strategy) {
    return [] as string[];
  }

  return unique([
    `Optimization is anchored to the ${strategy.campaignCategory} strategy for ${safeText(context?.audience) || "the current audience"}.`,
    `Keep the ${strategy.mechanism} mechanism intact and prove it through ${strategy.proofStyle}.`,
    strategy.triggerCondition
      ? `Creative rotation should speak to ${strategy.triggerCondition} before broadening the message.`
      : "",
  ]).filter(Boolean);
}

function normalizeCampaignAudience(
  context: CampaignAnalysisContext | undefined,
): CampaignInput["audience"] {
  const category = context?.creativeStrategy?.campaignCategory;

  if (
    category === "buyer" ||
    category === "seller" ||
    category === "investor" ||
    category === "precon" ||
    category === "luxury"
  ) {
    return category;
  }

  const audience = safeLower(context?.audience);

  if (audience.includes("seller") || audience.includes("homeowner")) {
    return "seller";
  }

  if (audience.includes("investor")) {
    return "investor";
  }

  if (audience.includes("precon")) {
    return "precon";
  }

  if (audience.includes("luxury")) {
    return "luxury";
  }

  return "buyer";
}

function resolveNextAngle(context: CampaignAnalysisContext | undefined) {
  const strategy = context?.creativeStrategy;

  if (!strategy) {
    return null;
  }

  const rulePack = getCategoryRulePack(strategy.campaignCategory);
  const currentAngles = (context?.currentAngles ?? []).map((value) => safeLower(value));
  const winner = safeLower(context?.winningAngle);

  return (
    rulePack.winningAngles.find((angle) => {
      const normalized = safeLower(angle);
      return normalized !== winner && !currentAngles.includes(normalized);
    }) ??
    rulePack.winningAngles.find((angle) => safeLower(angle) !== winner) ??
    rulePack.winningAngles[0] ??
    null
  );
}

function buildStrategyActions(
  status: CampaignAnalysisStatus,
  context: CampaignAnalysisContext | undefined,
) {
  const strategy = context?.creativeStrategy;

  if (!strategy) {
    return {
      actions: [] as string[],
      testingRecommendations: [] as string[],
      regenerationSuggestions: [] as string[],
      recommendationFocus:
        status === "kill"
          ? ("pause" as const)
          : status === "scale"
            ? ("promote" as const)
            : status === "iterate"
              ? ("iterate" as const)
              : ("monitor" as const),
    };
  }

  const nextAngle = resolveNextAngle(context);
  const audience = safeText(context?.audience) || "the target audience";
  const market = safeText(context?.market) || "the market";
  const propertyType = safeText(context?.propertyType) || "the offer";
  const keyOffer = safeText(context?.keyOffer) || "the current offer";

  if (status === "kill") {
    return {
      actions: unique([
        `Pause the current weakest ${strategy.campaignCategory} angle before it burns more spend.`,
        `Rotate in a ${nextAngle ?? "new"} creative that keeps ${strategy.mechanism} as the mechanism and proves it through ${strategy.proofStyle}.`,
        `Strip out any generic real-estate filler and recenter the hook on ${strategy.triggerCondition || audience}.`,
      ]),
      testingRecommendations: unique([
        nextAngle
          ? `Test ${nextAngle} next for ${audience} in ${market}.`
          : `Test a tighter mechanism-led angle for ${audience} in ${market}.`,
      ]),
      regenerationSuggestions: unique([
        `Regenerate static creatives with ${strategy.proofStyle} and ${strategy.overlayStyle[0] ?? "number-led overlays"}.`,
        `Rewrite the first hook so it enters at ${strategy.internalTension || strategy.triggerCondition || "the decision point"} instead of broad demographics.`,
      ]),
      recommendationFocus: "pause" as const,
    };
  }

  if (status === "scale") {
    return {
      actions: unique([
        `Promote the winning ${context?.winningAngle ? `${context.winningAngle} ` : ""}angle and keep ${strategy.mechanism} unchanged while scaling.`,
        `Duplicate the strongest asset, preserve ${strategy.proofStyle}, and only test controlled overlay changes.`,
      ]),
      testingRecommendations: unique([
        nextAngle
          ? `Keep the winner live and queue a ${nextAngle} challenger without changing the core mechanism.`
          : `Keep the winner live and queue one challenger that preserves the mechanism and proof style.`,
      ]),
      regenerationSuggestions: unique([
        `Generate one follow-on variant that keeps ${keyOffer} but sharpens ${strategy.proofStyle}.`,
      ]),
      recommendationFocus: "promote" as const,
    };
  }

  if (status === "iterate") {
    return {
      actions: unique([
        `Test a ${nextAngle ?? "new"} angle that speaks more directly to ${strategy.triggerCondition || audience}.`,
        `Tighten the landing-page and ad promise so ${strategy.mechanism} and ${strategy.proofStyle} appear earlier.`,
        `Use regeneration only to sharpen proof and overlay clarity, not to replace the whole offer.`,
      ]),
      testingRecommendations: unique([
        `Run one hook test around ${strategy.internalTension || strategy.triggerCondition || audience}.`,
        `Run one proof-led variation for ${propertyType} in ${market}.`,
      ]),
      regenerationSuggestions: unique([
        `Regenerate copy with stronger mechanism language around ${strategy.mechanism}.`,
        `Generate one visual variant that favors ${strategy.visualLogic[0] ?? "category-fit visuals"} and ${strategy.overlayStyle[0] ?? "clear overlays"}.`,
      ]),
      recommendationFocus: "iterate" as const,
    };
  }

  return {
    actions: unique([
      `Monitor the live winner and keep future tests anchored to ${strategy.mechanism}.`,
      nextAngle
        ? `Prepare a ${nextAngle} challenger so rotation is ready before fatigue hits.`
        : `Prepare the next strategy-aligned challenger before fatigue hits.`,
    ]),
    testingRecommendations: unique([
      `Do not change the current offer path until new data weakens ${strategy.proofStyle}.`,
    ]),
    regenerationSuggestions: unique([
      `Keep regeneration staged until the live winner stops converting for ${audience}.`,
    ]),
    recommendationFocus: "monitor" as const,
  };
}

function normalizeInput(data: CampaignAnalysisInput): CampaignAnalysisInput {
  return {
    ctr: isFiniteNumber(data.ctr) ? data.ctr : 0,
    cpc: isFiniteNumber(data.cpc) ? data.cpc : 0,
    cpl: isFiniteNumber(data.cpl) ? data.cpl : 0,
    frequency: isFiniteNumber(data.frequency) ? data.frequency : 0,
    spend: isFiniteNumber(data.spend) ? data.spend : 0,
    leads: isFiniteNumber(data.leads) ? data.leads : 0,
    lp_cvr: isFiniteNumber(data.lp_cvr) ? data.lp_cvr : 0,
  };
}

export function analyzeCampaign(
  data: CampaignAnalysisInput,
  context?: CampaignAnalysisContext,
): CampaignAnalysisResult {
  if (
    !Object.values(data).every((value) => Number.isFinite(value) && value >= 0)
  ) {
    return buildHeldCampaignAnalysis(
      "Optimization is on hold because one or more required metrics are missing or invalid.",
    );
  }

  const normalized = normalizeInput(data);
  const engineDecision = evaluatePerformance(normalized);
  const enginePlan = buildMarketingOptimizationBlueprint(
    {
      audience: normalizeCampaignAudience(context),
      location: safeText(context?.market) || "the current market",
      budget:
        typeof context?.budget === "number" && context.budget > 0
          ? context.budget
          : Math.max(normalized.spend, 50),
      offer: safeText(context?.keyOffer) || "the current offer",
    },
    { currentDecision: engineDecision },
  );

  if (engineDecision.action === "kill") {
    const strategyActions = buildStrategyActions("kill", context);
    return {
      status: "kill",
      reasons: unique(engineDecision.reasons),
      actions: unique([...KILL_ACTIONS, ...strategyActions.actions]),
      strategySummary: buildStrategySummary(context),
      testingRecommendations: strategyActions.testingRecommendations,
      regenerationSuggestions: strategyActions.regenerationSuggestions,
      recommendationFocus: strategyActions.recommendationFocus,
      enginePlan,
    };
  }

  if (engineDecision.action === "scale") {
    const strategyActions = buildStrategyActions("scale", context);
    return {
      status: "scale",
      reasons: unique(engineDecision.reasons),
      actions: unique([...SCALE_ACTIONS, ...strategyActions.actions]),
      strategySummary: buildStrategySummary(context),
      testingRecommendations: strategyActions.testingRecommendations,
      regenerationSuggestions: strategyActions.regenerationSuggestions,
      recommendationFocus: strategyActions.recommendationFocus,
      enginePlan,
    };
  }

  if (engineDecision.action === "iterate") {
    const strategyActions = buildStrategyActions("iterate", context);
    return {
      status: "iterate",
      reasons: unique(engineDecision.reasons),
      actions: unique([...ITERATE_ACTIONS, ...strategyActions.actions]),
      strategySummary: buildStrategySummary(context),
      testingRecommendations: strategyActions.testingRecommendations,
      regenerationSuggestions: strategyActions.regenerationSuggestions,
      recommendationFocus: strategyActions.recommendationFocus,
      enginePlan,
    };
  }

  const strategyActions = buildStrategyActions("stable", context);
  return {
    status: "stable",
    reasons: unique(engineDecision.reasons),
    actions: unique([...STABLE_ACTIONS, ...strategyActions.actions]),
    strategySummary: buildStrategySummary(context),
    testingRecommendations: strategyActions.testingRecommendations,
    regenerationSuggestions: strategyActions.regenerationSuggestions,
    recommendationFocus: strategyActions.recommendationFocus,
    enginePlan,
  };
}
