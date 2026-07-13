import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();

function loadTypeScriptModule(relativePath, requireStub = () => {
  throw new Error("Unexpected runtime import.");
}) {
  const filePath = path.join(root, relativePath);
  const output = ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText;
  const moduleShim = { exports: {} };
  const context = vm.createContext({
    Buffer,
    Date,
    Error,
    JSON,
    Map,
    Math,
    Number,
    Promise,
    Set,
    String,
    clearInterval,
    exports: moduleShim.exports,
    module: moduleShim,
    require: requireStub,
    setInterval,
  });
  vm.runInContext(output, context, { filename: filePath });
  return moduleShim.exports;
}

const lease = loadTypeScriptModule("src/lib/services/system-job-lease-service.ts");
let bestEffortFailureObserved = null;
const failedLogWrite = await lease.runSystemJobLogBestEffort({
  write: async () => {
    throw new Error("deterministic offline log failure");
  },
  onFailure: (error) => {
    bestEffortFailureObserved = error;
  },
});
assert.equal(failedLogWrite, false, "a lifecycle-log failure is absorbed");
assert.match(bestEffortFailureObserved?.message ?? "", /offline log failure/);
assert.equal(
  await lease.runSystemJobLogBestEffort({ write: async () => undefined }),
  true,
  "a successful lifecycle log is reported as written",
);
const ownedLease = {
  jobId: "00000000-0000-4000-8000-000000000001",
  workerId: "worker-a",
  token: "00000000-0000-4000-8000-000000000002",
  generation: 4,
};
const future = new Date(Date.now() + 60_000).toISOString();
assert.equal(
  lease.isSystemJobLeaseOwned(
    {
      id: ownedLease.jobId,
      status: "processing",
      locked_by: ownedLease.workerId,
      locked_until: future,
      lease_token: ownedLease.token,
      lease_generation: ownedLease.generation,
    },
    ownedLease,
  ),
  true,
);
assert.equal(
  lease.isSystemJobLeaseOwned(
    {
      id: ownedLease.jobId,
      status: "processing",
      locked_by: ownedLease.workerId,
      locked_until: future,
      lease_token: ownedLease.token,
      lease_generation: ownedLease.generation + 1,
    },
    ownedLease,
  ),
  false,
  "a newer generation fences the old worker",
);
assert.equal(
  lease.isSystemJobLeaseOwned(
    {
      id: ownedLease.jobId,
      status: "processing",
      locked_by: ownedLease.workerId,
      locked_until: new Date(Date.now() - 1).toISOString(),
      lease_token: ownedLease.token,
      lease_generation: ownedLease.generation,
    },
    ownedLease,
  ),
  false,
  "an expired lease is never considered owned",
);

function createLeaseCasClient(row) {
  return {
    from(relation) {
      assert.equal(relation, "system_jobs");
      const equalFilters = {};
      let greaterThanFilter = null;
      let input = null;
      const query = {
        update(value) {
          input = value;
          return query;
        },
        eq(key, value) {
          equalFilters[key] = value;
          return query;
        },
        gt(key, value) {
          greaterThanFilter = [key, value];
          return query;
        },
        select() {
          return query;
        },
        async maybeSingle() {
          const equalMatch = Object.entries(equalFilters).every(
            ([key, value]) => row[key] === value,
          );
          const greaterMatch =
            !greaterThanFilter ||
            Date.parse(row[greaterThanFilter[0]]) > Date.parse(greaterThanFilter[1]);
          if (!equalMatch || !greaterMatch) return { data: null, error: null };
          Object.assign(row, input);
          return { data: row, error: null };
        },
      };
      return query;
    },
  };
}

const completionRow = {
  id: ownedLease.jobId,
  status: "processing",
  locked_by: ownedLease.workerId,
  locked_until: future,
  lease_token: ownedLease.token,
  lease_generation: ownedLease.generation,
};
const completedRow = await lease.updateSystemJobIfLeaseOwned({
  supabase: createLeaseCasClient(completionRow),
  lease: ownedLease,
  input: { status: "completed" },
});
assert.equal(completedRow.status, "completed");
await assert.rejects(
  () =>
    lease.updateSystemJobIfLeaseOwned({
      supabase: createLeaseCasClient({
        ...completionRow,
        status: "processing",
        lease_generation: ownedLease.generation + 1,
      }),
      lease: ownedLease,
      input: { status: "completed" },
    }),
  (error) => error?.code === "system_job_lease_lost",
  "a superseded lease cannot write completion",
);

