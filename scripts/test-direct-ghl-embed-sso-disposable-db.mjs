#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDisposablePostgresHarness } from "./lib/disposable-postgres-harness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(join(root,
  "supabase/migrations/20260722030000_support_direct_ghl_embed_sso.sql"), "utf8");
const image = "postgres:17.6";
const containerName = `dealflow-direct-ghl-embed-${process.pid}-${randomBytes(3).toString("hex")}`;
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
  return docker(["exec", "-i", "--env", `PGPASSWORD=${password}`, containerName,
    "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align",
    "--quiet", "--username=postgres", "--dbname=postgres"],
  { input: sql, timeout: 120_000 });
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

const ORGANIZATION = "20000000-0000-4000-8000-000000000101";
const USER = "30000000-0000-4000-8000-000000000101";
const OPERATOR = "30000000-0000-4000-8000-000000000102";
const MAPPING = "40000000-0000-4000-8000-000000000101";
const DIGEST = "b".repeat(64);

try {
  success(docker(["image", "inspect", image]), "PostgreSQL image unavailable");
  success(docker(["run", "--detach", "--rm", "--pull=never", "--network=none", "--name", containerName,
    "--env", `POSTGRES_PASSWORD=${password}`, image], { timeout: 30_000 }), "PostgreSQL start");
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
    create table if not exists auth.users(
      id uuid primary key, email text, email_confirmed_at timestamptz,
      banned_until timestamptz, deleted_at timestamptz, is_anonymous boolean default false
    );
    create table public.partners(id uuid primary key);
    create table public.users(id uuid primary key,email text not null unique,partner_id uuid null);
    create table public.organizations(id uuid primary key);
    create table public.organization_memberships(
      id uuid primary key default gen_random_uuid(),organization_id uuid not null,user_id uuid not null,
      role text not null default 'member',unique(organization_id,user_id)
    );
    create table public.ghl_workspace_tenants(
      organization_id uuid primary key,tenant_kind text not null,partner_id uuid null,status text not null
    );
    create table public.ghl_location_mappings(
      id uuid primary key,organization_id uuid not null,partner_id uuid null,
      provider_location_id text not null,status text not null
    );
    create table public.workspace_ghl_users(
      id uuid primary key default gen_random_uuid(),workspace_id uuid not null,ghl_location_id text not null,
      ghl_user_id text,email text not null,invite_status text not null default 'pending',
      metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),partner_id uuid not null,dealflow_user_id uuid null
    );
    create table public.platform_operator_grants(id uuid primary key default gen_random_uuid(),user_id uuid not null);
    create table public.account_deletion_suspensions(organization_id uuid,requested_by_user_id uuid);
    create table public.ghl_embed_auth_exchanges(
      id uuid primary key default gen_random_uuid(),payload_digest text not null unique,
      partner_id uuid not null,organization_id uuid not null,provider_location_id text not null,
      provider_user_id text not null,dealflow_user_id uuid not null,state text not null default 'pending',
      created_at timestamptz not null default now(),expires_at timestamptz not null,
      consumed_at timestamptz null
    );
    insert into public.organizations values('${ORGANIZATION}');
    insert into public.users values
      ('${USER}','direct@example.com',null),
      ('${OPERATOR}','operator@example.com',null);
    insert into auth.users(id,email,email_confirmed_at) values
      ('${USER}','direct@example.com',timezone('utc',now())),
      ('${OPERATOR}','operator@example.com',timezone('utc',now()));
    insert into public.organization_memberships(organization_id,user_id,role) values
      ('${ORGANIZATION}','${USER}','owner'),
      ('${ORGANIZATION}','${OPERATOR}','member');
    insert into public.platform_operator_grants(user_id) values('${OPERATOR}');
    insert into public.ghl_workspace_tenants values('${ORGANIZATION}','direct_realtor',null,'active');
    insert into public.ghl_location_mappings values('${MAPPING}','${ORGANIZATION}',null,'location_direct_101','active');
    ${migration}
  `, "apply direct GHL embed SSO migration");

  assert.equal(psql(`select attnotnull::text from pg_attribute
    where attrelid='public.workspace_ghl_users'::regclass and attname='partner_id';`), "false");
  assert.equal(psql(`select attnotnull::text from pg_attribute
    where attrelid='public.ghl_embed_auth_exchanges'::regclass and attname='partner_id';`), "false");
  assert.equal(psql(service(`select public.bind_direct_workspace_ghl_user_v1(
    '${ORGANIZATION}','location_direct_101','ghl_user_direct_101','direct@example.com');`)), USER);
  assert.equal(psql(`select invite_status||'|'||(partner_id is null)::text||'|'||dealflow_user_id
    from public.workspace_ghl_users where workspace_id='${ORGANIZATION}';`), `active|true|${USER}`);
  assert.equal(psql(service(`select public.bind_direct_workspace_ghl_user_v1(
    '${ORGANIZATION}','location_direct_101','ghl_user_direct_101','direct@example.com');`)), USER,
  "direct signed binding replay must be idempotent");
  mustFail(service(`select public.bind_direct_workspace_ghl_user_v1(
    '${ORGANIZATION}','location_direct_101','ghl_operator_101','operator@example.com');`),
  /candidate_ambiguous_or_missing/i);
  const receipt = psql(service(`select public.begin_ghl_embed_auth_exchange_v1(
    '${DIGEST}',null,'${ORGANIZATION}','location_direct_101','ghl_user_direct_101','${USER}');`));
  assert.match(receipt, /^[0-9a-f-]{36}$/);
  mustFail(`set role authenticated; set request.jwt.claim.role='authenticated';
    select public.bind_direct_workspace_ghl_user_v1('${ORGANIZATION}','location_direct_101',
      'ghl_user_direct_101','direct@example.com'); reset role;`, /permission denied|service_role_required/i);
  mustFail(service(`select public.begin_ghl_embed_auth_exchange_v1(
    '${"c".repeat(64)}',null,'${ORGANIZATION}','location_direct_101','ghl_user_direct_101','${OPERATOR}');`),
  /binding_invalid/i);

  console.log("Direct realtor GHL embed DB authority: PASS (nullable partner, exact signed user binding, service-only receipt, operator denial)");
} finally {
  cleanup();
}
