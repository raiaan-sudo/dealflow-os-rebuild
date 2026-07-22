#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const EXPECTED_MIGRATION_COUNT = 122;
const REQUIRED_FINAL_MIGRATION = "20260722010000_modernize_provider_service_role_claims.sql";
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
  databasePrefix: `dfghls_${process.pid}_${randomBytes(2).toString("hex")}`,
  timeoutMs: 180_000,
  maxOutputBytes: 64 * 1024 * 1024,
});

const IDS = Object.freeze({
  organization: "71000000-0000-4000-8000-000000000001",
  user: "71000000-0000-4000-8000-000000000002",
  activation: "71000000-0000-4000-8000-000000000003",
  installation: "71000000-0000-4000-8000-000000000004",
  manifest: "71000000-0000-4000-8000-000000000005",
  mapping: "71000000-0000-4000-8000-000000000006",
  campaign: "71000000-0000-4000-8000-000000000007",
  provisioningRun: "71000000-0000-4000-8000-000000000008",
});
const FP = Object.freeze({
  firstProof: "a".repeat(64),
  refreshProof: "b".repeat(64),
  restoredProof: "c".repeat(64),
  rotationProof: "d".repeat(64),
  finalProof: "e".repeat(64),
  sameRefProof: "2".repeat(64),
  sweep: "f".repeat(64),
  submission: "1".repeat(64),
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

function authorityBindings({
  credentialRef = "env:GHL_SANDBOX_LOCATION_TOKEN",
  formIds = ["form-synthetic"],
  requestId = "scope-request-1",
  fingerprint = FP.firstProof,
} = {}) {
  return JSON.stringify([{
    organizationId: IDS.organization,
    mappingId: IDS.mapping,
    providerLocationId: "location-synthetic",
    credentialRef,
    verifiedFormIds: formIds,
    submissionScopeProviderRequestId: requestId,
    submissionScopeResponseFingerprint: fingerprint,
  }]).replaceAll("'", "''");
}

function configureWithProof(session, {
  at,
  credentialRef,
  formIds,
  requestId,
  fingerprint,
  actor = "operator:synthetic-test",
  enableSweep = true,
} = {}) {
  const bindings = authorityBindings({ credentialRef, formIds, requestId, fingerprint });
  return session.psql(`
    begin;
    set local role service_role;
    select concat_ws('|', inbound_form_reconciliation_enabled::text, inbound_form_sweep_enabled::text)
    from public.configure_ghl_inbound_forms_read_authorities_with_sweep_proof_v1(
      'sandbox', '${bindings}'::jsonb, ${enableSweep}, '${actor}', '${at}'::timestamptz
    );
    commit;
  `, { label: "Configure exact GHL authority with durable sweep proof" });
}

function setRuntime(session, lane, enabled, at) {
  const rpc = lane === "sweep"
    ? "set_ghl_inbound_form_sweep_runtime_v1"
    : "set_ghl_inbound_form_reconciliation_runtime_v1";
  const column = lane === "sweep"
    ? "inbound_form_sweep_enabled"
    : "inbound_form_reconciliation_enabled";
  return session.psql(`
    begin; set local role service_role;
    select ${column}::text from public.${rpc}('sandbox', ${enabled}, '${at}'::timestamptz);
    commit;
  `, { label: `${enabled ? "Enable" : "Disable"} GHL ${lane} runtime` });
}

function claimSweep(session, { worker, at, syncRegistry = true }) {
  const output = session.psql(`
    begin; set local role service_role;
    with claimed as (
      select * from public.claim_next_ghl_inbound_form_sweep_v1(
        'sandbox', '${worker}', '${at}'::timestamptz, 90000, ${syncRegistry}
      )
    )
    select concat_ws('|', claimed.run_id::text, claimed.cursor_id::text,
      claimed.window_start::text, claimed.window_end::text,
      claimed.lease_token::text, claimed.lease_generation::text)
    from claimed;
    commit;
  `, { label: `Claim GHL sweep ${worker}` });
  if (!output) return null;
  const [runId, cursorId, windowStart, windowEnd, token, generation] = output.split("|");
  const cursorBefore = session.psql(`
    select cursor_before::text from public.ghl_inbound_form_sweep_runs where id='${runId}';
  `, { label: `Inspect immutable GHL sweep run ${runId}` });
  return { runId, cursorId, cursorBefore, windowStart, windowEnd, token, generation: Number(generation), worker };
}

function completeSweep(session, claim, { at, submissions = [], request = "sweep-request" } = {}) {
  const payload = JSON.stringify(submissions).replaceAll("'", "''");
  return session.psql(`
    begin; set local role service_role;
    select concat_ws('|', status, enqueued_reconciliation_count::text, exact_window_submission_count::text)
    from public.complete_ghl_inbound_form_sweep_v1(
      '${claim.runId}', '${claim.worker}', '${claim.token}', ${claim.generation},
      '${payload}'::jsonb, jsonb_build_array('${request}'), '${FP.sweep}', 1,
      ${submissions.length}, '${at}'::timestamptz
    );
    commit;
  `, { label: `Complete GHL sweep ${claim.runId}` });
}

function claimRefresh(session, { worker, at, syncRegistry = true }) {
  const output = session.psql(`
    begin; set local role service_role;
    select concat_ws('|', state_id::text, organization_id::text, location_mapping_id::text,
      provider_location_id, credential_generation::text, verified_form_ids::text,
      lease_token::text, lease_generation::text)
    from public.claim_ghl_form_sweep_attestation_refresh_batch_v1(
      'sandbox', '${worker}', '${at}'::timestamptz, 1, 60000, ${syncRegistry}
    );
    commit;
  `, { label: `Claim GHL sweep attestation refresh ${worker}` });
  if (!output) return null;
  const [stateId, organizationId, mappingId, providerLocationId, generation, formIds, token, leaseGeneration] = output.split("|");
  return { stateId, organizationId, mappingId, providerLocationId, generation: Number(generation), formIds, token, leaseGeneration: Number(leaseGeneration), worker };
}

function completeRefresh(session, claim, { at, requestId = "scope-refresh", fingerprint = FP.refreshProof } = {}) {
  return session.psql(`
    begin; set local role service_role;
    select concat_ws('|', status, attempt_count::text, last_verified_at::text)
    from public.complete_ghl_form_sweep_attestation_refresh_v1(
      '${claim.stateId}', '${claim.worker}', '${claim.token}', ${claim.leaseGeneration},
      '${claim.formIds}'::jsonb, '${requestId}', '${fingerprint}', '${at}'::timestamptz
    );
    commit;
  `, { label: "Complete GHL sweep attestation refresh" });
}

function assertPrivilege(session, signature) {
  assert.equal(session.psql(`
    select has_function_privilege('anon','${signature}','EXECUTE')::text || '|' ||
      has_function_privilege('authenticated','${signature}','EXECUTE')::text || '|' ||
      has_function_privilege('service_role','${signature}','EXECUTE')::text;
  `), "false|false|true", `unexpected ACL for ${signature}`);
}

async function proveBehavior(session) {
  assert.equal(migrations.length, EXPECTED_MIGRATION_COUNT);
  assert.equal(session.psql("select count(*) from supabase_migrations.schema_migrations;"), String(EXPECTED_MIGRATION_COUNT));
  const baseNow = new Date();
  const at = (offsetSeconds = 0) => new Date(baseNow.getTime() + offsetSeconds * 1000).toISOString();

  session.psql(`
    insert into auth.users(id) values ('${IDS.user}');
    insert into public.users(id, email, full_name)
      values ('${IDS.user}', 'ghl-sweep-owner@example.test', 'GHL Sweep Owner');
    insert into public.organizations(id, name, slug, owner_user_id)
      values ('${IDS.organization}', 'Synthetic Sweep Realty', 'synthetic-sweep-realty', '${IDS.user}');
    insert into public.organization_memberships(organization_id, user_id, role)
      values ('${IDS.organization}', '${IDS.user}', 'owner');
    insert into public.commercial_activations(
      id, organization_id, user_id, source_provider, source_event_id,
      source_event_type, source_event_created, source_subscription_id,
      amount_paid_cents, currency
    ) values (
      '${IDS.activation}', '${IDS.organization}', '${IDS.user}', 'stripe',
      'evt_ghl_sweep_synthetic', 'checkout.session.completed', 1783944000,
      'sub_ghl_sweep_synthetic', 29700, 'cad'
    );
    insert into public.billing_subscriptions(
      organization_id, user_id, stripe_customer_id, stripe_subscription_id,
      plan_tier, status, current_period_start, current_period_end,
      cancel_at_period_end, metadata
    ) values (
      '${IDS.organization}', '${IDS.user}', 'cus_ghl_sweep_synthetic',
      'sub_ghl_sweep_synthetic', 'starter', 'active', '2026-07-01',
      '2099-01-01', false, '{}'::jsonb
    );
    insert into public.campaign_plans(
      id, owner_id, organization_id, user_id, plan, publish_state, public_slug
    ) values (
      '${IDS.campaign}', '${IDS.organization}', '${IDS.organization}', '${IDS.user}',
      '{
        "onboarding_contract_version":1,
        "onboarding_contract":{
          "businessType":"real_estate_realtor","adDestination":"website","campaignMode":"seller",
          "offer":"Free seller valuation","market":"Toronto","audience":"Toronto homeowners",
          "propertyType":"Detached homes","priceRange":"$800k-$1.5m",
          "agentFirstName":"Ada","agentLastName":"Lovelace","agentCompanyName":"Synthetic Realty",
          "agentPhone":"+14165550101","funnelLanguage":"en","themePrimaryColor":"#112233",
          "themeSecondaryColor":"#445566","themeAccentColor":"#778899","logoUrl":"https://assets.example.test/logo.png"
        },
        "lead_form_questions":["What is your selling timeline?"],
        "selected_ad_id":"creative-a",
        "staticAds":[{"id":"creative-a","headline":"Know your home value","primaryText":"Get a clear valuation.","cta":"Get my valuation"}],
        "campaign_payload":{"selected_ad_id":"creative-a","funnel":{"headlines":["Know your home value"],"cta":"Get my valuation"},"creatives":{"primary_text_variations":["Get a clear valuation."]}}
      }'::jsonb,
      'published', 'synthetic-sweep-campaign'
    );
    insert into public.ghl_workspace_tenants(organization_id, tenant_kind, status)
      values ('${IDS.organization}', 'direct_realtor', 'active');
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
      required_objects, installation_mode, installation_id,
      personalization_contract, status, approved_at
    ) values (
      '${IDS.manifest}', 'sandbox', 'ghl-sweep-synthetic', '1.0.0', 'snapshot-synthetic',
      '[
        {"kind":"pipeline","key":"new-lead","providerObjectId":"pipeline-synthetic"},
        {"kind":"custom_field","key":"sms-consent","providerObjectId":"sms_consent_field"},
        {"kind":"custom_field","key":"advertising-consent","providerObjectId":"advertising_consent_field"},
        {"kind":"custom_field","key":"seller-timeline","providerObjectId":"seller_timeline_field"}
      ]'::jsonb,
      'preinstalled', '${IDS.installation}',
      jsonb_build_object(
        'customValues', jsonb_build_object('DealFlow Platform', 'DealFlow'),
        'campaignSlots', jsonb_build_array(jsonb_build_object(
          'slotKey', 'slot-a', 'destinationUrl', 'https://funnels.example.test/sweep',
          'requiredFormIds', jsonb_build_array('form-synthetic'),
          'customValueNames', (select jsonb_object_agg(key, value || ' Sweep') from jsonb_each_text(public.ghl_default_campaign_custom_value_names_v2())),
          'inboundSmsConsentFieldId', 'sms_consent_field',
          'inboundSmsConsentPolicyVersion', 'sms-v1',
          'inboundSmsConsentCopy', 'I agree to receive SMS about my real estate request.',
          'inboundAdvertisingConsentFieldId', 'advertising_consent_field',
          'inboundAdvertisingConsentPolicyVersion', 'ads-v1',
          'inboundQuestionContractVersion', 'questions-v1',
          'inboundQuestionMappings', jsonb_build_array(jsonb_build_object(
            'fieldId','seller_timeline_field','question','What is your selling timeline?'
          ))
        ))
      ),
      'approved', timezone('utc', now()) - interval '48 hours'
    );
    insert into public.ghl_location_mappings(
      id, organization_id, installation_id, environment, provider_location_id,
      provisioning_owner, snapshot_manifest_id, status,
      snapshot_verified_at, required_objects_verified_at
    ) values (
      '${IDS.mapping}', '${IDS.organization}', '${IDS.installation}', 'sandbox',
      'location-synthetic', 'platform', '${IDS.manifest}', 'active',
      timezone('utc', now()) - interval '48 hours', timezone('utc', now()) - interval '48 hours'
    );
    insert into public.ghl_provisioning_runs(
      id, organization_id, environment, activation_event_id, installation_id,
      snapshot_manifest_id, idempotency_key, state
    ) values (
      '${IDS.provisioningRun}', '${IDS.organization}', 'sandbox', 'activation-sweep',
      '${IDS.installation}', '${IDS.manifest}', 'run-sweep', 'requested'
    );
    begin;
    set local session_replication_role = replica;
    update public.ghl_provisioning_runs
    set location_mapping_id='${IDS.mapping}', state='ready', ready_at=timezone('utc',now()) - interval '48 hours'
    where id='${IDS.provisioningRun}';
    commit;
  `, { label: "Create isolated GHL sweep fixtures" });

  const personalizationId = session.psql(`
    begin; set local role service_role;
    select id::text from public.prepare_ghl_campaign_personalization_v2(
      '${IDS.organization}', '${IDS.campaign}', 'sandbox', timezone('utc', now())
    );
    commit;
  `, { label: "Prepare GHL sweep personalization" });
  assert.match(personalizationId, /^[0-9a-f-]{36}$/i);
  session.psql(`
    update public.ghl_location_personalizations
    set status='ready', current_step='ready', verified_at=timezone('utc',now()) - interval '48 hours',
      applied_at=timezone('utc',now()) - interval '48 hours'
    where id='${personalizationId}';
  `, { label: "Mark GHL sweep personalization ready" });
  assert.equal(session.psql(`
    select string_agg(provider_form_id, ',' order by provider_form_id)
    from public.list_ghl_inbound_eligible_form_routes_v1(
      '${IDS.organization}','${IDS.mapping}','sandbox'
    );
  `), "form-synthetic");

  assert.equal(configureWithProof(session, { at: at(0) }), "true|true");
  assert.equal(session.psql(`
    select forms_readonly_credential_generation::text || '|' ||
      (select count(*)::text from public.ghl_form_sweep_scope_attestations proof
       where proof.location_mapping_id='${IDS.mapping}' and proof.credential_generation=1)
    from public.ghl_location_mappings where id='${IDS.mapping}';
  `), "1|1");
  session.psqlMustFail(`
    begin; set local role service_role;
    select * from public.bind_ghl_inbound_forms_read_authority_v1(
      '${IDS.organization}','${IDS.mapping}','sandbox','location-synthetic',
      'env:GHL_SANDBOX_LOCATION_BYPASS_TOKEN','["forms.readonly"]'::jsonb,
      '["form-synthetic"]'::jsonb,'${at(0)}'::timestamptz
    ); commit;
  `, /ghl_form_sweep_authority_change_requires_closed_runtime/i,
  { label: "Reject direct service-role authority replacement while reconciliation and sweep runtimes are open" });
  assert.equal(session.psql(`
    select forms_readonly_credential_generation::text || '|' || forms_readonly_credential_ref
    from public.ghl_location_mappings where id='${IDS.mapping}';
  `), "1|env:GHL_SANDBOX_LOCATION_TOKEN", "the rejected direct binder must leave authority unchanged");
  session.psqlMustFail(`
    begin; set local role service_role;
    select * from public.rotate_ghl_form_sweep_same_ref_generation_v1(
      '${IDS.organization}','${IDS.mapping}','sandbox','location-synthetic',1,
      'operator:synthetic-test','synthetic same-ref rotation',
      'DEALFLOW_GHL_FORM_SWEEP_SAME_REF_ROTATION_V1','${at(0)}'::timestamptz
    ); commit;
  `, /ghl_form_sweep_same_ref_rotation_requires_closed_runtimes/i,
  { label: "Reject same-ref rotation while reconciliation and sweep gates are open" });
  assert.equal(session.psql(`
    select concat_ws('|',
      private.current_ghl_form_sweep_authority_fingerprint_v1(
        mapping.organization_id, mapping.id, mapping.environment
      ) is not null,
      private.current_ghl_form_sweep_scope_proof_valid_v1(
        mapping.organization_id, mapping.id, mapping.environment,
        mapping.provider_location_id, mapping.forms_readonly_credential_generation,
        mapping.forms_readonly_scope_attested_at
      ),
      (select count(*) from public.list_ghl_inbound_eligible_form_routes_v1(
        mapping.organization_id, mapping.id, mapping.environment
      )))
    from public.ghl_location_mappings mapping where mapping.id='${IDS.mapping}';
  `), "t|t|1", "configured mapping must expose one current proven form route");

  const first = claimSweep(session, { worker: "sweep-worker-1", at: at(0) });
  assert.ok(first, "first proven GHL form sweep route was not claimable");
  assert.equal(first.windowStart, first.cursorBefore, "first window must clamp overlap to the readiness anchor");
  assert.equal(new Date(first.windowEnd).getTime() - new Date(first.cursorBefore).getTime(), 60 * 60_000);
  const firstSubmissionAt = new Date(new Date(first.windowStart).getTime() + 55 * 60_000).toISOString();
  const submission = {
    providerSubmissionId: "submission-synthetic",
    providerFormId: "form-synthetic",
    providerContactId: "contact-synthetic",
    submittedAt: firstSubmissionAt,
    submissionFingerprint: FP.submission,
  };
  assert.equal(completeSweep(session, first, { at: at(0), submissions: [submission], request: "sweep-page-1" }), "succeeded|1|1");
  assert.match(session.psql(`
    begin; set local role service_role;
    select concat_ws('|',
      (select status from public.ghl_inbound_form_sweep_cursors where id='${first.cursorId}'),
      (select coalesce(last_error_code,'') from public.ghl_inbound_form_sweep_cursors where id='${first.cursorId}'),
      active_cursor_count, backfill_active_count, lag_warning_count,
      cursor_operator_required_count, retired_cursor_count, max_lag_seconds)
    from public.summarize_ghl_form_sweep_health_v1('sandbox','${at(0)}'::timestamptz);
    commit;
  `), /^active\|\|1\|1\|0\|0\|0\|8[0-9]{4}$/,
  "successful partial progress must still report the durable >2h backlog");

  const second = claimSweep(session, { worker: "sweep-worker-2", at: at(0) });
  assert.ok(second);
  assert.equal(new Date(second.cursorBefore).getTime(), new Date(first.windowEnd).getTime());
  assert.equal(new Date(second.windowStart).getTime(), new Date(second.cursorBefore).getTime() - 10 * 60_000);
  assert.equal(completeSweep(session, second, { at: at(0), submissions: [submission], request: "sweep-page-2" }), "succeeded|0|1");
  let priorEnd = second.windowEnd;
  let completedWindows = 2;
  while (true) {
    const claim = claimSweep(session, { worker: `sweep-worker-${completedWindows + 1}`, at: at(0) });
    if (!claim) break;
    assert.equal(new Date(claim.cursorBefore).getTime(), new Date(priorEnd).getTime(), "backfill skipped a closed interval");
    assert.ok(new Date(claim.windowEnd).getTime() - new Date(claim.cursorBefore).getTime() <= 60 * 60_000);
    assert.equal(completeSweep(session, claim, { at: at(0), request: `sweep-page-${completedWindows + 1}` }), "succeeded|0|0");
    priorEnd = claim.windowEnd;
    completedWindows += 1;
    assert.ok(completedWindows <= 24, "bounded 24-hour recovery created too many windows");
  }
  assert.equal(completedWindows, 24, "the complete bounded 24-hour recovery must progress hourly");
  assert.equal(session.psql(`
    select count(*)::text || '|' ||
      (select count(*)::text from public.ghl_inbound_form_reconciliations) || '|' ||
      (select count(*)::text from public.ghl_lifecycle_webhook_events where receipt_source='provider_api_read')
    from public.ghl_inbound_form_sweep_runs where status='succeeded';
  `), "24|1|1", "overlap must reuse the same receipt/reconciliation exactly once");
  assert.equal(session.psql(`
    select status || '|' || coalesce(last_error_code,'') from public.ghl_inbound_form_sweep_cursors;
  `), "active|");

  const liveReconciliationId = session.psql(`
    begin; set local role service_role;
    select id::text from public.claim_next_ghl_inbound_form_reconciliation_v1(
      'sandbox','reconciliation-live-fence','${at(2)}'::timestamptz,60000
    ); commit;
  `, { label: "Claim one reconciliation lease for rotation fence proof" });
  assert.match(liveReconciliationId, /^[0-9a-f-]{36}$/i);
  assert.equal(setRuntime(session, "sweep", false, at(2)), "false");
  assert.equal(setRuntime(session, "reconciliation", false, at(2)), "false");
  session.psqlMustFail(`
    begin; set local role service_role;
    select * from public.rotate_ghl_form_sweep_same_ref_generation_v1(
      '${IDS.organization}','${IDS.mapping}','sandbox','location-synthetic',1,
      'operator:synthetic-test','synthetic live reconciliation fence',
      'DEALFLOW_GHL_FORM_SWEEP_SAME_REF_ROTATION_V1','${at(2)}'::timestamptz
    ); commit;
  `, /ghl_form_sweep_same_ref_rotation_requires_zero_live_leases/i,
  { label: "Reject same-ref rotation with live inbound reconciliation lease" });
  session.psql(`
    set role postgres;
    update public.ghl_inbound_form_reconciliations reconciliation set
      status='retryable_failure',
      attempt_count=greatest(reconciliation.attempt_count-1,0),
      next_retry_at='${at(2)}'::timestamptz,
      locked_by=null, locked_at=null, locked_until=null, lease_token=null,
      last_error_code='synthetic_rotation_fence_release', updated_at='${at(2)}'::timestamptz
    where reconciliation.id='${liveReconciliationId}';
    reset role;
  `, { label: "Release synthetic reconciliation lease after fence proof" });
  assert.equal(setRuntime(session, "reconciliation", true, at(3)), "true");
  assert.equal(setRuntime(session, "sweep", true, at(3)), "true");

  assert.equal(claimRefresh(session, { worker: "refresh-worker-initial", at: at(10) }), null, "fresh proof must not be refreshed immediately");
  session.psql(`
    update public.ghl_form_sweep_attestation_refresh_states
    set next_refresh_at='${at(10)}'::timestamptz, status='due'
    where location_mapping_id='${IDS.mapping}';
  `, { label: "Make one synthetic refresh due" });
  const refresh = claimRefresh(session, { worker: "refresh-worker-1", at: at(10), syncRegistry: false });
  assert.ok(refresh);
  assert.equal(completeRefresh(session, refresh, { at: at(10) }).split("|")[0], "due");
  assert.equal(claimRefresh(session, { worker: "refresh-worker-2", at: at(10) }), null, "successful refresh must schedule beyond the immediate second claim");

  session.psql(`
    update public.ghl_form_sweep_attestation_refresh_states
    set next_refresh_at='${at(11)}'::timestamptz, status='due'
    where location_mapping_id='${IDS.mapping}';
  `, { label: "Make one refresh due for post-claim gate fence" });
  const fencedRefresh = claimRefresh(session, { worker: "refresh-gate-fence", at: at(11), syncRegistry: false });
  assert.ok(fencedRefresh);
  assert.equal(setRuntime(session, "sweep", false, at(11)), "false");
  session.psqlMustFail(`
    begin; set local role service_role;
    select public.validate_ghl_form_sweep_attestation_refresh_dispatch_v1(
      '${fencedRefresh.stateId}','${fencedRefresh.worker}','${fencedRefresh.token}',
      ${fencedRefresh.leaseGeneration},'${fencedRefresh.formIds}'::jsonb,'${at(11)}'::timestamptz
    ); commit;
  `, /ghl_form_sweep_refresh_dispatch_scope_changed/i,
  { label: "Reject refresh provider dispatch after sweep gate closes" });
  assert.equal(session.psql(`
    begin; set local role service_role;
    select status from public.fail_ghl_form_sweep_attestation_refresh_v1(
      '${fencedRefresh.stateId}','${fencedRefresh.worker}','${fencedRefresh.token}',
      ${fencedRefresh.leaseGeneration},'retryable_failure',
      'ghl_form_sweep_attestation_dispatch_scope_changed','${at(11)}'::timestamptz
    ); commit;
  `), "due");
  assert.equal(session.psql("select count(*) from public.ghl_form_sweep_attestation_refresh_states where status='processing';"), "0");
  assert.equal(setRuntime(session, "sweep", true, at(11)), "true");

  assert.equal(setRuntime(session, "sweep", false, at(12)), "false");
  session.psqlMustFail(`
    begin; set local role service_role;
    select * from public.claim_ghl_form_sweep_attestation_refresh_batch_v1(
      'sandbox','disabled-refresh-worker','${at(12)}'::timestamptz,1,60000,true
    ); commit;
  `, /ghl_form_sweep_refresh_requires_reconciliation_runtime/i, { label: "Reject refresh claim while sweep disabled" });
  assert.equal(session.psql("select count(*) from public.ghl_form_sweep_attestation_refresh_states where status='processing';"), "0");
  assert.equal(setRuntime(session, "sweep", true, at(12)), "true");

  session.psql(`update public.campaign_plans set publish_state='draft' where id='${IDS.campaign}';`, { label: "Remove exact eligible form route" });
  assert.equal(claimRefresh(session, { worker: "refresh-worker-retire", at: at(14) }), null);
  assert.equal(session.psql(`select status from public.ghl_form_sweep_attestation_refresh_states where location_mapping_id='${IDS.mapping}';`), "retired");
  session.psql(`update public.campaign_plans set publish_state='published' where id='${IDS.campaign}';`, { label: "Restore exact eligible form route" });
  assert.equal(claimRefresh(session, { worker: "refresh-worker-reactivate", at: at(14) }), null);
  assert.equal(session.psql(`select status from public.ghl_form_sweep_attestation_refresh_states where location_mapping_id='${IDS.mapping}';`), "due");

  assert.equal(setRuntime(session, "sweep", false, at(16)), "false");
  assert.equal(setRuntime(session, "reconciliation", false, at(16)), "false");
  session.psql(`set role postgres; delete from public.ghl_form_sweep_scope_attestations where location_mapping_id='${IDS.mapping}'; reset role;`, { label: "Remove synthetic current-generation proof" });
  assert.equal(setRuntime(session, "reconciliation", true, at(16)), "true");
  session.psqlMustFail(`
    begin; set local role service_role;
    select * from public.set_ghl_inbound_form_sweep_runtime_v1('sandbox',true,'${at(16)}'::timestamptz);
    commit;
  `, /ghl_form_sweep_location_authority_incomplete/i, { label: "Reject sweep enable without durable current-generation proof" });
  assert.equal(setRuntime(session, "reconciliation", false, at(17)), "false");
  assert.equal(configureWithProof(session, {
    at: at(20), requestId: "scope-request-restored", fingerprint: FP.restoredProof,
  }), "true|true");

  session.psql(`
    update public.ghl_form_sweep_attestation_refresh_states
    set status='operator_action_required', last_error_code='synthetic_operator_refresh',
      worker_id=null, locked_at=null, locked_until=null, lease_token=null
    where location_mapping_id='${IDS.mapping}';
  `, { label: "Create replayable refresh operator state" });
  assert.equal(session.psql(`
    begin; set local role service_role;
    select status || '|' || attempt_count::text || '|' || replay_count::text
    from public.replay_ghl_form_sweep_attestation_refresh_v1(
      (select id from public.ghl_form_sweep_attestation_refresh_states where location_mapping_id='${IDS.mapping}'),
      '${IDS.organization}','sandbox','owner reviewed synthetic failure','operator:synthetic-test',
      'DEALFLOW_GHL_FORM_SWEEP_ATTESTATION_REFRESH_REPLAY_V1','${at(21)}'::timestamptz
    ); commit;
  `), "due|0|1");

  for (let replayOrdinal = 2; replayOrdinal <= 5; replayOrdinal += 1) {
    session.psql(`
      set role postgres;
      update public.ghl_form_sweep_attestation_refresh_states
      set status='operator_action_required', attempt_count=${replayOrdinal + 5},
        last_error_code='synthetic_refresh_replay_${replayOrdinal}',
        worker_id=null, locked_at=null, locked_until=null, lease_token=null
      where location_mapping_id='${IDS.mapping}';
      reset role;
    `, { label: `Create generation-1 refresh replay ${replayOrdinal}` });
    assert.equal(session.psql(`
      begin; set local role service_role;
      select status || '|' || attempt_count::text || '|' || replay_count::text
      from public.replay_ghl_form_sweep_attestation_refresh_v1(
        (select id from public.ghl_form_sweep_attestation_refresh_states where location_mapping_id='${IDS.mapping}'),
        '${IDS.organization}','sandbox','owner reviewed synthetic failure ${replayOrdinal}',
        'operator:synthetic-test','DEALFLOW_GHL_FORM_SWEEP_ATTESTATION_REFRESH_REPLAY_V1',
        '${at(21)}'::timestamptz
      ); commit;
    `), `due|0|${replayOrdinal}`);
  }
  assert.equal(session.psql(`
    select state.credential_generation::text || '|' || state.replay_count::text || '|' ||
      (select count(*)::text from public.ghl_form_sweep_refresh_replay_audits audit
       where audit.location_mapping_id=state.location_mapping_id and audit.credential_generation=1)
    from public.ghl_form_sweep_attestation_refresh_states state
    where state.location_mapping_id='${IDS.mapping}';
  `), "1|5|5", "generation-1 refresh replay evidence must be durable outside mutable state");

  assert.equal(setRuntime(session, "sweep", false, at(24)), "false");
  assert.equal(setRuntime(session, "reconciliation", false, at(24)), "false");
  for (let replayOrdinal = 1; replayOrdinal <= 5; replayOrdinal += 1) {
    session.psql(`
      set role postgres;
      update public.ghl_inbound_form_sweep_cursors
      set status='operator_action_required', attempt_count=${replayOrdinal + 5},
        next_retry_at=null, last_error_code='synthetic_cursor_replay_${replayOrdinal}'
      where location_mapping_id='${IDS.mapping}';
      reset role;
    `, { label: `Create generation-1 cursor replay ${replayOrdinal}` });
    assert.equal(session.psql(`
      begin; set local role service_role;
      select status || '|' || attempt_count::text || '|' || replay_count::text
      from public.replay_ghl_inbound_form_sweep_cursor_v1(
        (select id from public.ghl_inbound_form_sweep_cursors where location_mapping_id='${IDS.mapping}'),
        '${IDS.organization}','sandbox','owner reviewed synthetic cursor failure ${replayOrdinal}',
        'operator:synthetic-test','DEALFLOW_GHL_FORM_SWEEP_CURSOR_REPLAY_V1',
        '${at(24)}'::timestamptz
      ); commit;
    `), `active|0|${replayOrdinal}`);
  }
  assert.equal(session.psql(`
    select cursor_record.credential_generation::text || '|' || cursor_record.replay_count::text || '|' ||
      (select count(*)::text from public.ghl_inbound_form_sweep_cursor_replay_audits audit
       where audit.cursor_id=cursor_record.id and audit.credential_generation=1)
    from public.ghl_inbound_form_sweep_cursors cursor_record
    where cursor_record.location_mapping_id='${IDS.mapping}';
  `), "1|5|5", "generation-1 cursor replay evidence must be durable outside mutable state");
  session.psql(`
    set role postgres;
    update public.ghl_inbound_form_sweep_cursors
    set status='operator_action_required', attempt_count=11, next_retry_at=null,
      last_error_code='synthetic_generation_one_exhausted'
    where location_mapping_id='${IDS.mapping}';
    reset role;
  `, { label: "Preserve an exhausted generation-1 cursor until authority rotation" });
  assert.equal(configureWithProof(session, {
    at: at(25), credentialRef: "env:GHL_SANDBOX_LOCATION_ROTATED_TOKEN",
    requestId: "scope-request-rotated", fingerprint: FP.rotationProof,
    actor: "operator:rotation-test",
  }), "true|true");
  assert.equal(session.psql(`
    select mapping.forms_readonly_credential_generation::text || '|' || rotation.status || '|' || rotation.actor
    from public.ghl_location_mappings mapping
    join public.ghl_form_sweep_credential_rotations rotation on rotation.location_mapping_id=mapping.id
      and rotation.new_generation=mapping.forms_readonly_credential_generation
    where mapping.id='${IDS.mapping}';
  `), "2|provider_verified|operator:rotation-test");
  assert.equal(claimRefresh(session, {
    worker: "refresh-generation-2-registry-sync", at: at(26), syncRegistry: true,
  }), null, "a fresh generation-2 proof must sync state without an immediate provider read");
  assert.equal(session.psql(`
    select credential_generation::text || '|' || attempt_count::text || '|' || replay_count::text
    from public.ghl_form_sweep_attestation_refresh_states
    where location_mapping_id='${IDS.mapping}';
  `), "2|0|0", "generation rotation must reset only the mutable refresh replay budget");
  assert.equal(session.psql(`
    select count(*) from public.ghl_form_sweep_refresh_replay_audits
    where location_mapping_id='${IDS.mapping}' and credential_generation=1;
  `), "5", "generation rotation must preserve the complete generation-1 refresh replay audit");
  session.psql(`
    set role postgres;
    update public.ghl_form_sweep_attestation_refresh_states
    set status='operator_action_required', attempt_count=9,
      last_error_code='synthetic_generation_two_refresh_failure',
      worker_id=null, locked_at=null, locked_until=null, lease_token=null
    where location_mapping_id='${IDS.mapping}';
    reset role;
  `, { label: "Create the first generation-2 refresh replay" });
  assert.equal(session.psql(`
    begin; set local role service_role;
    select status || '|' || attempt_count::text || '|' || replay_count::text
    from public.replay_ghl_form_sweep_attestation_refresh_v1(
      (select id from public.ghl_form_sweep_attestation_refresh_states where location_mapping_id='${IDS.mapping}'),
      '${IDS.organization}','sandbox','owner reviewed generation two refresh failure',
      'operator:synthetic-test','DEALFLOW_GHL_FORM_SWEEP_ATTESTATION_REFRESH_REPLAY_V1',
      '${at(26)}'::timestamptz
    ); commit;
  `), "due|0|1");
  assert.equal(session.psql(`
    select string_agg(credential_generation::text || ':' || replay_total::text, ',' order by credential_generation)
    from (
      select credential_generation, count(*)::integer replay_total
      from public.ghl_form_sweep_refresh_replay_audits
      where location_mapping_id='${IDS.mapping}'
      group by credential_generation
    ) grouped;
  `), "1:5,2:1");

  assert.equal(setRuntime(session, "sweep", false, at(28)), "false");
  assert.equal(setRuntime(session, "reconciliation", false, at(28)), "false");
  const beforeFailedBatch = session.psql(`select forms_readonly_credential_generation::text || '|' || forms_readonly_credential_ref from public.ghl_location_mappings where id='${IDS.mapping}';`);
  session.psqlMustFail(`
    begin; set local role service_role;
    select * from public.configure_ghl_inbound_forms_read_authorities_with_sweep_proof_v1(
      'sandbox','${authorityBindings({
        credentialRef: "env:GHL_SANDBOX_LOCATION_REJECTED_TOKEN",
        formIds: ["wrong-form"], requestId: "scope-request-rejected", fingerprint: FP.finalProof,
      })}'::jsonb,true,'operator:failed-batch','${at(30)}'::timestamptz
    ); commit;
  `, /ghl_inbound_forms_read_verified_form_scope_changed/i, { label: "Rollback failed atomic authority/proof batch" });
  assert.equal(session.psql(`select inbound_form_reconciliation_enabled::text || '|' || inbound_form_sweep_enabled::text from public.ghl_runtime_controls where environment='sandbox';`), "false|false");
  assert.equal(session.psql(`select forms_readonly_credential_generation::text || '|' || forms_readonly_credential_ref from public.ghl_location_mappings where id='${IDS.mapping}';`), beforeFailedBatch);
  assert.equal(configureWithProof(session, {
    at: at(35), credentialRef: "env:GHL_SANDBOX_LOCATION_ROTATED_TOKEN",
    requestId: "scope-request-final", fingerprint: FP.finalProof,
  }), "true|true");

  const health = session.psql(`
    begin; set local role service_role;
    select concat_ws('|', active_cursor_count, backfill_active_count, lag_warning_count,
      cursor_operator_required_count, retired_cursor_count, max_lag_seconds,
      refresh_due_count, refresh_operator_required_count)
    from public.summarize_ghl_form_sweep_health_v1('sandbox','${at(35)}'::timestamptz);
    commit;
  `);
  assert.equal(health, "0|0|0|1|0|35|1|0",
    "the exhausted generation-1 cursor must remain operator-owned until proven generation-2 registry sync");

  // Historical generation-1 run evidence must not block the cursor from
  // adopting a proven generation-2 authority. Force only the scheduler due
  // time, then prove a new immutable generation-2 run can be claimed/settled.
  session.psql(`
    set role postgres;
    update public.ghl_inbound_form_sweep_cursors
    set next_retry_at='${at(35)}'::timestamptz
    where location_mapping_id='${IDS.mapping}';
    reset role;
  `, { label: "Make post-rotation sweep cursor due" });
  const generationTwo = claimSweep(session, { worker: "sweep-worker-generation-2", at: at(35) });
  assert.ok(generationTwo);
  assert.equal(session.psql(`
    set role postgres;
    select run_record.credential_generation::text || '|' || cursor_record.credential_generation::text || '|' ||
      cursor_record.attempt_count::text || '|' || cursor_record.replay_count::text
    from public.ghl_inbound_form_sweep_runs run_record
    join public.ghl_inbound_form_sweep_cursors cursor_record on cursor_record.id=run_record.cursor_id
    where run_record.id='${generationTwo.runId}';
    reset role;
  `), "2|2|1|0", "the new generation must receive a fresh attempt and replay budget");
  assert.equal(completeSweep(session, generationTwo, { at: at(35), request: "sweep-generation-2" }), "succeeded|0|0");
  assert.equal(session.psql(`
    set role postgres;
    select min(credential_generation)::text || '|' || max(credential_generation)::text
    from public.ghl_inbound_form_sweep_runs;
    reset role;
  `), "1|2", "historical run generations must remain immutable across credential rotation");

  assert.equal(setRuntime(session, "sweep", false, at(36)), "false");
  assert.equal(setRuntime(session, "reconciliation", false, at(36)), "false");
  session.psql(`
    set role postgres;
    update public.ghl_inbound_form_sweep_cursors
    set status='operator_action_required', attempt_count=10, next_retry_at=null,
      last_error_code='synthetic_generation_two_cursor_failure'
    where location_mapping_id='${IDS.mapping}';
    reset role;
  `, { label: "Create the first generation-2 cursor replay" });
  assert.equal(session.psql(`
    begin; set local role service_role;
    select status || '|' || attempt_count::text || '|' || replay_count::text
    from public.replay_ghl_inbound_form_sweep_cursor_v1(
      (select id from public.ghl_inbound_form_sweep_cursors where location_mapping_id='${IDS.mapping}'),
      '${IDS.organization}','sandbox','owner reviewed generation two cursor failure',
      'operator:synthetic-test','DEALFLOW_GHL_FORM_SWEEP_CURSOR_REPLAY_V1',
      '${at(36)}'::timestamptz
    ); commit;
  `), "active|0|1");
  assert.equal(session.psql(`
    select string_agg(credential_generation::text || ':' || replay_total::text, ',' order by credential_generation)
    from (
      select credential_generation, count(*)::integer replay_total
      from public.ghl_inbound_form_sweep_cursor_replay_audits
      where location_mapping_id='${IDS.mapping}'
      group by credential_generation
    ) grouped;
  `), "1:5,2:1");
  assert.equal(session.psql(`
    begin; set local role service_role;
    select forms_readonly_credential_generation::text || '|' ||
      coalesce(forms_readonly_scope_attested_at::text,'')
    from public.rotate_ghl_form_sweep_same_ref_generation_v1(
      '${IDS.organization}','${IDS.mapping}','sandbox','location-synthetic',2,
      'operator:same-ref-test','synthetic same-ref generation proof',
      'DEALFLOW_GHL_FORM_SWEEP_SAME_REF_ROTATION_V1','${at(36)}'::timestamptz
    ); commit;
  `), "3|");
  assert.equal(session.psql(`
    select status from public.ghl_form_sweep_credential_rotations
    where location_mapping_id='${IDS.mapping}' and new_generation=3;
  `), "awaiting_provider_verification");
  assert.equal(configureWithProof(session, {
    at: at(37), credentialRef: "env:GHL_SANDBOX_LOCATION_ROTATED_TOKEN",
    requestId: "scope-request-same-ref", fingerprint: FP.sameRefProof,
    actor: "operator:same-ref-proof",
  }), "true|true");
  assert.equal(session.psql(`
    select mapping.forms_readonly_credential_generation::text || '|' || rotation.status
    from public.ghl_location_mappings mapping
    join public.ghl_form_sweep_credential_rotations rotation
      on rotation.location_mapping_id=mapping.id and rotation.new_generation=3
    where mapping.id='${IDS.mapping}';
  `), "3|provider_verified", "the exact GET proof must close the same-ref rotation audit");
  assert.equal(claimRefresh(session, {
    worker: "refresh-generation-3-registry-sync", at: at(37), syncRegistry: true,
  }), null, "a fresh generation-3 proof must sync state without an immediate provider read");
  assert.equal(session.psql(`
    select credential_generation::text || '|' || attempt_count::text || '|' || replay_count::text
    from public.ghl_form_sweep_attestation_refresh_states
    where location_mapping_id='${IDS.mapping}';
  `), "3|0|0");
  assert.equal(session.psql(`
    select string_agg(credential_generation::text || ':' || replay_total::text, ',' order by credential_generation)
    from (
      select credential_generation, count(*)::integer replay_total
      from public.ghl_form_sweep_refresh_replay_audits
      where location_mapping_id='${IDS.mapping}'
      group by credential_generation
    ) grouped;
  `), "1:5,2:1", "generation-1 and generation-2 refresh replay audits must survive generation-3 reset");
  session.psql(`
    set role postgres;
    update public.ghl_inbound_form_sweep_cursors
    set next_retry_at='${at(37)}'::timestamptz
    where location_mapping_id='${IDS.mapping}';
    reset role;
  `, { label: "Make same-ref generation-3 cursor due" });
  const generationThree = claimSweep(session, { worker: "sweep-worker-generation-3", at: at(37) });
  assert.ok(generationThree);
  assert.equal(session.psql(`
    set role postgres;
    select credential_generation::text from public.ghl_inbound_form_sweep_runs where id='${generationThree.runId}';
    reset role;
  `), "3");
  assert.equal(completeSweep(session, generationThree, { at: at(37), request: "sweep-generation-3" }), "succeeded|0|0");
  assert.equal(session.psql(`
    set role postgres;
    select string_agg(distinct credential_generation::text, ',' order by credential_generation::text)
    from public.ghl_inbound_form_sweep_runs;
    reset role;
  `), "1,2,3");
  assert.equal(session.psql(`
    select string_agg(credential_generation::text || ':' || replay_total::text, ',' order by credential_generation)
    from (
      select credential_generation, count(*)::integer replay_total
      from public.ghl_inbound_form_sweep_cursor_replay_audits
      where location_mapping_id='${IDS.mapping}'
      group by credential_generation
    ) grouped;
  `), "1:5,2:1", "historical cursor replay audits must survive generation-3 registry synchronization");

  assert.equal(setRuntime(session, "reconciliation", false, at(38)), "false");
  session.psqlMustFail(`
    set role postgres;
    update public.ghl_location_mappings set status='inactive' where id='${IDS.mapping}';
    reset role;
  `, /ghl_form_sweep_mapping_retirement_requires_closed_runtime/i,
  { label: "Reject direct mapping retirement while only the sweep gate remains open" });
  session.psqlMustFail(`
    begin; set local role service_role;
    select status from public.retire_ghl_location_mapping_v1(
      '${IDS.organization}','${IDS.mapping}','sandbox','synthetic open sweep retirement rejection',
      'operator:synthetic-test','DEALFLOW_GHL_LOCATION_RETIREMENT_EXACT_V1','${at(38)}'::timestamptz
    ); commit;
  `, /ghl_form_sweep_authority_change_requires_closed_runtime/i,
  { label: "Reject controlled mapping retirement while only the sweep gate remains open" });
  assert.equal(setRuntime(session, "reconciliation", true, at(38)), "true");
  const retirementReconciliationId = session.psql(`
    begin; set local role service_role;
    select id::text from public.claim_next_ghl_inbound_form_reconciliation_v1(
      'sandbox','reconciliation-retirement-fence','${at(38)}'::timestamptz,60000
    ); commit;
  `, { label: "Claim one reconciliation lease for mapping retirement fence proof" });
  assert.match(retirementReconciliationId, /^[0-9a-f-]{36}$/i);
  assert.equal(setRuntime(session, "sweep", false, at(38)), "false");
  assert.equal(setRuntime(session, "reconciliation", false, at(38)), "false");
  session.psqlMustFail(`
    set role postgres;
    update public.ghl_location_mappings set status='inactive' where id='${IDS.mapping}';
    reset role;
  `, /ghl_form_sweep_mapping_retirement_requires_zero_live_leases/i,
  { label: "Reject direct mapping retirement while an inbound reconciliation lease is live" });
  session.psqlMustFail(`
    begin; set local role service_role;
    select status from public.retire_ghl_location_mapping_v1(
      '${IDS.organization}','${IDS.mapping}','sandbox','synthetic live reconciliation retirement rejection',
      'operator:synthetic-test','DEALFLOW_GHL_LOCATION_RETIREMENT_EXACT_V1','${at(38)}'::timestamptz
    ); commit;
  `, /ghl_location_retirement_requires_zero_active_or_ambiguous_workers/i,
  { label: "Reject controlled mapping retirement while an inbound reconciliation lease is live" });
  session.psql(`
    set role postgres;
    update public.ghl_inbound_form_reconciliations reconciliation set
      status='retryable_failure', attempt_count=greatest(reconciliation.attempt_count-1,0),
      next_retry_at='${at(38)}'::timestamptz,
      locked_by=null, locked_at=null, locked_until=null, lease_token=null,
      last_error_code='synthetic_retirement_fence_release', updated_at='${at(38)}'::timestamptz
    where reconciliation.id='${retirementReconciliationId}';
    reset role;
  `, { label: "Release synthetic reconciliation lease after retirement fence proof" });
  assert.equal(session.psql(`
    begin; set local role service_role;
    select status from public.retire_ghl_location_mapping_v1(
      '${IDS.organization}','${IDS.mapping}','sandbox','synthetic retirement proof',
      'operator:synthetic-test','DEALFLOW_GHL_LOCATION_RETIREMENT_EXACT_V1','${at(38)}'::timestamptz
    ); commit;
  `, { label: "Retire exact GHL mapping through the controlled RPC" }), "inactive");
  assert.equal(session.psql(`select status from public.ghl_inbound_form_sweep_cursors where location_mapping_id='${IDS.mapping}';`), "retired");
  assert.equal(session.psql(`select status from public.ghl_form_sweep_attestation_refresh_states where location_mapping_id='${IDS.mapping}';`), "retired");

  for (const signature of [
    "public.configure_ghl_inbound_forms_read_authorities_with_sweep_proof_v1(text,jsonb,boolean,text,timestamptz)",
    "public.claim_next_ghl_inbound_form_sweep_v1(text,text,timestamptz,integer,boolean)",
    "public.claim_ghl_form_sweep_attestation_refresh_batch_v1(text,text,timestamptz,integer,integer,boolean)",
    "public.validate_ghl_form_sweep_attestation_refresh_dispatch_v1(uuid,text,uuid,bigint,jsonb,timestamptz)",
    "public.complete_ghl_form_sweep_attestation_refresh_v1(uuid,text,uuid,bigint,jsonb,text,text,timestamptz)",
    "public.replay_ghl_form_sweep_attestation_refresh_v1(uuid,uuid,text,text,text,text,timestamptz)",
    "public.replay_ghl_inbound_form_sweep_cursor_v1(uuid,uuid,text,text,text,text,timestamptz)",
    "public.summarize_ghl_form_sweep_health_v1(text,timestamptz)",
  ]) assertPrivilege(session, signature);
  for (const table of [
    "ghl_inbound_form_sweep_cursors", "ghl_inbound_form_sweep_runs",
    "ghl_form_sweep_credential_rotations", "ghl_form_sweep_scope_attestations",
    "ghl_form_sweep_attestation_refresh_states", "ghl_inbound_form_sweep_cursor_replay_audits",
    "ghl_form_sweep_refresh_replay_audits",
  ]) {
    assert.equal(session.psql(`
      select has_table_privilege('anon','public.${table}','SELECT,INSERT,UPDATE,DELETE')::text || '|' ||
        has_table_privilege('authenticated','public.${table}','SELECT,INSERT,UPDATE,DELETE')::text || '|' ||
        has_table_privilege('service_role','public.${table}','SELECT')::text || '|' ||
        has_table_privilege('service_role','public.${table}','INSERT,UPDATE,DELETE')::text;
    `), "false|false|true|false", `unexpected table ACL for ${table}`);
  }
}

let createdPostgresRole = false;
try {
  assert.equal(migrations.length, EXPECTED_MIGRATION_COUNT);
  assert.equal(migrations.at(-1), REQUIRED_FINAL_MIGRATION);
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
  console.log("GHL periodic form sweep disposable PostgreSQL 17.6 tests passed.");
} finally {
  if (createdPostgresRole) {
    try {
      adapter.psql("drop role if exists postgres;", { label: "Remove isolated migration owner" });
    } catch (error) {
      // Other concurrently running native-PG harnesses may still own objects
      // through this shared fixture role. Their cleanup will remove it later.
      if (!String(error?.message ?? error).includes("cannot be dropped because some objects depend on it")) throw error;
    }
  }
}
