#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

function loadTs(file, mocks = {}) {
  const source = fs.readFileSync(file, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = {
    module: { exports: {} },
    exports: {},
    console,
    process,
    Number,
    Error,
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      throw new Error(`Unexpected import ${specifier} in ${file}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: file });
  return context.module.exports;
}

class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const durableWorkerRuntimeAttestation = loadTs(
  "src/lib/durable-worker-runtime-attestation.ts",
);
const deployment = loadTs("src/lib/deployment-target.ts", {
  "@/lib/durable-worker-runtime-attestation": durableWorkerRuntimeAttestation,
});
const budget = loadTs("src/lib/integrations/meta/budget-safety.ts", {
  "@/lib/api/route": { ApiError },
  "@/lib/deployment-target": deployment,
  "@/lib/integrations/meta/contract": {
    isMetaLiveWriteAllowed(environment) {
      return environment.ALLOW_META_LIVE_LAUNCH === "true";
    },
  },
});

let assertions = 0;
function equal(actual, expected, message) {
  assertions += 1;
  assert.equal(actual, expected, message);
}

function throwsCode(callback, code, status = undefined) {
  assertions += 1;
  assert.throws(callback, (error) => {
    assert.equal(error?.code, code);
    if (status !== undefined) assert.equal(error?.status, status);
    return true;
  });
}

async function rejectsCode(callback, code, status = undefined) {
  assertions += 1;
  await assert.rejects(callback, (error) => {
    assert.equal(error?.code, code);
    if (status !== undefined) assert.equal(error?.status, status);
    return true;
  });
}

const developmentContract = {
  DEALFLOW_DEPLOYMENT_TARGET: "development",
  ALLOW_META_LIVE_LAUNCH: "false",
};
const testContract = {
  NODE_ENV: "test",
  ALLOW_META_LIVE_LAUNCH: "false",
};

// Only explicit development/test contract paths can use documented defaults.
equal(
  budget.getMetaDailyBudgetHardCeilingCents(developmentContract),
  budget.DEFAULT_META_DAILY_BUDGET_HARD_CEILING_CENTS,
);
equal(
  budget.getMetaLifetimeBudgetHardCeilingCents(developmentContract),
  budget.DEFAULT_META_LIFETIME_BUDGET_HARD_CEILING_CENTS,
);
equal(
  budget.getMetaDailyBudgetHardCeilingCents(testContract),
  budget.DEFAULT_META_DAILY_BUDGET_HARD_CEILING_CENTS,
);

for (const environment of [
  { DEALFLOW_DEPLOYMENT_TARGET: "production", ALLOW_META_LIVE_LAUNCH: "false" },
  { DEALFLOW_DEPLOYMENT_TARGET: "staging", ALLOW_META_LIVE_LAUNCH: "false" },
  { DEALFLOW_DEPLOYMENT_TARGET: "preview", ALLOW_META_LIVE_LAUNCH: "false" },
  { DEALFLOW_DEPLOYMENT_TARGET: "development", ALLOW_META_LIVE_LAUNCH: "true" },
  { DEALFLOW_DEPLOYMENT_TARGET: "test", ALLOW_META_LIVE_LAUNCH: "true" },
  { ALLOW_META_LIVE_LAUNCH: "false" },
]) {
  throwsCode(
    () => budget.getMetaDailyBudgetHardCeilingCents(environment),
    "meta_budget_ceiling_unconfigured",
    503,
  );
}

// Vercel's production attestation overrides a conflicting repository target.
throwsCode(
  () =>
    budget.getMetaDailyBudgetHardCeilingCents({
      VERCEL_ENV: "production",
      DEALFLOW_DEPLOYMENT_TARGET: "development",
      ALLOW_META_LIVE_LAUNCH: "false",
    }),
  "meta_budget_ceiling_unconfigured",
  503,
);

for (const malformed of ["0", "-1", "1.5", "1e5", "not-a-number", "10000001"] ) {
  throwsCode(
    () =>
      budget.getMetaDailyBudgetHardCeilingCents({
        ...developmentContract,
        META_DAILY_BUDGET_HARD_CEILING_CENTS: malformed,
      }),
    "meta_budget_ceiling_invalid",
    503,
  );
}
throwsCode(
  () =>
    budget.getMetaLifetimeBudgetHardCeilingCents({
      ...developmentContract,
      META_LIFETIME_BUDGET_HARD_CEILING_CENTS: "310000001",
    }),
  "meta_budget_ceiling_invalid",
  503,
);
equal(
  budget.getMetaDailyBudgetHardCeilingCents({
    ...developmentContract,
    META_DAILY_BUDGET_HARD_CEILING_CENTS: " 10000 ",
  }),
  10000,
  "surrounding whitespace must not alter an otherwise exact integer ceiling",
);

const separateCeilings = {
  DEALFLOW_DEPLOYMENT_TARGET: "production",
  ALLOW_META_LIVE_LAUNCH: "true",
  META_DAILY_BUDGET_HARD_CEILING_CENTS: "10000",
  META_LIFETIME_BUDGET_HARD_CEILING_CENTS: "310000",
};
equal(
  budget.assertCustomerApprovedMetaBudgetCents(10000, "Meta daily budget", separateCeilings),
  10000,
  "the exact customer-approved daily cents must be returned",
);
throwsCode(
  () => budget.assertCustomerApprovedMetaBudgetCents(10001, "Meta daily budget", separateCeilings),
  "meta_budget_hard_ceiling_exceeded",
  400,
);
equal(
  budget.assertCustomerApprovedMetaLifetimeBudgetCents(310000, separateCeilings),
  310000,
  "the exact customer-approved lifetime cents must be returned",
);
throwsCode(
  () => budget.assertCustomerApprovedMetaLifetimeBudgetCents(310001, separateCeilings),
  "meta_budget_hard_ceiling_exceeded",
  400,
);
equal(
  budget.assertCustomerApprovedMetaLifetimeBudgetCents(10001, separateCeilings),
  10001,
  "a valid lifetime total must not be rejected by the smaller daily ceiling",
);

const inverseCeilings = {
  ...separateCeilings,
  META_DAILY_BUDGET_HARD_CEILING_CENTS: "20000",
  META_LIFETIME_BUDGET_HARD_CEILING_CENTS: "5000",
};
equal(
  budget.assertCustomerApprovedMetaBudgetCents(15000, "Meta daily budget", inverseCeilings),
  15000,
  "a daily value must not be checked against the lifetime ceiling",
);

for (const invalidCents of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  throwsCode(
    () => budget.assertCustomerApprovedMetaBudgetCents(invalidCents, "Meta daily budget", separateCeilings),
    "meta_budget_invalid",
    400,
  );
  throwsCode(
    () => budget.assertCustomerApprovedMetaLifetimeBudgetCents(invalidCents, separateCeilings),
    "meta_budget_invalid",
    400,
  );
}

equal(
  budget.customerApprovedMetaBudgetCentsFromDollars(100, "daily", separateCeilings),
  10000,
);
equal(
  budget.customerApprovedMetaBudgetCentsFromDollars(0.29, "daily", separateCeilings),
  29,
  "ordinary binary floating-point representation must still preserve 29 cents",
);
equal(
  budget.customerApprovedMetaBudgetCentsFromDollars(3100, "lifetime", separateCeilings),
  310000,
);
throwsCode(
  () => budget.customerApprovedMetaBudgetCentsFromDollars(100.01, "daily", separateCeilings),
  "meta_budget_hard_ceiling_exceeded",
  400,
);
throwsCode(
  () => budget.customerApprovedMetaBudgetCentsFromDollars(3100.01, "lifetime", separateCeilings),
  "meta_budget_hard_ceiling_exceeded",
  400,
);
for (const invalidDollars of [0, -1, 1.234, Number.NaN, Number.POSITIVE_INFINITY]) {
  throwsCode(
    () => budget.customerApprovedMetaBudgetCentsFromDollars(invalidDollars, "daily", separateCeilings),
    "meta_budget_invalid",
    400,
  );
}

equal(
  budget.resolveExactCustomerApprovedMetaDailyBudgetCents({
    canonicalDailyBudgetCents: 5000,
    payloadDailyBudgetCents: 5000,
    payloadBudgetPlanDailyBudgetCents: 5000,
    legacyDailyBudgetDollars: 99,
    environment: separateCeilings,
  }),
  5000,
  "the canonical daily cents must win over legacy dollar estimates",
);
equal(
  budget.resolveExactCustomerApprovedMetaDailyBudgetCents({
    canonicalDailyBudgetCents: 5000,
    payloadDailyBudgetCents: 0,
    payloadBudgetPlanDailyBudgetCents: Number.NaN,
    legacyDailyBudgetDollars: 99,
    environment: separateCeilings,
  }),
  5000,
  "invalid payload copies must not replace a valid canonical budget",
);
for (const disagreeingPayload of [
  { payloadDailyBudgetCents: 6000 },
  { payloadBudgetPlanDailyBudgetCents: 6000 },
]) {
  throwsCode(
    () =>
      budget.resolveExactCustomerApprovedMetaDailyBudgetCents({
        canonicalDailyBudgetCents: 5000,
        ...disagreeingPayload,
        environment: separateCeilings,
      }),
    "meta_budget_contract_mismatch",
    409,
  );
}
equal(
  budget.resolveExactCustomerApprovedMetaDailyBudgetCents({
    canonicalDailyBudgetCents: null,
    payloadDailyBudgetCents: 6000,
    legacyDailyBudgetDollars: 99,
    environment: separateCeilings,
  }),
  6000,
  "an exact payload copy remains available only for a campaign with no canonical cents",
);

// Execute the real ad-set service with an in-memory provider adapter. Valid
// values only perform deterministic fake GET recovery; invalid values must be
// rejected before the adapter is reached.
let fakeProviderLookups = 0;
const launchService = loadTs("src/lib/services/meta-launch-service.ts", {
  "@/lib/api/route": { ApiError },
  "@/lib/integrations/meta/contract": {
    buildMetaGraphUrl(path) {
      return path;
    },
    isMetaLiveWriteAllowed() {
      return process.env.ALLOW_META_LIVE_LAUNCH === "true";
    },
    withMetaBearerToken(_token, init) {
      return init;
    },
  },
  "@/lib/integrations/meta/execution": {
    getMetaAccessToken() {
      return "synthetic-test-token";
    },
  },
  "@/lib/integrations/meta/request": {
    async fetchMetaJson(path, init) {
      fakeProviderLookups += 1;
      assert.equal(init.method, "GET", "the no-network test adapter only permits lookups");
      if (String(path).startsWith("act_")) {
        return {
          response: { ok: true },
          data: {
            data: [
              {
                id: "synthetic-existing-adset",
                name: "Budget test",
                campaign_id: "synthetic-campaign",
              },
            ],
          },
        };
      }
      return {
        response: { ok: true },
        data: { id: "synthetic-existing-adset", status: "PAUSED" },
      };
    },
  },
  "@/lib/integrations/meta/budget-safety": budget,
  "@/lib/advertising-claim-boundaries": {
    assertMetaCreativeClaims() {},
  },
});

const providerEnvironmentKeys = [
  "DEALFLOW_DEPLOYMENT_TARGET",
  "ALLOW_META_LIVE_LAUNCH",
  "META_DAILY_BUDGET_HARD_CEILING_CENTS",
  "META_LIFETIME_BUDGET_HARD_CEILING_CENTS",
];
const priorProviderEnvironment = new Map(
  providerEnvironmentKeys.map((key) => [key, process.env[key]]),
);
Object.assign(process.env, separateCeilings);

const syntheticConnection = {
  external_account_id: "synthetic-account",
  connection_metadata: {
    selected_external_account_id: "synthetic-account",
    pixel_id: "synthetic-pixel",
  },
};

try {
  const dailyResult = await launchService.createMetaAdSet({
    connection: syntheticConnection,
    campaignId: "synthetic-campaign",
    payload: { name: "Budget test", daily_budget: 10000 },
  });
  equal(dailyResult.payload.daily_budget, 10000, "service must preserve exact daily cents");

  const lifetimeResult = await launchService.createMetaAdSet({
    connection: syntheticConnection,
    campaignId: "synthetic-campaign",
    payload: { name: "Budget test", lifetime_budget: 310000 },
  });
  equal(
    lifetimeResult.payload.lifetime_budget,
    310000,
    "service must preserve an exact lifetime total larger than the daily ceiling",
  );
  equal(fakeProviderLookups, 4, "each valid recovered object uses exactly two fake GET lookups");

  for (const payload of [
    { name: "Budget test" },
    { name: "Budget test", daily_budget: 1000, lifetime_budget: 2000 },
    { name: "Budget test", daily_budget: "1000" },
    { name: "Budget test", lifetime_budget: "2000" },
    { name: "Budget test", daily_budget: 10001 },
    { name: "Budget test", lifetime_budget: 310001 },
  ]) {
    const lookupsBeforeRejection = fakeProviderLookups;
    await rejectsCode(
      () =>
        launchService.createMetaAdSet({
          connection: syntheticConnection,
          campaignId: "synthetic-campaign",
          payload,
        }),
      typeof payload.daily_budget === "number" || typeof payload.lifetime_budget === "number"
        ? payload.daily_budget !== undefined && payload.lifetime_budget !== undefined
          ? "meta_budget_invalid"
          : "meta_budget_hard_ceiling_exceeded"
        : "meta_budget_invalid",
      400,
    );
    equal(
      fakeProviderLookups,
      lookupsBeforeRejection,
      "an invalid budget must be rejected before the provider adapter is reached",
    );
  }
} finally {
  for (const [key, value] of priorProviderEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

// Integration assertions ensure provider payload and preflight paths call the
// typed contract. This test never imports provider request code or performs I/O.
const launchSource = fs.readFileSync("src/lib/services/meta-launch-service.ts", "utf8");
const executionSource = fs.readFileSync("src/lib/services/campaign-execution-service.ts", "utf8");
const directLaunchSource = fs.readFileSync("src/app/api/campaigns/create/route.ts", "utf8");
const buildCampaignSource = fs.readFileSync("src/app/api/build-campaign/route.ts", "utf8");
const buildAssetsSource = fs.readFileSync("src/app/api/campaigns/[id]/build-assets/route.ts", "utf8");
const canonicalCampaignSource = fs.readFileSync("src/lib/services/canonical-campaign.ts", "utf8");
const envExample = fs.readFileSync(".env.example", "utf8");
assert.match(launchSource, /assertCustomerApprovedMetaLifetimeBudgetCents\(payload\.lifetime_budget\)/);
assert.match(launchSource, /hasDailyBudget === hasLifetimeBudget/);
assert.doesNotMatch(launchSource, /Number\(payload\.(?:daily|lifetime)_budget/);
assert.match(executionSource, /customerApprovedMetaBudgetCentsFromDollars\([\s\S]*?"lifetime"/);
assert.doesNotMatch(executionSource, /lifetimeBudget[\s\S]{0,160}getMetaDailyBudgetHardCeilingCents/);
assert.match(envExample, /^META_DAILY_BUDGET_HARD_CEILING_CENTS=\d+$/m);
assert.match(envExample, /^META_LIFETIME_BUDGET_HARD_CEILING_CENTS=\d+$/m);
assert.match(
  directLaunchSource,
  /resolveExactCustomerApprovedMetaDailyBudgetCents\(\{[\s\S]*canonicalDailyBudgetCents: input\.canonicalDailyBudgetCents[\s\S]*payloadDailyBudgetCents: input\.payload\?\.daily_budget_cents/,
  "launch must resolve the canonical budget before evaluating payload copies",
);
assert.doesNotMatch(
  directLaunchSource,
  /payload\?\.daily_budget_cents\s*\?\?[\s\S]{0,180}canonicalDailyBudgetCents/,
  "payload copies must never take precedence over canonical cents",
);
assert.match(buildCampaignSource, /daily_budget_cents: record\.plan\.daily_budget_cents/);
assert.match(buildCampaignSource, /estimated_daily_budget: record\.plan\.daily_budget_cents \/ 100/);
assert.match(buildAssetsSource, /daily_budget_cents: record\.plan\.daily_budget_cents/);
assert.match(buildAssetsSource, /estimated_daily_budget: record\.plan\.daily_budget_cents \/ 100/);
assert.doesNotMatch(buildCampaignSource, /Math\.round\(\(record\.plan\.monthly_budget[^\n]+\/ 30\)/);
assert.doesNotMatch(buildAssetsSource, /Math\.round\(record\.plan\.monthly_budget \/ 30\)/);
assert.match(canonicalCampaignSource, /Math\.round\(\(monthlyBudget \* 100\) \/ 30\)/);
assertions += 16;

console.log(
  `Meta daily/lifetime budget units, independent ceilings, exact-value, and fail-closed configuration tests passed (${assertions}/${assertions}).`,
);
