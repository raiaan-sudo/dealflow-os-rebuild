#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

class TestApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function loadTypeScriptModule(relativePath, imports = {}) {
  const filePath = path.join(root, relativePath);
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText;
  const moduleShim = { exports: {} };
  const context = vm.createContext({
    Error,
    RegExp,
    exports: moduleShim.exports,
    module: moduleShim,
    require(identifier) {
      if (Object.hasOwn(imports, identifier)) {
        return imports[identifier];
      }
      throw new Error(`Unexpected runtime import: ${identifier}`);
    },
  });
  vm.runInContext(output, context, { filename: filePath });
  return moduleShim.exports;
}

const storageIdentity = loadTypeScriptModule(
  "src/lib/services/creative-asset-storage-identity.ts",
);
const userId = "11111111-1111-4111-8111-111111111111";
const campaignId = "22222222-2222-4222-8222-222222222222";
const canonicalPath = storageIdentity.buildManualCreativeStoragePath({
  userId,
  campaignId,
  fileName: "safe-upload.png",
});

assert.equal(canonicalPath, `${userId}/${campaignId}/safe-upload.png`);
assert.equal(
  storageIdentity.isCanonicalManualCreativeStorageIdentity({
    userId,
    campaignId,
    providerName: "manual_upload",
    storageBucket: "creative-assets",
    storagePath: canonicalPath,
  }),
  true,
  "the exact server-created user/campaign path is accepted",
);

for (const unsafeIdentity of [
  { storageBucket: "other-bucket" },
  { storagePath: `33333333-3333-4333-8333-333333333333/${campaignId}/safe.png` },
  { storagePath: `${userId}/${campaignId}/../victim.png` },
  { storagePath: `${userId}/${campaignId}/nested/victim.png` },
  { providerName: "generated_provider" },
]) {
  assert.equal(
    storageIdentity.isCanonicalManualCreativeStorageIdentity({
      userId,
      campaignId,
      providerName: "manual_upload",
      storageBucket: "creative-assets",
      storagePath: canonicalPath,
      ...unsafeIdentity,
    }),
    false,
    `unsafe identity was accepted: ${JSON.stringify(unsafeIdentity)}`,
  );
}

for (const unsafeFileName of ["../victim.png", "nested/victim.png", "..", "bad\\name.png"]) {
  assert.throws(
    () => storageIdentity.buildManualCreativeStoragePath({ userId, campaignId, fileName: unsafeFileName }),
    /unsafe path segment/,
  );
}

const retryScope = loadTypeScriptModule("src/lib/leads/retry-scope.ts", {
  "@/lib/api/route": { ApiError: TestApiError },
});
const expectedScope = {
  organizationId: "33333333-3333-4333-8333-333333333333",
  userId,
  campaignId,
};
const acceptedScope = retryScope.assertLeadRetryParentScope({
  expected: expectedScope,
  resolved: expectedScope,
});
assert.equal(acceptedScope.organizationId, expectedScope.organizationId);
assert.equal(acceptedScope.userId, expectedScope.userId);
assert.equal(acceptedScope.campaignId, expectedScope.campaignId);

for (const [label, expected, resolved, code] of [
  ["missing parent campaign", { ...expectedScope, campaignId: "" }, expectedScope, "lead_recovery_parent_scope_missing"],
  ["slug reassigned campaign", expectedScope, { ...expectedScope, campaignId: "44444444-4444-4444-8444-444444444444" }, "lead_recovery_parent_scope_mismatch"],
  ["organization changed", expectedScope, { ...expectedScope, organizationId: "55555555-5555-4555-8555-555555555555" }, "lead_recovery_parent_scope_mismatch"],
  ["campaign owner changed", expectedScope, { ...expectedScope, userId: "66666666-6666-4666-8666-666666666666" }, "lead_recovery_parent_scope_mismatch"],
]) {
  assert.throws(
    () => retryScope.assertLeadRetryParentScope({ expected, resolved }),
    (error) => error instanceof TestApiError && error.code === code,
    label,
  );
}

