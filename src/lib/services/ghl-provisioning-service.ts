import {
  assertGhlFakeWritesAllowed,
  assertGhlSandboxAllowed,
  assertGhlReplayDue,
  GHL_CAPABILITY_MATRIX,
  GhlProvisioningInvariantError,
  transitionGhlProvisioning,
} from "../integrations/gohighlevel";
import type {
  GhlOperatorRequest,
  GhlProviderAdapter,
  GhlProviderOutboxLease,
  GhlProviderOperation,
  GhlProviderOutboxRecord,
  GhlProviderReceipt,
  GhlProvisioningRepository,
  GhlProvisioningRequest,
  GhlProvisioningRun,
  GhlRetryResumeState,
  GhlWriteGateInput,
  GhlSandboxGateInput,
} from "../integrations/gohighlevel";

export type GhlProvisioningDependencies = {
  repository: GhlProvisioningRepository;
  provider: GhlProviderAdapter;
  writeGate?: GhlWriteGateInput;
  now?: () => string;
  workerId?: string;
  leaseMs?: number;
  isolatedDatabase?: boolean;
  databaseUrl?: string;
  sandboxGate?: GhlSandboxGateInput;
};

function isLoopbackDatabaseUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function nowFrom(dependencies: GhlProvisioningDependencies) {
  return dependencies.now?.() ?? new Date().toISOString();
}

function normalizeKeyPart(value: string) {
  return encodeURIComponent(value.trim());
}

export function buildGhlProvisioningIdempotencyKey(request: GhlProvisioningRequest) {
  return [
    "ghl-provision-v1",
    request.environment,
    normalizeKeyPart(request.organizationId),
    normalizeKeyPart(request.activationEventId),
    normalizeKeyPart(request.snapshotManifest.snapshotKey),
    normalizeKeyPart(request.snapshotManifest.snapshotVersion),
  ].join(":");
}

function buildOperationIdempotencyKey(run: GhlProvisioningRun, operation: GhlProviderOperation) {
  return `${run.idempotencyKey}:${operation}`;
}

function operationForResumeState(state: GhlRetryResumeState): GhlProviderOperation {
  switch (state) {
    case "location_create_requested":
      return "location_create";
    case "snapshot_install_requested":
      return "snapshot_install";
    case "snapshot_verifying":
      return "snapshot_status";
    case "required_objects_verifying":
      return "required_objects_verify";
  }
}

export function assertGhlProvisioningRequest(request: GhlProvisioningRequest) {
  if (request.snapshotManifest.environment !== request.environment) {
    throw new GhlProvisioningInvariantError(
      "snapshot_environment_mismatch",
      "Snapshot manifest environment must match the provisioning environment.",
    );
  }
  if (request.snapshotManifest.status !== "approved") {
    throw new GhlProvisioningInvariantError(
      "snapshot_not_approved",
      "Provisioning requires an approved snapshot manifest.",
    );
  }
  if (request.snapshotManifest.requiredObjects.length === 0) {
    throw new GhlProvisioningInvariantError(
      "required_object_manifest_empty",
      "Provisioning requires an explicit non-empty required-object manifest.",
    );
  }
  const requiredObjectKeys = new Set<string>();
  for (const requiredObject of request.snapshotManifest.requiredObjects) {
    const identity = `${requiredObject.kind}:${requiredObject.key.trim()}`;
    if (
      !["pipeline", "stage", "workflow", "tag", "calendar", "custom_field"].includes(requiredObject.kind)
      || !requiredObject.key.trim()
      || (
        requiredObject.minimumCount !== undefined
        && (!Number.isInteger(requiredObject.minimumCount) || requiredObject.minimumCount < 1)
      )
      || requiredObjectKeys.has(identity)
    ) {
      throw new GhlProvisioningInvariantError(
        "required_object_manifest_invalid",
        "Provisioning requires unique, structurally valid required-object manifest entries.",
      );
    }
    requiredObjectKeys.add(identity);
  }
  if (!request.activationEventId.trim()) {
    throw new GhlProvisioningInvariantError(
      "activation_event_required",
      "A qualifying payment activation event is required for provisioning idempotency.",
    );
  }
}

export async function requestGhlProvisioning(
  request: GhlProvisioningRequest,
  dependencies: GhlProvisioningDependencies,
) {
  assertGhlProvisioningRequest(request);
  return dependencies.repository.getOrCreateRun({
    request,
    idempotencyKey: buildGhlProvisioningIdempotencyKey(request),
    now: nowFrom(dependencies),
  });
}

async function saveTransition(
  repository: GhlProvisioningRepository,
  run: GhlProvisioningRun,
  next: ReturnType<typeof transitionGhlProvisioning>,
) {
  return repository.saveRun(next, run.revision);
}

