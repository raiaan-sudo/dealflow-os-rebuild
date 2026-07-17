#!/usr/bin/env node

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
    module: { exports: {} }, exports: {}, console, process, URL, Date, Error, Response,
    crypto: globalThis.crypto,
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

const deployment = loadTs("src/lib/deployment-target.ts");
const canonicalStagingProjectId = String(
  JSON.parse(fs.readFileSync(".vercel/project.json", "utf8")).projectId,
);
const gateDeployment = {
  ...deployment,
  getDeploymentTarget(env) {
    if (
      env?.DEALFLOW_TEST_PROTECTED_PRODUCTION_AUTHORITY === "verified" &&
      env?.VERCEL_ENV === "production" &&
      env?.DEALFLOW_DEPLOYMENT_TARGET === "production"
    ) {
      return "production";
    }
    return deployment.getDeploymentTarget(env);
  },
  isExactProductionVercelHost(env) {
    return Boolean(
      env?.DEALFLOW_TEST_PROTECTED_PRODUCTION_AUTHORITY === "verified" &&
      env?.VERCEL_PROJECT_ID &&
      env.VERCEL_PROJECT_ID === env.DEALFLOW_PRODUCTION_VERCEL_PROJECT_ID,
    );
  },
};
const gate = loadTs("src/lib/meta-campaign-activation-gate.ts", {
  "@/lib/deployment-target": gateDeployment,
});

const allowedProduction = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "vercel-production-project",
  DEALFLOW_DEPLOYMENT_TARGET: "production",
  DEALFLOW_PRODUCTION_VERCEL_PROJECT_ID: "vercel-production-project",
  DEALFLOW_PRODUCTION_HOST_ATTESTATION: deployment.DEALFLOW_PRODUCTION_HOST_ATTESTATION_VALUE,
  DEALFLOW_TEST_PROTECTED_PRODUCTION_AUTHORITY: "verified",
  ALLOW_META_LIVE_LAUNCH: "true",
  ALLOW_META_DUE_ACTIVATION: "true",
  ALLOW_META_PRODUCTION_DUE_ACTIVATION: "true",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  META_PRODUCTION_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  META_PRODUCTION_ACTIVATION_ATTESTATION: gate.META_PRODUCTION_ACTIVATION_ATTESTATION,
  META_DAILY_BUDGET_HARD_CEILING_CENTS: "100000",
};
assert.equal(gate.getMetaCampaignActivationGate({}).reason, "activation_disabled");
assert.equal(gate.getMetaCampaignActivationGate({ ...allowedProduction, ALLOW_META_DUE_ACTIVATION: "TRUE" }).allowed, false);
assert.equal(gate.getMetaCampaignActivationGate({ ...allowedProduction, ALLOW_META_LIVE_LAUNCH: "false" }).reason, "meta_live_launch_disabled");
assert.equal(gate.getMetaCampaignActivationGate({ ...allowedProduction, ALLOW_META_PRODUCTION_DUE_ACTIVATION: "false" }).reason, "production_activation_disabled");
assert.equal(gate.getMetaCampaignActivationGate(allowedProduction).allowed, true);
assert.equal(deployment.getDeploymentTarget({
  ...allowedProduction,
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
}), "unknown", "an unattested production Vercel project cannot self-authorize or self-declassify");
assert.equal(gate.getMetaCampaignActivationGate({
  ...allowedProduction,
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
}).reason, "unsupported_deployment_target", "conflicting target metadata must block production activation");
assert.equal(gate.getMetaCampaignActivationGate({
  ...allowedProduction,
  VERCEL_ENV: "preview",
  DEALFLOW_DEPLOYMENT_TARGET: "production",
}).allowed, false, "a preview deployment must never self-assert production");
assert.equal(gate.getMetaCampaignActivationGate({
  ...allowedProduction,
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: canonicalStagingProjectId,
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
  DEALFLOW_STAGING_VERCEL_PROJECT_ID:
    canonicalStagingProjectId,
  DEALFLOW_STAGING_HOST_ATTESTATION: deployment.DEALFLOW_STAGING_HOST_ATTESTATION_VALUE,
  ALLOW_META_PRODUCTION_DUE_ACTIVATION: "false",
  ALLOW_META_STAGING_DUE_ACTIVATION: "true",
  META_STAGING_ISOLATED_DATABASE: "true",
  META_STAGING_ISOLATED_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  META_STAGING_ACTIVATION_ATTESTATION: gate.META_STAGING_ACTIVATION_ATTESTATION,
}).target, "staging");
assert.equal(gate.getMetaCampaignActivationGate({
  ...allowedProduction,
  VERCEL_ENV: "preview",
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
  DEALFLOW_STAGING_VERCEL_PROJECT_ID: "vercel-production-project",
  DEALFLOW_STAGING_HOST_ATTESTATION: deployment.DEALFLOW_STAGING_HOST_ATTESTATION_VALUE,
  ALLOW_META_STAGING_DUE_ACTIVATION: "true",
  META_STAGING_ISOLATED_DATABASE: "true",
  META_STAGING_ISOLATED_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  META_STAGING_ACTIVATION_ATTESTATION: gate.META_STAGING_ACTIVATION_ATTESTATION,
}).reason, "staging_host_attestation_missing", "a preview cannot impersonate the isolated staging production deployment");
assert.equal(gate.getMetaCampaignActivationGate({
  ...allowedProduction,
  VERCEL_ENV: "preview",
  DEALFLOW_DEPLOYMENT_TARGET: "test",
}).reason, "unsupported_deployment_target");

class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
function assertCurrentDailyBudget(value, _label, environment) {
  const rawCeiling = environment?.META_DAILY_BUDGET_HARD_CEILING_CENTS;
  if (!/^[1-9]\d*$/.test(rawCeiling ?? "")) {
    throw new ApiError(503, "Meta daily budget ceiling is unavailable.", "meta_budget_ceiling_unconfigured");
  }
  if (!Number.isSafeInteger(value) || value <= 0 || value > Number(rawCeiling)) {
    throw new ApiError(400, "Meta daily budget exceeds the current hard ceiling.", "meta_budget_hard_ceiling_exceeded");
  }
  return value;
}
const finalContractProof = {
  evidenceDigest: "d".repeat(64),
  deliveryState: "delivery_active",
  deliveryEvidenceDigest: "e".repeat(64),
};
const service = loadTs("src/lib/services/meta-campaign-activation-service.ts", {
  "server-only": {},
  "@/lib/api/route": { ApiError },
  "@/lib/creative-content-integrity": { async resolveCreativeContentSha256() { return "9".repeat(64); } },
  "@/lib/integrations/meta/contract": { buildMetaGraphUrl() {}, withMetaBearerToken() {} },
  "@/lib/integrations/meta/budget-safety": { assertCustomerApprovedMetaBudgetCents: assertCurrentDailyBudget },
  "@/lib/integrations/meta/execution": { getMetaAccessToken() { throw new Error("real provider forbidden"); } },
  "@/lib/integrations/meta/request": { fetchMetaJson() { throw new Error("real provider forbidden"); } },
  "@/lib/meta-campaign-activation-gate": gate,
  "@/lib/supabase/admin": { createAdminClient() { throw new Error("admin client should be injected"); } },
  "@/lib/services/meta-campaign-activation-authority-service": { recoverMetaActivationPreauthorizations() { throw new Error("environment wrapper not under test"); } },
});

