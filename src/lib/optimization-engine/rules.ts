import {
  KPI,
  normalizePerformanceMetrics,
  getStrongMetrics,
  type KpiThresholds,
  type PerformanceMetrics,
} from "@/lib/optimization-engine/kpi";

export type OptimizationRuleKey =
  | "kill_low_ctr"
  | "kill_high_cpl"
  | "kill_high_frequency"
  | "kill_no_leads_after_timeout"
  | "kill_spend_without_leads"
  | "scale_two_strong_metrics"
  | "iterate_low_cvr"
  | "hold_stable";

export type OptimizationRuleResult = {
  key: OptimizationRuleKey;
  triggered: boolean;
  reason: string;
  severity: "kill" | "scale" | "iterate" | "hold";
};

export function evaluateOptimizationRules(
  metrics: PerformanceMetrics,
  thresholds: KpiThresholds = KPI,
): OptimizationRuleResult[] {
  const normalized = normalizePerformanceMetrics(metrics);
  const elapsedHours = normalized.hoursElapsed ?? null;
  const strongMetrics = getStrongMetrics(normalized, thresholds);

  return [
    {
      key: "kill_low_ctr",
      triggered: normalized.ctr < thresholds.CTR_KILL,
      reason: `CTR below ${thresholds.CTR_KILL}%.`,
      severity: "kill",
    },
    {
      key: "kill_high_cpl",
      triggered: normalized.cpl > thresholds.CPL_MAX,
      reason: `CPL above $${thresholds.CPL_MAX}.`,
      severity: "kill",
    },
    {
      key: "kill_high_frequency",
      triggered: normalized.frequency > thresholds.FREQUENCY_MAX,
      reason: `Frequency above ${thresholds.FREQUENCY_MAX}; rotate or kill the creative.`,
      severity: "kill",
    },
    {
      key: "kill_no_leads_after_timeout",
      triggered:
        normalized.leads === 0 &&
        elapsedHours !== null &&
        elapsedHours >= thresholds.NO_LEADS_TIMEOUT_HOURS,
      reason: `No leads after ${thresholds.NO_LEADS_TIMEOUT_HOURS} hours.`,
      severity: "kill",
    },
    {
      key: "kill_spend_without_leads",
      triggered:
        normalized.leads === 0 &&
        normalized.spend >= thresholds.CPL_MAX * thresholds.SPEND_MULTIPLIER_KILL,
      reason: `Spend exceeded ${thresholds.SPEND_MULTIPLIER_KILL}x CPL max without a lead.`,
      severity: "kill",
    },
    {
      key: "scale_two_strong_metrics",
      triggered: strongMetrics.length >= 2,
      reason: "Creative is beating at least two strong metrics.",
      severity: "scale",
    },
    {
      key: "iterate_low_cvr",
      triggered: normalized.lp_cvr > 0 && normalized.lp_cvr < thresholds.CVR_TARGET,
      reason: `Landing-page conversion rate is below ${thresholds.CVR_TARGET}%.`,
      severity: "iterate",
    },
    {
      key: "hold_stable",
      triggered:
        strongMetrics.length < 2 &&
        normalized.ctr >= thresholds.CTR_KILL &&
        normalized.cpl <= thresholds.CPL_MAX &&
        normalized.frequency <= thresholds.FREQUENCY_MAX &&
        normalized.leads > 0,
      reason: "Performance is stable, but not strong enough to scale yet.",
      severity: "hold",
    },
  ];
}
