import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "dealflow-ghl-foundation-"));
const tsc = path.join(repoRoot, "node_modules", ".bin", "tsc");
const sourceFiles = [
  "src/lib/integrations/gohighlevel/capabilities.ts",
  "src/lib/integrations/gohighlevel/fake-adapter.ts",
  "src/lib/integrations/gohighlevel/index.ts",
  "src/lib/integrations/gohighlevel/memory-repository.ts",
  "src/lib/integrations/gohighlevel/state-machine.ts",
  "src/lib/integrations/gohighlevel/types.ts",
  "src/lib/integrations/gohighlevel/write-gate.ts",
  "src/lib/services/ghl-fake-lead-outbox-service.ts",
  "src/lib/services/ghl-provisioning-service.ts",
];
const implementationFiles = [
  ...sourceFiles,
  "src/lib/services/ghl-provisioning-repository.ts",
  "src/lib/services/ghl-lead-effect-service.ts",
  "src/lib/services/fulfillment-monitor-service.ts",
];

function compileTestTarget() {
  const result = spawnSync(tsc, [
    "--pretty", "false",
    "--target", "ES2022",
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--strict",
    "--esModuleInterop",
    "--skipLibCheck",
    "--rootDir", "src",
    "--outDir", buildDir,
    ...sourceFiles,
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });

  if (result.status !== 0) {
    throw new Error(`GHL test target compilation failed:\n${result.stdout}${result.stderr}`);
  }
}

function makeClock(start = "2026-07-10T17:00:00.000Z") {
  let value = Date.parse(start);
  return {
    now: () => new Date(value).toISOString(),
    advance: (milliseconds) => {
      value += milliseconds;
    },
  };
}

function fixtureRequest(organizationId, activationEventId = `payment-${organizationId}`) {
  return {
    organizationId,
    environment: "test",
    activationEventId,
    installationId: "installation-test-1",
    snapshotManifest: {
      id: "snapshot-manifest-1",
      environment: "test",
      snapshotKey: "dealflow-realtor",
      snapshotVersion: "2026.07.10",
      providerSnapshotId: "fake-snapshot-1",
      requiredObjects: [
        { kind: "pipeline", key: "new-lead" },
        { kind: "stage", key: "new-lead:incoming" },
        { kind: "workflow", key: "lead-follow-up" },
      ],
      status: "approved",
    },
    locationProfile: {
      displayName: `Fixture ${organizationId}`,
      country: "CA",
      timezone: "America/Toronto",
    },
  };
}

async function driveToTerminal(run, dependencies, executeNext) {
  let current = run;
  for (let index = 0; index < 20; index += 1) {
    if (["ready", "operator_action_required", "canceled", "retryable_failure"].includes(current.state)) {
      return current;
    }
    current = await executeNext(current.id, dependencies);
  }
  throw new Error(`Provisioning did not reach a bounded terminal state; last state=${current.state}`);
}

