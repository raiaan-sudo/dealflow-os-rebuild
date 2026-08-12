#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertExactHostedBuildSourceIdentity } from "./hosted-build-source-identity-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const route = readFileSync(
  join(root, "src", "app", "api", "internal", "release-identity", "route.ts"),
  "utf8",
);
const nextConfig = readFileSync(join(root, "next.config.mjs"), "utf8");
const runner = readFileSync(
  join(root, "scripts", "staging", "run-isolated-staging-acceptance.mjs"),
  "utf8",
);
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const buildIdentityGenerator = readFileSync(
  join(root, "scripts", "generate-hosted-build-identity.mjs"),
  "utf8",
);
const scenarioPath = join(
  root,
  "scripts",
  "staging",
  "release-identity-route-scenario.ts",
);
const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
const canonicalStagingProjectId = String(
  JSON.parse(readFileSync(join(root, ".vercel", "project.json"), "utf8"))
    .projectId,
);

for (const name of [
  "NEXT_PUBLIC_DEALFLOW_RELEASE_COMMIT",
  "NEXT_PUBLIC_DEALFLOW_RELEASE_TREE",
  "NEXT_PUBLIC_DEALFLOW_TRACKED_WORKTREE_SHA256",
  "NEXT_PUBLIC_DEALFLOW_TRACKED_FILE_COUNT",
  "NEXT_PUBLIC_DEALFLOW_DEPENDENCY_LOCK_SHA256",
  "NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_SOURCE_SHA256",
  "NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_MANIFEST_SHA256",
  "NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_FILE_COUNT",
  "NEXT_PUBLIC_DEALFLOW_VERCEL_DRY_RUN_SOURCE_SHA256",
  "NEXT_PUBLIC_DEALFLOW_VERCEL_DRY_RUN_FILE_COUNT",
]) {
  assert.match(route, new RegExp(`process\\.env\\.${name}`));
  assert.match(runner, new RegExp(`${name}:`));
}
assert.equal(
  packageJson.scripts.prebuild,
  "node ./scripts/generate-hosted-build-identity.mjs",
);
for (const marker of [
  "dealflow.deployable-source-manifest.v1",
  "dealflow.hosted-build-source-identity.v1",
  "git_tracked_files_minus_vercelignore_and_manifest",
  "HOSTED_SOURCE_VERIFIED",
  "STAGING_PROJECT_ID_SHA256",
  "PRODUCTION_PROJECT_ID_SHA256",
  "DEALFLOW_PRODUCTION_HOST_ATTESTATION",
  "predeployPathSetProofBound",
  "Deployable source resolves outside the repository",
]) {
  assert.ok(buildIdentityGenerator.includes(marker));
}
assert.match(route, /assertInternalSystemRequest\(request\)/);
assert.match(route, /isExactIsolatedStagingVercelHost\(\)/);
assert.match(route, /isExplicitNonProductionDeployment\(\)/);
assert.match(route, /isExactIsolatedSupabaseProject/);
assert.match(route, /getDeploymentTarget\(\) === "production"/);
assert.match(route, /Cache-Control": "no-store"/);
assert.match(route, /X-Robots-Tag": "noindex"/);
assert.match(route, /dealflow\.hosted-release-identity\.v2/);
assert.match(route, /dealflow\.hosted-build-source-identity\.v1/);
assert.match(route, /release_identity_source_artifact_invalid/);
assert.match(route, /targetClassification !== "exact_staging"/);
assert.match(route, /parsed\.status !== "HOSTED_SOURCE_VERIFIED"/);
assert.match(route, /parsed\.generatedInsideBuild !== true/);
assert.match(route, /parsed\.expectedIdentityMatched !== true/);
assert.match(route, /parsed\.deployablePathSetVerified !== true/);
assert.match(route, /parsed\.predeployPathSetProofBound !== true/);
assert.match(route, /releaseIdentityMatches\(parsed\.release, expected\)/);
assert.match(route, /vercel_semantic_config_normalization_v2/);
assert.match(route, /exact_source_bytes/);
assert.match(route, /stat\.isSymbolicLink\(\)/);
assert.match(route, /BUILD_SOURCE_ARTIFACT_MAX_BYTES/);
assert.match(route, /`\$\{JSON\.stringify\(parsed\)\}\\n` !== bytes\.toString/);
assert.match(
  nextConfig,
  /"\/api\/internal\/release-identity"\s*:\s*\[\s*"\.\/public\/\.well-known\/dealflow-hosted-build-identity\.json"/,
);
const getHandler = route.slice(route.indexOf("export async function GET"));
assert.ok(
  getHandler.indexOf("assertInternalSystemRequest(request)") <
    getHandler.indexOf("readExactBuildSourceIdentity(release)"),
  "internal authorization must run before the build artifact is read",
);
assert.ok(
  getHandler.indexOf("assertHostedReleaseIdentityAuthority()") <
    getHandler.indexOf("readExactBuildSourceIdentity(release)"),
  "exact host and project authority must run before the build artifact is read",
);

const completedBuildMarker = join(root, ".next", "BUILD_ID");
let postBuildTraceChecked = false;
if (existsSync(completedBuildMarker)) {
  const routeTracePath = join(
    root,
    ".next",
    "server",
    "app",
    "api",
    "internal",
    "release-identity",
    "route.js.nft.json",
  );
  assert.ok(
    existsSync(routeTracePath),
    "completed Next build is missing the release-identity route trace",
  );
  const routeTrace = JSON.parse(readFileSync(routeTracePath, "utf8"));
  assert.ok(Array.isArray(routeTrace.files));
  const tracedArtifactPath = join(
    root,
    "public",
    ".well-known",
    "dealflow-hosted-build-identity.json",
  );
  assert.ok(
    routeTrace.files.some(
      (file) =>
        typeof file === "string" &&
        resolve(dirname(routeTracePath), file) === tracedArtifactPath,
    ),
    "completed Next build did not trace the generated identity into the authenticated route",
  );
  postBuildTraceChecked = true;
}
assert.match(runner, /proveHostedBuildReleaseIdentity/);
assert.match(runner, /redirect: "manual"/);
assert.match(runner, /response\.url !== endpoint\.href/);
assert.match(runner, /runtimeGitMetadataTrustedAsArtifactProof: false/);
assert.match(runner, /hostedBuildIdentity\.status === "PASS" \? "PASS" : "FAIL"/);
assert.match(runner, /buildGeneratedSourcePortfolioMatched: true/);
assert.match(runner, /payload\.buildSource/);
assert.match(runner, /assertExactHostedBuildSourceIdentity/);
assert.match(runner, /authenticated_release_identity_payload/);
assert.match(runner, /buildSourceEmbeddedInReleaseIdentityResponse: true/);
assert.doesNotMatch(
  runner,
  /new URL\(\s*["']\/\.well-known\/dealflow-hosted-build-identity\.json["']/,
);

const verifierRelease = Object.freeze({
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
const validBuildSource = () => ({
  schemaVersion: "dealflow.hosted-build-source-identity.v1",
  status: "HOSTED_SOURCE_VERIFIED",
  generatedInsideBuild: true,
  manifestSha256: verifierRelease.deployableManifestSha256,
  deployableSourceSha256: verifierRelease.deployableSourceSha256,
  deployableFileCount: verifierRelease.deployableFileCount,
  release: { ...verifierRelease },
  targetClassification: "exact_staging",
  expectedIdentityMatched: true,
  deployablePathSetVerified: true,
  predeployPathSetProofBound: true,
  vercelConfigurationNormalization: {
    status: "PASS",
    transformation: "exact_source_bytes",
  },
  vercelDryRunSourceSha256: verifierRelease.vercelDryRunSourceSha256,
  vercelDryRunFileCount: verifierRelease.vercelDryRunFileCount,
});
assert.equal(
  assertExactHostedBuildSourceIdentity({
    buildSource: validBuildSource(),
    expectedRelease: verifierRelease,
  }).status,
  "HOSTED_SOURCE_VERIFIED",
);
const canonicalNormalizationBuildSource = validBuildSource();
canonicalNormalizationBuildSource.vercelConfigurationNormalization = {
  status: "PASS",
  transformation: "vercel_semantic_config_normalization_v2",
  injectedProjectNameMatched: true,
  injectedVersion: 2,
  hostedBytesSha256: "2".repeat(64),
  recoveredSourceSha256: "3".repeat(64),
};
assert.equal(
  assertExactHostedBuildSourceIdentity({
    buildSource: canonicalNormalizationBuildSource,
    expectedRelease: verifierRelease,
  }).vercelConfigurationNormalization.transformation,
  "vercel_semantic_config_normalization_v2",
);

for (const mutate of [
  (value) => Object.assign(value, { unexpected: true }),
  (value) => {
    value.targetClassification = "generic_non_release";
  },
  (value) => {
    value.release.unexpected = true;
  },
  (value) => {
    value.release.tree = "9".repeat(40);
  },
  (value) => {
    value.vercelConfigurationNormalization.transformation = "untrusted";
  },
  (value) => {
    value.vercelConfigurationNormalization.unexpected = true;
  },
  (value) => {
    value.vercelConfigurationNormalization = {
      status: "PASS",
      transformation: "vercel_semantic_config_normalization_v2",
      injectedProjectNameMatched: false,
      injectedVersion: 2,
      hostedBytesSha256: "2".repeat(64),
      recoveredSourceSha256: "3".repeat(64),
    };
  },
]) {
  const candidate = validBuildSource();
  mutate(candidate);
  assert.throws(
    () =>
      assertExactHostedBuildSourceIdentity({
        buildSource: candidate,
        expectedRelease: verifierRelease,
      }),
    /does not match the exact external verifier contract/,
  );
}

for (const scenario of [
  "authorized",
  "authorized_vercel_normalization",
  "production",
  "production_missing_artifact",
  "unattested_host",
  "wrong_supabase",
  "wrong_supabase_missing_artifact",
  "incomplete_build",
  "unauthorized_missing_artifact",
  "missing_artifact",
  "malformed_artifact",
  "noncanonical_artifact",
  "symlink_artifact",
  "wrong_artifact_schema",
  "unverified_artifact",
  "wrong_artifact_target",
  "mismatched_artifact_release",
  "mismatched_artifact_digest",
  "extra_artifact_field",
  "extra_artifact_release_field",
  "bad_normalization_status",
  "bad_normalization_shape",
  "bad_vercel_normalization",
]) {
  const result = spawnSync(process.execPath, [tsxCli, scenarioPath, scenario], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? "/private/tmp",
      DEALFLOW_TEST_CANONICAL_STAGING_PROJECT_ID: canonicalStagingProjectId,
    },
  });
  assert.equal(
    result.status,
    0,
    `release identity scenario ${scenario} failed:\n${result.stderr}\n${result.stdout}`,
  );
  assert.match(result.stdout, new RegExp(`scenario ${scenario}: PASS`));
}

console.log(
  `hosted release identity contract: PASS (authenticated schema-v2 response embeds the exact build-generated source identity; traced artifact is canonical, regular, bounded, and correlated to release identity; post-build trace ${postBuildTraceChecked ? "checked" : "deferred until build"}; exact-bytes and Vercel-normalized builds accepted; unauthorized, production, unattested-host, wrong-project, incomplete, missing, malformed, noncanonical, symlinked, mismatched, extra-field, and invalid-normalization cases fail closed; unique and alias no-redirect proof required)`,
);
