#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createNativePostgresTestAdapter,
} from "./lib/native-postgres-test-adapter.mjs";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase/migrations");
const proposalPath = process.env.ACCOUNT_DELETION_MIGRATION_PROPOSAL
  ?? path.join(migrationsDir, "20260713026000_add_account_deletion_and_provider_offboarding.sql");
const requiredFinalMigration = "20260715010000_move_legacy_org_member_policies_private.sql";
const retentionAuthorityMigration =
  "20260713028000_harden_account_deletion_retention_authority.sql";
const transactionOwningMigration = "20260710160000_validate_and_normalize_pre_candidate_shape.sql";
const migrations = fs.readdirSync(migrationsDir)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();
const prefix = `dfd_${process.pid}_${randomBytes(3).toString("hex")}`;
const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  databasePrefix: prefix,
  expectedVersion: "17.6",
  maxOutputBytes: 64 * 1024 * 1024,
  timeoutMs: 180_000,
});

const USER_A = "91000000-0000-4000-8000-000000000001";
const USER_B = "91000000-0000-4000-8000-000000000002";
const ORG_A = "92000000-0000-4000-8000-000000000001";
const ORG_B = "92000000-0000-4000-8000-000000000002";
const CAMPAIGN_A = "93000000-0000-4000-8000-000000000001";
const CAMPAIGN_B = "93000000-0000-4000-8000-000000000002";
const LEAD_A = "94000000-0000-4000-8000-000000000001";
const LEAD_B = "94000000-0000-4000-8000-000000000002";
const TICKET_A = "95000000-0000-4000-8000-000000000001";
const TICKET_B = "95000000-0000-4000-8000-000000000002";
const REQUEST_A = "96000000-0000-4000-8000-000000000001";
const REQUEST_B = "96000000-0000-4000-8000-000000000002";
const GHL_INSTALLATION_A = "97000000-0000-4000-8000-000000000001";
const GHL_SNAPSHOT_A = "97000000-0000-4000-8000-000000000002";
const GHL_MAPPING_A = "97000000-0000-4000-8000-000000000003";
const CREATIVE_A = "98000000-0000-4000-8000-000000000001";
const CREATIVE_B = "98000000-0000-4000-8000-000000000002";
const CREATIVE_VIDEO_A = "98000000-0000-4000-8000-000000000003";
const STRIPE_CLAIM = "99000000-0000-4000-8000-000000000001";
const HOLD_HASH = `sha256:${"a".repeat(64)}`;
const EMAIL_HASH = `sha256:${"b".repeat(64)}`;
const RECEIPT_HASH = `sha256:${"c".repeat(64)}`;

function migrationSource(file) {
  let source = fs.readFileSync(path.join(migrationsDir, file), "utf8");
  if (file === transactionOwningMigration) {
    source = source.replace(/^BEGIN;\s*$/im, "").replace(/^COMMIT;\s*$/im, "");
  }
  return source;
}

function asRole(role, sql, userId = null) {
  return `set role ${role};
    select set_config('request.jwt.claim.role','${role}',false);
    ${userId ? `select set_config('request.jwt.claim.sub','${userId}',false);` : ""}
    ${sql}
    reset role;`;
}

function mustFail(session, sql, pattern, label) {
  let diagnostic = "";
  try {
    session.psql(sql, { label });
  } catch (error) {
    diagnostic = error instanceof Error ? error.message : String(error);
  }
  assert.match(diagnostic, pattern, label);
}

