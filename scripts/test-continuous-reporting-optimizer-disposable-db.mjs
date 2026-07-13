#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createDisposablePostgresHarness } from "./lib/disposable-postgres-harness.mjs";

const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const name = `dealflow-reporting-optimizer-${process.pid}-${randomBytes(3).toString("hex")}`;
const db = createDisposablePostgresHarness({ containerName: name, image, maxBuffer: 16 * 1024 * 1024 });
const password = randomBytes(20).toString("hex");
const migration = fs.readFileSync("supabase/migrations/20260712214000_create_continuous_reporting_and_safe_optimizer.sql", "utf8");
const integrityMigration = fs.readFileSync("supabase/migrations/20260713018000_harden_meta_reporting_and_leadgen_integrity.sql", "utf8");
const reportingIntegritySql = integrityMigration.slice(
  integrityMigration.indexOf("-- BEGIN META REPORTING SETTLEMENT FENCING"),
  integrityMigration.indexOf("-- END META REPORTING SETTLEMENT FENCING") +
    "-- END META REPORTING SETTLEMENT FENCING".length,
);
let cleaned = false;

function run(args, options = {}) { return db.run(args, options); }
function requireSuccess(result, label) {
  if (result.error || result.status !== 0) throw new Error(`${label}: ${String(result.stderr || result.stdout || result.error?.message).slice(-4000)}`);
  return String(result.stdout ?? "").trim();
}
function args() {
  return ["exec", "-i", "--env", `PGPASSWORD=${password}`, name, "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--field-separator=|", "--quiet", "--username=supabase_admin", "--dbname=postgres"];
}
function sql(value, label) { return requireSuccess(run(args(), { input: value }), label); }
function mustFail(value, pattern, label) {
  const result = run(args(), { input: value });
  assert.notEqual(result.status, 0, `${label}: unexpectedly succeeded`);
  assert.match(String(result.stderr || result.stdout), pattern, `${label}: wrong failure`);
}
function cleanup() { if (!cleaned) { cleaned = true; run(["rm", "--force", name], { timeout: 30_000 }); } }
process.once("exit", cleanup);

