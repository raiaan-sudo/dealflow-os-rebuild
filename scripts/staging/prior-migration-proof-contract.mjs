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

// This shape exists only for the one forward-103 run whose transaction was
// explicitly committed before the original broker's ACL readback query failed.
// It is intentionally not a general-purpose failed-run resume contract.
const COMMITTED_FORWARD_RECOVERY_ARTIFACTS = Object.freeze([
  "evidence-manifest.json",
  "evidence-manifest.pre-mutation.json",
  "staging-broker-preflight.json",
  "staging-migration-failure.json",
  "staging-migration-summary.json",
  "staging-migration-summary.pre-mutation.json",
  "staging-mutation-started.json",
  "staging-mutation-status.json",
  "staging-remote-read-started.json",
]);

const COMMITTED_FORWARD_RECOVERY_SEAL = Object.freeze({
  applicationCommit: "2546b7c44116e0920534ef58f649acd9c037c586",
  applicationTree: "9c404170b7a5a4708d4685a6c22f540894eabf2e",
  manifestSha256: "cc3e8c91f0f95a61b4b2f8e0c113367781e80bdf01ccf3a727a64cf664b2b6c7",
  summarySha256: "a041b76bb744dbd35e7915bc0cf8f9fe03f4e2285eccae0586b9fb4ef17b819d",
  mutationStatusSha256: "eb9f256667f1228b4d2465eff47fc9ceeb0b6f0b189d094cdd5150b931a8ee90",
  failureSha256: "a164142a34eba81827a7b9c9483535b994f51c6c61f390b14174a7b1215070b8",
  brokerSourceSha256: "5f8bbd5fb01d462b3c323517310620d467aa70615747b2b0a05383b5df7fb11e",
  migrationPortfolioSha256: "066dacae58f0987a281bff1f8b21cfaaa2a1cebe49e797a0f764f88d21be74ca",
  postStructuralCatalogSha256: "6e638308fac2144c019934361831685c5a43cb77155e9882d10a9d650fd3058e",
  postNormalizedSchemaSha256: "081c495390be502caba2a66fc0091d788652672578bcb1dd02fd33321d5b5aee",
});

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

export function isExactCommittedForwardRecoverySeal(candidate) {
  return Boolean(
    candidate &&
    Object.entries(COMMITTED_FORWARD_RECOVERY_SEAL).every(
      ([field, expected]) => candidate[field] === expected,
    )
  );
}

