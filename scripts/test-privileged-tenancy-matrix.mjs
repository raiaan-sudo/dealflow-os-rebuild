#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MATRIX_PATH = path.join(ROOT, "config/security/privileged-tenancy-matrix.v1.json");
const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, "utf8"));
const failures = [];

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(child) : [child];
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function compareInventory(label, actual, expected) {
  const normalizedActual = sortedUnique(actual);
  const normalizedExpected = sortedUnique(expected);
  check(
    JSON.stringify(normalizedActual) === JSON.stringify(normalizedExpected),
    `${label} inventory drift: actual=${JSON.stringify(normalizedActual)} expected=${JSON.stringify(normalizedExpected)}`,
  );
}

assert.equal(matrix.schemaVersion, "dealflow.privileged-tenancy-matrix.v1");
assert.deepEqual(matrix.requirementIds, ["SEC-PRIVILEGED-TENANCY-001"]);
const expectedClasses = [
  "authenticated_rls",
  "cache_keys",
  "cron_internal_worker",
  "database_owner",
  "impersonation_qa_harness",
  "jobs_leases",
  "platform_admin",
  "provider_mappings",
  "realtime_channels",
  "security_definer_rpc",
  "service_role",
  "storage_objects",
];
compareInventory("privileged class", matrix.classes.map((entry) => entry.id), expectedClasses);
for (const entry of matrix.classes) {
  check(typeof entry.actorFence === "string" && entry.actorFence.length > 3, `${entry.id} lacks actor fence`);
  check(typeof entry.organizationFence === "string" && entry.organizationFence.length > 3, `${entry.id} lacks organization fence`);
  check(typeof entry.resourceFence === "string" && entry.resourceFence.length > 3, `${entry.id} lacks resource fence`);
  check(Array.isArray(entry.proofs) && entry.proofs.length > 0, `${entry.id} lacks proof coverage`);
  for (const proof of entry.proofs ?? []) {
    check(fs.existsSync(path.join(ROOT, proof)), `${entry.id} proof is missing: ${proof}`);
  }
}

const sourceFiles = matrix.scope.sourceRoots
  .flatMap((root) => walk(path.join(ROOT, root)))
  .filter((file) => /\.(?:ts|tsx)$/.test(file));
const migrationFiles = walk(path.join(ROOT, matrix.scope.migrationRoot))
  .filter((file) => /^\d{14}_.+\.sql$/.test(path.basename(file)))
  .sort();
check(migrationFiles.length === matrix.scope.expectedMigrationCount,
  `migration count drift: ${migrationFiles.length}/${matrix.scope.expectedMigrationCount}`);
check(path.basename(migrationFiles.at(-1) ?? "") === matrix.scope.finalMigration,
  `final migration drift: ${path.basename(migrationFiles.at(-1) ?? "")}`);
const allSql = migrationFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");

// Authenticated RLS and database-owner bypass classification. A tenant table
// must use FORCE RLS; the four explicitly service-only pre-tenant/global
// control tables are tracked as owner-trusted exceptions and have no runtime
// database-owner credential path.
const enabledRls = sortedUnique([...allSql.matchAll(
  /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+enable\s+row\s+level\s+security/gi,
)].map((match) => match[1].toLowerCase()));
const forcedRls = new Set([...allSql.matchAll(
  /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+force\s+row\s+level\s+security/gi,
)].map((match) => match[1].toLowerCase()));
const ownerBypass = Object.keys(matrix.rlsOwnerBypassClassifications).sort();
const missingForce = enabledRls.filter((table) => !forcedRls.has(table));
compareInventory("RLS owner-bypass", missingForce, ownerBypass);
check(enabledRls.length >= 100, `RLS table inventory unexpectedly small: ${enabledRls.length}`);
const revokeStatements = [...allSql.matchAll(
  /revoke\s+all(?:\s+privileges)?\s+on(?:\s+table)?\s+([\s\S]*?)\s+from\s+[a-zA-Z0-9_,\s]+;/gi,
)].map((match) => match[1]);
for (const table of enabledRls) {
  const referencedByPolicy = new RegExp(
    `create\\s+policy[\\s\\S]{0,500}?on\\s+(?:public\\.)?${table}\\b`,
    "i",
  ).test(allSql);
  const directRevocation = revokeStatements.some((statement) =>
    new RegExp(`(?:public\\.)?${table}\\b`, "i").test(statement),
  );
  check(
    referencedByPolicy || directRevocation || ownerBypass.includes(table),
    `RLS table is unclassified by policy or direct ACL: ${table}`,
  );
}
const runtimeOwnerMarkers = sourceFiles.filter((file) => {
  const source = fs.readFileSync(file, "utf8");
  return /\bPGUSER\b|\bpostgres(?:ql)?:\/\/|\bset role postgres\b/i.test(source);
});
check(runtimeOwnerMarkers.length === 0,
  `runtime database-owner path discovered: ${runtimeOwnerMarkers.map(relative).join(",")}`);

