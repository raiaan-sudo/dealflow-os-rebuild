import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

function loadTsModule(file, exportNames) {
  const source = fs.readFileSync(file, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { module: { exports: {} }, exports: {}, Intl, Date, URL, TypeError };
  context.exports = context.module.exports;
  vm.runInNewContext(transpiled, context, { filename: file });
  return Object.fromEntries(exportNames.map((name) => [name, context.module.exports[name]]));
}

function assertJsonEqual(actual, expected) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

function assertOrdered(source, patterns, message) {
  let cursor = -1;
  for (const pattern of patterns) {
    const index = source.indexOf(pattern, cursor + 1);
    assert.ok(index > cursor, message);
    cursor = index;
  }
}

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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    module: { exports: {} },
    exports: {},
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) {
        return mocks[specifier];
      }
      throw new Error(`Unexpected test import: ${specifier}`);
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

function loadTsFunction(file, functionName, globals) {
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const declaration = sourceFile.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === functionName,
  );
  assert.ok(declaration, `${functionName} must exist in ${file}`);
  const transpiled = ts.transpileModule(
    `${declaration.getText(sourceFile)}\nmodule.exports = { ${functionName} };`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const context = { module: { exports: {} }, exports: {}, ...globals };
  context.exports = context.module.exports;
  vm.runInNewContext(transpiled, context, { filename: `${file}#${functionName}` });
  return context.module.exports[functionName];
}

const {
  resolveLaunchTruth,
  resolveLaunchProviderObjectIds,
  getLaunchTruthPresentation,
  isFreshPausedLaunchConfirmation,
} = loadTsModule(
  "src/lib/launch-truth.ts",
  [
    "resolveLaunchTruth",
    "resolveLaunchProviderObjectIds",
    "getLaunchTruthPresentation",
    "isFreshPausedLaunchConfirmation",
  ],
);
const { getNextEligibleLaunchAt, LAUNCH_TIME_ZONE } = loadTsModule(
  "src/lib/launch-schedule.ts",
  ["getNextEligibleLaunchAt", "LAUNCH_TIME_ZONE"],
);
const deploymentTargetExports = loadTsModule(
  "src/lib/deployment-target.ts",
  [
    "getDeploymentTarget",
    "isExactIsolatedStagingVercelHost",
    "isExactProductionVercelHost",
  ],
);
const {
  getScheduledLaunchExecutionGate,
  getScheduledLaunchRetryDecision,
  SCHEDULED_META_LAUNCH_EXECUTION_ENV,
} = loadTsModuleWithMocks("src/lib/scheduled-launch-gate.ts", {
  "@/lib/deployment-target": deploymentTargetExports,
});
const directIsPausedMetaStatus = loadTsFunction(
  "src/app/api/campaigns/create/route.ts",
  "isPausedMetaStatus",
  {},
);
const legacyIsPausedMetaStatus = loadTsFunction(
  "src/lib/services/meta-launch-service.ts",
  "isPausedMetaStatus",
  {},
);
const buildDeterministicMetaName = loadTsFunction(
  "src/app/api/campaigns/create/route.ts",
  "buildDeterministicMetaName",
  {},
);
for (const isPaused of [directIsPausedMetaStatus, legacyIsPausedMetaStatus]) {
  assert.equal(isPaused("PAUSED"), true);
  assert.equal(isPaused(" paused "), true);
  assert.equal(isPaused("ACTIVE"), false);
  assert.equal(
    isPaused("CAMPAIGN_PAUSED"),
    false,
    "A parent-derived effective pause must not prove the child is configured PAUSED",
  );
}
const immutableNameIdentity = {
  organizationId: "organization-immutable",
  campaignId: "campaign-immutable",
  attemptId: "attempt-immutable",
  stage: "ad",
};
assert.equal(
  buildDeterministicMetaName({ ...immutableNameIdentity, baseName: "Original mutable headline" }),
  buildDeterministicMetaName({ ...immutableNameIdentity, baseName: "Changed mutable headline" }),
  "Retry identity changed after mutable campaign/copy inputs changed",
);

const completeReceipt = {
  resultStatus: "success",
  campaignId: "campaign-a",
  metaCampaignId: "meta-campaign",
  metaAdSetIds: ["meta-adset"],
  metaCreativeId: "meta-creative",
  metaAdIds: ["meta-ad"],
};

assert.equal(resolveLaunchTruth({ requestedCampaignId: null, resolvedCampaignId: "campaign-a", receipt: completeReceipt, confirmedInMeta: true }), "missing");
assert.equal(resolveLaunchTruth({ requestedCampaignId: "forged", resolvedCampaignId: null, receipt: completeReceipt, confirmedInMeta: true }), "missing");
assert.equal(resolveLaunchTruth({ requestedCampaignId: "campaign-a", resolvedCampaignId: "campaign-a", receipt: null, confirmedInMeta: true }), "missing");
assert.equal(resolveLaunchTruth({ requestedCampaignId: "campaign-a", resolvedCampaignId: "campaign-a", receipt: { ...completeReceipt, campaignId: "campaign-b" }, confirmedInMeta: true }), "missing");
assert.equal(resolveLaunchTruth({ requestedCampaignId: "campaign-a", resolvedCampaignId: "campaign-a", receipt: { ...completeReceipt, resultStatus: "failed" }, confirmedInMeta: false }), "failed");
assert.equal(resolveLaunchTruth({ requestedCampaignId: "campaign-a", resolvedCampaignId: "campaign-a", receipt: { ...completeReceipt, resultStatus: "partial_success" }, confirmedInMeta: false }), "partial");
assert.equal(resolveLaunchTruth({ requestedCampaignId: "campaign-a", resolvedCampaignId: "campaign-a", receipt: { ...completeReceipt, resultStatus: "scheduled", scheduledFor: "2026-07-11T13:00:00.000Z", metaCampaignId: null, metaAdSetIds: [], metaCreativeId: null, metaAdIds: [] }, confirmedInMeta: false }), "scheduled");
assert.equal(resolveLaunchTruth({ requestedCampaignId: "campaign-a", resolvedCampaignId: "campaign-a", receipt: completeReceipt, confirmedInMeta: false }), "provider_accepted");
assert.equal(resolveLaunchTruth({ requestedCampaignId: "campaign-a", resolvedCampaignId: "campaign-a", receipt: completeReceipt, confirmedInMeta: true }), "provider_confirmed");
assert.equal(getLaunchTruthPresentation("missing").title, "No verified launch receipt");
assert.equal(getLaunchTruthPresentation("scheduled").badge, "Scheduled; not launched");

