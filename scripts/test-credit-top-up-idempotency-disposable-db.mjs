#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const REQUIRED_MIGRATION = "20260716180000_harden_credit_top_up_request_idempotency.sql";
const TRANSACTION_OWNER = "20260710160000_validate_and_normalize_pre_candidate_shape.sql";
const migrations = readdirSync(MIGRATIONS)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();

const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  databasePrefix: `dfct_${process.pid}_${randomBytes(3).toString("hex")}`,
  expectedVersion: "17.6",
  maxOutputBytes: 32 * 1024 * 1024,
  timeoutMs: 180_000,
});

const USER_ID = "b1000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "b2000000-0000-4000-8000-000000000001";
const MIN_INTENT_ID = "b3000000-0000-4000-8000-000000000001";
const MIN_REPLAY_INTENT_ID = "b3000000-0000-4000-8000-000000000002";
const MAX_INTENT_ID = "b3000000-0000-4000-8000-000000000003";
const RACE_INTENT_A = "b3000000-0000-4000-8000-000000000004";
const RACE_INTENT_B = "b3000000-0000-4000-8000-000000000005";
const MIN_REQUEST_ID = "b4000000-0000-4000-8000-000000000001";
const MAX_REQUEST_ID = "b4000000-0000-4000-8000-000000000002";
const RACE_REQUEST_ID = "b4000000-0000-4000-8000-000000000003";

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
  `, { label: "Install remote-equivalent disposable database defaults" });
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
    if (file === REQUIRED_MIGRATION) {
      session.psql(`begin; set role postgres; ${source} reset role; commit;`, {
        label: `Replay ${file}`,
        timeoutMs: 180_000,
      });
    }
  }
}

function callIntent({
  intentId,
  requestId,
  amountCents,
  customerId = "cus_top_up_test",
}) {
  return `set role service_role;
    set request.jwt.claim.role = 'service_role';
    select intent_id::text || '|' || reused_existing::text
    from public.create_credit_top_up_intent_v2(
      '${intentId}', '${ORGANIZATION_ID}', '${USER_ID}', '${requestId}',
      ${amountCents}, 'usd', '${customerId}'
    );
    reset role;`;
}

let createdPostgresRole = false;
try {
  assert.ok(migrations.includes(REQUIRED_MIGRATION), "idempotency migration is absent from final chain");
  adapter.preflight();
  if (adapter.psql("select exists(select 1 from pg_roles where rolname='postgres');") !== "t") {
    adapter.psql("create role postgres superuser nologin;");
    createdPostgresRole = true;
  }

  await adapter.withDisposableDatabase(async (session) => {
    installRemoteDefaults(session);
    applyAllMigrations(session);
    assert.equal(
      session.psql(`select count(*) from information_schema.columns
        where table_schema='public' and table_name='credit_top_up_intents'
          and column_name='client_request_id' and data_type='uuid';`),
      "1",
      "final chain is missing the UUID request identity column",
    );
    assert.equal(
      session.psql(`select count(*) from pg_proc procedure_record
        join pg_namespace namespace_record on namespace_record.oid=procedure_record.pronamespace
        where namespace_record.nspname='public'
          and procedure_record.proname='create_credit_top_up_intent_v2';`),
      "1",
      "final chain is missing the versioned semantic-idempotency RPC",
    );
    session.psql(`
      insert into auth.users(id) values ('${USER_ID}');
      insert into public.users(id, email) values ('${USER_ID}', 'credit-top-up@example.invalid');
      insert into public.organizations(id, name, slug, owner_user_id)
      values ('${ORGANIZATION_ID}', 'Credit Top Up', 'credit-top-up', '${USER_ID}');
      insert into public.organization_memberships(organization_id, user_id, role)
      values ('${ORGANIZATION_ID}', '${USER_ID}', 'owner');
    `, { label: "Seed one synthetic credit top-up tenant" });

    session.psqlMustFail(
      callIntent({ intentId: MIN_INTENT_ID, requestId: MIN_REQUEST_ID, amountCents: 2_499 }),
      /credit_top_up_intent_invalid/i,
      { label: "Reject one cent below minimum" },
    );
    session.psqlMustFail(
      callIntent({ intentId: MAX_INTENT_ID, requestId: MAX_REQUEST_ID, amountCents: 100_001 }),
      /credit_top_up_intent_invalid/i,
      { label: "Reject one cent above maximum" },
    );

    assert.equal(
      session.psql(callIntent({
        intentId: MIN_INTENT_ID,
        requestId: MIN_REQUEST_ID,
        amountCents: 2_500,
      }), { label: "Accept exact minimum" }),
      `${MIN_INTENT_ID}|false`,
    );
    assert.equal(
      session.psql(`set role service_role;
        set request.jwt.claim.role = 'service_role';
        select id::text from public.bind_credit_top_up_checkout_v1(
          '${MIN_INTENT_ID}', '${ORGANIZATION_ID}', '${USER_ID}', 'cs_test_credit_top_up_minimum'
        );
        reset role;`, { label: "Bind one reusable synthetic checkout identity" }),
      MIN_INTENT_ID,
    );
    assert.equal(
      session.psql(callIntent({
        intentId: MIN_REPLAY_INTENT_ID,
        requestId: MIN_REQUEST_ID,
        amountCents: 2_500,
      }), { label: "Replay exact minimum request" }),
      `${MIN_INTENT_ID}|true`,
    );
    assert.equal(
      session.psql(`select stripe_checkout_session_id || '|' || status
        from public.credit_top_up_intents where id='${MIN_INTENT_ID}';`),
      "cs_test_credit_top_up_minimum|checkout_created",
      "semantic replay did not preserve the original open checkout identity",
    );
    assert.equal(
      session.psql(callIntent({
        intentId: MAX_INTENT_ID,
        requestId: MAX_REQUEST_ID,
        amountCents: 100_000,
      }), { label: "Accept exact maximum" }),
      `${MAX_INTENT_ID}|false`,
    );
    session.psqlMustFail(
      callIntent({
        intentId: MIN_REPLAY_INTENT_ID,
        requestId: MIN_REQUEST_ID,
        amountCents: 2_501,
      }),
      /credit_top_up_request_identity_collision/i,
      { label: "Reject semantic request amount collision" },
    );
    session.psqlMustFail(
      `set role authenticated;
       set request.jwt.claim.role = 'authenticated';
       select * from public.create_credit_top_up_intent_v2(
         '${MIN_REPLAY_INTENT_ID}', '${ORGANIZATION_ID}', '${USER_ID}', '${MIN_REQUEST_ID}',
         2500, 'usd', 'cus_top_up_test'
       );
       reset role;`,
      /permission denied|credit_top_up_service_role_required/i,
      { label: "Reject non-service-role intent creation" },
    );

    const raceOutputs = await session.psqlConcurrent([
      `begin; ${callIntent({
        intentId: RACE_INTENT_A,
        requestId: RACE_REQUEST_ID,
        amountCents: 5_000,
      })} select pg_sleep(0.1); commit;`,
      `begin; ${callIntent({
        intentId: RACE_INTENT_B,
        requestId: RACE_REQUEST_ID,
        amountCents: 5_000,
      })} select pg_sleep(0.1); commit;`,
    ], { label: "Race duplicate credit top-up requests", timeoutMs: 30_000 });
    const receipts = raceOutputs
      .flatMap((output) => output.split(/\r?\n/))
      .filter((line) => /^[0-9a-f-]{36}\|(?:true|false)$/.test(line));
    assert.equal(receipts.length, 2, `both concurrent callers need receipts: ${JSON.stringify(raceOutputs)}`);
    assert.equal(new Set(receipts.map((line) => line.split("|")[0])).size, 1);
    assert.equal(receipts.filter((line) => line.endsWith("|false")).length, 1);
    assert.equal(receipts.filter((line) => line.endsWith("|true")).length, 1);
    assert.equal(
      session.psql(`select count(*) from public.credit_top_up_intents
        where organization_id='${ORGANIZATION_ID}' and user_id='${USER_ID}'
          and client_request_id='${RACE_REQUEST_ID}';`),
      "1",
      "concurrent replay created more than one durable intent",
    );
    assert.equal(
      session.psql(`select count(*) from public.credit_top_up_intents
        where amount_cents < 2500 or amount_cents > 100000;`),
      "0",
    );
  });

  console.log(`PASS credit top-up disposable DB: ${migrations.length} migrations, boundaries, replay, and concurrent convergence`);
} finally {
  if (createdPostgresRole) {
    adapter.psql("drop role if exists postgres;");
  }
}
