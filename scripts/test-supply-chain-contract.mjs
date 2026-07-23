#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const security = readFileSync(".github/workflows/security-audit.yml", "utf8");
const workflows = `${ci}\n${security}`;

assert.equal(packageJson.private, true);
assert.equal(packageJson.license, "UNLICENSED");
assert.equal(packageJson.packageManager, "npm@11.11.0");
assert.deepEqual(
  packageJson.engines,
  { node: "24.x" },
  "Vercel supports a pinned Node major and rolls security patches within it",
);
assert.equal(readFileSync(".nvmrc", "utf8").trim(), "24.14.1");
assert.match(ci, /node-version: 24\.14\.1/);
assert.match(security, /node-version: 24\.14\.1/);
assert.match(readFileSync(".npmrc", "utf8"), /^engine-strict=true$/m);

for (const line of workflows.split("\n").filter((candidate) => /^\s*uses:/.test(candidate))) {
  assert.match(
    line,
    /@[a-f0-9]{40}(?:\s+#\s+v[^\s]+)?\s*$/,
    `workflow action is not pinned to a full commit SHA: ${line.trim()}`,
  );
}
assert.doesNotMatch(workflows, /uses:\s*[^\s]+@v[0-9]/);
assert.doesNotMatch(ci, /npm install/);
assert.match(ci, /npm ci --ignore-scripts/);
assert.match(ci, /npm audit --omit=dev --audit-level=high/);
assert.match(ci, /npm run security:scan-release/);
assert.doesNotMatch(security, /https:\/\/app\.agentdealflow\.io/);
assert.match(security, /environment:\s*isolated-staging-security/);
assert.match(security, /allow_issue_writing:\s*false/);
assert.match(security, /docker_name:\s*"\$\{\{ vars\.DEALFLOW_ZAP_IMAGE_BY_DIGEST \}\}"/);
assert.match(security, /zaproxy\/zaproxy@sha256:\[a-f0-9\]\{64\}/);
assert.match(security, /persist-credentials:\s*false/g);

const result = JSON.parse(execFileSync(process.execPath, [
  "scripts/generate-supply-chain-evidence.mjs",
  "--check",
], { encoding: "utf8" }).trim());
assert.match(result.status, /^PASS/);
assert.equal(result.componentCount, 513);
assert.equal(result.signedBuildProvenance, false);
assert.equal(result.outputDirectory, null);
assert.match(result.packageLockSha256, /^[a-f0-9]{64}$/);

console.log("supply-chain contract: PASS (exact local/CI runtime, hosted Node 24 major, exact package manager, immutable CI install, SHA-pinned actions, lockfile SBOM/license inventory, legal-review truth, no fake signed provenance)");