let renewals = 0;
const heartbeat = lease.createSystemJobLeaseHeartbeat({
  renew: async () => {
    renewals += 1;
    if (renewals === 2) {
      throw new lease.SystemJobLeaseLostError("offline simulated lease loss");
    }
  },
  schedule: () => ({ offline: true }),
  cancel: () => undefined,
});
heartbeat.start();
await heartbeat.renewNow();
assert.equal(renewals, 1, "heartbeat renews an owned lease");
await assert.rejects(() => heartbeat.renewNow(), /offline simulated lease loss/);
assert.equal(heartbeat.hasLostLease(), true);
assert.throws(() => heartbeat.assertOwned(), /offline simulated lease loss/);
await heartbeat.stop();

const leadEffects = loadTypeScriptModule(
  "src/lib/services/lead-effect-aggregation-service.ts",
  (specifier) => {
    if (specifier === "@/lib/integrations/gohighlevel") {
      return {
        evaluateGhlProductionGate: () => ({ allowed: false }),
        evaluateGhlSandboxGate: () => ({ allowed: false }),
        ghlProductionGateFromEnvironment: () => ({}),
        ghlSandboxGateFromEnvironment: () => ({}),
      };
    }
    if (specifier === "@/lib/deployment-target") {
      return {
        getDeploymentTarget: (env = {}) =>
          env.VERCEL_ENV === "production" || env.DEALFLOW_DEPLOYMENT_TARGET === "production"
            ? "production"
            : "unknown",
      };
    }
    throw new Error(`Unexpected runtime import: ${specifier}`);
  },
);
assert.equal(
  JSON.stringify(leadEffects.resolveLeadEffectPolicy({})),
  JSON.stringify({ enabledEffects: [], requiredEffects: [] }),
  "disabled outbound policies do not turn optional effects into parent-job failures",
);
assert.equal(
  JSON.stringify(leadEffects.resolveLeadEffectPolicy({
    INTERNAL_LEAD_SMS_ENABLED: "true",
    ALLOW_META_CAPI_EVENTS: "true",
  })),
  JSON.stringify({
    enabledEffects: ["agent_notification"],
    requiredEffects: ["agent_notification"],
  }),
  "Meta CAPI remains disabled without explicit current consent evidence",
);
const capiEnv = {
  INTERNAL_LEAD_SMS_ENABLED: "true",
  ALLOW_META_CAPI_EVENTS: "true",
  META_CAPI_CONSENT_POLICY_VERSION: "2026-07-owner-approved",
};
const validCapiConsent = {
  granted: true,
  policyVersion: capiEnv.META_CAPI_CONSENT_POLICY_VERSION,
  grantedAt: new Date(Date.now() - 1_000).toISOString(),
  source: "public_lead_form_explicit_checkbox",
};
assert.equal(
  JSON.stringify(leadEffects.resolveLeadEffectPolicy(capiEnv, validCapiConsent)),
  JSON.stringify({
    enabledEffects: ["agent_notification", "meta_conversion"],
    requiredEffects: ["agent_notification", "meta_conversion"],
  }),
);
for (const invalidConsent of [
  null,
  { ...validCapiConsent, policyVersion: "stale-policy" },
  { ...validCapiConsent, grantedAt: new Date(Date.now() + 60_000).toISOString() },
  { ...validCapiConsent, source: "" },
]) {
  assert.equal(
    JSON.stringify(leadEffects.resolveLeadEffectPolicy(capiEnv, invalidConsent)),
    JSON.stringify({
      enabledEffects: ["agent_notification"],
      requiredEffects: ["agent_notification"],
    }),
  );
}

