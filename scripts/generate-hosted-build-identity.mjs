#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { assertExactDeployableSourcePathSet } from "./staging/deployable-source-path-set-contract.mjs";

const SCHEMA = "dealflow.deployable-source-manifest.v1";
const ARTIFACT_SCHEMA = "dealflow.hosted-build-source-identity.v1";
const MANIFEST_RELATIVE_PATH = "config/release/deployable-source-manifest.json";
const ARTIFACT_RELATIVE_PATH =
  "public/.well-known/dealflow-hosted-build-identity.json";
const STAGING_HOST_ATTESTATION =
  "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1";
const PRODUCTION_HOST_ATTESTATION =
  "DEALFLOW_PRODUCTION_VERCEL_PROJECT_EXACT_V1";
const PRODUCTION_PROJECT_NAME = "dealflow-os-rebuild";
const PRODUCTION_PROJECT_ID_SHA256 =
  "953855c9a0ab60a58f966cfd7a212e2a6a3db722a589468a6934b79fc265e8b9";
const STAGING_PROJECT_NAME = "dealflow-os-rebuild-selfserve-clean";
const STAGING_PROJECT_ID_SHA256 =
  "d0fa02eaf7e533f2a17a0b87c039c6a1686e5467840d2b8c2f2dca2758d95fde";
