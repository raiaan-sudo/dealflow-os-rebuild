#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { verifyReleaseGuardV5 } from "./verify-release-guard-v5.mjs";
import { verifyMigrationDatabaseTarget } from "./migration-target-authority.mjs";
import { verifyPinnedPsql } from "./verify-pinned-psql.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const EXPECTED_APPLIED = 59;
const EXPECTED_TOTAL = 129;
const EXPECTED_PENDING = 70;
const EXPECTED_SAFE_SUFFIX = "phxm";
const EXPECTED_PROJECT_FINGERPRINT =
  "ad5e80fbea50d6e2ccc5112a81de18e14f5b44722b07a216a715e78ee6dce321";
const FOUNDATION = "20260426000000_forward_foundation_bootstrap.sql";
const FIRST_PRODUCTION_VERSION = "20260426110000";
const LAST_PRODUCTION_VERSION = "20260706170000";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function migrationPortfolio() {
  const digest = crypto.createHash("sha256");
  const entries = fs
    .readdirSync(MIGRATIONS)
    .filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name))
    .sort()
    .map((name) => {
      const body = fs.readFileSync(path.join(MIGRATIONS, name));
      digest.update(String(Buffer.byteLength(name)));
      digest.update("\0");
      digest.update(name);
      digest.update("\0");
      digest.update(String(body.byteLength));
      digest.update("\0");
      digest.update(body);
      digest.update("\0");
      return {
        name,
        version: name.slice(0, 14),
        bytes: body.length,
        sha256: sha256(body),
      };
    });
  return { entries, digest: digest.digest("hex") };
}

function assertPortfolio(portfolio) {
  if (portfolio.entries.length !== EXPECTED_TOTAL) {
    fail("migration_portfolio_count_mismatch", "Expected exactly 129 migrations.");
  }
  if (portfolio.entries[0]?.name !== FOUNDATION) {
    fail(
      "migration_foundation_not_first",
      "The authoritative foundation migration is not first.",
    );
  }
  const partition = partitionPortfolio(portfolio);
  if (partition.applied.length !== EXPECTED_APPLIED ||
    partition.pending.length !== EXPECTED_PENDING ||
    partition.applied[0]?.version !== FIRST_PRODUCTION_VERSION ||
    partition.applied.at(-1)?.version !== LAST_PRODUCTION_VERSION ||
    partition.pending[0]?.name !== FOUNDATION ||
    new Set(portfolio.entries.map((entry) => entry.version)).size !== EXPECTED_TOTAL) {
    fail("migration_portfolio_delta_mismatch", "The exact 59-to-129 delta is invalid.");
  }
}

function partitionPortfolio(portfolio) {
  const applied = portfolio.entries.filter((entry) =>
    entry.name !== FOUNDATION &&
    entry.version >= FIRST_PRODUCTION_VERSION &&
    entry.version <= LAST_PRODUCTION_VERSION,
  );
  const appliedVersions = new Set(applied.map((entry) => entry.version));
  const pending = portfolio.entries.filter((entry) => !appliedVersions.has(entry.version));
  return { applied, pending };
}

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((part) => {
      const [key, ...rest] = part.replace(/^--/, "").split("=");
      return [key, rest.join("=") || "true"];
    }),
  );
  const mode = args.mode ?? "self-test";
  if (!["self-test", "rehearsal", "production-apply"].includes(mode)) {
    fail("migration_mode_invalid", "Unsupported migration mode.");
  }
  return { mode, evidenceDir: args["evidence-dir"] };
}

