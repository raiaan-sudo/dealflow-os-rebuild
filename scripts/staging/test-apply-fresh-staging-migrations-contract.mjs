#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createNativePostgresTestAdapter } from "../lib/native-postgres-test-adapter.mjs";
import {
  classifyExactStagingAuthSurface,
  classifyPriorMigrationEvidence,
  isExactCommittedForwardRecoverySeal,
  isExactCurrentResumeIdentity,
  isExactSafeStagingAuthSurfaceProof,
  isAllowedStagingAuthSurfaceUserCount,
  PRIOR_MIGRATION_APPLICATION_ARTIFACTS,
  PRIOR_MIGRATION_COMMITTED_FORWARD_RECOVERY_ARTIFACTS,
  PRIOR_MIGRATION_READ_ONLY_EXACT_ARTIFACTS,
  STAGING_AUTH_SURFACE_ALLOWED_USER_COUNTS,
  STAGING_AUTH_SURFACE_MAX_USER_COUNT,
} from "./prior-migration-proof-contract.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const brokerPath = join(scriptDir, "apply-fresh-staging-migrations.mjs");
const source = readFileSync(brokerPath, "utf8");
const priorProofContractSource = readFileSync(
  join(scriptDir, "prior-migration-proof-contract.mjs"),
  "utf8",
);
const stagingSeedSource = readFileSync(
  join(scriptDir, "..", "seed-isolated-staging.mjs"),
  "utf8",
);
const trustBundle = readFileSync(
  join(scriptDir, "..", "..", "config", "security", "supabase-prod-ca-2021.crt"),
);

function requireMarker(pattern, label) {
  assert.match(source, pattern, `Tracked staging broker is missing ${label}`);
}

