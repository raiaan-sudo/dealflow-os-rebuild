import { fingerprintCredentialReference } from "@/lib/integrations/gohighlevel";
import {
  resolveGhlProductionAuthority,
  resolveGhlSandboxAuthority,
  type GhlSandboxAuthority,
  type GhlSandboxAuthorityClient,
} from "./ghl-sandbox-authority-service";
import type { GhlProductionGateInput, GhlSandboxGateInput } from "@/lib/integrations/gohighlevel";

type JsonRecord = Record<string, unknown>;

type RpcClient = GhlSandboxAuthorityClient & {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type GhlInboundFormsAuthorityBinding = {
  organizationId: string;
  mappingId: string;
  providerLocationId: string;
  credentialRef: string;
};

export type GhlInboundFormsAuthorityProvider = {
  verifyPreinstalledForms(input: {
    providerLocationId: string;
    requiredFormIds: string[];
  }): Promise<{
    outcome: "succeeded" | "retryable_failure" | "operator_action_required" | "uncertain";
    errorCode?: string;
    safeMessage?: string;
    providerMutationAttempted: boolean;
  }>;
  verifyFormSubmissionsReadScope(input: {
    providerLocationId: string;
    requiredFormIds: string[];
  }): Promise<{
    outcome: "succeeded" | "retryable_failure" | "operator_action_required" | "uncertain";
    errorCode?: string;
    safeMessage?: string;
    providerRequestId?: string | null;
    responseFingerprint?: string | null;
    providerMutationAttempted: boolean;
  }>;
};

export class GhlInboundFormsAuthorityConfigurationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "GhlInboundFormsAuthorityConfigurationError";
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.map(record) : value ? [record(value)] : [];
}

function exactUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function exactProviderId(value: string) {
  return /^[A-Za-z0-9_-]{3,180}$/.test(value);
}

function exactResponseFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function safeProviderRequestId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0
    && normalized.length <= 240
    && !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : null;
}

function expectedCredentialPattern(environment: "sandbox" | "production") {
  return environment === "production"
    ? /^env:GHL_PRODUCTION_LOCATION(?:_[A-Z0-9]+)*_TOKEN$/
    : /^env:GHL_SANDBOX_LOCATION(?:_[A-Z0-9]+)*_TOKEN$/;
}

/**
 * Parses a non-secret binding registry. It contains only canonical database /
 * provider ids and references to separately stored location-scoped secrets.
 * Plaintext tokens and agency references are rejected before any database or
 * provider action.
 */
export function parseGhlInboundFormsAuthorityBindings(input: {
  environment: "sandbox" | "production";
  serialized: string | undefined;
}): GhlInboundFormsAuthorityBinding[] {
  if (!input.serialized?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.serialized);
  } catch {
    throw new GhlInboundFormsAuthorityConfigurationError(
      `ghl_${input.environment}_inbound_forms_binding_json_invalid`,
      "The GHL inbound forms binding registry is not valid JSON.",
    );
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 1_000) {
    throw new GhlInboundFormsAuthorityConfigurationError(
      `ghl_${input.environment}_inbound_forms_binding_count_invalid`,
      "The GHL inbound forms binding registry must contain between 1 and 1,000 entries.",
    );
  }
  const seenMappings = new Set<string>();
  const seenLocations = new Set<string>();
  return parsed.map((value) => {
    const item = record(value);
    const binding = {
      organizationId: text(item.organizationId),
      mappingId: text(item.mappingId),
      providerLocationId: text(item.providerLocationId),
      credentialRef: text(item.credentialRef),
    };
    if (
      !exactUuid(binding.organizationId)
      || !exactUuid(binding.mappingId)
      || !exactProviderId(binding.providerLocationId)
      || !expectedCredentialPattern(input.environment).test(binding.credentialRef)
      || binding.credentialRef.includes("AGENCY")
      || seenMappings.has(binding.mappingId)
      || seenLocations.has(binding.providerLocationId)
    ) {
      throw new GhlInboundFormsAuthorityConfigurationError(
        `ghl_${input.environment}_inbound_forms_binding_invalid`,
        "A GHL inbound forms binding is malformed, duplicated, plaintext, or not location-scoped.",
      );
    }
    seenMappings.add(binding.mappingId);
    seenLocations.add(binding.providerLocationId);
    return binding;
  }).sort((left, right) => left.mappingId.localeCompare(right.mappingId));
}

