import {
  getDeploymentTarget,
  isExactProductionVercelHost,
  type DeploymentTarget,
} from "../../deployment-target";
import { extractSupabaseProjectRef, GHL_PROVIDER_BASE_URL } from "./sandbox-gate";

export const GHL_PRODUCTION_PROVIDER_ATTESTATION = "DEALFLOW_GHL_PRODUCTION_EXACT_V1";

export type GhlProductionOperation =
  | "provisioning"
  | "lead_delivery"
  | "lifecycle_webhook"
  | "form_submissions_read";

export type GhlProductionGateInput = {
  enabled: boolean;
  operation: GhlProductionOperation;
  operationEnabled: boolean;
  providerEnvironment: string | undefined;
  deploymentTarget?: DeploymentTarget;
  vercelEnv: string | undefined;
  exactProductionHost?: boolean;
  actualProjectRef: string | undefined;
  expectedProjectRef: string | undefined;
  providerAttestation: string | undefined;
  baseUrl?: string;
};

export type GhlProductionGateDecision = {
  allowed: boolean;
  code:
    | "allowed_production"
    | "production_gate_closed"
    | "operation_kill_switch_closed"
    | "production_deployment_required"
    | "production_host_attestation_required"
    | "production_provider_environment_required"
    | "production_project_mismatch"
    | "production_attestation_required"
    | "provider_host_forbidden";
  reason: string;
};

export function evaluateGhlProductionGate(input: GhlProductionGateInput): GhlProductionGateDecision {
  if (input.deploymentTarget !== "production" || input.vercelEnv !== "production") {
    return { allowed: false, code: "production_deployment_required", reason: "GHL production writes require exact production deployment authority." };
  }
  if (input.exactProductionHost !== true) {
    return {
      allowed: false,
      code: "production_host_attestation_required",
      reason: "GHL production writes require the exact attested production Vercel project.",
    };
  }
  if (input.providerEnvironment !== "production") {
    return { allowed: false, code: "production_provider_environment_required", reason: "GHL production writes require the production provider environment." };
  }
  if (!input.enabled) {
    return { allowed: false, code: "production_gate_closed", reason: "The global GHL production write gate defaults to disabled." };
  }
  if (!input.operationEnabled) {
    return { allowed: false, code: "operation_kill_switch_closed", reason: `The GHL ${input.operation} kill switch defaults to disabled.` };
  }
  if (!input.actualProjectRef || !input.expectedProjectRef || input.actualProjectRef !== input.expectedProjectRef) {
    return { allowed: false, code: "production_project_mismatch", reason: "The current database is not the exact attested GHL production project." };
  }
  if (input.providerAttestation !== GHL_PRODUCTION_PROVIDER_ATTESTATION) {
    return { allowed: false, code: "production_attestation_required", reason: "The exact GHL production provider attestation is missing." };
  }
  try {
    const url = new URL(input.baseUrl ?? GHL_PROVIDER_BASE_URL);
    if (url.protocol !== "https:" || url.origin !== GHL_PROVIDER_BASE_URL || url.pathname !== "/") throw new Error("forbidden");
  } catch {
    return { allowed: false, code: "provider_host_forbidden", reason: "The GHL provider base URL is outside the exact HTTPS allowlist." };
  }
  return { allowed: true, code: "allowed_production", reason: "Exact production deployment, project, operation, and provider authority are attested." };
}

export class GhlProductionGateError extends Error {
  readonly code: Exclude<GhlProductionGateDecision["code"], "allowed_production">;
  constructor(decision: GhlProductionGateDecision) {
    super(decision.reason);
    this.name = "GhlProductionGateError";
    this.code = decision.code === "allowed_production" ? "production_gate_closed" : decision.code;
  }
}

export function assertGhlProductionAllowed(input: GhlProductionGateInput) {
  const decision = evaluateGhlProductionGate(input);
  if (!decision.allowed) throw new GhlProductionGateError(decision);
  return decision;
}

export function ghlProductionGateFromEnvironment(
  operation: GhlProductionOperation,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): GhlProductionGateInput {
  const operationVariable = {
    provisioning: "GHL_PRODUCTION_PROVISIONING_ENABLED",
    lead_delivery: "GHL_PRODUCTION_LEAD_DELIVERY_ENABLED",
    lifecycle_webhook: "GHL_PRODUCTION_LIFECYCLE_WEBHOOK_ENABLED",
    form_submissions_read: "GHL_PRODUCTION_FORM_SUBMISSIONS_READ_ENABLED",
  }[operation];
  return {
    enabled: environment.GHL_PRODUCTION_WRITES_ENABLED === "true",
    operation,
    operationEnabled: environment[operationVariable] === "true",
    providerEnvironment: environment.GHL_PROVIDER_ENVIRONMENT,
    deploymentTarget: getDeploymentTarget(environment as Record<string, string | undefined>),
    vercelEnv: environment.VERCEL_ENV,
    exactProductionHost: isExactProductionVercelHost(
      environment as Record<string, string | undefined>,
    ),
    actualProjectRef: extractSupabaseProjectRef(environment.NEXT_PUBLIC_SUPABASE_URL),
    expectedProjectRef: environment.GHL_PRODUCTION_SUPABASE_PROJECT_REF?.trim(),
    providerAttestation: environment.GHL_PRODUCTION_PROVIDER_ATTESTATION,
    baseUrl: environment.GHL_PROVIDER_BASE_URL ?? GHL_PROVIDER_BASE_URL,
  };
}
