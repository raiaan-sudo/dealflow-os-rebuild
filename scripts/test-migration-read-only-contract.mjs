#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const preflight = fs.readFileSync(
  path.join(root, "docs/dealflow-completion/evidence/migration/read-only-preflight.sql"),
  "utf8",
);
const postMigration = fs.readFileSync(
  path.join(
    root,
    "docs/dealflow-completion/evidence/migration/read-only-post-migration-verification.sql",
  ),
  "utf8",
);
const migrationContract = fs.readFileSync(
  path.join(root, "docs/dealflow-completion/MIGRATION_AND_ROLLBACK.md"),
  "utf8",
);

for (const [label, sql] of [
  ["pre-application", preflight],
  ["post-application", postMigration],
]) {
  assert.match(
    sql,
    /begin transaction isolation level repeatable read read only;/i,
    `${label} SQL must open an explicit read-only transaction`,
  );
  assert.match(sql, /commit;/i, `${label} SQL must close its read-only transaction`);
  assert.doesNotMatch(
    sql,
    /^\s*(?:insert|update|delete|truncate|alter|create|drop|grant|revoke|call)\b/im,
    `${label} SQL contains a mutating statement`,
  );
  const topLevelSelects = sql
    .split(/\r?\n/)
    .filter((line) => line.startsWith("select "));
  assert.ok(topLevelSelects.length > 0, `${label} SQL has no top-level evidence query`);
  for (const selectLine of topLevelSelects) {
    assert.match(
      selectLine,
      /^select (?:to_regclass|count\(\*\)|not has_table_privilege)/,
      `${label} SQL exposes a value instead of booleans or aggregate counts: ${selectLine}`,
    );
  }
}

assert.doesNotMatch(
  preflight,
  /\b(?:ghl_location_mappings|system_job_effects|commercial_activations|campaign_launch_records|support_notification_outbox)\b/,
  "pre-application SQL references a candidate-only relation",
);
assert.match(postMigration, /duplicate_routable_workspace_mappings/);
assert.match(postMigration, /exhausted_support_rows_not_operator_owned/);
assert.match(postMigration, /exhausted_ghl_fake_effects_not_operator_owned/);
assert.match(postMigration, /ghl_receipt_direct_insert_denied/);

assert.match(
  migrationContract,
  /Overall verdict: `NO_GO`/,
);
assert.match(migrationContract, /Frozen foundation: `80 MIGRATIONS \/ HISTORICAL_PASS`/);
assert.match(migrationContract, /Integrated candidate: `103 MIGRATIONS \/ PENDING_FINAL_SEAL`/);
assert.match(migrationContract, /Exact clean-seal 103-chain proof: `NOT_YET_RUN`/);
assert.match(
  migrationContract,
  /retained PostgreSQL 17\.6 evidence\s+for 14 foundation\/adoption\/collision\/RLS\/recovery gates/,
);
assert.match(
  migrationContract,
  /`HISTORICAL_PASS` for migrations 1-80; it is not proof of the current extensions/,
);
assert.match(migrationContract, /current source tree contains exactly 103 ordered SQL migrations/);
assert.match(migrationContract, /The twenty-three\s+additive extensions after the frozen foundation/);
assert.match(
  migrationContract,
  /103\. `20260713028000_harden_account_deletion_retention_authority\.sql`/,
);
assert.match(migrationContract, /only database-owner authority may mutate it/);
assert.match(migrationContract, /service role retains `INSERT`, `UPDATE`, `DELETE`, or\s+`TRUNCATE` privileges/);
assert.match(
  migrationContract,
  /Current result for the exact final 103-migration seal: `NOT_YET_RUN`/,
);
assert.match(
  migrationContract,
  /Mandatory old-worker and provider-protocol drain/,
);
assert.match(migrationContract, /signed exact-deployment evidence must prove zero/);
assert.match(migrationContract, /Signed drain proof is `NOT_YET_RUN`/);
assert.match(
  migrationContract,
  /historical\s+baseline is not a safe automatic application rollback target/,
);
assert.match(migrationContract, /Forward recovery, not destructive rollback/);

console.log(
  "Migration read-only contract passed: read-only SQL is mutation-free, the 14-gate foundation remains historical-only, and the current 103-chain remains NO_GO pending exact seal and drain proof.",
);
