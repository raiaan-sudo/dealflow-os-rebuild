export const SCHEDULED_META_LAUNCH_EXECUTION_ENV =
  "ALLOW_SCHEDULED_META_LAUNCH_EXECUTION" as const;
export const META_LIVE_LAUNCH_EXECUTION_ENV = "ALLOW_META_LIVE_LAUNCH" as const;

type ScheduledLaunchEnvironment = Record<string, string | undefined>;

export type ScheduledLaunchExecutionGate = {
  allowed: boolean;
  reason:
    | null
    | "scheduled_executor_disabled"
    | "meta_live_launch_disabled"
    | "non_production_runtime"
    | "test_environment";
};

/**
 * The scheduler has its own kill switch in addition to Meta's global live-write
 * switch. Exact lowercase `true` is required for both switches. Tests are
 * categorically unable to select the real provider dispatcher.
 */
export function getScheduledLaunchExecutionGate(
  env: ScheduledLaunchEnvironment = process.env,
): ScheduledLaunchExecutionGate {
  if (env.NODE_ENV === "test") {
    return { allowed: false, reason: "test_environment" };
  }

  if (env[SCHEDULED_META_LAUNCH_EXECUTION_ENV] !== "true") {
    return { allowed: false, reason: "scheduled_executor_disabled" };
  }

  if (env[META_LIVE_LAUNCH_EXECUTION_ENV] !== "true") {
    return { allowed: false, reason: "meta_live_launch_disabled" };
  }

  if (env.NODE_ENV !== "production") {
    return { allowed: false, reason: "non_production_runtime" };
  }

  return { allowed: true, reason: null };
}

export type ScheduledLaunchRetryDecision = {
  status: "scheduled" | "operator_action_required";
  retryDelayMs: number | null;
};

export function getScheduledLaunchRetryDecision(params: {
  attemptCount: number;
  httpStatus?: number | null;
}): ScheduledLaunchRetryDecision {
  const attemptCount = Math.max(1, Math.trunc(params.attemptCount));
  const httpStatus = params.httpStatus ?? null;
  const retryableHttpFailure =
    httpStatus === null ||
    httpStatus === 408 ||
    httpStatus === 409 ||
    httpStatus === 425 ||
    httpStatus === 429 ||
    httpStatus >= 500;

  if (!retryableHttpFailure || attemptCount >= 5) {
    return { status: "operator_action_required", retryDelayMs: null };
  }

  return {
    status: "scheduled",
    retryDelayMs: Math.min(60 * 60_000, 60_000 * 2 ** (attemptCount - 1)),
  };
}
