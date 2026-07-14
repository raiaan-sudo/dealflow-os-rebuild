#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  lstatSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const generator = join(root, "scripts", "generate-hosted-build-identity.mjs");
const fixture = mkdtempSync(join(tmpdir(), "dealflow-build-identity-test-"));
const outsideFixture = mkdtempSync(
  join(tmpdir(), "dealflow-build-identity-outside-test-"),
);
const manifestPath = join(
  fixture,
  "config",
  "release",
  "deployable-source-manifest.json",
);
const artifactPath = join(
  fixture,
  "public",
  ".well-known",
  "dealflow-hosted-build-identity.json",
);
const canonicalStagingProjectId = String(
  JSON.parse(readFileSync(join(root, ".vercel", "project.json"), "utf8"))
    .projectId,
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function portfolio(entries) {
  const digest = createHash("sha256");
  for (const entry of entries) {
    const contents = readFileSync(join(fixture, entry.path));
    digest.update(`${entry.path.length}\0${entry.path}\0${contents.length}\0`);
    digest.update(contents);
    digest.update("\0");
  }
  return digest.digest("hex");
}

function run({ args = [], env = {}, cwd = fixture } = {}) {
  return spawnSync(process.execPath, [generator, "--root", fixture, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? tmpdir(),
      ...env,
    },
  });
}

