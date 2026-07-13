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
const gate = loadTs("src/lib/meta-campaign-activation-gate.ts", {
  "@/lib/deployment-target": deployment,
});

const allowedProduction = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "production",
  ALLOW_META_LIVE_LAUNCH: "true",
  ALLOW_META_DUE_ACTIVATION: "true",
  ALLOW_META_PRODUCTION_DUE_ACTIVATION: "true",
};
assert.equal(gate.getMetaCampaignActivationGate({}).reason, "activation_disabled");
assert.equal(gate.getMetaCampaignActivationGate({ ...allowedProduction, ALLOW_META_DUE_ACTIVATION: "TRUE" }).allowed, false);
assert.equal(gate.getMetaCampaignActivationGate({ ...allowedProduction, ALLOW_META_LIVE_LAUNCH: "false" }).reason, "meta_live_launch_disabled");
assert.equal(gate.getMetaCampaignActivationGate({ ...allowedProduction, ALLOW_META_PRODUCTION_DUE_ACTIVATION: "false" }).reason, "production_activation_disabled");
assert.equal(gate.getMetaCampaignActivationGate(allowedProduction).allowed, true);
assert.equal(gate.getMetaCampaignActivationGate({
  ...allowedProduction,
  VERCEL_ENV: "preview",
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
  ALLOW_META_PRODUCTION_DUE_ACTIVATION: "false",
  ALLOW_META_STAGING_DUE_ACTIVATION: "true",
}).target, "staging");
assert.equal(gate.getMetaCampaignActivationGate({
  ...allowedProduction,
  VERCEL_ENV: "preview",
  DEALFLOW_DEPLOYMENT_TARGET: "test",
}).reason, "unsupported_deployment_target");

class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const service = loadTs("src/lib/services/meta-campaign-activation-service.ts", {
  "server-only": {},
  "@/lib/api/route": { ApiError },
  "@/lib/integrations/meta/contract": { buildMetaGraphUrl() {}, withMetaBearerToken() {} },
  "@/lib/integrations/meta/execution": { getMetaAccessToken() { throw new Error("real provider forbidden"); } },
  "@/lib/integrations/meta/request": { fetchMetaJson() { throw new Error("real provider forbidden"); } },
  "@/lib/meta-campaign-activation-gate": gate,
  "@/lib/supabase/admin": { createAdminClient() { throw new Error("admin client should be injected"); } },
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

function fakeClient() {
  let claimCount = 0;
  const calls = [];
  return {
    calls,
    from() { throw new Error("default provider authority lookup must not run with injected provider"); },
    async rpc(name, params) {
      calls.push({ name, params });
      if (name === "claim_due_meta_campaign_activation") {
        claimCount += 1;
        return { data: claimCount === 1 ? [claimRow()] : [], error: null };
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

const client = fakeClient();
const activated = await service.processDueMetaCampaignActivationBatch({
  client,
  environment: allowedProduction,
  maxClaims: 2,
  workerId: "contract-worker",
  providerFactory: async () => ({
    async activateObject(input) {
      providerCalls += 1;
      assert.equal(input.activationInputDigest, digest);
      assert.equal(input.approvedDailyBudgetMinor, 5000);
      assert.equal(input.approvedCurrency, "CAD");
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

const ambiguousClient = fakeClient();
const ambiguous = await service.processDueMetaCampaignActivationBatch({
  client: ambiguousClient,
  environment: allowedProduction,
  maxClaims: 1,
  providerFactory: async () => ({
    async activateObject() { throw new service.MetaActivationAmbiguousError("synthetic ambiguous write"); },
  }),
});
assert.equal(JSON.stringify(ambiguous.operatorRequiredIds), JSON.stringify([activationId]));
const ambiguousSettlement = ambiguousClient.calls.find((call) =>
  call.name === "settle_meta_campaign_activation" && call.params.p_outcome === "operator_required"
);
assert.ok(ambiguousSettlement, "an armed ambiguous write must become operator-required, never retry");

const source = fs.readFileSync("src/app/api/internal/system-jobs/route.ts", "utf8");
assert.match(source, /processMetaCampaignActivationFromEnvironment/);
assert.match(source, /maxClaims: 5/);
const migration = fs.readFileSync("supabase/migrations/20260713011000_create_customer_authorized_meta_activation.sql", "utf8");
for (const contract of [
  "authorize_meta_campaign_activation", "claim_due_meta_campaign_activation",
  "renew_meta_campaign_activation_claim", "arm_meta_campaign_activation_object",
  "record_meta_campaign_activation_receipt", "settle_meta_campaign_activation_object",
  "settle_meta_campaign_activation", "reconcile_meta_campaign_activation_object",
]) assert.match(migration, new RegExp(contract));
assert.match(migration, /'staging', false, 1, 'seeded_closed'/);
assert.match(migration, /'production', false, 1, 'seeded_closed'/);

console.log("Meta PAUSED-to-due activation gates, injection, fencing, receipts, and operator escalation contracts passed.");
