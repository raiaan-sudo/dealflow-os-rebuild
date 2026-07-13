import { getDeploymentTarget } from "@/lib/deployment-target";

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
    | "unsupported_deployment_target";
};

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
    return env[META_PRODUCTION_DUE_ACTIVATION_ENV] === "true"
      ? { allowed: true, target: "production", reason: null }
      : { allowed: false, target: "blocked", reason: "production_activation_disabled" };
  }
  if (target === "staging") {
    return env[META_STAGING_DUE_ACTIVATION_ENV] === "true"
      ? { allowed: true, target: "staging", reason: null }
      : { allowed: false, target: "blocked", reason: "staging_activation_disabled" };
  }
  return { allowed: false, target: "blocked", reason: "unsupported_deployment_target" };
}
