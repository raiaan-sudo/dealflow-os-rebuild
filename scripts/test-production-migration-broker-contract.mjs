#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const broker = fs.readFileSync("scripts/production/run-exact-production-migrations.mjs", "utf8");
const guardVerifier = fs.readFileSync("scripts/production/verify-release-guard-v5.mjs", "utf8");
for (const marker of [
  "EXPECTED_APPLIED = 59",
  "EXPECTED_TOTAL = 129",
  "EXPECTED_PENDING = 70",
  "20260426000000_forward_foundation_bootstrap.sql",
  "pg_advisory_lock",
  "lock_timeout = '3s'",
  "statement_timeout = '300s'",
  "pg_wal_lsn_diff",
  "FAILED_FIRST_ERROR",
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
  { status: output.status, total: output.total, applied: output.applied, pending: output.pending },
  { status: "PASS", total: 129, applied: 59, pending: 70 },
);
assert.match(output.portfolioSha256, /^[0-9a-f]{64}$/);
console.log("production migration broker contract: PASS");