function readOwnerRecord(file, schema) {
  if (!file || !path.isAbsolute(file)) {
    fail("owner_record_path_invalid", "Owner record must be outside the repository.");
  }
  const normalizedRoot = fs.realpathSync(ROOT);
  const normalizedFile = fs.realpathSync(file);
  const relationship = path.relative(normalizedRoot, normalizedFile);
  if (
    relationship === "" ||
    (!relationship.startsWith(`..${path.sep}`) && relationship !== "..") ||
    path.isAbsolute(relationship)
  ) {
    fail("owner_record_path_invalid", "Owner record must be outside the repository.");
  }
  const stat = fs.lstatSync(file);
  const resolvedStat = fs.statSync(normalizedFile);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    !resolvedStat.isFile() ||
    (resolvedStat.mode & 0o077) !== 0
  ) {
    fail("owner_record_permissions_invalid", "Owner record must be a 0600 regular file.");
  }
  const record = JSON.parse(fs.readFileSync(normalizedFile, "utf8"));
  if (record.schema !== schema) fail("owner_record_schema_invalid", "Owner record schema mismatch.");
  return record;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function stripOuterTransaction(name, sql) {
  const begins = [...sql.matchAll(/^BEGIN\s*;\s*$/gim)];
  const commits = [...sql.matchAll(/^COMMIT\s*;\s*$/gim)];
  if (name === "20260710160000_validate_and_normalize_pre_candidate_shape.sql") {
    if (begins.length !== 1 || commits.length !== 1) {
      fail("migration_transaction_boundary_drift", `${name} transaction boundary drifted.`);
    }
    return sql.replace(/^BEGIN\s*;\s*$/im, "").replace(/^COMMIT\s*;\s*$/im, "");
  }
  if (begins.length !== 0 || commits.length !== 0) {
    fail("migration_transaction_boundary_unexpected", `${name} unexpectedly owns a transaction.`);
  }
  return sql;
}

function buildSql(portfolio) {
  const { pending } = partitionPortfolio(portfolio);
  const sections = [
    "\\set ON_ERROR_STOP on",
    "SELECT pg_advisory_lock(hashtextextended('dealflow-exact-production-migrations', 0));",
    "CREATE TEMP TABLE dealflow_migration_observation(name text, elapsed_ms numeric, wal_bytes numeric, lock_count bigint) ON COMMIT PRESERVE ROWS;",
  ];
  for (const entry of pending) {
    const body = stripOuterTransaction(
      entry.name,
      fs.readFileSync(path.join(MIGRATIONS, entry.name), "utf8"),
    );
    sections.push(
      "BEGIN;",
      "SET LOCAL lock_timeout = '3s';",
      "SET LOCAL statement_timeout = '300s';",
      `SELECT clock_timestamp() AS started_at, pg_current_wal_lsn() AS started_lsn, (SELECT count(*) FROM pg_locks WHERE pid=pg_backend_pid()) AS started_locks \\gset`,
      body,
      `INSERT INTO supabase_migrations.schema_migrations(version, statements) VALUES (${sqlLiteral(entry.version)}, ARRAY[]::text[]);`,
      `INSERT INTO dealflow_migration_observation SELECT ${sqlLiteral(entry.name)}, extract(epoch FROM (clock_timestamp() - :'started_at'::timestamptz))*1000, pg_wal_lsn_diff(pg_current_wal_lsn(), :'started_lsn'::pg_lsn), (SELECT count(*) FROM pg_locks WHERE pid=pg_backend_pid());`,
      "COMMIT;",
    );
  }
  sections.push(
    "\\echo DEALFLOW_OBSERVATIONS_BEGIN",
    "\\copy (SELECT name, elapsed_ms, wal_bytes, lock_count FROM dealflow_migration_observation ORDER BY name) TO STDOUT WITH (FORMAT CSV, HEADER TRUE)",
    "\\echo DEALFLOW_OBSERVATIONS_END",
    "SELECT pg_advisory_unlock(hashtextextended('dealflow-exact-production-migrations', 0));",
  );
  return `${sections.join("\n")}\n`;
}

function assertRemoteHistory(psql, connection, password, expectedVersions) {
  const query =
    "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;";
  const result = spawnSync(psql, [connection, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: password },
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) fail("migration_history_query_failed", "Migration history query failed.");
  const actual = result.stdout.trim().split(/\s+/).filter(Boolean);
  if (
    actual.length !== expectedVersions.length ||
    actual.some((version, index) => version !== expectedVersions[index])
  ) {
    fail("migration_history_exact_mismatch", "Remote migration history is not the exact expected prefix.");
  }
}

function writeEvidence(dir, name, payload) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const file = path.join(dir, name);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

function exactSourceIdentity() {
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const commit = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (
    status.status !== 0 ||
    status.stdout.trim() ||
    commit.status !== 0 ||
    tree.status !== 0 ||
    !/^[0-9a-f]{40}$/.test(commit.stdout.trim()) ||
    !/^[0-9a-f]{40}$/.test(tree.stdout.trim())
  ) {
    fail("migration_source_not_clean_seal", "Migration execution requires one exact clean Git seal.");
  }
  return { commit: commit.stdout.trim(), tree: tree.stdout.trim() };
}

