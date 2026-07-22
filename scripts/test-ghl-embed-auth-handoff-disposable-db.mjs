#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDisposablePostgresHarness } from "./lib/disposable-postgres-harness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(join(
  root,
  "supabase/migrations/20260720010000_add_ghl_embed_sso_authority.sql",
), "utf8");
const operatorProbeMigration = readFileSync(join(
  root,
  "supabase/migrations/20260722040000_add_service_only_operator_grant_probe.sql",
), "utf8");
const image = "postgres:17.6";
const containerName = `dealflow-ghl-embed-sso-${process.pid}-${randomBytes(3).toString("hex")}`;
const harness = createDisposablePostgresHarness({ containerName, image });
const password = randomBytes(24).toString("hex");
let cleaned = false;

function docker(args, options = {}) { return harness.run(args, options); }
function sanitize(value) {
  return String(value ?? "").replaceAll(password, "[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]").trim().slice(-4_000);
}
function success(result, label) {
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${sanitize(result.error?.message || result.stderr || result.stdout)}`);
  }
  return String(result.stdout ?? "").trim();
}
function raw(sql) {
  return docker([
    "exec", "-i", "--env", `PGPASSWORD=${password}`, containerName,
    "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align",
    "--quiet", "--username=postgres", "--dbname=postgres",
  ], { input: sql, timeout: 120_000 });
}
function psql(sql, label = "SQL") { return success(raw(sql), label); }
function mustFail(sql, pattern) {
  const result = raw(sql);
  if (!result.error && result.status === 0) throw new Error("SQL unexpectedly succeeded");
  assert.match(sanitize(result.stderr || result.stdout || result.error?.message), pattern);
}
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  docker(["rm", "--force", containerName], { timeout: 30_000 });
}
async function ready() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (docker(["exec", containerName, "pg_isready", "--username=postgres", "--dbname=postgres"],
      { timeout: 5_000 }).status === 0) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("PostgreSQL readiness timeout");
}
function service(sql) {
  return `set role service_role; set request.jwt.claim.role='service_role'; ${sql} reset role;`;
}

const PARTNER = "10000000-0000-4000-8000-000000000001";
const ORGANIZATION = "20000000-0000-4000-8000-000000000001";
const USER = "30000000-0000-4000-8000-000000000001";
const OTHER_USER = "30000000-0000-4000-8000-000000000002";
const DIGEST = "a".repeat(64);

try {
  success(docker(["image", "inspect", image]), "PostgreSQL image unavailable");
  success(docker([
    "run", "--detach", "--rm", "--pull=never", "--network=none", "--name", containerName,
    "--env", `POSTGRES_PASSWORD=${password}`, image,
  ], { timeout: 30_000 }), "PostgreSQL start");
  await ready();
  psql(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
    end $$;
    create schema if not exists auth;
    create or replace function auth.role() returns text language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
    create table if not exists auth.users(id uuid primary key);
    alter table auth.users
      add column if not exists email text,
      add column if not exists email_confirmed_at timestamptz,
      add column if not exists banned_until timestamptz,
      add column if not exists deleted_at timestamptz,
      add column if not exists is_anonymous boolean default false;
    create table public.app_schema_metadata(key text primary key,value text not null,updated_at timestamptz not null default now());
    create table public.partners(id uuid primary key);
    create table public.users(id uuid primary key,email text not null unique,partner_id uuid null);
    create table public.organizations(id uuid primary key);
    create table public.organization_memberships(
      id uuid primary key default gen_random_uuid(), organization_id uuid not null,
      user_id uuid not null, role text not null default 'member',
      unique(organization_id,user_id)
    );
    create table public.workspace_ghl_users(
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
      ghl_location_id text not null, ghl_user_id text, email text not null,
      invite_status text not null default 'pending', metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      partner_id uuid not null
    );
    create table public.platform_operator_grants(id uuid primary key default gen_random_uuid(),user_id uuid not null);
    revoke all on table public.platform_operator_grants from public, anon, authenticated, service_role;
    create table public.account_deletion_suspensions(organization_id uuid,requested_by_user_id uuid);
    insert into public.partners values('${PARTNER}');
    insert into public.organizations values('${ORGANIZATION}');
    insert into public.users values
      ('${USER}','realtor@example.com','${PARTNER}'),
      ('${OTHER_USER}','operator@example.com','${PARTNER}');
    insert into auth.users(id,email,email_confirmed_at) values
      ('${USER}','realtor@example.com',timezone('utc',now())),
      ('${OTHER_USER}','operator@example.com',timezone('utc',now()));
    insert into public.organization_memberships(organization_id,user_id)
      values('${ORGANIZATION}','${USER}'),('${ORGANIZATION}','${OTHER_USER}');
    insert into public.platform_operator_grants(user_id) values('${OTHER_USER}');
    insert into public.workspace_ghl_users(
      workspace_id,ghl_location_id,ghl_user_id,email,invite_status,partner_id
    ) values
      ('${ORGANIZATION}','location_001','ghl_user_001','realtor@example.com','active','${PARTNER}'),
      ('${ORGANIZATION}','location_missing','ghl_user_missing','missing@example.com','active','${PARTNER}'),
      ('${ORGANIZATION}','location_operator','ghl_user_operator','operator@example.com','active','${PARTNER}');
    ${migration}
    ${operatorProbeMigration}
  `, "apply GHL embed SSO migration");
  assert.equal(psql("select value from public.app_schema_metadata where key='schema_version';"), "20260720010000");
  assert.equal(psql(`select count(*) from information_schema.columns where table_schema='public'
    and table_name='ghl_embed_auth_exchanges' and column_name ~ '(email|raw|encrypted|payload_body)';`), "0");
  assert.equal(psql(`select relrowsecurity::text||'|'||relforcerowsecurity::text
    from pg_class where oid='public.ghl_embed_auth_exchanges'::regclass;`), "true|true");

  assert.equal(psql(`select dealflow_user_id from public.workspace_ghl_users
    where ghl_location_id='location_001';`), USER, "migration must backfill an exact safe identity");
  assert.equal(psql(`select count(*) from public.workspace_ghl_users
    where ghl_location_id in ('location_missing','location_operator') and dealflow_user_id is null;`), "2",
  "missing and denied users must survive migration unbound");
  assert.equal(psql(service(`select public.bind_workspace_ghl_dealflow_user_v1(
    '${ORGANIZATION}','${PARTNER}','location_001','ghl_user_001','realtor@example.com');`)), USER);
  assert.equal(psql(`select dealflow_user_id from public.workspace_ghl_users
    where ghl_location_id='location_001';`), USER);
  assert.equal(psql(service(`select public.bind_workspace_ghl_dealflow_user_v1(
    '${ORGANIZATION}','${PARTNER}','location_001','ghl_user_001','realtor@example.com');`)), USER,
  "exact binding replay must be idempotent");
  mustFail(`set role authenticated; set request.jwt.claim.role='authenticated';
    select public.bind_workspace_ghl_dealflow_user_v1('${ORGANIZATION}','${PARTNER}',
      'location_001','ghl_user_001','realtor@example.com'); reset role;`,
  /permission denied|service_role_required/i);
  mustFail(service(`select public.bind_workspace_ghl_dealflow_user_v1(
    '${ORGANIZATION}','${PARTNER}','location_operator','ghl_user_operator','operator@example.com');`),
  /candidate_ambiguous_or_missing/i);
  assert.equal(psql(`select count(*) from public.workspace_ghl_users
    where ghl_location_id='location_operator' and dealflow_user_id is null;`), "1");
  mustFail(service("select count(*) from public.platform_operator_grants;"), /permission denied/i);
  assert.equal(psql(service(`select public.has_platform_operator_grant_v1('${USER}');`)), "f");
  assert.equal(psql(service(`select public.has_platform_operator_grant_v1('${OTHER_USER}');`)), "t");
  mustFail(`set role authenticated; set request.jwt.claim.role='authenticated';
    select public.has_platform_operator_grant_v1('${USER}'); reset role;`,
  /permission denied|service_role_required/i);
  mustFail(`insert into public.workspace_ghl_users(
    workspace_id,ghl_location_id,ghl_user_id,email,invite_status,partner_id,dealflow_user_id
  ) values('${ORGANIZATION}','location_002','ghl_user_002','realtor@example.com','active','${PARTNER}','${USER}');`,
  /workspace_ghl_users_dealflow_identity_unique|duplicate key/i);
  mustFail(service("select count(*) from public.ghl_embed_auth_exchanges;"), /permission denied/i);
  mustFail(`set role authenticated; set request.jwt.claim.role='authenticated';
    select public.begin_ghl_embed_auth_exchange_v1('${DIGEST}','${PARTNER}','${ORGANIZATION}',
      'location_001','ghl_user_001','${USER}'); reset role;`, /permission denied|service_role_required/i);
  mustFail(service(`select public.begin_ghl_embed_auth_exchange_v1('${DIGEST}','${PARTNER}',
    '${ORGANIZATION}','location_001','ghl_user_001','${OTHER_USER}');`), /binding_invalid/i);

  const receipt = psql(service(`select public.begin_ghl_embed_auth_exchange_v1('${DIGEST}',
    '${PARTNER}','${ORGANIZATION}','location_001','ghl_user_001','${USER}');`));
  assert.match(receipt, /^[0-9a-f-]{36}$/);
  mustFail(service(`select public.begin_ghl_embed_auth_exchange_v1('${DIGEST}',
    '${PARTNER}','${ORGANIZATION}','location_001','ghl_user_001','${USER}');`), /already_seen/i);
  assert.equal(psql(service(`select public.consume_ghl_embed_auth_exchange_v1('${receipt}',
    '${DIGEST}','${USER}');`)), "t");
  assert.equal(psql(service(`select public.consume_ghl_embed_auth_exchange_v1('${receipt}',
    '${DIGEST}','${USER}');`)), "f");
  mustFail(service(`select public.begin_ghl_embed_auth_exchange_v1('${DIGEST}',
    '${PARTNER}','${ORGANIZATION}','location_001','ghl_user_001','${USER}');`), /already_seen/i);
  psql(`update public.ghl_embed_auth_exchanges
    set created_at=timezone('utc',now())-interval '25 hours',
        expires_at=timezone('utc',now())-interval '24 hours 58 minutes'
    where id='${receipt}';`);
  const afterRetention = psql(service(`select public.begin_ghl_embed_auth_exchange_v1('${DIGEST}',
    '${PARTNER}','${ORGANIZATION}','location_001','ghl_user_001','${USER}');`));
  assert.notEqual(afterRetention, receipt);

  console.log("GHL embed SSO DB authority: PASS (explicit binding, service-only receipts, exact ciphertext replay denial and bounded retention)");
} finally {
  cleanup();
}
