#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertExactForward121To122Portfolio,
  FORWARD_121_TO_122_AUTHORITY,
} from "./forward-121-to-122-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationDirectory = join(root, "supabase", "migrations");
const records = readdirSync(migrationDirectory)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort()
  .map((name) => {
    const contents = readFileSync(join(migrationDirectory, name));
    return {
      name,
      sha256: createHash("sha256").update(contents).digest("hex"),
      bytes: contents.byteLength,
    };
  });

const historicalRecords = records.slice(0, 122);
const result = assertExactForward121To122Portfolio(historicalRecords, migrationDirectory);
assert.equal(result.priorRecords.length, 121);
assert.equal(result.forwardRecord.name, FORWARD_121_TO_122_AUTHORITY.forwardMigration.file);
assert.equal(FORWARD_121_TO_122_AUTHORITY.prior.migrationCount, 121);
assert.equal(FORWARD_121_TO_122_AUTHORITY.current.migrationCount, 122);
assert.equal(
  FORWARD_121_TO_122_AUTHORITY.current.sourceReplayMigrationPortfolioSha256,
  "3055ca673226446ddb40b55aab2812724976067d0942f31ae8954dc880b2d110",
);
assert.equal(
  FORWARD_121_TO_122_AUTHORITY.current.managedStructuralCatalogSha256,
  "afd3b0d494dc85a2d4862e676e39170dec6fa270f516e4f8213603c86d01c250",
);
assert.equal(FORWARD_121_TO_122_AUTHORITY.current.managedStructuralCatalogRecordCount, 8405);
assert.throws(
  () => assertExactForward121To122Portfolio(historicalRecords.slice(1), migrationDirectory),
  /exact 122-migration portfolio/,
);
const drifted = historicalRecords.map((record, index) => index === historicalRecords.length - 1
  ? { ...record, name: "20260722010000_drift.sql" }
  : record);
assert.throws(
  () => assertExactForward121To122Portfolio(drifted, migrationDirectory),
  /migration 122|ENOENT/,
);

console.log("Exact immutable 121 prefix plus bounded migration 122 successor authority: PASS");
