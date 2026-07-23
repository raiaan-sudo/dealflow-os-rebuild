#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const migrations = fs.readdirSync(migrationsDir)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();
const transactionOwner = "20260710160000_validate_and_normalize_pre_candidate_shape.sql";
const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  databasePrefix: `dfgsd_${process.pid}_${randomBytes(3).toString("hex")}`,
  expectedVersion: "17.6",
  maxOutputBytes: 64 * 1024 * 1024,
  timeoutMs: 180_000,
});

const USER_A = "81000000-0000-4000-8000-000000000001";
const USER_B = "81000000-0000-4000-8000-000000000002";
const ORG_A = "82000000-0000-4000-8000-000000000001";
const ORG_B = "82000000-0000-4000-8000-000000000002";
const CAMPAIGN_A = "83000000-0000-4000-8000-000000000001";
const CAMPAIGN_B = "83000000-0000-4000-8000-000000000002";
const EVENT_A = "84000000-0000-4000-8000-000000000001";
const DISPATCH_A = "85000000-0000-4000-8000-000000000001";
const IMAGE_A = "86000000-0000-4000-8000-000000000001";
const THUMB_A = "86000000-0000-4000-8000-000000000002";
const ASSET_B = "86000000-0000-4000-8000-000000000003";
const REQUEST_A = "87000000-0000-4000-8000-000000000001";
const TASK_A = "88000000-0000-4000-8000-000000000001";
const CLAIM_1 = "89000000-0000-4000-8000-000000000001";
const CLAIM_2 = "89000000-0000-4000-8000-000000000002";
const SHA = "a".repeat(64);
const WRONG_SHA = "b".repeat(64);
const PATH_A = `generated-static/${ORG_A}/${USER_A}/${CAMPAIGN_A}/openai/${DISPATCH_A}.image`;
const URL_A = `https://project.invalid/storage/v1/object/public/creative-assets/${PATH_A}`;

function source(file) {
  let value = fs.readFileSync(path.join(migrationsDir, file), "utf8");
  if (file === transactionOwner) {
    value = value.replace(/^BEGIN;\s*$/im, "").replace(/^COMMIT;\s*$/im, "");
  }
  return value;
}

function asRole(role, sql, userId = null) {
  return `set role ${role};
    select set_config('request.jwt.claim.role','${role}',false);
    ${userId ? `select set_config('request.jwt.claim.sub','${userId}',false);` : ""}
    ${sql}
    reset role;`;
}

function lastLine(value) {
  return value.trim().split("\n").at(-1) ?? "";
}

function mustFail(session, sql, pattern, label) {
  let diagnostic = "";
  try { session.psql(sql, { label }); } catch (error) {
    diagnostic = error instanceof Error ? error.message : String(error);
  }
  assert.match(diagnostic, pattern, label);
}

function authorizeSql(claim, generation, overrides = {}) {
  const input = {
    organizationId: ORG_A,
    userId: USER_A,
    campaignId: CAMPAIGN_A,
    dispatchId: DISPATCH_A,
    imageId: IMAGE_A,
    thumbnailId: THUMB_A,
    sha: SHA,
    ...overrides,
  };
  return `select concat_ws('|',cleanup_state,reused::text,candidate_sha256)
    from public.authorize_generated_static_storage_cleanup_v1(
      '${TASK_A}','${claim}',${generation},'${input.organizationId}',
      '${input.userId}','${input.campaignId}','${input.dispatchId}',
      '${input.imageId}','${input.thumbnailId}','creative-assets','${PATH_A}','${input.sha}'
    );`;
}