const activationId = "10000000-0000-4000-8000-000000000001";
const digest = "a".repeat(64);
function claimRow() {
  return {
    activation_intent_id: activationId,
    organization_id: "10000000-0000-4000-8000-000000000002",
    user_id: "10000000-0000-4000-8000-000000000003",
    campaign_id: "10000000-0000-4000-8000-000000000004",
    launch_record_id: "10000000-0000-4000-8000-000000000005",
    marketing_account_id: "10000000-0000-4000-8000-000000000006",
    activation_input_digest: digest,
    approved_daily_budget_minor: 5000,
    approved_currency: "CAD",
    processing_token: "10000000-0000-4000-8000-000000000007",
    processing_generation: 1,
    claimed_control_generation: 1,
    provider_objects: [
      { id: "10000000-0000-4000-8000-000000000011", sequence: 1, type: "ad", providerId: "30000000001", status: "pending", mutationState: "idle" },
      { id: "10000000-0000-4000-8000-000000000012", sequence: 2, type: "adset", providerId: "30000000002", status: "pending", mutationState: "idle" },
      { id: "10000000-0000-4000-8000-000000000013", sequence: 3, type: "campaign", providerId: "30000000003", status: "pending", mutationState: "idle" },
    ],
  };
}

function fakeClient(options = {}) {
  let claimCount = 0;
  const calls = [];
  return {
    calls,
    from() { throw new Error("default provider authority lookup must not run with injected provider"); },
    async rpc(name, params) {
      calls.push({ name, params });
      await options.onRpc?.(name, params);
      if (name === "claim_due_meta_campaign_activation") {
        claimCount += 1;
        return { data: claimCount === 1 ? [options.claim ?? claimRow()] : [], error: null };
      }
      return { data: true, error: null };
    },
  };
}

let providerCalls = 0;
const blockedClient = fakeClient();
const blocked = await service.processDueMetaCampaignActivationBatch({
  client: blockedClient,
  environment: {},
  providerFactory: async () => { throw new Error("provider must not be constructed while disabled"); },
});
assert.equal(blocked.enabled, false);
assert.equal(blocked.providerMutationAttempted, false);
assert.equal(blockedClient.calls.length, 0, "disabled activation must not even claim database work");

const driftClient = fakeClient();
const drifted = await service.processDueMetaCampaignActivationBatch({
  client: driftClient,
  environment: allowedProduction,
  maxClaims: 1,
  providerFactory: async () => ({
    async preflightActivation() { throw new service.MetaActivationProviderDriftError("synthetic budget drift"); },
    async activateObject() { throw new Error("ACTIVE write must not run after failed preflight"); },
  }),
});
assert.equal(drifted.providerMutationAttempted, false);
assert.equal(driftClient.calls.some((call) => call.name === "arm_meta_campaign_activation_object"), false);
assert.equal(driftClient.calls.find((call) => call.name === "settle_meta_campaign_activation")?.params.p_outcome, "rejected");

const loweredBeforeArmEnvironment = {
  ...allowedProduction,
  META_DAILY_BUDGET_HARD_CEILING_CENTS: "5000",
};
let loweredBeforeArmWrites = 0;
const loweredBeforeArmClient = fakeClient();
const loweredBeforeArm = await service.processDueMetaCampaignActivationBatch({
  client: loweredBeforeArmClient,
  environment: loweredBeforeArmEnvironment,
  maxClaims: 1,
  providerFactory: async () => ({
    async preflightActivation() {
      loweredBeforeArmEnvironment.META_DAILY_BUDGET_HARD_CEILING_CENTS = "4999";
      return { evidenceDigest: "b".repeat(64) };
    },
    async activateObject() { loweredBeforeArmWrites += 1; throw new Error("unreachable"); },
  }),
});
assert.equal(loweredBeforeArmWrites, 0);
assert.equal(loweredBeforeArm.providerMutationAttempted, false);
assert.equal(
  loweredBeforeArmClient.calls.some((call) => call.name === "arm_meta_campaign_activation_object"),
  false,
  "a lowered ceiling after preflight must block before arming",
);

const loweredAfterArmEnvironment = {
  ...allowedProduction,
  META_DAILY_BUDGET_HARD_CEILING_CENTS: "5000",
};
let loweredAfterArmWrites = 0;
const loweredAfterArmClient = fakeClient({
  onRpc(name) {
    if (name === "arm_meta_campaign_activation_object") {
      loweredAfterArmEnvironment.META_DAILY_BUDGET_HARD_CEILING_CENTS = "4999";
    }
  },
});
const loweredAfterArm = await service.processDueMetaCampaignActivationBatch({
  client: loweredAfterArmClient,
  environment: loweredAfterArmEnvironment,
  maxClaims: 1,
  providerFactory: async () => ({
    async preflightActivation() { return { evidenceDigest: "b".repeat(64) }; },
    async activateObject() { loweredAfterArmWrites += 1; throw new Error("unreachable"); },
  }),
});
assert.equal(loweredAfterArmWrites, 0);
assert.equal(loweredAfterArm.providerMutationAttempted, false);
assert.equal(
  loweredAfterArmClient.calls.filter((call) => call.name === "arm_meta_campaign_activation_object").length,
  1,
  "the post-arm ceiling proof must exercise the final pre-provider-write check",
);

const client = fakeClient();
const activated = await service.processDueMetaCampaignActivationBatch({
  client,
  environment: allowedProduction,
  maxClaims: 2,
  workerId: "contract-worker",
  providerFactory: async () => ({
    async preflightActivation(input) {
      return { evidenceDigest: "b".repeat(64) };
    },
    async verifyFinalContract() { return finalContractProof; },
    async activateObject(input) {
      providerCalls += 1;
      assert.equal(input.activationInputDigest, digest);
      assert.equal(input.approvedDailyBudgetMinor, 5000);
      assert.equal(input.approvedCurrency, "CAD");
      assert.equal(input.preflightEvidenceDigest, "b".repeat(64));
      const receipt = {
        providerObjectId: input.providerObjectId,
        providerObjectType: input.providerObjectType,
        activationInputDigest: input.activationInputDigest,
        observedStatus: "ACTIVE",
      };
      return {
        providerReceiptId: `fake-receipt-${providerCalls}`,
        observedStatus: "ACTIVE",
        providerStateDigest: crypto.createHash("sha256").update(JSON.stringify(receipt)).digest("hex"),
        safeReceipt: receipt,
      };
    },
  }),
});
assert.equal(activated.enabled, true);
assert.equal(activated.claimedCount, 1);
assert.equal(JSON.stringify(activated.completedIds), JSON.stringify([activationId]));
assert.equal(providerCalls, 3);
assert.deepEqual(
  client.calls.filter((call) => call.name === "arm_meta_campaign_activation_object").map((call) => call.params.p_object_id),
  claimRow().provider_objects.map((object) => object.id),
  "objects must be armed in safe ad, adset, campaign order",
);
assert.equal(client.calls.filter((call) => call.name === "record_meta_campaign_activation_receipt").length, 3);
assert.equal(client.calls.at(-2).name, "settle_meta_campaign_activation");
assert.equal(client.calls.at(-2).params.p_outcome, "active");

