#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const REQUIRED_FINAL_MIGRATION = "20260713028000_harden_account_deletion_retention_authority.sql";
const PROPOSAL = process.env.GENERATED_VIDEO_STORAGE_MIGRATION_PROPOSAL
  ?? join(MIGRATIONS, "20260713025000_add_generated_video_canonical_storage.sql");
const TRANSACTION_OWNER = "20260710160000_validate_and_normalize_pre_candidate_shape.sql";
const migrations = readdirSync(MIGRATIONS)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();

const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  databasePrefix: `dfgv_${process.pid}_${randomBytes(3).toString("hex")}`,
  expectedVersion: "17.6",
  maxOutputBytes: 32 * 1024 * 1024,
  timeoutMs: 180_000,
});

const USER_A = "a1000000-0000-4000-8000-000000000001";
const USER_B = "a1000000-0000-4000-8000-000000000002";
const ORG_A = "a2000000-0000-4000-8000-000000000001";
const ORG_B = "a2000000-0000-4000-8000-000000000002";
const CAMPAIGN_A = "a3000000-0000-4000-8000-000000000001";
const CAMPAIGN_B = "a3000000-0000-4000-8000-000000000002";
const EVENT_A = "a4000000-0000-4000-8000-000000000001";
const DISPATCH_A = "a5000000-0000-4000-8000-000000000001";
const ASSET_A = "a6000000-0000-4000-8000-000000000001";
const ASSET_UNBOUND = "a6000000-0000-4000-8000-000000000002";
const PROVIDER_ASSET = "higgsfield-generated-video-proof-1";
const SHA = "a".repeat(64);
const PATH_A = `generated-video/${ORG_A}/${USER_A}/${CAMPAIGN_A}/higgsfield/${ASSET_A}.video`;
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
  `, { label: "Install remote-equivalent defaults and isolated Storage table" });
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

function bindSql(overrides = {}) {
  const input = {
    assetId: ASSET_A,
    organizationId: ORG_A,
    userId: USER_A,
    campaignId: CAMPAIGN_A,
    providerName: "higgsfield",
    providerAssetId: PROVIDER_ASSET,
    storagePath: PATH_A,
    fileUrl: URL_A,
    sha: SHA,
    bytes: 24,
    mime: "video/mp4",
    ...overrides,
  };
  return `select bound, reused, storage_bucket, storage_path, file_url
    from public.bind_generated_video_storage_v1(
      '${input.assetId}', '${input.organizationId}', '${input.userId}', '${input.campaignId}',
      '${input.providerName}', '${input.providerAssetId}', 'creative-assets',
      '${input.storagePath}', '${input.fileUrl}', '${input.sha}', ${input.bytes}, '${input.mime}'
    );`;
}

let createdPostgresRole = false;
try {
  assert.equal(migrations.length, 103, "test expects the exact 103-migration candidate");
  assert.equal(migrations.at(-1), REQUIRED_FINAL_MIGRATION, "test expects the exact final migration");
  assert.match(readFileSync(PROPOSAL, "utf8"), /bind_generated_video_storage_v1/);
  adapter.preflight();
  if (adapter.psql("select exists(select 1 from pg_roles where rolname='postgres');") !== "t") {
    adapter.psql("create role postgres superuser nologin;");
    createdPostgresRole = true;
  }

  await adapter.withDisposableDatabase(async (session) => {
    installRemoteDefaults(session);
    applyAllMigrations(session);
    const proposalSql = readFileSync(PROPOSAL, "utf8");
    session.psql(`begin; set role postgres; ${proposalSql} reset role; commit;`, {
      label: "Replay integrated generated-video storage migration after exact chain",
      timeoutMs: 180_000,
    });
    session.psql(`begin; set role postgres; ${proposalSql} reset role; commit;`, {
      label: "Replay integrated generated-video storage migration a second time",
      timeoutMs: 180_000,
    });

    session.psql(`
      insert into auth.users(id) values ('${USER_A}'), ('${USER_B}');
      insert into public.users(id, email) values
        ('${USER_A}', 'video-a@example.invalid'),
        ('${USER_B}', 'video-b@example.invalid');
      insert into public.organizations(id, name, slug, owner_user_id) values
        ('${ORG_A}', 'Video A', 'video-a', '${USER_A}'),
        ('${ORG_B}', 'Video B', 'video-b', '${USER_B}');
      insert into public.organization_memberships(organization_id, user_id, role) values
        ('${ORG_A}', '${USER_A}', 'owner'), ('${ORG_B}', '${USER_B}', 'owner');
      insert into public.campaign_plans(id, plan, user_id, organization_id) values
        ('${CAMPAIGN_A}', '{}'::jsonb, '${USER_A}', '${ORG_A}'),
        ('${CAMPAIGN_B}', '{}'::jsonb, '${USER_B}', '${ORG_B}');
      insert into public.provider_usage_events(
        id, organization_id, user_id, campaign_id, provider, operation,
        idempotency_key, status, attempt_key, settlement_generation
      ) values (
        '${EVENT_A}', '${ORG_A}', '${USER_A}', '${CAMPAIGN_A}', 'higgsfield',
        'higgsfield_video_generation', 'generated-video-storage-proof', 'reserved',
        'provider_usage_attempt:generated-video-storage-proof', 1
      );
      insert into public.paid_creative_dispatches(
        id, provider_usage_event_id, organization_id, user_id, campaign_id,
        provider, operation, attempt_key, request_fingerprint, request_payload,
        state, dispatch_token, provider_request_id, provider_output, accepted_at
      ) values (
        '${DISPATCH_A}', '${EVENT_A}', '${ORG_A}', '${USER_A}', '${CAMPAIGN_A}',
        'higgsfield', 'higgsfield_video_generation',
        'provider_usage_attempt:generated-video-storage-proof', '${"b".repeat(64)}',
        '{}'::jsonb, 'accepted', gen_random_uuid(), '${PROVIDER_ASSET}',
        '{"status":"queued"}'::jsonb, timezone('utc', now())
      );
      insert into public.creative_assets(
        id, user_id, campaign_id, asset_type, generation_method, status,
        provider_name, provider_asset_id, paid_creative_dispatch_id, metadata
      ) values
        ('${ASSET_A}', '${USER_A}', '${CAMPAIGN_A}', 'ugc_video', 'avatar_provider',
          'generating', 'higgsfield', '${PROVIDER_ASSET}', '${DISPATCH_A}', '{}'::jsonb),
        ('${ASSET_UNBOUND}', '${USER_A}', '${CAMPAIGN_A}', 'ugc_video', 'avatar_provider',
          'generating', 'higgsfield', 'unbound-provider-asset', null, '{}'::jsonb);
    `, { label: "Seed two tenants and one accepted paid video dispatch" });

    const first = session.psql(asRole("service_role", bindSql()), { label: "Bind exact generated video" });
    assert.equal(first, `t|f|creative-assets|${PATH_A}|${URL_A}`);
    assert.equal(session.psql(`
      select status || '|' || storage_bucket || '|' || storage_path || '|' || file_url || '|'
        || (metadata ->> 'generatedVideoStorageSha256') || '|'
        || (metadata ->> 'generatedVideoStorageBytes') || '|'
        || (metadata ->> 'generatedVideoStorageMimeType')
      from public.creative_assets where id='${ASSET_A}';
    `), `ready|creative-assets|${PATH_A}|${URL_A}|${SHA}|24|video/mp4`,
    "creative asset was not atomically bound before later job updates");
    assert.equal(session.psql(`select count(*) from private.generated_video_storage_bindings where asset_id='${ASSET_A}';`), "1");

    const replay = session.psql(asRole("service_role", bindSql()), { label: "Replay exact binding" });
    assert.equal(replay, `t|t|creative-assets|${PATH_A}|${URL_A}`);
    session.psqlMustFail(
      asRole("service_role", bindSql({ sha: "c".repeat(64) })),
      /generated_video_storage_identity_collision/i,
      { label: "Reject checksum collision" },
    );
    session.psqlMustFail(
      asRole("service_role", bindSql({ organizationId: ORG_B })),
      /path_invalid|scope_mismatch/i,
      { label: "Reject cross-tenant binding" },
    );
    session.psqlMustFail(
      asRole("authenticated", bindSql(), USER_A),
      /service_role_required|permission denied/i,
      { label: "Reject authenticated RPC" },
    );

    // A caller-controlled GUC cannot authorize an identity transition. Only a
    // row written by the security-definer RPC into the private ledger can.
    session.psqlMustFail(asRole("service_role", `
      select set_config('dealflow.generated_video_storage_bind','v1',true);
      update public.creative_assets
      set storage_bucket='creative-assets',
          storage_path='generated-video/${ORG_A}/${USER_A}/${CAMPAIGN_A}/higgsfield/${ASSET_UNBOUND}.video',
          file_url='https://project.invalid/storage/v1/object/public/creative-assets/generated-video/${ORG_A}/${USER_A}/${CAMPAIGN_A}/higgsfield/${ASSET_UNBOUND}.video'
      where id='${ASSET_UNBOUND}';
    `), /storage identity is immutable/i, { label: "Reject spoofed transition capability" });
    session.psqlMustFail(asRole("service_role", `
      update public.creative_assets set file_url='https://project.invalid/changed.mp4'
      where id='${ASSET_A}';
    `), /customer URL is immutable/i, { label: "Reject stored URL mutation" });
    session.psqlMustFail(asRole("authenticated", `
      update public.creative_assets set provider_asset_id='rewritten-provider-request'
      where id='${ASSET_A}';
    `, USER_A), /provider asset identity is immutable/i, {
      label: "Reject same-tenant provider request identity mutation",
    });
    session.psqlMustFail(asRole("authenticated", `
      update public.creative_assets set paid_creative_dispatch_id=null
      where id='${ASSET_A}';
    `, USER_A), /paid creative dispatch identity is immutable/i, {
      label: "Reject same-tenant dispatch identity mutation",
    });
    session.psqlMustFail(asRole("authenticated", `
      update public.creative_assets set provider_name='heygen'
      where id='${ASSET_A}';
    `, USER_A), /paid creative provider identity is immutable/i, {
      label: "Reject same-tenant paid provider identity mutation",
    });
    session.psqlMustFail(asRole("authenticated", `
      update public.creative_assets set status='failed'
      where id='${ASSET_A}';
    `, USER_A), /generated video storage receipt is immutable/i, {
      label: "Reject same-tenant generated-video status mutation",
    });
    session.psqlMustFail(asRole("authenticated", `
      update public.creative_assets
      set metadata=jsonb_set(metadata, '{generatedVideoStorageSha256}', to_jsonb(repeat('c',64)))
      where id='${ASSET_A}';
    `, USER_A), /generated video storage receipt is immutable/i, {
      label: "Reject same-tenant generated-video hash mutation",
    });

    session.psqlMustFail(asRole("authenticated", `
      insert into storage.objects(bucket_id,name)
      values ('creative-assets','generated-video/hostile.video');
    `, USER_A), /generated_video_storage_prefix_reserved/i, {
      label: "Reject authenticated reserved-prefix insert",
    });
    session.psql(asRole("service_role", `
      insert into storage.objects(bucket_id,name)
      values ('creative-assets','generated-video/service-created.video');
    `), { label: "Allow server-role reserved-prefix insert" });
    session.psqlMustFail(asRole("authenticated", `
      delete from storage.objects
      where bucket_id='creative-assets' and name='generated-video/service-created.video';
    `, USER_A), /generated_video_storage_prefix_reserved/i, {
      label: "Reject authenticated reserved-prefix delete",
    });
    session.psql(asRole("service_role", `
      delete from storage.objects
      where bucket_id='creative-assets' and name='generated-video/service-created.video';
    `), { label: "Allow server-role exact cleanup" });

    assert.equal(session.psql(`select count(*) from private.generated_video_storage_bindings;`), "1");
    assert.equal(session.psql(`select count(*) from storage.objects;`), "0");
  });

  assert.deepEqual(adapter.listDisposableDatabases(), []);
  console.log(
    `Generated-video storage database proof PASS: exact ${migrations.length} + migration-100 replay twice; ` +
      "idempotent DDL, atomic bind/replay, private capability, cross-tenant rejection, immutable provider/dispatch/storage identity and URL, reserved-prefix guard",
  );
} finally {
  if (createdPostgresRole) adapter.psql("drop role if exists postgres;");
}
