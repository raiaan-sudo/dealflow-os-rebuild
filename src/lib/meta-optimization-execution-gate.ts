import {
  getDeploymentTarget,
  isExactIsolatedStagingVercelHost,
} from "@/lib/deployment-target";
import type { MetaOptimizationAuthorityResult } from "@/lib/authority/owner-decision-authority-contract";

export const DEALFLOW_PRODUCTION_META_OPTIMIZATION_ATTESTATION_VALUE =
  "DEALFLOW_PRODUCTION_META_OPTIMIZATION_EXACT_V1" as const;

type ClosedGate = {
  enabled: false;
  environment: null;
  accountIds: string[];
  blockedReason: string;
};

type OpenGate = {
  enabled: true;
  environment: "staging" | "production";
  accountIds: string[];
  blockedReason: null;
};

export function evaluateMetaOptimizationExecutionGate(
  env: Record<string, string | undefined> = process.env,
  ownerAuthority?: MetaOptimizationAuthorityResult,
): ClosedGate | OpenGate {
  const target = getDeploymentTarget(env);
  if (target === "staging" && isExactIsolatedStagingVercelHost(env)) {
    if (
      !ownerAuthority?.authorized ||
      ownerAuthority.capability !== "meta_optimization_provider_writes" ||
      ownerAuthority.authorityMode !== "synthetic_staging"
    ) {
      return { enabled: false, environment: null, accountIds: [], blockedReason: "optimizer_signed_owner_authority_required" };
    }
    if (env.META_OPTIMIZATION_EXECUTION_MODE !== "sandbox") {
      return { enabled: false, environment: null, accountIds: [], blockedReason: "optimizer_sandbox_mode_required" };
    }
    if (env.ALLOW_META_SANDBOX_OPTIMIZATION !== "true") {
      return { enabled: false, environment: null, accountIds: [], blockedReason: "optimizer_write_gate_closed" };
    }
    const accountId = (env.META_OPTIMIZATION_SANDBOX_ACCOUNT_ID ?? "").trim().replace(/^act_/, "");
    if (!/^[0-9]{5,40}$/.test(accountId)) {
      return { enabled: false, environment: null, accountIds: [], blockedReason: "optimizer_sandbox_account_missing" };
    }
    return { enabled: true, environment: "staging", accountIds: [accountId], blockedReason: null };
  }
  const productionHostClaim = Boolean(env.VERCEL_ENV === "production" &&
    env.DEALFLOW_DEPLOYMENT_TARGET === "production" &&
    env.VERCEL_PROJECT_ID?.trim());
  if ((target === "production" || target === "unknown") && productionHostClaim) {
    if (
      !ownerAuthority?.authorized ||
      ownerAuthority.capability !== "meta_optimization_provider_writes" ||
      ownerAuthority.authorityMode !== "production"
    ) {
      return {
        enabled: false,
        environment: null,
        accountIds: [],
        blockedReason: "optimizer_signed_owner_authority_required",
      };
    }
    if (env.META_OPTIMIZATION_EXECUTION_MODE !== "live") {
      return { enabled: false, environment: null, accountIds: [], blockedReason: "optimizer_live_mode_required" };
    }
    if (
      env.ALLOW_META_PRODUCTION_OPTIMIZATION !== "true" ||
      env.DEALFLOW_PRODUCTION_META_OPTIMIZATION_ATTESTATION !==
        DEALFLOW_PRODUCTION_META_OPTIMIZATION_ATTESTATION_VALUE
    ) {
      return { enabled: false, environment: null, accountIds: [], blockedReason: "optimizer_production_authority_closed" };
    }
    const rawAccounts = (env.META_OPTIMIZATION_PRODUCTION_ACCOUNT_IDS ?? "")
      .split(",")
      .map((value) => value.trim().replace(/^act_/, ""))
      .filter(Boolean);
    const accountIds = [...new Set(rawAccounts)];
    if (accountIds.length === 0 || accountIds.some((value) => !/^[0-9]{5,40}$/.test(value))) {
      return { enabled: false, environment: null, accountIds: [], blockedReason: "optimizer_production_account_allowlist_invalid" };
    }
    return { enabled: true, environment: "production", accountIds, blockedReason: null };
  }
  return { enabled: false, environment: null, accountIds: [], blockedReason: "exact_optimizer_host_attestation_required" };
}
