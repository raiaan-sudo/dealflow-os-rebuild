import type {
  GhlLocationAssignment,
  GhlOperatorRequest,
  GhlProviderOutboxRecord,
  GhlProviderReceipt,
  GhlProvisioningRepository,
  GhlProvisioningRun,
  GhlTenantBinding,
} from "./types";

export class GhlMemoryRepositoryInvariantError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GhlMemoryRepositoryInvariantError";
    this.code = code;
  }
}

function sameProvisioningIdentity(
  run: GhlProvisioningRun,
  input: Parameters<GhlProvisioningRepository["getOrCreateRun"]>[0],
) {
  return run.organizationId === input.request.organizationId
    && run.environment === input.request.environment
    && run.activationEventId === input.request.activationEventId
    && run.installationId === input.request.installationId
    && JSON.stringify(run.snapshotManifest) === JSON.stringify(input.request.snapshotManifest)
    && JSON.stringify(run.locationProfile) === JSON.stringify(input.request.locationProfile);
}

export class MemoryGhlProvisioningRepository implements GhlProvisioningRepository {
  private sequence = 0;
  private readonly tenants = new Map<string, GhlTenantBinding>();
  private readonly runs = new Map<string, GhlProvisioningRun>();
  private readonly runIdsByIdempotency = new Map<string, string>();
  private readonly outbox = new Map<string, GhlProviderOutboxRecord>();
  private readonly outboxIdsByIdempotency = new Map<string, string>();
  private readonly receipts = new Map<string, GhlProviderReceipt>();
  private readonly mappings = new Map<string, GhlLocationAssignment>();
  private readonly operatorRequests = new Map<string, GhlOperatorRequest>();

  constructor(bindings: GhlTenantBinding[]) {
    for (const binding of bindings) {
      if (
        (binding.tenantKind === "direct_realtor" && binding.partnerId !== null)
        || (binding.tenantKind === "partner_child" && !binding.partnerId)
      ) {
        throw new GhlMemoryRepositoryInvariantError(
          "invalid_tenant_hierarchy",
          `Invalid tenant hierarchy for ${binding.organizationId}.`,
        );
      }
      this.tenants.set(binding.organizationId, { ...binding });
    }
  }

  private nextId(prefix: string) {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  async getOrCreateRun(
    input: Parameters<GhlProvisioningRepository["getOrCreateRun"]>[0],
  ): Promise<GhlProvisioningRun> {
    const tenant = this.tenants.get(input.request.organizationId);
    if (!tenant || tenant.status !== "active") {
      throw new GhlMemoryRepositoryInvariantError(
        "tenant_not_active",
        "Provisioning requires an active, explicit workspace hierarchy binding.",
      );
    }

    const existingId = this.runIdsByIdempotency.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.runs.get(existingId)!;
      if (!sameProvisioningIdentity(existing, input)) {
        throw new GhlMemoryRepositoryInvariantError(
          "idempotency_collision",
          "Provisioning idempotency key was reused with different tenant or snapshot input.",
        );
      }
      return structuredClone(existing);
    }

    const conflictingRun = [...this.runs.values()].find((run) =>
      run.organizationId === input.request.organizationId
      && run.environment === input.request.environment
      && !["ready", "operator_action_required", "canceled"].includes(run.state),
    );
    if (conflictingRun) {
      throw new GhlMemoryRepositoryInvariantError(
        "workspace_provisioning_inflight",
        "Only one GHL provisioning run may be in flight per workspace and environment.",
      );
    }

    const run: GhlProvisioningRun = {
      id: this.nextId("run"),
      organizationId: input.request.organizationId,
      environment: input.request.environment,
      activationEventId: input.request.activationEventId,
      installationId: input.request.installationId,
      snapshotManifest: structuredClone(input.request.snapshotManifest),
      locationProfile: structuredClone(input.request.locationProfile),
      idempotencyKey: input.idempotencyKey,
      state: "requested",
      resumeState: null,
      reconcileBeforeRetry: false,
      locationMappingId: null,
      providerLocationId: null,
      attemptCount: 0,
      maxAttempts: 5,
      revision: 0,
      lastReconciledAt: null,
      nextRetryAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      snapshotVerifiedAt: null,
      requiredObjectsVerifiedAt: null,
      requestedAt: input.now,
      readyAt: null,
      updatedAt: input.now,
    };
    this.runs.set(run.id, run);
    this.runIdsByIdempotency.set(run.idempotencyKey, run.id);
    return structuredClone(run);
  }

  async getRun(runId: string) {
    const run = this.runs.get(runId);
    return run ? structuredClone(run) : null;
  }