function createEffectsClient() {
  const rows = [];
  let nextId = 1;

  return {
    rows,
    async rpc(name, params) {
      if (name === "claim_lead_system_job_effect") {
        let row = rows.find(
          (candidate) =>
            candidate.system_job_id === params.p_system_job_id &&
            candidate.effect_key === params.p_effect_key,
        );

        if (!row) {
          row = {
            id: `effect-${nextId++}`,
            system_job_id: params.p_system_job_id,
            effect_key: params.p_effect_key,
            status: "processing",
            required: params.p_required,
            attempt_count: 1,
            result: null,
            retryable: false,
            error_code: null,
            lease_generation: params.p_parent_lease_generation,
            claim_worker_id: params.p_worker_id,
            parent_lease_token: params.p_parent_lease_token,
            execution_token: `effect-token-${nextId}-1`,
          };
          rows.push(row);
          return {
            data: [{
              effect_id: row.id,
              claim_disposition: "claimed",
              execution_token: row.execution_token,
              attempt_count: row.attempt_count,
              status: row.status,
              result: row.result,
              retryable: row.retryable,
              error_code: row.error_code,
            }],
            error: null,
          };
        }

        if (row.status === "succeeded") {
          return {
            data: [{
              effect_id: row.id,
              claim_disposition: "reused_succeeded",
              execution_token: row.execution_token,
              attempt_count: row.attempt_count,
              status: row.status,
              result: row.result,
              retryable: false,
              error_code: null,
            }],
            error: null,
          };
        }

        if (row.status === "operator_required" || (row.status === "failed" && !row.retryable)) {
          return {
            data: [{
              effect_id: row.id,
              claim_disposition:
                row.status === "operator_required" ? "operator_required" : "reused_failed",
              execution_token: row.execution_token,
              attempt_count: row.attempt_count,
              status: row.status,
              result: row.result,
              retryable: false,
              error_code: row.error_code,
            }],
            error: null,
          };
        }

        if (row.status === "processing") {
          row.status = "operator_required";
          row.retryable = false;
          row.error_code = "provider_effect_outcome_uncertain";
          return {
            data: [{
              effect_id: row.id,
              claim_disposition: "operator_required",
              execution_token: row.execution_token,
              attempt_count: row.attempt_count,
              status: row.status,
              result: row.result,
              retryable: false,
              error_code: row.error_code,
            }],
            error: null,
          };
        }

        row.status = "processing";
        row.required = params.p_required;
        row.attempt_count += 1;
        row.result = null;
        row.retryable = false;
        row.error_code = null;
        row.lease_generation = params.p_parent_lease_generation;
        row.claim_worker_id = params.p_worker_id;
        row.parent_lease_token = params.p_parent_lease_token;
        row.execution_token = `effect-token-${nextId}-${row.attempt_count}`;
        return {
          data: [{
            effect_id: row.id,
            claim_disposition: "claimed",
            execution_token: row.execution_token,
            attempt_count: row.attempt_count,
            status: row.status,
            result: row.result,
            retryable: row.retryable,
            error_code: row.error_code,
          }],
          error: null,
        };
      }

      if (name === "settle_lead_system_job_effect") {
        const row = rows.find(
          (candidate) =>
            candidate.id === params.p_effect_id &&
            candidate.status === "processing" &&
            candidate.execution_token === params.p_execution_token &&
            candidate.claim_worker_id === params.p_worker_id &&
            candidate.parent_lease_token === params.p_parent_lease_token &&
            candidate.lease_generation === params.p_parent_lease_generation,
        );
        if (!row) {
          return { data: null, error: { message: "system_job_effect_claim_superseded" } };
        }
        row.status = params.p_status;
        row.result = params.p_result;
        row.retryable = params.p_status === "failed" && params.p_retryable;
        row.error_code = params.p_status === "succeeded" ? null : params.p_error_code;
        return { data: [{ ...row }], error: null };
      }

      throw new Error(`Unexpected lead-effect RPC: ${name}`);
    },
    from(relation) {
      assert.equal(relation, "system_job_effects");
      const filters = {};
      const query = {
        select() {
          return query;
        },
        eq(key, value) {
          filters[key] = value;
          return query;
        },
        then(resolve, reject) {
          return execute().then(resolve, reject);
        },
      };

      async function execute() {
        return {
          data: rows.filter((row) =>
            Object.entries(filters).every(([key, value]) => row[key] === value),
          ),
          error: null,
        };
      }

      return query;
    },
  };
}