const exactPausedSnapshot = {
  syncResult: "success",
  metaCampaignId: "meta-campaign",
  metaAdSetIds: ["meta-adset"],
  metaAdIds: ["meta-ad"],
  campaignEntityId: "meta-campaign",
  campaignConfiguredStatus: "PAUSED",
  campaignEffectiveStatus: "PAUSED",
  adSetStatuses: [{
    id: "meta-adset",
    configuredStatus: "PAUSED",
    effectiveStatus: "CAMPAIGN_PAUSED",
  }],
  adStatuses: [{
    id: "meta-ad",
    configuredStatus: "PAUSED",
    effectiveStatus: "ADSET_PAUSED",
  }],
};
assert.equal(isFreshPausedLaunchConfirmation({ receipt: completeReceipt, snapshot: exactPausedSnapshot, hasFreshMetaConfirmation: true }), true);
for (const unconfirmedSnapshot of [
  { ...exactPausedSnapshot, campaignConfiguredStatus: "ACTIVE" },
  { ...exactPausedSnapshot, metaAdSetIds: ["meta-adset", "extra-adset"] },
  { ...exactPausedSnapshot, metaAdIds: ["wrong-ad"] },
  { ...exactPausedSnapshot, campaignEntityId: "wrong-campaign" },
  { ...exactPausedSnapshot, adSetStatuses: [{ id: "meta-adset", configuredStatus: "ACTIVE", effectiveStatus: "CAMPAIGN_PAUSED" }] },
  { ...exactPausedSnapshot, adStatuses: [{ id: "wrong-ad", configuredStatus: "PAUSED", effectiveStatus: "PAUSED" }] },
]) {
  assert.equal(
    isFreshPausedLaunchConfirmation({ receipt: completeReceipt, snapshot: unconfirmedSnapshot, hasFreshMetaConfirmation: true }),
    false,
  );
}
assert.equal(isFreshPausedLaunchConfirmation({ receipt: completeReceipt, snapshot: exactPausedSnapshot, hasFreshMetaConfirmation: false }), false);

assertJsonEqual(
  resolveLaunchProviderObjectIds({
    resolvedCampaignId: "campaign-a",
    runtime: {
      metaCampaignId: "stale-runtime-campaign",
      metaAdSetId: "stale-runtime-adset",
      metaAdId: "stale-runtime-ad",
    },
    receipt: completeReceipt,
  }),
  {
    metaCampaignId: "meta-campaign",
    metaAdSetId: "meta-adset",
    metaAdId: "meta-ad",
    source: "durable_success_receipt",
  },
);
for (const untrustedReceipt of [
  { ...completeReceipt, campaignId: "campaign-b" },
  { ...completeReceipt, resultStatus: "failed" },
  { ...completeReceipt, metaAdSetIds: ["meta-adset", "extra-adset"] },
  { ...completeReceipt, metaCreativeId: null },
  { ...completeReceipt, metaAdIds: [] },
  { ...completeReceipt, metaAdIds: ["meta-ad", "extra-ad"] },
]) {
  assertJsonEqual(
    resolveLaunchProviderObjectIds({
      resolvedCampaignId: "campaign-a",
      runtime: {
        metaCampaignId: "runtime-campaign",
        metaAdSetId: "runtime-adset",
        metaAdId: "runtime-ad",
      },
      receipt: untrustedReceipt,
    }),
    {
      metaCampaignId: "runtime-campaign",
      metaAdSetId: "runtime-adset",
      metaAdId: "runtime-ad",
      source: "mutable_runtime",
    },
  );
}

const launchPageSource = fs.readFileSync("src/app/(app)/launch-success/page.tsx", "utf8");
assert.match(launchPageSource, /resolveLaunchTruth/);
assert.match(launchPageSource, /resolveLaunchProviderObjectIds/);
assert.match(launchPageSource, /getCampaignLaunchRecordForCampaign/);
assert.doesNotMatch(launchPageSource, /title="Campaign launched"/);
assert.doesNotMatch(launchPageSource, />\s*Launch complete\s*</);
assert.match(launchPageSource, /Scheduled does not mean created, accepted, active, or delivering/);
assert.match(launchPageSource, /metaCreativeId: launchReceipt\.metaCreativeId/);