const actorMarker = /user(?:Id|_id)|actor|operator|auth\.uid|getAuthenticatedContext|request|session|service_role|worker(?:Id|_id)/i;
const organizationMarker = /organization(?:Id|_id)|workspace(?:Id|_id)|partner(?:Id|_id)|tenant/i;
const resourceMarker = /campaign(?:Id|_id)|dispatch(?:Id|_id)|job(?:Id|_id)|lead(?:Id|_id)|asset(?:Id|_id)|event(?:Id|_id)|ticket(?:Id|_id)|subscription|account|mapping|route|record|idempotency|claim|lease|fingerprint|\bid\b/i;

// Service-role use is discovered, not allowlisted by directory. Normal
// surfaces must carry all three dimensions; the small explicit exception set
// must retain its stronger delegated/global markers and cannot go stale.
const serviceRolePattern = /createAdminClient|createServiceRoleClient|SUPABASE_SERVICE_ROLE_KEY|getSupabaseAdminClient|service_role/;
const serviceRoleFiles = sourceFiles.filter((file) => serviceRolePattern.test(fs.readFileSync(file, "utf8")));
const serviceExceptions = matrix.serviceRoleExceptions;
for (const exceptionPath of Object.keys(serviceExceptions)) {
  check(serviceRoleFiles.map(relative).includes(exceptionPath), `stale service-role exception: ${exceptionPath}`);
}
for (const file of serviceRoleFiles) {
  const source = fs.readFileSync(file, "utf8");
  const filePath = relative(file);
  const exception = serviceExceptions[filePath];
  if (exception) {
    for (const marker of exception.requiredMarkers) {
      check(source.includes(marker), `${filePath} lost delegated scope marker: ${marker}`);
    }
    continue;
  }
  check(actorMarker.test(source), `${filePath} service-role path lacks actor fence`);
  check(organizationMarker.test(source), `${filePath} service-role path lacks organization fence`);
  check(resourceMarker.test(source), `${filePath} service-role path lacks resource fence`);
}

// Every cron/internal route must authenticate before invoking any worker. QA
// and hosted proof routes also need exact nonproduction/project isolation.
const internalRoutes = sourceFiles
  .filter((file) => relative(file).startsWith("src/app/api/internal/") && file.endsWith("/route.ts"));
check(internalRoutes.length === 8, `internal route inventory drift: ${internalRoutes.length}/8`);
for (const file of internalRoutes) {
  const source = fs.readFileSync(file, "utf8");
  const filePath = relative(file);
  check(source.includes("assertInternalSystemRequest(request)"), `${filePath} lacks internal actor authentication`);
  check(/process|evaluate|identity|session|proof/i.test(source), `${filePath} lacks a bounded resource operation`);
  if (/qa-auth-session|stripe-test-proof|release-identity|zero-external-effects/.test(filePath)) {
    check(/nonproduction|non-production|staging|production_disabled|isExplicitNonProductionDeployment/i.test(source),
      `${filePath} lacks nonproduction fence`);
    check(/isolated|QA_ISOLATED_SUPABASE_PROJECT_REF|qaOrganization/i.test(source),
      `${filePath} lacks isolated project/organization fence`);
  }
}