function lastLine(output) {
  return output.trim().split("\n").at(-1) ?? "";
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

let createdPostgresRole = false;
try {
  assert.equal(migrations.length, 104, "test expects the exact 104-migration candidate");
  assert.equal(migrations.at(-1), requiredFinalMigration, "test expects the exact final migration");
  assert.ok(fs.existsSync(proposalPath), `proposal missing: ${proposalPath}`);
  adapter.preflight();
  if (adapter.psql("select exists(select 1 from pg_roles where rolname='postgres');") !== "t") {
    adapter.psql("create role postgres superuser nologin;");
    createdPostgresRole = true;
  }

  await adapter.withDisposableDatabase(async (session) => {
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
        unique (bucket_id,name)
      );
      grant usage on schema storage to anon, authenticated, service_role;
      grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
      reset role;
    `, { label: "Install remote-equivalent defaults" });

    for (const file of migrations) {
      session.psql(`begin; set role postgres; ${migrationSource(file)} reset role; commit;`, {
        label: `Apply ${file}`,
        timeoutMs: 180_000,
      });
    }
    session.psql(`begin; set role postgres; ${fs.readFileSync(proposalPath, "utf8")} reset role; commit;`, {
      label: "Replay integrated account-deletion migration after exact chain",
      timeoutMs: 180_000,
    });
    session.psql(`begin; set role postgres; ${fs.readFileSync(proposalPath, "utf8")} reset role; commit;`, {
      label: "Replay integrated account-deletion migration a second time",
      timeoutMs: 180_000,
    });
    session.psql(`
      set role postgres;
      grant update(approved_at) on public.account_deletion_retention_configuration to service_role;
      reset role;
    `, { label: "Inject a stale column-level service-role retention grant" });
    assert.equal(lastLine(session.psql(`
      select has_any_column_privilege(
        'service_role',
        'public.account_deletion_retention_configuration',
        'UPDATE'
      );
    `, { label: "Prove the injected column-level grant is effective" })), "t");
    session.psql(`begin; set role postgres; ${migrationSource(retentionAuthorityMigration)} reset role; commit;`, {
      label: "Replay retention-authority hardening over a stale column grant",
      timeoutMs: 180_000,
    });
    assert.equal(lastLine(session.psql(`
      select concat_ws('|',
        has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'SELECT'),
        has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'INSERT'),
        has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'UPDATE'),
        has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'DELETE'),
        has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'TRUNCATE'),
        has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'REFERENCES'),
        has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'TRIGGER')
      );
    `, { label: "Prove service-role retention authority is read-only" })),
    "t|f|f|f|f|f|f");
    assert.equal(lastLine(session.psql(`
      select concat_ws('|',
        has_any_column_privilege('service_role', 'public.account_deletion_retention_configuration', 'INSERT'),
        has_any_column_privilege('service_role', 'public.account_deletion_retention_configuration', 'UPDATE'),
        has_any_column_privilege('service_role', 'public.account_deletion_retention_configuration', 'REFERENCES')
      );
    `, { label: "Prove service-role has no column-level retention writes" })),
    "f|f|f");
    for (const apiRole of ["authenticated", "anon"]) {
      assert.equal(lastLine(session.psql(`
        select concat_ws('|',
          has_table_privilege('${apiRole}', 'public.account_deletion_retention_configuration', 'SELECT'),
          has_table_privilege('${apiRole}', 'public.account_deletion_retention_configuration', 'INSERT'),
          has_table_privilege('${apiRole}', 'public.account_deletion_retention_configuration', 'UPDATE'),
          has_table_privilege('${apiRole}', 'public.account_deletion_retention_configuration', 'DELETE'),
          has_table_privilege('${apiRole}', 'public.account_deletion_retention_configuration', 'TRUNCATE'),
          has_table_privilege('${apiRole}', 'public.account_deletion_retention_configuration', 'REFERENCES'),
          has_table_privilege('${apiRole}', 'public.account_deletion_retention_configuration', 'TRIGGER')
        );
      `, { label: `Prove ${apiRole} has no retention-configuration table authority` })),
      "f|f|f|f|f|f|f");
      assert.equal(lastLine(session.psql(`
        select concat_ws('|',
          has_any_column_privilege('${apiRole}', 'public.account_deletion_retention_configuration', 'SELECT'),
          has_any_column_privilege('${apiRole}', 'public.account_deletion_retention_configuration', 'INSERT'),
          has_any_column_privilege('${apiRole}', 'public.account_deletion_retention_configuration', 'UPDATE'),
          has_any_column_privilege('${apiRole}', 'public.account_deletion_retention_configuration', 'REFERENCES')
        );
      `, { label: `Prove ${apiRole} has no retention-configuration column authority` })),
      "f|f|f|f");
    }
    assert.equal(lastLine(session.psql(`
      select pg_get_userbyid(class.relowner) || '|' ||
        has_table_privilege(
          pg_get_userbyid(class.relowner),
          'public.account_deletion_retention_configuration',
          'UPDATE'
        )::text
      from pg_class class
      join pg_namespace namespace on namespace.oid=class.relnamespace
      where namespace.nspname='public'
        and class.relname='account_deletion_retention_configuration';
    `, { label: "Prove the table owner retains retention-policy update authority" })),
    "postgres|true");
    assert.equal(lastLine(session.psql(asRole(
      "service_role",
      "select count(*) from public.account_deletion_retention_configuration;",
    ), { label: "Read retention configuration through service role" })), "1");
    mustFail(session, asRole("service_role", `
      update public.account_deletion_retention_configuration
      set policy_version=policy_version
      where singleton;
    `), /permission denied/i, "service role changed owner/legal retention authority");
    for (const apiRole of ["authenticated", "anon"]) {
      mustFail(session, asRole(apiRole, `
        select singleton from public.account_deletion_retention_configuration;
      `), /permission denied/i, `${apiRole} read owner/legal retention authority`);
    }
    session.psql(`
      begin;
      set role postgres;
      update public.account_deletion_retention_configuration
      set policy_version=policy_version
      where singleton;
      reset role;
      rollback;
    `, { label: "Prove postgres owner can update retention authority" });
    session.psql(`
      set role postgres;
      insert into auth.users(id) values ('${USER_A}'),('${USER_B}');
      insert into public.users(id,email,full_name) values
        ('${USER_A}','owner-a@example.invalid','Owner A'),('${USER_B}','owner-b@example.invalid','Owner B');
      insert into public.organizations(id,name,slug,owner_user_id) values
        ('${ORG_A}','Workspace A','workspace-a','${USER_A}'),
        ('${ORG_B}','Workspace B','workspace-b','${USER_B}');
      insert into public.organization_memberships(organization_id,user_id,role) values
        ('${ORG_A}','${USER_A}','owner'),('${ORG_B}','${USER_B}','owner');
      insert into public.ghl_workspace_tenants(organization_id,tenant_kind,status)
      values ('${ORG_A}','direct_realtor','active');
      insert into public.ghl_installations(
        id,environment,owner_kind,provider_agency_id,status,capability_manifest
      ) values ('${GHL_INSTALLATION_A}','test','platform','agency-test-a','active','{}'::jsonb);
      insert into public.ghl_snapshot_manifests(
        id,environment,snapshot_key,snapshot_version,provider_snapshot_id,required_objects,status,approved_at
      ) values (
        '${GHL_SNAPSHOT_A}','test','deletion-proof','v1','snapshot-test-a',
        '["contacts"]'::jsonb,'approved',timezone('utc',now())
      );
      insert into public.ghl_location_mappings(
        id,organization_id,installation_id,environment,provider_location_id,
        provisioning_owner,snapshot_manifest_id,status,snapshot_verified_at,
        required_objects_verified_at,forms_readonly_credential_ref,
        forms_readonly_capabilities,forms_readonly_scope_attested_at
      ) values (
        '${GHL_MAPPING_A}','${ORG_A}','${GHL_INSTALLATION_A}','test','location-test-a',
        'platform','${GHL_SNAPSHOT_A}','active',timezone('utc',now()),timezone('utc',now()),
        'env:GHL_SANDBOX_LOCATION_DELETE_TOKEN','["forms.readonly"]'::jsonb,timezone('utc',now())
      );
      insert into public.service_types(organization_id,name,category) values
        ('${ORG_A}','Sensitive service','core'),('${ORG_B}','Other service','core');
      insert into public.campaign_plans(
        id,owner_id,plan,user_id,organization_id,publish_state,business_name,client_name
      ) values
        ('${CAMPAIGN_A}','${USER_A}','{}'::jsonb,'${USER_A}','${ORG_A}','draft','Sensitive brokerage','Sensitive client'),
        ('${CAMPAIGN_B}','${USER_B}','{}'::jsonb,'${USER_B}','${ORG_B}','draft','Other brokerage','Other client');
      insert into public.leads(
        id,organization_id,source,first_name,last_name,email,phone,status,campaign_id,user_id,
        consent_metadata,metadata
      ) values
        ('${LEAD_A}','${ORG_A}','funnel','Sensitive','Lead','sensitive@example.invalid','+14165550101','new','${CAMPAIGN_A}','${USER_A}','{}'::jsonb,'{"private":"tenant-a"}'::jsonb),
        ('${LEAD_B}','${ORG_B}','funnel','Other','Lead','other@example.invalid','+14165550102','new','${CAMPAIGN_B}','${USER_B}','{}'::jsonb,'{"private":"tenant-b"}'::jsonb);
      insert into public.support_tickets(
        id,organization_id,user_id,request_id,subject,message,safe_context
      ) values
        ('${TICKET_A}','${ORG_A}','${USER_A}','${REQUEST_A}','Sensitive support','Private support message','{"private":"tenant-a"}'::jsonb),
        ('${TICKET_B}','${ORG_B}','${USER_B}','${REQUEST_B}','Other support','Other support message','{"private":"tenant-b"}'::jsonb);
      insert into public.support_notification_outbox(ticket_id,idempotency_key) values
        ('${TICKET_A}','support:tenant-a'),('${TICKET_B}','support:tenant-b');
      insert into public.activation_journey_events(
        organization_id,user_id,event_name,idempotency_key,metadata
      ) values
        ('${ORG_A}','${USER_A}','onboarding_started','journey:tenant-a','{"private":"tenant-a"}'::jsonb),
        ('${ORG_B}','${USER_B}','onboarding_started','journey:tenant-b','{"private":"tenant-b"}'::jsonb);
      insert into public.client_error_events(event_key,message,metadata) values
        ('error:tenant-a','Sensitive browser error','{"organizationId":"${ORG_A}","private":"tenant-a"}'::jsonb),
        ('error:tenant-b','Other browser error','{"organizationId":"${ORG_B}","private":"tenant-b"}'::jsonb);
      insert into public.creative_assets(
        id,user_id,campaign_id,provider_name,status,storage_bucket,storage_path,
        provider_asset_id,file_url
      ) values
        ('${CREATIVE_A}','${USER_A}','${CAMPAIGN_A}','manual_upload','ready','creative-assets','${USER_A}/${CAMPAIGN_A}/tenant-a.png',null,null),
        ('${CREATIVE_B}','${USER_B}','${CAMPAIGN_B}','manual_upload','ready','creative-assets','${USER_B}/${CAMPAIGN_B}/tenant-b.png',null,null),
        ('${CREATIVE_VIDEO_A}','${USER_A}','${CAMPAIGN_A}','higgsfield','ready','creative-assets','generated-video/${ORG_A}/${USER_A}/${CAMPAIGN_A}/higgsfield/${CREATIVE_VIDEO_A}.video','provider-video-a','https://project.invalid/storage/v1/object/public/creative-assets/generated-video/${ORG_A}/${USER_A}/${CAMPAIGN_A}/higgsfield/${CREATIVE_VIDEO_A}.video');
      insert into private.generated_video_storage_bindings(
        asset_id,organization_id,user_id,campaign_id,provider_name,
        provider_asset_id_digest,storage_bucket,storage_path,file_url,
        content_sha256,content_length,mime_type
      ) values (
        '${CREATIVE_VIDEO_A}','${ORG_A}','${USER_A}','${CAMPAIGN_A}','higgsfield',
        '${"d".repeat(64)}','creative-assets',
        'generated-video/${ORG_A}/${USER_A}/${CAMPAIGN_A}/higgsfield/${CREATIVE_VIDEO_A}.video',
        'https://project.invalid/storage/v1/object/public/creative-assets/generated-video/${ORG_A}/${USER_A}/${CAMPAIGN_A}/higgsfield/${CREATIVE_VIDEO_A}.video',
        '${"e".repeat(64)}',42,'video/mp4'
      );
      insert into public.billing_subscriptions(
        organization_id,user_id,stripe_customer_id,stripe_subscription_id,
        stripe_price_id,plan_tier,status,cancel_at_period_end
      ) values (
        '${ORG_A}','${USER_A}','cus_synthetic_a','sub_synthetic_a',
        'price_synthetic_a','starter','active',false
      );
      update public.account_deletion_retention_configuration set
        grace_days=0, operational_retention_days=1, support_retention_days=1,
        analytics_retention_days=1, financial_retention_days=365,
        receipt_retention_days=365, billing_cancellation_mode='period_end',
        policy_version=2,
        approved_authority_hash=null,
        approved_at=null
      where singleton;
      reset role;
    `, { label: "Seed two isolated tenants" });

    mustFail(session, asRole("authenticated", `
      select id from public.create_account_deletion_request_v1(
        '${ORG_A}','${USER_A}','account-deletion:direct-rpc','password','${EMAIL_HASH}'
      );
    `, USER_A), /permission denied|service_role_required/i,
    "authenticated caller bypassed server-side identity confirmation");
    mustFail(session, asRole("service_role", `
      select id from public.create_account_deletion_request_v1(
        '${ORG_A}','${USER_A}','account-deletion:pending-authority','password','${EMAIL_HASH}'
      );
    `), /account_deletion_retention_authority_pending/i,
    "an unapproved seeded retention policy was treated as genuine owner/legal authority");
    session.psql(`
      set role postgres;
      update public.account_deletion_retention_configuration set
        approved_authority_hash='${HOLD_HASH}',
        approved_at=timezone('utc',now())
      where singleton;
      reset role;
    `, { label: "Attest synthetic test-only retention authority" });
    const requestId = lastLine(session.psql(asRole("service_role", `
      select id from public.create_account_deletion_request_v1(
        '${ORG_A}','${USER_A}','account-deletion:test-a','password','${EMAIL_HASH}'
      );
    `), { label: "Create server-verified owner deletion request" }));
    assert.match(requestId, /^[a-f0-9-]{36}$/);
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select coalesce(jsonb_agg(class.relname order by class.relname),'[]'::jsonb)::text
      from pg_class class
      join pg_namespace namespace on namespace.oid=class.relnamespace
      where namespace.nspname='public' and class.relkind in ('r','p')
        and class.relname not like 'account_deletion_%'
        and exists (
          select 1 from pg_attribute attribute
          where attribute.attrelid=class.oid and attribute.attnum>0
            and not attribute.attisdropped
            and attribute.attname in ('organization_id','workspace_id','user_id','owner_id')
        )
        and not exists (
          select 1 from public.account_deletion_data_inventory inventory
          where inventory.resource_kind='table'
            and inventory.relation_schema='public'
            and inventory.relation_name=class.relname
        );
    `))), "[]", "schema-scoped relation missing from deletion classification ledger");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      with required(table_name,column_name) as (values
        ('appointments','notes'),('campaign_leads','full_name'),('campaign_leads','email'),
        ('campaign_leads','phone'),('campaign_leads','answers'),('data_imports','file_path'),
        ('data_imports','errors'),('deals','contact_name'),('deals','notes'),
        ('generated_artifacts','payload'),('internal_notes','body'),('jobs','customer_name'),
        ('jobs','address'),('jobs','notes'),('marketing_accounts','access_token_encrypted'),
        ('marketing_accounts','connection_metadata')
      )
      select coalesce(jsonb_agg(required.table_name||'.'||required.column_name order by required.table_name,required.column_name),'[]'::jsonb)::text
      from required
      where to_regclass('public.'||required.table_name) is not null
        and exists (
          select 1 from pg_attribute attribute
          where attribute.attrelid=to_regclass('public.'||required.table_name)
            and attribute.attname=required.column_name
            and attribute.attnum>0 and not attribute.attisdropped
        )
        and not exists (
          select 1 from public.account_deletion_data_inventory inventory
          where inventory.resource_kind='table'
            and inventory.relation_name=required.table_name
            and required.column_name=any(inventory.pii_columns)
        );
    `))), "[]", "named high-risk PII column missing from deletion classification ledger");
    assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.account_deletion_tasks where request_id='${requestId}';`))), "16");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select id from public.create_account_deletion_request_v1(
        '${ORG_A}','${USER_A}','account-deletion:test-a','password','${EMAIL_HASH}'
      );
    `))), requestId, "idempotent replay changed request identity");

    mustFail(session, asRole("service_role", `
      select id from public.create_account_deletion_request_v1(
        '${ORG_A}','${USER_B}','account-deletion:hostile','password','${EMAIL_HASH}'
      );
    `), /owner_authority_required/i, "cross-tenant deletion request must fail");
    session.psql(asRole("service_role", `
      update public.account_deletion_requests set requested_at=timezone('utc',now())-interval '366 days'
      where id='${requestId}';
    `), { label: "Move isolated retention clock past approved deadlines" });
    mustFail(session, asRole("service_role", `
      insert into public.service_types(organization_id,name,category)
      values ('${ORG_A}','Blocked after suspension','core');
    `), /workspace_suspended/i, "service-role write to suspended tenant must fail");
    session.psql(asRole("service_role", `
      insert into public.service_types(organization_id,name,category)
      values ('${ORG_B}','Allowed other tenant','core');
    `), { label: "Unsuspended tenant remains writable" });
    mustFail(session, asRole("service_role", `
      update public.service_types set organization_id='${ORG_B}'
      where organization_id='${ORG_A}' and name='Sensitive service';
    `), /workspace_suspended/i, "UPDATE escaped a suspended OLD tenant scope");
    mustFail(session, asRole("service_role", `
      update public.service_types set organization_id='${ORG_A}'
      where organization_id='${ORG_B}' and name='Allowed other tenant';
    `), /workspace_suspended/i, "UPDATE entered a suspended NEW tenant scope");
    assert.equal(lastLine(session.psql(asRole("authenticated", `select count(*) from public.organizations where id='${ORG_A}';`, USER_A))), "0", "suspended owner retained direct RLS visibility");
    assert.equal(lastLine(session.psql(asRole("authenticated", "select public.is_current_account_deletion_suspended_v1();", USER_A))), "t", "edge access gate did not identify suspended owner");
    assert.equal(lastLine(session.psql(asRole("authenticated", "select public.is_current_account_deletion_suspended_v1();", USER_B))), "f", "edge access gate fenced the wrong tenant");
    mustFail(session, asRole("service_role", `
      update public.billing_subscriptions set status='active',cancel_at_period_end=false
      where organization_id='${ORG_A}';
    `), /workspace_suspended/i, "suspension allowed an unsafe billing reactivation projection");
    session.psql(asRole("service_role", `
      select claim_outcome from public.claim_stripe_webhook_event_v2(
        'evt_signed_deletion_a','customer.subscription.deleted','sub_synthetic_a',
        '${ORG_A}','sub_synthetic_a','{"api_version":"2025-04-30","created":1,"livemode":false}'::jsonb,
        '${STRIPE_CLAIM}',300000
      );
      select applied from public.apply_billing_subscription_webhook(
        '${ORG_A}','${USER_A}','cus_synthetic_a','sub_synthetic_a','price_synthetic_a',
        'starter','canceled',null,timezone('utc',now()),false,'{}'::jsonb,
        'evt_signed_deletion_a',1
      );
      select public.settle_stripe_webhook_event_v2(
        'evt_signed_deletion_a','${STRIPE_CLAIM}',1,'processed',null,null
      );
    `), { label: "Reconcile prevalidated signed Stripe cancellation after suspension" });
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select status||'|'||cancel_at_period_end::text from public.billing_subscriptions
      where organization_id='${ORG_A}';
    `))), "canceled|false");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select status from public.stripe_webhook_events
      where stripe_event_id='evt_signed_deletion_a';
    `))), "processed");
    assert.equal(lastLine(session.psql(asRole("authenticated", "select public.is_current_account_deletion_suspended_v1();", USER_A))), "t", "Stripe reconciliation reactivated product access");

    function claimTask(expectedKind) {
      const raw = lastLine(session.psql(asRole("service_role", `
        select row_to_json(claimed)::text
        from public.claim_account_deletion_tasks_v1('lifecycle-worker',25,120) claimed;
      `), { label: `Claim ${expectedKind}` }));
      assert.notEqual(raw, "", `${expectedKind} was not claimable`);
      const claimed = JSON.parse(raw);
      assert.equal(claimed.task_kind, expectedKind, `unexpected task before ${expectedKind}`);
      return claimed;
    }

    function settleTask(task, outcome, resultCode, metadata = {}) {
      const status = lastLine(session.psql(asRole("service_role", `
        select status from public.settle_account_deletion_task_v1(
          ${quoteLiteral(task.id)},${quoteLiteral(task.claim_token)},${Number(task.claim_generation)},
          ${quoteLiteral(outcome)},${quoteLiteral(resultCode)},
          ${outcome === "completed" && task.task_kind.includes("stripe") ? quoteLiteral(RECEIPT_HASH) : "null"},
          ${quoteLiteral(JSON.stringify(metadata))}::jsonb,null
        );
      `), { label: `Settle ${task.task_kind}` }));
      assert.equal(status, outcome === "completed" ? "completed" : outcome);
    }

    function executeAndSettle(expectedKind) {
      const task = claimTask(expectedKind);
      const raw = lastLine(session.psql(asRole("service_role", `
        select row_to_json(result)::text
        from public.execute_account_deletion_internal_action_v1(
          ${quoteLiteral(task.id)},${quoteLiteral(task.claim_token)},${Number(task.claim_generation)}
        ) result;
      `), { label: `Execute ${expectedKind}` }));
      const result = JSON.parse(raw);
      assert.equal(result.result_outcome, "completed", `${expectedKind} did not complete internally`);
      settleTask(task, result.result_outcome, result.result_code, result.receipt_metadata ?? {});
      return task;
    }

    executeAndSettle("suspend_workspace");
    session.psql(asRole("service_role", `
      insert into public.account_deletion_operator_authorities(
        user_id,can_manage_legal_holds,can_resolve_provider_evidence,active
      ) values ('${USER_B}',true,true,true);
    `), { label: "Install isolated operator authority" });
    {
      const authTaskId = lastLine(session.psql(asRole("service_role", `
        update public.account_deletion_tasks set status='operator_required',
          operator_required_at=timezone('utc',now())
        where request_id='${requestId}' and task_kind='delete_auth_identity'
        returning id;
      `)));
      mustFail(session, asRole("service_role", `
        select status from public.resolve_account_deletion_operator_task_v1(
          '${authTaskId}','complete_with_evidence','auth_identity_deletion_verified',
          '${RECEIPT_HASH}','${USER_B}'
        );
      `), /manual_completion_forbidden/i, "operator manually completed an internal/auth task");
      assert.equal(lastLine(session.psql(asRole("service_role", `
        select status from public.resolve_account_deletion_operator_task_v1(
          '${authTaskId}','requeue','operator_retry_authorized',null,'${USER_B}'
        );
      `))), "queued");
    }
    settleTask(claimTask("revoke_auth_sessions"), "completed", "auth_sessions_revoked", { synthetic: true });
    settleTask(claimTask("cancel_stripe_subscription"), "completed", "stripe_subscription_nonrenewing", { synthetic: true });
    settleTask(claimTask("revoke_meta_permissions"), "completed", "meta_permissions_absent", { synthetic: true });
    {
      const task = claimTask("disconnect_ghl");
      const raw = lastLine(session.psql(asRole("service_role", `
        select row_to_json(result)::text
        from public.execute_account_deletion_internal_action_v1(
          ${quoteLiteral(task.id)},${quoteLiteral(task.claim_token)},${Number(task.claim_generation)}
        ) result;
      `), { label: "Prove GHL requires provider-side evidence" }));
      const result = JSON.parse(raw);
      assert.equal(result.result_outcome, "operator_required");
      assert.equal(result.result_code, "ghl_provider_worker_or_operator_evidence_required");
      settleTask(task, result.result_outcome, result.result_code, result.receipt_metadata ?? {});
      mustFail(session, asRole("service_role", `
        select status from public.resolve_account_deletion_operator_task_v1(
          '${task.id}','complete_with_evidence','ghl_provider_uninstall_verified',
          '${RECEIPT_HASH}','${USER_B}'
        );
      `), /evidence_result_invalid/i, "GHL operator accepted an unrecognized evidence result");
      assert.equal(lastLine(session.psql(asRole("service_role", `
        select status from public.resolve_account_deletion_operator_task_v1(
          '${task.id}','complete_with_evidence','ghl_owned_location_deletion_verified',
          '${RECEIPT_HASH}','${USER_B}'
        );
      `), { label: "Resolve GHL only with audited provider evidence" })), "completed");
      assert.equal(lastLine(session.psql(asRole("service_role", `
        select status||'|'||provider_location_id||'|'||
          (forms_readonly_credential_ref is null)::text
        from public.ghl_location_mappings
        where id='${GHL_MAPPING_A}';
      `))), "inactive|location-test-a|true");
      assert.equal(lastLine(session.psql(asRole("service_role", `
        select status from public.ghl_workspace_tenants where organization_id='${ORG_A}';
      `))), "inactive");
    }
    executeAndSettle("disable_support_delivery");
    executeAndSettle("freeze_analytics");

    session.psql(asRole("service_role", `
      update public.account_deletion_tasks set available_at=timezone('utc',now()), next_attempt_at=null
      where request_id='${requestId}' and status <> 'completed';
      select id from public.manage_account_deletion_legal_hold_v1(
        '${requestId}','set','synthetic_dispute','${HOLD_HASH}','${USER_B}'
      );
    `), { label: "Set audited legal hold after immediate offboarding" });
    assert.equal(lastLine(session.psql(asRole("service_role", "select count(*) from public.claim_account_deletion_tasks_v1('hold-worker',25,120);"))), "0", "legal hold failed to block retention work");
    session.psql(asRole("service_role", `
      select id from public.manage_account_deletion_legal_hold_v1(
        '${requestId}','released','synthetic_dispute_released','${HOLD_HASH}','${USER_B}'
      );
    `), { label: "Release audited legal hold" });

    {
      const task = claimTask("delete_creative_storage");
      const inventory = session.psql(asRole("service_role", `
        select asset_id||'|'||storage_bucket||'|'||storage_path||'|'||inventory_state
        from public.get_account_deletion_creative_storage_inventory_v1(
          '${task.id}','${task.claim_token}',${Number(task.claim_generation)}
        ) order by asset_id;
      `), { label: "Inventory tenant-scoped creative storage" });
      assert.match(inventory, new RegExp(`^${CREATIVE_A}\\|creative-assets\\|`, "m"));
      assert.match(inventory, new RegExp(`^${CREATIVE_VIDEO_A}\\|creative-assets\\|generated-video/`, "m"));
      assert.doesNotMatch(inventory, new RegExp(CREATIVE_B), "tenant B creative entered tenant A inventory");
      assert.equal(lastLine(session.psql(asRole("service_role", `
        select public.finalize_account_deletion_creative_storage_v1(
          '${task.id}','${task.claim_token}',${Number(task.claim_generation)},
          array['${CREATIVE_A}'::uuid,'${CREATIVE_VIDEO_A}'::uuid]
        );
      `), { label: "Finalize exact tenant A creative asset rows" })), "2");
      settleTask(task, "completed", "creative_storage_deleted", { removedCount: 2 });
      assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.creative_assets where id='${CREATIVE_B}';`))), "1");
    }
    executeAndSettle("anonymize_support");
    executeAndSettle("anonymize_analytics");
    executeAndSettle("delete_operational_data");
    executeAndSettle("anonymize_financial_subjects");
    executeAndSettle("purge_expired_financial_records");
    executeAndSettle("expire_deletion_receipt_details");
    settleTask(claimTask("delete_auth_identity"), "completed", "auth_identity_soft_deleted", { synthetic: true });
    executeAndSettle("complete_request");

    assert.equal(lastLine(session.psql(asRole("service_role", `select state from public.account_deletion_requests where id='${requestId}';`))), "completed");
    assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.account_deletion_tasks where request_id='${requestId}' and status='completed';`))), "16");
    assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.account_deletion_receipts where request_id='${requestId}';`))), "17");
    assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.account_deletion_receipts where request_id='${requestId}' and task_kind='disconnect_ghl';`))), "2", "GHL escalation and evidence resolution were not both receipted");
    assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.account_deletion_legal_hold_events where request_id='${requestId}';`))), "2");
    assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.leads where organization_id='${ORG_A}';`))), "0");
    assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.campaign_plans where organization_id='${ORG_A}';`))), "0");
    assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.service_types where organization_id='${ORG_A}';`))), "0");
    assert.equal(lastLine(session.psql(asRole("service_role", `select subject||'|'||message||'|'||safe_context::text from public.support_tickets where id='${TICKET_A}';`))), "Deleted account request|[deleted]|{}");
    assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.activation_journey_events where organization_id='${ORG_A}';`))), "0");
    assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.client_error_events where metadata->>'organizationId'='${ORG_A}';`))), "0");
    assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.leads where organization_id='${ORG_B}';`))), "1");
    assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.campaign_plans where organization_id='${ORG_B}';`))), "1");
    assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.client_error_events where metadata->>'organizationId'='${ORG_B}';`))), "1");
    assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.creative_assets where id='${CREATIVE_B}';`))), "1");
    assert.equal(lastLine(session.psql(asRole("service_role", `select count(*) from public.account_deletion_receipts where request_id='${requestId}' and (provider_receipt_id is not null or receipt_metadata <> '{"detailsExpired":true}'::jsonb);`))), "0", "expired receipt detail survived completion");
    assert.equal(lastLine(session.psql(asRole("service_role", `select name||'|'||slug from public.organizations where id='${ORG_A}';`))).startsWith("Deleted workspace|deleted-"), true);
    assert.equal(lastLine(session.psql(asRole("service_role", `select email||'|'||full_name from public.users where id='${USER_A}';`))).endsWith("@invalid.example|Deleted user"), true);
    mustFail(session, asRole("service_role", `
      update public.account_deletion_receipts set result_code='tampered_receipt'
      where request_id='${requestId}';
    `), /account_deletion_receipt_append_only/i, "deletion receipts must be immutable");
  });

  console.log("account deletion full-chain disposable DB: PASS (exact 104 + two account-deletion migration replays, owner/legal-only retention authority with injected stale column-grant revocation, 16/16 lifecycle, 17 receipts, service-role-only creation, schema inventory, GHL operator allowlist, signed Stripe post-suspension reconciliation, OLD+NEW fencing, two-tenant creative storage, retention expiry, RLS, legal hold, zero-disallowed-PII postcondition)");
} finally {
  if (createdPostgresRole) adapter.psql("drop role if exists postgres;");
}
