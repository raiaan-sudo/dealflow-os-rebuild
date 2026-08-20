import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  ApiError,
  assertInternalSystemRequest,
  handleApiError,
} from "@/lib/api/route";
import { getSupabaseEnvOrThrow } from "@/lib/env";
import {
  getDeploymentTarget,
  isExactIsolatedStagingVercelHost,
  isExplicitNonProductionDeployment,
} from "@/lib/deployment-target";
import { isExactIsolatedSupabaseProject } from "@/lib/security/supabase-isolation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RELEASE_IDENTITY_SCHEMA = "dealflow.hosted-release-identity.v2" as const;
const BUILD_SOURCE_IDENTITY_SCHEMA =
  "dealflow.hosted-build-source-identity.v1" as const;
const BUILD_SOURCE_ARTIFACT_RELATIVE_PATH = join(
  "public",
  ".well-known",
  "dealflow-hosted-build-identity.json",
);
const BUILD_SOURCE_ARTIFACT_MAX_BYTES = 16 * 1024;

// These direct NEXT_PUBLIC references are intentionally evaluated by the Next
// build. The endpoint therefore attests the built artifact, not mutable Git
// metadata or a value supplied only by the verification process afterward.
const BUILD_RELEASE_IDENTITY = Object.freeze({
  commit: process.env.NEXT_PUBLIC_DEALFLOW_RELEASE_COMMIT ?? "",
  tree: process.env.NEXT_PUBLIC_DEALFLOW_RELEASE_TREE ?? "",
  trackedWorktreeSha256:
    process.env.NEXT_PUBLIC_DEALFLOW_TRACKED_WORKTREE_SHA256 ?? "",
  trackedFileCount:
    process.env.NEXT_PUBLIC_DEALFLOW_TRACKED_FILE_COUNT ?? "",
  dependencyLockSha256:
    process.env.NEXT_PUBLIC_DEALFLOW_DEPENDENCY_LOCK_SHA256 ?? "",
  deployableSourceSha256:
    process.env.NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_SOURCE_SHA256 ?? "",
  deployableManifestSha256:
    process.env.NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_MANIFEST_SHA256 ?? "",
  deployableFileCount:
    process.env.NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_FILE_COUNT ?? "",
  vercelDryRunSourceSha256:
    process.env.NEXT_PUBLIC_DEALFLOW_VERCEL_DRY_RUN_SOURCE_SHA256 ?? "",
  vercelDryRunFileCount:
    process.env.NEXT_PUBLIC_DEALFLOW_VERCEL_DRY_RUN_FILE_COUNT ?? "",
});

function assertHostedReleaseIdentityAuthority() {
  if (
    getDeploymentTarget() === "production" ||
    !isExplicitNonProductionDeployment() ||
    !isExactIsolatedStagingVercelHost()
  ) {
    throw new ApiError(
      404,
      "Release identity is available only on the exact isolated staging host.",
      "release_identity_target_unattested",
    );
  }

  const supabase = getSupabaseEnvOrThrow();
  if (
    !isExactIsolatedSupabaseProject({
      supabaseUrl: supabase.url,
      expectedProjectRef: process.env.QA_ISOLATED_SUPABASE_PROJECT_REF,
    })
  ) {
    throw new ApiError(
      404,
      "Release identity is not authorized for this Supabase project.",
      "release_identity_project_unattested",
    );
  }
}

