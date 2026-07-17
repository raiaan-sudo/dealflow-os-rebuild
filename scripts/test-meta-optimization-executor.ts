import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateMetaOptimizationExecutionGate } from "../src/lib/meta-optimization-execution-gate";
import type { MetaOptimizationAuthorityResult } from "../src/lib/authority/owner-decision-authority-contract";
import { evaluateRealtorOptimizationPolicy } from "../src/lib/optimization-engine/realtor-policy";
import type { ApprovedOptimizationPolicy } from "../src/lib/optimization-engine/safety-policy";

const canonicalStagingProjectId = String(
  JSON.parse(readFileSync(".vercel/project.json", "utf8")).projectId,
);

const authorityPolicy = {
  contractVersion: "dealflow-realtor-optimization-v2",
  currencies: ["CAD", "USD"],
  maximumObservationAgeMinutes: 60,
  minimumImpressions: 1_000,
  minimumClicks: 20,
  minimumSpendMinor: 5_000,
  minimumLeadsForCplDecision: 1,
  attributionWindowDays: 7,
  cooldownMinutes: 1_440,
  maximumBudgetIncreasePercent: 20,
  maximumBudgetDecreasePercent: 100,
  maximumDailyScalePercent: 20,
  thresholds: {
    ctrGoodPercent: 2,
    ctrKillPercent: 0.5,
    cpcTargetMajor: 1,
    cplMaximumMajor: 50,
    landingPageConversionTargetPercent: 5,
    frequencyMaximum: 4,
    noLeadsTimeoutHours: 24,
    spendMultiplierKill: 2,
  },
} as const;
const productionAuthority = {
  authorized: true,
  capability: "meta_optimization_provider_writes",
  reason: "authorized",
  authorityMode: "production",
  packetDigest: "a".repeat(64),
  decisionId: "OWNER-007",
  signatureReference: `ed25519:owner:key:${"a".repeat(64)}`,
  policy: authorityPolicy,
} satisfies MetaOptimizationAuthorityResult;
const stagingAuthority = {
  ...productionAuthority,
  authorityMode: "synthetic_staging",
} satisfies MetaOptimizationAuthorityResult;

const stagingHost = {
  VERCEL_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
  VERCEL_PROJECT_ID: canonicalStagingProjectId,
  DEALFLOW_STAGING_VERCEL_PROJECT_ID: canonicalStagingProjectId,
  DEALFLOW_STAGING_HOST_ATTESTATION: "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1",
  META_OPTIMIZATION_EXECUTION_MODE: "sandbox",
  ALLOW_META_SANDBOX_OPTIMIZATION: "true",
  META_OPTIMIZATION_SANDBOX_ACCOUNT_ID: "act_99100000001",
};
assert.deepEqual(evaluateMetaOptimizationExecutionGate(stagingHost), {
  enabled: false,
  environment: null,
  accountIds: [],
  blockedReason: "optimizer_signed_owner_authority_required",
});
assert.deepEqual(evaluateMetaOptimizationExecutionGate(stagingHost, stagingAuthority), {
  enabled: true,
  environment: "staging",
  accountIds: ["99100000001"],
  blockedReason: null,
});
for (const key of [
  "DEALFLOW_STAGING_HOST_ATTESTATION",
  "ALLOW_META_SANDBOX_OPTIMIZATION",
  "META_OPTIMIZATION_SANDBOX_ACCOUNT_ID",
] as const) {
  assert.equal(
    evaluateMetaOptimizationExecutionGate(
      { ...stagingHost, [key]: undefined },
      stagingAuthority,
    ).enabled,
    false,
    `staging gate must close without ${key}`,
  );
}
assert.equal(
  evaluateMetaOptimizationExecutionGate(stagingHost, productionAuthority).enabled,
  false,
  "staging gate must reject production owner authority",
);

