import {
  assertGhlProductionAllowed,
  assertGhlSandboxAllowed,
  type GhlPeriodicFormSweepReadAdapter,
  type GhlProductionGateInput,
  type GhlSandboxGateInput,
} from "../integrations/gohighlevel";
import {
  GhlSandboxAuthorityError,
  resolveGhlInboundFormsReadAuthority,
  resolveGhlProductionAuthority,
  resolveGhlSandboxAuthority,
  type GhlInboundFormsReadAuthority,
} from "./ghl-sandbox-authority-service";

type JsonRecord = Record<string, unknown>;
type RpcResult = Promise<{ data: unknown; error: { message: string } | null }>;

export const GHL_PERIODIC_FORM_SWEEP_DEFAULT_MAX_ITEMS = 75;
export const GHL_PERIODIC_FORM_SWEEP_DEFAULT_CONCURRENCY = 25;
export const GHL_PERIODIC_FORM_SWEEP_MAX_READ_SECONDS = 30;
export const GHL_PERIODIC_FORM_SWEEP_CADENCE_MINUTES = 15;

export type GhlPeriodicFormSweepClient = {
  from: (table: string) => { select: (columns: string) => any };
  rpc: (name: string, params: Record<string, unknown>) => RpcResult;
};

type SweepProvider = GhlPeriodicFormSweepReadAdapter & {
  verifyFormSubmissionsReadScope(input: {
    providerLocationId: string;
    requiredFormIds: string[];
  }): Promise<{
    outcome: "succeeded" | "retryable_failure" | "operator_action_required" | "uncertain";
    errorCode?: string;
    providerRequestId?: string | null;
    responseFingerprint?: string | null;
    providerMutationAttempted: boolean;
  }>;
};

export type GhlPeriodicFormSweepDependencies = {
  client: GhlPeriodicFormSweepClient;
  environment: "sandbox" | "production";
  sandboxGate?: GhlSandboxGateInput;
  productionGate?: GhlProductionGateInput;
  providerFactory: (authority: GhlInboundFormsReadAuthority) => SweepProvider;
  maxSweepItems?: number;
  sweepConcurrency?: number;
  maxAttestationRefreshItems?: number;
  attestationRefreshConcurrency?: number;
  workerId?: string;
  leaseMs?: number;
  deadlineAtMs?: number;
  minimumClaimBudgetMs?: number;
  now?: () => string;
};

