#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const FINAL_MIGRATION = "20260717060000_install_owner_decision_authority_grants.sql";
const PRIVILEGED_TENANCY_MIGRATION = "20260717040000_bind_generated_static_storage_tenancy.sql";
const TRANSACTION_OWNER = "20260710160000_validate_and_normalize_pre_candidate_shape.sql";
const migrations = readdirSync(MIGRATIONS)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();

const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  databasePrefix: `dfpt_${process.pid}_${randomBytes(3).toString("hex")}`,
  expectedVersion: "17.6",
  maxOutputBytes: 32 * 1024 * 1024,
  timeoutMs: 180_000,
});

const USER_A = "b1000000-0000-4000-8000-000000000001";
const USER_B = "b1000000-0000-4000-8000-000000000002";
const ORG_A = "b2000000-0000-4000-8000-000000000001";
const ORG_B = "b2000000-0000-4000-8000-000000000002";
const CAMPAIGN_A = "b3000000-0000-4000-8000-000000000001";
const CAMPAIGN_B = "b3000000-0000-4000-8000-000000000002";
const EVENT_A = "b4000000-0000-4000-8000-000000000001";
const EVENT_UNBOUND = "b4000000-0000-4000-8000-000000000002";
const DISPATCH_A = "b5000000-0000-4000-8000-000000000001";
const DISPATCH_UNBOUND = "b5000000-0000-4000-8000-000000000002";
const IMAGE_A = "b6000000-0000-4000-8000-000000000001";
const THUMB_A = "b6000000-0000-4000-8000-000000000002";
const IMAGE_UNBOUND = "b6000000-0000-4000-8000-000000000003";
const THUMB_UNBOUND = "b6000000-0000-4000-8000-000000000004";
const SHA = "a".repeat(64);
const PATH_A = `generated-static/${ORG_A}/${USER_A}/${CAMPAIGN_A}/openai/${DISPATCH_A}.image`;
const URL_A = `https://project.invalid/storage/v1/object/public/creative-assets/${PATH_A}`;

function installRemoteDefaults(session) {
  session.psql(`
    alter default privileges in schema public grant all privileges on tables to postgres;
    alter default privileges in schema public grant all privileges on sequences to postgres;
    alter default privileges in schema public grant all privileges on functions to postgres;
    alter default privileges in schema public revoke usage on types from anon, authenticated, service_role;
    set role postgres;
    alter default privileges in schema public
      grant all privileges on tables to postgres, anon, authenticated, service_role;
    alter default privileges in schema public
      grant all privileges on sequences to postgres, anon, authenticated, service_role;
    alter default privileges in schema public
      grant all privileges on functions to postgres, anon, authenticated, service_role;
    alter default privileges in schema public
      revoke usage on types from anon, authenticated, service_role;
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
    grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
    reset role;
  `, { label: "Install remote-equivalent defaults and Storage table" });
}

function applyAllMigrations(session) {
  for (const file of migrations) {
    let source = readFileSync(join(MIGRATIONS, file), "utf8");
    if (file === TRANSACTION_OWNER) {
      source = source.replace(/^BEGIN;\s*$/im, "").replace(/^COMMIT;\s*$/im, "");
    }
    session.psql(`begin; set role postgres; ${source} reset role; commit;`, {
      label: `Apply ${file}`,
      timeoutMs: 180_000,
    });
  }
}

function asRole(role, sql, userId = null) {
  return `set role ${role};
    set request.jwt.claim.role = '${role}';
    ${userId ? `set request.jwt.claim.sub = '${userId}';` : ""}
    ${sql}
    reset role;`;
}

function authorizeSql(overrides = {}) {
  const input = {
    dispatchId: DISPATCH_A,
    organizationId: ORG_A,
    userId: USER_A,
    campaignId: CAMPAIGN_A,
    storagePath: PATH_A,
    sha: SHA,
    bytes: 68,
    mime: "image/png",
    ...overrides,
  };
  return `select authorized, reused, permit_state
    from public.authorize_generated_static_storage_upload_v1(
      '${input.dispatchId}', '${input.organizationId}', '${input.userId}',
      '${input.campaignId}', 'creative-assets', '${input.storagePath}',
      '${input.sha}', ${input.bytes}, '${input.mime}'
    );`;
}

