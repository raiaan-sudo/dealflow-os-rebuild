#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";

class FakeApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function loadTsModuleWithMocks(file, mocks) {
  const source = fs.readFileSync(file, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = {
    module: { exports: {} },
    exports: {},
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      throw new Error(`Unexpected manual-reachability import: ${specifier}`);
    },
    process: { env: {} },
    crypto,
    setInterval,
    clearInterval,
    Date,
    URL,
    Error,
    TypeError,
    console,
  };
  context.exports = context.module.exports;
  vm.runInNewContext(transpiled, context, { filename: file });
  return context.module.exports;
}

const launchId = "10000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000002";
const campaignId = "10000000-0000-4000-8000-000000000003";
const ownerId = "10000000-0000-4000-8000-000000000004";
const baseRow = {
  id: launchId,
  organization_id: organizationId,
  user_id: ownerId,
  campaign_id: campaignId,
  idempotency_key: "campaign_schedule:manual-reachability",
  campaign_name: "Manual reachability proof",
  account_name: null,
  launch_mode: "scheduled_provider_paused",
  result_status: "processing",
  scheduled_for: "2026-07-10T12:00:00.000Z",
  schedule_next_attempt_at: null,
  schedule_locked_until: "2026-07-10T12:01:00.000Z",
  schedule_attempt_count: 1,
  schedule_lease_generation: 1,
  schedule_last_error_code: null,
  meta_campaign_id: null,
  meta_ad_set_ids: [],
  meta_creative_id: null,
  meta_ad_ids: [],
  execution_metadata: {
    providerMutationPending: {
      state: "pending",
      stage: "campaign",
      objectKey: `${organizationId}:${campaignId}:attempt:campaign`,
      leaseGeneration: 1,
    },
  },
  event_timeline: [],
  created_at: "2026-07-10T11:00:00.000Z",
};
let launchRow = structuredClone(baseRow);
let claimRpcCount = 0;

function makeQuery(relation) {
  const equals = new Map();
  let includedStatuses = null;
  return {
    select() { return this; },
    eq(key, value) { equals.set(key, value); return this; },
    in(key, values) {
      if (key === "result_status") includedStatuses = values;
      return this;
    },
    order() { return this; },
    limit() { return this; },
    async maybeSingle() {
      if (relation === "campaign_plans") {
        if (equals.get("id") !== campaignId || equals.get("organization_id") !== organizationId) {
          return { data: null, error: null };
        }
        return {
          data: { id: campaignId, organization_id: organizationId, user_id: ownerId },
          error: null,
        };
      }
      if (relation !== "campaign_launch_records") {
        throw new Error(`Unexpected manual-reachability relation: ${relation}`);
      }
      const exactMatch =
        (!equals.has("id") || equals.get("id") === launchRow.id) &&
        (!equals.has("organization_id") || equals.get("organization_id") === launchRow.organization_id) &&
        (!equals.has("campaign_id") || equals.get("campaign_id") === launchRow.campaign_id) &&
        (!equals.has("result_status") || equals.get("result_status") === launchRow.result_status) &&
        (!includedStatuses || includedStatuses.includes(launchRow.result_status));
      return { data: exactMatch ? structuredClone(launchRow) : null, error: null };
    },
  };
}

const serverClient = { from: makeQuery };
const adminClient = {
  from: makeQuery,
  async rpc(name) {
    assert.equal(name, "claim_manual_campaign_launch_record");
    claimRpcCount += 1;
    const expired = new Date(launchRow.schedule_locked_until).getTime() < Date.now();
    const pending = launchRow.execution_metadata?.providerMutationPending?.state === "pending";
    if (launchRow.result_status === "processing" && expired && pending) {
      launchRow = {
        ...launchRow,
        result_status: "operator_action_required",
        schedule_last_error_code: "meta_provider_create_outcome_ambiguous",
        execution_metadata: {
          ...launchRow.execution_metadata,
          operatorActionId: launchId,
          providerMutationOutcome: "operator_reconciliation_required",
        },
      };
    }
    return { data: null, error: null };
  },
};
const auditMocks = {
  "@/lib/api/route": { ApiError: FakeApiError },
  "@/lib/supabase/server": { createClient: async () => serverClient },
  "@/lib/supabase/admin": { createAdminClient: () => adminClient },
  "@/lib/services/app-context": {
    getAppContext: async () => ({
      user: { id: ownerId },
      organization: { id: organizationId },
    }),
  },
};
const audit = loadTsModuleWithMocks(
  "src/lib/services/campaign-launch-audit-service.ts",
  auditMocks,
);

const due = await audit.assertCampaignLaunchScheduleDue({
  campaignId,
  now: new Date("2026-07-11T12:00:00.000Z"),
});
assert.equal(due.id, launchId, "expired processing intent did not reach the claim boundary");
assert.equal(due.resultStatus, "processing");