async function beginProviderAttempt(
  run: GhlProvisioningRun,
  operation: GhlProviderOperation,
  requestPayload: GhlProviderOutboxRecord["requestPayload"],
  dependencies: GhlProvisioningDependencies,
) {
  const now = nowFrom(dependencies);
  const existing = await dependencies.repository.ensureOutbox({
    run,
    operation,
    idempotencyKey: buildOperationIdempotencyKey(run, operation),
    requestPayload,
    now,
  });
  const latestReceipt = await dependencies.repository.getLatestReceipt(existing.id);
  const reconciledUncertainCreate = existing.status === "uncertain"
    && operation === "location_create"
    && run.lastReconciledAt !== null;
  const unreconciledPendingPoll = existing.status === "pending"
    && latestReceipt?.outcome === "accepted"
    && latestReceipt.metadata.providerStatus === "pending"
    && run.lastErrorCode !== "snapshot_poll_pending";
  if (
    !reconciledUncertainCreate
    && (
      ["succeeded", "uncertain", "retryable_failure", "operator_action_required"].includes(existing.status)
      || unreconciledPendingPoll
    )
  ) {
    if (!latestReceipt) {
      throw new GhlProvisioningInvariantError(
        "provider_outbox_receipt_missing",
        "A settled GHL provider outbox item is missing its durable receipt.",
      );
    }
    return { kind: "settled" as const, outbox: existing, receipt: latestReceipt };
  }
  const claimed = await dependencies.repository.claimOutbox({
    outboxId: existing.id,
    organizationId: run.organizationId,
    workerId: dependencies.workerId ?? `ghl-provisioner:${run.id}`,
    now,
    leaseMs: dependencies.leaseMs ?? 300_000,
  });
  if (!claimed) {
    throw new GhlProvisioningInvariantError(
      "provider_outbox_not_claimable",
      "The GHL provider outbox item is not due or is owned by another live worker lease.",
    );
  }
  if (!claimed.lockedBy || !claimed.leaseToken || !claimed.leaseExpiresAt || claimed.leaseGeneration < 1) {
    throw new GhlProvisioningInvariantError(
      "provider_outbox_lease_missing",
      "The claimed GHL provider outbox item is missing its fencing lease.",
    );
  }
  return { kind: "claimed" as const, outbox: claimed };
}

async function recordProviderOutcome(
  outbox: GhlProviderOutboxRecord,
  input: Omit<GhlProviderReceipt, "outboxId" | "attemptNumber" | "receivedAt"> & {
    outboxStatus: GhlProviderOutboxRecord["status"];
    availableAt?: string;
  },
  dependencies: GhlProvisioningDependencies,
) {
  const receivedAt = nowFrom(dependencies);
  const lease: GhlProviderOutboxLease = {
    workerId: outbox.lockedBy!,
    token: outbox.leaseToken!,
    generation: outbox.leaseGeneration,
    expiresAt: outbox.leaseExpiresAt!,
  };
  return dependencies.repository.settleOutbox({
    record: outbox,
    lease,
    receipt: {
      outcome: input.outcome,
      providerRequestId: input.providerRequestId,
      providerReference: input.providerReference,
      httpStatus: input.httpStatus,
      responseFingerprint: input.responseFingerprint,
      metadata: input.metadata,
      receivedAt,
    },
    status: input.outboxStatus,
    availableAt: input.availableAt ?? (
      input.outboxStatus === "retryable_failure"
        ? retryAt(receivedAt, outbox.attemptCount)
        : receivedAt
    ),
    lastErrorCode: typeof input.metadata.errorCode === "string" ? input.metadata.errorCode : null,
  });
}

function retryAt(now: string, attemptCount: number) {
  const delaySeconds = Math.min(60 * 2 ** Math.max(attemptCount - 1, 0), 15 * 60);
  return new Date(Date.parse(now) + delaySeconds * 1_000).toISOString();
}

async function transitionToOperatorRequired(
  run: GhlProvisioningRun,
  input: {
    requestKind: GhlOperatorRequest["requestKind"];
    blockerCode: string;
    safeMessage: string;
  },
  dependencies: GhlProvisioningDependencies,
) {
  const now = nowFrom(dependencies);
  await dependencies.repository.openOperatorRequest({
    organizationId: run.organizationId,
    provisioningRunId: run.id,
    requestKind: input.requestKind,
    blockerCode: input.blockerCode,
    idempotencyKey: `${run.idempotencyKey}:operator:${input.requestKind}:${input.blockerCode}`,
    details: { safeMessage: input.safeMessage },
  });
  const next = transitionGhlProvisioning(
    run,
    "operator_action_required",
    {
      lastErrorCode: input.blockerCode,
      lastErrorMessage: input.safeMessage,
      nextRetryAt: null,
      resumeState: null,
    },
    now,
  );
  return saveTransition(dependencies.repository, run, next);
}

