import assert from "node:assert/strict";
import {
  GHL_PERIODIC_FORM_SWEEP_CADENCE_MINUTES,
  GHL_PERIODIC_FORM_SWEEP_DEFAULT_CONCURRENCY,
  GHL_PERIODIC_FORM_SWEEP_DEFAULT_MAX_ITEMS,
  GHL_PERIODIC_FORM_SWEEP_MAX_READ_SECONDS,
  processGhlPeriodicFormSweepBatch,
} from "../src/lib/services/ghl-periodic-form-sweep-service";

type Filters = Record<string, unknown>;
type Row = Record<string, unknown>;

const now = new Date().toISOString();
let sweepRuntimeEnabled = true;
const gate = {
  enabled: true,
  providerEnvironment: "sandbox",
  deploymentTarget: "staging" as const,
  nodeEnv: "test",
  vercelEnv: "preview",
  isolatedDatabase: true,
  actualProjectRef: "aaaaaaaaaaaaaaaaaaaa",
  expectedProjectRef: "aaaaaaaaaaaaaaaaaaaa",
  providerAttestation: "DEALFLOW_GHL_SANDBOX_ONLY_V1",
  baseUrl: "https://services.leadconnectorhq.com",
};

function id(prefix: string, index: number) {
  return `${prefix}-${String(index).padStart(4, "0")}`;
}

function queryResult(table: string, columns: string, filters: Filters) {
  const organizationId = String(filters.organization_id ?? "");
  const index = Number(organizationId.split("-").at(-1) ?? 0);
  const mappingId = id("mapping", index);
  const base: Record<string, { data: unknown; error: null }> = {
    ghl_runtime_controls: { data: { environment: "sandbox", inbound_form_reconciliation_enabled: true, inbound_form_sweep_enabled: sweepRuntimeEnabled }, error: null },
    ghl_workspace_tenants: { data: { organization_id: organizationId, tenant_kind: "direct_realtor", partner_id: null, status: "active" }, error: null },
    ghl_installations: { data: { id: id("installation", index), environment: "sandbox", provider_agency_id: "sandbox-agency", encrypted_credential_ref: "env:GHL_SANDBOX_AGENCY_TOKEN", status: "active" }, error: null },
    ghl_snapshot_manifests: { data: { id: id("manifest", index), environment: "sandbox", installation_id: id("installation", index), provider_snapshot_id: "snapshot-001", required_objects: [{ kind: "tag", key: "lead", providerObjectId: "tag-001" }], installation_mode: "preinstalled", status: "approved" }, error: null },
    workspace_ghl_mapping: { data: [], error: null },
  };
  if (table === "ghl_location_mappings") {
    return {
      data: columns.includes("forms_readonly_credential_ref")
        ? { id: mappingId, organization_id: organizationId, environment: "sandbox", provider_location_id: id("location", index), status: "active", forms_readonly_credential_ref: "env:GHL_SANDBOX_LOCATION_TOKEN", forms_readonly_capabilities: ["forms.readonly"], forms_readonly_scope_attested_at: now }
        : columns.includes("forms_readonly_credential_generation")
          ? { id: mappingId, organization_id: organizationId, environment: "sandbox", provider_location_id: id("location", index), status: "active", forms_readonly_credential_generation: 1, forms_readonly_scope_attested_at: now }
          : { id: mappingId, organization_id: organizationId, installation_id: id("installation", index), environment: "sandbox", provider_location_id: id("location", index), snapshot_manifest_id: id("manifest", index), status: "active", snapshot_verified_at: now, required_objects_verified_at: now },
      error: null,
    };
  }
  return base[table] ?? { data: null, error: null };
}

function createQuery(table: string) {
  let columns = "";
  const filters: Filters = {};
  const result = () => queryResult(table, columns, filters);
  const query: any = {
    select(value: string) { columns = value; return query; },
    eq(key: string, value: unknown) { filters[key] = value; return query; },
    not() { return query; },
    maybeSingle: async () => result(),
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(result()).then(resolve, reject);
    },
  };
  return query;
}

