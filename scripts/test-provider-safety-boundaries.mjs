#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createHash } from "node:crypto";

function loadTypeScriptModule(file, dependencies = new Map()) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const evaluate = new Function("require", "module", "exports", output);
  evaluate(
    (specifier) => {
      if (!dependencies.has(specifier)) {
        throw new Error(`Unexpected test import from ${file}: ${specifier}`);
      }
      return dependencies.get(specifier);
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

const deployment = loadTypeScriptModule("src/lib/deployment-target.ts");
assert.equal(deployment.getDeploymentTarget({ NODE_ENV: "production" }), "unknown");
assert.equal(
  deployment.getDeploymentTarget({
    NODE_ENV: "production",
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
  }),
  "staging",
);
assert.equal(deployment.isProductionDeployment({ VERCEL_ENV: "production" }), true);
assert.equal(
  deployment.getDeploymentTarget({
    VERCEL_ENV: "production",
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
  }),
  "production",
  "a repository target overrode the hosting platform production attestation",
);
assert.equal(
  deployment.isExplicitNonProductionDeployment({
    NODE_ENV: "production",
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
  }),
  true,
);

const endpointPolicy = loadTypeScriptModule(
  "src/lib/integrations/provider-endpoint-policy.ts",
  new Map([["@/lib/deployment-target", deployment]]),
);
assert.equal(
  endpointPolicy.resolveProviderEndpoint({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    env: { DEALFLOW_DEPLOYMENT_TARGET: "production" },
  }).mode,
  "official",
);
assert.throws(
  () => endpointPolicy.resolveProviderEndpoint({
    provider: "openai",
    baseUrl: "https://attacker.example/v1",
    env: { DEALFLOW_DEPLOYMENT_TARGET: "staging" },
  }),
  (error) => error.code === "provider_endpoint_not_allowed",
);
assert.throws(
  () => endpointPolicy.resolveProviderEndpoint({
    provider: "heygen",
    baseUrl: "http://127.0.0.1:43210",
    env: { DEALFLOW_DEPLOYMENT_TARGET: "production", ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT: "true" },
  }),
  (error) => error.code === "provider_endpoint_not_allowed",
);
assert.equal(
  endpointPolicy.resolveProviderEndpoint({
    provider: "heygen",
    baseUrl: "http://127.0.0.1:43210",
    env: { DEALFLOW_DEPLOYMENT_TARGET: "staging", ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT: "true" },
  }).mode,
  "loopback_test",
);

const twilioTransport = loadTypeScriptModule(
  "src/lib/integrations/twilio/transport.ts",
  new Map([
    ["@/lib/deployment-target", deployment],
    ["@/lib/integrations/provider-endpoint-policy", endpointPolicy],
  ]),
);
const disabledTwilio = twilioTransport.getTwilioTransportConfig({});
assert.equal(disabledTwilio.mode, "disabled");
assert.equal(disabledTwilio.accountSid, null);
assert.equal(
  twilioTransport.getTwilioExecutionMode({ TWILIO_EXECUTION_MODE: "unexpected" }),
  "disabled",
  "an unknown Twilio mode must fail closed instead of becoming live",
);
assert.throws(
  () => twilioTransport.assertTwilioRecipientAllowed({
    mode: "disabled",
    to: "+15005550006",
    allowedTestRecipient: null,
  }),
  (error) => error.code === "twilio_transport_disabled",
);
const loopbackTwilio = twilioTransport.getTwilioTransportConfig({
  DEALFLOW_DEPLOYMENT_TARGET: "test",
  ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT: "true",
  TWILIO_EXECUTION_MODE: "loopback",
  TWILIO_TEST_ACCOUNT_SID: "AC_test_fixture",
  TWILIO_TEST_AUTH_TOKEN: "test_fixture",
  TWILIO_TEST_MESSAGING_SERVICE_SID: "MG_test_fixture",
  TWILIO_TEST_BASE_URL: "http://localhost:43210",
  TWILIO_TEST_TO_NUMBER: "+15005550006",
});
assert.equal(loopbackTwilio.endpointMode, "loopback_test");
assert.doesNotThrow(() => twilioTransport.assertTwilioRecipientAllowed({
  mode: "loopback",
  to: "+15005550006",
  allowedTestRecipient: "+15005550006",
}));
assert.throws(
  () => twilioTransport.assertTwilioRecipientAllowed({
    mode: "test",
    to: "+14165550123",
    allowedTestRecipient: "+15005550006",
  }),
  (error) => error.code === "twilio_test_recipient_not_allowed",
);
assert.throws(
  () => twilioTransport.getTwilioTransportConfig({
    DEALFLOW_DEPLOYMENT_TARGET: "production",
    TWILIO_EXECUTION_MODE: "test",
  }),
  (error) => error.code === "twilio_test_target_blocked",
);
assert.throws(
  () => twilioTransport.getTwilioTransportConfig({
    DEALFLOW_DEPLOYMENT_TARGET: "production",
    VERCEL_ENV: "production",
    TWILIO_EXECUTION_MODE: "live",
  }),
  (error) => error.code === "twilio_live_target_blocked",
);

const supportAdapter = loadTypeScriptModule(
  "src/lib/integrations/support/delivery-adapter.ts",
  new Map([
    ["@/lib/deployment-target", deployment],
    ["node:crypto", { createHash }],
  ]),
);
let supportRpcCalls = 0;
const supportAdmin = {
  async rpc(name) {
    supportRpcCalls += 1;
    assert.equal(name, "deliver_support_notification_to_operator_inbox");
    return { data: "receipt_fixture", error: null };
  },
};
const firstReceipt = await supportAdapter.deliverSupportNotification({
  admin: supportAdmin,
  outboxId: "outbox_fixture",
  workerId: "worker_fixture",
  env: {
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
    SUPPORT_NOTIFICATION_DELIVERY_MODE: "staging_sink",
    SUPPORT_STAGING_SINK_ENABLED: "true",
  },
});
const replayReceipt = await supportAdapter.deliverSupportNotification({
  admin: supportAdmin,
  outboxId: "outbox_fixture",
  workerId: "worker_fixture",
  env: {
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
    SUPPORT_NOTIFICATION_DELIVERY_MODE: "staging_sink",
    SUPPORT_STAGING_SINK_ENABLED: "true",
  },
});
assert.deepEqual(firstReceipt, replayReceipt, "support sink replay did not return the durable receipt");
assert.equal(firstReceipt.scope, "noncommunication_test");
assert.equal(supportRpcCalls, 2);
await assert.rejects(
  () => supportAdapter.deliverSupportNotification({
    admin: supportAdmin,
    outboxId: "outbox_fixture",
    workerId: "worker_fixture",
    env: { SUPPORT_NOTIFICATION_DELIVERY_MODE: "external" },
  }),
  (error) => error.code === "support_external_destination_owner_blocked",
);

let imageFetch = async () => {
  throw new Error("test fetch not configured");
};
const imageProviderModule = loadTypeScriptModule(
  "src/lib/integrations/creative/image-provider.ts",
  new Map([
    [
      "@/lib/env",
      {
        getImageGenerationEnv: () => ({
          provider: "openai",
          apiKey: "test_key",
          model: "gpt-image-1.5",
          baseUrl: "http://127.0.0.1:43210/v1",
        }),
        validateImageGenerationEnv: () => ({ configured: true, missing: [] }),
      },
    ],
    [
      "@/lib/integrations/contracts",
      {
        buildConfigurationOnlyProviderStatus: ({ validation }) => ({
          status: validation.configured ? "pending" : "disconnected",
          state: validation.configured ? "configured" : "not_configured",
        }),
      },
    ],
    [
      "@/lib/integrations/provider-endpoint-policy",
      { resolveProviderEndpoint: () => ({ baseUrl: "http://127.0.0.1:43210/v1", mode: "loopback_test" }) },
    ],
  ]),
);
const originalFetch = globalThis.fetch;
const originalOpenAiGate = process.env.ALLOW_OPENAI_IMAGE_GENERATION;
globalThis.fetch = (...args) => imageFetch(...args);
process.env.ALLOW_OPENAI_IMAGE_GENERATION = "true";
try {
  const provider = imageProviderModule.getImageGenerationProvider();
  let calls = 0;
  imageFetch = async () => {
    calls += 1;
    return Response.json({ data: [{ url: "https://assets.example/safe.png" }] });
  };
  const success = await provider.execute({ prompt: "safe fixture", aspectRatio: "1:1" });
  assert.equal(success.ok, true);
  assert.equal(success.metadata.providerOutcome, "accepted");
  assert.equal(calls, 1, "successful paid adapter attempt was retried");

  imageFetch = async () => Response.json(
    { error: { message: "fixture rejected" } },
    { status: 400 },
  );
  const rejected = await provider.execute({ prompt: "safe fixture", aspectRatio: "1:1" });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.metadata.providerOutcome, "rejected");

  calls = 0;
  imageFetch = async () => {
    calls += 1;
    throw new Error("request timed out");
  };
  const ambiguous = await provider.execute({ prompt: "safe fixture", aspectRatio: "1:1" });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.metadata.providerOutcome, "ambiguous");
  assert.equal(calls, 1, "ambiguous paid adapter attempt was automatically retried");
} finally {
  globalThis.fetch = originalFetch;
  if (originalOpenAiGate === undefined) delete process.env.ALLOW_OPENAI_IMAGE_GENERATION;
  else process.env.ALLOW_OPENAI_IMAGE_GENERATION = originalOpenAiGate;
}

