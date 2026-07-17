#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function loadTypeScriptModule(file, dependencies = new Map()) {
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

const gate = loadTypeScriptModule(
  "src/lib/meta-optimization-execution-gate.ts",
  new Map([["@/lib/deployment-target", {
    getDeploymentTarget: (env) => env.DEALFLOW_DEPLOYMENT_TARGET === "staging" ? "staging" : "unknown",
    isExactIsolatedStagingVercelHost: (env) => env.EXACT_STAGING === "true",
  }]]),
);
const policy = {
  contractVersion: "dealflow-realtor-optimization-v2",
  currencies: ["CAD", "USD"],
  maximumObservationAgeMinutes: 60,
  minimumImpressions: 1000,
  minimumClicks: 20,
  minimumSpendMinor: 5000,
  minimumLeadsForCplDecision: 1,
  attributionWindowDays: 7,
  cooldownMinutes: 1440,
  maximumBudgetIncreasePercent: 20,
  maximumBudgetDecreasePercent: 100,
  maximumDailyScalePercent: 20,
  thresholds: {
    ctrGoodPercent: 2, ctrKillPercent: 0.5, cpcTargetMajor: 1,
    cplMaximumMajor: 50, landingPageConversionTargetPercent: 5,
    frequencyMaximum: 4, noLeadsTimeoutHours: 24, spendMultiplierKill: 2,
  },
};
const productionAuthority = {
  authorized: true,
  capability: "meta_optimization_provider_writes",
  reason: "authorized",
  authorityMode: "production",
  packetDigest: "a".repeat(64),
  decisionId: "OWNER-007",
  signatureReference: `ed25519:owner:key:${"a".repeat(64)}`,
  policy,
};
const productionEnvironment = {
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "exact-db-bound-project",
  DEALFLOW_DEPLOYMENT_TARGET: "production",
  META_OPTIMIZATION_EXECUTION_MODE: "live",
  ALLOW_META_PRODUCTION_OPTIMIZATION: "true",
  DEALFLOW_PRODUCTION_META_OPTIMIZATION_ATTESTATION:
    "DEALFLOW_PRODUCTION_META_OPTIMIZATION_EXACT_V1",
  META_OPTIMIZATION_PRODUCTION_ACCOUNT_IDS: "99100000001",
};
assert.equal(gate.evaluateMetaOptimizationExecutionGate(productionEnvironment).blockedReason,
  "optimizer_signed_owner_authority_required");
assert.equal(gate.evaluateMetaOptimizationExecutionGate(productionEnvironment,
  { ...productionAuthority, authorityMode: "synthetic_staging" }).enabled, false);
assert.equal(gate.evaluateMetaOptimizationExecutionGate(productionEnvironment,
  productionAuthority).enabled, true);

const stagingEnvironment = {
  VERCEL_ENV: "production", DEALFLOW_DEPLOYMENT_TARGET: "staging",
  EXACT_STAGING: "true", META_OPTIMIZATION_EXECUTION_MODE: "sandbox",
  ALLOW_META_SANDBOX_OPTIMIZATION: "true",
  META_OPTIMIZATION_SANDBOX_ACCOUNT_ID: "99100000001",
};
assert.equal(gate.evaluateMetaOptimizationExecutionGate(stagingEnvironment).enabled, false);
assert.equal(gate.evaluateMetaOptimizationExecutionGate(stagingEnvironment,
  { ...productionAuthority, authorityMode: "synthetic_staging" }).enabled, true);

const executor = fs.readFileSync("src/lib/services/meta-optimization-execution-service.ts", "utf8");
const reader = fs.readFileSync("src/lib/authority/owner-decision-authority.ts", "utf8");
assert.equal(executor.match(/await readMetaOptimizationAuthority\(\)/g)?.length, 2,
  "fresh DB authority must be resolved before claim and again immediately before dispatch");
assert.match(reader, /resolve_owner_decision_authority_v1/);
assert.match(reader, /timeoutMs:\s*options\.timeoutMs \?\? LOOKUP_TIMEOUT_MS/);
assert.doesNotMatch(reader, /DEALFLOW_OWNER_DECISION_AUTHORITY_PATH/);

process.stdout.write(
  "Meta optimization owner authority: PASS (DB-owner grant required in staging/production, exact modes, bounded fresh reads, and pre-dispatch recheck)\n",
);
