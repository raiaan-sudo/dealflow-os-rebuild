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
  /Status: `NO_GO \/ LOCAL CONTRACT AUTHORED \/ FULL CHAIN AND RECOVERY NOT EXECUTED`/,
);
assert.match(
  migrationContract,
  /Mandatory two-phase old-worker and provider-protocol drain/,
);
assert.match(migrationContract, /campaign_plan_v0_writers/);
assert.match(migrationContract, /system_job_v1_workers/);
assert.match(migrationContract, /contain exactly zero for every class/);
assert.match(
  migrationContract,
  /production baseline[\s\S]*not a valid application rollback target/,
);
assert.match(migrationContract, /Forward recovery, not historical rollback/);

console.log(
  "Migration read-only contract passed: pre/post phases are split, count/boolean-only, mutation-free, and bound to two-phase drain plus forward recovery.",
);