async function transitionToRetryable(
  run: GhlProvisioningRun,
  input: {
    resumeState: GhlRetryResumeState;
    errorCode: string;
    safeMessage: string;
    lastReconciledAt?: string;
  },
  dependencies: GhlProvisioningDependencies,
) {
  const now = nowFrom(dependencies);
  const nextAttemptCount = run.attemptCount + 1;
  if (nextAttemptCount >= run.maxAttempts) {
    return transitionToOperatorRequired(
      run,
      {
        requestKind: input.resumeState === "location_create_requested"
          ? "location_reconciliation"
          : "snapshot_verification",
        blockerCode: "provisioning_attempt_limit_reached",
        safeMessage: "The bounded GHL provisioning retry limit was reached.",
      },
      dependencies,
    );
  }

  const next = transitionGhlProvisioning(
    run,
    "retryable_failure",
    {
      resumeState: input.resumeState,
      lastErrorCode: input.errorCode,
      lastErrorMessage: input.safeMessage,
      lastReconciledAt: input.lastReconciledAt,
      nextRetryAt: retryAt(now, nextAttemptCount),
    },
    now,
  );
  return saveTransition(dependencies.repository, run, {
    ...next,
    attemptCount: nextAttemptCount,
  });
}

function receiptErrorCode(receipt: GhlProviderReceipt, fallback: string) {
  return typeof receipt.metadata.errorCode === "string"
    ? receipt.metadata.errorCode
    : fallback;
}

async function recoverFailedProviderOutcome(
  run: GhlProvisioningRun,
  attempt: { outbox: GhlProviderOutboxRecord; receipt: GhlProviderReceipt },
  input: {
    resumeState: GhlRetryResumeState;
    requestKind: GhlOperatorRequest["requestKind"];
  },
  dependencies: GhlProvisioningDependencies,
) {
  const errorCode = receiptErrorCode(attempt.receipt, "ghl_provider_outcome_recovered");
  const safeMessage = "A durable GHL provider outcome was recovered after local saga interruption.";
  if (attempt.outbox.status === "retryable_failure") {
    return transitionToRetryable(run, {
      resumeState: input.resumeState,
      errorCode,
      safeMessage,
    }, dependencies);
  }
  if (attempt.outbox.status === "operator_action_required") {
    return transitionToOperatorRequired(run, {
      requestKind: input.requestKind,
      blockerCode: errorCode,
      safeMessage,
    }, dependencies);
  }
  throw new GhlProvisioningInvariantError(
    "provider_outbox_recovery_unsupported",
    `Cannot recover ${attempt.outbox.operation} from ${attempt.outbox.status}.`,
  );
}

async function savePendingSnapshotPoll(
  run: GhlProvisioningRun,
  availableAt: string,
  dependencies: GhlProvisioningDependencies,
) {
  const nextAttemptCount = run.attemptCount + 1;
  if (nextAttemptCount >= run.maxAttempts) {
    return transitionToOperatorRequired(run, {
      requestKind: "snapshot_verification",
      blockerCode: "snapshot_poll_limit_reached",
      safeMessage: "The bounded GHL snapshot verification poll limit was reached.",
    }, dependencies);
  }
  const now = nowFrom(dependencies);
  const base = run.state === "snapshot_installing"
    ? transitionGhlProvisioning(run, "snapshot_verifying", {}, now)
    : {
      ...run,
      revision: run.revision + 1,
      updatedAt: now,
    };
  return dependencies.repository.saveRun({
    ...base,
    attemptCount: nextAttemptCount,
    nextRetryAt: availableAt,
    lastErrorCode: "snapshot_poll_pending",
    lastErrorMessage: "Snapshot verification is still pending; the next poll is backoff-gated.",
    updatedAt: now,
  }, run.revision);
}

