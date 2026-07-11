#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "supabase/migrations/20260710235991_harden_financial_integrity.sql",
);
const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const containerName = `dealflow-financial-integrity-${process.pid}-${randomBytes(4).toString("hex")}`;
const password = randomBytes(24).toString("hex");
let cleaned = false;

function docker(args, options = {}) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    input: options.input,
    timeout: options.timeout ?? 60_000,
    maxBuffer: 12 * 1024 * 1024,
  });
}

function sanitize(value) {
  return String(value ?? "")
    .replaceAll(password, "[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(password|passwd|pwd)\s*[=:]\s*\S+/gi, "$1=[REDACTED]")
    .trim()
    .slice(-4_000);
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
  return new Promise((resolve, reject) => {
    const child = spawn("docker", psqlArgs(), { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Concurrent psql failed: ${sanitize(stderr || stdout || `exit ${code}`)}`));
        return;
      }
      resolve(stdout.trim());
    });
    child.stdin.end(sql);
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
    const health = docker(["inspect", "--format={{.State.Health.Status}}", containerName], {
      timeout: 5_000,
    });
    const ready = docker(
      ["exec", containerName, "pg_isready", "--username=supabase_admin", "--dbname=postgres"],
      { timeout: 5_000 },
    );
    if (
      health.status === 0 &&
      health.stdout.trim() === "healthy" &&
      ready.status === 0
    ) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Disposable PostgreSQL did not become ready within 30 seconds.");
}

const ownerA = "10000000-0000-4000-8000-000000000001";
const ownerB = "10000000-0000-4000-8000-000000000002";
const sharedUser = "10000000-0000-4000-8000-000000000003";
const organizationA = "20000000-0000-4000-8000-000000000001";
const organizationB = "20000000-0000-4000-8000-000000000002";
const campaignA = "30000000-0000-4000-8000-000000000001";
const campaignB = "30000000-0000-4000-8000-000000000002";
const token1 = "40000000-0000-4000-8000-000000000001";
const token2 = "40000000-0000-4000-8000-000000000002";
const token3 = "40000000-0000-4000-8000-000000000003";
const token4 = "40000000-0000-4000-8000-000000000004";

function reserveSql({
  idempotencyKey,
  attemptKey,
  token,
  userId = ownerA,
  organizationId = organizationA,
  campaignId = campaignA,
  amount = 100,
}) {
  return `set role service_role;
    set request.jwt.claim.role = 'service_role';
    select allowed, coalesce(block_reason, ''), event_status, credit_balance
    from public.reserve_provider_usage_attempt_v2(
      '${organizationId}', '${userId}', '${campaignId}',
      'openai', 'openai_image_generation', 20,
      '${idempotencyKey}', '${attemptKey}', '${token}', null, ${amount}, 'image_generation'
    );`;
}

try {
  assert.ok(fs.existsSync(migrationPath), "Financial-integrity migration is missing");
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
    create or replace function auth.uid()
    returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.role()
    returns text language sql stable
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
    create table public.campaign_plans (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null references auth.users(id)
    );
    create table public.user_credits (
      user_id uuid primary key references auth.users(id),
      balance integer not null default 0,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
    );
    create table public.user_credit_ledger (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id),
      organization_id uuid null references public.organizations(id),
      delta integer not null,
      balance_after integer not null,
      reason text not null,
      reference_type text null,
      reference_id text null,
      idempotency_key text null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default timezone('utc', now())
    );
    alter table public.user_credit_ledger enable row level security;
    alter table public.user_credit_ledger force row level security;
    grant select on public.user_credit_ledger to authenticated;
    create unique index user_credit_ledger_idempotency_unique
      on public.user_credit_ledger(idempotency_key) where idempotency_key is not null;

    create table public.provider_usage_limits (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid null references public.organizations(id),
      user_id uuid not null references auth.users(id),
      campaign_id uuid null references public.campaign_plans(id),
      provider text not null,
      operation text not null,
      usage_date date not null default current_date,
      usage_count integer not null default 0,
      limit_count integer not null,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
    );
    create unique index provider_usage_limits_scope_unique_idx
      on public.provider_usage_limits(
        user_id,
        coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
        provider,
        operation,
        usage_date
      );
    create table public.provider_usage_events (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid null references public.organizations(id),
      user_id uuid not null references auth.users(id),
      campaign_id uuid null references public.campaign_plans(id),
      provider text not null,
      operation text not null,
      idempotency_key text null,
      usage_date date not null default current_date,
      estimated_cost numeric(12,4) null,
      actual_cost numeric(12,4) null,
      status text not null default 'reserved'
        check (status in ('reserved', 'consumed', 'released', 'failed')),
      metadata jsonb null,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
    );
    create unique index provider_usage_events_idempotency_unique
      on public.provider_usage_events(idempotency_key) where idempotency_key is not null;
    create or replace function public.reserve_provider_usage(
      uuid, uuid, uuid, text, text, integer, text, numeric
    ) returns table (
      allowed boolean, current_count integer, next_count integer,
      limit_count integer, usage_id uuid, event_id uuid,
      reused_existing boolean, event_status text
    ) language sql security definer
    as $$ select false, 0, 0, 0, null::uuid, null::uuid, false, null::text $$;

    create table public.commercial_activations (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null references auth.users(id),
      source_event_id text not null,
      amount_paid_cents integer not null,
      metadata jsonb not null default '{}'::jsonb
    );
    alter table public.commercial_activations enable row level security;
    alter table public.commercial_activations force row level security;
    create policy commercial_activations_member_select
      on public.commercial_activations for select to authenticated
      using (user_id = auth.uid());
    grant select on public.commercial_activations to authenticated;

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
    create table public.app_schema_metadata (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default timezone('utc', now())
    );

    insert into auth.users(id) values ('${ownerA}'), ('${ownerB}'), ('${sharedUser}');
    insert into public.organizations(id, owner_user_id, plan_tier)
    values ('${organizationA}', '${ownerA}', 'starter'), ('${organizationB}', '${ownerB}', 'starter');
    insert into public.organization_memberships(organization_id, user_id)
    values ('${organizationA}', '${sharedUser}'), ('${organizationB}', '${sharedUser}');
    insert into public.campaign_plans(id, organization_id, user_id)
    values ('${campaignA}', '${organizationA}', '${ownerA}'),
           ('${campaignB}', '${organizationB}', '${ownerB}');
    insert into public.user_credits(user_id, balance)
    values ('${ownerA}', 5000), ('${ownerB}', 1000), ('${sharedUser}', 777);
    insert into public.commercial_activations(
      organization_id, user_id, source_event_id, amount_paid_cents
    ) values ('${organizationA}', '${sharedUser}', 'evt_activation', 10000);

    grant select, insert, update, delete, truncate on public.user_credits,
      public.user_credit_ledger, public.provider_usage_limits,
      public.provider_usage_events to service_role;
  `, "Create disposable financial base schema");

  psql(fs.readFileSync(migrationPath, "utf8"), "Apply financial-integrity migration");

  assert.equal(
    psql(`select balance from public.organization_user_credits
      where organization_id = '${organizationA}' and user_id = '${ownerA}';`,
    "verify unambiguous legacy balance migration"),
    "5000",
  );
  assert.equal(
    psql(`select legacy_balance, candidate_organization_count, status
      from public.credit_scope_migration_blockers where user_id = '${sharedUser}';`,
    "verify ambiguous legacy balance blocker"),
    "777|2|operator_action_required",
  );

  const concurrentResults = await Promise.all([
    psqlAsync(reserveSql({
      idempotencyKey: "provider-attempt-1",
      attemptKey: "provider-attempt-1",
      token: token2,
    })),
    psqlAsync(reserveSql({
      idempotencyKey: "provider-attempt-1",
      attemptKey: "provider-attempt-1",
      token: token1,
    })),
  ]);
  assert.deepEqual(
    [...concurrentResults].sort(),
    ["f|attempt_in_progress|reserved|4900", "t||reserved|4900"],
    "one concurrent attempt must own exactly one debit and provider reservation",
  );

  const event1 = psql(`select id from public.provider_usage_events
    where organization_id = '${organizationA}' and attempt_key = 'provider-attempt-1';`,
  "load first provider event");
  const storedToken1 = psql(`select settlement_token from public.provider_usage_events
    where id = '${event1}';`, "load concurrent winner token");
  const staleToken1 = storedToken1 === token1 ? token2 : token1;
  assert.equal(
    psql(`set role service_role; set request.jwt.claim.role = 'service_role';
      select settled, event_status, reused_terminal, compensated
      from public.settle_provider_usage_attempt_v2(
        '${event1}', '${organizationA}', '${ownerA}', '${staleToken1}', 1,
        'consumed', '{}'::jsonb
      );`, "reject stale provider settlement token"),
    "f|reserved|f|f",
  );
  assert.equal(
    psql(`set role service_role; set request.jwt.claim.role = 'service_role';
      select settled, event_status, compensated
      from public.settle_provider_usage_attempt_v2(
        '${event1}', '${organizationA}', '${ownerA}', '${storedToken1}', 1,
        'consumed', '{}'::jsonb
      );`, "consume owned provider attempt"),
    "t|consumed|f",
  );
  assert.equal(
    psql(`set role service_role; set request.jwt.claim.role = 'service_role';
      select settled, event_status, reused_terminal
      from public.settle_provider_usage_attempt_v2(
        '${event1}', '${organizationA}', '${ownerA}', '${storedToken1}', 1,
        'released', '{}'::jsonb
      );`, "prevent late writer from overwriting consumed"),
    "f|consumed|t",
  );
  assert.equal(
    psql(reserveSql({
      idempotencyKey: "provider-attempt-1",
      attemptKey: "provider-attempt-1",
      token: token2,
    }), "block consumed terminal replay"),
    "f|attempt_consumed|consumed|4900",
  );

  assert.equal(
    psql(reserveSql({
      idempotencyKey: "provider-attempt-2",
      attemptKey: "provider-attempt-2",
      token: token2,
    }), "reserve explicit rejection attempt"),
    "t||reserved|4800",
  );
  const event2 = psql(`select id from public.provider_usage_events
    where attempt_key = 'provider-attempt-2';`, "load rejection event");
  assert.equal(
    psql(`set role service_role; set request.jwt.claim.role = 'service_role';
      select settled, event_status, compensated, credit_balance
      from public.settle_provider_usage_attempt_v2(
        '${event2}', '${organizationA}', '${ownerA}', '${token2}', 1,
        'rejected', '{"providerResponseStatus":400}'::jsonb
      );`, "compensate explicit provider rejection"),
    "t|rejected|t|4900",
  );
  assert.equal(
    psql(`set role service_role; set request.jwt.claim.role = 'service_role';
      select settled, event_status, reused_terminal, compensated, credit_balance
      from public.settle_provider_usage_attempt_v2(
        '${event2}', '${organizationA}', '${ownerA}', '${token2}', 1,
        'released', '{}'::jsonb
      );`, "block differently-labelled double compensation"),
    "f|rejected|t|t|4900",
  );
  assert.equal(
    psql(`select count(*) from public.user_credit_ledger
      where source_ledger_id = (
        select credit_ledger_id from public.provider_usage_events where id = '${event2}'
      );`, "verify exactly one compensation per debit"),
    "1",
  );

  assert.equal(
    psql(reserveSql({
      idempotencyKey: "provider-attempt-3",
      attemptKey: "provider-attempt-3",
      token: token3,
    }), "reserve ambiguous transport attempt"),
    "t||reserved|4800",
  );
  const event3 = psql(`select id from public.provider_usage_events
    where attempt_key = 'provider-attempt-3';`, "load ambiguous event");
  assert.equal(
    psql(`set role service_role; set request.jwt.claim.role = 'service_role';
      select settled, event_status, compensated, credit_balance
      from public.settle_provider_usage_attempt_v2(
        '${event3}', '${organizationA}', '${ownerA}', '${token3}', 1,
        'operator_action_required', '{"reason":"transport_ambiguous"}'::jsonb
      );`, "terminalize ambiguous provider outcome without refund"),
    "t|operator_action_required|f|4800",
  );
  assert.equal(
    psql(reserveSql({
      idempotencyKey: "provider-attempt-3",
      attemptKey: "provider-attempt-3",
      token: token4,
    }), "block ambiguous terminal replay"),
    "f|operator_action_required|operator_action_required|4800",
  );

  assert.equal(
    psql(reserveSql({
      idempotencyKey: "provider-attempt-4",
      attemptKey: "provider-attempt-4",
      token: token4,
    }), "reserve explicit pre-provider release"),
    "t||reserved|4700",
  );
  const event4 = psql(`select id from public.provider_usage_events
    where attempt_key = 'provider-attempt-4';`, "load release event");
  assert.equal(
    psql(`set role service_role; set request.jwt.claim.role = 'service_role';
      select settled, event_status, compensated, credit_balance
      from public.settle_provider_usage_attempt_v2(
        '${event4}', '${organizationA}', '${ownerA}', '${token4}', 1,
        'released', '{}'::jsonb
      );`, "compensate explicit release"),
    "t|released|t|4800",
  );
  assert.equal(
    psql(reserveSql({
      idempotencyKey: "provider-attempt-4",
      attemptKey: "provider-attempt-4",
      token: token1,
    }), "block released terminal replay"),
    "f|attempt_terminal|released|4800",
  );

  psqlMustFail(`set role service_role;
    update public.provider_usage_events set status = 'consumed' where id = '${event3}';`,
  /permission denied for table provider_usage_events/,
  "block legacy direct provider event writers");

  assert.equal(
    psql(`set role service_role; set request.jwt.claim.role = 'service_role';
      select balance, reused_existing from public.grant_user_credits(
        '${sharedUser}', '${organizationA}', 100, 'workspace_grant',
        'test', 'grant-a', 'same-key-across-workspaces', '{}'::jsonb
      );`, "grant shared user credits in workspace A"),
    "100|f",
  );
  assert.equal(
    psql(`set role service_role; set request.jwt.claim.role = 'service_role';
      select balance, reused_existing from public.grant_user_credits(
        '${sharedUser}', '${organizationB}', 200, 'workspace_grant',
        'test', 'grant-b', 'same-key-across-workspaces', '{}'::jsonb
      );`, "grant same idempotency key in workspace B"),
    "200|f",
  );
  assert.equal(
    psql(`set role service_role; set request.jwt.claim.role = 'service_role';
      select allowed, balance, reused_existing from public.consume_user_credits(
        '${sharedUser}', '${organizationA}', 50, 'workspace_spend',
        'test', 'spend-a', 'same-spend-key', '{}'::jsonb
      );`, "consume workspace A credits"),
    "t|50|f",
  );
  assert.equal(
    psql(`set role service_role; set request.jwt.claim.role = 'service_role';
      select allowed, balance, reused_existing from public.consume_user_credits(
        '${sharedUser}', '${organizationB}', 30, 'workspace_spend',
        'test', 'spend-b', 'same-spend-key', '{}'::jsonb
      );`, "consume independently scoped workspace B credits"),
    "t|170|f",
  );
  assert.equal(
    psql(`select organization_id, balance from public.organization_user_credits
      where user_id = '${sharedUser}' order by organization_id;`,
    "verify workspace-scoped balances"),
    `${organizationA}|50\n${organizationB}|170`,
  );
  psqlMustFail(reserveSql({
    idempotencyKey: "cross-campaign",
    attemptKey: "cross-campaign",
    token: token1,
    userId: sharedUser,
    organizationId: organizationA,
    campaignId: campaignB,
    amount: 10,
  }), /provider_usage_campaign_scope_mismatch/,
  "block cross-workspace campaign spend");

  assert.equal(
    psql(`set role authenticated;
      set request.jwt.claim.role = 'authenticated';
      set request.jwt.claim.sub = '${sharedUser}';
      select count(*) from public.commercial_activations;`,
    "current member can read workspace activation"),
    "1",
  );
  psql(`delete from public.organization_memberships
    where organization_id = '${organizationA}' and user_id = '${sharedUser}';`,
  "remove activation user from workspace A");
  assert.equal(
    psql(`set role authenticated;
      set request.jwt.claim.role = 'authenticated';
      set request.jwt.claim.sub = '${sharedUser}';
      select count(*) from public.commercial_activations;`,
    "removed member cannot retain payment-history access"),
    "0",
  );
  assert.equal(
    psql(`set role authenticated;
      set request.jwt.claim.role = 'authenticated';
      set request.jwt.claim.sub = '${sharedUser}';
      select count(*) from public.user_credit_ledger
      where organization_id = '${organizationA}';`,
    "removed member cannot retain workspace A credit-ledger access"),
    "0",
  );
  assert.equal(
    psql(`set role authenticated;
      set request.jwt.claim.role = 'authenticated';
      set request.jwt.claim.sub = '${sharedUser}';
      select count(*) from public.organization_user_credits
      where organization_id = '${organizationA}';`,
    "removed member cannot retain workspace A balance access"),
    "0",
  );
  assert.equal(
    psql(`set role authenticated;
      set request.jwt.claim.role = 'authenticated';
      set request.jwt.claim.sub = '${sharedUser}';
      select count(*) from public.organization_user_credits
      where organization_id = '${organizationB}';`,
    "current workspace B membership retains scoped balance access"),
    "1",
  );
  psqlMustFail(`set role authenticated;
    set request.jwt.claim.role = 'authenticated';
    set request.jwt.claim.sub = '${sharedUser}';
    select balance from public.user_credits where user_id = '${sharedUser}';`,
  /permission denied for table user_credits/,
  "hide frozen global legacy balance from authenticated callers");

  assert.equal(
    psql(`set role service_role; set request.jwt.claim.role = 'service_role';
      select applied, coalesce(ignored_reason, ''), latest_event_created
      from public.apply_billing_subscription_webhook(
        '${organizationA}', '${ownerA}', 'cus_a', 'sub_a', 'price_pro',
        'pro', 'active', now(), now() + interval '30 days', false,
        '{}'::jsonb, 'evt_100', 100
      );`, "atomically project active Pro subscription"),
    "t||100",
  );
  assert.equal(
    psql(`select subscription.plan_tier, subscription.status,
                 subscription.stripe_latest_event_id, organization_record.plan_tier
      from public.billing_subscriptions subscription
      join public.organizations organization_record
        on organization_record.id = subscription.organization_id
      where subscription.organization_id = '${organizationA}';`,
    "verify authoritative row and projection"),
    "pro|active|evt_100|pro",
  );

  psql(`create or replace function public.fail_growth_projection()
    returns trigger language plpgsql as $$
    begin
      if new.plan_tier = 'growth' then
        raise exception 'simulated_projection_failure';
      end if;
      return new;
    end;
    $$;
    create trigger fail_growth_projection
      before update on public.organizations
      for each row execute function public.fail_growth_projection();`,
  "install projection fault injection");
  psqlMustFail(`set role service_role; set request.jwt.claim.role = 'service_role';
    select * from public.apply_billing_subscription_webhook(
      '${organizationA}', '${ownerA}', 'cus_a', 'sub_a', 'price_growth',
      'growth', 'active', now(), now() + interval '30 days', false,
      '{}'::jsonb, 'evt_101', 101
    );`, /simulated_projection_failure/,
  "rollback authoritative billing write when projection fails");
  assert.equal(
    psql(`select subscription.plan_tier, subscription.stripe_latest_event_id,
                 organization_record.plan_tier
      from public.billing_subscriptions subscription
      join public.organizations organization_record
        on organization_record.id = subscription.organization_id
      where subscription.organization_id = '${organizationA}';`,
    "verify projection fault rolled back whole transaction"),
    "pro|evt_100|pro",
  );
  psql(`drop trigger fail_growth_projection on public.organizations;
    drop function public.fail_growth_projection();`, "remove projection fault injection");
  assert.equal(
    psql(`set role service_role; set request.jwt.claim.role = 'service_role';
      select applied, coalesce(ignored_reason, ''), latest_event_created
      from public.apply_billing_subscription_webhook(
        '${organizationA}', '${ownerA}', 'cus_a', 'sub_a', 'price_growth',
        'growth', 'active', now(), now() + interval '30 days', false,
        '{}'::jsonb, 'evt_101', 101
      );`, "replay event after atomic projection fault"),
    "t||101",
  );
  psql(`update public.organizations set plan_tier = 'starter'
    where id = '${organizationA}';`, "simulate historical projection drift");
  assert.equal(
    psql(`set role service_role; set request.jwt.claim.role = 'service_role';
      select applied, ignored_reason, latest_event_created
      from public.apply_billing_subscription_webhook(
        '${organizationA}', '${ownerA}', 'cus_a', 'sub_a', 'price_growth',
        'growth', 'active', now(), now() + interval '30 days', false,
        '{}'::jsonb, 'evt_101', 101
      );`, "repair projection on exact event replay"),
    "f|replay_projection_repaired|101",
  );
  assert.equal(
    psql(`select plan_tier from public.organizations where id = '${organizationA}';`,
    "verify exact replay repaired projection"),
    "growth",
  );

  const sessionCostSource = fs.readFileSync(
    path.join(root, "src/lib/services/session-cost-guard.ts"),
    "utf8",
  );
  const creditSource = fs.readFileSync(
    path.join(root, "src/lib/services/credit-service.ts"),
    "utf8",
  );
  const billingSource = fs.readFileSync(
    path.join(root, "src/lib/services/billing-service.ts"),
    "utf8",
  );
  const systemJobSource = fs.readFileSync(
    path.join(root, "src/lib/services/system-job-service.ts"),
    "utf8",
  );
  const videoJobSource = fs.readFileSync(
    path.join(root, "src/lib/services/video-generation-job.ts"),
    "utf8",
  );
  const imageProviderSource = fs.readFileSync(
    path.join(root, "src/lib/integrations/creative/image-provider.ts"),
    "utf8",
  );
  assert.match(sessionCostSource, /reserve_provider_usage_attempt_v2/);
  assert.match(sessionCostSource, /settle_provider_usage_attempt_v2/);
  assert.doesNotMatch(sessionCostSource, /\.from\("provider_usage_events"\)\s*\.update/);
  assert.doesNotMatch(sessionCostSource, /refundCreditsForProviderUsageEvent/);
  assert.match(creditSource, /\.from\("organization_user_credits"\)/);
  assert.doesNotMatch(creditSource, /generation_credit_refund:/);
  assert.match(
    systemJobSource,
    /providerUsageRunId: `\$\{processingJob\.id\}:static_creative_generation`/,
  );
  assert.match(
    systemJobSource,
    /providerUsageAttemptKey: `\$\{processingJob\.id\}:video_generation`/,
  );
  assert.doesNotMatch(
    systemJobSource,
    /providerUsage(?:RunId|AttemptKey):[^\n]*(?:lease\.generation|lease\.token)/,
  );
  assert.match(videoJobSource, /getHeyGenProviderUsageOutcome\(error\)/);
  assert.match(videoJobSource, /status: "consumed"[\s\S]{0,300}providerAccepted: true/);
  assert.match(imageProviderSource, /providerOutcome = response\.ok \? "ambiguous" : "rejected"/);
  const billingSync = billingSource.slice(
    billingSource.indexOf("export async function syncBillingSubscriptionFromStripe"),
    billingSource.indexOf("async function syncBillingSubscriptionFromEventObject"),
  );
  assert.match(billingSync, /apply_billing_subscription_webhook/);
  assert.doesNotMatch(billingSync, /\.from\("organizations"\)\s*\.update/);

  console.log(
    "PASS financial integrity disposable DB: atomic provider debit/settlement, stale-writer fencing, label-independent one-time compensation, terminal replay blocking, workspace/user credit scope, removed-member payment privacy, and atomic/replay-repairable Stripe plan projection",
  );
} finally {
  cleanup();
}