function parseObservations(stdout) {
  const match = stdout.match(
    /DEALFLOW_OBSERVATIONS_BEGIN\s*\n([\s\S]*?)DEALFLOW_OBSERVATIONS_END/,
  );
  if (!match) fail("migration_observations_missing", "Migration observations were not returned.");
  const rows = match[1].trim().split("\n");
  if (rows.shift()?.trim() !== "name,elapsed_ms,wal_bytes,lock_count") {
    fail("migration_observations_invalid", "Migration observation header is invalid.");
  }
  const observations = rows.filter(Boolean).map((line) => {
    const [name, elapsedMs, walBytes, lockCount] = line.split(",");
    if (
      !/^\d{14}_[a-z0-9_]+\.sql$/.test(name) ||
      ![elapsedMs, walBytes, lockCount].every((value) => /^\d+(?:\.\d+)?$/.test(value))
    ) {
      fail("migration_observations_invalid", "Migration observation row is invalid.");
    }
    return {
      name,
      elapsedMs: Number(elapsedMs),
      walBytes: Number(walBytes),
      lockCount: Number(lockCount),
    };
  });
  if (observations.length !== EXPECTED_PENDING) {
    fail("migration_observations_incomplete", "Not all 70 migration observations were returned.");
  }
  return observations;
}

