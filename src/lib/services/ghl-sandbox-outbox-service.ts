import {
  assertGhlSandboxAllowed,
  type GhlLeadIdentity,
  type GhlLeadProviderAdapter,
  type GhlLeadProviderResult,
  type GhlSandboxGateInput,
} from "../integrations/gohighlevel";
import {
  requiredGhlProviderObject,
  resolveGhlSandboxAuthority,
  type GhlSandboxAuthority,
} from "./ghl-sandbox-authority-service";

type JsonRecord = Record<string, unknown>;
type RpcResult = Promise<{ data: unknown; error: { message: string } | null }>;

export type GhlSandboxOutboxClient = {
  from: (table: string) => { select: (columns: string) => any };
  rpc: (name: string, params: Record<string, unknown>) => RpcResult;
};

export type GhlSandboxOutboxDependencies = {
  client: GhlSandboxOutboxClient;
  gate: GhlSandboxGateInput;
  providerFactory: (authority: GhlSandboxAuthority) => GhlLeadProviderAdapter;
  workerId?: string;
  leaseMs?: number;
  now?: () => string;
};

export class GhlSandboxOutboxError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GhlSandboxOutboxError";
    this.code = code;
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function maybeOne(query: any, code: string) {
  const { data, error } = await query.maybeSingle() as { data: unknown; error: { message: string } | null };
  if (error) throw new GhlSandboxOutboxError(code, error.message);
  return data ? asRecord(data) : null;
}

function providerFailure(input: {
  outcome: "operator_action_required" | "retryable_failure" | "uncertain";
  errorCode: string;
  safeMessage: string;
}): Exclude<GhlLeadProviderResult, { outcome: "succeeded" }> {
  return {
    ...input,
    providerRequestId: null,
    httpStatus: null,
    responseFingerprint: null,
  };
}

function retryAt(now: string, attemptCount: number, retryAfterMs?: number) {
  const boundedBackoff = retryAfterMs ?? Math.min(30_000 * (2 ** Math.max(attemptCount - 1, 0)), 900_000);
  return new Date(Date.parse(now) + boundedBackoff).toISOString();
}

async function settle(input: {
  dependencies: GhlSandboxOutboxDependencies;
  claimed: JsonRecord;
  result: GhlLeadProviderResult;
  providerMutationAttempted: boolean;
}) {
  const now = input.dependencies.now?.() ?? new Date().toISOString();
  const status = input.result.outcome === "succeeded"
    ? "succeeded"
    : input.result.outcome;
  const providerReference = input.result.outcome === "succeeded"
    ? input.result.providerReference
    : null;
  const availableAt = input.result.outcome === "retryable_failure"
    ? retryAt(now, Number(input.claimed.attempt_count ?? 1), input.result.retryAfterMs)
    : now;
  const { data, error } = await input.dependencies.client.rpc("settle_ghl_provider_outbox", {
    p_outbox_id: stringValue(input.claimed.id),
    p_organization_id: stringValue(input.claimed.organization_id),
    p_worker_id: stringValue(input.claimed.locked_by),
    p_lease_token: stringValue(input.claimed.lease_token),
    p_lease_generation: Number(input.claimed.lease_generation ?? 0),
    p_received_at: now,
    p_receipt_outcome: input.result.outcome,
    p_provider_request_id: input.result.providerRequestId,
    p_provider_reference: providerReference,
    p_http_status: input.result.httpStatus,
    p_response_fingerprint: input.result.responseFingerprint,
    p_receipt_metadata: {
      provider_mode: "sandbox",
      provider_network_access: "https",
      provider_mutation_attempted: input.providerMutationAttempted,
    },
    p_outbox_status: status,
    p_available_at: availableAt,
    p_last_error_code: input.result.outcome === "succeeded" ? null : input.result.errorCode,
  });
  if (error || rows(data).length !== 1) {
    throw new GhlSandboxOutboxError(
      "ghl_sandbox_outbox_settlement_failed",
      error?.message ?? "The GHL sandbox outbox lease was lost before settlement.",
    );
  }
  return { status, availableAt, providerReference };
}

