import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

function loadTs(file, mocks = {}) {
  const source = fs.readFileSync(file, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    module: { exports: {} }, exports: {}, console, process, URL, Date, Error,
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier === "node:crypto") return crypto;
      throw new Error(`Unexpected import ${specifier} in ${file}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: file });
  return context.module.exports;
}

const safety = loadTs("src/lib/optimization-engine/safety-policy.ts");
const kpi = loadTs("src/lib/optimization-engine/kpi.ts");
const reportingContract = loadTs("src/lib/integrations/meta/reporting-contract.ts");
const policy = loadTs("src/lib/optimization-engine/realtor-policy.ts", {
  "@/lib/optimization-engine/safety-policy": safety,
  "@/lib/optimization-engine/kpi": kpi,
});
const executor = loadTs("src/lib/optimization-engine/meta-sandbox-executor.ts");

const statusSyncSource = fs.readFileSync("src/lib/integrations/meta/status-sync.ts", "utf8");
const reportingWorkerSource = fs.readFileSync("src/lib/services/meta-reporting-worker-service.ts", "utf8");
const dashboardSource = fs.readFileSync("src/components/dashboard/campaign-dashboard-view.tsx", "utf8");
assert.match(statusSyncSource, /fields: "spend,impressions,clicks,ctr,frequency,reach,actions,conversions"/);
assert.match(statusSyncSource, /time_range: metaReportingTimeRange\(reportingWindow\)/);
assert.doesNotMatch(statusSyncSource, /date_preset:\s*"maximum"/);
assert.match(reportingWorkerSource, /metaCtrRatioToPolicyPercent\(raw\.ctr \?\? 0\)/);
assert.doesNotMatch(reportingWorkerSource, /raw\.ctr[^\n]*<=\s*1/);
assert.match(dashboardSource, /rankedTopCreative\.ctr \* 100/);

class TestApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const statusSync = loadTs("src/lib/integrations/meta/status-sync.ts", {
  "@/lib/api/route": { ApiError: TestApiError },
  "@/lib/integrations/meta/contract": {
    buildMetaGraphUrl: () => "https://graph.example.test",
    withMetaBearerToken: () => ({}),
  },
  "@/lib/integrations/meta/request": { fetchMetaResponse: async () => null },
  "@/lib/integrations/meta/reporting-contract": reportingContract,
});
assert.equal(
  statusSync.extractLeadsFromActions([
    { action_type: "lead", value: "5" },
    { action_type: "onsite_conversion.lead_grouped", value: "5" },
    { action_type: "offsite_conversion.fb_pixel_lead", value: "2" },
  ]),
  5,
  "the authoritative lead aggregate must not be added to overlapping component rows",
);
assert.equal(
  statusSync.extractLeadsFromActions([
    { action_type: "omni_lead", value: "4" },
    { action_type: "onsite_conversion.lead_grouped", value: "3" },
  ]),
  4,
  "omni_lead is the aggregate fallback when lead is absent",
);
assert.equal(
  statusSync.extractLeadsFromActions([
    { action_type: "onsite_conversion.lead_grouped", value: "3" },
    { action_type: "offsite_conversion.fb_pixel_lead", value: "2" },
  ]),
  5,
  "mutually exclusive onsite and pixel rows may be combined when aggregates are absent",
);
assert.equal(
  statusSync.extractLeadsFromActions([
    { action_type: "lead", value: "5" },
    { action_type: "lead", value: "5" },
    { action_type: "offsite_conversion.custom.123", value: "99" },
  ]),
  5,
  "duplicate aggregate rows and arbitrary custom conversions must not inflate leads",
);
assert.match(statusSyncSource, /raw_actions: insight\?\.actions \?\? \[\]/);

const exactWindow = reportingContract.buildMetaReportingWindow(
  new Date("2026-07-13T23:59:59.000Z"),
);
assert.deepEqual(
  JSON.parse(JSON.stringify(exactWindow)),
  { since: "2026-07-07", until: "2026-07-13", days: 7 },
);
assert.equal(
  reportingContract.readMetaReportingWindow(exactWindow).since,
  "2026-07-07",
);

const providerCtrCases = [0.2, 0.5, 0.8, 1.0, 1.2, 2];
for (const providerCtrPercent of providerCtrCases) {
  const persisted = reportingContract.normalizeMetaDeliveryInsight({
    impressions: "2000",
    clicks: String(Math.round(2000 * providerCtrPercent / 100)),
    ctr: String(providerCtrPercent),
    frequency: "4.25",
    reach: "470",
  });
  assert.equal(persisted.ctr, providerCtrPercent / 100);
  assert.equal(persisted.frequency, 4.25);
  assert.equal(persisted.reach, 470);
  const reportingCtr = reportingContract.metaCtrRatioToPolicyPercent(persisted.ctr);
  assert.equal(reportingCtr, providerCtrPercent);
  const evaluated = policy.evaluateRealtorOptimizationPolicy({
    sourceStatus: "confirmed",
    syncedAt: "2026-07-12T15:30:00.000Z",
    metrics: {
      ctr: reportingCtr,
      cpc: 0.8,
      cpl: 25,
      frequency: 2,
      spend: 120,
      leads: 4,
      lp_cvr: 7,
      impressions: 2000,
      clicks: 40,
    },
    dailyBudget: 50,
    customerDailyBudgetCeiling: 100,
    campaignAgeHours: 48,
    switches: { global: false, account: false, campaign: false, emergencyStop: false },
    now: new Date("2026-07-12T16:00:00.000Z"),
  });
  assert.equal(evaluated.action.type, providerCtrPercent < 0.5 ? "pause" : "budget");
}

for (const scenario of [
  { lifetimeCtr: 2.5, recentCtr: 0.2, expected: "pause" },
  { lifetimeCtr: 0.2, recentCtr: 2, expected: "budget" },
]) {
  const recentRatio = reportingContract.metaCtrPercentToRatio(scenario.recentCtr);
  assert.notEqual(recentRatio, reportingContract.metaCtrPercentToRatio(scenario.lifetimeCtr));
  const evaluated = policy.evaluateRealtorOptimizationPolicy({
    sourceStatus: "confirmed",
    syncedAt: "2026-07-12T15:30:00.000Z",
    metrics: {
      ctr: reportingContract.metaCtrRatioToPolicyPercent(recentRatio),
      cpc: 0.8,
      cpl: 25,
      frequency: 2,
      spend: 120,
      leads: 4,
      lp_cvr: 7,
      impressions: 2000,
      clicks: 40,
    },
    dailyBudget: 50,
    customerDailyBudgetCeiling: 100,
    campaignAgeHours: 48,
    switches: { global: false, account: false, campaign: false, emergencyStop: false },
    now: new Date("2026-07-12T16:00:00.000Z"),
  });
  assert.equal(evaluated.action.type, scenario.expected);
}

const providerFatigue = reportingContract.normalizeMetaDeliveryInsight({
  impressions: "5000",
  clicks: "100",
  ctr: "2",
  frequency: "4.01",
  reach: "1247",
});
assert.equal(
  policy.evaluateRealtorOptimizationPolicy({
    sourceStatus: "confirmed",
    syncedAt: "2026-07-12T15:30:00.000Z",
    metrics: {
      ctr: reportingContract.metaCtrRatioToPolicyPercent(providerFatigue.ctr),
      cpc: 0.8,
      cpl: 25,
      frequency: providerFatigue.frequency,
      spend: 120,
      leads: 4,
      lp_cvr: 7,
      impressions: providerFatigue.impressions,
      clicks: providerFatigue.clicks,
    },
    dailyBudget: 50,
    customerDailyBudgetCeiling: 100,
    campaignAgeHours: 48,
    switches: { global: false, account: false, campaign: false, emergencyStop: false },
    now: new Date("2026-07-12T16:00:00.000Z"),
  }).action.reason,
  "frequency_above_maximum",
);

const now = new Date("2026-07-12T16:00:00.000Z");
const baseMetrics = {
  ctr: 1.2, cpc: 1.5, cpl: 30, frequency: 2, spend: 120,
  leads: 4, lp_cvr: 6, impressions: 3_000, clicks: 80,
};
const base = {
  sourceStatus: "confirmed",
  syncedAt: "2026-07-12T15:30:00.000Z",
  metrics: baseMetrics,
  dailyBudget: 50,
  customerDailyBudgetCeiling: 100,
  campaignAgeHours: 48,
  switches: { global: false, account: false, campaign: false, emergencyStop: false },
  now,
};

assert.equal(policy.evaluateRealtorOptimizationPolicy({ ...base, sourceStatus: "partial" }).state, "HOLD");
assert.equal(policy.evaluateRealtorOptimizationPolicy({ ...base, syncedAt: "2026-07-12T14:00:00.000Z" }).state, "HOLD");
assert.equal(policy.evaluateRealtorOptimizationPolicy({ ...base, metrics: { ...baseMetrics, impressions: 999 } }).state, "HOLD");
assert.equal(policy.evaluateRealtorOptimizationPolicy({ ...base, switches: { ...base.switches, emergencyStop: true } }).state, "HOLD");
assert.equal(policy.evaluateRealtorOptimizationPolicy({ ...base, lastProviderMutationAt: "2026-07-12T15:00:00.000Z" }).state, "HOLD");
assert.equal(policy.evaluateRealtorOptimizationPolicy({ ...base, customerDailyBudgetCeiling: null }).state, "HOLD");

for (const metrics of [
  { ...baseMetrics, ctr: 0.49 },
  { ...baseMetrics, cpl: 50.01 },
  { ...baseMetrics, frequency: 4.01 },
  { ...baseMetrics, leads: 0, cpl: 0, spend: 100 },
]) {
  assert.equal(policy.evaluateRealtorOptimizationPolicy({ ...base, metrics }).action.type, "pause");
}
assert.equal(policy.evaluateRealtorOptimizationPolicy({
  ...base,
  metrics: { ...baseMetrics, leads: 0, cpl: 0, spend: 100 },
  campaignAgeHours: 23.99,
}).state, "HOLD", "zero-lead pause must wait for the recovered 24-hour observation window");
assert.equal(
  policy.evaluateRealtorOptimizationPolicy({
    ...base,
    metrics: { ...baseMetrics, ctr: 2.5, cpc: 0.8, cpl: 25, lp_cvr: 7 },
  }).action.type,
  "budget",
);
assert.equal(policy.evaluateRealtorOptimizationPolicy({
  ...base,
  metrics: { ...baseMetrics, ctr: 2.5, cpc: 0.8, cpl: 25, lp_cvr: 7 },
  scaleAppliedLast24HoursPercent: 20,
}).state, "HOLD");

const allowedEnv = {
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
  META_OPTIMIZATION_EXECUTION_MODE: "sandbox",
  ALLOW_META_SANDBOX_OPTIMIZATION: "true",
  META_OPTIMIZATION_SANDBOX_ACCOUNT_ID: "sandbox-account",
};
assert.equal(executor.getMetaSandboxOptimizationGate({ ...allowedEnv, DEALFLOW_DEPLOYMENT_TARGET: "production" }, "sandbox-account").reason, "production_forbidden");
assert.equal(executor.getMetaSandboxOptimizationGate({}, "sandbox-account").reason, "deployment_target_unattested");
assert.equal(executor.getMetaSandboxOptimizationGate(allowedEnv, "other-account").reason, "sandbox_account_mismatch");
assert.equal(executor.getMetaSandboxOptimizationGate(allowedEnv, "sandbox-account").allowed, true);

function harness({ mismatch = false, rollbackFailure = false, afterReadFailure = false } = {}) {
  let state = { campaignId: "campaign", accountId: "sandbox-account", configuredStatus: "ACTIVE", dailyBudget: 50, revision: "r1" };
  const receipts = [];
  let mutations = 0;
  let rollbacks = 0;
  return {
    receipts,
    counts: () => ({ mutations, rollbacks }),
    repository: {
      async findReceipt(key) { return receipts.find((value) => value.idempotencyKey === key) ?? null; },
      async appendReceipt(receipt) { receipts.push(receipt); },
    },
    provider: {
      async read() {
        if (afterReadFailure && mutations > 0) throw new Error("provider read unavailable");
        return { ...state };
      },
      async mutate({ action, expectedRevision }) {
        assert.equal(expectedRevision, state.revision);
        mutations += 1;
        state = action.type === "pause"
          ? { ...state, configuredStatus: mismatch ? "ACTIVE" : "PAUSED", revision: "r2" }
          : { ...state, dailyBudget: mismatch ? state.dailyBudget : action.dailyBudget, revision: "r2" };
        return { receiptId: `receipt-${mutations}` };
      },
      async rollback({ expectedRevision, restore }) {
        rollbacks += 1;
        assert.equal(expectedRevision, state.revision);
        if (rollbackFailure) throw new Error("ambiguous rollback");
        state = { ...restore, revision: "r3" };
        return { receiptId: "rollback-receipt" };
      },
    },
    before: () => ({ ...state }),
  };
}

const happy = harness();
const input = {
  env: allowedEnv,
  organizationId: "organization",
  accountId: "sandbox-account",
  action: { type: "pause", campaignId: "campaign" },
  expectedBefore: happy.before(), customerDailyBudgetCeiling: 100,
  switches: { global: false, account: false, campaign: false, emergencyStop: false },
  repository: happy.repository, provider: happy.provider,
};
const first = await executor.executeFencedMetaSandboxOptimization(input);
const replay = await executor.executeFencedMetaSandboxOptimization(input);
assert.equal(first.providerReceiptId, replay.providerReceiptId);
assert.deepEqual(happy.counts(), { mutations: 1, rollbacks: 0 });

const mismatch = harness({ mismatch: true });
const mismatchResult = await executor.executeFencedMetaSandboxOptimization({
  ...input, expectedBefore: mismatch.before(), repository: mismatch.repository, provider: mismatch.provider,
});
assert.equal(mismatchResult.reconciled, false);
assert.equal(mismatchResult.rollback.succeeded, true);
assert.deepEqual(mismatch.counts(), { mutations: 1, rollbacks: 1 });

const ambiguous = harness({ mismatch: true, rollbackFailure: true });
const ambiguousResult = await executor.executeFencedMetaSandboxOptimization({
  ...input, expectedBefore: ambiguous.before(), repository: ambiguous.repository, provider: ambiguous.provider,
});
assert.equal(ambiguousResult.rollback.succeeded, false);
assert.equal(ambiguousResult.rollback.reason, "rollback_ambiguous_operator_required");

const unavailable = harness({ afterReadFailure: true });
const unavailableResult = await executor.executeFencedMetaSandboxOptimization({
  ...input, expectedBefore: unavailable.before(), repository: unavailable.repository, provider: unavailable.provider,
});
assert.equal(unavailableResult.after, null);
assert.equal(unavailableResult.rollback.reason, "post_mutation_state_unavailable_operator_required");
assert.equal(unavailable.receipts.length, 1, "an accepted provider receipt must survive reconciliation unavailability");

const staleBefore = harness();
await assert.rejects(
  () => executor.executeFencedMetaSandboxOptimization({
    ...input,
    expectedBefore: { ...staleBefore.before(), revision: "wrong" },
    repository: staleBefore.repository,
    provider: staleBefore.provider,
  }),
  /compare_and_swap_precondition_failed/,
);
assert.deepEqual(staleBefore.counts(), { mutations: 0, rollbacks: 0 });

const migration = fs.readFileSync("supabase/migrations/20260712214000_create_continuous_reporting_and_safe_optimizer.sql", "utf8");
const worker = fs.readFileSync("src/lib/services/system-job-service.ts", "utf8");
const runner = fs.readFileSync("src/app/api/internal/system-jobs/route.ts", "utf8");
assert.match(migration, /for update skip locked/);
assert.match(migration, /meta_reporting_sync/);
assert.match(migration, /meta_reporting_lease_lost/);
assert.match(migration, /meta_optimization_action_receipts_append_only/);
assert.match(worker, /processingJob\.kind === "meta_reporting_sync"/);
assert.match(worker, /metaReportingRetry/);
assert.match(worker, /15 \* 60_000/);
assert.match(runner, /enqueueDueMetaReportingSyncJobs/);
assert.match(runner, /refreshMetaReportingFreshnessAlerts/);

console.log("continuous reporting and safe optimizer: PASS");
