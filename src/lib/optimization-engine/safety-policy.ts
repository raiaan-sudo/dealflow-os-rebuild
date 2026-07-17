export const OPTIMIZATION_HOLD_STATE = "HOLD_NO_ACTION" as const;
export const OPTIMIZATION_REVIEW_STATE = "READY_FOR_SHADOW_REVIEW" as const;
export const OPTIMIZATION_MINIMUM_CPL_SAMPLE_BLOCKER =
  "below_minimum_leads_for_cpl" as const;
export const OPTIMIZATION_POLICY_CONTRACT_VERSION =
  "dealflow-realtor-optimization-v2" as const;

export type OptimizationSourceStatus =
  | "confirmed"
  | "partial"
  | "failed"
  | "missing"
  | "unavailable";

export type OptimizationEvidenceMetrics = {
  ctr: number;
  cpc: number;
  cpl: number;
  frequency: number;
  spend: number;
  leads: number;
  lp_cvr: number;
  impressions: number;
  clicks: number;
};

export type ApprovedOptimizationPolicy = {
  version: typeof OPTIMIZATION_POLICY_CONTRACT_VERSION;
  approvalId: string;
  approvedAt: string;
  authority: "owner_approved" | "provisional_sandbox_only";
  maximumObservationAgeMinutes: number;
  minimumImpressions: number;
  minimumClicks: number;
  minimumSpend: number;
  minimumLeadsForCplDecision: number;
  attributionWindowDays: number;
  cooldownMinutes: number;
  maximumBudgetIncreasePercent: number;
  maximumBudgetDecreasePercent: number;
  maximumDailyScalePercent: number;
  customerDailyBudgetCeiling: number;
};

export type OptimizationEvidenceBlocker =
  | "source_not_confirmed"
  | "observation_timestamp_invalid"
  | "observation_stale"
  | "metrics_incomplete"
  | "metrics_invalid"
  | "authority_policy_unapproved"
  | "below_minimum_impressions"
  | "below_minimum_clicks"
  | "below_minimum_spend"
  | typeof OPTIMIZATION_MINIMUM_CPL_SAMPLE_BLOCKER
  | "customer_budget_ceiling_missing"
  | "cooldown_active";

export type OptimizationEvidenceDecision = {
  decisionState:
    | typeof OPTIMIZATION_HOLD_STATE
    | typeof OPTIMIZATION_REVIEW_STATE;
  proposalMode: "shadow_only";
  canGenerateShadowProposal: boolean;
  canExecuteProviderMutation: false;
  blockers: OptimizationEvidenceBlocker[];
  observationAgeMinutes: number | null;
  policyApprovalId: string | null;
};

const REQUIRED_METRICS: Array<keyof OptimizationEvidenceMetrics> = [
  "ctr",
  "cpc",
  "cpl",
  "frequency",
  "spend",
  "leads",
  "lp_cvr",
  "impressions",
  "clicks",
];

function isValidNonNegativeMetric(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function isApprovedPolicy(policy: ApprovedOptimizationPolicy | null) {
  if (!policy || !policy.approvalId.trim()) {
    return false;
  }

  const approvedAt = Date.parse(policy.approvedAt);

  return (
    Number.isFinite(approvedAt) &&
    Number.isFinite(policy.maximumObservationAgeMinutes) &&
    policy.maximumObservationAgeMinutes > 0 &&
    Number.isFinite(policy.minimumImpressions) &&
    policy.minimumImpressions >= 0 &&
    Number.isFinite(policy.minimumClicks) &&
    policy.minimumClicks >= 0 &&
    Number.isFinite(policy.minimumSpend) &&
    policy.minimumSpend >= 0 &&
    Number.isFinite(policy.minimumLeadsForCplDecision) &&
    policy.minimumLeadsForCplDecision >= 0 &&
    Number.isInteger(policy.attributionWindowDays) &&
    policy.attributionWindowDays > 0 &&
    Number.isFinite(policy.cooldownMinutes) &&
    policy.cooldownMinutes >= 0 &&
    Number.isFinite(policy.maximumBudgetIncreasePercent) &&
    policy.maximumBudgetIncreasePercent > 0 &&
    Number.isFinite(policy.maximumBudgetDecreasePercent) &&
    policy.maximumBudgetDecreasePercent > 0 &&
    Number.isFinite(policy.maximumDailyScalePercent) &&
    policy.maximumDailyScalePercent > 0 &&
    policy.maximumDailyScalePercent <= 20 &&
    Number.isFinite(policy.customerDailyBudgetCeiling) &&
    policy.customerDailyBudgetCeiling > 0
  );
}

export function evaluateOptimizationEvidence(params: {
  sourceStatus: OptimizationSourceStatus;
  syncedAt: string | null;
  metrics: OptimizationEvidenceMetrics | null;
  approvedPolicy: ApprovedOptimizationPolicy | null;
  lastProviderMutationAt?: string | null;
  now?: Date;
}): OptimizationEvidenceDecision {
  const blockers: OptimizationEvidenceBlocker[] = [];
  const nowMs = (params.now ?? new Date()).getTime();
  const syncedAtMs = params.syncedAt ? Date.parse(params.syncedAt) : Number.NaN;
  const observationAgeMinutes = Number.isFinite(syncedAtMs)
    ? Math.max(0, Math.floor((nowMs - syncedAtMs) / 60_000))
    : null;

  if (params.sourceStatus !== "confirmed") {
    blockers.push("source_not_confirmed");
  }

  if (observationAgeMinutes === null) {
    blockers.push("observation_timestamp_invalid");
  }

  if (!params.metrics) {
    blockers.push("metrics_incomplete");
  } else if (!REQUIRED_METRICS.every((key) => isValidNonNegativeMetric(params.metrics![key]))) {
    blockers.push("metrics_invalid");
  }

  const policyApproved = isApprovedPolicy(params.approvedPolicy);

  if (!policyApproved) {
    blockers.push("authority_policy_unapproved");
  }

  if (policyApproved && params.approvedPolicy && params.metrics) {
    const policy = params.approvedPolicy;

    if (
      observationAgeMinutes !== null &&
      observationAgeMinutes > policy.maximumObservationAgeMinutes
    ) {
      blockers.push("observation_stale");
    }

    if (params.metrics.impressions < policy.minimumImpressions) {
      blockers.push("below_minimum_impressions");
    }

    if (params.metrics.clicks < policy.minimumClicks) {
      blockers.push("below_minimum_clicks");
    }

    if (params.metrics.spend < policy.minimumSpend) {
      blockers.push("below_minimum_spend");
    }

    const lastMutationMs = params.lastProviderMutationAt
      ? Date.parse(params.lastProviderMutationAt)
      : Number.NaN;

    if (
      Number.isFinite(lastMutationMs) &&
      nowMs - lastMutationMs < policy.cooldownMinutes * 60_000
    ) {
      blockers.push("cooldown_active");
    }
  }

  const canGenerateShadowProposal = blockers.length === 0;

  return {
    decisionState:
      blockers.length === 0 ? OPTIMIZATION_REVIEW_STATE : OPTIMIZATION_HOLD_STATE,
    proposalMode: "shadow_only",
    canGenerateShadowProposal,
    // Deliberately false even when evidence and policy pass. Provider execution is
    // a separate, explicitly authorized workflow and is never granted here.
    canExecuteProviderMutation: false,
    blockers: Array.from(new Set(blockers)),
    observationAgeMinutes,
    policyApprovalId: policyApproved ? params.approvedPolicy?.approvalId ?? null : null,
  };
}
