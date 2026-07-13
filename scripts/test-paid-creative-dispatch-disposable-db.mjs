#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const TRANSACTION_OWNER = "20260710160000_validate_and_normalize_pre_candidate_shape.sql";
const migrations = readdirSync(MIGRATIONS)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();
const expectedMigration = "20260713017000_make_paid_creative_dispatch_recoverable.sql";

const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  databasePrefix: `dfpc_${process.pid}_${randomBytes(3).toString("hex")}`,
  expectedVersion: "17.6",
  maxOutputBytes: 32 * 1024 * 1024,
  timeoutMs: 180_000,
});

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
    grant select, insert, update, delete on storage.objects
      to anon, authenticated, service_role;
    reset role;
  `, { label: "Install remote-equivalent defaults and isolated Storage table" });
}

function applyAllMigrations(session) {
  session.psql(`
    set role postgres;
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[] not null default array[]::text[]
    );
    reset role;
  `, { label: "Install migration history" });

  for (const file of migrations) {
    let source = readFileSync(join(MIGRATIONS, file), "utf8");
    if (file === TRANSACTION_OWNER) {
      source = source.replace(/^BEGIN;\s*$/im, "").replace(/^COMMIT;\s*$/im, "");
    } else {
      assert.doesNotMatch(source, /^BEGIN;\s*$/im, `${file} unexpectedly owns a transaction`);
      assert.doesNotMatch(source, /^COMMIT;\s*$/im, `${file} unexpectedly owns a transaction`);
    }
    session.psql(`
      begin;
      set role postgres;
      ${source}
      insert into supabase_migrations.schema_migrations(version, statements)
      values ('${file.slice(0, 14)}', array[]::text[]);
      reset role;
      commit;
    `, { label: `Apply ${file}`, timeoutMs: 180_000 });
  }
}

const userId = "71000000-0000-4000-a000-000000000001";
const organizationId = "72000000-0000-4000-a000-000000000001";
const campaignId = "73000000-0000-4000-a000-000000000001";
const tokenStatic = "74000000-0000-4000-a000-000000000001";
const tokenVideo = "74000000-0000-4000-a000-000000000002";
const tokenAmbiguous = "74000000-0000-4000-a000-000000000003";

function serviceSql(sql) {
  return `set role service_role; set request.jwt.claim.role = 'service_role'; ${sql}`;
}

function reserveSql({ idempotency, attempt, token, provider, operation, amount }) {
  return serviceSql(`
    select allowed, coalesce(block_reason, ''), event_status, credit_balance, event_id
    from public.reserve_provider_usage_attempt_v2(
      '${organizationId}', '${userId}', '${campaignId}',
      '${provider}', '${operation}', 20,
      '${idempotency}', '${attempt}', '${token}', null, ${amount},
      '${operation === "openai_image_generation" ? "image_generation" : "video_generation"}'
    );
  `);
}

let createdPostgresRole = false;
try {
  assert.ok(migrations.includes(expectedMigration), "Paid creative recovery migration is missing");
  adapter.preflight();
  if (adapter.psql("select exists(select 1 from pg_roles where rolname = 'postgres');") !== "t") {
    adapter.psql("create role postgres superuser nologin;", {
      label: "Create isolated migration owner",
    });
    createdPostgresRole = true;
  }

  await adapter.withDisposableDatabase(async (session) => {
    installRemoteDefaults(session);
    applyAllMigrations(session);

    session.psql(`
      insert into auth.users(id) values ('${userId}');
      insert into public.users(id, email)
      values ('${userId}', 'paid-creative-proof@example.test');
      insert into public.organizations(id, name, slug, owner_user_id)
      values ('${organizationId}', 'Paid Creative Proof', 'paid-creative-proof', '${userId}');
      insert into public.campaign_plans(id, plan, user_id, organization_id)
      values ('${campaignId}', '{}'::jsonb, '${userId}', '${organizationId}');
      insert into public.organization_user_credits(organization_id, user_id, balance)
      values ('${organizationId}', '${userId}', 1000);
    `, { label: "Seed paid creative fixture" });

    const staticAttempt = "provider_usage_attempt:static-proof-asset-1";
    const staticReserve = session.psql(reserveSql({
      idempotency: "static-proof-asset-1",
      attempt: staticAttempt,
      token: tokenStatic,
      provider: "openai",
      operation: "openai_image_generation",
      amount: 100,
    }), { label: "Reserve static paid generation" });
    assert.match(staticReserve, /^t\|\|reserved\|900\|[0-9a-f-]+$/);
    const staticEventId = staticReserve.split("|")[4];

    const staticBegin = session.psql(serviceSql(`
      select dispatch_id, decision, dispatch_state, dispatch_token, dispatch_generation
      from public.begin_paid_creative_dispatch_v1(
        '${staticEventId}', '${organizationId}', '${userId}', '${campaignId}',
        'openai', 'openai_image_generation', '${staticAttempt}',
        '${"a".repeat(64)}',
        '{"model":"gpt-image-1.5","prompt":"durable static proof","aspectRatio":"1:1"}'::jsonb
      );
    `), { label: "Persist static dispatch intent" });
    const [staticDispatchId, staticDecision, staticState, staticDispatchToken, staticGeneration] =
      staticBegin.split("|");
    assert.equal(`${staticDecision}|${staticState}`, "dispatch|dispatching");

    assert.match(session.psql(serviceSql(`
      select recorded, dispatch_state
      from public.record_paid_creative_provider_outcome_v1(
        '${staticDispatchId}', '${organizationId}', '${userId}',
        '${staticDispatchToken}', ${staticGeneration}, 'accepted', 'openai-request-proof-1',
        '{"fileUrl":"https://assets.invalid/static-proof.png","status":"ready","metadata":{"providerOutcome":"accepted"}}'::jsonb,
        null
      );
    `), { label: "Persist accepted static output before projection" }), /^t\|accepted$/);

    // Crash boundary: accepted provider output exists, but no creative asset
    // or final usage settlement exists yet.
    assert.equal(session.psql(`select status from public.provider_usage_events where id = '${staticEventId}';`), "reserved");
    assert.equal(session.psql(`select count(*) from public.creative_assets where paid_creative_dispatch_id = '${staticDispatchId}';`), "0");

    const staticReserveReplay = session.psql(reserveSql({
      idempotency: "static-proof-asset-1",
      attempt: staticAttempt,
      token: "74000000-0000-4000-a000-000000000099",
      provider: "openai",
      operation: "openai_image_generation",
      amount: 100,
    }), { label: "Replay static reservation" });
    assert.match(staticReserveReplay, /^f\|attempt_in_progress\|reserved\|900\|/);
    assert.match(session.psql(serviceSql(`
      select decision, dispatch_state, provider_request_id,
        provider_output->>'fileUrl'
      from public.begin_paid_creative_dispatch_v1(
        '${staticEventId}', '${organizationId}', '${userId}', '${campaignId}',
        'openai', 'openai_image_generation', '${staticAttempt}',
        '${"a".repeat(64)}',
        '{"model":"gpt-image-1.5","prompt":"durable static proof","aspectRatio":"1:1"}'::jsonb
      );
    `), { label: "Recover static provider output" }), /^recover\|accepted\|openai-request-proof-1\|https:\/\/assets\.invalid\/static-proof\.png$/);

    const staticImageId = "75000000-0000-4000-a000-000000000001";
    const staticThumbId = "75000000-0000-4000-a000-000000000002";
    session.psql(`
      insert into public.creative_assets(
        id, user_id, campaign_id, asset_type, generation_method, status,
        provider_name, paid_creative_dispatch_id, file_url
      ) values
        ('${staticImageId}', '${userId}', '${campaignId}', 'image_frame', 'image_generation', 'ready', 'openai', '${staticDispatchId}', 'https://assets.invalid/static-proof.png'),
        ('${staticThumbId}', '${userId}', '${campaignId}', 'thumbnail', 'image_generation', 'ready', 'openai', '${staticDispatchId}', 'https://assets.invalid/static-proof.png');
    `, { label: "Project static provider output" });
    const staticReceipt = `{"kind":"static_creative","campaignId":"${campaignId}","staticAssetId":"proof","creativeAssetIds":["${staticImageId}","${staticThumbId}"]}`;
    assert.equal(session.psql(serviceSql(`
      select finalized, reused_projection, dispatch_state, usage_status
      from public.finalize_paid_creative_projection_v1(
        '${staticDispatchId}', '${organizationId}', '${userId}', '${staticReceipt}'::jsonb
      );
    `), { label: "Finalize static projection" }), "t|f|projected|consumed");
    assert.equal(session.psql(serviceSql(`
      select finalized, reused_projection, dispatch_state, usage_status
      from public.finalize_paid_creative_projection_v1(
        '${staticDispatchId}', '${organizationId}', '${userId}', '${staticReceipt}'::jsonb
      );
    `), { label: "Replay static finalization" }), "f|t|projected|consumed");

    const videoAttempt = "provider_usage_attempt:video-proof-asset-1";
    const videoReserve = session.psql(reserveSql({
      idempotency: "video-proof-asset-1",
      attempt: videoAttempt,
      token: tokenVideo,
      provider: "higgsfield",
      operation: "higgsfield_video_generation",
      amount: 500,
    }), { label: "Reserve video paid generation" });
    assert.match(videoReserve, /^t\|\|reserved\|400\|/);
    const videoEventId = videoReserve.split("|")[4];
    const videoBegin = session.psql(serviceSql(`
      select dispatch_id, dispatch_token, dispatch_generation
      from public.begin_paid_creative_dispatch_v1(
        '${videoEventId}', '${organizationId}', '${userId}', '${campaignId}',
        'higgsfield', 'higgsfield_video_generation', '${videoAttempt}',
        '${"b".repeat(64)}',
        '{"script":"durable video proof","inputImageUrl":"https://assets.invalid/input.png"}'::jsonb
      );
    `), { label: "Persist video dispatch intent" });
    const [videoDispatchId, videoDispatchToken, videoGeneration] = videoBegin.split("|");
    session.psql(serviceSql(`
      select recorded
      from public.record_paid_creative_provider_outcome_v1(
        '${videoDispatchId}', '${organizationId}', '${userId}',
        '${videoDispatchToken}', ${videoGeneration}, 'accepted', 'higgsfield-request-proof-1',
        '{"provider":"higgsfield","providerAssetId":"higgsfield-request-proof-1","status":"queued"}'::jsonb,
        null
      );
    `), { label: "Persist accepted video request identity" });
    assert.match(session.psql(serviceSql(`
      select decision, dispatch_state, provider_request_id
      from public.begin_paid_creative_dispatch_v1(
        '${videoEventId}', '${organizationId}', '${userId}', '${campaignId}',
        'higgsfield', 'higgsfield_video_generation', '${videoAttempt}',
        '${"b".repeat(64)}',
        '{"script":"durable video proof","inputImageUrl":"https://assets.invalid/input.png"}'::jsonb
      );
    `), { label: "Recover video provider identity" }), /^recover\|accepted\|higgsfield-request-proof-1$/);
    const videoAssetId = "75000000-0000-4000-a000-000000000003";
    session.psql(`
      insert into public.creative_assets(
        id, user_id, campaign_id, asset_type, generation_method, status,
        provider_name, provider_asset_id, paid_creative_dispatch_id
      ) values (
        '${videoAssetId}', '${userId}', '${campaignId}', 'ugc_video', 'avatar_provider',
        'generating', 'higgsfield', 'higgsfield-request-proof-1', '${videoDispatchId}'
      );
    `, { label: "Project recovered video request" });
    const videoReceipt = `{"kind":"video_generation","campaignId":"${campaignId}","creativeAssetId":"${videoAssetId}","providerAssetId":"higgsfield-request-proof-1"}`;
    assert.equal(session.psql(serviceSql(`
      select dispatch_state, usage_status
      from public.finalize_paid_creative_projection_v1(
        '${videoDispatchId}', '${organizationId}', '${userId}', '${videoReceipt}'::jsonb
      );
    `), { label: "Finalize video projection" }), "projected|consumed");

    const ambiguousAttempt = "provider_usage_attempt:ambiguous-proof-asset-1";
    const ambiguousReserve = session.psql(reserveSql({
      idempotency: "ambiguous-proof-asset-1",
      attempt: ambiguousAttempt,
      token: tokenAmbiguous,
      provider: "openai",
      operation: "openai_image_generation",
      amount: 100,
    }), { label: "Reserve ambiguous generation" });
    const ambiguousEventId = ambiguousReserve.split("|")[4];
    session.psql(serviceSql(`
      select dispatch_id
      from public.begin_paid_creative_dispatch_v1(
        '${ambiguousEventId}', '${organizationId}', '${userId}', '${campaignId}',
        'openai', 'openai_image_generation', '${ambiguousAttempt}',
        '${"c".repeat(64)}', '{"prompt":"ambiguous proof"}'::jsonb
      );
    `), { label: "Persist ambiguous dispatch intent" });
    // Injected database failure between the provider call and acceptance write:
    // no outcome row update occurs. Re-entry must be operator-only.
    assert.equal(session.psql(serviceSql(`
      select decision, dispatch_state
      from public.begin_paid_creative_dispatch_v1(
        '${ambiguousEventId}', '${organizationId}', '${userId}', '${campaignId}',
        'openai', 'openai_image_generation', '${ambiguousAttempt}',
        '${"c".repeat(64)}', '{"prompt":"ambiguous proof"}'::jsonb
      );
    `), { label: "Block ambiguous provider replay" }), "operator_action_required|dispatching");

    assert.equal(session.psql(`
      select balance from public.organization_user_credits
      where organization_id = '${organizationId}' and user_id = '${userId}';
    `), "300", "each of three logical attempts must debit exactly once");
    assert.equal(session.psql(`
      select count(*) from public.user_credit_ledger
      where organization_id = '${organizationId}' and user_id = '${userId}'
        and delta < 0 and reference_type = 'provider_usage_event';
    `), "3", "provider re-entry created a duplicate debit");
    assert.equal(session.psql(`
      select count(*) from public.paid_creative_dispatches
      where organization_id = '${organizationId}';
    `), "3", "logical attempts did not retain one durable dispatch each");
    assert.equal(session.psql(`
      select has_table_privilege('anon', 'public.paid_creative_dispatches', 'SELECT') || '|' ||
             has_table_privilege('authenticated', 'public.paid_creative_dispatches', 'SELECT') || '|' ||
             has_table_privilege('service_role', 'public.paid_creative_dispatches', 'SELECT');
    `), "false|false|true", "paid provider receipts are exposed outside service authority");
  });

  assert.deepEqual(adapter.listDisposableDatabases(), []);
  console.log(
    `Paid creative dispatch database proof PASS: ${migrations.length} migrations; ` +
      "OpenAI static + Higgsfield video output recovery; ambiguous replay blocked; exactly one debit per attempt",
  );
} finally {
  if (createdPostgresRole) {
    adapter.psql("drop role if exists postgres;", {
      label: "Remove isolated migration owner",
    });
  }
}