const scheduleRouteSource = fs.readFileSync("src/app/api/campaigns/[id]/schedule-launch/route.ts", "utf8");
const providerLaunchRouteSource = fs.readFileSync("src/app/api/campaigns/[id]/launch/route.ts", "utf8");
const scheduledWorkerSource = fs.readFileSync("src/lib/services/scheduled-campaign-launch-service.ts", "utf8");
const launchAuditSource = fs.readFileSync("src/lib/services/campaign-launch-audit-service.ts", "utf8");
const internalRunnerSource = fs.readFileSync("src/app/api/internal/system-jobs/route.ts", "utf8");
const metaLaunchSource = fs.readFileSync("src/app/api/campaigns/create/route.ts", "utf8");
const billingSource = fs.readFileSync("src/lib/services/billing-service.ts", "utf8");
const scheduledMigrationSource = fs.readFileSync(
  "supabase/migrations/20260710235500_schedule_launch_claim_fencing.sql",
  "utf8",
);
const launchSimulatorSource = fs.readFileSync(
  "src/components/campaign/campaign-launch-simulator.tsx",
  "utf8",
);
const runtimeRouteSource = fs.readFileSync("src/app/api/campaign/runtime/route.ts", "utf8");
const runtimeApiSource = fs.readFileSync("src/components/campaign/launch/launch-runtime-api.ts", "utf8");
const envExampleSource = fs.readFileSync(".env.example", "utf8");
assert.match(scheduleRouteSource, /getNextEligibleLaunchAt/);
assert.match(scheduleRouteSource, /SCHEDULE_AND_AUTHORIZE_META_CAMPAIGN_ACTIVATION/);
assert.match(scheduleRouteSource, /preauthorizeMetaCampaignActivation/);
assert.match(scheduleRouteSource, /meta_activation_approval_stale/);
assert.match(scheduleRouteSource, /customerApprovalDigest/);
assert.match(scheduleRouteSource, /providerMutationPerformed: false/);
assert.match(scheduleRouteSource, /scheduleId: activationAuthorization\.launchRecordId/);
assert.match(scheduleRouteSource, /status: "scheduled"/);
assert.match(scheduleRouteSource, /scheduledFor: activationAuthorization\.scheduledFor/);
assert.match(providerLaunchRouteSource, /assertCampaignLaunchScheduleDue/);
assert.match(providerLaunchRouteSource, /completedReceipt\.metaCreativeId/);
assert.match(providerLaunchRouteSource, /getScheduledLaunchExecutionGate/);
assert.match(providerLaunchRouteSource, /Meta launch execution authorization was withdrawn/);
assert.match(internalRunnerSource, /processScheduledCampaignLaunchBatch/);
assert.match(internalRunnerSource, /export const maxDuration = 300/);
assert.match(internalRunnerSource, /system_jobs_safe_deadline_exhausted/);
assert.match(internalRunnerSource, /processScheduledCampaignLaunchBatch\(\{ maxClaims: 1 \}\)/);
assertOrdered(
  providerLaunchRouteSource,
  ["const record = await getCampaignById(id)", "if (!record)", "await assertCampaignCanLaunch(id)"],
  "Manual launch must prove actor-scoped campaign ownership before billing entitlement lookup",
);
assertOrdered(
  scheduleRouteSource,
  ["const record = await getCampaignById(id)", "if (!record)", "await assertCampaignCanLaunch(id)"],
  "Schedule launch must prove actor-scoped campaign ownership before billing entitlement lookup",
);
assert.match(scheduledWorkerSource, /claim_due_campaign_launch_records/);
assert.match(scheduledWorkerSource, /complete_campaign_launch_schedule_claim/);
assert.match(scheduledWorkerSource, /p_meta_creative_id: result\.metaCreativeId/);
assert.match(scheduledWorkerSource, /persist_campaign_launch_runtime_claim/);
assert.match(scheduledWorkerSource, /release_campaign_launch_schedule_claim/);
assert.match(scheduledWorkerSource, /assertLeaseAndGates/);
assert.match(scheduledWorkerSource, /internalActor/);
assert.match(scheduledWorkerSource, /resolveScheduledProviderReceiptResume\(data, claim\.leaseGeneration\)/);
assert.match(launchAuditSource, /p_user_id: context\.user\.id/);
assert.match(launchAuditSource, /rpc\("record_legacy_campaign_launch"/);
assert.match(launchAuditSource, /createAdminClient\(\)/);
assert.match(launchAuditSource, /rpc\("schedule_campaign_launch_intent"/);
assert.match(metaLaunchSource, /getCampaignByIdForInternalActor/);
assert.match(metaLaunchSource, /assertProviderMutationAllowed/);
assert.match(metaLaunchSource, /allowSessionOverride: !options\?\.internalActor/);
assert.match(billingSource, /options\?\.allowSessionOverride === false/);
assert.match(scheduledMigrationSource, /for update skip locked/i);
assert.match(scheduledMigrationSource, /schedule_lease_generation = launch\.schedule_lease_generation \+ 1/);
assert.match(scheduledMigrationSource, /auth\.role\(\) is distinct from 'service_role'/);
assert.match(scheduledMigrationSource, /schedule_locked_until > timezone\('utc', now\(\)\)/);
assert.match(scheduledMigrationSource, /scheduled launch completion does not match successful provider receipts/);
assert.match(scheduledMigrationSource, /scheduled_launch_max_attempts_exhausted/);
assert.match(
  scheduledMigrationSource,
  /launch\.result_status = 'processing'[\s\S]*?launch\.schedule_attempt_count < 5[\s\S]*?launch\.schedule_locked_until < timezone\('utc', now\(\)\)/,
);
assert.match(
  scheduledMigrationSource,
  /p_lease_generation > launch\.schedule_lease_generation/,
);
assert.match(scheduledMigrationSource, /before update or delete on public\.campaign_launch_provider_receipts/);
assert.match(launchSimulatorSource, /runtime\.status === "provider_paused"/);
assert.match(launchSimulatorSource, /runtime\.metaPushStatus === "provider_paused"/);
assert.match(launchSimulatorSource, /syncCampaignStatus\(campaign\.id\)/);
assert.match(launchSimulatorSource, /fetchRuntime\(campaign\.id\)/);
assert.match(runtimeRouteSource, /campaignId: z\.string\(\)\.uuid\(\)\.optional\(\)/);
assert.match(runtimeRouteSource, /campaign_runtime_campaign_required/);
assert.match(runtimeApiSource, /campaignId: string/);
const launchReceiptMigrationSource = fs.readFileSync(
  "supabase/migrations/20260710235000_create_launch_receipts_optimizer_support.sql",
  "utf8",
);
assert.match(
  launchReceiptMigrationSource,
  /revoke insert, update, delete, truncate, references, trigger[\s\S]*?on public\.campaign_launch_records from anon, authenticated/,
);
assert.match(launchReceiptMigrationSource, /create or replace function public\.schedule_campaign_launch_intent/);
assert.doesNotMatch(launchReceiptMigrationSource, /create policy campaign_launch_records_member_update/);
assert.match(envExampleSource, /^ALLOW_SCHEDULED_META_LAUNCH_EXECUTION=false$/m);

for (const [stage, responseAssignment, failureMarker] of [
  ["campaign", "campaignData = campaignResponseData;", "if (!campaignResponse.ok"],
  ["adset", "adSetData = adSetResponseData;", "if (!adSetResponse.ok"],
  ["creative", "creativeData = creativeResponseData;", "if (!creativeResponse.ok"],
  [
    "ad",
    "adData = adResponseData;",
    "const adResponseAccepted =",
  ],
]) {
  const start = metaLaunchSource.indexOf(responseAssignment);
  const end = metaLaunchSource.indexOf(failureMarker, start);
  const postResponseBlock = metaLaunchSource.slice(start, end);
  const receiptIndex = postResponseBlock.indexOf("recordProviderReceipt");
  const postResponseGateIndex = postResponseBlock.indexOf(
    "await options?.assertProviderMutationAllowed?.();",
  );
  assert.ok(start >= 0 && end > start, `${stage} provider response block must exist`);
  assert.ok(receiptIndex >= 0, `${stage} provider ID must be persisted as a receipt`);
  assert.ok(
    postResponseGateIndex > receiptIndex,
    `${stage} provider receipt must precede the post-response mutation gate`,
  );
}

assert.equal(SCHEDULED_META_LAUNCH_EXECUTION_ENV, "ALLOW_SCHEDULED_META_LAUNCH_EXECUTION");
const productionLaunchEnvironment = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "production",
  VERCEL_PROJECT_ID: "dealflow-production-project",
  DEALFLOW_PRODUCTION_VERCEL_PROJECT_ID: "dealflow-production-project",
  DEALFLOW_PRODUCTION_HOST_ATTESTATION: "DEALFLOW_PRODUCTION_VERCEL_PROJECT_EXACT_V1",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  META_PRODUCTION_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  META_PRODUCTION_PAUSED_LAUNCH_ATTESTATION:
    "DEALFLOW_META_PAUSED_LAUNCH_PRODUCTION_EXACT_V1",
  ALLOW_SCHEDULED_META_LAUNCH_EXECUTION: "true",
  ALLOW_META_LIVE_LAUNCH: "true",
  ALLOW_PRODUCTION_SCHEDULED_META_LAUNCH_EXECUTION: "true",
};
const stagingLaunchEnvironment = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
  VERCEL_PROJECT_ID: "dealflow-isolated-staging-project",
  DEALFLOW_STAGING_VERCEL_PROJECT_ID: "dealflow-isolated-staging-project",
  DEALFLOW_STAGING_HOST_ATTESTATION: "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1",
  NEXT_PUBLIC_SUPABASE_URL: "https://qrstabcdefghijklmnop.supabase.co",
  META_STAGING_ISOLATED_SUPABASE_PROJECT_REF: "qrstabcdefghijklmnop",
  META_STAGING_ISOLATED_DATABASE: "true",
  META_STAGING_PAUSED_LAUNCH_ATTESTATION:
    "DEALFLOW_META_PAUSED_LAUNCH_STAGING_ONLY_V1",
  ALLOW_SCHEDULED_META_LAUNCH_EXECUTION: "true",
  ALLOW_META_LIVE_LAUNCH: "true",
  ALLOW_STAGING_SCHEDULED_META_LAUNCH_EXECUTION: "true",
};
assertJsonEqual(
  getScheduledLaunchExecutionGate({
    ...productionLaunchEnvironment,
    ALLOW_SCHEDULED_META_LAUNCH_EXECUTION: "false",
  }),
  { allowed: false, reason: "scheduled_executor_disabled" },
);
assertJsonEqual(
  getScheduledLaunchExecutionGate({
    ...productionLaunchEnvironment,
    ALLOW_META_LIVE_LAUNCH: "false",
  }),
  { allowed: false, reason: "meta_live_launch_disabled" },
);
assertJsonEqual(
  getScheduledLaunchExecutionGate({
    NODE_ENV: "test",
    ALLOW_SCHEDULED_META_LAUNCH_EXECUTION: "true",
    ALLOW_META_LIVE_LAUNCH: "true",
  }),
  { allowed: false, reason: "unsupported_deployment_target" },
);
assertJsonEqual(
  getScheduledLaunchExecutionGate({
    ...productionLaunchEnvironment,
    VERCEL_PROJECT_ID: "wrong-production-project",
  }),
  { allowed: false, reason: "production_host_attestation_missing" },
);
assertJsonEqual(
  getScheduledLaunchExecutionGate(productionLaunchEnvironment),
  { allowed: true, reason: null },
);
assertJsonEqual(
  getScheduledLaunchExecutionGate({
    ...productionLaunchEnvironment,
    META_PRODUCTION_SUPABASE_PROJECT_REF: "wrongprojectrefvalue",
  }),
  { allowed: false, reason: "supabase_project_attestation_missing" },
);
assertJsonEqual(
  getScheduledLaunchExecutionGate({
    ...productionLaunchEnvironment,
    META_PRODUCTION_PAUSED_LAUNCH_ATTESTATION: "wrong",
  }),
  { allowed: false, reason: "provider_attestation_missing" },
);
assertJsonEqual(
  getScheduledLaunchExecutionGate(stagingLaunchEnvironment),
  { allowed: true, reason: null },
);
assertJsonEqual(
  getScheduledLaunchExecutionGate({
    ...stagingLaunchEnvironment,
    META_STAGING_ISOLATED_DATABASE: "false",
  }),
  { allowed: false, reason: "staging_host_attestation_missing" },
);
assertJsonEqual(
  getScheduledLaunchExecutionGate({
    ...stagingLaunchEnvironment,
    ALLOW_STAGING_SCHEDULED_META_LAUNCH_EXECUTION: "false",
  }),
  { allowed: false, reason: "staging_executor_disabled" },
);
assertJsonEqual(getScheduledLaunchRetryDecision({ attemptCount: 1, httpStatus: 503 }), {
  status: "scheduled",
  retryDelayMs: 60_000,
});
assertJsonEqual(getScheduledLaunchRetryDecision({ attemptCount: 3, httpStatus: 400 }), {
  status: "operator_action_required",
  retryDelayMs: null,
});
assertJsonEqual(getScheduledLaunchRetryDecision({ attemptCount: 1, httpStatus: 422 }), {
  status: "operator_action_required",
  retryDelayMs: null,
});
assertJsonEqual(getScheduledLaunchRetryDecision({ attemptCount: 5, httpStatus: 503 }), {
  status: "operator_action_required",
  retryDelayMs: null,
});