async function executeLocationCreate(
  run: GhlProvisioningRun,
  dependencies: GhlProvisioningDependencies,
) {
  const attempt = await beginProviderAttempt(
    run,
    "location_create",
    {
      environment: run.environment,
      organizationId: run.organizationId,
      snapshotVersion: run.snapshotManifest.snapshotVersion,
    },
    dependencies,
  );
  if (attempt.kind === "settled") {
    if (attempt.outbox.status === "succeeded" && attempt.receipt.outcome === "succeeded") {
      if (!attempt.receipt.providerReference) {
        throw new GhlProvisioningInvariantError(
          "provider_location_receipt_missing",
          "Recovered location creation is missing its durable provider location reference.",
        );
      }
      const mapping = await dependencies.repository.assignLocation({
        run,
        providerLocationId: attempt.receipt.providerReference,
        now: nowFrom(dependencies),
      });
      const next = transitionGhlProvisioning(run, "location_assigned", {
        locationMappingId: mapping.id,
        providerLocationId: mapping.providerLocationId,
        lastErrorCode: null,
        lastErrorMessage: null,
      }, nowFrom(dependencies));
      return saveTransition(dependencies.repository, run, next);
    }
    if (attempt.outbox.status === "uncertain") {
      const next = transitionGhlProvisioning(run, "location_uncertain", {
        lastErrorCode: receiptErrorCode(attempt.receipt, "location_result_uncertain"),
        lastErrorMessage: "The durable location result is uncertain and requires reconciliation.",
      }, nowFrom(dependencies));
      return saveTransition(dependencies.repository, run, next);
    }
    return recoverFailedProviderOutcome(run, attempt, {
      resumeState: "location_create_requested",
      requestKind: "location_reconciliation",
    }, dependencies);
  }
  const outbox = attempt.outbox;
  const result = await dependencies.provider.createLocation({
    idempotencyKey: run.idempotencyKey,
    installationId: run.installationId,
    environment: run.environment,
    organizationId: run.organizationId,
    profile: run.locationProfile,
  });

  if (result.outcome === "succeeded") {
    await recordProviderOutcome(outbox, {
      outcome: "succeeded",
      outboxStatus: "succeeded",
      providerRequestId: result.providerRequestId,
      providerReference: result.providerLocationId,
      httpStatus: result.httpStatus,
      responseFingerprint: null,
      metadata: { providerLocationIdRecorded: true },
    }, dependencies);
    const mapping = await dependencies.repository.assignLocation({
      run,
      providerLocationId: result.providerLocationId,
      now: nowFrom(dependencies),
    });
    const next = transitionGhlProvisioning(run, "location_assigned", {
      locationMappingId: mapping.id,
      providerLocationId: mapping.providerLocationId,
      lastErrorCode: null,
      lastErrorMessage: null,
    }, nowFrom(dependencies));
    return saveTransition(dependencies.repository, run, next);
  }

  if (result.outcome === "uncertain") {
    await recordProviderOutcome(outbox, {
      outcome: "uncertain",
      outboxStatus: "uncertain",
      providerRequestId: result.providerRequestId,
      providerReference: run.idempotencyKey,
      httpStatus: result.httpStatus,
      responseFingerprint: null,
      metadata: { errorCode: result.errorCode },
    }, dependencies);
    const next = transitionGhlProvisioning(run, "location_uncertain", {
      lastErrorCode: result.errorCode,
      lastErrorMessage: result.safeMessage,
    }, nowFrom(dependencies));
    return saveTransition(dependencies.repository, run, next);
  }

  await recordProviderOutcome(outbox, {
    outcome: result.outcome,
    outboxStatus: result.outcome,
    providerRequestId: result.providerRequestId,
    providerReference: run.idempotencyKey,
    httpStatus: result.httpStatus,
    responseFingerprint: null,
    metadata: { errorCode: result.errorCode },
  }, dependencies);

  return result.outcome === "operator_action_required"
    ? transitionToOperatorRequired(run, {
      requestKind: "location_reconciliation",
      blockerCode: result.errorCode,
      safeMessage: result.safeMessage,
    }, dependencies)
    : transitionToRetryable(run, {
      resumeState: "location_create_requested",
      errorCode: result.errorCode,
      safeMessage: result.safeMessage,
    }, dependencies);
}

