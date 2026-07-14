#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const runnerPath = join(root, "scripts", "staging", "run-isolated-staging-acceptance.mjs");
const runner = readFileSync(runnerPath, "utf8");
const trustBundle = readFileSync(
  join(root, "config", "security", "supabase-prod-ca-2021.crt"),
);
const priorProofContract = readFileSync(
  join(root, "scripts", "staging", "prior-migration-proof-contract.mjs"),
  "utf8",
);
const seed = readFileSync(join(root, "scripts", "seed-isolated-staging.mjs"), "utf8");
const seedContract = readFileSync(join(root, "scripts", "test-isolated-staging-seed-contract.mjs"), "utf8");
const providerIndependentProof = readFileSync(
  join(root, "scripts", "staging", "run-provider-independent-staging-proof.mjs"),
  "utf8",
);
const browserConfig = readFileSync(join(root, "playwright.staging.config.ts"), "utf8");
const browserSpec = readFileSync(
  join(root, "tests", "e2e", "dealflow-staging-acceptance.spec.ts"),
  "utf8",
);
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const envExample = readFileSync(join(root, ".env.example"), "utf8");
const completionSuite = readFileSync(join(root, "scripts", "test-dealflow-completion.mjs"), "utf8");
const zeroEffectsSource = readFileSync(
  join(root, "src", "lib", "safety", "zero-external-effects.ts"),
  "utf8",
);

