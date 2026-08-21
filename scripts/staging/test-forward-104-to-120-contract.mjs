#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createNativePostgresTestAdapter } from "../lib/native-postgres-test-adapter.mjs";
import {
  assertExactForward104To120Portfolio,
  classifyForward104RemoteHistory,
  FORWARD_104_TO_120_AUTHORITY,
  loadExactPrior104StagingSeal,
  loadExactPrior104SyntheticSurfaceSeal,
} from "./forward-104-to-120-contract.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repo = join(scriptDir, "..", "..");
const migrationDir = join(repo, "supabase", "migrations");
const brokerSource = readFileSync(
  join(scriptDir, "apply-fresh-staging-migrations.mjs"),
  "utf8",
);
const contractSource = readFileSync(
  join(scriptDir, "forward-104-to-120-contract.mjs"),
  "utf8",
);
const priorProofContractSource = readFileSync(
  join(scriptDir, "prior-migration-proof-contract.mjs"),
  "utf8",
);
const records = readdirSync(migrationDir)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort()
  .slice(0, FORWARD_104_TO_120_AUTHORITY.current.migrationCount)
  .map((name) => ({ name }));
const portablePreCandidateGateSource = readFileSync(
  join(
    migrationDir,
    "20260710160000_validate_and_normalize_pre_candidate_shape.sql",
  ),
  "utf8",
);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalizeManagedCatalogMaterial = (material) => String(material ?? "")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.stringify(JSON.parse(line)))
  .sort()
  .join("\n");

assert.equal(FORWARD_104_TO_120_AUTHORITY.prior.migrationCount, 104);
assert.equal(FORWARD_104_TO_120_AUTHORITY.current.migrationCount, 120);
assert.equal(FORWARD_104_TO_120_AUTHORITY.forwardMigrations.length, 16);
assert.equal(
  FORWARD_104_TO_120_AUTHORITY.prior.migrationPortfolioSha256,
  "c6d39d8bd4fe39ba8762c968a8010d772c96fa750ea39c2c5a409c4292fe33a5",
);
assert.equal(
  FORWARD_104_TO_120_AUTHORITY.current.migrationPortfolioSha256,
  "e6ff6049ff5a5c5691c54285850748f0e4190af23f389acde1cab7ead0245e2c",
);
assert.equal(
  FORWARD_104_TO_120_AUTHORITY.prior.sourceReplayMigrationPortfolioSha256,
  "dabef857e679169ccf098b575acb3be598d19c5021321404d8edc57d8078924d",
);
assert.equal(
  FORWARD_104_TO_120_AUTHORITY.current.sourceReplayMigrationPortfolioSha256,
  "e6c129007e5203e2e58bfb3f508ba85b414c5de92f5386c25eba5cc6ffdfddaa",
);
assert.equal(
  FORWARD_104_TO_120_AUTHORITY.current.managedNormalizedSchemaSha256,
  "dcccf3e9514fa8cade3c88d39a518670f435807ac2d1461ca80c06db5ad10ffc",
);
assert.equal(
  FORWARD_104_TO_120_AUTHORITY.current.managedStructuralCatalogSha256,
  "7d2981e288c278a081539777ca1a23be0f5558b9e16c7db5991dcc52d4afce36",
);
assert.equal(
  FORWARD_104_TO_120_AUTHORITY.current.managedSecurityOracleSha256,
  "3a5e6b71867885fcb593d528e232d23d6bf339854511c8be59b39125cac4f48d",
);
assert.equal(
  FORWARD_104_TO_120_AUTHORITY.current.finalMigration,
  "20260717090000_create_canonical_lead_outcome_ledger.sql",
);
assert.match(
  portablePreCandidateGateSource,
  /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO anon, authenticated, postgres, service_role;/,
);
assert.match(
  portablePreCandidateGateSource,
  /source_row\."schema_name" = 'public' AND source_row\.owner_name = 'postgres'/,
);
assert.doesNotMatch(
  portablePreCandidateGateSource,
  /ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin/,
);

const exact = assertExactForward104To120Portfolio(records, migrationDir);
assert.equal(exact.priorRecords.length, 104);
assert.equal(exact.forwardRecords.length, 16);
assert.deepEqual(
  exact.forwardVersions,
  FORWARD_104_TO_120_AUTHORITY.forwardMigrations.map(({ version }) => version),
);

