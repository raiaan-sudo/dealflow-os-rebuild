#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createNativePostgresTestAdapter } from "../lib/native-postgres-test-adapter.mjs";
import {
  classifyPriorMigrationEvidence,
  isExactCommittedForwardRecoverySeal,
  isExactCurrentResumeIdentity,
  PRIOR_MIGRATION_APPLICATION_ARTIFACTS,
  PRIOR_MIGRATION_COMMITTED_FORWARD_RECOVERY_ARTIFACTS,
  PRIOR_MIGRATION_READ_ONLY_EXACT_ARTIFACTS,
} from "./prior-migration-proof-contract.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const brokerPath = join(scriptDir, "apply-fresh-staging-migrations.mjs");
const source = readFileSync(brokerPath, "utf8");
const priorProofContractSource = readFileSync(
  join(scriptDir, "prior-migration-proof-contract.mjs"),
  "utf8",
);
const trustBundle = readFileSync(
  join(scriptDir, "..", "..", "config", "security", "supabase-prod-ca-2021.crt"),
);

function requireMarker(pattern, label) {
  assert.match(source, pattern, `Tracked staging broker is missing ${label}`);
}

requireMarker(/const exactMigrationCount = 103/, "the exact 103-migration gate");
requireMarker(/const expectedPriorMigrationCount = 102/, "the pinned prior 102-migration gate");
requireMarker(
  /c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c/,
  "the isolated staging project fingerprint",
);
requireMarker(/const expectedProjectSafeSuffix = "qibh"/, "the qibh safe suffix");
requireMarker(/--verify-existing-exact/, "explicit existing-portfolio verification mode");
requireMarker(/--apply-forward-exact/, "explicit exact forward-only migration mode");
requireMarker(/PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=300000"/, "database-enforced read-only resume mode");
requireMarker(
  /function loadAndValidatePriorMigrationProof\(\{ requirePinnedPrior102 \}\)/,
  "prior atomic proof validator",
);
requireMarker(/Prior migration proof artifact does not match its sealed digest/, "prior artifact digest verification");
requireMarker(/Prior migration proof does not match the exact pinned application seal/, "exact prior seal pin");
requireMarker(/isExactCommittedForwardRecoverySeal/, "dedicated committed-forward recovery seal gate");
assert.match(priorProofContractSource, /cc3e8c91f0f95a61b4b2f8e0c113367781e80bdf01ccf3a727a64cf664b2b6c7/, "exact failed-forward manifest pin");
assert.match(priorProofContractSource, /2546b7c44116e0920534ef58f649acd9c037c586/, "exact failed-forward commit pin");
assert.match(priorProofContractSource, /9c404170b7a5a4708d4685a6c22f540894eabf2e/, "exact failed-forward tree pin");
requireMarker(/SEALED_FORWARD_103_COMMIT_REQUIRES_READ_ONLY_REPROOF/, "dedicated read-only recovery identity");
requireMarker(/e776f38b5302dda525d51cf03e4668568e272a77/, "prior application commit pin");
requireMarker(/0fcf11214ed3ae097003f737077cd7c67cdedfb7/, "prior application tree pin");
requireMarker(/877652c58c862dc9252c201e306890253f7189757c0d3cc3dbbd57d8afc26df4/, "prior manifest digest pin");
requireMarker(/merge-base", "--is-ancestor"/, "prior application ancestry binding");
requireMarker(/migrationMode: "VERIFY_EXISTING_EXACT"/, "truthful existing-portfolio mode evidence");
requireMarker(/portfolioApplicationRemoteMutationCompleted: true/, "separate historical application truth");
requireMarker(/remoteMutationStarted: false/, "read-only resume mutation-start truth");
requireMarker(/remoteMutationCompleted: false/, "read-only resume mutation-completion truth");
requireMarker(/EXACT_EXISTING_COMMITTED_PORTFOLIO/, "exact existing portfolio result");
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
requireMarker(/expectedPriorFinalMigration[\s\S]+20260713027000_add_ghl_location_display_name_finalization\.sql/, "the prior final migration pin");
requireMarker(/requiredFinalMigration[\s\S]+20260713028000_harden_account_deletion_retention_authority\.sql/, "the final migration 103 pin");
requireMarker(/Two distinct final-verification summaries are required/, "two distinct verification rounds");
requireMarker(/summary\.schemaVersion !== "dealflow\.final-verification\.v3"/, "verification summary schema binding");
requireMarker(/NO_GO_AUTHENTICATED_PROOF_DEFERRED/, "hosted-only local-gate status binding");
requireMarker(/expectedHostedVerificationDeferrals/, "hosted-only deferral allowlist");
requireMarker(/summary\.blockedCount !== expectedHostedVerificationDeferrals\.length/, "exact hosted blocker count");
requireMarker(/item\.status !== "authenticated_deferred"/, "authenticated deferral status binding");
for (const deferredCommand of [
  "npm run rls:cross-tenant",
  "npm run rls:fixture-smoke",
  "npm run operator:debt",
]) {
  requireMarker(new RegExp(deferredCommand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${deferredCommand} allowlist entry`);
}
requireMarker(/!\/\^v20\\\.\/[\s\S]*summary\.runtime/, "Node 20 verification-round binding");
requireMarker(/staging migration broker requires Node 20/, "Node 20 execution gate");
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
  /forwardMigrationSources = migrationSources\.slice\(expectedPriorMigrationCount\)/,
  "forward tranche selection after the pinned 102 migrations",
);
requireMarker(
  /forwardMigrationSources\.length !== 1[\s\S]+forwardMigrationSources\[0\]\?\.file !== requiredFinalMigration/,
  "exact one-file migration 103 forward gate",
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
requireMarker(/function captureRemoteStructuralState\(labelPrefix\)/, "read-only remote state recapture");
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

requireMarker(/"staging-migration-proof\.json"/, "final proof evidence");
requireMarker(/"staging-migration-summary\.json"/, "final summary evidence");
requireMarker(/"evidence-manifest\.json"/, "final evidence manifest");
requireMarker(/preMutationManifestRecord[\s\S]+proofRecord[\s\S]+summaryRecord/, "final manifest artifact binding");
requireMarker(/manifestRecord\.sha256/, "stdout manifest digest");
requireMarker(/brokerSourceIdentity\.sha256/, "stdout broker digest");

assert.doesNotMatch(source, /PGPASSWORD/, "Broker must not place the database password in environment variables");
assert.doesNotMatch(source, /PGPASSFILE=<\(/, "Broker must not use libpq-incompatible process substitution");
assert.doesNotMatch(source, /migrations\.length < 103/, "Broker must not accept a partial migration portfolio");
assert.doesNotMatch(source, /dealflow-staging-tools-20260713/, "Tracked broker must not depend on the scratch source directory");

const resumeStart = source.indexOf('if (migrationMode === "VERIFY_EXISTING_EXACT") {');
const forwardStart = source.indexOf('if (migrationMode === "APPLY_FORWARD_EXACT") {');
const freshStart = source.indexOf("const preMutationEvidence = {");
assert.ok(
  resumeStart >= 0 && forwardStart > resumeStart && freshStart > forwardStart,
  "Resume and forward modes must be discrete pre-fresh branches",
);
const resumeBranch = source.slice(resumeStart, forwardStart);
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
  /loadAndValidatePriorMigrationProof\(\{[\s\S]+requirePinnedPrior102: true/,
  "Forward mode must load only the pinned prior 102 proof",
);
assert.match(
  forwardBranch,
  /first 102 migration filenames and SQL hashes are not the pinned prior portfolio/,
  "Forward mode must reject any drift in the first 102 migration files",
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
  "Forward mode must never invoke the fresh 103-migration transaction",
);
assert.match(
  forwardBranch,
  /retentionAuthorityAcl = captureAndAssertRetentionAuthorityAcl/,
  "Forward mode must prove table and column ACL hardening after migration 103",
);
assert.match(
  forwardBranch,
  /EXACT_FORWARD_COMMITTED_PORTFOLIO/,
  "Forward mode must emit an exact post-103 state",
);
assert.match(
  forwardBranch,
  /ROLLED_BACK_EXACT_PRIOR_102/,
  "Forward failures must distinguish exact rollback to the prior 102 state",
);
assert.match(
  forwardBranch,
  /FAILED_FORWARD_103_STATE_DETECTED_WITHOUT_COMMIT_PROOF/,
  "Forward failures must not attribute a raced exact-103 state to an unproven commit",
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
  "Forward mutation-start evidence must precede migration 103",
);
assert.doesNotMatch(
  forwardBranch.slice(forwardMutationMarker, forwardRemoteWrite),
  /\bsql\s*\(|runPostgresCommand\s*\(/,
  "No remote operation may occur between the forward mutation marker and migration 103",
);

const freshBranch = source.slice(freshStart);
assert.match(
  freshBranch,
  /const retentionAuthorityAcl = captureAndAssertRetentionAuthorityAcl/,
  "Fresh application must prove table and column ACL hardening after migration 103",
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

const forward103Fixture = exactEvidenceFixture({ count: 103, kind: "application" });
assert.equal(
  classifyPriorMigrationEvidence({
    ...forward103Fixture,
    expectedMigrationCount: 103,
  }).evidenceKind,
  "application",
  "An exact migration-103 forward application proof must be accepted for current resume",
);
assert.throws(
  () => classifyPriorMigrationEvidence({
    ...exactEvidenceFixture({ count: 102, kind: "application" }),
    expectedMigrationCount: 103,
  }),
  /base identity/,
  "A migration-102 proof must be rejected as a current migration-103 resume proof",
);
assert.equal(
  classifyPriorMigrationEvidence({
    ...exactEvidenceFixture({ count: 102, kind: "application" }),
    expectedMigrationCount: 102,
    requireApplicationEvidence: true,
  }).evidenceKind,
  "application",
  "Pinned forward mode must retain support for its exact mutation-complete 102 proof",
);
assert.throws(
  () => classifyPriorMigrationEvidence({
    ...exactEvidenceFixture({ count: 102, kind: "read_only_exact_verification" }),
    expectedMigrationCount: 102,
    requireApplicationEvidence: true,
  }),
  /requires an exact mutation-complete application proof/,
  "Pinned forward mode must reject a read-only proof even when it describes 102 migrations",
);
for (const chained of [false, true]) {
  assert.equal(
    classifyPriorMigrationEvidence({
      ...exactEvidenceFixture({
        count: 103,
        kind: "read_only_exact_verification",
        chained,
      }),
      expectedMigrationCount: 103,
    }).evidenceKind,
    "read_only_exact_verification",
    chained
      ? "A second exact read-only resume must accept the prior sealed read-only resume proof"
      : "The first exact read-only resume must accept the sealed migration-103 proof",
  );
}

const migrationFiles103 = Array.from({ length: 103 }, (_, index) => ({
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
  migrationCount: 103,
  lastCommittedVersion: migrationFiles103.at(-1).version,
  migrationFiles: migrationFiles103,
  migrationPortfolioSha256: "2".repeat(64),
  normalizedSchemaSha256: "3".repeat(64),
  singleOuterTransaction: true,
  migrationHistoryReceiptsInsideOuterTransaction: true,
  portfolioApplicationRemoteMutationCompleted: true,
};
const currentResumeArguments = {
  priorApplication: exactResumeIdentity,
  expectedMigrationCount: 103,
  expectedFinalVersion: migrationFiles103.at(-1).version,
  expectedMigrationPortfolioSha256: "2".repeat(64),
  expectedMigrationFiles: migrationFiles103,
  expectedNormalizedSchemaSha256: "3".repeat(64),
};
assert.equal(
  isExactCurrentResumeIdentity(currentResumeArguments),
  true,
  "Runner must accept a fully bound exact current-103 read-only resume identity",
);
assert.equal(
  isExactCurrentResumeIdentity({
    ...currentResumeArguments,
    priorApplication: { ...exactResumeIdentity, evidenceKind: "application" },
  }),
  true,
  "Runner must accept the fully bound exact migration-103 forward application identity",
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
    priorApplication: { ...exactResumeIdentity, migrationCount: 102 },
  }),
  false,
  "Runner must reject a 102-migration identity for current-103 resume",
);
assert.equal(
  isExactCurrentResumeIdentity({
    ...currentResumeArguments,
    priorApplication: {
      ...exactResumeIdentity,
      migrationFiles: migrationFiles103.slice(0, -1),
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
  `tracked staging migration broker contract: PASS (single outer fresh transaction, fail-closed read-only exact-existing resume, exact pinned-102 to one-migration-103 forward transaction, prior proof integrity/ancestry/schema binding, terminal failure/rollback evidence, ${forcedFailureProof}, self-bound SHA-256, pinned project, clean two-round seal, exact 103 migrations, Node 20, PostgreSQL 17.6, and external evidence fencing)`,
);