function readExactBuildReleaseIdentity() {
  const trackedFileCount = Number(BUILD_RELEASE_IDENTITY.trackedFileCount);
  const deployableFileCount = Number(BUILD_RELEASE_IDENTITY.deployableFileCount);
  const vercelDryRunFileCount = Number(
    BUILD_RELEASE_IDENTITY.vercelDryRunFileCount,
  );
  if (
    !/^[a-f0-9]{40,64}$/.test(BUILD_RELEASE_IDENTITY.commit) ||
    !/^[a-f0-9]{40,64}$/.test(BUILD_RELEASE_IDENTITY.tree) ||
    !/^[a-f0-9]{64}$/.test(BUILD_RELEASE_IDENTITY.trackedWorktreeSha256) ||
    !Number.isSafeInteger(trackedFileCount) ||
    trackedFileCount <= 0 ||
    String(trackedFileCount) !== BUILD_RELEASE_IDENTITY.trackedFileCount ||
    !/^[a-f0-9]{64}$/.test(BUILD_RELEASE_IDENTITY.dependencyLockSha256) ||
    !/^[a-f0-9]{64}$/.test(BUILD_RELEASE_IDENTITY.deployableSourceSha256) ||
    !/^[a-f0-9]{64}$/.test(BUILD_RELEASE_IDENTITY.deployableManifestSha256) ||
    !Number.isSafeInteger(deployableFileCount) ||
    deployableFileCount <= 0 ||
    String(deployableFileCount) !== BUILD_RELEASE_IDENTITY.deployableFileCount ||
    !/^[a-f0-9]{64}$/.test(
      BUILD_RELEASE_IDENTITY.vercelDryRunSourceSha256,
    ) ||
    !Number.isSafeInteger(vercelDryRunFileCount) ||
    vercelDryRunFileCount <= 0 ||
    String(vercelDryRunFileCount) !==
      BUILD_RELEASE_IDENTITY.vercelDryRunFileCount
  ) {
    throw new ApiError(
      503,
      "The hosted build release identity is incomplete.",
      "release_identity_build_incomplete",
    );
  }

  return Object.freeze({
    commit: BUILD_RELEASE_IDENTITY.commit,
    tree: BUILD_RELEASE_IDENTITY.tree,
    trackedWorktreeSha256: BUILD_RELEASE_IDENTITY.trackedWorktreeSha256,
    trackedFileCount,
    dependencyLockSha256: BUILD_RELEASE_IDENTITY.dependencyLockSha256,
    deployableSourceSha256: BUILD_RELEASE_IDENTITY.deployableSourceSha256,
    deployableManifestSha256: BUILD_RELEASE_IDENTITY.deployableManifestSha256,
    deployableFileCount,
    vercelDryRunSourceSha256:
      BUILD_RELEASE_IDENTITY.vercelDryRunSourceSha256,
    vercelDryRunFileCount,
  });
}

type ExactBuildReleaseIdentity = ReturnType<
  typeof readExactBuildReleaseIdentity
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  return (
    JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...keys].sort())
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function releaseIdentityMatches(
  value: unknown,
  expected: ExactBuildReleaseIdentity,
) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "commit",
      "tree",
      "trackedWorktreeSha256",
      "trackedFileCount",
      "dependencyLockSha256",
      "deployableSourceSha256",
      "deployableManifestSha256",
      "deployableFileCount",
      "vercelDryRunSourceSha256",
      "vercelDryRunFileCount",
    ])
  ) {
    return false;
  }

  return (
    value.commit === expected.commit &&
    value.tree === expected.tree &&
    value.trackedWorktreeSha256 === expected.trackedWorktreeSha256 &&
    value.trackedFileCount === expected.trackedFileCount &&
    value.dependencyLockSha256 === expected.dependencyLockSha256 &&
    value.deployableSourceSha256 === expected.deployableSourceSha256 &&
    value.deployableManifestSha256 === expected.deployableManifestSha256 &&
    value.deployableFileCount === expected.deployableFileCount &&
    value.vercelDryRunSourceSha256 ===
      expected.vercelDryRunSourceSha256 &&
    value.vercelDryRunFileCount === expected.vercelDryRunFileCount
  );
}

