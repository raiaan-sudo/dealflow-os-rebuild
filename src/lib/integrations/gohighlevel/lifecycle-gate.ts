import { getDeploymentTarget } from "../../deployment-target";
import {
  assertGhlProductionAllowed,
  ghlProductionGateFromEnvironment,
} from "./production-gate";
import {
  assertGhlSandboxAllowed,
  ghlSandboxGateFromEnvironment,
} from "./sandbox-gate";

export type GhlLifecycleEnvironment = "production" | "sandbox";

export class GhlLifecycleGateError extends Error {
  readonly code = "ghl_lifecycle_deployment_authority_required";

  constructor() {
    super("GHL lifecycle webhooks require an exact production or isolated-staging deployment authority.");
    this.name = "GhlLifecycleGateError";
  }
}

/**
 * The hosting/deployment attestation chooses the provider environment. The
 * webhook payload is deliberately not an authority input.
 */
export function resolveGhlLifecycleEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): GhlLifecycleEnvironment {
  const target = getDeploymentTarget(environment as Record<string, string | undefined>);
  if (target === "production") {
    assertGhlProductionAllowed(
      ghlProductionGateFromEnvironment("lifecycle_webhook", environment),
    );
    return "production";
  }
  if (target === "staging") {
    const gate = ghlSandboxGateFromEnvironment(environment);
    if (gate.exactIsolatedStagingHost !== true || gate.vercelEnv !== "production") {
      throw new GhlLifecycleGateError();
    }
    assertGhlSandboxAllowed(gate);
    return "sandbox";
  }
  throw new GhlLifecycleGateError();
}