// Effective SECURITY DEFINER search_path and PUBLIC EXECUTE exposure are
// catalog-proven by the disposable PostgreSQL runner. Keep the proof's exact
// oracle markers under source control so deleting the catalog check fails here.
const dbProof = read("scripts/test-privileged-tenancy-disposable-db.mjs");
for (const marker of [
  "routine.prosecdef",
  "setting like 'search_path=%'",
  "privilege.grantee = 0",
  "non-trigger SECURITY DEFINER routine remains executable by PUBLIC",
]) {
  check(dbProof.includes(marker), `SECURITY DEFINER catalog proof marker missing: ${marker}`);
}
const securityDefinerDefinitions = [...allSql.matchAll(/security\s+definer/gi)].length;
check(securityDefinerDefinitions >= 200,
  `SECURITY DEFINER migration inventory unexpectedly small: ${securityDefinerDefinitions}`);

// Storage inventory is exact. Any new Storage path must be deliberately added
// to the matrix instead of inheriting an implicit service-role bypass.
const storageSourceFiles = sourceFiles.filter((file) =>
  /\.storage\b|storage_bucket|storage_path/.test(fs.readFileSync(file, "utf8")),
).map(relative);
const storageMigrationFiles = migrationFiles.filter((file) =>
  /storage\.objects|storage_bucket|storage_path/.test(fs.readFileSync(file, "utf8")),
).map(relative);
compareInventory("storage source", storageSourceFiles, matrix.storageSourceInventory);
compareInventory("storage migration", storageMigrationFiles, matrix.storageMigrationInventory);
const staticStorageMigration = read("supabase/migrations/20260717040000_bind_generated_static_storage_tenancy.sql");
for (const marker of [
  "auth.role() is distinct from 'service_role'",
  "organization_id",
  "campaign_id",
  "dispatch_id",
  "content_sha256",
  "generated_static_storage_upload_permit_required",
  "generated_static_storage_binding_required_before_settlement",
]) {
  check(staticStorageMigration.includes(marker), `generated-static storage fence missing: ${marker}`);
}