function extractStringArray(source, name) {
  const body = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\](?: as const)?;`).exec(source)?.[1];
  assert.ok(body, `missing statically inspectable ${name} array`);
  return [...body.matchAll(/"([A-Z0-9_]+)"/g)].map((match) => match[1]).sort();
}

function extractStringObject(source, name) {
  const body = new RegExp(
    `const ${name} = (?:Object\\.freeze\\()?\\{([\\s\\S]*?)\\}\\)?(?: as const)?;`,
  ).exec(source)?.[1];
  assert.ok(body, `missing statically inspectable ${name} object`);
  return Object.fromEntries(
    [...body.matchAll(/([A-Z0-9_]+):\s*"([^"]+)"/g)]
      .map((match) => [match[1], match[2]])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

assert.match(runner, /EXPECTED_REPO = "\/private\/tmp\/dealflow-overnight-release-20260712"/);
assert.match(runner, /EXPECTED_BRANCH = "codex\/dealflow-overnight-release-20260712"/);
assert.match(runner, /EXPECTED_STAGING_HOST = "dealflow-os-rebuild-selfserve-clean\.vercel\.app"/);
assert.match(runner, /EXPECTED_SUPABASE_SAFE_SUFFIX = "qibh"/);
assert.match(runner, /EXPECTED_SUPABASE_FINGERPRINT/);
assert.match(runner, /EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT/);
assert.match(runner, /EXPECTED_VERCEL_ORG_ID_FINGERPRINT/);
assert.match(runner, /EXPECTED_MIGRATION_COUNT = 103/);
assert.match(runner, /20260713028000_harden_account_deletion_retention_authority\.sql/);
assert.match(runner, /AUTHORIZE_ISOLATED_STAGING_ACCEPTANCE_V1/);

const authoritativeFalseControls = extractStringArray(zeroEffectsSource, "MUST_BE_FALSE");
const authoritativeEqualControls = extractStringObject(zeroEffectsSource, "MUST_EQUAL");
const authoritativeDisabledControls = extractStringArray(
  zeroEffectsSource,
  "MUST_BE_DISABLED_OR_EMPTY",
);
assert.deepEqual(
  extractStringArray(runner, "REQUIRED_FALSE_CONTROLS"),
  authoritativeFalseControls,
  "staging false controls must exactly match the central zero-effects contract",
);
assert.deepEqual(
  extractStringObject(runner, "REQUIRED_EQUAL_CONTROLS"),
  authoritativeEqualControls,
  "staging exact-value controls must exactly match the central zero-effects contract",
);
assert.deepEqual(
  extractStringArray(runner, "REQUIRED_DISABLED_OR_EMPTY_CONTROLS"),
  authoritativeDisabledControls,
  "staging disabled-or-empty controls must exactly match the central zero-effects contract",
);
const authoritativeZeroEffectControlCount =
  authoritativeFalseControls.length +
  Object.keys(authoritativeEqualControls).length +
  authoritativeDisabledControls.length;
assert.equal(authoritativeZeroEffectControlCount, 60);
assert.match(runner, /EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT = 60/);
assert.match(
  runner,
  /Number\(payload\.checkedControlCount\) !== EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT/,
);
assert.match(browserSpec, /EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT = 60/);
assert.match(
  browserSpec,
  /Number\(body\?\.checkedControlCount\)\)\.toBe\(EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT\)/,
);

const flagGate = runner.indexOf("const migrationModeCount =");
const releaseCapture = runner.indexOf("const identity = captureExactReleaseIdentity()");
assert.ok(flagGate >= 0 && releaseCapture > flagGate, "all execution flags must gate any release or remote work");
assert.match(
  runner,
  /Number\(options\.applyMigrations\) \+[\s\S]+Number\(options\.applyForwardMigration\) \+[\s\S]+Number\(options\.verifyExistingMigrations\)/,
);
assert.match(runner, /migrationModeCount !== 1/);
assert.match(runner, /Read-only resume and exact forward mode require --prior-migration-proof-dir/);
assert.match(runner, /migrationBrokerArgs\.push\([\s\S]*"--verify-existing-exact"/);
assert.match(runner, /migrationBrokerArgs\.push\([\s\S]*"--apply-forward-exact"/);
assert.match(runner, /migrationSummary\.migrationMode === "VERIFY_EXISTING_EXACT"/);
assert.match(runner, /migrationSummary\.migrationMode === "APPLY_FORWARD_EXACT"/);
assert.match(runner, /migrationSummary\.serviceRoleColumnWritePrivilegesPresent !== false/);
assert.match(runner, /migrationSummary\.anonColumnPrivilegesPresent !== false/);
assert.match(runner, /migrationSummary\.authenticatedColumnPrivilegesPresent !== false/);
assert.match(runner, /migrationSummary\.publicColumnAclPresent !== false/);
assert.match(runner, /migrationSummary\.retentionConfigurationRelationOwner !== "postgres"/);
assert.match(runner, /migrationSummary\.retentionConfigurationRowSecurityEnabled !== true/);
assert.match(runner, /migrationSummary\.retentionConfigurationRowSecurityForced !== true/);
assert.match(runner, /migrationSummary\.serviceRoleTableWritePrivileges/);
assert.match(runner, /maintain: false/);
assert.match(runner, /migrationSummary\.serviceRoleColumnWritePrivileges/);
assert.match(runner, /portfolioApplicationRemoteMutationCompleted === true/);
assert.match(runner, /EXACT_EXISTING_COMMITTED_PORTFOLIO/);
assert.match(
  runner,
  /\[\s*"EXACT_COMMITTED_PORTFOLIO",\s*"EXACT_EXISTING_COMMITTED_PORTFOLIO",\s*"EXACT_FORWARD_COMMITTED_PORTFOLIO",\s*\]\.includes\(migrationSummary\.remoteStateVerificationStatus\)/,
  "the common final gate must accept exact fresh, read-only resume, or one-migration forward status",
);
assert.match(runner, /verify retained prior migration application tree/);
assert.match(runner, /verify prior migration application ancestry/);
assert.match(runner, /priorApplicationRetainedHistory/);
assert.match(runner, /isExactCurrentResumeIdentity/);
assert.match(priorProofContract, /priorApplication\.manifestSha256/);
assert.match(priorProofContract, /priorApplication\.structuralCatalogSha256/);
assert.match(priorProofContract, /priorApplication\.migrationCount === expectedMigrationCount/);
assert.match(priorProofContract, /priorApplication\.migrationFiles/);
assert.match(priorProofContract, /portfolioApplicationRemoteMutationCompleted === true/);
assert.match(priorProofContract, /committed_forward_recovery/);
assert.match(runner, /EXPECTED_PRIOR_MIGRATION_APPLICATION_COMMIT/);
assert.match(runner, /EXPECTED_PRIOR_MIGRATION_APPLICATION_TREE/);
assert.match(runner, /EXPECTED_PRIOR_MIGRATION_MANIFEST_SHA256/);
assert.match(runner, /EXPECTED_PRIOR_MIGRATION_PORTFOLIO_SHA256/);
const currentResumeGate = runner.slice(
  runner.indexOf("const verifiedExistingExact ="),
  runner.indexOf("const exactForwardApplication ="),
);
assert.match(currentResumeGate, /exactCurrentResumePriorIdentity/);
assert.doesNotMatch(
  currentResumeGate,
  /EXPECTED_PRIOR_MIGRATION_(?:APPLICATION|MANIFEST|PORTFOLIO)/,
  "current-103 resume must not require the pinned migration-102 identity",
);
const pinnedForwardGate = runner.slice(
  runner.indexOf("const exactForwardApplication ="),
  runner.indexOf("if (\n    migrationSummary.status"),
);
assert.match(pinnedForwardGate, /EXPECTED_PRIOR_MIGRATION_APPLICATION_COMMIT/);
assert.match(pinnedForwardGate, /EXPECTED_PRIOR_MIGRATION_APPLICATION_TREE/);
assert.match(pinnedForwardGate, /EXPECTED_PRIOR_MIGRATION_MANIFEST_SHA256/);
assert.match(pinnedForwardGate, /EXPECTED_PRIOR_MIGRATION_PORTFOLIO_SHA256/);
assert.match(runner, /DEALFLOW_STAGING_ACCEPTANCE_AUTHORIZATION !== EXECUTION_AUTHORIZATION/);
assert.match(runner, /Staging acceptance requires Node 20/);
assert.match(runner, /requires a completely clean release worktree/);
assert.match(runner, /requires the exact release branch/);
assert.match(runner, /Tracked staging source must be a regular file/);
assert.match(runner, /The exact \$\{EXPECTED_MIGRATION_COUNT\}-migration portfolio is required/);

assert.match(runner, /dealflow\.final-verification\.v3/);
assert.match(runner, /NO_GO_AUTHENTICATED_PROOF_DEFERRED/);
for (const deferred of [
  "npm run rls:cross-tenant",
  "npm run rls:fixture-smoke",
  "npm run operator:debt",
]) {
  assert.match(runner, new RegExp(deferred.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(runner, /parsed\.blockedCount !== EXPECTED_HOSTED_DEFERRALS\.length/);
assert.match(runner, /item\.status !== "authenticated_deferred"/);
assert.match(runner, /record\.status !== "passed" \|\| record\.postCommandRepositoryInvariant !== "passed"/);

for (const control of [
  "ALLOW_BILLING_ADMIN_OVERRIDE",
  "ALLOW_QA_BILLING_ACCEPTANCE_OVERRIDE",
  "STRIPE_FORCE_TEST_MODE",
  "NEXT_PUBLIC_ENABLE_GOOGLE_AUTH",
  "ENABLE_STRUCTURED_INFO_LOGS",
  "LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED",
  "LOAD_TEST_ALLOW_SYNTHETIC_LEAD_CAPTURE",
  "ALLOW_HEYGEN_LEGACY_FALLBACK",
  "ACCOUNT_DELETION_EXECUTION_ENABLED",
  "ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED",
]) {
  assert.match(runner, new RegExp(`"${control}"`), `missing zero-effects control ${control}`);
}
for (const exactControl of [
  "NEXT_TELEMETRY_DISABLED",
  "TWILIO_EXECUTION_MODE",
  "META_EXECUTION_MODE",
  "META_OPTIMIZATION_EXECUTION_MODE",
  "SUPPORT_NOTIFICATION_DELIVERY_MODE",
  "BILLING_CHECKOUT_SAFE_MODE",
  "UI_DIRECTION_PREVIEW",
]) {
  assert.match(runner, new RegExp(`${exactControl}:`), `missing exact control ${exactControl}`);
}
assert.match(runner, /DEALFLOW_STAGING_VERCEL_PROJECT_ID: vercelProjectId/);
assert.match(runner, /DEALFLOW_STAGING_HOST_ATTESTATION: "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1"/);
assert.match(runner, /QA_AUTH_HARNESS_ENABLED: "true"/);
assert.match(runner, /INTERNAL_SYSTEM_JOBS_SECRET/);
assert.doesNotMatch(runner, /STAGING_ACCEPTANCE_INTERNAL_SECRET", 32/);
assert.doesNotMatch(runner, /STRIPE_FORCE_TEST_MODE !== "true"/);
assert.match(runner, /Provider credentials must be absent from the acceptance process/);
assert.match(runner, /function protectedRuntimeValues\(\)/);
for (const protectedName of [
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STAGING_QA_PASSWORD",
  "PARTNER_ATTRIBUTION_SIGNING_SECRET",
  "INTERNAL_SYSTEM_JOBS_SECRET",
]) {
  assert.match(
    runner,
    new RegExp(`process\\.env\\.${protectedName}`),
    `missing failure-path redaction for ${protectedName}`,
  );
}
assert.match(
  runner,
  /sanitize\(error instanceof Error \? error\.message : String\(error\), protectedRuntimeValues\(\)\)/,
);

const configureIndex = runner.indexOf("configureHostedStagingEnvironment(vercel, hostedEnvironment)");
const migrationIndex = runner.indexOf("const migrationBrokerArgs = [");
const retentionAuthorityIndex = runner.indexOf(
  'failureContext.stage = "synthetic_retention_owner_authority"',
);
const deployIndex = runner.indexOf("const deployment = deployExactCommit(identity, vercel)");
const seedIndex = runner.indexOf("const seedOne = runSeed(deployment.deploymentUrl, secondPartnerAlias.aliasUrl)");
assert.ok(configureIndex > releaseCapture, "hosted config must follow complete local readiness");
assert.ok(migrationIndex > configureIndex, "migration apply must follow exact hosted config provisioning");
assert.ok(
  retentionAuthorityIndex > migrationIndex,
  "owner-authority retention installation must follow exact migration proof",
);
assert.ok(
  deployIndex > retentionAuthorityIndex,
  "deployment must follow exact migration and owner-authority proofs",
);
assert.ok(seedIndex > deployIndex, "deployment-specific partner host must exist before seeding");
assert.match(
  runner,
  /DEALFLOW_NATIVE_PGBIN: process\.env\.DEALFLOW_NATIVE_PGBIN/,
  "the staging parent must forward the pinned PostgreSQL runtime to the migration broker",
);
assert.match(runner, /install-synthetic-retention-authority\.mjs/);
assert.match(runner, /retention-authority-summary\.json/);
assert.match(runner, /Synthetic retention authority evidence directory is not the exact sealed set/);
assert.match(runner, /expectedRetentionChecksum/);
assert.match(runner, /Synthetic retention authority evidence checksum did not verify/);
assert.match(runner, /dealflow\.synthetic-retention-authority\.v1/);
assert.match(runner, /authorityRole !== "postgres"/);
assert.match(runner, /ownerAuthorityVerified !== true/);
assert.match(runner, /EXPECTED_SYNTHETIC_RETENTION_POLICY/);
for (const [field, value] of Object.entries({
  graceDays: 0,
  operationalRetentionDays: 1,
  supportRetentionDays: 1,
  analyticsRetentionDays: 1,
  financialRetentionDays: 365,
  receiptRetentionDays: 365,
  policyVersion: 2,
})) {
  assert.match(runner, new RegExp(`${field}: ${value}`));
}
assert.match(runner, /billingCancellationMode: "period_end"/);
assert.match(runner, /tlsServerAuthentication\?\.mode !== "verify-full"/);
assert.match(runner, /supabase-prod-ca-2021\.crt/);
assert.match(runner, /700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7/);
assert.equal(
  createHash("sha256").update(trustBundle).digest("hex"),
  "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7",
);
assert.match(runner, /serviceRoleSelectOnly !== true/);
assert.match(runner, /anonPrivilegesPresent !== false/);
assert.match(runner, /authenticatedPrivilegesPresent !== false/);
assert.match(runner, /publicAclPresent !== false/);
assert.match(runner, /relationOwner !== "postgres"/);
assert.match(runner, /ownerUpdatePrivilege !== true/);
assert.match(runner, /exactSyntheticMarker !== true/);
assert.match(runner, /retentionAuthorityMode === "pending_only_installed"/);
assert.match(runner, /retentionAuthorityMode === "exact_approved_policy_recovered"/);
assert.match(runner, /retentionAuthorityMode === "exact_existing_reused"/);
assert.match(runner, /customerDataAccessed !== false/);
assert.match(runner, /providerActionPerformed !== false/);
assert.match(runner, /realCustomerDataAccessed !== false/);
assert.match(runner, /communicationSent !== false/);
assert.match(runner, /spendIncurred !== false/);
assert.match(runner, /remoteMutationOutcome ===[\s\S]+exact_pending_only_install_committed/);
assert.match(runner, /remoteMutationOutcome ===[\s\S]+exact_approved_policy_recovery_committed/);
assert.match(runner, /remoteMutationOutcome ===[\s\S]+exact_existing_reused_without_mutation/);
assert.match(runner, /serviceRoleColumnWritePrivilegesPresent !== false/);
assert.match(runner, /publicColumnAclPresent !== false/);
assert.match(runner, /verificationRoundEvidence\.length === 2/);
assert.match(runner, /Number\.isSafeInteger\(record\?\.fileCount\)/);
assert.match(runner, /record\.fileCount > 0/);
assert.match(runner, /record\.evidenceSha256/);
assert.match(runner, /record\.summarySha256/);
assert.match(runner, /"env", "list", "production", "--format=json"/);
assert.match(runner, /"env",\s*"add"/);
assert.match(runner, /input: `\$\{value\}\\n`/);
assert.match(runner, /HOSTED_SECRET_ENV_NAMES\.has\(name\).*--sensitive/s);
assert.match(runner, /isolated Vercel staging environment inventory is not exact after provisioning/);
assert.match(runner, /"deploy",\s*"--prod"/);
assert.match(runner, /dealflowEnvironment=isolated-staging-qibh/);
assert.match(runner, /"inspect", uniqueDeploymentUrl\.origin, "--format=json"/);
assert.match(runner, /function fetchAuthoritativeVercelDeployment/);
assert.match(runner, /"api",\s*`\/v13\/deployments\/\$\{deploymentId\}`,\s*"--raw"/s);
assert.match(runner, /authoritative\.url !== uniqueDeploymentUrl\.hostname/);
assert.match(runner, /const projectId = authoritative\.projectId \?\? authoritative\.project\?\.id/);
assert.match(runner, /const metadata = authoritative\.meta \?\? authoritative\.metadata \?\? \{\}/);
assert.match(runner, /metadata\.dealflowCommit !== identity\.commit/);
assert.match(runner, /metadata\.dealflowTree !== identity\.tree/);
assert.match(runner, /function proveStableAliasTargetsExactDeployment/);
assert.match(runner, /deploymentId !== deployment\.deploymentId/);
assert.match(runner, /authoritative\.url !== deployment\.deploymentHost/);
assert.match(runner, /stable isolated-staging alias does not target the exact candidate deployment/);
assert.match(runner, /function configureAndProveSecondPartnerAlias/);
assert.match(runner, /"alias",\s*"set"/);
assert.match(runner, /dealflow-os-rebuild-selfserve-clean-partner-two-qibh\.vercel\.app/);
assert.match(runner, /second white-label staging alias does not target the exact candidate deployment/);

assert.equal(
  (runner.match(/runSeed\(deployment\.deploymentUrl, secondPartnerAlias\.aliasUrl\)/g) ?? []).length,
  2,
);
assert.match(runner, /assertSeedReplayIsIdempotent\(seedOne, seedTwo\)/);
assert.match(runner, /function classifyExactSyntheticRetentionAuthorityReplay/);
assert.match(runner, /fresh_pending_then_approved/);
assert.match(runner, /resumed_exact_synthetic_approval/);
assert.match(runner, /approvedAt !== SYNTHETIC_FIXTURE_TIMESTAMP/);
assert.match(runner, /retentionAuthorityReplayMode/);
const seedReplayBody = /function assertSeedReplayIsIdempotent\(first, second\) \{([\s\S]*?)\n\}/.exec(runner)?.[1];
assert.ok(seedReplayBody, "seed replay contract must remain statically inspectable");
assert.doesNotMatch(seedReplayBody, /pendingBeforeApproval !== true/);
assert.doesNotMatch(seedReplayBody, /rejectedWhilePending !== true/);
assert.match(seedReplayBody, /classifyExactSyntheticRetentionAuthorityReplay\(first, second\)/);
assert.match(seed, /admin\.rpc\("bind_verified_partner_attribution_v1"/);
assert.doesNotMatch(seed, /upsert\(admin, "workspace_partner_attribution"/);
assert.match(seedContract, /attributionBoundAtomically: true/);
assert.match(runner, /closesHostedDeferrals: \["npm run rls:cross-tenant", "npm run rls:fixture-smoke"\]/);
assert.match(runner, /\["run", "rls:cross-tenant"\]/);
assert.match(runner, /\["run", "rls:fixture-smoke"\]/);
assert.match(runner, /exactZeroResidue/);
assert.match(runner, /\["run", "operator:debt"\]/);

const loadBody = /async function runHostedLoadProof\(baseUrl\) \{([\s\S]*?)\n\}/.exec(runner)?.[1];
assert.ok(loadBody, "hosted load proof must remain statically inspectable");
assert.match(loadBody, /methods: \["GET"\]/);
assert.match(loadBody, /leadCapturePostAttempted: false/);
assert.doesNotMatch(loadBody, /method:\s*"POST"/);
assert.doesNotMatch(loadBody, /\/api\/lead-capture/);
assert.match(runner, /JSON\.stringify\(countsBefore\) !== JSON\.stringify\(countsAfter\)/);

assert.match(browserConfig, /retries: 0/);
assert.match(browserConfig, /forbidOnly: true/);
for (const project of ["desktop-chromium", "mobile-chromium", "desktop-firefox", "desktop-webkit"]) {
  assert.match(browserConfig, new RegExp(`name: "${project}"`));
}
assert.doesNotMatch(browserSpec, /test\.(?:skip|fixme)\s*\(/);
assert.equal((browserSpec.match(/^test\("/gm) ?? []).length, 12);
for (const role of [
  "newDirect",
  "paidDirect",
  "legacy",
  "partnerAdmin",
  "partnerChild",
  "partnerAdminTwo",
  "partnerChildTwo",
  "operator",
  "attacker",
]) {
  assert.match(browserSpec, new RegExp(`${role}:`));
}
assert.match(browserSpec, /sha256\(projectRef\).*EXPECTED_SUPABASE_FINGERPRINT/s);
assert.match(browserSpec, /url\.hostname === `\$\{exactProjectRef\}\.supabase\.co`/);
assert.match(browserSpec, /blockedMutations/);
assert.match(browserSpec, /forbiddenHosts/);
assert.match(browserSpec, /LOCALIZED_PRODUCT_COPY/);
assert.match(browserSpec, /EN FR ES public product routes/);
assert.match(browserSpec, /paid realtor can use authenticated EN FR ES dashboards/);
assert.match(browserSpec, /emulateMedia\(\{ reducedMotion: "reduce" \}\)/);
assert.match(browserSpec, /document\.documentElement\.style\.zoom = "2"/);
assert.match(browserSpec, /first keyboard target must retain a visible focus outline/);
assert.match(browserSpec, /Confirmed state is stale/);
assert.match(browserSpec, /Showing last confirmed Meta data/);
assert.match(browserSpec, /PARTNER_TWO_CAMPAIGN_ID/);
assert.match(browserSpec, /STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL/);

assert.match(runner, /runProviderIndependentStagingProof/);
assert.match(runner, /provider-independent-journeys\.json/);
assert.match(runner, /parsed\.worker\?\.deadLetterReviewed !== true/);
assert.match(runner, /parsed\.worker\?\.providerTableStateUnchanged !== true/);
assert.match(runner, /parsed\.accountDeletion\?\.fullProviderOffboardingPerformed !== false/);
assert.match(runner, /parsed\.externalProviderAcceptance\?\.meta !== "BLOCKED_CREDENTIAL_AND_PROVIDER_AUTHORITY"/);
assert.match(providerIndependentProof, /apply_billing_subscription_webhook/);
assert.match(providerIndependentProof, /evt_test_df_staging_lifecycle_cancel/);
assert.match(providerIndependentProof, /stale_event/);
assert.match(providerIndependentProof, /replay_projection_repaired/);
assert.match(providerIndependentProof, /\/api\/lead-capture/);
assert.match(providerIndependentProof, /duplicateReplaySameIdentity: true/);
assert.match(providerIndependentProof, /create_support_ticket_with_outbox/);
assert.match(providerIndependentProof, /internal_operator_inbox/);
assert.match(providerIndependentProof, /\/api\/internal\/system-jobs/);
assert.match(providerIndependentProof, /crashedLeaseRecovered: true/);
assert.match(providerIndependentProof, /deadLetterPreserved: true/);
assert.match(providerIndependentProof, /deadLetterReviewed: true/);
assert.match(providerIndependentProof, /captureTableState/);
assert.match(providerIndependentProof, /providerTableStateUnchanged: true/);
assert.match(providerIndependentProof, /failedRefreshPreservedLastConfirmed: true/);
assert.match(providerIndependentProof, /crossPartnerCampaignDenied: true/);
assert.match(providerIndependentProof, /create_account_deletion_request_v1/);
assert.match(providerIndependentProof, /authority\.grace_days !== 0/);
assert.match(providerIndependentProof, /authority\.financial_retention_days !== 365/);
assert.match(providerIndependentProof, /authority\.policy_version !== 2/);
assert.match(providerIndependentProof, /retention_policy\?\.operationalRetentionDays !== 1/);
assert.match(providerIndependentProof, /retention_policy\?\.financialRetentionDays !== 365/);
assert.match(providerIndependentProof, /retention_policy\?\.policyVersion !== 2/);
assert.match(providerIndependentProof, /account_deletion_execution_disabled/);
assert.match(providerIndependentProof, /providerReceiptCount: 0/);
assert.match(providerIndependentProof, /fullProviderOffboardingPerformed: false/);
for (const providerName of ["meta", "ghl", "higgsfield", "twilio"]) {
  assert.match(providerIndependentProof, new RegExp(`${providerName}: "BLOCKED_`));
}