const effectsClient = createEffectsClient();
let notificationInvocations = 0;
let metaInvocations = 0;
const effectParams = {
  client: effectsClient,
  jobId: "00000000-0000-4000-8000-000000000010",
  organizationId: "00000000-0000-4000-8000-000000000011",
  leadId: "00000000-0000-4000-8000-000000000012",
  requestId: "offline-request-1",
  workerId: "offline-worker-1",
  leaseToken: "00000000-0000-4000-8000-000000000013",
  leaseGeneration: 1,
  enabledEffects: ["agent_notification", "meta_conversion"],
  requiredEffects: ["agent_notification", "meta_conversion"],
  notifyAgent: async () => {
    notificationInvocations += 1;
    return { notified: true, alertStatus: "sent" };
  },
  sendMetaConversion: async () => {
    metaInvocations += 1;
    return { sent: false, reason: "meta_conversion_failed" };
  },
};

await assert.rejects(
  () => leadEffects.runDurableLeadEffects(effectParams),
  (error) =>
    error?.code === "lead_required_effects_incomplete" &&
    error.summary?.allRequiredSucceeded === false &&
    error.summary?.failedRequiredEffects?.[0] === "meta_conversion",
  "a returned child failure prevents false parent completion",
);
assert.equal(notificationInvocations, 1);
assert.equal(metaInvocations, 1);
assert.equal(
  effectsClient.rows.find((row) => row.effect_key === "agent_notification")?.status,
  "succeeded",
);
assert.equal(
  effectsClient.rows.find((row) => row.effect_key === "meta_conversion")?.status,
  "failed",
);

const recoveredSummary = await leadEffects.runDurableLeadEffects({
  ...effectParams,
  sendMetaConversion: async () => {
    metaInvocations += 1;
    return { sent: true, eventsReceived: 1 };
  },
});
assert.equal(recoveredSummary.allRequiredSucceeded, true);
assert.equal(notificationInvocations, 1, "successful child effect is not invoked again");
assert.equal(metaInvocations, 2, "only the failed child effect is retried");
assert.equal(
  recoveredSummary.effects.find((effect) => effect.key === "agent_notification")?.reused,
  true,
);

class OfflineApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const metaDeletion = loadTypeScriptModule(
  "src/lib/services/meta-deletion-service.ts",
  (specifier) => {
    if (specifier === "node:crypto") return { createHash };
    if (specifier === "@/lib/api/route") return { ApiError: OfflineApiError };
    if (specifier === "@/lib/server/supabase-admin") return { createAdminClient: () => null };
    throw new Error(`Unexpected runtime import: ${specifier}`);
  },
);

const nowSeconds = 2_000_000_000;
assert.equal(metaDeletion.validateMetaDeletionIssuedAt(undefined, nowSeconds), "missing");
assert.equal(metaDeletion.validateMetaDeletionIssuedAt(nowSeconds - 60, nowSeconds), "fresh");
assert.throws(
  () =>
    metaDeletion.validateMetaDeletionIssuedAt(
      nowSeconds - metaDeletion.META_DELETION_MAX_AGE_SECONDS - 1,
      nowSeconds,
    ),
  (error) => error?.code === "stale_signed_request",
);
assert.throws(
  () =>
    metaDeletion.validateMetaDeletionIssuedAt(
      nowSeconds + metaDeletion.META_DELETION_FUTURE_SKEW_SECONDS + 1,
      nowSeconds,
    ),
  (error) => error?.code === "future_signed_request",
);

