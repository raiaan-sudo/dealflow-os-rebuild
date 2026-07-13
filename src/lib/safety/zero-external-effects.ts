export const ZERO_EXTERNAL_EFFECTS_ATTESTATION =
  "DEALFLOW_ISOLATED_STAGING_QIBH_ZERO_EXTERNAL_EFFECTS_V1";

type Environment = Record<string, string | undefined>;

export type ZeroExternalEffectsResult = Readonly<{
  ok: boolean;
  attestation: typeof ZERO_EXTERNAL_EFFECTS_ATTESTATION;
  checkedControlCount: number;
  failedControls: readonly string[];
}>;

const MUST_BE_FALSE = [
  "ALLOW_AI_TEXT_GENERATION",
  "ALLOW_OPENAI_IMAGE_GENERATION",
  "ALLOW_HEYGEN_VIDEO_GENERATION",
  "ALLOW_HIGGSFIELD_VIDEO_GENERATION",
  "ALLOW_ELEVENLABS_VOICE_GENERATION",
  "ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT",
  "ALLOW_META_LIVE_LAUNCH",
  "ALLOW_SCHEDULED_META_LAUNCH_EXECUTION",
  "ALLOW_PRODUCTION_SCHEDULED_META_LAUNCH_EXECUTION",
  "ALLOW_STAGING_SCHEDULED_META_LAUNCH_EXECUTION",
  "ALLOW_META_DUE_ACTIVATION",
  "ALLOW_META_PRODUCTION_DUE_ACTIVATION",
  "ALLOW_META_STAGING_DUE_ACTIVATION",
  "ALLOW_META_SANDBOX_OPTIMIZATION",
  "ALLOW_META_PRODUCTION_OPTIMIZATION",
  "ALLOW_META_CAPI_EVENTS",
  "ALLOW_META_PIXEL_EVENTS",
  "ALLOW_META_LAUNCH_INTERRUPTION_TESTS",
  "ENABLE_META_LAUNCH_TEST_MODE",
  "ALLOW_BILLING_ADMIN_OVERRIDE",
  "ALLOW_QA_BILLING_ACCEPTANCE_OVERRIDE",
  "GHL_SANDBOX_WRITES_ENABLED",
  "GHL_SANDBOX_INBOUND_FORM_RECONCILIATION_ENABLED",
  "GHL_SANDBOX_INBOUND_FORM_SWEEP_ENABLED",
  "GHL_PRODUCTION_WRITES_ENABLED",
  "GHL_PRODUCTION_INBOUND_FORM_RECONCILIATION_ENABLED",
  "GHL_PRODUCTION_INBOUND_FORM_SWEEP_ENABLED",
  "GHL_PRODUCTION_PROVISIONING_ENABLED",
  "GHL_PRODUCTION_LEAD_DELIVERY_ENABLED",
  "GHL_PRODUCTION_LIFECYCLE_WEBHOOK_ENABLED",
  "GHL_PRODUCTION_FORM_SUBMISSIONS_READ_ENABLED",
  "SUPPORT_EXTERNAL_DELIVERY_ENABLED",
  "SUPPORT_PRODUCTION_EXTERNAL_DELIVERY_ENABLED",
  "SUPPORT_MAIL_SINK_ENABLED",
  "SUPPORT_STAGING_SINK_ENABLED",
  "INTERNAL_LEAD_SMS_ENABLED",
  "STRIPE_TEST_HARNESS_ENABLED",
  "STRIPE_FORCE_TEST_MODE",
  "ENABLE_ACCESS_KEY_CHECKOUT",
  "ACCESS_KEY_PUBLIC_CHECKOUT_ENABLED",
  "NEXT_PUBLIC_ENABLE_GOOGLE_AUTH",
  "PUBLIC_CLIENT_ERROR_TELEMETRY_ENABLED",
  "ENABLE_DEMO_WORKSPACE_SEEDING",
  "ENABLE_STRUCTURED_INFO_LOGS",
  "LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED",
  "LOAD_TEST_ALLOW_SYNTHETIC_LEAD_CAPTURE",
] as const;

const MUST_EQUAL = {
  NEXT_TELEMETRY_DISABLED: "1",
  TWILIO_EXECUTION_MODE: "disabled",
  META_EXECUTION_MODE: "sandbox",
  META_OPTIMIZATION_EXECUTION_MODE: "shadow",
  SUPPORT_NOTIFICATION_DELIVERY_MODE: "internal_operator_inbox",
  BILLING_CHECKOUT_SAFE_MODE: "true",
  UI_DIRECTION_PREVIEW: "0",
} as const;

const MUST_BE_DISABLED_OR_EMPTY = [
  "SMS_MOCK_MODE",
  "TEST_SMS_MODE",
  "SMS_COMPLIANCE_ACK",
] as const;

function normalized(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function evaluateZeroExternalEffectsEnvironment(
  env: Environment,
): ZeroExternalEffectsResult {
  const failedControls: string[] = [];

  for (const name of MUST_BE_FALSE) {
    if (normalized(env[name]) !== "false") failedControls.push(name);
  }

  for (const [name, expected] of Object.entries(MUST_EQUAL)) {
    if (normalized(env[name]) !== expected) failedControls.push(name);
  }

  for (const name of MUST_BE_DISABLED_OR_EMPTY) {
    const value = normalized(env[name]);
    if (value !== "" && value !== "false" && value !== "disabled") {
      failedControls.push(name);
    }
  }

  const uniqueFailures = [...new Set(failedControls)].sort();
  return Object.freeze({
    ok: uniqueFailures.length === 0,
    attestation: ZERO_EXTERNAL_EFFECTS_ATTESTATION,
    checkedControlCount:
      MUST_BE_FALSE.length +
      Object.keys(MUST_EQUAL).length +
      MUST_BE_DISABLED_OR_EMPTY.length,
    failedControls: Object.freeze(uniqueFailures),
  });
}

export function assertZeroExternalEffectsEnvironment(env: Environment) {
  const result = evaluateZeroExternalEffectsEnvironment(env);
  if (!result.ok) {
    throw new Error(
      `Zero-external-effects precondition failed for: ${result.failedControls.join(", ")}`,
    );
  }
  return result;
}
