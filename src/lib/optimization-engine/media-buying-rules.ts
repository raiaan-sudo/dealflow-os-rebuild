import type { CampaignCategory } from "@/lib/services/campaign-creative-strategy";
import {
  KPI,
  getStrongMetrics,
  normalizePerformanceMetrics,
  type KpiThresholds,
  type PerformanceMetrics,
} from "@/lib/optimization-engine/kpi";

export type MediaBuyingAction =
  | "kill"
  | "hold"
  | "scale_duplicate"
  | "refresh_hook"
  | "refresh_concept"
  | "review";

export type MediaBuyingDecision = {
  action: MediaBuyingAction;
  reasons: string[];
  strongMetrics: ReturnType<typeof getStrongMetrics>;
  duplicateWinners: boolean;
};

export type MediaBuyingCampaignStructure = {
  budgetModel: "CBO" | "ABO+CBO";
  testCampaignCount: number;
  scaleCampaignCount: number;
  adSetStrategy: string;
  creativeCount: number;
  minVideoCreatives: number;
  targeting: string[];
  retargetingPools: string[];
  scalingMethod: string;
};

export const MEDIA_BUYING_REFRESH_RULES = {
  hookRefreshDays: 30,
  conceptRefreshUnderperformanceWeeks: 2,
} as const;

export function selectMediaBuyerCta(category: CampaignCategory, options?: { b2bAgent?: boolean }) {
  if (options?.b2bAgent) {
    return "See If You Qualify";
  }

  if (category === "investor") return "View Available Deals";
  if (category === "seller") return "Get My Price Update";
  if (category === "precon") return "View Deposit Options";
  if (category === "luxury") return "Request Private Access";
  return "Get Access";
}

export function getCategoryCtaOptions(category: CampaignCategory, options?: { b2bAgent?: boolean }) {
  if (options?.b2bAgent) {
    return ["See If You Qualify"];
  }

  if (category === "investor") {
    return ["View Available Deals", "Review The Deal Breakdown", "See Available Cash-Flow Deals"];
  }

  if (category === "seller") {
    return ["Check Your Home Value", "Get My Price Update", "Check Pre-Listing Demand"];
  }

  if (category === "precon") {
    return ["View Deposit Options", "Get The List", "Check Entry Pricing"];
  }

  if (category === "luxury") {
    return ["Request Private Access", "View The Private Release", "See If This Fits"];
  }

  return ["Get Access", "See Homes That Match", "See If You Qualify"];
}

export function buildMediaBuyingCampaignStructure(budget: number): MediaBuyingCampaignStructure {
  const highBudget = budget >= 100;
  const creativeCount = highBudget ? 8 : 6;
  const minVideoCreatives = Math.ceil(creativeCount / 2);

  return {
    budgetModel: highBudget ? "ABO+CBO" : "CBO",
    testCampaignCount: highBudget ? 1 : 0,
    scaleCampaignCount: 1,
    adSetStrategy: highBudget
      ? "Run one ABO test campaign and one CBO scale campaign."
      : "Run one CBO campaign with one broad ad set.",
    creativeCount,
    minVideoCreatives,
    targeting: ["Broad targeting first", "Let creative do the segmentation work"],
    retargetingPools: ["75% video viewers", "site visitors"],
    scalingMethod: "Duplicate winners to scale; do not edit validated winners.",
  };
}

export function evaluateMediaBuyingDecision(
  metrics: PerformanceMetrics & {
    daysSinceHookRefresh?: number | null;
    underperformingWeeks?: number | null;
  },
  thresholds: KpiThresholds = KPI,
): MediaBuyingDecision {
  const normalized = normalizePerformanceMetrics({
    ...metrics,
    ctr: metrics.ctr > 0 && metrics.ctr <= 1 ? metrics.ctr * 100 : metrics.ctr,
    lp_cvr: metrics.lp_cvr > 0 && metrics.lp_cvr <= 1 ? metrics.lp_cvr * 100 : metrics.lp_cvr,
  });
  const strongMetrics = getStrongMetrics(normalized, thresholds);
  const reasons: string[] = [];

  if (normalized.ctr < thresholds.CTR_KILL) {
    reasons.push(`CTR is below ${thresholds.CTR_KILL}%.`);
  }

  if (normalized.frequency > thresholds.FREQUENCY_MAX) {
    reasons.push(`Frequency is above ${thresholds.FREQUENCY_MAX}.`);
  }

  if (normalized.leads === 0 && (normalized.hoursElapsed ?? 0) >= thresholds.NO_LEADS_TIMEOUT_HOURS) {
    reasons.push(`No leads after ${thresholds.NO_LEADS_TIMEOUT_HOURS} hours.`);
  }

  if (normalized.leads === 0 && normalized.spend >= thresholds.CPL_MAX * thresholds.SPEND_MULTIPLIER_KILL) {
    reasons.push(`Spend reached ${thresholds.SPEND_MULTIPLIER_KILL}x target CPL with no leads.`);
  }

  if (normalized.cpl > thresholds.CPL_MAX) {
    reasons.push(`CPL is above $${thresholds.CPL_MAX}.`);
  }

  if (reasons.length > 0) {
    return {
      action: "kill",
      reasons,
      strongMetrics,
      duplicateWinners: false,
    };
  }

  if ((metrics.underperformingWeeks ?? 0) >= MEDIA_BUYING_REFRESH_RULES.conceptRefreshUnderperformanceWeeks) {
    return {
      action: "refresh_concept",
      reasons: ["Campaign has underperformed for two weeks in a row; refresh the full concept."],
      strongMetrics,
      duplicateWinners: false,
    };
  }

  if ((metrics.daysSinceHookRefresh ?? 0) >= MEDIA_BUYING_REFRESH_RULES.hookRefreshDays) {
    return {
      action: "refresh_hook",
      reasons: ["Hook is older than 30 days; introduce a fresh hook before fatigue compounds."],
      strongMetrics,
      duplicateWinners: false,
    };
  }

  if (strongMetrics.length >= 2) {
    return {
      action: "scale_duplicate",
      reasons: ["At least two metrics are overperforming; duplicate the winner into scale instead of editing it."],
      strongMetrics,
      duplicateWinners: true,
    };
  }

  if (normalized.lp_cvr > 0 && normalized.lp_cvr < thresholds.CVR_TARGET) {
    return {
      action: "review",
      reasons: [`Landing page CVR is below ${thresholds.CVR_TARGET}%; review funnel promise, proof, and form friction.`],
      strongMetrics,
      duplicateWinners: false,
    };
  }

  return {
    action: "hold",
    reasons: ["Hold until two metrics overperform or a kill threshold is hit."],
    strongMetrics,
    duplicateWinners: false,
  };
}