async function executeClaimedEffect(
  claimed: JsonRecord,
  dependencies: GhlSandboxOutboxDependencies,
) {
  const payload = asRecord(claimed.request_payload);
  const organizationId = stringValue(claimed.organization_id);
  const leadId = stringValue(payload.lead_id);
  const mappingId = stringValue(payload.location_mapping_id);
  const effectKind = stringValue(payload.effect_kind);
  const idempotencyKey = stringValue(claimed.idempotency_key);
  if (
    payload.provider_mode !== "sandbox"
    || !organizationId
    || !leadId
    || !mappingId
    || !effectKind
    || !idempotencyKey
  ) {
    return {
      result: providerFailure({
        outcome: "operator_action_required",
        errorCode: "ghl_sandbox_outbox_contract_invalid",
        safeMessage: "The claimed GHL sandbox outbox contract is incomplete.",
      }),
      providerMutationAttempted: false,
    };
  }

  const authority = await resolveGhlSandboxAuthority({
    client: dependencies.client,
    organizationId,
    gate: dependencies.gate,
  });
  if (!authority || authority.mappingId !== mappingId) {
    return {
      result: providerFailure({
        outcome: "operator_action_required",
        errorCode: "ghl_sandbox_mapping_authority_changed",
        safeMessage: "The canonical GHL sandbox mapping changed after this effect was queued.",
      }),
      providerMutationAttempted: false,
    };
  }
  const lead = await maybeOne(
    dependencies.client.from("leads")
      .select("id,organization_id,first_name,last_name,name,email,phone,source")
      .eq("id", leadId)
      .eq("organization_id", organizationId),
    "ghl_sandbox_lead_lookup_failed",
  );
  if (!lead) {
    return {
      result: providerFailure({
        outcome: "operator_action_required",
        errorCode: "ghl_sandbox_lead_missing",
        safeMessage: "The canonical lead no longer exists in the expected tenant.",
      }),
      providerMutationAttempted: false,
    };
  }
  const leadIdentity: GhlLeadIdentity = {
    id: leadId,
    organizationId,
    firstName: stringValue(lead.first_name) || null,
    lastName: stringValue(lead.last_name) || null,
    name: stringValue(lead.name) || null,
    email: stringValue(lead.email) || null,
    phone: stringValue(lead.phone) || null,
    source: stringValue(lead.source) || null,
  };
  const provider = dependencies.providerFactory(authority);

  if (effectKind === "contact_upsert") {
    const result = await provider.upsertContact({
      idempotencyKey,
      providerLocationId: authority.providerLocationId,
      lead: leadIdentity,
    });
    return {
      result,
      providerMutationAttempted: result.providerMutationAttempted ?? true,
    };
  }

  const contactEffect = await maybeOne(
    dependencies.client.from("ghl_lead_effect_events")
      .select("provider_contact_id,status")
      .eq("organization_id", organizationId)
      .eq("lead_id", leadId)
      .eq("location_mapping_id", mappingId)
      .eq("effect_kind", "contact_upsert")
      .eq("status", "succeeded"),
    "ghl_sandbox_contact_receipt_lookup_failed",
  );
  const providerContactId = stringValue(contactEffect?.provider_contact_id);
  if (!providerContactId) {
    return {
      result: providerFailure({
        outcome: "retryable_failure",
        errorCode: "ghl_sandbox_contact_dependency_pending",
        safeMessage: "The GHL contact receipt must succeed before dependent effects run.",
      }),
      providerMutationAttempted: false,
    };
  }

  if (effectKind === "opportunity_upsert") {
    const pipelineId = requiredGhlProviderObject(authority, "pipeline");
    const stageId = requiredGhlProviderObject(authority, "stage");
    if (!pipelineId || !stageId) {
      return {
        result: providerFailure({
          outcome: "operator_action_required",
          errorCode: "ghl_sandbox_opportunity_manifest_ids_missing",
          safeMessage: "The approved GHL manifest lacks exact pipeline or stage provider ids.",
        }),
        providerMutationAttempted: false,
      };
    }
    const result = await provider.upsertOpportunity({
        idempotencyKey,
        providerLocationId: authority.providerLocationId,
        providerContactId,
        pipelineId,
        stageId,
        opportunityName: leadIdentity.name || "DealFlow lead",
      });
    return { result, providerMutationAttempted: result.providerMutationAttempted ?? true };
  }
  if (effectKind === "tag_apply") {
    const tag = requiredGhlProviderObject(authority, "tag");
    if (!tag) {
      return {
        result: providerFailure({
          outcome: "operator_action_required",
          errorCode: "ghl_sandbox_tag_manifest_missing",
          safeMessage: "The approved GHL manifest lacks the required lead tag.",
        }),
        providerMutationAttempted: false,
      };
    }
    const result = await provider.applyTag({
        idempotencyKey,
        providerLocationId: authority.providerLocationId,
        providerContactId,
        tag,
      });
    return { result, providerMutationAttempted: result.providerMutationAttempted ?? true };
  }
  if (effectKind === "workflow_enroll") {
    const workflowId = requiredGhlProviderObject(authority, "workflow");
    if (!workflowId) {
      return {
        result: providerFailure({
          outcome: "operator_action_required",
          errorCode: "ghl_sandbox_workflow_manifest_id_missing",
          safeMessage: "The approved GHL manifest lacks the exact workflow provider id.",
        }),
        providerMutationAttempted: false,
      };
    }
    const result = await provider.enrollWorkflow({
        idempotencyKey,
        providerLocationId: authority.providerLocationId,
        providerContactId,
        workflowId,
      });
    return { result, providerMutationAttempted: result.providerMutationAttempted ?? true };
  }
  return {
    result: providerFailure({
      outcome: "operator_action_required",
      errorCode: "ghl_sandbox_effect_kind_unsupported",
      safeMessage: "The claimed GHL sandbox effect kind is not supported.",
    }),
    providerMutationAttempted: false,
  };
}