assert.match(runner, /status: "NO_GO"/);
assert.match(runner, /verdict: "NO_GO_PRODUCTION_ACCEPTANCE_NOT_PROVEN"/);
assert.match(runner, /providerAbsenceTreatedAsSuccess: false/);
assert.match(runner, /seededEndStatesTreatedAsJourneyProof: false/);
assert.match(runner, /workerExecutionRetryReplayDeadLetterAndCrashRecovery: "PASS"/);
assert.match(runner, /realSyntheticLeadCapturePersistenceAndDuplicateReplay: "PASS"/);
assert.match(runner, /supportInternalNonDeliveringInboxLifecycle: "PASS"/);
assert.match(runner, /reportingFreshStaleAndFailedRefreshStateHandling: "PASS"/);
assert.match(runner, /billingCancellationStaleEventReactivationAndReplayProjection: "PASS"/);
assert.match(runner, /accountDeletionRequestSuspensionAndDisabledWorkerBoundary: "PASS"/);
assert.match(runner, /ghlSandboxProvisioningFunnelsAndLeadDelivery:[\s\S]{0,100}"BLOCKED_EXTERNAL_PROVIDER_AUTHORITY"/);
assert.match(runner, /metaSandboxLaunchLeadgenReportingAndOptimization:[\s\S]{0,100}"BLOCKED_EXTERNAL_PROVIDER_AUTHORITY"/);
assert.match(runner, /stripeTestCheckoutAndSignedWebhook:[\s\S]{0,100}"BLOCKED_EXTERNAL_PROVIDER_AUTHORITY"/);
assert.match(runner, /productionReleaseAuthorized: false/);

