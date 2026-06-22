#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const repoRoot = process.cwd();
const servicePath = path.join(repoRoot, "src/lib/services/system-job-service.ts");
const source = fs.readFileSync(servicePath, "utf8");
const require = createRequire(import.meta.url);

const stubPrefix = "__dealflow_lead_side_effects_dry_stub__:";
const stubs = new Map([
  [`${stubPrefix}@/lib/api/route`, {
    ApiError: class ApiError extends Error {
      constructor(status, message, code) {
        super(message);
        this.status = status;
        this.code = code;
      }
    },
    retryRouteStep: async (fn) => fn(),
  }],
  [`${stubPrefix}@/lib/logging`, {
    logError: () => undefined,
    logOperationalEvent: () => undefined,
    logWarn: () => undefined,
  }],
  [`${stubPrefix}@/lib/server/supabase-admin`, {
    createAdminClient: () => null,
  }],
  [`${stubPrefix}@/lib/services/campaign-persistence`, {
    regenerateHiggsfieldFinishedStaticAdsForUser: async () => {
      throw new Error("unexpected static creative proof call");
    },
    regenerateStaticCreativeAssetsForUser: async () => {
      throw new Error("unexpected static creative proof call");
    },
  }],
  [`${stubPrefix}@/lib/services/video-generation-job`, {
    pollVideoGenerationStatusJob: async () => {
      throw new Error("unexpected video proof call");
    },
    runVideoGenerationJob: async () => {
      throw new Error("unexpected video proof call");
    },
  }],
  [`${stubPrefix}@/lib/services/marketing-studio-worker-contract`, {
    isMarketingStudioWorkerOwnedJob: () => false,
    isMarketingStudioStaticGenerationJob: () => false,
    isMarketingStudioWorkerRuntimeEnabled: () => false,
    MARKETING_STUDIO_WORKER_DEFERRED_UNTIL: "2099-01-01T00:00:00.000Z",
    MARKETING_STUDIO_WORKER_RUNTIME: "cli_worker",
    shouldDeferMarketingStudioStaticGenerationToWorker: () => false,
  }],
  [`${stubPrefix}@/lib/services/static-creative-render-resilience`, {
    isTransientStaticCreativePersistenceError: () => false,
  }],
]);

