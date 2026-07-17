#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDisposablePostgresHarness } from "./lib/disposable-postgres-harness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(join(root,
  "supabase/migrations/20260717060000_install_owner_decision_authority_grants.sql"), "utf8");
const image = "postgres:17.6";
const containerName = `dealflow-owner-authority-${process.pid}-${randomBytes(3).toString("hex")}`;
const harness = createDisposablePostgresHarness({ containerName, image });
const password = randomBytes(24).toString("hex");
let cleaned = false;

function docker(args, options = {}) { return harness.run(args, options); }
function sanitize(value) {
  return String(value ?? "").replaceAll(password, "[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]").trim().slice(-4_000);
}
function success(result, label) {
  if (result.error || result.status !== 0) throw new Error(`${label}: ${sanitize(
    result.error?.message || result.stderr || result.stdout)}`);
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
    if (docker(["exec", containerName, "pg_isready", "--username=postgres",
      "--dbname=postgres"], { timeout: 5_000 }).status === 0) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("PostgreSQL readiness timeout");
}

const COMMIT = "1".repeat(40);
const TREE = "2".repeat(40);
const CANDIDATE = "3".repeat(64);
const HOST = "4".repeat(64);
const LOCK = "5".repeat(64);
const MIGRATIONS = "6".repeat(64);
const ENVELOPE = "7".repeat(64);
const PAYLOAD = "8".repeat(64);
const KEY = "9".repeat(64);
const TEMPLATE = "a".repeat(64);
const INVENTORY = "12d0d5780a28dd93696f17ed1e7177ed85460428c4c3b02e180cf68db9073b8d";
const REQUIREMENTS = "8c6bf382bb5f7d0233ecb7edbf591167dad3c18f5f14206735d38f830f3c9bc4";
const CAPABILITY = "vercel_analytics";
const SIGNATURE = `ed25519:owner-authority:owner-key:${PAYLOAD}`;

function insertGrant({
  generation = 1,
  environment = "production",
  mode = "externally_signed",
  capability = CAPABILITY,
  host = HOST,
  signature = SIGNATURE,
  envelope = ENVELOPE,
  expires = "clock_timestamp() + interval '1 hour'",
} = {}) {
  return `insert into public.owner_decision_authority_grants (
    environment,authority_mode,capability,decision_ids,selected_values,
    selected_values_sha256,policy,policy_sha256,envelope_id,envelope_sha256,
    payload_sha256,signature_reference,authority_id,key_id,public_key_sha256,
    generation,revocation_generation,host_project_id_sha256,candidate_commit,
    candidate_tree,candidate_digest,tracked_file_count,dependency_lock_sha256,
    migration_portfolio_sha256,migration_count,template_sha256,
    decision_inventory_sha256,requirement_inventory_sha256,effective_at,
    expires_at,grant_digest
  ) values (
    '${environment}','${mode}','${capability}',array['OWNER-PRIVACY-001'],
    '[{"id":"OWNER-PRIVACY-001","selectedValue":{"decisionReference":"test"}}]'::jsonb,
    repeat('b',64),null,null,'test-envelope-${generation}','${envelope}','${PAYLOAD}',
    '${signature}','owner-authority','owner-key','${KEY}',${generation},0,'${host}',
    '${COMMIT}','${TREE}','${CANDIDATE}',1200,'${LOCK}','${MIGRATIONS}',115,
    '${TEMPLATE}','${INVENTORY}','${REQUIREMENTS}',clock_timestamp() - interval '1 minute',
    ${expires},repeat('0',64)
  );`;
}

function resolveGrant({ host = HOST, commit = COMMIT, environment = "production",
  capability = CAPABILITY } = {}) {
  return `select payload_sha256 || '|' || generation::text
    from public.resolve_owner_decision_authority_v1(
      '${environment}','${capability}','${host}','${commit}','${TREE}','${CANDIDATE}',
      1200,'${LOCK}','${MIGRATIONS}',115
    );`;
}
function service(sql) {
  return `set role service_role; set request.jwt.claim.role='service_role'; ${sql} reset role;`;
}

