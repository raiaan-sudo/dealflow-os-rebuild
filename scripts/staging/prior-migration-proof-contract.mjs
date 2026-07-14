const APPLICATION_ARTIFACTS = Object.freeze([
  "evidence-manifest.json",
  "evidence-manifest.pre-mutation.json",
  "staging-broker-preflight.json",
  "staging-migration-proof.json",
  "staging-migration-summary.json",
  "staging-migration-summary.pre-mutation.json",
  "staging-mutation-started.json",
  "staging-mutation-status.json",
  "staging-remote-read-started.json",
]);

const READ_ONLY_EXACT_ARTIFACTS = Object.freeze([
  "evidence-manifest.json",
  "evidence-manifest.pre-mutation.json",
  "staging-broker-preflight.json",
  "staging-migration-proof.json",
  "staging-migration-summary.json",
  "staging-migration-summary.pre-mutation.json",
  "staging-remote-read-started.json",
]);

const APPLICATION_REMOTE_STATES = new Set([
  "EXACT_COMMITTED_PORTFOLIO",
  "EXACT_FORWARD_COMMITTED_PORTFOLIO",
]);

function hasExactNames(actualNames, expectedNames) {
  if (!Array.isArray(actualNames) || actualNames.length !== expectedNames.length) return false;
  const expected = new Set(expectedNames);
  return actualNames.every((name) => expected.has(name));
}

function assertBaseEvidence(manifest, proof, summary, expectedMigrationCount) {
  if (
    manifest?.schemaVersion !== "dealflow.staging-evidence-manifest.v1" ||
    manifest.status !== "PASS" ||
    proof?.schemaVersion !== "dealflow.isolated-staging-migration-proof.v1" ||
    proof.status !== "PASS" ||
    summary?.schemaVersion !== "dealflow.staging-migration-summary.v1" ||
    summary.status !== "PASS" ||
    proof.migrationCount !== expectedMigrationCount ||
    summary.migrationCount !== expectedMigrationCount ||
    proof.migrationHistoryCount !== expectedMigrationCount ||
    summary.migrationHistoryCount !== expectedMigrationCount
  ) {
    throw new Error("Prior migration proof base identity is not an exact successful portfolio");
  }
}