const retryPolicy = loadTypeScriptModule(
  "src/lib/services/system-job-retry-policy.ts",
);
assert.equal(
  retryPolicy.shouldRetryLeadCaptureJob({
    error: new TestApiError(503, "Database unavailable", "atomic_public_lead_capture_failed"),
    currentAttempt: 1,
    maxAttempts: 2,
  }),
  true,
);
assert.equal(
  retryPolicy.shouldRetryLeadCaptureJob({
    error: new TestApiError(409, "Scope mismatch is not temporary", "lead_recovery_parent_scope_mismatch"),
    currentAttempt: 1,
    maxAttempts: 2,
  }),
  false,
  "scope failures stay terminal even when their message contains temporary language",
);
assert.equal(
  retryPolicy.shouldRetryLeadCaptureJob({
    error: { code: "40001", message: "serialization failure" },
    currentAttempt: 1,
    maxAttempts: 2,
  }),
  true,
);
assert.equal(
  retryPolicy.shouldRetryLeadCaptureJob({
    error: Object.assign(new Error("fetch failed: connection reset"), { code: "ECONNRESET" }),
    currentAttempt: 1,
    maxAttempts: 2,
  }),
  true,
);
assert.equal(
  retryPolicy.shouldRetryLeadCaptureJob({
    error: new Error("validation failed"),
    currentAttempt: 1,
    maxAttempts: 2,
  }),
  false,
);
assert.equal(
  retryPolicy.shouldRetryLeadCaptureJob({
    error: new TestApiError(503, "Still unavailable", "atomic_public_lead_capture_failed"),
    currentAttempt: 2,
    maxAttempts: 2,
  }),
  false,
  "retry count is bounded by max_attempts",
);

const creativeSource = read("src/lib/services/creative-builder-service.ts");
const uploadSource = creativeSource.slice(
  creativeSource.indexOf("export async function uploadManualCreativeAsset"),
  creativeSource.indexOf("export async function deleteCreativeAssetById"),
);
const deleteSource = creativeSource.slice(
  creativeSource.indexOf("export async function deleteCreativeAssetById"),
);
assert.match(uploadSource, /const admin = createAdminClient\(\)/);
assert.match(uploadSource, /await admin\s+\.from\("creative_assets"\)/);
assert.match(uploadSource, /storage_bucket: MANUAL_CREATIVE_STORAGE_BUCKET/);
assert.match(uploadSource, /storage_path: storagePath/);
assert.doesNotMatch(uploadSource, /storageBucket:\s*MANUAL_CREATIVE_STORAGE_BUCKET/);
assert.doesNotMatch(uploadSource, /storagePath,\s*\n\s*originalFileName/);
assert.match(deleteSource, /creative_asset_storage_identity_untrusted/);
assert.match(deleteSource, /\.from\(MANUAL_CREATIVE_STORAGE_BUCKET\)/);
assert.match(deleteSource, /isCanonicalGeneratedVideoStorageIdentity/);
assert.match(deleteSource, /campaign\.organization_id/);
assert.doesNotMatch(deleteSource, /asset\.metadata|metadata\?\.storage|\.from\(storageBucket\)/);

