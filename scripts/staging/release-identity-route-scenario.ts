import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const scenario = process.argv[2];
const secret = "R8!dealflow-release-identity-scenario-only-42Z";
const projectId = process.env.DEALFLOW_TEST_CANONICAL_STAGING_PROJECT_ID ?? "";
assert.match(projectId, /^prj_[A-Za-z0-9]+$/);
const projectRef = "dealflowisolatedqibh";
const release = Object.freeze({
  commit: "a".repeat(40),
  tree: "b".repeat(40),
  trackedWorktreeSha256: "c".repeat(64),
  trackedFileCount: 650,
  dependencyLockSha256: "d".repeat(64),
  deployableSourceSha256: "e".repeat(64),
  deployableManifestSha256: "f".repeat(64),
  deployableFileCount: 640,
  vercelDryRunSourceSha256: "1".repeat(64),
  vercelDryRunFileCount: 641,
});
const exactBytesNormalization = Object.freeze({
  status: "PASS",
  transformation: "exact_source_bytes",
});
const vercelNormalization = Object.freeze({
  status: "PASS",
  transformation: "vercel_canonical_config_normalization_v1",
  injectedProjectNameMatched: true,
  injectedVersion: 2,
  hostedBytesSha256: "2".repeat(64),
  recoveredSourceSha256: "3".repeat(64),
});

function exactBuildSource(normalization: Record<string, unknown> = exactBytesNormalization) {
  return {
    schemaVersion: "dealflow.hosted-build-source-identity.v1",
    status: "HOSTED_SOURCE_VERIFIED",
    generatedInsideBuild: true,
    manifestSha256: release.deployableManifestSha256,
    deployableSourceSha256: release.deployableSourceSha256,
    deployableFileCount: release.deployableFileCount,
    release: { ...release },
    targetClassification: "exact_staging",
    expectedIdentityMatched: true,
    deployablePathSetVerified: true,
    predeployPathSetProofBound: true,
    vercelConfigurationNormalization: { ...normalization },
    vercelDryRunSourceSha256: release.vercelDryRunSourceSha256,
    vercelDryRunFileCount: release.vercelDryRunFileCount,
  };
}

Object.assign(process.env, {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
  VERCEL_PROJECT_ID: projectId,
  DEALFLOW_STAGING_VERCEL_PROJECT_ID: projectId,
  DEALFLOW_STAGING_HOST_ATTESTATION:
    "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1",
  NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "scenario-anon-key-with-more-than-32-characters",
  QA_ISOLATED_SUPABASE_PROJECT_REF: projectRef,
  INTERNAL_SYSTEM_JOBS_SECRET: secret,
  NEXT_PUBLIC_DEALFLOW_RELEASE_COMMIT: release.commit,
  NEXT_PUBLIC_DEALFLOW_RELEASE_TREE: release.tree,
  NEXT_PUBLIC_DEALFLOW_TRACKED_WORKTREE_SHA256: release.trackedWorktreeSha256,
  NEXT_PUBLIC_DEALFLOW_TRACKED_FILE_COUNT: String(release.trackedFileCount),
  NEXT_PUBLIC_DEALFLOW_DEPENDENCY_LOCK_SHA256: release.dependencyLockSha256,
  NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_SOURCE_SHA256: release.deployableSourceSha256,
  NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_MANIFEST_SHA256:
    release.deployableManifestSha256,
  NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_FILE_COUNT: String(release.deployableFileCount),
  NEXT_PUBLIC_DEALFLOW_VERCEL_DRY_RUN_SOURCE_SHA256:
    release.vercelDryRunSourceSha256,
  NEXT_PUBLIC_DEALFLOW_VERCEL_DRY_RUN_FILE_COUNT: String(
    release.vercelDryRunFileCount,
  ),
});

const scenarioRoot = mkdtempSync(
  join(tmpdir(), "dealflow-release-identity-route-scenario-"),
);
const artifactPath = join(
  scenarioRoot,
  "public",
  ".well-known",
  "dealflow-hosted-build-identity.json",
);
mkdirSync(dirname(artifactPath), { recursive: true });

let buildSource = exactBuildSource();
let artifactMode: "canonical" | "missing" | "malformed" | "noncanonical" | "symlink" =
  "canonical";
let authorizedRequest = true;

