import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  GhlLocationAssignment,
  GhlProviderOutboxRecord,
  GhlProviderReceipt,
  GhlProvisioningRepository,
  GhlProvisioningRun,
  GhlSnapshotPersonalizationContract,
  GhlSnapshotManifest,
} from "@/lib/integrations/gohighlevel";
import type { Database } from "@/lib/supabase/types";

type JsonRecord = Record<string, unknown>;
type UntypedClient = {
  from: (table: string) => any;
  rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
};

export class GhlProvisioningPersistenceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GhlProvisioningPersistenceError";
    this.code = code;
  }
}

function db(client: SupabaseClient<Database>) {
  return client as unknown as UntypedClient;
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
  const result = asString(value);
  return result || null;
}

function assertRow(value: unknown, code: string, message: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GhlProvisioningPersistenceError(code, message);
  }
  return value as JsonRecord;
}

function firstRow(value: unknown) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function throwDatabaseError(error: { message: string; code?: string } | null, code: string): never {
  throw new GhlProvisioningPersistenceError(code, error?.message ?? "Unknown GHL persistence error.");
}

function mapManifest(row: JsonRecord): GhlSnapshotManifest {
  const requiredObjects = Array.isArray(row.required_objects)
    ? row.required_objects.map((item) => {
      const record = asRecord(item);
      const minimumCount = typeof record.minimumCount === "number"
        ? record.minimumCount
        : typeof record.minimum_count === "number"
          ? record.minimum_count
          : null;
      const providerObjectId = asString(record.providerObjectId)
        || asString(record.provider_object_id);
      return {
        kind: asString(record.kind) as GhlSnapshotManifest["requiredObjects"][number]["kind"],
        key: asString(record.key),
        ...(minimumCount !== null ? { minimumCount } : {}),
        ...(providerObjectId ? { providerObjectId } : {}),
      };
    })
    : [];

  const personalizationContract = row.personalization_contract
    && typeof row.personalization_contract === "object"
    && !Array.isArray(row.personalization_contract)
      ? row.personalization_contract as GhlSnapshotPersonalizationContract
      : null;

  return {
    id: asString(row.id),
    environment: asString(row.environment) as GhlSnapshotManifest["environment"],
    snapshotKey: asString(row.snapshot_key),
    snapshotVersion: asString(row.snapshot_version),
    providerSnapshotId: asString(row.provider_snapshot_id),
    installationMode: asString(row.installation_mode) === "preinstalled"
      ? "preinstalled"
      : "provider_api",
    ...(personalizationContract ? { personalizationContract } : {}),
    requiredObjects,
    status: asString(row.status) as GhlSnapshotManifest["status"],
  };
}

