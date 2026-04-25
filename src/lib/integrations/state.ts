import type {
  IntegrationStatus,
  ProviderConfigValidation,
  ProviderConnectionStatus,
} from "@/lib/integrations/contracts";
import { normalizeIntegrationStatus } from "@/lib/integrations/contracts";
import type {
  IntegrationProviderCategory,
  IntegrationProviderId,
  IntegrationProviderState,
} from "@/lib/integrations/provider-registry";

export type IntegrationStateModel = {
  id: IntegrationProviderId;
  label: string;
  vendor: string;
  category: IntegrationProviderCategory;
  description: string;
  settingsHint: string;
  state: IntegrationProviderState;
  validation: ProviderConfigValidation;
  status: ProviderConnectionStatus;
  capabilities: string[];
};

export function normalizeProviderConnectionStatus(
  status?: Partial<ProviderConnectionStatus> | null,
): ProviderConnectionStatus {
  const state = status?.state ?? "failed";
  const message =
    status?.message ??
    (normalizeIntegrationStatus(status?.status) === "connected"
      ? "Integration connected."
      : "Integration disconnected.");

  return {
    status: normalizeIntegrationStatus(status?.status ?? state),
    state,
    message,
    externalAccountId: status?.externalAccountId ?? null,
    externalAccountName: status?.externalAccountName ?? null,
    updatedAt: status?.updatedAt ?? null,
    metadata: status?.metadata ?? undefined,
  };
}

export function deriveIntegrationState(
  validation: ProviderConfigValidation,
  status: ProviderConnectionStatus,
): IntegrationProviderState {
  const normalizedStatus: IntegrationStatus = normalizeIntegrationStatus(status.status);

  if (!validation.configured) {
    return validation.missingConfig.length > 0 ? "not_configured" : "partial";
  }

  if (normalizedStatus === "connected") {
    return "configured";
  }

  if (normalizedStatus === "pending") {
    return "partial";
  }

  return "not_configured";
}