const recoveredClaim = claimRow();
recoveredClaim.provider_objects = recoveredClaim.provider_objects.map((object, index) => index === 0
  ? { ...object, status: "active", mutationState: "receipted" }
  : object);
const recoveredClient = fakeClient({ claim: recoveredClaim });
const recoveredProviderObjectIds = [];
const recovered = await service.processDueMetaCampaignActivationBatch({
  client: recoveredClient,
  environment: allowedProduction,
  maxClaims: 1,
  providerFactory: async () => ({
    async preflightActivation(input) {
      assert.deepEqual(
        input.providerObjects.map((object) => `${object.status}:${object.mutationState}`),
        ["active:receipted", "pending:idle", "pending:idle"],
      );
      return { evidenceDigest: "c".repeat(64) };
    },
    async verifyFinalContract() { return finalContractProof; },
    async activateObject(input) {
      recoveredProviderObjectIds.push(input.providerObjectId);
      const safeReceipt = {
        providerObjectId: input.providerObjectId,
        providerObjectType: input.providerObjectType,
        activationInputDigest: input.activationInputDigest,
      };
      return {
        providerReceiptId: `recovery-${input.providerObjectId}`,
        observedStatus: "ACTIVE",
        providerStateDigest: crypto.createHash("sha256").update(JSON.stringify(safeReceipt)).digest("hex"),
        safeReceipt,
      };
    },
  }),
});
assert.equal(JSON.stringify(recovered.completedIds), JSON.stringify([activationId]));
assert.deepEqual(recoveredProviderObjectIds, ["30000000002", "30000000003"]);
assert.deepEqual(
  recoveredClient.calls.filter((call) => call.name === "arm_meta_campaign_activation_object").map((call) => call.params.p_object_id),
  recoveredClaim.provider_objects.slice(1).map((object) => object.id),
  "a DB-receipted ACTIVE prefix must be skipped while the PAUSED suffix continues in order",
);

const invalidRecoveryClaim = claimRow();
invalidRecoveryClaim.provider_objects = invalidRecoveryClaim.provider_objects.map((object, index) => index === 1
  ? { ...object, status: "active", mutationState: "reconciled" }
  : object);
const invalidRecoveryClient = fakeClient({ claim: invalidRecoveryClaim });
let invalidRecoveryProviderCreated = false;
const invalidRecovery = await service.processDueMetaCampaignActivationBatch({
  client: invalidRecoveryClient,
  environment: allowedProduction,
  maxClaims: 1,
  providerFactory: async () => {
    invalidRecoveryProviderCreated = true;
    throw new Error("unreachable");
  },
});
assert.equal(invalidRecoveryProviderCreated, false, "an ACTIVE hole must fail before provider construction");
assert.equal(invalidRecovery.providerMutationAttempted, false);
assert.equal(invalidRecoveryClient.calls.some((call) => call.name === "arm_meta_campaign_activation_object"), false);

for (const transientFailure of [
  new ApiError(503, "Synthetic provider authority timeout", "synthetic_timeout"),
  new ApiError(429, "Synthetic provider authority rate limit", "synthetic_rate_limit"),
  new service.MetaActivationAmbiguousError("Synthetic transient Graph read exhaustion"),
]) {
  const transientClient = fakeClient();
  const transient = await service.processDueMetaCampaignActivationBatch({
    client: transientClient,
    environment: allowedProduction,
    maxClaims: 5,
    providerFactory: async () => { throw transientFailure; },
  });
  assert.equal(transient.providerMutationAttempted, false);
  assert.equal(transient.claimedCount, 1, "a retryable read failure must not be reclaimed in the same batch");
  assert.equal(JSON.stringify(transient.retryDeferredIds), JSON.stringify([activationId]));
  assert.equal(JSON.stringify(transient.operatorRequiredIds), "[]");
  assert.equal(
    transientClient.calls.find((call) => call.name === "settle_meta_campaign_activation")?.params.p_outcome,
    "retryable",
    "timeout, 429, and exhausted 5xx reads before any arm must remain safely retryable",
  );
  assert.equal(transientClient.calls.some((call) => call.name === "arm_meta_campaign_activation_object"), false);
}
const transientPreflightClient = fakeClient();
const transientPreflight = await service.processDueMetaCampaignActivationBatch({
  client: transientPreflightClient,
  environment: allowedProduction,
  maxClaims: 5,
  providerFactory: async () => ({
    async preflightActivation() {
      throw new service.MetaActivationAmbiguousError("Synthetic exhausted preflight read retries");
    },
    async activateObject() { throw new Error("unreachable"); },
  }),
});
assert.equal(JSON.stringify(transientPreflight.retryDeferredIds), JSON.stringify([activationId]));
assert.equal(transientPreflightClient.calls.find((call) => call.name === "settle_meta_campaign_activation")?.params.p_outcome, "retryable");
assert.equal(transientPreflightClient.calls.some((call) => call.name === "arm_meta_campaign_activation_object"), false);

const ambiguousClient = fakeClient();
const ambiguous = await service.processDueMetaCampaignActivationBatch({
  client: ambiguousClient,
  environment: allowedProduction,
  maxClaims: 1,
  providerFactory: async () => ({
    async preflightActivation() { return { evidenceDigest: "b".repeat(64) }; },
    async activateObject() { throw new service.MetaActivationAmbiguousError("synthetic ambiguous write"); },
  }),
});
assert.equal(JSON.stringify(ambiguous.operatorRequiredIds), JSON.stringify([activationId]));
const ambiguousSettlement = ambiguousClient.calls.find((call) =>
  call.name === "settle_meta_campaign_activation" && call.params.p_outcome === "operator_required"
);
assert.ok(ambiguousSettlement, "an armed ambiguous write must become operator-required, never retry");