await assert.rejects(
  audit.claimManualCampaignLaunch({ launchId, campaignId, leaseMs: 60_000 }),
  (error) =>
    error instanceof audit.CampaignLaunchOperatorActionRequiredError &&
    error.status === 409 &&
    error.code === "meta_provider_create_outcome_ambiguous" &&
    error.operatorActionId === launchId,
  "expired pending mutation did not surface its exact durable operator truth",
);
assert.equal(claimRpcCount, 1, "manual recovery did not invoke the exact claim terminalizer");
assert.equal(launchRow.result_status, "operator_action_required");

launchRow = {
  ...structuredClone(baseRow),
  schedule_locked_until: "2099-01-01T00:00:00.000Z",
};
await audit.assertCampaignLaunchScheduleDue({ campaignId });
await assert.rejects(
  audit.claimManualCampaignLaunch({ launchId, campaignId, leaseMs: 60_000 }),
  (error) => error?.code === "campaign_launch_claim_unavailable" && error?.status === 409,
  "an active processing lease was not retained as an ownership conflict",
);
assert.equal(launchRow.result_status, "processing");

launchRow = {
  ...structuredClone(baseRow),
  result_status: "scheduled",
  scheduled_for: "2099-01-01T00:00:00.000Z",
};
const claimCountBeforeNonDue = claimRpcCount;
await assert.rejects(
  audit.assertCampaignLaunchScheduleDue({ campaignId }),
  (error) => error?.code === "campaign_launch_not_due" && error?.status === 409,
  "a non-due launch passed the schedule gate",
);
assert.equal(claimRpcCount, claimCountBeforeNonDue, "a non-due launch reached the claim RPC");

class FakeNextResponse {
  static json(body, init = {}) {
    const status = init.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() { return body; },
    };
  }
}

let providerDispatchCount = 0;
const routeAuditMocks = {
  ...audit,
  getCampaignLaunchRecordForCampaign: async () => ({
    id: launchId,
    campaignId,
    resultStatus: "processing",
    metaCampaignId: null,
    metaAdSetIds: [],
    metaCreativeId: null,
    metaAdIds: [],
  }),
  assertCampaignLaunchScheduleDue: async () => ({ id: launchId }),
  claimManualCampaignLaunch: async () => {
    throw new audit.CampaignLaunchOperatorActionRequiredError({
      operatorActionId: launchId,
      code: "meta_provider_create_outcome_ambiguous",
    });
  },
};
const route = loadTsModuleWithMocks(
  "src/app/api/campaigns/[id]/launch/route.ts",
  {
    "next/server": { NextResponse: FakeNextResponse },
    zod: { z },
    "@/lib/api/route": {
      ApiError: FakeApiError,
      assertSameOriginRequest: () => undefined,
      handleApiError: (error) => FakeNextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status ?? 500 },
      ),
      parseOptionalJsonBody: async () => ({}),
      parseRouteParams: async () => ({ id: campaignId }),
    },
    "@/lib/api/rate-limit": {
      buildRateLimitResponse: () => FakeNextResponse.json({}, { status: 429 }),
      consumeRateLimit: async () => null,
      getRateLimitKey: () => "manual-reachability",
    },
    "@/app/api/campaigns/create/route": {
      launchCampaignToMeta: async () => {
        providerDispatchCount += 1;
        throw new Error("provider dispatch must remain unreachable");
      },
    },
    "@/lib/campaign-destination": {
      resolveCampaignDestinationContract: () => ({
        captureExperience: "dealflow_website",
        adDestination: "website",
        explicitAdDestination: false,
      }),
    },
    "@/lib/services/campaign-entitlements": {
      assertCampaignCanLaunch: async () => undefined,
    },
    "@/lib/services/app-context": {
      getAppContext: async () => ({
        user: { id: ownerId },
        organization: { id: organizationId },
      }),
    },
    "@/lib/services/campaign-persistence": {
      getCampaignById: async () => ({
        campaign: { name: "Manual reachability proof", organization_id: organizationId },
        launch: {
          runtime: {
            campaignId: null,
            adSetId: null,
            metaAdSetIds: [],
            adId: null,
            metaAdIds: [],
          },
        },
      }),
    },
    "@/lib/services/campaign-launch-audit-service": routeAuditMocks,
    "@/lib/services/meta-instant-form-route-service": {
      provisionCompletedMetaInstantFormRoute: async () => null,
    },
    "@/lib/supabase/admin": { createAdminClient: () => null },
    "@/lib/supabase/route-handler": { createRouteHandlerClient: async () => null },
  },
);

const routeResponse = await route.POST({}, { params: Promise.resolve({ id: campaignId }) });
assert.equal(routeResponse.status, 409);
assert.equal(
  JSON.stringify(await routeResponse.json()),
  JSON.stringify({
    error: "This campaign launch requires operator reconciliation before another provider attempt.",
    code: "meta_provider_create_outcome_ambiguous",
    operator_action_id: launchId,
  }),
);
assert.equal(providerDispatchCount, 0, "manual operator reconciliation triggered a provider recreate");

console.log(
  "PASS manual launch reachability: expired pending terminalizes, surfaces exact operator truth, and never recreates",
);