function bindSql(overrides = {}) {
  const input = {
    dispatchId: DISPATCH_A,
    organizationId: ORG_A,
    userId: USER_A,
    campaignId: CAMPAIGN_A,
    imageAssetId: IMAGE_A,
    thumbnailAssetId: THUMB_A,
    storagePath: PATH_A,
    fileUrl: URL_A,
    sha: SHA,
    bytes: 68,
    mime: "image/png",
    ...overrides,
  };
  return `select bound, reused, storage_bucket, storage_path,
      image_asset_id, thumbnail_asset_id
    from public.bind_generated_static_storage_v1(
      '${input.dispatchId}', '${input.organizationId}', '${input.userId}',
      '${input.campaignId}', '${input.imageAssetId}', '${input.thumbnailAssetId}',
      'creative-assets', '${input.storagePath}', '${input.fileUrl}',
      '${input.sha}', ${input.bytes}, '${input.mime}'
    );`;
}

function projectionReceipt({
  dispatchId = DISPATCH_A,
  campaignId = CAMPAIGN_A,
  imageId = IMAGE_A,
  thumbnailId = THUMB_A,
  path = PATH_A,
} = {}) {
  return JSON.stringify({
    kind: "static_creative",
    campaignId,
    staticAssetId: "static-proof",
    creativeAssetIds: [imageId, thumbnailId].sort(),
    storageBucket: "creative-assets",
    storagePath: path,
    contentSha256: SHA,
    dispatchId,
  }).replaceAll("'", "''");
}