const requestHash = metaDeletion.getMetaDeletionRequestHash({
  appId: "offline-app",
  encodedPayload: "offline-signed-payload",
});
const confirmationCode = metaDeletion.getMetaDeletionConfirmationCode(requestHash);
const deletionStore = new Map();
const deletionClient = {
  async rpc(name, params) {
    assert.equal(name, "accept_meta_data_deletion_request");
    const existing = deletionStore.get(params.p_request_hash);
    if (existing) {
      existing.replayCount += 1;
      return { data: [{ ...existing, replayed: true }], error: null };
    }
    const row = {
      id: "00000000-0000-4000-8000-000000000020",
      confirmation_code: params.p_confirmation_code,
      responsibility_status: "operator_required",
      replayCount: 0,
    };
    deletionStore.set(params.p_request_hash, row);
    return { data: [{ ...row, replayed: false }], error: null };
  },
};
const deletionInput = {
  client: deletionClient,
  requestHash,
  confirmationCode,
  userHash: metaDeletion.getMetaDeletionUserHash("offline-app", "offline-user"),
  userIdEncrypted: "offline-encrypted-user-reference",
  issuedAt: nowSeconds - 60,
  freshnessStatus: "fresh",
};
const firstAcceptance = await metaDeletion.acceptMetaDeletionResponsibility(deletionInput);
const duplicateAcceptance = await metaDeletion.acceptMetaDeletionResponsibility(deletionInput);
deletionStore.get(requestHash).responsibility_status = "completed";
const completedReplayAcceptance = await metaDeletion.acceptMetaDeletionResponsibility(deletionInput);
assert.equal(firstAcceptance.replayed, false);
assert.equal(duplicateAcceptance.replayed, true);
assert.equal(completedReplayAcceptance.responsibilityStatus, "completed");
assert.equal(completedReplayAcceptance.replayed, true);
assert.equal(firstAcceptance.confirmationCode, duplicateAcceptance.confirmationCode);
assert.equal(deletionStore.size, 1, "duplicate callbacks keep one durable responsibility record");
let statusLookupCount = 0;
const deletionStatusClient = {
  from(relation) {
    assert.equal(relation, "meta_data_deletion_requests");
    return {
      select() {
        return {
          eq(column, value) {
            assert.equal(column, "confirmation_code");
            assert.equal(value, confirmationCode);
            return {
              async maybeSingle() {
                statusLookupCount += 1;
                return {
                  data: {
                    confirmation_code: confirmationCode,
                    responsibility_status: "operator_required",
                    first_received_at: "2026-07-11T12:00:00.000Z",
                    last_received_at: "2026-07-11T12:00:00.000Z",
                    completed_at: null,
                  },
                  error: null,
                };
              },
            };
          },
        };
      },
    };
  },
};
assert.equal(
  await metaDeletion.getMetaDeletionPublicStatus({
    client: deletionStatusClient,
    confirmationCode: "not-a-valid-code",
  }),
  null,
);
assert.equal(statusLookupCount, 0, "invalid confirmation codes must not query the deletion ledger");
const publicDeletionStatus = await metaDeletion.getMetaDeletionPublicStatus({
  client: deletionStatusClient,
  confirmationCode,
});
assert.equal(publicDeletionStatus.status, "operator_required");
assert.deepEqual(Object.keys(publicDeletionStatus).sort(), [
  "completedAt",
  "confirmationCode",
  "firstReceivedAt",
  "lastReceivedAt",
  "status",
]);

