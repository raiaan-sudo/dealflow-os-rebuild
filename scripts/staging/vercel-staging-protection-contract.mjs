import { createHash } from "node:crypto";

const REQUIRED_PROTECTION_MODE = "preview";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function assertExactProject(project, authority) {
  if (
    project?.id !== authority.projectId ||
    project?.name !== authority.expectedProjectName ||
    sha256(project.id) !== authority.expectedProjectIdFingerprint ||
    sha256(project.accountId) !== authority.expectedOrganizationIdFingerprint
  ) {
    throw new Error("Vercel protection authority is not the exact isolated staging project");
  }
  return project;
}

/**
 * Configure only the pinned isolated staging project so production-target
 * staging aliases are reachable while Preview deployments remain protected.
 * The injected request adapter keeps the authority decision behavior-testable.
 */
export function configureExactStagingVercelProtection({
  projectId,
  expectedProjectName,
  expectedProjectIdFingerprint,
  expectedOrganizationIdFingerprint,
  request,
}) {
  if (
    typeof projectId !== "string" ||
    sha256(projectId) !== expectedProjectIdFingerprint ||
    typeof request !== "function"
  ) {
    throw new Error("Vercel protection input is not the pinned isolated staging authority");
  }
  const authority = Object.freeze({
    projectId,
    expectedProjectName,
    expectedProjectIdFingerprint,
    expectedOrganizationIdFingerprint,
  });
  const path = `/v9/projects/${projectId}`;
  const read = () => assertExactProject(
    request(Object.freeze({ method: "GET", path, body: null })),
    authority,
  );

  const before = read();
  const previousMode = before.ssoProtection?.deploymentType ?? null;
  const changed = previousMode !== REQUIRED_PROTECTION_MODE;
  if (changed) {
    request(Object.freeze({
      method: "PATCH",
      path,
      body: Object.freeze({
        ssoProtection: Object.freeze({ deploymentType: REQUIRED_PROTECTION_MODE }),
      }),
    }));
  }
  const after = read();
  if (after.ssoProtection?.deploymentType !== REQUIRED_PROTECTION_MODE) {
    throw new Error("Isolated staging production aliases remain behind Vercel SSO protection");
  }

  return Object.freeze({
    status: "PASS",
    scope: "exact_isolated_staging_vercel_project_only",
    projectIdFingerprint: expectedProjectIdFingerprint,
    organizationIdFingerprint: expectedOrganizationIdFingerprint,
    previousMode,
    requiredMode: REQUIRED_PROTECTION_MODE,
    changed,
    previewDeploymentsRemainProtected: true,
    productionOrSharedProjectChanged: false,
  });
}

export class StagingHostRedirectError extends Error {
  constructor() {
    super("Isolated staging host returned a redirect instead of a direct HTTP 200");
    this.name = "StagingHostRedirectError";
  }
}

export function classifyStagingHostReadiness({ status }) {
  if (status === 200) return "ready";
  if (REDIRECT_STATUSES.has(status)) throw new StagingHostRedirectError();
  return "retry";
}
