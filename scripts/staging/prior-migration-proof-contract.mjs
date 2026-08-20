import { createHash } from "node:crypto";

const SYNTHETIC_AUTH_FIXTURE_LABEL = "DF-STAGING-20260712";
const LEGACY_SYNTHETIC_AUTH_IDENTITIES = Object.freeze([
  ["dealflow-staging-20260712@example.com", "paid_direct_realtor"],
  ["dealflow-staging-attacker-20260712@example.com", "cross_tenant_attacker"],
  ["dealflow-staging-deletion-20260712@example.com", "account_deletion_fail_closed_realtor"],
  ["dealflow-staging-legacy-20260712@example.com", "grandfathered_legacy_realtor"],
  ["dealflow-staging-new-direct-20260712@example.com", "new_unpaid_direct_realtor"],
  ["dealflow-staging-operator-20260712@example.com", "internal_admin_operator"],
  ["dealflow-staging-partner-admin-20260712@example.com", "active_white_label_partner_admin"],
  ["dealflow-staging-partner-child-20260712@example.com", "white_label_child_realtor"],
  ["dealflow-staging-partner-two-admin-20260712@example.com", "active_white_label_partner_two_admin"],
  ["dealflow-staging-partner-two-child-20260712@example.com", "white_label_partner_two_child_realtor"],
].map(([email, scenario]) => Object.freeze({
  email,
  fixture: SYNTHETIC_AUTH_FIXTURE_LABEL,
  synthetic: true,
  scenario,
})));
const EXPECTED_SYNTHETIC_AUTH_IDENTITIES = Object.freeze([
  ...LEGACY_SYNTHETIC_AUTH_IDENTITIES,
  Object.freeze({
    email: "dealflow-staging-qa-harness-20260712@example.com",
    fixture: SYNTHETIC_AUTH_FIXTURE_LABEL,
    synthetic: true,
    scenario: "non_admin_qa_harness",
  }),
]);
const PRESERVED_GHL_OWNER_AUTHORITY = Object.freeze({
  emailSha256: "1c244c695868765ede7da5b3c9bcae5908edbf2a2bdb73c13cce2829452a8b31",
  fixture: "dealflow-ghl-owner-direct-20260814",
  synthetic: true,
  scenario: "",
});

export const STAGING_AUTH_SURFACE_ALLOWED_USER_COUNTS = Object.freeze([
  0,
  LEGACY_SYNTHETIC_AUTH_IDENTITIES.length,
  EXPECTED_SYNTHETIC_AUTH_IDENTITIES.length,
  EXPECTED_SYNTHETIC_AUTH_IDENTITIES.length + 1,
]);
export const STAGING_AUTH_SURFACE_MAX_USER_COUNT =
  Math.max(...STAGING_AUTH_SURFACE_ALLOWED_USER_COUNTS);

