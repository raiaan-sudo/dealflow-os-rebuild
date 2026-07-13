#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const migration = readFileSync("supabase/migrations/20260713013000_create_customer_authorized_meta_optimizer_executor.sql", "utf8");
const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  expectedVersion: "17.6",
  databasePrefix: `dfopt_${process.pid}_${randomBytes(3).toString("hex")}`,
  timeoutMs: 120_000,
  maxOutputBytes: 24 * 1024 * 1024,
});

const ids = {
  organization: "31000000-0000-4000-8000-000000000001",
  customer: "31000000-0000-4000-8000-000000000002",
  outsider: "31000000-0000-4000-8000-000000000003",
  campaign: "31000000-0000-4000-8000-000000000004",
  launch: "31000000-0000-4000-8000-000000000005",
  activation: "31000000-0000-4000-8000-000000000006",
  preauth: "31000000-0000-4000-8000-000000000007",
  scaleDecision: "31000000-0000-4000-8000-000000000008",
  malformedDecision: "31000000-0000-4000-8000-000000000009",
  pauseDecision: "31000000-0000-4000-8000-00000000000a",
  driftDecision: "31000000-0000-4000-8000-00000000000b",
};
const accountId = "99100000001";
const campaignId = "99200000001";
const adSetId = "99300000001";
const adId = "99400000001";