const builderSource = fs.readFileSync("src/lib/services/creative-builder-service.ts", "utf8");
const campaignPersistenceSource = fs.readFileSync("src/lib/services/campaign-persistence.ts", "utf8");
const voiceSource = fs.readFileSync("src/lib/integrations/creative/voice-provider.ts", "utf8");
const legacyAiProvidersSource = fs.readFileSync("src/lib/ai/providers.ts", "utf8");
const stripeHarnessSource = fs.readFileSync(
  "src/app/api/internal/stripe-test-proof/route.ts",
  "utf8",
);
assert.match(builderSource, /provider_usage_reservation_required/);
assert.match(builderSource, /assertDirectPaidProviderExecutionBlocked/);
assert.match(campaignPersistenceSource, /const idempotencyKey = `openai_image_generation:/);
assert.match(campaignPersistenceSource, /providerUsageRunId/);
assert.match(voiceSource, /ALLOW_ELEVENLABS_VOICE_GENERATION !== "true"/);
assert.match(voiceSource, /resolveProviderEndpoint/);
assert.match(legacyAiProvidersSource, /provider_usage_reservation_required/);
assert.doesNotMatch(legacyAiProvidersSource, /avatarProvider\.execute/);
assert.match(stripeHarnessSource, /isExplicitNonProductionDeployment/);
assert.match(stripeHarnessSource, /STRIPE_TEST_QA_ORGANIZATION_IDS/);
assert.match(stripeHarnessSource, /assertTestModeObject\(customer/);
assert.match(stripeHarnessSource, /assertTestModeObject\(checkoutSession/);
assert.match(stripeHarnessSource, /generateTestHeaderString/);
assert.match(stripeHarnessSource, /assertTestModeEvent\(verifiedEvent\)/);
assert.match(stripeHarnessSource, /checkout\.sessions\.expire/);
assert.match(stripeHarnessSource, /customers\.del/);

console.log("Provider safety boundaries passed: target, host, test recipient, sink receipt, success/rejection/ambiguity, dedupe, and unreserved denial.");
