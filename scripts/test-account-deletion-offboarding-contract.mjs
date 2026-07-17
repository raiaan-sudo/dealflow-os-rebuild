import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const contractPath = path.join(root, "src/lib/account-deletion/account-deletion-contract.ts");
const servicePath = path.join(root, "src/lib/services/account-deletion-service.ts");
const apiPath = path.join(root, "src/app/api/account-deletion/route.ts");
const workerPath = path.join(root, "src/app/api/internal/account-deletion-worker/route.ts");
const systemRunnerPath = path.join(root, "src/app/api/internal/system-jobs/route.ts");
const migrationPath = path.join(root, "supabase/migrations/20260713026000_add_account_deletion_and_provider_offboarding.sql");
const retentionAuthorityMigrationPath = path.join(
  root,
  "supabase/migrations/20260713028000_harden_account_deletion_retention_authority.sql",
);
const privacyAuthorityMigrationPath = path.join(
  root,
  "supabase/migrations/20260717050000_create_privacy_consent_dsar_authority.sql",
);
const generatedStaticStorageMigrationPath = path.join(
  root,
  "supabase/migrations/20260717040000_bind_generated_static_storage_tenancy.sql",
);
const vercelPath = path.join(root, "vercel.json");
const componentPath = path.join(root, "src/components/settings/account-deletion-card.tsx");
const publicPagePath = path.join(root, "src/components/legal/localized-data-deletion-page.tsx");
const accessPath = path.join(root, "src/lib/account-deletion/account-deletion-access.ts");
const appContextPath = path.join(root, "src/lib/services/app-context.ts");
const proxyPath = path.join(root, "src/proxy.ts");
const ghlDeletionPath = path.join(root, "src/lib/account-deletion/ghl-account-deletion.ts");
const stripeWebhookPath = path.join(root, "src/app/api/stripe/webhook/route.ts");

