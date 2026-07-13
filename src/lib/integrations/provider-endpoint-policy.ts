import {
  isExplicitNonProductionDeployment,
  isProductionDeployment,
} from "@/lib/deployment-target";

export type GuardedProvider = "openai" | "heygen" | "higgsfield" | "elevenlabs" | "twilio";
export type ProviderEndpointMode = "official" | "loopback_test";

const OFFICIAL_PROVIDER_ORIGINS: Record<GuardedProvider, string> = {
  openai: "https://api.openai.com",
  heygen: "https://api.heygen.com",
  higgsfield: "https://platform.higgsfield.ai",
  elevenlabs: "https://api.elevenlabs.io",
  twilio: "https://api.twilio.com",
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export class ProviderEndpointPolicyError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ProviderEndpointPolicyError";
  }
}

export function resolveProviderEndpoint(params: {
  provider: GuardedProvider;
  baseUrl: string;
  env?: Record<string, string | undefined>;
}) {
  const env = params.env ?? process.env;
  let url: URL;

  try {
    url = new URL(params.baseUrl);
  } catch {
    throw new ProviderEndpointPolicyError(
      `${params.provider} base URL is invalid.`,
      "provider_endpoint_invalid",
    );
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new ProviderEndpointPolicyError(
      `${params.provider} base URL must not contain credentials, query parameters, or fragments.`,
      "provider_endpoint_components_forbidden",
    );
  }

  if (url.origin === OFFICIAL_PROVIDER_ORIGINS[params.provider]) {
    if (url.protocol !== "https:") {
      throw new ProviderEndpointPolicyError(
        `${params.provider} official endpoint must use HTTPS.`,
        "provider_endpoint_https_required",
      );
    }

    return {
      baseUrl: url.toString().replace(/\/$/, ""),
      mode: "official" as const,
    };
  }

  const loopback = LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  if (
    loopback &&
    (url.protocol === "http:" || url.protocol === "https:") &&
    env.ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT === "true" &&
    isExplicitNonProductionDeployment(env) &&
    !isProductionDeployment(env)
  ) {
    return {
      baseUrl: url.toString().replace(/\/$/, ""),
      mode: "loopback_test" as const,
    };
  }

  throw new ProviderEndpointPolicyError(
    `${params.provider} endpoint is neither its official HTTPS origin nor an explicitly enabled nonproduction loopback endpoint.`,
    "provider_endpoint_not_allowed",
  );
}

export function assertOfficialProviderEndpoint(params: {
  provider: GuardedProvider;
  baseUrl: string;
  env?: Record<string, string | undefined>;
}) {
  const resolved = resolveProviderEndpoint(params);
  if (resolved.mode !== "official") {
    throw new ProviderEndpointPolicyError(
      `${params.provider} requires its official endpoint for this execution mode.`,
      "provider_official_endpoint_required",
    );
  }
  return resolved;
}
