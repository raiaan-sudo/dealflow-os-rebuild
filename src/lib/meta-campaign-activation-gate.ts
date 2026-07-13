import {
  getDeploymentTarget,
  isExactIsolatedStagingVercelHost,
  isExactProductionVercelHost,
} from "@/lib/deployment-target";

export const META_PRODUCTION_ACTIVATION_ATTESTATION =
  "DEALFLOW_META_ACTIVATION_PRODUCTION_EXACT_V1" as const;
export const META_STAGING_ACTIVATION_ATTESTATION =
  "DEALFLOW_META_ACTIVATION_STAGING_ONLY_V1" as const;

export const META_DUE_ACTIVATION_ENV = "ALLOW_META_DUE_ACTIVATION" as const;
export const META_PRODUCTION_DUE_ACTIVATION_ENV =
  "ALLOW_META_PRODUCTION_DUE_ACTIVATION" as const;
export const META_STAGING_DUE_ACTIVATION_ENV =
  "ALLOW_META_STAGING_DUE_ACTIVATION" as const;

export type MetaCampaignActivationGate = {
  allowed: boolean;
  target: "production" | "staging" | "blocked";
  reason:
    | null
    | "activation_disabled"
    | "meta_live_launch_disabled"
    | "production_activation_disabled"
    | "staging_activation_disabled"
    | "production_host_attestation_missing"
    | "staging_host_attestation_missing"
    | "supabase_project_attestation_missing"
    | "provider_attestation_missing"
    | "unsupported_deployment_target";
};

function extractSupabaseProjectRef(value: string | undefined) {
  if (!value) return "";
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return /^([a-z0-9]{20})\.supabase\.co$/.exec(hostname)?.[1] ?? "";
  } catch {
    return "";
  }
}

/**
 * Activation is intentionally harder to enable than PAUSED object creation.
 * An exact, lowercase global switch, Meta live-write switch, and target-specific
 * switch must all agree. Preview, development, test, and unknown targets can
 * never select the real provider adapter.
 */
export function getMetaCampaignActivationGate(
  env: Readonly<Record<string, string | undefined>> = process.env,
): MetaCampaignActivationGate {
  const target = getDeploymentTarget(env as Record<string, string | undefined>);
  if (env[META_DUE_ACTIVATION_ENV] !== "true") {
    return { allowed: false, target: "blocked", reason: "activation_disabled" };
  }
  if (env.ALLOW_META_LIVE_LAUNCH !== "true") {
    return { allowed: false, target: "blocked", reason: "meta_live_launch_disabled" };
  }
  if (target === "production") {
    if (!isExactProductionVercelHost(env)) {
      return { allowed: false, target: "blocked", reason: "production_host_attestation_missing" };
    }
    if (env[META_PRODUCTION_DUE_ACTIVATION_ENV] !== "true") {
      return { allowed: false, target: "blocked", reason: "production_activation_disabled" };
    }
    const actualProjectRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
    const expectedProjectRef = env.META_PRODUCTION_SUPABASE_PROJECT_REF?.trim() ?? "";
    if (!actualProjectRef || !expectedProjectRef || actualProjectRef !== expectedProjectRef) {
      return { allowed: false, target: "blocked", reason: "supabase_project_attestation_missing" };
    }
    if (env.META_PRODUCTION_ACTIVATION_ATTESTATION !== META_PRODUCTION_ACTIVATION_ATTESTATION) {
      return { allowed: false, target: "blocked", reason: "provider_attestation_missing" };
    }
    return { allowed: true, target: "production", reason: null };
  }
  if (target === "staging") {
    if (!isExactIsolatedStagingVercelHost(env) || env.META_STAGING_ISOLATED_DATABASE !== "true") {
      return { allowed: false, target: "blocked", reason: "staging_host_attestation_missing" };
    }
    if (env[META_STAGING_DUE_ACTIVATION_ENV] !== "true") {
      return { allowed: false, target: "blocked", reason: "staging_activation_disabled" };
    }
    const actualProjectRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
    const expectedProjectRef = env.META_STAGING_ISOLATED_SUPABASE_PROJECT_REF?.trim() ?? "";
    if (!actualProjectRef || !expectedProjectRef || actualProjectRef !== expectedProjectRef) {
      return { allowed: false, target: "blocked", reason: "supabase_project_attestation_missing" };
    }
    if (env.META_STAGING_ACTIVATION_ATTESTATION !== META_STAGING_ACTIVATION_ATTESTATION) {
      return { allowed: false, target: "blocked", reason: "provider_attestation_missing" };
    }
    return { allowed: true, target: "staging", reason: null };
  }
  return { allowed: false, target: "blocked", reason: "unsupported_deployment_target" };
}