assert.equal(LAUNCH_TIME_ZONE, "America/New_York");
assert.equal(getNextEligibleLaunchAt(new Date("2026-01-15T12:00:00Z")).toISOString(), "2026-01-15T14:00:00.000Z");
assert.equal(getNextEligibleLaunchAt(new Date("2026-01-15T15:00:00Z")).toISOString(), "2026-01-16T14:00:00.000Z");
assert.equal(getNextEligibleLaunchAt(new Date("2026-01-15T14:00:00Z")).toISOString(), "2026-01-15T14:00:00.000Z");
assert.equal(getNextEligibleLaunchAt(new Date("2026-03-08T12:30:00Z")).toISOString(), "2026-03-08T13:00:00.000Z");
assert.equal(getNextEligibleLaunchAt(new Date("2026-03-08T13:30:00Z")).toISOString(), "2026-03-09T13:00:00.000Z");
assert.equal(getNextEligibleLaunchAt(new Date("2026-11-01T14:30:00Z")).toISOString(), "2026-11-02T14:00:00.000Z");
assert.equal(getNextEligibleLaunchAt(new Date("2026-07-04T14:00:00Z")).toISOString(), "2026-07-05T13:00:00.000Z", "No unapproved weekend/holiday restriction is invented");
assert.equal(getNextEligibleLaunchAt(new Date("2026-07-03T14:30:00Z")).toISOString(), "2026-07-04T13:00:00.000Z", "Friday after 9 Eastern schedules Saturday, not Monday");
assert.equal(getNextEligibleLaunchAt(new Date("2026-07-05T12:00:00Z")).toISOString(), "2026-07-05T13:00:00.000Z", "Sunday before 9 Eastern remains Sunday");