for (const [id, exports] of stubs) {
  require.cache[id] = {
    id,
    filename: id,
    loaded: true,
    exports,
  };
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const id = `${stubPrefix}${request}`;
    if (stubs.has(id)) {
      return id;
    }
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const originalTsExtension = require.extensions[".ts"];
require.extensions[".ts"] = function compileTs(module, filename) {
  const tsSource = fs.readFileSync(filename, "utf8");
  const transpiled = ts.transpileModule(tsSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  module._compile(transpiled, filename);
};

try {
  const leadSideEffectsHelper =
    source.match(/export async function runLeadSideEffects[\s\S]*?function getJobClient/)?.[0] ?? "";
  const leadSideEffectsBranch =
    source.match(/processingJob\.kind === "lead_side_effects"[\s\S]*?processingJob\.kind === "performance_lead_billing"/)?.[0] ?? "";

  assert.match(source, /export async function runLeadSideEffects/);
  assert.doesNotMatch(leadSideEffectsHelper, /new Stripe|providerUsage|createLocation|createUser|workflow|enrollment|higgsfield|openai/i);
  assert.doesNotMatch(leadSideEffectsBranch, /new Stripe|providerUsage|createLocation|createUser|workflow|enrollment|higgsfield|openai/i);

  const { runLeadSideEffects } = require(servicePath);
  assert.equal(typeof runLeadSideEffects, "function");

  const payload = {
    requestId: "dry-proof-request",
    lead: {
      id: "dry-proof-lead",
      organization_id: "dry-proof-org",
      campaign_id: "dry-proof-campaign",
      name: "QA Dry Proof",
      email: "qa+lead-side-effects-crm-dry@example.com",
      phone: null,
      source: "lead_side_effects_crm_dry_proof",
    },
    metaConversion: {
      organizationId: "dry-proof-org",
      leadId: "dry-proof-lead",
      campaignId: "dry-proof-campaign",
      email: "qa+lead-side-effects-crm-dry@example.com",
    },
  };

  const calls = [];
  const logEvents = [];
  const baseDeps = {
    getCampaignEntitlementsForOrganization: async (params) => {
      calls.push(["entitlements", params.organizationId]);
      return {
        canCaptureLeads: true,
        canSendLeadAlerts: true,
        billingState: "active",
      };
    },
    safeNotifyAssignedAgentOfNewLead: async (lead) => {
      calls.push(["sms", lead.id]);
      return { notified: false, reason: "dry_proof_sms_stub" };
    },
    safeSendMetaLeadConversion: async (params) => {
      calls.push(["meta", params.leadId]);
      return { sent: false, reason: "dry_proof_meta_stub" };
    },
    safeSyncLeadToPartnerCrm: async (lead, options) => {
      calls.push(["crm", lead.id, options?.dryRun, options?.metadata?.source]);
      return {
        synced: false,
        skipped: true,
        reason: "dry_proof_ghl_writes_disabled",
      };
    },
    logOperationalEvent: (eventName, details) => {
      logEvents.push({ eventName, details });
    },
  };

  const result = await runLeadSideEffects({
    payload,
    jobId: "dry-proof-job",
    deps: baseDeps,
  });

  assert.deepEqual(calls, [
    ["entitlements", "dry-proof-org"],
    ["sms", "dry-proof-lead"],
    ["meta", "dry-proof-lead"],
    ["crm", "dry-proof-lead", false, "lead_side_effects"],
  ]);
  assert.equal(result.requestId, "dry-proof-request");
  assert.equal(result.leadId, "dry-proof-lead");
  assert.equal(result.notificationResult.reason, "dry_proof_sms_stub");
  assert.equal(result.metaConversionResult.reason, "dry_proof_meta_stub");
  assert.equal(result.crmSyncResult.reason, "dry_proof_ghl_writes_disabled");
  assert.equal(logEvents.length, 1);
  assert.equal(logEvents[0].eventName, "lead_capture.side_effects_processed");
  assert.equal(logEvents[0].details.crmSyncResult.reason, "dry_proof_ghl_writes_disabled");

  const crmThrowResult = await runLeadSideEffects({
    payload,
    jobId: "dry-proof-job-throw",
    deps: {
      ...baseDeps,
      safeSyncLeadToPartnerCrm: async () => {
        calls.push(["crm_throw", payload.lead.id]);
        throw new Error("synthetic CRM failure");
      },
    },
  });
  assert.equal(crmThrowResult.notificationResult.reason, "dry_proof_sms_stub");
  assert.equal(crmThrowResult.metaConversionResult.reason, "dry_proof_meta_stub");
  assert.equal(crmThrowResult.crmSyncResult.reason, "crm_sync_unhandled_exception");

  const skippedCalls = [];
  const skippedResult = await runLeadSideEffects({
    payload,
    jobId: "dry-proof-job-skipped",
    deps: {
      getCampaignEntitlementsForOrganization: async () => ({
        canCaptureLeads: false,
        canSendLeadAlerts: false,
        billingState: "inactive",
      }),
      safeNotifyAssignedAgentOfNewLead: async () => {
        skippedCalls.push("sms");
        return {};
      },
      safeSendMetaLeadConversion: async () => {
        skippedCalls.push("meta");
        return {};
      },
      safeSyncLeadToPartnerCrm: async () => {
        skippedCalls.push("crm");
        return {};
      },
    },
  });
  assert.equal(skippedResult.skipped, true);
  assert.equal(skippedResult.reason, "subscription_inactive");
  assert.deepEqual(skippedCalls, []);

  console.log(JSON.stringify({
    ok: true,
    proof: "lead_side_effects_crm_dry",
    executesRunLeadSideEffects: true,
    callsSms: true,
    callsMeta: true,
    callsCrmSync: true,
    crmSyncResultReturned: true,
    crmThrowDoesNotFailJob: true,
    subscriptionInactiveSkipsAllSideEffects: true,
    noLiveGhlCalls: true,
    noSmsEmailSends: true,
    noMetaMutation: true,
    noStripeBillingProviderActions: true,
    noProvisioning: true,
    noWorkflowEnrollment: true,
  }, null, 2));
} finally {
  Module._resolveFilename = originalResolveFilename;
  if (originalTsExtension) {
    require.extensions[".ts"] = originalTsExtension;
  } else {
    delete require.extensions[".ts"];
  }
}
