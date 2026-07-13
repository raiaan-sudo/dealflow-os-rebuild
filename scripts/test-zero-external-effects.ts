import assert from "node:assert/strict";

import {
  ZERO_EXTERNAL_EFFECTS_ATTESTATION,
  assertZeroExternalEffectsEnvironment,
  evaluateZeroExternalEffectsEnvironment,
} from "../src/lib/safety/zero-external-effects";
import { assertStripeExternalMutationAllowed } from "../src/lib/integrations/stripe/provider";

const safe = {
  ALLOW_AI_TEXT_GENERATION: "false",
  ALLOW_OPENAI_IMAGE_GENERATION: "false",
  ALLOW_HEYGEN_VIDEO_GENERATION: "false",
  ALLOW_HIGGSFIELD_VIDEO_GENERATION: "false",
  ALLOW_ELEVENLABS_VOICE_GENERATION: "false",
  ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT: "false",
  ALLOW_META_LIVE_LAUNCH: "false",
  ALLOW_SCHEDULED_META_LAUNCH_EXECUTION: "false",
  ALLOW_PRODUCTION_SCHEDULED_META_LAUNCH_EXECUTION: "false",
  ALLOW_STAGING_SCHEDULED_META_LAUNCH_EXECUTION: "false",
  ALLOW_META_DUE_ACTIVATION: "false",
  ALLOW_META_PRODUCTION_DUE_ACTIVATION: "false",
  ALLOW_META_STAGING_DUE_ACTIVATION: "false",
  ALLOW_META_SANDBOX_OPTIMIZATION: "false",
  ALLOW_META_PRODUCTION_OPTIMIZATION: "false",
  ALLOW_META_CAPI_EVENTS: "false",
  ALLOW_META_PIXEL_EVENTS: "false",
  ALLOW_META_LAUNCH_INTERRUPTION_TESTS: "false",
  ENABLE_META_LAUNCH_TEST_MODE: "false",
  ALLOW_BILLING_ADMIN_OVERRIDE: "false",
  ALLOW_QA_BILLING_ACCEPTANCE_OVERRIDE: "false",
  GHL_SANDBOX_WRITES_ENABLED: "false",
  GHL_SANDBOX_INBOUND_FORM_RECONCILIATION_ENABLED: "false",
  GHL_SANDBOX_INBOUND_FORM_SWEEP_ENABLED: "false",
  GHL_PRODUCTION_WRITES_ENABLED: "false",
  GHL_PRODUCTION_INBOUND_FORM_RECONCILIATION_ENABLED: "false",
  GHL_PRODUCTION_INBOUND_FORM_SWEEP_ENABLED: "false",
  GHL_PRODUCTION_PROVISIONING_ENABLED: "false",
  GHL_PRODUCTION_LEAD_DELIVERY_ENABLED: "false",
  GHL_PRODUCTION_LIFECYCLE_WEBHOOK_ENABLED: "false",
  GHL_PRODUCTION_FORM_SUBMISSIONS_READ_ENABLED: "false",
  SUPPORT_EXTERNAL_DELIVERY_ENABLED: "false",
  SUPPORT_PRODUCTION_EXTERNAL_DELIVERY_ENABLED: "false",
  SUPPORT_MAIL_SINK_ENABLED: "false",
  SUPPORT_STAGING_SINK_ENABLED: "false",
  SUPPORT_NOTIFICATION_DELIVERY_MODE: "internal_operator_inbox",
  INTERNAL_LEAD_SMS_ENABLED: "false",
  STRIPE_TEST_HARNESS_ENABLED: "false",
  STRIPE_FORCE_TEST_MODE: "false",
  ENABLE_ACCESS_KEY_CHECKOUT: "false",
  ACCESS_KEY_PUBLIC_CHECKOUT_ENABLED: "false",
  NEXT_PUBLIC_ENABLE_GOOGLE_AUTH: "false",
  PUBLIC_CLIENT_ERROR_TELEMETRY_ENABLED: "false",
  ENABLE_DEMO_WORKSPACE_SEEDING: "false",
  ENABLE_STRUCTURED_INFO_LOGS: "false",
  LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED: "false",
  LOAD_TEST_ALLOW_SYNTHETIC_LEAD_CAPTURE: "false",
  NEXT_TELEMETRY_DISABLED: "1",
  TWILIO_EXECUTION_MODE: "disabled",
  META_EXECUTION_MODE: "sandbox",
  META_OPTIMIZATION_EXECUTION_MODE: "shadow",
  BILLING_CHECKOUT_SAFE_MODE: "true",
  UI_DIRECTION_PREVIEW: "0",
  SMS_MOCK_MODE: "false",
  TEST_SMS_MODE: "",
  SMS_COMPLIANCE_ACK: "",
};

const result = assertZeroExternalEffectsEnvironment(safe);
assert.equal(result.ok, true);
assert.equal(result.attestation, ZERO_EXTERNAL_EFFECTS_ATTESTATION);
assert.equal(result.failedControls.length, 0);
assert.equal(
  evaluateZeroExternalEffectsEnvironment({
    ...safe,
    GHL_IFRAME_EMBED_ENABLED: "true",
  }).ok,
  true,
  "verified iframe rendering is not a provider write or external side effect",
);

for (const name of Object.keys(safe)) {
  const unsafeValue = "unsafe_enabled_value";
  const unsafe = { ...safe, [name]: unsafeValue };
  const unsafeResult = evaluateZeroExternalEffectsEnvironment(unsafe);
  assert.equal(unsafeResult.ok, false, `${name} must fail closed`);
  assert.ok(unsafeResult.failedControls.includes(name), `${name} must be named in the failure`);
}

assert.throws(
  () => assertZeroExternalEffectsEnvironment({}),
  /Zero-external-effects precondition failed/,
);

const secretAccessGuard = new Proxy(safe, {
  get(target, property, receiver) {
    if (
      typeof property === "string" &&
      /(?:SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE_KEY|ANON_KEY|SERVICE_ROLE_KEY)/.test(property)
    ) {
      throw new Error(`Evaluator inspected prohibited secret-bearing input: ${property}`);
    }
    return Reflect.get(target, property, receiver);
  },
});
assert.equal(
  evaluateZeroExternalEffectsEnvironment(secretAccessGuard).ok,
  true,
  "central evaluator must prove switches and modes without inspecting credential values",
);

const originalBillingSafeMode = process.env.BILLING_CHECKOUT_SAFE_MODE;
try {
  process.env.BILLING_CHECKOUT_SAFE_MODE = "true";
  for (const action of [
    "create_customer",
    "update_customer",
    "create_checkout_session",
    "create_billing_portal_session",
    "update_subscription",
  ] as const) {
    assert.throws(
      () => assertStripeExternalMutationAllowed(action),
      /Billing provider writes are disabled/,
      `${action} must be rejected before Stripe client access`,
    );
  }
  for (const action of [
    "retrieve_checkout_session",
    "retrieve_subscription",
    "construct_webhook_event",
  ] as const) {
    assert.doesNotThrow(() => assertStripeExternalMutationAllowed(action));
  }
} finally {
  if (originalBillingSafeMode === undefined) {
    delete process.env.BILLING_CHECKOUT_SAFE_MODE;
  } else {
    process.env.BILLING_CHECKOUT_SAFE_MODE = originalBillingSafeMode;
  }
}

console.log(
  `zero external effects contract: PASS (${result.checkedControlCount} provider and billing controls, fail-closed defaults, no credential inspection)`,
);