if (scenario === "production" || scenario === "production_missing_artifact") {
  process.env.DEALFLOW_DEPLOYMENT_TARGET = "production";
  if (scenario === "production_missing_artifact") artifactMode = "missing";
} else if (scenario === "unattested_host") {
  process.env.VERCEL_PROJECT_ID = `${projectId}-other`;
} else if (
  scenario === "wrong_supabase" ||
  scenario === "wrong_supabase_missing_artifact"
) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://differentprojectqibh.supabase.co";
  if (scenario === "wrong_supabase_missing_artifact") artifactMode = "missing";
} else if (scenario === "incomplete_build") {
  process.env.NEXT_PUBLIC_DEALFLOW_RELEASE_TREE = "";
} else if (scenario === "authorized_vercel_normalization") {
  buildSource = exactBuildSource(vercelNormalization);
} else if (scenario === "missing_artifact") {
  artifactMode = "missing";
} else if (scenario === "malformed_artifact") {
  artifactMode = "malformed";
} else if (scenario === "noncanonical_artifact") {
  artifactMode = "noncanonical";
} else if (scenario === "symlink_artifact") {
  artifactMode = "symlink";
} else if (scenario === "wrong_artifact_schema") {
  buildSource.schemaVersion = "dealflow.hosted-build-source-identity.v0";
} else if (scenario === "unverified_artifact") {
  buildSource.status = "NOT_APPLICABLE_UNVERIFIED";
} else if (scenario === "wrong_artifact_target") {
  buildSource.targetClassification = "generic_non_release";
} else if (scenario === "mismatched_artifact_release") {
  buildSource.release.tree = "9".repeat(40);
} else if (scenario === "mismatched_artifact_digest") {
  buildSource.deployableSourceSha256 = "9".repeat(64);
} else if (scenario === "extra_artifact_field") {
  Object.assign(buildSource, { unexpected: true });
} else if (scenario === "extra_artifact_release_field") {
  Object.assign(buildSource.release, { unexpected: true });
} else if (scenario === "bad_normalization_status") {
  buildSource.vercelConfigurationNormalization.status = "FAIL";
} else if (scenario === "bad_normalization_shape") {
  Object.assign(buildSource.vercelConfigurationNormalization, { unexpected: true });
} else if (scenario === "bad_vercel_normalization") {
  buildSource = exactBuildSource({
    ...vercelNormalization,
    injectedProjectNameMatched: false,
  });
} else if (scenario === "unauthorized_missing_artifact") {
  artifactMode = "missing";
  authorizedRequest = false;
} else if (scenario !== "authorized") {
  throw new Error(`Unknown release identity test scenario: ${scenario}`);
}

if (artifactMode === "canonical") {
  writeFileSync(artifactPath, `${JSON.stringify(buildSource)}\n`, { mode: 0o644 });
} else if (artifactMode === "malformed") {
  writeFileSync(artifactPath, "{not-json\n", { mode: 0o644 });
} else if (artifactMode === "noncanonical") {
  writeFileSync(artifactPath, `${JSON.stringify(buildSource, null, 2)}\n`, {
    mode: 0o644,
  });
} else if (artifactMode === "symlink") {
  const target = join(scenarioRoot, "symlink-target.json");
  writeFileSync(target, `${JSON.stringify(buildSource)}\n`, { mode: 0o644 });
  symlinkSync(target, artifactPath);
}

async function main() {
  process.chdir(scenarioRoot);
  const { GET } = await import("../../src/app/api/internal/release-identity/route");
  const response = await GET(
    new Request("https://dealflow-isolated.example/api/internal/release-identity", {
      headers: {
        Authorization: `Bearer ${authorizedRequest ? secret : "wrong-secret"}`,
      },
    }),
  );
  const body = await response.json();

  if (scenario === "authorized" || scenario === "authorized_vercel_normalization") {
    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      schemaVersion: "dealflow.hosted-release-identity.v2",
      release,
      buildSource,
    });
  } else if (scenario === "incomplete_build") {
    assert.equal(response.status, 503);
    assert.equal(body.code, "release_identity_build_incomplete");
  } else if (scenario === "unauthorized_missing_artifact") {
    assert.equal(response.status, 401);
    assert.equal(body.code, "internal_unauthorized");
  } else if (
    scenario === "production" ||
    scenario === "production_missing_artifact" ||
    scenario === "unattested_host" ||
    scenario === "wrong_supabase" ||
    scenario === "wrong_supabase_missing_artifact"
  ) {
    assert.equal(response.status, 404);
    assert.match(body.code, /^release_identity_(?:target|project)_unattested$/);
  } else {
    assert.equal(response.status, 503);
    assert.equal(body.code, "release_identity_source_artifact_invalid");
  }

  process.stdout.write(`release identity route scenario ${scenario}: PASS\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    rmSync(scenarioRoot, { recursive: true, force: true });
  });