let lookupResponses = [];
let lookupCalls = [];
const fetchMetaObjectByName = loadTsFunction(
  "src/app/api/campaigns/create/route.ts",
  "fetchMetaObjectByName",
  {
    ApiError: FakeApiError,
    buildMetaGraphUrl(path, query) {
      lookupCalls.push({ path, query });
      return `https://graph.invalid/${path}`;
    },
    async fetchMetaJson() {
      const next = lookupResponses.shift();
      assert.ok(next, "Meta lookup test response queue was exhausted");
      return next;
    },
    withMetaBearerToken(_token, init) {
      return init;
    },
  },
);

lookupCalls = [];
lookupResponses = [
  {
    response: { ok: true },
    data: {
      data: [{ id: "wrong-parent", name: "deterministic", campaign_id: "other" }],
      paging: { cursors: { after: "opaque==/cursor" } },
    },
  },
  {
    response: { ok: true },
    data: {
      data: [{ id: "right-parent", name: "deterministic", campaign_id: "campaign-parent" }],
    },
  },
];
assert.equal(
  await fetchMetaObjectByName({
    accessToken: "redacted-test-token",
    externalAccountId: "account",
    edge: "adsets",
    fields: "id,name,campaign_id",
    name: "deterministic",
    expectedParentField: "campaign_id",
    expectedParentId: "campaign-parent",
  }),
  "right-parent",
);
assert.equal(lookupCalls.length, 2);
assert.equal(lookupCalls[1].query.after, "opaque==/cursor");

lookupResponses = [
  {
    response: { ok: true },
    data: {
      data: [{ id: "duplicate-a", name: "deterministic", campaign_id: "campaign-parent" }],
      paging: { cursors: { after: "next-page" } },
    },
  },
  {
    response: { ok: true },
    data: {
      data: [{ id: "duplicate-b", name: "deterministic", campaign_id: "campaign-parent" }],
    },
  },
];
await assert.rejects(
  fetchMetaObjectByName({
    accessToken: "redacted-test-token",
    externalAccountId: "account",
    edge: "adsets",
    fields: "id,name,campaign_id",
    name: "deterministic",
    expectedParentField: "campaign_id",
    expectedParentId: "campaign-parent",
  }),
  (error) => error?.code === "meta_lookup_ambiguous" && error?.status === 422,
);