async function reconcileUncertainLocation(
  run: GhlProvisioningRun,
  dependencies: GhlProvisioningDependencies,
) {
  const attempt = await beginProviderAttempt(
    run,
    "location_reconcile",
    { environment: run.environment, originalRequestKey: run.idempotencyKey },
    dependencies,
  );
  if (attempt.kind === "settled") {
    const reconciledAt = attempt.receipt.receivedAt;
    if (attempt.outbox.status === "succeeded" && attempt.receipt.outcome === "succeeded") {
      if (!attempt.receipt.providerReference) {
        throw new GhlProvisioningInvariantError(
          "provider_location_receipt_missing",
          "Recovered location reconciliation is missing its durable provider location reference.",
        );
      }
      const mapping = await dependencies.repository.assignLocation({
        run,
        providerLocationId: attempt.receipt.providerReference,
        now: reconciledAt,
      });
      const next = transitionGhlProvisioning(run, "location_assigned", {
        locationMappingId: mapping.id,
        providerLocationId: mapping.providerLocationId,
        lastReconciledAt: reconciledAt,
        lastErrorCode: null,
        lastErrorMessage: null,
      }, reconciledAt);
      return saveTransition(dependencies.repository, run, next);
    }
    if (attempt.outbox.status === "succeeded" && attempt.receipt.outcome === "not_found") {
      return transitionToRetryable(run, {
        resumeState: "location_create_requested",
        errorCode: "location_absent_after_reconciliation",
        safeMessage: "The original location request was conclusively absent and may be replayed safely.",
        lastReconciledAt: reconciledAt,
      }, dependencies);
    }
    return recoverFailedProviderOutcome(run, attempt, {
      resumeState: "location_create_requested",
      requestKind: "location_reconciliation",
    }, dependencies);
  }
  const outbox = attempt.outbox;
  const result = await dependencies.provider.reconcileLocationCreate({
    idempotencyKey: run.idempotencyKey,
    installationId: run.installationId,
    environment: run.environment,
  });
  const reconciledAt = nowFrom(dependencies);

  if (result.outcome === "found") {
    await recordProviderOutcome(outbox, {
      outcome: "succeeded",
      outboxStatus: "succeeded",
      providerRequestId: result.providerRequestId,
      providerReference: result.providerLocationId,
      httpStatus: 200,
      responseFingerprint: null,
      metadata: { providerLocationIdRecorded: true },
    }, dependencies);
    const mapping = await dependencies.repository.assignLocation({
      run,
      providerLocationId: result.providerLocationId,
      now: reconciledAt,
    });
    const next = transitionGhlProvisioning(run, "location_assigned", {
      locationMappingId: mapping.id,
      providerLocationId: mapping.providerLocationId,
      lastReconciledAt: reconciledAt,
      lastErrorCode: null,
      lastErrorMessage: null,
    }, reconciledAt);
    return saveTransition(dependencies.repository, run, next);
  }

  if (result.outcome === "not_found") {
    await recordProviderOutcome(outbox, {
      outcome: "not_found",
      outboxStatus: "succeeded",
      providerRequestId: result.providerRequestId,
      providerReference: run.idempotencyKey,
      httpStatus: 404,
      responseFingerprint: null,
      metadata: { absenceConclusive: true },
    }, dependencies);
    return transitionToRetryable(run, {
      resumeState: "location_create_requested",
      errorCode: "location_absent_after_reconciliation",
      safeMessage: "The original location request was conclusively absent and may be replayed safely.",
      lastReconciledAt: reconciledAt,
    }, dependencies);
  }

  await recordProviderOutcome(outbox, {
    outcome: result.outcome,
    outboxStatus: "operator_action_required",
    providerRequestId: result.providerRequestId,
    providerReference: run.idempotencyKey,
    httpStatus: null,
    responseFingerprint: null,
    metadata: { errorCode: result.errorCode },
  }, dependencies);
  return transitionToOperatorRequired(run, {
    requestKind: "location_reconciliation",
    blockerCode: result.errorCode,
    safeMessage: result.safeMessage,
  }, dependencies);
}

async function executeSnapshotInstall(
  run: GhlProvisioningRun,
  dependencies: GhlProvisioningDependencies,
) {
  if (!run.providerLocationId) {
    throw new GhlProvisioningInvariantError(
      "provider_location_missing",
      "Snapshot installation requires an assigned provider location.",
    );
  }
  const attempt = await beginProviderAttempt(
    run,
    "snapshot_install",
    {
      providerLocationId: run.providerLocationId,
      snapshotKey: run.snapshotManifest.snapshotKey,
      snapshotVersion: run.snapshotManifest.snapshotVersion,
    },
    dependencies,
  );
  if (attempt.kind === "settled") {
    if (attempt.outbox.status === "succeeded") {
      const next = transitionGhlProvisioning(
        run,
        "snapshot_installing",
        { lastErrorCode: null, lastErrorMessage: null },
        nowFrom(dependencies),
      );
      return saveTransition(dependencies.repository, run, next);
    }
    return recoverFailedProviderOutcome(run, attempt, {
      resumeState: "snapshot_install_requested",
      requestKind: "snapshot_verification",
    }, dependencies);
  }
  const outbox = attempt.outbox;
  const result = await dependencies.provider.installSnapshot({
    idempotencyKey: buildOperationIdempotencyKey(run, "snapshot_install"),
    providerLocationId: run.providerLocationId,
    manifest: run.snapshotManifest,
  });

  if (!("errorCode" in result)) {
    await recordProviderOutcome(outbox, {
      outcome: result.outcome,
      outboxStatus: "succeeded",
      providerRequestId: result.providerRequestId,
      providerReference: result.providerReference,
      httpStatus: result.httpStatus,
      responseFingerprint: null,
      metadata: { snapshotVersion: run.snapshotManifest.snapshotVersion },
    }, dependencies);
    const next = transitionGhlProvisioning(
      run,
      "snapshot_installing",
      { lastErrorCode: null, lastErrorMessage: null },
      nowFrom(dependencies),
    );
    return saveTransition(dependencies.repository, run, next);
  }

  await recordProviderOutcome(outbox, {
    outcome: result.outcome,
    outboxStatus: result.outcome,
    providerRequestId: result.providerRequestId,
    providerReference: null,
    httpStatus: result.httpStatus,
    responseFingerprint: null,
    metadata: { errorCode: result.errorCode },
  }, dependencies);
  return result.outcome === "operator_action_required"
    ? transitionToOperatorRequired(run, {
      requestKind: "snapshot_verification",
      blockerCode: result.errorCode,
      safeMessage: result.safeMessage,
    }, dependencies)
    : transitionToRetryable(run, {
      resumeState: "snapshot_install_requested",
      errorCode: result.errorCode,
      safeMessage: result.safeMessage,
    }, dependencies);
}

