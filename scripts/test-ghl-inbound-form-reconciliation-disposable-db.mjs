#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const EXPECTED_MIGRATION_COUNT = 120;
const TARGET_MIGRATION = "20260713022000_reconcile_native_ghl_form_submissions.sql";
const REQUIRED_FINAL_MIGRATION = "20260717090000_create_canonical_lead_outcome_ledger.sql";
const TRANSACTION_OWNING_MIGRATION = "20260710160000_validate_and_normalize_pre_candidate_shape.sql";
const migrations = readdirSync(MIGRATIONS)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();
const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  expectedVersion: "17.6",
  databasePrefix: `dfghli_${process.pid}_${randomBytes(2).toString("hex")}`,
  timeoutMs: 180_000,
  maxOutputBytes: 64 * 1024 * 1024,
});

function transactionSafeSource(file, source) {
  const begins = [...source.matchAll(/^BEGIN;\s*$/gim)];
  const commits = [...source.matchAll(/^COMMIT;\s*$/gim)];
  if (file === TRANSACTION_OWNING_MIGRATION) {
    assert.equal(begins.length, 1);
    assert.equal(commits.length, 1);
    return source.replace(/^BEGIN;\s*$/im, "").replace(/^COMMIT;\s*$/im, "");
  }
  assert.equal(begins.length, 0, `${file} unexpectedly owns a transaction`);
  assert.equal(commits.length, 0, `${file} unexpectedly owns a transaction`);
  return source;
}

function installRemoteEquivalentDefaults(session) {
  session.psql(`
    alter default privileges in schema public grant all privileges on tables to postgres;
    alter default privileges in schema public grant all privileges on sequences to postgres;
    alter default privileges in schema public grant all privileges on functions to postgres;
    alter default privileges in schema public revoke usage on types from anon, authenticated, service_role;
    set role postgres;
    alter default privileges in schema public grant all privileges on tables to postgres, anon, authenticated, service_role;
    alter default privileges in schema public grant all privileges on sequences to postgres, anon, authenticated, service_role;
    alter default privileges in schema public grant all privileges on functions to postgres, anon, authenticated, service_role;
    alter default privileges in schema public revoke usage on types from anon, authenticated, service_role;
    reset role;
    drop extension pgcrypto;
    set role postgres;
    create extension pgcrypto with schema extensions;
    create extension if not exists pg_stat_statements with schema extensions;
    create extension if not exists "uuid-ossp" with schema extensions;
    create publication supabase_realtime;
    create schema if not exists storage;
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null,
      name text not null,
      unique (bucket_id, name)
    );
    grant usage on schema storage to anon, authenticated, service_role;
    grant select, insert, update, delete on storage.objects
      to anon, authenticated, service_role;
    reset role;
  `, { label: "Install remote-equivalent defaults and isolated Storage table" });
}

function applyCompleteMigrationChain(session) {
  session.psql(`
    set role postgres;
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[] not null default array[]::text[]
    );
    reset role;
  `, { label: "Create isolated migration history" });
  for (const file of migrations) {
    const version = file.slice(0, 14);
    const source = transactionSafeSource(file, readFileSync(join(MIGRATIONS, file), "utf8"));
    session.psql(`
      begin;
      set role postgres;
      ${source}
      insert into supabase_migrations.schema_migrations(version, statements)
      values ('${version}', array[]::text[]);
      reset role;
      commit;
    `, { label: `Apply ${file}`, timeoutMs: 180_000 });
  }
}

function assertPrivilegeMatrix(session, signature, expected) {
  assert.equal(session.psql(`
    select
      has_function_privilege('anon', '${signature}', 'EXECUTE') || '|' ||
      has_function_privilege('authenticated', '${signature}', 'EXECUTE') || '|' ||
      has_function_privilege('service_role', '${signature}', 'EXECUTE');
  `, { label: `Verify ACL ${signature}` }), expected);
}

const IDS = Object.freeze({
  organization: "61000000-0000-4000-8000-000000000001",
  user: "61000000-0000-4000-8000-000000000002",
  activation: "61000000-0000-4000-8000-000000000003",
  installation: "61000000-0000-4000-8000-000000000004",
  manifest: "61000000-0000-4000-8000-000000000005",
  mapping: "61000000-0000-4000-8000-000000000006",
  campaignA: "61000000-0000-4000-8000-000000000007",
  campaignB: "61000000-0000-4000-8000-000000000008",
  runA: "61000000-0000-4000-8000-000000000009",
  runB: "61000000-0000-4000-8000-000000000010",
  otherOrganization: "62000000-0000-4000-8000-000000000001",
  otherUser: "62000000-0000-4000-8000-000000000002",
  inactiveMapping: "61000000-0000-4000-8000-000000000011",
  otherActivation: "62000000-0000-4000-8000-000000000003",
  ineligibleMapping: "62000000-0000-4000-8000-000000000004",
  campaignC: "62000000-0000-4000-8000-000000000005",
  runC: "62000000-0000-4000-8000-000000000006",
  retiringRun: "61000000-0000-4000-8000-000000000012",
  retiringActivationRequest: "61000000-0000-4000-8000-000000000013",
  retiringRunLease: "61000000-0000-4000-8000-000000000014",
});

const FP = Object.freeze({
  a: "a".repeat(64), b: "b".repeat(64), c: "c".repeat(64),
  d: "d".repeat(64), e: "e".repeat(64), f: "f".repeat(64),
  one: "1".repeat(64), two: "2".repeat(64), three: "3".repeat(64),
  four: "4".repeat(64), five: "5".repeat(64), six: "6".repeat(64),
  seven: "7".repeat(64), eight: "8".repeat(64), nine: "9".repeat(64),
});

function fields(values) {
  return JSON.stringify({ fields: values.map(([id, value]) => ({ id, value })) }).replaceAll("'", "''");
}

function ingestContact(session, {
  eventId,
  contactId,
  eventType = "ContactCreate",
  at,
  fingerprint = FP.a,
  environment = "sandbox",
  locationId = "location-synthetic",
}) {
  return session.psql(`
    begin;
    set local role service_role;
    select concat_ws('|', id::text, projection_status, projection_code, organization_id::text)
    from public.ingest_ghl_lifecycle_webhook_v1(
      '${locationId}', '${environment}', '${eventId}', '${eventType}', '${contactId}', '${contactId}',
      null, null, null, null, '${at}'::timestamptz, '${fingerprint}', '${at}'::timestamptz
    );
    commit;
  `, { label: `Ingest ${eventType} ${eventId}` });
}

function claimReconciliation(session, { worker, at, leaseMs = 60000 }) {
  const output = session.psql(`
    begin;
    set local role service_role;
    select concat_ws('|', id::text, lease_token::text, lease_generation::text, attempt_count::text,
      organization_id::text, location_mapping_id::text, provider_contact_id)
    from public.claim_next_ghl_inbound_form_reconciliation_v1(
      'sandbox', '${worker}', '${at}'::timestamptz, ${leaseMs}
    );
    commit;
  `, { label: `Claim GHL inbound reconciliation ${worker}` });
  if (!output) return null;
  const [id, token, generation, attempt, organizationId, mappingId, contactId] = output.split("|");
  return { id, token, generation: Number(generation), attempt: Number(attempt), organizationId, mappingId, contactId, worker };
}

function settleReconciliation(session, claim, {
  at,
  outcome = "retryable_failure",
  errorCode = "synthetic_provider_timeout",
  retryAfterMs = 1000,
}) {
  return session.psql(`
    begin;
    set local role service_role;
    select concat_ws('|', status, attempt_count::text, last_error_code, coalesce(next_retry_at::text, ''))
    from public.settle_ghl_inbound_form_reconciliation_v1(
      '${claim.id}', '${claim.worker}', '${claim.token}', ${claim.generation},
      '${outcome}', '${errorCode}', 'Synthetic safe failure', ${retryAfterMs},
      'request-${claim.attempt}', '${FP.e}', '${at}'::timestamptz
    );
    commit;
  `, { label: `Settle GHL inbound reconciliation ${claim.id}` });
}

function completeEmpty(session, claim, { at, request = "request-empty" }) {
  return session.psql(`
    begin;
    set local role service_role;
    select concat_ws('|', status, provider_read_count::text, coalesce(last_error_code, ''))
    from public.complete_ghl_inbound_form_reconciliation_without_submission_v1(
      '${claim.id}', '${claim.worker}', '${claim.token}', ${claim.generation},
      '${request}', '${FP.f}', '${at}'::timestamptz
    );
    commit;
  `, { label: `Complete empty GHL inbound reconciliation ${claim.id}` });
}

function applySubmission(session, claim, {
  submissionId,
  formId,
  contactId = claim.contactId,
  submittedAt,
  email = "synthetic.lead@example.test",
  phone = "+14165551212",
  phoneRaw = "(416) 555-1212",
  qualification,
  attribution = {},
  fingerprint,
  hasMore = false,
  now,
}) {
  const qualificationJson = fields(qualification);
  const attributionJson = JSON.stringify(attribution).replaceAll("'", "''");
  return session.psql(`
    begin;
    set local role service_role;
    set local "request.jwt.claim.role" = 'service_role';
    select concat_ws('|', status, captured_submission_count::text,
      coalesce(resolved_lead_id::text, ''), coalesce(last_error_code, ''))
    from public.apply_ghl_inbound_form_submission_v1(
      '${claim.id}', '${claim.worker}', '${claim.token}', ${claim.generation},
      '${submissionId}', '${formId}', '${contactId}', '${submittedAt}'::timestamptz,
      'Synthetic Lead', 'Synthetic', 'Lead', ${email === null ? "null" : `'${email}'`},
      ${phone === null ? "null" : `'${phone}'`}, ${phoneRaw === null ? "null" : `'${phoneRaw}'`},
      '${qualificationJson}'::jsonb, '${attributionJson}'::jsonb, '${fingerprint}', ${hasMore},
      'request-${submissionId}', '${FP.d}', '${now}'::timestamptz
    );
    commit;
  `, { label: `Apply GHL form submission ${submissionId}` });
}