const liveStates = new Map([
  ["30000000003", {
    id: "30000000003", account_id: "30000000000", status: "PAUSED", effective_status: "PAUSED",
    objective: "OUTCOME_LEADS", special_ad_categories: ["HOUSING"], special_ad_category_country: ["CA"],
    is_adset_budget_sharing_enabled: false, issues_info: [],
  }],
  ["30000000002", {
    id: "30000000002", account_id: "30000000000", campaign_id: "30000000003", status: "PAUSED", effective_status: "PAUSED",
    daily_budget: "6000", targeting: { geo_locations: { countries: ["CA"] } },
    promoted_object: { pixel_id: "30000000020", custom_event_type: "LEAD" },
    optimization_goal: "OFFSITE_CONVERSIONS", billing_event: "IMPRESSIONS", bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    tracking_specs: [{ action_type: ["offsite_conversion"], fb_pixel: ["30000000020"] }], issues_info: [],
  }],
  ["30000000001", {
    id: "30000000001", account_id: "30000000000", campaign_id: "30000000003", adset_id: "30000000002",
    status: "PAUSED", effective_status: "PAUSED", creative: { id: "30000000004" }, issues_info: [], ad_review_feedback: {},
  }],
]);
const liveCreative = {
  id: "30000000004",
  account_id: "30000000000",
  object_story_spec: {
    page_id: "30000000010",
    link_data: {
      message: "Synthetic primary text",
      name: "Synthetic headline",
      link: "https://staging.test/f/synthetic",
      picture: "https://assets.test/ad.png",
      call_to_action: { type: "LEARN_MORE", value: { link: "https://staging.test/f/synthetic" } },
    },
  },
};
let liveWriteCount = 0;
let liveAccountCurrency = "CAD";
let liveImageDigest = "9".repeat(64);
let transientReadFailures = 0;
let transientReadAttempts = 0;
let lowerLiveBudgetCeilingOnRead = false;
const liveBudgetEnvironment = {
  ...allowedProduction,
  META_DAILY_BUDGET_HARD_CEILING_CENTS: "5000",
};
const liveProviderService = loadTs("src/lib/services/meta-campaign-activation-service.ts", {
  "server-only": {},
  "@/lib/api/route": { ApiError },
  "@/lib/creative-content-integrity": { async resolveCreativeContentSha256() { return liveImageDigest; } },
  "@/lib/integrations/meta/contract": {
    buildMetaGraphUrl(path, params = {}) { const url = new URL(`https://graph.test/${path}`); for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value); return url.toString(); },
    withMetaBearerToken(_token, init = {}) { return init; },
  },
  "@/lib/integrations/meta/budget-safety": { assertCustomerApprovedMetaBudgetCents: assertCurrentDailyBudget },
  "@/lib/integrations/meta/execution": { getMetaAccessToken() { return "synthetic-test-token"; } },
  "@/lib/integrations/meta/request": {
    async fetchMetaJson(url, options = {}) {
      const id = new URL(url).pathname.slice(1).replace(/^act_/, "");
      if (options.method === "POST") {
        liveWriteCount += 1;
        liveStates.get(id).status = "ACTIVE";
        liveStates.get(id).effective_status = "ACTIVE";
        return { response: new Response(null, { status: 200, headers: { "x-fb-request-id": `request-${id}` } }), data: { success: true } };
      }
      if (transientReadFailures > 0) {
        transientReadFailures -= 1;
        transientReadAttempts += 1;
        return { response: new Response(null, { status: 503 }), data: { error: { message: "synthetic transient read" } } };
      }
      if (lowerLiveBudgetCeilingOnRead) {
        lowerLiveBudgetCeilingOnRead = false;
        liveBudgetEnvironment.META_DAILY_BUDGET_HARD_CEILING_CENTS = "4999";
      }
      if (id === "30000000000") {
        return { response: new Response(null, { status: 200 }), data: { id: "act_30000000000", account_id: "30000000000", currency: liveAccountCurrency, account_status: 1 } };
      }
      if (id === "30000000004") {
        return { response: new Response(null, { status: 200 }), data: structuredClone(liveCreative) };
      }
      return { response: new Response(null, { status: 200 }), data: { ...liveStates.get(id) } };
    },
  },
  "@/lib/meta-campaign-activation-gate": gate,
  "@/lib/supabase/admin": { createAdminClient() { throw new Error("unused"); } },
  "@/lib/services/meta-campaign-activation-authority-service": { recoverMetaActivationPreauthorizations() { throw new Error("unused"); } },
});
const liveProvider = liveProviderService.createMetaCampaignActivationProvider({
  connection: { external_account_id: "act_30000000000", access_token_encrypted: "synthetic" },
  expectedProviderAdAccountId: "act_30000000000",
  expectedContract: {
    activationInputDigest: digest,
    launchInputDigest: "f".repeat(64),
    accountId: "30000000000",
    currency: "CAD",
    pageId: "30000000010",
    pixelId: "30000000020",
    campaignId: "30000000003",
    adSetIds: ["30000000002"],
    creativeId: "30000000004",
    adIds: ["30000000001"],
    objective: "OUTCOME_LEADS",
    specialAdCategories: ["HOUSING"],
    specialAdCategoryCountries: ["CA"],
    isAdSetBudgetSharingEnabled: false,
    countryCode: "CA",
    dailyBudgetMinor: 5000,
    optimizationGoal: "OFFSITE_CONVERSIONS",
    billingEvent: "IMPRESSIONS",
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: { geo_locations: { countries: ["CA"] } },
    destinationType: null,
    promotedObject: { pixel_id: "30000000020", custom_event_type: "LEAD" },
    trackingSpecs: [{ action_type: ["offsite_conversion"], fb_pixel: ["30000000020"] }],
    adDestination: "website",
    destinationUrl: "https://staging.test/f/synthetic",
    callToActionType: "LEARN_MORE",
    creativeLink: "https://staging.test/f/synthetic",
    ctaLink: "https://staging.test/f/synthetic",
    providerFormBinding: null,
    primaryTextSha256: crypto.createHash("sha256").update("Synthetic primary text").digest("hex"),
    headlineSha256: crypto.createHash("sha256").update("Synthetic headline").digest("hex"),
    imageContentSha256: "9".repeat(64),
    providerFormId: null,
    formDefinitionDigest: null,
    creationReceiptDigest: "8".repeat(64),
  },
  environment: liveBudgetEnvironment,
});
const liveProviderObjects = claimRow().provider_objects;
await assert.rejects(
  liveProvider.preflightActivation({ providerObjects: liveProviderObjects, activationInputDigest: digest, approvedDailyBudgetMinor: 5000, approvedCurrency: "CAD" }),
  (error) => error.code === "meta_activation_provider_drift",
);
assert.equal(liveWriteCount, 0, "budget drift must fail before any ACTIVE write");
liveStates.get("30000000002").daily_budget = "5000";
liveAccountCurrency = "BHD";
await assert.rejects(
  liveProvider.preflightActivation({ providerObjects: liveProviderObjects, activationInputDigest: digest, approvedDailyBudgetMinor: 5000, approvedCurrency: "BHD" }),
  (error) => error.code === "meta_activation_provider_drift",
  "a matching but unsupported three-letter provider currency must fail closed",
);
assert.equal(liveWriteCount, 0, "unsupported currency must fail before any ACTIVE write");
liveAccountCurrency = "CAD";
const exactPreflight = await liveProvider.preflightActivation({ providerObjects: liveProviderObjects, activationInputDigest: digest, approvedDailyBudgetMinor: 5000, approvedCurrency: "CAD" });
lowerLiveBudgetCeilingOnRead = true;
await assert.rejects(
  liveProvider.activateObject({
    providerObjectId: liveProviderObjects[0].providerId,
    providerObjectType: liveProviderObjects[0].type,
    activationInputDigest: digest,
    approvedDailyBudgetMinor: 5000,
    approvedCurrency: "CAD",
    preflightEvidenceDigest: exactPreflight.evidenceDigest,
  }),
  (error) => error.code === "meta_budget_hard_ceiling_exceeded",
  "a ceiling lowered during final provider preflight must still block the ACTIVE request",
);
assert.equal(liveWriteCount, 0, "the provider's last-mile budget proof must precede the Graph POST");
liveBudgetEnvironment.META_DAILY_BUDGET_HARD_CEILING_CENTS = "5000";
for (const object of liveProviderObjects) {
  const receipt = await liveProvider.activateObject({
    providerObjectId: object.providerId,
    providerObjectType: object.type,
    activationInputDigest: digest,
    approvedDailyBudgetMinor: 5000,
    approvedCurrency: "CAD",
    preflightEvidenceDigest: exactPreflight.evidenceDigest,
  });
  assert.equal(receipt.observedStatus, "ACTIVE");
}
assert.equal(liveWriteCount, 3);
const deliveredContract = await liveProvider.verifyFinalContract({
  activationInputDigest: digest,
  approvedDailyBudgetMinor: 5000,
  approvedCurrency: "CAD",
});
assert.equal(deliveredContract.deliveryState, "delivery_active");
assert.match(deliveredContract.evidenceDigest, /^[0-9a-f]{64}$/);
liveStates.get("30000000001").effective_status = "PENDING_REVIEW";
const reviewPendingContract = await liveProvider.verifyFinalContract({
  activationInputDigest: digest,
  approvedDailyBudgetMinor: 5000,
  approvedCurrency: "CAD",
});
assert.equal(reviewPendingContract.deliveryState, "configured_active_pending_review");
liveStates.get("30000000001").effective_status = "DISAPPROVED";
await assert.rejects(
  liveProvider.verifyFinalContract({ activationInputDigest: digest, approvedDailyBudgetMinor: 5000, approvedCurrency: "CAD" }),
  (error) => error.code === "meta_activation_provider_drift",
  "a disapproved effective status must never be reported as active delivery",
);
liveStates.get("30000000001").effective_status = "ACTIVE";
liveStates.get("30000000001").issues_info = [{ code: "synthetic_issue" }];
await assert.rejects(
  liveProvider.verifyFinalContract({ activationInputDigest: digest, approvedDailyBudgetMinor: 5000, approvedCurrency: "CAD" }),
  (error) => error.code === "meta_activation_provider_drift",
  "provider issues must fail closed instead of becoming generic active",
);
liveStates.get("30000000001").issues_info = [];

