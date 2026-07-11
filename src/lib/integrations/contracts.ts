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

  if (safeStatus === "connected" || safeStatus === "configured") {
    return "connected";
  }

  if (
    safeStatus === "connecting" ||
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