async function proveBehavior(session) {
  assert.equal(
    session.psql("select count(*) from supabase_migrations.schema_migrations;"),
    String(EXPECTED_MIGRATION_COUNT),
  );
  assert.equal(
    session.psql(`select to_regprocedure('public.apply_ghl_inbound_form_submission_v1(uuid,text,uuid,bigint,text,text,text,timestamptz,text,text,text,text,text,text,jsonb,jsonb,text,boolean,text,text,timestamptz)') is not null;`),
    "t",
  );

  session.psql(`
    insert into auth.users(id) values ('${IDS.user}'), ('${IDS.otherUser}');
    insert into public.users(id, email, full_name) values
      ('${IDS.user}', 'ghl-inbound-owner@example.test', 'GHL Inbound Owner'),
      ('${IDS.otherUser}', 'ghl-other-owner@example.test', 'GHL Other Owner');
    insert into public.organizations(id, name, slug, owner_user_id) values
      ('${IDS.organization}', 'Synthetic Inbound Realty', 'synthetic-inbound-realty', '${IDS.user}'),
      ('${IDS.otherOrganization}', 'Other Synthetic Realty', 'other-synthetic-realty', '${IDS.otherUser}');
    insert into public.organization_memberships(organization_id, user_id, role) values
      ('${IDS.organization}', '${IDS.user}', 'owner'),
      ('${IDS.otherOrganization}', '${IDS.otherUser}', 'owner');
    insert into public.commercial_activations(
      id, organization_id, user_id, source_provider, source_event_id,
      source_event_type, source_event_created, source_subscription_id,
      amount_paid_cents, currency
    ) values
      (
        '${IDS.activation}', '${IDS.organization}', '${IDS.user}', 'stripe',
        'evt_ghl_inbound_synthetic', 'checkout.session.completed', 1783944000,
        'sub_ghl_inbound_synthetic', 29700, 'cad'
      ),
      (
        '${IDS.otherActivation}', '${IDS.otherOrganization}', '${IDS.otherUser}', 'stripe',
        'evt_ghl_inbound_other_synthetic', 'checkout.session.completed', 1783944001,
        'sub_ghl_inbound_other_synthetic', 29700, 'cad'
      );
    insert into public.billing_subscriptions(
      organization_id, user_id, stripe_customer_id, stripe_subscription_id,
      plan_tier, status, current_period_start, current_period_end, cancel_at_period_end, metadata
    ) values
      (
        '${IDS.organization}', '${IDS.user}', 'cus_ghl_inbound_synthetic',
        'sub_ghl_inbound_synthetic', 'starter', 'active', '2026-07-01', '2099-01-01', false, '{}'::jsonb
      ),
      (
        '${IDS.otherOrganization}', '${IDS.otherUser}', 'cus_ghl_inbound_other_synthetic',
        'sub_ghl_inbound_other_synthetic', 'starter', 'active', '2026-07-01', '2099-01-01', false, '{}'::jsonb
      );
    insert into public.campaign_plans(
      id, owner_id, organization_id, user_id, plan, publish_state, public_slug
    ) values
      (
        '${IDS.campaignA}', '${IDS.organization}', '${IDS.organization}', '${IDS.user}',
        '{
          "onboarding_contract_version":1,
          "onboarding_contract":{
            "businessType":"real_estate_realtor","adDestination":"website","campaignMode":"seller",
            "offer":"Free seller valuation","market":"Toronto","audience":"Toronto homeowners",
            "propertyType":"Detached homes","priceRange":"$800k-$1.5m",
            "agentFirstName":"Ada","agentLastName":"Lovelace","agentCompanyName":"Synthetic Realty",
            "agentPhone":"+14165550101","funnelLanguage":"en","themePrimaryColor":"#112233",
            "themeSecondaryColor":"#445566","themeAccentColor":"#778899","logoUrl":"https://assets.example.test/logo-a.png"
          },
          "lead_form_questions":["What is your selling timeline?"],
          "selected_ad_id":"creative-a",
          "staticAds":[{"id":"creative-a","headline":"Know what your Toronto home is worth","primaryText":"Get a clear local valuation before you list.","cta":"Get my valuation"}],
          "campaign_payload":{"selected_ad_id":"creative-a","funnel":{"headlines":["Know what your Toronto home is worth"],"cta":"Get my valuation"},"creatives":{"primary_text_variations":["Get a clear local valuation before you list."]}}
        }'::jsonb,
        'published', 'synthetic-campaign-a'
      ),
      (
        '${IDS.campaignB}', '${IDS.organization}', '${IDS.organization}', '${IDS.user}',
        '{
          "onboarding_contract_version":1,
          "onboarding_contract":{
            "businessType":"real_estate_realtor","adDestination":"website","campaignMode":"seller",
            "offer":"Free seller consultation","market":"Mississauga","audience":"Mississauga homeowners",
            "propertyType":"Condos","priceRange":"$500k-$900k",
            "agentFirstName":"Grace","agentLastName":"Hopper","agentCompanyName":"Synthetic Realty",
            "agentPhone":"+19055550102","funnelLanguage":"en","themePrimaryColor":"#123456",
            "themeSecondaryColor":"#abcdef","themeAccentColor":"#fedcba","logoUrl":"https://assets.example.test/logo-b.png"
          },
          "lead_form_questions":["What is your selling timeline?"],
          "selected_ad_id":"creative-b",
          "staticAds":[{"id":"creative-b","headline":"Plan your Mississauga sale","primaryText":"Get a focused local consultation.","cta":"Talk to an agent"}],
          "campaign_payload":{"selected_ad_id":"creative-b","funnel":{"headlines":["Plan your Mississauga sale"],"cta":"Talk to an agent"},"creatives":{"primary_text_variations":["Get a focused local consultation."]}}
        }'::jsonb,
        'published', 'synthetic-campaign-b'
      ),
      (
        '${IDS.campaignC}', '${IDS.otherOrganization}', '${IDS.otherOrganization}', '${IDS.otherUser}',
        '{
          "onboarding_contract_version":1,
          "onboarding_contract":{
            "businessType":"real_estate_realtor","adDestination":"website","campaignMode":"seller",
            "offer":"Free seller valuation","market":"Ottawa","audience":"Ottawa homeowners",
            "propertyType":"Detached homes","priceRange":"$700k-$1.2m",
            "agentFirstName":"Katherine","agentLastName":"Johnson","agentCompanyName":"Other Synthetic Realty",
            "agentPhone":"+16135550103","funnelLanguage":"en","themePrimaryColor":"#223344",
            "themeSecondaryColor":"#556677","themeAccentColor":"#8899aa","logoUrl":"https://assets.example.test/logo-c.png"
          },
          "lead_form_questions":["What is your selling timeline?"],
          "selected_ad_id":"creative-c",
          "staticAds":[{"id":"creative-c","headline":"Know what your Ottawa home is worth","primaryText":"Get a clear local valuation.","cta":"Get my valuation"}],
          "campaign_payload":{"selected_ad_id":"creative-c","funnel":{"headlines":["Know what your Ottawa home is worth"],"cta":"Get my valuation"},"creatives":{"primary_text_variations":["Get a clear local valuation."]}}
        }'::jsonb,
        'draft', 'synthetic-campaign-c'
      );
    insert into public.ghl_workspace_tenants(organization_id, tenant_kind, status) values
      ('${IDS.organization}', 'direct_realtor', 'active'),
      ('${IDS.otherOrganization}', 'direct_realtor', 'active');
    insert into public.ghl_installations(
      id, environment, owner_kind, provider_agency_id, encrypted_credential_ref,
      status, capability_manifest
    ) values (
      '${IDS.installation}', 'sandbox', 'platform', 'agency-synthetic',
      'env:GHL_SANDBOX_AGENCY_TOKEN', 'active',
      '{"defaultCountry":"CA","defaultTimezone":"America/Toronto"}'::jsonb
    );
    insert into public.ghl_snapshot_manifests(
      id, environment, snapshot_key, snapshot_version, provider_snapshot_id,
      required_objects, installation_mode, installation_id, personalization_contract,
      status, approved_at
    ) values (
      '${IDS.manifest}', 'sandbox', 'ghl-inbound-synthetic', '1.0.0', 'snapshot-synthetic',
      '[
        {"kind":"pipeline","key":"new-lead","providerObjectId":"pipeline-synthetic"},
        {"kind":"custom_field","key":"sms-consent","providerObjectId":"sms_consent_field"},
        {"kind":"custom_field","key":"advertising-consent","providerObjectId":"advertising_consent_field"},
        {"kind":"custom_field","key":"seller-timeline","providerObjectId":"seller_timeline_field"}
      ]'::jsonb,
      'preinstalled', '${IDS.installation}',
      jsonb_build_object(
        'customValues', jsonb_build_object('DealFlow Platform', 'DealFlow'),
        'campaignSlots', jsonb_build_array(
          jsonb_build_object(
            'slotKey', 'slot-a', 'destinationUrl', 'https://funnels.example.test/campaign-a',
            'requiredFormIds', jsonb_build_array('form-synthetic-a'),
            'customValueNames', (select jsonb_object_agg(key, value || ' Slot A') from jsonb_each_text(public.ghl_default_campaign_custom_value_names_v2())),
            'inboundSmsConsentFieldId', 'sms_consent_field',
            'inboundSmsConsentPolicyVersion', 'sms-v1',
            'inboundSmsConsentCopy', 'I agree to receive SMS about my real estate request.',
            'inboundAdvertisingConsentFieldId', 'advertising_consent_field',
            'inboundAdvertisingConsentPolicyVersion', 'ads-v1',
            'inboundQuestionContractVersion', 'questions-v1',
            'inboundQuestionMappings', jsonb_build_array(jsonb_build_object('fieldId','seller_timeline_field','question','What is your selling timeline?'))
          ),
          jsonb_build_object(
            'slotKey', 'slot-b', 'destinationUrl', 'https://funnels.example.test/campaign-b',
            'requiredFormIds', jsonb_build_array('form-synthetic-b'),
            'customValueNames', (select jsonb_object_agg(key, value || ' Slot B') from jsonb_each_text(public.ghl_default_campaign_custom_value_names_v2())),
            'inboundSmsConsentFieldId', 'sms_consent_field',
            'inboundSmsConsentPolicyVersion', 'sms-v1',
            'inboundSmsConsentCopy', 'I agree to receive SMS about my real estate request.',
            'inboundAdvertisingConsentFieldId', 'advertising_consent_field',
            'inboundAdvertisingConsentPolicyVersion', 'ads-v1',
            'inboundQuestionContractVersion', 'questions-v1',
            'inboundQuestionMappings', jsonb_build_array(jsonb_build_object('fieldId','seller_timeline_field','question','What is your selling timeline?'))
          )
        )
      ),
      'approved', timezone('utc', now())
    );
    insert into public.ghl_location_mappings(
      id, organization_id, installation_id, environment, provider_location_id,
      provisioning_owner, snapshot_manifest_id, status,
      snapshot_verified_at, required_objects_verified_at,
      forms_readonly_credential_ref, forms_readonly_capabilities, forms_readonly_scope_attested_at
    ) values
      (
        '${IDS.mapping}', '${IDS.organization}', '${IDS.installation}', 'sandbox',
        'location-synthetic', 'platform', '${IDS.manifest}', 'active',
        timezone('utc', now()), timezone('utc', now()), null, null, null
      ),
      (
        '${IDS.inactiveMapping}', '${IDS.organization}', '${IDS.installation}', 'sandbox',
        'location-inactive', 'platform', '${IDS.manifest}', 'inactive', null, null, null, null, null
      ),
      (
        '${IDS.ineligibleMapping}', '${IDS.otherOrganization}', '${IDS.installation}', 'sandbox',
        'location-stale-authority', 'platform', '${IDS.manifest}', 'active',
        timezone('utc', now()), timezone('utc', now()),
        'env:GHL_SANDBOX_LOCATION_STALE_TOKEN', '["forms.readonly"]'::jsonb, timezone('utc', now())
      );
    insert into public.ghl_provisioning_runs(
      id, organization_id, environment, activation_event_id, installation_id,
      snapshot_manifest_id, idempotency_key, state
    ) values
      ('${IDS.runA}', '${IDS.organization}', 'sandbox', 'activation-synthetic-a', '${IDS.installation}', '${IDS.manifest}', 'run-synthetic-a', 'requested');
    begin;
    set local session_replication_role = replica;
    update public.ghl_provisioning_runs
    set location_mapping_id='${IDS.mapping}', state='ready', ready_at=timezone('utc',now())
    where id='${IDS.runA}';
    commit;
    insert into public.ghl_provisioning_runs(
      id, organization_id, environment, activation_event_id, installation_id,
      snapshot_manifest_id, idempotency_key, state
    ) values
      ('${IDS.runB}', '${IDS.organization}', 'sandbox', 'activation-synthetic-b', '${IDS.installation}', '${IDS.manifest}', 'run-synthetic-b', 'requested');
    begin;
    set local session_replication_role = replica;
    update public.ghl_provisioning_runs
    set location_mapping_id='${IDS.mapping}', state='ready', ready_at=timezone('utc',now())
    where id='${IDS.runB}';
    commit;
    insert into public.ghl_provisioning_runs(
      id, organization_id, environment, activation_event_id, installation_id,
      snapshot_manifest_id, idempotency_key, state
    ) values
      ('${IDS.runC}', '${IDS.otherOrganization}', 'sandbox', 'activation-synthetic-c', '${IDS.installation}', '${IDS.manifest}', 'run-synthetic-c', 'requested');
    begin;
    set local session_replication_role = replica;
    update public.ghl_provisioning_runs
    set location_mapping_id='${IDS.ineligibleMapping}', state='ready', ready_at=timezone('utc',now())
    where id='${IDS.runC}';
    commit;
  `, { label: "Create isolated GHL inbound fixtures" });

  for (const campaignId of [IDS.campaignA, IDS.campaignB]) {
    const preparedId = session.psql(`
      begin;
      set local role service_role;
      select id::text from public.prepare_ghl_campaign_personalization_v2(
        '${IDS.organization}', '${campaignId}', 'sandbox', timezone('utc', now())
      );
      commit;
    `, { label: `Prepare personalization ${campaignId}` });
    assert.match(preparedId, /^[0-9a-f-]{36}$/i);
  }
  session.psql(`
    update public.ghl_location_personalizations
    set status='ready', current_step='ready', verified_at=timezone('utc',now()),
        applied_at=timezone('utc',now())
    where campaign_id in ('${IDS.campaignA}','${IDS.campaignB}');
  `, { label: "Mark synthetic personalizations verified" });

  assert.equal(session.psql(`
    select string_agg(provider_form_id || ':' || allowed_field_ids::text, ',' order by provider_form_id)
    from public.list_ghl_inbound_eligible_form_routes_v1('${IDS.organization}','${IDS.mapping}','sandbox');
  `), "form-synthetic-a:[\"advertising_consent_field\", \"seller_timeline_field\", \"sms_consent_field\"],form-synthetic-b:[\"advertising_consent_field\", \"seller_timeline_field\", \"sms_consent_field\"]");
  assert.equal(session.psql(`
    select count(*) from public.list_ghl_inbound_eligible_form_routes_v1('${IDS.otherOrganization}','${IDS.mapping}','sandbox');
  `), "0", "tenant fence leaked eligible forms");

  session.psqlMustFail(`
    begin; set local role service_role;
    select inbound_form_reconciliation_enabled from public.set_ghl_inbound_form_reconciliation_runtime_v1('sandbox', true, timezone('utc',now()));
    commit;
  `, /ghl_inbound_runtime_location_authority_incomplete/i, { label: "Reject runtime before authority binding" });
  for (const rejectedRef of ["plaintext-token", "env:GHL_SANDBOX_AGENCY_TOKEN"]) {
    session.psqlMustFail(`
      begin; set local role service_role;
      select id from public.bind_ghl_inbound_forms_read_authority_v1(
        '${IDS.organization}','${IDS.mapping}','sandbox','location-synthetic','${rejectedRef}',
        '["forms.readonly"]'::jsonb,'["form-synthetic-a","form-synthetic-b"]'::jsonb,timezone('utc',now())
      ); commit;
    `, /ghl_inbound_forms_read_credential_reference_invalid/i, { label: `Reject GHL authority ref ${rejectedRef}` });
  }
  session.psqlMustFail(`
    begin; set local role service_role;
    select id from public.bind_ghl_inbound_forms_read_authority_v1(
      '${IDS.organization}','${IDS.mapping}','sandbox','location-synthetic','env:GHL_SANDBOX_LOCATION_TOKEN',
      '["forms.readonly"]'::jsonb,'["form-synthetic-a"]'::jsonb,timezone('utc',now())
    ); commit;
  `, /ghl_inbound_forms_read_verified_form_scope_changed/i, { label: "Reject partial verified form scope" });
  assert.equal(session.psql(`
    begin; set local role service_role;
    select forms_readonly_credential_ref from public.bind_ghl_inbound_forms_read_authority_v1(
      '${IDS.organization}','${IDS.mapping}','sandbox','location-synthetic','env:GHL_SANDBOX_LOCATION_TOKEN',
      '["forms.readonly"]'::jsonb,'["form-synthetic-a","form-synthetic-b"]'::jsonb,timezone('utc',now())
    ); commit;
  `), "env:GHL_SANDBOX_LOCATION_TOKEN");
  assert.equal(session.psql(`
    begin; set local role service_role;
    select inbound_form_reconciliation_enabled from public.set_ghl_inbound_form_reconciliation_runtime_v1(
      'sandbox', true, timezone('utc',now())
    ); commit;
  `), "t");
  session.psql("update public.ghl_runtime_controls set lifecycle_webhook_enabled=true where environment in ('sandbox','production');");

  session.psqlMustFail(`
    update public.ghl_snapshot_manifests set snapshot_version='1.0.1' where id='${IDS.manifest}';
  `, /immutable|create a new version/i, { label: "Reject referenced manifest mutation" });

  const serviceOnlyRpcs = [
    "public.list_ghl_inbound_eligible_form_routes_v1(uuid,uuid,text)",
    "public.bind_ghl_inbound_forms_read_authority_v1(uuid,uuid,text,text,text,jsonb,jsonb,timestamp with time zone)",
    "public.set_ghl_inbound_form_reconciliation_runtime_v1(text,boolean,timestamp with time zone)",
    "public.drain_ghl_inbound_form_reconciliation_claims_v1(text,timestamp with time zone)",
    "public.configure_ghl_inbound_forms_read_authorities_v1(text,jsonb,timestamp with time zone)",
    "public.retire_ghl_location_mapping_v1(uuid,uuid,text,text,text,text,timestamp with time zone)",
    "public.replay_ghl_inbound_form_reconciliation_v1(uuid,uuid,text,text,text,text,timestamp with time zone)",
    "public.claim_next_ghl_inbound_form_reconciliation_v1(text,text,timestamp with time zone,integer)",
    "public.settle_ghl_inbound_form_reconciliation_v1(uuid,text,uuid,bigint,text,text,text,integer,text,text,timestamp with time zone)",
    "public.complete_ghl_inbound_form_reconciliation_without_submission_v1(uuid,text,uuid,bigint,text,text,timestamp with time zone)",
    "public.ingest_ghl_lifecycle_webhook_v1(text,text,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,timestamp with time zone)",
    "public.apply_ghl_inbound_form_submission_v1(uuid,text,uuid,bigint,text,text,text,timestamp with time zone,text,text,text,text,text,text,jsonb,jsonb,text,boolean,text,text,timestamp with time zone)",
  ];
  for (const signature of serviceOnlyRpcs) assertPrivilegeMatrix(session, signature, "false|false|true");
  for (const table of ["ghl_inbound_form_reconciliations", "ghl_inbound_form_submission_bindings"]) {
    assert.equal(session.psql(`
      select has_table_privilege('anon','public.${table}','SELECT') || '|' ||
        has_table_privilege('authenticated','public.${table}','SELECT') || '|' ||
        has_table_privilege('service_role','public.${table}','SELECT') || '|' ||
        has_table_privilege('service_role','public.${table}','INSERT') || '|' ||
        has_table_privilege('service_role','public.${table}','UPDATE') || '|' ||
        has_table_privilege('service_role','public.${table}','DELETE');
    `), "false|false|true|false|false|false");
  }

  session.psqlMustFail(`
    begin; set local role service_role;
    select id from public.ingest_ghl_lifecycle_webhook_v1(
      'location-synthetic','production','event-wrong-environment','ContactCreate',
      'contact-wrong-environment','contact-wrong-environment',null,null,null,null,
      '2026-07-13T10:00:00Z','${FP.one}','2026-07-13T10:00:00Z'
    ); commit;
  `, /query returned no rows|no data found/i, { label: "Reject wrong deployment environment route" });

  const initialEvent = ingestContact(session, {
    eventId: "event-contact-create-initial",
    contactId: "contact-shared",
    at: "2026-07-13T12:00:00Z",
    fingerprint: FP.one,
  });
  assert.match(initialEvent, /\|reconciliation_pending\|signed_contact_event_requires_form_submission_reconciliation\|/);
  const initialClaim = claimReconciliation(session, {
    worker: "worker-initial",
    at: "2026-07-13T12:01:00Z",
  });
  assert.ok(initialClaim);
  assert.equal(initialClaim.attempt, 1);
  assert.equal(initialClaim.organizationId, IDS.organization);
  assert.equal(initialClaim.mappingId, IDS.mapping);
  assert.equal(initialClaim.contactId, "contact-shared");

  const firstApply = applySubmission(session, initialClaim, {
    submissionId: "submission-shared-a1",
    formId: "form-synthetic-a",
    submittedAt: "2026-07-13T11:59:00Z",
    qualification: [
      ["seller_timeline_field", "Within 3 months"],
      ["sms_consent_field", "yes"],
    ],
    attribution: { pageUrl: "https://funnels.example.test/campaign-a", utmSource: "facebook" },
    fingerprint: FP.a,
    hasMore: true,
    now: "2026-07-13T12:01:10Z",
  });
  assert.match(firstApply, /^processing\|0\|\|$/);
  const secondApply = applySubmission(session, initialClaim, {
    submissionId: "submission-shared-a2",
    formId: "form-synthetic-a",
    submittedAt: "2026-07-13T12:00:30Z",
    email: "second.synthetic@example.test",
    phone: "+14165551313",
    phoneRaw: "416-555-1313",
    qualification: [
      ["seller_timeline_field", "Within 6 months"],
      ["advertising_consent_field", "true"],
    ],
    attribution: { pageUrl: "https://funnels.example.test/campaign-a", fbc: "fb.1.synthetic" },
    fingerprint: FP.b,
    hasMore: false,
    now: "2026-07-13T12:01:20Z",
  });
  assert.match(secondApply, /^completed\|2\|\|$/);
  assert.equal(session.psql(`
    select concat_ws('|',
      count(*)::text,
      count(distinct lead_id)::text,
      count(*) filter (where sms_consent_granted)::text,
      count(*) filter (where advertising_consent_granted)::text,
      count(*) filter (where sms_consent_granted and advertising_consent_granted)::text
    ) from public.ghl_inbound_form_submission_bindings;
  `), "2|2|1|1|0", "separate consent fields were collapsed or submissions were lost");
  assert.equal(session.psql(`
    select concat_ws('|',
      (select count(*) from public.leads where source='ghl_native_form')::text,
      (select count(*) from public.system_jobs where kind='lead_side_effects')::text,
      (select count(*) from public.ghl_provider_outbox)::text,
      (select count(*) from public.system_jobs where payload::text like '%ghl_delivery%')::text
    );
  `), "2|2|0|0", "atomic lead/job or no-GHL-redelivery invariant failed");
  assert.equal(session.psql(`
    select count(*) from public.system_jobs
    where kind='lead_side_effects'
      and payload #> '{enabledEffects}' = '["meta_conversion"]'::jsonb;
  `), "1", "advertising consent did not independently authorize the meta effect");

  const ambiguousLifecycle = session.psql(`
    begin; set local role service_role;
    select concat_ws('|', projection_status, projection_code, coalesce(resolved_lead_id::text,''))
    from public.ingest_ghl_lifecycle_webhook_v1(
      'location-synthetic','sandbox','event-appointment-ambiguous','AppointmentCreate',
      'appointment-ambiguous','contact-shared','calendar-synthetic','confirmed',
      '2026-07-14T14:00:00Z','2026-07-14T14:30:00Z','2026-07-13T12:02:00Z',
      '${FP.two}','2026-07-13T12:02:00Z'
    ); commit;
  `, { label: "Prove downstream lifecycle ambiguity" });
  assert.equal(ambiguousLifecycle, "operator_action_required|ghl_lifecycle_ambiguous_lead_binding|");

  ingestContact(session, {
    eventId: "event-contact-replay",
    contactId: "contact-shared",
    eventType: "ContactUpdate",
    at: "2026-07-13T13:00:00Z",
    fingerprint: FP.three,
  });
  const replayClaim = claimReconciliation(session, { worker: "worker-replay", at: "2026-07-13T13:01:00Z" });
  assert.ok(replayClaim);
  assert.match(applySubmission(session, replayClaim, {
    submissionId: "submission-shared-a1",
    formId: "form-synthetic-a",
    submittedAt: "2026-07-13T11:59:00Z",
    qualification: [["seller_timeline_field", "Within 3 months"], ["sms_consent_field", "yes"]],
    fingerprint: FP.a,
    now: "2026-07-13T13:01:10Z",
  }), /^completed\|0\|[0-9a-f-]{36}\|$/i);
  assert.equal(session.psql(`select count(*) from public.leads where source='ghl_native_form';`), "2");
  assert.equal(session.psql(`select count(*) from public.system_jobs where kind='lead_side_effects';`), "2");

  ingestContact(session, {
    eventId: "event-contact-fingerprint-conflict",
    contactId: "contact-shared",
    eventType: "ContactUpdate",
    at: "2026-07-13T14:00:00Z",
    fingerprint: FP.four,
  });
  const conflictClaim = claimReconciliation(session, { worker: "worker-conflict", at: "2026-07-13T14:01:00Z" });
  assert.ok(conflictClaim);
  assert.match(applySubmission(session, conflictClaim, {
    submissionId: "submission-shared-a1",
    formId: "form-synthetic-a",
    submittedAt: "2026-07-13T11:59:00Z",
    qualification: [["seller_timeline_field", "Within 3 months"]],
    fingerprint: FP.c,
    now: "2026-07-13T14:01:10Z",
  }), /^operator_action_required\|0\|\|ghl_form_submission_idempotency_conflict$/);

  ingestContact(session, {
    eventId: "event-contact-repeat-new-submission",
    contactId: "contact-shared",
    eventType: "ContactUpdate",
    at: "2026-07-13T15:00:00Z",
    fingerprint: FP.five,
  });
  const repeatClaim = claimReconciliation(session, { worker: "worker-repeat", at: "2026-07-13T15:01:00Z" });
  assert.ok(repeatClaim);
  assert.match(applySubmission(session, repeatClaim, {
    submissionId: "submission-shared-a3",
    formId: "form-synthetic-a",
    submittedAt: "2026-07-13T14:59:00Z",
    qualification: [["seller_timeline_field", "Within 12 months"]],
    fingerprint: FP.c,
    now: "2026-07-13T15:01:10Z",
  }), /^completed\|1\|[0-9a-f-]{36}\|$/i);

  ingestContact(session, {
    eventId: "event-contact-second-campaign",
    contactId: "contact-shared",
    eventType: "ContactUpdate",
    at: "2026-07-13T16:00:00Z",
    fingerprint: FP.six,
  });
  const campaignBClaim = claimReconciliation(session, { worker: "worker-campaign-b", at: "2026-07-13T16:01:00Z" });
  assert.ok(campaignBClaim);
  assert.match(applySubmission(session, campaignBClaim, {
    submissionId: "submission-shared-b1",
    formId: "form-synthetic-b",
    submittedAt: "2026-07-13T15:59:00Z",
    email: "campaign-b.synthetic@example.test",
    qualification: [["seller_timeline_field", "Exploring options"]],
    fingerprint: FP.d,
    now: "2026-07-13T16:01:10Z",
  }), /^completed\|1\|[0-9a-f-]{36}\|$/i);
  assert.equal(session.psql(`
    select string_agg(campaign_id::text || ':' || count::text, ',' order by campaign_id::text)
    from (select campaign_id, count(*) from public.ghl_inbound_form_submission_bindings group by campaign_id) grouped;
  `), `${IDS.campaignA}:3,${IDS.campaignB}:1`, "same contact did not preserve campaign-specific routes");

  ingestContact(session, {
    eventId: "event-contact-atomic-rollback",
    contactId: "contact-atomic",
    at: "2026-07-13T17:00:00Z",
    fingerprint: FP.seven,
  });
  const atomicClaim = claimReconciliation(session, { worker: "worker-atomic", at: "2026-07-13T17:01:00Z" });
  assert.ok(atomicClaim);
  const beforeAtomicFailure = session.psql(`
    select concat_ws('|',
      (select count(*) from public.leads where source='ghl_native_form')::text,
      (select count(*) from public.system_jobs where kind='lead_side_effects')::text,
      (select count(*) from public.ghl_inbound_form_submission_bindings)::text
    );
  `);
  session.psql(`
    create or replace function private.reject_synthetic_ghl_binding_v1()
    returns trigger language plpgsql set search_path=pg_catalog,public as $$
    begin
      if new.provider_submission_id='submission-atomic-rollback' then
        raise exception 'synthetic_binding_failure_after_atomic_capture';
      end if;
      return new;
    end $$;
    create trigger reject_synthetic_ghl_binding
    before insert on public.ghl_inbound_form_submission_bindings
    for each row execute function private.reject_synthetic_ghl_binding_v1();
  `, { label: "Install synthetic post-capture rollback probe" });
  session.psqlMustFail(`
    begin; set local role service_role; set local "request.jwt.claim.role"='service_role';
    select status from public.apply_ghl_inbound_form_submission_v1(
      '${atomicClaim.id}','${atomicClaim.worker}','${atomicClaim.token}',${atomicClaim.generation},
      'submission-atomic-rollback','form-synthetic-a','contact-atomic','2026-07-13T16:59:00Z',
      'Atomic Lead','Atomic','Lead','atomic@example.test','+14165551414','416-555-1414',
      '${fields([["seller_timeline_field", "Soon"]])}'::jsonb,'{}'::jsonb,'${FP.e}',false,
      'request-atomic','${FP.f}','2026-07-13T17:01:10Z'
    ); commit;
  `, /synthetic_binding_failure_after_atomic_capture/i, { label: "Inject post-capture binding failure" });
  assert.equal(session.psql(`
    select concat_ws('|',
      (select count(*) from public.leads where source='ghl_native_form')::text,
      (select count(*) from public.system_jobs where kind='lead_side_effects')::text,
      (select count(*) from public.ghl_inbound_form_submission_bindings)::text
    );
  `), beforeAtomicFailure, "lead or job escaped a failed binding transaction");
  assert.equal(session.psql(`select status from public.ghl_inbound_form_reconciliations where id='${atomicClaim.id}';`), "processing");
  session.psql(`
    drop trigger reject_synthetic_ghl_binding on public.ghl_inbound_form_submission_bindings;
    drop function private.reject_synthetic_ghl_binding_v1();
  `, { label: "Remove synthetic rollback probe" });
  assert.match(applySubmission(session, atomicClaim, {
    submissionId: "submission-atomic-rollback",
    formId: "form-synthetic-a",
    contactId: "contact-atomic",
    submittedAt: "2026-07-13T16:59:00Z",
    email: "atomic@example.test",
    qualification: [["seller_timeline_field", "Soon"]],
    fingerprint: FP.e,
    now: "2026-07-13T17:01:20Z",
  }), /^completed\|1\|[0-9a-f-]{36}\|$/i);

  ingestContact(session, {
    eventId: "event-contact-open-observation-horizon",
    contactId: "contact-shared",
    eventType: "ContactUpdate",
    at: "2026-07-13T17:10:00Z",
    fingerprint: FP.seven,
  });
  const openHorizonStartMs = Date.parse("2026-07-13T17:10:10Z");
  const openHorizonFirst = claimReconciliation(session, {
    worker: "worker-open-horizon-1",
    at: new Date(openHorizonStartMs).toISOString(),
  });
  assert.ok(openHorizonFirst);
  const firstOpenHorizonCompletionMs = openHorizonStartMs + 1_000;
  assert.equal(completeEmpty(session, openHorizonFirst, {
    at: new Date(firstOpenHorizonCompletionMs).toISOString(),
    request: "request-open-horizon-1",
  }), "retryable_failure|1|ghl_form_submission_observation_window_open");
  assert.equal(session.psql(`
    select next_retry_at = '2026-07-13T17:10:41Z'::timestamptz
    from public.ghl_inbound_form_reconciliations where id='${openHorizonFirst.id}';
  `), "t", "open observation horizon did not schedule the first bounded retry in 30 seconds");
  let finalOpenHorizonClaim = openHorizonFirst;
  const stagedRetrySecondsAfterRead = new Map([
    [2, 60],
    [3, 120],
    [4, 300],
    [5, 600],
    [6, 1_200],
  ]);
  for (let poll = 2; poll <= 7; poll += 1) {
    const nextRetryAt = session.psql(`
      select to_char(next_retry_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      from public.ghl_inbound_form_reconciliations where id='${openHorizonFirst.id}';
    `);
    const atMs = Date.parse(nextRetryAt);
    assert.ok(Number.isFinite(atMs), `open-horizon poll ${poll} has no bounded next_retry_at`);
    const claim = claimReconciliation(session, {
      worker: `worker-open-horizon-${poll}`,
      at: new Date(atMs).toISOString(),
    });
    assert.ok(claim, `open-horizon poll ${poll} exhausted before the one-hour observation boundary`);
    finalOpenHorizonClaim = claim;
    const completion = completeEmpty(session, claim, {
      at: new Date(atMs + 1_000).toISOString(),
      request: `request-open-horizon-${poll}`,
    });
    assert.equal(completion, `retryable_failure|${poll}|ghl_form_submission_observation_window_open`);
    const observedNextRetryAt = session.psql(`
      select to_char(next_retry_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      from public.ghl_inbound_form_reconciliations where id='${openHorizonFirst.id}';
    `);
    if (poll < 7) {
      const delaySeconds = stagedRetrySecondsAfterRead.get(poll);
      assert.equal(Date.parse(observedNextRetryAt), atMs + 1_000 + (delaySeconds * 1_000),
        `open-horizon poll ${poll} did not use the exact staged backoff`);
    } else {
      assert.equal(observedNextRetryAt, "2026-07-13T18:10:00.000Z",
        "seventh empty read did not jump directly to the observation-window boundary");
    }
  }
  const finalOpenHorizonAt = Date.parse("2026-07-13T18:10:00.000Z");
  finalOpenHorizonClaim = claimReconciliation(session, {
    worker: "worker-open-horizon-8",
    at: new Date(finalOpenHorizonAt).toISOString(),
  });
  assert.ok(finalOpenHorizonClaim, "bounded polling exhausted before the final observation-boundary read");
  assert.equal(completeEmpty(session, finalOpenHorizonClaim, {
    at: new Date(finalOpenHorizonAt + 1_000).toISOString(),
    request: "request-open-horizon-8",
  }), "completed|8|");
  assert.equal(finalOpenHorizonClaim.attempt, 8);
  assert.equal(session.psql(`
    select max_attempts::text || '|' || attempt_count::text || '|' || provider_read_count::text
    from public.ghl_inbound_form_reconciliations where id='${openHorizonFirst.id}';
  `), "12|8|8", "staged polling did not span the one-hour horizon within its bounded attempt budget");
  const maximumVerifiedFormsPerMapping = 25;
  const maximumProviderReadsPerLifecycleEvent = finalOpenHorizonClaim.attempt * maximumVerifiedFormsPerMapping;
  assert.equal(maximumProviderReadsPerLifecycleEvent, 200,
    "worst-case per-lifecycle-event GHL request budget exceeded 200 GETs");

  ingestContact(session, {
    eventId: "event-contact-known-empty",
    contactId: "contact-shared",
    eventType: "ContactUpdate",
    at: "2026-07-13T18:00:00Z",
    fingerprint: FP.eight,
  });
  const knownEmptyFirst = claimReconciliation(session, { worker: "worker-known-empty-1", at: "2026-07-13T19:01:00Z" });
  assert.ok(knownEmptyFirst);
  assert.equal(completeEmpty(session, knownEmptyFirst, { at: "2026-07-13T19:01:10Z", request: "request-known-empty-1" }),
    "retryable_failure|1|ghl_inbound_empty_reconciliation_requires_two_reads");
  const knownEmptySecond = claimReconciliation(session, { worker: "worker-known-empty-2", at: "2026-07-13T19:03:00Z" });
  assert.ok(knownEmptySecond);
  assert.equal(completeEmpty(session, knownEmptySecond, { at: "2026-07-13T19:03:10Z", request: "request-known-empty-2" }),
    "completed|2|");

  ingestContact(session, {
    eventId: "event-contact-unknown-empty",
    contactId: "contact-never-observed",
    at: "2026-07-13T20:00:00Z",
    fingerprint: FP.nine,
  });
  const unknownEmptyFirst = claimReconciliation(session, { worker: "worker-unknown-empty-1", at: "2026-07-13T21:01:00Z" });
  assert.ok(unknownEmptyFirst);
  assert.equal(completeEmpty(session, unknownEmptyFirst, { at: "2026-07-13T21:01:10Z", request: "request-unknown-empty-1" }),
    "retryable_failure|1|ghl_inbound_empty_reconciliation_requires_two_reads");
  const unknownEmptySecond = claimReconciliation(session, { worker: "worker-unknown-empty-2", at: "2026-07-13T21:03:00Z" });
  assert.ok(unknownEmptySecond);
  assert.equal(completeEmpty(session, unknownEmptySecond, { at: "2026-07-13T21:03:10Z", request: "request-unknown-empty-2" }),
    "operator_action_required|2|ghl_form_submission_not_observed_for_unknown_contact");

  ingestContact(session, {
    eventId: "event-contact-retry",
    contactId: "contact-retry",
    at: "2026-07-13T22:00:00Z",
    fingerprint: FP.a,
  });
  const retryClaim = claimReconciliation(session, { worker: "worker-retry-1", at: "2026-07-13T22:01:00Z" });
  assert.ok(retryClaim);
  session.psqlMustFail(`
    begin; set local role service_role;
    select status from public.settle_ghl_inbound_form_reconciliation_v1(
      '${retryClaim.id}','${retryClaim.worker}','00000000-0000-4000-8000-000000000099',${retryClaim.generation},
      'retryable_failure','synthetic_stale_lease','stale lease',1000,null,null,'2026-07-13T22:01:01Z'
    ); commit;
  `, /query returned no rows|no data found/i, { label: "Reject stale reconciliation lease" });
  assert.match(settleReconciliation(session, retryClaim, { at: "2026-07-13T22:01:02Z" }),
    /^retryable_failure\|1\|synthetic_provider_timeout\|/);
  const retryTerminalClaim = claimReconciliation(session, { worker: "worker-retry-2", at: "2026-07-13T22:01:04Z" });
  assert.ok(retryTerminalClaim);
  assert.match(settleReconciliation(session, retryTerminalClaim, {
    at: "2026-07-13T22:01:05Z",
    outcome: "operator_action_required",
    errorCode: "synthetic_operator_stop",
  }), /^operator_action_required\|2\|synthetic_operator_stop\|$/);

  ingestContact(session, {
    eventId: "event-contact-crash-exhaustion",
    contactId: "contact-crash",
    at: "2026-07-13T23:00:00Z",
    fingerprint: FP.b,
  });
  session.psql(`
    update public.ghl_inbound_form_reconciliations reconciliation set max_attempts=2
    from public.ghl_lifecycle_webhook_events event
    where reconciliation.lifecycle_event_id=event.id and event.provider_event_id='event-contact-crash-exhaustion';
  `);
  const crashFirst = claimReconciliation(session, { worker: "worker-crash-1", at: "2026-07-13T23:01:00Z", leaseMs: 10000 });
  assert.ok(crashFirst);
  assert.equal(crashFirst.attempt, 1);
  const crashSecond = claimReconciliation(session, { worker: "worker-crash-2", at: "2026-07-13T23:01:11Z", leaseMs: 10000 });
  assert.ok(crashSecond);
  assert.equal(crashSecond.id, crashFirst.id);
  assert.equal(crashSecond.attempt, 2);
  assert.equal(claimReconciliation(session, { worker: "worker-crash-3", at: "2026-07-13T23:01:22Z", leaseMs: 10000 }), null);
  assert.equal(session.psql(`
    select status || '|' || last_error_code from public.ghl_inbound_form_reconciliations where id='${crashFirst.id}';
  `), "operator_action_required|ghl_form_reconciliation_attempts_exhausted");

  ingestContact(session, {
    eventId: "event-contact-wrong-form",
    contactId: "contact-wrong-form",
    at: "2026-07-14T00:00:00Z",
    fingerprint: FP.c,
  });
  const wrongFormClaim = claimReconciliation(session, { worker: "worker-wrong-form", at: "2026-07-14T00:01:00Z" });
  assert.ok(wrongFormClaim);
  assert.match(applySubmission(session, wrongFormClaim, {
    submissionId: "submission-wrong-form",
    formId: "form-not-authorized",
    submittedAt: "2026-07-13T23:59:00Z",
    qualification: [["seller_timeline_field", "Soon"]],
    fingerprint: FP.f,
    now: "2026-07-14T00:01:10Z",
  }), /^operator_action_required\|0\|\|ghl_form_submission_route_missing$/);

  session.psql(`
    update public.billing_subscriptions set status='canceled', cancel_at_period_end=true,
      current_period_end='2099-01-01' where organization_id='${IDS.organization}';
  `);
  ingestContact(session, {
    eventId: "event-contact-grace-entitlement",
    contactId: "contact-grace",
    at: "2026-07-14T01:00:00Z",
    fingerprint: FP.d,
  });
  const graceClaim = claimReconciliation(session, { worker: "worker-grace", at: "2026-07-14T01:01:00Z" });
  assert.ok(graceClaim);
  assert.match(applySubmission(session, graceClaim, {
    submissionId: "submission-grace",
    formId: "form-synthetic-a",
    submittedAt: "2026-07-14T00:59:00Z",
    qualification: [["seller_timeline_field", "Soon"]],
    fingerprint: FP.one,
    now: "2026-07-14T01:01:10Z",
  }), /^completed\|1\|[0-9a-f-]{36}\|$/i);

  session.psql(`
    update public.billing_subscriptions set status='canceled', cancel_at_period_end=true,
      current_period_end='2026-07-01' where organization_id='${IDS.organization}';
  `);
  ingestContact(session, {
    eventId: "event-contact-expired-entitlement",
    contactId: "contact-expired",
    at: "2026-07-14T02:00:00Z",
    fingerprint: FP.e,
  });
  const expiredClaim = claimReconciliation(session, { worker: "worker-expired", at: "2026-07-14T02:01:00Z" });
  assert.ok(expiredClaim);
  assert.match(applySubmission(session, expiredClaim, {
    submissionId: "submission-expired",
    formId: "form-synthetic-a",
    submittedAt: "2026-07-14T01:59:00Z",
    qualification: [["seller_timeline_field", "Soon"]],
    fingerprint: FP.two,
    now: "2026-07-14T02:01:10Z",
  }), /^operator_action_required\|0\|\|ghl_inbound_campaign_entitlement_inactive$/);
  session.psql(`update public.billing_subscriptions set status='active',cancel_at_period_end=false,current_period_end='2099-01-01' where organization_id='${IDS.organization}';`);

  session.psql(`
    with event as (
      insert into public.ghl_lifecycle_webhook_events(
        organization_id,location_mapping_id,provider_event_id,event_type,provider_object_id,
        provider_contact_id,signature_algorithm,payload_fingerprint,projection_status,projection_code,received_at
      ) values (
        '${IDS.organization}','${IDS.inactiveMapping}','event-contact-inactive-mapping','ContactCreate',
        'contact-inactive','contact-inactive','ed25519','${FP.f}','reconciliation_pending',
        'signed_contact_event_requires_form_submission_reconciliation','2026-07-14T03:00:00Z'
      ) returning id
    )
    insert into public.ghl_inbound_form_reconciliations(
      organization_id,location_mapping_id,lifecycle_event_id,environment,provider_contact_id,
      reconciliation_window_start,reconciliation_window_end,created_at,updated_at
    ) select '${IDS.organization}','${IDS.inactiveMapping}',id,'sandbox','contact-inactive',
      '2026-07-13T03:00:00Z','2026-07-14T04:00:00Z','2026-07-14T03:00:00Z','2026-07-14T03:00:00Z'
    from event;
  `, { label: "Create legally inactive mapping reconciliation fixture" });
  assert.equal(claimReconciliation(session, { worker: "worker-inactive", at: "2026-07-14T03:01:00Z" }), null);
  assert.equal(session.psql(`
    select reconciliation.status || '|' || reconciliation.last_error_code
    from public.ghl_inbound_form_reconciliations reconciliation
    join public.ghl_lifecycle_webhook_events event on event.id=reconciliation.lifecycle_event_id
    where event.provider_event_id='event-contact-inactive-mapping';
  `), "operator_action_required|ghl_inbound_location_mapping_inactive");

  ingestContact(session, {
    eventId: "event-contact-required-answer-missing",
    contactId: "contact-required-answer",
    at: "2026-07-14T04:00:00Z",
    fingerprint: FP.one,
  });
  const requiredAnswerClaim = claimReconciliation(session, { worker: "worker-required-answer", at: "2026-07-14T04:01:00Z" });
  assert.ok(requiredAnswerClaim);
  assert.match(applySubmission(session, requiredAnswerClaim, {
    submissionId: "submission-required-answer-missing",
    formId: "form-synthetic-a",
    submittedAt: "2026-07-14T03:59:00Z",
    qualification: [["sms_consent_field", "yes"]],
    fingerprint: FP.three,
    now: "2026-07-14T04:01:10Z",
  }), /^operator_action_required\|0\|\|ghl_form_required_qualification_answer_missing$/);
  assert.ok(Number(session.psql(`
    select count(*) from public.ghl_inbound_form_submission_bindings
    where not sms_consent_granted and not advertising_consent_granted;
  `)) >= 1, "missing consent was silently treated as granted");

  ingestContact(session, {
    eventId: "event-contact-ambiguous-form-route",
    contactId: "contact-ambiguous-form",
    at: "2026-07-14T05:00:00Z",
    fingerprint: FP.two,
  });
  const ambiguousFormClaim = claimReconciliation(session, { worker: "worker-ambiguous-form", at: "2026-07-14T05:01:00Z" });
  assert.ok(ambiguousFormClaim);
  session.psql(`
    begin;
    set local session_replication_role=replica;
    update public.ghl_location_personalizations
    set required_form_ids='["form-synthetic-a"]'::jsonb
    where campaign_id='${IDS.campaignB}';
    commit;
  `, { label: "Create synthetic ambiguous form-route corruption" });
  assert.equal(session.psql(`
    select count(*) from public.list_ghl_inbound_eligible_form_routes_v1('${IDS.organization}','${IDS.mapping}','sandbox')
    where provider_form_id='form-synthetic-a';
  `), "0", "ambiguous form was exposed to the provider read boundary");
  assert.match(applySubmission(session, ambiguousFormClaim, {
    submissionId: "submission-ambiguous-form",
    formId: "form-synthetic-a",
    submittedAt: "2026-07-14T04:59:00Z",
    qualification: [["seller_timeline_field", "Soon"]],
    fingerprint: FP.four,
    now: "2026-07-14T05:01:10Z",
  }), /^operator_action_required\|0\|\|ghl_form_submission_route_ambiguous$/);
  session.psql(`
    begin;
    set local session_replication_role=replica;
    update public.ghl_location_personalizations
    set required_form_ids='["form-synthetic-b"]'::jsonb
    where campaign_id='${IDS.campaignB}';
    commit;
  `, { label: "Restore exact synthetic form route" });

  session.psql(`
    update public.campaign_plans
    set plan=jsonb_set(plan,'{lead_form_questions}','["What is your expected listing date?"]'::jsonb)
    where id='${IDS.campaignA}';
  `, { label: "Create synthetic campaign-question drift" });
  assert.equal(session.psql(`
    select count(*) from public.list_ghl_inbound_eligible_form_routes_v1('${IDS.organization}','${IDS.mapping}','sandbox')
    where provider_form_id='form-synthetic-a';
  `), "0", "stale campaign question/source fingerprint remained provider-readable");
  session.psqlMustFail(`
    begin; set local role service_role;
    select id from public.prepare_ghl_campaign_personalization_v2(
      '${IDS.organization}','${IDS.campaignA}','sandbox',timezone('utc',now())
    ); commit;
  `, /ghl_inbound_consent_contract_invalid/i, { label: "Reject resync against stale manifest question contract" });
  session.psql(`
    update public.campaign_plans
    set plan=jsonb_set(plan,'{lead_form_questions}','["What is your selling timeline?"]'::jsonb)
    where id='${IDS.campaignA}';
  `, { label: "Restore campaign-question contract" });
  assert.equal(session.psql(`
    select count(*) from public.list_ghl_inbound_eligible_form_routes_v1('${IDS.organization}','${IDS.mapping}','sandbox');
  `), "1", "restoring source data alone incorrectly bypassed explicit personalization verification");
  assert.match(session.psql(`
    begin; set local role service_role;
    select id::text from public.prepare_ghl_campaign_personalization_v2(
      '${IDS.organization}','${IDS.campaignA}','sandbox',timezone('utc',now())
    ); commit;
  `), /^[0-9a-f-]{36}$/i, "restored campaign contract could not enter explicit personalization preparation");
  session.psql(`
    update public.ghl_location_personalizations
    set status='ready', current_step='ready', verified_at=timezone('utc',now()),
        applied_at=timezone('utc',now()), last_error_code=null
    where campaign_id='${IDS.campaignA}';
  `, { label: "Record synthetic provider re-verification after restoring campaign contract" });
  assert.equal(session.psql(`
    select count(*) from public.list_ghl_inbound_eligible_form_routes_v1('${IDS.organization}','${IDS.mapping}','sandbox');
  `), "2", "restored exact campaign contract did not recover both routes");

  ingestContact(session, {
    eventId: "event-contact-recover-read-401",
    contactId: "contact-shared",
    eventType: "ContactUpdate",
    at: "2026-07-14T05:10:00Z",
    fingerprint: FP.two,
  });
  const replayReceipt = claimReconciliation(session, {
    worker: "worker-recover-read-401",
    at: "2026-07-14T05:11:00Z",
  });
  assert.ok(replayReceipt);
  assert.match(settleReconciliation(session, replayReceipt, {
    at: "2026-07-14T05:11:01Z",
    outcome: "operator_action_required",
    errorCode: "ghl_form_submissions_read_401",
    retryAfterMs: 1_000,
  }), /^operator_action_required\|1\|ghl_form_submissions_read_401\|$/);
  session.psqlMustFail(`
    begin; set local role service_role;
    select status from public.replay_ghl_inbound_form_reconciliation_v1(
      '${IDS.organization}','${replayReceipt.id}','sandbox','overnight-recovery-worker',
      'Recover rotated read authority','WRONG_REPLAY_AUTHORITY',timezone('utc',now())
    ); commit;
  `, /ghl_inbound_replay_authorization_invalid/i, { label: "Reject wrong reconciliation replay authorization" });
  session.psqlMustFail(`
    begin; set local role service_role;
    select status from public.replay_ghl_inbound_form_reconciliation_v1(
      '${IDS.otherOrganization}','${replayReceipt.id}','sandbox','overnight-recovery-worker',
      'Recover rotated read authority','DEALFLOW_GHL_INBOUND_RECONCILIATION_REPLAY_EXACT_V1',timezone('utc',now())
    ); commit;
  `, /ghl_inbound_replay_receipt_not_found/i, { label: "Reject cross-tenant reconciliation replay" });
  session.psqlMustFail(`
    update public.ghl_inbound_form_reconciliations
    set replay_count=6 where id='${replayReceipt.id}';
  `, /ghl_inbound_reconciliation_replay_check/i, { label: "Enforce five-entry reconciliation replay audit bound" });
  session.psql(`
    update public.ghl_location_mappings
    set forms_readonly_scope_attested_at=timezone('utc',now()) - interval '16 minutes'
    where id='${IDS.mapping}';
  `, { label: "Expire the synthetic location-scoped read attestation" });
  session.psqlMustFail(`
    begin; set local role service_role;
    select status from public.replay_ghl_inbound_form_reconciliation_v1(
      '${IDS.organization}','${replayReceipt.id}','sandbox','overnight-recovery-worker',
      'Recover rotated read authority','DEALFLOW_GHL_INBOUND_RECONCILIATION_REPLAY_EXACT_V1',timezone('utc',now())
    ); commit;
  `, /ghl_inbound_replay_current_location_authority_unproven/i,
  { label: "Reject reconciliation replay against stale mapping authority" });

  assert.equal(session.psql(`
    begin; set local role service_role;
    select inbound_form_reconciliation_enabled from public.set_ghl_inbound_form_reconciliation_runtime_v1(
      'sandbox',false,timezone('utc',now())
    ); commit;
  `), "f", "emergency runtime disable did not close the database gate");
  assert.equal(session.psql(`
    begin; set local role service_role;
    select public.drain_ghl_inbound_form_reconciliation_claims_v1('sandbox',timezone('utc',now()));
    commit;
  `), "0", "old reconciliation workers were not fully drained");
  const originalCredentialRef = session.psql(`select forms_readonly_credential_ref from public.ghl_location_mappings where id='${IDS.mapping}';`);
  const originalIneligibleCredentialRef = session.psql(`
    select forms_readonly_credential_ref from public.ghl_location_mappings where id='${IDS.ineligibleMapping}';
  `);
  assert.equal(originalIneligibleCredentialRef, "env:GHL_SANDBOX_LOCATION_STALE_TOKEN",
    "active-but-ineligible rollback fixture did not retain its historical read authority");
  const exactBinding = JSON.stringify([{
    organizationId: IDS.organization,
    mappingId: IDS.mapping,
    providerLocationId: "location-synthetic",
    credentialRef: "env:GHL_SANDBOX_LOCATION_ROTATED_TOKEN",
    verifiedFormIds: ["form-synthetic-a", "form-synthetic-b"],
  }]).replaceAll("'", "''");
  const exactVerifiedSweepBinding = JSON.stringify([{
    organizationId: IDS.organization,
    mappingId: IDS.mapping,
    providerLocationId: "location-synthetic",
    credentialRef: "env:GHL_SANDBOX_LOCATION_ROTATED_TOKEN",
    verifiedFormIds: ["form-synthetic-a", "form-synthetic-b"],
    submissionScopeProviderRequestId: "request-synthetic-verified-authority",
    submissionScopeResponseFingerprint: FP.two,
  }]).replaceAll("'", "''");
  const wrongExactSet = JSON.stringify([{
    organizationId: IDS.otherOrganization,
    mappingId: IDS.mapping,
    providerLocationId: "location-synthetic",
    credentialRef: "env:GHL_SANDBOX_LOCATION_ROTATED_TOKEN",
    verifiedFormIds: ["form-synthetic-a", "form-synthetic-b"],
  }]).replaceAll("'", "''");
  session.psqlMustFail(`
    begin; set local role service_role;
    select inbound_form_reconciliation_enabled
    from public.configure_ghl_inbound_forms_read_authorities_v1('sandbox','${wrongExactSet}'::jsonb,timezone('utc',now()));
    commit;
  `, /ghl_inbound_forms_read_batch_exact_mapping_set_required/i, { label: "Reject non-exact authority mapping set" });
  assert.equal(session.psql(`select forms_readonly_credential_ref from public.ghl_location_mappings where id='${IDS.mapping}';`), originalCredentialRef);
  assert.equal(session.psql(`select forms_readonly_credential_ref from public.ghl_location_mappings where id='${IDS.ineligibleMapping}';`),
    originalIneligibleCredentialRef, "rejected exact-set validation mutated an omitted mapping authority");
  assert.equal(session.psql(`select inbound_form_reconciliation_enabled from public.ghl_runtime_controls where environment='sandbox';`), "f");

  session.psql(`
    create or replace function private.reject_synthetic_ghl_authority_bind_v1()
    returns trigger language plpgsql set search_path=pg_catalog as $$
    begin
      if new.id='${IDS.mapping}'::uuid
         and new.forms_readonly_credential_ref='env:GHL_SANDBOX_LOCATION_ROTATED_TOKEN' then
        raise exception 'synthetic_authority_bind_failure';
      end if;
      return new;
    end $$;
    create trigger reject_synthetic_ghl_authority_bind
    before update of forms_readonly_credential_ref on public.ghl_location_mappings
    for each row execute function private.reject_synthetic_ghl_authority_bind_v1();
  `, { label: "Install synthetic authority-bind rollback probe" });
  session.psqlMustFail(`
    begin; set local role service_role;
    select inbound_form_reconciliation_enabled
    from public.configure_ghl_inbound_forms_read_authorities_v1('sandbox','${exactBinding}'::jsonb,timezone('utc',now()));
    commit;
  `, /synthetic_authority_bind_failure/i, { label: "Inject failure after omitted authority revocation" });
  assert.equal(session.psql(`select forms_readonly_credential_ref from public.ghl_location_mappings where id='${IDS.mapping}';`),
    originalCredentialRef, "failed bind partially rotated the eligible mapping authority");
  assert.equal(session.psql(`select forms_readonly_credential_ref from public.ghl_location_mappings where id='${IDS.ineligibleMapping}';`),
    originalIneligibleCredentialRef, "a later bind failure did not roll back omitted mapping revocation");
  session.psql(`
    drop trigger reject_synthetic_ghl_authority_bind on public.ghl_location_mappings;
    drop function private.reject_synthetic_ghl_authority_bind_v1();
  `, { label: "Remove synthetic authority-bind rollback probe" });

  session.psql(`
    create or replace function private.reject_synthetic_ghl_runtime_reopen_v1()
    returns trigger language plpgsql set search_path=pg_catalog as $$
    begin
      if new.environment='sandbox' and new.inbound_form_reconciliation_enabled then
        raise exception 'synthetic_runtime_reopen_failure';
      end if;
      return new;
    end $$;
    create trigger reject_synthetic_ghl_runtime_reopen
    before update on public.ghl_runtime_controls
    for each row execute function private.reject_synthetic_ghl_runtime_reopen_v1();
  `, { label: "Install synthetic batch rollback probe" });
  session.psqlMustFail(`
    begin; set local role service_role;
    select inbound_form_reconciliation_enabled
    from public.configure_ghl_inbound_forms_read_authorities_with_sweep_proof_v1(
      'sandbox','${exactVerifiedSweepBinding}'::jsonb,false,'test:atomic-rollback',timezone('utc',now())
    );
    commit;
  `, /synthetic_runtime_reopen_failure/i, { label: "Inject authority batch final-step failure" });
  assert.equal(session.psql(`select forms_readonly_credential_ref from public.ghl_location_mappings where id='${IDS.mapping}';`),
    originalCredentialRef, "credential binding partially committed when runtime reopen failed");
  assert.equal(session.psql(`select forms_readonly_credential_ref from public.ghl_location_mappings where id='${IDS.ineligibleMapping}';`),
    originalIneligibleCredentialRef, "final-step failure did not roll back omitted mapping revocation");
  assert.equal(session.psql(`select inbound_form_reconciliation_enabled from public.ghl_runtime_controls where environment='sandbox';`), "f");
  session.psql(`
    drop trigger reject_synthetic_ghl_runtime_reopen on public.ghl_runtime_controls;
    drop function private.reject_synthetic_ghl_runtime_reopen_v1();
  `, { label: "Remove synthetic batch rollback probe" });
  assert.equal(session.psql(`
    begin; set local role service_role;
    select inbound_form_reconciliation_enabled
    from public.configure_ghl_inbound_forms_read_authorities_with_sweep_proof_v1(
      'sandbox','${exactVerifiedSweepBinding}'::jsonb,false,'test:verified-authority',timezone('utc',now())
    );
    commit;
  `), "t");
  assert.equal(session.psql(`select forms_readonly_credential_ref from public.ghl_location_mappings where id='${IDS.mapping}';`),
    "env:GHL_SANDBOX_LOCATION_ROTATED_TOKEN");
  assert.equal(session.psql(`
    select concat_ws('|',coalesce(forms_readonly_credential_ref,''),coalesce(forms_readonly_capabilities::text,''),
      coalesce(forms_readonly_scope_attested_at::text,''))
    from public.ghl_location_mappings where id='${IDS.ineligibleMapping}';
  `), "||", "successful exact-set rotation retained stale authority on an omitted active mapping");
  assert.equal(session.psql(`
    begin; set local role service_role;
    select status || '|' || replay_count::text || '|' || attempt_count::text || '|' || provider_read_count::text
    from public.replay_ghl_inbound_form_reconciliation_v1(
      '${IDS.organization}','${replayReceipt.id}','sandbox','overnight-recovery-worker',
      'Recover rotated read authority','DEALFLOW_GHL_INBOUND_RECONCILIATION_REPLAY_EXACT_V1',timezone('utc',now())
    ); commit;
  `), "pending|1|0|0", "freshly rotated location authority could not replay the exact failed receipt");
  assert.equal(session.psql(`
    select concat_ws('|', replay_history #>> '{0,priorErrorCode}', replay_history #>> '{0,priorAttemptCount}',
      replay_history #>> '{0,priorProviderReadCount}', replay_history #>> '{0,priorCapturedSubmissionCount}',
      replay_history #>> '{0,requestedBy}')
    from public.ghl_inbound_form_reconciliations where id='${replayReceipt.id}';
  `), "ghl_form_submissions_read_401|1|1|0|overnight-recovery-worker",
  "reconciliation replay did not preserve the bounded operator audit history");
  session.psqlMustFail(`
    begin; set local role service_role;
    select status from public.replay_ghl_inbound_form_reconciliation_v1(
      '${IDS.organization}','${replayReceipt.id}','sandbox','overnight-recovery-worker',
      'Duplicate replay must fail','DEALFLOW_GHL_INBOUND_RECONCILIATION_REPLAY_EXACT_V1',timezone('utc',now())
    ); commit;
  `, /ghl_inbound_replay_requires_operator_action_receipt/i, { label: "Reject duplicate reconciliation replay" });
  const rotatedReplayClaim = claimReconciliation(session, {
    worker: "worker-post-rotation-replay",
    at: new Date(Date.now() + 1_000).toISOString(),
  });
  assert.ok(rotatedReplayClaim, "replayed receipt was not claimable after fresh rotation");
  assert.equal(rotatedReplayClaim.id, replayReceipt.id, "post-rotation worker claimed a different receipt");
  const replayIdempotencyCounts = session.psql(`
    select (select count(*) from public.leads where source='ghl_native_form')::text || '|' ||
      (select count(*) from public.ghl_inbound_form_submission_bindings)::text;
  `);
  assert.match(applySubmission(session, rotatedReplayClaim, {
    submissionId: "submission-shared-a1",
    formId: "form-synthetic-a",
    contactId: "contact-shared",
    submittedAt: "2026-07-13T11:59:00Z",
    qualification: [["seller_timeline_field", "Within 3 months"], ["sms_consent_field", "yes"]],
    attribution: { pageUrl: "https://funnels.example.test/campaign-a", utmSource: "facebook" },
    fingerprint: FP.a,
    now: new Date(Date.now() + 2_000).toISOString(),
  }), /^completed\|0\|[0-9a-f-]{36}\|$/i,
  "post-rotation replay did not converge on the existing submission receipt");
  assert.equal(session.psql(`
    select (select count(*) from public.leads where source='ghl_native_form')::text || '|' ||
      (select count(*) from public.ghl_inbound_form_submission_bindings)::text;
  `), replayIdempotencyCounts, "post-rotation replay duplicated a lead or submission binding");
  assert.equal(session.psql(`
    select status || '|' || replay_count::text || '|' || jsonb_array_length(replay_history)::text
    from public.ghl_inbound_form_reconciliations where id='${replayReceipt.id}';
  `), "completed|1|1");
  const providerOutboxBeforeEmergencyDisable = session.psql(`select count(*) from public.ghl_provider_outbox;`);
  assert.equal(session.psql(`
    begin; set local role service_role;
    select inbound_form_reconciliation_enabled
    from public.set_ghl_inbound_form_reconciliation_runtime_v1('sandbox',false,timezone('utc',now()));
    commit;
  `), "f");
  assert.equal(session.psql(`select count(*) from public.ghl_provider_outbox;`), providerOutboxBeforeEmergencyDisable,
    "emergency disable attempted a provider action");
  assert.equal(session.psql(`select forms_readonly_credential_ref from public.ghl_location_mappings where id='${IDS.mapping}';`),
    "env:GHL_SANDBOX_LOCATION_ROTATED_TOKEN", "emergency disable mutated credential authority");

  // Retirement is a separate, explicit, database-only authority. Prove it
  // refuses an active worker, then succeeds only after every gate is closed
  // and the claimed worker reaches a conclusive terminal state.
  assert.equal(session.psql(`
    begin; set local role service_role;
    select inbound_form_reconciliation_enabled
    from public.set_ghl_inbound_form_reconciliation_runtime_v1('sandbox',true,timezone('utc',now()));
    commit;
  `), "t", "retirement active-worker proof could not reopen the isolated inbound gate");
  session.psql(`
    insert into public.ghl_provisioning_runs(
      id, organization_id, environment, activation_event_id, installation_id,
      snapshot_manifest_id, idempotency_key, state
    ) values (
      '${IDS.retiringRun}','${IDS.organization}','sandbox','activation-controlled-retirement',
      '${IDS.installation}','${IDS.manifest}','run-controlled-retirement','requested'
    );
    begin;
    set local session_replication_role=replica;
    update public.ghl_provisioning_runs
    set location_mapping_id='${IDS.mapping}', state='snapshot_verifying',
        locked_by='worker-provisioning-retirement', locked_at=timezone('utc',now()),
        locked_until=timezone('utc',now()) + interval '10 minutes',
        lease_token='${IDS.retiringRunLease}', lease_generation=1
    where id='${IDS.retiringRun}';
    commit;
    insert into public.ghl_billing_activation_requests(
      id, organization_id, user_id, partner_id, tenant_kind, environment,
      commercial_activation_id, activation_event_id, stripe_subscription_id,
      provisioning_run_id, status
    ) values (
      '${IDS.retiringActivationRequest}','${IDS.organization}','${IDS.user}',null,'direct_realtor','sandbox',
      '${IDS.activation}','activation-controlled-retirement','sub_ghl_inbound_synthetic',
      '${IDS.retiringRun}','provisioning_requested'
    );
  `, { label: "Create synthetic live provisioning lease tied to the retiring mapping" });
  const retirementEventAt = new Date().toISOString();
  assert.match(ingestContact(session, {
    eventId: "event-controlled-retirement",
    contactId: "contact-controlled-retirement",
    at: retirementEventAt,
    fingerprint: FP.nine,
  }), /\|reconciliation_pending\|signed_contact_event_requires_form_submission_reconciliation\|/);
  const retirementClaim = claimReconciliation(session, {
    worker: "worker-controlled-retirement",
    at: new Date(Date.now() + 1_000).toISOString(),
  });
  assert.ok(retirementClaim, "controlled retirement proof did not create an active worker");
  assert.equal(retirementClaim.contactId, "contact-controlled-retirement");
  session.psql(`
    update public.ghl_runtime_controls
    set provisioning_writes_enabled=false,
        lead_writes_enabled=false,
        lifecycle_webhook_enabled=false,
        inbound_form_reconciliation_enabled=false,
        updated_at=timezone('utc',now())
    where environment='sandbox';
  `, { label: "Close every isolated GHL database gate before retirement" });
  session.psqlMustFail(`
    begin; set local role service_role;
    select status from public.retire_ghl_location_mapping_v1(
      '${IDS.organization}','${IDS.mapping}','sandbox','Synthetic controlled retirement',
      'overnight-release-worker','DEALFLOW_GHL_LOCATION_RETIREMENT_EXACT_V1',timezone('utc',now())
    ); commit;
  `, /ghl_location_retirement_requires_zero_active_or_ambiguous_workers/i,
  { label: "Reject controlled retirement while an inbound worker is active" });
  assert.match(settleReconciliation(session, retirementClaim, {
    at: new Date(Date.now() + 2_000).toISOString(),
    outcome: "operator_action_required",
    errorCode: "synthetic_controlled_retirement",
    retryAfterMs: 1_000,
  }), /^operator_action_required\|1\|synthetic_controlled_retirement\|$/,
  "active retirement worker could not be terminalized safely");
  session.psqlMustFail(`
    begin; set local role service_role;
    select status from public.retire_ghl_location_mapping_v1(
      '${IDS.organization}','${IDS.mapping}','sandbox','Synthetic controlled retirement',
      'overnight-release-worker','DEALFLOW_GHL_LOCATION_RETIREMENT_EXACT_V1',timezone('utc',now())
    ); commit;
  `, /ghl_location_retirement_requires_zero_active_or_ambiguous_workers/i,
  { label: "Reject controlled retirement while a provisioning lease is live" });
  session.psql(`
    begin;
    set local session_replication_role=replica;
    update public.ghl_provisioning_runs
    set state='location_uncertain', locked_by=null, locked_at=null, locked_until=null, lease_token=null
    where id='${IDS.retiringRun}';
    commit;
  `, { label: "Replace the live lease with an ambiguous provisioning outcome" });
  session.psqlMustFail(`
    begin; set local role service_role;
    select status from public.retire_ghl_location_mapping_v1(
      '${IDS.organization}','${IDS.mapping}','sandbox','Synthetic controlled retirement',
      'overnight-release-worker','DEALFLOW_GHL_LOCATION_RETIREMENT_EXACT_V1',timezone('utc',now())
    ); commit;
  `, /ghl_location_retirement_requires_zero_active_or_ambiguous_workers/i,
  { label: "Reject controlled retirement for an ambiguous provisioning outcome" });
  session.psql(`
    begin;
    set local session_replication_role=replica;
    update public.ghl_provisioning_runs
    set state='snapshot_verifying', locked_by='worker-provisioning-retirement',
        locked_at=timezone('utc',now()) - interval '2 minutes',
        locked_until=timezone('utc',now()) - interval '1 minute',
        lease_token='${IDS.retiringRunLease}'
    where id='${IDS.retiringRun}';
    commit;
  `, { label: "Expire the synthetic provisioning lease before controlled retirement" });
  const providerOutboxBeforeRetirement = session.psql(`select count(*) from public.ghl_provider_outbox;`);
  assert.equal(session.psql(`
    begin; set local role service_role;
    select concat_ws('|',status,coalesce(forms_readonly_credential_ref,''),retired_by,retirement_reason)
    from public.retire_ghl_location_mapping_v1(
      '${IDS.organization}','${IDS.mapping}','sandbox','Synthetic controlled retirement',
      'overnight-release-worker','DEALFLOW_GHL_LOCATION_RETIREMENT_EXACT_V1',timezone('utc',now())
    ); commit;
  `), "inactive||overnight-release-worker|Synthetic controlled retirement");
  assert.equal(session.psql(`
    select count(*) from public.ghl_provisioning_runs
    where location_mapping_id='${IDS.mapping}' and state='ready'
      and last_error_code='ghl_location_mapping_retired'
      and state_metadata->>'historicalReadyStatePreserved'='true'
      and state_metadata->>'retiredBy'='overnight-release-worker';
  `), "2", "retirement did not preserve both historical READY provisioning records");
  assert.equal(session.psql(`
    select concat_ws('|',state,coalesce(locked_by,''),coalesce(locked_until::text,''),
      coalesce(lease_token::text,''),last_error_code)
    from public.ghl_provisioning_runs where id='${IDS.retiringRun}';
  `), "canceled||||ghl_location_mapping_retired",
  "retirement did not cancel and clear the expired nonterminal provisioning lease");
  assert.equal(session.psql(`
    select status || '|' || blocker_code
    from public.ghl_billing_activation_requests where id='${IDS.retiringActivationRequest}';
  `), "blocked_configuration|ghl_location_mapping_retired",
  "retirement left the canceled provisioning activation claimable");
  assert.equal(session.psql(`
    select count(*) from public.ghl_location_personalizations
    where location_mapping_id='${IDS.mapping}' and status='operator_action_required'
      and last_error_code='ghl_location_mapping_retired';
  `), "2", "retirement left a campaign personalization provider-readable");
  assert.equal(session.psql(`select count(*) from public.ghl_provider_outbox;`), providerOutboxBeforeRetirement,
    "controlled retirement created a provider action");
  assert.equal(session.psql(`
    select provisioning_writes_enabled::text || '|' || lead_writes_enabled::text || '|' ||
      lifecycle_webhook_enabled::text || '|' || inbound_form_reconciliation_enabled::text
    from public.ghl_runtime_controls where environment='sandbox';
  `), "false|false|false|false", "controlled retirement reopened a closed database gate");
  session.psql(`
    update public.ghl_runtime_controls set provisioning_writes_enabled=true where environment='sandbox';
  `, { label: "Reopen only the isolated provisioning gate after retirement" });
  assert.equal(session.psql(`
    begin; set local role service_role;
    select count(*) from public.claim_next_ghl_provisioning_run_v1(
      'sandbox','worker-post-retirement-provisioning',timezone('utc',now()),60000
    ); commit;
  `), "0", "retired mapping provisioning work became claimable after gate reopen");
  session.psql(`
    update public.ghl_runtime_controls set provisioning_writes_enabled=false where environment='sandbox';
  `, { label: "Reclose isolated provisioning gate after retirement proof" });

  session.psql(`
    update public.campaign_plans set publish_state='published' where id='${IDS.campaignC}';
  `, { label: "Publish a campaign only after its omitted mapping authority was revoked" });
  assert.match(session.psql(`
    begin; set local role service_role;
    select id::text from public.prepare_ghl_campaign_personalization_v2(
      '${IDS.otherOrganization}','${IDS.campaignC}','sandbox',timezone('utc',now())
    ); commit;
  `), /^[0-9a-f-]{36}$/i, "newly published campaign could not prepare its mapping-local personalization");
  session.psql(`
    update public.ghl_location_personalizations
    set status='ready', current_step='ready', verified_at=timezone('utc',now()),
        applied_at=timezone('utc',now()), last_error_code=null
    where campaign_id='${IDS.campaignC}';
  `, { label: "Record synthetic personalization proof for the newly published omitted mapping" });
  assert.equal(session.psql(`
    select count(*) from public.list_ghl_inbound_eligible_form_routes_v1(
      '${IDS.otherOrganization}','${IDS.ineligibleMapping}','sandbox'
    );
  `), "1", "new publication did not expose the campaign route needed for authority revalidation");
  assert.equal(session.psql(`
    select forms_readonly_credential_ref is null and forms_readonly_capabilities is null
      and forms_readonly_scope_attested_at is null
    from public.ghl_location_mappings where id='${IDS.ineligibleMapping}';
  `), "t", "publishing an omitted mapping silently restored its stale read authority");
  session.psqlMustFail(`
    begin; set local role service_role;
    select inbound_form_reconciliation_enabled
    from public.set_ghl_inbound_form_reconciliation_runtime_v1('sandbox',true,timezone('utc',now()));
    commit;
  `, /ghl_inbound_runtime_location_authority_incomplete/i,
  { label: "Require a fresh verified batch before a newly eligible mapping can reopen provider reads" });

  assert.equal(session.psql(`
    select count(*) from public.ghl_inbound_form_submission_bindings binding
    join public.leads lead on lead.id=binding.lead_id and lead.organization_id=binding.organization_id
    join public.system_jobs job on job.organization_id=binding.organization_id
      and job.campaign_id=binding.campaign_id and job.payload #>> '{lead,id}'=binding.lead_id::text;
  `), session.psql(`select count(*) from public.ghl_inbound_form_submission_bindings;`),
  "a durable binding exists without its atomic tenant-fenced lead/job pair");
}

let createdPostgresRole = false;
try {
  assert.equal(migrations.length, EXPECTED_MIGRATION_COUNT);
  assert.ok(migrations.includes(TARGET_MIGRATION));
  assert.equal(migrations.at(-1), REQUIRED_FINAL_MIGRATION);
  assert.equal(new Set(migrations.map((name) => name.slice(0, 14))).size, migrations.length);
  adapter.preflight();
  if (adapter.psql("select exists(select 1 from pg_roles where rolname='postgres');") !== "t") {
    adapter.psql("create role postgres superuser nologin;", { label: "Create isolated migration owner" });
    createdPostgresRole = true;
  }
  await adapter.withDisposableDatabase(async (session) => {
    installRemoteEquivalentDefaults(session);
    applyCompleteMigrationChain(session);
    await proveBehavior(session);
  });
  assert.deepEqual(adapter.listDisposableDatabases(), []);
  console.log(`PASS GHL inbound disposable PostgreSQL 17.6: ${migrations.length} complete migrations, synthetic behavior only, zero network/provider actions`);
} finally {
  if (createdPostgresRole) {
    adapter.psql("drop role if exists postgres;", { label: "Remove isolated migration owner" });
  }
}