function git(args) {
  const result = spawnSync("/usr/bin/git", args, {
    cwd: fixture,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

function releaseEnvironment(manifest, manifestSha256) {
  return {
    NEXT_PUBLIC_DEALFLOW_RELEASE_COMMIT: "a".repeat(40),
    NEXT_PUBLIC_DEALFLOW_RELEASE_TREE: "b".repeat(40),
    NEXT_PUBLIC_DEALFLOW_TRACKED_WORKTREE_SHA256: "c".repeat(64),
    NEXT_PUBLIC_DEALFLOW_TRACKED_FILE_COUNT: "5",
    NEXT_PUBLIC_DEALFLOW_DEPENDENCY_LOCK_SHA256: "d".repeat(64),
    NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_SOURCE_SHA256:
      manifest.deployableSourceSha256,
    NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_MANIFEST_SHA256: manifestSha256,
    NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_FILE_COUNT: String(manifest.entryCount),
    NEXT_PUBLIC_DEALFLOW_VERCEL_DRY_RUN_SOURCE_SHA256: "f".repeat(64),
    NEXT_PUBLIC_DEALFLOW_VERCEL_DRY_RUN_FILE_COUNT: String(manifest.entryCount + 1),
  };
}

function exactStagingEnvironment(manifest, manifestSha256) {
  return {
    VERCEL: "1",
    VERCEL_ENV: "production",
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
    VERCEL_PROJECT_ID: canonicalStagingProjectId,
    DEALFLOW_STAGING_VERCEL_PROJECT_ID: canonicalStagingProjectId,
    DEALFLOW_STAGING_HOST_ATTESTATION:
      "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1",
    ...releaseEnvironment(manifest, manifestSha256),
  };
}

function writeManifest(manifest) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

try {
  mkdirSync(join(fixture, "config", "release"), { recursive: true });
  mkdirSync(join(fixture, "src"), { recursive: true });
  writeFileSync(join(fixture, ".vercelignore"), "ignored.txt\n");
  writeFileSync(join(fixture, "ignored.txt"), "tracked but not deployed\n");
  writeFileSync(join(fixture, "package.json"), "{\"name\":\"fixture\"}\n");
  writeFileSync(join(fixture, "src", "app.ts"), "export const exact = true;\n");
  writeFileSync(manifestPath, "{}\n");
  git(["init", "-b", "fixture"]);
  git(["add", "."]);

  const generated = run({ args: ["--write-manifest"] });
  assert.equal(generated.status, 0, `${generated.stderr}\n${generated.stdout}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(
    manifest.generatedFrom,
    "git_tracked_files_minus_vercelignore_and_manifest",
  );
  assert.deepEqual(
    manifest.entries.map((entry) => entry.path),
    [".vercelignore", "package.json", "src/app.ts"],
  );
  const manifestSha256 = sha256(readFileSync(manifestPath));

  const local = run();
  assert.equal(local.status, 0, `${local.stderr}\n${local.stdout}`);
  const localArtifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  assert.equal(localArtifact.status, "LOCAL_SOURCE_VERIFIED");
  assert.equal(localArtifact.targetClassification, "local");
  assert.equal(localArtifact.deployablePathSetVerified, true);
  assert.equal(
    localArtifact.deployableSourceSha256,
    manifest.deployableSourceSha256,
  );

  const staging = run({ env: exactStagingEnvironment(manifest, manifestSha256) });
  assert.equal(staging.status, 0, `${staging.stderr}\n${staging.stdout}`);
  const stagingArtifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  assert.equal(stagingArtifact.status, "HOSTED_SOURCE_VERIFIED");
  assert.equal(stagingArtifact.targetClassification, "exact_staging");
  assert.equal(stagingArtifact.expectedIdentityMatched, true);
  assert.equal(stagingArtifact.deployablePathSetVerified, true);
  assert.equal(stagingArtifact.predeployPathSetProofBound, true);
  assert.equal(stagingArtifact.vercelDryRunSourceSha256, "f".repeat(64));
  assert.equal(stagingArtifact.vercelDryRunFileCount, manifest.entryCount + 1);
  assert.equal(stagingArtifact.manifestSha256, manifestSha256);

  const selfAssertedProduction = run({
    env: {
      VERCEL: "1",
      VERCEL_ENV: "production",
      DEALFLOW_DEPLOYMENT_TARGET: "production",
      VERCEL_PROJECT_ID: "self-asserted-production-project",
      DEALFLOW_PRODUCTION_VERCEL_PROJECT_ID:
        "self-asserted-production-project",
      DEALFLOW_PRODUCTION_HOST_ATTESTATION:
        "DEALFLOW_PRODUCTION_VERCEL_PROJECT_EXACT_V1",
      ...releaseEnvironment(manifest, manifestSha256),
    },
  });
  assert.notEqual(selfAssertedProduction.status, 0);
  assert.match(selfAssertedProduction.stderr, /protected external release trust root/);

  for (const vercelEnvironment of ["preview", "development"]) {
    const generic = run({
      env: { VERCEL: "1", VERCEL_ENV: vercelEnvironment },
    });
    assert.equal(generic.status, 0, `${generic.stderr}\n${generic.stdout}`);
    const genericArtifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    assert.equal(genericArtifact.status, "NOT_APPLICABLE_UNVERIFIED");
    assert.equal(genericArtifact.targetClassification, "generic_non_release");
    assert.equal(genericArtifact.expectedIdentityMatched, false);
    assert.equal(genericArtifact.release, null);
  }

  for (const env of [
    {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      DEALFLOW_DEPLOYMENT_TARGET: "staging",
    },
    {
      VERCEL: "1",
      VERCEL_ENV: "production",
      DEALFLOW_DEPLOYMENT_TARGET: "staging",
      VERCEL_PROJECT_ID: "wrong-project",
      DEALFLOW_STAGING_VERCEL_PROJECT_ID: "wrong-project",
      DEALFLOW_STAGING_HOST_ATTESTATION:
        "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1",
    },
  ]) {
    const partialStaging = run({ env });
    assert.notEqual(partialStaging.status, 0);
    assert.match(
      partialStaging.stderr,
      /partially or incorrectly attested|requires the immutable exact DealFlow staging project binding/,
    );
  }

  const genericProduction = run({
    env: { VERCEL: "1", VERCEL_ENV: "production" },
  });
  assert.notEqual(genericProduction.status, 0);
  assert.match(
    genericProduction.stderr,
    /requires the immutable exact DealFlow staging project binding/,
  );

  const incompleteExactStaging = run({
    env: {
      VERCEL: "1",
      VERCEL_ENV: "production",
      DEALFLOW_DEPLOYMENT_TARGET: "staging",
      VERCEL_PROJECT_ID: canonicalStagingProjectId,
      DEALFLOW_STAGING_VERCEL_PROJECT_ID: canonicalStagingProjectId,
      DEALFLOW_STAGING_HOST_ATTESTATION:
        "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1",
    },
  });
  assert.notEqual(incompleteExactStaging.status, 0);
  assert.match(incompleteExactStaging.stderr, /requires exact NEXT_PUBLIC_DEALFLOW_RELEASE_COMMIT/);

  writeFileSync(join(fixture, "src", "app.ts"), "export const exact = false;\n");
  const tampered = run();
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr, /does not match its manifest/);
  writeFileSync(join(fixture, "src", "app.ts"), "export const exact = true;\n");

  const wrongAuthority = run({
    env: {
      ...exactStagingEnvironment(manifest, manifestSha256),
      NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_SOURCE_SHA256: "e".repeat(64),
    },
  });
  assert.notEqual(wrongAuthority.status, 0);
  assert.match(
    wrongAuthority.stderr,
    /does not match the local release authority/,
  );

  const omittedEntries = manifest.entries.slice(0, -1);
  writeManifest({
    ...manifest,
    entryCount: omittedEntries.length,
    deployableSourceSha256: portfolio(omittedEntries),
    entries: omittedEntries,
  });
  const omitted = run();
  assert.notEqual(omitted.status, 0);
  assert.match(omitted.stderr, /Deployable manifest path set is not exact/);

  writeFileSync(join(fixture, "extra.ts"), "export const extra = true;\n");
  const extraContents = readFileSync(join(fixture, "extra.ts"));
  const extraEntries = [
    manifest.entries[0],
    {
      path: "extra.ts",
      size: extraContents.length,
      mode: lstatSync(join(fixture, "extra.ts")).mode,
      sha256: sha256(extraContents),
    },
    ...manifest.entries.slice(1),
  ];
  writeManifest({
    ...manifest,
    entryCount: extraEntries.length,
    deployableSourceSha256: portfolio(extraEntries),
    entries: extraEntries,
  });
  const extra = run();
  assert.notEqual(extra.status, 0);
  assert.match(extra.stderr, /Deployable manifest path set is not exact/);

  writeFileSync(join(outsideFixture, "escaped.ts"), "export const escaped = true;\n");
  symlinkSync(outsideFixture, join(fixture, "linked-outside"));
  const escapedContents = readFileSync(join(outsideFixture, "escaped.ts"));
  const escapedEntries = [{
    path: "linked-outside/escaped.ts",
    size: escapedContents.length,
    mode: lstatSync(join(outsideFixture, "escaped.ts")).mode,
    sha256: sha256(escapedContents),
  }];
  writeManifest({
    schemaVersion: "dealflow.deployable-source-manifest.v1",
    generatedFrom: "git_tracked_files_minus_vercelignore_and_manifest",
    entryCount: 1,
    deployableSourceSha256: portfolio(escapedEntries),
    entries: escapedEntries,
  });
  const escaped = run();
  assert.notEqual(escaped.status, 0);
  assert.match(escaped.stderr, /resolves outside the repository/);
} finally {
  rmSync(fixture, { recursive: true, force: true });
  rmSync(outsideFixture, { recursive: true, force: true });
}

console.log(
  "hosted build identity generator: PASS (exact Git deployable path set, immutable staging binding, fail-closed production trust, self-matching spoof rejection, generic preview non-regression, tamper/omission/extra/symlink rejection, and predeploy path-proof binding)",
);
