#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createDisposablePostgresHarness } from "./lib/disposable-postgres-harness.mjs";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "supabase/migrations/20260710235900_fence_stripe_webhook_processing.sql",
);
const orderingMigrationPath = path.join(
  root,
  "supabase/migrations/20260429100000_fix_billing_ordering_and_operator_resolution.sql",
);
const protocolMigrationPath = path.join(
  root,
  "supabase/migrations/20260710235970_harden_stripe_protocol_and_credit_intents.sql",
);
const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const containerName = `dealflow-stripe-disposable-${process.pid}-${randomBytes(4).toString("hex")}`;
const disposablePostgres = createDisposablePostgresHarness({ containerName, image });
const password = randomBytes(24).toString("hex");
let cleaned = false;

function docker(args, options = {}) {
  return disposablePostgres.run(args, options);
}

function sanitize(value) {
  return String(value ?? "")
    .replaceAll(password, "[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(password|passwd|pwd)\s*[=:]\s*\S+/gi, "$1=[REDACTED]")
    .trim()
    .slice(-2_000);
}

function requireSuccess(result, label) {
  if (result.error || result.status !== 0) {
    throw new Error(
      `${label}: ${sanitize(result.error?.message || result.stderr || result.stdout || `exit ${result.status}`)}`,
    );
  }
  return String(result.stdout ?? "").trim();
}

function psqlArgs() {
  return [
    "exec",
    "-i",
    "--env",
    `PGPASSWORD=${password}`,
    containerName,
    "psql",
    "--no-psqlrc",
    "--set=ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--field-separator=|",
    "--quiet",
    "--username=supabase_admin",
    "--dbname=postgres",
  ];
}

function psql(sql, label) {
  return requireSuccess(docker(psqlArgs(), { input: sql }), label);
}

function psqlMustFail(sql, pattern, label) {
  const result = docker(psqlArgs(), { input: sql });
  assert.notEqual(result.status, 0, `${label}: SQL unexpectedly succeeded`);
  assert.match(sanitize(result.stderr || result.stdout), pattern, `${label}: wrong SQL rejection`);
}

function psqlAsync(sql) {
  return disposablePostgres.psqlAsync(psqlArgs(), sql).then((result) => {
    if (result.status !== 0) {
      throw new Error(`Concurrent psql failed: ${sanitize(result.stderr || result.stdout)}`);
    }
    return result.stdout.trim();
  });
}

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  docker(["rm", "--force", containerName], { timeout: 30_000 });
}

for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.once(signal, () => {
    cleanup();
    process.exit(code);
  });
}
process.once("exit", cleanup);

async function waitForPostgres() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const initProcess = docker(["exec", containerName, "cat", "/proc/1/comm"], {
      timeout: 5_000,
    });
    const health = docker(["inspect", "--format={{.State.Health.Status}}", containerName], {
      timeout: 5_000,
    });
    const ready = docker(
      ["exec", containerName, "pg_isready", "--username=supabase_admin", "--dbname=postgres"],
      { timeout: 5_000 },
    );
    if (
      initProcess.status === 0 &&
      initProcess.stdout.trim().toLowerCase().includes("postgres") &&
      health.status === 0 &&
      health.stdout.trim() === "healthy" &&
      ready.status === 0
    ) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Disposable PostgreSQL did not become ready within 30 seconds.");
}

const eventId = "evt_disposable_claim";
const oldToken = "10000000-0000-4000-8000-000000000001";
const tokenA = "20000000-0000-4000-8000-000000000001";
const tokenB = "30000000-0000-4000-8000-000000000001";
const observedTimestamp = "2026-01-01T00:00:00.000Z";

