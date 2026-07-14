#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(
  join(root, "scripts", "staging", "install-synthetic-retention-authority.mjs"),
  "utf8",
);

assert.match(source, /expectedMigrationCount = 103/);
assert.match(source, /20260713028000_harden_account_deletion_retention_authority\.sql/);
assert.match(source, /expectedProjectSafeSuffix = "qibh"/);
assert.match(source, /expectedProjectFingerprint/);
assert.match(source, /expectedTrustBundlePath = "\/etc\/ssl\/cert\.pem"/);
assert.match(source, /expectedTrustBundleSha256/);
assert.match(source, /trustBundleStat\.uid !== 0/);
assert.match(source, /PGSSLMODE: "verify-full"/);
assert.match(source, /PGSSLROOTCERT: expectedTrustBundlePath/);
assert.match(source, /expectedBranch = "codex\/dealflow-overnight-release-20260712"/);
assert.match(source, /requires a clean release worktree/);
assert.match(source, /dealflow\.final-verification\.v3/);
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
for (const privilege of [
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
]) {
  assert.match(
    source,
    new RegExp(`has_table_privilege\\('service_role', 'public\\.account_deletion_retention_configuration', '${privilege}'\\)`),
  );
}
assert.match(source, /has_any_column_privilege\('service_role'/);
assert.match(source, /serviceRoleColumnWritePrivilege/);
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

process.stdout.write("staging synthetic retention authority owner-broker contract: PASS\n");