async function checkSnapshotStatus(
  run: GhlProvisioningRun,
  dependencies: GhlProvisioningDependencies,
) {
  if (!run.providerLocationId || !run.locationMappingId) {
    throw new GhlProvisioningInvariantError(
      "location_mapping_missing",
      "Snapshot verification requires the exact tenant/location mapping.",
    );
  }

  if (run.state === "snapshot_verifying" && run.snapshotVerifiedAt) {
    const next = transitionGhlProvisioning(
      run,
      "required_objects_verifying",
      {},
      nowFrom(dependencies),
    );
    return saveTransition(dependencies.repository, run, next);
  }
  if (run.nextRetryAt && Date.parse(run.nextRetryAt) > Date.parse(nowFrom(dependencies))) {
    return run;
  }

  const attempt = await beginProviderAttempt(
    run,
    "snapshot_status",
    {
      providerLocationId: run.providerLocationId,
      snapshotVersion: run.snapshotManifest.snapshotVersion,
    },
    dependencies,
  );
  if (attempt.kind === "settled") {
    const providerStatus = attempt.receipt.metadata.providerStatus;
    if (attempt.outbox.status === "pending" && providerStatus === "pending") {
      return savePendingSnapshotPoll(run, attempt.outbox.availableAt, dependencies);
    }
    if (attempt.outbox.status === "succeeded" && providerStatus === "ready") {
      const verifiedAt = attempt.receipt.receivedAt;
      await dependencies.repository.markLocationVerified({
        mappingId: run.locationMappingId,
        snapshotVerifiedAt: verifiedAt,
      });
      const next = transitionGhlProvisioning(
        run,
        run.state === "snapshot_installing" ? "snapshot_verifying" : "required_objects_verifying",
        {
          snapshotVerifiedAt: verifiedAt,
          nextRetryAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
        nowFrom(dependencies),
      );
      return saveTransition(dependencies.repository, run, next);
    }
    return recoverFailedProviderOutcome(run, attempt, {
      resumeState: "snapshot_verifying",
      requestKind: "snapshot_verification",
    }, dependencies);
  }
  const outbox = attempt.outbox;
  const result = await dependencies.provider.getSnapshotStatus({
    providerLocationId: run.providerLocationId,
    manifest: run.snapshotManifest,
  });

  if (!("errorCode" in result)) {
    const nextPollAt = result.outcome === "pending"
      ? retryAt(nowFrom(dependencies), run.attemptCount + 1)
      : undefined;
    await recordProviderOutcome(outbox, {
      outcome: result.outcome === "ready" ? "succeeded" : "accepted",
      outboxStatus: result.outcome === "ready" ? "succeeded" : "pending",
      providerRequestId: result.providerRequestId,
      providerReference: result.providerReference,
      httpStatus: 200,
      responseFingerprint: null,
      metadata: { providerStatus: result.outcome },
      availableAt: nextPollAt,
    }, dependencies);
    const verifiedAt = result.outcome === "ready" ? nowFrom(dependencies) : null;
    if (verifiedAt) {
      await dependencies.repository.markLocationVerified({
        mappingId: run.locationMappingId,
        snapshotVerifiedAt: verifiedAt,
      });
    }

    if (result.outcome === "pending") {
      return savePendingSnapshotPoll(run, nextPollAt!, dependencies);
    }

    if (run.state === "snapshot_installing") {
      const next = transitionGhlProvisioning(
        run,
        "snapshot_verifying",
        {
          snapshotVerifiedAt: verifiedAt,
          nextRetryAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
        nowFrom(dependencies),
      );
      return saveTransition(dependencies.repository, run, next);
    }

    if (result.outcome === "ready") {
      const next = transitionGhlProvisioning(
        run,
        "required_objects_verifying",
        {
          snapshotVerifiedAt: verifiedAt,
          nextRetryAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
        nowFrom(dependencies),
      );
      return saveTransition(dependencies.repository, run, next);
    }

    return run;
  }

  await recordProviderOutcome(outbox, {
    outcome: result.outcome,
    outboxStatus: result.outcome,
    providerRequestId: result.providerRequestId,
    providerReference: null,
    httpStatus: null,
    responseFingerprint: null,
    metadata: { errorCode: result.errorCode },
  }, dependencies);
  return result.outcome === "operator_action_required"
    ? transitionToOperatorRequired(run, {
      requestKind: "snapshot_verification",
      blockerCode: result.errorCode,
      safeMessage: result.safeMessage,
    }, dependencies)
    : transitionToRetryable(run, {
      resumeState: "snapshot_verifying",
      errorCode: result.errorCode,
      safeMessage: result.safeMessage,
    }, dependencies);
}

async function verifyRequiredObjects(
  run: GhlProvisioningRun,
  dependencies: GhlProvisioningDependencies,
) {
  if (!run.providerLocationId || !run.locationMappingId || !run.snapshotVerifiedAt) {
    throw new GhlProvisioningInvariantError(
      "snapshot_verification_missing",
      "Required-object verification cannot begin before the exact snapshot is verified.",
    );
  }
  const attempt = await beginProviderAttempt(
    run,
    "required_objects_verify",
    {
      providerLocationId: run.providerLocationId,
      manifestObjectCount: run.snapshotManifest.requiredObjects.length,
    },
    dependencies,
  );
  if (attempt.kind === "settled") {
    if (attempt.outbox.status === "succeeded") {
      const verifiedAt = attempt.receipt.receivedAt;
      await dependencies.repository.markLocationVerified({
        mappingId: run.locationMappingId,
        requiredObjectsVerifiedAt: verifiedAt,
      });
      const next = transitionGhlProvisioning(run, "ready", {
        requiredObjectsVerifiedAt: verifiedAt,
        lastErrorCode: null,
        lastErrorMessage: null,
      }, nowFrom(dependencies));
      return saveTransition(dependencies.repository, run, next);
    }
    return recoverFailedProviderOutcome(run, attempt, {
      resumeState: "required_objects_verifying",
      requestKind: "required_object_repair",
    }, dependencies);
  }
  const outbox = attempt.outbox;
  const result = await dependencies.provider.verifyRequiredObjects({
    providerLocationId: run.providerLocationId,
    manifest: run.snapshotManifest,
  });

  if (result.outcome === "verified") {
    await recordProviderOutcome(outbox, {
      outcome: "succeeded",
      outboxStatus: "succeeded",
      providerRequestId: result.providerRequestId,
      providerReference: run.snapshotManifest.providerSnapshotId,
      httpStatus: 200,
      responseFingerprint: null,
      metadata: { verifiedObjectCount: result.verifiedKeys.length },
    }, dependencies);
    const verifiedAt = nowFrom(dependencies);
    await dependencies.repository.markLocationVerified({
      mappingId: run.locationMappingId,
      requiredObjectsVerifiedAt: verifiedAt,
    });
    const next = transitionGhlProvisioning(run, "ready", {
      requiredObjectsVerifiedAt: verifiedAt,
      lastErrorCode: null,
      lastErrorMessage: null,
    }, nowFrom(dependencies));
    return saveTransition(dependencies.repository, run, next);
  }

  if (result.outcome === "missing") {
    await recordProviderOutcome(outbox, {
      outcome: "operator_action_required",
      outboxStatus: "operator_action_required",
      providerRequestId: result.providerRequestId,
      providerReference: run.snapshotManifest.providerSnapshotId,
      httpStatus: 200,
      responseFingerprint: null,
      metadata: { missingObjectCount: result.missingKeys.length },
    }, dependencies);
    return transitionToOperatorRequired(run, {
      requestKind: "required_object_repair",
      blockerCode: "required_snapshot_objects_missing",
      safeMessage: `Snapshot verification is missing ${result.missingKeys.length} required object(s).`,
    }, dependencies);
  }

  await recordProviderOutcome(outbox, {
    outcome: "retryable_failure",
    outboxStatus: "retryable_failure",
    providerRequestId: result.providerRequestId,
    providerReference: run.snapshotManifest.providerSnapshotId,
    httpStatus: null,
    responseFingerprint: null,
    metadata: { errorCode: result.errorCode },
  }, dependencies);
  return transitionToRetryable(run, {
    resumeState: "required_objects_verifying",
    errorCode: result.errorCode,
    safeMessage: result.safeMessage,
  }, dependencies);
}

async function executeProvisioningState(
  run: GhlProvisioningRun,
  dependencies: GhlProvisioningDependencies,
) {
  switch (run.state) {
    case "requested": {
      await dependencies.repository.ensureOutbox({
        run,
        operation: "location_create",
        idempotencyKey: buildOperationIdempotencyKey(run, "location_create"),
        requestPayload: {
          environment: run.environment,
          organizationId: run.organizationId,
          snapshotVersion: run.snapshotManifest.snapshotVersion,
        },
        now: nowFrom(dependencies),
      });
      const next = transitionGhlProvisioning(
        run,
        "location_create_requested",
        {},
        nowFrom(dependencies),
      );
      return saveTransition(dependencies.repository, run, next);
    }
    case "location_create_requested":
      return executeLocationCreate(run, dependencies);
    case "location_uncertain":
      return reconcileUncertainLocation(run, dependencies);
    case "location_assigned": {
      const next = transitionGhlProvisioning(
        run,
        "snapshot_install_requested",
        {},
        nowFrom(dependencies),
      );
      return saveTransition(dependencies.repository, run, next);
    }
    case "snapshot_install_requested":
      return executeSnapshotInstall(run, dependencies);
    case "snapshot_installing":
    case "snapshot_verifying":
      return checkSnapshotStatus(run, dependencies);
    case "required_objects_verifying":
      return verifyRequiredObjects(run, dependencies);
    case "retryable_failure":
    case "operator_action_required":
    case "ready":
    case "canceled":
      return run;
  }
}

export async function executeNextGhlProvisioningStep(
  runId: string,
  dependencies: GhlProvisioningDependencies,
) {
  assertGhlFakeWritesAllowed({
    enabled: dependencies.writeGate?.enabled,
    adapterKind: dependencies.provider.kind,
    networkAccess: dependencies.provider.networkAccess,
  });
  const run = await dependencies.repository.getRun(runId);
  if (!run) {
    throw new GhlProvisioningInvariantError("run_not_found", "GHL provisioning run was not found.");
  }
  if (
    run.environment !== "test"
    || process.env.NODE_ENV === "production"
    || dependencies.isolatedDatabase !== true
    || !isLoopbackDatabaseUrl(dependencies.databaseUrl)
  ) {
    throw new GhlProvisioningInvariantError(
      "fake_provisioning_environment_forbidden",
      "Fake GHL provisioning requires a test-environment run plus an explicit loopback isolated-database attestation outside production.",
    );
  }

  return executeProvisioningState(run, dependencies);
}

export async function executeNextGhlSandboxProvisioningStep(
  runId: string,
  dependencies: GhlProvisioningDependencies,
) {
  if (!dependencies.sandboxGate) {
    throw new GhlProvisioningInvariantError(
      "ghl_sandbox_gate_missing",
      "Real GHL sandbox provisioning requires the complete isolated sandbox gate.",
    );
  }
  assertGhlSandboxAllowed(dependencies.sandboxGate);
  if (dependencies.provider.kind !== "sandbox" || dependencies.provider.networkAccess !== "https") {
    throw new GhlProvisioningInvariantError(
      "ghl_sandbox_adapter_required",
      "Real GHL sandbox provisioning requires the HTTPS sandbox adapter.",
    );
  }
  const run = await dependencies.repository.getRun(runId);
  if (!run) {
    throw new GhlProvisioningInvariantError("run_not_found", "GHL provisioning run was not found.");
  }
  if (run.environment !== "sandbox") {
    throw new GhlProvisioningInvariantError(
      "ghl_sandbox_run_environment_required",
      "Real GHL sandbox provisioning accepts only sandbox-environment runs.",
    );
  }
  return executeProvisioningState(run, dependencies);
}

export async function requestGhlProvisioningReplay(
  runId: string,
  dependencies: GhlProvisioningDependencies,
) {
  const run = await dependencies.repository.getRun(runId);
  if (!run) {
    throw new GhlProvisioningInvariantError("run_not_found", "GHL provisioning run was not found.");
  }
  const now = nowFrom(dependencies);
  assertGhlReplayDue(run, now);
  if (!(run.resumeState === "location_create_requested" && run.lastReconciledAt)) {
    await dependencies.repository.prepareOutboxReplay({
      organizationId: run.organizationId,
      idempotencyKey: buildOperationIdempotencyKey(run, operationForResumeState(run.resumeState!)),
      now,
    });
  }
  const next = transitionGhlProvisioning(run, run.resumeState!, {
    lastErrorCode: null,
    lastErrorMessage: null,
  }, now);
  return saveTransition(dependencies.repository, run, next);
}

export async function requestGhlFunnelPublicationOperatorAction(
  runId: string,
  dependencies: Pick<GhlProvisioningDependencies, "repository" | "now">,
) {
  const run = await dependencies.repository.getRun(runId);
  if (!run) {
    throw new GhlProvisioningInvariantError("run_not_found", "GHL provisioning run was not found.");
  }
  const capability = GHL_CAPABILITY_MATRIX.funnelPublication;
  await dependencies.repository.openOperatorRequest({
    organizationId: run.organizationId,
    provisioningRunId: run.id,
    requestKind: "funnel_publication",
    blockerCode: "BLOCKED_EXTERNAL",
    idempotencyKey: `${run.idempotencyKey}:operator:funnel_publication`,
    details: {
      disposition: capability.disposition,
      providerCapabilityProven: false,
    },
  });
  return {
    status: "operator_action_required" as const,
    blockerCode: "BLOCKED_EXTERNAL" as const,
    providerMutationAttempted: false,
  };
}
