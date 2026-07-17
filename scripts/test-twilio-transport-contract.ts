import assert from "node:assert/strict";
import {
  assertTwilioRecipientAllowed,
  buildTwilioMessageForm,
  getTwilioTransportConfig,
  isTwilioTransportConfigured,
  TWILIO_TEST_MAGIC_FROM_NUMBER,
  TwilioTransportPolicyError,
} from "../src/lib/integrations/twilio/transport";

const baseTestEnv = {
  NODE_ENV: "test",
  TWILIO_EXECUTION_MODE: "test",
  TWILIO_TEST_ACCOUNT_SID: `AC${"a".repeat(32)}`,
  TWILIO_TEST_AUTH_TOKEN: "test-auth-token",
  TWILIO_TEST_TO_NUMBER: "+15005550009",
};

const disabled = getTwilioTransportConfig({ NODE_ENV: "test" });
assert.equal(disabled.mode, "disabled");
assert.equal(isTwilioTransportConfigured(disabled), false);

const testConfig = getTwilioTransportConfig(baseTestEnv);
assert.equal(testConfig.mode, "test");
assert.equal(testConfig.endpointMode, "official");
assert.equal(testConfig.baseUrl, "https://api.twilio.com");
assert.equal(testConfig.fromNumber, TWILIO_TEST_MAGIC_FROM_NUMBER);
assert.equal(testConfig.messagingServiceSid, null);
assert.equal(isTwilioTransportConfigured(testConfig), true);

const testForm = buildTwilioMessageForm({
  config: testConfig,
  to: baseTestEnv.TWILIO_TEST_TO_NUMBER,
  body: "Synthetic internal test alert",
});
assert.equal(testForm.get("From"), TWILIO_TEST_MAGIC_FROM_NUMBER);
assert.equal(testForm.get("MessagingServiceSid"), null);
assert.equal(testForm.get("To"), baseTestEnv.TWILIO_TEST_TO_NUMBER);

assert.throws(
  () => getTwilioTransportConfig({
    ...baseTestEnv,
    TWILIO_TEST_MESSAGING_SERVICE_SID: `MG${"b".repeat(32)}`,
  }),
  (error: unknown) =>
    error instanceof TwilioTransportPolicyError &&
    error.code === "twilio_test_messaging_service_forbidden",
);

assert.throws(
  () => assertTwilioRecipientAllowed({
    mode: "test",
    to: "+15005550008",
    allowedTestRecipient: baseTestEnv.TWILIO_TEST_TO_NUMBER,
  }),
  (error: unknown) =>
    error instanceof TwilioTransportPolicyError &&
    error.code === "twilio_test_recipient_not_allowed",
);

const loopback = getTwilioTransportConfig({
  ...baseTestEnv,
  TWILIO_EXECUTION_MODE: "loopback",
  TWILIO_TEST_BASE_URL: "http://127.0.0.1:43210",
  ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT: "true",
});
assert.equal(loopback.mode, "loopback");
assert.equal(loopback.endpointMode, "loopback_test");
assert.equal(loopback.fromNumber, TWILIO_TEST_MAGIC_FROM_NUMBER);
assert.equal(loopback.messagingServiceSid, null);

assert.throws(
  () => getTwilioTransportConfig({
    NODE_ENV: "test",
    TWILIO_EXECUTION_MODE: "live",
    TWILIO_ACCOUNT_SID: `AC${"c".repeat(32)}`,
    TWILIO_AUTH_TOKEN: "live-auth-token-placeholder",
    TWILIO_MESSAGING_SERVICE_SID: `MG${"d".repeat(32)}`,
  }),
  (error: unknown) =>
    error instanceof TwilioTransportPolicyError &&
    error.code === "twilio_live_target_blocked",
);

console.log(
  "Twilio transport contract tests passed (disabled, loopback, test magic From, allowlisted To, live fail-closed).",
);