export function isAllowedStagingAuthSurfaceUserCount(value) {
  return Number.isSafeInteger(value) &&
    STAGING_AUTH_SURFACE_ALLOWED_USER_COUNTS.includes(value);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

const EMPTY_AUTH_SURFACE_SHA256 = sha256("[]");
const EXPECTED_SYNTHETIC_AUTH_EMAIL_SET_SHA256 = sha256(
  JSON.stringify(EXPECTED_SYNTHETIC_AUTH_IDENTITIES.map(({ email }) => email)),
);
const EXPECTED_SYNTHETIC_AUTH_IDENTITY_SET_SHA256 = sha256(
  JSON.stringify(EXPECTED_SYNTHETIC_AUTH_IDENTITIES),
);
const LEGACY_SYNTHETIC_AUTH_EMAIL_SET_SHA256 = sha256(
  JSON.stringify(LEGACY_SYNTHETIC_AUTH_IDENTITIES.map(({ email }) => email)),
);
const LEGACY_SYNTHETIC_AUTH_IDENTITY_SET_SHA256 = sha256(
  JSON.stringify(LEGACY_SYNTHETIC_AUTH_IDENTITIES),
);
const EXPECTED_PRESERVED_GHL_OWNER_AUTH_EMAIL_SET_SHA256 =
  "02b20dfa3826acc8ddb9cccfea64c5293267ce21777b66aac65677e5bf98c901";
const EXPECTED_PRESERVED_GHL_OWNER_AUTH_IDENTITY_SET_SHA256 =
  "38e7ad39d5b6c14aa1c71bbed8f4edc7868b6edf39adb8b33d9edd07b23f6f34";

export function classifyExactStagingAuthSurface(rows) {
  if (!Array.isArray(rows)) {
    throw new Error("Staging auth surface is not a bounded identity array");
  }
  if (rows.length === 0) {
    return Object.freeze({
      schemaVersion: "dealflow.staging-auth-surface-proof.v1",
      status: "EMPTY",
      userCount: 0,
      emailSetSha256: EMPTY_AUTH_SURFACE_SHA256,
      identitySetSha256: EMPTY_AUTH_SURFACE_SHA256,
      unexpectedIdentityCount: 0,
      rawIdentityValuesPersisted: false,
    });
  }
  if (!isAllowedStagingAuthSurfaceUserCount(rows.length)) {
    throw new Error("Staging auth surface is not the exact synthetic fixture set");
  }
  const identities = rows.map((row) => {
    const preservedGhlOwnerCandidate =
      typeof row?.email === "string" &&
      sha256(row.email) === PRESERVED_GHL_OWNER_AUTHORITY.emailSha256 &&
      row?.fixture === PRESERVED_GHL_OWNER_AUTHORITY.fixture &&
      row?.synthetic === PRESERVED_GHL_OWNER_AUTHORITY.synthetic &&
      row?.scenario == null;
    if (
      !row ||
      typeof row.email !== "string" ||
      row.email !== row.email.trim().toLowerCase() ||
      typeof row.fixture !== "string" ||
      typeof row.synthetic !== "boolean" ||
      (typeof row.scenario !== "string" && !preservedGhlOwnerCandidate)
    ) {
      throw new Error("Staging auth surface contains a malformed identity");
    }
    return {
      email: row.email,
      fixture: row.fixture,
      synthetic: row.synthetic,
      scenario: row.scenario ?? "",
    };
  }).sort((left, right) => left.email.localeCompare(right.email));
  const preservedGhlOwnerAuthorities = identities.filter((identity) =>
    sha256(identity.email) === PRESERVED_GHL_OWNER_AUTHORITY.emailSha256 &&
    identity.fixture === PRESERVED_GHL_OWNER_AUTHORITY.fixture &&
    identity.synthetic === PRESERVED_GHL_OWNER_AUTHORITY.synthetic &&
    identity.scenario === PRESERVED_GHL_OWNER_AUTHORITY.scenario
  );
  const fixtureIdentities = identities.filter((identity) =>
    sha256(identity.email) !== PRESERVED_GHL_OWNER_AUTHORITY.emailSha256
  );
  const identityJson = JSON.stringify(fixtureIdentities);
  const currentFixture = identityJson === JSON.stringify(EXPECTED_SYNTHETIC_AUTH_IDENTITIES);
  const exactLegacyFixture = identityJson === JSON.stringify(LEGACY_SYNTHETIC_AUTH_IDENTITIES);
  const currentFixtureWithPreservedGhlOwnerAuthority =
    currentFixture && preservedGhlOwnerAuthorities.length === 1;
  if (
    new Set(identities.map(({ email }) => email)).size !== identities.length ||
    (!currentFixtureWithPreservedGhlOwnerAuthority &&
      preservedGhlOwnerAuthorities.length !== 0) ||
    (!currentFixture && !exactLegacyFixture)
  ) {
    throw new Error("Staging auth surface contains an unexpected or incorrectly labeled identity");
  }
  return Object.freeze({
    schemaVersion: "dealflow.staging-auth-surface-proof.v1",
    status: currentFixtureWithPreservedGhlOwnerAuthority
      ? "EXACT_SYNTHETIC_FIXTURE_SET_WITH_PRESERVED_GHL_OWNER_AUTHORITY"
      : currentFixture
        ? "EXACT_SYNTHETIC_FIXTURE_SET"
      : "EXACT_LEGACY_SYNTHETIC_FIXTURE_SET",
    userCount: identities.length,
    emailSetSha256: sha256(JSON.stringify(identities.map(({ email }) => email))),
    identitySetSha256: sha256(JSON.stringify(identities)),
    unexpectedIdentityCount: 0,
    rawIdentityValuesPersisted: false,
  });
}

export function isExactSafeStagingAuthSurfaceProof(proof) {
  const expectedKeys = [
    "emailSetSha256",
    "identitySetSha256",
    "rawIdentityValuesPersisted",
    "schemaVersion",
    "status",
    "unexpectedIdentityCount",
    "userCount",
  ];
  if (
    !proof ||
    JSON.stringify(Object.keys(proof).sort()) !== JSON.stringify(expectedKeys) ||
    proof?.schemaVersion !== "dealflow.staging-auth-surface-proof.v1" ||
    proof.unexpectedIdentityCount !== 0 ||
    proof.rawIdentityValuesPersisted !== false
  ) {
    return false;
  }
  if (proof.status === "EMPTY") {
    return proof.userCount === 0 &&
      proof.emailSetSha256 === EMPTY_AUTH_SURFACE_SHA256 &&
      proof.identitySetSha256 === EMPTY_AUTH_SURFACE_SHA256;
  }
  const exactCurrentFixture =
    proof.status === "EXACT_SYNTHETIC_FIXTURE_SET" &&
    proof.userCount === EXPECTED_SYNTHETIC_AUTH_IDENTITIES.length &&
    proof.emailSetSha256 === EXPECTED_SYNTHETIC_AUTH_EMAIL_SET_SHA256 &&
    proof.identitySetSha256 === EXPECTED_SYNTHETIC_AUTH_IDENTITY_SET_SHA256;
  const exactLegacyFixture =
    ["EXACT_SYNTHETIC_FIXTURE_SET", "EXACT_LEGACY_SYNTHETIC_FIXTURE_SET"].includes(
      proof.status,
    ) &&
    proof.userCount === LEGACY_SYNTHETIC_AUTH_IDENTITIES.length &&
    proof.emailSetSha256 === LEGACY_SYNTHETIC_AUTH_EMAIL_SET_SHA256 &&
    proof.identitySetSha256 === LEGACY_SYNTHETIC_AUTH_IDENTITY_SET_SHA256;
  const exactCurrentFixtureWithPreservedGhlOwnerAuthority =
    proof.status === "EXACT_SYNTHETIC_FIXTURE_SET_WITH_PRESERVED_GHL_OWNER_AUTHORITY" &&
    proof.userCount === EXPECTED_SYNTHETIC_AUTH_IDENTITIES.length + 1 &&
    proof.emailSetSha256 === EXPECTED_PRESERVED_GHL_OWNER_AUTH_EMAIL_SET_SHA256 &&
    proof.identitySetSha256 ===
      EXPECTED_PRESERVED_GHL_OWNER_AUTH_IDENTITY_SET_SHA256;
  return exactCurrentFixture || exactLegacyFixture ||
    exactCurrentFixtureWithPreservedGhlOwnerAuthority;
}

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

const LEGACY_COMMITTED_FORWARD_RECOVERY_SEAL = Object.freeze({
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

const FORWARD_104_TO_120_CATALOG_RECOVERY_SEAL = Object.freeze({
  applicationCommit: "c7c9944d7b68e639ba4257ff33235a5dc7d23499",
  applicationTree: "d6c66dac2699b901316d7470691dbfb336363003",
  manifestSha256: "6ee6198163dfb51d2f3adf3cfeee5fbbc0611c2ae8bd7aeefd3cac6f474ea467",
  summarySha256: "07a1e5f4e18c1a83a3a57d527c22e5c144db56f9b0bf49fdff8f06f765c48792",
  mutationStatusSha256: "722b9dd21abb0ca6c8d6a709ccfaf8077195557b2f8fceeaa326ea022cebc240",
  failureSha256: "4930be4c6de2ee099ceb0886cd4e17ec0dfdec4dbb0428cc17881d88057956e4",
  brokerSourceSha256: "2a44ecaabbb33325302c51393890dcd017d88ad9af1f761ee88f585b5542548d",
  migrationPortfolioSha256: "fa6f66b0346b7674f5613a206fcc188e1cb38cc0332919f9fe76337c2a37570f",
  postStructuralCatalogSha256: "69555dfa8eb23734329bb9998f3c18520539643cedc5b54c58ed7a884e991b98",
  postNormalizedSchemaSha256: null,
});

const COMMITTED_FORWARD_RECOVERY_SEALS = Object.freeze({
  legacy_forward_103_acl: LEGACY_COMMITTED_FORWARD_RECOVERY_SEAL,
  forward_104_to_120_catalog_rendering: FORWARD_104_TO_120_CATALOG_RECOVERY_SEAL,
});

// The isolated qibh database received this exact 129-migration application on
// 2026-07-30. A later source successor changed only the fail-closed UUID text
// adoption predicate in migration 20260710160000; the migration version set and
// resulting catalog remained unchanged. This pin allows that one immutable
// historical application proof to authorize a new read-only catalog reproof.
// It never treats the historical portfolio digest as the current source digest.
export const HISTORICAL_129_APPLICATION_AUTHORITY = Object.freeze({
  applicationCommit: "78804a03702e78d3d1bc9cf5299f910e611b9c4b",
  applicationTree: "79aacdc6c4c21bfc485e33cbf1129b7d68dbc2e8",
  releaseBranch: "codex/dealflow-release-closure-plan",
  manifestSha256: "bb4571128f205e504fbe0c360e361a77b2ea34d0e774fe37eafc3c22fc8943bb",
  proofSha256: "b2ca403bca7601ae2047184cc846baf3f89fd6ceedca5bfccef167d212e707f5",
  summarySha256: "40c8b043491bbf260befff8be6ae078c2833a40dae0199d43dacd7c293706e90",
  brokerSourceSha256: "b5555194045030128b3e12afcefd00e9d6957e0153637296453293514653c4b4",
  migrationCount: 129,
  lastCommittedVersion: "20260727020000",
  historicalMigrationPortfolioSha256:
    "a10f2771155eafbea20995277347d0b5b53799c3afce028a81d3467bdc88ab33",
  currentSourceReplayMigrationPortfolioSha256:
    "41d169dd0426aeb2da8929102e997ab4d41647b0b4e539669b3031cca0512ce8",
  changedMigrationFile: "20260710160000_validate_and_normalize_pre_candidate_shape.sql",
  historicalChangedMigrationSha256:
    "a61fb33d7da5d81c251dae3bc5877b0fdc967d794d803a2e0b435b8f4a2622ac",
  currentChangedMigrationSha256:
    "8bce86bab50e47d7c534d9d5f031ca94cd85858dafc28b44461698fc3f4b8cb9",
  normalizedSchemaSha256:
    "bb53a8ff8275aa276f90a96e9889662629f90c0d518c16bf1085de726569e6b2",
  structuralCatalogSha256:
    "c7f516e5ed4ebe5c9ef362841bd71d51a991f21554f594b026a83e75a16ed461",
});

export function isExactHistorical129ApplicationAuthority(candidate) {
  return Boolean(candidate) && Object.entries(HISTORICAL_129_APPLICATION_AUTHORITY)
    .every(([field, expected]) => candidate[field] === expected);
}

const APPLICATION_REMOTE_STATES = new Set([
  "EXACT_COMMITTED_PORTFOLIO",
  "EXACT_FORWARD_COMMITTED_PORTFOLIO",
  "EXACT_FORWARD_104_TO_120_COMMITTED_PORTFOLIO",
  "EXACT_FORWARD_120_TO_121_COMMITTED_PORTFOLIO",
  "EXACT_FORWARD_121_TO_122_COMMITTED_PORTFOLIO",
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
  return classifyExactCommittedForwardRecoverySeal(candidate) !== null;
}

export function classifyExactCommittedForwardRecoverySeal(candidate) {
  if (!candidate) return null;
  for (const [kind, seal] of Object.entries(COMMITTED_FORWARD_RECOVERY_SEALS)) {
    if (Object.entries(seal).every(([field, expected]) => candidate[field] === expected)) {
      return kind;
    }
  }
  return null;
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
    const forward104To120CatalogRecovery =
      mutationStatus?.transition === "EXACT_104_TO_120";
    if (forward104To120CatalogRecovery) {
      const expectedStatus = "FAILED_FORWARD_REMOTE_STATE_NOT_PROVEN";
      const expectedFailureCode = "forward_120_managed_catalog_not_exact_or_stable";
      const hex64 = /^[a-f0-9]{64}$/;
      if (
        manifest?.schemaVersion !== "dealflow.staging-evidence-manifest.v1" ||
        manifest.status !== expectedStatus ||
        manifest.migrationMode !== "APPLY_FORWARD_EXACT" ||
        manifest.transition !== "EXACT_104_TO_120" ||
        manifest.remoteMutationStarted !== true ||
        manifest.remoteMutationCompleted !== null ||
        summary?.schemaVersion !== "dealflow.staging-migration-summary.v1" ||
        summary.status !== expectedStatus ||
        summary.failureCode !== expectedFailureCode ||
        summary.migrationMode !== "APPLY_FORWARD_EXACT" ||
        summary.transition !== "EXACT_104_TO_120" ||
        summary.forwardOnly !== true ||
        summary.remoteMutationStarted !== true ||
        summary.remoteMutationCompleted !== null ||
        summary.singleOuterTransaction !== true ||
        summary.migrationHistoryReceiptsInsideOuterTransaction !== true ||
        summary.migrationCount !== expectedMigrationCount ||
        summary.priorMigrationCount !== 104 ||
        summary.forwardMigrationCount !== 16 ||
        summary.terminalVersion !== expectedFinalVersion ||
        failure?.schemaVersion !== "dealflow.isolated-staging-migration-failure.v1" ||
        failure.status !== expectedStatus ||
        failure.failureCode !== expectedFailureCode ||
        failure.migrationMode !== "APPLY_FORWARD_EXACT" ||
        failure.transition !== "EXACT_104_TO_120" ||
        failure.forwardOnly !== true ||
        failure.remoteMutationStarted !== true ||
        failure.remoteMutationCompleted !== null ||
        failure.migrationCount !== expectedMigrationCount ||
        failure.priorMigrationCount !== 104 ||
        failure.forwardMigrationCount !== 16 ||
        failure.terminalVersion !== expectedFinalVersion ||
        mutationStatus?.schemaVersion !== "dealflow.staging-mutation-status.v1" ||
        mutationStatus.status !== expectedStatus ||
        mutationStatus.failureCode !== expectedFailureCode ||
        mutationStatus.migrationMode !== "APPLY_FORWARD_EXACT" ||
        mutationStatus.transition !== "EXACT_104_TO_120" ||
        mutationStatus.forwardOnly !== true ||
        mutationStatus.remoteMutationStarted !== true ||
        mutationStatus.remoteMutationCompleted !== null ||
        mutationStatus.singleOuterTransaction !== true ||
        mutationStatus.migrationHistoryReceiptsInsideOuterTransaction !== true ||
        mutationStatus.transactionCommitMarkerSeen !== true ||
        mutationStatus.attemptedCount !== 16 ||
        mutationStatus.appliedInTransactionCount !== 16 ||
        mutationStatus.processExitStatus !== 0 ||
        mutationStatus.processSignal !== null ||
        mutationStatus.processError !== false ||
        mutationStatus.processErrorCode !== null ||
        mutationStatus.databaseSqlstate !== null ||
        mutationStatus.lastAttemptedVersion !== expectedFinalVersion ||
        mutationStatus.lastAppliedVersion !== expectedFinalVersion ||
        mutationStatus.lastCommittedVersion !== null ||
        mutationStatus.migrationCount !== expectedMigrationCount ||
        mutationStatus.priorMigrationCount !== 104 ||
        mutationStatus.forwardMigrationCount !== 16 ||
        mutationStatus.terminalVersion !== expectedFinalVersion ||
        !hex64.test(mutationStatus.postStructuralCatalogSha256 ?? "") ||
        mutationStatus.postNormalizedSchemaSha256 !== null
      ) {
        throw new Error(
          "Prior committed-forward recovery proof is not the exact sealed 104-to-120 post-commit catalog-rendering failure",
        );
      }
      return Object.freeze({
        evidenceKind: "committed_forward_recovery",
        recoveryKind: "forward_104_to_120_catalog_rendering",
        requiredNames: COMMITTED_FORWARD_RECOVERY_ARTIFACTS,
        evidenceRemoteMutationStarted: true,
        evidenceRemoteMutationCompleted: true,
        portfolioApplicationRemoteMutationCompleted: true,
      });
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
      recoveryKind: "legacy_forward_103_acl",
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
  const exactFullCatalog =
    proof.remoteStateVerification?.exactStructuralCatalog === true;
  const exactManagedCatalog =
    proof.remoteStateVerification?.exactManagedStructuralCatalog === true &&
    proof.remoteStateVerification?.platformStructuralCatalogStable === true &&
    typeof proof.remoteStateVerification?.state?.managedStructuralCatalogSha256 === "string" &&
    /^[a-f0-9]{64}$/.test(
      proof.remoteStateVerification.state.managedStructuralCatalogSha256,
    ) &&
    Number.isInteger(
      proof.remoteStateVerification?.state?.managedStructuralCatalogRecordCount,
    ) &&
    proof.remoteStateVerification.state.managedStructuralCatalogRecordCount > 0;
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
    (!exactFullCatalog && !exactManagedCatalog) ||
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
    (priorApplication.migrationPortfolioSha256 === expectedMigrationPortfolioSha256 ||
      (
        priorApplication.sourceRemoteStateVerificationStatus ===
          "SEALED_HISTORICAL_129_APPLICATION_REQUIRES_CURRENT_READ_ONLY_REPROOF" &&
        priorApplication.migrationPortfolioSha256 ===
          HISTORICAL_129_APPLICATION_AUTHORITY.historicalMigrationPortfolioSha256 &&
        priorApplication.sourceReplayMigrationPortfolioSha256 ===
          expectedMigrationPortfolioSha256 &&
        priorApplication.applicationCommit ===
          HISTORICAL_129_APPLICATION_AUTHORITY.applicationCommit &&
        priorApplication.applicationTree ===
          HISTORICAL_129_APPLICATION_AUTHORITY.applicationTree &&
        priorApplication.manifestSha256 ===
          HISTORICAL_129_APPLICATION_AUTHORITY.manifestSha256 &&
        priorApplication.proofSha256 ===
          HISTORICAL_129_APPLICATION_AUTHORITY.proofSha256 &&
        priorApplication.summarySha256 ===
          HISTORICAL_129_APPLICATION_AUTHORITY.summarySha256
      )) &&
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
