import { assertGhlFakeWritesAllowed } from "../integrations/gohighlevel";

type JsonRecord = Record<string, unknown>;
export type GhlFakeLeadOutboxClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
};

export type GhlFakeOnlyExecutionGate = {
  enabled: boolean;
  nodeEnv: string | undefined;
  isolatedDatabase: boolean;
  databaseUrl: string;
};

export type GhlFakeLeadOutboxDependencies = {
  client: GhlFakeLeadOutboxClient;
  gate: GhlFakeOnlyExecutionGate;
  now?: () => string;
  workerId?: string;
  leaseMs?: number;
};

export class GhlFakeLeadOutboxError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GhlFakeLeadOutboxError";
    this.code = code;
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown) {
  const valueAsString = asString(value);
  return valueAsString || null;
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function firstRow(value: unknown) {
  return rows(value)[0] ?? null;
}

function assertFakeOnlyExecution(gate: GhlFakeOnlyExecutionGate) {
  if (process.env.NODE_ENV === "production" || gate.nodeEnv === "production") {
    throw new GhlFakeLeadOutboxError(
      "ghl_fake_worker_forbidden_in_production",
      "The deterministic GHL fake worker is categorically disabled in production.",
    );
  }
  if (gate.isolatedDatabase !== true) {
    throw new GhlFakeLeadOutboxError(
      "ghl_fake_worker_isolated_database_required",
      "The deterministic GHL fake worker requires an explicit isolated-database attestation.",
    );
  }
  let databaseHostname = "";
  try {
    databaseHostname = new URL(gate.databaseUrl).hostname.toLowerCase();
  } catch {
    databaseHostname = "";
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(databaseHostname)) {
    throw new GhlFakeLeadOutboxError(
      "ghl_fake_worker_loopback_database_required",
      "The deterministic GHL fake worker accepts only an explicitly attested loopback database target.",
    );
  }

  assertGhlFakeWritesAllowed({
    enabled: gate.enabled,
    adapterKind: "fake",
    networkAccess: "none",
  });
}

function getClient(dependencies: GhlFakeLeadOutboxDependencies) {
  return dependencies.client;
}

function throwRpcError(
  error: { message: string; code?: string } | null,
  code: string,
): never {
  throw new GhlFakeLeadOutboxError(code, error?.message ?? "Unknown GHL fake outbox error.");
}

function nowFrom(dependencies: GhlFakeLeadOutboxDependencies) {
  return dependencies.now?.() ?? new Date().toISOString();
}

export async function enqueueGhlFakeLeadEffects(
  params: { organizationId: string; leadId: string },
  dependencies: GhlFakeLeadOutboxDependencies,
) {
  assertFakeOnlyExecution(dependencies.gate);
  const { data, error } = await getClient(dependencies).rpc("enqueue_ghl_fake_lead_effects", {
    p_organization_id: params.organizationId,
    p_lead_id: params.leadId,
    p_environment: "test",
    p_now: nowFrom(dependencies),
  });
  if (error) {
    throwRpcError(error, "ghl_fake_lead_effect_enqueue_failed");
  }

  const events = rows(data);
  return {
    status: events.length > 0 ? "queued" as const : "mapping_not_ready" as const,
    eventIds: events.map((event) => asString(event.id)).filter(Boolean),
    queuedCount: events.length,
    providerMutationAttempted: false,
    providerNetworkAccess: "none" as const,
  };
}

export async function processNextGhlFakeLeadOutbox(
  dependencies: GhlFakeLeadOutboxDependencies,
) {
  assertFakeOnlyExecution(dependencies.gate);
  const client = getClient(dependencies);
  const receivedAt = nowFrom(dependencies);
  const workerId = dependencies.workerId?.trim() || "ghl-fake-lead-worker";
  const { data: claimedData, error: claimError } = await client.rpc(
    "claim_next_ghl_fake_lead_outbox",
    {
      p_worker_id: workerId,
      p_now: receivedAt,
      p_lease_ms: dependencies.leaseMs ?? 300_000,
    },
  );
  if (claimError) {
    throwRpcError(claimError, "ghl_fake_lead_outbox_claim_failed");
  }

  const claimed = firstRow(claimedData);
  if (!claimed) {
    return {
      status: "idle" as const,
      providerMutationAttempted: false,
      providerNetworkAccess: "none" as const,
    };
  }

  const outboxId = asString(claimed.id);
  const organizationId = asString(claimed.organization_id);
  const operation = asString(claimed.operation);
  const leaseToken = asString(claimed.lease_token);
  const leaseGeneration = Number(claimed.lease_generation ?? 0);
  if (!outboxId || !organizationId || !leaseToken || leaseGeneration < 1) {
    throw new GhlFakeLeadOutboxError(
      "ghl_fake_lead_outbox_lease_missing",
      "Claimed fake GHL lead outbox row is missing its tenant or fencing lease.",
    );
  }

  const providerReference = `fake-ghl-object:${operation}:${outboxId}`;
  const providerRequestId = `fake-ghl-request:${outboxId}:${leaseGeneration}`;
  const { data: settledData, error: settleError } = await client.rpc(
    "settle_ghl_provider_outbox",
    {
      p_outbox_id: outboxId,
      p_organization_id: organizationId,
      p_worker_id: workerId,
      p_lease_token: leaseToken,
      p_lease_generation: leaseGeneration,
      p_received_at: receivedAt,
      p_receipt_outcome: "succeeded",
      p_provider_request_id: providerRequestId,
      p_provider_reference: providerReference,
      p_http_status: 200,
      p_response_fingerprint: "deterministic-fake-no-network-v1",
      p_receipt_metadata: {
        fake_provider: true,
        provider_network_access: "none",
        provider_mutation_attempted: false,
      },
      p_outbox_status: "succeeded",
      p_available_at: receivedAt,
      p_last_error_code: null,
    },
  );
  if (settleError) {
    throwRpcError(settleError, "ghl_fake_lead_outbox_settlement_failed");
  }
  if (!firstRow(settledData)) {
    throw new GhlFakeLeadOutboxError(
      "ghl_fake_lead_outbox_lease_lost",
      "The fake GHL lead outbox lease was superseded before settlement.",
    );
  }

  return {
    status: "succeeded" as const,
    outboxId,
    organizationId,
    operation,
    providerRequestId,
    providerReference: asNullableString(providerReference),
    leaseGeneration,
    providerMutationAttempted: false,
    providerNetworkAccess: "none" as const,
  };
}

export async function processGhlFakeLeadOutboxBatch(
  input: { maxItems?: number },
  dependencies: GhlFakeLeadOutboxDependencies,
) {
  const maxItems = Math.min(Math.max(input.maxItems ?? 25, 1), 100);
  const processedOutboxIds: string[] = [];

  for (let index = 0; index < maxItems; index += 1) {
    const result = await processNextGhlFakeLeadOutbox(dependencies);
    if (result.status === "idle") {
      return {
        status: "complete" as const,
        processedOutboxIds,
        exhausted: false,
        providerMutationAttempted: false,
        providerNetworkAccess: "none" as const,
      };
    }
    processedOutboxIds.push(result.outboxId);
  }

  return {
    status: "complete" as const,
    processedOutboxIds,
    exhausted: true,
    providerMutationAttempted: false,
    providerNetworkAccess: "none" as const,
  };
}