  async saveRun(run: GhlProvisioningRun, expectedRevision: number) {
    const current = this.runs.get(run.id);
    if (!current) {
      throw new GhlMemoryRepositoryInvariantError("run_not_found", "Provisioning run was not found.");
    }
    if (current.organizationId !== run.organizationId) {
      throw new GhlMemoryRepositoryInvariantError(
        "cross_tenant_run_write",
        "A provisioning run cannot be moved between workspaces.",
      );
    }
    if (current.revision !== expectedRevision || run.revision !== expectedRevision + 1) {
      throw new GhlMemoryRepositoryInvariantError(
        "stale_revision",
        "Provisioning run changed concurrently; reload before retrying.",
      );
    }
    this.runs.set(run.id, structuredClone(run));
    return structuredClone(run);
  }

  async ensureOutbox(
    input: Parameters<GhlProvisioningRepository["ensureOutbox"]>[0],
  ) {
    const existingId = this.outboxIdsByIdempotency.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.outbox.get(existingId)!;
      if (
        existing.organizationId !== input.run.organizationId
        || existing.provisioningRunId !== input.run.id
        || existing.operation !== input.operation
        || JSON.stringify(existing.requestPayload) !== JSON.stringify(input.requestPayload)
      ) {
        throw new GhlMemoryRepositoryInvariantError(
          "outbox_idempotency_collision",
          "Provider outbox idempotency key was reused across a tenant or operation boundary.",
        );
      }
      return structuredClone(existing);
    }