try {
  assert.ok(fs.existsSync(migrationPath), "Stripe fencing migration is missing");
  assert.ok(fs.existsSync(orderingMigrationPath), "Billing ordering migration is missing");
  assert.ok(fs.existsSync(protocolMigrationPath), "Stripe protocol migration is missing");
  requireSuccess(
    docker(["image", "inspect", image], { timeout: 15_000 }),
    "Cached Supabase PostgreSQL image is unavailable",
  );
  requireSuccess(
    docker([
      "run",
      "--detach",
      "--rm",
      "--pull=never",
      "--network=none",
      "--name",
      containerName,
      "--env",
      `POSTGRES_PASSWORD=${password}`,
      image,
    ], { timeout: 30_000 }),
    "Disposable PostgreSQL container failed to start",
  );
  await waitForPostgres();

  psql(`
    create extension if not exists pgcrypto;
    create schema if not exists auth;
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
      end if;
    end;
    $$;

    grant usage on schema public to anon, authenticated, service_role;
    create or replace function auth.role()
    returns text
    language sql
    stable
    as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;

    create table if not exists auth.users (id uuid primary key);
    create table public.organizations (
      id uuid primary key,
      owner_user_id uuid not null references auth.users(id),
      plan_tier text not null default 'starter'
    );
    create table public.organization_memberships (
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null references auth.users(id),
      primary key (organization_id, user_id)
    );
    create table public.billing_subscriptions (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id),
      user_id uuid null references auth.users(id),
      stripe_customer_id text null,
      stripe_subscription_id text null,
      stripe_checkout_session_id text null,
      stripe_price_id text null,
      plan_tier text not null default 'starter',
      status text not null default 'inactive',
      current_period_start timestamptz null,
      current_period_end timestamptz null,
      cancel_at_period_end boolean not null default false,
      metadata jsonb null,
      stripe_latest_event_id text null,
      stripe_latest_event_created bigint not null default 0,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now()),
      unique (organization_id)
    );
    create table public.user_credits (
      user_id uuid primary key references auth.users(id),
      balance integer not null default 0,
      updated_at timestamptz not null default timezone('utc', now())
    );
    create table public.user_credit_ledger (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id),
      organization_id uuid not null references public.organizations(id),
      delta integer not null,
      balance_after integer not null,
      reason text not null,
      reference_type text null,
      reference_id text null,
      idempotency_key text null unique,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default timezone('utc', now())
    );
    create or replace function public.grant_user_credits(
      p_user_id uuid,
      p_organization_id uuid,
      p_amount integer,
      p_reason text,
      p_reference_type text default null,
      p_reference_id text default null,
      p_idempotency_key text default null,
      p_metadata jsonb default '{}'::jsonb
    ) returns table (balance integer, ledger_id uuid, reused_existing boolean)
    language plpgsql security definer set search_path = '' as $$
    declare
      existing public.user_credit_ledger%rowtype;
      next_balance integer;
      inserted_id uuid;
    begin
      select * into existing from public.user_credit_ledger ledger
      where ledger.idempotency_key = p_idempotency_key limit 1;
      if existing.id is not null then
        return query select existing.balance_after, existing.id, true;
        return;
      end if;
      insert into public.user_credits(user_id, balance) values (p_user_id, 0)
      on conflict (user_id) do nothing;
      update public.user_credits credits
      set balance = credits.balance + p_amount, updated_at = timezone('utc', now())
      where credits.user_id = p_user_id
      returning credits.balance into next_balance;
      insert into public.user_credit_ledger(
        user_id, organization_id, delta, balance_after, reason,
        reference_type, reference_id, idempotency_key, metadata
      ) values (
        p_user_id, p_organization_id, p_amount, next_balance, p_reason,
        p_reference_type, p_reference_id, p_idempotency_key, coalesce(p_metadata, '{}'::jsonb)
      ) returning id into inserted_id;
      return query select next_balance, inserted_id, false;
    end;
    $$;
    create table public.system_jobs (
      id uuid primary key default gen_random_uuid(),
      status text not null default 'queued',
      dead_lettered_at timestamptz null,
      created_at timestamptz not null default timezone('utc', now())
    );
    create table public.app_schema_metadata (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default timezone('utc', now())
    );

    create table public.stripe_webhook_events (
      id uuid primary key default gen_random_uuid(),
      stripe_event_id text not null unique,
      stripe_event_type text not null,
      stripe_object_id text null,
      organization_id uuid null,
      stripe_subscription_id text null,
      status text not null default 'processing'
        check (status in ('processing', 'processed', 'ignored', 'failed')),
      processed_at timestamptz null,
      error_code text null,
      error_message text null,
      payload jsonb null,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
    );
    grant select, insert, update, delete, truncate on public.stripe_webhook_events
      to authenticated, service_role;
    insert into auth.users(id) values ('40000000-0000-4000-8000-000000000001');
    insert into public.organizations(id, owner_user_id, plan_tier)
      values ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'pro');
  `, "Create disposable Stripe base schema");

  psql(fs.readFileSync(orderingMigrationPath, "utf8"), "Apply billing event ordering migration");
  psql(fs.readFileSync(migrationPath, "utf8"), "Apply Stripe claim fencing migration");

  const privileges = psql(`
    select
      has_table_privilege('authenticated', 'public.stripe_webhook_events', 'INSERT'),
      has_table_privilege('authenticated', 'public.stripe_webhook_events', 'UPDATE'),
      has_table_privilege('authenticated', 'public.stripe_webhook_events', 'DELETE'),
      has_table_privilege('authenticated', 'public.stripe_webhook_events', 'TRUNCATE');
  `, "Inspect authenticated Stripe receipt privileges");
  assert.equal(privileges, "f|f|f|f");

  const legacyNormalized = psql(`
    insert into public.stripe_webhook_events (
      stripe_event_id, stripe_event_type, stripe_object_id, status
    ) values ('evt_legacy_insert', 'checkout.session.completed', 'cs_legacy', 'processing')
    returning
      (processing_claim_token is not null)::text,
      processing_claim_generation::text,
      (processing_locked_until > timezone('utc', now()))::text;
  `, "Prove mixed-version insert normalization");
  assert.equal(legacyNormalized, "true|1|true");

  psql(`
    insert into public.stripe_webhook_events (
      stripe_event_id,
      stripe_event_type,
      stripe_object_id,
      status,
      processing_claim_token,
      processing_claim_generation,
      processing_locked_until,
      updated_at
    ) values (
      '${eventId}',
      'invoice.payment_succeeded',
      'in_disposable',
      'processing',
      '${oldToken}',
      1,
      timezone('utc', now()) - interval '1 second',
      '${observedTimestamp}'::timestamptz
    );
  `, "Seed expired Stripe processing claim");

  const buildReclaim = (token, timestamp) => `
    with claimed as (
      update public.stripe_webhook_events
      set processing_claim_token = '${token}',
          processing_claim_generation = 2,
          processing_locked_until = timezone('utc', now()) + interval '5 minutes',
          updated_at = '${timestamp}'::timestamptz
      where stripe_event_id = '${eventId}'
        and status = 'processing'
        and updated_at = '${observedTimestamp}'::timestamptz
        and processing_claim_token = '${oldToken}'::uuid
        and processing_locked_until <= timezone('utc', now())
      returning id
    )
    select count(*) from claimed;
  `;
  const reclaimResults = await Promise.all([
    psqlAsync(buildReclaim(tokenA, "2026-07-11T05:20:01.000Z")),
    psqlAsync(buildReclaim(tokenB, "2026-07-11T05:20:02.000Z")),
  ]);
  assert.deepEqual(reclaimResults.sort(), ["0", "1"], "exactly one stale reclaim must win");

  const activeClaim = psql(`
    select processing_claim_token::text, processing_claim_generation::text
    from public.stripe_webhook_events
    where stripe_event_id = '${eventId}';
  `, "Read winning Stripe claim");
  const [activeToken, activeGeneration] = activeClaim.split("|");
  assert.ok(activeToken === tokenA || activeToken === tokenB);
  assert.equal(activeGeneration, "2");

  const staleSettlement = psql(`
    with settled as (
      update public.stripe_webhook_events
      set status = 'processed', processed_at = timezone('utc', now())
      where stripe_event_id = '${eventId}'
        and status = 'processing'
        and processing_claim_token = '${oldToken}'::uuid
        and processing_claim_generation = 1
        and processing_locked_until > timezone('utc', now())
      returning id
    )
    select count(*) from settled;
  `, "Reject stale Stripe settlement");
  assert.equal(staleSettlement, "0");

  const currentSettlement = psql(`
    with settled as (
      update public.stripe_webhook_events
      set status = 'processed', processed_at = timezone('utc', now())
      where stripe_event_id = '${eventId}'
        and status = 'processing'
        and processing_claim_token = '${activeToken}'::uuid
        and processing_claim_generation = ${activeGeneration}
        and processing_locked_until > timezone('utc', now())
      returning id
    )
    select count(*) from settled;
  `, "Settle current Stripe claim");
  assert.equal(currentSettlement, "1");

  const settledState = psql(`
    select status, (processing_claim_token is null)::text,
      (processing_locked_until is null)::text, processing_claim_generation::text
    from public.stripe_webhook_events
    where stripe_event_id = '${eventId}';
  `, "Inspect settled Stripe receipt");
  assert.equal(settledState, "processed|true|true|2");

  const billingOrganizationId = "50000000-0000-4000-8000-000000000001";
  const billingUserId = "40000000-0000-4000-8000-000000000001";
  psql(`set role service_role;
    select applied from public.apply_billing_subscription_webhook(
      '${billingOrganizationId}', '${billingUserId}', 'cus_disposable', 'sub_disposable',
      'price_pro', 'pro', 'active', now(), now() + interval '30 days', false,
      '{}'::jsonb, 'evt_100_active_pro', 100
    );`, "seed active Pro billing authority");
  assert.equal(
    psql(`set role service_role;
      select applied, latest_event_created from public.apply_billing_subscription_webhook(
        '${billingOrganizationId}', '${billingUserId}', 'cus_disposable', 'sub_disposable',
        'price_unknown', 'starter', 'operator_action_required', null, null, false,
        '{"billing_reconciliation_reason":"subscription_price_unknown"}'::jsonb,
        'evt_101_unknown_price', 101
      );`, "atomically apply unknown-price billing authority"),
    "t|101",
  );
  assert.equal(
    psql(`select plan_tier, status, stripe_latest_event_id, stripe_latest_event_created
      from public.billing_subscriptions where organization_id = '${billingOrganizationId}';`,
    "read fail-closed billing authority"),
    "starter|operator_action_required|evt_101_unknown_price|101",
    "a newer unknown-price event must replace stale active Pro access",
  );
  assert.equal(
    psql(`set role service_role;
      select applied, ignored_reason, latest_event_created
      from public.apply_billing_subscription_webhook(
        '${billingOrganizationId}', '${billingUserId}', 'cus_disposable', 'sub_disposable',
        'price_pro', 'pro', 'active', now(), now() + interval '30 days', false,
        '{}'::jsonb, 'evt_099_stale_active', 99
      );`, "reject stale active billing event"),
    "f|stale_event|101",
  );
  assert.equal(
    psql(`select plan_tier, status from public.billing_subscriptions
      where organization_id = '${billingOrganizationId}';`, "verify fail-closed state survived stale replay"),
    "starter|operator_action_required",
  );

  psql(fs.readFileSync(protocolMigrationPath, "utf8"), "Apply Stripe protocol and credit-intent migration");
  assert.equal(
    psql(`select
      has_table_privilege('service_role', 'public.stripe_webhook_events', 'INSERT'),
      has_table_privilege('service_role', 'public.stripe_webhook_events', 'UPDATE'),
      has_function_privilege(
        'service_role',
        'public.claim_stripe_webhook_event_v2(text,text,text,uuid,text,jsonb,uuid,integer)',
        'EXECUTE'
      );`, "inspect Stripe v2 cutover privileges"),
    "f|f|t",
  );

  psqlMustFail(`set role service_role;
    insert into public.stripe_webhook_events(stripe_event_id, stripe_event_type, status)
    values ('evt_old_writer', 'checkout.session.completed', 'processing');`,
    /permission denied for table stripe_webhook_events/,
    "block old Stripe receipt writers");

  const v2EventId = "evt_v2_claim";
  const v2Token = "60000000-0000-4000-8000-000000000001";
  const v2Claim = psql(`set request.jwt.claim.role = 'service_role';
    select claim_outcome, receipt_status, claim_token, claim_generation
    from public.claim_stripe_webhook_event_v2(
      '${v2EventId}', 'invoice.payment_succeeded', 'in_v2', '${billingOrganizationId}',
      'sub_disposable', '{}'::jsonb, '${v2Token}', 300000
    );`, "claim Stripe event through v2 protocol");
  assert.equal(v2Claim, `claimed|processing|${v2Token}|1`);
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select public.settle_stripe_webhook_event_v2(
        '${v2EventId}', '${oldToken}', 1, 'processed', null, null
      );`, "reject stale v2 Stripe settlement"),
    "f",
  );
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select public.settle_stripe_webhook_event_v2(
        '${v2EventId}', '${v2Token}', 1, 'processed', null, null
      );`, "settle v2 Stripe claim"),
    "t",
  );
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select claim_outcome, receipt_status
      from public.claim_stripe_webhook_event_v2(
        '${v2EventId}', 'invoice.payment_succeeded', 'in_v2', '${billingOrganizationId}',
        'sub_disposable', '{}'::jsonb, '${tokenA}', 300000
      );`, "replay settled v2 Stripe receipt"),
    "duplicate|processed",
  );

  const ambiguousEventId = "evt_v2_authoritative_refresh_ambiguous";
  const ambiguousTokenA = "61000000-0000-4000-8000-000000000001";
  const ambiguousTokenB = "62000000-0000-4000-8000-000000000001";
  const billingBeforeAmbiguity = psql(`select plan_tier, status, stripe_latest_event_id
    from public.billing_subscriptions where organization_id = '${billingOrganizationId}';`,
  "capture billing truth before ambiguous provider read");
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select claim_outcome, claim_generation
      from public.claim_stripe_webhook_event_v2(
        '${ambiguousEventId}', 'customer.subscription.updated', 'sub_disposable',
        '${billingOrganizationId}', 'sub_disposable', '{}'::jsonb, '${ambiguousTokenA}', 300000
      );`, "claim authoritative-refresh ambiguity receipt"),
    "claimed|1",
  );
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select public.settle_stripe_webhook_event_v2(
        '${ambiguousEventId}', '${ambiguousTokenA}', 1, 'failed',
        'stripe_subscription_refresh_ambiguous', 'authoritative provider read unavailable'
      );`, "settle authoritative-refresh ambiguity as retryable failure"),
    "t",
  );
  assert.equal(
    psql(`select status, processed_at is null, error_code
      from public.stripe_webhook_events where stripe_event_id = '${ambiguousEventId}';`,
    "inspect failed authoritative-refresh receipt"),
    "failed|t|stripe_subscription_refresh_ambiguous",
  );
  assert.equal(
    psql(`select plan_tier, status, stripe_latest_event_id
      from public.billing_subscriptions where organization_id = '${billingOrganizationId}';`,
    "verify ambiguity did not project billing state"),
    billingBeforeAmbiguity,
  );
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select claim_outcome, receipt_status, claim_generation
      from public.claim_stripe_webhook_event_v2(
        '${ambiguousEventId}', 'customer.subscription.updated', 'sub_disposable',
        '${billingOrganizationId}', 'sub_disposable', '{}'::jsonb, '${ambiguousTokenB}', 300000
      );`, "reclaim failed authoritative-refresh receipt"),
    "claimed|processing|2",
  );

  const topUpIntentId = "70000000-0000-4000-8000-000000000001";
  psql(`set request.jwt.claim.role = 'service_role';
    select id from public.create_credit_top_up_intent_v1(
      '${topUpIntentId}', '${billingOrganizationId}', '${billingUserId}', 2500, 'usd', 'cus_disposable'
    );
    select id from public.bind_credit_top_up_checkout_v1(
      '${topUpIntentId}', '${billingOrganizationId}', '${billingUserId}', 'cs_top_up_disposable'
    );`, "create and bind durable credit top-up intent");
  psqlMustFail(`set request.jwt.claim.role = 'service_role';
    select * from public.complete_credit_top_up_intent_v1(
      '${topUpIntentId}', 'cs_top_up_disposable', 'cus_disposable', 'pi_disposable',
      'evt_top_up_hostile_amount', 99999, 'usd', '{}'::jsonb
    );`, /credit_top_up_authoritative_payment_mismatch/, "reject metadata-inflated credit amount");
  psqlMustFail(`set request.jwt.claim.role = 'service_role';
    select * from public.complete_credit_top_up_intent_v1(
      '${topUpIntentId}', 'cs_top_up_disposable', 'cus_disposable', 'pi_disposable',
      'evt_top_up_hostile_currency', 2500, 'cad', '{}'::jsonb
    );`, /credit_top_up_authoritative_payment_mismatch/, "reject wrong credit currency");
  psqlMustFail(`set request.jwt.claim.role = 'service_role';
    select * from public.complete_credit_top_up_intent_v1(
      '${topUpIntentId}', 'cs_attacker', 'cus_disposable', 'pi_disposable',
      'evt_top_up_hostile_session', 2500, 'usd', '{}'::jsonb
    );`, /credit_top_up_authoritative_payment_mismatch/, "reject unbound Checkout Session");
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select organization_id, user_id, amount_cents, balance, reused_existing
      from public.complete_credit_top_up_intent_v1(
        '${topUpIntentId}', 'cs_top_up_disposable', 'cus_disposable', 'pi_disposable',
        'evt_top_up_valid', 2500, 'usd', '{}'::jsonb
      );`, "settle durable credit top-up intent"),
    `${billingOrganizationId}|${billingUserId}|2500|2500|f`,
  );
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select balance, reused_existing
      from public.complete_credit_top_up_intent_v1(
        '${topUpIntentId}', 'cs_top_up_disposable', 'cus_disposable', 'pi_disposable',
        'evt_top_up_replay', 2500, 'usd', '{}'::jsonb
      );`, "replay durable credit top-up intent"),
    "2500|t",
  );
  assert.equal(
    psql(`select balance from public.user_credits where user_id = '${billingUserId}';`, "verify one credit grant"),
    "2500",
  );

  const billingSource = fs.readFileSync(
    path.join(root, "src/lib/services/billing-service.ts"),
    "utf8",
  );
  assert.match(billingSource, /claim_stripe_webhook_event_v2/);
  assert.match(billingSource, /settle_stripe_webhook_event_v2/);
  assert.match(billingSource, /stripe_webhook_event_identity_collision/);
  assert.match(billingSource, /complete_credit_top_up_intent_v1/);
  assert.match(billingSource, /assertStripeObjectRuntimeMode\(event, "Stripe webhook event"\)/);
  assert.match(billingSource, /stripe_subscription_refresh_ambiguous/);
  assert.doesNotMatch(billingSource, /refresh_failed_using_event_payload/);
  assert.doesNotMatch(
    billingSource,
    /syncBillingSubscriptionFromStripe\(object as Stripe\.Subscription/,
  );
  const topUpHandlerSource = billingSource.slice(
    billingSource.indexOf("async function applyCreditTopUpCheckoutSession"),
    billingSource.indexOf("export async function handleStripeBillingEvent"),
  );
  assert.match(topUpHandlerSource, /session\.amount_total/);
  assert.match(topUpHandlerSource, /session\.currency/);
  assert.doesNotMatch(topUpHandlerSource, /metadata\?\.organization_id|metadata\?\.user_id|credit_amount_cents/);

  console.log(
    "PASS Stripe/billing disposable DB: v2 claim fencing, retryable authoritative-read ambiguity, direct-writer cutover, ordered fail-closed plan reconciliation, and hostile credit-intent rejection",
  );
} finally {
  cleanup();
}