const leadSource = read("src/lib/services/lead-handler-service.ts");
const queueSource = leadSource.slice(
  leadSource.indexOf("export async function queueFailedPublicLeadCapture"),
  leadSource.indexOf("async function createLeadMessage"),
);
const replaySource = leadSource.slice(
  leadSource.indexOf("export async function replayFailedPublicLeadCapture"),
  leadSource.indexOf("export async function findLeadByPhoneForOrganization"),
);
assert.match(queueSource, /campaignId: canonicalCampaignId/);
assert.match(queueSource, /leadCapture:\s*{\s*campaignId: canonicalCampaignId/s);
assert.match(replaySource, /campaign_id: payloadCampaignId \|\| undefined,\s*funnel_id: null/);
assert.match(replaySource, /createPublicLeadAndQueueSideEffectsAtomically/);
assert.match(replaySource, /organizationId: input\.expectedOrganizationId/);
assert.doesNotMatch(replaySource, /createLeadAndStartConversationForContext|queueLeadSideEffectsJob/);
assert.doesNotMatch(replaySource, /createPublicLeadAndStartConversation\(/);

const atomicCaptureSource = leadSource.slice(
  leadSource.indexOf("export async function createPublicLeadAndQueueSideEffectsAtomically"),
  leadSource.indexOf("export async function createVerifiedProviderLeadAndStartConversation"),
);
assert.ok(
  atomicCaptureSource.indexOf("assertLeadRetryParentScope") <
    atomicCaptureSource.indexOf('"capture_public_lead_with_side_effects_v1"'),
  "queued replay scope must be fenced before the atomic lead/outbox write",
);

const workerSource = read("src/lib/services/system-job-service.ts");
const retryWorkerSource = workerSource.slice(
  workerSource.indexOf('processingJob.kind === "lead_capture_retry"'),
  workerSource.indexOf('processingJob.kind === "lead_side_effects"'),
);
assert.match(retryWorkerSource, /expectedOrganizationId: processingJob\.organization_id/);
assert.match(retryWorkerSource, /expectedUserId: processingJob\.user_id/);
assert.match(retryWorkerSource, /expectedCampaignId: processingJob\.campaign_id \?\? ""/);
assert.match(workerSource, /shouldRetryLeadCaptureJob\(\{ error, currentAttempt, maxAttempts \}\)/);
assert.match(workerSource, /metaReportingRetry \|\| leadCaptureRetry/);

const migration = read(
  "supabase/migrations/20260710235700_protect_creative_asset_storage_identity.sql",
);
assert.match(migration, /add column if not exists storage_bucket text/);
assert.match(migration, /add column if not exists storage_path text/);
assert.match(migration, /provider_name = 'manual_upload'/);
assert.match(migration, /position\('\.\.' in storage_path\) = 0/);
assert.match(migration, /creative asset storage identity is immutable/);
assert.match(migration, /creative asset owner and campaign identity is immutable/);
assert.match(migration, /before update on public\.creative_assets/);
assert.match(migration, /create policy creative_assets_member_insert/);
assert.match(migration, /create policy creative_assets_member_delete/);
assert.match(migration, /storage_bucket is null\s+and storage_path is null/s);
assert.match(migration, /coalesce\(provider_name, ''\) <> 'manual_upload'/);
assert.match(migration, /or new\.provider_name = 'manual_upload'/);
assert.doesNotMatch(migration, /user_id = auth\.uid\(\)\s+or\s+exists/);
assert.doesNotMatch(migration, /campaign_record\.user_id::text = auth\.uid/);
assert.doesNotMatch(migration, /campaign_record\.owner_id = auth\.uid/);
assert.equal(
  migration.match(/private\.is_current_user_org_member\(campaign_record\.organization_id\)/g)?.length,
  5,
  "every asset policy branch requires current campaign-organization membership",
);
assert.doesNotMatch(migration, /metadata\s*->|metadata\s*#>|storageBucket|storagePath/);

const leadScopeMigration = read(
  "supabase/migrations/20260710235750_fence_lead_campaign_tenant_identity.sql",
);
assert.match(leadScopeMigration, /campaign_plans_id_organization_user_unique/);
assert.match(
  leadScopeMigration,
  /foreign key \(campaign_id, organization_id, user_id\)\s+references public\.campaign_plans \(id, organization_id, user_id\)/s,
);
assert.match(leadScopeMigration, /existing campaign-scoped leads require reconciliation/);
assert.match(leadScopeMigration, /validate constraint leads_campaign_tenant_user_fk/);
assert.match(leadScopeMigration, /on update restrict\s+on delete restrict/s);

console.log("Creative storage identity and lead retry scope tests passed (no network). ");
