#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase/migrations");
const migrationName = "20260716190000_add_ghl_marketplace_oauth_install_foundation.sql";
const migrationPath = path.join(migrationsDir, migrationName);
const transactionOwningMigration = "20260710160000_validate_and_normalize_pre_candidate_shape.sql";
const migrations = fs.readdirSync(migrationsDir)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();
const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  databasePrefix: `dfghl_${process.pid}_${randomBytes(3).toString("hex")}`,
  expectedVersion: "17.6",
  maxOutputBytes: 64 * 1024 * 1024,
  timeoutMs: 180_000,
});

const USER_A = "a1000000-0000-4000-8000-000000000001";
const USER_B = "a1000000-0000-4000-8000-000000000002";
const ORG_A = "a2000000-0000-4000-8000-000000000001";
const ORG_B = "a2000000-0000-4000-8000-000000000002";
const INSTALLATION = "a3000000-0000-4000-8000-000000000001";
const SNAPSHOT = "a3000000-0000-4000-8000-000000000002";
const MAPPING = "a3000000-0000-4000-8000-000000000003";
const MAPPING_B = "a3000000-0000-4000-8000-000000000004";
const WRONG_PARTNER = "a4000000-0000-4000-8000-000000000001";
const AGENCY_ID = "synthetic-marketplace-company";
const LOCATION_ID = "synthetic-marketplace-location";
const LOCATION_B_ID = "synthetic-marketplace-location-b";