export async function processNextGhlSandboxOutbox(
  dependencies: GhlSandboxOutboxDependencies,
) {
  assertGhlSandboxAllowed(dependencies.gate);
  const workerId = dependencies.workerId?.trim() || "ghl-sandbox-worker";
  const now = dependencies.now?.() ?? new Date().toISOString();
  const { data, error } = await dependencies.client.rpc("claim_next_ghl_sandbox_lead_outbox", {
    p_worker_id: workerId,
    p_now: now,
    p_lease_ms: dependencies.leaseMs ?? 300_000,
  });
  if (error) throw new GhlSandboxOutboxError("ghl_sandbox_outbox_claim_failed", error.message);
  const claimed = rows(data)[0] ?? null;
  if (!claimed) return { status: "idle" as const, providerMutationAttempted: false };

  let execution: Awaited<ReturnType<typeof executeClaimedEffect>>;
  try {
    execution = await executeClaimedEffect(claimed, dependencies);
  } catch (error) {
    execution = {
      result: providerFailure({
        outcome: "operator_action_required",
        errorCode: error instanceof GhlSandboxOutboxError ? error.code : "ghl_sandbox_worker_failed",
        safeMessage: "The GHL sandbox worker failed before a safe provider result was available.",
      }),
      providerMutationAttempted: false,
    };
  }
  const settlement = await settle({ dependencies, claimed, ...execution });
  return {
    status: settlement.status,
    outboxId: stringValue(claimed.id),
    organizationId: stringValue(claimed.organization_id),
    operation: stringValue(claimed.operation),
    providerReference: settlement.providerReference,
    providerMutationAttempted: execution.providerMutationAttempted,
  };
}

export async function processGhlSandboxOutboxBatch(
  input: { maxItems?: number },
  dependencies: GhlSandboxOutboxDependencies,
) {
  const maxItems = Math.min(Math.max(input.maxItems ?? 25, 1), 50);
  const results = [];
  for (let index = 0; index < maxItems; index += 1) {
    const result = await processNextGhlSandboxOutbox(dependencies);
    if (result.status === "idle") break;
    results.push(result);
  }
  return { status: "complete" as const, processed: results.length, results };
}