let scheduledRpcCall = null;
let fakeScheduleResultStatus = "scheduled";
let fakeSchedulePersistedFor = "2026-07-11T13:00:00.000Z";
const fakeScheduleClient = {
  from(relation) {
    if (relation === "campaign_plans") {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          return {
            data: {
              id: "00000000-0000-4000-8000-000000000001",
              organization_id: "00000000-0000-4000-8000-000000000002",
              user_id: "00000000-0000-4000-8000-000000000003",
            },
            error: null,
          };
        },
      };
    }
    throw new Error(`Unexpected fake schedule relation: ${relation}`);
  },
  async rpc(name, params) {
    scheduledRpcCall = { name, params };
    return {
      data: {
        id: "00000000-0000-4000-8000-000000000004",
        organization_id: params.p_organization_id,
        user_id: params.p_expected_campaign_owner_id,
        campaign_id: params.p_campaign_id,
        idempotency_key: "campaign_schedule:server-derived",
        campaign_name: params.p_campaign_name,
        launch_mode: "scheduled_provider_paused",
        result_status: fakeScheduleResultStatus,
        scheduled_for: fakeSchedulePersistedFor,
        meta_campaign_id: null,
        meta_ad_set_ids: [],
        meta_ad_ids: [],
        execution_metadata: { providerMutationPerformed: false },
        event_timeline: [],
        created_at: "2026-07-11T13:00:00.000Z",
      },
      error: null,
    };
  },
};
const { scheduleCampaignLaunch } = loadTsModuleWithMocks(
  "src/lib/services/campaign-launch-audit-service.ts",
  {
    "@/lib/api/route": { ApiError: FakeApiError },
    "@/lib/supabase/admin": { createAdminClient: () => null },
    "@/lib/supabase/server": { createClient: async () => fakeScheduleClient },
    "@/lib/services/app-context": {
      getAppContext: async () => ({
        user: { id: "00000000-0000-4000-8000-000000000099" },
        organization: { id: "00000000-0000-4000-8000-000000000002" },
      }),
    },
  },
);
const savedSchedule = await scheduleCampaignLaunch({
  campaignId: "00000000-0000-4000-8000-000000000001",
  campaignName: "Collaborator-scheduled campaign",
  scheduledFor: "2026-07-11T13:00:00.000Z",
  timeZone: "America/New_York",
});
assert.equal(savedSchedule.resultStatus, "scheduled");
assert.equal(savedSchedule.scheduledFor, fakeSchedulePersistedFor);
assert.equal(
  scheduledRpcCall.params.p_expected_campaign_owner_id,
  "00000000-0000-4000-8000-000000000003",
  "A collaborator schedule must persist the authoritative campaign owner",
);
assert.notEqual(
  scheduledRpcCall.params.p_expected_campaign_owner_id,
  "00000000-0000-4000-8000-000000000099",
);
assert.equal(scheduledRpcCall.name, "schedule_campaign_launch_intent");
fakeScheduleResultStatus = "success";
await assert.rejects(
  scheduleCampaignLaunch({
    campaignId: "00000000-0000-4000-8000-000000000001",
    campaignName: "Terminal replay",
    scheduledFor: "2026-07-12T13:00:00.000Z",
    timeZone: "America/New_York",
  }),
  (error) => error?.code === "campaign_already_launched" && error?.status === 409,
);
fakeScheduleResultStatus = "operator_action_required";
await assert.rejects(
  scheduleCampaignLaunch({
    campaignId: "00000000-0000-4000-8000-000000000001",
    campaignName: "Operator replay",
    scheduledFor: "2026-07-12T13:00:00.000Z",
    timeZone: "America/New_York",
  }),
  (error) => error?.code === "campaign_launch_operator_action_required" && error?.status === 409,
);
fakeScheduleResultStatus = "scheduled";

let terminalRuntimePersistCount = 0;
let requestedRuntimeCampaignId = null;
const providerPausedRuntime = {
  status: "provider_paused",
  safetyState: "paused",
  metaPushStatus: "provider_paused",
  launchedAt: null,
};
const { setCampaignExperienceStatus } = loadTsModuleWithMocks(
  "src/lib/services/campaign-runtime-service.ts",
  {
    "@/lib/formatters": { formatCurrency: (value) => String(value) },
    "@/lib/services/campaign-plan-service": {
      getCampaignPlanById: async (campaignId) => {
        requestedRuntimeCampaignId = campaignId;
        return { id: campaignId, runtime: providerPausedRuntime };
      },
      getLatestCampaignPlan: async () => ({ id: "campaign-b", runtime: { ...providerPausedRuntime, status: "built", metaPushStatus: "not_pushed" } }),
      persistCampaignPlan: async (plan) => {
        terminalRuntimePersistCount += 1;
        return plan;
      },
    },
  },
);
const preservedTerminalRuntime = await setCampaignExperienceStatus("launch_ready", { campaignId: "campaign-a" });
assert.equal(requestedRuntimeCampaignId, "campaign-a", "Runtime mutation loaded the latest campaign instead of the requested campaign");
assert.equal(terminalRuntimePersistCount, 0, "Experience promotion rewrote durable provider-paused truth");
assert.equal(preservedTerminalRuntime.runtime.status, "provider_paused");
assert.equal(preservedTerminalRuntime.runtime.metaPushStatus, "provider_paused");
assert.equal(preservedTerminalRuntime.runtime.safetyState, "paused");