try {
  compileTestTarget();
  const require = createRequire(import.meta.url);
  const integration = require(path.join(buildDir, "lib", "integrations", "gohighlevel", "index.js"));
  const service = require(path.join(buildDir, "lib", "services", "ghl-provisioning-service.js"));
  const fakeLeadOutboxService = require(
    path.join(buildDir, "lib", "services", "ghl-fake-lead-outbox-service.js"),
  );
  const {
    FakeGhlAdapter,
    GHL_CAPABILITY_MATRIX,
    MemoryGhlProvisioningRepository,
    assertFunnelPublicationSupported,
    evaluateGhlWriteGate,
  } = integration;
  const {
    assertGhlProvisioningRequest,
    executeNextGhlProvisioningStep,
    requestGhlFunnelPublicationOperatorAction,
    requestGhlProvisioning,
    requestGhlProvisioningReplay,
  } = service;
  const {
    enqueueGhlFakeLeadEffects,
    processGhlFakeLeadOutboxBatch,
  } = fakeLeadOutboxService;

  {
    const emptyManifest = fixtureRequest("workspace-a", "payment-empty-manifest");
    emptyManifest.snapshotManifest.requiredObjects = [];
    assert.throws(
      () => assertGhlProvisioningRequest(emptyManifest),
      (error) => error.code === "required_object_manifest_empty",
    );
    const duplicateManifest = fixtureRequest("workspace-a", "payment-duplicate-manifest");
    duplicateManifest.snapshotManifest.requiredObjects.push({
      ...duplicateManifest.snapshotManifest.requiredObjects[0],
    });
    assert.throws(
      () => assertGhlProvisioningRequest(duplicateManifest),
      (error) => error.code === "required_object_manifest_invalid",
    );
    const invalidSnapshotIdentity = fixtureRequest("workspace-a", "payment-invalid-snapshot");
    invalidSnapshotIdentity.snapshotManifest.providerSnapshotId = "";
    assert.throws(
      () => assertGhlProvisioningRequest(invalidSnapshotIdentity),
      (error) => error.code === "snapshot_identity_invalid",
    );
  }

  const directTenant = {
    organizationId: "workspace-a",
    tenantKind: "direct_realtor",
    partnerId: null,
    status: "active",
  };
  const secondTenant = {
    organizationId: "workspace-b",
    tenantKind: "partner_child",
    partnerId: "partner-1",
    status: "active",
  };

  assert.deepEqual(evaluateGhlWriteGate(), {
    allowed: false,
    code: "provider_write_gate_closed",
    reason: "GHL provider writes default to disabled.",
  });
  assert.equal(evaluateGhlWriteGate({ enabled: true, adapterKind: "real" }).code, "real_adapter_forbidden");
  assert.equal(
    evaluateGhlWriteGate({ enabled: true, adapterKind: "fake", networkAccess: "network" }).code,
    "real_adapter_forbidden",
  );

  {
    const calls = [];
    let claimAvailable = true;
    const client = {
      async rpc(name, params) {
        calls.push({ name, params });
        if (name === "enqueue_ghl_fake_lead_effects") {
          return { data: [{ id: "effect-1" }, { id: "effect-2" }], error: null };
        }
        if (name === "claim_next_ghl_fake_lead_outbox") {
          if (!claimAvailable) {
            return { data: [], error: null };
          }
          claimAvailable = false;
          return {
            data: [{
              id: "outbox-1",
              organization_id: "workspace-a",
              operation: "lead_contact_upsert",
              lease_token: "lease-token-1",
              lease_generation: 1,
            }],
            error: null,
          };
        }
        if (name === "settle_ghl_provider_outbox") {
          return { data: [{ id: "outbox-1", status: "succeeded" }], error: null };
        }
        throw new Error(`Unexpected fake RPC: ${name}`);
      },
    };
    const fixedNow = () => "2026-07-10T17:00:00.000Z";

    await assert.rejects(
      () => enqueueGhlFakeLeadEffects(
        { organizationId: "workspace-a", leadId: "lead-a" },
        { client, gate: { enabled: true, nodeEnv: "production", isolatedDatabase: true, databaseUrl: "http://127.0.0.1:54321" }, now: fixedNow },
      ),
      (error) => error.code === "ghl_fake_worker_forbidden_in_production",
    );
    await assert.rejects(
      () => enqueueGhlFakeLeadEffects(
        { organizationId: "workspace-a", leadId: "lead-a" },
        { client, gate: { enabled: false, nodeEnv: "test", isolatedDatabase: true, databaseUrl: "http://127.0.0.1:54321" }, now: fixedNow },
      ),
      (error) => error.code === "provider_write_gate_closed",
    );
    assert.equal(calls.length, 0, "closed fake gates must reject before any database RPC");

    const queued = await enqueueGhlFakeLeadEffects(
      { organizationId: "workspace-a", leadId: "lead-a" },
      { client, gate: { enabled: true, nodeEnv: "test", isolatedDatabase: true, databaseUrl: "http://127.0.0.1:54321" }, now: fixedNow },
    );
    assert.equal(queued.status, "queued");
    assert.equal(queued.queuedCount, 2);
    assert.equal(queued.providerMutationAttempted, false);

    const processed = await processGhlFakeLeadOutboxBatch(
      { maxItems: 2 },
      {
        client,
        gate: { enabled: true, nodeEnv: "test", isolatedDatabase: true, databaseUrl: "http://127.0.0.1:54321" },
        now: fixedNow,
        workerId: "fake-worker-a",
      },
    );
    assert.deepEqual(processed.processedOutboxIds, ["outbox-1"]);
    assert.equal(processed.providerNetworkAccess, "none");
    assert.deepEqual(
      calls.map((call) => call.name),
      [
        "enqueue_ghl_fake_lead_effects",
        "claim_next_ghl_fake_lead_outbox",
        "settle_ghl_provider_outbox",
        "claim_next_ghl_fake_lead_outbox",
      ],
      "fake lead processing must be exactly enqueue, fenced claim, fenced settlement, idle claim",
    );
    const settlement = calls.find((call) => call.name === "settle_ghl_provider_outbox");
    assert.equal(settlement.params.p_receipt_metadata.provider_network_access, "none");
    assert.equal(settlement.params.p_receipt_metadata.provider_mutation_attempted, false);
  }

  {
    const clock = makeClock("2026-07-10T18:00:00.000Z");
    const repository = new MemoryGhlProvisioningRepository([directTenant]);
    const provider = new FakeGhlAdapter();
    const dependencies = {
      repository,
      provider,
      writeGate: { enabled: true, adapterKind: "fake" },
      isolatedDatabase: true,
      databaseUrl: "http://127.0.0.1:54321",
      now: clock.now,
    };
    let run = await requestGhlProvisioning(fixtureRequest("workspace-a", "payment-lease-fence"), dependencies);
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    const pendingOutbox = repository.listOutbox()[0];
    const workerA = await repository.claimOutbox({
      outboxId: pendingOutbox.id,
      organizationId: pendingOutbox.organizationId,
      workerId: "worker-a",
      now: clock.now(),
      leaseMs: 1_000,
    });
    assert.ok(workerA?.leaseToken);
    assert.equal(workerA.leaseGeneration, 1);
    assert.equal(
      await repository.claimOutbox({
        outboxId: pendingOutbox.id,
        organizationId: pendingOutbox.organizationId,
        workerId: "worker-b",
        now: clock.now(),
        leaseMs: 1_000,
      }),
      null,
      "an active GHL outbox lease must exclude a second worker",
    );

    clock.advance(1_001);
    const workerB = await repository.claimOutbox({
      outboxId: pendingOutbox.id,
      organizationId: pendingOutbox.organizationId,
      workerId: "worker-b",
      now: clock.now(),
      leaseMs: 1_000,
    });
    assert.ok(workerB?.leaseToken);
    assert.equal(workerB.leaseGeneration, 2, "a reclaimed lease must advance the fencing generation");

    const staleLease = {
      workerId: workerA.lockedBy,
      token: workerA.leaseToken,
      generation: workerA.leaseGeneration,
      expiresAt: workerA.leaseExpiresAt,
    };
    await assert.rejects(
      () => repository.settleOutbox({
        record: workerA,
        lease: staleLease,
        receipt: {
          outcome: "succeeded",
          providerRequestId: "stale-request",
          providerReference: "stale-reference",
          httpStatus: 200,
          responseFingerprint: null,
          metadata: { fake: true },
          receivedAt: clock.now(),
        },
        status: "succeeded",
        availableAt: clock.now(),
        lastErrorCode: null,
      }),
      (error) => error.code === "outbox_lease_lost",
      "a superseded GHL outbox worker must be fenced from settlement",
    );

    await repository.settleOutbox({
      record: workerB,
      lease: {
        workerId: workerB.lockedBy,
        token: workerB.leaseToken,
        generation: workerB.leaseGeneration,
        expiresAt: workerB.leaseExpiresAt,
      },
      receipt: {
        outcome: "succeeded",
        providerRequestId: "winning-request",
        providerReference: "winning-reference",
        httpStatus: 200,
        responseFingerprint: "fake-no-network",
        metadata: { fake: true },
        receivedAt: clock.now(),
      },
      status: "succeeded",
      availableAt: clock.now(),
      lastErrorCode: null,
    });
    assert.equal(repository.listReceipts().length, 1, "only the live fenced worker may append a receipt");
    assert.equal(repository.listOutbox()[0].status, "succeeded");
  }

  {
    const clock = makeClock();
    const repository = new MemoryGhlProvisioningRepository([directTenant]);
    const provider = new FakeGhlAdapter({ snapshotStatuses: ["pending", "ready"] });
    const dependencies = {
      repository,
      provider,
      writeGate: { enabled: true, adapterKind: "fake" },
      isolatedDatabase: true,
      databaseUrl: "http://127.0.0.1:54321",
      now: clock.now,
    };
    let run = await requestGhlProvisioning(fixtureRequest("workspace-a", "payment-pending-then-ready"), dependencies);
    while (run.state !== "snapshot_installing") {
      run = await executeNextGhlProvisioningStep(run.id, dependencies);
    }
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    assert.equal(run.state, "snapshot_verifying");
    assert.equal(run.lastErrorCode, "snapshot_poll_pending");
    assert.ok(run.nextRetryAt);
    const callsBeforeBackoffProbe = provider.calls.length;
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    assert.equal(provider.calls.length, callsBeforeBackoffProbe, "snapshot backoff must suppress an early provider poll");
    clock.advance(Date.parse(run.nextRetryAt) - Date.parse(clock.now()) + 1);
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    assert.equal(run.state, "required_objects_verifying");
    assert.ok(run.snapshotVerifiedAt);
    const ready = await driveToTerminal(run, dependencies, executeNextGhlProvisioningStep);
    assert.equal(ready.state, "ready");
  }

  {
    const clock = makeClock();
    const repository = new MemoryGhlProvisioningRepository([directTenant]);
    const provider = new FakeGhlAdapter({ snapshotStatuses: ["pending"] });
    const dependencies = {
      repository,
      provider,
      writeGate: { enabled: true, adapterKind: "fake" },
      isolatedDatabase: true,
      databaseUrl: "http://127.0.0.1:54321",
      now: clock.now,
    };
    let run = await requestGhlProvisioning(fixtureRequest("workspace-a", "payment-pending-bounded"), dependencies);
    while (run.state !== "snapshot_installing") {
      run = await executeNextGhlProvisioningStep(run.id, dependencies);
    }
    for (let index = 0; index < 10 && run.state !== "operator_action_required"; index += 1) {
      run = await executeNextGhlProvisioningStep(run.id, dependencies);
      if (run.nextRetryAt) {
        clock.advance(Math.max(Date.parse(run.nextRetryAt) - Date.parse(clock.now()) + 1, 1));
      }
    }
    assert.equal(run.state, "operator_action_required", "perpetual pending must escalate at the bounded poll limit");
    assert.equal(run.lastErrorCode, "snapshot_poll_limit_reached");
  }

  {
    const clock = makeClock();
    const repository = new MemoryGhlProvisioningRepository([directTenant]);
    const provider = new FakeGhlAdapter();
    const dependencies = { repository, provider, now: clock.now };
    const run = await requestGhlProvisioning(fixtureRequest("workspace-a"), dependencies);
    await assert.rejects(
      () => executeNextGhlProvisioningStep(run.id, dependencies),
      (error) => error.code === "provider_write_gate_closed",
    );
    assert.equal(provider.calls.length, 0, "closed write gate must prevent every provider call");
    assert.equal((await repository.getRun(run.id)).state, "requested");
  }

  for (const forbiddenEnvironment of ["production", "sandbox"]) {
    const clock = makeClock();
    const repository = new MemoryGhlProvisioningRepository([directTenant]);
    const provider = new FakeGhlAdapter();
    const request = fixtureRequest("workspace-a", `payment-${forbiddenEnvironment}`);
    request.environment = forbiddenEnvironment;
    request.snapshotManifest.environment = forbiddenEnvironment;
    const dependencies = {
      repository,
      provider,
      writeGate: { enabled: true, adapterKind: "fake" },
      isolatedDatabase: true,
      databaseUrl: "http://127.0.0.1:54321",
      now: clock.now,
    };
    const run = await requestGhlProvisioning(request, dependencies);
    await assert.rejects(
      () => executeNextGhlProvisioningStep(run.id, dependencies),
      (error) => error.code === "fake_provisioning_environment_forbidden",
    );
    assert.equal(provider.calls.length, 0, `fake provisioning must reject ${forbiddenEnvironment} before a provider call`);
  }

  let readyFixture;
  {
    const clock = makeClock();
    const repository = new MemoryGhlProvisioningRepository([directTenant]);
    const provider = new FakeGhlAdapter({ snapshotStatuses: ["ready"] });
    const dependencies = {
      repository,
      provider,
      writeGate: { enabled: true, adapterKind: "fake" },
      isolatedDatabase: true,
      databaseUrl: "http://127.0.0.1:54321",
      now: clock.now,
    };
    const request = fixtureRequest("workspace-a");
    const first = await requestGhlProvisioning(request, dependencies);
    const replayedRequest = await requestGhlProvisioning(request, dependencies);
    assert.equal(replayedRequest.id, first.id, "same activation/snapshot request must be idempotent");
    const changedSnapshotRequest = structuredClone(request);
    changedSnapshotRequest.snapshotManifest.providerSnapshotId = "different-provider-snapshot";
    await assert.rejects(
      () => requestGhlProvisioning(changedSnapshotRequest, dependencies),
      (error) => error.code === "idempotency_collision",
      "one semantic activation/snapshot version cannot silently target a different provider snapshot",
    );

    const ready = await driveToTerminal(first, dependencies, executeNextGhlProvisioningStep);
    assert.equal(ready.state, "ready");
    assert.ok(ready.snapshotVerifiedAt);
    assert.ok(ready.requiredObjectsVerifiedAt);
    assert.equal(repository.listMappings().length, 1);
    assert.equal(repository.listMappings()[0].status, "active");
    assert.ok(repository.listReceipts().length >= 4, "provider request outcomes must have durable receipts");
    const firstOutbox = repository.listOutbox()[0];
    assert.equal(firstOutbox.operation, "location_create");
    assert.equal(firstOutbox.requestPayload.contractVersion, 2);
    assert.equal(firstOutbox.requestPayload.snapshotManifestId, request.snapshotManifest.id);
    assert.equal(firstOutbox.requestPayload.providerSnapshotId, request.snapshotManifest.providerSnapshotId);
    assert.match(firstOutbox.requestPayload.snapshotManifestFingerprint, /^[a-f0-9]{64}$/);
    assert.match(firstOutbox.requestPayload.requestFingerprint, /^[a-f0-9]{64}$/);
    const locationCreateCall = provider.calls.find((call) => call.operation === "location_create");
    assert.equal(locationCreateCall.idempotencyKey, `${first.idempotencyKey}:location_create`);
    assert.equal(locationCreateCall.providerSnapshotId, request.snapshotManifest.providerSnapshotId);
    assert.equal(locationCreateCall.requestFingerprint, firstOutbox.requestPayload.requestFingerprint);
    const locationCreateReceipt = repository.listReceipts().find((receipt) =>
      receipt.outboxId === firstOutbox.id
    );
    assert.equal(locationCreateReceipt.metadata.snapshotManifestId, request.snapshotManifest.id);
    assert.equal(locationCreateReceipt.metadata.providerSnapshotId, request.snapshotManifest.providerSnapshotId);
    assert.equal(locationCreateReceipt.metadata.requestFingerprint, firstOutbox.requestPayload.requestFingerprint);
    assert.deepEqual(
      provider.calls.map((call) => call.operation),
      [
        "location_create",
        "location_display_name_finalize",
        "snapshot_install",
        "snapshot_status",
        "required_objects_verify",
      ],
      "snapshotId at sub-account creation never replaces status and required-object verification",
    );
    await assert.rejects(
      () => repository.ensureOutbox({
        run: ready,
        operation: firstOutbox.operation,
        idempotencyKey: firstOutbox.idempotencyKey,
        requestPayload: { changed: true },
        now: clock.now(),
      }),
      (error) => error.code === "outbox_idempotency_collision",
      "outbox idempotency cannot hide a changed request payload",
    );

    const providerCallsAtReady = provider.calls.length;
    const stillReady = await executeNextGhlProvisioningStep(ready.id, dependencies);
    assert.equal(stillReady.state, "ready");
    assert.equal(provider.calls.length, providerCallsAtReady, "READY replay must not call the provider");
    readyFixture = { clock, repository, provider, dependencies, ready };
  }

  {
    const clock = makeClock();
    const repository = new MemoryGhlProvisioningRepository([directTenant]);
    const provider = new FakeGhlAdapter({ snapshotStatuses: ["ready"] });
    const originalFinalize = provider.finalizeLocationDisplayName.bind(provider);
    let finalizationAttempts = 0;
    provider.finalizeLocationDisplayName = async (input) => {
      finalizationAttempts += 1;
      if (finalizationAttempts === 1) {
        provider.calls.push({
          operation: "location_display_name_finalize",
          idempotencyKey: input.idempotencyKey,
          providerLocationId: input.providerLocationId,
          requestFingerprint: input.requestFingerprint,
        });
        return {
          outcome: "retryable_failure",
          errorCode: "fake_display_name_readback_pending",
          safeMessage: "Synthetic clean-name readback is pending.",
          providerRequestId: "fake-display-name-pending-1",
          requestFingerprint: input.requestFingerprint,
          responseFingerprint: input.requestFingerprint,
          httpStatus: 200,
        };
      }
      return originalFinalize(input);
    };
    const dependencies = {
      repository,
      provider,
      writeGate: { enabled: true, adapterKind: "fake" },
      isolatedDatabase: true,
      databaseUrl: "http://127.0.0.1:54321",
      now: clock.now,
    };
    let run = await requestGhlProvisioning(
      fixtureRequest("workspace-a", "payment-display-name-finalization"),
      dependencies,
    );
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    assert.equal(run.state, "location_assigned");
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    assert.equal(run.state, "location_assigned");
    assert.equal(run.lastErrorCode, "fake_display_name_readback_pending");
    assert.ok(run.nextRetryAt);
    assert.equal(
      provider.calls.some((call) => call.operation === "snapshot_install"),
      false,
      "snapshot work must remain blocked until the clean customer-facing name is read back",
    );
    const callsBeforeDue = provider.calls.length;
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    assert.equal(provider.calls.length, callsBeforeDue, "clean-name finalization must respect durable backoff");
    clock.advance(Date.parse(run.nextRetryAt) - Date.parse(clock.now()) + 1);
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    assert.equal(run.state, "snapshot_install_requested");
    assert.equal(finalizationAttempts, 2);
    const finalizeOutbox = repository.listOutbox().find((item) =>
      item.operation === "location_display_name_finalize"
    );
    const finalizeReceipts = repository.listReceipts().filter((receipt) =>
      receipt.outboxId === finalizeOutbox.id
    );
    assert.equal(finalizeReceipts.length, 2);
    assert.equal(finalizeReceipts[0].metadata.cleanDisplayNameVerified, false);
    assert.equal(finalizeReceipts[1].metadata.cleanDisplayNameVerified, true);
  }

  {
    const clock = makeClock();
    const repository = new MemoryGhlProvisioningRepository([directTenant]);
    const provider = new FakeGhlAdapter({ snapshotStatuses: ["ready"] });
    const dependencies = {
      repository,
      provider,
      writeGate: { enabled: true, adapterKind: "fake" },
      isolatedDatabase: true,
      databaseUrl: "http://127.0.0.1:54321",
      now: clock.now,
    };
    const originalSaveRun = repository.saveRun.bind(repository);
    const failOnceStates = new Set();
    repository.saveRun = async (candidate, expectedRevision) => {
      if (failOnceStates.delete(candidate.state)) {
        const error = new Error(`injected_after_settlement:${candidate.state}`);
        error.code = "injected_after_settlement";
        throw error;
      }
      return originalSaveRun(candidate, expectedRevision);
    };

    let run = await requestGhlProvisioning(fixtureRequest("workspace-a", "payment-saga-recovery"), dependencies);
    run = await executeNextGhlProvisioningStep(run.id, dependencies);

    for (const recovery of [
      { failedState: "location_assigned", expectedState: "location_assigned" },
      { failedState: "snapshot_installing", expectedState: "snapshot_installing", prepare: true },
      { failedState: "snapshot_verifying", expectedState: "snapshot_verifying" },
      { failedState: "ready", expectedState: "ready" },
    ]) {
      if (recovery.prepare) {
        run = await executeNextGhlProvisioningStep(run.id, dependencies);
      }
      failOnceStates.add(recovery.failedState);
      const callsBeforeSettlement = provider.calls.length;
      await assert.rejects(
        () => executeNextGhlProvisioningStep(run.id, dependencies),
        (error) => error.code === "injected_after_settlement",
      );
      const callsAfterSettlement = provider.calls.length;
      assert.ok(callsAfterSettlement > callsBeforeSettlement, `${recovery.failedState} injection must follow a fake provider call`);
      run = await executeNextGhlProvisioningStep(run.id, dependencies);
      assert.equal(run.state, recovery.expectedState);
      assert.equal(
        provider.calls.length,
        callsAfterSettlement,
        `${recovery.failedState} recovery must consume durable receipt state without replaying the provider`,
      );
      if (run.state === "snapshot_verifying" && run.snapshotVerifiedAt) {
        run = await executeNextGhlProvisioningStep(run.id, dependencies);
      }
    }
    assert.equal(run.state, "ready");
  }

  {
    const clock = makeClock();
    const repository = new MemoryGhlProvisioningRepository([directTenant]);
    const provider = new FakeGhlAdapter();
    const originalSaveRun = repository.saveRun.bind(repository);
    let injectAfterCreateSettlement = true;
    repository.saveRun = async (candidate, expectedRevision) => {
      if (injectAfterCreateSettlement && candidate.state === "location_assigned") {
        injectAfterCreateSettlement = false;
        const error = new Error("injected_after_location_create_settlement");
        error.code = "injected_after_location_create_settlement";
        throw error;
      }
      return originalSaveRun(candidate, expectedRevision);
    };
    const dependencies = {
      repository,
      provider,
      writeGate: { enabled: true, adapterKind: "fake" },
      isolatedDatabase: true,
      databaseUrl: "http://127.0.0.1:54321",
      now: clock.now,
    };
    let run = await requestGhlProvisioning(
      fixtureRequest("workspace-a", "payment-location-receipt-mismatch"),
      dependencies,
    );
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    await assert.rejects(
      () => executeNextGhlProvisioningStep(run.id, dependencies),
      (error) => error.code === "injected_after_location_create_settlement",
    );
    const originalLatestReceipt = repository.getLatestReceipt.bind(repository);
    repository.getLatestReceipt = async (outboxId) => {
      const receipt = await originalLatestReceipt(outboxId);
      return receipt
        ? { ...receipt, metadata: { ...receipt.metadata, providerSnapshotId: "wrong-snapshot" } }
        : receipt;
    };
    await assert.rejects(
      () => executeNextGhlProvisioningStep(run.id, dependencies),
      (error) => error.code === "ghl_location_create_receipt_identity_mismatch",
      "a durable receipt for a different snapshot must never advance the saga",
    );
    assert.equal(
      provider.calls.filter((call) => call.operation === "location_create").length,
      1,
      "receipt mismatch handling must never replay location creation",
    );
  }

  {
    const clock = makeClock();
    const repository = new MemoryGhlProvisioningRepository([directTenant]);
    const provider = new FakeGhlAdapter({ createOutcome: "timeout_after_create" });
    const dependencies = {
      repository,
      provider,
      writeGate: { enabled: true, adapterKind: "fake" },
      isolatedDatabase: true,
      databaseUrl: "http://127.0.0.1:54321",
      now: clock.now,
    };
    let run = await requestGhlProvisioning(fixtureRequest("workspace-a", "payment-timeout-after"), dependencies);
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    assert.equal(run.state, "location_uncertain");
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    assert.equal(run.state, "location_assigned", "reconciliation must recover the created location");
    assert.deepEqual(
      provider.calls.map((call) => call.operation),
      ["location_create", "location_reconcile"],
      "uncertain result must reconcile before any create replay",
    );
    assert.equal(repository.listMappings().length, 1);
  }

  {
    const clock = makeClock();
    const repository = new MemoryGhlProvisioningRepository([directTenant]);
    const provider = new FakeGhlAdapter();
    let createDispatchCalls = 0;
    let createInput = null;
    provider.createLocation = async (input) => {
      createDispatchCalls += 1;
      createInput = input;
      throw new Error("synthetic timeout after location-create write");
    };
    const dependencies = {
      repository,
      provider,
      writeGate: { enabled: true, adapterKind: "fake" },
      isolatedDatabase: true,
      databaseUrl: "http://127.0.0.1:54321",
      now: clock.now,
    };
    let run = await requestGhlProvisioning(
      fixtureRequest("workspace-a", "payment-location-create-throw-after-write"),
      dependencies,
    );
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    assert.equal(createDispatchCalls, 1, "location creation must dispatch exactly once");
    assert.equal(createInput.snapshotManifest.providerSnapshotId, "fake-snapshot-1");
    assert.match(createInput.snapshotManifestFingerprint, /^[a-f0-9]{64}$/);
    assert.match(createInput.requestFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(run.state, "location_uncertain");
    assert.equal(run.lastErrorCode, "ghl_location_create_dispatch_ambiguous");
    assert.equal(repository.listOutbox()[0].status, "uncertain");
    assert.equal(repository.listReceipts().length, 1);
    assert.equal(repository.listReceipts()[0].outcome, "uncertain");
    assert.equal(repository.listReceipts()[0].metadata.providerMutationAttempted, true);
    assert.equal(repository.listReceipts()[0].metadata.providerSnapshotId, "fake-snapshot-1");
    assert.equal(repository.listReceipts()[0].metadata.requestFingerprint, createInput.requestFingerprint);
  }

  {
    const clock = makeClock();
    const repository = new MemoryGhlProvisioningRepository([directTenant]);
    const provider = new FakeGhlAdapter({ createOutcome: "timeout_before_create" });
    const dependencies = {
      repository,
      provider,
      writeGate: { enabled: true, adapterKind: "fake" },
      isolatedDatabase: true,
      databaseUrl: "http://127.0.0.1:54321",
      now: clock.now,
    };
    let run = await requestGhlProvisioning(fixtureRequest("workspace-a", "payment-timeout-before"), dependencies);
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    assert.equal(run.state, "location_uncertain");
    assert.equal(run.lastErrorCode, "ghl_location_reconciliation_visibility_pending");
    assert.ok(run.nextRetryAt, "an initial not-found must remain backoff-gated inside the visibility window");
    const callsBeforeEarlyPoll = provider.calls.length;
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    assert.equal(provider.calls.length, callsBeforeEarlyPoll, "a visibility poll must not run before its durable due time");
    for (let poll = 0; poll < 10 && run.state === "location_uncertain"; poll += 1) {
      clock.advance(Math.max(Date.parse(run.nextRetryAt) - Date.parse(clock.now()) + 1, 1));
      run = await executeNextGhlProvisioningStep(run.id, dependencies);
    }
    assert.equal(run.state, "retryable_failure");
    assert.ok(run.lastReconciledAt, "conclusive not-found reconciliation must be recorded");
    const reconciliationReceipts = repository.listReceipts()
      .filter((receipt) => receipt.metadata.requestFingerprint);
    assert.ok(
      reconciliationReceipts.some((receipt) => receipt.metadata.reconciliationVisibilityPending === true),
      "pre-deadline absence must be durably non-conclusive",
    );
    assert.ok(
      reconciliationReceipts.some((receipt) => receipt.metadata.absenceConclusive === true),
      "only a post-window search may prove provider absence",
    );
    await assert.rejects(
      () => requestGhlProvisioningReplay(run.id, dependencies),
      (error) => error.code === "retry_not_due",
    );
    clock.advance(Date.parse(run.nextRetryAt) - Date.parse(clock.now()) + 1);
    provider.setCreateOutcome("success");
    run = await requestGhlProvisioningReplay(run.id, dependencies);
    assert.equal(run.state, "location_create_requested");
    run = await executeNextGhlProvisioningStep(run.id, dependencies);
    assert.equal(run.state, "location_assigned");
    const operations = provider.calls.map((call) => call.operation);
    assert.equal(operations[0], "location_create");
    assert.equal(operations.at(-1), "location_create");
    assert.ok(
      operations.slice(1, -1).every((operation) => operation === "location_reconcile"),
      "safe create replay must happen only after bounded reconciliation and due-time approval",
    );
    assert.equal(
      operations.filter((operation) => operation === "location_create").length,
      2,
      "the original create may be replayed exactly once only after conclusive absence",
    );
  }

  {
    const clock = makeClock();
    const repository = new MemoryGhlProvisioningRepository([directTenant, secondTenant]);
    const provider = new FakeGhlAdapter();
    const dependencies = { repository, provider, now: clock.now };
    const runA = await requestGhlProvisioning(fixtureRequest("workspace-a", "payment-location-a"), dependencies);
    const runB = await requestGhlProvisioning(fixtureRequest("workspace-b", "payment-location-b"), dependencies);
    await repository.assignLocation({ run: runA, providerLocationId: "shared-location", now: clock.now() });
    await assert.rejects(
      () => repository.assignLocation({ run: runB, providerLocationId: "shared-location", now: clock.now() }),
      (error) => error.code === "provider_location_tenant_conflict",
      "one provider location must never map to two active/provisioning workspaces",
    );
    await assert.rejects(
      () => repository.saveRun({ ...runA, organizationId: "workspace-b", revision: 1 }, 0),
      (error) => error.code === "cross_tenant_run_write",
    );
    assert.throws(
      () => new MemoryGhlProvisioningRepository([{
        organizationId: "invalid-direct",
        tenantKind: "direct_realtor",
        partnerId: "partner-should-not-exist",
        status: "active",
      }]),
      (error) => error.code === "invalid_tenant_hierarchy",
    );
  }

  {
    const before = readyFixture.provider.calls.length;
    const disposition = await requestGhlFunnelPublicationOperatorAction(
      readyFixture.ready.id,
      { repository: readyFixture.repository, now: readyFixture.clock.now },
    );
    assert.deepEqual(disposition, {
      status: "operator_action_required",
      blockerCode: "BLOCKED_EXTERNAL",
      providerMutationAttempted: false,
    });
    assert.equal(GHL_CAPABILITY_MATRIX.funnelPublication.disposition, "BLOCKED_EXTERNAL");
    assert.equal(readyFixture.provider.calls.length, before, "publication blocker must make no provider call");
    assert.equal(readyFixture.repository.listOperatorRequests().at(-1).requestKind, "funnel_publication");
    assert.throws(
      () => assertFunnelPublicationSupported(),
      (error) => error.code === "BLOCKED_EXTERNAL",
    );
  }

  {
    const clock = makeClock();
    const repository = new MemoryGhlProvisioningRepository([directTenant]);
    const provider = new FakeGhlAdapter({ missingRequiredObjectKeys: ["workflow:lead-follow-up"] });
    const dependencies = {
      repository,
      provider,
      writeGate: { enabled: true, adapterKind: "fake" },
      isolatedDatabase: true,
      databaseUrl: "http://127.0.0.1:54321",
      now: clock.now,
    };
    const run = await requestGhlProvisioning(fixtureRequest("workspace-a", "payment-missing-object"), dependencies);
    const terminal = await driveToTerminal(run, dependencies, executeNextGhlProvisioningStep);
    assert.equal(terminal.state, "operator_action_required");
    assert.equal(repository.listMappings()[0].status, "provisioning", "missing objects must never become active/ready");
    assert.equal(repository.listOperatorRequests()[0].requestKind, "required_object_repair");
  }

  const migration = fs.readFileSync(
    path.join(repoRoot, "supabase/migrations/20260710170000_create_ghl_tenant_provisioning_foundation.sql"),
    "utf8",
  );
  assert.match(migration, /active_workspace_environment_unique/);
  assert.match(migration, /jsonb_array_length\(required_objects\) > 0/);
  assert.match(migration, /ghl_snapshot_manifests_id_environment_unique/);
  assert.match(migration, /ghl_location_mappings_snapshot_environment_fk/);
  assert.match(migration, /ghl_provisioning_runs_snapshot_environment_fk/);
  assert.match(migration, /active_provider_location_unique/);
  assert.match(migration, /routable_workspace_environment_unique/);
  assert.match(migration, /routable_provider_location_unique/);
  assert.match(migration, /tenant_lead_fk/);
  assert.match(migration, /tenant_mapping_fk/);
  assert.match(migration, /ghl_lead_effect_events_outbox_unique/);
  assert.match(migration, /uncertain GHL location result must be reconciled before retry/i);
  assert.match(migration, /GHL provider receipts are append-only/);
  assert.match(migration, /GHL provider outbox request identity is immutable/);
  assert.match(migration, /Each GHL outbox claim must advance exactly one attempt and fencing generation/);
  assert.match(migration, /Invalid GHL provider outbox transition/);
  assert.match(migration, /Invalid GHL lead effect transition/);
  assert.match(migration, /claim_ghl_provider_outbox/);
  assert.match(migration, /lease_generation = outbox\.lease_generation \+ 1/);
  assert.match(migration, /settle_ghl_provider_outbox/);
  assert.match(migration, /GHL outbox lease expired or was superseded before settlement/);
  assert.match(migration, /enqueue_ghl_fake_lead_effects/);
  assert.match(migration, /claim_next_ghl_fake_lead_outbox/);
  assert.match(migration, /ghl_lead_effect_attempts_exhausted/);
  assert.match(migration, /prepare_ghl_provider_outbox_replay/);
  assert.match(migration, /request_ghl_lead_effect_replay/);
  assert.match(migration, /revoke all on table public\.ghl_provider_receipts from service_role/);
  assert.match(migration, /revoke all on table public\.ghl_lead_effect_events from service_role/);
  assert.match(migration, /GHL fake lead producer is restricted to the test environment/);
  assert.match(migration, /request_payload @> '\{"fake_only": true\}'::jsonb/);
  assert.match(migration, /provider_mutation_attempted', false/);
  assert.match(migration, /BLOCKED_EXTERNAL/);

  const fakeLeadWorker = fs.readFileSync(
    path.join(repoRoot, "src/lib/services/ghl-fake-lead-outbox-service.ts"),
    "utf8",
  );
  assert.match(fakeLeadWorker, /nodeEnv === "production"/);
  assert.match(fakeLeadWorker, /assertGhlFakeWritesAllowed/);
  assert.match(fakeLeadWorker, /claim_next_ghl_fake_lead_outbox/);
  assert.match(fakeLeadWorker, /settle_ghl_provider_outbox/);
  assert.match(fakeLeadWorker, /providerNetworkAccess: "none"/);
  assert.match(fakeLeadWorker, /ghl_fake_worker_loopback_database_required/);
  assert.match(
    fakeLeadWorker,
    /process\.env\.NODE_ENV === "production" \|\| gate\.nodeEnv === "production"/,
    "fake execution must reject the real production runtime even if a caller supplies a weaker gate",
  );
  const persistenceRepository = fs.readFileSync(
    path.join(repoRoot, "src/lib/services/ghl-provisioning-repository.ts"),
    "utf8",
  );
  assert.match(persistenceRepository, /stored\.providerSnapshotId === requested\.providerSnapshotId/);
  assert.match(persistenceRepository, /canonicalJson\(stored\.requiredObjects\) === canonicalJson\(requested\.requiredObjects\)/);
  assert.match(persistenceRepository, /rpc\("prepare_ghl_provider_outbox_replay"/);

  const implementationText = implementationFiles
    .map((file) => fs.readFileSync(path.join(repoRoot, file), "utf8"))
    .join("\n");
  assert.doesNotMatch(implementationText, /\bfetch\s*\(/, "GHL foundation must contain no provider HTTP client");
  assert.doesNotMatch(implementationText, /api\.gohighlevel|services\.leadconnectorhq/i, "GHL foundation must contain no real provider endpoint");

  console.log("GHL tenant provisioning foundation regression passed (deterministic, fake-only, no provider-network access).\n");
} finally {
  fs.rmSync(buildDir, { recursive: true, force: true });
}