async function currentAuthority(input: {
  client: RpcClient;
  environment: "sandbox" | "production";
  organizationId: string;
  sandboxGate?: GhlSandboxGateInput;
  productionGate?: GhlProductionGateInput;
}) {
  return input.environment === "production"
    ? resolveGhlProductionAuthority({
        client: input.client,
        organizationId: input.organizationId,
        gate: input.productionGate!,
      })
    : resolveGhlSandboxAuthority({
        client: input.client,
        organizationId: input.organizationId,
        gate: input.sandboxGate!,
      });
}

async function exactEligibleFormIds(input: {
  client: RpcClient;
  binding: GhlInboundFormsAuthorityBinding;
  environment: "sandbox" | "production";
}) {
  const result = await input.client.rpc("list_ghl_inbound_eligible_form_routes_v1", {
    p_organization_id: input.binding.organizationId,
    p_location_mapping_id: input.binding.mappingId,
    p_environment: input.environment,
  });
  if (result.error) {
    throw new GhlInboundFormsAuthorityConfigurationError(
      `ghl_${input.environment}_inbound_forms_route_lookup_failed`,
      result.error.message,
    );
  }
  const formIds = rows(result.data).map((route) => text(route.provider_form_id)).sort();
  if (
    formIds.length === 0
    || formIds.length > 25
    || new Set(formIds).size !== formIds.length
    || formIds.some((formId) => !exactProviderId(formId))
  ) {
    throw new GhlInboundFormsAuthorityConfigurationError(
      `ghl_${input.environment}_inbound_forms_route_scope_invalid`,
      "The exact current GHL form scope is missing, duplicated, or unbounded.",
    );
  }
  return formIds;
}

/**
 * GET-only verifies each exact current form with the independently referenced
 * Sub-Account credential, then atomically binds the narrow attestation. It
 * never resolves or substitutes the installation agency credential.
 */