const VERCEL_DEFAULT_IGNORED_TRACKED_PATHS = new Set([".gitignore"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertSafeRelativePath(path) {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.startsWith("/") ||
    path === ".." ||
    path.startsWith(`..${sep}`) ||
    path.includes("\\") ||
    path.split("/").includes("..")
  ) {
    throw new Error("Deployable source manifest contains an unsafe path");
  }
  return path;
}

function readExactRegularFile(root, path) {
  assertSafeRelativePath(path);
  const realRoot = realpathSync(root);
  const absolute = resolve(realRoot, path);
  const rootPrefix = `${realRoot}${sep}`;
  if (!absolute.startsWith(rootPrefix)) {
    throw new Error(`Deployable source path escapes the repository: ${path}`);
  }
  if (!existsSync(absolute)) {
    throw new Error(`Deployable source file is missing: ${path}`);
  }
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Deployable source must be a regular file: ${path}`);
  }
  if (!realpathSync(absolute).startsWith(rootPrefix)) {
    throw new Error(`Deployable source resolves outside the repository: ${path}`);
  }
  return { contents: readFileSync(absolute), size: stat.size, mode: stat.mode };
}

function recoverVercelNormalizedConfiguration(entry, file, target) {
  // Vercel parses and may compact the uploaded configuration before the hosted
  // build starts. Depending on the deployment path it may also append its
  // project name and `version: 2`. Recover the tracked canonical bytes only
  // when the remaining semantic configuration still matches the sealed
  // manifest exactly.
  if (entry.path !== "vercel.json" || target?.hosted !== true) return null;
  if (entry.mode !== file.mode) return null;

  let configuration;
  try {
    configuration = JSON.parse(file.contents.toString("utf8"));
  } catch {
    return null;
  }
  if (
    !configuration ||
    Array.isArray(configuration) ||
    typeof configuration !== "object" ||
    (configuration.version != null && configuration.version !== 2) ||
    (target.kind !== "generic_non_release" && configuration.version !== 2) ||
    (configuration.name != null &&
      (typeof configuration.name !== "string" ||
        !/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(configuration.name))) ||
    (target.kind === "exact_staging" &&
      configuration.name !== STAGING_PROJECT_NAME) ||
    (target.kind === "exact_production" &&
      configuration.name !== PRODUCTION_PROJECT_NAME)
  ) {
    return null;
  }
  // Vercel's hosted normalization is an implementation detail: it may move
  // the injected `name` and `version` keys or change insignificant JSON
  // whitespace. Bind the recovered tracked bytes to the sealed manifest
  // instead of binding release admission to that incidental serialization.
  // Unknown keys, changed values, reordered tracked keys, mode drift, or a
  // different source file still fail the exact size/hash checks below.
  const originalConfiguration = { ...configuration };
  delete originalConfiguration.name;
  delete originalConfiguration.version;
  const recoveredSourceBytes = Buffer.from(
    `${JSON.stringify(originalConfiguration, null, 2)}\n`,
  );
  if (
    entry.size !== recoveredSourceBytes.length ||
    entry.sha256 !== sha256(recoveredSourceBytes)
  ) {
    return null;
  }
  return {
    recoveredSourceBytes,
    evidence: {
      status: "PASS",
      transformation: "vercel_semantic_config_normalization_v2",
      injectedProjectNameMatched:
        (target.kind !== "exact_staging" ||
          configuration.name === STAGING_PROJECT_NAME) &&
        (target.kind !== "exact_production" ||
          configuration.name === PRODUCTION_PROJECT_NAME),
      injectedVersion: configuration.version ?? null,
      hostedBytesSha256: sha256(file.contents),
      recoveredSourceSha256: sha256(recoveredSourceBytes),
    },
  };
}

function portfolioDigest(
  entries,
  root,
  { verifyDeclared = true, target = { hosted: false, kind: "local" } } = {},
) {
  const digest = createHash("sha256");
  let previous = "";
  const normalized = [];
  let vercelConfigurationNormalization = null;
  for (const entry of entries) {
    const path = assertSafeRelativePath(entry?.path);
    if (path <= previous) {
      throw new Error("Deployable source manifest paths must be unique and sorted");
    }
    previous = path;
    const file = readExactRegularFile(root, path);
    let sourceBytes = file.contents;
    let fileSha256 = sha256(sourceBytes);
    if (
      verifyDeclared &&
      (entry.size !== file.size ||
        entry.mode !== file.mode ||
        entry.sha256 !== fileSha256)
    ) {
      const recovered = recoverVercelNormalizedConfiguration(entry, file, target);
      if (!recovered) {
        throw new Error(`Deployable source file does not match its manifest: ${path}`);
      }
      sourceBytes = recovered.recoveredSourceBytes;
      fileSha256 = sha256(sourceBytes);
      vercelConfigurationNormalization = recovered.evidence;
    }
    digest.update(`${path.length}\0${path}\0${sourceBytes.length}\0`);
    digest.update(sourceBytes);
    digest.update("\0");
    normalized.push({
      path,
      size: sourceBytes.length,
      mode: file.mode,
      sha256: fileSha256,
    });
  }
  return {
    entries: normalized,
    deployableSourceSha256: digest.digest("hex"),
    vercelConfigurationNormalization,
  };
}

function gitNullList(root, args, label) {
  const result = spawnSync("/usr/bin/git", args, {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed`);
  }
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function canonicalTrackedDeployablePaths(root) {
  const tracked = gitNullList(
    root,
    ["ls-files", "-z"],
    "Tracked source enumeration",
  );
  const ignored = new Set(
    gitNullList(
      root,
      ["ls-files", "-ci", "--exclude-from=.vercelignore", "-z"],
      "Vercel ignore enumeration",
    ),
  );
  return tracked
    .filter(
      (path) => !ignored.has(path) && path !== MANIFEST_RELATIVE_PATH,
    )
    .filter(
      (path) => !VERCEL_DEFAULT_IGNORED_TRACKED_PATHS.has(path),
    )
    .sort();
}

