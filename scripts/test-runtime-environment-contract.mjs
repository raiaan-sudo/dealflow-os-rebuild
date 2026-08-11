#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const contract = JSON.parse(fs.readFileSync("config/runtime-environment-contract.v1.json", "utf8"));
const exampleSource = fs.readFileSync(".env.example", "utf8");
const exampleNames = exampleSource
  .split(/\r?\n/)
  .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
  .filter(Boolean);

assert.equal(new Set(exampleNames).size, exampleNames.length, ".env.example must not contain duplicate names");

function walk(root) {
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const resolved = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...walk(resolved));
    else if (/\.(?:[cm]?[jt]sx?|mjs)$/.test(entry.name)) result.push(resolved);
  }
  return result;
}

const runtimeFiles = [
  ...walk("src"),
  "next.config.mjs",
  "scripts/run-durable-system-worker.ts",
  "scripts/generate-hosted-build-identity.mjs",
  ...walk("scripts/production"),
];
const runtimeSource = runtimeFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const referencedNames = new Set();
for (const expression of [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g,
]) {
  for (const match of runtimeSource.matchAll(expression)) referencedNames.add(match[1]);
}

const specialGroups = [
  contract.platformSupplied,
  contract.releaseGenerated,
  contract.toolingOnly,
  Object.keys(contract.deprecatedAliases),
];
const specialNames = new Set(specialGroups.flat());
assert.equal(specialGroups.flat().length, specialNames.size, "special environment classifications must not overlap");

const documentedNames = new Set(exampleNames);
const unknown = [...referencedNames]
  .filter((name) => !documentedNames.has(name) && !specialNames.has(name))
  .sort();
assert.deepEqual(unknown, [], `unclassified runtime environment names: ${unknown.join(", ")}`);

const externallyConsumed = new Set(contract.externallyConsumedDocumentedNames);
const stale = exampleNames
  .filter((name) => !runtimeSource.includes(name) && !externallyConsumed.has(name))
  .sort();
assert.deepEqual(stale, [], `stale .env.example names: ${stale.join(", ")}`);
for (const name of externallyConsumed) {
  assert.ok(documentedNames.has(name), `${name} must remain documented for its external runtime consumer`);
}

const publicSecretNames = exampleNames.filter(
  (name) =>
    name.startsWith(contract.publicClientPrefix) &&
    contract.secretNameFragments.some((fragment) => name.includes(fragment)) &&
    name !== "NEXT_PUBLIC_SUPABASE_ANON_KEY",
);
assert.deepEqual(publicSecretNames, [], "public client environment names must not describe secrets");
assert.match(exampleSource, /ALLOW_OPENAI_IMAGE_GENERATION=false/);
assert.match(exampleSource, /ALLOW_HIGGSFIELD_VIDEO_GENERATION=false/);
assert.match(exampleSource, /ALLOW_HEYGEN_LEGACY_FALLBACK=false/);
assert.match(exampleSource, /ALLOW_ELEVENLABS_VOICE_GENERATION=false/);
assert.match(exampleSource, /ALLOW_META_LIVE_LAUNCH=false/);
assert.match(exampleSource, /GHL_MARKETPLACE_PROVIDER_EFFECTS_ENABLED=false/);
assert.match(exampleSource, /SUPPORT_EXTERNAL_DELIVERY_ENABLED=false/);

const ownerAuthority = fs.readFileSync("config/authority/dealflow-owner-decisions.v1.json", "utf8");
assert.match(ownerAuthority, /"packetStatus"\s*:\s*"UNRESOLVED_FAIL_CLOSED"/);
assert.match(ownerAuthority, /"signatureStatus"\s*:\s*"NOT_SIGNED"/);
assert.equal(contract.invariants.environmentCannotGrantOwnerAuthority, true);
assert.equal(contract.invariants.environmentCannotGrantReleaseAuthority, true);
assert.equal(contract.negativeScenarios.length, 13);

console.log(`Runtime environment contract passed (${referencedNames.size} referenced, ${exampleNames.length} documented, 0 unknown, 0 stale).`);
