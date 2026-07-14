#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const route = readFileSync(
  join(root, "src", "app", "api", "internal", "release-identity", "route.ts"),
  "utf8",
);
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
  "protected external release trust root",
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
assert.match(runner, /proveHostedBuildReleaseIdentity/);
assert.match(runner, /redirect: "manual"/);
assert.match(runner, /response\.url !== endpoint\.href/);
assert.match(runner, /runtimeGitMetadataTrustedAsArtifactProof: false/);
assert.match(runner, /hostedBuildIdentity\.status === "PASS" \? "PASS" : "FAIL"/);
assert.match(runner, /buildGeneratedSourcePortfolioMatched: true/);
assert.match(runner, /dealflow-hosted-build-identity\.json/);

for (const scenario of [
  "authorized",
  "production",
  "unattested_host",
  "wrong_supabase",
  "incomplete_build",
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
  "hosted release identity contract: PASS (build-injected exact source and dependency identity; internal authorization; production, unattested-host, wrong-project, and incomplete-build fail closed; unique and alias no-redirect proof required)",
);