await adapter.withDisposableDatabase(async (database) => {
  const psql = (sql, label = "Run optimizer database proof") => database.psql(sql, { label });
  const mustFail = (sql, pattern, label) => database.psqlMustFail(sql, pattern, { label });
  psql(`
    create extension if not exists pgcrypto;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
    create schema if not exists auth; create schema if not exists private;
    create table if not exists auth.users(id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create or replace function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    create table public.organizations(id uuid primary key);
    create table public.organization_memberships(
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null references auth.users(id), primary key(organization_id,user_id)
    );
    create or replace function private.is_current_user_org_member(target uuid)
    returns boolean language sql stable security definer set search_path=pg_catalog,public,auth as $$
      select exists(select 1 from public.organization_memberships m
        where m.organization_id=target and m.user_id=auth.uid())
    $$;
    create table public.campaign_plans(
      id uuid primary key, organization_id uuid not null references public.organizations(id),
      user_id uuid not null references auth.users(id), unique(id,organization_id),
      unique(id,organization_id,user_id)
    );
    create table public.campaign_launch_records(
      id uuid primary key, organization_id uuid not null, user_id uuid not null,
      campaign_id uuid not null, result_status text not null, meta_campaign_id text,
      meta_ad_set_ids jsonb not null default '[]', meta_ad_ids jsonb not null default '[]',
      created_at timestamptz not null default now()
    );
    create table public.meta_campaign_activation_intents(
      id uuid primary key, organization_id uuid not null, user_id uuid not null,
      campaign_id uuid not null, launch_record_id uuid not null references public.campaign_launch_records(id),
      status text not null, provider_delivery_status text not null,
      provider_delivery_evidence_digest text, provider_contract_evidence_digest text,
      provider_ad_account_id text not null, provider_campaign_id text not null,
      provider_ad_set_ids jsonb not null, provider_ad_ids jsonb not null
    );
    create table public.meta_campaign_activation_objects(
      id uuid primary key default gen_random_uuid(), activation_intent_id uuid not null,
      provider_object_type text not null, provider_object_id text not null,
      status text not null, provider_mutation_state text not null
    );
    create table public.meta_campaign_activation_preauthorizations(
      id uuid primary key, organization_id uuid not null, user_id uuid not null,
      campaign_id uuid not null, launch_record_id uuid not null references public.campaign_launch_records(id),
      customer_authorized_at timestamptz not null default now(), status text not null,
      activation_intent_id uuid references public.meta_campaign_activation_intents(id),
      approved_currency text not null, approved_daily_budget_minor bigint not null,
      provider_ad_account_id text not null
    );
    create table public.optimization_decisions(
      id uuid primary key, organization_id uuid not null, campaign_id uuid not null,
      policy_id text not null, policy_digest text not null, idempotency_key text not null,
      mode text not null default 'shadow', source_status text not null, source_timestamp timestamptz,
      input_snapshot jsonb not null default '{}', authority_checks jsonb not null default '{}',
      proposed_action text not null, reasons jsonb not null default '[]',
      before_state jsonb not null default '{}', intended_state jsonb not null default '{}',
      simulated_result jsonb not null default '{}', live_action_performed boolean not null default false,
      recovery_status text not null default 'not_required', created_at timestamptz not null default now()
    );
    create table public.optimization_campaign_controls(
      campaign_id uuid primary key references public.campaign_plans(id),
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null references auth.users(id),
      policy_version text not null default 'dealflow-realtor-optimization-v2',
      execution_enabled boolean not null default false,
      global_kill_switch boolean not null default true,
      account_kill_switch boolean not null default false,
      campaign_kill_switch boolean not null default false,
      emergency_stop boolean not null default false,
      customer_daily_budget_ceiling numeric,
      last_provider_mutation_at timestamptz,
      scale_applied_last_24h_percent numeric not null default 0,
      updated_at timestamptz not null default now()
    );
    create table public.meta_optimization_action_receipts(
      id uuid primary key default gen_random_uuid(), organization_id uuid not null,
      campaign_id uuid not null, idempotency_key text not null unique, policy_version text not null,
      action_type text not null, before_state jsonb not null, intended_state jsonb not null,
      provider_receipt_id text not null, after_state jsonb, reconciled boolean not null,
      rollback_state jsonb not null default '{"required":false,"succeeded":null,"reason":null}',
      created_at timestamptz not null default now()
    );
    create or replace function public.prevent_meta_optimization_receipt_mutation()
    returns trigger language plpgsql set search_path='' as $$ begin
      raise exception 'Meta optimization action receipts are append-only.';
    end $$;
    create trigger meta_optimization_action_receipts_append_only before update or delete
      on public.meta_optimization_action_receipts for each row
      execute function public.prevent_meta_optimization_receipt_mutation();
    create table public.app_schema_metadata(key text primary key,value text not null,updated_at timestamptz not null default now());
  `, "Create isolated optimizer fixture");
  psql(migration, "Apply customer-authorized optimizer migration");

  psql(`
    insert into auth.users values ('${ids.customer}'),('${ids.outsider}');
    insert into public.organizations values ('${ids.organization}');
    insert into public.organization_memberships values ('${ids.organization}','${ids.customer}');
    insert into public.campaign_plans values ('${ids.campaign}','${ids.organization}','${ids.customer}');
    insert into public.campaign_launch_records values (
      '${ids.launch}','${ids.organization}','${ids.customer}','${ids.campaign}','success',
      '${campaignId}','["${adSetId}"]','["${adId}"]',now()-interval '48 hours'
    );
    insert into public.meta_campaign_activation_intents values (
      '${ids.activation}','${ids.organization}','${ids.customer}','${ids.campaign}','${ids.launch}',
      'active','delivery_active','${"b".repeat(64)}','${"c".repeat(64)}',
      '${accountId}','${campaignId}','["${adSetId}"]','["${adId}"]'
    );
    insert into public.meta_campaign_activation_preauthorizations values (
      '${ids.preauth}','${ids.organization}','${ids.customer}','${ids.campaign}','${ids.launch}',
      now()-interval '1 hour','finalized','${ids.activation}','CAD',5000,'${accountId}'
    );
    insert into public.meta_campaign_activation_objects(
      activation_intent_id,provider_object_type,provider_object_id,status,provider_mutation_state
    ) values
      ('${ids.activation}','campaign','${campaignId}','active','receipted'),
      ('${ids.activation}','adset','${adSetId}','active','receipted'),
      ('${ids.activation}','ad','${adId}','active','receipted');
  `, "Seed exact single-primary activation authority");

  const authorizeSql = (key = "optimizer-auth-contract") => `
    set role service_role; select set_config('request.jwt.claim.role','service_role',false);
    select id from public.authorize_meta_optimization_policy(
      '${ids.organization}','${ids.customer}','${ids.campaign}',10000,'CAD',
      'ENABLE_AUTONOMOUS_META_OPTIMIZATION','${key}'
    );`;
  const policyId = psql(authorizeSql()).split("\n").at(-1);
  assert.match(policyId, /^[0-9a-f-]{36}$/i);
  assert.equal(psql(authorizeSql("optimizer-auth-contract-retry")).split("\n").at(-1), policyId, "authorization retry with a fresh transport key must reconcile the exact active receipt");
  mustFail(
    `set role service_role; select set_config('request.jwt.claim.role','service_role',false);
     select id from public.authorize_meta_optimization_policy('${ids.organization}','${ids.outsider}','${ids.campaign}',10000,'CAD','ENABLE_AUTONOMOUS_META_OPTIMIZATION','outsider-contract');`,
    /campaign authority is missing/,
    "Reject cross-user optimizer authority",
  );
  mustFail(
    `update public.meta_optimization_policy_authorizations set customer_daily_budget_ceiling_minor=20000 where id='${policyId}';`,
    /identity is immutable/,
    "Reject optimization authority rewrite",
  );
  assert.match(
    psql(`set role authenticated; select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${ids.customer}',false); select authorization_id||'|'||authorization_status||'|'||approved_currency from public.get_meta_optimization_policy_status('${ids.organization}','${ids.campaign}');`).split("\n").at(-1),
    new RegExp(`^${policyId}\\|active\\|CAD$`),
  );
  mustFail(
    `set role authenticated; select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${ids.outsider}',false); select * from public.get_meta_optimization_policy_status('${ids.organization}','${ids.campaign}');`,
    /unauthorized/,
    "Reject nonmember policy status",
  );

  const insertDecision = (id, metrics, proposed) => psql(`
    insert into public.optimization_decisions(
      id,organization_id,campaign_id,policy_id,policy_digest,idempotency_key,mode,
      source_status,source_timestamp,input_snapshot,authority_checks,proposed_action
    ) values (
      '${id}','${ids.organization}','${ids.campaign}','${policyId}','${"a".repeat(64)}','decision:${id}',
      'shadow','confirmed',now(),jsonb_build_object('metrics','${JSON.stringify(metrics)}'::jsonb),
      '{"blockers":[]}', '${proposed}'
    );
  `, `Insert ${proposed} decision`);
  insertDecision(ids.scaleDecision, { impressions: 2000, clicks: 100, spend: 100, leads: 5, ctr: 3, cpc: 1, cpl: 20, frequency: 2, lp_cvr: 5 }, "budget:20:two_or_more_strong_metrics");

  const enqueueScale = `set role service_role; select set_config('request.jwt.claim.role','service_role',false);
    select id from public.enqueue_meta_optimization_execution_intent(
      '${ids.organization}','${ids.customer}','${ids.campaign}','${ids.scaleDecision}',
      'staging','budget','two_or_more_strong_metrics',6000,'scale-intent-contract'
    );`;
  const scaleIntent = psql(enqueueScale).split("\n").at(-1);
  assert.match(scaleIntent, /^[0-9a-f-]{36}$/i);
  assert.equal(psql(enqueueScale).split("\n").at(-1), scaleIntent, "execution enqueue replay must be idempotent");
  assert.equal(psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false); select count(*) from public.claim_meta_optimization_execution_intent('staging','closed-worker',300);`).split("\n").at(-1), "0", "runtime control must be default closed");
  assert.equal(psql(`select provider_mode||'|'||execution_writes_enabled||'|'||global_kill_switch from public.meta_optimization_runtime_controls where environment='production';`), "shadow|false|true");
  mustFail(
    `set role service_role; select set_config('request.jwt.claim.role','service_role',false); select environment from public.set_meta_optimization_production_runtime_control(1,true,false,'WRONG','proof');`,
    /confirmation is invalid/,
    "Reject production runtime control without exact confirmation",
  );
  assert.equal(psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false); select environment||'|'||provider_mode||'|'||control_generation from public.set_meta_optimization_staging_runtime_control(1,true,false,'ENABLE_STAGING_SANDBOX_META_OPTIMIZATION','isolated database proof');`).split("\n").at(-1), "staging|sandbox|2");

  const claim = psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false);
    select id||'|'||worker_id||'|'||lease_token||'|'||lease_generation from public.claim_meta_optimization_execution_intent('staging','optimizer-worker-a',300);`).split("\n").at(-1).split("|");
  assert.equal(claim[0], scaleIntent);
  mustFail(
    `set role service_role; select set_config('request.jwt.claim.role','service_role',false); select id from public.arm_meta_optimization_execution_intent('${scaleIntent}','wrong-worker','${claim[2]}',${claim[3]},'{"accountId":"${accountId}","campaignId":"${campaignId}","objectType":"adset","objectId":"${adSetId}","currency":"CAD","configuredStatus":"ACTIVE","effectiveStatus":"ACTIVE","dailyBudgetMinor":5000}');`,
    /lease lost/,
    "Reject stale optimizer worker",
  );
  const executionToken = psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false); select execution_token from public.arm_meta_optimization_execution_intent('${scaleIntent}','${claim[1]}','${claim[2]}',${claim[3]},'{"accountId":"${accountId}","campaignId":"${campaignId}","objectType":"adset","objectId":"${adSetId}","currency":"CAD","configuredStatus":"ACTIVE","effectiveStatus":"ACTIVE","dailyBudgetMinor":5000}');`).split("\n").at(-1);
  assert.match(executionToken, /^[0-9a-f-]{36}$/i);
  psql(`update public.meta_campaign_activation_intents set status='operator_required' where id='${ids.activation}';`);
  mustFail(
    `set role service_role; select set_config('request.jwt.claim.role','service_role',false); select id from public.confirm_meta_optimization_execution_dispatch('${scaleIntent}','${claim[1]}','${claim[2]}',${claim[3]},'${executionToken}');`,
    /authority changed/,
    "Reject dispatch after activation authority drift",
  );
  psql(`update public.meta_campaign_activation_intents set status='active' where id='${ids.activation}';`);
  const dispatchNonce = psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false); select dispatch_authority_nonce from public.confirm_meta_optimization_execution_dispatch('${scaleIntent}','${claim[1]}','${claim[2]}',${claim[3]},'${executionToken}');`).split("\n").at(-1);
  assert.match(dispatchNonce, /^[0-9a-f-]{36}$/i);
  mustFail(
    `set role service_role; select set_config('request.jwt.claim.role','service_role',false); select id from public.confirm_meta_optimization_execution_dispatch('${scaleIntent}','${claim[1]}','${claim[2]}',${claim[3]},'${executionToken}');`,
    /dispatch fence is unavailable/,
    "Reject replayed one-use dispatch fence",
  );
  mustFail(
    `set role service_role; select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_optimization_execution_intent('${scaleIntent}','${claim[1]}','${claim[2]}',${claim[3]},'${executionToken}','operator_required',false,null,null,'incorrect-no-effect','incorrect-no-effect');`,
    /cannot be downgraded to no provider effect/,
    "A confirmed dispatch must never settle as no provider mutation",
  );
  assert.equal(psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_optimization_execution_intent('${scaleIntent}','${claim[1]}','${claim[2]}',${claim[3]},'${executionToken}','succeeded',true,'synthetic-provider-receipt','{"accountId":"${accountId}","campaignId":"${campaignId}","objectType":"adset","objectId":"${adSetId}","currency":"CAD","configuredStatus":"ACTIVE","effectiveStatus":"ACTIVE","dailyBudgetMinor":6000}',null,null);`).split("\n").at(-1), "t");
  assert.equal(psql(`select status||'|'||provider_mutation_performed from public.meta_optimization_execution_intents where id='${scaleIntent}';`), "succeeded|true");
  assert.equal(psql(`select receipt_status||'|'||reconciled from public.meta_optimization_action_receipts where execution_intent_id='${scaleIntent}';`), "succeeded|true");
  mustFail(`update public.meta_optimization_action_receipts set reconciled=false where execution_intent_id='${scaleIntent}';`, /append-only/, "Reject receipt rewrite");

  insertDecision(ids.malformedDecision, { impressions: "not-a-number", clicks: 100, spend: 100, leads: 0, ctr: 0.1, cpc: 1, cpl: 0, frequency: 2, lp_cvr: 0 }, "pause:-100:bad-input");
  psql(`update public.optimization_campaign_controls set last_provider_mutation_at=null,scale_applied_last_24h_percent=0,scale_window_started_at=null where campaign_id='${ids.campaign}';`);
  mustFail(
    `set role service_role; select set_config('request.jwt.claim.role','service_role',false); select id from public.enqueue_meta_optimization_execution_intent('${ids.organization}','${ids.customer}','${ids.campaign}','${ids.malformedDecision}','staging','pause','bad input',null,'malformed-metrics-contract');`,
    /below minimum data thresholds/,
    "Reject malformed metric without unsafe cast",
  );
  insertDecision(ids.driftDecision, { impressions: 2000, clicks: 50, spend: 100, leads: 0, ctr: 0.2, cpc: 2, cpl: 0, frequency: 2, lp_cvr: 0 }, "pause:-100:ctr_below_kill_threshold");
  const driftIntent = psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false); select id from public.enqueue_meta_optimization_execution_intent('${ids.organization}','${ids.customer}','${ids.campaign}','${ids.driftDecision}','staging','pause','ctr_below_kill_threshold',null,'activation-drift-intent');`).split("\n").at(-1);
  psql(`update public.meta_campaign_activation_intents set status='operator_required' where id='${ids.activation}';`);
  assert.equal(
    psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false); select count(*) from public.claim_meta_optimization_execution_intent('staging','optimizer-drift-worker',300);`).split("\n").at(-1),
    "0",
    "claim must reject drifted activation authority",
  );
  assert.equal(
    psql(`select status||'|'||last_error_code from public.meta_optimization_execution_intents where id='${driftIntent}';`),
    "blocked|meta_activation_authority_drifted",
  );
  psql(`update public.meta_campaign_activation_intents set status='active' where id='${ids.activation}';`);
  insertDecision(ids.pauseDecision, { impressions: 2000, clicks: 50, spend: 100, leads: 0, ctr: 0.2, cpc: 2, cpl: 0, frequency: 2, lp_cvr: 0 }, "pause:-100:ctr_below_kill_threshold");
  const pauseIntent = psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false); select id from public.enqueue_meta_optimization_execution_intent('${ids.organization}','${ids.customer}','${ids.campaign}','${ids.pauseDecision}','staging','pause','ctr_below_kill_threshold',null,'pause-intent-contract');`).split("\n").at(-1);
  const expiredPreEffectClaim = psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false); select id||'|'||worker_id||'|'||lease_token||'|'||lease_generation from public.claim_meta_optimization_execution_intent('staging','optimizer-worker-b',300);`).split("\n").at(-1).split("|");
  assert.equal(expiredPreEffectClaim[0], pauseIntent);
  psql(`update public.meta_optimization_execution_intents set locked_until=now()-interval '1 second' where id='${pauseIntent}';`);
  assert.equal(
    psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false); select public.release_meta_optimization_execution_claim('${pauseIntent}','${expiredPreEffectClaim[1]}','${expiredPreEffectClaim[2]}',${expiredPreEffectClaim[3]},'retry','expired-test','expired-test');`).split("\n").at(-1),
    "f",
    "expired pre-effect worker must not release its claim",
  );
  const pauseClaim = psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false); select id||'|'||worker_id||'|'||lease_token||'|'||lease_generation from public.claim_meta_optimization_execution_intent('staging','optimizer-worker-c',300);`).split("\n").at(-1).split("|");
  assert.equal(pauseClaim[0], pauseIntent);
  const pauseExecutionToken = psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false); select execution_token from public.arm_meta_optimization_execution_intent('${pauseIntent}','${pauseClaim[1]}','${pauseClaim[2]}',${pauseClaim[3]},'{"accountId":"${accountId}","campaignId":"${campaignId}","objectType":"campaign","objectId":"${campaignId}","currency":"CAD","configuredStatus":"ACTIVE","effectiveStatus":"ACTIVE","dailyBudgetMinor":null}');`).split("\n").at(-1);
  psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false); select dispatch_authority_nonce from public.confirm_meta_optimization_execution_dispatch('${pauseIntent}','${pauseClaim[1]}','${pauseClaim[2]}',${pauseClaim[3]},'${pauseExecutionToken}');`);
  psql(`update public.meta_optimization_execution_intents set locked_until=now()-interval '1 second' where id='${pauseIntent}';`);
  mustFail(
    `set role service_role; select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_optimization_execution_intent('${pauseIntent}','${pauseClaim[1]}','${pauseClaim[2]}',${pauseClaim[3]},'${pauseExecutionToken}','succeeded',true,'late-provider-receipt','{"accountId":"${accountId}","campaignId":"${campaignId}","objectType":"campaign","objectId":"${campaignId}","currency":"CAD","configuredStatus":"PAUSED","effectiveStatus":"PAUSED","dailyBudgetMinor":null}',null,null);`,
    /lease lost/,
    "expired armed worker must not settle a provider result",
  );
  psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false); select count(*) from public.claim_meta_optimization_execution_intent('staging','optimizer-worker-d',300);`);
  assert.equal(psql(`select status||'|'||last_error_code from public.meta_optimization_execution_intents where id='${pauseIntent}';`), "operator_required|armed_effect_lease_expired");

  assert.equal(psql(`set role authenticated; select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${ids.customer}',false); select public.revoke_meta_optimization_policy('${ids.organization}','${ids.campaign}','${policyId}','DISABLE_AUTONOMOUS_META_OPTIMIZATION');`).split("\n").at(-1), "t");
  assert.equal(psql(`select status from public.meta_optimization_policy_authorizations where id='${policyId}';`), "revoked");
  assert.equal(psql(`select execution_enabled||'|'||campaign_kill_switch from public.optimization_campaign_controls where campaign_id='${ids.campaign}';`), "false|true");

  console.log("customer-authorized Meta optimizer disposable DB: PASS (single-primary authority, activation-drift fencing, tenant fencing, immutable consent, default-closed runtime, CAS open, thresholds, idempotency, one-use dispatch, lease-expiry rejection, arm/settle, receipt, ambiguity, revocation)");
});
