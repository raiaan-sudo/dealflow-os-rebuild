import {
  getDeploymentTarget,
  type DeploymentTarget,
} from "../../deployment-target";

export const GHL_SANDBOX_PROVIDER_ATTESTATION = "DEALFLOW_GHL_SANDBOX_ONLY_V1";
export const GHL_PROVIDER_BASE_URL = "https://services.leadconnectorhq.com";

export type GhlSandboxGateInput = {
  enabled: boolean;
  providerEnvironment: string | undefined;
  deploymentTarget?: DeploymentTarget;
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
  isolatedDatabase: boolean;
  actualProjectRef: string | undefined;
  expectedProjectRef: string | undefined;
  providerAttestation: string | undefined;
  baseUrl?: string;
};

export type GhlSandboxGateDecision = {
  allowed: boolean;
  code:
    | "allowed_sandbox"
    | "sandbox_gate_closed"
    | "production_environment_forbidden"
    | "deployment_target_unproven"
    | "sandbox_provider_environment_required"
    | "isolated_database_required"
    | "isolated_project_mismatch"
    | "sandbox_attestation_required"
    | "provider_host_forbidden";
  reason: string;
};

export function extractSupabaseProjectRef(supabaseUrl: string | undefined) {
  if (!supabaseUrl) return "";
  try {
    const hostname = new URL(supabaseUrl).hostname.toLowerCase();
    const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(hostname);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

export function evaluateGhlSandboxGate(input: GhlSandboxGateInput): GhlSandboxGateDecision {
  if (input.deploymentTarget === "production" || input.vercelEnv === "production") {
    return {
      allowed: false,
      code: "production_environment_forbidden",
      reason: "The GHL sandbox provider path is categorically disabled in production.",
    };
  }
  if (!input.deploymentTarget || !["staging", "preview", "test"].includes(input.deploymentTarget)) {
    return {
      allowed: false,
      code: "deployment_target_unproven",
      reason: "GHL sandbox writes require an explicit staging, preview, or test deployment target.",
    };
  }
  if (input.providerEnvironment !== "sandbox") {
    return {
      allowed: false,
      code: "sandbox_provider_environment_required",
      reason: "The real GHL adapter accepts only the provider sandbox environment.",
    };
  }
  if (input.enabled !== true) {
    return {
      allowed: false,
      code: "sandbox_gate_closed",
      reason: "GHL sandbox provider writes default to disabled.",
    };
  }
  if (input.isolatedDatabase !== true) {
    return {
      allowed: false,
      code: "isolated_database_required",
      reason: "GHL sandbox provider writes require an explicitly isolated database.",
    };
  }
  if (
    !input.actualProjectRef
    || !input.expectedProjectRef
    || input.actualProjectRef !== input.expectedProjectRef
  ) {
    return {
      allowed: false,
      code: "isolated_project_mismatch",
      reason: "The current Supabase project is not the exact attested GHL staging project.",
    };
  }
  if (input.providerAttestation !== GHL_SANDBOX_PROVIDER_ATTESTATION) {
    return {
      allowed: false,
      code: "sandbox_attestation_required",
      reason: "The exact GHL sandbox-only attestation is missing.",
    };
  }
  try {
    const url = new URL(input.baseUrl ?? GHL_PROVIDER_BASE_URL);
    if (url.protocol !== "https:" || url.origin !== GHL_PROVIDER_BASE_URL || url.pathname !== "/") {
      throw new Error("forbidden");
    }
  } catch {
    return {
      allowed: false,
      code: "provider_host_forbidden",
      reason: "The GHL provider base URL is outside the exact HTTPS allowlist.",
    };
  }
  return {
    allowed: true,
    code: "allowed_sandbox",
    reason: "The isolated GHL sandbox provider path is explicitly attested.",
  };
}

export class GhlSandboxGateError extends Error {
  readonly code: Exclude<GhlSandboxGateDecision["code"], "allowed_sandbox">;

  constructor(decision: GhlSandboxGateDecision) {
    super(decision.reason);
    this.name = "GhlSandboxGateError";
    this.code = decision.code === "allowed_sandbox" ? "sandbox_gate_closed" : decision.code;
  }
}

export function assertGhlSandboxAllowed(input: GhlSandboxGateInput) {
  const decision = evaluateGhlSandboxGate(input);
  if (!decision.allowed) throw new GhlSandboxGateError(decision);
  return decision;
}

export function ghlSandboxGateFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): GhlSandboxGateInput {
  return {
    enabled: environment.GHL_SANDBOX_WRITES_ENABLED === "true",
    providerEnvironment: environment.GHL_PROVIDER_ENVIRONMENT,
    deploymentTarget: getDeploymentTarget(environment as Record<string, string | undefined>),
    nodeEnv: environment.NODE_ENV,
    vercelEnv: environment.VERCEL_ENV,
    isolatedDatabase: environment.GHL_SANDBOX_ISOLATED_DATABASE === "true",
    actualProjectRef: extractSupabaseProjectRef(environment.NEXT_PUBLIC_SUPABASE_URL),
    expectedProjectRef: environment.GHL_SANDBOX_ISOLATED_SUPABASE_PROJECT_REF?.trim(),
    providerAttestation: environment.GHL_SANDBOX_PROVIDER_ATTESTATION,
    baseUrl: environment.GHL_PROVIDER_BASE_URL ?? GHL_PROVIDER_BASE_URL,
  };
}