async function main() {
  const total = GHL_PERIODIC_FORM_SWEEP_DEFAULT_MAX_ITEMS;
  let nextClaim = 0;
  let liveLeases = 0;
  let maximumLiveLeases = 0;
  let providerCalls = 0;
  let maximumProviderConcurrency = 0;
  let providerConcurrency = 0;
  let syncClaims = 0;
  let validateCalls = 0;
  let completed = 0;
  let failed = 0;

  const client = {
    from: (table: string) => createQuery(table),
    rpc: async (name: string, parameters: Row) => {
      if (name === "claim_ghl_form_sweep_attestation_refresh_batch_v1") return { data: [], error: null };
      if (name === "summarize_ghl_form_sweep_health_v1") return { data: [{
        active_cursor_count: 73, backfill_active_count: 1, lag_warning_count: 2,
        cursor_operator_required_count: 1, retired_cursor_count: 3,
        max_lag_seconds: 7_200, refresh_due_count: 0,
        refresh_operator_required_count: 1,
      }], error: null };
      if (name === "claim_next_ghl_inbound_form_sweep_v1") {
        if (parameters.p_sync_registry === true) syncClaims += 1;
        if (nextClaim >= total) return { data: [], error: null };
        const index = nextClaim;
        nextClaim += 1;
        liveLeases += 1;
        maximumLiveLeases = Math.max(maximumLiveLeases, liveLeases);
        return { data: [{
          run_id: id("run", index), cursor_id: id("cursor", index),
          organization_id: id("organization", index), location_mapping_id: id("mapping", index),
          provider_location_id: id("location", index), provider_form_id: "form-001",
          allowed_field_ids: ["field-001"], route_fingerprint: "a".repeat(64),
          authority_fingerprint: "b".repeat(64), credential_generation: 1,
          window_start: new Date(Date.now() - 20 * 60_000).toISOString(),
          window_end: new Date(Date.now() - 5 * 60_000).toISOString(),
          attempt_count: 1, lease_token: id("lease", index), lease_generation: 1,
        }], error: null };
      }
      if (name === "validate_ghl_inbound_form_sweep_dispatch_v1") {
        validateCalls += 1;
        if (parameters.p_run_id === id("run", 5)) return { data: null, error: { message: "route changed" } };
        return { data: true, error: null };
      }
      if (name === "complete_ghl_inbound_form_sweep_v1") {
        if (parameters.p_run_id === id("run", 6)) return { data: null, error: { message: "synthetic settlement loss" } };
        liveLeases -= 1;
        completed += 1;
        return { data: { status: "succeeded" }, error: null };
      }
      if (name === "fail_ghl_inbound_form_sweep_v1") {
        if (parameters.p_run_id !== id("run", 6)) liveLeases -= 1;
        if (parameters.p_run_id === id("run", 6)) return { data: null, error: { message: "synthetic poison row" } };
        failed += 1;
        return { data: { status: parameters.p_disposition }, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };

  const result = await processGhlPeriodicFormSweepBatch({
    client: client as any,
    environment: "sandbox",
    sandboxGate: gate,
    now: () => new Date().toISOString(),
    providerFactory: () => ({
      kind: "sandbox" as const,
      networkAccess: "https" as const,
      verifyFormSubmissionsReadScope: async () => ({ outcome: "succeeded" as const, providerMutationAttempted: false }),
      readPeriodicFormSubmissionWindow: async () => {
        providerCalls += 1;
        providerConcurrency += 1;
        maximumProviderConcurrency = Math.max(maximumProviderConcurrency, providerConcurrency);
        await new Promise((resolve) => setTimeout(resolve, 2));
        providerConcurrency -= 1;
        return {
          outcome: "succeeded" as const,
          submissions: [], providerRequestIds: [], responseFingerprint: "c".repeat(64),
          requestCount: 1, pageCount: 1, observedTotal: 0, providerMutationAttempted: false as const,
        };
      },
    }),
  });

  assert.equal(result.processed, total, "the real default cap must be exercised");
  assert.equal(syncClaims, 1, "registry maintenance must run once per batch, not once per route");
  assert.ok(maximumLiveLeases <= GHL_PERIODIC_FORM_SWEEP_DEFAULT_CONCURRENCY, "claims must be just-in-time per worker");
  assert.equal(maximumProviderConcurrency, GHL_PERIODIC_FORM_SWEEP_DEFAULT_CONCURRENCY);
  assert.equal(providerCalls, total - 1, "stale route must be rejected before any provider call");
  assert.equal(validateCalls, (total - 1) * 2 + 1, "every safe read has pre/post-resolution DB fences");
  assert.equal(completed, total - 2);
  assert.equal(failed, 1);
  assert.equal(result.results.length, total);
  assert.equal(liveLeases, 1, "only the synthetic double-settlement-loss lease may remain for DB expiry recovery");
  assert.equal(result.results.filter((row) => row.outcome === "isolated_failure").length, 1);
  assert.deepEqual(result.lagAlertCodes, [
    "ghl_form_sweep_backfill_active",
    "ghl_form_sweep_lag_sla_warning",
    "ghl_form_sweep_cursor_operator_action_required",
    "ghl_form_sweep_refresh_operator_action_required",
  ]);
  assert.equal(result.healthSummary.maxLagSeconds, 7_200);

  // The sweep kill switch must fence the refresh lane before any RPC claim or
  // provider construction, even while reconciliation remains enabled.
  sweepRuntimeEnabled = false;
  let disabledRpcCalls = 0;
  let disabledProviderConstructions = 0;
  const disabled = await processGhlPeriodicFormSweepBatch({
    client: {
      from: (table: string) => createQuery(table),
      rpc: async () => { disabledRpcCalls += 1; return { data: [], error: null }; },
    } as any,
    environment: "sandbox",
    sandboxGate: gate,
    providerFactory: () => {
      disabledProviderConstructions += 1;
      throw new Error("provider must not be constructed while the sweep gate is closed");
    },
  });
  assert.equal(disabled.status, "blocked");
  assert.equal(disabled.blockedReason, "ghl_form_sweep_database_gate_closed");
  assert.equal(disabledRpcCalls, 0);
  assert.equal(disabledProviderConstructions, 0);

  // A near deadline must be checked before any refresh or sweep lease is
  // claimed, leaving no processing rows behind for lease-expiry cleanup.
  sweepRuntimeEnabled = true;
  let nearDeadlineClaimCalls = 0;
  const nearDeadline = await processGhlPeriodicFormSweepBatch({
    client: {
      from: (table: string) => createQuery(table),
      rpc: async (name: string) => {
        if (name === "summarize_ghl_form_sweep_health_v1") return { data: [{
          active_cursor_count: 0, backfill_active_count: 0, lag_warning_count: 0,
          cursor_operator_required_count: 0, retired_cursor_count: 0,
          max_lag_seconds: 0, refresh_due_count: 0, refresh_operator_required_count: 0,
        }], error: null };
        nearDeadlineClaimCalls += 1;
        return { data: [], error: null };
      },
    } as any,
    environment: "sandbox",
    sandboxGate: gate,
    deadlineAtMs: Date.now() + 30_000,
    minimumClaimBudgetMs: 45_000,
    providerFactory: () => { throw new Error("deadline-fenced provider must not be constructed"); },
  });
  assert.equal(nearDeadline.status, "complete");
  assert.equal(nearDeadline.processed, 0);
  assert.equal(nearDeadline.deadlineExhausted, true);
  assert.equal(nearDeadlineClaimCalls, 0);

  let refreshClaimed = false;
  let refreshFailed = 0;
  let refreshGateFlipProviderConstructions = 0;
  const refreshGateFlip = await processGhlPeriodicFormSweepBatch({
    client: {
      from: (table: string) => createQuery(table),
      rpc: async (name: string) => {
        if (name === "claim_ghl_form_sweep_attestation_refresh_batch_v1") {
          if (refreshClaimed) return { data: [], error: null };
          refreshClaimed = true;
          return { data: [{
            state_id: "refresh-state-001", organization_id: id("organization", 1),
            location_mapping_id: id("mapping", 1), provider_location_id: id("location", 1),
            credential_generation: 1, verified_form_ids: ["form-001"],
            attempt_count: 1, lease_token: "refresh-lease-001", lease_generation: 1,
          }], error: null };
        }
        if (name === "validate_ghl_form_sweep_attestation_refresh_dispatch_v1") {
          return { data: null, error: { message: "synthetic sweep gate closed after claim" } };
        }
        if (name === "fail_ghl_form_sweep_attestation_refresh_v1") {
          refreshFailed += 1;
          return { data: { status: "due" }, error: null };
        }
        if (name === "claim_next_ghl_inbound_form_sweep_v1") return { data: [], error: null };
        if (name === "summarize_ghl_form_sweep_health_v1") return { data: [{
          active_cursor_count: 0, backfill_active_count: 0, lag_warning_count: 0,
          cursor_operator_required_count: 0, retired_cursor_count: 0,
          max_lag_seconds: 0, refresh_due_count: 1, refresh_operator_required_count: 0,
        }], error: null };
        throw new Error(`Unexpected refresh gate-flip RPC ${name}`);
      },
    } as any,
    environment: "sandbox",
    sandboxGate: gate,
    workerId: "refresh-gate-flip",
    maxAttestationRefreshItems: 1,
    providerFactory: () => {
      refreshGateFlipProviderConstructions += 1;
      throw new Error("provider must not be constructed after the DB refresh fence changes");
    },
  });
  assert.equal(refreshGateFlip.status, "complete");
  assert.equal(refreshGateFlip.refreshAttempted, 1);
  assert.equal(refreshFailed, 1);
  assert.equal(refreshGateFlipProviderConstructions, 0);

  // A refresh failure whose DB settlement also fails owns an orphaned lease.
  // That worker must stop immediately instead of claiming and orphaning a
  // second row in the same invocation; another cron worker can recover after
  // the bounded lease expires.
  let refreshPoisonClaimCalls = 0;
  let refreshPoisonFailureCalls = 0;
  let refreshPoisonProviderConstructions = 0;
  const refreshPoison = await processGhlPeriodicFormSweepBatch({
    client: {
      from: (table: string) => createQuery(table),
      rpc: async (name: string) => {
        if (name === "claim_ghl_form_sweep_attestation_refresh_batch_v1") {
          refreshPoisonClaimCalls += 1;
          return { data: [{
            state_id: id("refresh-poison-state", refreshPoisonClaimCalls),
            organization_id: id("organization", refreshPoisonClaimCalls),
            location_mapping_id: id("mapping", refreshPoisonClaimCalls),
            provider_location_id: id("location", refreshPoisonClaimCalls),
            credential_generation: 1,
            verified_form_ids: ["form-001"],
            attempt_count: 1,
            lease_token: id("refresh-poison-lease", refreshPoisonClaimCalls),
            lease_generation: 1,
          }], error: null };
        }
        if (name === "validate_ghl_form_sweep_attestation_refresh_dispatch_v1") {
          return { data: null, error: { message: "synthetic refresh poison" } };
        }
        if (name === "fail_ghl_form_sweep_attestation_refresh_v1") {
          refreshPoisonFailureCalls += 1;
          return { data: null, error: { message: "synthetic refresh settlement loss" } };
        }
        if (name === "claim_next_ghl_inbound_form_sweep_v1") return { data: [], error: null };
        if (name === "summarize_ghl_form_sweep_health_v1") return { data: [{
          active_cursor_count: 0, backfill_active_count: 0, lag_warning_count: 0,
          cursor_operator_required_count: 0, retired_cursor_count: 0,
          max_lag_seconds: 0, refresh_due_count: 1, refresh_operator_required_count: 0,
        }], error: null };
        throw new Error(`Unexpected refresh poison RPC ${name}`);
      },
    } as any,
    environment: "sandbox",
    sandboxGate: gate,
    workerId: "refresh-poison-worker",
    maxAttestationRefreshItems: 2,
    attestationRefreshConcurrency: 1,
    providerFactory: () => {
      refreshPoisonProviderConstructions += 1;
      throw new Error("provider must not be constructed for the synthetic refresh poison");
    },
  });
  assert.equal(refreshPoison.status, "complete");
  assert.equal(refreshPoisonClaimCalls, 1, "a refresh worker with settlement loss must stop before claiming a second row");
  assert.equal(refreshPoisonFailureCalls, 1);
  assert.equal(refreshPoisonProviderConstructions, 0);
  assert.equal(refreshPoison.refreshAttempted, 1);

  // Eight safe overlapping invocations consume the full 600-route realtor
  // fleet exactly once at the real 75-item cap. The shared claim ledger models
  // SKIP LOCKED ownership and proves there are no duplicate provider reads.
  const fleetSize = 600;
  let fleetCursor = 0;
  const fleetClaimed = new Set<string>();
  const fleetRead = new Set<string>();
  let fleetCompleted = 0;
  const fleetClient = {
    from: (table: string) => createQuery(table),
    rpc: async (name: string, parameters: Row) => {
      if (name === "claim_ghl_form_sweep_attestation_refresh_batch_v1") return { data: [], error: null };
      if (name === "summarize_ghl_form_sweep_health_v1") return { data: [{
        active_cursor_count: fleetSize, backfill_active_count: 0, lag_warning_count: 0,
        cursor_operator_required_count: 0, retired_cursor_count: 0,
        max_lag_seconds: 0, refresh_due_count: 0, refresh_operator_required_count: 0,
      }], error: null };
      if (name === "claim_next_ghl_inbound_form_sweep_v1") {
        if (fleetCursor >= fleetSize) return { data: [], error: null };
        const index = fleetCursor++;
        const runId = id("fleet-run", index);
        assert.equal(fleetClaimed.has(runId), false, "a fleet route was claimed twice");
        fleetClaimed.add(runId);
        return { data: [{
          run_id: runId, cursor_id: id("fleet-cursor", index),
          organization_id: id("organization", index), location_mapping_id: id("mapping", index),
          provider_location_id: id("location", index), provider_form_id: "form-001",
          allowed_field_ids: ["field-001"], route_fingerprint: "d".repeat(64),
          authority_fingerprint: "e".repeat(64), credential_generation: 1,
          window_start: new Date(Date.now() - 20 * 60_000).toISOString(),
          window_end: new Date(Date.now() - 5 * 60_000).toISOString(),
          attempt_count: 1, lease_token: id("fleet-lease", index), lease_generation: 1,
        }], error: null };
      }
      if (name === "validate_ghl_inbound_form_sweep_dispatch_v1") return { data: true, error: null };
      if (name === "complete_ghl_inbound_form_sweep_v1") {
        fleetCompleted += 1;
        return { data: { status: "succeeded" }, error: null };
      }
      if (name === "fail_ghl_inbound_form_sweep_v1") {
        throw new Error(`unexpected fleet failure ${String(parameters.p_error_code)}`);
      }
      throw new Error(`Unexpected fleet RPC ${name}`);
    },
  };
  const fleetResults = await Promise.all(Array.from({ length: 8 }, (_, invocation) =>
    processGhlPeriodicFormSweepBatch({
      client: fleetClient as any,
      environment: "sandbox",
      sandboxGate: gate,
      workerId: `fleet-worker-${invocation}`,
      providerFactory: () => ({
        kind: "sandbox" as const,
        networkAccess: "https" as const,
        verifyFormSubmissionsReadScope: async () => ({ outcome: "succeeded" as const, providerMutationAttempted: false }),
        readPeriodicFormSubmissionWindow: async (read) => {
          const routeKey = `${read.providerLocationId}:${read.providerFormId}`;
          assert.equal(fleetRead.has(routeKey), false, "a fleet route reached the provider twice");
          fleetRead.add(routeKey);
          await new Promise((resolve) => setTimeout(resolve, 1));
          return {
            outcome: "succeeded" as const,
            submissions: [], providerRequestIds: [], responseFingerprint: "f".repeat(64),
            requestCount: 1, pageCount: 1, observedTotal: 0, providerMutationAttempted: false as const,
          };
        },
      }),
    })
  ));
  assert.equal(fleetResults.every((batch) => batch.processed === 75), true);
  assert.equal(fleetClaimed.size, fleetSize);
  assert.equal(fleetRead.size, fleetSize);
  assert.equal(fleetCompleted, fleetSize);

  const conservativePerMinute = GHL_PERIODIC_FORM_SWEEP_DEFAULT_CONCURRENCY
    * (60 / GHL_PERIODIC_FORM_SWEEP_MAX_READ_SECONDS);
  const supportedRoutesPerCadence = conservativePerMinute * GHL_PERIODIC_FORM_SWEEP_CADENCE_MINUTES;
  assert.equal(conservativePerMinute, 50);
  assert.equal(supportedRoutesPerCadence, 750);
  assert.ok(supportedRoutesPerCadence >= 300 * 2 * 1.25, "600 routes retain 25% worst-page headroom");

  console.log("GHL periodic form sweep service tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