export function classifyPriorMigrationEvidence({
  actualNames,
  manifest,
  proof,
  summary,
  failure = null,
  mutationStatus = null,
  expectedMigrationCount,
  expectedFinalVersion = null,
  requireApplicationEvidence = false,
}) {
  if (!Number.isSafeInteger(expectedMigrationCount) || expectedMigrationCount <= 0) {
    throw new Error("Prior migration proof expected count is invalid");
  }
  const applicationShape = hasExactNames(actualNames, APPLICATION_ARTIFACTS);
  const readOnlyShape = hasExactNames(actualNames, READ_ONLY_EXACT_ARTIFACTS);
  const committedForwardRecoveryShape = hasExactNames(
    actualNames,
    COMMITTED_FORWARD_RECOVERY_ARTIFACTS,
  );
  if (!applicationShape && !readOnlyShape && !committedForwardRecoveryShape) {
    throw new Error("Prior migration proof directory does not contain an exact supported sealed artifact set");
  }

  if (committedForwardRecoveryShape) {
    if (requireApplicationEvidence) {
      throw new Error("Pinned forward mode requires an exact mutation-complete application proof");
    }
    if (!/^\d{14}$/.test(expectedFinalVersion ?? "")) {
      throw new Error("Committed-forward recovery requires the exact final migration version");
    }
    const expectedStatus = "FAILED_AFTER_FORWARD_103_COMMIT";
    const expectedFailureCode = "retention_table_or_column_acl_not_hardened";
    const hex64 = /^[a-f0-9]{64}$/;
    if (
      manifest?.schemaVersion !== "dealflow.staging-evidence-manifest.v1" ||
      manifest.status !== expectedStatus ||
      manifest.migrationMode !== "APPLY_FORWARD_EXACT" ||
      manifest.remoteMutationStarted !== true ||
      manifest.remoteMutationCompleted !== true ||
      summary?.schemaVersion !== "dealflow.staging-migration-summary.v1" ||
      summary.status !== expectedStatus ||
      summary.failureCode !== expectedFailureCode ||
      summary.migrationMode !== "APPLY_FORWARD_EXACT" ||
      summary.forwardOnly !== true ||
      summary.remoteMutationStarted !== true ||
      summary.remoteMutationCompleted !== true ||
      summary.singleOuterTransaction !== true ||
      summary.migrationHistoryReceiptsInsideOuterTransaction !== true ||
      summary.migrationCount !== expectedMigrationCount ||
      summary.priorMigrationCount !== expectedMigrationCount - 1 ||
      summary.forwardMigrationCount !== 1 ||
      summary.forwardMigration?.version !== expectedFinalVersion ||
      summary.lastAttemptedVersion !== expectedFinalVersion ||
      summary.lastAppliedVersion !== expectedFinalVersion ||
      summary.lastCommittedVersion !== expectedFinalVersion ||
      failure?.schemaVersion !== "dealflow.isolated-staging-migration-failure.v1" ||
      failure.status !== expectedStatus ||
      failure.failureCode !== expectedFailureCode ||
      failure.migrationMode !== "APPLY_FORWARD_EXACT" ||
      failure.forwardOnly !== true ||
      failure.remoteMutationStarted !== true ||
      failure.remoteMutationCompleted !== true ||
      failure.migrationCount !== expectedMigrationCount ||
      mutationStatus?.schemaVersion !== "dealflow.staging-mutation-status.v1" ||
      mutationStatus.status !== expectedStatus ||
      mutationStatus.failureCode !== expectedFailureCode ||
      mutationStatus.migrationMode !== "APPLY_FORWARD_EXACT" ||
      mutationStatus.forwardOnly !== true ||
      mutationStatus.remoteMutationStarted !== true ||
      mutationStatus.remoteMutationCompleted !== true ||
      mutationStatus.singleOuterTransaction !== true ||
      mutationStatus.migrationHistoryReceiptsInsideOuterTransaction !== true ||
      mutationStatus.transactionCommitMarkerSeen !== true ||
      mutationStatus.attemptedCount !== 1 ||
      mutationStatus.appliedInTransactionCount !== 1 ||
      mutationStatus.processExitStatus !== 0 ||
      mutationStatus.processSignal !== null ||
      mutationStatus.processError !== false ||
      mutationStatus.processErrorCode !== null ||
      mutationStatus.databaseSqlstate !== null ||
      mutationStatus.lastAttemptedVersion !== expectedFinalVersion ||
      mutationStatus.lastAppliedVersion !== expectedFinalVersion ||
      mutationStatus.lastCommittedVersion !== expectedFinalVersion ||
      mutationStatus.migrationCount !== expectedMigrationCount ||
      mutationStatus.priorMigrationCount !== expectedMigrationCount - 1 ||
      mutationStatus.forwardMigrationCount !== 1 ||
      mutationStatus.forwardMigration?.version !== expectedFinalVersion ||
      !hex64.test(mutationStatus.preflightStructuralCatalogSha256 ?? "") ||
      !hex64.test(mutationStatus.preflightNormalizedSchemaSha256 ?? "") ||
      !hex64.test(mutationStatus.postStructuralCatalogSha256 ?? "") ||
      !hex64.test(mutationStatus.postNormalizedSchemaSha256 ?? "")
    ) {
      throw new Error(
        "Prior committed-forward recovery proof is not the exact sealed post-commit ACL-readback failure",
      );
    }
    return Object.freeze({
      evidenceKind: "committed_forward_recovery",
      requiredNames: COMMITTED_FORWARD_RECOVERY_ARTIFACTS,
      evidenceRemoteMutationStarted: true,
      evidenceRemoteMutationCompleted: true,
      portfolioApplicationRemoteMutationCompleted: true,
    });
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
    [
      "application",
      "read_only_exact_verification",
      "committed_forward_recovery",
    ].includes(priorApplication.evidenceKind) &&
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
export const PRIOR_MIGRATION_COMMITTED_FORWARD_RECOVERY_ARTIFACTS =
  COMMITTED_FORWARD_RECOVERY_ARTIFACTS;
