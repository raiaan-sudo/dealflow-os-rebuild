#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const billingSource = fs.readFileSync(
  path.join(root, "src/lib/services/billing-service.ts"),
  "utf8",
);

class TestApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function loadBillingModule(dependencies) {
  const output = ts.transpileModule(billingSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  const fallback = new Proxy(
    { CREDIT_TOP_UP_MINIMUM_CENTS: 2_500 },
    {
      get(target, property) {
        if (property in target) return target[property];
        return () => undefined;
      },
    },
  );
  const evaluate = new Function("require", "module", "exports", output);
  evaluate(
    (specifier) => dependencies.get(specifier) ?? fallback,
    loadedModule,
    loadedModule.exports,
  );
  return loadedModule.exports;
}

let expectedLivemode = true;
let adminClient = null;
let providerExecute = async () => {
  throw new Error("provider execution was not configured for this test");
};
const dependencies = new Map([
  ["@/lib/api/route", { ApiError: TestApiError }],
  [
    "@/lib/env",
    {
      getStripeEnv: () => ({
        mode: expectedLivemode ? "live" : "test",
        livemode: expectedLivemode,
      }),
      isBillingAdminOverrideEnabled: () => false,
      isInternalAdminEmail: () => false,
    },
  ],
  ["@/lib/supabase/admin", { createAdminClient: () => adminClient }],
  [
    "@/lib/integrations/stripe/provider",
    { getStripeBillingProvider: () => ({ execute: providerExecute, isConfigured: () => true }) },
  ],
  [
    "@/lib/logging",
    { logError: () => undefined, logOperationalEvent: () => undefined, logWarn: () => undefined },
  ],
]);
const billing = loadBillingModule(dependencies);

function stripeEvent({ id, livemode }) {
  return {
    id,
    type: "customer.subscription.updated",
    created: 1_784_000_000,
    api_version: "2026-04-22.dahlia",
    livemode,
    data: {
      object: {
        object: "subscription",
        id: "sub_runtime_mode_fixture",
        livemode,
        metadata: { organization_id: "11111111-1111-4111-8111-111111111111" },
      },
    },
  };
}

expectedLivemode = true;
await assert.rejects(
  () => billing.claimStripeWebhookEvent(stripeEvent({ id: "evt_test_in_live", livemode: false })),
  (error) => error instanceof TestApiError && error.code === "stripe_runtime_mode_mismatch",
  "a test-mode Stripe event was accepted by live runtime",
);

expectedLivemode = false;
await assert.rejects(
  () => billing.claimStripeWebhookEvent(stripeEvent({ id: "evt_live_in_test", livemode: true })),
  (error) => error instanceof TestApiError && error.code === "stripe_runtime_mode_mismatch",
  "a live Stripe event was accepted by isolated test runtime",
);

expectedLivemode = true;
const liveEvent = stripeEvent({ id: "evt_authoritative_refresh", livemode: true });
const authoritativeSubscription = {
  ...liveEvent.data.object,
  items: { data: [] },
  status: "active",
};
assert.equal(
  await billing.retrieveAuthoritativeStripeSubscriptionForEvent(
    liveEvent,
    async (subscriptionId) => {
      assert.equal(subscriptionId, authoritativeSubscription.id);
      return authoritativeSubscription;
    },
  ),
  authoritativeSubscription,
  "a matching authoritative live subscription was not accepted",
);

const rpcCalls = [];
adminClient = {
  async rpc(name, args) {
    rpcCalls.push({ name, args });
    if (name === "claim_stripe_webhook_event_v2") {
      return {
        data: [{
          claim_outcome: "claimed",
          receipt_id: "22222222-2222-4222-8222-222222222222",
          receipt_status: "processing",
          claim_token: args.p_claim_token,
          claim_generation: 1,
          locked_until: "2099-01-01T00:00:00.000Z",
        }],
        error: null,
      };
    }
    if (name === "settle_stripe_webhook_event_v2") {
      return { data: true, error: null };
    }
    throw new Error(`unexpected projection RPC: ${name}`);
  },
};
providerExecute = async (request) => {
  assert.equal(request.action, "retrieve_subscription");
  throw new TypeError("simulated response-loss ambiguity");
};

await assert.rejects(
  () => billing.handleStripeBillingEvent(liveEvent),
  (error) => error instanceof TestApiError && error.code === "stripe_subscription_refresh_ambiguous",
  "subscription retrieval ambiguity did not fail the webhook for retry",
);
assert.deepEqual(
  rpcCalls.map(({ name }) => name),
  ["claim_stripe_webhook_event_v2", "settle_stripe_webhook_event_v2"],
  "retrieval ambiguity reached a billing projection RPC",
);
assert.equal(rpcCalls[1].args.p_status, "failed");
assert.notEqual(rpcCalls[1].args.p_status, "processed");
assert.equal(
  rpcCalls.some(({ name }) => name === "apply_billing_subscription_webhook"),
  false,
  "retrieval ambiguity projected an unordered webhook payload",
);

assert.doesNotMatch(billingSource, /refresh_failed_using_event_payload/);
assert.doesNotMatch(
  billingSource,
  /syncBillingSubscriptionFromStripe\(object as Stripe\.Subscription/,
);

console.log(
  "PASS Stripe runtime mode: production/test mismatch rejection and authoritative-refresh retry fencing",
);