function isExactVercelConfigurationNormalization(value: unknown) {
  if (!isRecord(value) || value.status !== "PASS") return false;

  if (value.transformation === "exact_source_bytes") {
    return hasExactKeys(value, ["status", "transformation"]);
  }

  return (
    value.transformation === "vercel_semantic_config_normalization_v2" &&
    hasExactKeys(value, [
      "status",
      "transformation",
      "injectedProjectNameMatched",
      "injectedVersion",
      "hostedBytesSha256",
      "recoveredSourceSha256",
    ]) &&
    value.injectedProjectNameMatched === true &&
    value.injectedVersion === 2 &&
    isSha256(value.hostedBytesSha256) &&
    isSha256(value.recoveredSourceSha256)
  );
}

function invalidBuildSourceArtifact(): ApiError {
  return new ApiError(
    503,
    "The hosted build source identity is unavailable or invalid.",
    "release_identity_source_artifact_invalid",
  );
}

function readExactBuildSourceIdentity(expected: ExactBuildReleaseIdentity) {
  const artifactPath = join(
    process.cwd(),
    BUILD_SOURCE_ARTIFACT_RELATIVE_PATH,
  );
  let bytes: Buffer;
  let descriptor: number | null = null;

  try {
    descriptor = openSync(
      artifactPath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const stat = fstatSync(descriptor);
    if (
      !stat.isFile() ||
      stat.size <= 0 ||
      stat.size > BUILD_SOURCE_ARTIFACT_MAX_BYTES
    ) {
      throw invalidBuildSourceArtifact();
    }
    bytes = readFileSync(/* turbopackIgnore: true */ descriptor);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalidBuildSourceArtifact();
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw invalidBuildSourceArtifact();
  }

  if (
    !isRecord(parsed) ||
    `${JSON.stringify(parsed)}\n` !== bytes.toString("utf8") ||
    !hasExactKeys(parsed, [
      "schemaVersion",
      "status",
      "generatedInsideBuild",
      "manifestSha256",
      "deployableSourceSha256",
      "deployableFileCount",
      "release",
      "targetClassification",
      "expectedIdentityMatched",
      "deployablePathSetVerified",
      "predeployPathSetProofBound",
      "vercelConfigurationNormalization",
      "vercelDryRunSourceSha256",
      "vercelDryRunFileCount",
    ]) ||
    parsed.schemaVersion !== BUILD_SOURCE_IDENTITY_SCHEMA ||
    parsed.status !== "HOSTED_SOURCE_VERIFIED" ||
    parsed.generatedInsideBuild !== true ||
    parsed.targetClassification !== "exact_staging" ||
    parsed.expectedIdentityMatched !== true ||
    parsed.deployablePathSetVerified !== true ||
    parsed.predeployPathSetProofBound !== true ||
    !isSha256(parsed.manifestSha256) ||
    parsed.manifestSha256 !== expected.deployableManifestSha256 ||
    !isSha256(parsed.deployableSourceSha256) ||
    parsed.deployableSourceSha256 !== expected.deployableSourceSha256 ||
    !Number.isSafeInteger(parsed.deployableFileCount) ||
    parsed.deployableFileCount !== expected.deployableFileCount ||
    !isSha256(parsed.vercelDryRunSourceSha256) ||
    parsed.vercelDryRunSourceSha256 !== expected.vercelDryRunSourceSha256 ||
    !Number.isSafeInteger(parsed.vercelDryRunFileCount) ||
    parsed.vercelDryRunFileCount !== expected.vercelDryRunFileCount ||
    !releaseIdentityMatches(parsed.release, expected) ||
    !isExactVercelConfigurationNormalization(
      parsed.vercelConfigurationNormalization,
    )
  ) {
    throw invalidBuildSourceArtifact();
  }

  return Object.freeze(parsed);
}

export async function GET(request: Request) {
  try {
    assertInternalSystemRequest(request);
    assertHostedReleaseIdentityAuthority();
    const release = readExactBuildReleaseIdentity();
    const buildSource = readExactBuildSourceIdentity(release);

    return Response.json(
      {
        ok: true,
        schemaVersion: RELEASE_IDENTITY_SCHEMA,
        release,
        buildSource,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  } catch (error) {
    return handleApiError(error, "Internal hosted release identity proof");
  }
}