const allRecoveredProviderObjects = liveProviderObjects.map((object) => ({
  ...object,
  status: "active",
  mutationState: "reconciled",
}));
async function assertMaterialContractDrift(label, mutate, restore) {
  mutate();
  const writeBaseline = liveWriteCount;
  try {
    await assert.rejects(
      liveProvider.preflightActivation({
        providerObjects: allRecoveredProviderObjects,
        activationInputDigest: digest,
        approvedDailyBudgetMinor: 5000,
        approvedCurrency: "CAD",
      }),
      (error) => error.code === "meta_activation_provider_drift",
      label,
    );
    assert.equal(liveWriteCount, writeBaseline, `${label}: drift detection must be read-only`);
  } finally {
    restore();
  }
}
await assertMaterialContractDrift("objective drift", () => { liveStates.get("30000000003").objective = "OUTCOME_TRAFFIC"; }, () => { liveStates.get("30000000003").objective = "OUTCOME_LEADS"; });
await assertMaterialContractDrift("special category drift", () => { liveStates.get("30000000003").special_ad_categories = []; }, () => { liveStates.get("30000000003").special_ad_categories = ["HOUSING"]; });
await assertMaterialContractDrift("special category country drift", () => { liveStates.get("30000000003").special_ad_category_country = ["US"]; }, () => { liveStates.get("30000000003").special_ad_category_country = ["CA"]; });
await assertMaterialContractDrift("budget-sharing drift", () => { liveStates.get("30000000003").is_adset_budget_sharing_enabled = true; }, () => { liveStates.get("30000000003").is_adset_budget_sharing_enabled = false; });
await assertMaterialContractDrift("target country drift", () => { liveStates.get("30000000002").targeting = { geo_locations: { countries: ["US"] } }; }, () => { liveStates.get("30000000002").targeting = { geo_locations: { countries: ["CA"] } }; });
await assertMaterialContractDrift("unapproved custom-location drift", () => { liveStates.get("30000000002").targeting = { geo_locations: { countries: ["CA"], custom_locations: [{ latitude: 1, longitude: 2 }] } }; }, () => { liveStates.get("30000000002").targeting = { geo_locations: { countries: ["CA"] } }; });
await assertMaterialContractDrift("Pixel drift", () => { liveStates.get("30000000002").promoted_object.pixel_id = "30000000021"; }, () => { liveStates.get("30000000002").promoted_object.pixel_id = "30000000020"; });
await assertMaterialContractDrift("tracking drift", () => { liveStates.get("30000000002").tracking_specs = [{ action_type: ["link_click"], fb_pixel: ["30000000020"] }]; }, () => { liveStates.get("30000000002").tracking_specs = [{ action_type: ["offsite_conversion"], fb_pixel: ["30000000020"] }]; });
await assertMaterialContractDrift("optimization drift", () => { liveStates.get("30000000002").optimization_goal = "LINK_CLICKS"; }, () => { liveStates.get("30000000002").optimization_goal = "OFFSITE_CONVERSIONS"; });
await assertMaterialContractDrift("billing drift", () => { liveStates.get("30000000002").billing_event = "LINK_CLICKS"; }, () => { liveStates.get("30000000002").billing_event = "IMPRESSIONS"; });
await assertMaterialContractDrift("bid strategy drift", () => { liveStates.get("30000000002").bid_strategy = "LOWEST_COST_WITH_BID_CAP"; }, () => { liveStates.get("30000000002").bid_strategy = "LOWEST_COST_WITHOUT_CAP"; });
await assertMaterialContractDrift("ad-to-creative drift", () => { liveStates.get("30000000001").creative = { id: "30000000005" }; }, () => { liveStates.get("30000000001").creative = { id: "30000000004" }; });
await assertMaterialContractDrift("Page drift", () => { liveCreative.object_story_spec.page_id = "30000000011"; }, () => { liveCreative.object_story_spec.page_id = "30000000010"; });
await assertMaterialContractDrift("primary copy drift", () => { liveCreative.object_story_spec.link_data.message = "Changed copy"; }, () => { liveCreative.object_story_spec.link_data.message = "Synthetic primary text"; });
await assertMaterialContractDrift("headline drift", () => { liveCreative.object_story_spec.link_data.name = "Changed headline"; }, () => { liveCreative.object_story_spec.link_data.name = "Synthetic headline"; });
await assertMaterialContractDrift("CTA drift", () => { liveCreative.object_story_spec.link_data.call_to_action.type = "SIGN_UP"; }, () => { liveCreative.object_story_spec.link_data.call_to_action.type = "LEARN_MORE"; });
await assertMaterialContractDrift("destination drift", () => { liveCreative.object_story_spec.link_data.call_to_action.value.link = "https://example.test/drift"; }, () => { liveCreative.object_story_spec.link_data.call_to_action.value.link = "https://staging.test/f/synthetic"; });
await assertMaterialContractDrift("creative byte drift", () => { liveImageDigest = "7".repeat(64); }, () => { liveImageDigest = "9".repeat(64); });

