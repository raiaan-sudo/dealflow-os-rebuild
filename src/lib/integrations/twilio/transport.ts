import {
  isExplicitNonProductionDeployment,
  isExactProductionVercelHost,
  isProductionDeployment,
} from "@/lib/deployment-target";
import { resolveProviderEndpoint } from "@/lib/integrations/provider-endpoint-policy";

export type TwilioExecutionMode = "disabled" | "live" | "test" | "loopback";

export class TwilioTransportPolicyError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "TwilioTransportPolicyError";
  }
}

function requiredValue(
  env: Record<string, string | undefined>,
  name: string,
) {
  const value = env[name]?.trim();
  if (!value) {
    throw new TwilioTransportPolicyError(
      `${name} is required for the selected Twilio execution mode.`,
      "twilio_test_config_missing",
    );
  }
  return value;
}

export function getTwilioExecutionMode(
  env: Record<string, string | undefined> = process.env,
): TwilioExecutionMode {
  const requested = env.TWILIO_EXECUTION_MODE?.trim().toLowerCase();
  if (requested === "live" || requested === "test" || requested === "loopback") return requested;
  return "disabled";
}

export function getTwilioTransportConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const mode = getTwilioExecutionMode(env);

  if (mode === "disabled") {
    return {
      mode,
      accountSid: null,
      authToken: null,
      messagingServiceSid: null,
      baseUrl: null,
      endpointMode: "disabled" as const,
      allowedTestRecipient: null,
    };
  }

  if (mode === "live" && !isExactProductionVercelHost(env)) {
    throw new TwilioTransportPolicyError(
      "Twilio live transport requires the exact attested production Vercel project.",
      "twilio_live_target_blocked",
    );
  }

  if (mode !== "live" && (!isExplicitNonProductionDeployment(env) || isProductionDeployment(env))) {
    throw new TwilioTransportPolicyError(
      "Twilio test and loopback transports require an explicitly attested nonproduction target.",
      "twilio_test_target_blocked",
    );
  }

  const useTestCredentials = mode !== "live";
  const accountSid = env[
    useTestCredentials ? "TWILIO_TEST_ACCOUNT_SID" : "TWILIO_ACCOUNT_SID"
  ]?.trim() || null;
  const authToken = env[
    useTestCredentials ? "TWILIO_TEST_AUTH_TOKEN" : "TWILIO_AUTH_TOKEN"
  ]?.trim() || null;
  const messagingServiceSid = env[
    useTestCredentials
      ? "TWILIO_TEST_MESSAGING_SERVICE_SID"
      : "TWILIO_MESSAGING_SERVICE_SID"
  ]?.trim() || null;
  const configuredBaseUrl =
    mode === "loopback"
      ? requiredValue(env, "TWILIO_TEST_BASE_URL")
      : "https://api.twilio.com";
  const endpoint = resolveProviderEndpoint({
    provider: "twilio",
    baseUrl: configuredBaseUrl,
    env,
  });

  if (mode === "test" && endpoint.mode !== "official") {
    throw new TwilioTransportPolicyError(
      "Twilio test-credential mode requires the official Twilio endpoint.",
      "twilio_test_official_endpoint_required",
    );
  }
  if (mode === "loopback" && endpoint.mode !== "loopback_test") {
    throw new TwilioTransportPolicyError(
      "Twilio loopback mode requires an explicitly allowed loopback endpoint.",
      "twilio_loopback_endpoint_required",
    );
  }

  return {
    mode,
    accountSid,
    authToken,
    messagingServiceSid,
    baseUrl: endpoint.baseUrl,
    endpointMode: endpoint.mode,
    allowedTestRecipient:
      mode === "live" ? null : requiredValue(env, "TWILIO_TEST_TO_NUMBER"),
  };
}

export function assertTwilioRecipientAllowed(params: {
  mode: TwilioExecutionMode;
  to: string;
  allowedTestRecipient: string | null;
}) {
  if (params.mode === "disabled") {
    throw new TwilioTransportPolicyError(
      "Twilio transport is disabled.",
      "twilio_transport_disabled",
    );
  }
  if (params.mode === "live") return;
  if (!params.allowedTestRecipient || params.to !== params.allowedTestRecipient) {
    throw new TwilioTransportPolicyError(
      "Twilio test transport recipient is not the exact allowlisted test number.",
      "twilio_test_recipient_not_allowed",
    );
  }
}