try {
  requireSuccess(run(["image", "inspect", image]), "PostgreSQL image missing");
  requireSuccess(run(["run", "--detach", "--pull=never", "--network=none", "--name", name, "--env", `POSTGRES_PASSWORD=${password}`, image]), "PostgreSQL start failed");
  for (let i = 0; i < 120; i += 1) {
    const ready = run(["exec", name, "pg_isready", "--username=supabase_admin", "--dbname=postgres"]);
    const health = run(["inspect", "--format={{.State.Health.Status}}", name]);
    if (ready.status === 0 && health.status === 0 && health.stdout.trim() === "healthy") break;
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (i === 119) throw new Error("PostgreSQL did not become ready");
  }

  sql(`
    create extension if not exists pgcrypto;
    create schema if not exists auth; create schema if not exists private;
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create or replace function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
    create or replace function private.is_current_user_org_member(uuid) returns boolean language sql stable as $$ select true $$;
    create table public.organizations(id uuid primary key);
    create table public.campaign_plans(id uuid primary key, organization_id uuid not null references public.organizations(id), user_id uuid not null references auth.users(id), unique(id, organization_id), unique(id, organization_id, user_id));
    create table public.campaign_sync_snapshots(
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      user_id uuid not null,
      campaign_id uuid,
      meta_campaign_id text,
      sync_result text not null default 'failed',
      delivery_metrics_confirmed boolean not null default false
    );
    create table public.campaign_launch_records(id uuid primary key default gen_random_uuid(), organization_id uuid not null, user_id uuid not null, campaign_id uuid, result_status text not null, meta_campaign_id text);
    create table public.system_jobs(
      id uuid primary key default gen_random_uuid(), organization_id uuid not null, user_id uuid not null, campaign_id uuid,
      kind text not null, status text not null default 'pending', payload jsonb not null default '{}'::jsonb, result jsonb,
      retry_count integer not null default 0, error_message text, started_at timestamptz, completed_at timestamptz,
      created_at timestamptz not null default now(), idempotency_key text, locked_by text, locked_until timestamptz,
      next_run_at timestamptz, last_error_code text, dead_lettered_at timestamptz, attempt_count integer not null default 0,
      max_attempts integer not null default 2, dead_letter_reason text, lease_token uuid, lease_generation bigint not null default 0,
      lease_heartbeat_at timestamptz
    );
    create unique index system_jobs_idempotency_key_unique on public.system_jobs(idempotency_key) where idempotency_key is not null;
    create table public.meta_leadgen_events(
      id uuid primary key default gen_random_uuid(), reconciliation_job_id uuid, status text not null,
      processing_token uuid, locked_by text, locked_until timestamptz, last_error_code text,
      last_error_message text, updated_at timestamptz not null default now()
    );
    create table public.meta_leadgen_effect_receipts(
      id uuid primary key default gen_random_uuid(), event_id uuid not null references public.meta_leadgen_events(id),
      effect_key text not null, status text not null, reason text, updated_at timestamptz not null default now()
    );
    create table public.app_schema_metadata(key text primary key, value text not null, updated_at timestamptz not null default now());
    ${migration}
    ${reportingIntegritySql}
  `, "Apply reporting/optimizer migration");

  const user = "10000000-0000-4000-8000-000000000001";
  const userB = "10000000-0000-4000-8000-000000000002";
  const org = "20000000-0000-4000-8000-000000000001";
  const orgB = "20000000-0000-4000-8000-000000000002";
  const campaign = "30000000-0000-4000-8000-000000000001";
  const campaignB = "30000000-0000-4000-8000-000000000002";
  sql(`
    insert into auth.users(id) values ('${user}'),('${userB}');
    insert into public.organizations values ('${org}'),('${orgB}');
    insert into public.campaign_plans values
      ('${campaign}','${org}','${user}'),
      ('${campaignB}','${orgB}','${userB}');
    insert into public.campaign_launch_records(
      organization_id,user_id,campaign_id,result_status,meta_campaign_id
    ) values ('${org}','${user}','${campaign}','success','meta-sandbox-campaign');
  `, "Seed reporting fixture");

  const first = sql(`set role service_role; set request.jwt.claim.role='service_role'; select enqueued_count from public.enqueue_due_meta_reporting_sync_jobs(25);`, "First schedule enqueue");
  assert.equal(first, "1");
  const second = sql(`set role service_role; set request.jwt.claim.role='service_role'; select enqueued_count from public.enqueue_due_meta_reporting_sync_jobs(25);`, "Replay schedule enqueue");
  assert.equal(second, "0", "same due window must not enqueue twice");
  const scheduleId = sql(`select id from public.meta_reporting_schedules where campaign_id='${campaign}';`, "Read schedule");
  const claimA = sql(`set role service_role; set request.jwt.claim.role='service_role'; select id||'|'||lease_token||'|'||lease_generation from public.claim_next_system_job_v2('worker-a',300000,2);`, "Worker A claim");
  const [jobId, tokenA, generationA] = claimA.split("|");
  assert.ok(jobId && tokenA && generationA === "1");
  assert.equal(sql(`set role service_role; set request.jwt.claim.role='service_role'; select count(*) from public.claim_next_system_job_v2('worker-b',300000,2);`, "Concurrent worker exclusion"), "0");
  sql(`update public.meta_reporting_schedules set next_sync_at=now()-interval '1 second' where id='${scheduleId}';`, "Force overlapping due window");
  assert.equal(sql(`set role service_role; set request.jwt.claim.role='service_role'; select enqueued_count from public.enqueue_due_meta_reporting_sync_jobs(25);`, "Active-run overlap guard"), "0", "an active campaign sync must suppress a second scheduled job");
  mustFail(`set role service_role; set request.jwt.claim.role='service_role'; select public.record_meta_reporting_sync_failure('${scheduleId}','${jobId}','wrong-worker','${tokenA}',1,'timeout');`, /meta_reporting_lease_lost/, "Wrong worker failure settlement");
  assert.equal(sql(`set role service_role; set request.jwt.claim.role='service_role'; select public.record_meta_reporting_sync_failure('${scheduleId}','${jobId}','worker-a','${tokenA}',1,'timeout');`, "Record fenced failure"), "t");
  assert.equal(sql(`select freshness_status||'|'||consecutive_failures from public.meta_reporting_schedules where id='${scheduleId}';`, "Failure freshness"), "missing|1");

  sql(`update public.system_jobs set locked_until=now()-interval '1 second' where id='${jobId}';`, "Expire first lease");
  const claimB = sql(`set role service_role; set request.jwt.claim.role='service_role'; select id||'|'||lease_token||'|'||lease_generation from public.claim_next_system_job_v2('worker-b',300000,2);`, "Worker B reclaim");
  const [, tokenB, generationB] = claimB.split("|");
  assert.equal(generationB, "2");
  mustFail(`set role service_role; set request.jwt.claim.role='service_role'; select public.settle_meta_reporting_sync('${scheduleId}','${jobId}','worker-a','${tokenA}',1,gen_random_uuid());`, /meta_reporting_lease_lost/, "Superseded worker settlement");
  const scheduleB = sql(`
    insert into public.meta_reporting_schedules(organization_id,user_id,campaign_id,next_sync_at)
    values ('${orgB}','${userB}','${campaignB}',now()+interval '1 day') returning id;
  `, "Create cross-tenant schedule");
  const snapshotB = sql(`
    insert into public.campaign_sync_snapshots(organization_id,user_id,campaign_id,meta_campaign_id,sync_result,delivery_metrics_confirmed)
    values ('${orgB}','${userB}','${campaignB}','meta-other-campaign','success',true) returning id;
  `, "Create cross-tenant snapshot");
  const wrongCampaignSnapshot = sql(`
    insert into public.campaign_sync_snapshots(organization_id,user_id,campaign_id,meta_campaign_id,sync_result,delivery_metrics_confirmed)
    values ('${org}','${user}','${campaignB}','meta-wrong-campaign','success',true) returning id;
  `, "Create wrong-campaign snapshot");
  mustFail(
    `set role service_role; set request.jwt.claim.role='service_role'; select public.record_meta_reporting_sync_failure('${scheduleB}','${jobId}','worker-b','${tokenB}',${generationB},'timeout');`,
    /meta_reporting_schedule_job_scope_mismatch/,
    "Cross-tenant failure settlement denial",
  );
  mustFail(
    `set role service_role; set request.jwt.claim.role='service_role'; select public.settle_meta_reporting_sync('${scheduleB}','${jobId}','worker-b','${tokenB}',${generationB},'${snapshotB}');`,
    /meta_reporting_schedule_job_scope_mismatch/,
    "Cross-tenant schedule success settlement denial",
  );
  mustFail(
    `set role service_role; set request.jwt.claim.role='service_role'; select public.settle_meta_reporting_sync('${scheduleId}','${jobId}','worker-b','${tokenB}',${generationB},'${snapshotB}');`,
    /meta_reporting_snapshot_tenant_scope_mismatch/,
    "Cross-tenant snapshot settlement denial",
  );
  mustFail(
    `set role service_role; set request.jwt.claim.role='service_role'; select public.settle_meta_reporting_sync('${scheduleId}','${jobId}','worker-b','${tokenB}',${generationB},'${wrongCampaignSnapshot}');`,
    /meta_reporting_snapshot_campaign_scope_mismatch/,
    "Cross-campaign snapshot settlement denial",
  );
  const unconfirmedSnapshot = sql(`
    insert into public.campaign_sync_snapshots(organization_id,user_id,campaign_id,meta_campaign_id,sync_result,delivery_metrics_confirmed)
    values ('${org}','${user}','${campaign}','meta-sandbox-campaign','partial_success',false) returning id;
  `, "Create failed delivery attempt");
  mustFail(
    `set role service_role; set request.jwt.claim.role='service_role'; select public.settle_meta_reporting_sync('${scheduleId}','${jobId}','worker-b','${tokenB}',${generationB},'${unconfirmedSnapshot}');`,
    /meta_reporting_delivery_metrics_unconfirmed/,
    "Unconfirmed delivery metrics cannot settle reporting freshness",
  );
  const snapshot = sql(`
    insert into public.campaign_sync_snapshots(organization_id,user_id,campaign_id,meta_campaign_id,sync_result,delivery_metrics_confirmed)
    values ('${org}','${user}','${campaign}','meta-sandbox-campaign','success',true) returning id;
  `, "Create exact-scope snapshot");
  assert.equal(sql(`set role service_role; set request.jwt.claim.role='service_role'; select public.settle_meta_reporting_sync('${scheduleId}','${jobId}','worker-b','${tokenB}',${generationB},'${snapshot}');`, "Worker B settlement"), "t");
  assert.equal(sql(`select freshness_status||'|'||consecutive_failures from public.meta_reporting_schedules where id='${scheduleId}';`, "Successful freshness"), "current|0");

  sql(`insert into public.meta_optimization_action_receipts(organization_id,campaign_id,idempotency_key,policy_version,action_type,before_state,intended_state,provider_receipt_id,after_state,reconciled) values ('${org}','${campaign}','receipt-key','dealflow-realtor-optimization-v2','pause','{}','{}','provider-receipt','{}',true);`, "Insert immutable receipt");
  mustFail(`update public.meta_optimization_action_receipts set reconciled=false where idempotency_key='receipt-key';`, /append-only/, "Receipt update guard");
  mustFail(`delete from public.meta_optimization_action_receipts where idempotency_key='receipt-key';`, /append-only/, "Receipt delete guard");
  assert.equal(sql(`select execution_enabled||'|'||global_kill_switch from public.optimization_campaign_controls where campaign_id='${campaign}';`, "Default optimizer controls"), "false|true");

  console.log("continuous reporting/optimizer disposable DB: PASS (enqueue replay, lease exclusion/reclaim, cross-tenant/campaign settlement denial, freshness, immutable receipts)");
} finally {
  cleanup();
}