let createdPostgresRole = false;
try {
  assert.equal(migrations.at(-1), "20260722050000_allow_account_deletion_ghl_receipt_cleanup.sql");
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
      create table if not exists storage.objects(
        id uuid primary key default gen_random_uuid(), bucket_id text not null,
        name text not null, unique(bucket_id,name)
      );
      grant usage on schema storage to anon, authenticated, service_role;
      grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
      reset role;
    `, { label: "Install isolated Supabase-compatible defaults" });
    for (const file of migrations) {
      session.psql(`begin; set role postgres; ${source(file)} reset role; commit;`, {
        label: `Apply ${file}`,
        timeoutMs: 180_000,
      });
    }

    session.psql(`
      set role postgres;
      insert into auth.users(id) values ('${USER_A}'),('${USER_B}');
      insert into public.users(id,email) values
        ('${USER_A}','static-a@example.invalid'),('${USER_B}','static-b@example.invalid');
      insert into public.organizations(id,name,slug,owner_user_id) values
        ('${ORG_A}','Static A','static-a','${USER_A}'),
        ('${ORG_B}','Static B','static-b','${USER_B}');
      insert into public.organization_memberships(organization_id,user_id,role) values
        ('${ORG_A}','${USER_A}','owner'),('${ORG_B}','${USER_B}','owner');
      insert into public.campaign_plans(id,plan,user_id,organization_id) values
        ('${CAMPAIGN_A}','{}','${USER_A}','${ORG_A}'),
        ('${CAMPAIGN_B}','{}','${USER_B}','${ORG_B}');
      insert into public.provider_usage_events(
        id,organization_id,user_id,campaign_id,provider,operation,idempotency_key,
        status,attempt_key,settlement_generation
      ) values (
        '${EVENT_A}','${ORG_A}','${USER_A}','${CAMPAIGN_A}','openai',
        'openai_image_generation','static-delete-proof','reserved',
        'provider_usage_attempt:static-delete-proof',1
      );
      insert into public.paid_creative_dispatches(
        id,provider_usage_event_id,organization_id,user_id,campaign_id,provider,
        operation,attempt_key,request_fingerprint,request_payload,state,
        dispatch_token,provider_request_id,provider_output,accepted_at
      ) values (
        '${DISPATCH_A}','${EVENT_A}','${ORG_A}','${USER_A}','${CAMPAIGN_A}',
        'openai','openai_image_generation','provider_usage_attempt:static-delete-proof',
        '${"c".repeat(64)}','{}','accepted',gen_random_uuid(),'static-delete-provider',
        '{"status":"succeeded"}',timezone('utc',now())
      );
      insert into public.creative_assets(
        id,user_id,campaign_id,asset_type,generation_method,status,provider_name,
        paid_creative_dispatch_id,file_url,metadata
      ) values
        ('${IMAGE_A}','${USER_A}','${CAMPAIGN_A}','image_frame','image_generation','ready',
          'openai','${DISPATCH_A}','${URL_A}','{}'),
        ('${THUMB_A}','${USER_A}','${CAMPAIGN_A}','thumbnail','image_generation','ready',
          'openai','${DISPATCH_A}','${URL_A}','{}'),
        ('${ASSET_B}','${USER_B}','${CAMPAIGN_B}','image_frame','manual','ready',
          'manual_upload',null,null,'{}');
      reset role;
    `, { label: "Seed two tenants and one accepted OpenAI dispatch" });

    session.psql(asRole("service_role", `
      select * from public.authorize_generated_static_storage_upload_v1(
        '${DISPATCH_A}','${ORG_A}','${USER_A}','${CAMPAIGN_A}','creative-assets',
        '${PATH_A}','${SHA}',67,'image/png'
      );
      insert into storage.objects(bucket_id,name) values ('creative-assets','${PATH_A}');
      select * from public.bind_generated_static_storage_v1(
        '${DISPATCH_A}','${ORG_A}','${USER_A}','${CAMPAIGN_A}','${IMAGE_A}','${THUMB_A}',
        'creative-assets','${PATH_A}','${URL_A}','${SHA}',67,'image/png'
      );
    `), { label: "Create exact canonical generated-static pair" });

    session.psql(`
      set role postgres;
      insert into public.account_deletion_requests(
        id,organization_id,requested_by_user_id,idempotency_key,confirmation_code,
        identity_method,identity_email_hash,subject_hash,state,retention_policy,
        scheduled_deletion_at
      ) values (
        '${REQUEST_A}','${ORG_A}','${USER_A}','static-delete-request',
        '${"d".repeat(32)}','aal2','sha256:${"e".repeat(64)}','sha256:${"f".repeat(64)}',
        'deleting','{"graceDays":0,"operationalRetentionDays":1,"supportRetentionDays":1,"analyticsRetentionDays":1,"financialRetentionDays":365,"receiptRetentionDays":365,"billingCancellationMode":"period_end"}',
        timezone('utc',now())
      );
      insert into public.account_deletion_tasks(
        id,request_id,organization_id,requested_by_user_id,task_kind,task_ordinal,
        phase,status,legal_hold_blocking,available_at,attempt_count,claimed_by,
        claim_token,claim_generation,claimed_at,locked_until
      ) values (
        '${TASK_A}','${REQUEST_A}','${ORG_A}','${USER_A}','delete_creative_storage',
        8,'retention','processing',true,timezone('utc',now()),1,'static-worker-1',
        '${CLAIM_1}',1,timezone('utc',now()),timezone('utc',now())+interval '2 minutes'
      );
      reset role;
    `, { label: "Seed one exact processing deletion candidate" });

    const inventory = session.psql(asRole("service_role", `
      select asset_id||'|'||inventory_state||'|'||provider_name||'|'||content_sha256
      from public.get_account_deletion_creative_storage_inventory_v2(
        '${TASK_A}','${CLAIM_1}',1
      ) order by asset_id;
    `), { label: "Classify exact OpenAI pair" });
    assert.match(inventory, new RegExp(`${IMAGE_A}\\|canonical\\|openai\\|${SHA}`));
    assert.match(inventory, new RegExp(`${THUMB_A}\\|canonical\\|openai\\|${SHA}`));
    assert.doesNotMatch(inventory, new RegExp(ASSET_B));

    mustFail(session, asRole("service_role", authorizeSql(CLAIM_1, 1, {
      organizationId: ORG_B,
    })), /tenant_mismatch|binding_mismatch/i, "cross-tenant cleanup authority was accepted");
    mustFail(session, asRole("service_role", authorizeSql(CLAIM_1, 1, {
      sha: WRONG_SHA,
    })), /binding_mismatch|candidate_mismatch/i, "wrong-digest cleanup authority was accepted");
    mustFail(session, asRole("authenticated", `
      delete from storage.objects where bucket_id='creative-assets' and name='${PATH_A}';
    `, USER_A), /cleanup_authority_required|prefix_reserved/i,
    "tenant caller deleted generated-static storage without exact authority");

    const first = lastLine(session.psql(asRole(
      "service_role",
      authorizeSql(CLAIM_1, 1),
    ), { label: "Authorize exact one-use cleanup" }));
    assert.match(first, new RegExp(`^authorized\\|false\\|[a-f0-9]{64}$`));
    const replay = lastLine(session.psql(asRole(
      "service_role",
      authorizeSql(CLAIM_1, 1),
    ), { label: "Replay exact cleanup authorization" }));
    assert.match(replay, new RegExp(`^authorized\\|true\\|[a-f0-9]{64}$`));
    assert.equal(first.split("|")[2], replay.split("|")[2], "candidate digest drifted on replay");

    session.psql(asRole("service_role", `
      delete from storage.objects where bucket_id='creative-assets' and name='${PATH_A}';
    `), { label: "Consume exact cleanup authority once" });
    assert.equal(lastLine(session.psql(`
      select state from private.generated_static_storage_cleanup_authorities
      where task_id='${TASK_A}';
    `)), "object_deleted");

    // Simulate the recoverable partial-failure boundary: Storage committed,
    // but the worker lost its database-finalization response and was reclaimed.
    session.psql(`
      set role postgres;
      update public.account_deletion_tasks set status='processing',claimed_by='static-worker-2',
        claim_token='${CLAIM_2}',claim_generation=2,attempt_count=2,
        claimed_at=timezone('utc',now()),locked_until=timezone('utc',now())+interval '2 minutes'
      where id='${TASK_A}';
      reset role;
    `, { label: "Reclaim after object-only partial completion" });
    const recovered = lastLine(session.psql(asRole(
      "service_role",
      authorizeSql(CLAIM_2, 2),
    ), { label: "Recover consumed authority under new claim" }));
    assert.match(recovered, new RegExp(`^object_deleted\\|true\\|[a-f0-9]{64}$`));
    mustFail(session, asRole("service_role", `
      select public.finalize_account_deletion_creative_storage_v2(
        '${TASK_A}','${CLAIM_2}',2,array['${IMAGE_A}'::uuid]
      );
    `), /inventory_changed/i, "partial asset pair was finalized");
    mustFail(session, `
      update private.generated_static_storage_cleanup_authorities
      set content_sha256='${WRONG_SHA}' where task_id='${TASK_A}';
    `, /cleanup_authority_immutable/i, "cleanup receipt digest was mutable");

    assert.equal(lastLine(session.psql(asRole("service_role", `
      select public.finalize_account_deletion_creative_storage_v2(
        '${TASK_A}','${CLAIM_2}',2,
        array['${IMAGE_A}'::uuid,'${THUMB_A}'::uuid]
      );
    `), { label: "Finalize exact pair and retire mutable ledgers" })), "2");
    assert.equal(lastLine(session.psql(`
      select concat_ws('|',
        (select count(*) from storage.objects where name='${PATH_A}'),
        (select count(*) from private.generated_static_storage_bindings where dispatch_id='${DISPATCH_A}'),
        (select count(*) from private.generated_static_storage_upload_permits where dispatch_id='${DISPATCH_A}'),
        (select count(*) from public.creative_assets where id in ('${IMAGE_A}','${THUMB_A}')),
        (select state from private.generated_static_storage_cleanup_authorities where task_id='${TASK_A}'),
        (select count(*) from public.creative_assets where id='${ASSET_B}')
      );
    `, { label: "Prove cleanup receipt, retired ledgers, and tenant isolation" })),
    "0|0|0|0|finalized|1");
    assert.equal(lastLine(session.psql(asRole("service_role", `
      select public.finalize_account_deletion_creative_storage_v2(
        '${TASK_A}','${CLAIM_2}',2,'{}'::uuid[]
      );
    `), { label: "Replay finalized empty inventory" })), "0");
  });
  console.log("generated-static deletion disposable DB: PASS (tenant/digest/pair binding, one-use authority, partial-failure recovery, ledger retirement, idempotent replay)");
} finally {
  if (createdPostgresRole) {
    try { adapter.psql("drop role if exists postgres;"); } catch { /* best effort */ }
  }
}
