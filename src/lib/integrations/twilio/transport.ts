import {
  isExplicitNonProductionDeployment,
  isExactProductionVercelHost,
  isProductionDeployment,
} from "@/lib/deployment-target";
import { resolveProviderEndpoint } from "@/lib/integrations/provider-endpoint-policy";

export type TwilioExecutionMode = "disabled" | "live" | "test" | "loopback";

export const TWILIO_TEST_MAGIC_FROM_NUMBER = "+15005550006" as const;

export type TwilioTransportConfig =
  | {
      mode: "disabled";
      accountSid: null;
      authToken: null;
      messagingServiceSid: null;
      fromNumber: null;
      baseUrl: null;
      endpointMode: "disabled";
      allowedTestRecipient: null;
    }
  | {
      mode: "test" | "loopback";
      accountSid: string;
      authToken: string;
      messagingServiceSid: null;
      fromNumber: typeof TWILIO_TEST_MAGIC_FROM_NUMBER;
      baseUrl: string;
      endpointMode: "official" | "loopback_test";
      allowedTestRecipient: string;
    }
  | {
      mode: "live";
      accountSid: string;
      authToken: string;
      messagingServiceSid: string;
      fromNumber: null;
      baseUrl: string;
      endpointMode: "official";
      allowedTestRecipient: null;
    };

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
): TwilioTransportConfig {
  const mode = getTwilioExecutionMode(env);

  if (mode === "disabled") {
    return {
      mode,
      accountSid: null,
      authToken: null,
      messagingServiceSid: null,
      fromNumber: null,
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
  const accountSid = requiredValue(
    env,
    useTestCredentials ? "TWILIO_TEST_ACCOUNT_SID" : "TWILIO_ACCOUNT_SID",
  );
  const authToken = requiredValue(
    env,
    useTestCredentials ? "TWILIO_TEST_AUTH_TOKEN" : "TWILIO_AUTH_TOKEN",
  );
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

  if (mode === "live") {
    return {
      mode,
      accountSid,
      authToken,
      messagingServiceSid: requiredValue(env, "TWILIO_MESSAGING_SERVICE_SID"),
      fromNumber: null,
      baseUrl: endpoint.baseUrl,
      endpointMode: "official",
      allowedTestRecipient: null,
    };
  }

  if (env.TWILIO_TEST_MESSAGING_SERVICE_SID?.trim()) {
    throw new TwilioTransportPolicyError(
      "Twilio test and loopback transports must use the official magic From number, not a Messaging Service.",
      "twilio_test_messaging_service_forbidden",
    );
  }

  return {
    mode,
    accountSid,
    authToken,
    messagingServiceSid: null,
    fromNumber: TWILIO_TEST_MAGIC_FROM_NUMBER,
    baseUrl: endpoint.baseUrl,
    endpointMode: endpoint.mode,
    allowedTestRecipient: requiredValue(env, "TWILIO_TEST_TO_NUMBER"),
  };
}

export function isTwilioTransportConfigured(config: TwilioTransportConfig) {
  if (config.mode === "disabled") return false;
  if (config.mode === "live") {
    return Boolean(
      config.accountSid &&
      config.authToken &&
      config.messagingServiceSid &&
      config.baseUrl,
    );
  }
  return Boolean(
    config.accountSid &&
    config.authToken &&
    config.fromNumber === TWILIO_TEST_MAGIC_FROM_NUMBER &&
    config.baseUrl &&
    config.allowedTestRecipient,
  );
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

export function buildTwilioMessageForm(params: {
  config: Exclude<TwilioTransportConfig, { mode: "disabled" }>;
  to: string;
  body: string;
}) {
  assertTwilioRecipientAllowed({
    mode: params.config.mode,
    to: params.to,
    allowedTestRecipient: params.config.allowedTestRecipient,
  });
  const form = new URLSearchParams({
    To: params.to,
    Body: params.body,
  });

  if (params.config.mode === "live") {
    form.set("MessagingServiceSid", params.config.messagingServiceSid);
  } else {
    form.set("From", params.config.fromNumber);
  }

  return form;
}
