#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const migration = readFileSync("supabase/migrations/20260713011000_create_customer_authorized_meta_activation.sql", "utf8");
const hardeningMigration = readFileSync("supabase/migrations/20260713012100_harden_meta_activation_delivery_and_recovery.sql", "utf8");
const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  expectedVersion: "17.6",
  databasePrefix: `dfma_${process.pid}_${randomBytes(3).toString("hex")}`,
  timeoutMs: 120_000,
  maxOutputBytes: 24 * 1024 * 1024,
});

const organizationId = "20000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000002";
const campaignA = "20000000-0000-4000-8000-000000000003";
const campaignB = "20000000-0000-4000-8000-000000000004";
const campaignC = "20000000-0000-4000-8000-000000000008";
const campaignD = "20000000-0000-4000-8000-000000000010";
const accountId = "20000000-0000-4000-8000-000000000005";
const launchA = "20000000-0000-4000-8000-000000000006";
const launchB = "20000000-0000-4000-8000-000000000007";
const launchC = "20000000-0000-4000-8000-000000000009";
const launchD = "20000000-0000-4000-8000-000000000011";
const launchDigestA = "a".repeat(64);
const launchDigestB = "b".repeat(64);
const launchDigestC = "3".repeat(64);
const launchDigestD = "5".repeat(64);
const approvalA = "c".repeat(64);
const approvalB = "d".repeat(64);
const approvalC = "4".repeat(64);
const approvalD = "6".repeat(64);
const stateDigest = "e".repeat(64);
const operatorProofDigest = "f".repeat(64);
const deliveryEvidenceDigest = "1".repeat(64);
const contractEvidenceDigest = "2".repeat(64);
const scheduledA = new Date(Date.now() - 10_000).toISOString();
const scheduledB = new Date(Date.now() - 5_000).toISOString();
const scheduledC = new Date(Date.now() - 1_000).toISOString();
const scheduledD = new Date(Date.now() - 500).toISOString();

