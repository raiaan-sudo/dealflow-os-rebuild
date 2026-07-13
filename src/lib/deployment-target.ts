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

export const DEALFLOW_PRODUCTION_HOST_ATTESTATION_VALUE =
  "DEALFLOW_PRODUCTION_VERCEL_PROJECT_EXACT_V1" as const;
export const DEALFLOW_STAGING_HOST_ATTESTATION_VALUE =
  "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1" as const;

function hasExactProjectIdentity(
  env: Record<string, string | undefined>,
  expectedProjectVariable: "DEALFLOW_PRODUCTION_VERCEL_PROJECT_ID" | "DEALFLOW_STAGING_VERCEL_PROJECT_ID",
  attestationVariable: "DEALFLOW_PRODUCTION_HOST_ATTESTATION" | "DEALFLOW_STAGING_HOST_ATTESTATION",
  attestationValue: string,
) {
  const hostedProjectId = env.VERCEL_PROJECT_ID?.trim() ?? "";
  const expectedProjectId = env[expectedProjectVariable]?.trim() ?? "";
  return Boolean(
    hostedProjectId &&
    expectedProjectId &&
    hostedProjectId === expectedProjectId &&
    env[attestationVariable] === attestationValue,
  );
}

export function isExactProductionVercelHost(env: Record<string, string | undefined> = process.env) {
  return env.VERCEL_ENV?.trim().toLowerCase() === "production" &&
    env.DEALFLOW_DEPLOYMENT_TARGET?.trim().toLowerCase() === "production" &&
    hasExactProjectIdentity(
    env,
    "DEALFLOW_PRODUCTION_VERCEL_PROJECT_ID",
    "DEALFLOW_PRODUCTION_HOST_ATTESTATION",
    DEALFLOW_PRODUCTION_HOST_ATTESTATION_VALUE,
    );
}

export function isExactIsolatedStagingVercelHost(env: Record<string, string | undefined> = process.env) {
  return env.VERCEL_ENV?.trim().toLowerCase() === "production" &&
    env.DEALFLOW_DEPLOYMENT_TARGET?.trim().toLowerCase() === "staging" &&
    hasExactProjectIdentity(
      env,
      "DEALFLOW_STAGING_VERCEL_PROJECT_ID",
      "DEALFLOW_STAGING_HOST_ATTESTATION",
      DEALFLOW_STAGING_HOST_ATTESTATION_VALUE,
    );
}

export function getDeploymentTarget(
  env: Record<string, string | undefined> = process.env,
): DeploymentTarget {
  const vercelEnvironment = env.VERCEL_ENV?.trim().toLowerCase();
  const explicitTarget = env.DEALFLOW_DEPLOYMENT_TARGET?.trim().toLowerCase();

  // Vercel uses VERCEL_ENV=production for a project's production branch even
  // when that entire project is isolated staging. Only the exact pinned
  // staging project plus a constant attestation may declassify that hosted
  // environment. Every other hosted production deployment remains production.
  if (vercelEnvironment === "production") {
    return isExactIsolatedStagingVercelHost(env) ? "staging" : "production";
  }

  // A nonproduction hosted deployment can refine itself to another
  // nonproduction target (for example a dedicated staging project deployed as
  // a Vercel preview), but it can never self-assert production. Production is
  // accepted only from the hosting platform's own production attestation.
  if (
    (vercelEnvironment === "preview" || vercelEnvironment === "development") &&
    explicitTarget === "production"
  ) {
    return vercelEnvironment;
  }

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
