import {
  OPTIMIZATION_MINIMUM_CPL_SAMPLE_BLOCKER,
  OPTIMIZATION_POLICY_CONTRACT_VERSION,
  type ApprovedOptimizationPolicy,
  type OptimizationEvidenceMetrics,
  type OptimizationSourceStatus,
} from "@/lib/optimization-engine/safety-policy";
import { KPI } from "@/lib/optimization-engine/kpi";

export const REALTOR_OPTIMIZATION_POLICY_V1 = {
  version: OPTIMIZATION_POLICY_CONTRACT_VERSION,
  approvalId: "dealflow-recovered-conservative-v1",
  approvedAt: "2026-07-12T00:00:00.000Z",
  authority: "provisional_sandbox_only",
  maximumObservationAgeMinutes: 60,
  minimumImpressions: 1_000,
  minimumClicks: 20,
  minimumSpend: 50,
  minimumLeadsForCplDecision: 1,
  attributionWindowDays: 7,
  cooldownMinutes: 24 * 60,
  maximumBudgetIncreasePercent: 20,
  maximumBudgetDecreasePercent: 100,
  maximumDailyScalePercent: 20,
  customerDailyBudgetCeiling: 0,
  thresholds: KPI,
} as const satisfies ApprovedOptimizationPolicy & {
  thresholds: typeof KPI;
};

export type OptimizationKillSwitches = {
  global: boolean;
  account: boolean;
  campaign: boolean;
  emergencyStop: boolean;
};

export type RealtorOptimizationAction =
  | { type: "hold"; reason: string; changePercent: 0 }
  | { type: "pause"; reason: string; changePercent: -100 }
  | { type: "budget"; reason: string; changePercent: 20 };

export type RealtorOptimizationEvaluation = {
  state: "HOLD" | "PROPOSED";
  action: RealtorOptimizationAction;
  blockers: string[];
  policyVersion: string;
};

function hold(reason: string, blockers: string[] = [reason]): RealtorOptimizationEvaluation {
  return {
    state: "HOLD",
    action: { type: "hold", reason, changePercent: 0 },
    blockers,
    policyVersion: OPTIMIZATION_POLICY_CONTRACT_VERSION,
  };
}

