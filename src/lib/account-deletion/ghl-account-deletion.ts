import { createHash } from "node:crypto";
import type {
  GhlCredentialResolver,
  GhlHttpMethod,
  GhlHttpRetryMode,
  GhlHttpResponse,
} from "@/lib/integrations/gohighlevel";

type JsonRecord = Record<string, unknown>;

export type GhlAccountDeletionAuthority = {
  requestedOrganizationId: string;
  mappingOrganizationId: string;
  mappingId: string;
  mappingPartnerId: string | null;
  providerLocationId: string;
  provisioningOwner: "platform" | "partner" | string;
  environment: "sandbox" | "production" | "test" | string;
  installationId: string;
  installationOwnerKind: "platform" | "partner" | string;
  installationPartnerId: string | null;
  credentialRef: string;
  provisioningRunOrganizationId: string | null;
  provisioningRunMappingId: string | null;
  provisioningRunInstallationId: string | null;
  provisioningRunState: string | null;
  createOutboxOrganizationId: string | null;
  createOutboxStatus: string | null;
  createReceiptOutcome: string | null;
  createReceiptProviderReference: string | null;
  originAttestationOrganizationId: string | null;
  originAttestationMappingId: string | null;
  originAttestationProviderLocationId: string | null;
  originAttestationOrigin: "customer_connected" | "dealflow_created" | "partner_created" | string | null;
  originAttestationEvidenceHash: string | null;
};

export type GhlAccountDeletionOwnershipDecision = {
  state: "owned" | "explicitly_nonowned" | "unresolved";
  code: string;
};

export type GhlAccountDeletionReceipt = {
  outcome: "completed" | "operator_required";
  code: string;
  providerReceiptId?: string;
  metadata: Record<string, unknown>;
};

export type GhlAccountDeletionHttpClient = {
  request(input: {
    method: GhlHttpMethod;
    path: string;
    credential: string;
    version?: string;
    retryMode?: GhlHttpRetryMode;
  }): Promise<GhlHttpResponse<unknown>>;
};

