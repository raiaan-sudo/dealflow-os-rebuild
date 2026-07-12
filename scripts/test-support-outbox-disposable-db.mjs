#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createDisposablePostgresHarness } from "./lib/disposable-postgres-harness.mjs";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "supabase/migrations/20260710235000_create_launch_receipts_optimizer_support.sql",
);
const preflightPath = path.join(
  root,
  "docs/dealflow-completion/evidence/migration/read-only-preflight.sql",
);
const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const containerName = `dealflow-support-disposable-${process.pid}-${randomBytes(4).toString("hex")}`;
const disposablePostgres = createDisposablePostgresHarness({ containerName, image });
const password = randomBytes(24).toString("hex");
const userId = "00000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000001";
const campaignId = "20000000-0000-4000-8000-000000000001";
const expiredProcessingOutboxId = "30000000-0000-4000-8000-000000000001";
const dueRetryingOutboxId = "30000000-0000-4000-8000-000000000002";
const duePendingOutboxId = "30000000-0000-4000-8000-000000000003";
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
    const initProcess = docker(
      ["exec", containerName, "cat", "/proc/1/comm"],
      { timeout: 5_000 },
    );
    const health = docker(
      ["inspect", "--format={{.State.Health.Status}}", containerName],
      { timeout: 5_000 },
    );
    const ready = docker(
      [
        "exec",
        containerName,
        "pg_isready",
        "--username=supabase_admin",
        "--dbname=postgres",
      ],
      { timeout: 5_000 },
    );
    if (
      initProcess.status === 0 &&
      initProcess.stdout.trim().toLowerCase().includes("postgres") &&
      health.status === 0 &&
      health.stdout.trim() === "healthy" &&
      ready.status === 0
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Disposable PostgreSQL did not become ready within 30 seconds.");
}

