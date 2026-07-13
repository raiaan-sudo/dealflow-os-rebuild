#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const authorityMigration = readFileSync("supabase/migrations/20260713011000_create_customer_authorized_meta_activation.sql", "utf8");
const instantFormMigration = readFileSync("supabase/migrations/20260712235991_create_meta_instant_form_provisioning.sql", "utf8");
const preauthorizationMigration = readFileSync("supabase/migrations/20260713012000_require_meta_activation_preauthorization.sql", "utf8");
const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  expectedVersion: "17.6",
  databasePrefix: `dfmp_${process.pid}_${randomBytes(3).toString("hex")}`,
  timeoutMs: 120_000,
  maxOutputBytes: 24 * 1024 * 1024,
});

const org = "21000000-0000-4000-8000-000000000001";
const customer = "21000000-0000-4000-8000-000000000002";
const outsider = "21000000-0000-4000-8000-000000000003";
const campaignA = "21000000-0000-4000-8000-000000000004";
const campaignB = "21000000-0000-4000-8000-000000000005";
const campaignC = "21000000-0000-4000-8000-000000000009";
const campaignD = "21000000-0000-4000-8000-000000000011";
const campaignE = "21000000-0000-4000-8000-000000000013";
const launchA = "21000000-0000-4000-8000-000000000006";
const launchB = "21000000-0000-4000-8000-000000000007";
const launchC = "21000000-0000-4000-8000-000000000010";
const launchD = "21000000-0000-4000-8000-000000000012";
const launchE = "21000000-0000-4000-8000-000000000014";
const account = "21000000-0000-4000-8000-000000000008";
const approvalA = "a".repeat(64);
const replacementApprovalA = "e".repeat(64);
const approvalB = "b".repeat(64);
const approvalC = "4".repeat(64);
const approvalD = "5".repeat(64);
const approvalE = "6".repeat(64);
const launchDigestA = "c".repeat(64);
const launchDigestB = "d".repeat(64);
const launchDigestC = "8".repeat(64);
const launchDigestD = "9".repeat(64);
const launchDigestE = "0".repeat(64);
const providerAdAccountId = "90000000001";
const providerPageId = "94000000001";
const providerPixelId = "95000000001";
const selectedAdA = "synthetic-selected-ad-a";
const selectedAdB = "synthetic-selected-ad-b";
const selectedAdC = "synthetic-selected-ad-c";
const selectedAdD = "synthetic-selected-ad-d";
const selectedAdE = "synthetic-selected-ad-e";
const adDestination = "website";
const destinationUrlA = "https://synthetic-a.example.invalid/lead";
const destinationUrlB = "https://synthetic-b.example.invalid/lead";
const destinationUrlC = "https://synthetic-c.example.invalid/lead";
const destinationUrlD = "https://synthetic-d.example.invalid/lead";
const destinationUrlE = "https://synthetic-e.example.invalid/lead";
const destinationUrlDigestA = createHash("sha256").update(destinationUrlA).digest("hex");
const destinationUrlDigestB = createHash("sha256").update(destinationUrlB).digest("hex");
const destinationUrlDigestC = createHash("sha256").update(destinationUrlC).digest("hex");
const destinationUrlDigestD = createHash("sha256").update(destinationUrlD).digest("hex");
const destinationUrlDigestE = createHash("sha256").update(destinationUrlE).digest("hex");
const scheduledA = new Date(Date.now() - 15_000).toISOString();
const scheduledB = new Date(Date.now() - 10_000).toISOString();
const scheduledC = new Date(Date.now() - 9_000).toISOString();
const scheduledD = new Date(Date.now() - 8_000).toISOString();
const scheduledE = new Date(Date.now() - 7_000).toISOString();
const formDefinitionDigestD = "7".repeat(64);

