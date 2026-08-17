#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase/migrations");
const migrationName = "20260717013000_complete_ghl_marketplace_runtime_lifecycle.sql";
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
const USER_C = "a1000000-0000-4000-8000-000000000003";
const ORG_A = "a2000000-0000-4000-8000-000000000001";
const ORG_B = "a2000000-0000-4000-8000-000000000002";
const ORG_C = "a2000000-0000-4000-8000-000000000003";
const INSTALLATION = "a3000000-0000-4000-8000-000000000001";
const SNAPSHOT = "a3000000-0000-4000-8000-000000000002";
const MAPPING = "a3000000-0000-4000-8000-000000000003";
const MAPPING_B = "a3000000-0000-4000-8000-000000000004";
const WRONG_PARTNER = "a4000000-0000-4000-8000-000000000001";
const AGENCY_ID = "synthetic-marketplace-company";
const LOCATION_ID = "synthetic-marketplace-location";
const LOCATION_B_ID = "synthetic-marketplace-location-b";
const BOOTSTRAP_AGENCY_ID = "synthetic-bootstrap-company";
const BOOTSTRAP_LOCATION_ID = "synthetic-bootstrap-location";
const BOOTSTRAP_USER_ID = "synthetic-bootstrap-user";

function sha(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

const APP = sha("synthetic-marketplace-app");
const APP_2 = sha("synthetic-marketplace-app-2");
const APP_3 = sha("synthetic-marketplace-runtime-app-3");
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
const STATE_V2 = sha("synthetic-runtime-state-v2");
const REDIRECT_V2 = sha("https://app.example.invalid/api/integrations/ghl/marketplace/callback");
const RUNTIME_ACCESS_REF_1 = "enc-ref:v1:ghl-marketplace/access/10000000-0000-4000-8000-000000000001";
const RUNTIME_REFRESH_REF_1 = "enc-ref:v1:ghl-marketplace/refresh/10000000-0000-4000-8000-000000000002";
const RUNTIME_ACCESS_REF_2 = "enc-ref:v1:ghl-marketplace/access/10000000-0000-4000-8000-000000000003";
const RUNTIME_REFRESH_REF_2 = "enc-ref:v1:ghl-marketplace/refresh/10000000-0000-4000-8000-000000000004";

function encryptedEnvelope(reference, purpose) {
  return JSON.stringify({
    version: 1,
    algorithm: "A256GCM",
    keyVersion: 1,
    purpose,
    reference,
    iv: "c3ludGhldGljLWl2",
    ciphertext: "c3ludGhldGljLWNpcGhlcnRleHQ",
    tag: "c3ludGhldGljLXRhZw",
  });
}

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

function asModernPostgrestRole(role, sql) {
  const claims = JSON.stringify({ role }).replaceAll("'", "''");
  return `set role ${role};
    select set_config('request.jwt.claim.role','',false);
    select set_config('request.jwt.claims','${claims}',false);
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
  assert.ok(migrations.indexOf(migrationName) > migrations.indexOf("20260717010000_harden_onboarding_draft_integrity.sql"));
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
      insert into auth.users(id) values ('${USER_A}'),('${USER_B}'),('${USER_C}');
      insert into public.users(id,email,full_name) values
        ('${USER_A}','ghl-owner-a@example.invalid','GHL Owner A'),
        ('${USER_B}','ghl-owner-b@example.invalid','GHL Owner B'),
        ('${USER_C}','ghl-owner-c@example.invalid','GHL Owner C');
      insert into public.organizations(id,name,slug,owner_user_id) values
        ('${ORG_A}','GHL Workspace A','ghl-workspace-a','${USER_A}'),
        ('${ORG_B}','GHL Workspace B','ghl-workspace-b','${USER_B}'),
        ('${ORG_C}','GHL Workspace C','ghl-workspace-c','${USER_C}');
      insert into public.organization_memberships(organization_id,user_id,role) values
        ('${ORG_A}','${USER_A}','owner'),('${ORG_B}','${USER_B}','owner'),
        ('${ORG_C}','${USER_C}','owner');
      insert into public.ghl_workspace_tenants(organization_id,tenant_kind,status) values
        ('${ORG_A}','direct_realtor','active'),('${ORG_B}','direct_realtor','active'),
        ('${ORG_C}','direct_realtor','active');
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

    const staleBootstrapPayload = sha("synthetic-bootstrap-payload-stale");
    const staleBootstrapClaimId = lastLine(session.psql(asRole("service_role", `
      select public.register_ghl_marketplace_embed_bootstrap_claim_v1(
        'test',null,'${APP_3}','${sha(BOOTSTRAP_AGENCY_ID)}',
        '${sha(BOOTSTRAP_LOCATION_ID)}','${sha(BOOTSTRAP_USER_ID)}',
        '${sha("ghl-owner-c@example.invalid")}','${sha("https://app.gohighlevel.com")}',
        '${staleBootstrapPayload}','${BOOTSTRAP_AGENCY_ID}','${BOOTSTRAP_LOCATION_ID}',
        '${BOOTSTRAP_USER_ID}',timezone('utc',now()) + interval '5 minutes',
        timezone('utc',now())
      );
    `), { label: "Register stale first-install bootstrap claim" }));
    assert.match(staleBootstrapClaimId, /^[0-9a-f-]{36}$/i);
    const bootstrapPayload = sha("synthetic-bootstrap-payload-current");
    const bootstrapClaimId = lastLine(session.psql(asRole("service_role", `
      select public.register_ghl_marketplace_embed_bootstrap_claim_v1(
        'test',null,'${APP_3}','${sha(BOOTSTRAP_AGENCY_ID)}',
        '${sha(BOOTSTRAP_LOCATION_ID)}','${sha(BOOTSTRAP_USER_ID)}',
        '${sha("ghl-owner-c@example.invalid")}','${sha("https://app.gohighlevel.com")}',
        '${bootstrapPayload}','${BOOTSTRAP_AGENCY_ID}','${BOOTSTRAP_LOCATION_ID}',
        '${BOOTSTRAP_USER_ID}',timezone('utc',now()) + interval '5 minutes',
        timezone('utc',now())
      );
    `), { label: "Rotate first-install bootstrap claim to current payload" }));
    assert.match(bootstrapClaimId, /^[0-9a-f-]{36}$/i);
    assert.notEqual(bootstrapClaimId, staleBootstrapClaimId);
    assert.equal(lastLine(session.psql(`
      select status from public.ghl_marketplace_embed_bootstrap_claims
      where id='${staleBootstrapClaimId}';
    `)), "rejected");
    assert.equal(lastLine(session.psql(`
      select status from public.ghl_marketplace_embed_bootstrap_claims
      where id='${bootstrapClaimId}';
    `)), "pending");
    mustFail(session, asRole("service_role", `
      select public.consume_ghl_marketplace_embed_bootstrap_claim_v1(
        '${staleBootstrapClaimId}','${staleBootstrapPayload}','${ORG_C}','${USER_C}',
        timezone('utc',now())
      );
    `), /bootstrap_claim_unavailable/i, "superseded bootstrap claim remained consumable");
    mustFail(session, asRole("authenticated", `
      select public.consume_ghl_marketplace_embed_bootstrap_claim_v1(
        '${bootstrapClaimId}','${bootstrapPayload}','${ORG_C}','${USER_C}',
        timezone('utc',now())
      );
    `, USER_C), /permission denied|ghl_marketplace_service_role_required/i,
    "authenticated caller consumed a service-only bootstrap claim");
    mustFail(session, asRole("service_role", `
      select public.consume_ghl_marketplace_embed_bootstrap_claim_v1(
        '${bootstrapClaimId}','${bootstrapPayload}','${ORG_B}','${USER_B}',
        timezone('utc',now())
      );
    `), /bootstrap_tenant_mismatch|bootstrap_workspace_collision/i,
    "bootstrap claim bound to a different tenant");
    const bootstrapBinding = lastLine(session.psql(asRole("service_role", `
      select result_installation_id::text || ':' || result_location_mapping_id::text
      from public.consume_ghl_marketplace_embed_bootstrap_claim_v1(
        '${bootstrapClaimId}','${bootstrapPayload}','${ORG_C}','${USER_C}',
        timezone('utc',now())
      );
    `), { label: "Consume first-install bootstrap claim once" }));
    assert.match(bootstrapBinding, /^[0-9a-f-]{36}:[0-9a-f-]{36}$/i);
    assert.equal(lastLine(session.psql(`
      select mapping.status
      from public.ghl_location_mappings mapping
      where mapping.organization_id='${ORG_C}' and mapping.environment='test';
    `)), "provisioning");
    mustFail(session, asRole("service_role", `
      select public.consume_ghl_marketplace_embed_bootstrap_claim_v1(
        '${bootstrapClaimId}','${bootstrapPayload}','${ORG_C}','${USER_C}',
        timezone('utc',now())
      );
    `), /bootstrap_claim_unavailable/i, "bootstrap claim replayed");
    mustFail(session, `
      update public.ghl_location_mappings
      set status='active'
      where organization_id='${ORG_C}' and environment='test';
    `, /ghl_location_mappings_active_ready_check/i,
    "unverified bootstrap mapping became active");
    mustFail(session, asRole("service_role", `
      insert into public.ghl_marketplace_embed_bootstrap_claims(
        environment,app_fingerprint,company_fingerprint,location_fingerprint,
        user_fingerprint,email_fingerprint,parent_origin_fingerprint,
        payload_fingerprint,provider_company_id,provider_location_id,
        provider_user_id,expires_at
      ) values (
        'test','${APP_3}','${sha(BOOTSTRAP_AGENCY_ID)}',
        '${sha("another-location")}','${sha(BOOTSTRAP_USER_ID)}',
        '${sha("ghl-owner-c@example.invalid")}','${sha("https://app.gohighlevel.com")}',
        '${sha("direct-write")}','${BOOTSTRAP_AGENCY_ID}','another-location',
        '${BOOTSTRAP_USER_ID}',timezone('utc',now()) + interval '5 minutes'
      );
    `), /permission denied/i, "service role bypassed bootstrap claim RPC");

    assert.equal(lastLine(session.psql(asModernPostgrestRole("service_role", `
      select result_outcome from public.ingest_ghl_marketplace_runtime_event_v2(
        'test','INSTALL','${sha("modern-claims-install-event")}', '${sha("modern-claims-install-payload")}',
        '${APP_3}','${COMPANY}',null,'${COMPANY}',null,null,null,true,
        timezone('utc',now()),timezone('utc',now())
      );
    `), { label: "Accept modern PostgREST service-role claims" })), "pending_authority");
    mustFail(session, asModernPostgrestRole("authenticated", `
      select result_outcome from public.ingest_ghl_marketplace_runtime_event_v2(
        'test','INSTALL','${sha("modern-authenticated-install-event")}', '${sha("modern-authenticated-install-payload")}',
        '${APP_3}','${COMPANY}',null,'${COMPANY}',null,null,null,true,
        timezone('utc',now()),timezone('utc',now())
      );
    `), /permission denied|ghl_marketplace_service_role_required/i,
    "reject modern PostgREST authenticated claims");

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

    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.ingest_ghl_marketplace_runtime_event_v2(
        'test','INSTALL','${sha("runtime-install-event")}', '${sha("runtime-install-payload")}',
        '${APP_3}','${COMPANY}',null,'${COMPANY}',null,null,null,true,
        timezone('utc',now()),timezone('utc',now())
      );
    `), { label: "Durably hold install event before callback" })), "pending_authority");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.ingest_ghl_marketplace_runtime_event_v2(
        'test','UPDATE','${sha("runtime-drifted-update-event")}', '${sha("runtime-drifted-update-payload")}',
        '${APP_3}','${sha("wrong-runtime-company")}',null,'${COMPANY}',null,null,null,true,
        timezone('utc',now()),timezone('utc',now())
      );
    `), { label: "Durably hold drifted update event before callback" })), "pending_authority");
    const runtimeStateId = lastLine(session.psql(asRole("service_role", `
      select public.create_ghl_marketplace_oauth_state_v2(
        '${ORG_A}','${USER_A}',null,'test','${STATE_V2}','${INSTALLATION}',null,'company',
        '${APP_3}','${COMPANY}','${SCOPE}','${COMPANY}',null,'${REDIRECT_V2}',
        '/settings?tab=integrations',false,timezone('utc',now()) + interval '5 minutes'
      );
    `), { label: "Create hash-only Marketplace callback state" }));
    assert.match(runtimeStateId, /^[a-f0-9-]{36}$/);
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.consume_ghl_marketplace_oauth_state_v2(
        '${STATE_V2}','${ORG_A}','${USER_A}','${sha("wrong-redirect")}',timezone('utc',now())
      );
    `), { label: "Reject callback redirect drift" })), "binding_mismatch");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.consume_ghl_marketplace_oauth_state_v2(
        '${STATE_V2}','${ORG_A}','${USER_A}','${REDIRECT_V2}',timezone('utc',now())
      );
    `), { label: "Consume exact hash-only callback state" })), "consumed");
    session.psql(asRole("service_role", `
      select * from public.store_staged_ghl_marketplace_credential_pair_v2(
        '${runtimeStateId}',null,'${ORG_A}',
        '${RUNTIME_ACCESS_REF_1}','${encryptedEnvelope(RUNTIME_ACCESS_REF_1, "access")}'::jsonb,'${sha("runtime-access-1")}',
        '${RUNTIME_REFRESH_REF_1}','${encryptedEnvelope(RUNTIME_REFRESH_REF_1, "refresh")}'::jsonb,'${sha("runtime-refresh-1")}',
        1,1,timezone('utc',now())
      );
    `), { label: "Stage encrypted callback credential pair" });
    const runtimeFinalized = lastLine(session.psql(asRole("service_role", `
      select concat_ws('|',result_outcome,result_authority_id,result_token_set_id)
      from public.finalize_ghl_marketplace_oauth_callback_v2(
        '${runtimeStateId}','${RUNTIME_ACCESS_REF_1}','${RUNTIME_REFRESH_REF_1}',
        '${COMPANY}','${SCOPE}','${COMPANY}',null,
        timezone('utc',now()) + interval '1 day',timezone('utc',now()) + interval '365 days',1,timezone('utc',now())
      );
    `), { label: "Atomically finalize encrypted company callback" }));
    assert.match(runtimeFinalized, /^finalized\|[a-f0-9-]{36}\|[a-f0-9-]{36}$/);
    const [, runtimeAuthorityId, runtimeCompanyTokenId] = runtimeFinalized.split("|");
    assert.equal(lastLine(session.psql(`
      select outcome from public.ghl_marketplace_runtime_events
      where event_fingerprint='${sha("runtime-install-event")}';
    `, { label: "Reconcile install event with callback authority" })), "reconciled");
    assert.equal(lastLine(session.psql(`
      select concat_ws('|',outcome,operator_blocker_code)
      from public.ghl_marketplace_runtime_events
      where event_fingerprint='${sha("runtime-drifted-update-event")}';
    `, { label: "Reject drifted pending event during callback reconciliation" })),
    "rejected|ghl_marketplace_event_tenant_binding_mismatch");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.ingest_ghl_marketplace_runtime_event_v2(
        'test','INSTALL','${sha("runtime-install-event")}', '${sha("runtime-install-payload")}',
        '${APP_3}','${COMPANY}',null,'${COMPANY}',null,null,null,true,
        timezone('utc',now()),timezone('utc',now())
      );
    `), { label: "Deduplicate exact runtime event" })), "duplicate");
    mustFail(session, asRole("service_role", `
      select result_outcome from public.ingest_ghl_marketplace_runtime_event_v2(
        'test','INSTALL','${sha("runtime-install-event")}', '${sha("runtime-install-payload-altered")}',
        '${APP_3}','${COMPANY}',null,'${COMPANY}',null,null,null,true,
        timezone('utc',now()),timezone('utc',now())
      );
    `), /ghl_marketplace_runtime_event_identity_collision/i,
    "runtime event idempotency key accepted altered payload");
    mustFail(session, asRole("service_role", `
      select public.request_ghl_marketplace_location_token_exchange_v2(
        '${runtimeCompanyTokenId}','${ORG_B}','${MAPPING_B}',null,
        '${sha("runtime-cross-tenant-request")}','runtime:cross-tenant',timezone('utc',now())
      );
    `), /ghl_marketplace_company_token_tenant_mismatch/i,
    "company token crossed the workspace tenant boundary");
    const runtimeExchangeId = lastLine(session.psql(asRole("service_role", `
      select public.request_ghl_marketplace_location_token_exchange_v2(
        '${runtimeCompanyTokenId}','${ORG_A}','${MAPPING}',null,
        '${sha("runtime-location-request")}','runtime:location:1',timezone('utc',now())
      );
    `), { label: "Request tenant-bound location token" }));
    session.psql(asRole("service_role", `
      select * from public.store_staged_ghl_marketplace_credential_pair_v2(
        null,'${runtimeAuthorityId}','${ORG_A}',
        '${RUNTIME_ACCESS_REF_2}','${encryptedEnvelope(RUNTIME_ACCESS_REF_2, "access")}'::jsonb,'${sha("runtime-access-2")}',
        '${RUNTIME_REFRESH_REF_2}','${encryptedEnvelope(RUNTIME_REFRESH_REF_2, "refresh")}'::jsonb,'${sha("runtime-refresh-2")}',
        1,1,timezone('utc',now())
      );
    `), { label: "Stage encrypted location credential pair" });
    assert.match(lastLine(session.psql(asRole("service_role", `
      select concat_ws('|',result_outcome,result_token_set_id)
      from public.settle_ghl_marketplace_location_exchange_encrypted_v3(
        '${runtimeExchangeId}','succeeded','${RUNTIME_ACCESS_REF_2}','${RUNTIME_REFRESH_REF_2}',
        '${sha("runtime-location-scope")}',
        timezone('utc',now()) + interval '1 day',timezone('utc',now()) + interval '365 days',1,timezone('utc',now())
      );
    `), { label: "Settle encrypted location-token exchange" })), /^succeeded\|[a-f0-9-]{36}$/);
    assert.equal(lastLine(session.psql(`
      select concat_ws('|',exchange.result_scope_fingerprint,token.scope_fingerprint)
      from public.ghl_marketplace_location_token_exchanges exchange
      join public.ghl_marketplace_token_sets token on token.id=exchange.result_token_set_id
      where exchange.id='${runtimeExchangeId}';
    `, { label: "Persist exact provider location scope" })),
    `${sha("runtime-location-scope")}|${sha("runtime-location-scope")}`);

    const transientRefreshClaim = lastLine(session.psql(asRole("service_role", `
      select result_claim_token
      from public.claim_ghl_marketplace_token_refresh_v1(
        '${runtimeCompanyTokenId}',1,'runtime-transient-worker',timezone('utc',now()),120
      );
    `), { label: "Claim runtime token before provider-confirmed transient failure" }));
    assert.match(transientRefreshClaim, /^[a-f0-9-]{36}$/);
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select public.release_ghl_marketplace_token_refresh_retry_v2(
        '${runtimeCompanyTokenId}','${transientRefreshClaim}',1,
        'ghl_oauth_rate_limited',timezone('utc',now())
      );
    `), { label: "Release exact 429 refresh claim without rotation ambiguity" })),
    "retry_released");
    assert.equal(lastLine(session.psql(`
      select status||'|'||(
        select count(*) from public.ghl_marketplace_token_events event
        where event.token_set_id='${runtimeCompanyTokenId}'
          and event.event_type='retry_released'
      )::text
      from public.ghl_marketplace_token_sets where id='${runtimeCompanyTokenId}';
    `)), "active|1");

    const rejectedRefreshClaim = lastLine(session.psql(asRole("service_role", `
      select result_claim_token
      from public.claim_ghl_marketplace_token_refresh_v1(
        '${runtimeCompanyTokenId}',1,'runtime-rejected-worker',timezone('utc',now()),120
      );
    `), { label: "Claim runtime token before deterministic credential rejection" }));
    assert.match(rejectedRefreshClaim, /^[a-f0-9-]{36}$/);
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select public.mark_ghl_marketplace_token_refresh_reconnect_required_v2(
        '${runtimeCompanyTokenId}','${rejectedRefreshClaim}',1,
        'ghl_oauth_credential_rejected',timezone('utc',now())
      );
    `), { label: "Convert exact 401 refresh claim to reconnect-required revocation" })),
    "reconnect_required");
    assert.equal(lastLine(session.psql(`
      select concat_ws('|',token.status,token.revocation_code,token.operator_blocker_code,
        (select count(*) from public.ghl_marketplace_token_events event
          where event.token_set_id=token.id and event.event_type='revoked'),
        (select count(*) from public.ghl_marketplace_encrypted_credentials credential
          where credential.authority_id=token.authority_id and credential.status='revoked')
      ) from public.ghl_marketplace_token_sets token
      where token.id='${runtimeCompanyTokenId}';
    `, { label: "Prove immutable reconnect receipt and encrypted credential retirement" })),
    "revoked|ghl_refresh_reconnect_required|ghl_oauth_credential_rejected|1|2");
    mustFail(session, `
      update public.ghl_marketplace_token_events set event_type='created'
      where token_set_id='${runtimeCompanyTokenId}' and event_type='revoked';
    `, /receipt_is_append_only/i, "refresh rejection receipt was mutable");

    assert.equal(lastLine(session.psql(asRole("service_role", `
      select result_outcome from public.ingest_ghl_marketplace_runtime_event_v2(
        'test','UNINSTALL','${sha("runtime-uninstall-event")}', '${sha("runtime-uninstall-payload")}',
        '${APP_3}','${COMPANY}',null,'${COMPANY}',null,null,null,true,
        timezone('utc',now()),timezone('utc',now())
      );
    `), { label: "Apply Marketplace uninstall" })), "applied");
    assert.equal(lastLine(session.psql(`
      select concat_ws('|',
        (select status from public.ghl_marketplace_authorities where id='${runtimeAuthorityId}'),
        (select count(*) from public.ghl_marketplace_token_sets where authority_id='${runtimeAuthorityId}' and status='revoked'),
        (select count(*) from public.ghl_marketplace_encrypted_credentials where authority_id='${runtimeAuthorityId}' and status='revoked'),
        (select count(*) from public.ghl_marketplace_encrypted_credentials
          where encrypted_envelope::text ~* '(access_token|refresh_token|client_secret|authorizationcode)')
      );
    `, { label: "Prove uninstall revocation and no raw credential fields" })), "uninstalled|2|4|0");

    assert.equal(lastLine(session.psql(`
      select count(*) from public.account_deletion_data_inventory
      where relation_name in (
        'ghl_marketplace_oauth_states','ghl_marketplace_authorities',
        'ghl_marketplace_lifecycle_events','ghl_marketplace_token_sets',
        'ghl_marketplace_token_events','ghl_marketplace_location_token_exchanges',
        'ghl_marketplace_realtor_user_operations','ghl_marketplace_encrypted_credentials',
        'ghl_marketplace_runtime_events'
      ) and disposition='provider_detach' and executor_task='delete_operational_data';
    `, { label: "Verify deletion inventory" })), "9");
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
