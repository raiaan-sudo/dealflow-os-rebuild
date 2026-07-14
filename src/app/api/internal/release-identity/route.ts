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

const RELEASE_IDENTITY_SCHEMA = "dealflow.hosted-release-identity.v1" as const;

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

export async function GET(request: Request) {
  try {
    assertInternalSystemRequest(request);
    assertHostedReleaseIdentityAuthority();

    return Response.json(
      {
        ok: true,
        schemaVersion: RELEASE_IDENTITY_SCHEMA,
        release: readExactBuildReleaseIdentity(),
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
