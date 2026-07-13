import { createHash } from "node:crypto";
import type {
  GhlLocationCreateResult,
  GhlLocationReconcileResult,
  GhlProviderAdapter,
  GhlRequiredObjectsResult,
  GhlSnapshotInstallResult,
  GhlSnapshotStatusResult,
} from "./types";
import { isExactGhlLocationCreateContract } from "./snapshot-create-contract";

function fakeReconciliationFingerprint(input: {
  requestFingerprint: string;
  outcome: string;
  providerLocationId: string | null;
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export type FakeGhlCreateOutcome =
  | "success"
  | "timeout_after_create"
  | "timeout_before_create"
  | "retryable_failure"
  | "operator_action_required";

export type FakeGhlAdapterScenario = {
  createOutcome?: FakeGhlCreateOutcome;
  reconcileUnknown?: boolean;
  snapshotInstallOutcome?: "accepted" | "succeeded" | "retryable_failure" | "operator_action_required";
  snapshotStatuses?: Array<"pending" | "ready" | "retryable_failure" | "operator_action_required">;
  missingRequiredObjectKeys?: string[];
};

export type FakeGhlCall = {
  operation:
    | "location_create"
    | "location_reconcile"
    | "location_display_name_finalize"
    | "snapshot_install"
    | "snapshot_status"
    | "required_objects_verify";
  idempotencyKey: string | null;
  providerLocationId: string | null;
  providerSnapshotId?: string | null;
  requestFingerprint?: string | null;
};

export class FakeGhlAdapter implements GhlProviderAdapter {
  readonly kind = "fake" as const;
  readonly networkAccess = "none" as const;

  private scenario: Required<FakeGhlAdapterScenario>;
  private requestSequence = 0;
  private locationSequence = 0;
  private readonly locationsByIdempotencyKey = new Map<string, string>();
  private readonly snapshotStatusQueues = new Map<string, Required<FakeGhlAdapterScenario>["snapshotStatuses"]>();
  readonly calls: FakeGhlCall[] = [];

  constructor(scenario: FakeGhlAdapterScenario = {}) {
    this.scenario = {
      createOutcome: scenario.createOutcome ?? "success",
      reconcileUnknown: scenario.reconcileUnknown ?? false,
      snapshotInstallOutcome: scenario.snapshotInstallOutcome ?? "accepted",
      snapshotStatuses: scenario.snapshotStatuses ?? ["ready"],
      missingRequiredObjectKeys: scenario.missingRequiredObjectKeys ?? [],
    };
  }

  setCreateOutcome(outcome: FakeGhlCreateOutcome) {
    this.scenario = { ...this.scenario, createOutcome: outcome };
  }

  private nextRequestId() {
    this.requestSequence += 1;
    return `fake-ghl-request-${this.requestSequence}`;
  }

  private ensureLocation(idempotencyKey: string) {
    const existing = this.locationsByIdempotencyKey.get(idempotencyKey);
    if (existing) {
      return existing;
    }

    this.locationSequence += 1;
    const providerLocationId = `fake-location-${this.locationSequence}`;
    this.locationsByIdempotencyKey.set(idempotencyKey, providerLocationId);
    return providerLocationId;
  }

  async createLocation(input: Parameters<GhlProviderAdapter["createLocation"]>[0]): Promise<GhlLocationCreateResult> {
    this.calls.push({
      operation: "location_create",
      idempotencyKey: input.idempotencyKey,
      providerLocationId: null,
      providerSnapshotId: input.snapshotManifest.providerSnapshotId,
      requestFingerprint: input.requestFingerprint,
    });
    const requestId = this.nextRequestId();
    if (
      input.snapshotManifest.environment !== input.environment
      || input.snapshotManifest.status !== "approved"
      || !isExactGhlLocationCreateContract(input)
    ) {
      return {
        outcome: "operator_action_required",
        errorCode: "fake_location_snapshot_contract_mismatch",
        safeMessage: "The fake location request did not match its approved snapshot fingerprint.",
        providerRequestId: requestId,
        httpStatus: null,
      };
    }
    const existing = this.locationsByIdempotencyKey.get(input.idempotencyKey);

    if (existing) {
      return {
        outcome: "succeeded",
        providerLocationId: existing,
        providerRequestId: requestId,
        providerReference: input.idempotencyKey,
        httpStatus: 200,
      };
    }

    if (this.scenario.createOutcome === "success") {
      return {
        outcome: "succeeded",
        providerLocationId: this.ensureLocation(input.idempotencyKey),
        providerRequestId: requestId,
        providerReference: input.idempotencyKey,
        httpStatus: 201,
      };
    }

    if (this.scenario.createOutcome === "timeout_after_create") {
      this.ensureLocation(input.idempotencyKey);
      return {
        outcome: "uncertain",
        errorCode: "fake_timeout_after_create",
        safeMessage: "The fake provider timed out after recording the location.",
        providerRequestId: requestId,
        httpStatus: null,
      };
    }

    if (this.scenario.createOutcome === "timeout_before_create") {
      return {
        outcome: "uncertain",
        errorCode: "fake_timeout_before_create",
        safeMessage: "The fake provider timed out before recording a location.",
        providerRequestId: requestId,
        httpStatus: null,
      };
    }

    if (this.scenario.createOutcome === "operator_action_required") {
      return {
        outcome: "operator_action_required",
        errorCode: "fake_agency_capability_missing",
        safeMessage: "The fake installation lacks the modeled agency capability.",
        providerRequestId: requestId,
        httpStatus: 403,
      };
    }

    return {
      outcome: "retryable_failure",
      errorCode: "fake_provider_unavailable",
      safeMessage: "The fake provider is temporarily unavailable.",
      providerRequestId: requestId,
      httpStatus: 503,
    };
  }

  async reconcileLocationCreate(
    input: Parameters<GhlProviderAdapter["reconcileLocationCreate"]>[0],
  ): Promise<GhlLocationReconcileResult> {
    this.calls.push({
      operation: "location_reconcile",
      idempotencyKey: input.idempotencyKey,
      providerLocationId: null,
      requestFingerprint: input.requestFingerprint,
    });
    const requestId = this.nextRequestId();
    const providerLocationId = this.locationsByIdempotencyKey.get(input.idempotencyKey);

    if (providerLocationId) {
      return {
        outcome: "found",
        providerLocationId,
        providerRequestId: requestId,
        requestFingerprint: input.requestFingerprint,
        responseFingerprint: fakeReconciliationFingerprint({
          requestFingerprint: input.requestFingerprint,
          outcome: "found",
          providerLocationId,
        }),
      };
    }

    if (this.scenario.reconcileUnknown) {
      return {
        outcome: "uncertain",
        errorCode: "fake_reconciliation_inconclusive",
        safeMessage: "The fake provider could not conclusively reconcile the request.",
        providerRequestId: requestId,
        requestFingerprint: input.requestFingerprint,
        responseFingerprint: fakeReconciliationFingerprint({
          requestFingerprint: input.requestFingerprint,
          outcome: "uncertain",
          providerLocationId: null,
        }),
      };
    }

    return {
      outcome: "not_found",
      providerRequestId: requestId,
      requestFingerprint: input.requestFingerprint,
      responseFingerprint: fakeReconciliationFingerprint({
        requestFingerprint: input.requestFingerprint,
        outcome: "not_found",
        providerLocationId: null,
      }),
    };
  }

  async finalizeLocationDisplayName(
    input: Parameters<GhlProviderAdapter["finalizeLocationDisplayName"]>[0],
  ) {
    this.calls.push({
      operation: "location_display_name_finalize",
      idempotencyKey: input.idempotencyKey,
      providerLocationId: input.providerLocationId,
      requestFingerprint: input.requestFingerprint,
    });
    return {
      outcome: "succeeded" as const,
      providerRequestId: this.nextRequestId(),
      requestFingerprint: input.requestFingerprint,
      responseFingerprint: fakeReconciliationFingerprint({
        requestFingerprint: input.requestFingerprint,
        outcome: "display_name_verified",
        providerLocationId: input.providerLocationId,
      }),
      httpStatus: 200,
    };
  }

  async installSnapshot(
    input: Parameters<GhlProviderAdapter["installSnapshot"]>[0],
  ): Promise<GhlSnapshotInstallResult> {
    this.calls.push({
      operation: "snapshot_install",
      idempotencyKey: input.idempotencyKey,
      providerLocationId: input.providerLocationId,
    });
    const requestId = this.nextRequestId();

    if (this.scenario.snapshotInstallOutcome === "retryable_failure") {
      return {
        outcome: "retryable_failure",
        errorCode: "fake_snapshot_provider_unavailable",
        safeMessage: "The fake snapshot service is temporarily unavailable.",
        providerRequestId: requestId,
        httpStatus: 503,
      };
    }

    if (this.scenario.snapshotInstallOutcome === "operator_action_required") {
      return {
        outcome: "operator_action_required",
        errorCode: "fake_snapshot_not_authorized",
        safeMessage: "The fake installation is not authorized for the requested snapshot.",
        providerRequestId: requestId,
        httpStatus: 403,
      };
    }

    this.snapshotStatusQueues.set(
      `${input.providerLocationId}:${input.manifest.id}`,
      [...this.scenario.snapshotStatuses],
    );

    return {
      outcome: this.scenario.snapshotInstallOutcome,
      providerRequestId: requestId,
      providerReference: `${input.providerLocationId}:${input.manifest.providerSnapshotId}`,
      httpStatus: this.scenario.snapshotInstallOutcome === "accepted" ? 202 : 200,
    };
  }

  async getSnapshotStatus(
    input: Parameters<GhlProviderAdapter["getSnapshotStatus"]>[0],
  ): Promise<GhlSnapshotStatusResult> {
    this.calls.push({
      operation: "snapshot_status",
      idempotencyKey: null,
      providerLocationId: input.providerLocationId,
    });
    const requestId = this.nextRequestId();
    const queueKey = `${input.providerLocationId}:${input.manifest.id}`;
    const queue = this.snapshotStatusQueues.get(queueKey) ?? [...this.scenario.snapshotStatuses];
    const status = queue.length > 1 ? queue.shift()! : (queue[0] ?? "ready");
    this.snapshotStatusQueues.set(queueKey, queue);

    if (status === "retryable_failure") {
      return {
        outcome: "retryable_failure",
        errorCode: "fake_snapshot_status_unavailable",
        safeMessage: "The fake snapshot status endpoint is temporarily unavailable.",
        providerRequestId: requestId,
      };
    }

    if (status === "operator_action_required") {
      return {
        outcome: "operator_action_required",
        errorCode: "fake_snapshot_install_failed",
        safeMessage: "The fake provider reported a terminal snapshot installation failure.",
        providerRequestId: requestId,
      };
    }

    return {
      outcome: status,
      providerRequestId: requestId,
      providerReference: `${input.providerLocationId}:${input.manifest.providerSnapshotId}`,
    };
  }

  async verifyRequiredObjects(
    input: Parameters<GhlProviderAdapter["verifyRequiredObjects"]>[0],
  ): Promise<GhlRequiredObjectsResult> {
    this.calls.push({
      operation: "required_objects_verify",
      idempotencyKey: null,
      providerLocationId: input.providerLocationId,
    });
    const requestId = this.nextRequestId();
    const requiredKeys = input.manifest.requiredObjects.map((object) => `${object.kind}:${object.key}`);
    const missing = new Set(this.scenario.missingRequiredObjectKeys);
    const missingKeys = requiredKeys.filter((key) => missing.has(key));
    const verifiedKeys = requiredKeys.filter((key) => !missing.has(key));

    return missingKeys.length > 0
      ? { outcome: "missing", verifiedKeys, missingKeys, providerRequestId: requestId }
      : { outcome: "verified", verifiedKeys, providerRequestId: requestId };
  }
}