transientReadFailures = 1;
transientReadAttempts = 0;
await liveProvider.preflightActivation({
  providerObjects: allRecoveredProviderObjects,
  activationInputDigest: digest,
  approvedDailyBudgetMinor: 5000,
  approvedCurrency: "CAD",
});
assert.equal(transientReadAttempts, 1, "one transient contract read must be retried within the bounded read policy");

const recoveredProviderObjects = liveProviderObjects.map((object, index) => index === 0
  ? { ...object, status: "active", mutationState: "reconciled" }
  : object);
liveStates.get("30000000001").status = "ACTIVE";
liveStates.get("30000000002").status = "PAUSED";
liveStates.get("30000000003").status = "PAUSED";
const recoveryWriteBaseline = liveWriteCount;
const recoveredPreflight = await liveProvider.preflightActivation({
  providerObjects: recoveredProviderObjects,
  activationInputDigest: digest,
  approvedDailyBudgetMinor: 5000,
  approvedCurrency: "CAD",
});
for (const object of recoveredProviderObjects.slice(1)) {
  const receipt = await liveProvider.activateObject({
    providerObjectId: object.providerId,
    providerObjectType: object.type,
    activationInputDigest: digest,
    approvedDailyBudgetMinor: 5000,
    approvedCurrency: "CAD",
    preflightEvidenceDigest: recoveredPreflight.evidenceDigest,
  });
  assert.equal(receipt.observedStatus, "ACTIVE");
}
assert.equal(liveWriteCount - recoveryWriteBaseline, 2, "recovery must mutate only the PAUSED suffix");

const missingReceiptPrefix = recoveredProviderObjects.map((object, index) => index === 0
  ? { ...object, mutationState: "idle" }
  : object);
await assert.rejects(
  liveProvider.preflightActivation({ providerObjects: missingReceiptPrefix, activationInputDigest: digest, approvedDailyBudgetMinor: 5000, approvedCurrency: "CAD" }),
  (error) => error.code === "meta_activation_provider_drift",
  "an ACTIVE prefix without a durable receipt or reconciliation must fail closed",
);
const activeHole = liveProviderObjects.map((object, index) => index === 1
  ? { ...object, status: "active", mutationState: "reconciled" }
  : object);
await assert.rejects(
  liveProvider.preflightActivation({ providerObjects: activeHole, activationInputDigest: digest, approvedDailyBudgetMinor: 5000, approvedCurrency: "CAD" }),
  (error) => error.code === "meta_activation_provider_drift",
  "an out-of-order ACTIVE hole must fail closed",
);

