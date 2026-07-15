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
assert.match(migrationContract, /Integrated candidate: `104 MIGRATIONS \/ PENDING_FINAL_SEAL`/);
assert.match(migrationContract, /Exact clean-seal 104-chain proof: `NOT_YET_RUN`/);
assert.match(
  migrationContract,
  /retained PostgreSQL 17\.6 evidence\s+for 14 foundation\/adoption\/collision\/RLS\/recovery gates/,
);
assert.match(
  migrationContract,
  /`HISTORICAL_PASS` for migrations 1-80; it is not proof of the current extensions/,
);
assert.match(migrationContract, /current source tree contains exactly 104 ordered SQL migrations/);
assert.match(migrationContract, /The\s+twenty-four\s+additive extensions after the frozen foundation/);
assert.match(
  migrationContract,
  /103\. `20260713028000_harden_account_deletion_retention_authority\.sql`/,
);
assert.match(
  migrationContract,
  /104\. `20260715010000_move_legacy_org_member_policies_private\.sql`/,
);
assert.match(migrationContract, /only database-owner authority may mutate it/);
assert.match(migrationContract, /service role retains `INSERT`, `UPDATE`, `DELETE`, or\s+`TRUNCATE` privileges/);
assert.match(migrationContract, /authenticated reporting failure discovered on isolated\s+staging/);
assert.match(migrationContract, /18 retained organization-member policies still\s+called that public helper/);
assert.match(migrationContract, /SQLSTATE `42501`/);
assert.match(migrationContract, /does not re-grant the public helper/);
assert.match(
  migrationContract,
  /Current result for the exact final 104-migration seal: `NOT_YET_RUN`/,
);
assert.match(migrationContract, /retained read-only proof of the exact prior-103\s+migration history/);
assert.match(migrationContract, /commit only migration 104 and its history receipt in one outer\s+transaction/);
assert.match(migrationContract, /implemented 103-to-104 transition is `NOT_YET_RUN`/);
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
  "Migration read-only contract passed: read-only SQL is mutation-free, the 14-gate foundation and prior-103 staging proof remain predecessor-only, and the current 104-chain remains NO_GO pending exact seal, atomic staging transition, and drain proof.",
);
