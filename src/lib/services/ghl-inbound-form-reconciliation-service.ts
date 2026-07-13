import {
  assertGhlProductionAllowed,
  assertGhlSandboxAllowed,
  type GhlInboundFormSubmission,
  type GhlInboundFormSubmissionsReadAdapter,
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
import { normalizePhone } from "../phone";

type JsonRecord = Record<string, unknown>;
type RpcResult = Promise<{ data: unknown; error: { message: string } | null }>;

export type GhlInboundFormReconciliationClient = {
  from: (table: string) => { select: (columns: string) => any };
  rpc: (name: string, params: Record<string, unknown>) => RpcResult;
};

export type GhlInboundFormReconciliationDependencies = {
  client: GhlInboundFormReconciliationClient;
  environment: "sandbox" | "production";
  sandboxGate?: GhlSandboxGateInput;
  productionGate?: GhlProductionGateInput;
  providerFactory: (authority: GhlInboundFormsReadAuthority) => GhlInboundFormSubmissionsReadAdapter;
  maxItems?: number;
  workerId?: string;
  leaseMs?: number;
  now?: () => string;
};

export class GhlInboundFormReconciliationError extends Error {
  readonly code: string;
  readonly disposition: "retryable_failure" | "operator_action_required";

  constructor(
    code: string,
    message: string,
    disposition: "retryable_failure" | "operator_action_required" = "retryable_failure",
  ) {
    super(message);
    this.name = "GhlInboundFormReconciliationError";
    this.code = code;
    this.disposition = disposition;
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function firstRow(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as JsonRecord
    : null;
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value: unknown) {
  const raw = text(value);
  const parsed = Date.parse(raw);
  return raw && Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function normalizedEmail(value: string | null) {
  const email = value?.trim().toLowerCase() ?? "";
  if (!email || email.length > 254 || /[\s\u0000-\u001f\u007f]/.test(email)) return null;
  const separator = email.lastIndexOf("@");
  if (separator <= 0 || separator > 64 || separator === email.length - 1) return null;
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  if (
    local.startsWith(".")
    || local.endsWith(".")
    || local.includes("..")
    || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
    || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain)
  ) return null;
  return email;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

function latestProviderRequestId(requestIds: string[]) {
  return requestIds.length > 0 ? requestIds[requestIds.length - 1] : null;
}

function retryDelayMs(attemptCount: number, providerDelay?: number) {
  if (providerDelay !== undefined && Number.isFinite(providerDelay)) {
    return Math.min(Math.max(Math.round(providerDelay), 1_000), 900_000);
  }
  return Math.min(30_000 * (2 ** Math.max(attemptCount - 1, 0)), 900_000);
}

async function runtimeControlOpen(input: {
  client: GhlInboundFormReconciliationClient;
  environment: "sandbox" | "production";
}) {
  const { data, error } = await (input.client as any)
    .from("ghl_runtime_controls")
    .select("environment,inbound_form_reconciliation_enabled")
    .eq("environment", input.environment)
    .maybeSingle();
  if (error) {
    throw new GhlInboundFormReconciliationError(
      `ghl_${input.environment}_inbound_runtime_control_lookup_failed`,
      error.message,
    );
  }
  return data?.inbound_form_reconciliation_enabled === true;
}

async function readyFormIds(input: {
  client: GhlInboundFormReconciliationClient;
  environment: "sandbox" | "production";
  organizationId: string;
  mappingId: string;
}) {
  const { data, error } = await input.client.rpc(
    "list_ghl_inbound_eligible_form_routes_v1",
    {
      p_organization_id: input.organizationId,
      p_location_mapping_id: input.mappingId,
      p_environment: input.environment,
    },
  );
  if (error) {
    throw new GhlInboundFormReconciliationError(
      `ghl_${input.environment}_inbound_eligible_route_lookup_failed`,
      error.message,
    );
  }
  const routes = rows(data);
  const formIds = [...new Set(routes.map((route) => text(route.provider_form_id)).filter(Boolean))].sort();
  const allowedIds = [...new Set(routes.flatMap((route) => stringArray(route.allowed_field_ids)))].sort();
  if (
    routes.some((route) => {
      const formId = text(route.provider_form_id);
      const fieldIds = route.allowed_field_ids;
      return !/^[A-Za-z0-9_-]{3,180}$/.test(formId)
        || !Array.isArray(fieldIds)
        || fieldIds.some((id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{3,180}$/.test(id.trim()));
    })
    || formIds.length !== routes.length
    || allowedIds.length > 125
    || allowedIds.some((id) => !/^[A-Za-z0-9_-]{3,180}$/.test(id))
  ) {
    throw new GhlInboundFormReconciliationError(
      `ghl_${input.environment}_inbound_eligible_route_invalid`,
      "The eligible GHL form route scope is malformed, duplicated, or unbounded.",
      "operator_action_required",
    );
  }
  if (formIds.length === 0 || formIds.length > 25) {
    throw new GhlInboundFormReconciliationError(
      formIds.length === 0
        ? `ghl_${input.environment}_inbound_ready_forms_missing`
        : `ghl_${input.environment}_inbound_ready_forms_unbounded`,
      formIds.length === 0
        ? "No exact ready GHL campaign forms are available for reconciliation."
        : "The exact GHL campaign form scope exceeds the bounded reconciliation limit.",
      "operator_action_required",
    );
  }
  return { formIds, allowedFieldIds: allowedIds };
}

async function unseenSubmissions(input: {
  client: GhlInboundFormReconciliationClient;
  organizationId: string;
  mappingId: string;
  submissions: GhlInboundFormSubmission[];
}) {
  if (input.submissions.length === 0) return [];
  const submissionIds = input.submissions.map((submission) => submission.providerSubmissionId);
  const { data, error } = await (input.client as any)
    .from("ghl_inbound_form_submission_bindings")
    .select("id,organization_id,location_mapping_id,provider_submission_id,submission_fingerprint")
    .eq("organization_id", input.organizationId)
    .eq("location_mapping_id", input.mappingId)
    .in("provider_submission_id", submissionIds);
  if (error) {
    throw new GhlInboundFormReconciliationError(
      "ghl_inbound_submission_binding_lookup_failed",
      error.message,
    );
  }
  const bound = new Map(
    rows(data).map((binding) => [
      text(binding.provider_submission_id),
      text(binding.submission_fingerprint),
    ]),
  );
  for (const submission of input.submissions) {
    const boundFingerprint = bound.get(submission.providerSubmissionId);
    if (boundFingerprint && boundFingerprint !== submission.submissionFingerprint) {
      throw new GhlInboundFormReconciliationError(
        "ghl_inbound_submission_binding_fingerprint_conflict",
        "A stable GHL submission identity conflicts with its append-only binding.",
        "operator_action_required",
      );
    }
  }
  return input.submissions
    .filter((submission) => !bound.has(submission.providerSubmissionId))
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt)
      || left.providerSubmissionId.localeCompare(right.providerSubmissionId));
}

type ClaimedReconciliation = {
  id: string;
  organizationId: string;
  mappingId: string;
  providerLocationId: string;
  providerContactId: string;
  windowStart: string;
  windowEnd: string;
  attemptCount: number;
  leaseToken: string;
  leaseGeneration: number;
};

function claimedReconciliation(value: JsonRecord): ClaimedReconciliation {
  const claimed: ClaimedReconciliation = {
    id: text(value.id),
    organizationId: text(value.organization_id),
    mappingId: text(value.location_mapping_id),
    providerLocationId: text(value.provider_location_id),
    providerContactId: text(value.provider_contact_id),
    windowStart: timestamp(value.reconciliation_window_start),
    windowEnd: timestamp(value.reconciliation_window_end),
    attemptCount: positiveInteger(value.attempt_count),
    leaseToken: text(value.lease_token),
    leaseGeneration: positiveInteger(value.lease_generation),
  };
  const windowMs = Date.parse(claimed.windowEnd) - Date.parse(claimed.windowStart);
  if (
    Object.entries(claimed).some(([key, item]) =>
      key !== "attemptCount" && key !== "leaseGeneration" && typeof item === "string" && !item
    )
    || claimed.attemptCount === 0
    || claimed.leaseGeneration === 0
    || !Number.isFinite(windowMs)
    || windowMs < 0
    || windowMs > 48 * 60 * 60 * 1_000
  ) {
    throw new GhlInboundFormReconciliationError(
      "ghl_inbound_reconciliation_claim_invalid",
      "The claimed GHL inbound reconciliation identity is incomplete or unbounded.",
    );
  }
  return claimed;
}

async function settle(input: {
  dependencies: GhlInboundFormReconciliationDependencies;
  claimed: ClaimedReconciliation;
  outcome: "retryable_failure" | "operator_action_required";
  errorCode: string;
  safeMessage: string;
  retryAfterMs: number | null;
  providerRequestId: string | null;
  responseFingerprint: string | null;
}) {
  const { data, error } = await input.dependencies.client.rpc(
    "settle_ghl_inbound_form_reconciliation_v1",
    {
      p_reconciliation_id: input.claimed.id,
      p_worker_id: input.dependencies.workerId?.trim() || `ghl-${input.dependencies.environment}-inbound-forms`,
      p_lease_token: input.claimed.leaseToken,
      p_lease_generation: input.claimed.leaseGeneration,
      p_outcome: input.outcome,
      p_error_code: input.errorCode,
      p_error_message: input.safeMessage,
      p_retry_after_ms: input.retryAfterMs,
      p_provider_request_id: input.providerRequestId,
      p_response_fingerprint: input.responseFingerprint,
      p_now: input.dependencies.now?.() ?? new Date().toISOString(),
    },
  );
  const settled = firstRow(data);
  if (error || !settled) {
    throw new GhlInboundFormReconciliationError(
      "ghl_inbound_reconciliation_settlement_failed",
      error?.message ?? "The GHL inbound reconciliation lease was lost before settlement.",
    );
  }
  return settled;
}

async function completeWithoutSubmission(input: {
  dependencies: GhlInboundFormReconciliationDependencies;
  claimed: ClaimedReconciliation;
  providerRequestId: string | null;
  responseFingerprint: string;
}) {
  const { data, error } = await input.dependencies.client.rpc(
    "complete_ghl_inbound_form_reconciliation_without_submission_v1",
    {
      p_reconciliation_id: input.claimed.id,
      p_worker_id: input.dependencies.workerId?.trim() || `ghl-${input.dependencies.environment}-inbound-forms`,
      p_lease_token: input.claimed.leaseToken,
      p_lease_generation: input.claimed.leaseGeneration,
      p_provider_request_id: input.providerRequestId,
      p_response_fingerprint: input.responseFingerprint,
      p_now: input.dependencies.now?.() ?? new Date().toISOString(),
    },
  );
  const completed = firstRow(data);
  if (error || !completed) {
    throw new GhlInboundFormReconciliationError(
      "ghl_inbound_reconciliation_empty_completion_failed",
      error?.message ?? "The empty GHL reconciliation lease was lost before terminalization.",
    );
  }
  return completed;
}

async function applySubmission(input: {
  dependencies: GhlInboundFormReconciliationDependencies;
  claimed: ClaimedReconciliation;
  submission: GhlInboundFormSubmission;
  providerRequestId: string | null;
  responseFingerprint: string;
  hasMoreUnseen: boolean;
}) {
  const phoneRaw = input.submission.phone;
  const phoneE164 = normalizePhone(phoneRaw);
  const { data, error } = await input.dependencies.client.rpc(
    "apply_ghl_inbound_form_submission_v1",
    {
      p_reconciliation_id: input.claimed.id,
      p_worker_id: input.dependencies.workerId?.trim() || `ghl-${input.dependencies.environment}-inbound-forms`,
      p_lease_token: input.claimed.leaseToken,
      p_lease_generation: input.claimed.leaseGeneration,
      p_provider_submission_id: input.submission.providerSubmissionId,
      p_provider_form_id: input.submission.providerFormId,
      p_provider_contact_id: input.submission.providerContactId,
      p_submitted_at: input.submission.submittedAt,
      p_name: input.submission.name,
      p_first_name: input.submission.firstName,
      p_last_name: input.submission.lastName,
      p_email: normalizedEmail(input.submission.email),
      p_phone: phoneE164,
      p_phone_raw: phoneRaw,
      p_qualification: input.submission.qualification,
      p_attribution: input.submission.attribution,
      p_submission_fingerprint: input.submission.submissionFingerprint,
      p_has_more_unseen: input.hasMoreUnseen,
      p_provider_request_id: input.providerRequestId,
      p_response_fingerprint: input.responseFingerprint,
      p_now: input.dependencies.now?.() ?? new Date().toISOString(),
    },
  );
  const applied = firstRow(data);
  if (error || !applied) {
    throw new GhlInboundFormReconciliationError(
      "ghl_inbound_form_submission_apply_failed",
      error?.message ?? "The GHL inbound form submission lease was lost before application.",
    );
  }
  return applied;
}

async function resolveAuthority(input: {
  dependencies: GhlInboundFormReconciliationDependencies;
  claimed: ClaimedReconciliation;
}) {
  const canonical = input.dependencies.environment === "production"
    ? await resolveGhlProductionAuthority({
        client: input.dependencies.client,
        organizationId: input.claimed.organizationId,
        gate: input.dependencies.productionGate!,
      })
    : await resolveGhlSandboxAuthority({
        client: input.dependencies.client,
        organizationId: input.claimed.organizationId,
        gate: input.dependencies.sandboxGate!,
      });
  if (
    !canonical
    || canonical.mappingId !== input.claimed.mappingId
    || canonical.providerLocationId !== input.claimed.providerLocationId
  ) {
    throw new GhlSandboxAuthorityError(
      `ghl_${input.dependencies.environment}_inbound_mapping_authority_changed`,
      "The canonical GHL mapping changed after inbound reconciliation was queued.",
    );
  }
  return resolveGhlInboundFormsReadAuthority({
    client: input.dependencies.client,
    authority: canonical,
  });
}

export async function processGhlInboundFormReconciliationBatch(
  dependencies: GhlInboundFormReconciliationDependencies,
) {
  if (dependencies.environment === "production") {
    if (!dependencies.productionGate || dependencies.productionGate.operation !== "lifecycle_webhook") {
      throw new Error("GHL production inbound-form reconciliation requires a lifecycle-webhook-scoped gate.");
    }
    assertGhlProductionAllowed(dependencies.productionGate);
  } else {
    if (!dependencies.sandboxGate) throw new Error("GHL sandbox inbound-form reconciliation gate is missing.");
    assertGhlSandboxAllowed(dependencies.sandboxGate);
  }

  const maxItems = Math.min(Math.max(dependencies.maxItems ?? 10, 1), 25);
  const workerId = dependencies.workerId?.trim() || `ghl-${dependencies.environment}-inbound-forms`;
  const leaseMs = Math.min(Math.max(dependencies.leaseMs ?? 300_000, 30_000), 600_000);
  const results: Array<{
    id: string;
    outcome: string;
    errorCode: string | null;
    providerMutationAttempted: false;
  }> = [];

  for (let index = 0; index < maxItems; index += 1) {
    const now = dependencies.now?.() ?? new Date().toISOString();
    const claim = await dependencies.client.rpc("claim_next_ghl_inbound_form_reconciliation_v1", {
      p_environment: dependencies.environment,
      p_worker_id: workerId,
      p_now: now,
      p_lease_ms: leaseMs,
    });
    if (claim.error) {
      throw new GhlInboundFormReconciliationError(
        "ghl_inbound_reconciliation_claim_failed",
        claim.error.message,
      );
    }
    const claimedRow = firstRow(claim.data);
    if (!claimedRow) break;
    const claimed = claimedReconciliation(claimedRow);

    try {
      if (!await runtimeControlOpen({
        client: dependencies.client,
        environment: dependencies.environment,
      })) {
        const settled = await settle({
          dependencies: { ...dependencies, workerId },
          claimed,
          outcome: "retryable_failure",
          errorCode: `ghl_${dependencies.environment}_inbound_runtime_control_closed`,
          safeMessage: "The GHL inbound form-reconciliation database kill switch closed after claim.",
          retryAfterMs: retryDelayMs(claimed.attemptCount),
          providerRequestId: null,
          responseFingerprint: null,
        });
        results.push({
          id: claimed.id,
          outcome: text(settled.status) || "retryable_failure",
          errorCode: text(settled.last_error_code) || `ghl_${dependencies.environment}_inbound_runtime_control_closed`,
          providerMutationAttempted: false,
        });
        continue;
      }

      const authority = await resolveAuthority({ dependencies, claimed });
      const readyForms = await readyFormIds({
        client: dependencies.client,
        environment: dependencies.environment,
        organizationId: claimed.organizationId,
        mappingId: claimed.mappingId,
      });

      // Fence a kill-switch flip immediately before the first provider read.
      if (!await runtimeControlOpen({
        client: dependencies.client,
        environment: dependencies.environment,
      })) {
        const settled = await settle({
          dependencies: { ...dependencies, workerId },
          claimed,
          outcome: "retryable_failure",
          errorCode: `ghl_${dependencies.environment}_inbound_runtime_control_closed`,
          safeMessage: "The GHL inbound form-reconciliation database kill switch closed before provider read.",
          retryAfterMs: retryDelayMs(claimed.attemptCount),
          providerRequestId: null,
          responseFingerprint: null,
        });
        results.push({
          id: claimed.id,
          outcome: text(settled.status) || "retryable_failure",
          errorCode: text(settled.last_error_code) || `ghl_${dependencies.environment}_inbound_runtime_control_closed`,
          providerMutationAttempted: false,
        });
        continue;
      }

      const provider = dependencies.providerFactory(authority);
      const read = await provider.readFormSubmissions({
        providerLocationId: authority.providerLocationId,
        providerContactId: claimed.providerContactId,
        requiredFormIds: readyForms.formIds,
        allowedFieldIds: readyForms.allowedFieldIds,
        windowStart: claimed.windowStart,
        windowEnd: claimed.windowEnd,
        limitPerForm: 20,
      });
      if (read.providerMutationAttempted !== false) {
        throw new GhlInboundFormReconciliationError(
          "ghl_inbound_provider_read_mutation_invariant_failed",
          "The GHL inbound provider adapter violated its GET-only contract.",
          "operator_action_required",
        );
      }
      if (read.outcome !== "succeeded") {
        const settled = await settle({
          dependencies: { ...dependencies, workerId },
          claimed,
          outcome: read.outcome,
          errorCode: read.errorCode,
          safeMessage: read.safeMessage,
          retryAfterMs: read.outcome === "retryable_failure"
            ? retryDelayMs(claimed.attemptCount, read.retryAfterMs)
            : null,
          providerRequestId: read.providerRequestId,
          responseFingerprint: read.responseFingerprint,
        });
        results.push({
          id: claimed.id,
          outcome: text(settled.status) || read.outcome,
          errorCode: text(settled.last_error_code) || read.errorCode,
          providerMutationAttempted: false,
        });
        continue;
      }

      const providerRequestId = latestProviderRequestId(read.providerRequestIds);
      const unseen = await unseenSubmissions({
        client: dependencies.client,
        organizationId: claimed.organizationId,
        mappingId: claimed.mappingId,
        submissions: read.submissions,
      });
      if (unseen.length === 0) {
        if (claimed.attemptCount < 2) {
          const settled = await settle({
            dependencies: { ...dependencies, workerId },
            claimed,
            outcome: "retryable_failure",
            errorCode: "ghl_form_submission_not_observed",
            safeMessage: "No exact unseen GHL form submission was observed in the first bounded read.",
            retryAfterMs: retryDelayMs(claimed.attemptCount),
            providerRequestId,
            responseFingerprint: read.responseFingerprint,
          });
          results.push({
            id: claimed.id,
            outcome: text(settled.status) || "retryable_failure",
            errorCode: text(settled.last_error_code) || "ghl_form_submission_not_observed",
            providerMutationAttempted: false,
          });
        } else {
          const completed = await completeWithoutSubmission({
            dependencies: { ...dependencies, workerId },
            claimed,
            providerRequestId,
            responseFingerprint: read.responseFingerprint,
          });
          results.push({
            id: claimed.id,
            outcome: text(completed.status) || text(completed.projection_status) || "completed",
            errorCode: text(completed.last_error_code) || null,
            providerMutationAttempted: false,
          });
        }
        continue;
      }

      let applied: JsonRecord = {};
      for (let submissionIndex = 0; submissionIndex < unseen.length; submissionIndex += 1) {
        const hasMoreUnseen = submissionIndex < unseen.length - 1;
        applied = await applySubmission({
          dependencies: { ...dependencies, workerId },
          claimed,
          submission: unseen[submissionIndex],
          providerRequestId,
          responseFingerprint: read.responseFingerprint,
          hasMoreUnseen,
        });
        const status = text(applied.status);
        if (hasMoreUnseen && status !== "processing") {
          // The SQL function may terminalize an unsafe submission as operator
          // action. Never apply later submissions after that terminal result.
          break;
        }
      }
      results.push({
        id: claimed.id,
        outcome: text(applied.status) || text(applied.projection_status) || "completed",
        errorCode: text(applied.last_error_code) || null,
        providerMutationAttempted: false,
      });
    } catch (error) {
      const code = error instanceof GhlSandboxAuthorityError || error instanceof GhlInboundFormReconciliationError
        ? error.code
        : `ghl_${dependencies.environment}_inbound_reconciliation_unexpected`;
      const disposition = error instanceof GhlSandboxAuthorityError
        ? "operator_action_required"
        : error instanceof GhlInboundFormReconciliationError
          ? error.disposition
          : "retryable_failure";
      const safeMessage = error instanceof GhlSandboxAuthorityError
        ? error.message
        : "The bounded GHL inbound reconciliation could not be completed safely.";
      const settled = await settle({
        dependencies: { ...dependencies, workerId },
        claimed,
        outcome: disposition,
        errorCode: code,
        safeMessage,
        retryAfterMs: disposition === "operator_action_required" ? null : retryDelayMs(claimed.attemptCount),
        providerRequestId: null,
        responseFingerprint: null,
      });
      results.push({
        id: claimed.id,
        outcome: text(settled.status) || disposition,
        errorCode: text(settled.last_error_code) || code,
        providerMutationAttempted: false,
      });
    }
  }

  const outcomeCounts = results.reduce<Record<string, number>>((counts, result) => {
    counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
    return counts;
  }, {});
  const operatorActionCodes = [...new Set(
    results
      .filter((result) => result.outcome === "operator_action_required" && result.errorCode)
      .map((result) => result.errorCode as string),
  )].sort();

  return {
    status: "complete" as const,
    processed: results.length,
    providerMutationAttempted: false as const,
    summary: { outcomeCounts, operatorActionCodes },
    results,
  };
}
