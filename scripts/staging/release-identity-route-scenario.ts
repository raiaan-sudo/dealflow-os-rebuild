import assert from "node:assert/strict";

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

if (scenario === "production") {
  process.env.DEALFLOW_DEPLOYMENT_TARGET = "production";
} else if (scenario === "unattested_host") {
  process.env.VERCEL_PROJECT_ID = `${projectId}-other`;
} else if (scenario === "wrong_supabase") {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://differentprojectqibh.supabase.co";
} else if (scenario === "incomplete_build") {
  process.env.NEXT_PUBLIC_DEALFLOW_RELEASE_TREE = "";
} else if (scenario !== "authorized") {
  throw new Error(`Unknown release identity test scenario: ${scenario}`);
}

async function main() {
  const { GET } = await import("../../src/app/api/internal/release-identity/route");
  const response = await GET(
    new Request("https://dealflow-isolated.example/api/internal/release-identity", {
      headers: { Authorization: `Bearer ${secret}` },
    }),
  );
  const body = await response.json();

  if (scenario === "authorized") {
    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      schemaVersion: "dealflow.hosted-release-identity.v1",
      release,
    });
  } else if (scenario === "incomplete_build") {
    assert.equal(response.status, 503);
    assert.equal(body.code, "release_identity_build_incomplete");
  } else {
    assert.equal(response.status, 404);
    assert.match(body.code, /^release_identity_(?:target|project)_unattested$/);
  }

  process.stdout.write(`release identity route scenario ${scenario}: PASS\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