// Only public slug loaders may use shared framework caches. Authenticated data
// or a newly discovered cache is an immediate classification failure.
const cacheFiles = sourceFiles.filter((file) =>
  /unstable_cache|import\s*\{\s*cache\s*\}\s*from\s*["']react["']/.test(fs.readFileSync(file, "utf8")),
).map(relative);
compareInventory("cache", cacheFiles, Object.keys(matrix.cacheInventory));
for (const [filePath, contract] of Object.entries(matrix.cacheInventory)) {
  const source = read(filePath);
  check(source.includes(contract.resourceMarker), `${filePath} lacks cache resource key ${contract.resourceMarker}`);
  check(source.includes(contract.cacheMarker), `${filePath} lacks cache contract marker ${contract.cacheMarker}`);
  check(!/getAuthenticatedContext|createAdminClient|service_role/.test(source),
    `${filePath} public cache captured authenticated/privileged data`);
}

const realtimeFiles = sourceFiles.filter((file) =>
  /\.channel\s*\(|postgres_changes/.test(fs.readFileSync(file, "utf8")),
).map(relative);
compareInventory("realtime", realtimeFiles, matrix.realtimeInventory);

const providerPattern = /workspace_ghl_mapping|ghl_location_mappings|ghl_workspace_tenants|marketing_accounts|meta_leadgen_routes|partner_ghl_config|ghl_installations/;
const providerFiles = sourceFiles.filter((file) => providerPattern.test(fs.readFileSync(file, "utf8")));
for (const exceptionPath of Object.keys(matrix.providerMappingExceptions)) {
  check(providerFiles.map(relative).includes(exceptionPath), `stale provider-mapping exception: ${exceptionPath}`);
}
for (const file of providerFiles) {
  const source = fs.readFileSync(file, "utf8");
  const filePath = relative(file);
  if (matrix.providerMappingExceptions[filePath]) continue;
  check(actorMarker.test(source), `${filePath} provider mapping lacks actor fence`);
  check(organizationMarker.test(source), `${filePath} provider mapping lacks organization fence`);
  check(resourceMarker.test(source), `${filePath} provider mapping lacks resource fence`);
}

const jobRpcPattern = /\.rpc\(\s*["'](?:claim|renew|release|settle|complete|reacquire)_[a-zA-Z0-9_]+/s;
const jobFiles = sourceFiles.filter((file) => jobRpcPattern.test(fs.readFileSync(file, "utf8")));
for (const exceptionPath of Object.keys(matrix.jobLeaseExceptions)) {
  check(jobFiles.map(relative).includes(exceptionPath), `stale job/lease exception: ${exceptionPath}`);
}
for (const file of jobFiles) {
  const source = fs.readFileSync(file, "utf8");
  const filePath = relative(file);
  if (matrix.jobLeaseExceptions[filePath]) continue;
  check(actorMarker.test(source), `${filePath} job/lease path lacks worker/actor fence`);
  check(organizationMarker.test(source), `${filePath} job/lease path lacks organization fence`);
  check(resourceMarker.test(source), `${filePath} job/lease path lacks resource/claim fence`);
}

const discoveredAdmin = sourceFiles.filter((file) =>
  relative(file).includes("/admin/") || relative(file).startsWith("src/app/api/admin/"),
).map(relative);
compareInventory(
  "admin",
  discoveredAdmin,
  [...matrix.adminServerPageInventory, ...matrix.adminClientChildInventory, ...matrix.adminRouteInventory],
);
for (const filePath of [...matrix.adminServerPageInventory, ...matrix.adminRouteInventory]) {
  const source = read(filePath);
  check(source.includes("assertInternalOperatorAccess"), `${filePath} lacks platform-operator gate`);
}
const adminAuthoritySource = read("src/lib/services/platform-operator-authority-service.ts");
const adminAuthorityMigration = read("supabase/migrations/20260717030000_harden_platform_operator_authority.sql");
for (const marker of ["authorize_platform_operator_access_v1", "candidateIdentity.commit", "aal2"]) {
  check(adminAuthoritySource.toLowerCase().includes(marker.toLowerCase()),
    `platform admin service lacks authority marker: ${marker}`);
}
for (const marker of ["authority_packet_digest", "grant_generation", "session_issued_at", "receipt_digest"]) {
  check(adminAuthorityMigration.includes(marker), `platform admin migration lacks receipt marker: ${marker}`);
}

const qaFiles = sourceFiles.filter((file) =>
  /qa-auth-session|QA_AUTH|ALLOW_QA_AUTH_SESSION|QA_EMAIL/.test(fs.readFileSync(file, "utf8")),
).map(relative);
for (const filePath of matrix.qaHarnessInventory) {
  check(qaFiles.includes(filePath), `QA harness inventory missing ${filePath}`);
  const source = read(filePath);
  for (const marker of [
    "assertInternalSystemRequest(request)",
    "qa_auth_harness_production_disabled",
    "isExactIsolatedSupabaseProject",
    "isInternalAdminEmail",
    "generateLink",
    "setSession",
  ]) {
    check(source.includes(marker), `${filePath} lacks QA fence: ${marker}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    schemaVersion: matrix.schemaVersion,
    requirementIds: matrix.requirementIds,
    status: "PASS",
    counts: {
      classes: matrix.classes.length,
      migrations: migrationFiles.length,
      rlsTables: enabledRls.length,
      forcedRlsTables: forcedRls.size,
      classifiedOwnerBypasses: ownerBypass.length,
      serviceRoleSourcePaths: serviceRoleFiles.length,
      internalRoutes: internalRoutes.length,
      securityDefinerDefinitions,
      storageSourcePaths: storageSourceFiles.length,
      storageMigrationPaths: storageMigrationFiles.length,
      cachePaths: cacheFiles.length,
      realtimePaths: realtimeFiles.length,
      providerMappingPaths: providerFiles.length,
      jobLeasePaths: jobFiles.length,
      adminPaths: discoveredAdmin.length,
      qaHarnessPaths: matrix.qaHarnessInventory.length
    },
    unclassified: 0
  }, null, 2));
}