export function evaluateRealtorOptimizationPolicy(params: {
  sourceStatus: OptimizationSourceStatus;
  syncedAt: string | null;
  metrics: OptimizationEvidenceMetrics | null;
  dailyBudget: number | null;
  customerDailyBudgetCeiling: number | null;
  campaignAgeHours?: number | null;
  scaleAppliedLast24HoursPercent?: number;
  lastProviderMutationAt?: string | null;
  switches: OptimizationKillSwitches;
  approvedPolicy?: ApprovedOptimizationPolicy | null;
  now?: Date;
}): RealtorOptimizationEvaluation {
  const now = params.now ?? new Date();
  const metrics = params.metrics;
  const policy = params.approvedPolicy ?? REALTOR_OPTIMIZATION_POLICY_V1;
  const blockers: string[] = [];

  if (Object.values(params.switches).some(Boolean)) blockers.push("kill_switch_active");
  if (params.sourceStatus !== "confirmed") blockers.push("source_not_confirmed");
  const syncMs = params.syncedAt ? Date.parse(params.syncedAt) : Number.NaN;
  if (!Number.isFinite(syncMs)) blockers.push("observation_timestamp_invalid");
  else if (now.getTime() - syncMs > policy.maximumObservationAgeMinutes * 60_000) {
    blockers.push("observation_stale");
  }
  if (!metrics || Object.values(metrics).some((value) => !Number.isFinite(value) || value < 0)) {
    blockers.push("metrics_invalid");
  }
  if (!Number.isFinite(params.customerDailyBudgetCeiling) || Number(params.customerDailyBudgetCeiling) <= 0) {
    blockers.push("customer_budget_ceiling_missing");
  }
  if (!Number.isFinite(params.dailyBudget) || Number(params.dailyBudget) <= 0) {
    blockers.push("daily_budget_missing");
  }

  const lastMutationMs = params.lastProviderMutationAt
    ? Date.parse(params.lastProviderMutationAt)
    : Number.NaN;
  if (
    Number.isFinite(lastMutationMs) &&
    now.getTime() - lastMutationMs < policy.cooldownMinutes * 60_000
  ) {
    blockers.push("cooldown_active");
  }

  if (metrics) {
    if (metrics.impressions < policy.minimumImpressions) blockers.push("below_minimum_impressions");
    if (metrics.clicks < policy.minimumClicks) blockers.push("below_minimum_clicks");
    if (metrics.spend < policy.minimumSpend) blockers.push("below_minimum_spend");
  }
  if (blockers.length > 0) return hold(blockers[0], blockers);

  const safeMetrics = metrics!;
  const thresholds = KPI;
  const hasMinimumCplSample =
    safeMetrics.leads >= policy.minimumLeadsForCplDecision;
  const cplWouldPause = safeMetrics.cpl > thresholds.CPL_MAX;
  const pauseReasons: string[] = [];
  if (safeMetrics.ctr < thresholds.CTR_KILL) pauseReasons.push("ctr_below_kill_threshold");
  if (hasMinimumCplSample && cplWouldPause) pauseReasons.push("cpl_above_maximum");
  if (safeMetrics.frequency > thresholds.FREQUENCY_MAX) pauseReasons.push("frequency_above_maximum");
  if (
    safeMetrics.leads === 0 &&
    Number.isFinite(params.campaignAgeHours) &&
    Number(params.campaignAgeHours) >= thresholds.NO_LEADS_TIMEOUT_HOURS &&
    safeMetrics.spend >= thresholds.CPL_MAX * thresholds.SPEND_MULTIPLIER_KILL
  ) {
    pauseReasons.push("spend_without_leads");
  }
  if (pauseReasons.length > 0) {
    return {
      state: "PROPOSED",
      action: { type: "pause", reason: pauseReasons.join(","), changePercent: -100 },
      blockers: [],
      policyVersion: OPTIMIZATION_POLICY_CONTRACT_VERSION,
    };
  }

  if (!hasMinimumCplSample && cplWouldPause) {
    return hold(OPTIMIZATION_MINIMUM_CPL_SAMPLE_BLOCKER);
  }

  const nonCplStrongCount = [
    safeMetrics.ctr >= thresholds.CTR_GOOD,
    safeMetrics.cpc > 0 && safeMetrics.cpc <= thresholds.CPC_TARGET,
    safeMetrics.lp_cvr >= thresholds.CVR_TARGET,
  ].filter(Boolean).length;
  const cplSupportsScale = safeMetrics.cpl > 0 && safeMetrics.cpl <= thresholds.CPL_MAX;
  const cplWouldChangeScaleDecision =
    cplSupportsScale && nonCplStrongCount < 2 && nonCplStrongCount + 1 >= 2;

  if (!hasMinimumCplSample && cplWouldChangeScaleDecision) {
    return hold(OPTIMIZATION_MINIMUM_CPL_SAMPLE_BLOCKER);
  }

  const strongCount =
    nonCplStrongCount + (hasMinimumCplSample && cplSupportsScale ? 1 : 0);
  const priorScale = Math.max(0, params.scaleAppliedLast24HoursPercent ?? 0);
  const proposedBudget = Number(params.dailyBudget) * 1.2;
  if (
    strongCount >= 2 &&
    priorScale + 20 <= policy.maximumDailyScalePercent &&
    proposedBudget <= Number(params.customerDailyBudgetCeiling)
  ) {
    return {
      state: "PROPOSED",
      action: { type: "budget", reason: "two_or_more_strong_metrics", changePercent: 20 },
      blockers: [],
      policyVersion: OPTIMIZATION_POLICY_CONTRACT_VERSION,
    };
  }

  return hold(
    strongCount >= 2 ? "daily_scale_or_budget_ceiling_reached" : "no_action_threshold_met",
  );
}