function mapRun(row: JsonRecord, manifest: GhlSnapshotManifest): GhlProvisioningRun {
  const metadata = asRecord(row.state_metadata);
  const locationProfile = asRecord(metadata.location_profile);
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    environment: asString(row.environment) as GhlProvisioningRun["environment"],
    activationEventId: asString(row.activation_event_id),
    installationId: asString(row.installation_id),
    snapshotManifest: manifest,
    locationProfile: {
      displayName: asString(locationProfile.display_name),
      country: asString(locationProfile.country),
      timezone: asString(locationProfile.timezone),
    },
    idempotencyKey: asString(row.idempotency_key),
    state: asString(row.state) as GhlProvisioningRun["state"],
    resumeState: asNullableString(row.resume_state) as GhlProvisioningRun["resumeState"],
    reconcileBeforeRetry: row.reconcile_before_retry === true,
    locationMappingId: asNullableString(row.location_mapping_id),
    providerLocationId: asNullableString(metadata.provider_location_id),
    attemptCount: Number(row.attempt_count ?? 0),
    maxAttempts: Number(row.max_attempts ?? 5),
    revision: Number(row.revision ?? 0),
    lastReconciledAt: asNullableString(row.last_reconciled_at),
    nextRetryAt: asNullableString(row.next_retry_at),
    lastErrorCode: asNullableString(row.last_error_code),
    lastErrorMessage: asNullableString(row.last_error_message),
    snapshotVerifiedAt: asNullableString(metadata.snapshot_verified_at),
    requiredObjectsVerifiedAt: asNullableString(metadata.required_objects_verified_at),
    requestedAt: asString(row.requested_at),
    readyAt: asNullableString(row.ready_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapOutbox(row: JsonRecord): GhlProviderOutboxRecord {
  const requestPayload = asRecord(row.request_payload);
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    provisioningRunId: asNullableString(row.provisioning_run_id),
    operation: asString(row.operation) as GhlProviderOutboxRecord["operation"],
    idempotencyKey: asString(row.idempotency_key),
    status: asString(row.status) as GhlProviderOutboxRecord["status"],
    requestPayload: requestPayload as GhlProviderOutboxRecord["requestPayload"],
    attemptCount: Number(row.attempt_count ?? 0),
    availableAt: asString(row.available_at),
    lastErrorCode: asNullableString(row.last_error_code),
    lockedBy: asNullableString(row.locked_by),
    leaseToken: asNullableString(row.lease_token),
    leaseGeneration: Number(row.lease_generation ?? 0),
    leaseExpiresAt: asNullableString(row.lease_expires_at),
  };
}

function mapReceipt(row: JsonRecord): GhlProviderReceipt {
  return {
    outboxId: asString(row.outbox_id),
    attemptNumber: Number(row.attempt_number ?? 0),
    outcome: asString(row.outcome) as GhlProviderReceipt["outcome"],
    providerRequestId: asNullableString(row.provider_request_id),
    providerReference: asNullableString(row.provider_reference),
    httpStatus: typeof row.http_status === "number" ? row.http_status : null,
    responseFingerprint: asNullableString(row.response_fingerprint),
    metadata: asRecord(row.receipt_metadata) as GhlProviderReceipt["metadata"],
    receivedAt: asString(row.received_at),
  };
}

function mapLocation(row: JsonRecord): GhlLocationAssignment {
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    installationId: asString(row.installation_id),
    environment: asString(row.environment) as GhlLocationAssignment["environment"],
    providerLocationId: asString(row.provider_location_id),
    snapshotManifestId: asString(row.snapshot_manifest_id),
    status: asString(row.status) as GhlLocationAssignment["status"],
    snapshotVerifiedAt: asNullableString(row.snapshot_verified_at),
    requiredObjectsVerifiedAt: asNullableString(row.required_objects_verified_at),
  };
}

function manifestMatchesRequest(
  stored: GhlSnapshotManifest,
  requested: GhlSnapshotManifest,
) {
  return stored.id === requested.id
    && stored.environment === requested.environment
    && stored.snapshotKey === requested.snapshotKey
    && stored.snapshotVersion === requested.snapshotVersion
    && stored.providerSnapshotId === requested.providerSnapshotId
    && stored.installationMode === (requested.installationMode ?? "provider_api")
    && stored.status === "approved"
    && requested.status === "approved"
    && canonicalJson(stored.personalizationContract ?? null)
      === canonicalJson(requested.personalizationContract ?? null)
    && canonicalJson(stored.requiredObjects) === canonicalJson(requested.requiredObjects);
}

function locationProfileMatchesRequest(
  stored: GhlProvisioningRun["locationProfile"],
  requested: GhlProvisioningRun["locationProfile"],
) {
  return stored.displayName === requested.displayName
    && stored.country === requested.country
    && stored.timezone === requested.timezone;
}

async function loadManifest(client: SupabaseClient<Database>, manifestId: string) {
  const { data, error } = await db(client)
    .from("ghl_snapshot_manifests")
    .select("*")
    .eq("id", manifestId)
    .maybeSingle();
  if (error) {
    throwDatabaseError(error, "ghl_snapshot_manifest_lookup_failed");
  }
  return mapManifest(assertRow(data, "ghl_snapshot_manifest_missing", "GHL snapshot manifest was not found."));
}

