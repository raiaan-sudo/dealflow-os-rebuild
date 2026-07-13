#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createNativePostgresTestAdapter,
  sanitizePostgresDiagnostic,
} from "./lib/native-postgres-test-adapter.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const RECONCILIATION_DIR = join(ROOT, "supabase", "reconciliation");
const NODE = process.execPath;
const MIGRATION_PATTERN = /^\d{14}_.+\.sql$/;
const GATE_FILE = "20260710160000_validate_and_normalize_pre_candidate_shape.sql";
const FROZEN_FOUNDATION_LAST_FILE =
  "20260710235994_create_execution_and_creative_app_contracts.sql";
const MAY2_SQL = join(RECONCILIATION_DIR, "may2-project-bound-schema.sql");
const FINAL_GOLDEN_PATH = join(RECONCILIATION_DIR, "final-local-catalog-and-acl-golden.v1.json");
const FINAL_GOLDEN_ROWSET_PATH = join(RECONCILIATION_DIR, "final-local-catalog-and-acl-rowset.v1.json");
const AUTHORITY_CATALOG_PATH = join(RECONCILIATION_DIR, "authoritative-current-catalog.v1.json");
const EXPECTED_MIGRATION_COUNT = 80;
const COMMAND_TIMEOUT_MS = 180_000;
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const GLOBAL_OWNER_LOCK = "/private/tmp/dealflow-schema-reconciliation-owner.lock";
const CAPTURE_CANDIDATE_FLAG = "--capture-golden-rowset-candidate";
if (process.argv.includes("--write-golden-rowset")) {
  throw new Error("Direct source-oracle writes are prohibited; use an external candidate path.");
}
const captureCandidateIndex = process.argv.indexOf(CAPTURE_CANDIDATE_FLAG);
let captureCandidatePath = null;
if (captureCandidateIndex !== -1) {
  const requestedPath = process.argv[captureCandidateIndex + 1];
  if (!requestedPath || requestedPath.startsWith("--") || !isAbsolute(requestedPath)) {
    throw new Error(`${CAPTURE_CANDIDATE_FLAG} requires an absolute external file path.`);
  }
  captureCandidatePath = resolve(requestedPath);
  if (captureCandidatePath === ROOT || captureCandidatePath.startsWith(`${ROOT}/`)) {
    throw new Error("Golden-rowset candidates must be written outside the repository.");
  }
}

const GATES = [
  ["01", "static_preflight"],
  ["02", "blank_chain"],
  ["03", "authoritative_current_adoption"],
  ["04", "may2_upgrade"],
  ["05", "legacy_shape_reject"],
  ["06", "partial_collision_reject_before_mutation"],
  ["07", "repeat_idempotency"],
  ["08", "sentinel_preservation"],
  ["09", "unsupported_conversion_reject"],
  ["10", "exact_rls_private_digest"],
  ["11", "mixed_worker_compatibility"],
  ["12", "injected_failure_recovery"],
  ["13", "two_independent_final_databases"],
  ["14", "cleanup"],
];

const config = Object.freeze({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
});

const allMigrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((file) => MIGRATION_PATTERN.test(file))
  .sort();
const frozenFoundationLastIndex = allMigrationFiles.indexOf(
  FROZEN_FOUNDATION_LAST_FILE,
);
if (frozenFoundationLastIndex === -1) {
  throw new Error(
    `Frozen foundation boundary is missing: ${FROZEN_FOUNDATION_LAST_FILE}`,
  );
}
// The 14-gate catalog oracle is intentionally frozen to the independently
// reviewed 80-migration foundation. Later product migrations receive focused
// and complete-chain proofs; they must not silently redefine this authority.
const migrationFiles = allMigrationFiles.slice(0, frozenFoundationLastIndex + 1);
const extensionMigrationFiles = allMigrationFiles.slice(
  frozenFoundationLastIndex + 1,
);
const finalGolden = JSON.parse(readFileSync(FINAL_GOLDEN_PATH, "utf8"));
const finalGoldenRowsetText = existsSync(FINAL_GOLDEN_ROWSET_PATH)
  ? readFileSync(FINAL_GOLDEN_ROWSET_PATH, "utf8")
  : null;
const finalGoldenRowset = finalGoldenRowsetText ? JSON.parse(finalGoldenRowsetText) : null;
const authorityCatalog = JSON.parse(readFileSync(AUTHORITY_CATALOG_PATH, "utf8"));
const gateIndex = migrationFiles.indexOf(GATE_FILE);
const firstReconstructionIndex = migrationFiles.findIndex((file) => file.startsWith("20260504183000_"));
const firstReconstructionFile = migrationFiles[firstReconstructionIndex];
const preReconstructionFiles = migrationFiles.slice(0, firstReconstructionIndex);
const preCandidateFiles = migrationFiles.slice(0, gateIndex);
const candidateFiles = migrationFiles.slice(gateIndex);
const gateResults = [];
let firstFailure = null;
let blankFinalDigest = null;
let blankFinalSnapshot = null;
let blankRlsPrivateDigest = null;
let blockedReason = null;
let globalOwnerLockHeld = false;
let remoteOwnerCreatedByRun = false;
let remoteOwnerReady = false;

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function snapshotPayloadDigest(snapshot) {
  return sha256(JSON.stringify(snapshot));
}

function structuralDigestFromSnapshot(snapshot) {
  return sha256(snapshot.map((row) => row.filter((value) => value != null).join("\x1f")).join("\x1e"));
}

