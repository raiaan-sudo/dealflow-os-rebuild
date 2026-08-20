#!/usr/bin/env node

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertExactForward122To123Portfolio,
  FORWARD_122_TO_123_AUTHORITY,
} from "./forward-122-to-123-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const migrationDirectory = join(root, "supabase", "migrations");
const records = readdirSync(migrationDirectory)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort()
  .map((name) => ({ name, version: name.slice(0, 14) }));
const historicalRecords = records.slice(
  0,
  FORWARD_122_TO_123_AUTHORITY.current.migrationCount,
);

const result = assertExactForward122To123Portfolio(historicalRecords, migrationDirectory);
assert.equal(result.forwardRecord.name, FORWARD_122_TO_123_AUTHORITY.forwardMigration.file);
assert.equal(FORWARD_122_TO_123_AUTHORITY.prior.migrationCount, 122);
assert.equal(FORWARD_122_TO_123_AUTHORITY.current.migrationCount, 123);
assert.equal(
  FORWARD_122_TO_123_AUTHORITY.current.sourceReplayMigrationPortfolioSha256,
  "33571c1397a49e265edb4a7fb20b33747f3048b6d78a53c5e996e211c5d1a6b1",
);
assert.equal(
  FORWARD_122_TO_123_AUTHORITY.current.managedStructuralCatalogSha256,
  "b41cd90ccb0d5f8629932d0d36fdfaf75110fc4a55c567465194039c0ec0cd6e",
);
assert.equal(FORWARD_122_TO_123_AUTHORITY.current.managedStructuralCatalogRecordCount, 8408);
assert.throws(
  () => assertExactForward122To123Portfolio(historicalRecords.slice(1), migrationDirectory),
  /exact 123-migration portfolio/,
);
const drifted = historicalRecords.map((record, index) => index === historicalRecords.length - 1
  ? { ...record, name: "20260722020000_drift.sql" }
  : record);
assert.throws(
  () => assertExactForward122To123Portfolio(drifted, migrationDirectory),
  /migration 123|ENOENT/,
);

console.log("Exact immutable 122 prefix plus bounded migration 123 successor authority: PASS");