function launchApprovalSnapshot({ campaignId, selectedAdId, destinationUrl, budgetMinor, destination = "website", formDefinitionDigest = null }) {
  const objective = "OUTCOME_LEADS";
  const countryCode = "US";
  return {
    schema_version: 1,
    organization_id: org,
    campaign_id: campaignId,
    attempt_id: `synthetic-${campaignId.slice(-8)}`,
    provider: {
      ad_account_id: providerAdAccountId,
      account_currency: "CAD",
      page_id: providerPageId,
      pixel_id: providerPixelId,
    },
    creative: {
      selected_ad_id: selectedAdId,
      image_content_sha256: "1".repeat(64),
      primary_text_sha256: "2".repeat(64),
      headline_sha256: "3".repeat(64),
    },
    destination_url: destinationUrl,
    destination_host: new URL(destinationUrl).hostname,
    destination: {
      capture_experience: destination === "website" ? "dealflow_website" : "meta_instant_form",
      ad_destination: destination,
      provider_form_id: null,
      form_definition_digest: formDefinitionDigest,
    },
    delivery: {
      objective,
      country_code: countryCode,
      location: "Synthetic US market",
      daily_budget_minor: String(budgetMinor),
      special_ad_categories: ["HOUSING"],
    },
    provider_contract: {
      campaign: {
        objective,
        special_ad_categories: ["HOUSING"],
        special_ad_category_country: [countryCode],
        is_adset_budget_sharing_enabled: false,
      },
      ad_set: {
        billing_event: "IMPRESSIONS",
        optimization_goal: destination === "meta_instant_form" ? "LEAD_GENERATION" : "OFFSITE_CONVERSIONS",
        daily_budget_minor: String(budgetMinor),
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        targeting: { geo_locations: { countries: [countryCode] } },
        destination_type: destination === "meta_instant_form" ? "ON_AD" : null,
        promoted_object: destination === "meta_instant_form"
          ? { page_id: providerPageId }
          : { pixel_id: providerPixelId, custom_event_type: "LEAD" },
        tracking_specs: destination === "meta_instant_form"
          ? []
          : [{ action_type: ["offsite_conversion"], fb_pixel: [providerPixelId] }],
      },
      creative: {
        page_id: providerPageId,
        call_to_action_type: "LEARN_MORE",
        link: destination === "meta_instant_form" ? "https://fb.me/" : destinationUrl,
        cta_link: destination === "meta_instant_form" ? null : destinationUrl,
        provider_form_binding: destination === "meta_instant_form" ? "provisioning_receipt" : null,
      },
    },
  };
}

const snapshotA = launchApprovalSnapshot({ campaignId: campaignA, selectedAdId: selectedAdA, destinationUrl: destinationUrlA, budgetMinor: 5000 });
const snapshotB = launchApprovalSnapshot({ campaignId: campaignB, selectedAdId: selectedAdB, destinationUrl: destinationUrlB, budgetMinor: 7600 });
const snapshotC = launchApprovalSnapshot({ campaignId: campaignC, selectedAdId: selectedAdC, destinationUrl: destinationUrlC, budgetMinor: 4200 });
const snapshotD = launchApprovalSnapshot({ campaignId: campaignD, selectedAdId: selectedAdD, destinationUrl: destinationUrlD, budgetMinor: 4300, destination: "meta_instant_form", formDefinitionDigest: formDefinitionDigestD });
const snapshotE = launchApprovalSnapshot({ campaignId: campaignE, selectedAdId: selectedAdE, destinationUrl: destinationUrlE, budgetMinor: 4400 });
const driftedSnapshotB = structuredClone(snapshotB);
driftedSnapshotB.delivery.daily_budget_minor = "7500";
driftedSnapshotB.provider_contract.ad_set.daily_budget_minor = "7500";