function sha(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

const APP = sha("synthetic-marketplace-app");
const APP_2 = sha("synthetic-marketplace-app-2");
const COMPANY = sha(AGENCY_ID);
const LOCATION = sha(LOCATION_ID);
const LOCATION_B = sha(LOCATION_B_ID);
const SCOPE = sha("contacts.readonly users.write");
const WRONG_ACCOUNT = sha("wrong-account");
const REQUEST = sha("synthetic-request");
const OUTCOME = sha("synthetic-provider-outcome");
const REALTOR = sha("synthetic-realtor-identity");
const PROVIDER_USER = sha("synthetic-provider-user");
const PROVIDER_REQUEST = sha("synthetic-provider-request");
const PKCE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const STATE = sha("synthetic-one-time-state");
const EXPIRED_STATE = sha("synthetic-expired-state");
const ACCESS_REF_1 = "enc-ref:v1:oauth/access/synthetic-generation-0001";
const REFRESH_REF_1 = "enc-ref:v1:oauth/refresh/synthetic-generation-0001";
const ACCESS_REF_2 = "enc-ref:v1:oauth/access/synthetic-generation-0002";
const REFRESH_REF_2 = "enc-ref:v1:oauth/refresh/synthetic-generation-0002";
const PKCE_REF = "enc-ref:v1:oauth/pkce/synthetic-state-0001";

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

function lastLine(output) {
  return output.trim().split("\n").at(-1) ?? "";
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

let createdPostgresRole = false;
try {
  assert.ok(fs.existsSync(migrationPath), `migration missing: ${migrationPath}`);
  assert.ok(migrations.indexOf(migrationName) > migrations.indexOf("20260716180000_harden_credit_top_up_request_idempotency.sql"));
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
        id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null,
        unique(bucket_id,name)
      );
      grant usage on schema storage to anon, authenticated, service_role;
      grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
      reset role;
    `, { label: "Install remote-equivalent defaults" });

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
      session.psql(`begin; set role postgres; ${migrationSource(file)}
        insert into supabase_migrations.schema_migrations(version, statements)
        values ('${file.slice(0, 14)}', array[]::text[]);
        reset role; commit;`, {
        label: `Apply ${file}`,
        timeoutMs: 180_000,
      });
    }
    session.psql(`begin; set role postgres; ${migrationSource(migrationName)} reset role; commit;`, {
      label: "Replay GHL Marketplace migration",
      timeoutMs: 180_000,
    });

    session.psql(`
      set role postgres;
      insert into auth.users(id) values ('${USER_A}'),('${USER_B}');
      insert into public.users(id,email,full_name) values
        ('${USER_A}','ghl-owner-a@example.invalid','GHL Owner A'),
        ('${USER_B}','ghl-owner-b@example.invalid','GHL Owner B');
      insert into public.organizations(id,name,slug,owner_user_id) values
        ('${ORG_A}','GHL Workspace A','ghl-workspace-a','${USER_A}'),
        ('${ORG_B}','GHL Workspace B','ghl-workspace-b','${USER_B}');
      insert into public.organization_memberships(organization_id,user_id,role) values
        ('${ORG_A}','${USER_A}','owner'),('${ORG_B}','${USER_B}','owner');
      insert into public.ghl_workspace_tenants(organization_id,tenant_kind,status) values
        ('${ORG_A}','direct_realtor','active'),('${ORG_B}','direct_realtor','active');
      insert into public.ghl_installations(
        id,environment,owner_kind,provider_agency_id,status,capability_manifest
      ) values ('${INSTALLATION}','test','platform','${AGENCY_ID}','active','{}'::jsonb);
      insert into public.ghl_snapshot_manifests(
        id,environment,snapshot_key,snapshot_version,provider_snapshot_id,required_objects,status,approved_at
      ) values (
        '${SNAPSHOT}','test','marketplace-proof','v1','synthetic-snapshot',
        '[{"kind":"pipeline","key":"new-lead"}]'::jsonb,'approved',timezone('utc',now())
      );
      insert into public.ghl_location_mappings(
        id,organization_id,installation_id,environment,provider_location_id,
        provisioning_owner,snapshot_manifest_id,status,snapshot_verified_at,required_objects_verified_at
      ) values (
        '${MAPPING}','${ORG_A}','${INSTALLATION}','test','${LOCATION_ID}',
        'platform','${SNAPSHOT}','active',timezone('utc',now()),timezone('utc',now())
      ),(
        '${MAPPING_B}','${ORG_B}','${INSTALLATION}','test','${LOCATION_B_ID}',
        'platform','${SNAPSHOT}','active',timezone('utc',now()),timezone('utc',now())
      );
      reset role;
    `, { label: "Create synthetic GHL Marketplace fixtures" });

    mustFail(session, asRole("authenticated", `
      select public.create_ghl_marketplace_oauth_state_v1(
        '${ORG_A}','${USER_A}',null,'test','${STATE}','${PKCE}','${PKCE_REF}',
        '${APP}','${LOCATION}','${SCOPE}','${COMPANY}','${LOCATION}',timezone('utc',now()) + interval '5 minutes'
      );
    `, USER_A), /permission denied|ghl_marketplace_service_role_required/i,
    "authenticated caller created service-only OAuth state");
    mustFail(session, asRole("service_role", `
      insert into public.ghl_marketplace_oauth_states(
        organization_id,initiated_by_user_id,environment,state_hash,pkce_challenge,
        encrypted_pkce_verifier_ref,app_fingerprint,account_fingerprint,scope_fingerprint,
        company_fingerprint,expires_at
      ) values (
        '${ORG_A}','${USER_A}','test','${sha("direct-insert")}', '${PKCE}', '${PKCE_REF}',
        '${APP}','${LOCATION}','${SCOPE}','${COMPANY}',timezone('utc',now()) + interval '5 minutes'
      );
    `), /permission denied/i, "service role bypassed the one-time state RPC");

    session.psql(asRole("service_role", `
      select public.create_ghl_marketplace_oauth_state_v1(
        '${ORG_A}','${USER_A}',null,'test','${STATE}','${PKCE}','${PKCE_REF}',
        '${APP}','${LOCATION}','${SCOPE}','${COMPANY}','${LOCATION}',timezone('utc',now()) + interval '5 minutes'
      );
    `), { label: "Create one-time state" });
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.consume_ghl_marketplace_oauth_state_v1(
        '${STATE}','${ORG_B}','${USER_B}',null,'${APP}','${LOCATION}','${SCOPE}','${COMPANY}','${LOCATION}',timezone('utc',now())
      );
    `), { label: "Reject wrong tenant" })), "tenant_mismatch");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.consume_ghl_marketplace_oauth_state_v1(
        '${STATE}','${ORG_A}','${USER_A}','${WRONG_PARTNER}','${APP}','${LOCATION}','${SCOPE}','${COMPANY}','${LOCATION}',timezone('utc',now())
      );
    `), { label: "Reject wrong partner" })), "partner_mismatch");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.consume_ghl_marketplace_oauth_state_v1(
        '${STATE}','${ORG_A}','${USER_A}',null,'${APP}','${WRONG_ACCOUNT}','${SCOPE}','${COMPANY}','${LOCATION}',timezone('utc',now())
      );
    `), { label: "Reject wrong account" })), "account_mismatch");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.consume_ghl_marketplace_oauth_state_v1(
        '${STATE}','${ORG_A}','${USER_A}',null,'${APP}','${LOCATION}','${SCOPE}','${COMPANY}','${LOCATION}',timezone('utc',now())
      );
    `), { label: "Consume state" })), "consumed");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.consume_ghl_marketplace_oauth_state_v1(
        '${STATE}','${ORG_A}','${USER_A}',null,'${APP}','${LOCATION}','${SCOPE}','${COMPANY}','${LOCATION}',timezone('utc',now())
      );
    `), { label: "Reject replay" })), "replayed");

    session.psql(asRole("service_role", `
      select public.create_ghl_marketplace_oauth_state_v1(
        '${ORG_A}','${USER_A}',null,'test','${EXPIRED_STATE}','${PKCE}','${PKCE_REF}',
        '${APP}','${LOCATION}','${SCOPE}','${COMPANY}','${LOCATION}',timezone('utc',now()) + interval '1 minute'
      );
    `), { label: "Create expiring state" });
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.consume_ghl_marketplace_oauth_state_v1(
        '${EXPIRED_STATE}','${ORG_A}','${USER_A}',null,'${APP}','${LOCATION}','${SCOPE}','${COMPANY}','${LOCATION}',timezone('utc',now()) + interval '2 minutes'
      );
    `), { label: "Reject expired state" })), "expired");

    const authorityId = lastLine(session.psql(asRole("service_role", `
      select public.create_ghl_marketplace_authority_v1(
        '${INSTALLATION}','${ORG_A}',null,null,'test','company','${APP}','${SCOPE}'
      );
    `), { label: "Create company authority" }));
    assert.match(authorityId, /^[a-f0-9-]{36}$/);
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select public.record_ghl_marketplace_lifecycle_v1(
        '${authorityId}','${ORG_A}',null,'INSTALL','${sha("install-event-1")}',
        '${APP}','${COMPANY}',null,'${COMPANY}',true,timezone('utc',now())
      );
    `), { label: "Record install" })), "applied");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select public.record_ghl_marketplace_lifecycle_v1(
        '${authorityId}','${ORG_A}',null,'INSTALL','${sha("install-event-1")}',
        '${APP}','${COMPANY}',null,'${COMPANY}',true,timezone('utc',now())
      );
    `), { label: "Deduplicate install" })), "duplicate");

    const tokenSetId = lastLine(session.psql(asRole("service_role", `
      select public.store_initial_ghl_marketplace_token_set_v1(
        '${authorityId}','company','${ORG_A}',null,null,'${ACCESS_REF_1}','${REFRESH_REF_1}',
        '${COMPANY}','${SCOPE}',timezone('utc',now()) + interval '1 day',
        timezone('utc',now()) + interval '365 days',1,timezone('utc',now())
      );
    `), { label: "Store encrypted company token references" }));
    assert.match(tokenSetId, /^[a-f0-9-]{36}$/);
    const claimOutput = lastLine(session.psql(asRole("service_role", `
      select concat_ws('|',result_outcome,result_claim_token,result_generation)
      from public.claim_ghl_marketplace_token_refresh_v1(
        '${tokenSetId}',1,'worker-a',timezone('utc',now()),120
      );
    `), { label: "Claim refresh" }));
    const [, claimToken] = claimOutput.split("|");
    assert.match(claimOutput, /^claimed\|[a-f0-9-]{36}\|1$/);
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.claim_ghl_marketplace_token_refresh_v1(
        '${tokenSetId}',1,'worker-b',timezone('utc',now()),120
      );
    `), { label: "Reject concurrent refresh" })), "refresh_in_progress");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.settle_ghl_marketplace_token_refresh_v1(
        '${tokenSetId}','${claimToken}',0,'${ACCESS_REF_2}','${REFRESH_REF_2}',
        '${COMPANY}','${SCOPE}',timezone('utc',now()) + interval '1 day',
        timezone('utc',now()) + interval '365 days',1,'${OUTCOME}',timezone('utc',now())
      );
    `), { label: "Reject stale settle generation" })), "stale_generation");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select concat_ws('|',result_outcome,result_generation)
      from public.settle_ghl_marketplace_token_refresh_v1(
        '${tokenSetId}','${claimToken}',1,'${ACCESS_REF_2}','${REFRESH_REF_2}',
        '${COMPANY}','${SCOPE}',timezone('utc',now()) + interval '1 day',
        timezone('utc',now()) + interval '365 days',1,'${OUTCOME}',timezone('utc',now())
      );
    `), { label: "Settle refresh CAS" })), "settled|2");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.claim_ghl_marketplace_token_refresh_v1(
        '${tokenSetId}',1,'worker-stale',timezone('utc',now()),120
      );
    `), { label: "Reject stale refresh generation" })), "stale_generation");

    const raceClaim = lastLine(session.psql(asRole("service_role", `
      select result_claim_token from public.claim_ghl_marketplace_token_refresh_v1(
        '${tokenSetId}',2,'worker-race',timezone('utc',now()),120
      );
    `), { label: "Claim refresh before uninstall" }));
    assert.match(raceClaim, /^[a-f0-9-]{36}$/);
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select public.record_ghl_marketplace_lifecycle_v1(
        '${authorityId}','${ORG_A}',null,'UNINSTALL','${sha("uninstall-event-1")}',
        '${APP}','${COMPANY}',null,'${COMPANY}',true,timezone('utc',now())
      );
    `), { label: "Record uninstall during refresh" })), "applied");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.settle_ghl_marketplace_token_refresh_v1(
        '${tokenSetId}','${raceClaim}',2,'${ACCESS_REF_1}','${REFRESH_REF_1}',
        '${COMPANY}','${SCOPE}',timezone('utc',now()) + interval '1 day',
        timezone('utc',now()) + interval '365 days',1,'${OUTCOME}',timezone('utc',now())
      );
    `), { label: "Reject uninstall race" })), "uninstalled_race");

    const authority2 = lastLine(session.psql(asRole("service_role", `
      select public.create_ghl_marketplace_authority_v1(
        '${INSTALLATION}','${ORG_A}',null,null,'test','company','${APP_2}','${SCOPE}'
      );
    `), { label: "Create second company authority" }));
    mustFail(session, asRole("service_role", `
      select public.record_ghl_marketplace_lifecycle_v1(
        '${authority2}','${ORG_A}',null,'INSTALL','${sha("install-event-1")}',
        '${APP_2}','${COMPANY}',null,'${COMPANY}',true,timezone('utc',now())
      );
    `), /ghl_marketplace_lifecycle_event_identity_collision/i,
    "same lifecycle event fingerprint was accepted for a different authority");
    session.psql(asRole("service_role", `
      select public.record_ghl_marketplace_lifecycle_v1(
        '${authority2}','${ORG_A}',null,'INSTALL','${sha("install-event-2")}',
        '${APP_2}','${COMPANY}',null,'${COMPANY}',true,timezone('utc',now())
      );
    `), { label: "Activate second authority" });
    const companyToken2 = lastLine(session.psql(asRole("service_role", `
      select public.store_initial_ghl_marketplace_token_set_v1(
        '${authority2}','company','${ORG_A}',null,null,'${ACCESS_REF_1}','${REFRESH_REF_1}',
        '${COMPANY}','${SCOPE}',timezone('utc',now()) + interval '1 day',
        timezone('utc',now()) + interval '365 days',1,timezone('utc',now())
      );
    `), { label: "Store second company token" }));
    const exchangeId = lastLine(session.psql(asRole("service_role", `
      select public.request_ghl_marketplace_location_token_exchange_v1(
        '${companyToken2}','${ORG_A}','${MAPPING}',null,'${REQUEST}','exchange:synthetic:1',timezone('utc',now())
      );
    `), { label: "Request company-to-location exchange" }));
    assert.match(exchangeId, /^[a-f0-9-]{36}$/);
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select public.request_ghl_marketplace_location_token_exchange_v1(
        '${companyToken2}','${ORG_A}','${MAPPING}',null,'${REQUEST}','exchange:synthetic:1',timezone('utc',now())
      );
    `), { label: "Replay exact company-to-location exchange" })), exchangeId);
    mustFail(session, asRole("service_role", `
      select public.request_ghl_marketplace_location_token_exchange_v1(
        '${companyToken2}','${ORG_A}','${MAPPING}',null,'${sha("synthetic-request-altered")}',
        'exchange:synthetic:1',timezone('utc',now())
      );
    `), /ghl_marketplace_location_exchange_identity_collision/i,
    "same-tenant location exchange reused an idempotency key with altered input");
    mustFail(session, asRole("service_role", `
      select public.request_ghl_marketplace_location_token_exchange_v1(
        '${companyToken2}','${ORG_B}','${MAPPING_B}',null,'${sha("synthetic-request-b")}',
        'exchange:synthetic:1',timezone('utc',now())
      );
    `), /ghl_marketplace_location_exchange_identity_collision/i,
    "cross-tenant location exchange reused another tenant's idempotency receipt");
    assert.match(lastLine(session.psql(asRole("service_role", `
      select concat_ws('|',result_outcome,result_token_set_id)
      from public.settle_ghl_marketplace_location_token_exchange_v1(
        '${exchangeId}','succeeded','${ACCESS_REF_2}','${REFRESH_REF_2}',
        timezone('utc',now()) + interval '1 day',timezone('utc',now()) + interval '365 days',1,timezone('utc',now())
      );
    `), { label: "Settle company-to-location exchange" })), /^succeeded\|[a-f0-9-]{36}$/);

    const revokeOperation = lastLine(session.psql(asRole("service_role", `
      select result_operation_id from public.request_ghl_marketplace_realtor_user_operation_v1(
        '${authority2}','${ORG_A}','${MAPPING}',null,'${USER_A}','${REALTOR}',
        'user_revoke','${PROVIDER_USER}','${REQUEST}','user:revoke:synthetic:1',timezone('utc',now())
      );
    `), { label: "Request realtor user revoke" }));
    assert.match(revokeOperation, /^[a-f0-9-]{36}$/);
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_operation_id from public.request_ghl_marketplace_realtor_user_operation_v1(
        '${authority2}','${ORG_A}','${MAPPING}',null,'${USER_A}','${REALTOR}',
        'user_revoke','${PROVIDER_USER}','${REQUEST}','user:revoke:synthetic:1',timezone('utc',now())
      );
    `), { label: "Replay exact realtor user revoke" })), revokeOperation);
    mustFail(session, asRole("service_role", `
      select result_operation_id from public.request_ghl_marketplace_realtor_user_operation_v1(
        '${authority2}','${ORG_A}','${MAPPING}',null,'${USER_A}','${REALTOR}',
        'user_revoke','${PROVIDER_USER}','${sha("synthetic-user-request-altered")}',
        'user:revoke:synthetic:1',timezone('utc',now())
      );
    `), /ghl_marketplace_realtor_user_operation_identity_collision/i,
    "same-tenant realtor operation reused an idempotency key with altered input");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select public.settle_ghl_marketplace_realtor_user_operation_v1(
        '${revokeOperation}','succeeded','${PROVIDER_USER}','${PROVIDER_REQUEST}',timezone('utc',now())
      );
    `), { label: "Settle realtor user revoke" })), "succeeded");
    mustFail(session, asRole("service_role", `
      select result_operation_id from public.request_ghl_marketplace_realtor_user_operation_v1(
        '${authority2}','${ORG_B}','${MAPPING_B}',null,'${USER_B}','${sha("synthetic-realtor-b")}',
        'user_revoke','${sha("synthetic-provider-user-b")}','${sha("synthetic-user-request-b")}',
        'user:revoke:synthetic:1',timezone('utc',now())
      );
    `), /ghl_marketplace_realtor_user_operation_identity_collision/i,
    "cross-tenant realtor operation reused another tenant's idempotency receipt");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.request_ghl_marketplace_realtor_user_operation_v1(
        '${authority2}','${ORG_A}','${MAPPING}',null,'${USER_A}','${REALTOR}',
        'user_invite',null,'${sha("invite-after-revoke")}',
        'user:invite:synthetic:after-revoke',timezone('utc',now())
      );
    `), { label: "Reject revoked realtor user" })), "revoked_user");

    assert.equal(lastLine(session.psql(`
      select count(*) from public.account_deletion_data_inventory
      where relation_name in (
        'ghl_marketplace_oauth_states','ghl_marketplace_authorities',
        'ghl_marketplace_lifecycle_events','ghl_marketplace_token_sets',
        'ghl_marketplace_token_events','ghl_marketplace_location_token_exchanges',
        'ghl_marketplace_realtor_user_operations'
      ) and disposition='provider_detach' and executor_task='delete_operational_data';
    `, { label: "Verify deletion inventory" })), "7");
    assert.equal(lastLine(session.psql(`
      select count(*) from public.ghl_marketplace_token_sets
      where encrypted_access_credential_ref !~ '^enc-ref:'
         or encrypted_refresh_credential_ref !~ '^enc-ref:';
    `, { label: "Prove opaque credential references only" })), "0");
  });

  console.log(`GHL Marketplace OAuth/install full-chain disposable PostgreSQL 17.6 proof passed (${migrations.length} migrations; provider effects disabled).\n`);
} finally {
  if (createdPostgresRole) {
    try { adapter.psql("drop role if exists postgres;"); } catch { /* best effort */ }
  }
}