const schedulerMocks = {
  "server-only": {},
  "@/app/api/campaigns/create/route": { launchCampaignToMeta: async () => null },
  "@/lib/api/route": { ApiError: FakeApiError },
  "@/lib/env": { getPublicAppUrl: () => "https://app.invalid" },
  "@/lib/integrations/meta/service": {
    getMetaWorkspaceCredentialsForOrganization: async () => ({ pixelId: "pixel" }),
  },
  "@/lib/scheduled-launch-gate": {
    getScheduledLaunchExecutionGate: () => ({ allowed: true, reason: null }),
    getScheduledLaunchRetryDecision: ({ attemptCount, httpStatus }) =>
      attemptCount < 5 && (httpStatus == null || httpStatus >= 500)
        ? { status: "scheduled", retryDelayMs: 60_000 }
        : { status: "operator_action_required", retryDelayMs: null },
  },
  "@/lib/services/campaign-persistence": {
    getCampaignByIdForInternalActor: async () => null,
  },
  "@/lib/services/lead-tracking-service": {
    upsertCampaignTrackingContract: async () => undefined,
  },
  "@/lib/services/meta-campaign-activation-authority-service": {
    finalizeMetaActivationPreauthorizationAfterPausedLaunch: async () => ({
      status: "not_authorized",
      authorizationId: null,
      activationIntentId: null,
      errorCode: null,
    }),
  },
  "@/lib/supabase/admin": { createAdminClient: () => null },
};
const {
  processScheduledCampaignLaunchBatch,
  resolveScheduledProviderReceiptResume,
} = loadTsModuleWithMocks(
  "src/lib/services/scheduled-campaign-launch-service.ts",
  schedulerMocks,
);

const staleResume = resolveScheduledProviderReceiptResume(
  [
    { stage: "campaign", object_id: "meta-campaign", lease_generation: 1 },
    { stage: "campaign", object_id: "meta-campaign", lease_generation: 2 },
    { stage: "adset", object_id: "meta-adset", lease_generation: 1 },
    { stage: "creative", object_id: "meta-creative", lease_generation: 1 },
    { stage: "ad", object_id: "meta-ad", lease_generation: 1 },
  ],
  2,
);
assertJsonEqual(staleResume, {
  metaCampaignId: "meta-campaign",
  metaAdSetId: "meta-adset",
  metaCreativeId: "meta-creative",
  metaAdId: "meta-ad",
});
assert.throws(
  () => resolveScheduledProviderReceiptResume([
    { stage: "campaign", object_id: "future", lease_generation: 3 },
  ], 2),
  (error) => error?.code === "scheduled_launch_provider_receipt_future_generation",
);
assert.throws(
  () => resolveScheduledProviderReceiptResume([
    { stage: "campaign", object_id: "meta-a", lease_generation: 1 },
    { stage: "campaign", object_id: "meta-b", lease_generation: 2 },
  ], 2),
  (error) =>
    error?.code === "scheduled_launch_provider_receipt_ambiguous" && error?.httpStatus === 422,
);

class FakeScheduledLaunchStore {
  constructor(record) {
    this.record = { ...record };
    this.metaLock = null;
    this.receipts = [];
  }

  claimRow(workerId) {
    const now = Date.now();
    const retryable = ["scheduled", "failed", "uncertain", "partial_success"].includes(
      this.record.resultStatus,
    );
    const expiredProcessing =
      this.record.resultStatus === "processing" && this.record.lockedUntil < now;
    if (
      this.record.attemptCount >= 5 ||
      (!retryable && !expiredProcessing) ||
      new Date(this.record.scheduledFor).getTime() > now
    ) {
      return null;
    }
    this.record.resultStatus = "processing";
    this.record.attemptCount += 1;
    this.record.leaseGeneration += 1;
    this.record.lockedBy = workerId;
    this.record.leaseToken = `lease-${this.record.leaseGeneration}`;
    this.record.lockedUntil = now + 1_800_000;
    return {
      id: this.record.id,
      organization_id: this.record.organizationId,
      user_id: this.record.userId,
      campaign_id: this.record.campaignId,
      campaign_name: this.record.campaignName,
      idempotency_key: this.record.idempotencyKey,
      scheduled_for: this.record.scheduledFor,
      schedule_attempt_count: this.record.attemptCount,
      schedule_locked_by: this.record.lockedBy,
      schedule_lease_token: this.record.leaseToken,
      schedule_lease_generation: this.record.leaseGeneration,
    };
  }

  ownsLease(params) {
    return this.record.resultStatus === "processing" &&
      this.record.lockedBy === params.p_worker_id &&
      this.record.leaseToken === params.p_lease_token &&
      this.record.leaseGeneration === params.p_lease_generation &&
      this.record.lockedUntil > Date.now();
  }

  async rpc(name, params) {
    if (name === "claim_due_campaign_launch_records") {
      const row = this.claimRow(params.p_worker_id);
      return { data: row ? [row] : [], error: null };
    }
    if (name === "renew_campaign_launch_schedule_lease") {
      const owned = this.ownsLease(params);
      if (owned) this.record.lockedUntil = Date.now() + 1_800_000;
      return { data: owned, error: null };
    }
    if (name === "assert_meta_campaign_activation_preauthorization") {
      return { data: this.ownsLease({
        p_worker_id: this.record.lockedBy,
        p_lease_token: this.record.leaseToken,
        p_lease_generation: this.record.leaseGeneration,
      }), error: null };
    }
    if (name === "complete_campaign_launch_schedule_claim") {
      const owned = this.ownsLease(params);
      if (owned) {
        this.record.resultStatus = "success";
        this.record.lockedBy = null;
        this.record.leaseToken = null;
        this.record.lockedUntil = 0;
      }
      return { data: owned, error: null };
    }
    if (name === "release_campaign_launch_schedule_claim") {
      const owned = this.ownsLease(params);
      if (owned) {
        this.record.resultStatus = params.p_result_status;
        this.record.lockedBy = null;
        this.record.leaseToken = null;
        this.record.lockedUntil = 0;
      }
      return { data: owned, error: null };
    }
    throw new Error(`Unexpected fake RPC: ${name}`);
  }

