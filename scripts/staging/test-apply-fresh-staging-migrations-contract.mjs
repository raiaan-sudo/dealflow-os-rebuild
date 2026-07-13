#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createNativePostgresTestAdapter } from "../lib/native-postgres-test-adapter.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const brokerPath = join(scriptDir, "apply-fresh-staging-migrations.mjs");
const source = readFileSync(brokerPath, "utf8");

function requireMarker(pattern, label) {
  assert.match(source, pattern, `Tracked staging broker is missing ${label}`);
}

requireMarker(/const exactMigrationCount = 102/, "the exact 102-migration gate");
requireMarker(
  /c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c/,
  "the isolated staging project fingerprint",
);
requireMarker(/const expectedProjectSafeSuffix = "qibh"/, "the qibh safe suffix");
requireMarker(/migrations\.length !== exactMigrationCount/, "exact migration-count rejection");
requireMarker(/requiredFinalMigration[\s\S]+20260713027000_add_ghl_location_display_name_finalization\.sql/, "the final migration pin");
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
requireMarker(/function executeAtomicMigrationTransaction\(\)/, "single-session atomic transaction executor");
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
const preflightEvidencePosition = source.indexOf(
  '"staging-broker-preflight.json"',
);
const preflightSummaryPosition = source.indexOf(
  '"staging-migration-summary.pre-mutation.json"',
);
const preflightManifestPosition = source.indexOf(
  '"evidence-manifest.pre-mutation.json"',
);
const remoteReadStartedPosition = source.indexOf(
  '"staging-remote-read-started.json"',
);
const firstRemoteReadPosition = source.indexOf(
  'serverVersion = sql("show server_version;"',
);
const mutationStartedPosition = source.indexOf('"staging-mutation-started.json"');
const firstRemoteMutationPosition = source.indexOf(
  "transactionExecution = executeAtomicMigrationTransaction();",
);

for (const [label, position] of Object.entries({
  selfBindingPosition,
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

requireMarker(/"staging-migration-proof\.json"/, "final proof evidence");
requireMarker(/"staging-migration-summary\.json"/, "final summary evidence");
requireMarker(/"evidence-manifest\.json"/, "final evidence manifest");
requireMarker(/preMutationManifestRecord[\s\S]+proofRecord[\s\S]+summaryRecord/, "final manifest artifact binding");
requireMarker(/manifestRecord\.sha256/, "stdout manifest digest");
requireMarker(/brokerSourceIdentity\.sha256/, "stdout broker digest");

assert.doesNotMatch(source, /PGPASSWORD/, "Broker must not place the database password in environment variables");
assert.doesNotMatch(source, /PGPASSFILE=<\(/, "Broker must not use libpq-incompatible process substitution");
assert.doesNotMatch(source, /migrations\.length < 102/, "Broker must not accept a partial migration portfolio");
assert.doesNotMatch(source, /dealflow-staging-tools-20260713/, "Tracked broker must not depend on the scratch source directory");

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
  });
  forcedFailureProof = "native PostgreSQL 17.6 forced-failure rollback";
}

console.log(
  `tracked staging migration broker contract: PASS (single outer transaction, terminal failure/rollback evidence, ${forcedFailureProof}, self-bound SHA-256, pre-mutation evidence/summary/manifest, pinned project, clean two-round seal, exact 102 migrations, Node 20, PostgreSQL 17.6, and external evidence fencing)`,
);