const formDefinition = {
  questions: [
    { type: "FULL_NAME", key: "full_name" },
    { type: "EMAIL", key: "email" },
    { type: "PHONE", key: "phone" },
    { type: "CUSTOM", key: "dealflow_custom_1", label: "Are you planning to move in 90 days?" },
  ],
  quality: true,
  privacyPolicyUrl: "https://staging.test/privacy",
  followUpActionUrl: "https://staging.test/f/form/thank-you",
};
const formDefinitionDigest = crypto.createHash("sha256").update(JSON.stringify(formDefinition)).digest("hex");
const instantFormStates = new Map([
  ["40000000003", {
    id: "40000000003", account_id: "40000000000", status: "PAUSED", effective_status: "PAUSED",
    objective: "OUTCOME_LEADS", special_ad_categories: ["HOUSING"], special_ad_category_country: ["US"],
    is_adset_budget_sharing_enabled: false, issues_info: [],
  }],
  ["40000000002", {
    id: "40000000002", account_id: "40000000000", campaign_id: "40000000003", status: "PAUSED", effective_status: "PAUSED",
    daily_budget: "5000", targeting: { geo_locations: { countries: ["US"] } },
    promoted_object: { page_id: "40000000010" }, destination_type: "ON_AD",
    optimization_goal: "LEAD_GENERATION", billing_event: "IMPRESSIONS", bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    tracking_specs: [], issues_info: [],
  }],
  ["40000000001", {
    id: "40000000001", account_id: "40000000000", campaign_id: "40000000003", adset_id: "40000000002",
    status: "PAUSED", effective_status: "PAUSED", creative: { id: "40000000004" }, issues_info: [], ad_review_feedback: {},
  }],
]);
const instantFormCreative = {
  id: "40000000004",
  account_id: "40000000000",
  object_story_spec: {
    page_id: "40000000010",
    link_data: {
      message: "Instant Form primary text",
      name: "Instant Form headline",
      link: "https://fb.me/",
      picture: "https://assets.test/form-ad.png",
      call_to_action: { type: "LEARN_MORE", value: { lead_gen_form_id: "40000000030" } },
    },
  },
};
const instantFormRecord = {
  id: "40000000030",
  name: "Synthetic DealFlow form",
  status: "ACTIVE",
  questions: structuredClone(formDefinition.questions),
  privacy_policy: { url: formDefinition.privacyPolicyUrl },
  follow_up_action_url: formDefinition.followUpActionUrl,
  is_optimized_for_quality: true,
  block_display_for_non_targeted_viewer: true,
};
let instantFormWriteCount = 0;
let instantFormImageDigest = "a".repeat(64);
const instantFormProviderService = loadTs("src/lib/services/meta-campaign-activation-service.ts", {
  "server-only": {},
  "@/lib/api/route": { ApiError },
  "@/lib/creative-content-integrity": { async resolveCreativeContentSha256() { return instantFormImageDigest; } },
  "@/lib/integrations/meta/contract": {
    buildMetaGraphUrl(path, params = {}) { const url = new URL(`https://graph.test/${path}`); for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value); return url.toString(); },
    withMetaBearerToken(_token, init = {}) { return init; },
  },
  "@/lib/integrations/meta/budget-safety": { assertCustomerApprovedMetaBudgetCents: assertCurrentDailyBudget },
  "@/lib/integrations/meta/execution": { getMetaAccessToken() { return "synthetic-form-token"; } },
  "@/lib/integrations/meta/request": {
    async fetchMetaJson(url, options = {}) {
      const id = new URL(url).pathname.slice(1).replace(/^act_/, "");
      if (options.method === "POST") {
        instantFormWriteCount += 1;
        instantFormStates.get(id).status = "ACTIVE";
        instantFormStates.get(id).effective_status = "ACTIVE";
        return { response: new Response(null, { status: 200, headers: { "x-fb-request-id": `form-${id}` } }), data: { success: true } };
      }
      if (id === "40000000000") {
        return { response: new Response(null, { status: 200 }), data: { id: "act_40000000000", account_id: "40000000000", currency: "USD", account_status: 1 } };
      }
      if (id === "40000000004") return { response: new Response(null, { status: 200 }), data: structuredClone(instantFormCreative) };
      if (id === "40000000030") return { response: new Response(null, { status: 200 }), data: structuredClone(instantFormRecord) };
      return { response: new Response(null, { status: 200 }), data: { ...instantFormStates.get(id) } };
    },
  },
  "@/lib/meta-campaign-activation-gate": gate,
  "@/lib/supabase/admin": { createAdminClient() { throw new Error("unused"); } },
  "@/lib/services/meta-campaign-activation-authority-service": { recoverMetaActivationPreauthorizations() { throw new Error("unused"); } },
});
const instantFormProvider = instantFormProviderService.createMetaCampaignActivationProvider({
  connection: { external_account_id: "act_40000000000", access_token_encrypted: "synthetic" },
  expectedProviderAdAccountId: "40000000000",
  expectedContract: {
    activationInputDigest: digest,
    launchInputDigest: "e".repeat(64),
    accountId: "40000000000",
    currency: "USD",
    pageId: "40000000010",
    pixelId: "40000000020",
    campaignId: "40000000003",
    adSetIds: ["40000000002"],
    creativeId: "40000000004",
    adIds: ["40000000001"],
    objective: "OUTCOME_LEADS",
    specialAdCategories: ["HOUSING"],
    specialAdCategoryCountries: ["US"],
    isAdSetBudgetSharingEnabled: false,
    countryCode: "US",
    dailyBudgetMinor: 5000,
    optimizationGoal: "LEAD_GENERATION",
    billingEvent: "IMPRESSIONS",
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: { geo_locations: { countries: ["US"] } },
    destinationType: "ON_AD",
    promotedObject: { page_id: "40000000010" },
    trackingSpecs: [],
    adDestination: "meta_instant_form",
    destinationUrl: "https://staging.test/f/form",
    callToActionType: "LEARN_MORE",
    creativeLink: "https://fb.me/",
    ctaLink: null,
    providerFormBinding: "provisioning_receipt",
    primaryTextSha256: crypto.createHash("sha256").update("Instant Form primary text").digest("hex"),
    headlineSha256: crypto.createHash("sha256").update("Instant Form headline").digest("hex"),
    imageContentSha256: "a".repeat(64),
    providerFormId: "40000000030",
    formDefinitionDigest,
    creationReceiptDigest: "6".repeat(64),
  },
  environment: { ...allowedProduction, META_DAILY_BUDGET_HARD_CEILING_CENTS: "5000" },
});
const instantFormProviderObjects = [
  { id: crypto.randomUUID(), sequence: 1, type: "ad", providerId: "40000000001", status: "pending", mutationState: "idle" },
  { id: crypto.randomUUID(), sequence: 2, type: "adset", providerId: "40000000002", status: "pending", mutationState: "idle" },
  { id: crypto.randomUUID(), sequence: 3, type: "campaign", providerId: "40000000003", status: "pending", mutationState: "idle" },
];
await instantFormProvider.preflightActivation({ providerObjects: instantFormProviderObjects, activationInputDigest: digest, approvedDailyBudgetMinor: 5000, approvedCurrency: "USD" });
instantFormCreative.object_story_spec.link_data.call_to_action.value.lead_gen_form_id = "40000000031";
await assert.rejects(
  instantFormProvider.preflightActivation({ providerObjects: instantFormProviderObjects, activationInputDigest: digest, approvedDailyBudgetMinor: 5000, approvedCurrency: "USD" }),
  (error) => error.code === "meta_activation_provider_drift",
  "Instant Form ID drift must fail before activation",
);
assert.equal(instantFormWriteCount, 0);
instantFormCreative.object_story_spec.link_data.call_to_action.value.lead_gen_form_id = "40000000030";
instantFormRecord.questions[3].label = "Changed without approval";
await assert.rejects(
  instantFormProvider.preflightActivation({ providerObjects: instantFormProviderObjects, activationInputDigest: digest, approvedDailyBudgetMinor: 5000, approvedCurrency: "USD" }),
  (error) => error.code === "meta_activation_provider_drift",
  "Instant Form definition drift must fail before activation",
);
assert.equal(instantFormWriteCount, 0);
instantFormRecord.questions[3].label = "Are you planning to move in 90 days?";
const instantFormPreflight = await instantFormProvider.preflightActivation({
  providerObjects: instantFormProviderObjects,
  activationInputDigest: digest,
  approvedDailyBudgetMinor: 5000,
  approvedCurrency: "USD",
});
for (const object of instantFormProviderObjects) {
  await instantFormProvider.activateObject({
    providerObjectId: object.providerId,
    providerObjectType: object.type,
    activationInputDigest: digest,
    approvedDailyBudgetMinor: 5000,
    approvedCurrency: "USD",
    preflightEvidenceDigest: instantFormPreflight.evidenceDigest,
  });
}
assert.equal(instantFormWriteCount, 3);
const instantFormFinal = await instantFormProvider.verifyFinalContract({ activationInputDigest: digest, approvedDailyBudgetMinor: 5000, approvedCurrency: "USD" });
assert.equal(instantFormFinal.deliveryState, "delivery_active");

const claimSafety = loadTs("src/lib/copy/claim-safety.ts");
const advertisingClaimBoundaries = loadTs("src/lib/advertising-claim-boundaries.ts", {
  "@/lib/copy/claim-safety": claimSafety,
});
const launchSnapshot = loadTs("src/lib/meta-launch-input-snapshot.ts", {
  "server-only": {},
  "@/lib/advertising-claim-boundaries": advertisingClaimBoundaries,
});
const snapshotInput = {
  organizationId: "10000000-0000-4000-8000-000000000002",
  campaignId: "10000000-0000-4000-8000-000000000004",
  attemptId: "10000000-0000-4000-8000-000000000005",
  adAccountId: "30000000000",
  accountCurrency: "USD",
  pageId: "30000000010",
  pixelId: "30000000020",
  selectedAdId: "selected-ad",
  imageContentSha256: "a".repeat(64),
  primaryText: "Synthetic primary text",
  headline: "Synthetic headline",
  destinationUrl: "https://staging.test/f/synthetic",
  objective: "OUTCOME_LEADS",
  countryCode: "US",
  location: "Toronto",
  dailyBudgetMinor: "5000",
};
assert.equal(
  launchSnapshot.buildMetaLaunchInputBinding(snapshotInput).snapshot.provider.account_currency,
  "USD",
);
const firstCreativeBinding = launchSnapshot.buildMetaLaunchInputBinding(snapshotInput);
const changedBytesSameAssetBinding = launchSnapshot.buildMetaLaunchInputBinding({
  ...snapshotInput,
  imageContentSha256: "b".repeat(64),
});
assert.notEqual(firstCreativeBinding.digest, changedBytesSameAssetBinding.digest);
assert.equal(firstCreativeBinding.snapshot.creative.image_content_sha256, "a".repeat(64));
assert.equal(JSON.stringify(firstCreativeBinding.snapshot.provider_contract), JSON.stringify({
  campaign: {
    objective: "OUTCOME_LEADS",
    special_ad_categories: ["HOUSING"],
    special_ad_category_country: ["US"],
    is_adset_budget_sharing_enabled: false,
  },
  ad_set: {
    billing_event: "IMPRESSIONS",
    optimization_goal: "OFFSITE_CONVERSIONS",
    daily_budget_minor: "5000",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: { geo_locations: { countries: ["US"] } },
    destination_type: null,
    promoted_object: { pixel_id: "30000000020", custom_event_type: "LEAD" },
    tracking_specs: [{ action_type: ["offsite_conversion"], fb_pixel: ["30000000020"] }],
  },
  creative: {
    page_id: "30000000010",
    call_to_action_type: "LEARN_MORE",
    link: "https://staging.test/f/synthetic",
    cta_link: "https://staging.test/f/synthetic",
    provider_form_binding: null,
  },
}));
assert.throws(
  () => launchSnapshot.buildMetaLaunchInputBinding({ ...snapshotInput, accountCurrency: "BHD" }),
  /must be USD or CAD/,
);

