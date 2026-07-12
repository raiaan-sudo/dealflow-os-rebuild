#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reconciliation = join(root, "supabase", "reconciliation");
const golden = JSON.parse(readFileSync(join(reconciliation, "final-local-catalog-and-acl-golden.v1.json"), "utf8"));
const rowsetPath = join(root, golden.normalizedRowsetPath);
const rowsetText = readFileSync(rowsetPath, "utf8");
const rowset = JSON.parse(rowsetText);
const authority = JSON.parse(readFileSync(join(reconciliation, "authoritative-current-catalog.v1.json"), "utf8"));

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const rowsDigest = (rows) => sha256(JSON.stringify(rows));
const structuralDigest = (rows) =>
  sha256(rows.map((row) => row.filter((value) => value != null).join("\x1f")).join("\x1e"));
const sortKey = (row) => row.map((value) => String(value ?? "")).join("\x00");
const surfaceCounts = (rows) => {
  const counts = {};
  for (const [kind] of rows) counts[kind] = (counts[kind] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
};

assert.equal(rowset.schemaVersion, "dealflow.final-local-catalog-and-acl-rowset.v1");
assert.equal(rowset.postgresVersion, "17.6");
assert.equal(rowset.migrationCount, 80);
assert.equal(rowset.generationMode, "REVIEWED_FROZEN_ORACLE");
assert.equal(rowset.authorityCatalogDigestSha256, authority.provenance.combinedCatalogDigestSha256);
assert.equal(rowset.authorityCatalogDigestSha256, golden.authorityCatalogDigestSha256);
assert.equal(rowset.rowCount, rowset.rows.length);
assert.equal(rowset.rowCount, golden.normalizedRowCount);
assert.deepEqual(rowset.surfaceCounts, surfaceCounts(rowset.rows));
assert.deepEqual(rowset.surfaceCounts, golden.normalizedSurfaceCounts);
assert.equal(rowsDigest(rowset.rows), rowset.normalizedRowsSha256);
assert.equal(rowset.normalizedRowsSha256, golden.normalizedRowsetSha256);
assert.equal(structuralDigest(rowset.rows), rowset.structuralDigestSha256);
assert.equal(rowset.structuralDigestSha256, golden.finalCatalogAndAclDigestSha256);
assert.equal(sha256(rowsetText), golden.normalizedRowsetFileSha256);

const seen = new Set();
const identitySet = new Set();
let previousKey = null;
for (const [index, row] of rowset.rows.entries()) {
  assert.ok(Array.isArray(row) && row.length === 4, `row ${index} must have four fields`);
  assert.ok(row.every((value) => typeof value === "string"), `row ${index} must contain strings`);
  const serialized = JSON.stringify(row);
  assert.ok(!seen.has(serialized), `duplicate normalized row at index ${index}`);
  seen.add(serialized);
  identitySet.add(`${row[0]}\x00${row[1]}\x00${row[2]}`);
  const key = sortKey(row);
  if (previousKey != null) assert.ok(previousKey <= key, `rowset sort order drift at index ${index}`);
  previousKey = key;
}

function assertAuthorityIdentities(category, kind, identity) {
  for (const row of authority.categories[category] ?? []) {
    const [schemaName, objectName] = identity(row);
    if (identitySet.has(`${kind}\x00${schemaName}\x00${objectName}`)) continue;
    const supersession = golden.authorityIdentitySupersessions.find(
      (entry) =>
        entry.kind === kind &&
        entry.schema === schemaName &&
        entry.authorityObject === objectName,
    );
    assert.ok(supersession, `oracle is missing exact ${kind} identity ${schemaName}.${objectName}`);
    assert.ok(
      supersession.replacementObjects.length > 0 &&
        supersession.replacementObjects.every((replacement) =>
          identitySet.has(`${kind}\x00${schemaName}\x00${replacement}`)),
      `oracle is missing a declared replacement for ${kind} ${schemaName}.${objectName}`,
    );
  }
}

assertAuthorityIdentities("05_columns", "column", (row) => [
  row.relation_schema,
  `${row.relation_name}.${row.column_name}`,
]);
assertAuthorityIdentities("06a_constraints", "constraint", (row) => [
  row.table_schema,
  `${row.table_name}.${row.constraint_name}`,
]);
assertAuthorityIdentities("10a_routines", "routine", (row) => [
  row.routine_schema,
  `${row.routine_name}(${row.identity_arguments})`,
]);
assertAuthorityIdentities("11_triggers", "trigger", (row) => [
  row.relation_schema,
  `${row.relation_name}.${row.trigger_name}`,
]);
assertAuthorityIdentities("12a_policies", "policy", (row) => [
  row.table_schema,
  `${row.table_name}.${row.policy_name}`,
]);
assert.equal(golden.authorityIdentitySupersessions.length, 3);

for (const requiredSurface of [
  "relation",
  "column",
  "schema_acl",
  "relation_acl",
  "routine_acl",
  "type_acl_state",
  "type_acl_grant",
  "column_acl_state",
  "column_acl_grant",
  "default_acl",
]) {
  assert.ok(rowset.surfaceCounts[requiredSurface] > 0, `${requiredSurface} is absent from the oracle`);
}

const finalRunner = readFileSync(join(root, "scripts", "run-dealflow-final-verification.mjs"), "utf8");
const schemaHarness = readFileSync(join(root, "scripts", "test-schema-reconciliation-disposable-db.mjs"), "utf8");
assert.doesNotMatch(finalRunner, /--(?:write|capture)-golden-rowset/);
assert.doesNotMatch(schemaHarness, /writeFileSync\(FINAL_GOLDEN_ROWSET_PATH/);
assert.match(schemaHarness, /CANDIDATE_NOT_APPROVED/);
assert.match(schemaHarness, /Golden-rowset candidates must be written outside the repository/);
assert.doesNotMatch(rowsetText, /postgres(?:ql)?:\/\/|\bsbp_|\bsb_secret_|BEGIN [A-Z ]*PRIVATE KEY/);

console.log(
  `Final catalog/ACL oracle contract passed: ${rowset.rowCount} unique sorted rows, ` +
    `${Object.keys(rowset.surfaceCounts).length} surfaces, exact file/payload/structural digests.`,
);