requireMarker(/const exactMigrationCount = 108/, "the exact 108-migration gate");
requireMarker(
  /Legacy single-migration forward mode is disabled for the 108-migration successor/,
  "the fail-closed successor forward-mode gate",
);
requireMarker(/const expectedPriorMigrationCount = 103/, "the pinned prior 103-migration gate");
requireMarker(
  /c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c/,
  "the isolated staging project fingerprint",
);
requireMarker(/const expectedProjectSafeSuffix = "qibh"/, "the qibh safe suffix");
requireMarker(/--verify-existing-exact/, "explicit existing-portfolio verification mode");
requireMarker(/--apply-forward-exact/, "explicit exact forward-only migration mode");
requireMarker(/PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=300000"/, "database-enforced read-only resume mode");
requireMarker(
  /function loadAndValidatePriorMigrationProof\(\{ requirePinnedPrior103 \}\)/,
  "prior atomic proof validator",
);
requireMarker(/Prior migration proof artifact does not match its sealed digest/, "prior artifact digest verification");
requireMarker(/Prior migration proof does not match the exact pinned prior-state seal/, "exact prior seal pin");
requireMarker(/isExactCommittedForwardRecoverySeal/, "dedicated committed-forward recovery seal gate");
assert.match(priorProofContractSource, /cc3e8c91f0f95a61b4b2f8e0c113367781e80bdf01ccf3a727a64cf664b2b6c7/, "exact failed-forward manifest pin");
assert.match(priorProofContractSource, /2546b7c44116e0920534ef58f649acd9c037c586/, "exact failed-forward commit pin");
assert.match(priorProofContractSource, /9c404170b7a5a4708d4685a6c22f540894eabf2e/, "exact failed-forward tree pin");
requireMarker(/SEALED_FORWARD_103_COMMIT_REQUIRES_READ_ONLY_REPROOF/, "dedicated read-only recovery identity");
requireMarker(/5978cfc9a80f511cfed02d1d1f810a4720db7cc1/, "prior application commit pin");
requireMarker(/7ea61c55363d40d1e23fb35e45029e653e6682a7/, "prior application tree pin");
requireMarker(/f4a7209d74fdc1dad3f82290c837d2a8c289546eca7f8b7373efe9e0e6aa3f63/, "prior manifest digest pin");
requireMarker(/828a5caf76abc36326ecfbedcea7074533de9e587c375812223d90033c7451ed/, "prior proof digest pin");
requireMarker(/49e58de331c8e699b2ba5ce1bbae2235bd45b79de343c519585e0cc5a64422d3/, "prior summary digest pin");
requireMarker(
  /requireApplicationEvidence: false/,
  "read-only exact prior-103 state authority for the one-migration forward transition",
);
requireMarker(/merge-base", "--is-ancestor"/, "prior application ancestry binding");
requireMarker(/migrationMode: "VERIFY_EXISTING_EXACT"/, "truthful existing-portfolio mode evidence");
requireMarker(/portfolioApplicationRemoteMutationCompleted: true/, "separate historical application truth");
requireMarker(/remoteMutationStarted: false/, "read-only resume mutation-start truth");
requireMarker(/remoteMutationCompleted: false/, "read-only resume mutation-completion truth");
requireMarker(/EXACT_EXISTING_COMMITTED_PORTFOLIO/, "exact existing portfolio result");
requireMarker(
  /const existingExactVerificationFailureCodes = Object\.freeze\(\{/,
  "bounded existing-verification failure-code map",
);
for (const stage of [
  "SERVER_VERSION",
  "REMOTE_STRUCTURAL_STATE",
  "MIGRATION_HISTORY",
  "STORAGE_SURFACE",
  "AUTH_SURFACE",
  "AUTH_COUNT_CONSISTENCY",
  "STRUCTURAL_CATALOG_BINDING",
  "STRUCTURAL_CATALOG_STABILITY",
  "NORMALIZED_SCHEMA_FIRST_CAPTURE",
  "NORMALIZED_SCHEMA_REPEAT_CAPTURE",
  "NORMALIZED_SCHEMA_BINDING",
  "FORCED_RLS_COUNT",
  "META_RUNTIME_CONTROLS",
  "GHL_RUNTIME_CONTROLS",
  "RETENTION_AUTHORITY_ACL",
  "BROKER_SOURCE_REBIND",
  "FINAL_EVIDENCE_WRITE",
]) {
  requireMarker(
    new RegExp(`${stage}: "[a-z0-9_]+"`),
    `type-safe ${stage} failure code`,
  );
}
const existingFailureCodeMapBody =
  /const existingExactVerificationFailureCodes = Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(
    source,
  )?.[1];
assert.ok(existingFailureCodeMapBody, "Existing-verification failure-code map must be inspectable");
const existingFailureCodes = [
  ...existingFailureCodeMapBody.matchAll(/^[ ]{2}[A-Z_]+: "([a-z0-9_]+)",$/gm),
].map((match) => match[1]);
assert.equal(existingFailureCodes.length, 17, "Every existing-verification stage needs one code");
assert.equal(
  new Set(existingFailureCodes).size,
  existingFailureCodes.length,
  "Existing-verification failure codes must be unique",
);
requireMarker(
  /function existingExactFailureEvidence\(stage, error, projectRef\)/,
  "bounded existing-verification failure evidence builder",
);
requireMarker(/sanitizedErrorSha256: sha256\(boundedSanitizedError\)/, "digest-only sanitized error evidence");
requireMarker(/rawErrorPersisted: false/, "explicit raw-error non-persistence truth");
requireMarker(/\[EVIDENCE_DIR\]/, "run-specific evidence-directory normalization");
requireMarker(/\[RELEASE_REPO\]/, "release-repository path normalization");
requireMarker(
  /function captureRemoteStructuralState\(labelPrefix, attributeStage = null\)/,
  "query-level structural-state stage attribution",
);
requireMarker(/captureAndAssertStagingAuthSurface/, "empty-or-exact-synthetic auth-surface verifier");
requireMarker(/with bounded_auth_users as \(/, "single-statement bounded auth identity snapshot");
requireMarker(/auth_count as \(/, "single-statement auth count snapshot");
requireMarker(/'totalCount', \(select total_count from auth_count\)/, "count and identities share one statement snapshot");
requireMarker(
  /!isAllowedStagingAuthSurfaceUserCount\(payload\?\.totalCount\)/,
  "shared empty-or-exact-fixture auth count gate",
);
requireMarker(
  /limit \$\{STAGING_AUTH_SURFACE_MAX_USER_COUNT\}/,
  "shared-contract-bounded auth identity read",
);
assert.doesNotMatch(
  source,
  /!\[[^\]]*\]\.includes\(payload(?:\?\.|\.)totalCount\)/,
  "The migration broker must not duplicate the canonical auth-surface counts",
);
assert.match(
  priorProofContractSource,
  /if \(!isAllowedStagingAuthSurfaceUserCount\(rows\.length\)\)/,
  "The identity classifier must consume the same canonical auth-surface count authority",
);
requireMarker(/'email', email/, "raw auth email supplied to canonical classifier");
assert.doesNotMatch(
  source,
  /'email', lower\(email\)/,
  "The database query must not normalize a noncanonical stored auth email before classification",
);
requireMarker(/raw_user_meta_data->>'fixture'/, "synthetic auth fixture-label capture");
requireMarker(/raw_user_meta_data->'synthetic'/, "synthetic auth boolean capture");
requireMarker(/raw_user_meta_data->>'scenario'/, "synthetic auth scenario capture");
requireMarker(/captureNormalizedSchemaDump/, "normalized schema comparison");
requireMarker(/function captureAndAssertRetentionAuthorityAcl\(label\)/, "table and column ACL postcondition verifier");
requireMarker(/'serviceRoleMaintain', has_table_privilege\('service_role'.*'MAINTAIN'\)/, "PostgreSQL 17 MAINTAIN privilege rejection");
requireMarker(/has_any_column_privilege\('service_role'/, "service_role column-write rejection");
requireMarker(/has_any_column_privilege\('anon'/, "anon column-privilege rejection");
requireMarker(/has_any_column_privilege\('authenticated'/, "authenticated column-privilege rejection");
requireMarker(/publicColumnAclPresent/, "PUBLIC column ACL rejection");
requireMarker(/cross join lateral aclexplode\(attribute\.attacl\)/, "NULL-safe column ACL expansion");
assert.doesNotMatch(
  source,
  /aclexplode\(coalesce\(attribute\.attacl,'\{\}'::aclitem\[\]\)\)/,
  "The ACL verifier must not turn a NULL column ACL into a zero-dimensional array",
);
requireMarker(/retentionConfigurationRelationOwner: "postgres"/, "retention relation owner proof");
requireMarker(/retentionConfigurationRowSecurityEnabled: true/, "retention RLS-enabled proof");
requireMarker(/retentionConfigurationRowSecurityForced: true/, "retention forced-RLS proof");
requireMarker(/serviceRoleColumnWritePrivilegesPresent: false/, "sealed service_role column-write result");
requireMarker(/migrations\.length !== exactMigrationCount/, "exact migration-count rejection");
requireMarker(/expectedPriorFinalMigration[\s\S]+20260713028000_harden_account_deletion_retention_authority\.sql/, "the prior final migration pin");
requireMarker(/requiredFinalMigration[\s\S]+20260716200000_harden_stripe_payment_lifecycle\.sql/, "the final migration 108 pin");
requireMarker(/Two distinct final-verification summaries are required/, "two distinct verification rounds");
requireMarker(
  /verificationRounds\[0\]\.resolvedCommandPortfolioSha256 !==\s*verificationRounds\[1\]\.resolvedCommandPortfolioSha256/,
  "identical resolved native runtime command portfolios",
);
requireMarker(/summary\.schemaVersion !== "dealflow\.final-verification\.v3"/, "verification summary schema binding");
requireMarker(/final-verification-command-contract\.mjs/, "shared exact command-portfolio contract");
requireMarker(
  /assertExactFinalVerificationSummaryPortfolio\([\s\S]+summary,[\s\S]+`Verification round \$\{expectedRound\} portfolio`/,
  "exact ordered command-portfolio validation",
);
requireMarker(/NO_GO_AUTHENTICATED_PROOF_DEFERRED/, "hosted-only local-gate status binding");
requireMarker(/expectedHostedVerificationDeferrals/, "hosted-only deferral allowlist");
requireMarker(/summary\.blockedCount !== expectedHostedVerificationDeferrals\.length/, "exact hosted blocker count");
requireMarker(/item\.status !== "authenticated_deferred"/, "authenticated deferral status binding");
requireMarker(/record\.exitCode !== 0/, "zero command-exit receipt binding");
requireMarker(/record\.workingDirectory !== expectedRepo/, "exact release working-directory binding");
requireMarker(
  /expectedRepo = realpathSync\([\s\S]*fileURLToPath\(import\.meta\.url\)[\s\S]*"\.\.\/\.\."/,
  "source-derived durable release repository binding",
);
requireMarker(/DEALFLOW_STAGING_PROJECT_RECORD/, "external qibh project-record path input");
requireMarker(
  /extractFinalVerificationNativePostgresRuntime/,
  "verification-round-bound native PostgreSQL runtime",
);
requireMarker(
  /expectedPostgresBin = verificationNativePostgresRuntimes\[0\]\.pgbin/,
  "native PostgreSQL binary derived from exact verification evidence",
);
assert.doesNotMatch(
  source,
  /\/private\/tmp\/dealflow-(?:overnight-release|pg17\.6|new-staging-project)/,
  "The migration broker must not depend on disposable identity paths",
);
for (const deferredCommand of [
  "npm run rls:cross-tenant",
  "npm run rls:fixture-smoke",
  "npm run operator:debt",
]) {
  requireMarker(new RegExp(deferredCommand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${deferredCommand} allowlist entry`);
}
requireMarker(/!\/\^v24\\\.\/[\s\S]*summary\.runtime/, "Node 24 verification-round binding");
requireMarker(/staging migration broker requires Node 24/, "Node 24 execution gate");
requireMarker(/exact pinned PostgreSQL 17\.6 runtime/, "PostgreSQL 17.6 runtime gate");
requireMarker(/config\/security\/supabase-prod-ca-2021\.crt/, "tracked Supabase TLS trust bundle path");
requireMarker(/700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7/, "pinned Supabase TLS trust bundle digest");
requireMarker(/committedTrustBundleBytes = git/, "commit-bound TLS trust bundle gate");
requireMarker(/realpathSync\(expectedTrustBundlePath\) !== expectedTrustBundlePath/, "real-path TLS trust bundle gate");
requireMarker(/trustBundleStat\.mode & 0o022/, "non-writable TLS trust bundle gate");
requireMarker(/PGSSLMODE: "verify-full"/, "full TLS server authentication");
requireMarker(/PGSSLROOTCERT: expectedTrustBundlePath/, "pinned libpq trust bundle transport");
requireMarker(/tlsServerAuthentication/, "TLS trust identity evidence");
assert.doesNotMatch(source, /PGSSLMODE: "require"/, "Broker must not accept encryption without server authentication");
assert.equal(
  createHash("sha256").update(trustBundle).digest("hex"),
  "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7",
  "Tracked Supabase root CA bytes must match the pinned digest",
);
requireMarker(/serverVersion\.startsWith\("17\.6"\)/, "remote PostgreSQL 17.6 proof");
requireMarker(/requires a completely clean release worktree/, "clean release seal");
requireMarker(/release identity changed during broker preflight/, "clean-seal recheck");
requireMarker(/migrationPortfolioSha256/, "migration portfolio digest");
requireMarker(/dependencyLockSha256/, "dependency lock digest");
requireMarker(/trackedWorktreeSha256/, "tracked-worktree digest");
requireMarker(/postgresBinarySha256/, "PostgreSQL binary digests");
requireMarker(/transactionSafeMigrationSource/, "transaction normalization");
requireMarker(
  /function buildAtomicMigrationTransaction\(sources\)[\s\S]+"begin;"[\s\S]+for \(const \{ version, transactionSafeBody \} of sources\)[\s\S]+insert into supabase_migrations\.schema_migrations[\s\S]+"commit;"/,
  "single outer transaction containing every migration and history receipt",
);
requireMarker(/atomicMigrationTransaction = buildAtomicMigrationTransaction\(migrationSources\)/, "sealed atomic transaction construction");
requireMarker(
  /forwardMigrationSources = migrationSources\.slice\([\s\S]+expectedPriorMigrationCount,[\s\S]+expectedPriorMigrationCount \+ 1/,
  "unreachable historical forward tranche remains bounded to one migration",
);
requireMarker(
  /forwardAtomicMigrationTransaction = buildAtomicMigrationTransaction\([\s\S]+forwardMigrationSources/,
  "single forward transaction construction",
);
requireMarker(/function executeAtomicMigrationTransaction\(\)/, "single-session atomic transaction executor");
requireMarker(/function executeForwardMigrationTransaction\(\)/, "single-session forward transaction executor");
requireMarker(/DEALFLOW_MIGRATION_ATTEMPTED:/, "last-attempted migration receipt");
requireMarker(/DEALFLOW_MIGRATION_APPLIED:/, "last-applied migration receipt");
requireMarker(/DEALFLOW_MIGRATION_TRANSACTION_COMMITTED/, "transaction commit receipt");
requireMarker(/Migration .* is not compatible with the required outer transaction/, "nontransactional migration rejection");
requireMarker(/state\.authTableCount === 23/, "fresh auth platform baseline");
requireMarker(/state\.storageTableCount === 8/, "fresh storage platform baseline");
requireMarker(/state\.vaultTableCount === 1/, "fresh vault platform baseline");
requireMarker(/state\.authUserCount === 0/, "zero-auth-user baseline");
requireMarker(/state\.storageObjectCount === 0/, "zero-storage-object baseline");
requireMarker(/Evidence directory must be a real absent-or-empty directory/, "external evidence fencing");
requireMarker(/staging project attestation must be a real owner-only file/, "owner-only project attestation");
requireMarker(/function readKeychainPasswordBuffer\(\)/, "memory-only Keychain password retrieval");
requireMarker(/encoding: null/, "binary secret capture without string conversion");
requireMarker(/function spawnPostgresCommand\(command, args, options = \{\}\)/, "memory-only PostgreSQL transport");
requireMarker(/Buffer\.concat\(\[password, Buffer\.from\("\\n"\), sqlInput\]\)/, "password prompt input assembly");
requireMarker(/spawnSync\(command, \["--password", \.\.\.args\]/, "forced PostgreSQL password prompt");
requireMarker(/password\.fill\(0\)/, "password-buffer zeroing");
requireMarker(/inputBuffer\.fill\(0\)/, "combined-input-buffer zeroing");

const verificationReaderStart = source.indexOf("function readPassingVerificationSummary(");
const verificationReaderEnd = source.indexOf("\nfunction assertOutsideRelease", verificationReaderStart);
const verificationReaderSource = source.slice(verificationReaderStart, verificationReaderEnd);
const verificationRoundsIndex = source.indexOf(
  "const verificationRounds = roundSummaryPaths.map(",
);
const evidencePreparationIndex = source.indexOf("prepareEvidenceDirectory();");
const projectAuthorityIndex = source.indexOf("const projectRecordStat = lstatSync(projectRecordPath)");
assert.match(
  verificationReaderSource,
  /assertExactFinalVerificationSummaryPortfolio\([\s\S]+summary,[\s\S]+`Verification round \$\{expectedRound\} portfolio`/,
  "the executed migration round reader must enforce the shared exact portfolio",
);
assert.ok(
  verificationRoundsIndex >= 0 &&
    verificationRoundsIndex < evidencePreparationIndex &&
    evidencePreparationIndex < projectAuthorityIndex,
  "both exact verification rounds must fail closed before evidence setup or project/database authority access",
);

requireMarker(/function captureBrokerSourceIdentity\(\)/, "broker self-identity capture");
requireMarker(/fileURLToPath\(import\.meta\.url\)/, "invoked-source identity");
requireMarker(/sourcePath !== expectedSourcePath/, "tracked broker path binding");
requireMarker(/sha256: sha256\(source\)/, "broker source SHA-256 computation");
requireMarker(/function assertBrokerSourceIdentityUnchanged\(identity\)/, "broker source TOCTOU recheck");
requireMarker(/brokerSourceSha256: brokerSourceIdentity\.sha256/, "explicit broker SHA-256 evidence field");

const brokerHashFieldCount = (
  source.match(/brokerSourceSha256: brokerSourceIdentity\.sha256/g) ?? []
).length;
assert.ok(
  brokerHashFieldCount >= 6,
  "Broker SHA-256 must be present in pre-mutation evidence, summary, manifest, proof, final summary, and final manifest",
);

const selfBindingPosition = source.indexOf(
  "const brokerSourceIdentity = captureBrokerSourceIdentity();",
);
const freshBlockPosition = source.indexOf("const preMutationEvidence = {");
const preflightEvidencePosition = source.indexOf(
  '"staging-broker-preflight.json"',
  freshBlockPosition,
);
const preflightSummaryPosition = source.indexOf(
  '"staging-migration-summary.pre-mutation.json"',
  freshBlockPosition,
);
const preflightManifestPosition = source.indexOf(
  '"evidence-manifest.pre-mutation.json"',
  freshBlockPosition,
);
const remoteReadStartedPosition = source.indexOf(
  '"staging-remote-read-started.json"',
  freshBlockPosition,
);
const firstRemoteReadPosition = source.indexOf(
  'serverVersion = sql("show server_version;"',
  freshBlockPosition,
);
const mutationStartedPosition = source.indexOf(
  '"staging-mutation-started.json"',
  freshBlockPosition,
);
const firstRemoteMutationPosition = source.indexOf(
  "transactionExecution = executeAtomicMigrationTransaction();",
  freshBlockPosition,
);

for (const [label, position] of Object.entries({
  selfBindingPosition,
  freshBlockPosition,
  preflightEvidencePosition,
  preflightSummaryPosition,
  preflightManifestPosition,
  remoteReadStartedPosition,
  firstRemoteReadPosition,
  mutationStartedPosition,
  firstRemoteMutationPosition,
})) {
  assert.ok(position >= 0, `Unable to locate ${label} in tracked broker source`);
}
assert.ok(selfBindingPosition < preflightEvidencePosition, "Broker must self-bind before evidence is written");
assert.ok(preflightEvidencePosition < firstRemoteReadPosition, "Broker evidence must be sealed before any remote read");
assert.ok(preflightSummaryPosition < firstRemoteReadPosition, "Broker summary must be sealed before any remote read");
assert.ok(preflightManifestPosition < firstRemoteReadPosition, "Broker manifest must be sealed before any remote read");
assert.ok(remoteReadStartedPosition < firstRemoteReadPosition, "REMOTE_READ_STARTED must be sealed before the first remote read");
assert.ok(firstRemoteReadPosition < firstRemoteMutationPosition, "Fresh remote reads must precede migration mutation");
assert.ok(mutationStartedPosition < firstRemoteMutationPosition, "MUTATION_STARTED must be sealed before the first remote write");

const betweenMutationMarkerAndWrite = source.slice(
  source.indexOf(");", mutationStartedPosition) + 2,
  firstRemoteMutationPosition,
);
assert.doesNotMatch(
  betweenMutationMarkerAndWrite,
  /\bsql\s*\(|runPostgresCommand\s*\(/,
  "No remote operation may occur between MUTATION_STARTED and the atomic write",
);
assert.doesNotMatch(
  source,
  /for \(const \{ file, version, body, transactionSafeBody \} of migrationSources\)[\s\S]{0,1000}\bsql\s*\(/,
  "Broker must not apply migrations through separate remote transactions",
);

requireMarker(/finally \{[\s\S]+"staging-mutation-status\.json"/, "always-emitted terminal mutation status");
requireMarker(/status: "MUTATION_STARTED"/, "pre-write mutation marker status");
requireMarker(/terminalStatus = "ROLLED_BACK"/, "verified rollback status");
requireMarker(/terminalStatus = "FAILED_REMOTE_STATE_NOT_PROVEN"/, "unproven rollback failure status");
requireMarker(/terminalStatus = "FAILED_UNEXPECTED_REMOTE_STATE"/, "unexpected remote state failure status");
requireMarker(/lastAttemptedVersion: transactionExecution\.lastAttemptedVersion/, "terminal last-attempted evidence");
requireMarker(/lastAppliedVersion: transactionExecution\.lastAppliedVersion/, "terminal last-applied evidence");
requireMarker(
  /function captureRemoteStructuralState\(labelPrefix, attributeStage = null\)/,
  "read-only remote state recapture with optional exact-stage attribution",
);
requireMarker(/function captureRemoteCatalogIdentity\(label\)/, "full structural-catalog identity capture");
requireMarker(/function isExactEmptyPlatformState\(state, expectedStructuralCatalogSha256 = null\)/, "exact empty-state rollback verifier");
requireMarker(/state\.structuralCatalogSha256 === expectedStructuralCatalogSha256/, "exact preflight structural-catalog rollback comparison");
requireMarker(/preflightStructuralCatalogSha256: preflightState\.structuralCatalogSha256/, "sealed preflight structural-catalog digest");
requireMarker(/rollbackVerified: remoteStateVerification\.exactEmptyPreflightState/, "failure summary rollback proof");
requireMarker(/"staging-migration-failure\.json"/, "sanitized failure evidence");
requireMarker(/status: "REMOTE_READ_STARTED"/, "truthful remote-read boundary marker");
requireMarker(/status: "FAILED_PRE_MUTATION_READ"/, "sealed pre-mutation read failure status");
requireMarker(/remoteMutationStarted: false/, "pre-mutation read failure mutation truth");
requireMarker(/sanitizedDatabaseDiagnostic: transactionExecution\.sanitizedDatabaseDiagnostic/, "bounded sanitized database diagnostic evidence");
requireMarker(/databaseSqlstate: transactionExecution\.databaseSqlstate/, "database SQLSTATE evidence");
requireMarker(/\.slice\(0, 4_000\)/, "bounded database diagnostic capture");

const catalogIdentityQuery = /function captureRemoteCatalogIdentity\(label\) \{[\s\S]*?const material = sql\(\n    `([\s\S]*?)`,\n    label,/.exec(source)?.[1];
assert.ok(catalogIdentityQuery, "Contract must extract the broker's exact structural-catalog identity query");
const retentionAuthorityAclQuery = /function captureAndAssertRetentionAuthorityAcl\(label\) \{[\s\S]*?const acl = JSON\.parse\(sql\(\n    `([\s\S]*?)`,\n    label,/.exec(source)?.[1];
assert.ok(
  retentionAuthorityAclQuery,
  "Contract must extract the broker's exact retention-authority ACL query",
);

const expectedSyntheticAuthRows = [
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
  ["dealflow-staging-qa-harness-20260712@example.com", "non_admin_qa_harness"],
].map(([email, scenario]) => ({
  email,
  fixture: "DF-STAGING-20260712",
  synthetic: true,
  scenario,
}));
for (const { email, scenario } of expectedSyntheticAuthRows) {
  assert.match(stagingSeedSource, new RegExp(email.replaceAll(".", "\\.")));
  assert.match(stagingSeedSource, new RegExp(scenario));
}
const emptyAuthSurfaceProof = classifyExactStagingAuthSurface([]);
assert.equal(emptyAuthSurfaceProof.status, "EMPTY");
assert.equal(isExactSafeStagingAuthSurfaceProof(emptyAuthSurfaceProof), true);
assert.equal(Object.isFrozen(STAGING_AUTH_SURFACE_ALLOWED_USER_COUNTS), true);
assert.deepEqual(STAGING_AUTH_SURFACE_ALLOWED_USER_COUNTS, [0, 10, 11]);
assert.equal(STAGING_AUTH_SURFACE_MAX_USER_COUNT, 11);
for (const acceptedCount of [0, 10, 11]) {
  assert.equal(
    isAllowedStagingAuthSurfaceUserCount(acceptedCount),
    true,
    `Canonical staging auth-user count ${acceptedCount} must be accepted`,
  );
}
for (const rejectedCount of [1, 9, 12, -1, 10.5, "10", Number.NaN]) {
  assert.equal(
    isAllowedStagingAuthSurfaceUserCount(rejectedCount),
    false,
    `Noncanonical staging auth-user count ${String(rejectedCount)} must fail closed`,
  );
}
const syntheticAuthSurfaceProof = classifyExactStagingAuthSurface(
  structuredClone(expectedSyntheticAuthRows).reverse(),
);
assert.equal(syntheticAuthSurfaceProof.status, "EXACT_SYNTHETIC_FIXTURE_SET");
assert.equal(syntheticAuthSurfaceProof.userCount, 11);
assert.equal(syntheticAuthSurfaceProof.rawIdentityValuesPersisted, false);
assert.equal(isExactSafeStagingAuthSurfaceProof(syntheticAuthSurfaceProof), true);
const legacySyntheticAuthSurfaceProof = classifyExactStagingAuthSurface(
  structuredClone(expectedSyntheticAuthRows.slice(0, -1)).reverse(),
);
assert.equal(legacySyntheticAuthSurfaceProof.status, "EXACT_LEGACY_SYNTHETIC_FIXTURE_SET");
assert.equal(legacySyntheticAuthSurfaceProof.userCount, 10);
assert.equal(isExactSafeStagingAuthSurfaceProof(legacySyntheticAuthSurfaceProof), true);
for (const [label, rows] of [
  ["one identity", expectedSyntheticAuthRows.slice(0, 1)],
  ["nine identities", expectedSyntheticAuthRows.slice(0, 9)],
  ["twelve identities", [...expectedSyntheticAuthRows, {
    email: "dealflow-staging-extra-20260712@example.com",
    fixture: "DF-STAGING-20260712",
    synthetic: true,
    scenario: "unexpected_extra_identity",
  }]],
  ["missing identity", expectedSyntheticAuthRows.slice(1)],
  ["duplicate identity", [...expectedSyntheticAuthRows.slice(0, -1), expectedSyntheticAuthRows[0]]],
  ["unexpected identity", expectedSyntheticAuthRows.map((row, index) => index === 0 ? { ...row, email: "unexpected@example.com" } : row)],
  ["wrong fixture", expectedSyntheticAuthRows.map((row, index) => index === 0 ? { ...row, fixture: "wrong" } : row)],
  ["not synthetic", expectedSyntheticAuthRows.map((row, index) => index === 0 ? { ...row, synthetic: false } : row)],
  ["wrong scenario", expectedSyntheticAuthRows.map((row, index) => index === 0 ? { ...row, scenario: "wrong" } : row)],
  ["noncanonical email", expectedSyntheticAuthRows.map((row, index) => index === 0 ? { ...row, email: row.email.toUpperCase() } : row)],
]) {
  assert.throws(
    () => classifyExactStagingAuthSurface(structuredClone(rows)),
    /Staging auth surface/,
    `Auth-surface proof must reject ${label}`,
  );
}
for (const mutation of [
  { userCount: 9 },
  { emailSetSha256: "0".repeat(64) },
  { identitySetSha256: "0".repeat(64) },
  { unexpectedIdentityCount: 1 },
  { rawIdentityValuesPersisted: true },
  { rawEmails: [] },
]) {
  assert.equal(
    isExactSafeStagingAuthSurfaceProof({ ...syntheticAuthSurfaceProof, ...mutation }),
    false,
    "Tampered synthetic auth-surface proof must fail closed",
  );
}

requireMarker(/"staging-migration-proof\.json"/, "final proof evidence");
requireMarker(/"staging-migration-summary\.json"/, "final summary evidence");
requireMarker(/"evidence-manifest\.json"/, "final evidence manifest");
requireMarker(/preMutationManifestRecord[\s\S]+proofRecord[\s\S]+summaryRecord/, "final manifest artifact binding");
requireMarker(/manifestRecord\.sha256/, "stdout manifest digest");
requireMarker(/brokerSourceIdentity\.sha256/, "stdout broker digest");

assert.doesNotMatch(source, /PGPASSWORD/, "Broker must not place the database password in environment variables");
assert.doesNotMatch(source, /PGPASSFILE=<\(/, "Broker must not use libpq-incompatible process substitution");
assert.doesNotMatch(source, /migrations\.length < 108/, "Broker must not accept a partial migration portfolio");
assert.doesNotMatch(source, /dealflow-staging-tools-20260713/, "Tracked broker must not depend on the scratch source directory");

const resumeStart = source.indexOf('if (migrationMode === "VERIFY_EXISTING_EXACT") {');
const forwardStart = source.indexOf('if (migrationMode === "APPLY_FORWARD_EXACT") {');
const freshStart = source.indexOf("const preMutationEvidence = {");
assert.ok(
  resumeStart >= 0 && forwardStart > resumeStart && freshStart > forwardStart,
  "Resume and forward modes must be discrete pre-fresh branches",
);
const resumeBranch = source.slice(resumeStart, forwardStart);
for (const stage of Object.keys({
  SERVER_VERSION: true,
  REMOTE_STRUCTURAL_STATE: true,
  MIGRATION_HISTORY: true,
  STORAGE_SURFACE: true,
  AUTH_SURFACE: true,
  AUTH_COUNT_CONSISTENCY: true,
  STRUCTURAL_CATALOG_BINDING: true,
  STRUCTURAL_CATALOG_STABILITY: true,
  NORMALIZED_SCHEMA_FIRST_CAPTURE: true,
  NORMALIZED_SCHEMA_REPEAT_CAPTURE: true,
  NORMALIZED_SCHEMA_BINDING: true,
  FORCED_RLS_COUNT: true,
  META_RUNTIME_CONTROLS: true,
  GHL_RUNTIME_CONTROLS: true,
  RETENTION_AUTHORITY_ACL: true,
  BROKER_SOURCE_REBIND: true,
  FINAL_EVIDENCE_WRITE: true,
})) {
  assert.match(
    resumeBranch,
    new RegExp(`verificationStage = "${stage}"`),
    `Resume verifier must attribute failures to ${stage}`,
  );
}
assert.match(
  resumeBranch,
  /catch \(error\) \{[\s\S]*existingExactFailureEvidence\([\s\S]*verificationStage,[\s\S]*error,[\s\S]*projectRef/,
  "Resume verifier must convert caught failures to bounded diagnostic evidence",
);
assert.match(
  resumeBranch,
  /captureRemoteStructuralState\([\s\S]*?\(stage\) => \{[\s\S]*?verificationStage = stage;[\s\S]*?\}\s*,?\s*\)/,
  "Composite structural capture must attribute each query to its exact stage",
);
const structuralCaptureBody =
  /function captureRemoteStructuralState\(labelPrefix, attributeStage = null\) \{([\s\S]*?)\n\}/.exec(
    source,
  )?.[1];
assert.ok(structuralCaptureBody, "Structural-state capture must remain inspectable");
for (const orderedStage of [
  "MIGRATION_HISTORY",
  "STRUCTURAL_CATALOG_BINDING",
  "REMOTE_STRUCTURAL_STATE",
  "AUTH_SURFACE",
  "STORAGE_SURFACE",
]) {
  assert.match(
    structuralCaptureBody,
    new RegExp(`setStage\\("${orderedStage}"\\)`),
    `Structural capture must attribute ${orderedStage}`,
  );
}
const metaStageStart = resumeBranch.indexOf('verificationStage = "META_RUNTIME_CONTROLS"');
const metaSemanticCheck = resumeBranch.indexOf(
  'throw new Error("Meta activation runtime controls are not default closed in existing staging")',
);
const ghlStageStart = resumeBranch.indexOf('verificationStage = "GHL_RUNTIME_CONTROLS"');
assert.ok(
  metaStageStart >= 0 &&
    metaSemanticCheck > metaStageStart &&
    ghlStageStart > metaSemanticCheck,
  "Meta runtime-control query and semantic validation must remain attributed to the Meta stage",
);
assert.doesNotMatch(
  resumeBranch,
  /(?:rawError|errorMessage|sanitizedErrorMessage)\s*:/,
  "Resume verifier must never persist a raw or sanitized error message",
);
assert.doesNotMatch(
  resumeBranch,
  /executeAtomicMigrationTransaction\s*\(/,
  "Existing-portfolio verification must never invoke the migration transaction",
);
assert.doesNotMatch(
  resumeBranch,
  /\bsql\s*\(\s*[`"']\s*(?:insert|update|delete|create|alter|drop|truncate|grant|revoke)\b/i,
  "Existing-portfolio verification must contain no database mutation statement",
);
assert.match(resumeBranch, /process\.exit\(0\)/, "Successful resume verification must not fall through into fresh apply");

const forwardBranch = source.slice(forwardStart, freshStart);
assert.match(
  forwardBranch,
  /loadAndValidatePriorMigrationProof\(\{[\s\S]+requirePinnedPrior103: true/,
  "Forward mode must load only the pinned prior 103 proof",
);
assert.match(
  forwardBranch,
  /first 103 migration filenames and SQL hashes are not the pinned prior portfolio/,
  "Forward mode must reject any drift in the first 103 migration files",
);
assert.match(
  forwardBranch,
  /preForwardState\.structuralCatalogSha256 !== priorApplication\.structuralCatalogSha256/,
  "Forward mode must bind the remote pre-schema catalog to the pinned proof",
);
assert.match(
  forwardBranch,
  /preForwardSchemaSha256 !== priorApplication\.normalizedSchemaSha256/,
  "Forward mode must bind the normalized remote pre-schema to the pinned proof",
);
assert.match(
  forwardBranch,
  /transactionExecution = executeForwardMigrationTransaction\(\)/,
  "Forward mode must invoke only its one-migration transaction",
);
assert.doesNotMatch(
  forwardBranch,
  /executeAtomicMigrationTransaction\s*\(/,
  "Forward mode must never invoke the fresh 104-migration transaction",
);
assert.match(
  forwardBranch,
  /retentionAuthorityAcl = captureAndAssertRetentionAuthorityAcl/,
  "Forward mode must preserve table and column ACL hardening after migration 104",
);
assert.match(
  forwardBranch,
  /EXACT_FORWARD_COMMITTED_PORTFOLIO/,
  "Forward mode must emit an exact post-104 state",
);
assert.match(
  forwardBranch,
  /ROLLED_BACK_EXACT_PRIOR_103/,
  "Forward failures must distinguish exact rollback to the prior 103 state",
);
assert.match(
  forwardBranch,
  /FAILED_FORWARD_104_STATE_DETECTED_WITHOUT_COMMIT_PROOF/,
  "Forward failures must not attribute a raced exact-104 state to an unproven commit",
);
assert.match(
  forwardBranch,
  /process\.exit\(0\)/,
  "Successful forward application must not fall through into fresh apply",
);

const forwardMutationMarker = forwardBranch.indexOf('"staging-mutation-started.json"');
const forwardRemoteWrite = forwardBranch.indexOf(
  "transactionExecution = executeForwardMigrationTransaction();",
);
assert.ok(
  forwardMutationMarker >= 0 && forwardRemoteWrite > forwardMutationMarker,
  "Forward mutation-start evidence must precede migration 104",
);
assert.doesNotMatch(
  forwardBranch.slice(forwardMutationMarker, forwardRemoteWrite),
  /\bsql\s*\(|runPostgresCommand\s*\(/,
  "No remote operation may occur between the forward mutation marker and migration 104",
);

const freshBranch = source.slice(freshStart);
assert.match(
  freshBranch,
  /const retentionAuthorityAcl = captureAndAssertRetentionAuthorityAcl/,
  "Fresh application must prove table and column ACL hardening through migration 104",
);
assert.match(
  freshBranch,
  /\.\.\.retentionAuthorityAcl/,
  "Fresh proof and summary must seal the table and column ACL postconditions",
);

function exactEvidenceFixture({ count, kind, chained = false }) {
  const readOnly = kind === "read_only_exact_verification";
  const remoteStatus = readOnly
    ? "EXACT_EXISTING_COMMITTED_PORTFOLIO"
    : "EXACT_FORWARD_COMMITTED_PORTFOLIO";
  const common = {
    migrationCount: count,
    migrationHistoryCount: count,
    ...(readOnly
      ? {
          migrationMode: "VERIFY_EXISTING_EXACT",
          verificationReadOnly: true,
          remoteMutationStarted: false,
          remoteMutationCompleted: false,
          portfolioApplicationRemoteMutationCompleted: true,
        }
      : {
          migrationMode: "APPLY_FORWARD_EXACT",
          remoteMutationStarted: true,
          remoteMutationCompleted: true,
          portfolioApplicationRemoteMutationCompleted: true,
        }),
  };
  const proof = {
    schemaVersion: "dealflow.isolated-staging-migration-proof.v1",
    status: "PASS",
    ...common,
    ...(chained ? { priorApplication: { evidenceKind: "read_only_exact_verification" } } : {}),
    remoteStateVerification: readOnly
      ? {
          status: remoteStatus,
          readOnly: true,
          exactMigrationHistory: true,
          exactStructuralCatalog: true,
          exactNormalizedSchema: true,
        }
      : { status: remoteStatus, readOnly: true, exactCommittedPortfolioState: true },
  };
  const summary = {
    schemaVersion: "dealflow.staging-migration-summary.v1",
    status: "PASS",
    ...common,
    remoteStateVerificationStatus: remoteStatus,
  };
  const manifest = {
    schemaVersion: "dealflow.staging-evidence-manifest.v1",
    status: "PASS",
    ...common,
  };
  return {
    actualNames: readOnly
      ? [...PRIOR_MIGRATION_READ_ONLY_EXACT_ARTIFACTS]
      : [...PRIOR_MIGRATION_APPLICATION_ARTIFACTS],
    manifest,
    proof,
    summary,
  };
}

function committedForwardRecoveryFixture() {
  const expectedFinalVersion = "20260713028000";
  const common = {
    migrationMode: "APPLY_FORWARD_EXACT",
    forwardOnly: true,
    remoteMutationStarted: true,
    remoteMutationCompleted: true,
    migrationCount: 103,
    priorMigrationCount: 102,
    forwardMigrationCount: 1,
    forwardMigration: {
      version: expectedFinalVersion,
      file: `${expectedFinalVersion}_harden_account_deletion_retention_authority.sql`,
      sha256: "a".repeat(64),
    },
  };
  const manifest = {
    schemaVersion: "dealflow.staging-evidence-manifest.v1",
    status: "FAILED_AFTER_FORWARD_103_COMMIT",
    migrationMode: "APPLY_FORWARD_EXACT",
    remoteMutationStarted: true,
    remoteMutationCompleted: true,
  };
  const summary = {
    schemaVersion: "dealflow.staging-migration-summary.v1",
    status: "FAILED_AFTER_FORWARD_103_COMMIT",
    failureCode: "retention_table_or_column_acl_not_hardened",
    ...common,
    singleOuterTransaction: true,
    migrationHistoryReceiptsInsideOuterTransaction: true,
    lastAttemptedVersion: expectedFinalVersion,
    lastAppliedVersion: expectedFinalVersion,
    lastCommittedVersion: expectedFinalVersion,
  };
  const failure = {
    schemaVersion: "dealflow.isolated-staging-migration-failure.v1",
    status: "FAILED_AFTER_FORWARD_103_COMMIT",
    failureCode: "retention_table_or_column_acl_not_hardened",
    ...common,
  };
  const mutationStatus = {
    schemaVersion: "dealflow.staging-mutation-status.v1",
    status: "FAILED_AFTER_FORWARD_103_COMMIT",
    failureCode: "retention_table_or_column_acl_not_hardened",
    ...common,
    singleOuterTransaction: true,
    migrationHistoryReceiptsInsideOuterTransaction: true,
    transactionCommitMarkerSeen: true,
    attemptedCount: 1,
    appliedInTransactionCount: 1,
    processExitStatus: 0,
    processSignal: null,
    processError: false,
    processErrorCode: null,
    databaseSqlstate: null,
    lastAttemptedVersion: expectedFinalVersion,
    lastAppliedVersion: expectedFinalVersion,
    lastCommittedVersion: expectedFinalVersion,
    preflightStructuralCatalogSha256: "b".repeat(64),
    preflightNormalizedSchemaSha256: "c".repeat(64),
    postStructuralCatalogSha256: "d".repeat(64),
    postNormalizedSchemaSha256: "e".repeat(64),
  };
  return {
    expectedFinalVersion,
    args: {
      actualNames: [...PRIOR_MIGRATION_COMMITTED_FORWARD_RECOVERY_ARTIFACTS],
      manifest,
      proof: null,
      summary,
      failure,
      mutationStatus,
      expectedMigrationCount: 103,
      expectedFinalVersion,
    },
  };
}

const committedRecovery = committedForwardRecoveryFixture();
const exactCommittedRecoverySeal = {
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
};
assert.equal(
  isExactCommittedForwardRecoverySeal(exactCommittedRecoverySeal),
  true,
  "The one exact committed-forward seal must be accepted",
);
for (const field of Object.keys(exactCommittedRecoverySeal)) {
  assert.equal(
    isExactCommittedForwardRecoverySeal({
      ...exactCommittedRecoverySeal,
      [field]: "0".repeat(String(exactCommittedRecoverySeal[field]).length),
    }),
    false,
    `The committed-forward seal must reject a changed ${field}`,
  );
}
assert.equal(
  classifyPriorMigrationEvidence(committedRecovery.args).evidenceKind,
  "committed_forward_recovery",
  "Only the exact post-commit ACL-readback failure shape may enter read-only recovery",
);
for (const [label, mutate] of [
  ["ambiguous state", (value) => { value.mutationStatus.status = "FAILED_FORWARD_103_STATE_DETECTED_WITHOUT_COMMIT_PROOF"; }],
  ["pre-commit state", (value) => { value.summary.status = "ROLLED_BACK_EXACT_PRIOR_102"; }],
  ["missing commit marker", (value) => { value.mutationStatus.transactionCommitMarkerSeen = false; }],
  ["mutation not completed", (value) => { value.manifest.remoteMutationCompleted = false; }],
  ["wrong failure code", (value) => { value.failure.failureCode = "forward_103_atomic_transaction_failed"; }],
  ["wrong last commit", (value) => { value.mutationStatus.lastCommittedVersion = "20260713027000"; }],
  ["missing post catalog", (value) => { value.mutationStatus.postStructuralCatalogSha256 = null; }],
  ["missing post schema", (value) => { value.mutationStatus.postNormalizedSchemaSha256 = null; }],
  ["process failure", (value) => { value.mutationStatus.processExitStatus = 1; }],
  ["extra artifact", (value) => { value.actualNames.push("unsealed-extra.json"); }],
]) {
  const mutated = structuredClone(committedRecovery.args);
  mutate(mutated);
  assert.throws(
    () => classifyPriorMigrationEvidence(mutated),
    /exact sealed post-commit ACL-readback failure|exact supported sealed artifact set/,
    `Committed-forward recovery must reject ${label}`,
  );
}
assert.throws(
  () => classifyPriorMigrationEvidence({
    ...committedRecovery.args,
    requireApplicationEvidence: true,
  }),
  /requires an exact mutation-complete application proof/,
  "The one-time recovery shape must never be accepted as a normal forward-application proof",
);

const forward104Fixture = exactEvidenceFixture({ count: 104, kind: "application" });
assert.equal(
  classifyPriorMigrationEvidence({
    ...forward104Fixture,
    expectedMigrationCount: 104,
  }).evidenceKind,
  "application",
  "An exact migration-104 forward application proof must be accepted for current resume",
);
assert.throws(
  () => classifyPriorMigrationEvidence({
    ...exactEvidenceFixture({ count: 103, kind: "application" }),
    expectedMigrationCount: 104,
  }),
  /base identity/,
  "A migration-103 proof must be rejected as a current migration-104 resume proof",
);
assert.equal(
  classifyPriorMigrationEvidence({
    ...exactEvidenceFixture({ count: 103, kind: "application" }),
    expectedMigrationCount: 103,
    requireApplicationEvidence: true,
  }).evidenceKind,
  "application",
  "The generic classifier must retain support for an exact mutation-complete 103 proof",
);
assert.throws(
  () => classifyPriorMigrationEvidence({
    ...exactEvidenceFixture({ count: 103, kind: "read_only_exact_verification" }),
    expectedMigrationCount: 103,
    requireApplicationEvidence: true,
  }),
  /requires an exact mutation-complete application proof/,
  "The generic classifier must reject read-only proof when application evidence is explicitly required",
);
for (const chained of [false, true]) {
  assert.equal(
    classifyPriorMigrationEvidence({
      ...exactEvidenceFixture({
        count: 108,
        kind: "read_only_exact_verification",
        chained,
      }),
      expectedMigrationCount: 108,
    }).evidenceKind,
    "read_only_exact_verification",
    chained
      ? "A second exact read-only resume must accept the prior sealed read-only resume proof"
      : "The first exact read-only resume must accept the sealed migration-108 proof",
  );
}

const migrationFiles108 = Array.from({ length: 108 }, (_, index) => ({
  version: String(index + 1).padStart(14, "0"),
  file: `${String(index + 1).padStart(14, "0")}_migration.sql`,
  sha256: "a".repeat(64),
}));
const exactResumeIdentity = {
  evidenceKind: "read_only_exact_verification",
  applicationCommit: "b".repeat(40),
  applicationTree: "c".repeat(40),
  manifestSha256: "d".repeat(64),
  proofSha256: "e".repeat(64),
  summarySha256: "f".repeat(64),
  structuralCatalogSha256: "1".repeat(64),
  migrationCount: 108,
  lastCommittedVersion: migrationFiles108.at(-1).version,
  migrationFiles: migrationFiles108,
  migrationPortfolioSha256: "2".repeat(64),
  normalizedSchemaSha256: "3".repeat(64),
  singleOuterTransaction: true,
  migrationHistoryReceiptsInsideOuterTransaction: true,
  portfolioApplicationRemoteMutationCompleted: true,
};
const currentResumeArguments = {
  priorApplication: exactResumeIdentity,
  expectedMigrationCount: 108,
  expectedFinalVersion: migrationFiles108.at(-1).version,
  expectedMigrationPortfolioSha256: "2".repeat(64),
  expectedMigrationFiles: migrationFiles108,
  expectedNormalizedSchemaSha256: "3".repeat(64),
};
assert.equal(
  isExactCurrentResumeIdentity(currentResumeArguments),
  true,
  "Runner must accept a fully bound exact current-108 read-only resume identity",
);
assert.equal(
  isExactCurrentResumeIdentity({
    ...currentResumeArguments,
    priorApplication: { ...exactResumeIdentity, evidenceKind: "application" },
  }),
  true,
  "Runner must accept the fully bound exact successor application identity",
);
assert.equal(
  isExactCurrentResumeIdentity({
    ...currentResumeArguments,
    priorApplication: {
      ...exactResumeIdentity,
      evidenceKind: "committed_forward_recovery",
    },
  }),
  true,
  "Runner must accept the one exact committed-forward identity only for read-only reproof",
);
assert.equal(
  isExactCurrentResumeIdentity({
    ...currentResumeArguments,
    priorApplication: { ...exactResumeIdentity, migrationCount: 103 },
  }),
  false,
  "Runner must reject a 103-migration identity for current-108 resume",
);
assert.equal(
  isExactCurrentResumeIdentity({
    ...currentResumeArguments,
    priorApplication: {
      ...exactResumeIdentity,
      migrationFiles: migrationFiles108.slice(0, -1),
    },
  }),
  false,
  "Runner must reject incomplete migration filename/hash history",
);

let forcedFailureProof = "static atomicity contract";
const nativeConfigNames = [
  "DEALFLOW_NATIVE_PGBIN",
  "DEALFLOW_NATIVE_PGHOST",
  "DEALFLOW_NATIVE_PGPORT",
  "DEALFLOW_NATIVE_PGUSER",
];
if (nativeConfigNames.every((name) => process.env[name])) {
  const adapter = createNativePostgresTestAdapter({
    pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
    host: process.env.DEALFLOW_NATIVE_PGHOST,
    port: process.env.DEALFLOW_NATIVE_PGPORT,
    user: process.env.DEALFLOW_NATIVE_PGUSER,
    expectedVersion: "17.6",
    databasePrefix: `dfba_${process.pid}_${randomBytes(3).toString("hex")}`,
    timeoutMs: 120_000,
    maxOutputBytes: 4 * 1024 * 1024,
  });
  await adapter.withDisposableDatabase(async (database) => {
    const preflightCatalogIdentity = database.psql(catalogIdentityQuery, {
      label: "Capture forced-failure preflight structural identity",
    });
    database.psqlMustFail(
      `begin;
       create schema dealflow_atomicity_contract;
       create table dealflow_atomicity_contract.first_migration (id integer primary key);
       create schema supabase_migrations;
       create table supabase_migrations.schema_migrations (
         version text primary key,
         statements text[] not null default array[]::text[]
       );
       insert into dealflow_atomicity_contract.first_migration values (1);
       insert into supabase_migrations.schema_migrations values ('00000000000001', array[]::text[]);
       select 1 / 0;
       commit;`,
      /division by zero/,
      { label: "Force atomic staging migration transaction failure" },
    );
    assert.equal(
      database.psql(
        `select count(*) from pg_namespace
         where nspname in ('dealflow_atomicity_contract', 'supabase_migrations');`,
        { label: "Verify forced migration failure rolled back schemas and history" },
      ),
      "0",
      "Forced failure must roll back both application objects and migration-history receipts",
    );
    assert.equal(
      database.psql(catalogIdentityQuery, {
        label: "Capture forced-failure post-rollback structural identity",
      }),
      preflightCatalogIdentity,
      "Forced failure must restore the exact preflight structural-catalog identity",
    );
    database.psql(
      `do $roles$
       begin
         if not exists (select 1 from pg_roles where rolname='service_role') then
           create role service_role nologin;
         end if;
         if not exists (select 1 from pg_roles where rolname='anon') then
           create role anon nologin;
         end if;
         if not exists (select 1 from pg_roles where rolname='authenticated') then
           create role authenticated nologin;
         end if;
       end
       $roles$;
       create table public.account_deletion_retention_configuration (
         singleton boolean primary key,
         retention_days integer not null
       );
       alter table public.account_deletion_retention_configuration enable row level security;
       alter table public.account_deletion_retention_configuration force row level security;
       revoke all on public.account_deletion_retention_configuration from public, anon, authenticated, service_role;
       grant select on public.account_deletion_retention_configuration to service_role;`,
      { label: "Create NULL-column-ACL regression fixture" },
    );
    const retentionAcl = JSON.parse(database.psql(retentionAuthorityAclQuery, {
      label: "Execute exact NULL-safe retention ACL query",
    }));
    assert.equal(retentionAcl.serviceRoleSelect, true);
    assert.equal(retentionAcl.serviceRoleTableWrite, false);
    assert.equal(retentionAcl.serviceRoleMaintain, false);
    assert.equal(retentionAcl.serviceRoleColumnWrite, false);
    assert.equal(retentionAcl.publicColumnAclPresent, false);
    database.psql(
      "drop table public.account_deletion_retention_configuration;",
      { label: "Remove NULL-column-ACL regression fixture" },
    );
  });
  forcedFailureProof =
    "native PostgreSQL 17.6 forced-failure rollback plus NULL-column-ACL readback";
}

console.log(
  `tracked staging migration broker contract: PASS (single outer fresh 108-migration transaction, fail-closed read-only exact-existing resume, legacy 103-to-104 forward mode disabled for the successor, prior proof integrity/ancestry/schema binding, terminal failure/rollback evidence, ${forcedFailureProof}, self-bound SHA-256, pinned project, clean two-round seal, exact 108 migrations, Node 24, PostgreSQL 17.6, and external evidence fencing)`,
);