async function loadRun(client: SupabaseClient<Database>, runId: string) {
  const { data, error } = await db(client)
    .from("ghl_provisioning_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) {
    throwDatabaseError(error, "ghl_provisioning_run_lookup_failed");
  }
  if (!data) {
    return null;
  }
  const row = assertRow(data, "ghl_provisioning_run_invalid", "GHL provisioning run is invalid.");
  const manifest = await loadManifest(client, asString(row.snapshot_manifest_id));
  return mapRun(row, manifest);
}

export function createGhlProvisioningRepository(
  client: SupabaseClient<Database>,
): GhlProvisioningRepository {
  return {
    async getOrCreateRun(input) {
      const { data: tenant, error: tenantError } = await db(client)
        .from("ghl_workspace_tenants")
        .select("organization_id,status")
        .eq("organization_id", input.request.organizationId)
        .eq("status", "active")
        .maybeSingle();
      if (tenantError) {
        throwDatabaseError(tenantError, "ghl_tenant_lookup_failed");
      }
      if (!tenant) {
        throw new GhlProvisioningPersistenceError(
          "ghl_tenant_not_active",
          "Provisioning requires an active, explicit GHL workspace hierarchy binding.",
        );
      }

      const { data: existing, error: existingError } = await db(client)
        .from("ghl_provisioning_runs")
        .select("id")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (existingError) {
        throwDatabaseError(existingError, "ghl_provisioning_idempotency_lookup_failed");
      }
      if (existing) {
        const run = (await loadRun(client, asString(asRecord(existing).id)))!;
        if (
          run.organizationId !== input.request.organizationId
          || run.environment !== input.request.environment
          || run.activationEventId !== input.request.activationEventId
          || run.installationId !== input.request.installationId
          || !manifestMatchesRequest(run.snapshotManifest, input.request.snapshotManifest)
          || !locationProfileMatchesRequest(run.locationProfile, input.request.locationProfile)
        ) {
          throw new GhlProvisioningPersistenceError(
            "ghl_provisioning_idempotency_collision",
            "GHL provisioning idempotency key was reused with different immutable input.",
          );
        }
        return run;
      }

      const storedManifest = await loadManifest(client, input.request.snapshotManifest.id);
      if (
        !manifestMatchesRequest(storedManifest, input.request.snapshotManifest)
        || storedManifest.environment !== input.request.environment
      ) {
        throw new GhlProvisioningPersistenceError(
          "ghl_snapshot_manifest_mismatch",
          "Stored GHL snapshot manifest is not the exact approved request manifest.",
        );
      }

      const { data: created, error: createError } = await db(client)
        .from("ghl_provisioning_runs")
        .insert({
          organization_id: input.request.organizationId,
          environment: input.request.environment,
          activation_event_id: input.request.activationEventId,
          installation_id: input.request.installationId,
          snapshot_manifest_id: input.request.snapshotManifest.id,
          idempotency_key: input.idempotencyKey,
          state: "requested",
          state_metadata: {
            location_profile: {
              display_name: input.request.locationProfile.displayName,
              country: input.request.locationProfile.country,
              timezone: input.request.locationProfile.timezone,
            },
          },
          requested_at: input.now,
          updated_at: input.now,
        })
        .select("id")
        .maybeSingle();
      if (createError) {
        if (createError.code === "23505") {
          const { data: raced } = await db(client)
            .from("ghl_provisioning_runs")
            .select("id")
            .eq("idempotency_key", input.idempotencyKey)
            .maybeSingle();
          if (raced) {
            const run = (await loadRun(client, asString(asRecord(raced).id)))!;
            if (
              run.organizationId !== input.request.organizationId
              || run.environment !== input.request.environment
              || run.activationEventId !== input.request.activationEventId
              || run.installationId !== input.request.installationId
              || !manifestMatchesRequest(run.snapshotManifest, input.request.snapshotManifest)
              || !locationProfileMatchesRequest(run.locationProfile, input.request.locationProfile)
            ) {
              throw new GhlProvisioningPersistenceError(
                "ghl_provisioning_idempotency_collision",
                "GHL provisioning idempotency key was reused with different immutable input.",
              );
            }
            return run;
          }
        }
        throwDatabaseError(createError, "ghl_provisioning_create_failed");
      }
      return (await loadRun(client, asString(asRecord(created).id)))!;
    },

    getRun(runId) {
      return loadRun(client, runId);
    },

    async saveRun(run, expectedRevision) {
      const { data, error } = await db(client)
        .from("ghl_provisioning_runs")
        .update({
          state: run.state,
          resume_state: run.resumeState,
          reconcile_before_retry: run.reconcileBeforeRetry,
          location_mapping_id: run.locationMappingId,
          attempt_count: run.attemptCount,
          revision: run.revision,
          last_reconciled_at: run.lastReconciledAt,
          next_retry_at: run.nextRetryAt,
          last_error_code: run.lastErrorCode,
          last_error_message: run.lastErrorMessage,
          ready_at: run.readyAt,
          state_metadata: {
            location_profile: {
              display_name: run.locationProfile.displayName,
              country: run.locationProfile.country,
              timezone: run.locationProfile.timezone,
            },
            provider_location_id: run.providerLocationId,
            snapshot_verified_at: run.snapshotVerifiedAt,
            required_objects_verified_at: run.requiredObjectsVerifiedAt,
          },
          updated_at: run.updatedAt,
        })
        .eq("id", run.id)
        .eq("organization_id", run.organizationId)
        .eq("revision", expectedRevision)
        .select("id")
        .maybeSingle();
      if (error) {
        throwDatabaseError(error, "ghl_provisioning_save_failed");
      }
      if (!data) {
        throw new GhlProvisioningPersistenceError(
          "ghl_provisioning_stale_revision",
          "GHL provisioning run changed concurrently; reload before retrying.",
        );
      }
      return (await loadRun(client, run.id))!;
    },

    async ensureOutbox(input) {
      const { data: existing, error: existingError } = await db(client)
        .from("ghl_provider_outbox")
        .select("*")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (existingError) {
        throwDatabaseError(existingError, "ghl_outbox_lookup_failed");
      }
      if (existing) {
        const mapped = mapOutbox(asRecord(existing));
        if (
          mapped.organizationId !== input.run.organizationId
          || mapped.provisioningRunId !== input.run.id
          || mapped.operation !== input.operation
          || canonicalJson(mapped.requestPayload) !== canonicalJson(input.requestPayload)
        ) {
          throw new GhlProvisioningPersistenceError(
            "ghl_outbox_idempotency_collision",
            "GHL outbox idempotency key crossed a tenant or operation boundary.",
          );
        }
        return mapped;
      }

      const { data, error } = await db(client)
        .from("ghl_provider_outbox")
        .insert({
          organization_id: input.run.organizationId,
          provisioning_run_id: input.run.id,
          operation: input.operation,
          idempotency_key: input.idempotencyKey,
          request_payload: input.requestPayload,
          available_at: input.now,
        })
        .select("*")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") {
          const { data: raced } = await db(client)
            .from("ghl_provider_outbox")
            .select("*")
            .eq("idempotency_key", input.idempotencyKey)
            .maybeSingle();
          if (raced) {
            const mapped = mapOutbox(asRecord(raced));
            if (
              mapped.organizationId !== input.run.organizationId
              || mapped.provisioningRunId !== input.run.id
              || mapped.operation !== input.operation
              || canonicalJson(mapped.requestPayload) !== canonicalJson(input.requestPayload)
            ) {
              throw new GhlProvisioningPersistenceError(
                "ghl_outbox_idempotency_collision",
                "GHL outbox idempotency key crossed a tenant or operation boundary.",
              );
            }
            return mapped;
          }
        }
        throwDatabaseError(error, "ghl_outbox_create_failed");
      }
      return mapOutbox(assertRow(data, "ghl_outbox_missing", "GHL outbox record was not created."));
    },

    async claimOutbox(input) {
      const { data, error } = await db(client).rpc("claim_ghl_provider_outbox", {
        p_outbox_id: input.outboxId,
        p_organization_id: input.organizationId,
        p_worker_id: input.workerId,
        p_now: input.now,
        p_lease_ms: input.leaseMs,
      });
      if (error) {
        throwDatabaseError(error, "ghl_outbox_claim_failed");
      }
      const row = firstRow(data);
      return row ? mapOutbox(assertRow(row, "ghl_outbox_claim_invalid", "Claimed GHL outbox row is invalid.")) : null;
    },

    async getLatestReceipt(outboxId) {
      const { data, error } = await db(client)
        .from("ghl_provider_receipts")
        .select("*")
        .eq("outbox_id", outboxId)
        .order("attempt_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throwDatabaseError(error, "ghl_receipt_lookup_failed");
      }
      return data ? mapReceipt(asRecord(data)) : null;
    },

    async prepareOutboxReplay(input) {
      const { data, error } = await db(client).rpc("prepare_ghl_provider_outbox_replay", {
        p_organization_id: input.organizationId,
        p_idempotency_key: input.idempotencyKey,
        p_now: input.now,
      });
      if (error) {
        throwDatabaseError(error, "ghl_outbox_replay_prepare_failed");
      }
      if (!firstRow(data)) {
        throw new GhlProvisioningPersistenceError(
          "ghl_outbox_not_retryable",
          "Replay outbox is missing or not retryable.",
        );
      }
    },

    async settleOutbox(input) {
      const { data, error } = await db(client).rpc("settle_ghl_provider_outbox", {
        p_outbox_id: input.record.id,
        p_organization_id: input.record.organizationId,
        p_worker_id: input.lease.workerId,
        p_lease_token: input.lease.token,
        p_lease_generation: input.lease.generation,
        p_received_at: input.receipt.receivedAt,
        p_receipt_outcome: input.receipt.outcome,
        p_provider_request_id: input.receipt.providerRequestId,
        p_provider_reference: input.receipt.providerReference,
        p_http_status: input.receipt.httpStatus,
        p_response_fingerprint: input.receipt.responseFingerprint,
        p_receipt_metadata: input.receipt.metadata,
        p_outbox_status: input.status,
        p_available_at: input.availableAt,
        p_last_error_code: input.lastErrorCode,
      });
      if (error) {
        if (/lease expired or was superseded/i.test(error.message)) {
          throwDatabaseError(error, "ghl_outbox_lease_lost");
        }
        throwDatabaseError(error, "ghl_outbox_settlement_failed");
      }
      return mapOutbox(assertRow(
        firstRow(data),
        "ghl_outbox_lease_lost",
        "The GHL outbox lease expired or was superseded before settlement.",
      ));
    },

    async assignLocation(input) {
      const { data: tenant, error: tenantError } = await db(client)
        .from("ghl_workspace_tenants")
        .select("partner_id")
        .eq("organization_id", input.run.organizationId)
        .eq("status", "active")
        .maybeSingle();
      if (tenantError) {
        throwDatabaseError(tenantError, "ghl_tenant_lookup_failed");
      }
      if (!tenant) {
        throw new GhlProvisioningPersistenceError(
          "ghl_tenant_not_active",
          "GHL workspace hierarchy binding is missing or inactive.",
        );
      }
      const { data: installation, error: installationError } = await db(client)
        .from("ghl_installations")
        .select("owner_kind")
        .eq("id", input.run.installationId)
        .eq("environment", input.run.environment)
        .eq("status", "active")
        .maybeSingle();
      if (installationError) {
        throwDatabaseError(installationError, "ghl_installation_lookup_failed");
      }
      if (!installation) {
        throw new GhlProvisioningPersistenceError(
          "ghl_installation_not_active",
          "The requested GHL installation is missing or inactive.",
        );
      }

      const { data: existingWorkspace, error: workspaceError } = await db(client)
        .from("ghl_location_mappings")
        .select("*")
        .eq("organization_id", input.run.organizationId)
        .eq("environment", input.run.environment)
        .in("status", ["provisioning", "active"])
        .maybeSingle();
      if (workspaceError) {
        throwDatabaseError(workspaceError, "ghl_location_mapping_lookup_failed");
      }
      if (existingWorkspace) {
        const mapped = mapLocation(asRecord(existingWorkspace));
        if (mapped.providerLocationId !== input.providerLocationId) {
          throw new GhlProvisioningPersistenceError(
            "ghl_workspace_location_conflict",
            "Workspace already has a different active or provisioning GHL location.",
          );
        }
        return mapped;
      }

      const { data: existingLocation, error: locationError } = await db(client)
        .from("ghl_location_mappings")
        .select("*")
        .eq("environment", input.run.environment)
        .eq("provider_location_id", input.providerLocationId)
        .in("status", ["provisioning", "active"])
        .maybeSingle();
      if (locationError) {
        throwDatabaseError(locationError, "ghl_provider_location_lookup_failed");
      }
      if (existingLocation && asString(asRecord(existingLocation).organization_id) !== input.run.organizationId) {
        throw new GhlProvisioningPersistenceError(
          "ghl_provider_location_tenant_conflict",
          "Provider location is already assigned to another workspace.",
        );
      }

      const { data, error } = await db(client)
        .from("ghl_location_mappings")
        .insert({
          organization_id: input.run.organizationId,
          partner_id: asNullableString(asRecord(tenant).partner_id),
          installation_id: input.run.installationId,
          environment: input.run.environment,
          provider_location_id: input.providerLocationId,
          provisioning_owner: asString(asRecord(installation).owner_kind),
          snapshot_manifest_id: input.run.snapshotManifest.id,
          status: "provisioning",
          last_reconciled_at: input.now,
        })
        .select("*")
        .maybeSingle();
      if (error) {
        throwDatabaseError(error, "ghl_location_assignment_failed");
      }
      return mapLocation(assertRow(data, "ghl_location_assignment_missing", "GHL location mapping was not created."));
    },

    async markLocationVerified(input) {
      const patch: JsonRecord = {};
      if (input.snapshotVerifiedAt) {
        patch.snapshot_verified_at = input.snapshotVerifiedAt;
      }
      if (input.requiredObjectsVerifiedAt) {
        patch.required_objects_verified_at = input.requiredObjectsVerifiedAt;
        patch.status = "active";
      }
      const { data, error } = await db(client)
        .from("ghl_location_mappings")
        .update(patch)
        .eq("id", input.mappingId)
        .select("*")
        .maybeSingle();
      if (error) {
        throwDatabaseError(error, "ghl_location_verification_save_failed");
      }
      return mapLocation(assertRow(data, "ghl_location_mapping_missing", "GHL location mapping was not found."));
    },

    async openOperatorRequest(request) {
      const { data: existing, error: existingError } = await db(client)
        .from("ghl_operator_requests")
        .select("organization_id,provisioning_run_id,request_kind")
        .eq("idempotency_key", request.idempotencyKey)
        .maybeSingle();
      if (existingError) {
        throwDatabaseError(existingError, "ghl_operator_request_lookup_failed");
      }
      if (existing) {
        const row = asRecord(existing);
        if (
          asString(row.organization_id) !== request.organizationId
          || asString(row.provisioning_run_id) !== request.provisioningRunId
          || asString(row.request_kind) !== request.requestKind
        ) {
          throw new GhlProvisioningPersistenceError(
            "ghl_operator_request_idempotency_collision",
            "GHL operator request idempotency key crossed a tenant or target boundary.",
          );
        }
        return;
      }

      const { error } = await db(client)
        .from("ghl_operator_requests")
        .insert({
          organization_id: request.organizationId,
          provisioning_run_id: request.provisioningRunId,
          request_kind: request.requestKind,
          blocker_code: request.blockerCode,
          idempotency_key: request.idempotencyKey,
          details: request.details,
        });
      if (error && error.code !== "23505") {
        throwDatabaseError(error, "ghl_operator_request_create_failed");
      }
    },
  };
}