assert.match(runner, /function assertEvidenceSanitized/);
assert.match(runner, /Evidence sanitization rejected an exact protected value/);
assert.match(runner, /evidence-manifest\.json/);
assert.match(runner, /SHA256SUMS/);
assert.match(runner, /containsSecrets: false/);
assert.match(runner, /containsRealCustomerData: false/);
assert.match(runner, /productionMutationPerformed: false/);
assert.match(runner, /providerMutationPerformed: false/);
assert.match(runner, /chmodSync\(path, 0o600\)/);
assert.match(runner, /chmodSync\(path, 0o700\)/);
assert.match(runner, /function writeTerminalFailureArtifact\(sanitizedMessage\)/);
assert.match(runner, /STAGING_FAILURE\.json/);
assert.match(runner, /sanitizedErrorSha256: sha256\(sanitizedMessage\)/);
assert.match(runner, /candidateIdentity: identity/);
assert.match(runner, /failureContext\.sealCompleted/);
assert.match(runner, /partialSealArtifactsPresent/);
assert.match(runner, /failureContext\.sealCompleted = true/);
assert.doesNotMatch(
  runner,
  /\["FINAL_SUMMARY\.json", "evidence-manifest\.json", "SHA256SUMS"\]\.some/,
  "a partial final-seal failure must still emit durable terminal-failure evidence",
);
assert.match(runner, /failureContext\.evidenceDir = options\.evidenceDir/);
assert.match(runner, /failureContext\.stage = "synthetic_staging_seed"/);
assert.match(runner, /writeTerminalFailureArtifact\(sanitizedMessage\)/);