export class GhlPeriodicFormSweepError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly disposition: "retryable_failure" | "operator_action_required" = "retryable_failure",
  ) {
    super(message);
    this.name = "GhlPeriodicFormSweepError";
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function firstRow(value: unknown) {
  return rows(value)[0] ?? null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : -1;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

function safeErrorCode(value: unknown, fallback: string) {
  const candidate = text(value);
  return /^[a-z0-9_:-]{3,180}$/.test(candidate) ? candidate : fallback;
}

function retryDelayMs(attempt: number, providerDelay?: number) {
  if (providerDelay !== undefined && Number.isFinite(providerDelay)) {
    return Math.min(Math.max(Math.round(providerDelay), 1_000), 900_000);
  }
  return Math.min(15_000 * (2 ** Math.max(attempt - 1, 0)), 900_000);
}

async function withConcurrency<T, R>(items: T[], concurrency: number, run: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

type ClaimedSweep = {
  runId: string;
  cursorId: string;
  organizationId: string;
  mappingId: string;
  providerLocationId: string;
  providerFormId: string;
  allowedFieldIds: string[];
  routeFingerprint: string;
  authorityFingerprint: string;
  credentialGeneration: number;
  windowStart: string;
  windowEnd: string;
  attemptCount: number;
  leaseToken: string;
  leaseGeneration: number;
};

function parseClaim(value: JsonRecord): ClaimedSweep {
  const claim = {
    runId: text(value.run_id),
    cursorId: text(value.cursor_id),
    organizationId: text(value.organization_id),
    mappingId: text(value.location_mapping_id),
    providerLocationId: text(value.provider_location_id),
    providerFormId: text(value.provider_form_id),
    allowedFieldIds: stringArray(value.allowed_field_ids),
    routeFingerprint: text(value.route_fingerprint),
    authorityFingerprint: text(value.authority_fingerprint),
    credentialGeneration: integer(value.credential_generation),
    windowStart: text(value.window_start),
    windowEnd: text(value.window_end),
    attemptCount: integer(value.attempt_count),
    leaseToken: text(value.lease_token),
    leaseGeneration: integer(value.lease_generation),
  };
  if (
    !claim.runId || !claim.cursorId || !claim.organizationId || !claim.mappingId
    || !/^[A-Za-z0-9_-]{3,180}$/.test(claim.providerLocationId)
    || !/^[A-Za-z0-9_-]{3,180}$/.test(claim.providerFormId)
    || claim.allowedFieldIds.length > 125
    || claim.allowedFieldIds.some((id) => !/^[A-Za-z0-9_-]{3,180}$/.test(id))
    || new Set(claim.allowedFieldIds).size !== claim.allowedFieldIds.length
    || !/^[a-f0-9]{64}$/.test(claim.routeFingerprint)
    || !/^[a-f0-9]{64}$/.test(claim.authorityFingerprint)
    || claim.credentialGeneration < 1
    || !Number.isFinite(Date.parse(claim.windowStart))
    || !Number.isFinite(Date.parse(claim.windowEnd))
    || Date.parse(claim.windowEnd) <= Date.parse(claim.windowStart)
    || Date.parse(claim.windowEnd) - Date.parse(claim.windowStart) > 70 * 60_000
    || claim.attemptCount < 1 || !claim.leaseToken || claim.leaseGeneration < 1
  ) throw new GhlPeriodicFormSweepError("ghl_form_sweep_claim_contract_invalid", "The sweep claim was malformed.", "operator_action_required");
  return claim;
}

async function runtimeOpen(dependencies: GhlPeriodicFormSweepDependencies) {
  const { data, error } = await (dependencies.client as any)
    .from("ghl_runtime_controls")
    .select("environment,inbound_form_reconciliation_enabled,inbound_form_sweep_enabled")
    .eq("environment", dependencies.environment)
    .maybeSingle();
  if (error) throw new GhlPeriodicFormSweepError("ghl_form_sweep_runtime_lookup_failed", error.message);
  return data?.inbound_form_reconciliation_enabled === true && data?.inbound_form_sweep_enabled === true;
}

async function reconciliationRuntimeOpen(dependencies: GhlPeriodicFormSweepDependencies) {
  const { data, error } = await (dependencies.client as any)
    .from("ghl_runtime_controls")
    .select("environment,inbound_form_reconciliation_enabled")
    .eq("environment", dependencies.environment)
    .maybeSingle();
  if (error) throw new GhlPeriodicFormSweepError("ghl_form_sweep_runtime_lookup_failed", error.message);
  return data?.inbound_form_reconciliation_enabled === true;
}

async function resolveAuthority(
  dependencies: GhlPeriodicFormSweepDependencies,
  scope: { organizationId: string; mappingId: string; providerLocationId: string },
) {
  const canonical = dependencies.environment === "production"
    ? await resolveGhlProductionAuthority({
        client: dependencies.client,
        organizationId: scope.organizationId,
        gate: dependencies.productionGate!,
      })
    : await resolveGhlSandboxAuthority({
        client: dependencies.client,
        organizationId: scope.organizationId,
        gate: dependencies.sandboxGate!,
      });
  if (!canonical || canonical.mappingId !== scope.mappingId || canonical.providerLocationId !== scope.providerLocationId) {
    throw new GhlSandboxAuthorityError(
      `ghl_${dependencies.environment}_form_sweep_mapping_authority_changed`,
      "The exact GHL mapping authority changed before the provider read.",
    );
  }
  return resolveGhlInboundFormsReadAuthority({ client: dependencies.client, authority: canonical });
}

async function resolvePendingRefreshAuthority(
  dependencies: GhlPeriodicFormSweepDependencies,
  scope: { organizationId: string; mappingId: string; providerLocationId: string; credentialGeneration: number },
) {
  const canonical = dependencies.environment === "production"
    ? await resolveGhlProductionAuthority({ client: dependencies.client, organizationId: scope.organizationId, gate: dependencies.productionGate! })
    : await resolveGhlSandboxAuthority({ client: dependencies.client, organizationId: scope.organizationId, gate: dependencies.sandboxGate! });
  if (!canonical || canonical.mappingId !== scope.mappingId || canonical.providerLocationId !== scope.providerLocationId) {
    throw new GhlSandboxAuthorityError(
      `ghl_${dependencies.environment}_form_sweep_refresh_mapping_changed`,
      "The exact GHL refresh mapping changed before verification.",
    );
  }
  const { data, error } = await (dependencies.client as any)
    .from("ghl_location_mappings")
    .select("id,organization_id,environment,provider_location_id,status,forms_readonly_credential_ref,forms_readonly_capabilities,forms_readonly_credential_generation")
    .eq("id", scope.mappingId)
    .eq("organization_id", scope.organizationId)
    .eq("environment", dependencies.environment)
    .eq("provider_location_id", scope.providerLocationId)
    .eq("status", "active")
    .maybeSingle();
  const credentialRef = text(data?.forms_readonly_credential_ref);
  const expected = dependencies.environment === "production"
    ? /^env:GHL_PRODUCTION_LOCATION(_[A-Z0-9]+)*_TOKEN$/
    : /^env:GHL_SANDBOX_LOCATION(_[A-Z0-9]+)*_TOKEN$/;
  if (
    error || !data || integer(data.forms_readonly_credential_generation) !== scope.credentialGeneration
    || !expected.test(credentialRef)
    || JSON.stringify(data.forms_readonly_capabilities) !== JSON.stringify(["forms.readonly"])
  ) {
    throw new GhlSandboxAuthorityError(
      `ghl_${dependencies.environment}_form_sweep_refresh_authority_invalid`,
      error?.message ?? "The pending location-scoped forms.readonly authority is invalid.",
    );
  }
  return {
    environment: dependencies.environment,
    organizationId: scope.organizationId,
    mappingId: scope.mappingId,
    providerLocationId: scope.providerLocationId,
    providerAgencyId: canonical.providerAgencyId,
    credentialRef,
    capabilities: ["forms.readonly"],
    scopeAttestedAt: new Date(0).toISOString(),
  } satisfies GhlInboundFormsReadAuthority;
}

async function assertFreshDispatchAuthority(
  dependencies: GhlPeriodicFormSweepDependencies,
  claim: ClaimedSweep,
) {
  if (!await runtimeOpen(dependencies)) {
    throw new GhlPeriodicFormSweepError("ghl_form_sweep_runtime_closed_before_read", "The sweep runtime closed before provider read.");
  }
  const validated = await dependencies.client.rpc("validate_ghl_inbound_form_sweep_dispatch_v1", {
    p_run_id: claim.runId,
    p_worker_id: dependencies.workerId,
    p_lease_token: claim.leaseToken,
    p_lease_generation: claim.leaseGeneration,
    p_now: dependencies.now?.() ?? new Date().toISOString(),
  });
  if (validated.error || validated.data !== true) {
    throw new GhlPeriodicFormSweepError(
      "ghl_form_sweep_dispatch_fence_changed",
      validated.error?.message ?? "The exact route or authority fence changed before provider read.",
      "operator_action_required",
    );
  }
  const { data, error } = await (dependencies.client as any)
    .from("ghl_location_mappings")
    .select("id,organization_id,environment,provider_location_id,status,forms_readonly_credential_generation,forms_readonly_scope_attested_at")
    .eq("id", claim.mappingId)
    .eq("organization_id", claim.organizationId)
    .eq("environment", dependencies.environment)
    .eq("provider_location_id", claim.providerLocationId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) {
    throw new GhlPeriodicFormSweepError("ghl_form_sweep_mapping_fence_changed", error?.message ?? "The exact active mapping is missing.", "operator_action_required");
  }
  const attestedAt = Date.parse(text(data.forms_readonly_scope_attested_at));
  if (
    integer(data.forms_readonly_credential_generation) !== claim.credentialGeneration
    || !Number.isFinite(attestedAt)
    || attestedAt < Date.now() - 15 * 60_000
    || attestedAt > Date.now() + 5 * 60_000
  ) {
    throw new GhlPeriodicFormSweepError("ghl_form_sweep_dispatch_authority_stale", "The location read authority is stale or rotated.", "operator_action_required");
  }
}

async function settleFailure(
  dependencies: GhlPeriodicFormSweepDependencies,
  claim: ClaimedSweep,
  input: {
    disposition: "retryable_failure" | "operator_action_required";
    errorCode: string;
    providerRequestIds?: string[];
    responseFingerprint?: string | null;
    retryAfterMs?: number;
  },
) {
  const { data, error } = await dependencies.client.rpc("fail_ghl_inbound_form_sweep_v1", {
    p_run_id: claim.runId,
    p_worker_id: dependencies.workerId,
    p_lease_token: claim.leaseToken,
    p_lease_generation: claim.leaseGeneration,
    p_disposition: input.disposition,
    p_error_code: safeErrorCode(input.errorCode, "ghl_form_sweep_unclassified_failure"),
    p_provider_request_ids: input.providerRequestIds ?? [],
    p_response_fingerprint: input.responseFingerprint ?? null,
    p_retry_after_ms: input.disposition === "retryable_failure"
      ? retryDelayMs(claim.attemptCount, input.retryAfterMs)
      : null,
    p_now: dependencies.now?.() ?? new Date().toISOString(),
  });
  if (error) throw new GhlPeriodicFormSweepError("ghl_form_sweep_failure_settlement_failed", error.message);
  return asRecord(data);
}

async function processClaim(dependencies: GhlPeriodicFormSweepDependencies, claim: ClaimedSweep) {
  try {
    await assertFreshDispatchAuthority(dependencies, claim);
    const authority = await resolveAuthority(dependencies, claim);
    await assertFreshDispatchAuthority(dependencies, claim);
    const provider = dependencies.providerFactory(authority);
    const read = await provider.readPeriodicFormSubmissionWindow({
      providerLocationId: claim.providerLocationId,
      providerFormId: claim.providerFormId,
      allowedFieldIds: claim.allowedFieldIds,
      windowStart: claim.windowStart,
      windowEnd: claim.windowEnd,
      maxPages: 10,
      maxSubmissions: 1_000,
    });
    if (read.providerMutationAttempted !== false) {
      throw new GhlPeriodicFormSweepError("ghl_form_sweep_get_only_invariant_failed", "The provider adapter violated its GET-only contract.", "operator_action_required");
    }
    if (read.outcome !== "succeeded") {
      const settled = await settleFailure(dependencies, claim, {
        disposition: read.outcome,
        errorCode: read.errorCode,
        providerRequestIds: read.providerRequestId ? [read.providerRequestId] : [],
        responseFingerprint: read.responseFingerprint,
        retryAfterMs: read.retryAfterMs,
      });
      return { runId: claim.runId, outcome: text(settled.status) || read.outcome, errorCode: read.errorCode, providerMutationAttempted: false as const };
    }
    if (read.requestCount !== read.pageCount || read.pageCount < 1 || read.pageCount > 10) {
      throw new GhlPeriodicFormSweepError("ghl_form_sweep_page_evidence_incomplete", "Provider page evidence was incomplete.", "operator_action_required");
    }
    const normalizedIdentities = read.submissions.map((submission) => ({
      providerSubmissionId: submission.providerSubmissionId,
      providerFormId: submission.providerFormId,
      providerContactId: submission.providerContactId,
      submittedAt: submission.submittedAt,
      submissionFingerprint: submission.submissionFingerprint,
    }));
    const { data, error } = await dependencies.client.rpc("complete_ghl_inbound_form_sweep_v1", {
      p_run_id: claim.runId,
      p_worker_id: dependencies.workerId,
      p_lease_token: claim.leaseToken,
      p_lease_generation: claim.leaseGeneration,
      p_submissions: normalizedIdentities,
      p_provider_request_ids: read.providerRequestIds,
      p_response_fingerprint: read.responseFingerprint,
      p_page_count: read.pageCount,
      p_observed_total: read.observedTotal,
      p_now: dependencies.now?.() ?? new Date().toISOString(),
    });
    if (error) throw new GhlPeriodicFormSweepError("ghl_form_sweep_success_settlement_failed", error.message);
    return { runId: claim.runId, outcome: text(asRecord(data).status) || "succeeded", errorCode: null, providerMutationAttempted: false as const };
  } catch (error) {
    const code = error instanceof GhlSandboxAuthorityError || error instanceof GhlPeriodicFormSweepError
      ? error.code
      : "ghl_form_sweep_unexpected_failure";
    const disposition = error instanceof GhlSandboxAuthorityError
      ? "operator_action_required"
      : error instanceof GhlPeriodicFormSweepError ? error.disposition : "retryable_failure";
    const settled = await settleFailure(dependencies, claim, { disposition, errorCode: code });
    return { runId: claim.runId, outcome: text(settled.status) || disposition, errorCode: code, providerMutationAttempted: false as const };
  }
}

async function refreshAttestations(dependencies: GhlPeriodicFormSweepDependencies) {
  const maximum = Math.min(Math.max(dependencies.maxAttestationRefreshItems ?? 100, 1), 100);
  const concurrency = Math.min(Math.max(dependencies.attestationRefreshConcurrency ?? 25, 1), 25);
  const minimumClaimBudgetMs = Math.min(Math.max(
    dependencies.minimumClaimBudgetMs ?? 45_000,
    35_000,
  ), 120_000);
  let reservedClaims = 0;
  let deadlineExhausted = false;
  const claimNext = async (syncRegistry: boolean) => {
    if (reservedClaims >= maximum) return null;
    if (Date.now() + minimumClaimBudgetMs > (dependencies.deadlineAtMs ?? Number.POSITIVE_INFINITY)) {
      deadlineExhausted = true;
      return null;
    }
    reservedClaims += 1;
    const claimed = await dependencies.client.rpc("claim_ghl_form_sweep_attestation_refresh_batch_v1", {
      p_environment: dependencies.environment,
      p_worker_id: `${dependencies.workerId}-refresh`,
      p_now: dependencies.now?.() ?? new Date().toISOString(),
      p_limit: 1,
      p_lease_ms: 60_000,
      p_sync_registry: syncRegistry,
    });
    if (claimed.error) {
      throw new GhlPeriodicFormSweepError(
        "ghl_form_sweep_attestation_candidates_failed",
        claimed.error.message,
      );
    }
    return rows(claimed.data)[0] ?? null;
  };
  const processCandidate = async (candidate: JsonRecord) => {
    const scope = {
      organizationId: text(candidate.organization_id),
      mappingId: text(candidate.location_mapping_id),
      providerLocationId: text(candidate.provider_location_id),
      credentialGeneration: integer(candidate.credential_generation),
    };
    const stateId = text(candidate.state_id);
    const leaseToken = text(candidate.lease_token);
    const leaseGeneration = integer(candidate.lease_generation);
    const formIds = stringArray(candidate.verified_form_ids).sort();
    try {
      if (Date.now() + 10_000 > (dependencies.deadlineAtMs ?? Number.POSITIVE_INFINITY)) {
        throw new GhlPeriodicFormSweepError(
          "ghl_form_sweep_attestation_deadline_exhausted",
          "The bounded worker deadline was reached before the provider read.",
          "retryable_failure",
        );
      }
      const validateDispatch = async () => {
        const validation = await dependencies.client.rpc(
          "validate_ghl_form_sweep_attestation_refresh_dispatch_v1",
          {
            p_state_id: stateId,
            p_worker_id: `${dependencies.workerId}-refresh`,
            p_lease_token: leaseToken,
            p_lease_generation: leaseGeneration,
            p_expected_form_ids: formIds,
            p_now: dependencies.now?.() ?? new Date().toISOString(),
          },
        );
        if (validation.error || validation.data !== true) {
          throw new GhlPeriodicFormSweepError(
            "ghl_form_sweep_attestation_dispatch_scope_changed",
            validation.error?.message ?? "The refresh dispatch fence was not confirmed.",
            "retryable_failure",
          );
        }
      };
      await validateDispatch();
      const authority = await resolvePendingRefreshAuthority(dependencies, scope);
      await validateDispatch();
      const provider = dependencies.providerFactory(authority);
      // Routine freshness is a cheap location/token-scope proof. The full form
      // inventory is already immutable provisioning/configuration evidence and
      // is rechecked only on route or credential-generation change. One exact
      // zero-customer submissions probe proves the location token can still
      // access the required endpoint; the settlement RPC binds the complete
      // current DB route set before refreshing the timestamp.
      const submissionScope = await provider.verifyFormSubmissionsReadScope({
        providerLocationId: scope.providerLocationId,
        requiredFormIds: [formIds[0]],
      });
      if (submissionScope.outcome !== "succeeded" || submissionScope.providerMutationAttempted !== false) {
        throw new GhlPeriodicFormSweepError(
          submissionScope.errorCode ?? "ghl_form_sweep_attestation_scope_probe_failed",
          "The zero-customer GHL submissions-scope probe failed.",
          submissionScope.outcome === "retryable_failure" ? "retryable_failure" : "operator_action_required",
        );
      }
      if (!/^[a-f0-9]{64}$/.test(submissionScope.responseFingerprint ?? "")) {
        throw new GhlPeriodicFormSweepError(
          "ghl_form_sweep_attestation_evidence_missing",
          "The zero-customer GHL submissions-scope probe returned no immutable evidence.",
          "operator_action_required",
        );
      }
      const refreshed = await dependencies.client.rpc("complete_ghl_form_sweep_attestation_refresh_v1", {
        p_state_id: stateId,
        p_worker_id: `${dependencies.workerId}-refresh`,
        p_lease_token: leaseToken,
        p_lease_generation: leaseGeneration,
        p_verified_form_ids: formIds,
        p_provider_request_id: submissionScope.providerRequestId ?? null,
        p_response_fingerprint: submissionScope.responseFingerprint,
        p_now: dependencies.now?.() ?? new Date().toISOString(),
      });
      if (refreshed.error) throw new GhlPeriodicFormSweepError("ghl_form_sweep_attestation_settlement_failed", refreshed.error.message);
      return { mappingId: scope.mappingId, outcome: "succeeded", refreshed: true as const };
    } catch (error) {
      const errorCode = error instanceof GhlSandboxAuthorityError || error instanceof GhlPeriodicFormSweepError
        ? error.code : "ghl_form_sweep_attestation_refresh_failed";
      const failed = await dependencies.client.rpc("fail_ghl_form_sweep_attestation_refresh_v1", {
        p_state_id: stateId,
        p_worker_id: `${dependencies.workerId}-refresh`,
        p_lease_token: leaseToken,
        p_lease_generation: leaseGeneration,
        p_disposition: error instanceof GhlSandboxAuthorityError
          ? "operator_action_required"
          : error instanceof GhlPeriodicFormSweepError ? error.disposition : "retryable_failure",
        p_error_code: safeErrorCode(errorCode, "ghl_form_sweep_attestation_refresh_failed"),
        p_now: dependencies.now?.() ?? new Date().toISOString(),
      });
      return {
        mappingId: scope.mappingId,
        outcome: failed.error ? "isolated_failure" : "failed",
        errorCode,
        refreshed: false as const,
      };
    }
  };

  const firstClaim = await claimNext(true);
  const results: Awaited<ReturnType<typeof processCandidate>>[] = [];
  if (firstClaim) {
    const workers = Array.from({ length: concurrency }, async (_, workerIndex) => {
      let current = workerIndex === 0 ? firstClaim : await claimNext(false);
      while (current) {
        const result = await processCandidate(current);
        results.push(result);
        if (result.outcome === "isolated_failure") return;
        current = await claimNext(false);
      }
    });
    await Promise.all(workers);
  }
  return Object.assign(results, { deadlineExhausted });
}

async function readHealthSummary(dependencies: GhlPeriodicFormSweepDependencies) {
  const summary = await dependencies.client.rpc("summarize_ghl_form_sweep_health_v1", {
    p_environment: dependencies.environment,
    p_now: dependencies.now?.() ?? new Date().toISOString(),
  });
  if (summary.error) {
    throw new GhlPeriodicFormSweepError("ghl_form_sweep_health_summary_failed", summary.error.message);
  }
  const row = firstRow(summary.data);
  const result = {
    activeCursorCount: integer(row?.active_cursor_count),
    backfillActiveCount: integer(row?.backfill_active_count),
    lagWarningCount: integer(row?.lag_warning_count),
    cursorOperatorRequiredCount: integer(row?.cursor_operator_required_count),
    retiredCursorCount: integer(row?.retired_cursor_count),
    maxLagSeconds: integer(row?.max_lag_seconds),
    refreshDueCount: integer(row?.refresh_due_count),
    refreshOperatorRequiredCount: integer(row?.refresh_operator_required_count),
  };
  if (Object.values(result).some((value) => value < 0)) {
    throw new GhlPeriodicFormSweepError(
      "ghl_form_sweep_health_summary_invalid",
      "The durable sweep-health aggregate was malformed.",
      "operator_action_required",
    );
  }
  return result;
}

export async function processGhlPeriodicFormSweepBatch(
  input: GhlPeriodicFormSweepDependencies,
) {
  if (input.environment === "production") {
    if (!input.productionGate || input.productionGate.operation !== "form_submissions_read") {
      throw new Error("GHL production periodic form sweep requires a dedicated form-submissions-read gate.");
    }
    assertGhlProductionAllowed(input.productionGate);
  } else {
    if (!input.sandboxGate) throw new Error("GHL sandbox periodic form-sweep gate is missing.");
    assertGhlSandboxAllowed(input.sandboxGate);
  }
  const deadlineAtMs = input.deadlineAtMs ?? Date.now() + 240_000;
  const dependencies = {
    ...input,
    deadlineAtMs,
    workerId: input.workerId?.trim() || `ghl-${input.environment}-periodic-form-sweep`,
  };
  if (!await reconciliationRuntimeOpen(dependencies)) {
    return { status: "blocked" as const, blockedReason: "ghl_form_sweep_reconciliation_gate_closed", processed: 0, refreshed: 0, providerMutationAttempted: false as const, results: [] };
  }

  // The periodic lane's own kill switch fences every claim and every provider
  // GET, including routine scope refreshes. Owner-driven credential binding
  // uses a separate explicit transaction and does not weaken this worker gate.
  if (!await runtimeOpen(dependencies)) {
    return {
      status: "blocked" as const,
      blockedReason: "ghl_form_sweep_database_gate_closed",
      processed: 0,
      refreshed: 0,
      refreshAttempted: 0,
      providerMutationAttempted: false as const,
      results: [],
    };
  }

  // Scope attestations are refreshed only after a real GET-only, exact-form
  // provider verification with the mapping-bound location credential.
  const refreshResults = await refreshAttestations(dependencies);
  const maxItems = Math.min(Math.max(
    input.maxSweepItems ?? GHL_PERIODIC_FORM_SWEEP_DEFAULT_MAX_ITEMS,
    1,
  ), 100);
  const concurrency = Math.min(Math.max(
    input.sweepConcurrency ?? GHL_PERIODIC_FORM_SWEEP_DEFAULT_CONCURRENCY,
    1,
  ), GHL_PERIODIC_FORM_SWEEP_DEFAULT_CONCURRENCY);
  const leaseMs = Math.min(Math.max(input.leaseMs ?? 90_000, 10_000), 120_000);
  const minimumClaimBudgetMs = Math.min(Math.max(input.minimumClaimBudgetMs ?? 45_000, 35_000), 120_000);
  let deadlineExhausted = false;
  let reservedClaims = 0;
  const claimNext = async (syncRegistry: boolean) => {
    if (reservedClaims >= maxItems) return null;
    if (Date.now() + minimumClaimBudgetMs > deadlineAtMs) {
      deadlineExhausted = true;
      return null;
    }
    reservedClaims += 1;
    const claim = await dependencies.client.rpc("claim_next_ghl_inbound_form_sweep_v1", {
      p_environment: dependencies.environment,
      p_worker_id: dependencies.workerId,
      p_now: dependencies.now?.() ?? new Date().toISOString(),
      p_lease_ms: leaseMs,
      p_sync_registry: syncRegistry,
    });
    if (claim.error) throw new GhlPeriodicFormSweepError("ghl_form_sweep_claim_failed", claim.error.message);
    const claimed = firstRow(claim.data);
    return claimed ? parseClaim(claimed) : null;
  };
  // The first claim performs the O(routes) registry maintenance. Every later
  // claim is O(claimed) and is taken just-in-time by a worker immediately
  // before its provider read, so later waves never sit on expiring leases.
  const firstClaim = await claimNext(true);
  const results: Awaited<ReturnType<typeof processClaim>>[] = [];
  if (firstClaim) {
    const workers = Array.from({ length: concurrency }, async (_, workerIndex) => {
      let current = workerIndex === 0 ? firstClaim : await claimNext(false);
      while (current) {
        try {
          results.push(await processClaim(dependencies, current));
        } catch (error) {
          results.push({
            runId: current.runId,
            outcome: "isolated_failure",
            errorCode: error instanceof GhlPeriodicFormSweepError
              ? error.code : "ghl_form_sweep_worker_item_isolated_failure",
            providerMutationAttempted: false as const,
          });
          // A double settlement failure means this worker can no longer prove
          // its lease was released. Retire this worker for the invocation so a
          // database outage cannot accumulate additional orphaned claims.
          return;
        }
        current = await claimNext(false);
      }
    });
    await Promise.all(workers);
  }
  const healthSummary = await readHealthSummary(dependencies);
  const lagAlertCodes = [
    ...(healthSummary.backfillActiveCount > 0 ? ["ghl_form_sweep_backfill_active"] : []),
    ...(healthSummary.lagWarningCount > 0 ? ["ghl_form_sweep_lag_sla_warning"] : []),
    ...(healthSummary.cursorOperatorRequiredCount > 0 ? ["ghl_form_sweep_cursor_operator_action_required"] : []),
    ...(healthSummary.refreshOperatorRequiredCount > 0 ? ["ghl_form_sweep_refresh_operator_action_required"] : []),
  ];
  return {
    status: "complete" as const,
    processed: results.length,
    refreshed: refreshResults.filter((result) => result.refreshed).length,
    refreshAttempted: refreshResults.length,
    deadlineExhausted,
    lagAlertCodes,
    healthSummary,
    providerMutationAttempted: false as const,
    results,
  };
}