assert.throws(
  () => assertExactForward104To120Portfolio([...records].reverse(), migrationDir),
  /unordered, duplicate, or ambiguous/,
  "Reordered migrations must be rejected before authority can be used",
);
const duplicateRecords = [...records];
duplicateRecords[105] = duplicateRecords[104];
assert.throws(
  () => assertExactForward104To120Portfolio(duplicateRecords, migrationDir),
  /unordered, duplicate, or ambiguous/,
  "Duplicate migration identities must be rejected",
);

const driftDir = mkdtempSync(join(tmpdir(), "dealflow-forward-contract-"));
try {
  cpSync(migrationDir, driftDir, { recursive: true });
  const finalPath = join(driftDir, FORWARD_104_TO_120_AUTHORITY.current.finalMigration);
  writeFileSync(finalPath, `${readFileSync(finalPath, "utf8")}\n-- drift\n`);
  assert.throws(
    () => assertExactForward104To120Portfolio(records, driftDir),
    /drift in ordered migrations 105 through 120/,
    "Any byte drift in migrations 105-120 must be rejected",
  );
} finally {
  rmSync(driftDir, { recursive: true, force: true });
}

const historyContext = {
  priorVersions: exact.priorVersions,
  currentVersions: exact.currentVersions,
};
assert.equal(
  classifyForward104RemoteHistory(exact.priorVersions, historyContext),
  "EXACT_PRIOR_104_CANDIDATE",
);
assert.equal(
  classifyForward104RemoteHistory(exact.currentVersions, historyContext),
  "POSSIBLE_CURRENT_120_REQUIRES_FULL_READ_ONLY_PROOF",
);
for (const [label, values] of [
  ["gap", exact.priorVersions.filter((_, index) => index !== 50)],
  ["duplicate", [...exact.priorVersions.slice(0, -1), exact.priorVersions.at(-2)]],
  ["extra", [...exact.priorVersions, "20990101000000"]],
  ["wrong ordered member", exact.priorVersions.map((value, index) => index === 20 ? "20990101000000" : value)],
  ["partial successor", [...exact.priorVersions, ...exact.forwardVersions.slice(0, 5)]],
]) {
  assert.equal(
    classifyForward104RemoteHistory(values, historyContext),
    "UNEXPECTED_OR_AMBIGUOUS_HISTORY",
    `${label} history must be rejected`,
  );
}

for (const marker of [
  "loadExactPrior104StagingSeal(priorMigrationProofDir)",
  "assertExactForward104To120Portfolio(",
  'transition: "EXACT_104_TO_120"',
  'status: "FORWARD_104_TO_120_MUTATION_STARTED"',
  "Migrations 105-120 and all 16 history receipts share one outer",
  'terminalStatus = "ROLLED_BACK_EXACT_PRIOR_104"',
  '"FAILED_FORWARD_120_STATE_DETECTED_REQUIRES_READ_ONLY_REPROOF"',
  'remoteMutationCompleted = remoteMutationCompleted ? true : null',
  'idempotencyPolicy: "FAIL_CLOSED_READ_ONLY_REPROOF_AFTER_ANY_COMMIT_OR_AMBIGUITY"',
  "Pre-forward auth surface",
  "Post-forward auth surface",
  "rawDatabaseValuesPersisted: false",
  "rawErrorPersisted: false",
  "loadExactPrior104SyntheticSurfaceSeal(",
  "captureAndAssertSyntheticRelationalSurface(",
  "highRiskCountScopes",
  "whereClause",
  "captureManagedNormalizedSchemaDump()",
  "captureManagedCatalogIdentity(",
  "canonicalizeManagedCatalogMaterial(",
  "set search_path=pg_catalog;",
  "jsonb_agg(acl_item::text order by acl_item::text)",
  "captureManagedSecurityOracle(",
  "forward_120_managed_schema_not_exact_or_stable",
  "forward_120_managed_catalog_not_exact_or_stable",
  "forward_120_managed_security_not_exact",
  "post_forward_relational_or_credential_surface_not_exact",
]) {
  assert.ok(brokerSource.includes(marker), `Broker is missing ${marker}`);
}
for (const marker of [
  FORWARD_104_TO_120_AUTHORITY.projectFingerprint,
  FORWARD_104_TO_120_AUTHORITY.projectSafeSuffix,
  FORWARD_104_TO_120_AUTHORITY.prior.proofCommit,
  FORWARD_104_TO_120_AUTHORITY.prior.proofTree,
  FORWARD_104_TO_120_AUTHORITY.prior.normalizedSchemaSha256,
  FORWARD_104_TO_120_AUTHORITY.prior.structuralCatalogSha256,
  "Prior 104 staging artifacts must be canonical owner-only regular files",
  "Prior 104 staging artifact does not match its pinned SHA-256",
]) {
  assert.ok(contractSource.includes(marker), `Forward authority is missing ${marker}`);
}
assert.ok(
  priorProofContractSource.includes("EXACT_FORWARD_104_TO_120_COMMITTED_PORTFOLIO"),
  "The exact forward-120 application proof must be admissible for later read-only resume",
);

