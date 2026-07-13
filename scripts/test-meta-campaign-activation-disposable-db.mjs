#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const image = process.env.DEALFLOW_POSTGRES_TEST_IMAGE ?? "public.ecr.aws/supabase/postgres:17.6.1.106";
const container = `dealflow-meta-activation-${process.pid}-${Date.now()}`;
const password = randomUUID();
const migration = readFileSync("supabase/migrations/20260713011000_create_customer_authorized_meta_activation.sql", "utf8");

function docker(args, options = {}) {
  return spawnSync("docker", args, { cwd: process.cwd(), encoding: "utf8", maxBuffer: 24 * 1024 * 1024, ...options });
}
function requireSuccess(result, label) {
  if (result.error || result.status !== 0) throw new Error(`${label}: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  return result.stdout.trim();
}
function psql(sql) {
  return requireSuccess(docker(["exec", "-i", "--env", `PGPASSWORD=${password}`, container, "psql", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-Atq", "-U", "supabase_admin", "-d", "postgres"], { input: sql }), "disposable PostgreSQL statement failed");
}
async function waitForPostgres() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const health = docker(["inspect", "--format={{.State.Health.Status}}", container]);
    const ready = docker(["exec", container, "pg_isready", "-U", "supabase_admin", "-d", "postgres"]);
    if (health.status === 0 && health.stdout.trim() === "healthy" && ready.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Disposable PostgreSQL did not become ready.");
}

const organizationId = "20000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000002";
const campaignA = "20000000-0000-4000-8000-000000000003";
const campaignB = "20000000-0000-4000-8000-000000000004";
const accountId = "20000000-0000-4000-8000-000000000005";
const launchA = "20000000-0000-4000-8000-000000000006";
const launchB = "20000000-0000-4000-8000-000000000007";
const launchDigestA = "a".repeat(64);
const launchDigestB = "b".repeat(64);
const approvalA = "c".repeat(64);
const approvalB = "d".repeat(64);
const stateDigest = "e".repeat(64);
const scheduledA = new Date(Date.now() - 10_000).toISOString();
const scheduledB = new Date(Date.now() - 5_000).toISOString();

try {
  requireSuccess(docker(["image", "inspect", image]), "cached PostgreSQL image unavailable");
  requireSuccess(docker(["run", "--detach", "--rm", "--pull=never", "--network=none", "--name", container, "--env", `POSTGRES_PASSWORD=${password}`, image]), "disposable PostgreSQL start failed");
  await waitForPostgres();
  psql(`
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create or replace function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    create table if not exists auth.users (id uuid primary key);
    create table if not exists public.organizations (id uuid primary key);
    create table if not exists public.campaign_plans (
      id uuid primary key, organization_id uuid not null references public.organizations(id),
      user_id uuid not null references auth.users(id), unique(id, organization_id, user_id)
    );
    create table if not exists public.marketing_accounts (
      id uuid primary key, organization_id uuid not null references public.organizations(id),
      platform text not null, status text not null, external_account_id text not null,
      access_token_encrypted text, connection_metadata jsonb
    );
    create table if not exists public.campaign_launch_records (
      id uuid primary key, organization_id uuid not null, user_id uuid not null,
      campaign_id uuid not null, result_status text not null, launch_mode text not null,
      launch_input_snapshot jsonb not null, launch_input_digest text not null,
      meta_campaign_id text, meta_ad_set_ids jsonb not null, meta_ad_ids jsonb not null
    );
    insert into auth.users (id) values ('${userId}');
    insert into public.organizations values ('${organizationId}');
    insert into public.campaign_plans values
      ('${campaignA}', '${organizationId}', '${userId}'),
      ('${campaignB}', '${organizationId}', '${userId}');
    insert into public.marketing_accounts values
      ('${accountId}', '${organizationId}', 'meta_ads', 'connected', 'act_90000000001', 'encrypted', '{}');
    insert into public.campaign_launch_records values
      ('${launchA}', '${organizationId}', '${userId}', '${campaignA}', 'success', 'provider_paused',
       '{"provider":{"ad_account_id":"90000000001"},"delivery":{"daily_budget_minor":"5000"}}',
       '${launchDigestA}', '91000000001', '["92000000001"]', '["93000000001"]'),
      ('${launchB}', '${organizationId}', '${userId}', '${campaignB}', 'success', 'scheduled_provider_paused',
       '{"provider":{"ad_account_id":"90000000001"},"delivery":{"daily_budget_minor":"7500"}}',
       '${launchDigestB}', '91000000002', '["92000000002"]', '["93000000002"]');
  `);
  psql(migration);

  assert.equal(psql("select string_agg(environment || ':' || activation_writes_enabled, ',' order by environment) from public.meta_campaign_activation_runtime_controls;"), "production:false,staging:false");
  assert.equal(psql("select has_table_privilege('authenticated', 'public.meta_campaign_activation_intents', 'INSERT');"), "f");
  assert.equal(psql("select has_function_privilege('authenticated', 'public.authorize_meta_campaign_activation(uuid,uuid,uuid,timestamptz,bigint,text,text,text)', 'EXECUTE');"), "t");
  assert.equal(psql("select has_function_privilege('authenticated', 'public.claim_due_meta_campaign_activation(text,text,integer)', 'EXECUTE');"), "f");

  const authorizeA = `
    select id || '|' || status || '|' || approved_daily_budget_minor || '|' || approved_currency
    from public.authorize_meta_campaign_activation(
      '${organizationId}', '${campaignA}', '${launchA}', '${scheduledA}'::timestamptz,
      5000, 'cad', '${approvalA}', 'activation-contract-a'
    );`;
  psql(`select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${userId}',false);`);
  const authorized = psql(`select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${userId}',false); ${authorizeA}`);
  assert.match(authorized, /\|authorized\|5000\|CAD$/);
  const activationA = authorized.split("\n").at(-1).split("|")[0];
  const replay = psql(`select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${userId}',false); ${authorizeA}`);
  assert.equal(replay.split("\n").at(-1).split("|")[0], activationA, "idempotent authorization must reuse the exact intent");
  const wrongBudget = docker(["exec", "-i", "--env", `PGPASSWORD=${password}`, container, "psql", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-Atq", "-U", "supabase_admin", "-d", "postgres"], { input: `select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${userId}',false); select id from public.authorize_meta_campaign_activation('${organizationId}','${campaignB}','${launchB}','${scheduledB}'::timestamptz,7600,'CAD','${approvalB}','activation-wrong-budget');` });
  assert.notEqual(wrongBudget.status, 0);
  assert.match(wrongBudget.stderr, /customer-approved budget does not match/);

  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select count(*) from public.claim_due_meta_campaign_activation('worker-a','production',300);`).split("\n").at(-1), "0", "closed DB control must claim nothing");
  psql("update public.meta_campaign_activation_runtime_controls set activation_writes_enabled=true, control_generation=2, change_reason='disposable test' where environment='production';");
  const claim = psql(`select set_config('request.jwt.claim.role','service_role',false); select activation_intent_id || '|' || processing_generation || '|' || processing_token from public.claim_due_meta_campaign_activation('worker-a','production',300);`).split("\n").at(-1);
  assert.match(claim, new RegExp(`^${activationA}\\|1\\|`));
  const [, generation, token] = claim.split("|");
  const objectRows = psql(`select id || '|' || provider_object_type || '|' || provider_object_id from public.meta_campaign_activation_objects where activation_intent_id='${activationA}' order by sequence_number;`).split("\n");
  assert.deepEqual(objectRows.map((row) => row.split("|")[1]), ["ad", "adset", "campaign"]);
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.renew_meta_campaign_activation_claim('${activationA}','worker-a','${token}',99,300);`).split("\n").at(-1), "f", "stale generation renewed the lease");

  for (const row of objectRows) {
    const [objectId, type, providerId] = row.split("|");
    assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.arm_meta_campaign_activation_object('${activationA}','${objectId}','worker-a','${token}',${generation});`).split("\n").at(-1), "t");
    assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.record_meta_campaign_activation_receipt('${activationA}','${objectId}','worker-a','${token}',${generation},'receipt-${providerId}','${stateDigest}',jsonb_build_object('activationInputDigest',(select activation_input_digest from public.meta_campaign_activation_intents where id='${activationA}'),'providerObjectId','${providerId}','providerObjectType','${type}','observedStatus','ACTIVE'));`).split("\n").at(-1), "t");
    assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_campaign_activation_object('${activationA}','${objectId}','worker-a','${token}',${generation});`).split("\n").at(-1), "t");
  }
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_campaign_activation('${activationA}','worker-a','${token}',${generation},'active',null,null);`).split("\n").at(-1), "t");
  assert.match(psql(`select status || '|' || (completed_at is not null) || '|' || (select count(*) from jsonb_object_keys(provider_receipt_summary)) from public.meta_campaign_activation_intents where id='${activationA}';`), /^active\|true\|3$/);

  const authorizedB = psql(`select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${userId}',false); select id from public.authorize_meta_campaign_activation('${organizationId}','${campaignB}','${launchB}','${scheduledB}'::timestamptz,7500,'CAD','${approvalB}','activation-contract-b');`).split("\n").at(-1);
  const claimB = psql(`select set_config('request.jwt.claim.role','service_role',false); select activation_intent_id || '|' || processing_generation || '|' || processing_token from public.claim_due_meta_campaign_activation('worker-b','production',30);`).split("\n").at(-1);
  assert.match(claimB, new RegExp(`^${authorizedB}\\|1\\|`));
  const [, generationB, tokenB] = claimB.split("|");
  const firstObjectB = psql(`select id from public.meta_campaign_activation_objects where activation_intent_id='${authorizedB}' order by sequence_number limit 1;`);
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.arm_meta_campaign_activation_object('${authorizedB}','${firstObjectB}','worker-b','${tokenB}',${generationB});`).split("\n").at(-1), "t");
  psql(`update public.meta_campaign_activation_intents set processing_locked_until=timezone('utc',now())-interval '1 second' where id='${authorizedB}';`);
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select count(*) from public.claim_due_meta_campaign_activation('worker-c','production',300);`).split("\n").at(-1), "0");
  assert.equal(psql(`select status || '|' || last_error_code from public.meta_campaign_activation_intents where id='${authorizedB}';`), "operator_required|meta_activation_expired_ambiguous_write");
  assert.equal(psql(`select status || '|' || provider_mutation_state from public.meta_campaign_activation_objects where id='${firstObjectB}';`), "operator_required|operator_required");

  console.log("Disposable PostgreSQL 17.6 Meta activation authority, exact budget, leases, fencing, receipts, order, and ambiguity tests passed.");
} finally {
  docker(["rm", "--force", container]);
}