function snapshotSurfaceCounts(snapshot) {
  const counts = {};
  for (const [kind] of snapshot) counts[kind] = (counts[kind] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function writeGoldenRowsetCandidate(snapshot, structuralDigestSha256) {
  const rowset = {
    schemaVersion: "dealflow.final-local-catalog-and-acl-rowset.v1",
    postgresVersion: "17.6",
    migrationCount: EXPECTED_MIGRATION_COUNT,
    authorityCatalogDigestSha256: authorityCatalog.provenance.combinedCatalogDigestSha256,
    generationMode: "EXTERNAL_CANDIDATE_NOT_APPROVED",
    reviewRequirement: "This external candidate is not a passing oracle. Commit only after independent object-level review, two matching PostgreSQL 17.6 databases, pinned golden metadata, and a subsequent normal frozen comparison.",
    rowCount: snapshot.length,
    surfaceCounts: snapshotSurfaceCounts(snapshot),
    normalizedRowsSha256: snapshotPayloadDigest(snapshot),
    structuralDigestSha256,
    rows: snapshot,
  };
  const contents = `${JSON.stringify(rowset, null, 2)}\n`;
  writeFileSync(captureCandidatePath, contents, { encoding: "utf8", mode: 0o600 });
  return { ...rowset, fileSha256: sha256(contents) };
}

function result(id, name, status, details = {}) {
  gateResults.push({ id, name, status, ...details });
}

function failResult(id, name, error, details = {}) {
  const diagnostic = sanitizePostgresDiagnostic(error);
  result(id, name, "FAIL", { ...details, diagnostic });
  if (!firstFailure) firstFailure = { gate: `${id}_${name}`, diagnostic, ...details };
  if (!blockedReason) blockedReason = `${id}_${name}`;
}

function command(label, executable, args) {
  const commandResult = spawnSync(executable, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? ROOT,
      LANG: "C",
      LC_ALL: "C",
      TERM: "dumb",
    },
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (commandResult.error || commandResult.status !== 0) {
    throw new Error(
      `${label}: ${sanitizePostgresDiagnostic(
        commandResult.error?.message || commandResult.stderr || commandResult.stdout,
      )}`,
    );
  }
  return commandResult.stdout.trim();
}

function createAdapter() {
  return createNativePostgresTestAdapter({
    ...config,
    expectedVersion: "17.6",
    databasePrefix: "dfschemaproof",
    maxOutputBytes: MAX_OUTPUT_BYTES,
    timeoutMs: COMMAND_TIMEOUT_MS,
  });
}

function acquireGlobalOwnerLock() {
  try {
    mkdirSync(GLOBAL_OWNER_LOCK, { mode: 0o700 });
    globalOwnerLockHeld = true;
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(
        `Another schema-reconciliation proof owns ${GLOBAL_OWNER_LOCK}; refusing shared-role concurrency`,
      );
    }
    throw error;
  }
}

function releaseGlobalOwnerLock() {
  if (!globalOwnerLockHeld) return;
  rmdirSync(GLOBAL_OWNER_LOCK);
  globalOwnerLockHeld = false;
}

function prepareRemoteEquivalentOwner(adapter) {
  const present = adapter.psql(
    "select exists(select 1 from pg_catalog.pg_roles where rolname='postgres');",
    { label: "Check remote-equivalent migration owner" },
  ) === "t";
  if (!present) {
    adapter.psql("create role postgres superuser nologin;", {
      label: "Create serialized remote-equivalent migration owner",
    });
    remoteOwnerCreatedByRun = true;
  }
  const safe = adapter.psql(
    "select rolsuper and not rolcanlogin from pg_catalog.pg_roles where rolname='postgres';",
    { label: "Verify remote-equivalent migration owner" },
  );
  if (safe !== "t") {
    throw new Error("Existing postgres role is not the required superuser/nologin proof role");
  }
  remoteOwnerReady = true;
}

function cleanupRemoteEquivalentOwner(adapter) {
  if (!remoteOwnerCreatedByRun) return;
  adapter.psql("drop role postgres;", { label: "Drop serialized remote-equivalent migration owner" });
  remoteOwnerCreatedByRun = false;
  remoteOwnerReady = false;
}

function psqlEnv(database) {
  return {
    PATH: `${config.pgbin}:/usr/bin:/bin`,
    HOME: config.host,
    LANG: "C",
    LC_ALL: "C",
    TERM: "dumb",
    PGDATABASE: database,
    PGHOST: config.host,
    PGOPTIONS: "-c timezone=UTC",
    PGPASSFILE: join(config.host, ".dealflow-schema-proof-no-pgpass"),
    PGPORT: String(config.port),
    PGSSLMODE: "disable",
    PGUSER: config.user,
    PSQLRC: "/dev/null",
  };
}

function nearestStatementId(file, lineNumber) {
  if (!Number.isInteger(lineNumber)) return null;
  const lines = readFileSync(join(MIGRATIONS_DIR, file), "utf8").split(/\r?\n/);
  for (let index = Math.min(lineNumber - 1, lines.length - 1); index >= 0; index -= 1) {
    const match = /^-- dealflow:statement id=([^ ]+)/.exec(lines[index]);
    if (match) return match[1];
  }
  return null;
}

function parseMigrationFailure(file, stderr) {
  const escapedFile = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lineMatch = new RegExp(`${escapedFile}:(\\d+):\\s+ERROR:\\s+(?:([0-9A-Z]{5}):\\s+)?([^\\n]+)`).exec(stderr)
    ?? /:(\d+):\s+ERROR:\s+(?:([0-9A-Z]{5}):\s+)?([^\n]+)/.exec(stderr);
  const line = lineMatch ? Number(lineMatch[1]) : null;
  return {
    file,
    line,
    statementId: nearestStatementId(file, line),
    sqlstate: lineMatch?.[2] ?? null,
    error: sanitizePostgresDiagnostic(lineMatch?.[3] ?? stderr),
  };
}

function applySqlFile(session, absolutePath, label, { singleTransaction = true } = {}) {
  const args = [
    "--host", config.host,
    "--port", String(config.port),
    "--username", config.user,
    "--dbname", session.database,
    "--no-password",
    "--no-psqlrc",
    "--set=ON_ERROR_STOP=1",
    "--set=VERBOSITY=verbose",
    "--set=SHOW_CONTEXT=always",
  ];
  if (singleTransaction) args.push("--single-transaction");
  // Supabase's captured application objects are owned by the managed `postgres`
  // migration role. Running the same DDL as the native-cluster bootstrap owner
  // would create structurally different composite/array type owner metadata and
  // would make the exact catalog gate fail for an environmental, not SQL, reason.
  args.push("--command", "set role postgres", "--file", absolutePath);
  const applied = spawnSync(join(config.pgbin, "psql"), args, {
    encoding: "utf8",
    env: psqlEnv(session.database),
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (applied.error || applied.status !== 0) {
    const error = new Error(`${label}: ${sanitizePostgresDiagnostic(applied.error?.message || applied.stderr)}`);
    error.stderr = applied.stderr ?? "";
    throw error;
  }
}

function applyMigrations(session, files, { useHistory = false } = {}) {
  if (useHistory) {
    session.psql(`
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (
        version text primary key,
        statements text[]
      );
    `, { label: "Create disposable migration history" });
  }
  const applied = [];
  const skipped = [];
  for (const file of files) {
    const version = file.slice(0, 14);
    if (useHistory) {
      const present = session.psql(
        `select exists(select 1 from supabase_migrations.schema_migrations where version='${version}');`,
        { label: `Check disposable migration history ${version}` },
      );
      if (present === "t") {
        skipped.push(file);
        continue;
      }
    }
    try {
      applySqlFile(session, join(MIGRATIONS_DIR, file), `Apply ${file}`);
    } catch (error) {
      error.migrationFailure = parseMigrationFailure(file, error.stderr ?? error.message);
      throw error;
    }
    if (useHistory) {
      session.psql(
        `insert into supabase_migrations.schema_migrations(version, statements) values ('${version}', array[]::text[]);`,
        { label: `Record disposable migration history ${version}` },
      );
    }
    applied.push(file);
  }
  return { applied, skipped };
}

const STRUCTURAL_DIGEST_SQL = `
with rows as (
  select 'relation'::text as kind, n.nspname::text as schema_name, c.relname::text as object_name,
         concat_ws('|', c.relkind, c.relpersistence, pg_catalog.pg_get_userbyid(c.relowner),
                   c.relispartition, c.relhasrules, c.relrowsecurity, c.relforcerowsecurity,
                   c.relreplident,
                   coalesce((select string_agg(option_value, ',' order by option_value)
                               from unnest(c.reloptions) option_value), ''),
                   coalesce((select string_agg(parent_namespace.nspname::text || '.' || parent_relation.relname::text, ',' order by inheritance_record.inhseqno)
                               from pg_catalog.pg_inherits inheritance_record
                               join pg_catalog.pg_class parent_relation on parent_relation.oid=inheritance_record.inhparent
                               join pg_catalog.pg_namespace parent_namespace on parent_namespace.oid=parent_relation.relnamespace
                              where inheritance_record.inhrelid=c.oid), ''),
                   coalesce(pg_catalog.pg_get_expr(c.relpartbound,c.oid,false), ''),
                   coalesce(pg_catalog.pg_get_partkeydef(c.oid), ''),
                   coalesce((select partitioned_record.partstrat::text
                               from pg_catalog.pg_partitioned_table partitioned_record
                              where partitioned_record.partrelid=c.oid), ''),
                   coalesce((select default_namespace.nspname::text || '.' || default_relation.relname::text
                               from pg_catalog.pg_partitioned_table partitioned_record
                               join pg_catalog.pg_class default_relation on default_relation.oid=partitioned_record.partdefid
                               join pg_catalog.pg_namespace default_namespace on default_namespace.oid=default_relation.relnamespace
                              where partitioned_record.partrelid=c.oid), '')) as definition
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','S')
  union all
  select 'column', n.nspname::text, c.relname::text || '.' || a.attname::text,
         concat_ws('|', row_number() over (partition by n.nspname,c.relname order by a.attnum),
                   pg_catalog.format_type(a.atttypid,a.atttypmod), a.attnotnull,
                   coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),''))
    from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
   where n.nspname in ('public','private') and a.attnum>0 and not a.attisdropped
  union all
  select 'constraint', n.nspname::text, c.relname::text || '.' || con.conname::text, pg_catalog.pg_get_constraintdef(con.oid,true)
    from pg_catalog.pg_constraint con join pg_catalog.pg_class c on c.oid=con.conrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')
  union all
  select 'index', n.nspname::text, c.relname::text, pg_catalog.pg_get_indexdef(c.oid)
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('public','private') and c.relkind='i'
  union all
  select 'routine', n.nspname::text, p.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
         pg_catalog.pg_get_functiondef(p.oid)
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','private')
  union all
  select 'policy', schemaname::text, tablename::text || '.' || policyname::text,
         concat_ws('|', permissive, cmd, roles::text, coalesce(qual,''), coalesce(with_check,''))
    from pg_catalog.pg_policies where schemaname in ('public','private')
  union all
  select 'trigger', n.nspname::text, c.relname::text || '.' || t.tgname::text, pg_catalog.pg_get_triggerdef(t.oid,true)
    from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('public','private') and not t.tgisinternal
  union all
  select 'schema_acl', n.nspname::text, n.nspname::text,
         concat_ws('|', n.nspacl is null, pg_catalog.pg_get_userbyid(n.nspowner),
                   pg_catalog.pg_get_userbyid(acl.grantor),
                   case when acl.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end,
                   acl.privilege_type, acl.is_grantable)
    from pg_catalog.pg_namespace n
    cross join lateral pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) acl
   where n.nspname in ('public','private')
  union all
  select 'relation_acl', n.nspname::text, c.relname::text,
         concat_ws('|', c.relacl is null, pg_catalog.pg_get_userbyid(c.relowner),
                   pg_catalog.pg_get_userbyid(acl.grantor),
                   case when acl.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end,
                   acl.privilege_type, acl.is_grantable)
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl
   where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','f')
  union all
  select 'sequence_acl', n.nspname::text, c.relname::text,
         concat_ws('|', c.relacl is null, pg_catalog.pg_get_userbyid(c.relowner),
                   pg_catalog.pg_get_userbyid(acl.grantor),
                   case when acl.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end,
                   acl.privilege_type, acl.is_grantable)
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('s',c.relowner))) acl
   where n.nspname in ('public','private') and c.relkind='S'
  union all
  select 'routine_acl', n.nspname::text,
         p.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
         concat_ws('|', p.proacl is null, pg_catalog.pg_get_userbyid(p.proowner),
                   pg_catalog.pg_get_userbyid(acl.grantor),
                   case when acl.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end,
                   acl.privilege_type, acl.is_grantable)
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
   where n.nspname in ('public','private') and p.prokind in ('f','p','w')
     and not exists (
       select 1 from pg_catalog.pg_depend d join pg_catalog.pg_extension e on e.oid=d.refobjid
        where d.classid=p.tableoid and d.objid=p.oid and d.refclassid=e.tableoid and d.deptype='e'
     )
  union all
  select 'type_acl_state', n.nspname::text, t.typname::text,
         concat_ws('|', t.typacl is null, pg_catalog.pg_get_userbyid(t.typowner), t.typtype)
    from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid=t.typnamespace
   where n.nspname in ('public','private')
  union all
  select 'type_acl_grant', n.nspname::text, t.typname::text,
         concat_ws('|', t.typacl is null, pg_catalog.pg_get_userbyid(t.typowner),
                   pg_catalog.pg_get_userbyid(acl.grantor),
                   case when acl.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end,
                   acl.privilege_type, acl.is_grantable)
    from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid=t.typnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(t.typacl,pg_catalog.acldefault('T',t.typowner))) acl
   where n.nspname in ('public','private')
  union all
  select 'column_acl_state', n.nspname::text, c.relname::text || '.' || a.attname::text,
         concat_ws('|', a.attacl is null, pg_catalog.pg_get_userbyid(c.relowner))
    from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('public','private') and a.attnum>0 and not a.attisdropped
  union all
  select 'column_acl_grant', n.nspname::text, c.relname::text || '.' || a.attname::text,
         concat_ws('|', a.attacl is null, pg_catalog.pg_get_userbyid(c.relowner),
                   pg_catalog.pg_get_userbyid(acl.grantor),
                   case when acl.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end,
                   acl.privilege_type, acl.is_grantable)
    from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    cross join lateral pg_catalog.aclexplode(a.attacl) acl
   where n.nspname in ('public','private') and a.attnum>0 and not a.attisdropped and a.attacl is not null
  union all
  select 'default_acl', coalesce(n.nspname::text,'<global>'),
         pg_catalog.pg_get_userbyid(d.defaclrole)::text || '.' || d.defaclobjtype::text,
         concat_ws('|', pg_catalog.pg_get_userbyid(acl.grantor),
                   case when acl.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end,
                   acl.privilege_type, acl.is_grantable)
    from pg_catalog.pg_default_acl d left join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace
    cross join lateral pg_catalog.aclexplode(d.defaclacl) acl
   where d.defaclnamespace=0 or n.nspname in ('public','private')
)
select encode(extensions.digest(string_agg(concat_ws(E'\\x1f',kind,schema_name,object_name,definition), E'\\x1e'
                                           order by kind,schema_name,object_name,definition), 'sha256'),'hex') from rows;
`;

const STRUCTURAL_SNAPSHOT_SQL = `${STRUCTURAL_DIGEST_SQL.slice(0, STRUCTURAL_DIGEST_SQL.lastIndexOf("select encode("))}
select coalesce(
  jsonb_agg(jsonb_build_array(kind, schema_name, object_name, definition)
            order by kind, schema_name, object_name, definition),
  '[]'::jsonb
)::text
from rows;
`;

// Authorization is anchored to the same canonical snapshot as structure. That
// snapshot includes RLS/policies/private objects plus every schema, relation,
// sequence, routine, type, column, and default-privilege ACL surface.
const RLS_PRIVATE_DIGEST_SQL = STRUCTURAL_DIGEST_SQL;

function structuralDigest(session) {
  const digest = session.psql(STRUCTURAL_DIGEST_SQL, { label: "Compute deterministic structural digest" });
  assert.match(digest, /^[a-f0-9]{64}$/);
  return digest;
}

function structuralSnapshot(session) {
  const snapshot = JSON.parse(session.psql(STRUCTURAL_SNAPSHOT_SQL, {
    label: "Capture deterministic structural snapshot",
  }));
  assert.ok(Array.isArray(snapshot));
  return snapshot;
}

function structuralDifference(expected, actual) {
  const serialize = (row) => JSON.stringify(row);
  const expectedSet = new Set(expected.map(serialize));
  const actualSet = new Set(actual.map(serialize));
  return {
    expectedOnly: expected.filter((row) => !actualSet.has(serialize(row))).slice(0, 10),
    actualOnly: actual.filter((row) => !expectedSet.has(serialize(row))).slice(0, 10),
  };
}

function rlsPrivateDigest(session) {
  const digest = session.psql(RLS_PRIVATE_DIGEST_SQL, { label: "Compute deterministic RLS/private digest" });
  assert.match(digest, /^[a-f0-9]{64}$/);
  return digest;
}

function expectMigrationReject(session, file, pattern) {
  try {
    applySqlFile(session, join(MIGRATIONS_DIR, file), `Expected rejection ${file}`);
  } catch (error) {
    const failure = parseMigrationFailure(file, error.stderr ?? error.message);
    assert.match(`${failure.error}\n${error.message}`, pattern);
    return failure;
  }
  throw new Error(`${file} unexpectedly succeeded`);
}

async function isolated(adapter, callback) {
  if (!remoteOwnerReady) throw new Error("Remote-equivalent migration owner is not prepared");
  return adapter.withDisposableDatabase(async (session) => {
    // The managed Supabase migration owner carries API-role default
    // privileges.  The native adapter's bootstrap owner is intentionally a
    // different local role, so establish the captured defaults for the
    // serialized remote-equivalent owner inside every disposable database.
    session.psql(`
      alter default privileges in schema public
        grant all privileges on tables to postgres;
      alter default privileges in schema public
        grant all privileges on sequences to postgres;
      alter default privileges in schema public
        grant all privileges on functions to postgres;
      alter default privileges in schema public
        revoke usage on types from anon, authenticated, service_role;

      set role postgres;
      alter default privileges in schema public
        grant all privileges on tables to postgres, anon, authenticated, service_role;
      alter default privileges in schema public
        grant all privileges on sequences to postgres, anon, authenticated, service_role;
      alter default privileges in schema public
        grant all privileges on functions to postgres, anon, authenticated, service_role;
      alter default privileges in schema public
        revoke usage on types from anon, authenticated, service_role;
      reset role;

      drop extension pgcrypto;
      set role postgres;
      create extension pgcrypto with schema extensions;
      create extension if not exists pg_stat_statements with schema extensions;
      create extension if not exists "uuid-ossp" with schema extensions;
      create publication supabase_realtime;
      reset role;
    `, { label: "Install remote-equivalent API-role default privileges" });
    return callback(session);
  });
}

const adapter = createAdapter();

try {
  acquireGlobalOwnerLock();
  const preexistingDisposableDatabases = adapter.listDisposableDatabases();
  if (preexistingDisposableDatabases.length > 0) {
    throw new Error(
      `Refusing schema proof with ${preexistingDisposableDatabases.length} pre-existing disposable database(s)`,
    );
  }
  prepareRemoteEquivalentOwner(adapter);
  assert.ok(
    extensionMigrationFiles.every(
      (file) => file.localeCompare(FROZEN_FOUNDATION_LAST_FILE) > 0,
    ),
    "All product extensions must remain after the frozen foundation boundary",
  );
  assert.equal(
    new Set(allMigrationFiles.map((file) => file.slice(0, 14))).size,
    allMigrationFiles.length,
    "Migration versions must remain globally unique",
  );
  assert.equal(migrationFiles.length, EXPECTED_MIGRATION_COUNT);
  assert.ok(firstReconstructionIndex > 0, "first reconstructed migration is missing");
  assert.equal(finalGolden.schemaVersion, "dealflow.final-local-catalog-and-acl-golden.v1");
  assert.equal(finalGolden.postgresVersion, "17.6");
  assert.equal(finalGolden.migrationCount, EXPECTED_MIGRATION_COUNT);
  assert.match(finalGolden.finalCatalogAndAclDigestSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    finalGolden.authorityCatalogDigestSha256,
    authorityCatalog.provenance.combinedCatalogDigestSha256,
  );
  assert.ok(gateIndex > 0, "normalization gate migration is missing");
  if (!captureCandidatePath) {
    assert.ok(finalGoldenRowset, "source-controlled normalized catalog/ACL rowset is missing");
    assert.equal(finalGoldenRowset.schemaVersion, "dealflow.final-local-catalog-and-acl-rowset.v1");
    assert.equal(finalGoldenRowset.postgresVersion, "17.6");
    assert.equal(finalGoldenRowset.migrationCount, EXPECTED_MIGRATION_COUNT);
    assert.equal(
      finalGoldenRowset.authorityCatalogDigestSha256,
      authorityCatalog.provenance.combinedCatalogDigestSha256,
    );
    assert.equal(finalGoldenRowset.rowCount, finalGoldenRowset.rows.length);
    assert.deepEqual(snapshotSurfaceCounts(finalGoldenRowset.rows), finalGoldenRowset.surfaceCounts);
    assert.equal(snapshotPayloadDigest(finalGoldenRowset.rows), finalGoldenRowset.normalizedRowsSha256);
    assert.equal(structuralDigestFromSnapshot(finalGoldenRowset.rows), finalGoldenRowset.structuralDigestSha256);
    assert.equal(finalGoldenRowset.structuralDigestSha256, finalGolden.finalCatalogAndAclDigestSha256);
    assert.equal(finalGoldenRowset.normalizedRowsSha256, finalGolden.normalizedRowsetSha256);
    assert.equal(finalGoldenRowset.rowCount, finalGolden.normalizedRowCount);
    assert.deepEqual(finalGoldenRowset.surfaceCounts, finalGolden.normalizedSurfaceCounts);
    assert.equal(sha256(finalGoldenRowsetText), finalGolden.normalizedRowsetFileSha256);
  }
  const native = adapter.preflight();
  command("Generator determinism check", NODE, ["scripts/generate-forward-migration-portfolio.mjs", "--check"]);
  const staticOutput = command("Forward-reconstruction static proof", NODE, ["scripts/schema/check-forward-reconstruction.mjs"]);
  const staticProof = JSON.parse(staticOutput);
  assert.equal(staticProof.status, "PASS");
  result("01", "static_preflight", "PASS", {
    runtime: process.version,
    migrationCount: migrationFiles.length,
    generatedMigrationCount: staticProof.generatedMigrationCount,
    postgresVersion: native.serverVersion,
    socketOnly: native.listenAddresses === "",
  });
} catch (error) {
  failResult("01", "static_preflight", error);
}

if (!blockedReason) {
  try {
    await isolated(adapter, async (session) => {
      const replay = applyMigrations(session, migrationFiles, { useHistory: true });
      assert.equal(replay.applied.length, migrationFiles.length);
      blankFinalDigest = structuralDigest(session);
      blankFinalSnapshot = structuralSnapshot(session);
      blankRlsPrivateDigest = rlsPrivateDigest(session);
      assert.equal(structuralDigestFromSnapshot(blankFinalSnapshot), blankFinalDigest);
      if (captureCandidatePath) {
        const written = writeGoldenRowsetCandidate(blankFinalSnapshot, blankFinalDigest);
        assert.equal(written.normalizedRowsSha256, snapshotPayloadDigest(blankFinalSnapshot));
      } else {
        assert.equal(blankFinalDigest, finalGolden.finalCatalogAndAclDigestSha256);
        assert.equal(blankRlsPrivateDigest, finalGolden.finalCatalogAndAclDigestSha256);
        assert.deepEqual(blankFinalSnapshot, finalGoldenRowset.rows);
      }
    });
    result("02", "blank_chain", "PASS", {
      appliedMigrationCount: migrationFiles.length,
      finalStructuralDigestSha256: blankFinalDigest,
      normalizedRowCount: blankFinalSnapshot.length,
      goldenRowsetMode: captureCandidatePath ? "EXTERNAL_CANDIDATE_NOT_APPROVED" : "FROZEN_COMPARE",
    });
  } catch (error) {
    const migration = error.migrationFailure ?? null;
    failResult("02", "blank_chain", error, migration ? { migration } : {});
  }
}

if (!blockedReason) {
  try {
    await isolated(adapter, async (session) => {
      applyMigrations(session, preCandidateFiles, { useHistory: true });
      const before = structuralDigest(session);
      const foundationVersion = migrationFiles[0].slice(0, 14);
      session.psql(
        `delete from supabase_migrations.schema_migrations where version='${foundationVersion}';`,
        { label: "Model authoritative-current database before foundation history adoption" },
      );
      assert.equal(
        session.psql(`select count(*) from supabase_migrations.schema_migrations where version='${foundationVersion}';`),
        "0",
      );
      session.psql(
        `insert into supabase_migrations.schema_migrations(version, statements) values ('${foundationVersion}', array[]::text[]);`,
        { label: "Adopt foundation history after exact pre-candidate shape proof" },
      );
      assert.equal(structuralDigest(session), before);
      applyMigrations(session, candidateFiles, { useHistory: true });
      assert.equal(structuralDigest(session), blankFinalDigest);
      assert.notEqual(before, blankFinalDigest);
    });
    result("03", "authoritative_current_adoption", "PASS", {
      foundationHistoryAdoptedOnce: true,
      freshFoundationRerunCount: 0,
      finalStructuralDigestSha256: blankFinalDigest,
    });
  } catch (error) {
    failResult("03", "authoritative_current_adoption", error, error.migrationFailure ? { migration: error.migrationFailure } : {});
  }
}

if (!blockedReason) {
  try {
    await isolated(adapter, async (session) => {
      const may2Source = readFileSync(MAY2_SQL, "utf8");
      const managedVaultStatement = 'CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";';
      assert.equal(may2Source.split(managedVaultStatement).length - 1, 1);
      const appOwnedMay2Source = may2Source.replace(managedVaultStatement, "");
      assert.doesNotMatch(appOwnedMay2Source, /\bsupabase_vault\b|\bvault\./i);
      session.psql(`set role postgres;\n${appOwnedMay2Source}`, {
        label: "Apply app-owned May-2 structural fixture without unavailable managed vault extension",
        timeoutMs: COMMAND_TIMEOUT_MS,
      });
      const may2Start = migrationFiles.findIndex((file) => file.startsWith("20260504183000_"));
      assert.ok(may2Start > 0);
      applyMigrations(session, migrationFiles.slice(may2Start), { useHistory: true });
      const actualDigest = structuralDigest(session);
      if (actualDigest !== blankFinalDigest) {
        const error = new Error(`May-2 structural digest mismatch: ${JSON.stringify(
          structuralDifference(blankFinalSnapshot, structuralSnapshot(session)),
        )}`);
        error.actualDigest = actualDigest;
        throw error;
      }
    });
    result("04", "may2_upgrade", "PASS", { finalStructuralDigestSha256: blankFinalDigest });
  } catch (error) {
    failResult("04", "may2_upgrade", error, error.migrationFailure ? { migration: error.migrationFailure } : {});
  }
}

if (remoteOwnerReady) {
  try {
    await isolated(adapter, async (session) => {
      session.psql("create table public.campaign_plans(id uuid primary key, legacy_marker text);", { label: "Create legacy shape" });
      const before = structuralDigest(session);
      expectMigrationReject(session, migrationFiles[0], /fresh foundation refused|nonblank|partial/i);
      assert.equal(structuralDigest(session), before);
    });
    result("05", "legacy_shape_reject", "PASS", { mutationCount: 0 });
  } catch (error) {
    failResult("05", "legacy_shape_reject", error);
  }
}

if (remoteOwnerReady) {
  try {
    await isolated(adapter, async (session) => {
      session.psql("create table public.organizations(id uuid primary key); create table public.schema_proof_sentinel(value text); insert into public.schema_proof_sentinel values ('preserve');", { label: "Create partial collision" });
      const before = structuralDigest(session);
      expectMigrationReject(session, migrationFiles[0], /fresh foundation refused|nonblank|partial/i);
      assert.equal(structuralDigest(session), before);
      assert.equal(session.psql("select value from public.schema_proof_sentinel;"), "preserve");
    });

    const lateCollisionCases = [
      {
        name: "table",
        sql: "create table public.insights(id text primary key);",
        pattern: /forward table(?:-column)? adoption mismatch/i,
      },
      {
        name: "column",
        sql: "alter table public.campaign_plans add column capture_method integer;",
        pattern: /forward column adoption mismatch/i,
      },
      {
        name: "index",
        sql: "create index campaign_plans_lead_capture_idx on public.campaign_plans(id);",
        pattern: /forward index adoption mismatch/i,
      },
    ];
    for (const collision of lateCollisionCases) {
      await isolated(adapter, async (session) => {
        applyMigrations(session, preReconstructionFiles, { useHistory: true });
        session.psql(
          `${collision.sql}
           create table public.schema_proof_sentinel(value text);
           insert into public.schema_proof_sentinel values ('preserve-${collision.name}');`,
          { label: `Create malformed later ${collision.name} collision` },
        );
        const before = structuralDigest(session);
        expectMigrationReject(session, firstReconstructionFile, collision.pattern);
        assert.equal(structuralDigest(session), before);
        assert.equal(
          session.psql("select value from public.schema_proof_sentinel;"),
          `preserve-${collision.name}`,
        );
      });
    }
    await isolated(adapter, async (session) => {
      applyMigrations(session, [...preReconstructionFiles, firstReconstructionFile], {
        useHistory: true,
      });
      session.psql(
        `alter table public.activation_events set (autovacuum_enabled=false);
         create table public.schema_proof_sentinel(value text);
         insert into public.schema_proof_sentinel values ('preserve-table-metadata');`,
        { label: "Create identical-column table-metadata collision" },
      );
      const beforeSnapshot = structuralSnapshot(session);
      const beforeDigest = structuralDigest(session);
      expectMigrationReject(session, firstReconstructionFile, /forward table adoption mismatch/i);
      assert.deepEqual(structuralSnapshot(session), beforeSnapshot);
      assert.equal(structuralDigest(session), beforeDigest);
      assert.equal(
        session.psql("select value from public.schema_proof_sentinel;"),
        "preserve-table-metadata",
      );
    });
    result("06", "partial_collision_reject_before_mutation", "PASS", {
      mutationCount: 0,
      malformedLaterObjectClassesRejected: [
        ...lateCollisionCases.map((collision) => collision.name),
        "table_metadata",
      ],
    });
  } catch (error) {
    failResult("06", "partial_collision_reject_before_mutation", error);
  }
}

if (!blockedReason) {
  try {
    await isolated(adapter, async (session) => {
      const first = applyMigrations(session, migrationFiles, { useHistory: true });
      const before = structuralDigest(session);
      const second = applyMigrations(session, migrationFiles, { useHistory: true });
      assert.equal(first.applied.length, migrationFiles.length);
      assert.equal(second.applied.length, 0);
      assert.equal(second.skipped.length, migrationFiles.length);
      assert.equal(structuralDigest(session), before);
    });
    result("07", "repeat_idempotency", "PASS", { skippedOnRepeat: migrationFiles.length, mutationCount: 0 });
  } catch (error) {
    failResult("07", "repeat_idempotency", error, error.migrationFailure ? { migration: error.migrationFailure } : {});
  }
}

const USER_ID = "00000000-0000-4000-8000-000000000101";
const ORG_ID = "00000000-0000-4000-8000-000000000201";
const CAMPAIGN_ID = "00000000-0000-4000-8000-000000000301";

if (!blockedReason) {
  try {
    await isolated(adapter, async (session) => {
      applyMigrations(session, preCandidateFiles);
      session.psql(`
        insert into auth.users(id) values ('${USER_ID}');
        insert into public.users(id,email) values ('${USER_ID}','schema-proof@example.invalid');
        insert into public.organizations(id,name,slug,owner_user_id) values ('${ORG_ID}','Schema proof','schema-proof','${USER_ID}');
        insert into public.campaign_plans(id,user_id,owner_id,plan,organization_id,client_name)
        values ('${CAMPAIGN_ID}','${USER_ID}','sentinel-owner','{}','${ORG_ID}','sentinel-client');
      `, { label: "Insert conversion sentinel" });
      applyMigrations(session, candidateFiles);
      assert.equal(session.psql(`select concat_ws('|',id,user_id,owner_id,client_name) from public.campaign_plans where id='${CAMPAIGN_ID}';`), `${CAMPAIGN_ID}|${USER_ID}|sentinel-owner|sentinel-client`);
      assert.equal(session.psql("select data_type from information_schema.columns where table_schema='public' and table_name='campaign_plans' and column_name='user_id';"), "uuid");
    });
    result("08", "sentinel_preservation", "PASS", { convertedUserId: USER_ID, sentinelRowsPreserved: 1 });
  } catch (error) {
    failResult("08", "sentinel_preservation", error, error.migrationFailure ? { migration: error.migrationFailure } : {});
  }
}

if (!blockedReason) {
  try {
    await isolated(adapter, async (session) => {
      applyMigrations(session, preCandidateFiles);
      session.psql(`insert into public.campaign_plans(id,user_id,owner_id,plan) values ('${CAMPAIGN_ID}','not-a-canonical-uuid','sentinel-owner','{}');`, { label: "Insert unsupported conversion sentinel" });
      const before = structuralDigest(session);
      expectMigrationReject(session, GATE_FILE, /canonical|uuid|pre-candidate/i);
      assert.equal(structuralDigest(session), before);
      assert.equal(session.psql(`select user_id from public.campaign_plans where id='${CAMPAIGN_ID}';`), "not-a-canonical-uuid");
      assert.equal(session.psql("select data_type from information_schema.columns where table_schema='public' and table_name='campaign_plans' and column_name='user_id';"), "text");
    });
    result("09", "unsupported_conversion_reject", "PASS", { mutationCount: 0 });
  } catch (error) {
    failResult("09", "unsupported_conversion_reject", error);
  }
}

if (!blockedReason) {
  try {
    await isolated(adapter, async (session) => {
      applyMigrations(session, migrationFiles);
      assert.equal(rlsPrivateDigest(session), blankRlsPrivateDigest);
      assert.equal(session.psql("select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='private';"), "0");
      assert.equal(session.psql("select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_current_user_org_member' and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_organization_id uuid';"), "1");

      let beforeSnapshot = structuralSnapshot(session);
      session.psql("alter table public.campaign_plans replica identity full;", {
        label: "Prove relation-metadata oracle sensitivity",
      });
      let afterSnapshot = structuralSnapshot(session);
      assert.notDeepEqual(afterSnapshot, beforeSnapshot);
      assert.notDeepEqual(
        afterSnapshot.find((row) => row[0] === "relation" && row[2] === "campaign_plans"),
        beforeSnapshot.find((row) => row[0] === "relation" && row[2] === "campaign_plans"),
      );

      beforeSnapshot = afterSnapshot;
      session.psql("grant select(id) on public.campaign_plans to authenticated;", {
        label: "Prove column-ACL oracle sensitivity",
      });
      afterSnapshot = structuralSnapshot(session);
      assert.notDeepEqual(afterSnapshot, beforeSnapshot);
      assert.ok(
        afterSnapshot.some(
          (row) => row[0] === "column_acl_grant" && row[2] === "campaign_plans.id",
        ),
        "column ACL grant row was not captured",
      );

      session.psql(
        `create role dfschemaproof_acl_probe nologin;
         grant usage, create on schema private to dfschemaproof_acl_probe;
         set role dfschemaproof_acl_probe;
         create type private.schema_proof_acl_enum as enum ('synthetic');
         reset role;`,
        {
        label: "Create null-ACL type sensitivity probe",
        },
      );
      beforeSnapshot = structuralSnapshot(session);
      const nullTypeAclRows = beforeSnapshot.filter(
        (row) => row[0] === "type_acl_state" && row[2].includes("schema_proof_acl_enum"),
      );
      assert.ok(
        nullTypeAclRows.some(
          (row) => row[2] === "schema_proof_acl_enum" && row[3].startsWith("t|"),
        ),
        `null type ACL state row was not captured: ${JSON.stringify(nullTypeAclRows)}`,
      );
      session.psql("revoke usage on type private.schema_proof_acl_enum from public;", {
        label: "Prove type-ACL oracle sensitivity",
      });
      afterSnapshot = structuralSnapshot(session);
      const explicitTypeAclRows = afterSnapshot.filter(
        (row) => row[0] === "type_acl_state" && row[2].includes("schema_proof_acl_enum"),
      );
      assert.notDeepEqual(afterSnapshot, beforeSnapshot);
      assert.ok(
        explicitTypeAclRows.some(
          (row) => row[2] === "schema_proof_acl_enum" && row[3].startsWith("f|"),
        ),
        `explicit type ACL state row was not captured: ${JSON.stringify(explicitTypeAclRows)}`,
      );
    });
    result("10", "exact_rls_private_digest", "PASS", {
      digestSha256: blankRlsPrivateDigest,
      mutationSensitivity: ["relation_metadata", "column_acl", "type_acl"],
    });
  } catch (error) {
    failResult("10", "exact_rls_private_digest", error, error.migrationFailure ? { migration: error.migrationFailure } : {});
  }
}

if (!blockedReason) {
  try {
    await isolated(adapter, async (session) => {
      applyMigrations(session, preCandidateFiles);
      assert.notEqual(session.psql("select to_regprocedure('public.claim_next_system_job(text,integer)') is null;"), "t");
      assert.equal(session.psql("select to_regprocedure('public.claim_next_system_job_v2(text,integer,integer)') is null;"), "t");
      applyMigrations(session, candidateFiles);
      assert.equal(session.psql("select to_regprocedure('public.claim_next_system_job(text,integer)') is null;"), "t");
      assert.equal(session.psql("select to_regprocedure('public.claim_next_system_job_v2(text,integer,integer)') is not null;"), "t");
      session.psqlMustFail("select * from public.claim_next_system_job_v2('schema-proof-worker',300000,1);", /protocol_unsupported|unsupported/i, { label: "Reject old worker protocol" });
    });
    result("11", "mixed_worker_compatibility", "PASS", { oldWorkerNewSchema: "REJECTED", newWorkerOldSchema: "ABSENT" });
  } catch (error) {
    failResult("11", "mixed_worker_compatibility", error, error.migrationFailure ? { migration: error.migrationFailure } : {});
  }
}

if (!blockedReason) {
  try {
    await isolated(adapter, async (session) => {
      applyMigrations(session, preCandidateFiles);
      session.psqlMustFail(`begin; alter table public.campaign_plans add column schema_proof_injected text; do $$ begin raise exception 'schema-proof-injected-failure'; end $$; commit;`, /schema-proof-injected-failure/i, { label: "Inject transactional migration failure" });
      assert.equal(session.psql("select count(*) from information_schema.columns where table_schema='public' and table_name='campaign_plans' and column_name='schema_proof_injected';"), "0");
      applyMigrations(session, candidateFiles);
      assert.equal(structuralDigest(session), blankFinalDigest);
    });
    result("12", "injected_failure_recovery", "PASS", { partialMutationCount: 0, recovery: "FORWARD_SUCCESS" });
  } catch (error) {
    failResult("12", "injected_failure_recovery", error, error.migrationFailure ? { migration: error.migrationFailure } : {});
  }
}

if (!blockedReason) {
  try {
    const digests = [];
    for (let round = 0; round < 2; round += 1) {
      await isolated(adapter, async (session) => {
        applyMigrations(session, migrationFiles);
        const digest = structuralDigest(session);
        const snapshot = structuralSnapshot(session);
        assert.equal(structuralDigestFromSnapshot(snapshot), digest);
        assert.deepEqual(snapshot, captureCandidatePath ? blankFinalSnapshot : finalGoldenRowset.rows);
        digests.push(digest);
      });
    }
    assert.deepEqual(digests, [blankFinalDigest, blankFinalDigest]);
    result("13", "two_independent_final_databases", "PASS", { rounds: 2, digests });
  } catch (error) {
    failResult("13", "two_independent_final_databases", error, error.migrationFailure ? { migration: error.migrationFailure } : {});
  }
}

for (const [id, name] of GATES.slice(1, -1)) {
  if (!gateResults.some((gate) => gate.id === id)) {
    result(id, name, "BLOCKED_UPSTREAM", { blockedBy: blockedReason });
  }
}

try {
  const leftovers = adapter.listDisposableDatabases();
  assert.deepEqual(leftovers, []);
  const remoteOwnerLifecycle = remoteOwnerCreatedByRun
    ? "CREATED_ONCE_AND_REMOVED_ONCE"
    : "PREEXISTING_ROLE_PRESERVED";
  cleanupRemoteEquivalentOwner(adapter);
  releaseGlobalOwnerLock();
  result("14", "cleanup", "PASS", {
    leftoverDatabaseCount: 0,
    remoteOwnerLifecycle,
    socketOnly: true,
  });
} catch (error) {
  failResult("14", "cleanup", error);
  // Retain the owned lock after a cleanup failure. Manual inspection must
  // resolve any database/role state before another proof can enter.
}

gateResults.sort((left, right) => left.id.localeCompare(right.id));
const summary = {
  schemaVersion: "dealflow.schema-reconciliation-disposable-proof.v1",
  status: firstFailure
    ? "FAIL"
    : captureCandidatePath
      ? "CANDIDATE_NOT_APPROVED"
      : "PASS",
  runtime: process.version,
  postgres: {
    expectedVersion: "17.6",
    transport: "UNIX_SOCKET_ONLY",
  },
  migrationCount: migrationFiles.length,
  gateCount: GATES.length,
  passedGateCount: gateResults.filter((gate) => gate.status === "PASS").length,
  failedGateCount: gateResults.filter((gate) => gate.status === "FAIL").length,
  blockedGateCount: gateResults.filter((gate) => gate.status === "BLOCKED_UPSTREAM").length,
  firstFailure,
  candidateOraclePath: captureCandidatePath,
  gates: gateResults,
  proofDigestSha256: sha256(JSON.stringify(stable(gateResults))),
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (firstFailure) process.exitCode = 1;
else if (captureCandidatePath) process.exitCode = 2;