const systemJobSource = fs.readFileSync(
  path.join(root, "src/lib/services/system-job-service.ts"),
  "utf8",
);
const staticGenerationRouteSource = fs.readFileSync(
  path.join(root, "src/app/api/campaigns/[id]/generate-static-ads/route.ts"),
  "utf8",
);
const deletionRouteSource = fs.readFileSync(
  path.join(root, "src/app/api/meta/data-deletion/route.ts"),
  "utf8",
);
const deletionPageSource = fs.readFileSync(
  path.join(root, "src/app/data-deletion/page.tsx"),
  "utf8",
);
const migrationSource = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260710234500_harden_jobs_lead_effects_meta_deletion.sql",
  ),
  "utf8",
);
assert.match(systemJobSource, /createSystemJobLeaseHeartbeat/);
assert.match(systemJobSource, /appendSystemJobLogBestEffort/);
assert.doesNotMatch(
  systemJobSource,
  /await appendSystemJobLog\(/,
  "lifecycle log inserts must not gate durable job transitions",
);
assert.match(systemJobSource, /updateSystemJobIfLeaseOwned/);
assert.match(systemJobSource, /rpc\("claim_next_system_job_v2"/);
assert.match(systemJobSource, /p_protocol_version:\s*2/);
assert.match(systemJobSource, /runDurableLeadEffects/);
assert.match(systemJobSource, /LeadEffectsIncompleteError/);
assert.match(
  systemJobSource,
  /providerUsageRunId: `\$\{processingJob\.id\}:static_creative_generation`/,
);
assert.match(
  systemJobSource,
  /providerUsageAttemptKey: `\$\{processingJob\.id\}:video_generation`/,
);
assert.doesNotMatch(
  systemJobSource,
  /providerUsage(?:RunId|AttemptKey):[^\n]*(?:lease\.generation|lease\.token)/,
  "provider idempotency must survive lease expiry and reclaim",
);
assert.match(staticGenerationRouteSource, /if \(existingActiveJob\)/);
assert.match(staticGenerationRouteSource, /body\.force === true[\s\S]*?:retry:\$\{crypto\.randomUUID\(\)\}/);
assert.match(
  systemJobSource,
  /organizationId:\s*processingJob\.organization_id/,
  "durable creative jobs must preserve the authoritative organization fence",
);
assert.equal(
  (systemJobSource.match(/organizationId:\s*processingJob\.organization_id/g) ?? []).length,
  3,
  "static generation, video generation, and video status polling must all preserve the job organization fence",
);
const leadEffectSource = fs.readFileSync(
  path.join(root, "src/lib/services/lead-effect-aggregation-service.ts"),
  "utf8",
);
assert.match(
  leadEffectSource,
  /Promise\.allSettled/,
);
assert.match(leadEffectSource, /rpc\(\s*"claim_lead_system_job_effect"/);
assert.match(leadEffectSource, /rpc\(\s*"settle_lead_system_job_effect"/);
assert.doesNotMatch(
  leadEffectSource,
  /\.from\("system_job_effects"\)[\s\S]{0,500}\.(?:upsert|insert|update|delete)\(/,
  "lead effects must mutate only through the parent-lease-fenced RPCs",
);
assert.match(migrationSource, /lease_generation = lease_generation \+ 1/);
assert.match(migrationSource, /drop function if exists public\.claim_next_system_job\(text, integer\)/);
assert.match(migrationSource, /claim_next_system_job_v2/);
assert.match(migrationSource, /renew_system_job_lease/);
assert.match(migrationSource, /create table if not exists public\.system_job_effects/);
assert.match(migrationSource, /claim_lead_system_job_effect/);
assert.match(migrationSource, /settle_lead_system_job_effect/);
assert.match(migrationSource, /provider_effect_outcome_uncertain/);
assert.match(migrationSource, /create table if not exists public\.meta_data_deletion_requests/);
assert.match(migrationSource, /execution_enabled boolean not null default false/);
assert.match(migrationSource, /responsibility_status.*operator_required/s);
assert.match(deletionPageSource, /getMetaDeletionPublicStatus/);
assert.match(deletionPageSource, /No deletion or anonymization is represented as complete/);
assert.doesNotMatch(deletionPageSource, /user_id_hash|user_id_encrypted|resolution_note/);
const deletionPostSource = deletionRouteSource.slice(
  deletionRouteSource.indexOf("export async function POST"),
);
assert.ok(
  deletionPostSource.indexOf("await acceptMetaDeletionResponsibility") <
    deletionPostSource.indexOf("return NextResponse.json"),
  "callback acknowledgement happens only after durable responsibility acceptance",
);

const leadHandlerSource = fs.readFileSync(
  path.join(root, "src/lib/services/lead-handler-service.ts"),
  "utf8",
);
assert.match(leadHandlerSource, /\.select\("id, owner_id, user_id, organization_id"\)/);
assert.match(leadHandlerSource, /campaign_workspace_ambiguous/);
assert.match(leadHandlerSource, /getAppContext\(\)/);
assert.match(leadHandlerSource, /createPublicLeadAndQueueSideEffectsAtomically/);
assert.match(leadHandlerSource, /"capture_public_lead_with_side_effects_v1"/);
assert.match(leadHandlerSource, /atomic_public_lead_capture_receipt_invalid/);
assert.match(leadHandlerSource, /sideEffectJobId: atomicCapture\.sideEffectJob\.id/);
assert.doesNotMatch(
  leadHandlerSource,
  /sideEffectJob = await queueLeadSideEffectsJob/,
  "public lead retry must not split lead persistence from its durable side-effect job",
);

console.log("Reliability wave deterministic no-network tests passed.");