const contractSource = fs.readFileSync(contractPath, "utf8");
const compiled = ts.transpileModule(contractSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: contractPath,
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(compiled, {
  exports: loaded.exports,
  module: loaded,
  process: { env: {} },
  Date,
  Error,
  Object,
  Array,
  Number,
  String,
  RegExp,
}, { filename: "account-deletion-contract.compiled.cjs" });
const contract = loaded.exports;

const accessCompiled = ts.transpileModule(fs.readFileSync(accessPath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: accessPath,
}).outputText;
const accessLoaded = { exports: {} };
vm.runInNewContext(accessCompiled, {
  exports: accessLoaded.exports,
  module: accessLoaded,
  process: { env: {} },
}, { filename: "account-deletion-access.compiled.cjs" });
const accessContract = accessLoaded.exports;
assert.equal(accessContract.isAccountDeletionExecutionEnabled({}), false);
assert.equal(accessContract.isAccountDeletionExecutionEnabled({
  ACCOUNT_DELETION_EXECUTION_ENABLED: "false",
}), false);
assert.equal(accessContract.isAccountDeletionExecutionEnabled({
  ACCOUNT_DELETION_EXECUTION_ENABLED: "true",
}), true);

assert.equal(contract.ACCOUNT_DELETION_CONFIRMATION_PHRASE, "DELETE MY DEALFLOW WORKSPACE");
assert.equal(contract.ACCOUNT_DELETION_TASK_KINDS.length, 16);
assert.equal(new Set(contract.ACCOUNT_DELETION_TASK_KINDS).size, 16);
assert.ok(contract.ACCOUNT_DELETION_TASK_KINDS.includes("purge_expired_financial_records"));
assert.ok(contract.ACCOUNT_DELETION_TASK_KINDS.includes("expire_deletion_receipt_details"));

const defaults = contract.getAccountDeletionRetentionPolicy({});
assert.equal(defaults.graceDays, 7);
assert.equal(defaults.operationalRetentionDays, 30);
assert.equal(defaults.financialRetentionDays, 2_555);
assert.equal(defaults.billingCancellationMode, "period_end");

const bounded = contract.getAccountDeletionRetentionPolicy({
  ACCOUNT_DELETION_GRACE_DAYS: "999",
  ACCOUNT_DELETION_OPERATIONAL_RETENTION_DAYS: "0",
  ACCOUNT_DELETION_FINANCIAL_RETENTION_DAYS: "99999",
  ACCOUNT_DELETION_BILLING_CANCELLATION_MODE: "immediate",
});
assert.equal(bounded.graceDays, 30);
assert.equal(bounded.operationalRetentionDays, 1);
assert.equal(bounded.financialRetentionDays, 3_650);
assert.equal(bounded.billingCancellationMode, "immediate");

const requestedAt = new Date("2026-07-13T12:00:00.000Z");
const plan = contract.buildAccountDeletionTaskPlan(requestedAt, defaults);
assert.equal(plan.length, 16);
assert.equal(plan[0].kind, "suspend_workspace");
assert.equal(plan[0].availableAt, requestedAt.toISOString());
assert.equal(plan[7].legalHoldBlocking, true);
assert.equal(plan.at(-1).kind, "complete_request");
assert.equal(plan.filter((task) => task.phase === "immediate").length, 7);
assert.equal(plan.find((task) => task.kind === "purge_expired_financial_records").availableAt, "2033-07-11T12:00:00.000Z");
assert.equal(plan.find((task) => task.kind === "expire_deletion_receipt_details").availableAt, "2033-07-11T12:00:00.000Z");

const retry = contract.getAccountDeletionRetryResult({
  attemptCount: 1,
  maxAttempts: 8,
  now: requestedAt,
  retryable: true,
  uncertain: false,
  code: "provider_timeout",
});
assert.equal(retry.outcome, "retry");
assert.equal(retry.nextAttemptAt, "2026-07-13T12:05:00.000Z");
assert.equal(contract.getAccountDeletionRetryResult({
  attemptCount: 1,
  maxAttempts: 8,
  now: requestedAt,
  retryable: true,
  uncertain: true,
  code: "unknown_outcome",
}).outcome, "reconcile");
assert.equal(contract.getAccountDeletionRetryResult({
  attemptCount: 8,
  maxAttempts: 8,
  now: requestedAt,
  retryable: true,
  uncertain: false,
  code: "exhausted",
}).outcome, "operator_required");

assert.deepEqual(
  JSON.parse(JSON.stringify(contract.sanitizeAccountDeletionReceiptMetadata({
    status: "complete",
    accessToken: "must-not-survive",
    nested: { providerRequestId: "safe-id", email: "must-not-survive" },
  }))),
  { status: "complete", nested: { providerRequestId: "safe-id" } },
);
assert.equal(contract.getCustomerVisibleAccountDeletionState({
  state: "operator_required",
  legalHoldActive: false,
  scheduledDeletionAt: null,
  completedAt: null,
}).label, "Needs specialist review");
assert.equal(contract.getCustomerVisibleAccountDeletionState({
  state: "completed",
  legalHoldActive: false,
  scheduledDeletionAt: null,
  completedAt: "2026-07-13T13:00:00.000Z",
}).terminal, true);

const service = fs.readFileSync(servicePath, "utf8");
assert.match(service, /context\.organization\.owner_user_id !== context\.user\.id/);
assert.doesNotMatch(service, /signInWithPassword/);
assert.match(service, /currentLevel !== "aal2"/);
assert.match(service, /authorizePrivacySubjectAction/);
assert.match(service, /create_privacy_delete_request_v1/);
assert.match(service, /claim_account_deletion_tasks_v2/);
assert.match(service, /isAccountDeletionExecutionEnabled/);
assert.match(service, /ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED/);
assert.match(service, /account_deletion_execution_unavailable/);
assert.ok(
  service.indexOf("account_deletion_execution_unavailable") <
    service.indexOf("verifyDeletionIdentity({"),
  "disabled execution must fail before identity/provider/database mutation",
);
assert.match(service, /No lifecycle task was claimed/);
assert.match(service, /processScheduledAccountDeletionWork/);
assert.match(service, /enabled: false as const/);
assert.match(service, /blockedReason: "account_deletion_execution_disabled" as const/);
assert.ok(
  service.indexOf("if (!accountDeletionWritesEnabled())", service.indexOf("processScheduledAccountDeletionWork")) <
    service.indexOf("processAccountDeletionWork(params)", service.indexOf("processScheduledAccountDeletionWork")),
  "scheduled deletion must check the execution gate before delegating to the claiming worker",
);
assert.match(service, /idempotencyKey: `account-deletion:\$\{task\.id\}`/);
assert.match(service, /subscriptions\.retrieve\(subscriptionId\)/);
assert.match(service, /select\("retention_policy"\)/);
assert.match(service, /const admin = createAdminClient\(\)/);
assert.match(service, /p_actor_user_id: context\.user\.id/);
assert.doesNotMatch(service, /p_policy:/);
assert.match(service, /stripe_deletion_policy_snapshot_invalid/);
assert.match(service, /method: "GET"/);
assert.match(service, /method: "DELETE"/);
assert.match(service, /AccountDeletionUncertainError/);
assert.match(service, /GHL_ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED/);
assert.match(service, /executeGhlAccountDeletionProviderOffboarding/);
assert.match(service, /get_account_deletion_creative_storage_inventory_v2/);
assert.match(service, /authorize_generated_static_storage_cleanup_v1/);
assert.match(service, /finalize_account_deletion_creative_storage_v2/);
assert.doesNotMatch(service, /from\("creative_assets"\)[\s\S]{0,300}eq\("organization_id"/);
assert.match(service, /outcome: taskError instanceof AccountDeletionUncertainError \? "reconcile" : "retry"/);
assert.doesNotMatch(service, /console\.(?:log|error|warn).*password/i);
assert.doesNotMatch(service, /access_token.*(?:metadata|receipt)/i);

const generatedStaticStorageMigration = fs.readFileSync(
  generatedStaticStorageMigrationPath,
  "utf8",
);
for (const marker of [
  "generated_static_storage_cleanup_authorities",
  "generated_static_cleanup_candidate_sha256_v1",
  "get_account_deletion_creative_storage_inventory_v2",
  "authorize_generated_static_storage_cleanup_v1",
  "finalize_account_deletion_creative_storage_v2",
  "generated_static_storage_cleanup_authority_required",
  "account_deletion_creative_storage_object_still_present",
]) {
  assert.match(generatedStaticStorageMigration, new RegExp(marker));
}
assert.match(
  generatedStaticStorageMigration,
  /state in \('authorized', 'object_deleted', 'finalizing', 'finalized'\)/,
);
assert.match(
  generatedStaticStorageMigration,
  /cleanup\.candidate_sha256 is distinct from expected_candidate/,
);

const api = fs.readFileSync(apiPath, "utf8");
assert.match(api, /assertSameOriginRequest\(request\)/);
assert.match(api, /maxBytes: 8 \* 1024/);
assert.match(api, /status: 202/);
assert.match(api, /executionAvailable/);
assert.match(api, /ACCOUNT_DELETION_SUPPORT_EMAIL/);
assert.match(api, /identityMethod: z\.literal\("aal2"\)/);
assert.doesNotMatch(api, /z\.literal\("password"\)/);
const worker = fs.readFileSync(workerPath, "utf8");
assert.match(worker, /assertInternalSystemRequest\(request\)/);
assert.match(worker, /maxTasks: 25/);
const systemRunner = fs.readFileSync(systemRunnerPath, "utf8");
assert.match(systemRunner, /assertInternalSystemRequest\(request\)/);
assert.match(systemRunner, /name: "account_deletion"/);
assert.match(systemRunner, /processScheduledAccountDeletionWork\(\{ maxTasks: 5 \}\)/);
assert.match(systemRunner, /accountDeletionClaimed: accountDeletion\.claimed/);
assert.ok(
  systemRunner.indexOf("assertInternalSystemRequest(request)") <
    systemRunner.indexOf('name: "account_deletion"'),
  "internal authorization must precede the scheduled deletion stage",
);
const vercel = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
assert.ok(
  vercel.crons.some((entry) => entry.path === "/api/internal/system-jobs" && entry.schedule === "*/1 * * * *"),
  "the authenticated shared system-jobs route must remain scheduled",
);
const migration = fs.readFileSync(migrationPath, "utf8");
assert.match(migration, /approved_authority_hash text null/);
assert.match(migration, /approved_at timestamptz null/);
assert.match(migration, /account_deletion_retention_approval_pair_check/);
assert.match(migration, /account_deletion_retention_authority_pending/);
assert.doesNotMatch(migration, /sha256:7d8ca5de86fe436a9758f96cd02c566bb10c74e176fa874525a87733465bb8d6/);
const retentionAuthorityMigration = fs.readFileSync(retentionAuthorityMigrationPath, "utf8");
assert.match(
  retentionAuthorityMigration,
  /revoke all privileges on table public\.account_deletion_retention_configuration\s+from public, anon, authenticated, service_role;/,
);
assert.match(
  retentionAuthorityMigration,
  /grant select on table public\.account_deletion_retention_configuration\s+to service_role;/,
);
assert.match(
  retentionAuthorityMigration,
  /revoke all privileges \([\s\S]*approved_at[\s\S]*\) on table public\.account_deletion_retention_configuration\s+from public, anon, authenticated, service_role;/,
);
assert.match(retentionAuthorityMigration, /has_any_column_privilege\(/);
assert.match(retentionAuthorityMigration, /account_deletion_retention_service_role_column_write_still_granted/);
assert.match(retentionAuthorityMigration, /account_deletion_retention_public_column_write_still_granted/);
for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
  assert.match(retentionAuthorityMigration, new RegExp(`['"]${privilege}['"]`));
}
assert.match(retentionAuthorityMigration, /account_deletion_retention_owner_update_missing/);
assert.doesNotMatch(
  retentionAuthorityMigration,
  /grant\s+(?:[^;]*\b(?:insert|update|delete|truncate|references|trigger)\b[^;]*)\s+on\s+(?:table\s+)?public\.account_deletion_retention_configuration\s+to\s+service_role/i,
);
const privacyAuthorityMigration = fs.readFileSync(privacyAuthorityMigrationPath, "utf8");
assert.match(privacyAuthorityMigration, /create_privacy_delete_request_v1/);
assert.match(privacyAuthorityMigration, /revoke execute on function public\.create_account_deletion_request_v1[\s\S]+from public, anon, authenticated, service_role/);
assert.match(privacyAuthorityMigration, /privacy_legal_retention_authority_pending/);
const component = fs.readFileSync(componentPath, "utf8");
assert.match(component, /copy\.recentAal2/);
assert.match(component, /identityMethod: "aal2"/);
assert.doesNotMatch(component, /type="password"/);
assert.match(component, /ACCOUNT_DELETION_CONFIRMATION_PHRASE/);
assert.match(component, /copy\.acknowledgement/);
assert.match(component, /idempotencyKeyRef\.current \?\?=/);
assert.match(component, /if \(!response\.ok\)[\s\S]{0,100}setExecutionAvailable\(false\)/);
const publicPage = fs.readFileSync(publicPagePath, "utf8");
assert.match(publicPage, /getPublicAccountDeletionStatus/);
assert.match(publicPage, /lookupUnavailable \? copy\.unavailable : copy\.noMatch/);
assert.match(publicPage, /copy\.statuses\.operator_required/);
assert.doesNotMatch(publicPage, /scaleholdings\.co/);

const access = fs.readFileSync(accessPath, "utf8");
assert.match(access, /support@agentdealflow\.io/);
assert.match(access, /ACCOUNT_DELETION_EXECUTION_ENABLED === "true"/);
const appContext = fs.readFileSync(appContextPath, "utf8");
assert.match(appContext, /assertAccountDeletionWorkspaceAccess\(adminClient, user\.id\)/);
assert.match(appContext, /account_deletion_suspensions/);
assert.match(appContext, /AccountDeletionWorkspaceSuspendedError/);
assert.doesNotMatch(appContext, /ACCOUNT_DELETION_EXECUTION_ENABLED|isAccountDeletionExecutionEnabled/);
const proxy = fs.readFileSync(proxyPath, "utf8");
assert.match(proxy, /is_current_account_deletion_suspended_v1/);
assert.match(proxy, /account_deletion_access_fence_unavailable/);
assert.match(proxy, /account_deletion_workspace_suspended/);
assert.match(proxy, /status: 423/);
assert.doesNotMatch(proxy, /ACCOUNT_DELETION_EXECUTION_ENABLED|isAccountDeletionExecutionEnabled/);
const ghlDeletion = fs.readFileSync(ghlDeletionPath, "utf8");
assert.match(ghlDeletion, /evaluateGhlAccountDeletionOwnership/);
assert.match(ghlDeletion, /provisioningRunOrganizationId === authority\.requestedOrganizationId/);
assert.match(ghlDeletion, /createReceiptProviderReference !== authority\.providerLocationId/);
assert.match(ghlDeletion, /ghl_nonowned_location_detached_without_provider_delete/);
assert.match(ghlDeletion, /state: "owned" \| "explicitly_nonowned" \| "unresolved"/);
assert.match(ghlDeletion, /ghl_deletion_ownership_unresolved/);
assert.match(ghlDeletion, /method: "GET"/);
assert.match(ghlDeletion, /method: "DELETE"/);
assert.match(ghlDeletion, /ghl_deletion_outcome_ambiguous/);
const stripeWebhook = fs.readFileSync(stripeWebhookPath, "utf8");
assert.match(stripeWebhook, /action: "construct_webhook_event"/);
assert.match(stripeWebhook, /stripe-signature/);
assert.match(stripeWebhook, /handleStripeBillingEvent\(event\)/);

console.log("account deletion and provider offboarding contract: PASS (16 tasks, server-only creation, retention expiry, receipts, reconciliation, tenant-scoped storage, disabled-mode safety, app access fencing, flags, and truthful states)");