function writeManifest(root) {
  const paths = canonicalTrackedDeployablePaths(root);
  const portfolio = portfolioDigest(
    paths.map((path) => ({ path })),
    root,
    { verifyDeclared: false },
  );
  const manifest = {
    schemaVersion: SCHEMA,
    generatedFrom: "git_tracked_files_minus_vercelignore_and_manifest",
    entryCount: portfolio.entries.length,
    deployableSourceSha256: portfolio.deployableSourceSha256,
    entries: portfolio.entries,
  };
  const path = join(root, MANIFEST_RELATIVE_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
  process.stdout.write(
    `deployable source manifest written: ${manifest.entryCount} files ${manifest.deployableSourceSha256}\n`,
  );
}

function requiredHostedValue(name, pattern) {
  const value = process.env[name]?.trim() ?? "";
  if (!pattern.test(value)) {
    throw new Error(`Hosted build requires exact ${name}`);
  }
  return value;
}

function normalizedEnvironmentValue(name) {
  return process.env[name]?.trim() ?? "";
}

function exactProjectBinding(expectedProjectName, attestationName, attestation) {
  const actualProjectId = normalizedEnvironmentValue("VERCEL_PROJECT_ID");
  const expectedProjectId = normalizedEnvironmentValue(expectedProjectName);
  return Boolean(
    actualProjectId &&
      expectedProjectId &&
      actualProjectId === expectedProjectId &&
      normalizedEnvironmentValue(attestationName) === attestation,
  );
}

function classifyBuildTarget() {
  const hosted =
    normalizedEnvironmentValue("VERCEL") === "1" ||
    Boolean(normalizedEnvironmentValue("VERCEL_ENV"));
  if (!hosted) return Object.freeze({ hosted: false, kind: "local" });

  const vercelEnvironment = normalizedEnvironmentValue("VERCEL_ENV").toLowerCase();
  const deploymentTarget = normalizedEnvironmentValue(
    "DEALFLOW_DEPLOYMENT_TARGET",
  ).toLowerCase();
  const exactStaging =
    vercelEnvironment === "production" &&
    deploymentTarget === "staging" &&
    exactProjectBinding(
      "DEALFLOW_STAGING_VERCEL_PROJECT_ID",
      "DEALFLOW_STAGING_HOST_ATTESTATION",
      STAGING_HOST_ATTESTATION,
    ) &&
    sha256(normalizedEnvironmentValue("VERCEL_PROJECT_ID")) ===
      STAGING_PROJECT_ID_SHA256;
  const exactProduction =
    vercelEnvironment === "production" &&
    deploymentTarget === "production" &&
    exactProjectBinding(
      "DEALFLOW_PRODUCTION_VERCEL_PROJECT_ID",
      "DEALFLOW_PRODUCTION_HOST_ATTESTATION",
      PRODUCTION_HOST_ATTESTATION,
    ) &&
    sha256(normalizedEnvironmentValue("VERCEL_PROJECT_ID")) ===
      PRODUCTION_PROJECT_ID_SHA256;

  if (vercelEnvironment === "production") {
    if (deploymentTarget === "production") {
      if (!exactProduction) {
        throw new Error(
          "Hosted production build requires the immutable exact DealFlow production project binding and host attestation",
        );
      }
      return Object.freeze({
        hosted: true,
        kind: "exact_production",
      });
    }
    if (!exactStaging) {
      throw new Error(
        "Hosted production build requires the immutable exact DealFlow staging project binding and host attestation",
      );
    }
    return Object.freeze({
      hosted: true,
      kind: "exact_staging",
    });
  }

  const stagingClaimed =
    deploymentTarget === "staging" ||
    Boolean(normalizedEnvironmentValue("DEALFLOW_STAGING_VERCEL_PROJECT_ID")) ||
    Boolean(normalizedEnvironmentValue("DEALFLOW_STAGING_HOST_ATTESTATION"));
  if (stagingClaimed) {
    throw new Error(
      "Hosted staging build is partially or incorrectly attested",
    );
  }

  return Object.freeze({ hosted: true, kind: "generic_non_release" });
}

function exactReleaseIdentity() {
  return {
    commit: requiredHostedValue(
      "NEXT_PUBLIC_DEALFLOW_RELEASE_COMMIT",
      /^[a-f0-9]{40,64}$/,
    ),
    tree: requiredHostedValue(
      "NEXT_PUBLIC_DEALFLOW_RELEASE_TREE",
      /^[a-f0-9]{40,64}$/,
    ),
    trackedWorktreeSha256: requiredHostedValue(
      "NEXT_PUBLIC_DEALFLOW_TRACKED_WORKTREE_SHA256",
      /^[a-f0-9]{64}$/,
    ),
    trackedFileCount: Number(
      requiredHostedValue(
        "NEXT_PUBLIC_DEALFLOW_TRACKED_FILE_COUNT",
        /^[1-9][0-9]*$/,
      ),
    ),
    dependencyLockSha256: requiredHostedValue(
      "NEXT_PUBLIC_DEALFLOW_DEPENDENCY_LOCK_SHA256",
      /^[a-f0-9]{64}$/,
    ),
    deployableSourceSha256: requiredHostedValue(
      "NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_SOURCE_SHA256",
      /^[a-f0-9]{64}$/,
    ),
    deployableManifestSha256: requiredHostedValue(
      "NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_MANIFEST_SHA256",
      /^[a-f0-9]{64}$/,
    ),
    deployableFileCount: Number(
      requiredHostedValue(
        "NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_FILE_COUNT",
        /^[1-9][0-9]*$/,
      ),
    ),
    vercelDryRunSourceSha256: requiredHostedValue(
      "NEXT_PUBLIC_DEALFLOW_VERCEL_DRY_RUN_SOURCE_SHA256",
      /^[a-f0-9]{64}$/,
    ),
    vercelDryRunFileCount: Number(
      requiredHostedValue(
        "NEXT_PUBLIC_DEALFLOW_VERCEL_DRY_RUN_FILE_COUNT",
        /^[1-9][0-9]*$/,
      ),
    ),
  };
}

function verifyAndGenerateArtifact(root) {
  const manifestPath = join(root, MANIFEST_RELATIVE_PATH);
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (
    manifest.schemaVersion !== SCHEMA ||
    !Array.isArray(manifest.entries) ||
    manifest.entryCount !== manifest.entries.length ||
    !/^[a-f0-9]{64}$/.test(manifest.deployableSourceSha256 ?? "")
  ) {
    throw new Error("Deployable source manifest is malformed");
  }
  const target = classifyBuildTarget();
  const portfolio = portfolioDigest(manifest.entries, root, { target });
  if (portfolio.deployableSourceSha256 !== manifest.deployableSourceSha256) {
    throw new Error("Deployable source portfolio digest does not match its manifest");
  }
  const manifestSha256 = sha256(manifestBytes);
  if (!target.hosted) {
    assertExactDeployableSourcePathSet({
      manifestPaths: manifest.entries.map((entry) => entry.path),
      expectedTrackedPaths: canonicalTrackedDeployablePaths(root),
    });
  }
  const exactHostedRelease =
    target.kind === "exact_staging" || target.kind === "exact_production";
  const release = exactHostedRelease ? exactReleaseIdentity() : null;
  if (
    exactHostedRelease &&
    (release.deployableSourceSha256 !== portfolio.deployableSourceSha256 ||
      release.deployableManifestSha256 !== manifestSha256 ||
      release.deployableFileCount !== manifest.entryCount)
  ) {
    throw new Error("Hosted build source portfolio does not match the local release authority");
  }
  const artifact = {
    schemaVersion: ARTIFACT_SCHEMA,
    status: exactHostedRelease
      ? "HOSTED_SOURCE_VERIFIED"
      : target.hosted
        ? "NOT_APPLICABLE_UNVERIFIED"
        : "LOCAL_SOURCE_VERIFIED",
    generatedInsideBuild: true,
    manifestSha256,
    deployableSourceSha256: portfolio.deployableSourceSha256,
    deployableFileCount: manifest.entryCount,
    release,
    targetClassification: target.kind,
    expectedIdentityMatched: exactHostedRelease,
    deployablePathSetVerified: !target.hosted || exactHostedRelease,
    predeployPathSetProofBound: exactHostedRelease,
    vercelConfigurationNormalization:
      portfolio.vercelConfigurationNormalization ?? {
        status: "PASS",
        transformation: "exact_source_bytes",
      },
    vercelDryRunSourceSha256:
      release?.vercelDryRunSourceSha256 ?? null,
    vercelDryRunFileCount: release?.vercelDryRunFileCount ?? null,
  };
  const artifactPath = join(root, ARTIFACT_RELATIVE_PATH);
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(artifact)}\n`, { mode: 0o644 });
  process.stdout.write(
    `hosted build source identity: ${artifact.status} ${artifact.deployableFileCount} files\n`,
  );
}

const rootArgumentIndex = process.argv.indexOf("--root");
const root = rootArgumentIndex >= 0
  ? resolve(process.argv[rootArgumentIndex + 1] ?? "")
  : process.cwd();
if (!existsSync(root) || !lstatSync(root).isDirectory()) {
  throw new Error("Build identity root must be an existing directory");
}
if (process.argv.includes("--write-manifest")) {
  if (realpathSync(root) !== realpathSync(process.cwd())) {
    throw new Error("Manifest writes are allowed only in the current release worktree");
  }
  writeManifest(root);
} else {
  verifyAndGenerateArtifact(root);
}