const source = fs.readFileSync("src/app/api/internal/system-jobs/route.ts", "utf8");
assert.match(source, /processMetaCampaignActivationFromEnvironment/);
assert.match(source, /export const maxDuration = 300/);
assert.match(source, /SYSTEM_JOBS_WORK_BUDGET_MS = 240_000/);
assert.match(source, /system_jobs_safe_deadline_exhausted/);
assert.match(source, /processMetaCampaignActivationFromEnvironment\(\{ maxClaims: 1 \}\)/);
assert.doesNotMatch(source, /Promise\.all\(\[\s*runSystemJobWorkerBatch/);
const authorityRoute = fs.readFileSync("src/app/api/campaigns/[id]/meta-activation/route.ts", "utf8");
assert.match(authorityRoute, /assertSameOriginRequest\(request\)/);
assert.match(authorityRoute, /CANCEL_META_CAMPAIGN_ACTIVATION/);
assert.match(authorityRoute, /export async function GET/);
assert.match(authorityRoute, /export async function DELETE/);
assert.doesNotMatch(authorityRoute, /export async function POST/);
const cancellationControl = fs.readFileSync("src/components/campaign/launch/meta-activation-cancel-button.tsx", "utf8");
assert.match(cancellationControl, /confirmation: "CANCEL_META_CAMPAIGN_ACTIVATION"/);
assert.match(cancellationControl, /method: "DELETE"/);
assert.match(cancellationControl, /providerMutationPerformed !== false/);
const launchSuccessSource = fs.readFileSync("src/app/(app)/launch-success/page.tsx", "utf8");
assert.match(launchSuccessSource, /record\?\.plan\.daily_budget_cents/);
assert.match(launchSuccessSource, /minimumFractionDigits: 2/);
assert.match(launchSuccessSource, /selectedAccountCurrency === "USD" \|\| selectedAccountCurrency === "CAD"/);
assert.doesNotMatch(launchSuccessSource, /currency: "CAD"/);
const metaSelectionSource = fs.readFileSync("src/lib/integrations/meta/service.ts", "utf8");
assert.match(metaSelectionSource, /meta_ad_account_currency_unsupported/);
assert.match(metaSelectionSource, /value === "USD" \|\| value === "CAD"/);
assert.match(fs.readFileSync("src/app/api/campaigns/[id]/launch/route.ts", "utf8"), /finalizeMetaActivationPreauthorizationAfterPausedLaunch/);
assert.match(fs.readFileSync("src/lib/services/scheduled-campaign-launch-service.ts", "utf8"), /finalizeMetaActivationPreauthorizationAfterPausedLaunch/);
const migration = fs.readFileSync("supabase/migrations/20260713011000_create_customer_authorized_meta_activation.sql", "utf8");
const hardeningMigration = fs.readFileSync("supabase/migrations/20260713012100_harden_meta_activation_delivery_and_recovery.sql", "utf8");
const preauthorizationMigration = fs.readFileSync("supabase/migrations/20260713012000_require_meta_activation_preauthorization.sql", "utf8");
for (const contract of [
  "authorize_meta_campaign_activation", "claim_due_meta_campaign_activation",
  "renew_meta_campaign_activation_claim", "arm_meta_campaign_activation_object",
  "record_meta_campaign_activation_receipt", "settle_meta_campaign_activation_object",
  "settle_meta_campaign_activation", "reconcile_meta_campaign_activation_object",
]) assert.match(migration, new RegExp(contract));
assert.match(migration, /'staging', false, 1, 'seeded_closed'/);
assert.match(migration, /'production', false, 1, 'seeded_closed'/);
for (const contract of [
  "preauthorize_meta_campaign_activation",
  "get_meta_campaign_activation_authorization_status",
  "cancel_meta_campaign_activation_preauthorization",
  "finalize_meta_campaign_activation_preauthorization",
]) assert.match(preauthorizationMigration, new RegExp(contract));
assert.match(preauthorizationMigration, /revoke all on function public\.authorize_meta_campaign_activation/);
assert.match(preauthorizationMigration, /activation preauthorization identity is immutable/);
assert.match(preauthorizationMigration, /auth\.role\(\) is distinct from 'service_role'/);
assert.match(
  fs.readFileSync("src/lib/services/meta-campaign-activation-service.ts", "utf8"),
  /assertCustomerApprovedMetaBudgetCents[\s\S]*arm_meta_campaign_activation_object[\s\S]*assertCustomerApprovedMetaBudgetCents[\s\S]*provider\.activateObject/,
  "the current hard ceiling must be checked both before arming and immediately before each provider write",
);
assert.match(hardeningMigration, /earlier\.sequence_number < target\.sequence_number[\s\S]*earlier\.status <> 'active'/);
assert.match(hardeningMigration, /provider_delivery_status = 'not_activated'/);
assert.match(hardeningMigration, /p_outcome not in \('active', 'rejected', 'operator_required', 'retryable'\)/);
const authoritativeCreateRoute = fs.readFileSync("src/app/api/campaigns/create/route.ts", "utf8");
assert.match(authoritativeCreateRoute, /const providerContract = launchInputBinding\.snapshot\.provider_contract/);
assert.match(authoritativeCreateRoute, /targeting: JSON\.stringify\(providerContract\.ad_set\.targeting\)/);
assert.match(authoritativeCreateRoute, /special_ad_category_country: JSON\.stringify\(providerContract\.campaign\.special_ad_category_country\)/);

console.log("Meta PAUSED-to-due activation gates, injection, fencing, receipts, and operator escalation contracts passed.");