const productionHost = {
  VERCEL_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "production",
  VERCEL_PROJECT_ID: "production-project",
  DEALFLOW_PRODUCTION_VERCEL_PROJECT_ID: "production-project",
  DEALFLOW_PRODUCTION_HOST_ATTESTATION: "DEALFLOW_PRODUCTION_VERCEL_PROJECT_EXACT_V1",
  META_OPTIMIZATION_EXECUTION_MODE: "live",
  ALLOW_META_PRODUCTION_OPTIMIZATION: "true",
  DEALFLOW_PRODUCTION_META_OPTIMIZATION_ATTESTATION: "DEALFLOW_PRODUCTION_META_OPTIMIZATION_EXACT_V1",
  META_OPTIMIZATION_PRODUCTION_ACCOUNT_IDS: "act_99100000001,99200000001",
};
assert.deepEqual(evaluateMetaOptimizationExecutionGate(productionHost), {
  enabled: false,
  environment: null,
  accountIds: [],
  blockedReason: "optimizer_signed_owner_authority_required",
});
assert.deepEqual(evaluateMetaOptimizationExecutionGate(productionHost, productionAuthority), {
  enabled: true,
  environment: "production",
  accountIds: ["99100000001", "99200000001"],
  blockedReason: null,
});
for (const key of [
  "ALLOW_META_PRODUCTION_OPTIMIZATION",
  "DEALFLOW_PRODUCTION_META_OPTIMIZATION_ATTESTATION",
  "META_OPTIMIZATION_PRODUCTION_ACCOUNT_IDS",
] as const) {
  assert.equal(
    evaluateMetaOptimizationExecutionGate(
      { ...productionHost, [key]: undefined },
      productionAuthority,
    ).enabled,
    false,
    `production gate must close without ${key}`,
  );
}
assert.equal(
  evaluateMetaOptimizationExecutionGate(
    { ...productionHost, META_OPTIMIZATION_PRODUCTION_ACCOUNT_IDS: "99100000001,bad" },
    productionAuthority,
  ).enabled,
  false,
);
assert.equal(
  evaluateMetaOptimizationExecutionGate({ ...productionHost, VERCEL_PROJECT_ID: "wrong-project" }).enabled,
  false,
);
assert.equal(
  evaluateMetaOptimizationExecutionGate(productionHost, stagingAuthority).enabled,
  false,
  "production gate must reject synthetic staging owner authority",
);

const approvedPolicy: ApprovedOptimizationPolicy = {
  version: "dealflow-realtor-optimization-v2",
  approvalId: "31000000-0000-4000-8000-000000000001",
  approvedAt: "2026-07-13T04:00:00.000Z",
  authority: "owner_approved",
  maximumObservationAgeMinutes: 60,
  minimumImpressions: 2_000,
  minimumClicks: 50,
  minimumSpend: 75,
  minimumLeadsForCplDecision: 1,
  attributionWindowDays: 7,
  cooldownMinutes: 1_440,
  maximumBudgetIncreasePercent: 20,
  maximumBudgetDecreasePercent: 100,
  maximumDailyScalePercent: 20,
  customerDailyBudgetCeiling: 100,
};
const baseEvaluation = {
  sourceStatus: "confirmed" as const,
  syncedAt: "2026-07-13T04:55:00.000Z",
  metrics: {
    impressions: 1_500,
    clicks: 40,
    spend: 70,
    leads: 5,
    ctr: 3,
    cpc: 1,
    cpl: 20,
    frequency: 2,
    lp_cvr: 6,
  },
  dailyBudget: 50,
  customerDailyBudgetCeiling: 100,
  campaignAgeHours: 48,
  scaleAppliedLast24HoursPercent: 0,
  switches: { global: false, account: false, campaign: false, emergencyStop: false },
  now: new Date("2026-07-13T05:00:00.000Z"),
};
const ownerLimitHold = evaluateRealtorOptimizationPolicy({ ...baseEvaluation, approvedPolicy });
assert.equal(ownerLimitHold.state, "HOLD");
assert.deepEqual(
  ownerLimitHold.blockers,
  ["below_minimum_impressions", "below_minimum_clicks", "below_minimum_spend"],
  "evaluation must use the exact loaded owner-policy limits",
);
const scale = evaluateRealtorOptimizationPolicy({
  ...baseEvaluation,
  approvedPolicy,
  metrics: { ...baseEvaluation.metrics, impressions: 2_500, clicks: 100, spend: 100 },
});
assert.deepEqual(scale.action, { type: "budget", reason: "two_or_more_strong_metrics", changePercent: 20 });
const cooldown = evaluateRealtorOptimizationPolicy({
  ...baseEvaluation,
  approvedPolicy,
  metrics: { ...baseEvaluation.metrics, impressions: 2_500, clicks: 100, spend: 100 },
  lastProviderMutationAt: "2026-07-13T04:30:00.000Z",
});
assert.ok(cooldown.blockers.includes("cooldown_active"));

