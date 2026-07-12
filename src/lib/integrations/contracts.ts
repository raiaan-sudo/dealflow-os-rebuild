export type ProviderRetryStrategy = "none" | "immediate" | "backoff" | "manual";

export type IntegrationStatus = "connected" | "disconnected" | "pending" | "error";

export type ProviderRetryability = {
  retryable: boolean;
  strategy: ProviderRetryStrategy;
  retryAfterSeconds?: number | null;
  reason?: string | null;
};

export type ProviderConfigValidation = {
  configured: boolean;
  missingConfig: string[];
};

export type ProviderConnectionState =
  | "not_configured"
  | "configured"
  | "connecting"
  | "connected"
  | "degraded"
  | "failed";

export type ProviderConnectionStatus = {
  status: IntegrationStatus;
  state: ProviderConnectionState;
  message?: string | null;
  externalAccountId?: string | null;
  externalAccountName?: string | null;
  updatedAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProviderFailure = {
  code: string;
  message: string;
  retryability: ProviderRetryability;
  details?: Record<string, unknown>;
};

export type ProviderConnectResult = {
  success: boolean;
  status: IntegrationStatus;
  state: ProviderConnectionState;
  message: string;
  connectionUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export function normalizeIntegrationStatus(value?: string | null): IntegrationStatus {
  const safeStatus = (value ?? "").toString().toLowerCase();

  if (safeStatus === "connected") {
    return "connected";
  }

  if (
    safeStatus === "connecting" ||
    safeStatus === "configured" ||
    safeStatus === "pending" ||
    safeStatus === "partial" ||
    safeStatus === "degraded"
  ) {
    return "pending";
  }

  if (safeStatus === "failed" || safeStatus === "error" || safeStatus === "connection_failed") {
    return "error";
  }

  return "disconnected";
}

export function buildConfigurationOnlyProviderStatus(params: {
  label: string;
  validation: ProviderConfigValidation;
}): ProviderConnectionStatus {
  const observedAt = new Date().toISOString();

  if (!params.validation.configured) {
    return {
      status: "disconnected",
      state: "not_configured",
      message: `${params.label} configuration is incomplete.`,
      updatedAt: observedAt,
      metadata: {
        evidenceScope: "configuration_only",
        configured: false,
        reachable: null,
        authenticated: null,
        functional: null,
      },
    };
  }

  return {
    status: "pending",
    state: "configured",
    message: `${params.label} configuration is present. Reachability, authentication, and functional execution are not proven by configuration alone.`,
    updatedAt: observedAt,
    metadata: {
      evidenceScope: "configuration_only",
      configured: true,
      reachable: null,
      authenticated: null,
      functional: null,
    },
  };
}

export interface ExecutionProvider<ExecuteRequest, RawResult, ParsedResult> {
  id: string;
  label: string;
  vendor: string;
  isConfigured(): boolean;
  validateConfig(): ProviderConfigValidation;
  checkStatus(): Promise<ProviderConnectionStatus>;
  connect?(): Promise<ProviderConnectResult>;
  execute(request: ExecuteRequest): Promise<RawResult>;
  parseResult(raw: RawResult): ParsedResult;
  parseFailure(error: unknown): ProviderFailure;
}
