export const KPI = {
  CTR_GOOD: 2,
  CTR_KILL: 0.5,
  CPC_TARGET: 1,
  CPL_MAX: 50,
  CVR_TARGET: 5,
  FREQUENCY_MAX: 4,
  NO_LEADS_TIMEOUT_HOURS: 24,
  SPEND_MULTIPLIER_KILL: 2,
} as const;

export type KpiThresholds = typeof KPI;

export type PerformanceMetrics = {
  ctr: number;
  cpc: number;
  cpl: number;
  frequency: number;
  spend: number;
  leads: number;
  lp_cvr: number;
  hoursElapsed?: number | null;
};

function normalizeMetric(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function normalizePerformanceMetrics(metrics: PerformanceMetrics): PerformanceMetrics {
  return {
    ctr: normalizeMetric(metrics.ctr),
    cpc: normalizeMetric(metrics.cpc),
    cpl: normalizeMetric(metrics.cpl),
    frequency: normalizeMetric(metrics.frequency),
    spend: normalizeMetric(metrics.spend),
    leads: normalizeMetric(metrics.leads),
    lp_cvr: normalizeMetric(metrics.lp_cvr),
    hoursElapsed:
      typeof metrics.hoursElapsed === "number" && Number.isFinite(metrics.hoursElapsed)
        ? metrics.hoursElapsed
        : null,
  };
}

export type StrongMetric = "ctr" | "cpc" | "cpl" | "lp_cvr";

export function getStrongMetrics(
  metrics: PerformanceMetrics,
  thresholds: KpiThresholds = KPI,
): StrongMetric[] {
  const normalized = normalizePerformanceMetrics(metrics);
  const strongMetrics: StrongMetric[] = [];

  if (normalized.ctr >= thresholds.CTR_GOOD) {
    strongMetrics.push("ctr");
  }

  if (normalized.cpc > 0 && normalized.cpc <= thresholds.CPC_TARGET) {
    strongMetrics.push("cpc");
  }

  if (normalized.cpl > 0 && normalized.cpl <= thresholds.CPL_MAX) {
    strongMetrics.push("cpl");
  }

  if (normalized.lp_cvr >= thresholds.CVR_TARGET) {
    strongMetrics.push("lp_cvr");
  }

  return strongMetrics;
}
