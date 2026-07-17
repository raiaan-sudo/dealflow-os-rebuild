export type LeadOutcomeQualityBlocker =
  | "definition_unavailable"
  | "lineage_incomplete"
  | "outcome_conflict"
  | "sample_too_small"
  | "observation_stale"
  | "observation_time_invalid";

export type LeadOutcomeQualityDecision = {
  eligible: boolean;
  blockers: LeadOutcomeQualityBlocker[];
  sampleCount: number;
  completeLineageCount: number;
  observationAgeMinutes: number | null;
};

export function evaluateLeadOutcomeQuality(params: {
  definitionAvailable: boolean;
  sampleCount: number;
  completeLineageCount: number;
  hasConflicts: boolean;
  latestReceivedAt: string | null;
  minimumSampleSize: number;
  maximumObservationAgeMinutes: number;
  now?: Date;
}): LeadOutcomeQualityDecision {
  const blockers: LeadOutcomeQualityBlocker[] = [];
  const nowMs = (params.now ?? new Date()).getTime();
  const receivedAtMs = params.latestReceivedAt ? Date.parse(params.latestReceivedAt) : Number.NaN;
  const observationAgeMinutes = Number.isFinite(receivedAtMs)
    ? Math.max(0, Math.floor((nowMs - receivedAtMs) / 60_000))
    : null;
  if (!params.definitionAvailable) blockers.push("definition_unavailable");
  if (!Number.isSafeInteger(params.sampleCount) || params.sampleCount < 0) blockers.push("sample_too_small");
  if (
    !Number.isSafeInteger(params.completeLineageCount) ||
    params.completeLineageCount < params.sampleCount
  ) blockers.push("lineage_incomplete");
  if (params.hasConflicts) blockers.push("outcome_conflict");
  if (
    !Number.isSafeInteger(params.minimumSampleSize) ||
    params.minimumSampleSize < 1 ||
    params.sampleCount < params.minimumSampleSize
  ) blockers.push("sample_too_small");
  if (observationAgeMinutes === null) blockers.push("observation_time_invalid");
  if (
    observationAgeMinutes !== null &&
    observationAgeMinutes > params.maximumObservationAgeMinutes
  ) blockers.push("observation_stale");
  const unique = Array.from(new Set(blockers));
  return {
    eligible: unique.length === 0,
    blockers: unique,
    sampleCount: Math.max(0, Number.isFinite(params.sampleCount) ? params.sampleCount : 0),
    completeLineageCount: Math.max(
      0,
      Number.isFinite(params.completeLineageCount) ? params.completeLineageCount : 0,
    ),
    observationAgeMinutes,
  };
}