export async function configureGhlInboundFormsAuthorities(input: {
  client: RpcClient;
  environment: "sandbox" | "production";
  bindings: GhlInboundFormsAuthorityBinding[];
  enableRuntime: boolean;
  /**
   * Reopens the independently gated periodic recovery lane only after the
   * complete location-authority batch has been provider-verified and bound.
   * Omitting it deliberately leaves that lane closed.
   */
  enablePeriodicSweep?: boolean;
  authorization: string | undefined;
  sandboxGate?: GhlSandboxGateInput;
  productionGate?: GhlProductionGateInput;
  providerFactory: (input: {
    authority: GhlSandboxAuthority;
    credentialRef: string;
  }) => GhlInboundFormsAuthorityProvider;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  drainTimeoutMs?: number;
}) {
  const exactAuthorization = input.environment === "production"
    ? "DEALFLOW_GHL_PRODUCTION_INBOUND_FORMS_EXACT_V1"
    : "DEALFLOW_GHL_SANDBOX_INBOUND_FORMS_EXACT_V1";
  if (input.authorization !== exactAuthorization) {
    throw new GhlInboundFormsAuthorityConfigurationError(
      `ghl_${input.environment}_inbound_forms_authorization_missing`,
      "The exact GHL inbound forms authority configuration authorization is missing.",
    );
  }
  if (input.enableRuntime === false && input.enablePeriodicSweep === true) {
    throw new GhlInboundFormsAuthorityConfigurationError(
      `ghl_${input.environment}_inbound_forms_sweep_requires_reconciliation`,
      "The periodic GHL form sweep cannot be enabled while inbound reconciliation is disabled.",
    );
  }
  // Emergency disable must not depend on GHL, a credential, or even a binding
  // registry. Close both database claim gates before doing anything else and
  // perform no provider construction, read, or binding on this path.
  if (input.enableRuntime === false) {
    const sweepRuntime = await input.client.rpc("set_ghl_inbound_form_sweep_runtime_v1", {
      p_environment: input.environment,
      p_enabled: false,
      p_now: (input.now?.() ?? new Date()).toISOString(),
    });
    if (sweepRuntime.error) {
      throw new GhlInboundFormsAuthorityConfigurationError(
        `ghl_${input.environment}_inbound_forms_sweep_runtime_update_failed`,
        sweepRuntime.error.message,
      );
    }
    const runtime = await input.client.rpc("set_ghl_inbound_form_reconciliation_runtime_v1", {
      p_environment: input.environment,
      p_enabled: false,
      p_now: (input.now?.() ?? new Date()).toISOString(),
    });
    if (runtime.error) {
      throw new GhlInboundFormsAuthorityConfigurationError(
        `ghl_${input.environment}_inbound_forms_runtime_update_failed`,
        runtime.error.message,
      );
    }
    return {
      environment: input.environment,
      runtimeEnabled: false,
      sweepRuntimeEnabled: false,
      configured: [],
      providerMutationAttempted: false as const,
    };
  }

  // Credential rotation is two-phase. Commit both runtime gates closed before
  // any new credential is verified or persisted, then prove every prior sweep
  // and reconciliation claim is drained. Any later error intentionally leaves
  // both recovery lanes closed.
  const sweepFenced = await input.client.rpc("set_ghl_inbound_form_sweep_runtime_v1", {
    p_environment: input.environment,
    p_enabled: false,
    p_now: (input.now?.() ?? new Date()).toISOString(),
  });
  if (sweepFenced.error) {
    throw new GhlInboundFormsAuthorityConfigurationError(
      `ghl_${input.environment}_inbound_forms_sweep_runtime_fence_failed`,
      sweepFenced.error.message,
    );
  }
  const fenced = await input.client.rpc("set_ghl_inbound_form_reconciliation_runtime_v1", {
    p_environment: input.environment,
    p_enabled: false,
    p_now: (input.now?.() ?? new Date()).toISOString(),
  });
  if (fenced.error) {
    throw new GhlInboundFormsAuthorityConfigurationError(
      `ghl_${input.environment}_inbound_forms_runtime_fence_failed`,
      fenced.error.message,
    );
  }
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  const drainTimeoutMs = Math.min(Math.max(input.drainTimeoutMs ?? 60_000, 1_000), 600_000);
  const drainDeadline = Date.now() + drainTimeoutMs;
  while (true) {
    const sweepDrained = await input.client.rpc("drain_ghl_inbound_form_sweep_claims_v1", {
      p_environment: input.environment,
      p_now: (input.now?.() ?? new Date()).toISOString(),
    });
    if (sweepDrained.error) {
      throw new GhlInboundFormsAuthorityConfigurationError(
        `ghl_${input.environment}_inbound_forms_sweep_worker_drain_failed`,
        sweepDrained.error.message,
      );
    }
    const reconciliationDrained = await input.client.rpc("drain_ghl_inbound_form_reconciliation_claims_v1", {
      p_environment: input.environment,
      p_now: (input.now?.() ?? new Date()).toISOString(),
    });
    if (reconciliationDrained.error) {
      throw new GhlInboundFormsAuthorityConfigurationError(
        `ghl_${input.environment}_inbound_forms_worker_drain_failed`,
        reconciliationDrained.error.message,
      );
    }
    const activeSweepClaims = Number(sweepDrained.data);
    const activeReconciliationClaims = Number(reconciliationDrained.data);
    if (
      !Number.isInteger(activeSweepClaims)
      || activeSweepClaims < 0
      || !Number.isInteger(activeReconciliationClaims)
      || activeReconciliationClaims < 0
    ) {
      throw new GhlInboundFormsAuthorityConfigurationError(
        `ghl_${input.environment}_inbound_forms_worker_drain_invalid`,
        "A GHL inbound sweep or reconciliation worker-drain response was invalid.",
      );
    }
    if (activeSweepClaims === 0 && activeReconciliationClaims === 0) break;
    if (Date.now() >= drainDeadline) {
      throw new GhlInboundFormsAuthorityConfigurationError(
        `ghl_${input.environment}_inbound_forms_worker_drain_timeout`,
        "The prior GHL inbound reconciliation workers did not drain before the bounded timeout.",
      );
    }
    await sleep(Math.min(250, Math.max(drainDeadline - Date.now(), 1)));
  }
  if (input.bindings.length === 0) {
    throw new GhlInboundFormsAuthorityConfigurationError(
      `ghl_${input.environment}_inbound_forms_bindings_missing`,
      "No location-scoped GHL inbound forms bindings were configured.",
    );
  }

  const configured: Array<{
    organizationId: string;
    mappingId: string;
    providerLocationId: string;
    credentialReferenceFingerprint: string;
    verifiedFormCount: number;
  }> = [];
  const verifiedBindings: Array<{
    organizationId: string;
    mappingId: string;
    providerLocationId: string;
    credentialRef: string;
    verifiedFormIds: string[];
    submissionScopeProviderRequestId: string | null;
    submissionScopeResponseFingerprint: string;
  }> = [];
  for (const binding of input.bindings) {
    const authority = await currentAuthority({
      client: input.client,
      environment: input.environment,
      organizationId: binding.organizationId,
      sandboxGate: input.sandboxGate,
      productionGate: input.productionGate,
    });
    if (
      !authority
      || authority.mappingId !== binding.mappingId
      || authority.providerLocationId !== binding.providerLocationId
    ) {
      throw new GhlInboundFormsAuthorityConfigurationError(
        `ghl_${input.environment}_inbound_forms_mapping_mismatch`,
        "The configured GHL location credential does not match the canonical active mapping.",
      );
    }
    const formIds = await exactEligibleFormIds({
      client: input.client,
      binding,
      environment: input.environment,
    });
    const provider = input.providerFactory({
      authority,
      credentialRef: binding.credentialRef,
    });
    const verification = await provider.verifyPreinstalledForms({
      providerLocationId: binding.providerLocationId,
      requiredFormIds: formIds,
    });
    if (verification.providerMutationAttempted !== false || verification.outcome !== "succeeded") {
      throw new GhlInboundFormsAuthorityConfigurationError(
        verification.errorCode ?? `ghl_${input.environment}_inbound_forms_scope_verification_failed`,
        verification.safeMessage ?? "The location-scoped GHL forms.readonly credential could not be verified.",
      );
    }
    const submissionScopeVerification = await provider.verifyFormSubmissionsReadScope({
      providerLocationId: binding.providerLocationId,
      requiredFormIds: formIds,
    });
    if (
      submissionScopeVerification.providerMutationAttempted !== false
      || submissionScopeVerification.outcome !== "succeeded"
    ) {
      throw new GhlInboundFormsAuthorityConfigurationError(
        submissionScopeVerification.errorCode
          ?? `ghl_${input.environment}_inbound_form_submissions_scope_verification_failed`,
        submissionScopeVerification.safeMessage
          ?? "The location credential was not accepted by the exact GHL form-submissions endpoint.",
      );
    }
    if (!exactResponseFingerprint(submissionScopeVerification.responseFingerprint)) {
      throw new GhlInboundFormsAuthorityConfigurationError(
        `ghl_${input.environment}_inbound_form_submissions_scope_evidence_invalid`,
        "The location credential scope proof did not include a valid response fingerprint.",
      );
    }
    const submissionScopeProviderRequestId = safeProviderRequestId(
      submissionScopeVerification.providerRequestId,
    );
    if (
      submissionScopeVerification.providerRequestId !== null
      && submissionScopeVerification.providerRequestId !== undefined
      && submissionScopeProviderRequestId === null
    ) {
      throw new GhlInboundFormsAuthorityConfigurationError(
        `ghl_${input.environment}_inbound_form_submissions_scope_evidence_invalid`,
        "The location credential scope proof included an invalid provider request identifier.",
      );
    }
    verifiedBindings.push({
      organizationId: binding.organizationId,
      mappingId: binding.mappingId,
      providerLocationId: binding.providerLocationId,
      credentialRef: binding.credentialRef,
      verifiedFormIds: formIds,
      submissionScopeProviderRequestId,
      submissionScopeResponseFingerprint: submissionScopeVerification.responseFingerprint,
    });
    configured.push({
      organizationId: binding.organizationId,
      mappingId: binding.mappingId,
      providerLocationId: binding.providerLocationId,
      credentialReferenceFingerprint: fingerprintCredentialReference(binding.credentialRef),
      verifiedFormCount: formIds.length,
    });
  }

  // The runtime fence was committed and old workers were drained before these
  // provider checks. This RPC replaces every current attestation, validates the
  // exact complete mapping set, and reopens the gate atomically. Any failure
  // rolls back the rotation while the earlier committed fence remains closed.
  const runtime = await input.client.rpc("configure_ghl_inbound_forms_read_authorities_with_sweep_proof_v1", {
    p_environment: input.environment,
    p_bindings: verifiedBindings,
    p_enable_periodic_sweep: input.enablePeriodicSweep === true,
    p_actor: "owner:dealflow-inbound-forms-authority-command",
    p_now: (input.now?.() ?? new Date()).toISOString(),
  });
  if (runtime.error) {
    throw new GhlInboundFormsAuthorityConfigurationError(
      `ghl_${input.environment}_inbound_forms_runtime_update_failed`,
      runtime.error.message,
    );
  }
  return {
    environment: input.environment,
    runtimeEnabled: true,
    sweepRuntimeEnabled: input.enablePeriodicSweep === true,
    configured,
    providerMutationAttempted: false as const,
  };
}
