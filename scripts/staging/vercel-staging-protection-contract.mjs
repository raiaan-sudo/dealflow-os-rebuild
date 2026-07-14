import { createHash } from "node:crypto";

const REQUIRED_PROTECTION_MODE = "all_except_custom_domains";
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

function exactAuthority({
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
  return Object.freeze({
    projectId,
    expectedProjectName,
    expectedProjectIdFingerprint,
    expectedOrganizationIdFingerprint,
    request,
  });
}

async function readExactProject(authority) {
  const project = assertExactProject(
    await authority.request(Object.freeze({
      method: "GET",
      path: `/v9/projects/${authority.projectId}`,
      body: null,
    })),
    authority,
  );
  return project;
}

/**
 * Retain standard Vercel protection on the generated deployment URL while all
 * production-slot aliases remain closed by DealFlow's application gate. The
 * injected request adapter keeps the authority decision behavior-testable.
 */
export async function configureExactStagingVercelProtection({
  projectId,
  expectedProjectName,
  expectedProjectIdFingerprint,
  expectedOrganizationIdFingerprint,
  request,
}) {
  const authority = exactAuthority({
    projectId,
    expectedProjectName,
    expectedProjectIdFingerprint,
    expectedOrganizationIdFingerprint,
    request,
  });
  const path = `/v9/projects/${projectId}`;

  const before = await readExactProject(authority);
  const previousMode = before.ssoProtection?.deploymentType ?? null;
  const changed = previousMode !== REQUIRED_PROTECTION_MODE;
  if (changed) {
    await request(Object.freeze({
      method: "PATCH",
      path,
      body: Object.freeze({
        ssoProtection: Object.freeze({ deploymentType: REQUIRED_PROTECTION_MODE }),
      }),
    }));
  }
  const after = await readExactProject(authority);
  if (after.ssoProtection?.deploymentType !== REQUIRED_PROTECTION_MODE) {
    throw new Error("Isolated staging Vercel SSO protection did not reach the exact required mode");
  }

  return Object.freeze({
    status: "PASS",
    scope: "exact_isolated_staging_vercel_project_only",
    projectIdFingerprint: expectedProjectIdFingerprint,
    organizationIdFingerprint: expectedOrganizationIdFingerprint,
    previousMode,
    requiredMode: REQUIRED_PROTECTION_MODE,
    changed,
    uniqueDeploymentsRemainProtected: true,
    productionAliasesRequireApplicationGate: true,
    productionOrSharedProjectChanged: false,
  });
}

/**
 * Re-read the exact isolated project without mutating it. This is used after a
 * deployment to prove that the pre-deployment protection trust root did not
 * drift during deployment.
 */
export async function verifyExactStagingVercelProtection({
  projectId,
  expectedProjectName,
  expectedProjectIdFingerprint,
  expectedOrganizationIdFingerprint,
  request,
}) {
  const authority = exactAuthority({
    projectId,
    expectedProjectName,
    expectedProjectIdFingerprint,
    expectedOrganizationIdFingerprint,
    request,
  });
  const project = await readExactProject(authority);
  const observedMode = project.ssoProtection?.deploymentType ?? null;
  if (observedMode !== REQUIRED_PROTECTION_MODE) {
    throw new Error("Isolated staging Vercel SSO protection drifted from the exact required mode");
  }
  return Object.freeze({
    status: "PASS",
    scope: "exact_isolated_staging_vercel_project_only",
    projectIdFingerprint: expectedProjectIdFingerprint,
    organizationIdFingerprint: expectedOrganizationIdFingerprint,
    observedMode,
    requiredMode: REQUIRED_PROTECTION_MODE,
    readOnlyVerification: true,
    changed: false,
    uniqueDeploymentsRemainProtected: true,
    productionAliasesRequireApplicationGate: true,
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