await adapter.withDisposableDatabase(async (database) => {
  const psql = (sql) => database.psql(sql, {
    label: "Run Meta campaign activation proof statement",
  });

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
      ('${campaignB}', '${organizationId}', '${userId}'),
      ('${campaignC}', '${organizationId}', '${userId}'),
      ('${campaignD}', '${organizationId}', '${userId}');
    insert into public.marketing_accounts values
      ('${accountId}', '${organizationId}', 'meta_ads', 'connected', 'act_90000000001', 'encrypted', '{}');
    insert into public.campaign_launch_records values
      ('${launchA}', '${organizationId}', '${userId}', '${campaignA}', 'success', 'provider_paused',
       '{"provider":{"ad_account_id":"90000000001"},"delivery":{"daily_budget_minor":"5000"}}',
       '${launchDigestA}', '91000000001', '["92000000001"]', '["93000000001"]'),
      ('${launchB}', '${organizationId}', '${userId}', '${campaignB}', 'success', 'scheduled_provider_paused',
       '{"provider":{"ad_account_id":"90000000001"},"delivery":{"daily_budget_minor":"7500"}}',
       '${launchDigestB}', '91000000002', '["92000000002"]', '["93000000002"]'),
      ('${launchC}', '${organizationId}', '${userId}', '${campaignC}', 'success', 'provider_paused',
       '{"provider":{"ad_account_id":"90000000001"},"delivery":{"daily_budget_minor":"4000"}}',
       '${launchDigestC}', '91000000003', '["92000000003"]', '["93000000003"]'),
      ('${launchD}', '${organizationId}', '${userId}', '${campaignD}', 'success', 'provider_paused',
       '{"provider":{"ad_account_id":"90000000001"},"delivery":{"daily_budget_minor":"4500"}}',
       '${launchDigestD}', '91000000004', '["92000000004"]', '["93000000004"]');
  `);
  psql(migration);
  psql(hardeningMigration);

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
  const wrongBudget = database.psqlMustFail(
    `select set_config('request.jwt.claim.role','authenticated',false);
     select set_config('request.jwt.claim.sub','${userId}',false);
     select id from public.authorize_meta_campaign_activation(
       '${organizationId}','${campaignB}','${launchB}','${scheduledB}'::timestamptz,
       7600,'CAD','${approvalB}','activation-wrong-budget'
     );`,
    /customer-approved budget does not match/,
    { label: "Reject customer activation with a mismatched budget" },
  );
  assert.match(wrongBudget, /customer-approved budget does not match/);

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
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_campaign_activation('${activationA}','worker-a','${token}',${generation},'active',null,null);`).split("\n").at(-1), "f", "active settlement must fail without final delivery and full-contract evidence");
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.record_meta_campaign_activation_delivery_state('${activationA}','worker-a','${token}',${generation},'configured_active_pending_review','${deliveryEvidenceDigest}','${contractEvidenceDigest}');`).split("\n").at(-1), "t");
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_campaign_activation('${activationA}','worker-a','${token}',${generation},'active',null,null);`).split("\n").at(-1), "t");
  assert.match(psql(`select status || '|' || provider_delivery_status || '|' || (completed_at is not null) || '|' || (select count(*) from jsonb_object_keys(provider_receipt_summary)) from public.meta_campaign_activation_intents where id='${activationA}';`), /^active\|configured_active_pending_review\|true\|3$/);

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

  const recoveryObjectsB = psql(`select id || '|' || provider_object_type || '|' || provider_object_id from public.meta_campaign_activation_objects where activation_intent_id='${authorizedB}' order by sequence_number;`).split("\n");
  const [recoveryFirst, recoverySecond] = recoveryObjectsB;
  assert.equal(
    psql(`select set_config('request.jwt.claim.role','service_role',false); select public.reconcile_meta_campaign_activation_object('${authorizedB}','${recoverySecond.split("|")[0]}','active','${operatorProofDigest}','out-of-order-active','${stateDigest}');`).split("\n").at(-1),
    "f",
    "operator reconciliation must reject an ACTIVE hole",
  );
  assert.equal(
    psql(`select set_config('request.jwt.claim.role','service_role',false); select public.reconcile_meta_campaign_activation_object('${authorizedB}','${recoveryFirst.split("|")[0]}','active','${operatorProofDigest}','reconciled-${recoveryFirst.split("|")[2]}','${stateDigest}');`).split("\n").at(-1),
    "t",
  );
  assert.equal(
    psql(`select status from public.meta_campaign_activation_intents where id='${authorizedB}';`),
    "authorized",
    "an exact reconciled ACTIVE prefix plus untouched PAUSED suffix must become claimable again",
  );

  const recoveryClaimB = psql(`select set_config('request.jwt.claim.role','service_role',false); select activation_intent_id || '|' || processing_generation || '|' || processing_token || '|' || provider_objects::text from public.claim_due_meta_campaign_activation('worker-recovery','production',300);`).split("\n").at(-1);
  const [recoveryActivationId, recoveryGeneration, recoveryToken, recoveryObjectsJson] = recoveryClaimB.split("|", 4);
  assert.equal(recoveryActivationId, authorizedB);
  const recoveryClaimObjects = JSON.parse(recoveryObjectsJson);
  assert.deepEqual(
    recoveryClaimObjects.map((object) => `${object.status}:${object.mutationState}`),
    ["active:reconciled", "pending:idle", "pending:idle"],
    "the worker claim must preserve the exact DB-reconciled ACTIVE prefix",
  );

  for (const object of recoveryClaimObjects.slice(1)) {
    assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.arm_meta_campaign_activation_object('${authorizedB}','${object.id}','worker-recovery','${recoveryToken}',${recoveryGeneration});`).split("\n").at(-1), "t");
    assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.record_meta_campaign_activation_receipt('${authorizedB}','${object.id}','worker-recovery','${recoveryToken}',${recoveryGeneration},'receipt-${object.providerId}','${stateDigest}',jsonb_build_object('activationInputDigest',(select activation_input_digest from public.meta_campaign_activation_intents where id='${authorizedB}'),'providerObjectId','${object.providerId}','providerObjectType','${object.type}','observedStatus','ACTIVE'));`).split("\n").at(-1), "t");
    assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_campaign_activation_object('${authorizedB}','${object.id}','worker-recovery','${recoveryToken}',${recoveryGeneration});`).split("\n").at(-1), "t");
  }
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_campaign_activation('${authorizedB}','worker-recovery','${recoveryToken}',${recoveryGeneration},'active',null,null);`).split("\n").at(-1), "f");
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.record_meta_campaign_activation_delivery_state('${authorizedB}','worker-recovery','${recoveryToken}',${recoveryGeneration},'delivery_active','${deliveryEvidenceDigest}','${contractEvidenceDigest}');`).split("\n").at(-1), "t");
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_campaign_activation('${authorizedB}','worker-recovery','${recoveryToken}',${recoveryGeneration},'active',null,null);`).split("\n").at(-1), "t");
  assert.equal(psql(`select status || '|' || provider_delivery_status || '|' || (completed_at is not null) from public.meta_campaign_activation_intents where id='${authorizedB}';`), "active|delivery_active|true");

  const authorizedC = psql(`select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${userId}',false); select id from public.authorize_meta_campaign_activation('${organizationId}','${campaignC}','${launchC}','${scheduledC}'::timestamptz,4000,'CAD','${approvalC}','activation-contract-c');`).split("\n").at(-1);
  const claimC = psql(`select set_config('request.jwt.claim.role','service_role',false); select activation_intent_id || '|' || processing_generation || '|' || processing_token from public.claim_due_meta_campaign_activation('worker-c-reconcile','production',300);`).split("\n").at(-1);
  const [, generationC, tokenC] = claimC.split("|");
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_campaign_activation('${authorizedC}','worker-c-reconcile','${tokenC}',${generationC},'operator_required','synthetic_operator_review','Synthetic operator review.');`).split("\n").at(-1), "t");
  const reconciliationObjectsC = psql(`select id || '|' || provider_object_id from public.meta_campaign_activation_objects where activation_intent_id='${authorizedC}' order by sequence_number;`).split("\n");
  for (const row of reconciliationObjectsC) {
    const [objectId, providerId] = row.split("|");
    assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.reconcile_meta_campaign_activation_object('${authorizedC}','${objectId}','active','${operatorProofDigest}','reconciled-${providerId}','${stateDigest}');`).split("\n").at(-1), "t");
  }
  assert.equal(
    psql(`select status || '|' || provider_delivery_status || '|' || (provider_delivery_evidence_digest is null) || '|' || (provider_contract_evidence_digest is null) || '|' || (completed_at is null) from public.meta_campaign_activation_intents where id='${authorizedC}';`),
    "authorized|not_activated|true|true|true",
    "even an all-ACTIVE reconciliation must return to authorized replay with no final evidence",
  );
  const replayClaimC = psql(`select set_config('request.jwt.claim.role','service_role',false); select activation_intent_id || '|' || processing_generation || '|' || processing_token || '|' || provider_objects::text from public.claim_due_meta_campaign_activation('worker-c-final','production',300);`).split("\n").at(-1);
  const [replayActivationC, replayGenerationC, replayTokenC, replayObjectsCJson] = replayClaimC.split("|", 4);
  assert.equal(replayActivationC, authorizedC);
  assert.deepEqual(JSON.parse(replayObjectsCJson).map((object) => `${object.status}:${object.mutationState}`), ["active:reconciled", "active:reconciled", "active:reconciled"]);
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_campaign_activation('${authorizedC}','worker-c-final','${replayTokenC}',${replayGenerationC},'active',null,null);`).split("\n").at(-1), "f", "reconciliation must not bypass the final whole-contract verifier");
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.record_meta_campaign_activation_delivery_state('${authorizedC}','worker-c-final','${replayTokenC}',${replayGenerationC},'delivery_active','${deliveryEvidenceDigest}','${contractEvidenceDigest}');`).split("\n").at(-1), "t");
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_campaign_activation('${authorizedC}','worker-c-final','${replayTokenC}',${replayGenerationC},'active',null,null);`).split("\n").at(-1), "t");

  const authorizedD = psql(`select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${userId}',false); select id from public.authorize_meta_campaign_activation('${organizationId}','${campaignD}','${launchD}','${scheduledD}'::timestamptz,4500,'CAD','${approvalD}','activation-contract-d');`).split("\n").at(-1);
  const firstClaimD = psql(`select set_config('request.jwt.claim.role','service_role',false); select activation_intent_id || '|' || processing_generation || '|' || processing_token from public.claim_due_meta_campaign_activation('worker-d-read','production',300);`).split("\n").at(-1);
  const [, firstGenerationD, firstTokenD] = firstClaimD.split("|");
  assert.equal(
    psql(`select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_campaign_activation('${authorizedD}','worker-d-read','${firstTokenD}',${firstGenerationD},'retryable','meta_activation_provider_ambiguous','Synthetic transient provider read.');`).split("\n").at(-1),
    "t",
  );
  assert.equal(
    psql(`select status || '|' || last_error_code || '|' || (select string_agg(status || ':' || provider_mutation_state,',' order by sequence_number) from public.meta_campaign_activation_objects where activation_intent_id='${authorizedD}') from public.meta_campaign_activation_intents where id='${authorizedD}';`),
    "authorized|meta_activation_provider_ambiguous|pending:idle,pending:idle,pending:idle",
    "a transient pre-arm failure must return to authorized retry without operator escalation",
  );
  const secondClaimD = psql(`select set_config('request.jwt.claim.role','service_role',false); select activation_intent_id || '|' || processing_generation || '|' || processing_token from public.claim_due_meta_campaign_activation('worker-d-armed','production',300);`).split("\n").at(-1);
  const [, secondGenerationD, secondTokenD] = secondClaimD.split("|");
  const firstObjectD = psql(`select id from public.meta_campaign_activation_objects where activation_intent_id='${authorizedD}' order by sequence_number limit 1;`);
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.arm_meta_campaign_activation_object('${authorizedD}','${firstObjectD}','worker-d-armed','${secondTokenD}',${secondGenerationD});`).split("\n").at(-1), "t");
  assert.equal(
    psql(`select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_campaign_activation('${authorizedD}','worker-d-armed','${secondTokenD}',${secondGenerationD},'retryable','meta_activation_provider_ambiguous','Synthetic failure after arm.');`).split("\n").at(-1),
    "f",
    "an armed attempt must never be downgraded to safe retry",
  );
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select public.settle_meta_campaign_activation('${authorizedD}','worker-d-armed','${secondTokenD}',${secondGenerationD},'operator_required','meta_activation_provider_ambiguous','Synthetic failure after arm.');`).split("\n").at(-1), "t");

  console.log("Disposable PostgreSQL 17.6 Meta activation authority, exact budget, leases, fencing, receipts, delivery evidence, ordered reconciliation replay, and ambiguity tests passed.");
});