await adapter.withDisposableDatabase(async (database) => {
  const psql = (sql) => database.psql(sql, {
    label: "Run Meta activation preauthorization proof statement",
  });

  psql(`
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
    create schema if not exists auth;
    create schema if not exists private;
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
      user_id uuid not null references auth.users(id), plan jsonb not null,
      unique(id, organization_id, user_id), unique(id, organization_id)
    );
    create table if not exists public.marketing_accounts (
      id uuid primary key, organization_id uuid not null references public.organizations(id),
      platform text not null, status text not null, external_account_id text not null,
      access_token_encrypted text, connection_metadata jsonb
    );
    create table if not exists public.campaign_launch_records (
      id uuid primary key, organization_id uuid not null, user_id uuid not null,
      campaign_id uuid not null, campaign_name text not null, result_status text not null, launch_mode text not null,
      scheduled_for timestamptz, launch_input_snapshot jsonb, launch_input_digest text,
      meta_campaign_id text, meta_ad_set_ids jsonb not null default '[]', meta_creative_id text,
      meta_ad_ids jsonb not null default '[]',
      schedule_next_attempt_at timestamptz, schedule_locked_until timestamptz,
      schedule_locked_by text, schedule_lease_token uuid, schedule_lease_generation bigint not null default 0,
      execution_metadata jsonb not null default '{}', event_timeline jsonb not null default '[]',
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
    );
    create table public.campaign_launch_provider_receipts (
      id uuid primary key default gen_random_uuid(),
      launch_id uuid not null references public.campaign_launch_records(id),
      organization_id uuid not null references public.organizations(id),
      campaign_id uuid not null,
      lease_generation bigint not null,
      stage text not null,
      object_id text not null,
      response_status integer not null,
      launch_input_digest text not null,
      created_at timestamptz not null default timezone('utc', now()),
      foreign key (campaign_id, organization_id) references public.campaign_plans(id, organization_id)
    );
    insert into auth.users (id) values ('${customer}'), ('${outsider}');
    insert into public.organizations values ('${org}');
    insert into public.campaign_plans values
      ('${campaignA}','${org}','${customer}',
       '{"daily_budget_cents":"5000","selected_ad_id":"${selectedAdA}","ad_destination":"${adDestination}"}'),
      ('${campaignB}','${org}','${customer}',
       '{"daily_budget_cents":"7600","selected_ad_id":"${selectedAdB}","ad_destination":"${adDestination}"}'),
      ('${campaignC}','${org}','${customer}',
       '{"daily_budget_cents":"4200","selected_ad_id":"${selectedAdC}","ad_destination":"website"}'),
      ('${campaignD}','${org}','${customer}',
       '{"daily_budget_cents":"4300","selected_ad_id":"${selectedAdD}","ad_destination":"meta_instant_form"}'),
      ('${campaignE}','${org}','${customer}',
       '{"daily_budget_cents":"4400","selected_ad_id":"${selectedAdE}","ad_destination":"website"}');
    insert into public.marketing_accounts values
      ('${account}','${org}','meta_ads','connected','act_${providerAdAccountId}','encrypted',
       '{"selected_external_account_id":"act_${providerAdAccountId}","selected_page_id":"${providerPageId}","pixel_id":"${providerPixelId}"}');
    insert into public.campaign_launch_records (
      id,organization_id,user_id,campaign_id,campaign_name,result_status,launch_mode,scheduled_for
    ) values
      ('${launchA}','${org}','${customer}','${campaignA}','Synthetic A','scheduled','scheduled_provider_paused','${scheduledA}'),
      ('${launchB}','${org}','${customer}','${campaignB}','Synthetic B','scheduled','scheduled_provider_paused','${scheduledB}'),
      ('${launchC}','${org}','${customer}','${campaignC}','Synthetic C','scheduled','scheduled_provider_paused','${scheduledC}'),
      ('${launchD}','${org}','${customer}','${campaignD}','Synthetic D','scheduled','scheduled_provider_paused','${scheduledD}'),
      ('${launchE}','${org}','${customer}','${campaignE}','Synthetic E','scheduled','scheduled_provider_paused','${scheduledE}');
  `);
  psql(authorityMigration);
  psql(instantFormMigration);
  psql(preauthorizationMigration);

  assert.equal(psql("select has_function_privilege('authenticated','public.authorize_meta_campaign_activation(uuid,uuid,uuid,timestamptz,bigint,text,text,text)','EXECUTE');"), "f");
  assert.equal(psql("select has_function_privilege('authenticated','public.preauthorize_meta_campaign_activation(uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,text,text)','EXECUTE');"), "f");
  assert.equal(psql("select has_function_privilege('service_role','public.preauthorize_meta_campaign_activation(uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,text,text)','EXECUTE');"), "t");
  assert.equal(psql("select has_table_privilege('authenticated','public.meta_campaign_activation_preauthorizations','SELECT');"), "f");

  const authorizeA = (idempotencyKey, approvalDigest = approvalA) => `
    select id || '|' || status || '|' || launch_record_id
    from public.preauthorize_meta_campaign_activation(
      '${org}', '${customer}', '${campaignA}', 5000, 'cad', '${providerAdAccountId}',
      '${providerPageId}', '${providerPixelId}', '${selectedAdA}', '${adDestination}',
      '${destinationUrlDigestA}', '${JSON.stringify(snapshotA)}'::jsonb,
      '${approvalDigest}', '${idempotencyKey}'
    );`;
  const authorizedA = psql(`
    select set_config('request.jwt.claim.role','service_role',false);
    ${authorizeA("preauth-contract-a")}
  `).split("\n").at(-1);
  assert.match(authorizedA, new RegExp(`\\|authorized\\|${launchA}$`));
  const authorizationA = authorizedA.split("|")[0];
  const replayA = psql(`
    select set_config('request.jwt.claim.role','service_role',false);
    ${authorizeA("preauth-contract-a-replay")}
  `).split("\n").at(-1);
  assert.equal(replayA.split("|")[0], authorizationA);
  assert.equal(
    psql(`select idempotency_key from public.meta_campaign_activation_preauthorizations where id='${authorizationA}';`),
    "preauth-contract-a:1",
    "replay with a new idempotency key must return, not rewrite, the exact authorization",
  );
  assert.equal(
    psql(`select concat_ws('|', provider_ad_account_id, provider_page_id, provider_pixel_id,
      selected_ad_id, ad_destination, destination_url_digest)
      from public.meta_campaign_activation_preauthorizations where id='${authorizationA}';`),
    `${providerAdAccountId}|${providerPageId}|${providerPixelId}|${selectedAdA}|${adDestination}|${destinationUrlDigestA}`,
    "customer authority must freeze the complete provider and destination snapshot",
  );
  const immutableRewrite = database.psqlMustFail(
    `update public.meta_campaign_activation_preauthorizations
       set approved_daily_budget_minor=5100 where id='${authorizationA}';`,
    /preauthorization identity is immutable/,
    { label: "Reject immutable Meta activation preauthorization rewrite" },
  );
  assert.match(immutableRewrite, /preauthorization identity is immutable/);

  const crossUser = database.psqlMustFail(
    `select set_config('request.jwt.claim.role','service_role',false);
     select id from public.preauthorize_meta_campaign_activation(
       '${org}', '${outsider}', '${campaignA}', 5000, 'CAD', '${providerAdAccountId}',
       '${providerPageId}', '${providerPixelId}', '${selectedAdA}', '${adDestination}',
       '${destinationUrlDigestA}', '${JSON.stringify(snapshotA)}'::jsonb,
       '${approvalA}', 'outsider-denied'
     );`,
    /campaign authority is missing/,
    { label: "Reject cross-user Meta activation preauthorization" },
  );
  assert.match(crossUser, /campaign authority is missing/);

  assert.equal(
    psql(`select set_config('request.jwt.claim.role','authenticated',false);
      select set_config('request.jwt.claim.sub','${customer}',false);
      select public.cancel_meta_campaign_activation_preauthorization(
        '${authorizationA}','${org}','${campaignA}'
      );`).split("\n").at(-1),
    "t",
  );
  assert.equal(
    psql(`select status from public.meta_campaign_activation_preauthorizations where id='${authorizationA}';`),
    "cancelled",
  );
  const replacementAuthorizedA = psql(`
    select set_config('request.jwt.claim.role','service_role',false);
    ${authorizeA("preauth-contract-a-replacement", replacementApprovalA)}
  `).split("\n").at(-1);
  assert.match(replacementAuthorizedA, new RegExp(`\\|authorized\\|${launchA}$`));
  const replacementAuthorizationA = replacementAuthorizedA.split("|")[0];
  assert.notEqual(
    replacementAuthorizationA,
    authorizationA,
    "fresh consent after cancellation must create a new immutable authorization",
  );

  psql(`update public.campaign_launch_records set
    result_status='success', launch_mode='provider_paused',
    launch_input_snapshot='${JSON.stringify(snapshotA)}'::jsonb,
    launch_input_digest='${launchDigestA}', meta_campaign_id='91000000001',
    meta_ad_set_ids='["92000000001"]', meta_creative_id='92500000001',
    meta_ad_ids='["93000000001"]', schedule_lease_generation=1
    where id='${launchA}';`);
  psql(`insert into public.campaign_launch_provider_receipts
    (launch_id,organization_id,campaign_id,lease_generation,stage,object_id,response_status,launch_input_digest)
    values
      ('${launchA}','${org}','${campaignA}',1,'campaign','91000000001',200,'${launchDigestA}'),
      ('${launchA}','${org}','${campaignA}',1,'adset','92000000001',200,'${launchDigestA}'),
      ('${launchA}','${org}','${campaignA}',1,'creative','92500000001',200,'${launchDigestA}'),
      ('${launchA}','${org}','${campaignA}',1,'ad','93000000001',200,'${launchDigestA}');`);
  const finalizedA = psql(`select set_config('request.jwt.claim.role','service_role',false); select finalization_status || '|' || activation_intent_id from public.finalize_meta_campaign_activation_preauthorization('${org}','${customer}','${campaignA}','${launchA}');`).split("\n").at(-1);
  assert.match(finalizedA, /^finalized\|[0-9a-f-]{36}$/);
  const activationA = finalizedA.split("|")[1];
  assert.equal(psql(`select provider_ad_account_id || '|' || approved_currency || '|' || approved_daily_budget_minor from public.meta_campaign_activation_intents where id='${activationA}';`), "90000000001|CAD|5000");
  assert.equal(psql(`select string_agg(provider_object_type,',' order by sequence_number) from public.meta_campaign_activation_objects where activation_intent_id='${activationA}';`), "ad,adset,campaign");
  assert.match(psql(`select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${customer}',false); select authorization_status || '|' || activation_intent_id from public.get_meta_campaign_activation_authorization_status('${org}','${campaignA}');`).split("\n").at(-1), new RegExp(`^finalized\\|${activationA}$`));
  assert.equal(psql(`select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${customer}',false); select public.cancel_meta_campaign_activation_preauthorization('${replacementAuthorizationA}','${org}','${campaignA}');`).split("\n").at(-1), "t");
  assert.equal(psql(`select status from public.meta_campaign_activation_intents where id='${activationA}';`), "cancelled");

  psql(`select set_config('request.jwt.claim.role','service_role',false);
    select id from public.preauthorize_meta_campaign_activation(
      '${org}', '${customer}', '${campaignB}', 7600, 'CAD', '${providerAdAccountId}',
      '${providerPageId}', '${providerPixelId}', '${selectedAdB}', '${adDestination}',
      '${destinationUrlDigestB}', '${JSON.stringify(snapshotB)}'::jsonb,
      '${approvalB}', 'preauth-contract-b'
    );`);
  psql(`update public.campaign_launch_records set
    result_status='success', launch_mode='scheduled_provider_paused',
    launch_input_snapshot='${JSON.stringify(driftedSnapshotB)}'::jsonb,
    launch_input_digest='${launchDigestB}', meta_campaign_id='91000000002',
    meta_ad_set_ids='["92000000002"]', meta_creative_id='92500000002',
    meta_ad_ids='["93000000002"]', schedule_lease_generation=1
    where id='${launchB}';`);
  assert.equal(psql(`select set_config('request.jwt.claim.role','service_role',false); select finalization_status || '|' || error_code from public.finalize_meta_campaign_activation_preauthorization('${org}','${customer}','${campaignB}','${launchB}');`).split("\n").at(-1), "operator_required|meta_activation_immutable_input_mismatch");
  assert.equal(psql(`select count(*) from public.meta_campaign_activation_intents where launch_record_id='${launchB}';`), "0");

  const authorizationC = psql(`select set_config('request.jwt.claim.role','service_role',false);
    select id from public.preauthorize_meta_campaign_activation(
      '${org}','${customer}','${campaignC}',4200,'CAD','${providerAdAccountId}',
      '${providerPageId}','${providerPixelId}','${selectedAdC}','website',
      '${destinationUrlDigestC}','${JSON.stringify(snapshotC)}'::jsonb,
      '${approvalC}','preauth-contract-c'
    );`).split("\n").at(-1);
  psql(`update public.campaign_launch_records set
    result_status='success',launch_mode='provider_paused',launch_input_snapshot='${JSON.stringify(snapshotC)}'::jsonb,
    launch_input_digest='${launchDigestC}',meta_campaign_id='91000000003',meta_ad_set_ids='["92000000003"]',
    meta_creative_id='92500000003',meta_ad_ids='["93000000003"]',schedule_lease_generation=1
    where id='${launchC}';`);
  assert.equal(
    psql(`select set_config('request.jwt.claim.role','service_role',false); select finalization_status || '|' || error_code from public.finalize_meta_campaign_activation_preauthorization('${org}','${customer}','${campaignC}','${launchC}');`).split("\n").at(-1),
    "operator_required|meta_activation_creation_receipt_mismatch",
    "finalization must fail closed when any durable provider creation receipt is absent",
  );
  assert.equal(psql(`select status from public.meta_campaign_activation_preauthorizations where id='${authorizationC}';`), "operator_required");
  assert.equal(psql(`select count(*) from public.meta_campaign_activation_intents where launch_record_id='${launchC}';`), "0");

  const authorizationD = psql(`select set_config('request.jwt.claim.role','service_role',false);
    select id from public.preauthorize_meta_campaign_activation(
      '${org}','${customer}','${campaignD}',4300,'CAD','${providerAdAccountId}',
      '${providerPageId}','${providerPixelId}','${selectedAdD}','meta_instant_form',
      '${destinationUrlDigestD}','${JSON.stringify(snapshotD)}'::jsonb,
      '${approvalD}','preauth-contract-d'
    );`).split("\n").at(-1);
  const formProcessingToken = "21000000-0000-4000-8000-000000000015";
  const formReacquireToken = "21000000-0000-4000-8000-000000000016";
  const formProviderId = "96000000001";
  const formProvisioningId = "21000000-0000-4000-8000-000000000017";
  const launchLeaseTokenD = "21000000-0000-4000-8000-000000000018";
  psql(`update public.campaign_launch_records set
    result_status='processing',launch_mode='scheduled_provider_paused',launch_input_snapshot='${JSON.stringify(snapshotD)}'::jsonb,
    launch_input_digest='${launchDigestD}',schedule_locked_by='form-worker',schedule_lease_token='${launchLeaseTokenD}',
    schedule_lease_generation=1,schedule_locked_until=timezone('utc',now())+interval '5 minutes'
    where id='${launchD}';
    insert into public.meta_instant_form_provisioning (
      id,organization_id,user_id,campaign_id,marketing_account_id,provider_page_id,form_name,definition_digest,
      status,processing_token,processing_generation,processing_locked_until,provider_mutation_state,subscription_state,attempt_count
    ) values (
      '${formProvisioningId}','${org}','${customer}','${campaignD}','${account}','${providerPageId}',
      'Synthetic DealFlow Instant Form','${formDefinitionDigestD}','processing','${formProcessingToken}',1,
      timezone('utc',now())+interval '5 minutes','idle','pending',1
    );`);
  const [formArmOutput, concurrentCancelOutput] = await database.psqlConcurrent([
    `select set_config('request.jwt.claim.role','service_role',false);
     select public.arm_meta_instant_form_provider_mutation('${formProvisioningId}','${formProcessingToken}',1);`,
    `select set_config('request.jwt.claim.role','authenticated',false);
     select set_config('request.jwt.claim.sub','${customer}',false);
     select public.cancel_meta_campaign_activation_preauthorization('${authorizationD}','${org}','${campaignD}');`,
  ], { label: "Prove form arm and customer cancellation serialize without deadlock" });
  assert.equal(formArmOutput.split("\n").at(-1), "t");
  assert.equal(concurrentCancelOutput.split("\n").at(-1), "f");
  assert.equal(psql(`select provider_mutation_state from public.meta_instant_form_provisioning where id='${formProvisioningId}';`), "armed");
  psql(`update public.meta_instant_form_provisioning set
      provider_form_id='${formProviderId}',provider_mutation_state='receipted',subscription_state='subscribed',
      subscription_receipted_at=timezone('utc',now()),subscription_evidence_digest='${"a".repeat(64)}',
      status='created',processing_token=null,processing_locked_until=null,completed_at=timezone('utc',now())
    where id='${formProvisioningId}';
    update public.campaign_launch_records set result_status='scheduled',schedule_locked_by=null,schedule_lease_token=null,
      schedule_locked_until=null where id='${launchD}';`);
  assert.equal(
    psql(`select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${customer}',false); select public.cancel_meta_campaign_activation_preauthorization('${authorizationD}','${org}','${campaignD}');`).split("\n").at(-1),
    "f",
    "a durably created/evidenced form must fence cancellation even after the launch lock is released",
  );
  psql(`update public.campaign_launch_records set result_status='processing',schedule_locked_by='form-worker',
    schedule_lease_token='${launchLeaseTokenD}',schedule_locked_until=timezone('utc',now())+interval '5 minutes'
    where id='${launchD}';`);
  const reacquiredForm = psql(`select set_config('request.jwt.claim.role','service_role',false);
    select provisioning_id || '|' || acquired || '|' || provisioning_status || '|' || provider_form_id || '|' || processing_generation || '|' || subscription_state
    from public.reacquire_meta_instant_form_verification('${formProvisioningId}','${formReacquireToken}',300);`).split("\n").at(-1);
  assert.equal(reacquiredForm, `${formProvisioningId}|true|processing|${formProviderId}|2|pending`);

  const authorizationE = psql(`select set_config('request.jwt.claim.role','service_role',false);
    select id from public.preauthorize_meta_campaign_activation(
      '${org}','${customer}','${campaignE}',4400,'CAD','${providerAdAccountId}',
      '${providerPageId}','${providerPixelId}','${selectedAdE}','website',
      '${destinationUrlDigestE}','${JSON.stringify(snapshotE)}'::jsonb,
      '${approvalE}','preauth-contract-e'
    );`).split("\n").at(-1);
  psql(`update public.campaign_launch_records set
    result_status='success',launch_mode='provider_paused',launch_input_snapshot='${JSON.stringify(snapshotE)}'::jsonb,
    launch_input_digest='${launchDigestE}',meta_campaign_id='91000000005',meta_ad_set_ids='["92000000005"]',
    meta_creative_id='92500000005',meta_ad_ids='["93000000005"]',schedule_lease_generation=1
    where id='${launchE}';
    insert into public.campaign_launch_provider_receipts
      (launch_id,organization_id,campaign_id,lease_generation,stage,object_id,response_status,launch_input_digest)
    values
      ('${launchE}','${org}','${campaignE}',1,'campaign','91000000005',200,'${launchDigestE}'),
      ('${launchE}','${org}','${campaignE}',1,'adset','92000000005',200,'${launchDigestE}'),
      ('${launchE}','${org}','${campaignE}',1,'creative','92500000005',200,'${launchDigestE}'),
      ('${launchE}','${org}','${campaignE}',1,'ad','93000000005',200,'${launchDigestE}');`);
  const [finalizeRaceOutput, cancelRaceOutput] = await database.psqlConcurrent([
    `select set_config('request.jwt.claim.role','service_role',false);
     select finalization_status from public.finalize_meta_campaign_activation_preauthorization('${org}','${customer}','${campaignE}','${launchE}');`,
    `select set_config('request.jwt.claim.role','authenticated',false);
     select set_config('request.jwt.claim.sub','${customer}',false);
     select public.cancel_meta_campaign_activation_preauthorization('${authorizationE}','${org}','${campaignE}');`,
  ], { label: "Prove finalization and cancellation serialize without deadlock" });
  assert.equal(finalizeRaceOutput.split("\n").at(-1), "finalized");
  assert.match(cancelRaceOutput.split("\n").at(-1), /^(t|f)$/);
  assert.match(psql(`select status from public.meta_campaign_activation_preauthorizations where id='${authorizationE}';`), /^(finalized|cancelled)$/);
  assert.equal(psql(`select count(*) from public.meta_campaign_activation_intents where launch_record_id='${launchE}';`), "1");

  assert.match(preauthorizationMigration, /select \* into launch[\s\S]*for update;[\s\S]*select \* into preauth[\s\S]*for update;/);
  console.log("Disposable PostgreSQL Meta preauthorization, immutable authority, receipt completeness, Instant Form fencing/reacquisition, lock ordering/concurrency, finalization, cancellation, and mismatch tests passed.");
});
