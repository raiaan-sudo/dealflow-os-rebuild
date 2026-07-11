import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();

async function importTypeScript(relativePath) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const {
  evaluateOptimizationEvidence,
  OPTIMIZATION_HOLD_STATE,
  OPTIMIZATION_REVIEW_STATE,
} = await importTypeScript("src/lib/optimization-engine/safety-policy.ts");

const now = new Date("2026-07-10T16:00:00.000Z");
const metrics = {
  ctr: 1.5,
  cpc: 2,
  cpl: 30,
  frequency: 2,
  spend: 120,
  leads: 4,
  lp_cvr: 6,
  impressions: 3_000,
  clicks: 60,
};
const policy = {
  approvalId: "owner-policy-v1",
  approvedAt: "2026-07-01T00:00:00.000Z",
  maximumObservationAgeMinutes: 60,
  minimumImpressions: 1_000,
  minimumClicks: 20,
  minimumSpend: 50,
  cooldownMinutes: 120,
  maximumBudgetIncreasePercent: 20,
  maximumBudgetDecreasePercent: 25,
};

const missing = evaluateOptimizationEvidence({
  sourceStatus: "missing",
  syncedAt: null,
  metrics: null,
  approvedPolicy: null,
  now,
});
assert.equal(missing.decisionState, OPTIMIZATION_HOLD_STATE);
assert.equal(missing.canGenerateShadowProposal, false);
assert.equal(missing.canExecuteProviderMutation, false);
assert.deepEqual(missing.blockers, [
  "source_not_confirmed",
  "observation_timestamp_invalid",
  "metrics_incomplete",
  "authority_policy_unapproved",
]);

const unapproved = evaluateOptimizationEvidence({
  sourceStatus: "confirmed",
  syncedAt: "2026-07-10T15:45:00.000Z",
  metrics,
  approvedPolicy: null,
  now,
});
assert.equal(unapproved.decisionState, OPTIMIZATION_HOLD_STATE);
assert.equal(unapproved.canGenerateShadowProposal, false);
assert.deepEqual(unapproved.blockers, ["authority_policy_unapproved"]);

const stale = evaluateOptimizationEvidence({
  sourceStatus: "confirmed",
  syncedAt: "2026-07-10T13:00:00.000Z",
  metrics,
  approvedPolicy: policy,
  now,
});
assert.equal(stale.decisionState, OPTIMIZATION_HOLD_STATE);
assert.equal(stale.canGenerateShadowProposal, false);
assert.deepEqual(stale.blockers, ["observation_stale"]);

const belowBoundary = evaluateOptimizationEvidence({
  sourceStatus: "confirmed",
  syncedAt: "2026-07-10T15:45:00.000Z",
  metrics: { ...metrics, impressions: 999, clicks: 19, spend: 49.99 },
  approvedPolicy: policy,
  now,
});
assert.equal(belowBoundary.decisionState, OPTIMIZATION_HOLD_STATE);
assert.equal(belowBoundary.canGenerateShadowProposal, false);
assert.deepEqual(belowBoundary.blockers, [
  "below_minimum_impressions",
  "below_minimum_clicks",
  "below_minimum_spend",
]);

const atBoundary = evaluateOptimizationEvidence({
  sourceStatus: "confirmed",
  syncedAt: "2026-07-10T15:00:00.000Z",
  metrics: { ...metrics, impressions: 1_000, clicks: 20, spend: 50 },
  approvedPolicy: policy,
  lastProviderMutationAt: "2026-07-10T14:00:00.000Z",
  now,
});
assert.equal(atBoundary.decisionState, OPTIMIZATION_REVIEW_STATE);
assert.deepEqual(atBoundary.blockers, []);
assert.equal(atBoundary.canExecuteProviderMutation, false);

const insideCooldown = evaluateOptimizationEvidence({
  sourceStatus: "confirmed",
  syncedAt: "2026-07-10T15:45:00.000Z",
  metrics,
  approvedPolicy: policy,
  lastProviderMutationAt: "2026-07-10T14:01:00.000Z",
  now,
});
assert.equal(insideCooldown.decisionState, OPTIMIZATION_HOLD_STATE);
assert.equal(insideCooldown.canGenerateShadowProposal, false);
assert.deepEqual(insideCooldown.blockers, ["cooldown_active"]);

const invalidMetric = evaluateOptimizationEvidence({
  sourceStatus: "confirmed",
  syncedAt: "2026-07-10T15:45:00.000Z",
  metrics: { ...metrics, ctr: Number.NaN },
  approvedPolicy: policy,
  now,
});
assert.equal(invalidMetric.decisionState, OPTIMIZATION_HOLD_STATE);
assert.ok(invalidMetric.blockers.includes("metrics_invalid"));

const autonomySource = await readFile(`${root}/src/app/api/autonomy/_shared.ts`, "utf8");
const optimizeRouteSource = await readFile(
  `${root}/src/app/api/campaigns/[id]/optimize/route.ts`,
  "utf8",
);
const decisionServiceSource = await readFile(
  `${root}/src/lib/services/optimization-decision-service.ts`,
  "utf8",
);
assert.match(autonomySource, /approvedPolicy: null/);
assert.match(autonomySource, /budgetChangePercent: 0/);
assert.match(autonomySource, /recordOptimizationDecision/);
assert.doesNotMatch(autonomySource, /ctr:\s*0,[\s\S]*cpc:\s*0,[\s\S]*cpl:\s*0/);
assert.match(optimizeRouteSource, /optimization_recorded_post_required/);
assert.match(optimizeRouteSource, /await recordOptimizationDecision/);
assert.match(decisionServiceSource, /\.from\("optimization_decisions"\)/);
assert.match(decisionServiceSource, /live_action_performed: false/);
assert.match(decisionServiceSource, /ignoreDuplicates: true/);
assert.match(decisionServiceSource, /OPTIMIZATION_POLICY_CONTRACT_VERSION/);
assert.match(decisionServiceSource, /const policyDigest = digest\(policyContract\)/);
assert.match(decisionServiceSource, /function canonicalizeForDigest/);
assert.match(decisionServiceSource, /\.sort\(\(\[first\], \[second\]\) => first\.localeCompare\(second\)\)/);
assert.match(
  decisionServiceSource,
  /idempotencyKey[\s\S]*policyDigest,[\s\S]*proposedActions/,
);
assert.match(decisionServiceSource, /authority_checks:[\s\S]*policyContract,/);
assert.doesNotMatch(decisionServiceSource, /persistedAt:/);
const optimizationMigrationSource = await readFile(
  `${root}/supabase/migrations/20260710235000_create_launch_receipts_optimizer_support.sql`,
  "utf8",
);
assert.match(optimizationMigrationSource, /optimization_decisions_append_only_guard/);
assert.match(optimizationMigrationSource, /optimization_decisions_campaign_tenant_fk/);

console.log("optimization evidence safety: PASS");
