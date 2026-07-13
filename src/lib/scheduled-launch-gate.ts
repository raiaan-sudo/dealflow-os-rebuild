import {
  getDeploymentTarget,
  isExactIsolatedStagingVercelHost,
  isExactProductionVercelHost,
} from "@/lib/deployment-target";

export const SCHEDULED_META_LAUNCH_EXECUTION_ENV =
  "ALLOW_SCHEDULED_META_LAUNCH_EXECUTION" as const;
export const META_LIVE_LAUNCH_EXECUTION_ENV = "ALLOW_META_LIVE_LAUNCH" as const;
export const PRODUCTION_SCHEDULED_META_LAUNCH_EXECUTION_ENV =
  "ALLOW_PRODUCTION_SCHEDULED_META_LAUNCH_EXECUTION" as const;
export const STAGING_SCHEDULED_META_LAUNCH_EXECUTION_ENV =
  "ALLOW_STAGING_SCHEDULED_META_LAUNCH_EXECUTION" as const;
export const META_PRODUCTION_PAUSED_LAUNCH_ATTESTATION =
  "DEALFLOW_META_PAUSED_LAUNCH_PRODUCTION_EXACT_V1" as const;
export const META_STAGING_PAUSED_LAUNCH_ATTESTATION =
  "DEALFLOW_META_PAUSED_LAUNCH_STAGING_ONLY_V1" as const;

type ScheduledLaunchEnvironment = Record<string, string | undefined>;

export type ScheduledLaunchExecutionGate = {
  allowed: boolean;
  reason:
    | null
    | "scheduled_executor_disabled"
    | "meta_live_launch_disabled"
    | "production_executor_disabled"
    | "staging_executor_disabled"
    | "production_host_attestation_missing"
    | "staging_host_attestation_missing"
    | "supabase_project_attestation_missing"
    | "provider_attestation_missing"
    | "unsupported_deployment_target";
};

function extractSupabaseProjectRef(value: string | undefined) {
  if (!value) return "";
  try {
    return /^([a-z0-9]{20})\.supabase\.co$/.exec(new URL(value).hostname.toLowerCase())?.[1] ?? "";
  } catch {
    return "";
  }
}

/**
 * The scheduler has its own kill switch in addition to Meta's global live-write
 * switch. Exact lowercase `true` is required for both switches. Tests are
 * categorically unable to select the real provider dispatcher.
 */
export function getScheduledLaunchExecutionGate(
  env: ScheduledLaunchEnvironment = process.env,
): ScheduledLaunchExecutionGate {
  if (env[SCHEDULED_META_LAUNCH_EXECUTION_ENV] !== "true") {
    return { allowed: false, reason: "scheduled_executor_disabled" };
  }

  if (env[META_LIVE_LAUNCH_EXECUTION_ENV] !== "true") {
    return { allowed: false, reason: "meta_live_launch_disabled" };
  }

  const target = getDeploymentTarget(env);
  if (target === "production") {
    if (!isExactProductionVercelHost(env)) {
      return { allowed: false, reason: "production_host_attestation_missing" };
    }
    if (env[PRODUCTION_SCHEDULED_META_LAUNCH_EXECUTION_ENV] !== "true") {
      return { allowed: false, reason: "production_executor_disabled" };
    }
    const actualRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
    if (!actualRef || actualRef !== env.META_PRODUCTION_SUPABASE_PROJECT_REF?.trim()) {
      return { allowed: false, reason: "supabase_project_attestation_missing" };
    }
    if (env.META_PRODUCTION_PAUSED_LAUNCH_ATTESTATION !== META_PRODUCTION_PAUSED_LAUNCH_ATTESTATION) {
      return { allowed: false, reason: "provider_attestation_missing" };
    }
    return { allowed: true, reason: null };
  }
  if (target === "staging") {
    if (!isExactIsolatedStagingVercelHost(env) || env.META_STAGING_ISOLATED_DATABASE !== "true") {
      return { allowed: false, reason: "staging_host_attestation_missing" };
    }
    if (env[STAGING_SCHEDULED_META_LAUNCH_EXECUTION_ENV] !== "true") {
      return { allowed: false, reason: "staging_executor_disabled" };
    }
    const actualRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
    if (!actualRef || actualRef !== env.META_STAGING_ISOLATED_SUPABASE_PROJECT_REF?.trim()) {
      return { allowed: false, reason: "supabase_project_attestation_missing" };
    }
    if (env.META_STAGING_PAUSED_LAUNCH_ATTESTATION !== META_STAGING_PAUSED_LAUNCH_ATTESTATION) {
      return { allowed: false, reason: "provider_attestation_missing" };
    }
    return { allowed: true, reason: null };
  }
  return { allowed: false, reason: "unsupported_deployment_target" };
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
