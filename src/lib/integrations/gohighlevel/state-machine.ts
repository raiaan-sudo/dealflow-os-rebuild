import type {
  GhlProvisioningRun,
  GhlProvisioningState,
  GhlRetryResumeState,
} from "./types";

const ALLOWED_TRANSITIONS: Record<GhlProvisioningState, readonly GhlProvisioningState[]> = {
  requested: ["location_create_requested", "operator_action_required", "canceled"],
  location_create_requested: [
    "location_uncertain",
    "location_assigned",
    "retryable_failure",
    "operator_action_required",
    "canceled",
  ],
  location_uncertain: [
    "location_assigned",
    "retryable_failure",
    "operator_action_required",
    "canceled",
  ],
  location_assigned: ["snapshot_install_requested", "operator_action_required", "canceled"],
  snapshot_install_requested: [
    "snapshot_installing",
    "retryable_failure",
    "operator_action_required",
    "canceled",
  ],
  snapshot_installing: [
    "snapshot_verifying",
    "retryable_failure",
    "operator_action_required",
    "canceled",
  ],
  snapshot_verifying: [
    "snapshot_installing",
    "required_objects_verifying",
    "retryable_failure",
    "operator_action_required",
    "canceled",
  ],
  required_objects_verifying: [
    "ready",
    "retryable_failure",
    "operator_action_required",
    "canceled",
  ],
  retryable_failure: [
    "location_create_requested",
    "snapshot_install_requested",
    "snapshot_verifying",
    "required_objects_verifying",
    "operator_action_required",
    "canceled",
  ],
  ready: [],
  operator_action_required: [],
  canceled: [],
};

export class GhlProvisioningInvariantError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GhlProvisioningInvariantError";
    this.code = code;
  }
}

export type GhlTransitionPatch = Partial<
  Pick<
    GhlProvisioningRun,
    | "locationMappingId"
    | "providerLocationId"
    | "lastReconciledAt"
    | "nextRetryAt"
    | "lastErrorCode"
    | "lastErrorMessage"
    | "snapshotVerifiedAt"
    | "requiredObjectsVerifiedAt"
  >
> & {
  resumeState?: GhlRetryResumeState | null;
};

export function transitionGhlProvisioning(
  run: GhlProvisioningRun,
  nextState: GhlProvisioningState,
  patch: GhlTransitionPatch,
  now: string,
): GhlProvisioningRun {
  if (!ALLOWED_TRANSITIONS[run.state].includes(nextState)) {
    throw new GhlProvisioningInvariantError(
      "invalid_transition",
      `Invalid GHL provisioning transition from ${run.state} to ${nextState}.`,
    );
  }

  if (run.state === "location_uncertain" && nextState === "retryable_failure") {
    if (!patch.lastReconciledAt) {
      throw new GhlProvisioningInvariantError(
        "reconciliation_required",
        "An uncertain location result must be reconciled before retry.",
      );
    }
  }

  if (run.state === "retryable_failure") {
    if (!run.resumeState || run.resumeState !== nextState) {
      throw new GhlProvisioningInvariantError(
        "invalid_replay_target",
        "A replay may resume only the state recorded on the failed run.",
      );
    }
  }

  const candidate: GhlProvisioningRun = {
    ...run,
    ...patch,
    state: nextState,
    revision: run.revision + 1,
    updatedAt: now,
    reconcileBeforeRetry: nextState === "location_uncertain"
      ? true
      : run.state === "location_uncertain"
        ? false
        : run.reconcileBeforeRetry,
    resumeState: run.state === "retryable_failure"
      ? null
      : (patch.resumeState ?? run.resumeState),
    readyAt: nextState === "ready" ? now : run.readyAt,
  };

  if (nextState === "retryable_failure" && !candidate.resumeState) {
    throw new GhlProvisioningInvariantError(
      "retry_target_required",
      "A retryable failure must record the exact state to resume.",
    );
  }

  if (nextState === "ready") {
    if (
      !candidate.locationMappingId
      || !candidate.providerLocationId
      || !candidate.snapshotVerifiedAt
      || !candidate.requiredObjectsVerifiedAt
      || candidate.snapshotManifest.status !== "approved"
    ) {
      throw new GhlProvisioningInvariantError(
        "ready_verification_incomplete",
        "READY requires an active mapping, approved snapshot, and required-object verification.",
      );
    }
  }

  return candidate;
}

export function assertGhlReplayDue(run: GhlProvisioningRun, now: string) {
  if (run.state !== "retryable_failure") {
    throw new GhlProvisioningInvariantError(
      "not_retryable",
      `Provisioning run is ${run.state}, not retryable_failure.`,
    );
  }

  if (run.attemptCount >= run.maxAttempts) {
    throw new GhlProvisioningInvariantError(
      "attempt_limit_reached",
      "Provisioning retry limit has been reached; operator action is required.",
    );
  }

  if (run.nextRetryAt && Date.parse(run.nextRetryAt) > Date.parse(now)) {
    throw new GhlProvisioningInvariantError(
      "retry_not_due",
      "Provisioning retry is not due yet.",
    );
  }

  return true;
}