try {
  assert.ok(fs.existsSync(migrationPath), "Support migration is missing");
  assert.ok(fs.existsSync(preflightPath), "Read-only pre-application migration check is missing");
  requireSuccess(
    docker(["image", "inspect", image], { timeout: 15_000 }),
    "Cached Supabase PostgreSQL image is unavailable",
  );
  requireSuccess(
    docker(
      [
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
      ],
      { timeout: 30_000 },
    ),
    "Disposable PostgreSQL container failed to start",
  );
  await waitForPostgres();

  psql(`
    create extension if not exists pgcrypto;
    create schema if not exists private;

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

    create table public.organizations (
      id uuid primary key
    );

    create table public.organization_memberships (
      organization_id uuid not null references public.organizations(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      primary key (organization_id, user_id)
    );

    create table public.campaign_plans (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      plan jsonb not null default '{"runtime":{}}'::jsonb,
      launch_status text null,
      updated_at timestamptz not null default timezone('utc', now())
    );
    create unique index campaign_plans_id_organization_unique
      on public.campaign_plans(id, organization_id);

    create table public.leads (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      campaign_id uuid null references public.campaign_plans(id)
    );

    create table public.system_jobs (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      campaign_id uuid null references public.campaign_plans(id)
    );

    create table public.user_credit_ledger (
      id uuid primary key
    );

    create table public.campaign_tracking_contracts (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id),
      campaign_id uuid not null references public.campaign_plans(id),
      user_id uuid null references auth.users(id),
      tracking_mode text not null,
      expected_lead_destination text not null,
      meta_campaign_id text null,
      meta_adset_id text null,
      meta_ad_ids text[] not null default '{}'::text[],
      pixel_id text null,
      launch_domain text null,
      launch_url text null,
      expected_event_name text not null default 'Lead',
      expected_action_source text not null default 'website',
      expected_attribution_params text[] not null default '{}'::text[],
      status text not null default 'needs_review',
      readiness jsonb not null default '{}'::jsonb,
      metadata jsonb not null default '{}'::jsonb,
      last_verified_at timestamptz null,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now()),
      unique (campaign_id)
    );

    create table public.lead_tracking_events (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id),
      campaign_id uuid null references public.campaign_plans(id),
      event_type text not null,
      status text not null,
      source text not null,
      event_id text null,
      pixel_id text null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default timezone('utc', now())
    );

    create table public.app_schema_metadata (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default timezone('utc', now())
    );

    create or replace function private.is_current_user_org_member(p_organization_id uuid)
    returns boolean
    language sql
    stable
    security definer
    set search_path = ''
    as $$
      select exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = p_organization_id
          and membership.user_id = auth.uid()
      )
    $$;
  `, "Synthetic prerequisite schema failed");

  assert.equal(
    psql(
      fs.readFileSync(preflightPath, "utf8"),
      "Pre-application read-only migration check failed against legacy schema",
    ),
    ["t|t|t|t|t|t", "0", "0", "0", "0", "0"].join("\n"),
    "Pre-application check did not return only foundational booleans and zero counts",
  );

  psql(
    fs.readFileSync(migrationPath, "utf8"),
    "Support migration failed against the disposable database",
  );

  psql(`
    insert into auth.users(id) values ('${userId}');
    insert into public.organizations(id) values ('${organizationId}');
    insert into public.organization_memberships(organization_id, user_id)
    values ('${organizationId}', '${userId}');
    insert into public.campaign_plans(id, organization_id, user_id)
    values ('${campaignId}', '${organizationId}', '${userId}');

    insert into public.support_tickets (
      id,
      organization_id,
      user_id,
      request_id,
      category,
      subject,
      message,
      route_path
    ) values
      (
        '40000000-0000-4000-8000-000000000001',
        '${organizationId}',
        '${userId}',
        '50000000-0000-4000-8000-000000000001',
        'product_blocker',
        'Expired processing notification',
        'Disposable database fixture',
        '/support'
      ),
      (
        '40000000-0000-4000-8000-000000000002',
        '${organizationId}',
        '${userId}',
        '50000000-0000-4000-8000-000000000002',
        'product_blocker',
        'Due retrying notification',
        'Disposable database fixture',
        '/support'
      ),
      (
        '40000000-0000-4000-8000-000000000003',
        '${organizationId}',
        '${userId}',
        '50000000-0000-4000-8000-000000000003',
        'product_feedback',
        'Due pending notification',
        'Disposable database fixture',
        '/support'
      );

    insert into public.support_notification_outbox (
      id,
      ticket_id,
      status,
      idempotency_key,
      attempt_count,
      max_attempts,
      next_attempt_at,
      locked_at,
      locked_by,
      last_error_code
    ) values
      (
        '${expiredProcessingOutboxId}',
        '40000000-0000-4000-8000-000000000001',
        'processing',
        'support-expired-processing',
        2,
        2,
        now() - interval '10 minutes',
        now() - interval '10 minutes',
        'crashed-worker',
        'previous_transient_error'
      ),
      (
        '${dueRetryingOutboxId}',
        '40000000-0000-4000-8000-000000000002',
        'retrying',
        'support-due-retrying',
        3,
        3,
        now() - interval '1 minute',
        null,
        null,
        'previous_transient_error'
      ),
      (
        '${duePendingOutboxId}',
        '40000000-0000-4000-8000-000000000003',
        'pending',
        'support-due-pending',
        0,
        5,
        now() - interval '1 minute',
        null,
        null,
        null
      );
  `, "Synthetic support outbox fixtures failed");

  assert.equal(
    psql(`
      select id, status, attempt_count, locked_by
      from public.claim_support_notification_outbox('support-worker', 10);
    `, "Support claim and max-attempt sweep failed"),
    `${duePendingOutboxId}|processing|1|support-worker`,
    "Support claim returned an exhausted row or failed to claim the due row",
  );

  assert.equal(
    psql(`
      select string_agg(
        concat_ws(
          ':',
          id::text,
          status,
          attempt_count::text,
          last_error_code,
          (locked_at is null)::text,
          (locked_by is null)::text
        ),
        ',' order by id
      )
      from public.support_notification_outbox
      where id in ('${expiredProcessingOutboxId}', '${dueRetryingOutboxId}');
    `, "Support max-attempt terminal truth verification failed"),
    `${expiredProcessingOutboxId}:operator_action_required:2:support_outbox_attempts_exhausted:true:true,${dueRetryingOutboxId}:operator_action_required:3:support_outbox_attempts_exhausted:true:true`,
    "Expired max-attempt support rows were not atomically terminalized",
  );

  assert.equal(
    psql(`
      select count(*)
      from public.claim_support_notification_outbox('support-worker-after-sweep', 10);
    `, "Post-sweep support claim failed"),
    "0",
    "Terminal or still-leased support work was claimed again",
  );

  console.log(
    "Support outbox disposable database regression passed: due work claimed and expired max-attempt work atomically terminalized for operator action.",
  );
} catch (error) {
  console.error(`Support outbox disposable database regression failed: ${sanitize(error?.message ?? error)}`);
  process.exitCode = 1;
} finally {
  cleanup();
}
