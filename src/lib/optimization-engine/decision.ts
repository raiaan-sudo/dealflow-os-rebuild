import {
  KPI,
  getStrongMetrics,
  normalizePerformanceMetrics,
  type KpiThresholds,
  type PerformanceMetrics,
  type StrongMetric,
} from "@/lib/optimization-engine/kpi";
import {
  evaluateOptimizationRules,
  type OptimizationRuleResult,
} from "@/lib/optimization-engine/rules";

export type OptimizationDecisionAction = "kill" | "scale" | "hold" | "iterate";

export type OptimizationDecision = {
  action: OptimizationDecisionAction;
  rules: OptimizationRuleResult[];
  triggeredRules: OptimizationRuleResult[];
  reasons: string[];
  strongMetrics: StrongMetric[];
};

export function evaluatePerformance(
  metrics: PerformanceMetrics,
  thresholds: KpiThresholds = KPI,
): OptimizationDecision {
  const normalized = normalizePerformanceMetrics(metrics);
  const rules = evaluateOptimizationRules(normalized, thresholds);
  const triggeredRules = rules.filter((rule) => rule.triggered);
  const strongMetrics = getStrongMetrics(normalized, thresholds);

  if (triggeredRules.some((rule) => rule.severity === "kill")) {
    return {
      action: "kill",
      rules,
      triggeredRules,
      reasons: triggeredRules
        .filter((rule) => rule.severity === "kill")
        .map((rule) => rule.reason),
      strongMetrics,
    };
  }

  if (triggeredRules.some((rule) => rule.severity === "scale")) {
    return {
      action: "scale",
      rules,
      triggeredRules,
      reasons: triggeredRules
        .filter((rule) => rule.severity === "scale")
        .map((rule) => rule.reason),
      strongMetrics,
    };
  }

  if (triggeredRules.some((rule) => rule.severity === "iterate")) {
    return {
      action: "iterate",
      rules,
      triggeredRules,
      reasons: triggeredRules
        .filter((rule) => rule.severity === "iterate")
        .map((rule) => rule.reason),
      strongMetrics,
    };
  }

  return {
    action: "hold",
    rules,
    triggeredRules,
    reasons:
      triggeredRules
        .filter((rule) => rule.severity === "hold")
        .map((rule) => rule.reason) || ["Performance is stable enough to monitor, but not ready to scale."],
    strongMetrics,
  };
}
