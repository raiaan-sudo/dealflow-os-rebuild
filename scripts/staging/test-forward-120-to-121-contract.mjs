#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertExactForward120To121Portfolio,
  FORWARD_120_TO_121_AUTHORITY,
} from "./forward-120-to-121-contract.mjs";

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

const historicalRecords = records.slice(0, 121);
const result = assertExactForward120To121Portfolio(historicalRecords, migrationDirectory);
assert.equal(result.priorRecords.length, 120);
assert.equal(result.forwardRecord.name, FORWARD_120_TO_121_AUTHORITY.forwardMigration.file);
assert.equal(FORWARD_120_TO_121_AUTHORITY.prior.migrationCount, 120);
assert.equal(FORWARD_120_TO_121_AUTHORITY.current.migrationCount, 121);
assert.equal(
  FORWARD_120_TO_121_AUTHORITY.current.sourceReplayMigrationPortfolioSha256,
  "95d114fed9ce3c9d0f36ea714f02c07315dd860ca79bd91c92d771b0282c36c1",
);
assert.equal(
  FORWARD_120_TO_121_AUTHORITY.current.managedStructuralCatalogSha256,
  "afd3b0d494dc85a2d4862e676e39170dec6fa270f516e4f8213603c86d01c250",
);
assert.equal(
  FORWARD_120_TO_121_AUTHORITY.current.managedStructuralCatalogRecordCount,
  8405,
);
assert.throws(
  () => assertExactForward120To121Portfolio(historicalRecords.slice(1), migrationDirectory),
  /exact 121-migration portfolio/,
);
const drifted = historicalRecords.map((record, index) => index === historicalRecords.length - 1
  ? { ...record, name: "20260720010000_drift.sql" }
  : record);
assert.throws(
  () => assertExactForward120To121Portfolio(drifted, migrationDirectory),
  /migration 121|ENOENT/,
);

console.log("Exact immutable 120 prefix plus bounded migration 121 successor authority: PASS");