assert.equal(
  packageJson.scripts["staging:acceptance"],
  "node ./scripts/staging/run-isolated-staging-acceptance.mjs",
);
assert.equal(
  packageJson.scripts["test:staging-acceptance-contract"],
  "node ./scripts/staging/test-install-synthetic-retention-authority-contract.mjs && node ./scripts/staging/test-isolated-staging-acceptance-contract.mjs",
);
assert.match(completionSuite, /"staging\/test-isolated-staging-acceptance-contract\.mjs"/);
assert.match(envExample, /^STAGING_PARTNER_APP_URL=$/m);
assert.match(envExample, /^STAGING_SECOND_PARTNER_APP_URL=$/m);
assert.match(envExample, /^DEALFLOW_STAGING_ACCEPTANCE_AUTHORIZATION=$/m);

const help = spawnSync(process.execPath, [runnerPath, "--help"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/private/tmp" },
  encoding: "utf8",
  timeout: 10_000,
});
assert.equal(help.status, 0, help.stderr);
assert.match(help.stdout, /Exactly one migration mode is required/);
assert.match(help.stdout, /--verify-existing-migrations --deploy/);
assert.match(help.stdout, /--apply-forward-migration --deploy/);
assert.match(
  help.stdout,
  /Exact forward-only migration 103[^\n]*:\n  node[^\n]* \\\n    --execute --apply-forward-migration --deploy \\\n    --prior-migration-proof-dir/s,
  "forward-mode help must preserve executable multiline shell continuations",
);

const refused = spawnSync(process.execPath, [runnerPath], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/private/tmp" },
  encoding: "utf8",
  timeout: 10_000,
});
assert.notEqual(refused.status, 0);
assert.match(refused.stderr, /No remote work was authorized/);

console.log(
  "isolated staging acceptance contract: PASS (execution/deploy plus exclusive fresh, read-only-resume, or exact-forward authorization gate; exact clean seal and hosted-only deferral allowlist; isolated qibh/Vercel identities; approved stdin-only staging config; 103-migration atomic broker with pinned 102-to-103 forward mode and owner-authority retention installation; two deployment-bound white-label partners and child tenants; authenticated RLS cleanup; ten-role plus fresh/stale/failed reporting and EN/FR/ES accessibility across four browsers with zero skips; real synthetic lead duplicate proof; support internal inbox; worker recovery; billing lifecycle; deletion fail-closed boundary; explicit external-provider blockers; production NO_GO; sanitized sealed evidence)",
);
