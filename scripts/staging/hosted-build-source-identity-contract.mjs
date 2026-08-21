const BUILD_SOURCE_SCHEMA = "dealflow.hosted-build-source-identity.v1";

const RELEASE_KEYS = Object.freeze([
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
]);

const BUILD_SOURCE_KEYS = Object.freeze([
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
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  return (
    isRecord(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expectedKeys].sort())
  );
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function exactReleaseMatches(value, expected) {
  if (
    !hasExactKeys(value, RELEASE_KEYS) ||
    !hasExactKeys(expected, RELEASE_KEYS)
  ) {
    return false;
  }
  return RELEASE_KEYS.every((key) => value[key] === expected[key]);
}

function exactNormalization(value) {
  if (!isRecord(value) || value.status !== "PASS") return false;
  if (value.transformation === "exact_source_bytes") {
    return hasExactKeys(value, ["status", "transformation"]);
  }
  return (
    value.transformation === "vercel_semantic_config_normalization_v2" &&
    hasExactKeys(value, [
      "status",
      "transformation",
      "injectedProjectNamePresent",
      "injectedProjectNameMatched",
      "injectedVersion",
      "hostedBytesSha256",
      "recoveredSourceSha256",
    ]) &&
    typeof value.injectedProjectNamePresent === "boolean" &&
    value.injectedProjectNameMatched === true &&
    value.injectedVersion === 2 &&
    isSha256(value.hostedBytesSha256) &&
    isSha256(value.recoveredSourceSha256)
  );
}

export function assertExactHostedBuildSourceIdentity({
  buildSource,
  expectedRelease,
}) {
  if (
    !hasExactKeys(expectedRelease, RELEASE_KEYS) ||
    !hasExactKeys(buildSource, BUILD_SOURCE_KEYS) ||
    buildSource.schemaVersion !== BUILD_SOURCE_SCHEMA ||
    buildSource.status !== "HOSTED_SOURCE_VERIFIED" ||
    buildSource.generatedInsideBuild !== true ||
    buildSource.targetClassification !== "exact_staging" ||
    buildSource.expectedIdentityMatched !== true ||
    buildSource.deployablePathSetVerified !== true ||
    buildSource.predeployPathSetProofBound !== true ||
    !isSha256(buildSource.manifestSha256) ||
    buildSource.manifestSha256 !== expectedRelease.deployableManifestSha256 ||
    !isSha256(buildSource.deployableSourceSha256) ||
    buildSource.deployableSourceSha256 !==
      expectedRelease.deployableSourceSha256 ||
    !Number.isSafeInteger(buildSource.deployableFileCount) ||
    buildSource.deployableFileCount !== expectedRelease.deployableFileCount ||
    !isSha256(buildSource.vercelDryRunSourceSha256) ||
    buildSource.vercelDryRunSourceSha256 !==
      expectedRelease.vercelDryRunSourceSha256 ||
    !Number.isSafeInteger(buildSource.vercelDryRunFileCount) ||
    buildSource.vercelDryRunFileCount !==
      expectedRelease.vercelDryRunFileCount ||
    !exactReleaseMatches(buildSource.release, expectedRelease) ||
    !exactNormalization(buildSource.vercelConfigurationNormalization)
  ) {
    throw new Error(
      "Hosted build source identity does not match the exact external verifier contract",
    );
  }
  return buildSource;
}