const executor = readFileSync("src/lib/services/meta-optimization-execution-service.ts", "utf8");
const processStart = executor.indexOf("export async function processMetaOptimizationExecutionBatch");
assert.ok(processStart >= 0);
let searchFrom = processStart;
const order = [
  "claim_meta_optimization_execution_intent",
  "provider.readState(claim)",
  "arm_meta_optimization_execution_intent",
  "const repeatedGate = evaluateMetaOptimizationExecutionGate(",
  "await confirmProviderDispatch(",
  "provider.apply(claim, executionToken, dispatchAuthorityNonce)",
  "await settleArmed({",
].map((marker) => {
  const index = executor.indexOf(marker, searchFrom);
  assert.ok(index >= 0, `executor is missing ${marker}`);
  searchFrom = index + marker.length;
  return index;
});
for (let index = 1; index < order.length; index += 1) {
  assert.ok(order[index] > order[index - 1], "optimizer provider-effect saga order regressed");
}
assert.match(executor, /p_outcome:\s*!\(error instanceof ApiError\) \|\| error\.status >= 500 \? "retry"/);
assert.match(executor, /purpose:\s*"optimization"/);
assert.match(executor, /beforeState\.effectiveStatus !== "ACTIVE"/);
assert.match(executor, /providerDispatchAuthorized = true/);
assert.match(
  executor,
  /providerMutationPerformed: providerDispatchAuthorized[\s\S]{0,260}meta_optimization_post_dispatch_ambiguous/,
);
assert.doesNotMatch(executor, /access_token=|[?&]access_token/);
assert.equal(
  executor.match(/readMetaOptimizationAuthority\(\)/g)?.length,
  2,
  "signed owner authority must be checked before claim and before dispatch",
);

const optimizeRoute = readFileSync("src/app/api/campaigns/[id]/optimize/route.ts", "utf8");
assert.doesNotMatch(optimizeRoute, /approvedPolicy:\s*null/);
assert.match(optimizeRoute, /getActiveMetaOptimizationPolicyForCampaign/);
const reportingWorker = readFileSync("src/lib/services/meta-reporting-worker-service.ts", "utf8");
assert.match(reportingWorker, /const approvedPolicy = activePolicy\?\.approvedPolicy \?\? null/);
assert.match(reportingWorker, /enqueueMetaOptimizationExecutionIntent/);
const policyControl = readFileSync("src/components/dashboard/meta-optimization-policy-control.tsx", "utf8");
assert.match(policyControl, /const hasActiveAuthorization = policy\?\.status === "active"/);
assert.match(policyControl, /policy\.killSwitchActive[\s\S]*a safety switch has paused execution/);
assert.match(policyControl, /\{hasActiveAuthorization && confirming !== "disable"/);
const migration = readFileSync("supabase/migrations/20260713013000_create_customer_authorized_meta_optimizer_executor.sql", "utf8");
assert.match(migration, /'production', 'shadow', false, true/);
assert.match(migration, /jsonb_array_length\(a\.provider_ad_ids\) = 1/);
assert.match(migration, /p_outcome not in \('retry', 'blocked', 'operator_required'\)/);
assert.match(migration, /private\.meta_optimization_activation_authority_current\(policy\.id\)/);
assert.match(migration, /create or replace function public\.confirm_meta_optimization_execution_dispatch/);
assert.match(migration, /intent\.locked_until > timezone\('utc', now\(\)\)/);
assert.match(migration, /dispatch_authority_nonce is not null/);
assert.match(
  migration,
  /dispatch_authority_nonce is not null and not p_provider_mutation_performed/,
);

console.log("Meta optimization executor contract: PASS (staging/production host gates, account binding, owner-policy drift, saga order, transient retry, runtime wiring, single-primary authority)");
