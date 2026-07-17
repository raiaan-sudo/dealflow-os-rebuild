#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createDisposablePostgresHarness } from "./lib/disposable-postgres-harness.mjs";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const migrationPath = path.join(
  root,
  "supabase/migrations/20260710235950_gate_campaign_creation_entitlement.sql",
);
const tenantAuthorityMigrationPath = path.join(
  root,
  "supabase/migrations/20260710235960_harden_campaign_tenant_authority.sql",
);
const paidActivationMigrationPath = path.join(
  root,
  "supabase/migrations/20260713021000_require_paid_activation_for_campaign_creation.sql",
);
const containerName = `dealflow-campaign-entitlement-${process.pid}-${randomBytes(4).toString("hex")}`;
const disposablePostgres = createDisposablePostgresHarness({ containerName, image });
const password = randomBytes(24).toString("hex");
let cleaned = false;

const userUnknown = "10000000-0000-4000-8000-000000000001";
const userRace = "10000000-0000-4000-8000-000000000002";
const userPaid = "10000000-0000-4000-8000-000000000003";
const userStarter = "10000000-0000-4000-8000-000000000004";
const userOther = "10000000-0000-4000-8000-000000000005";
const orgUnknown = "20000000-0000-4000-8000-000000000001";
const orgRace = "20000000-0000-4000-8000-000000000002";
const orgPaid = "20000000-0000-4000-8000-000000000003";
const orgStarter = "20000000-0000-4000-8000-000000000004";
const orgOther = "20000000-0000-4000-8000-000000000005";

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

function psqlRaw(sql) {
  return docker(psqlArgs(), { input: sql });
}

function psql(sql, label) {
  return requireSuccess(psqlRaw(sql), label);
}

function psqlMustFail(sql, pattern, label) {
  const result = psqlRaw(sql);
  if (result.error) throw result.error;
  assert.notEqual(result.status, 0, `${label}: SQL unexpectedly succeeded`);
  const diagnostic = sanitize(result.stderr || result.stdout);
  assert.match(diagnostic, pattern, `${label}: unexpected database rejection: ${diagnostic}`);
}

function psqlAsync(sql) {
  return disposablePostgres.psqlAsync(psqlArgs(), sql);
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
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Disposable PostgreSQL did not become ready within 30 seconds.");
}

function createSql({ campaignId, organizationId, userId, marker }) {
  return `
    set role service_role;
    select id, organization_id, user_id, plan->>'marker'
    from public.create_campaign_plan_with_entitlement_v1(
      '${campaignId}',
      '${organizationId}',
      '${userId}',
      '{"marker":"${marker}"}'::jsonb,
      'preview',
      false,
      null
    );
  `;
}