function main() {
  const { mode, evidenceDir } = parseArgs();
  const portfolio = migrationPortfolio();
  assertPortfolio(portfolio);
  if (mode === "self-test") {
    const partition = partitionPortfolio(portfolio);
    const generatedSql = buildSql(portfolio);
    const owningBody = stripOuterTransaction(
      "20260710160000_validate_and_normalize_pre_candidate_shape.sql",
      fs.readFileSync(
        path.join(
          MIGRATIONS,
          "20260710160000_validate_and_normalize_pre_candidate_shape.sql",
        ),
        "utf8",
      ),
    );
    if (
      /^BEGIN\s*;\s*$/im.test(owningBody) ||
      /^COMMIT\s*;\s*$/im.test(owningBody) ||
      (generatedSql.match(/^BEGIN;$/gm) ?? []).length !== EXPECTED_PENDING ||
      (generatedSql.match(/^COMMIT;$/gm) ?? []).length !== EXPECTED_PENDING
    ) {
      fail("migration_transaction_structure_invalid", "Generated migration transactions are not exactly one per file.");
    }
    process.stdout.write(
      `${JSON.stringify({
        status: "PASS",
        total: 129,
        applied: partition.applied.length,
        pending: partition.pending.length,
        firstAppliedVersion: partition.applied[0]?.version,
        lastAppliedVersion: partition.applied.at(-1)?.version,
        foundationPending: partition.pending[0]?.name === FOUNDATION,
        portfolioSha256: portfolio.digest,
      })}\n`,
    );
    return;
  }

  if (!evidenceDir || !path.isAbsolute(evidenceDir)) {
    fail("evidence_directory_invalid", "Evidence directory must be absolute and outside the repository.");
  }
  const evidenceParent = fs.realpathSync(path.dirname(evidenceDir));
  const normalizedEvidenceDir = path.join(evidenceParent, path.basename(evidenceDir));
  const evidenceRelationship = path.relative(fs.realpathSync(ROOT), normalizedEvidenceDir);
  if (
    evidenceRelationship === "" ||
    (!evidenceRelationship.startsWith(`..${path.sep}`) &&
      evidenceRelationship !== "..") ||
    path.isAbsolute(evidenceRelationship)
  ) {
    fail("evidence_directory_invalid", "Evidence directory must resolve outside the repository.");
  }
  const projectRecord = readOwnerRecord(
    process.env.DEALFLOW_MIGRATION_PROJECT_RECORD,
    "dealflow.migration-project-record.v1",
  );
  const source = exactSourceIdentity();
  let releaseGuard = null;
  if (mode === "production-apply") {
    releaseGuard = verifyReleaseGuardV5({
      root: ROOT,
      guardPath: process.env.DEALFLOW_RELEASE_GUARD_V5_PATH,
      signaturePath: process.env.DEALFLOW_RELEASE_GUARD_V5_SIGNATURE_PATH,
      trustPolicyPath: process.env.DEALFLOW_RELEASE_TRUST_POLICY_PATH,
      trustPolicySha256:
        process.env.DEALFLOW_RELEASE_TRUST_POLICY_SHA256?.trim().toLowerCase(),
    });
    const guard = releaseGuard.guard;
    if (
      projectRecord.safeSuffix !== EXPECTED_SAFE_SUFFIX ||
      projectRecord.projectFingerprint !== EXPECTED_PROJECT_FINGERPRINT ||
      guard.release?.target !== source.commit ||
      guard.release?.targetTree !== source.tree
    ) {
      fail("release_admission_invalid", "Signed Release Guard v5 does not bind the exact production candidate.");
    }
  } else if (
    process.env.DEALFLOW_PRODUCTION_SHAPE_REHEARSAL !== "true" ||
    projectRecord.projectFingerprint === EXPECTED_PROJECT_FINGERPRINT ||
    projectRecord.syntheticOnly !== true
  ) {
    fail("rehearsal_boundary_invalid", "Rehearsal must use an isolated synthetic project.");
  }

  const psql = process.env.DEALFLOW_NATIVE_PSQL;
  const expectedPsqlSha256 =
    process.env.DEALFLOW_NATIVE_PSQL_SHA256?.trim().toLowerCase();
  const expectedPsqlVersion =
    process.env.DEALFLOW_NATIVE_PSQL_VERSION?.trim();
  const connection = process.env.DEALFLOW_DATABASE_URL;
  const passwordService = process.env.DEALFLOW_DATABASE_PASSWORD_KEYCHAIN_SERVICE;
  const passwordAccount = process.env.DEALFLOW_DATABASE_PASSWORD_KEYCHAIN_ACCOUNT;
  if (
    !connection ||
    !passwordService ||
    !passwordAccount
  ) {
    fail("migration_runtime_authority_missing", "Pinned psql, connection, and Keychain authority are required.");
  }
  const resolvedPsql = verifyPinnedPsql({
    psql,
    expectedSha256: expectedPsqlSha256,
    expectedVersion: expectedPsqlVersion,
  });
  verifyMigrationDatabaseTarget({
    connection,
    projectRecord,
    production: mode === "production-apply",
    expectedProjectFingerprint: EXPECTED_PROJECT_FINGERPRINT,
  });
  const passwordResult = spawnSync("/usr/bin/security", [
    "find-generic-password", "-w", "-s", passwordService, "-a", passwordAccount,
  ], { encoding: "utf8" });
  if (passwordResult.status !== 0 || !passwordResult.stdout.trim()) {
    fail("migration_password_unavailable", "Database password is unavailable from Keychain.");
  }
  const password = passwordResult.stdout.trim();
  const partition = partitionPortfolio(portfolio);
  const expectedApplied = partition.applied.map((entry) => entry.version);
  assertRemoteHistory(resolvedPsql, connection, password, expectedApplied);
  const sql = buildSql(portfolio);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "dealflow-migrations-"));
  const sqlFile = path.join(temp, "apply.sql");
  fs.writeFileSync(sqlFile, sql, { mode: 0o600 });
  const startedAt = new Date().toISOString();
  const apply = spawnSync(resolvedPsql, [connection, "-X", "-v", "ON_ERROR_STOP=1", "-f", sqlFile], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: password },
    maxBuffer: 16 * 1024 * 1024,
  });
  fs.rmSync(temp, { recursive: true, force: true });
  if (apply.status !== 0) {
    writeEvidence(normalizedEvidenceDir, "migration-failure.json", {
      schema: "dealflow.exact-migration-result.v1",
      mode,
      status: "FAILED_FIRST_ERROR",
      startedAt,
      finishedAt: new Date().toISOString(),
      portfolioSha256: portfolio.digest,
      errorCategory: "psql_apply_failed",
    });
    fail("migration_apply_failed", "Migration apply stopped at the first error.");
  }
  assertRemoteHistory(
    resolvedPsql,
    connection,
    password,
    portfolio.entries.map((entry) => entry.version),
  );
  const observations = parseObservations(apply.stdout);
  writeEvidence(normalizedEvidenceDir, "migration-result.json", {
    schema: "dealflow.exact-migration-result.v1",
    mode,
    status: "PASS",
    startedAt,
    finishedAt: new Date().toISOString(),
    expectedBefore: 59,
    applied: 70,
    verifiedAfter: 129,
    portfolioSha256: portfolio.digest,
    entries: portfolio.entries,
    observations,
  });
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error?.code ?? "migration_broker_failed"}\n`);
  process.exitCode = 1;
}
