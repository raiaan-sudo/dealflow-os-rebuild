export type DeploymentTarget =
  | "production"
  | "staging"
  | "preview"
  | "development"
  | "test"
  | "unknown";

const EXPLICIT_TARGETS = new Set<DeploymentTarget>([
  "production",
  "staging",
  "preview",
  "development",
  "test",
]);

export function getDeploymentTarget(
  env: Record<string, string | undefined> = process.env,
): DeploymentTarget {
  const vercelEnvironment = env.VERCEL_ENV?.trim().toLowerCase();
  // The platform's production attestation is authoritative over a conflicting
  // repository-controlled target value.
  if (vercelEnvironment === "production") return "production";

  const explicitTarget = env.DEALFLOW_DEPLOYMENT_TARGET?.trim().toLowerCase();

  if (explicitTarget && EXPLICIT_TARGETS.has(explicitTarget as DeploymentTarget)) {
    return explicitTarget as DeploymentTarget;
  }

  if (vercelEnvironment === "preview") return "preview";
  if (vercelEnvironment === "development") return "development";

  const nodeEnvironment = env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnvironment === "test") return "test";
  if (nodeEnvironment === "development") return "development";

  // A production build is not proof that the deployment target is production.
  // Conversely, it is not enough evidence to permit a nonproduction harness.
  return "unknown";
}

export function isProductionDeployment(
  env: Record<string, string | undefined> = process.env,
) {
  return getDeploymentTarget(env) === "production";
}

export function isExplicitNonProductionDeployment(
  env: Record<string, string | undefined> = process.env,
) {
  const target = getDeploymentTarget(env);
  return (
    target === "staging" ||
    target === "preview" ||
    target === "development" ||
    target === "test"
  );
}
