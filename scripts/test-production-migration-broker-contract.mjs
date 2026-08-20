#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import {
  assertRecoverableHistory,
  buildSql,
  migrationPortfolio,
  partitionPortfolio,
} from "./production/run-exact-production-migrations.mjs";

const broker = fs.readFileSync("scripts/production/run-exact-production-migrations.mjs", "utf8");
const guardVerifier = fs.readFileSync("scripts/production/verify-release-guard-v5.mjs", "utf8");
for (const marker of [
  "EXPECTED_APPLIED = 59",
  "EXPECTED_TOTAL = 131",
  "EXPECTED_PENDING = 72",
  "20260426000000_forward_foundation_bootstrap.sql",
  "20260710160000_validate_and_normalize_pre_candidate_shape.sql",
  'FIRST_PRODUCTION_VERSION = "20260426110000"',
  'LAST_PRODUCTION_VERSION = "20260706170000"',
  "partitionPortfolio(portfolio)",
  "pg_advisory_lock",
  "lock_timeout = '3s'",
  "statement_timeout = '300s'",
  "pg_wal_lsn_diff",
  "FAILED_FIRST_ERROR",
  "migration_history_recovery_prefix_invalid",
]) assert.ok(broker.includes(marker), `migration broker marker missing: ${marker}`);
for (const marker of [
  "dealflow.release-guard.v5",
  "PRE_MUTATION_ADMISSION_PASS",
  "verifySignature",
  "release_guard_signature_expired_or_invalid",
]) assert.ok(guardVerifier.includes(marker), `release guard verifier marker missing: ${marker}`);
const result = spawnSync(
  process.execPath,
  ["scripts/production/run-exact-production-migrations.mjs", "--mode=self-test"],
  { encoding: "utf8" },
);
assert.equal(result.status, 0, result.stderr);
const output = JSON.parse(result.stdout);
assert.deepEqual(
  {
    status: output.status,
    total: output.total,
    applied: output.applied,
    pending: output.pending,
    firstAppliedVersion: output.firstAppliedVersion,
    lastAppliedVersion: output.lastAppliedVersion,
    foundationPending: output.foundationPending,
  },
  {
    status: "PASS",
    total: 131,
    applied: 59,
    pending: 72,
    firstAppliedVersion: "20260426110000",
    lastAppliedVersion: "20260706170000",
    foundationPending: true,
  },
);
assert.equal(
  output.portfolioSha256,
  "276feceaf16cd0d392baa5d90158ca19fa4d01db1d9860fa986d2f8329eabf1a",
  "production broker must bind the same canonical portfolio digest as qualification, staging, and release evidence",
);
assert.equal(output.foundationPending, true);
const portfolio = migrationPortfolio();
const partition = partitionPortfolio(portfolio);
const baseline = partition.applied.map((entry) => entry.version);
const firstRecoverable = partition.pending.slice(0, 5).map((entry) => entry.version);
const recovery = assertRecoverableHistory([...baseline, ...firstRecoverable], portfolio);
assert.deepEqual(recovery.completedPendingVersions, firstRecoverable);
assert.equal(recovery.remaining, 67);
assert.throws(
  () => assertRecoverableHistory([...baseline, partition.pending[0].version], portfolio),
  /Foundation and production-shape adoption|recoverable portfolio prefix|Remote migration history/i,
);
const recoverySql = buildSql(portfolio, { completedPendingVersions: firstRecoverable });
assert.ok(!recoverySql.includes("20260426000000_forward_foundation_bootstrap.sql"));
assert.ok(!recoverySql.includes("dealflow_foundation_guard"));
assert.equal((recoverySql.match(/^BEGIN;$/gm) ?? []).length, 67);
assert.doesNotMatch(
  broker.slice(broker.indexOf("export function buildSql"), broker.indexOf("function readRemoteHistory")),
  /for \(const entry of pending\) \{/,
  "production broker must not execute the fresh-only bootstrap as an ordinary pending migration",
);
console.log("production migration broker contract: PASS");
