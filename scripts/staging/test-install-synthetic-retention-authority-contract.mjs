#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(
  join(root, "scripts", "staging", "install-synthetic-retention-authority.mjs"),
  "utf8",
);
const trustBundle = readFileSync(
  join(root, "config", "security", "supabase-prod-ca-2021.crt"),
);

assert.match(source, /authority broker requires Node 24/);
assert.match(source, /!\/\^v24\\\.\/.+value\.runtime/s);
assert.match(source, /expectedMigrationCount = 126/);
assert.match(source, /20260722050000_allow_account_deletion_ghl_receipt_cleanup\.sql/);
assert.match(source, /expectedProjectSafeSuffix = "qibh"/);
assert.match(source, /expectedProjectFingerprint/);
assert.match(source, /config\/security\/supabase-prod-ca-2021\.crt/);
assert.match(source, /expectedTrustBundleSha256/);
assert.match(source, /committedTrustBundleBytes = git/);
assert.match(source, /realpathSync\(expectedTrustBundlePath\) !== expectedTrustBundlePath/);
assert.match(source, /PGSSLMODE: "verify-full"/);
assert.match(source, /PGSSLROOTCERT: expectedTrustBundlePath/);
assert.equal(
  createHash("sha256").update(trustBundle).digest("hex"),
  "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7",
);
assert.match(source, /expectedBranch = "codex\/dealflow-release-closure-plan"/);
assert.match(
  source,
  /expectedRepo = realpathSync\([\s\S]*fileURLToPath\(import\.meta\.url\)[\s\S]*"\.\.\/\.\."/,
);
assert.match(source, /DEALFLOW_STAGING_PROJECT_RECORD/);
assert.match(source, /extractFinalVerificationNativePostgresRuntime/);
assert.match(
  source,
  /expectedPostgresBin = verificationNativePostgresRuntimes\[0\]\.pgbin/,
);
assert.doesNotMatch(
  source,
  /\/private\/tmp\/dealflow-(?:overnight-release|pg17\.6|new-staging-project)/,
);
assert.match(source, /requires a clean release worktree/);
assert.match(source, /dealflow\.final-verification\.v3/);
assert.match(source, /final-verification-command-contract\.mjs/);
assert.match(source, /assertExactFinalVerificationSummaryPortfolio/);
assert.match(source, /expectedDeferrals = FINAL_VERIFICATION_HOSTED_DEFERRALS/);
assert.match(source, /`Verification round \$\{expectedRound\} portfolio`/);
assert.doesNotMatch(source, /hasExactVerificationEvidenceQualification/);
assert.match(source, /Two distinct exact verification rounds are required/);
assert.match(source, /captureRoundEvidenceIdentity/);
assert.match(source, /Verification evidence contains a symlink/);
assert.match(source, /Verification evidence contains an empty file/);
assert.match(source, /command_exit_code: 0/);
assert.match(source, /verificationRoundEvidence/);
assert.match(source, /Authority evidence must remain outside the release repository/);
assert.match(source, /DEALFLOW_ISOLATED_STAGING_QIBH_SYNTHETIC_RETENTION_AUTHORITY_V1/);
assert.match(source, /set local lock_timeout/);
assert.match(source, /pg_advisory_xact_lock/);
assert.match(source, /dealflow_synthetic_deletion_requests/);
assert.match(source, /dealflow_synthetic_privacy_requests/);
assert.match(source, /dealflow_synthetic_deletion_reset_identity_mismatch/);
assert.match(source, /dealflow_synthetic_deletion_reset_request_mismatch/);
assert.match(source, /dealflow_synthetic_deletion_reset_privacy_request_mismatch/);
assert.match(source, /dealflow_synthetic_deletion_reset_receipt_mismatch/);
assert.match(source, /exact_prior_fixture_removed/);
assert.match(source, /syntheticDeletionOrganizationId/);
assert.match(source, /syntheticDeletionEmail/);
assert.match(source, /syntheticDeletionIdempotencyKey/);
assert.match(source, /disable trigger privacy_subject_receipt_immutable_guard/);
assert.match(source, /disable trigger account_deletion_receipt_append_only/);
assert.match(source, /disable trigger account_deletion_manifest_identity_immutable/);
assert.match(source, /disable trigger account_deletion_tombstone_identity_immutable/);
assert.match(source, /disable trigger protect_generated_static_cleanup_authority/);
assert.match(source, /enable trigger privacy_subject_receipt_immutable_guard/);
assert.match(source, /enable trigger account_deletion_receipt_append_only/);
assert.match(source, /enable trigger account_deletion_manifest_identity_immutable/);
assert.match(source, /enable trigger account_deletion_tombstone_identity_immutable/);
assert.match(source, /enable trigger protect_generated_static_cleanup_authority/);
assert.match(source, /'syntheticDeletionReset', jsonb_build_object/);
assert.match(source, /databaseResult\?\.syntheticDeletionReset/);
assert.match(source, /postResetDeletionRequestCount/);
assert.match(source, /postResetSuspensionCount/);
assert.match(source, /postResetPrivacyRequestCount/);
assert.match(source, /exactFixtureOnly: true/);
assert.match(source, /current_user <> 'postgres' or session_user <> 'postgres'/);
assert.match(source, /dealflow_exact_migration_history_required/);
assert.match(source, /dealflow_retention_relation_owner_mismatch/);
assert.match(source, /dealflow_retention_api_role_acl_present/);
assert.match(source, /dealflow_retention_public_acl_present/);
assert.match(source, /approved_authority_hash is null and authority\.approved_at is null/);
assert.match(source, /dealflow_unexpected_pending_retention_policy/);
assert.match(source, /const productionPendingPolicy = Object\.freeze/);
assert.match(source, /const syntheticStagingPolicy = Object\.freeze/);
assert.match(source, /financialRetentionDays: 2555/);
assert.match(source, /financialRetentionDays: 365/);
assert.match(source, /approvedPolicy: syntheticStagingPolicy/);
assert.match(source, /pending_only_installed/);
assert.match(source, /exact_approved_policy_recovered/);
assert.match(source, /dealflow_retention_approved_policy_recovery_race/);
assert.match(source, /exact_approved_policy_recovery_committed/);
assert.match(source, /exact_existing_reused/);
assert.match(source, /dealflow_unexpected_retention_authority/);
assert.match(source, /expectedVercelProjectIdFingerprint/);
assert.match(source, /vercel_analytics/);
assert.match(source, /meta_optimization_provider_writes/);
assert.match(source, /platform_admin_security_surface/);
assert.match(source, /privacy_consent_dsar_authority/);
assert.match(source, /owner_decision_authority_grants/);
assert.match(source, /owner_decision_authority_revocations/);
assert.match(source, /exact_synthetic_owner_grants_installed/);
assert.match(source, /exact_synthetic_owner_grants_rotated/);
assert.match(source, /exact_synthetic_owner_grants_reused/);
assert.match(source, /exact_synthetic_privacy_grant_installed/);
assert.match(source, /exact_synthetic_privacy_grant_rotated/);
assert.match(source, /exact_synthetic_privacy_grant_reused/);
assert.match(source, /max\(existing\.generation\) \+ 1/);
assert.match(source, /install_privacy_inventory_classifications_v1/);
assert.match(source, /jsonb_agg\(jsonb_build_object/);
assert.match(source, /synthetic_staging_test_only/);
assert.match(source, /synthetic_test_only/);
assert.match(source, /inventoryAuthorityTableCount/);
assert.match(source, /inventoryUnresolvedCount/);
assert.match(source, /inventoryNullExecutorCount/);
assert.match(source, /inventoryWrongGrantCount/);
assert.match(source, /inventoryWrongSnapshotCount/);
assert.match(source, /productionOwnerGrantCount/);
assert.match(source, /productionPrivacyGrantCount/);
assert.match(source, /privacyLegalRetentionAuthorizedCount/);
assert.match(source, /workerAndLegalHoldExecutionAuthorized: false/);
assert.match(source, /rpcBinding:/);
assert.match(source, /authorityPacketDigest: privacyCapabilityRecord\.payloadSha256/);
assert.match(source, /signatureBundleDigest: privacySignatureBundleSha256/);
assert.match(source, /policyDigest: privacyPolicy\.policyDigest/);
assert.match(source, /exact_authority_projection_refresh_committed/);
assert.match(
  source,
  /bounded_generation_rotation_or_unexpired_exact_replay_with_catalog_rebind/,
);
for (const privilege of [
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
  "MAINTAIN",
]) {
  assert.match(
    source,
    new RegExp(`has_table_privilege\\('service_role', 'public\\.account_deletion_retention_configuration', '${privilege}'\\)`),
  );
}
assert.match(source, /has_any_column_privilege\('service_role'/);
assert.match(source, /serviceRoleColumnWritePrivilege/);
assert.match(source, /serviceRoleMaintain/);
assert.match(source, /serviceRoleColumnWritePrivilegesPresent: false/);
assert.match(source, /dealflow_retention_api_role_column_acl_present/);
assert.match(source, /dealflow_retention_public_column_acl_present/);
assert.match(source, /publicColumnAclPresent: false/);
assert.match(source, /find-generic-password/);
assert.match(source, /Buffer\.concat\(\[password, Buffer\.from\("\\n"\), sql\]\)/);
assert.match(source, /password\.fill\(0\)/);
assert.match(source, /stdin\.fill\(0\)/);
assert.doesNotMatch(source, /PGPASSWORD/);
assert.match(source, /productionMutationPerformed: false/);
assert.match(source, /providerActionPerformed: false/);
assert.match(source, /realCustomerDataAccessed: false/);
assert.match(source, /authorityHashFingerprint/);
assert.match(source, /dealflow\.synthetic-retention-authority\.v1/);
assert.match(source, /retention-authority-summary\.json/);
assert.match(source, /authorityRole: "postgres"/);
assert.match(source, /ownerAuthorityVerified: true/);
assert.match(source, /serviceRoleSelectOnly: true/);
assert.match(source, /remoteMutationStarted/);
assert.match(source, /remoteMutationCompleted/);
assert.match(source, /unknown_requires_readback/);
assert.match(source, /DEALFLOW_RETENTION_TRANSACTION_COMMITTED/);
assert.match(source, /anonPrivilegesPresent: false/);
assert.match(source, /authenticatedPrivilegesPresent: false/);
assert.match(source, /publicAclPresent: false/);
assert.match(source, /relationOwner: "postgres"/);
assert.match(source, /RETENTION_AUTHORITY_FAILURE\.json/);
assert.match(source, /SHA256SUMS/);

const roundReaderStart = source.indexOf("function readRound(");
const roundReaderEnd = source.indexOf("\nfunction captureRoundEvidenceIdentity", roundReaderStart);
const roundReaderSource = source.slice(roundReaderStart, roundReaderEnd);
const roundValidationIndex = source.indexOf("const rounds = roundPaths.map(");
const evidencePreparationIndex = source.indexOf("prepareEvidenceDirectory();");
const databaseExecutionIndex = source.indexOf("const databaseExecution = runOwnerTransaction(");
assert.match(
  roundReaderSource,
  /assertExactFinalVerificationSummaryPortfolio\([\s\S]+value,[\s\S]+`Verification round \$\{expectedRound\} portfolio`/,
  "the executed retention round reader must enforce the shared exact portfolio",
);
assert.match(
  source,
  /rounds\[0\]\.resolvedCommandPortfolioSha256 !==\s*rounds\[1\]\.resolvedCommandPortfolioSha256/,
  "both verification rounds must bind the same resolved native runtime command portfolio",
);
assert.ok(
  roundValidationIndex >= 0 &&
    roundValidationIndex < evidencePreparationIndex &&
    evidencePreparationIndex < databaseExecutionIndex,
  "both exact verification rounds must fail closed before evidence setup or the staging owner transaction",
);

process.stdout.write("staging synthetic retention authority owner-broker contract: PASS\n");