    const record: GhlProviderOutboxRecord = {
      id: this.nextId("outbox"),
      organizationId: input.run.organizationId,
      provisioningRunId: input.run.id,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      status: "pending",
      requestPayload: structuredClone(input.requestPayload),
      attemptCount: 0,
      availableAt: input.now,
      lastErrorCode: null,
      lockedBy: null,
      leaseToken: null,
      leaseGeneration: 0,
      leaseExpiresAt: null,
    };
    this.outbox.set(record.id, record);
    this.outboxIdsByIdempotency.set(record.idempotencyKey, record.id);
    return structuredClone(record);
  }

  async claimOutbox(input: Parameters<GhlProvisioningRepository["claimOutbox"]>[0]) {
    const current = this.outbox.get(input.outboxId);
    if (!current) {
      throw new GhlMemoryRepositoryInvariantError("outbox_not_found", "Provider outbox record was not found.");
    }
    if (current.organizationId !== input.organizationId) {
      throw new GhlMemoryRepositoryInvariantError(
        "cross_tenant_outbox_write",
        "An outbox record cannot be claimed across workspaces.",
      );
    }

    const nowMs = Date.parse(input.now);
    const available = Date.parse(current.availableAt) <= nowMs;
    const claimableStatus = ["pending", "retryable_failure"].includes(current.status);
    const run = current.provisioningRunId ? this.runs.get(current.provisioningRunId) : null;
    const reconciledUncertainCreate = current.status === "uncertain"
      && current.operation === "location_create"
      && run?.state === "location_create_requested"
      && run.lastReconciledAt !== null;
    const expiredDispatch = current.status === "dispatching"
      && current.leaseExpiresAt !== null
      && Date.parse(current.leaseExpiresAt) <= nowMs;
    if (((!claimableStatus && !reconciledUncertainCreate) || !available) && !expiredDispatch) {
      return null;
    }

    const leaseMs = Math.min(Math.max(input.leaseMs, 1_000), 3_600_000);
    const generation = current.leaseGeneration + 1;
    const claimed: GhlProviderOutboxRecord = {
      ...current,
      status: "dispatching",
      attemptCount: current.attemptCount + 1,
      lastErrorCode: null,
      lockedBy: input.workerId,
      leaseToken: `memory-lease:${current.id}:${generation}`,
      leaseGeneration: generation,
      leaseExpiresAt: new Date(nowMs + leaseMs).toISOString(),
    };
    this.outbox.set(claimed.id, claimed);
    return structuredClone(claimed);
  }

  async getLatestReceipt(outboxId: string) {
    const receipts = [...this.receipts.values()]
      .filter((receipt) => receipt.outboxId === outboxId)
      .sort((left, right) => right.attemptNumber - left.attemptNumber);
    return receipts[0] ? structuredClone(receipts[0]) : null;
  }

  async prepareOutboxReplay(input: Parameters<GhlProvisioningRepository["prepareOutboxReplay"]>[0]) {
    const outboxId = this.outboxIdsByIdempotency.get(input.idempotencyKey);
    const current = outboxId ? this.outbox.get(outboxId) : null;
    if (!current || current.organizationId !== input.organizationId) {
      throw new GhlMemoryRepositoryInvariantError("outbox_not_found", "Replay outbox record was not found.");
    }
    if (current.status === "pending") return;
    if (current.status !== "retryable_failure") {
      throw new GhlMemoryRepositoryInvariantError("outbox_not_retryable", "Replay outbox is not retryable.");
    }
    this.outbox.set(current.id, {
      ...current,
      status: "pending",
      availableAt: input.now,
      lastErrorCode: null,
    });
  }

  async settleOutbox(input: Parameters<GhlProvisioningRepository["settleOutbox"]>[0]) {
    const current = this.outbox.get(input.record.id);
    if (!current) {
      throw new GhlMemoryRepositoryInvariantError("outbox_not_found", "Receipt outbox record was not found.");
    }
    if (
      current.organizationId !== input.record.organizationId
      || current.status !== "dispatching"
      || current.lockedBy !== input.lease.workerId
      || current.leaseToken !== input.lease.token
      || current.leaseGeneration !== input.lease.generation
      || current.leaseExpiresAt !== input.lease.expiresAt
      || Date.parse(input.receipt.receivedAt) >= Date.parse(input.lease.expiresAt)
    ) {
      throw new GhlMemoryRepositoryInvariantError(
        "outbox_lease_lost",
        "The GHL outbox lease expired or was superseded before settlement.",
      );
    }

    const receipt: GhlProviderReceipt = {
      ...input.receipt,
      outboxId: current.id,
      attemptNumber: current.attemptCount,
    };
    const key = `${receipt.outboxId}:${receipt.attemptNumber}`;
    if (this.receipts.has(key)) {
      throw new GhlMemoryRepositoryInvariantError(
        "receipt_append_only_conflict",
        "A receipt already exists for this outbox attempt.",
      );
    }
    this.receipts.set(key, structuredClone(receipt));

    const settled: GhlProviderOutboxRecord = {
      ...current,
      status: input.status,
      availableAt: input.availableAt,
      lastErrorCode: input.lastErrorCode,
      lockedBy: null,
      leaseToken: null,
      leaseExpiresAt: null,
    };
    this.outbox.set(settled.id, settled);
    return structuredClone(settled);
  }

  async assignLocation(
    input: Parameters<GhlProvisioningRepository["assignLocation"]>[0],
  ) {
    const workspaceMapping = [...this.mappings.values()].find((mapping) =>
      mapping.organizationId === input.run.organizationId
      && mapping.environment === input.run.environment
      && ["provisioning", "active"].includes(mapping.status),
    );
    if (workspaceMapping) {
      if (workspaceMapping.providerLocationId !== input.providerLocationId) {
        throw new GhlMemoryRepositoryInvariantError(
          "workspace_location_conflict",
          "Workspace already has a different active or provisioning GHL location.",
        );
      }
      return structuredClone(workspaceMapping);
    }

    const locationMapping = [...this.mappings.values()].find((mapping) =>
      mapping.environment === input.run.environment
      && mapping.providerLocationId === input.providerLocationId
      && ["provisioning", "active"].includes(mapping.status),
    );
    if (locationMapping && locationMapping.organizationId !== input.run.organizationId) {
      throw new GhlMemoryRepositoryInvariantError(
        "provider_location_tenant_conflict",
        "Provider location is already assigned to another workspace.",
      );
    }

    const mapping: GhlLocationAssignment = {
      id: this.nextId("mapping"),
      organizationId: input.run.organizationId,
      installationId: input.run.installationId,
      environment: input.run.environment,
      providerLocationId: input.providerLocationId,
      snapshotManifestId: input.run.snapshotManifest.id,
      status: "provisioning",
      snapshotVerifiedAt: null,
      requiredObjectsVerifiedAt: null,
    };
    this.mappings.set(mapping.id, mapping);
    return structuredClone(mapping);
  }

  async markLocationVerified(
    input: Parameters<GhlProvisioningRepository["markLocationVerified"]>[0],
  ) {
    const mapping = this.mappings.get(input.mappingId);
    if (!mapping) {
      throw new GhlMemoryRepositoryInvariantError("mapping_not_found", "GHL location mapping was not found.");
    }
    const next: GhlLocationAssignment = {
      ...mapping,
      snapshotVerifiedAt: input.snapshotVerifiedAt ?? mapping.snapshotVerifiedAt,
      requiredObjectsVerifiedAt: input.requiredObjectsVerifiedAt ?? mapping.requiredObjectsVerifiedAt,
      status: input.requiredObjectsVerifiedAt ? "active" : mapping.status,
    };
    this.mappings.set(next.id, next);
    return structuredClone(next);
  }

  async openOperatorRequest(request: GhlOperatorRequest) {
    const existing = this.operatorRequests.get(request.idempotencyKey);
    if (existing) {
      if (
        existing.organizationId !== request.organizationId
        || existing.provisioningRunId !== request.provisioningRunId
        || existing.requestKind !== request.requestKind
      ) {
        throw new GhlMemoryRepositoryInvariantError(
          "operator_request_idempotency_collision",
          "Operator request idempotency key crossed a tenant or target boundary.",
        );
      }
      return;
    }
    this.operatorRequests.set(request.idempotencyKey, structuredClone(request));
  }

  listRuns() {
    return [...this.runs.values()].map((value) => structuredClone(value));
  }

  listMappings() {
    return [...this.mappings.values()].map((value) => structuredClone(value));
  }

  listOutbox() {
    return [...this.outbox.values()].map((value) => structuredClone(value));
  }

  listReceipts() {
    return [...this.receipts.values()].map((value) => structuredClone(value));
  }

  listOperatorRequests() {
    return [...this.operatorRequests.values()].map((value) => structuredClone(value));
  }
}