const activeStart = brokerSource.indexOf('if (migrationMode === "APPLY_FORWARD_EXACT") {');
const successorStart = brokerSource.indexOf(
  'if (migrationMode === "APPLY_SUCCESSOR_EXACT") {',
);
assert.ok(activeStart >= 0 && successorStart > activeStart);
const activeBranch = brokerSource.slice(activeStart, successorStart);
assert.match(
  activeBranch,
  /cannot qualify the current 121 portfolio/,
  "Historical 104-to-120 execution must remain fail-closed in a 121-candidate checkout",
);
assert.doesNotMatch(
  activeBranch,
  /executeAtomicMigrationTransaction\s*\(/,
  "Forward mode must not invoke the fresh migration transaction",
);
assert.equal(
  (activeBranch.match(/executeForwardMigrationTransaction\(\)/g) ?? []).length,
  1,
  "Forward mode must have exactly one bounded mutation call",
);
const mutationMarker = activeBranch.indexOf('"staging-mutation-started.json"');
const remoteWrite = activeBranch.indexOf(
  "transactionExecution = executeForwardMigrationTransaction();",
);
assert.ok(mutationMarker >= 0 && remoteWrite > mutationMarker);
assert.doesNotMatch(
  activeBranch.slice(mutationMarker, remoteWrite),
  /\bsql\s*\(|runPostgresCommand\s*\(/,
  "No remote operation may occur between mutation evidence and the only write",
);
assert.doesNotMatch(
  activeBranch.slice(remoteWrite + "transactionExecution = executeForwardMigrationTransaction();".length),
  /executeForwardMigrationTransaction\(\)/,
  "An ambiguous or committed forward transition must never be retried",
);
for (const exactActiveMarker of [
  "prior_104_relational_or_credential_surface_not_exact",
  "forward_120_structural_state_read_failed",
  "forward_120_schema_first_capture_failed",
  "forward_120_schema_repeat_capture_failed",
  "forward_120_managed_schema_first_capture_failed",
  "forward_120_managed_schema_repeat_capture_failed",
  "forward_120_managed_security_capture_failed",
  "provider_controls_read_failed_after_forward_120",
  "forward_120_forced_rls_count_read_failed",
]) {
  assert.ok(
    activeBranch.includes(exactActiveMarker),
    `Active 104-to-120 branch is missing exact stage ${exactActiveMarker}`,
  );
}

const priorProofDir = process.env.DEALFLOW_PRIOR_104_PROOF_DIR?.trim();
if (priorProofDir) {
  const seal = loadExactPrior104StagingSeal(priorProofDir);
  const syntheticSeal = loadExactPrior104SyntheticSurfaceSeal(priorProofDir);
  assert.equal(seal.applicationCommit, FORWARD_104_TO_120_AUTHORITY.prior.proofCommit);
  assert.equal(seal.migrationCount, 104);
  assert.equal(seal.rawValuesPersisted, false);
  assert.equal(syntheticSeal.evidence.containsRealCustomerData, false);
  assert.equal(syntheticSeal.evidence.providerCredentialPresent, false);
  assert.equal(syntheticSeal.userIds.length, 11);
  assert.equal(syntheticSeal.organizationIds.length, 10);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(syntheticSeal.highRiskCountScopes).map(([table, scope]) => [
        table,
        scope.column,
      ]),
    ),
    {
      leads: "campaign_id",
      provider_usage_events: "organization_id",
      system_jobs: "organization_id",
    },
    "The sealed high-risk counts must preserve their original acceptance-query scopes",
  );
}

let nativeIdempotencyProof = "static exact-history/idempotency contract";
const nativeConfigNames = [
  "DEALFLOW_NATIVE_PGBIN",
  "DEALFLOW_NATIVE_PGHOST",
  "DEALFLOW_NATIVE_PGPORT",
  "DEALFLOW_NATIVE_PGUSER",
];
if (nativeConfigNames.every((name) => process.env[name])) {
  const nativeConfig = {
    pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
    host: process.env.DEALFLOW_NATIVE_PGHOST,
    port: process.env.DEALFLOW_NATIVE_PGPORT,
    user: process.env.DEALFLOW_NATIVE_PGUSER,
  };
  const adapter = createNativePostgresTestAdapter({
    ...nativeConfig,
    expectedVersion: "17.6",
    databasePrefix: `dffwd_${process.pid}_${randomBytes(3).toString("hex")}`,
    timeoutMs: 180_000,
    maxOutputBytes: 64 * 1024 * 1024,
  });
  const transactionSafeSource = (file, source) =>
    file === "20260710160000_validate_and_normalize_pre_candidate_shape.sql"
      ? source.replace(/^BEGIN;\s*$/im, "").replace(/^COMMIT;\s*$/im, "")
      : source;
  const migrationSource = (file) =>
    transactionSafeSource(file, readFileSync(join(migrationDir, file), "utf8"));
  const buildForwardTransaction = ({
    injectFailure = false,
    records = exact.forwardRecords,
  } = {}) => {
    const statements = ["begin;", "set role postgres;"];
    for (const record of records) {
      statements.push(
        migrationSource(record.name),
        `insert into supabase_migrations.schema_migrations(version, statements)
         values ('${record.name.slice(0, 14)}', array[]::text[]);`,
      );
    }
    if (injectFailure) statements.push("select 1 / 0;");
    statements.push("reset role;", "commit;");
    return statements.join("\n");
  };
  const managedSchemaDigest = (database) => {
    const result = spawnSync(
      join(nativeConfig.pgbin, "pg_dump"),
      [
        "--host", database.host,
        "--port", String(database.port),
        "--username", database.user,
        "--dbname", database.database,
        "--schema-only",
        "--no-owner",
        "--no-privileges",
        "--no-comments",
        "--no-security-labels",
        "--no-publications",
        "--no-subscriptions",
        "--schema=public",
        "--schema=private",
      ],
      {
        encoding: "utf8",
        env: {
          PATH: `${nativeConfig.pgbin}:/usr/bin:/bin`,
          PGHOST: database.host,
          PGPORT: String(database.port),
          PGUSER: database.user,
        },
        maxBuffer: 64 * 1024 * 1024,
        timeout: 180_000,
      },
    );
    assert.equal(result.status, 0, "Managed schema oracle pg_dump must pass");
    const normalized = result.stdout
      .split(/\r?\n/)
      .filter(
        (line) =>
          !line.startsWith("\\restrict ") &&
          !line.startsWith("\\unrestrict ") &&
          !line.startsWith("-- Dumped from") &&
          !line.startsWith("-- Dumped by"),
      )
      .join("\n")
      .trim();
    return sha256(normalized);
  };
  const managedCatalogDigest = (database) => sha256(canonicalizeManagedCatalogMaterial(
    database.psql(
    `set search_path=pg_catalog;
     with catalog(item) as (
       select jsonb_build_array('namespace', namespace.nspname,
         case when namespace.nspacl is null then null else (
           select jsonb_agg(acl_item::text order by acl_item::text)
           from unnest(namespace.nspacl) acl_item
         ) end)::text
       from pg_namespace namespace
       where namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('relation', namespace.nspname, relation.relname,
         relation.relkind, relation.relpersistence, relation.relrowsecurity,
         relation.relforcerowsecurity,
         case when relation.relacl is null then null else (
           select jsonb_agg(acl_item::text order by acl_item::text)
           from unnest(relation.relacl) acl_item
         ) end)::text
       from pg_class relation
       join pg_namespace namespace on namespace.oid=relation.relnamespace
       where namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('column', namespace.nspname, relation.relname,
         attribute.attnum, attribute.attname,
         format_type(attribute.atttypid,attribute.atttypmod), attribute.attnotnull,
         pg_get_expr(default_value.adbin,default_value.adrelid))::text
       from pg_attribute attribute
       join pg_class relation on relation.oid=attribute.attrelid
       join pg_namespace namespace on namespace.oid=relation.relnamespace
       left join pg_attrdef default_value
         on default_value.adrelid=attribute.attrelid
        and default_value.adnum=attribute.attnum
       where attribute.attnum > 0 and not attribute.attisdropped
         and namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('constraint', namespace.nspname, relation.relname,
         constraint_record.conname, constraint_record.contype,
         pg_get_constraintdef(constraint_record.oid,true))::text
       from pg_constraint constraint_record
       join pg_class relation on relation.oid=constraint_record.conrelid
       join pg_namespace namespace on namespace.oid=relation.relnamespace
       where namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('function', namespace.nspname, procedure.proname,
         pg_get_function_identity_arguments(procedure.oid), procedure.prokind,
         procedure.prosecdef, procedure.provolatile, procedure.proparallel,
         case when procedure.proacl is null then null else (
           select jsonb_agg(acl_item::text order by acl_item::text)
           from unnest(procedure.proacl) acl_item
         ) end, procedure.proconfig)::text
       from pg_proc procedure
       join pg_namespace namespace on namespace.oid=procedure.pronamespace
       where namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('type', namespace.nspname, type_record.typname,
         type_record.typtype, type_record.typcategory, type_record.typnotnull,
         case when type_record.typacl is null then null else (
           select jsonb_agg(acl_item::text order by acl_item::text)
           from unnest(type_record.typacl) acl_item
         ) end)::text
       from pg_type type_record
       join pg_namespace namespace on namespace.oid=type_record.typnamespace
       where namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('enum', namespace.nspname, type_record.typname,
         enum_record.enumsortorder, enum_record.enumlabel)::text
       from pg_enum enum_record
       join pg_type type_record on type_record.oid=enum_record.enumtypid
       join pg_namespace namespace on namespace.oid=type_record.typnamespace
       where namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('policy', schemaname, tablename, policyname,
         permissive, roles, cmd, qual, with_check)::text
       from pg_policies
       where schemaname in ('public','private')
       union all
       select jsonb_build_array('trigger', namespace.nspname, relation.relname,
         trigger_record.tgname, pg_get_triggerdef(trigger_record.oid,true))::text
       from pg_trigger trigger_record
       join pg_class relation on relation.oid=trigger_record.tgrelid
       join pg_namespace namespace on namespace.oid=relation.relnamespace
       where not trigger_record.tgisinternal
         and namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('publication_relation', publication.pubname,
         namespace.nspname, relation.relname)::text
       from pg_publication_rel publication_relation
       join pg_publication publication on publication.oid=publication_relation.prpubid
       join pg_class relation on relation.oid=publication_relation.prrelid
       join pg_namespace namespace on namespace.oid=relation.relnamespace
       where namespace.nspname in ('public','private')
     ) select item from catalog order by item;`,
    { label: "Capture exact managed successor catalog", timeoutMs: 180_000 },
  )));
  const remoteEquivalentFixtureSql = `
    alter default privileges in schema public grant all privileges on tables to postgres;
    alter default privileges in schema public grant all privileges on sequences to postgres;
    alter default privileges in schema public grant all privileges on functions to postgres;
    alter default privileges in schema public revoke usage on types from anon, authenticated, service_role;
    set role postgres;
    alter default privileges in schema public grant all privileges on tables to postgres, anon, authenticated, service_role;
    alter default privileges in schema public grant all privileges on sequences to postgres, anon, authenticated, service_role;
    alter default privileges in schema public grant all privileges on functions to postgres, anon, authenticated, service_role;
    alter default privileges in schema public revoke usage on types from anon, authenticated, service_role;
    reset role;
    drop extension pgcrypto;
    set role postgres;
    create extension pgcrypto with schema extensions;
    create extension if not exists pg_stat_statements with schema extensions;
    create extension if not exists "uuid-ossp" with schema extensions;
    create publication supabase_realtime;
    create schema if not exists storage;
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null,
      name text not null,
      unique (bucket_id, name)
    );
    grant usage on schema storage to anon, authenticated, service_role;
    grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (
      version text primary key,
      statements text[] not null default array[]::text[]
    );
    reset role;`;

  adapter.preflight();
  let createdPostgresRole = false;
  if (adapter.psql("select exists(select 1 from pg_roles where rolname='postgres');") !== "t") {
    adapter.psql("create role postgres superuser nologin;");
    createdPostgresRole = true;
  }
  try {
    let forwardManagedCatalog = null;
    await adapter.withDisposableDatabase(async (database) => {
      database.psql(remoteEquivalentFixtureSql, {
        label: "Install remote-equivalent prior-104 transition fixture",
      });
      for (const record of exact.priorRecords) {
        database.psql(
          `begin;
           set role postgres;
           ${migrationSource(record.name)}
           insert into supabase_migrations.schema_migrations(version, statements)
           values ('${record.name.slice(0, 14)}', array[]::text[]);
           reset role;
           commit;`,
          { label: `Apply exact prior migration ${record.name}`, timeoutMs: 180_000 },
        );
      }
      assert.equal(
        database.psql("select count(*) || '|' || max(version) from supabase_migrations.schema_migrations;"),
        "104|20260715010000",
      );

      database.psqlMustFail(
        buildForwardTransaction({ injectFailure: true }),
        /division by zero/,
        { label: "Force actual 16-migration outer-transaction rollback", timeoutMs: 180_000 },
      );
      assert.equal(
        database.psql("select count(*) || '|' || max(version) from supabase_migrations.schema_migrations;"),
        "104|20260715010000",
        "A late failure must roll back all 16 migrations and receipts",
      );
      assert.equal(
        database.psql("select to_regclass('public.ghl_marketplace_oauth_states') is null;"),
        "t",
        "A late failure must roll back successor schema objects",
      );

      const forwardTransaction = buildForwardTransaction();
      database.psql(forwardTransaction, {
        label: "Apply actual 104-to-120 transaction",
        timeoutMs: 180_000,
      });
      assert.equal(
        database.psql("select count(*) || '|' || max(version) from supabase_migrations.schema_migrations;"),
        "120|20260717090000",
      );
      const exactManagedSchema = managedSchemaDigest(database);
      forwardManagedCatalog = managedCatalogDigest(database);
      assert.equal(
        exactManagedSchema,
        FORWARD_104_TO_120_AUTHORITY.current.managedNormalizedSchemaSha256,
        "Actual single-transaction successor must equal the independent 120 schema pin",
      );
      assert.equal(
        forwardManagedCatalog,
        FORWARD_104_TO_120_AUTHORITY.current.managedStructuralCatalogSha256,
        "Actual single-transaction successor must equal the independent 120 catalog pin",
      );
      database.psqlMustFail(
        buildForwardTransaction({ records: exact.forwardRecords.slice(0, 1) }),
        /duplicate key value violates unique constraint/,
        { label: "Prove actual first-successor duplicate re-entry rolls back", timeoutMs: 180_000 },
      );
      assert.equal(
        database.psql("select count(*) || '|' || max(version) from supabase_migrations.schema_migrations;"),
        "120|20260717090000",
      );
      assert.equal(
        managedSchemaDigest(database),
        exactManagedSchema,
        "Rejected actual-migration duplicate re-entry must leave the exact successor schema unchanged",
      );
    });
    await adapter.withDisposableDatabase(async (database) => {
      database.psql(remoteEquivalentFixtureSql, {
        label: "Install remote-equivalent fresh-120 fixture",
      });
      for (const record of records) {
        database.psql(
          `begin;
           set role postgres;
           ${migrationSource(record.name)}
           insert into supabase_migrations.schema_migrations(version, statements)
           values ('${record.name.slice(0, 14)}', array[]::text[]);
           reset role;
           commit;`,
          { label: `Apply exact fresh migration ${record.name}`, timeoutMs: 180_000 },
        );
      }
      assert.equal(
        database.psql("select count(*) || '|' || max(version) from supabase_migrations.schema_migrations;"),
        "120|20260717090000",
      );
      assert.equal(
        managedCatalogDigest(database),
        forwardManagedCatalog,
        "Fresh 120 and exact 104-to-120 paths must produce the same independently pinned managed catalog",
      );
    });
  } finally {
    if (createdPostgresRole) adapter.psql("drop role postgres;");
  }
  nativeIdempotencyProof =
    "native PostgreSQL 17.6 actual 104-to-120 late-failure rollback, exact pinned schema, and duplicate-reentry rollback";
}

console.log(
  `forward 104-to-120 staging authority contract: PASS (exact qibh/3ab010b prior seal, 104-prefix and 16-migration SHA pins, terminal 120 history, synthetic-only identity fence, no-retry ambiguity recovery, ${nativeIdempotencyProof})`,
);
