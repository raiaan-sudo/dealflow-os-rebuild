#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const image =
  process.env.DEALFLOW_POSTGRES_TEST_IMAGE ??
  "public.ecr.aws/supabase/postgres:17.6.1.106";
const container = `dealflow-meta-form-${process.pid}-${Date.now()}`;
const password = randomUUID();
const migration = readFileSync(
  "supabase/migrations/20260712235991_create_meta_instant_form_provisioning.sql",
  "utf8",
);

function docker(args, options = {}) {
  return spawnSync("docker", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

function requireSuccess(result, label) {
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  }
  return result.stdout.trim();
}

function psql(sql) {
  return requireSuccess(
    docker(
      [
        "exec",
        "-i",
        "--env",
        `PGPASSWORD=${password}`,
        container,
        "psql",
        "--no-psqlrc",
        "-v",
        "ON_ERROR_STOP=1",
        "-Atq",
        "-U",
        "supabase_admin",
        "-d",
        "postgres",
      ],
      { input: sql },
    ),
    "disposable PostgreSQL statement failed",
  );
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const init = docker(["exec", container, "cat", "/proc/1/comm"]);
    const health = docker(["inspect", "--format={{.State.Health.Status}}", container]);
    const result = docker([
      "exec",
      container,
      "pg_isready",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
    ]);
    if (
      init.status === 0 &&
      init.stdout.trim().toLowerCase().includes("postgres") &&
      health.status === 0 &&
      health.stdout.trim() === "healthy" &&
      result.status === 0
    ) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Disposable PostgreSQL did not become ready.");
}

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const campaignA = "10000000-0000-4000-8000-000000000003";
const campaignB = "10000000-0000-4000-8000-000000000004";
const accountId = "10000000-0000-4000-8000-000000000005";
const tokenA = "10000000-0000-4000-8000-000000000006";
const tokenB = "10000000-0000-4000-8000-000000000007";
const tokenC = "10000000-0000-4000-8000-000000000008";
const digestA = "a".repeat(64);
const digestB = "b".repeat(64);

try {
  requireSuccess(docker(["image", "inspect", image]), "cached PostgreSQL image unavailable");
  requireSuccess(
    docker([
      "run",
      "--detach",
      "--rm",
      "--pull=never",
      "--network=none",
      "--name",
      container,
      "--env",
      `POSTGRES_PASSWORD=${password}`,
      image,
    ]),
    "disposable PostgreSQL start failed",
  );
  await waitForPostgres();

  psql(`
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
    create schema if not exists auth;
    create schema if not exists private;
    create table if not exists auth.users (id uuid primary key);
    create table public.organizations (id uuid primary key);
    create table public.campaign_plans (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null references auth.users(id)
    );
    create table public.marketing_accounts (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      platform text not null,
      status text not null,
      external_account_id text,
      connection_metadata jsonb,
      access_token_encrypted text
    );
    create table public.campaign_launch_records (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      user_id uuid not null,
      campaign_id uuid not null,
      result_status text not null,
      launch_mode text not null,
      launch_input_snapshot jsonb
    );
    create table public.meta_leadgen_routes (id uuid primary key default gen_random_uuid());
    create or replace function public.upsert_meta_leadgen_route(
      uuid, uuid, uuid, uuid, uuid, text, text, text, text default 'active'
    ) returns setof public.meta_leadgen_routes
    language sql as $$
      insert into public.meta_leadgen_routes default values returning *
    $$;
    insert into auth.users (id) values ('${userId}');
    insert into public.organizations values ('${organizationId}');
    insert into public.campaign_plans values
      ('${campaignA}', '${organizationId}', '${userId}'),
      ('${campaignB}', '${organizationId}', '${userId}');
    insert into public.marketing_accounts values
      ('${accountId}', '${organizationId}', 'meta_ads', 'connected',
       'act_500000000000001', '{"selected_page_id":"200000000000001"}', 'encrypted');
  `);
  psql(migration);

  assert.match(
    psql(`select acquired || '|' || provisioning_status || '|' || processing_generation || '|' || provider_mutation_state
      from public.claim_meta_instant_form_provisioning(
        '${organizationId}', '${userId}', '${campaignA}', '${accountId}',
        '200000000000001', 'DealFlow form A', '${digestA}', '${tokenA}', 300
      );`),
    /^true\|processing\|1\|idle$/,
  );
  assert.match(
    psql(`select acquired || '|' || provisioning_status || '|' || processing_generation
      from public.claim_meta_instant_form_provisioning(
        '${organizationId}', '${userId}', '${campaignA}', '${accountId}',
        '200000000000001', 'DealFlow form A', '${digestA}', '${tokenB}', 300
      );`),
    /^false\|processing\|1$/,
  );

  const provisioningA = psql(
    `select id from public.meta_instant_form_provisioning where campaign_id='${campaignA}';`,
  );
  assert.equal(
    psql(`select public.renew_meta_instant_form_provisioning('${provisioningA}', '${tokenA}', 1, 300);`),
    "t",
  );
  assert.equal(
    psql(`select public.arm_meta_instant_form_provider_mutation('${provisioningA}', '${tokenA}', 1);`),
    "t",
  );
  assert.equal(
    psql(`select public.record_meta_instant_form_provider_receipt(
      '${provisioningA}', '${tokenA}', 1, '300000000000001', 'provider_response'
    );`),
    "t",
  );
  assert.match(
    psql(`select settled || '|' || provisioning_status || '|' || provider_form_id
      from public.settle_meta_instant_form_provisioning(
        '${provisioningA}', '${tokenA}', 1, 'created', '300000000000001', null, null
      );`),
    /^true\|created\|300000000000001$/,
  );
  assert.equal(
    psql(`select status || '|' || provider_mutation_state || '|' || subscription_state || '|' ||
      (processing_token is null) || '|' || (processing_locked_until is null)
      from public.meta_instant_form_provisioning where id='${provisioningA}';`),
    "created|receipted|subscribed|true|true",
  );
  psql(`insert into public.campaign_launch_records (
      organization_id, user_id, campaign_id, result_status, launch_mode, launch_input_snapshot
    ) values (
      '${organizationId}', '${userId}', '${campaignA}', 'success', 'scheduled_provider_paused',
      jsonb_build_object('destination', jsonb_build_object(
        'ad_destination', 'meta_instant_form',
        'provider_form_id', '300000000000001',
        'form_definition_digest', '${digestA}'
      ))
    );`);
  assert.equal(
    psql("select count(*) from public.meta_leadgen_routes;"),
    "1",
    "deferred launch completion did not atomically provision native lead routing",
  );
  psql(`insert into public.campaign_launch_records (
      organization_id, user_id, campaign_id, result_status, launch_mode, launch_input_snapshot
    ) values (
      '${organizationId}', '${userId}', '${campaignA}', 'success', 'provider_paused',
      '{"destination":{"ad_destination":"website"}}'
    );`);
  assert.equal(
    psql("select count(*) from public.meta_leadgen_routes;"),
    "1",
    "website launch incorrectly provisioned a native lead route",
  );

  psql(`select * from public.claim_meta_instant_form_provisioning(
    '${organizationId}', '${userId}', '${campaignB}', '${accountId}',
    '200000000000002', 'DealFlow form B', '${digestB}', '${tokenB}', 300
  );`);
  const provisioningB = psql(
    `select id from public.meta_instant_form_provisioning where campaign_id='${campaignB}';`,
  );
  assert.equal(
    psql(`select public.arm_meta_instant_form_provider_mutation('${provisioningB}', '${tokenB}', 1);`),
    "t",
  );
  psql(`update public.meta_instant_form_provisioning
    set processing_locked_until = timezone('utc', now()) - interval '1 second'
    where id='${provisioningB}';`);
  assert.equal(
    psql(`select acquired || '|' || provisioning_status || '|' || provider_mutation_state
      from public.claim_meta_instant_form_provisioning(
        '${organizationId}', '${userId}', '${campaignB}', '${accountId}',
        '200000000000002', 'DealFlow form B', '${digestB}', '${tokenC}', 300
      );`),
    "false|operator_required|operator_required",
  );
  assert.equal(
    psql(`select (processing_token is null) || '|' || (processing_locked_until is null) || '|' || last_error_code
      from public.meta_instant_form_provisioning where id='${provisioningB}';`),
    "true|true|meta_instant_form_expired_ambiguous_write",
  );

  assert.equal(
    psql(`select count(*) from information_schema.routine_privileges
      where routine_schema='public'
        and routine_name in (
          'claim_meta_instant_form_provisioning',
          'renew_meta_instant_form_provisioning',
          'arm_meta_instant_form_provider_mutation',
          'record_meta_instant_form_provider_receipt',
          'settle_meta_instant_form_provisioning'
        )
        and grantee='authenticated';`),
    "0",
  );

  console.log(
    "PASS Meta Instant Form disposable DB: leases, fencing, provider receipts, atomic launch routing, ambiguous expiry, and privileges",
  );
} finally {
  docker(["rm", "--force", container]);
}
