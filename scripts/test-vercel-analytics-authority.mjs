#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function loadTypeScriptModule(file, dependencies) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)(
    (specifier) => {
      if (!dependencies.has(specifier)) throw new Error(`Unexpected import: ${specifier}`);
      return dependencies.get(specifier);
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

const denied = Object.freeze({
  authorized: false, capability: "vercel_analytics", reason: "authority_not_verified",
});
const approved = Object.freeze({
  authorized: true, capability: "vercel_analytics", reason: "authorized",
  authorityMode: "production", packetDigest: "a".repeat(64),
  decisionIds: Object.freeze(Array.from({ length: 9 }, (_, index) => `OWNER-PRIVACY-00${index + 1}`)),
  signatureReferences: Object.freeze(Array(9).fill(`ed25519:owner:key:${"a".repeat(64)}`)),
});
const gate = loadTypeScriptModule(
  "src/lib/telemetry/vercel-analytics-gate.ts",
  new Map([
    ["server-only", {}],
    ["@/lib/authority/owner-decision-authority", {
      readVercelAnalyticsAuthority: async () => denied,
    }],
  ]),
);
const exactProduction = {
  VERCEL: "1", VERCEL_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "production", VERCEL_PROJECT_ID: "db-bound-project",
};
assert.equal(await gate.shouldRenderVercelAnalytics(exactProduction), false);
assert.equal(await gate.shouldRenderVercelAnalytics(exactProduction, approved), true);
assert.equal(await gate.shouldRenderVercelAnalytics(exactProduction,
  { ...approved, authorityMode: "synthetic_staging" }), false);
assert.equal(await gate.shouldRenderVercelAnalytics({ ...exactProduction, VERCEL: undefined }, approved), false);
assert.equal(await gate.shouldRenderVercelAnalytics({ ...exactProduction,
  DEALFLOW_DEPLOYMENT_TARGET: "staging" }, approved), false);

const layout = fs.readFileSync("src/app/layout.tsx", "utf8");
const homePage = fs.readFileSync("src/app/page.tsx", "utf8");
const reader = fs.readFileSync("src/lib/authority/owner-decision-authority.ts", "utf8");
assert.match(layout, /shouldRenderVercelAnalytics\(\)/);
assert.match(layout, /renderVercelAnalytics \? <Analytics \/> : null/);
assert.match(homePage, /await shouldRenderVercelAnalytics\(\)/);
assert.match(reader, /LOOKUP_TIMEOUT_MS = 750/);
assert.match(reader, /ANALYTICS_CACHE_MS = 5_000/);
assert.match(reader, /p_host_project_id_sha256/);
assert.match(reader, /resolve_owner_decision_authority_v1/);
assert.doesNotMatch(reader, /DEALFLOW_OWNER_DECISION_AUTHORITY_PATH/);

process.stdout.write(
  "Vercel Analytics authority: PASS (async bounded cached DB-owner grant, exact production mode/host candidate, and fail-closed render)\n",
);