try {
  success(docker(["image", "inspect", image]), "PostgreSQL image unavailable");
  success(docker(["run", "--detach", "--rm", "--pull=never", "--network=none",
    "--name", containerName, "--env", `POSTGRES_PASSWORD=${password}`, image],
  { timeout: 30_000 }), "PostgreSQL start");
  await ready();
  psql(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
    end $$;
    create schema if not exists auth;
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create or replace function auth.role() returns text language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
    create table public.app_schema_metadata(key text primary key,value text not null,
      updated_at timestamptz not null default now());
    create table public.privacy_inventory_refresh_probe(id int);
    create or replace function public.refresh_privacy_data_inventory_v1()
      returns void language plpgsql as $$ begin
        insert into public.privacy_inventory_refresh_probe values (1);
      end $$;
    ${migration}
  `, "apply authority grant migration");
  assert.equal(psql("select value from public.app_schema_metadata where key='schema_version';"),
    "20260717060000");
  assert.equal(psql("select count(*) from public.privacy_inventory_refresh_probe;"), "1");

  mustFail(service(insertGrant()), /permission denied/i);
  mustFail(service("select count(*) from public.owner_decision_authority_grants;"),
    /permission denied/i);
  mustFail(service("update public.owner_decision_authority_grants set generation=2;"),
    /permission denied/i);
  mustFail(service("delete from public.owner_decision_authority_grants;"),
    /permission denied/i);
  mustFail(`set role authenticated; set request.jwt.claim.role='authenticated';
    ${resolveGrant()} reset role;`, /permission denied|service_role_required/i);

  psql(insertGrant(), "owner installs exact grant");
  assert.equal(psql(service(resolveGrant())), `${PAYLOAD}|1`);
  assert.equal(psql(service(resolveGrant({ host: "c".repeat(64) }))), "");
  assert.equal(psql(service(resolveGrant({ commit: "d".repeat(40) }))), "");
  assert.equal(psql(service(resolveGrant({ capability: "other_capability" }))), "");
  assert.equal(psql(service(resolveGrant({ environment: "staging" }))), "");

  mustFail(insertGrant({ generation: 2, signature: "ed25519:wrong:key:" + PAYLOAD,
    envelope: "e".repeat(64) }), /signature_identity_mismatch|check constraint/i);
  mustFail(insertGrant({ generation: 2, environment: "production",
    mode: "synthetic_staging", envelope: "e".repeat(64) }),
  /production_external_only|check constraint/i);
  mustFail(insertGrant({ generation: 1, envelope: "e".repeat(64) }),
    /generation_downgrade|unique constraint/i);

  psql(insertGrant({ generation: 2, envelope: "e".repeat(64) }));
  mustFail(insertGrant({ generation: 2, envelope: "f".repeat(64) }),
    /generation_downgrade|unique constraint/i);
  assert.equal(psql(service(resolveGrant())), `${PAYLOAD}|2`);
  const grantId = psql("select id from public.owner_decision_authority_grants where generation=2;");
  psql(`insert into public.owner_decision_authority_revocations(
    grant_id,revocation_generation,reason_code,receipt_digest
  ) values ('${grantId}',1,'owner_revoked',repeat('0',64));`);
  assert.equal(psql(service(resolveGrant())), "",
    "revoking the newest generation must never fall back to generation 1");
  mustFail(service(`insert into public.owner_decision_authority_revocations(
    grant_id,revocation_generation,reason_code,receipt_digest
  ) values ('${grantId}',2,'service_attempt',repeat('0',64));`), /permission denied/i);

  psql(insertGrant({ generation: 3, environment: "staging", mode: "synthetic_staging",
    envelope: "f".repeat(64), expires: "clock_timestamp() + interval '2 hours'" }));
  assert.equal(psql(service(resolveGrant({ environment: "staging" }))), `${PAYLOAD}|3`);
  mustFail(insertGrant({ generation: 4, environment: "staging", mode: "synthetic_staging",
    envelope: "0".repeat(64), expires: "clock_timestamp() + interval '25 hours'" }),
  /synthetic_staging_only|check constraint/i);

  psql(insertGrant({ generation: 3, envelope: "0".repeat(64),
    expires: "clock_timestamp() + interval '1 second'" }));
  psql("select pg_sleep(1.2);");
  assert.equal(psql(service(resolveGrant())), "",
    "expired newest generation must not reactivate an older grant");

  console.log("owner decision authority DB grants: PASS (owner-only immutable install/revoke, exact host/candidate/capability, no downgrade/fallback, expiry and synthetic staging boundaries)");
} finally {
  cleanup();
}
