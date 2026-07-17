#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDisposablePostgresHarness } from "./lib/disposable-postgres-harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(join(
  ROOT,
  "supabase/migrations/20260717050000_create_privacy_consent_dsar_authority.sql",
), "utf8");
const terminalAuthorityMigration = readFileSync(join(
  ROOT,
  "supabase/migrations/20260717060000_install_owner_decision_authority_grants.sql",
), "utf8");
const image = "postgres:17.6";
const containerName = `dealflow-privacy-${process.pid}-${randomBytes(3).toString("hex")}`;
const db = createDisposablePostgresHarness({ containerName, image, maxBuffer: 16 * 1024 * 1024 });
const password = randomBytes(24).toString("hex");
const migrationOwnerPrelude = db.mode === "native" ? "" : "set role postgres;";
const migrationOwnerReset = db.mode === "native" ? "" : "reset role;";
let cleaned = false;

function docker(args, options = {}) { return db.run(args, options); }
function sanitize(value) {
  return String(value ?? "")
    .replaceAll(password, "[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .trim().slice(-5_000);
}
function requireSuccess(result, label) {
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${sanitize(result.error?.message || result.stderr || result.stdout)}`);
  }
  return String(result.stdout ?? "").trim();
}
function psqlRaw(sql) {
  return docker([
    "exec", "-i", "--env", `PGPASSWORD=${password}`, containerName,
    "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align",
    "--field-separator=|", "--quiet", "--username=postgres", "--dbname=postgres",
  ], { input: sql, timeout: 120_000 });
}
async function psqlAsync(sql) {
  const result = await db.psqlAsync([
    "exec", "-i", "--env", `PGPASSWORD=${password}`, containerName,
    "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align",
    "--field-separator=|", "--quiet", "--username=postgres", "--dbname=postgres",
  ], sql);
  if (!result.error && result.status === 0) return String(result.stdout ?? "").trim();
  throw new Error(sanitize(result.error?.message || result.stderr || result.stdout));
}
const session = {
  psql(sql, label = "PostgreSQL statement failed") { return requireSuccess(psqlRaw(sql), label); },
  mustFail(sql, pattern) {
    const result = psqlRaw(sql);
    if (!result.error && result.status === 0) throw new Error("Rejected SQL unexpectedly succeeded");
    const diagnostic = sanitize(result.stderr || result.stdout || result.error?.message);
    assert.match(diagnostic, pattern);
    return diagnostic;
  },
};
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  docker(["rm", "--force", containerName], { timeout: 30_000 });
}
async function waitForPostgres() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = docker(["exec", containerName, "pg_isready", "--username=postgres", "--dbname=postgres"], { timeout: 5_000 });
    if (ready.status === 0) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("Disposable PostgreSQL 17.6 did not become ready within 30 seconds.");
}

const OWNER_ONE = "11000000-0000-4000-8000-000000000001";
const MEMBER_ONE = "11000000-0000-4000-8000-000000000002";
const OWNER_TWO = "22000000-0000-4000-8000-000000000001";
const ORG_ONE = "a1000000-0000-4000-8000-000000000001";
const ORG_TWO = "a2000000-0000-4000-8000-000000000001";
const OPERATOR = "33000000-0000-4000-8000-000000000001";
const COMMIT = "a".repeat(40);
const TREE = "b".repeat(40);
const CANDIDATE = "c".repeat(64);
const PACKET = "d".repeat(64);
const SIGNATURES = "e".repeat(64);
const POLICY = "f".repeat(64);
const PAYLOAD = "1".repeat(64);
const EVIDENCE = "2".repeat(64);
const COPY = "3".repeat(64);
const OTHER = "4".repeat(64);

function service(sql) {
  return `set role service_role; set request.jwt.claim.role='service_role'; ${sql} reset role; reset request.jwt.claim.role;`;
}
function authenticated(sql, userId = OWNER_ONE) {
  return `set role authenticated; set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${userId}'; ${sql} reset role; reset request.jwt.claim.role; reset request.jwt.claim.sub;`;
}
const authority = `'staging','${COMMIT}','${TREE}','${CANDIDATE}','${PACKET}','${SIGNATURES}','privacy-v1','${POLICY}'`;
function consent({ user = OWNER_ONE, org = ORG_ONE, purpose = "marketing", event = "grant", idempotency = "consent:0000000000000001", copy = COPY, evidence = EVIDENCE, aal = "aal2", issued = "now()" } = {}) {
  return service(`select id::text || '|' || event_type || '|' || sequence::text from public.record_privacy_consent_v1(
    '${org}','${user}','${purpose}','${event}','${idempotency}','${copy}','${evidence}','${aal}',${issued},${authority});`);
}
function subjectRequest({ user = OWNER_ONE, org = ORG_ONE, type = "access", idempotency = "privacy:000000000000001", payload = PAYLOAD, evidence = EVIDENCE, aal = "aal2", issued = "now()" } = {}) {
  return service(`select id::text || '|' || request_type || '|' || state from public.create_privacy_subject_request_v1(
    '${org}','${user}','${type}','${idempotency}','${payload}','${evidence}','${aal}',${issued},${authority});`);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function readSyntheticInventorySnapshot() {
  const identity = session.psql(`select relation_count::text||'|'||inventory_generation_digest
    from private.current_privacy_catalog_identity_v1();`).split("|");
  const classifications = session.psql(`select jsonb_agg(jsonb_build_object(
      'relation_schema',relation_schema,'relation_name',relation_name,
      'authority_class','synthetic_staging_test_only','scope_column',null,
      'disposition','synthetic_test_only','retention_class','synthetic_test_only',
      'executor_task','synthetic_test_only'
    ) order by relation_schema,relation_name)::text from public.privacy_data_inventory;`);
  const classificationDigest = session.psql(`select encode(extensions.digest(convert_to(
      string_agg(concat_ws('|',relation_schema,relation_name,
        'synthetic_staging_test_only','','synthetic_test_only',
        'synthetic_test_only','synthetic_test_only'), E'\\n'
        order by relation_schema,relation_name), 'UTF8'), 'sha256'), 'hex')
    from public.privacy_data_inventory;`);
  return {
    relationCount: Number(identity[0]),
    inventoryGenerationDigest: identity[1],
    classifications,
    classificationDigest,
  };
}

function insertPrivacyGrant(snapshot, { generation = 1, inventoryDigest = snapshot.inventoryGenerationDigest } = {}) {
  return session.psql(`insert into public.privacy_authority_grants(
      environment,authority_mode,generation,candidate_commit,candidate_tree,candidate_digest,
      authority_packet_digest,signature_bundle_digest,policy_version,policy_digest,
      inventory_generation_digest,inventory_relation_count,inventory_classification_digest,
      allowed_purposes,consent_maximum_age_days,dsar_request_expiry_hours,
      export_artifact_expiry_hours,legal_retention_authorized,grant_digest,expires_at
    ) values('staging','synthetic_staging',${generation},'${COMMIT}','${TREE}','${CANDIDATE}',
      '${PACKET}','${SIGNATURES}','privacy-v1','${POLICY}','${inventoryDigest}',
      ${snapshot.relationCount},'${snapshot.classificationDigest}',array['marketing','analytics','necessary'],
      365,72,24,false,repeat('0',64),now()+interval '12 hours') returning id;`);
}

function installPrivacySnapshot(grantId, classifications) {
  return session.psql(`select classified_relation_count::text||'|'||inventory_generation_digest||'|'||inventory_classification_digest
    from public.install_privacy_inventory_classifications_v1('${grantId}',${sqlLiteral(classifications)}::jsonb);`);
}

const prelude = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;
create or replace function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table if not exists auth.users(id uuid primary key);
alter table auth.users add column if not exists email text;
create table public.organizations(id uuid primary key, owner_user_id uuid not null references auth.users(id));
create table public.organization_memberships(organization_id uuid references public.organizations(id), user_id uuid references auth.users(id), primary key(organization_id,user_id));
create table public.account_deletion_retention_configuration(singleton boolean primary key, approved boolean not null default false);
create table public.account_deletion_requests(
  id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id),
  requested_by_user_id uuid references auth.users(id), idempotency_key text not null,
  confirmation_code text not null unique, identity_method text not null,
  identity_email_hash text not null, subject_hash text not null, state text not null,
  requested_at timestamptz not null default now(), scheduled_deletion_at timestamptz,
  legal_hold_active boolean not null default false, completed_at timestamptz,
  updated_at timestamptz not null default now(), unique(organization_id,requested_by_user_id,idempotency_key)
);
create table public.account_deletion_data_inventory(
  resource_kind text, relation_schema text, relation_name text,
  scope_column text, disposition text, retention_class text,
  executor_task text, pii_columns text[] default '{}'::text[]
);
create table public.account_deletion_operator_authorities(
  user_id uuid primary key, active boolean, can_manage_legal_holds boolean
);
create table public.app_schema_metadata(key text primary key, value text not null, updated_at timestamptz not null default now());
create table public.onboarding_submission_receipts(id uuid primary key, organization_id uuid, email_digest text);
create table public.ghl_marketplace_encrypted_credentials(id uuid primary key, organization_id uuid, encrypted_token text);
create table public.ghl_marketplace_runtime_events(id uuid primary key, organization_id uuid, payload_digest text);
create table public.platform_operator_grants(id uuid primary key, user_id uuid);
create table public.platform_operator_access_receipts(id uuid primary key, actor_subject_digest text);
create table private.generated_static_storage_upload_permits(id uuid primary key, organization_id uuid);
create table private.generated_static_storage_bindings(id uuid primary key, organization_id uuid, storage_path text);
insert into auth.users(id) values ('${OWNER_ONE}'),('${MEMBER_ONE}'),('${OWNER_TWO}'),('${OPERATOR}');
insert into public.organizations(id,owner_user_id) values ('${ORG_ONE}','${OWNER_ONE}'),('${ORG_TWO}','${OWNER_TWO}');
insert into public.organization_memberships values ('${ORG_ONE}','${MEMBER_ONE}');
insert into public.account_deletion_retention_configuration values (true,false);
insert into public.account_deletion_operator_authorities values ('${OPERATOR}',true,true);
insert into public.account_deletion_data_inventory values
  ('table','public','onboarding_submission_receipts','organization_id','delete','operational','delete_operational_data',array['email_digest']),
  ('table','public','ghl_marketplace_encrypted_credentials','organization_id','provider_detach','operational','delete_operational_data',array['encrypted_token']);
create function public.create_account_deletion_request_v1(
  p_organization_id uuid,p_actor_user_id uuid,p_idempotency_key text,p_identity_method text,p_identity_email_hash text
) returns setof public.account_deletion_requests language plpgsql security definer set search_path='' as $$
declare created public.account_deletion_requests%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'account_deletion_service_role_required' using errcode='42501'; end if;
  if not exists(select 1 from public.organizations where id=p_organization_id and owner_user_id=p_actor_user_id) then raise exception 'account_deletion_owner_required' using errcode='42501'; end if;
  if not (select approved from public.account_deletion_retention_configuration where singleton) then raise exception 'account_deletion_retention_authority_pending' using errcode='55000'; end if;
  select * into created from public.account_deletion_requests where organization_id=p_organization_id and requested_by_user_id=p_actor_user_id and idempotency_key=p_idempotency_key;
  if found then return next created; return; end if;
  insert into public.account_deletion_requests(organization_id,requested_by_user_id,idempotency_key,confirmation_code,identity_method,identity_email_hash,subject_hash,state,scheduled_deletion_at)
  values(p_organization_id,p_actor_user_id,p_idempotency_key,encode(extensions.gen_random_bytes(16),'hex'),p_identity_method,p_identity_email_hash,'sha256:'||encode(extensions.digest(p_organization_id::text||':'||p_actor_user_id::text,'sha256'),'hex'),'suspending',now()+interval '7 days') returning * into created;
  return next created;
end $$;
create function public.claim_account_deletion_tasks_v1(text,integer,integer)
returns table(id uuid,request_id uuid,organization_id uuid,requested_by_user_id uuid,task_kind text,attempt_count integer,max_attempts integer,claim_token uuid,claim_generation bigint,reconciliation_required boolean)
language plpgsql security definer set search_path='' as $$ begin if auth.role() is distinct from 'service_role' then raise exception 'account_deletion_service_role_required' using errcode='42501'; end if; return; end $$;
create function public.manage_account_deletion_legal_hold_v1(p_request_id uuid,p_action text,p_reason text,p_authority text,p_actor uuid)
returns public.account_deletion_requests language plpgsql security definer set search_path='' as $$ declare result public.account_deletion_requests%rowtype; begin
  if auth.role() is distinct from 'service_role' or not exists(select 1 from public.account_deletion_operator_authorities where user_id=p_actor and active and can_manage_legal_holds) then raise exception 'account_deletion_legal_hold_authority_required' using errcode='42501'; end if;
  update public.account_deletion_requests set legal_hold_active=(p_action='set') where id=p_request_id returning * into result; return result;
end $$;
grant execute on function public.create_account_deletion_request_v1(uuid,uuid,text,text,text) to service_role;
grant execute on function public.claim_account_deletion_tasks_v1(text,integer,integer) to service_role;
grant execute on function public.manage_account_deletion_legal_hold_v1(uuid,text,text,text,uuid) to service_role;
`;

try {
  requireSuccess(docker(["image", "inspect", image]), "Cached PostgreSQL 17.6 image unavailable");
  requireSuccess(docker([
    "run", "--detach", "--rm", "--pull=never", "--network=none", "--name", containerName,
    "--env", `POSTGRES_PASSWORD=${password}`, image,
  ], { timeout: 30_000 }), "Disposable PostgreSQL failed to start");
  await waitForPostgres();
  assert.match(session.psql("show server_version;"), /^17\.6\b/);
  session.psql(
    `${prelude}\nbegin; ${migrationOwnerPrelude} ${migration}\n${terminalAuthorityMigration} ${migrationOwnerReset} commit;`,
    "Apply privacy and terminal authority migrations",
  );
  assert.equal(session.psql("select value from public.app_schema_metadata where key='schema_version';"), "20260717060000");
  assert.equal(session.psql("select count(*) from public.privacy_data_inventory where authority_class<>'unresolved_owner_privacy_authority' or executor_task is not null or authority_grant_id is not null;"), "0");
  assert.equal(session.psql("select count(*) from public.privacy_data_inventory where relation_name in('owner_decision_authority_grants','owner_decision_authority_revocations') and authority_class='unresolved_owner_privacy_authority';"), "2");

  const inventorySnapshot = readSyntheticInventorySnapshot();
  assert(inventorySnapshot.relationCount > 0);
  const privacyGrantId = insertPrivacyGrant(inventorySnapshot);
  session.mustFail(authenticated("insert into public.privacy_consent_events default values;"), /permission denied/i);
  session.mustFail(service("select count(*) from public.privacy_authority_grants;"), /permission denied/i);
  session.mustFail(authenticated(`select * from public.record_privacy_consent_v1('${ORG_ONE}','${OWNER_ONE}','marketing','grant','consent:0000000000000001','${COPY}','${EVIDENCE}','aal2',now(),${authority});`), /permission denied/i);
  session.mustFail(subjectRequest({ idempotency: "privacy:beforeinventory01" }), /privacy_inventory_classification_incomplete/i);
  assert.match(session.psql(consent({ purpose: "necessary", event: "deny", idempotency: "consent:beforeinventory1" })), /\|deny\|1$/);
  session.mustFail(service(`select * from public.install_privacy_inventory_classifications_v1('${privacyGrantId}','[]'::jsonb);`), /permission denied/i);
  const missingExecutorSnapshot = JSON.stringify(JSON.parse(inventorySnapshot.classifications).map((entry, index) =>
    index === 0 ? { ...entry, executor_task: null } : entry));
  session.mustFail(
    `select * from public.install_privacy_inventory_classifications_v1('${privacyGrantId}',${sqlLiteral(missingExecutorSnapshot)}::jsonb);`,
    /privacy_inventory_synthetic_classification_invalid/i,
  );
  assert.equal(
    installPrivacySnapshot(privacyGrantId, inventorySnapshot.classifications),
    `${inventorySnapshot.relationCount}|${inventorySnapshot.inventoryGenerationDigest}|${inventorySnapshot.classificationDigest}`,
  );
  assert.equal(session.psql("select count(*) from public.privacy_data_inventory where relation_name in('owner_decision_authority_grants','owner_decision_authority_revocations');"), "2");

  const firstGrant = session.psql(consent());
  assert.match(firstGrant, /^[0-9a-f-]{36}\|grant\|1$/);
  assert.equal(session.psql(consent()), firstGrant);
  session.mustFail(consent({ purpose: "analytics" }), /privacy_consent_idempotency_collision/i);
  session.mustFail(consent({ purpose: "unapproved", idempotency: "consent:0000000000000002" }), /privacy_consent_input_invalid/i);
  session.mustFail(consent({ aal: "aal1", idempotency: "consent:0000000000000003" }), /privacy_recent_aal2_required/i);
  session.mustFail(consent({ issued: "now()-interval '11 minutes'", idempotency: "consent:0000000000000004" }), /privacy_recent_aal2_required/i);
  session.mustFail(consent({ user: OWNER_TWO, org: ORG_ONE, idempotency: "consent:0000000000000005" }), /privacy_tenant_membership_required/i);
  const withdrawal = session.psql(consent({ event: "withdraw", idempotency: "consent:0000000000000006" }));
  assert.match(withdrawal, /\|withdraw\|2$/);
  assert.equal(session.psql(`select state from public.privacy_consent_current where organization_id='${ORG_ONE}' and user_id='${OWNER_ONE}' and purpose_key='marketing';`), "withdrawn");
  session.mustFail(consent({ event: "withdraw", idempotency: "consent:0000000000000007" }), /withdraw_without_active_grant/i);
  session.mustFail(service(`update public.privacy_consent_events set evidence_digest='${OTHER}';`), /permission denied/i);
  await Promise.all([
    psqlAsync(consent({ purpose: "analytics", idempotency: "consent:concurrent000001" })),
    psqlAsync(consent({ purpose: "analytics", idempotency: "consent:concurrent000002" })),
  ]);
  assert.equal(session.psql(`select string_agg(sequence::text,',' order by sequence) from public.privacy_consent_events where organization_id='${ORG_ONE}' and user_id='${OWNER_ONE}' and purpose_key='analytics';`), "1,2");
  assert.equal(session.psql(`select sequence from public.privacy_consent_current where organization_id='${ORG_ONE}' and user_id='${OWNER_ONE}' and purpose_key='analytics';`), "2");

  const access = session.psql(subjectRequest());
  assert.match(access, /^[0-9a-f-]{36}\|access\|accepted$/);
  assert.equal(session.psql(subjectRequest()), access);
  session.mustFail(subjectRequest({ type: "correction" }), /privacy_request_idempotency_collision/i);
  session.mustFail(subjectRequest({ user: MEMBER_ONE }), /privacy_owner_authority_required/i);
  session.mustFail(subjectRequest({ org: ORG_TWO }), /privacy_owner_authority_required/i);
  const accessId = access.split("|")[0];
  session.mustFail(service(`select * from public.transition_privacy_subject_request_v1('${accessId}','${OWNER_ONE}','completed','request_completed','transition:00000000000001','${EVIDENCE}','${PAYLOAD}','aal2',now(),${authority});`), /privacy_request_transition_not_allowed/i);
  assert.match(session.psql(service(`select id::text||'|'||state from public.transition_privacy_subject_request_v1('${accessId}','${OWNER_ONE}','in_progress','request_started','transition:00000000000002','${EVIDENCE}','${PAYLOAD}','aal2',now(),${authority});`)), /\|in_progress$/);
  assert.match(session.psql(service(`select id::text||'|'||state from public.transition_privacy_subject_request_v1('${accessId}','${OWNER_ONE}','completed','request_completed','transition:00000000000003','${EVIDENCE}','${PAYLOAD}','aal2',now(),${authority});`)), /\|completed$/);

  const exportRequest = session.psql(subjectRequest({ type: "export", idempotency: "privacy:000000000000002" }));
  const exportId = exportRequest.split("|")[0];
  const entries = JSON.stringify([
    { relationSchema: "public", relationName: "organizations", rowCount: 1, contentDigest: "5".repeat(64) },
    { relationSchema: "public", relationName: "privacy_consent_events", rowCount: 2, contentDigest: "6".repeat(64) },
  ]).replaceAll("'", "''");
  const registerExport = (archive = "7".repeat(64)) => service(`select request_id::text||'|'||manifest_digest from public.register_privacy_export_artifact_v1(
    '${exportId}','${OWNER_ONE}','${entries}'::jsonb,'${"8".repeat(64)}','${archive}',1234,
    'export:0000000000000001','${EVIDENCE}','aal2',now(),${authority});`);
  const artifact = session.psql(registerExport());
  assert.match(artifact, new RegExp(`^${exportId}\\|[0-9a-f]{64}$`));
  assert.equal(session.psql(registerExport()), artifact);
  session.mustFail(registerExport("9".repeat(64)), /privacy_export_artifact_collision/i);
  session.mustFail(service("select count(*) from private.privacy_export_artifacts;"), /permission denied/i);

  const deleteCall = service(`select privacy_request_id::text||'|'||deletion_state from public.create_privacy_delete_request_v1(
    '${ORG_ONE}','${OWNER_ONE}','delete:000000000000001','sha256:${"a".repeat(64)}','${PAYLOAD}','${EVIDENCE}','aal2',now(),${authority});`);
  session.mustFail(deleteCall, /account_deletion_retention_authority_pending/i);
  session.psql("update public.account_deletion_retention_configuration set approved=true where singleton;");
  const deletion = session.psql(deleteCall);
  assert.match(deletion, /^[0-9a-f-]{36}\|suspending$/);
  assert.equal(session.psql(deleteCall), deletion);
  const deletionRequestId = session.psql("select account_deletion_request_id from public.privacy_subject_requests where request_type='delete';");
  session.mustFail(service(`select * from public.create_account_deletion_request_v1('${ORG_TWO}','${OWNER_TWO}','direct:00000000000001','aal2','sha256:${"b".repeat(64)}');`), /permission denied/i);
  session.mustFail(service(`select * from public.claim_account_deletion_tasks_v2('worker-1',1,60,${authority});`), /privacy_legal_retention_authority_pending/i);
  session.mustFail(service(`select * from public.manage_account_deletion_legal_hold_v2('${deletionRequestId}','set','legal_review','sha256:${"c".repeat(64)}','${OPERATOR}','aal2',now(),${authority});`), /privacy_legal_retention_authority_pending/i);

  const inventoryCount = Number(session.psql("select count(*) from public.privacy_data_inventory;"));
  const catalogCount = Number(session.psql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private') and c.relkind in('r','p');"));
  assert.equal(inventoryCount, catalogCount);
  assert.equal(session.psql("select count(*) from public.privacy_data_inventory where relation_name in('onboarding_submission_receipts','ghl_marketplace_encrypted_credentials','ghl_marketplace_runtime_events','platform_operator_grants','platform_operator_access_receipts','generated_static_storage_upload_permits','generated_static_storage_bindings','owner_decision_authority_grants','owner_decision_authority_revocations');"), "9");
  assert.equal(session.psql("select count(*) from public.privacy_data_inventory where authority_class='unresolved_owner_privacy_authority' or executor_task is null or authority_grant_id is null;"), "0");
  session.mustFail("update public.privacy_data_inventory set executor_task=null where relation_name='organizations';", /privacy_inventory_owner_rpc_required/i);

  session.psql("create table public.privacy_inventory_added_relation(id uuid primary key, organization_id uuid);");
  session.mustFail(subjectRequest({ idempotency: "privacy:addedrelation001" }), /privacy_inventory_generation_mismatch/i);
  session.psql("drop table public.privacy_inventory_added_relation;");

  session.psql("select * from public.refresh_privacy_data_inventory_v1();");
  session.mustFail(subjectRequest({ idempotency: "privacy:unresolvedrows01" }), /privacy_inventory_classification_incomplete/i);
  installPrivacySnapshot(privacyGrantId, inventorySnapshot.classifications);
  session.psql(`begin; select set_config('dealflow.privacy_inventory_write','on',true);
    update public.privacy_data_inventory set classification_snapshot_digest='${OTHER}'
    where (relation_schema,relation_name)=(select relation_schema,relation_name from public.privacy_data_inventory order by relation_schema,relation_name limit 1); commit;`);
  session.mustFail(subjectRequest({ idempotency: "privacy:digestmismatch01" }), /privacy_inventory_classification_incomplete/i);
  installPrivacySnapshot(privacyGrantId, inventorySnapshot.classifications);

  session.psql("update public.privacy_authority_grants set status='revoked',revoked_at=now(),revocation_reason_code='inventory_test_rotate' where environment='staging' and status='active';");
  insertPrivacyGrant(inventorySnapshot, { generation: 2, inventoryDigest: OTHER });
  session.mustFail(subjectRequest({ idempotency: "privacy:staledigest0001" }), /privacy_inventory_generation_mismatch/i);
  session.psql("update public.privacy_authority_grants set status='revoked',revoked_at=now(),revocation_reason_code='stale_digest_rejected' where environment='staging' and status='active';");
  const finalGrantId = insertPrivacyGrant(inventorySnapshot, { generation: 3 });
  installPrivacySnapshot(finalGrantId, inventorySnapshot.classifications);
  assert.match(session.psql(subjectRequest({ idempotency: "privacy:exactterminal001" })), /\|access\|accepted$/);
  session.psql("update public.privacy_authority_grants set status='revoked',revoked_at=now(),revocation_reason_code='owner_revoked' where environment='staging' and status='active';");
  session.mustFail(consent({ event: "grant", idempotency: "consent:0000000000000008" }), /privacy_authority_grant_not_found/i);
  assert.equal(session.psql("select count(*) from public.privacy_subject_request_receipts where receipt_digest !~ '^[0-9a-f]{64}$' or metadata_digest !~ '^[0-9a-f]{64}$';"), "0");

  console.log("privacy consent/DSAR disposable PostgreSQL 17.6 proof passed: terminal catalog coverage, exact signed classification/executor snapshot, stale/additional/unresolved/missing-executor fail-closed gates, consent independence, tenant fences, replay/collision, DSAR/export/delete lifecycle, and legal-hold negatives.");
} finally {
  cleanup();
}