  from(relation) {
    assert.equal(relation, "meta_launch_locks");
    const store = this;
    return {
      insert(payload) {
        return {
          select() { return this; },
          async maybeSingle() {
            if (store.metaLock) return { data: null, error: { message: "duplicate" } };
            store.metaLock = { ...payload };
            return { data: { campaign_id: payload.campaign_id }, error: null };
          },
        };
      },
      update(payload) {
        const filters = {};
        return {
          eq(key, value) { filters[key] = value; return this; },
          lte() { filters.requiresExpired = true; return this; },
          gt() { filters.requiresLive = true; return this; },
          select() { return this; },
          async maybeSingle() {
            const lock = store.metaLock;
            const matches = lock &&
              (!filters.campaign_id || lock.campaign_id === filters.campaign_id) &&
              (!filters.lock_token || lock.lock_token === filters.lock_token) &&
              (!filters.requiresExpired || new Date(lock.locked_until).getTime() <= Date.now()) &&
              (!filters.requiresLive || new Date(lock.locked_until).getTime() > Date.now());
            if (!matches) return { data: null, error: null };
            store.metaLock = { ...lock, ...payload };
            return { data: { campaign_id: lock.campaign_id }, error: null };
          },
        };
      },
      delete() {
        const filters = {};
        const query = {
          eq(key, value) { filters[key] = value; return this; },
          then(resolve, reject) {
            const lock = store.metaLock;
            if (lock && lock.campaign_id === filters.campaign_id && lock.lock_token === filters.lock_token) {
              store.metaLock = null;
            }
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          },
        };
        return query;
      },
    };
  }
}

function makeScheduledRecord(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    organizationId: "00000000-0000-4000-8000-000000000011",
    userId: "00000000-0000-4000-8000-000000000012",
    campaignId: "00000000-0000-4000-8000-000000000013",
    campaignName: "Runtime schedule",
    idempotencyKey: "campaign_schedule:runtime",
    scheduledFor: "2026-01-01T00:00:00.000Z",
    resultStatus: "scheduled",
    attemptCount: 0,
    leaseGeneration: 0,
    lockedBy: null,
    leaseToken: null,
    lockedUntil: 0,
    ...overrides,
  };
}

const concurrentStore = new FakeScheduledLaunchStore(makeScheduledRecord());
let concurrentDispatches = 0;
const deterministicResult = {
  metaCampaignId: "meta-campaign",
  metaAdSetIds: ["meta-adset"],
  metaCreativeId: "meta-creative",
  metaAdIds: ["meta-ad"],
  executionMetadata: { test: true },
};
const concurrentRuns = await Promise.all([
  processScheduledCampaignLaunchBatch({
    client: concurrentStore,
    dispatch: async () => {
      concurrentDispatches += 1;
      return deterministicResult;
    },
  }),
  processScheduledCampaignLaunchBatch({
    client: concurrentStore,
    dispatch: async () => {
      concurrentDispatches += 1;
      return deterministicResult;
    },
  }),
]);
assert.equal(concurrentRuns.reduce((sum, result) => sum + result.claimedCount, 0), 1);
assert.equal(concurrentRuns.reduce((sum, result) => sum + result.completedIds.length, 0), 1);
assert.equal(concurrentDispatches, 1, "Concurrent workers must dispatch a due launch once");
assert.equal(concurrentStore.record.resultStatus, "success");

const crashStore = new FakeScheduledLaunchStore(makeScheduledRecord());
const firstCrashRun = await processScheduledCampaignLaunchBatch({
  client: crashStore,
  dispatch: async (claim, context) => {
    crashStore.receipts.push(
      { stage: "campaign", object_id: "meta-campaign", lease_generation: claim.leaseGeneration },
      { stage: "adset", object_id: "meta-adset", lease_generation: claim.leaseGeneration },
      { stage: "creative", object_id: "meta-creative", lease_generation: claim.leaseGeneration },
      { stage: "ad", object_id: "meta-ad", lease_generation: claim.leaseGeneration },
    );
    crashStore.record.lockedUntil = 0;
    await context.assertLeaseAndGates();
    assert.fail("A crashed worker must lose its lease");
  },
});
assert.equal(firstCrashRun.claimedCount, 1);
assert.equal(firstCrashRun.completedIds.length, 0);
assert.equal(crashStore.record.resultStatus, "processing");
const recoveryRun = await processScheduledCampaignLaunchBatch({
  client: crashStore,
  dispatch: async (claim) => {
    const resume = resolveScheduledProviderReceiptResume(
      crashStore.receipts,
      claim.leaseGeneration,
    );
    assert.equal(resume.metaCampaignId, "meta-campaign");
    return deterministicResult;
  },
});
assert.equal(recoveryRun.claimedCount, 1);
assert.equal(recoveryRun.completedIds.length, 1);
assert.equal(crashStore.record.attemptCount, 2);
assert.equal(crashStore.record.resultStatus, "success");

const cappedStore = new FakeScheduledLaunchStore(makeScheduledRecord({
  resultStatus: "processing",
  attemptCount: 5,
  leaseGeneration: 5,
  lockedUntil: 0,
}));
const cappedRun = await processScheduledCampaignLaunchBatch({
  client: cappedStore,
  dispatch: async () => {
    assert.fail("An expired fifth-attempt claim must never dispatch again");
  },
});
assert.equal(cappedRun.claimedCount, 0);
assert.equal(cappedStore.record.attemptCount, 5);

console.log("launch truth, schedule, receipt, pagination, and worker recovery tests passed");