export function classifyPriorMigrationEvidence({
  actualNames,
  manifest,
  proof,
  summary,
  expectedMigrationCount,
  requireApplicationEvidence = false,
}) {
  if (!Number.isSafeInteger(expectedMigrationCount) || expectedMigrationCount <= 0) {
    throw new Error("Prior migration proof expected count is invalid");
  }
  const applicationShape = hasExactNames(actualNames, APPLICATION_ARTIFACTS);
  const readOnlyShape = hasExactNames(actualNames, READ_ONLY_EXACT_ARTIFACTS);
  if (!applicationShape && !readOnlyShape) {
    throw new Error("Prior migration proof directory does not contain an exact supported sealed artifact set");
  }
  assertBaseEvidence(manifest, proof, summary, expectedMigrationCount);

  if (applicationShape) {
    if (
      manifest.remoteMutationCompleted !== true ||
      (manifest.remoteMutationStarted != null && manifest.remoteMutationStarted !== true) ||
      summary.remoteMutationStarted !== true ||
      summary.remoteMutationCompleted !== true ||
      (proof.remoteMutationStarted != null && proof.remoteMutationStarted !== true) ||
      (proof.remoteMutationCompleted != null && proof.remoteMutationCompleted !== true) ||
      !APPLICATION_REMOTE_STATES.has(proof.remoteStateVerification?.status) ||
      !APPLICATION_REMOTE_STATES.has(summary.remoteStateVerificationStatus) ||
      proof.remoteStateVerification?.exactCommittedPortfolioState !== true
    ) {
      throw new Error("Prior migration application proof has inconsistent mutation or remote-state truth");
    }
    return Object.freeze({
      evidenceKind: "application",
      requiredNames: APPLICATION_ARTIFACTS,
      evidenceRemoteMutationStarted: true,
      evidenceRemoteMutationCompleted: true,
      portfolioApplicationRemoteMutationCompleted: true,
    });
  }

  if (requireApplicationEvidence) {
    throw new Error("Pinned forward mode requires an exact mutation-complete application proof");
  }
  if (
    manifest.migrationMode !== "VERIFY_EXISTING_EXACT" ||
    manifest.verificationReadOnly !== true ||
    manifest.remoteMutationStarted !== false ||
    manifest.remoteMutationCompleted !== false ||
    manifest.portfolioApplicationRemoteMutationCompleted !== true ||
    proof.migrationMode !== "VERIFY_EXISTING_EXACT" ||
    proof.verificationReadOnly !== true ||
    proof.remoteMutationStarted !== false ||
    proof.remoteMutationCompleted !== false ||
    proof.portfolioApplicationRemoteMutationCompleted !== true ||
    summary.migrationMode !== "VERIFY_EXISTING_EXACT" ||
    summary.verificationReadOnly !== true ||
    summary.remoteMutationStarted !== false ||
    summary.remoteMutationCompleted !== false ||
    summary.portfolioApplicationRemoteMutationCompleted !== true ||
    proof.remoteStateVerification?.status !== "EXACT_EXISTING_COMMITTED_PORTFOLIO" ||
    proof.remoteStateVerification?.readOnly !== true ||
    proof.remoteStateVerification?.exactMigrationHistory !== true ||
    proof.remoteStateVerification?.exactStructuralCatalog !== true ||
    proof.remoteStateVerification?.exactNormalizedSchema !== true ||
    summary.remoteStateVerificationStatus !== "EXACT_EXISTING_COMMITTED_PORTFOLIO"
  ) {
    throw new Error("Prior read-only proof has inconsistent exact-resume or mutation truth");
  }
  return Object.freeze({
    evidenceKind: "read_only_exact_verification",
    requiredNames: READ_ONLY_EXACT_ARTIFACTS,
    evidenceRemoteMutationStarted: false,
    evidenceRemoteMutationCompleted: false,
    portfolioApplicationRemoteMutationCompleted: true,
  });
}

export function isExactCurrentResumeIdentity({
  priorApplication,
  expectedMigrationCount,
  expectedFinalVersion,
  expectedMigrationPortfolioSha256,
  expectedMigrationFiles,
  expectedNormalizedSchemaSha256,
}) {
  const hex40 = /^[a-f0-9]{40}$/;
  const hex64 = /^[a-f0-9]{64}$/;
  return Boolean(
    priorApplication &&
    ["application", "read_only_exact_verification"].includes(priorApplication.evidenceKind) &&
    hex40.test(priorApplication.applicationCommit ?? "") &&
    hex40.test(priorApplication.applicationTree ?? "") &&
    hex64.test(priorApplication.manifestSha256 ?? "") &&
    hex64.test(priorApplication.proofSha256 ?? "") &&
    hex64.test(priorApplication.summarySha256 ?? "") &&
    hex64.test(priorApplication.structuralCatalogSha256 ?? "") &&
    priorApplication.migrationCount === expectedMigrationCount &&
    priorApplication.lastCommittedVersion === expectedFinalVersion &&
    priorApplication.migrationPortfolioSha256 === expectedMigrationPortfolioSha256 &&
    priorApplication.normalizedSchemaSha256 === expectedNormalizedSchemaSha256 &&
    priorApplication.singleOuterTransaction === true &&
    priorApplication.migrationHistoryReceiptsInsideOuterTransaction === true &&
    priorApplication.portfolioApplicationRemoteMutationCompleted === true &&
    Array.isArray(priorApplication.migrationFiles) &&
    JSON.stringify(priorApplication.migrationFiles) === JSON.stringify(expectedMigrationFiles)
  );
}

export const PRIOR_MIGRATION_APPLICATION_ARTIFACTS = APPLICATION_ARTIFACTS;
export const PRIOR_MIGRATION_READ_ONLY_EXACT_ARTIFACTS = READ_ONLY_EXACT_ARTIFACTS;
