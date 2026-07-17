#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(path), "utf8");
const migration = read("supabase/migrations/20260717050000_create_privacy_consent_dsar_authority.sql");
const terminalAuthorityMigration = read("supabase/migrations/20260717060000_install_owner_decision_authority_grants.sql");
const authority = read("src/lib/services/privacy-authority-service.ts");
const requestService = read("src/lib/services/privacy-request-service.ts");
const requestRoute = read("src/app/api/privacy/requests/route.ts");
const requestCard = read("src/components/settings/privacy-request-card.tsx");
const requestCopy = read("src/lib/i18n/privacy-request-copy.ts");
const deletionService = read("src/lib/services/account-deletion-service.ts");
const deletionRoute = read("src/app/api/account-deletion/route.ts");
const deletionCard = read("src/components/settings/account-deletion-card.tsx");
const ownerAuthority = read("src/lib/authority/owner-decision-authority.ts");
const packet = JSON.parse(read("config/authority/dealflow-owner-decisions.v1.json"));

assert.equal(packet.packetStatus, "UNRESOLVED_FAIL_CLOSED");
assert.equal(packet.signatureStatus, "NOT_SIGNED");
for (const id of Array.from({ length: 9 }, (_, index) => `OWNER-PRIVACY-00${index + 1}`)) {
  const decision = packet.decisions.find((entry) => entry.id === id);
  assert(decision, `missing ${id}`);
  assert.notEqual(decision.status, "APPROVED");
}

for (const table of [
  "privacy_authority_grants", "privacy_consent_events", "privacy_consent_current",
  "privacy_subject_requests", "privacy_subject_request_receipts",
  "privacy_export_manifest_entries", "privacy_export_artifacts", "privacy_data_inventory",
]) assert.match(migration, new RegExp(`create table (?:public|private)\\.${table}`));
assert.match(migration, /privacy_grant_database_owner_required/);
assert.match(migration, /privacy_authority_production_external_only/);
assert.match(migration, /privacy_authority_synthetic_staging_only/);
assert.match(migration, /privacy_legal_retention_authority_pending/);
assert.match(migration, /pg_advisory_xact_lock\(hashtextextended/);
assert.match(migration, /privacy_consent_idempotency_collision/);
assert.match(migration, /privacy_consent_withdraw_without_active_grant/);
assert.match(migration, /privacy_request_transition_idempotency_collision/);
assert.match(migration, /privacy_export_artifact_collision/);
assert.match(migration, /create_privacy_delete_request_v1/);
assert.match(migration, /claim_account_deletion_tasks_v2/);
assert.match(migration, /manage_account_deletion_legal_hold_v2/);
assert.match(migration, /revoke execute on function public\.create_account_deletion_request_v1[\s\S]+from public, anon, authenticated, service_role/);
assert.match(migration, /unresolved_owner_privacy_authority/);
assert.match(migration, /inventory_generation_digest text not null/);
assert.match(migration, /inventory_relation_count integer not null/);
assert.match(migration, /inventory_classification_digest text not null/);
assert.match(migration, /current_privacy_catalog_identity_v1/);
assert.match(migration, /install_privacy_inventory_classifications_v1/);
assert.match(migration, /privacy_inventory_generation_mismatch/);
assert.match(migration, /privacy_inventory_classification_incomplete/);
assert.match(migration, /privacy_inventory_classification_digest_mismatch/);
assert.match(migration, /privacy_inventory_executor_coverage_invalid/);
assert.match(migration, /owner_signed_account_deletion_authority/);
assert.match(migration, /owner_signed_no_subject_data/);
assert.match(migration, /synthetic_staging_test_only/);
assert.match(migration, /if p_action <> 'consent' then/);
assert.match(terminalAuthorityMigration, /perform public\.refresh_privacy_data_inventory_v1\(\)/);
assert.match(migration, /namespace\.nspname in \('public', 'private'\)/);
assert.match(migration, /class\.relkind in \('r', 'p'\)/);

for (const functionName of [
  "record_privacy_consent_v1", "create_privacy_subject_request_v1",
  "transition_privacy_subject_request_v1", "register_privacy_export_artifact_v1",
  "create_privacy_delete_request_v1", "claim_account_deletion_tasks_v2",
  "manage_account_deletion_legal_hold_v2", "check_privacy_subject_authority_v1",
]) {
  assert.match(migration, new RegExp(`revoke all on function public\\.${functionName}`));
  assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}`));
}
assert.match(migration, /revoke all on function public\.install_privacy_inventory_classifications_v1\(uuid,jsonb\)/);

assert.match(ownerAuthority, /resolve_owner_decision_authority_v1/);
assert.match(ownerAuthority, /export async function readPrivacyAuthority/);
assert.match(authority, /await readPrivacyAuthority\(\)/);
assert.match(authority, /authority\.authorized/);
assert.match(authority, /p_signature_bundle_digest/);
assert.match(authority, /check_privacy_subject_authority_v1/);
assert.match(authority, /currentLevel !== "aal2"/);
assert.match(authority, /ageSeconds > 10 \* 60/);
assert.doesNotMatch(authority, /PRIVACY_AUTHORITY_ENABLED|ADMIN_EMAIL|ALLOWLIST/);

assert.match(requestService, /correctionDigest: normalizedCorrection \? privacyDigest\(normalizedCorrection\)/);
assert.doesNotMatch(requestService, /p_request_payload\s*:/);
assert.match(requestService, /create_privacy_subject_request_v1/);
assert.match(requestRoute, /assertSameOriginRequest/);
assert.match(requestRoute, /\.strict\(\)/);
assert.match(requestCard, /available === false/);
for (const locale of ["en", "fr", "es"]) assert.match(requestCopy, new RegExp(`\\b${locale}: \\{`));
assert.match(requestCopy, /signed per-relation privacy classification/i);

assert.match(deletionService, /create_privacy_delete_request_v1/);
assert.match(deletionService, /claim_account_deletion_tasks_v2/);
assert.match(deletionService, /await readPrivacySystemAuthority\(\)/);
assert.match(deletionRoute, /identityMethod: z\.literal\("aal2"\)/);
assert.doesNotMatch(deletionRoute, /z\.literal\("password"\)/);
assert.match(deletionCard, /identityMethod: "aal2"/);
assert.doesNotMatch(deletionCard, /type="password"/);

console.log("privacy consent/DSAR contract proof passed: unsigned fail-closed authority, terminal catalog generation binding, complete signed per-relation classification/executor coverage, consent independence, owner-only snapshot installation, immutable ledgers, tenant/AAL2 fences, private export metadata, deletion wrappers, and truthful EN/FR/ES UI.");