let createdPostgresRole = false;
try {
  assert.equal(migrations.length, 115, "proof expects the exact 115-migration candidate");
  assert.equal(migrations.at(-1), FINAL_MIGRATION, "proof expects the exact final migration");
  adapter.preflight();
  if (adapter.psql("select exists(select 1 from pg_roles where rolname='postgres');") !== "t") {
    adapter.psql("create role postgres superuser nologin;");
    createdPostgresRole = true;
  }

  await adapter.withDisposableDatabase(async (session) => {
    installRemoteDefaults(session);
    applyAllMigrations(session);
    const finalMigrationSource = readFileSync(join(MIGRATIONS, PRIVILEGED_TENANCY_MIGRATION), "utf8");
    for (const replay of [1, 2]) {
      session.psql(`begin; set role postgres; ${finalMigrationSource} reset role; commit;`, {
        label: `Replay final privileged-tenancy migration ${replay}`,
        timeoutMs: 180_000,
      });
    }
    assert.equal(session.psql(`
      select coalesce(string_agg(
        namespace.nspname||'.'||routine.proname||'('||
        pg_get_function_identity_arguments(routine.oid)||')', E'\\n'
        order by namespace.nspname, routine.proname,
          pg_get_function_identity_arguments(routine.oid)
      ), '')
      from pg_proc routine
      join pg_namespace namespace on namespace.oid=routine.pronamespace
      where namespace.nspname in ('public','private')
        and routine.prosecdef
        and not exists (
          select 1 from unnest(coalesce(routine.proconfig, array[]::text[])) setting
          where setting like 'search_path=%'
        );
    `), "", "effective SECURITY DEFINER routine lacks an explicit search_path");
    assert.equal(session.psql(`
      select coalesce(string_agg(
        namespace.nspname||'.'||routine.proname||'('||
        pg_get_function_identity_arguments(routine.oid)||')', E'\\n'
        order by namespace.nspname, routine.proname,
          pg_get_function_identity_arguments(routine.oid)
      ), '')
      from pg_proc routine
      join pg_namespace namespace on namespace.oid=routine.pronamespace
      cross join lateral aclexplode(coalesce(
        routine.proacl, acldefault('f'::"char", routine.proowner)
      )) privilege
      where namespace.nspname in ('public','private')
        and routine.prosecdef
        and routine.prorettype <> 'trigger'::regtype
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE';
    `), "", "non-trigger SECURITY DEFINER routine remains executable by PUBLIC");
    session.psql(`
      insert into auth.users(id) values ('${USER_A}'), ('${USER_B}');
      insert into public.users(id, email) values
        ('${USER_A}', 'static-a@example.invalid'),
        ('${USER_B}', 'static-b@example.invalid');
      insert into public.organizations(id, name, slug, owner_user_id) values
        ('${ORG_A}', 'Static A', 'static-a', '${USER_A}'),
        ('${ORG_B}', 'Static B', 'static-b', '${USER_B}');
      insert into public.organization_memberships(organization_id, user_id, role) values
        ('${ORG_A}', '${USER_A}', 'owner'), ('${ORG_B}', '${USER_B}', 'owner');
      insert into public.campaign_plans(id, plan, user_id, organization_id) values
        ('${CAMPAIGN_A}', '{}'::jsonb, '${USER_A}', '${ORG_A}'),
        ('${CAMPAIGN_B}', '{}'::jsonb, '${USER_B}', '${ORG_B}');
      insert into public.provider_usage_events(
        id, organization_id, user_id, campaign_id, provider, operation,
        idempotency_key, status, attempt_key, settlement_generation
      ) values
        ('${EVENT_A}', '${ORG_A}', '${USER_A}', '${CAMPAIGN_A}', 'openai',
          'openai_image_generation', 'static-storage-proof-a', 'reserved',
          'provider_usage_attempt:static-storage-proof-a', 1),
        ('${EVENT_UNBOUND}', '${ORG_A}', '${USER_A}', '${CAMPAIGN_A}', 'openai',
          'openai_image_generation', 'static-storage-proof-unbound', 'reserved',
          'provider_usage_attempt:static-storage-proof-unbound', 1);
      insert into public.paid_creative_dispatches(
        id, provider_usage_event_id, organization_id, user_id, campaign_id,
        provider, operation, attempt_key, request_fingerprint, request_payload,
        state, dispatch_token, provider_request_id, provider_output, accepted_at
      ) values
        ('${DISPATCH_A}', '${EVENT_A}', '${ORG_A}', '${USER_A}', '${CAMPAIGN_A}',
          'openai', 'openai_image_generation',
          'provider_usage_attempt:static-storage-proof-a', '${"b".repeat(64)}',
          '{}'::jsonb, 'accepted', gen_random_uuid(), 'openai-request-a',
          '{"status":"accepted"}'::jsonb, timezone('utc', now())),
        ('${DISPATCH_UNBOUND}', '${EVENT_UNBOUND}', '${ORG_A}', '${USER_A}', '${CAMPAIGN_A}',
          'openai', 'openai_image_generation',
          'provider_usage_attempt:static-storage-proof-unbound', '${"c".repeat(64)}',
          '{}'::jsonb, 'accepted', gen_random_uuid(), 'openai-request-unbound',
          '{"status":"accepted"}'::jsonb, timezone('utc', now()));
      insert into public.creative_assets(
        id, user_id, campaign_id, asset_type, generation_method, status,
        provider_name, paid_creative_dispatch_id, file_url, thumbnail_url, metadata
      ) values
        ('${IMAGE_A}', '${USER_A}', '${CAMPAIGN_A}', 'image_frame', 'image_generation',
          'ready', 'openai', '${DISPATCH_A}', '${URL_A}', '${URL_A}', '{}'::jsonb),
        ('${THUMB_A}', '${USER_A}', '${CAMPAIGN_A}', 'thumbnail', 'image_generation',
          'ready', 'openai', '${DISPATCH_A}', '${URL_A}', '${URL_A}', '{}'::jsonb),
        ('${IMAGE_UNBOUND}', '${USER_A}', '${CAMPAIGN_A}', 'image_frame', 'image_generation',
          'ready', 'openai', '${DISPATCH_UNBOUND}', 'https://project.invalid/unbound', null, '{}'::jsonb),
        ('${THUMB_UNBOUND}', '${USER_A}', '${CAMPAIGN_A}', 'thumbnail', 'image_generation',
          'ready', 'openai', '${DISPATCH_UNBOUND}', 'https://project.invalid/unbound', null, '{}'::jsonb);
    `, { label: "Seed two tenants and accepted paid static dispatches" });

    assert.equal(
      session.psql(`select
        has_function_privilege('anon','public.authorize_generated_static_storage_upload_v1(uuid,uuid,uuid,uuid,text,text,text,bigint,text)','EXECUTE')||'|'||
        has_function_privilege('authenticated','public.authorize_generated_static_storage_upload_v1(uuid,uuid,uuid,uuid,text,text,text,bigint,text)','EXECUTE')||'|'||
        has_function_privilege('service_role','public.authorize_generated_static_storage_upload_v1(uuid,uuid,uuid,uuid,text,text,text,bigint,text)','EXECUTE')||'|'||
        has_function_privilege('anon','public.bind_generated_static_storage_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,bigint,text)','EXECUTE')||'|'||
        has_function_privilege('authenticated','public.bind_generated_static_storage_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,bigint,text)','EXECUTE')||'|'||
        has_function_privilege('service_role','public.bind_generated_static_storage_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,bigint,text)','EXECUTE');`),
      "false|false|true|false|false|true",
      "generated-static RPC privilege matrix drifted",
    );
    assert.equal(
      session.psql(`select
        has_table_privilege('service_role','private.generated_static_storage_upload_permits','INSERT,UPDATE,DELETE')||'|'||
        has_table_privilege('service_role','private.generated_static_storage_bindings','INSERT,UPDATE,DELETE');`),
      "false|false",
      "service role received forbidden direct private-table DML",
    );

    session.psqlMustFail(asRole("service_role", `
      insert into storage.objects(bucket_id,name)
      values ('creative-assets','generated-static/${ORG_A}/${USER_A}/${CAMPAIGN_A}/openai/hostile.image');
    `), /upload_permit_required/i, { label: "Reject unpermitted service-role Storage DML" });
    session.psqlMustFail(asRole("authenticated", authorizeSql(), USER_A),
      /permission denied|service_role_required/i,
      { label: "Reject authenticated upload authority RPC" });

    const authority = session.psql(asRole("service_role", authorizeSql()), {
      label: "Authorize exact generated-static Storage insert",
    });
    assert.equal(authority, "t|f|authorized");
    session.psqlMustFail(asRole("authenticated", `
      insert into storage.objects(bucket_id,name) values ('creative-assets','${PATH_A}');
    `, USER_A), /prefix_reserved/i, { label: "Reject authenticated permitted-path insert" });
    session.psql(asRole("service_role", `
      insert into storage.objects(bucket_id,name) values ('creative-assets','${PATH_A}');
    `), { label: "Consume exact Storage insert permit" });
    assert.equal(session.psql(`select state from private.generated_static_storage_upload_permits where dispatch_id='${DISPATCH_A}';`), "object_observed");

    session.psqlMustFail(asRole("service_role", bindSql({ organizationId: ORG_B,
      storagePath: `generated-static/${ORG_B}/${USER_A}/${CAMPAIGN_A}/openai/${DISPATCH_A}.image`,
      fileUrl: `https://project.invalid/storage/v1/object/public/creative-assets/generated-static/${ORG_B}/${USER_A}/${CAMPAIGN_A}/openai/${DISPATCH_A}.image`,
    })), /scope_mismatch/i, { label: "Reject cross-organization bind" });
    session.psqlMustFail(asRole("service_role", bindSql({ userId: USER_B,
      storagePath: `generated-static/${ORG_A}/${USER_B}/${CAMPAIGN_A}/openai/${DISPATCH_A}.image`,
      fileUrl: `https://project.invalid/storage/v1/object/public/creative-assets/generated-static/${ORG_A}/${USER_B}/${CAMPAIGN_A}/openai/${DISPATCH_A}.image`,
    })), /scope_mismatch/i, { label: "Reject cross-user bind" });
    session.psqlMustFail(asRole("service_role", bindSql({ campaignId: CAMPAIGN_B,
      storagePath: `generated-static/${ORG_A}/${USER_A}/${CAMPAIGN_B}/openai/${DISPATCH_A}.image`,
      fileUrl: `https://project.invalid/storage/v1/object/public/creative-assets/generated-static/${ORG_A}/${USER_A}/${CAMPAIGN_B}/openai/${DISPATCH_A}.image`,
    })), /scope_mismatch/i, { label: "Reject cross-campaign bind" });
    session.psqlMustFail(asRole("service_role", bindSql({ dispatchId: DISPATCH_UNBOUND,
      storagePath: `generated-static/${ORG_A}/${USER_A}/${CAMPAIGN_A}/openai/${DISPATCH_UNBOUND}.image`,
      fileUrl: `https://project.invalid/storage/v1/object/public/creative-assets/generated-static/${ORG_A}/${USER_A}/${CAMPAIGN_A}/openai/${DISPATCH_UNBOUND}.image`,
    })), /permit_scope_mismatch/i, { label: "Reject wrong-dispatch bind" });
    session.psqlMustFail(asRole("service_role", bindSql({ storagePath: `${PATH_A}-wrong`, fileUrl: `${URL_A}-wrong` })),
      /path_invalid/i, { label: "Reject wrong-path bind" });
    session.psqlMustFail(asRole("service_role", bindSql({ sha: "d".repeat(64) })),
      /permit_scope_mismatch/i, { label: "Reject wrong-digest bind" });

    const bound = session.psql(asRole("service_role", bindSql()), { label: "Bind exact static object" });
    assert.equal(bound, `t|f|creative-assets|${PATH_A}|${IMAGE_A}|${THUMB_A}`);
    assert.equal(session.psql(`select string_agg(asset_type||':'||storage_bucket||':'||storage_path,',' order by asset_type)
      from public.creative_assets where paid_creative_dispatch_id='${DISPATCH_A}';`),
      `image_frame:creative-assets:${PATH_A},thumbnail:creative-assets:${PATH_A}`);
    assert.equal(session.psql(asRole("service_role", bindSql()),
      { label: "Replay exact static binding" }),
      `t|t|creative-assets|${PATH_A}|${IMAGE_A}|${THUMB_A}`);

    session.psqlMustFail(asRole("service_role", `
      update private.generated_static_storage_bindings set content_sha256=repeat('e',64)
      where dispatch_id='${DISPATCH_A}';
    `), /permission denied/i, { label: "Reject direct binding update" });
    session.psqlMustFail(asRole("service_role", `
      delete from private.generated_static_storage_bindings where dispatch_id='${DISPATCH_A}';
    `), /permission denied/i, { label: "Reject direct binding delete" });
    session.psqlMustFail(asRole("service_role", `
      update storage.objects set name=name||'-changed' where bucket_id='creative-assets' and name='${PATH_A}';
    `), /prefix_reserved/i, { label: "Reject reserved-object update" });
    session.psqlMustFail(asRole("service_role", `
      delete from storage.objects where bucket_id='creative-assets' and name='${PATH_A}';
    `), /generated_static_storage_cleanup_authority_required/i,
    { label: "Fail closed on cleanup without exact one-use authority" });

    session.psqlMustFail(asRole("service_role", `
      select * from public.finalize_paid_creative_projection_v1(
        '${DISPATCH_UNBOUND}', '${ORG_A}', '${USER_A}',
        '${projectionReceipt({ dispatchId: DISPATCH_UNBOUND, imageId: IMAGE_UNBOUND,
          thumbnailId: THUMB_UNBOUND,
          path: `generated-static/${ORG_A}/${USER_A}/${CAMPAIGN_A}/openai/${DISPATCH_UNBOUND}.image`,
        })}'::jsonb
      );
    `), /binding_required_before_settlement/i, { label: "Reject settlement before storage bind" });
    assert.equal(session.psql(`select state from public.paid_creative_dispatches where id='${DISPATCH_UNBOUND}';`), "accepted");
    assert.equal(session.psql(`select status from public.provider_usage_events where id='${EVENT_UNBOUND}';`), "reserved");

    assert.equal(session.psql(asRole("service_role", `
      select finalized,reused_projection,dispatch_state,usage_status
      from public.finalize_paid_creative_projection_v1(
        '${DISPATCH_A}', '${ORG_A}', '${USER_A}', '${projectionReceipt()}'::jsonb
      );
    `), { label: "Settle only after exact binding" }), "t|f|projected|consumed");

    assert.equal(session.psql(asRole("authenticated", `
      select count(*) from public.creative_assets where paid_creative_dispatch_id='${DISPATCH_A}';
    `, USER_B)), "0", "tenant B read tenant A creative rows");
    assert.equal(session.psql(asRole("authenticated", `
      select count(*) from public.creative_assets where paid_creative_dispatch_id='${DISPATCH_A}';
    `, USER_A)), "2", "tenant A could not read its own creative rows");
  });

  assert.deepEqual(adapter.listDisposableDatabases(), []);
  console.log(
    `Privileged tenancy database proof PASS: ${migrations.length} migrations plus two exact final-DDL replays; ` +
      "two-tenant RLS, exact service authority, capability-gated Storage insert, immutable binding, " +
      "wrong org/user/campaign/dispatch/path/digest denials, direct DML denials and pre-bind settlement rollback",
  );
} finally {
  if (createdPostgresRole) adapter.psql("drop role if exists postgres;");
}