try {
  assert.ok(fs.existsSync(migrationPath), `Required migration is missing: ${migrationPath}`);
  assert.ok(
    fs.existsSync(tenantAuthorityMigrationPath),
    `Required migration is missing: ${tenantAuthorityMigrationPath}`,
  );
  assert.ok(
    fs.existsSync(paidActivationMigrationPath),
    `Required migration is missing: ${paidActivationMigrationPath}`,
  );
  const campaignPersistenceSource = fs.readFileSync(
    path.join(root, "src/lib/services/campaign-persistence.ts"),
    "utf8",
  );
  const planPersistenceSource = fs.readFileSync(
    path.join(root, "src/lib/services/campaign-plan-persistence-service.ts"),
    "utf8",
  );
  const onboardingRouteSource = fs.readFileSync(
    path.join(root, "src/app/api/onboarding/plan/route.ts"),
    "utf8",
  );
  const creationServiceSource = fs.readFileSync(
    path.join(root, "src/lib/services/campaign-creation-entitlement-service.ts"),
    "utf8",
  );
  const paidActivationMigrationSource = fs.readFileSync(paidActivationMigrationPath, "utf8");
  const billingStatusRouteSource = fs.readFileSync(
    path.join(root, "src/app/api/billing/status/route.ts"),
    "utf8",
  );
  assert.match(campaignPersistenceSource, /createCampaignPlanWithEntitlement\(/);
  assert.match(campaignPersistenceSource, /\.eq\("organization_id", organizationId\)/);
  assert.doesNotMatch(campaignPersistenceSource, /\.or\(`user_id\.eq\./);
  assert.match(planPersistenceSource, /createCampaignPlanWithEntitlement\(/);
  assert.match(onboardingRouteSource, /submit_onboarding_draft_v2/);
  assert.match(onboardingRouteSource, /p_campaign_id:\s*deterministicCampaignId/);
  assert.doesNotMatch(onboardingRouteSource, /createOnly:\s*true/);
  assert.match(creationServiceSource, /create_campaign_plan_with_entitlement_v1/);
  assert.match(paidActivationMigrationSource, /commercial_activations/);
  assert.match(paidActivationMigrationSource, /legacy_commercial_activation_reconciled/);
  assert.match(billingStatusRouteSource, /billing\.commerciallyActivated/);
  assert.doesNotMatch(
    `${campaignPersistenceSource}\n${planPersistenceSource}`,
    /\.from\("campaign_plans"\)[\s\S]{0,180}\.insert\(/,
    "An application campaign creation path still bypasses the atomic entitlement RPC",
  );
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
    "Disposable network-disabled PostgreSQL container failed to start",
  );
  await waitForPostgres();

  psql(`
    create extension if not exists pgcrypto;

    create schema if not exists auth;
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

    grant usage on schema public to anon, authenticated, service_role;

    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create table public.organizations (
      id uuid primary key,
      owner_user_id uuid not null
    );

    create table public.organization_memberships (
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null,
      primary key (organization_id, user_id)
    );

    create table public.billing_subscriptions (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id),
      plan_tier text not null default 'starter',
      status text not null default 'inactive',
      current_period_end timestamptz null,
      cancel_at_period_end boolean not null default false,
      metadata jsonb not null default '{}'::jsonb,
      constraint billing_subscriptions_organization_unique unique (organization_id)
    );

    create table public.commercial_activations (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null,
      amount_paid_cents integer not null,
      constraint commercial_activations_organization_unique unique (organization_id),
      constraint commercial_activations_amount_positive check (amount_paid_cents > 0)
    );

    create table public.campaign_plans (
      id uuid primary key default gen_random_uuid(),
      owner_id text not null,
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null,
      plan jsonb not null default '{}'::jsonb,
      launch_status text null,
      lead_loop_verified boolean not null default false,
      public_slug text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table public.app_schema_metadata (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default timezone('utc', now())
    );

    create or replace function private.is_current_user_org_member(target_organization_id uuid)
    returns boolean
    language sql
    stable
    security definer
    set search_path = ''
    as $$
      select exists (
        select 1
        from public.organizations organization_record
        where organization_record.id = target_organization_id
          and organization_record.owner_user_id = auth.uid()
      ) or exists (
        select 1
        from public.organization_memberships membership_record
        where membership_record.organization_id = target_organization_id
          and membership_record.user_id = auth.uid()
      )
    $$;

    alter table public.campaign_plans enable row level security;
    alter table public.campaign_plans force row level security;

    grant select, insert, update, delete on public.campaign_plans to authenticated, service_role;
    grant select on public.organizations, public.organization_memberships,
      public.billing_subscriptions to service_role;

    insert into public.organizations (id, owner_user_id) values
      ('${orgUnknown}', '${userUnknown}'),
      ('${orgRace}', '${userRace}'),
      ('${orgPaid}', '${userPaid}'),
      ('${orgStarter}', '${userStarter}'),
      ('${orgOther}', '${userOther}');

    insert into public.billing_subscriptions (
      organization_id, plan_tier, status, current_period_end, cancel_at_period_end, metadata
    ) values
      ('${orgPaid}', 'pro', 'active', now() + interval '30 days', false, '{}'::jsonb),
      ('${orgStarter}', 'starter', 'active', now() + interval '30 days', false, '{}'::jsonb),
      ('${orgOther}', 'growth', 'active', now() + interval '30 days', false,
        '{"legacy_commercial_activation_reconciled":true}'::jsonb);
  `, "Synthetic prerequisite schema failed");

  psql(
    fs.readFileSync(migrationPath, "utf8"),
    `Candidate migration failed: ${path.basename(migrationPath)}`,
  );
  psql(
    fs.readFileSync(tenantAuthorityMigrationPath, "utf8"),
    `Candidate migration failed: ${path.basename(tenantAuthorityMigrationPath)}`,
  );
  psql(
    fs.readFileSync(paidActivationMigrationPath, "utf8"),
    `Candidate migration failed: ${path.basename(paidActivationMigrationPath)}`,
  );

  assert.equal(
    psql(`
      select
        has_function_privilege(
          'authenticated',
          'public.create_campaign_plan_with_entitlement_v1(uuid,uuid,uuid,jsonb,text,boolean,text)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.create_campaign_plan_with_entitlement_v1(uuid,uuid,uuid,jsonb,text,boolean,text)',
          'EXECUTE'
        ),
        has_table_privilege('service_role', 'public.campaign_plans', 'INSERT'),
        has_table_privilege('authenticated', 'public.campaign_plans', 'UPDATE');
    `, "Read campaign creation privileges"),
    "f|t|f|f",
    "Campaign creation privileges do not fail direct or browser writers closed",
  );

  const unknownCampaignA = "30000000-0000-4000-8000-000000000001";
  const unknownCampaignB = "30000000-0000-4000-8000-000000000002";
  assert.equal(
    psql(createSql({
      campaignId: unknownCampaignA,
      organizationId: orgUnknown,
      userId: userUnknown,
      marker: "unknown-first",
    }), "Unknown-billing first preview failed"),
    `${unknownCampaignA}|${orgUnknown}|${userUnknown}|unknown-first`,
  );

  assert.equal(
    psql(createSql({
      campaignId: unknownCampaignA,
      organizationId: orgUnknown,
      userId: userUnknown,
      marker: "must-not-overwrite",
    }), "Exact campaign identity replay failed"),
    `${unknownCampaignA}|${orgUnknown}|${userUnknown}|unknown-first`,
    "Idempotent replay overwrote the original campaign",
  );

  psqlMustFail(
    createSql({
      campaignId: unknownCampaignB,
      organizationId: orgUnknown,
      userId: userUnknown,
      marker: "unknown-second",
    }),
    /campaign_preview_limit_reached/i,
    "Unknown billing must fail closed after one preview",
  );

  psqlMustFail(
    `set role service_role;
     insert into public.campaign_plans (owner_id, organization_id, user_id, plan)
     values ('${orgUnknown}', '${orgUnknown}', '${userUnknown}', '{}'::jsonb);`,
    /permission denied for table campaign_plans/i,
    "Service role must not bypass the entitlement RPC with direct INSERT",
  );

  psqlMustFail(
    `set role service_role;
     update public.campaign_plans
     set organization_id = '${orgOther}', owner_id = '${orgOther}'
     where id = '${unknownCampaignA}';`,
    /campaign_plan_tenant_identity_immutable/i,
    "Campaign tenant identity must not shuttle between organizations",
  );

  psqlMustFail(
    `set request.jwt.claim.sub = '${userUnknown}';
     set role authenticated;
     update public.campaign_plans
     set plan = '{"marker":"browser-update"}'::jsonb
     where id = '${unknownCampaignA}';`,
    /permission denied for table campaign_plans/i,
    "Authenticated clients must not update campaign rows directly",
  );

  const raceA = createSql({
    campaignId: "30000000-0000-4000-8000-000000000011",
    organizationId: orgRace,
    userId: userRace,
    marker: "race-a",
  });
  const raceB = createSql({
    campaignId: "30000000-0000-4000-8000-000000000012",
    organizationId: orgRace,
    userId: userRace,
    marker: "race-b",
  });
  const raceResults = await Promise.all([psqlAsync(raceA), psqlAsync(raceB)]);
  assert.equal(
    raceResults.filter((result) => result.status === 0).length,
    1,
    `Concurrent unpaid creation did not produce exactly one winner: ${raceResults.map((result) => sanitize(result.stderr || result.stdout)).join(" | ")}`,
  );
  assert.match(
    sanitize(raceResults.find((result) => result.status !== 0)?.stderr),
    /campaign_preview_limit_reached/i,
    "Concurrent loser did not fail on the entitlement limit",
  );
  assert.equal(
    psql(`select count(*) from public.campaign_plans where organization_id = '${orgRace}';`, "Read race campaign count"),
    "1",
    "Concurrent unpaid requests created more than one campaign",
  );

  const paidCampaignOne = "30000000-0000-4000-8000-000000000021";
  psql(createSql({
    campaignId: paidCampaignOne,
    organizationId: orgPaid,
    userId: userPaid,
    marker: "paid-one",
  }), "Active Pro first preview failed before commercial activation");
  psqlMustFail(
    createSql({
      campaignId: "30000000-0000-4000-8000-000000000022",
      organizationId: orgPaid,
      userId: userPaid,
      marker: "active-without-payment",
    }),
    /campaign_preview_limit_reached/i,
    "Active Pro without durable commercial activation must remain preview-limited",
  );
  assert.equal(
    psql(createSql({
      campaignId: paidCampaignOne,
      organizationId: orgPaid,
      userId: userPaid,
      marker: "must-not-overwrite-before-payment",
    }), "Exact replay before commercial activation failed"),
    `${paidCampaignOne}|${orgPaid}|${userPaid}|paid-one`,
    "Exact replay must remain allowed while new creation is payment-blocked",
  );
  psql(`insert into public.commercial_activations (
      organization_id, user_id, amount_paid_cents
    ) values ('${orgPaid}', '${userPaid}', 29700);`, "Record qualifying paid activation");
  for (const [suffix, marker] of [["22", "paid-two"], ["26", "paid-three"]]) {
    psql(createSql({
      campaignId: `30000000-0000-4000-8000-0000000000${suffix}`,
      organizationId: orgPaid,
      userId: userPaid,
      marker,
    }), `Commercially activated campaign ${marker} failed`);
  }
  assert.equal(
    psql(`select count(*) from public.campaign_plans where organization_id = '${orgPaid}';`, "Read paid campaign count"),
    "3",
    "Commercially activated active Pro workspace did not receive unlimited creation",
  );

  for (const [status, suffix] of [
    ["unpaid", "23"],
    ["paused", "24"],
    ["incomplete_expired", "25"],
  ]) {
    psql(`
      update public.billing_subscriptions
      set status = '${status}',
          cancel_at_period_end = true,
          current_period_end = now() + interval '30 days'
      where organization_id = '${orgPaid}';
    `, `Set hostile billing status ${status}`);
    psqlMustFail(
      createSql({
        campaignId: `30000000-0000-4000-8000-0000000000${suffix}`,
        organizationId: orgPaid,
        userId: userPaid,
        marker: `hostile-${status}`,
      }),
      /campaign_preview_limit_reached/i,
      `${status} must not grant unlimited campaign creation even with a future period`,
    );
  }

  psql(`
    update public.billing_subscriptions
    set status = 'active',
        cancel_at_period_end = true,
        current_period_end = now() - interval '1 second'
    where organization_id = '${orgPaid}';
  `, "Set expired active cancellation boundary");
  psqlMustFail(
    createSql({
      campaignId: "30000000-0000-4000-8000-000000000027",
      organizationId: orgPaid,
      userId: userPaid,
      marker: "expired-active-cancellation",
    }),
    /campaign_preview_limit_reached/i,
    "Expired cancel-at-period-end billing must not grant unlimited campaign creation",
  );

  psql(`insert into public.commercial_activations (
      organization_id, user_id, amount_paid_cents
    ) values ('${orgStarter}', '${userStarter}', 9700);`, "Record paid legacy Starter activation");
  psql(createSql({
    campaignId: "30000000-0000-4000-8000-000000000031",
    organizationId: orgStarter,
    userId: userStarter,
    marker: "starter-one",
  }), "Paid Starter first campaign failed");
  psqlMustFail(
    createSql({
      campaignId: "30000000-0000-4000-8000-000000000032",
      organizationId: orgStarter,
      userId: userStarter,
      marker: "starter-two",
    }),
    /campaign_preview_limit_reached/i,
    "Active but ineligible Starter plan must remain limited",
  );

  psqlMustFail(
    createSql({
      campaignId: "30000000-0000-4000-8000-000000000041",
      organizationId: orgOther,
      userId: userUnknown,
      marker: "cross-org",
    }),
    /campaign_creation_actor_not_member/i,
    "Non-member user must not create in another paid organization",
  );

  psql(createSql({
    campaignId: "30000000-0000-4000-8000-000000000042",
    organizationId: orgOther,
    userId: userOther,
    marker: "other-owner",
  }), "Other organization owner creation failed");

  const revokedMemberCampaign = "30000000-0000-4000-8000-000000000043";
  psql(`insert into public.organization_memberships (organization_id, user_id)
    values ('${orgOther}', '${userUnknown}');`, "Add disposable organization member");
  psql(createSql({
    campaignId: revokedMemberCampaign,
    organizationId: orgOther,
    userId: userUnknown,
    marker: "member-before-revocation",
  }), "Current member campaign creation failed");
  assert.equal(
    psql(`set request.jwt.claim.sub = '${userUnknown}'; set role authenticated;
      select count(*) from public.campaign_plans where id = '${revokedMemberCampaign}';`, "Current member campaign visibility"),
    "1",
  );
  psql(`delete from public.organization_memberships
    where organization_id = '${orgOther}' and user_id = '${userUnknown}';`, "Revoke disposable organization member");
  assert.equal(
    psql(`set request.jwt.claim.sub = '${userUnknown}'; set role authenticated;
      select count(*) from public.campaign_plans where id = '${revokedMemberCampaign}';`, "Revoked member campaign visibility"),
    "0",
  );
  psqlMustFail(
    createSql({
      campaignId: revokedMemberCampaign,
      organizationId: orgOther,
      userId: userUnknown,
      marker: "revoked-replay",
    }),
    /campaign_creation_actor_not_member/i,
    "Revoked member must not replay an existing campaign identity",
  );
  psqlMustFail(
    createSql({
      campaignId: unknownCampaignA,
      organizationId: orgOther,
      userId: userOther,
      marker: "identity-collision",
    }),
    /campaign_creation_identity_collision/i,
    "Cross-tenant campaign identity collision must fail closed",
  );

  console.log(
    "Campaign entitlement atomicity disposable PostgreSQL tests passed (network disabled).",
  );
} finally {
  cleanup();
}