export class GhlAccountDeletionProviderError extends Error {
  constructor(
    readonly code: string,
    readonly uncertain: boolean,
  ) {
    super(code);
    this.name = "GhlAccountDeletionProviderError";
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function responseLocationId(response: GhlHttpResponse<unknown>) {
  const root = record(response.data);
  const nested = record(root.location);
  return text(nested.id) || text(root.id);
}

function receiptFingerprint(response: GhlHttpResponse<unknown>) {
  return `sha256:${createHash("sha256")
    .update(`${response.providerRequestId ?? ""}:${response.responseFingerprint}`)
    .digest("hex")}`;
}

export function evaluateGhlAccountDeletionOwnership(
  authority: GhlAccountDeletionAuthority,
): GhlAccountDeletionOwnershipDecision {
  if (
    !authority.requestedOrganizationId ||
    authority.mappingOrganizationId !== authority.requestedOrganizationId
  ) {
    return { state: "unresolved", code: "ghl_deletion_tenant_evidence_mismatch" };
  }
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(authority.providerLocationId)) {
    return { state: "unresolved", code: "ghl_deletion_location_identity_invalid" };
  }

  const explicitlyCustomerConnected =
    authority.originAttestationOrganizationId === authority.requestedOrganizationId &&
    authority.originAttestationMappingId === authority.mappingId &&
    authority.originAttestationProviderLocationId === authority.providerLocationId &&
    authority.originAttestationOrigin === "customer_connected" &&
    /^sha256:[a-f0-9]{64}$/.test(authority.originAttestationEvidenceHash ?? "");

  const creationTenantEvidenceMatches =
    authority.provisioningRunOrganizationId === authority.requestedOrganizationId &&
    authority.createOutboxOrganizationId === authority.requestedOrganizationId;
  if (!creationTenantEvidenceMatches) {
    return explicitlyCustomerConnected
      ? { state: "explicitly_nonowned", code: "ghl_customer_connected_location_attested" }
      : { state: "unresolved", code: "ghl_deletion_tenant_evidence_mismatch" };
  }
  if (
    !authority.mappingId ||
    authority.provisioningRunMappingId !== authority.mappingId ||
    !authority.installationId ||
    authority.provisioningRunInstallationId !== authority.installationId ||
    authority.provisioningRunState !== "ready" ||
    authority.createOutboxStatus !== "succeeded" ||
    authority.createReceiptOutcome !== "succeeded" ||
    authority.createReceiptProviderReference !== authority.providerLocationId
  ) {
    return explicitlyCustomerConnected
      ? { state: "explicitly_nonowned", code: "ghl_customer_connected_location_attested" }
      : { state: "unresolved", code: "ghl_deletion_creation_receipt_unproven" };
  }
  const platformOwned =
    authority.provisioningOwner === "platform" &&
    authority.installationOwnerKind === "platform" &&
    authority.installationPartnerId === null;
  const partnerOwned =
    authority.provisioningOwner === "partner" &&
    authority.installationOwnerKind === "partner" &&
    Boolean(authority.mappingPartnerId) &&
    authority.installationPartnerId === authority.mappingPartnerId;
  if (!platformOwned && !partnerOwned) {
    return explicitlyCustomerConnected
      ? { state: "explicitly_nonowned", code: "ghl_customer_connected_location_attested" }
      : { state: "unresolved", code: "ghl_deletion_owner_evidence_mismatch" };
  }
  return {
    state: "owned",
    code: partnerOwned ? "ghl_partner_created_location" : "ghl_platform_created_location",
  };
}

export async function executeGhlAccountDeletionProviderOffboarding(input: {
  authority: GhlAccountDeletionAuthority;
  credentialResolver: GhlCredentialResolver;
  httpClient: GhlAccountDeletionHttpClient;
  providerWriteAllowed: boolean;
  providerGateAllowed: boolean;
  providerGateCode: string;
}): Promise<GhlAccountDeletionReceipt> {
  const ownership = evaluateGhlAccountDeletionOwnership(input.authority);
  if (ownership.state === "explicitly_nonowned") {
    return {
      outcome: "completed",
      code: "ghl_nonowned_location_detached_without_provider_delete",
      metadata: {
        providerLocationDeleted: false,
        localDetachRequired: true,
        ownershipCode: ownership.code,
      },
    };
  }
  if (ownership.state === "unresolved") {
    return {
      outcome: "operator_required",
      code: "ghl_deletion_ownership_unresolved",
      metadata: {
        providerLocationDeleted: false,
        localDetachRequired: false,
        ownershipCode: ownership.code,
      },
    };
  }
  if (!input.authority.credentialRef) {
    return {
      outcome: "operator_required",
      code: "ghl_deletion_credential_authority_unavailable",
      metadata: { ownershipCode: ownership.code },
    };
  }
  if (!input.providerGateAllowed) {
    return {
      outcome: "operator_required",
      code: "ghl_deletion_provider_gate_closed",
      metadata: { ownershipCode: ownership.code, gateCode: input.providerGateCode },
    };
  }

  try {
    return await input.credentialResolver.withCredential(
      input.authority.credentialRef,
      async (credential) => {
        const path = `/locations/${encodeURIComponent(input.authority.providerLocationId)}`;
        let before: GhlHttpResponse<unknown>;
        try {
          before = await input.httpClient.request({
            method: "GET",
            path,
            credential,
            version: "2021-07-28",
            retryMode: "safe-read",
          });
        } catch {
          throw new GhlAccountDeletionProviderError("ghl_deletion_authoritative_read_failed", false);
        }
        if (before.status === 404) {
          return {
            outcome: "completed",
            code: "ghl_owned_location_already_absent",
            providerReceiptId: receiptFingerprint(before),
            metadata: { providerLocationDeleted: true, ownershipCode: ownership.code, reconciledBeforeMutation: true },
          };
        }
        if (before.status === 401 || before.status === 403) {
          return {
            outcome: "operator_required",
            code: "ghl_deletion_credential_scope_rejected",
            metadata: { ownershipCode: ownership.code, httpStatus: before.status },
          };
        }
        if (!before.ok) {
          if (before.status === 408 || before.status === 429 || before.status >= 500) {
            throw new GhlAccountDeletionProviderError("ghl_deletion_authoritative_read_unavailable", false);
          }
          return {
            outcome: "operator_required",
            code: "ghl_deletion_authoritative_read_rejected",
            metadata: { ownershipCode: ownership.code, httpStatus: before.status },
          };
        }
        if (responseLocationId(before) !== input.authority.providerLocationId) {
          return {
            outcome: "operator_required",
            code: "ghl_deletion_provider_identity_mismatch",
            metadata: { ownershipCode: ownership.code },
          };
        }
        if (!input.providerWriteAllowed) {
          return {
            outcome: "operator_required",
            code: "ghl_deletion_provider_writes_disabled",
            metadata: { ownershipCode: ownership.code, gateCode: input.providerGateCode },
          };
        }

        let removed: GhlHttpResponse<unknown>;
        try {
          removed = await input.httpClient.request({
            method: "DELETE",
            path,
            credential,
            version: "2021-07-28",
            retryMode: "no-retry",
          });
        } catch {
          throw new GhlAccountDeletionProviderError("ghl_deletion_outcome_ambiguous", true);
        }
        if (removed.ok || removed.status === 404) {
          return {
            outcome: "completed",
            code: removed.status === 404
              ? "ghl_owned_location_already_absent"
              : "ghl_owned_location_deleted",
            providerReceiptId: receiptFingerprint(removed),
            metadata: {
              providerLocationDeleted: true,
              ownershipCode: ownership.code,
              providerReceiptConfirmed: removed.ok,
              httpStatus: removed.status,
            },
          };
        }
        if (removed.status === 401 || removed.status === 403) {
          return {
            outcome: "operator_required",
            code: "ghl_deletion_credential_scope_rejected",
            metadata: { ownershipCode: ownership.code, httpStatus: removed.status },
          };
        }
        if (removed.status === 408 || removed.status === 409 || removed.status === 429 || removed.status >= 500) {
          throw new GhlAccountDeletionProviderError("ghl_deletion_outcome_ambiguous", true);
        }
        return {
          outcome: "operator_required",
          code: "ghl_deletion_provider_rejected",
          metadata: { ownershipCode: ownership.code, httpStatus: removed.status },
        };
      },
    );
  } catch (error) {
    if (error instanceof GhlAccountDeletionProviderError) throw error;
    return {
      outcome: "operator_required",
      code: "ghl_deletion_credential_authority_unavailable",
      metadata: { ownershipCode: ownership.code },
    };
  }
}
