#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createDisposablePostgresHarness } from "./lib/disposable-postgres-harness.mjs";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPaths = [
  path.join(
    root,
    "supabase/migrations/20260710235000_create_launch_receipts_optimizer_support.sql",
  ),
  path.join(
    root,
    "supabase/migrations/20260710235500_schedule_launch_claim_fencing.sql",
  ),
  path.join(
    root,
    "supabase/migrations/20260710235800_harden_meta_oauth_state.sql",
  ),
];
const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const containerName = `dealflow-scheduler-disposable-${process.pid}-${randomBytes(4).toString("hex")}`;
const disposablePostgres = createDisposablePostgresHarness({ containerName, image });
const password = randomBytes(24).toString("hex");
const ownerId = "00000000-0000-4000-8000-000000000001";
const collaboratorId = "00000000-0000-4000-8000-000000000002";
const organizationId = "10000000-0000-4000-8000-000000000001";
const otherOrganizationId = "10000000-0000-4000-8000-000000000002";
const campaignId = "20000000-0000-4000-8000-000000000001";
const manualCampaignId = "20000000-0000-4000-8000-000000000002";
const scheduledCompletionCampaignId = "20000000-0000-4000-8000-000000000003";
const scheduledReleaseCampaignId = "20000000-0000-4000-8000-000000000004";
const manualFailureCampaignId = "20000000-0000-4000-8000-000000000005";
const lineageMismatchCampaignId = "20000000-0000-4000-8000-000000000006";
const ambiguousScheduledCampaignId = "20000000-0000-4000-8000-000000000007";
const receiptFailureCampaignId = "20000000-0000-4000-8000-000000000008";
const explicitRejectionCampaignId = "20000000-0000-4000-8000-000000000009";
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

function psqlRaw(sql) {
  return docker(psqlArgs(), { input: sql });
}

function psql(sql, label) {
  return requireSuccess(psqlRaw(sql), label);
}

function psqlMustFail(sql, pattern, label) {
  const result = psqlRaw(sql);
  if (result.error) {
    throw new Error(`${label}: ${sanitize(result.error.message)}`);
  }
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

function parseClaim(output, label) {
  const lines = String(output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  assert.equal(lines.length, 1, `${label}: expected exactly one claim row`);
  const [id, userId, attemptCount, workerId, leaseToken, leaseGeneration] =
    lines[0].split("|");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.match(id, uuid, `${label}: invalid launch id`);
  assert.match(userId, uuid, `${label}: invalid user id`);
  assert.match(leaseToken, uuid, `${label}: invalid lease token`);
  assert.match(attemptCount, /^\d+$/, `${label}: invalid attempt count`);
  assert.match(leaseGeneration, /^\d+$/, `${label}: invalid lease generation`);
  assert.ok(workerId, `${label}: missing worker id`);
  return {
    id,
    userId,
    attemptCount: Number(attemptCount),
    workerId,
    leaseToken,
    leaseGeneration: Number(leaseGeneration),
  };
}

function buildLaunchInputSnapshot(variant) {
  const destinationUrl = variant.destinationUrl ?? "https://proof.example/f/campaign";
  return {
    schema_version: 1,
    organization_id: variant.organizationId ?? organizationId,
    campaign_id: variant.campaignId,
    attempt_id: variant.attemptId ?? `attempt-${variant.campaignId}`,
    provider: {
      ad_account_id: variant.adAccountId,
      page_id: variant.pageId ?? "page-proof",
      pixel_id: variant.pixelId ?? "pixel-proof",
    },
    destination_url: destinationUrl,
    destination_host: new URL(destinationUrl).hostname,
  };
}

function calculateLaunchInputDigest(variant) {
  return createHash("sha256")
    .update(JSON.stringify(buildLaunchInputSnapshot(variant)))
    .digest("hex");
}

function bindLaunchInput(claim, variant, label) {
  const snapshot = buildLaunchInputSnapshot(variant);
  const serialized = JSON.stringify(snapshot);
  const digest = calculateLaunchInputDigest(variant);
  return psql(`
    set request.jwt.claim.role = 'service_role';
    select public.bind_campaign_launch_input_snapshot(
      '${claim.id}',
      '${claim.workerId}',
      '${claim.leaseToken}',
      ${claim.leaseGeneration},
      '${serialized}'::jsonb,
      '${digest}'
    );
  `, label);
}

const nextEasternWindowSql = `
  (
    case
      when now() at time zone 'America/New_York'
        <= date_trunc('day', now() at time zone 'America/New_York') + interval '9 hours'
      then date_trunc('day', now() at time zone 'America/New_York') + interval '9 hours'
      else date_trunc('day', now() at time zone 'America/New_York') + interval '1 day 9 hours'
    end
  ) at time zone 'America/New_York'
`;

try {
  for (const migrationPath of migrationPaths) {
    assert.ok(fs.existsSync(migrationPath), `Required migration is missing: ${migrationPath}`);
  }
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
      id uuid primary key,
      owner_user_id uuid null references auth.users(id)
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

    create table public.marketing_accounts (
      id uuid primary key default gen_random_uuid()
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

  for (const migrationPath of migrationPaths) {
    psql(
      fs.readFileSync(migrationPath, "utf8"),
      `Candidate migration failed: ${path.basename(migrationPath)}`,
    );
  }

  psql(`
    insert into auth.users(id) values ('${ownerId}'), ('${collaboratorId}');
    insert into public.organizations(id) values ('${organizationId}'), ('${otherOrganizationId}');
    insert into public.organization_memberships(organization_id, user_id)
    values ('${organizationId}', '${ownerId}'), ('${organizationId}', '${collaboratorId}');
    insert into public.campaign_plans(id, organization_id, user_id)
    values
      ('${campaignId}', '${organizationId}', '${ownerId}'),
      ('${manualCampaignId}', '${organizationId}', '${ownerId}'),
      ('${scheduledCompletionCampaignId}', '${organizationId}', '${ownerId}'),
      ('${scheduledReleaseCampaignId}', '${organizationId}', '${ownerId}'),
      ('${manualFailureCampaignId}', '${organizationId}', '${ownerId}'),
      ('${lineageMismatchCampaignId}', '${organizationId}', '${ownerId}'),
      ('${ambiguousScheduledCampaignId}', '${organizationId}', '${ownerId}'),
      ('${receiptFailureCampaignId}', '${organizationId}', '${ownerId}'),
      ('${explicitRejectionCampaignId}', '${organizationId}', '${ownerId}');
  `, "Synthetic scheduler fixtures failed");

  const scheduleSql = `
    set request.jwt.claim.sub = '${collaboratorId}';
    set request.jwt.claim.role = 'authenticated';
    set role authenticated;
    select (public.schedule_campaign_launch_intent(
      '${organizationId}',
      '${campaignId}',
      '${ownerId}',
      'Disposable collaborator schedule',
      ${nextEasternWindowSql},
      'America/New_York'
    )).id;
    reset role;
  `;
  const firstScheduleId = psql(scheduleSql, "First collaborator schedule failed");
  const replayedScheduleId = psql(scheduleSql, "Idempotent collaborator schedule replay failed");
  assert.equal(replayedScheduleId, firstScheduleId, "Schedule replay created a second record");
  assert.match(firstScheduleId, /^[0-9a-f-]{36}$/i, "Schedule RPC did not return an id");

  assert.equal(
    psql(`
      select count(*), user_id, result_status, meta_campaign_id is null
      from public.campaign_launch_records
      group by user_id, result_status, meta_campaign_id;
    `, "Read scheduled launch truth"),
    `1|${ownerId}|scheduled|t`,
    "Collaborator schedule was not idempotent or did not retain the campaign owner",
  );

  assert.equal(
    psql(`
      select
        has_table_privilege('authenticated', 'public.campaign_launch_records', 'INSERT'),
        has_table_privilege('authenticated', 'public.campaign_launch_records', 'UPDATE'),
        has_table_privilege('authenticated', 'public.campaign_launch_records', 'DELETE'),
        has_table_privilege('authenticated', 'public.campaign_launch_records', 'TRUNCATE'),
        has_table_privilege('authenticated', 'public.campaign_launch_records', 'TRIGGER');
    `, "Read authenticated launch-record privileges"),
    "f|f|f|f|f",
    "Authenticated launch-record mutation privileges remain",
  );
  psqlMustFail(
    `set role authenticated; truncate table public.campaign_launch_records;`,
    /permission denied for table campaign_launch_records/i,
    "Authenticated TRUNCATE must be denied",
  );
  assert.equal(
    psql(`
      select
        has_table_privilege('service_role', 'public.campaign_launch_records', 'INSERT'),
        has_table_privilege('service_role', 'public.campaign_launch_records', 'UPDATE'),
        has_table_privilege('service_role', 'public.campaign_launch_records', 'DELETE'),
        has_table_privilege('service_role', 'public.campaign_launch_records', 'TRUNCATE'),
        has_table_privilege('service_role', 'public.campaign_launch_provider_receipts', 'INSERT'),
        has_table_privilege('service_role', 'public.campaign_launch_provider_receipts', 'UPDATE'),
        has_table_privilege('service_role', 'public.campaign_launch_provider_receipts', 'DELETE'),
        has_table_privilege('service_role', 'public.campaign_launch_provider_receipts', 'TRUNCATE');
    `, "Read service-role launch-evidence privileges"),
    "f|f|f|f|f|f|f|f",
    "Service role retained direct launch or provider-receipt mutation privileges",
  );
  psqlMustFail(
    `
      set request.jwt.claim.role = 'service_role';
      set role service_role;
      update public.campaign_launch_records set result_status = 'success'
      where id = '${firstScheduleId}';
    `,
    /permission denied for table campaign_launch_records/i,
    "Service-role direct launch-record UPDATE must be denied",
  );
  psqlMustFail(
    `
      set request.jwt.claim.role = 'service_role';
      set role service_role;
      truncate table public.campaign_launch_provider_receipts;
    `,
    /permission denied for table campaign_launch_provider_receipts/i,
    "Service-role provider-receipt TRUNCATE must be denied",
  );
  const legacyLaunchId = psql(`
    set request.jwt.claim.role = 'service_role';
    set role service_role;
    select (public.record_legacy_campaign_launch(
      '${organizationId}',
      '${ownerId}',
      'legacy-disposable-proof',
      'Legacy disposable proof',
      'Disposable account',
      'legacy_provider_paused',
      'success',
      null,
      'legacy-meta-campaign',
      '["legacy-meta-adset"]'::jsonb,
      'legacy-meta-creative',
      '["legacy-meta-ad"]'::jsonb,
      '{"providerObjectsCreatedPaused":true}'::jsonb,
      '[]'::jsonb
    )).id;
    reset role;
  `, "Legacy launch history RPC failed");
  assert.match(legacyLaunchId, /^[0-9a-f-]{36}$/i);
  psqlMustFail(
    `
      insert into public.campaign_launch_records(
        organization_id, user_id, campaign_id, idempotency_key, campaign_name,
        launch_mode, result_status, scheduled_for
      ) values (
        '${organizationId}', '${ownerId}', '${campaignId}',
        'campaign_schedule:duplicate-proof', 'Duplicate campaign schedule',
        'scheduled_provider_paused', 'scheduled', ${nextEasternWindowSql}
      );
    `,
    /campaign_launch_records_campaign_unique|duplicate key value/i,
    "A second schedule row for the same campaign must be rejected",
  );

  psql(`
    update public.campaign_launch_records
    set scheduled_for = now() - interval '1 hour';
  `, "Make the disposable schedule due");
  const firstClaim = parseClaim(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select id, user_id, schedule_attempt_count, schedule_locked_by,
        schedule_lease_token, schedule_lease_generation
      from public.claim_due_campaign_launch_records('worker-first', 5, 60000);
    `, "First scheduled launch claim failed"),
    "first claim",
  );
  assert.equal(firstClaim.id, firstScheduleId);
  assert.equal(firstClaim.userId, ownerId, "Claim did not retain the authoritative owner");
  assert.equal(firstClaim.attemptCount, 1);
  assert.equal(firstClaim.workerId, "worker-first");
  assert.equal(firstClaim.leaseGeneration, 1);
  assert.equal(
    bindLaunchInput(
      firstClaim,
      { campaignId, adAccountId: "account-a" },
      "Bind first scheduled launch inputs",
    ),
    "t",
  );

  const firstReceiptId = psql(`
    set request.jwt.claim.role = 'service_role';
    select public.record_campaign_launch_provider_receipt(
      '${firstScheduleId}', 1, 'campaign', 'meta-campaign', 200
    );
  `, "First-generation provider receipt failed");
  assert.match(firstReceiptId, /^[0-9a-f-]{36}$/i);

  psql(`
    update public.campaign_launch_records
    set schedule_locked_until = now() - interval '1 second';
  `, "Expire the crashed worker lease");
  const recoveredClaim = parseClaim(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select id, user_id, schedule_attempt_count, schedule_locked_by,
        schedule_lease_token, schedule_lease_generation
      from public.claim_due_campaign_launch_records('worker-recovered', 5, 60000);
    `, "Expired scheduled launch recovery claim failed"),
    "recovered claim",
  );
  assert.equal(recoveredClaim.id, firstClaim.id);
  assert.equal(recoveredClaim.userId, ownerId);
  assert.equal(recoveredClaim.attemptCount, 2);
  assert.equal(recoveredClaim.workerId, "worker-recovered");
  assert.ok(recoveredClaim.leaseGeneration > firstClaim.leaseGeneration);
  assert.equal(
    bindLaunchInput(
      recoveredClaim,
      { campaignId, adAccountId: "account-a" },
      "Rebind identical scheduled launch inputs",
    ),
    "t",
  );

  const staleReceiptId = psql(`
    set request.jwt.claim.role = 'service_role';
    select public.record_campaign_launch_provider_receipt(
      '${firstScheduleId}', 1, 'adset', 'meta-adset-stale-generation', 200
    );
  `, "Stale-generation evidence must remain recordable");
  assert.match(staleReceiptId, /^[0-9a-f-]{36}$/i);

  psqlMustFail(
    `
      set request.jwt.claim.role = 'service_role';
      select public.record_campaign_launch_provider_receipt(
        '${firstScheduleId}',
        ${recoveredClaim.leaseGeneration + 1},
        'creative',
        'future-generation-must-fail',
        200
      );
    `,
    /scheduled provider receipt is invalid/i,
    "Future-generation provider receipt must fail",
  );
  psqlMustFail(
    `
      update public.campaign_launch_provider_receipts
      set object_id = 'mutated-object-id'
      where launch_id = '${firstScheduleId}';
    `,
    /Scheduled provider receipts are append-only/i,
    "Provider receipt update must fail",
  );

  psql(`
    update public.campaign_launch_records
    set result_status = 'processing',
        schedule_attempt_count = 4,
        schedule_locked_until = now() - interval '1 second';
  `, "Prepare the fifth scheduled launch attempt");
  const fifthClaim = parseClaim(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select id, user_id, schedule_attempt_count, schedule_locked_by,
        schedule_lease_token, schedule_lease_generation
      from public.claim_due_campaign_launch_records('worker-fifth', 5, 60000);
    `, "Fifth scheduled launch claim failed"),
    "fifth claim",
  );
  assert.equal(fifthClaim.id, firstScheduleId);
  assert.equal(fifthClaim.userId, ownerId);
  assert.equal(fifthClaim.attemptCount, 5);
  assert.equal(fifthClaim.workerId, "worker-fifth");

  psql(`
    update public.campaign_launch_records
    set schedule_locked_until = now() - interval '1 second';
  `, "Expire the fifth scheduled launch attempt");
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select count(*)
      from public.claim_due_campaign_launch_records('worker-after-fifth', 5, 60000);
    `, "Check the post-fifth attempt cap"),
    "0",
    "An expired fifth-attempt claim was incorrectly dispatched again",
  );
  assert.equal(
    psql(`
      select result_status, schedule_attempt_count, schedule_lease_token is null,
        (select count(*) from public.campaign_launch_provider_receipts where lease_generation = 1),
        (select count(*) from public.campaign_launch_provider_receipts
          where lease_generation > launch.schedule_lease_generation),
        campaign.launch_status,
        campaign.plan -> 'launch_runtime' ->> 'status'
      from public.campaign_launch_records launch
      join public.campaign_plans campaign on campaign.id = launch.campaign_id
      where launch.id = '${firstScheduleId}';
    `, "Read final scheduler proof state"),
    "operator_action_required|5|t|2|0|operator_action_required|failed",
    "The expired final scheduled attempt was not terminalized for operator review",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select id from public.claim_manual_campaign_launch_record(
        '${firstScheduleId}', '${organizationId}', '${campaignId}', '${ownerId}',
        'manual-operator-reclaim', 60000
      ) claimed where claimed.id is not null;
    `, "Operator-required manual reclaim check failed"),
    "",
    "A normal launch worker reclaimed operator_action_required work",
  );

  const lineageMismatchLaunchId = psql(`
    set request.jwt.claim.sub = '${collaboratorId}';
    set request.jwt.claim.role = 'authenticated';
    set role authenticated;
    select (public.schedule_campaign_launch_intent(
      '${organizationId}',
      '${lineageMismatchCampaignId}',
      '${ownerId}',
      'Immutable lineage mismatch proof',
      ${nextEasternWindowSql},
      'America/New_York'
    )).id;
    reset role;
  `, "Create immutable lineage mismatch fixture");
  psql(`
    update public.campaign_launch_records
    set scheduled_for = now() - interval '1 hour'
    where id = '${lineageMismatchLaunchId}';
  `, "Make immutable lineage mismatch fixture due");
  const lineageFirstClaim = parseClaim(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select id, user_id, schedule_attempt_count, schedule_locked_by,
        schedule_lease_token, schedule_lease_generation
      from public.claim_due_campaign_launch_records('lineage-first', 1, 60000);
    `, "Claim first immutable lineage generation"),
    "first immutable lineage claim",
  );
  assert.equal(
    bindLaunchInput(
      lineageFirstClaim,
      { campaignId: lineageMismatchCampaignId, adAccountId: "lineage-account-a" },
      "Bind immutable lineage A",
    ),
    "t",
  );
  psql(`
    set request.jwt.claim.role = 'service_role';
    select public.record_campaign_launch_provider_receipt(
      '${lineageFirstClaim.id}', ${lineageFirstClaim.leaseGeneration},
      'campaign', 'lineage-meta-campaign-a', 200
    );
    update public.campaign_launch_records
    set schedule_locked_until = now() - interval '1 second'
    where id = '${lineageFirstClaim.id}';
  `, "Persist partial lineage A then expire its owner");
  const lineageRecoveryClaim = parseClaim(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select id, user_id, schedule_attempt_count, schedule_locked_by,
        schedule_lease_token, schedule_lease_generation
      from public.claim_due_campaign_launch_records('lineage-recovery', 1, 60000);
    `, "Claim immutable lineage recovery generation"),
    "immutable lineage recovery claim",
  );
  assert.equal(
    bindLaunchInput(
      lineageRecoveryClaim,
      { campaignId: lineageMismatchCampaignId, adAccountId: "lineage-account-b" },
      "Reject changed immutable lineage B",
    ),
    "f",
    "A changed provider account was accepted into an existing launch lineage",
  );
  assert.equal(
    psql(`
      select launch.result_status, launch.schedule_last_error_code,
        launch.schedule_lease_token is null,
        launch.launch_input_snapshot -> 'provider' ->> 'ad_account_id',
        count(receipt.id)
      from public.campaign_launch_records launch
      left join public.campaign_launch_provider_receipts receipt on receipt.launch_id = launch.id
      where launch.id = '${lineageMismatchLaunchId}'
      group by launch.id;
    `, "Read immutable lineage mismatch truth"),
    "operator_action_required|launch_input_snapshot_mismatch|t|lineage-account-a|1",
    "A changed retry lineage did not fail closed before further provider work",
  );

  const scheduledReleaseId = psql(`
    set request.jwt.claim.sub = '${collaboratorId}';
    set request.jwt.claim.role = 'authenticated';
    set role authenticated;
    select (public.schedule_campaign_launch_intent(
      '${organizationId}',
      '${scheduledReleaseCampaignId}',
      '${ownerId}',
      'Disposable scheduled release cap',
      ${nextEasternWindowSql},
      'America/New_York'
    )).id;
    reset role;
  `, "Scheduled release-cap fixture failed");
  psql(`
    update public.campaign_launch_records
    set scheduled_for = now() - interval '1 hour',
        schedule_attempt_count = 4
    where id = '${scheduledReleaseId}';
  `, "Prepare scheduled release-cap fixture");
  const scheduledReleaseClaim = parseClaim(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select id, user_id, schedule_attempt_count, schedule_locked_by,
        schedule_lease_token, schedule_lease_generation
      from public.claim_due_campaign_launch_records('scheduled-release-fifth', 1, 60000);
    `, "Claim scheduled release-cap fixture"),
    "scheduled release-cap claim",
  );
  assert.equal(scheduledReleaseClaim.attemptCount, 5);
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.release_campaign_launch_schedule_claim(
        '${scheduledReleaseClaim.id}',
        '${scheduledReleaseClaim.workerId}',
        '${scheduledReleaseClaim.leaseToken}',
        ${scheduledReleaseClaim.leaseGeneration},
        'scheduled',
        now() + interval '5 minutes',
        'provider_retryable',
        '{}'::jsonb,
        '{"id":"scheduled-release-cap"}'::jsonb
      );
    `, "Release fifth scheduled claim"),
    "t",
    "The fifth scheduled release was not settled",
  );
  assert.equal(
    psql(`
      select launch.result_status, launch.schedule_next_attempt_at is null,
        launch.schedule_last_error_code, campaign.launch_status,
        campaign.plan -> 'launch_runtime' ->> 'status'
      from public.campaign_launch_records launch
      join public.campaign_plans campaign on campaign.id = launch.campaign_id
      where launch.id = '${scheduledReleaseId}';
    `, "Read scheduled release-cap truth"),
    "operator_action_required|t|scheduled_launch_max_attempts_exhausted|operator_action_required|failed",
    "A caller-controlled retry status bypassed the fifth-attempt terminal cap",
  );

  const scheduledCompletionId = psql(`
    set request.jwt.claim.sub = '${collaboratorId}';
    set request.jwt.claim.role = 'authenticated';
    set role authenticated;
    select (public.schedule_campaign_launch_intent(
      '${organizationId}',
      '${scheduledCompletionCampaignId}',
      '${ownerId}',
      'Disposable scheduled receipt completion',
      ${nextEasternWindowSql},
      'America/New_York'
    )).id;
    reset role;
  `, "Scheduled receipt-completion fixture failed");
  psql(`
    update public.campaign_launch_records
    set scheduled_for = now() - interval '1 hour'
    where id = '${scheduledCompletionId}';
  `, "Make scheduled receipt-completion fixture due");
  const scheduledReceiptClaim = parseClaim(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select id, user_id, schedule_attempt_count, schedule_locked_by,
        schedule_lease_token, schedule_lease_generation
      from public.claim_due_campaign_launch_records('scheduled-receipt-first', 1, 60000);
    `, "Scheduled receipt-completion claim failed"),
    "scheduled receipt-completion claim",
  );
  assert.equal(
    bindLaunchInput(
      scheduledReceiptClaim,
      { campaignId: scheduledCompletionCampaignId, adAccountId: "scheduled-account-a" },
      "Bind scheduled receipt-completion inputs",
    ),
    "t",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.persist_campaign_launch_runtime_claim(
        '${scheduledReceiptClaim.id}',
        '${scheduledReceiptClaim.workerId}',
        '${scheduledReceiptClaim.leaseToken}',
        ${scheduledReceiptClaim.leaseGeneration},
        '{"campaign_id":"scheduled-meta-campaign","adset_id":"scheduled-meta-adset","creative_id":"scheduled-meta-creative","ad_id":"scheduled-meta-ad","current_stage":"ad","status":"in_progress","updated_at":"2026-07-10T12:00:00.000Z"}'::jsonb,
        'Scheduled receipt fixture is still fenced and processing.'
      );
    `, "Persist first scheduled runtime"),
    "t",
    "Current scheduled owner could not persist intermediate runtime",
  );
  for (const [stage, objectId, responseStatus] of [
    ["campaign", "scheduled-meta-campaign", 200],
    ["adset", "scheduled-meta-adset", 200],
    ["creative", "scheduled-meta-creative", 503],
    ["ad", "scheduled-meta-ad", 200],
  ]) {
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.record_campaign_launch_provider_receipt(
        '${scheduledReceiptClaim.id}',
        ${scheduledReceiptClaim.leaseGeneration},
        '${stage}',
        '${objectId}',
        ${responseStatus}
      );
    `, `First scheduled ${stage} receipt failed`);
  }
  psqlMustFail(
    `
      set request.jwt.claim.role = 'service_role';
      select public.complete_campaign_launch_schedule_claim(
        '${scheduledReceiptClaim.id}',
        '${scheduledReceiptClaim.workerId}',
        '${scheduledReceiptClaim.leaseToken}',
        ${scheduledReceiptClaim.leaseGeneration},
        'scheduled-meta-campaign',
        '["scheduled-meta-adset"]'::jsonb,
        'scheduled-meta-creative',
        '["scheduled-meta-ad"]'::jsonb,
        jsonb_build_object(
          'launchInputDigest',
          (select launch_input_digest from public.campaign_launch_records where id = '${scheduledReceiptClaim.id}')
        ),
        '{}'::jsonb
      );
    `,
    /does not match successful provider receipts/i,
    "Scheduled completion accepted a non-2xx creative receipt",
  );
  psql(`
    update public.campaign_launch_records
    set schedule_locked_until = now() - interval '1 second'
    where id = '${scheduledReceiptClaim.id}';
  `, "Expire non-2xx scheduled receipt claim");
  const scheduledReceiptRecovery = parseClaim(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select id, user_id, schedule_attempt_count, schedule_locked_by,
        schedule_lease_token, schedule_lease_generation
      from public.claim_due_campaign_launch_records('scheduled-receipt-recovery', 1, 60000);
    `, "Scheduled receipt recovery claim failed"),
    "scheduled receipt recovery claim",
  );
  assert.equal(
    bindLaunchInput(
      scheduledReceiptRecovery,
      { campaignId: scheduledCompletionCampaignId, adAccountId: "scheduled-account-a" },
      "Rebind scheduled receipt-completion inputs",
    ),
    "t",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.persist_campaign_launch_runtime_claim(
        '${scheduledReceiptClaim.id}',
        '${scheduledReceiptClaim.workerId}',
        '${scheduledReceiptClaim.leaseToken}',
        ${scheduledReceiptClaim.leaseGeneration},
        '{"campaign_id":"stale-overwrite","adset_id":null,"creative_id":null,"ad_id":null,"current_stage":"campaign","status":"failed","updated_at":"2026-07-10T12:01:00.000Z"}'::jsonb,
        'A stale worker must not overwrite replacement runtime.'
      );
    `, "Reject stale scheduled runtime writer"),
    "f",
    "A stale scheduled worker overwrote campaign runtime",
  );
  for (const [stage, objectId] of [
    ["campaign", "scheduled-meta-campaign"],
    ["adset", "scheduled-meta-adset"],
    ["creative", "scheduled-meta-creative"],
    ["ad", "scheduled-meta-ad"],
  ]) {
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.record_campaign_launch_provider_receipt(
        '${scheduledReceiptRecovery.id}',
        ${scheduledReceiptRecovery.leaseGeneration},
        '${stage}',
        '${objectId}',
        200
      );
    `, `Recovered scheduled ${stage} receipt failed`);
  }
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.persist_campaign_launch_runtime_claim(
        '${scheduledReceiptRecovery.id}',
        '${scheduledReceiptRecovery.workerId}',
        '${scheduledReceiptRecovery.leaseToken}',
        ${scheduledReceiptRecovery.leaseGeneration},
        '{"campaign_id":"scheduled-meta-campaign","adset_id":"scheduled-meta-adset","creative_id":"scheduled-meta-creative","ad_id":"scheduled-meta-ad","current_stage":"ad","status":"in_progress","updated_at":"2026-07-10T12:02:00.000Z"}'::jsonb,
        'Recovered scheduled receipt fixture is processing.'
      );
    `, "Persist recovered scheduled runtime"),
    "t",
  );
  psqlMustFail(
    `
      set request.jwt.claim.role = 'service_role';
      select public.complete_campaign_launch_schedule_claim(
        '${scheduledReceiptRecovery.id}',
        '${scheduledReceiptRecovery.workerId}',
        '${scheduledReceiptRecovery.leaseToken}',
        ${scheduledReceiptRecovery.leaseGeneration},
        'scheduled-meta-campaign',
        '["scheduled-meta-adset"]'::jsonb,
        'wrong-scheduled-meta-creative',
        '["scheduled-meta-ad"]'::jsonb,
        jsonb_build_object(
          'launchInputDigest',
          (select launch_input_digest from public.campaign_launch_records where id = '${scheduledReceiptRecovery.id}')
        ),
        '{}'::jsonb
      );
    `,
    /does not match successful provider receipts/i,
    "Scheduled completion accepted caller-supplied IDs that differ from receipts",
  );
  psqlMustFail(
    `
      set request.jwt.claim.role = 'service_role';
      select public.complete_campaign_launch_schedule_claim(
        '${scheduledReceiptRecovery.id}',
        '${scheduledReceiptRecovery.workerId}',
        '${scheduledReceiptRecovery.leaseToken}',
        ${scheduledReceiptRecovery.leaseGeneration},
        'scheduled-meta-campaign',
        '["scheduled-meta-adset"]'::jsonb,
        'scheduled-meta-creative',
        '["scheduled-meta-ad"]'::jsonb,
        '{"launchInputDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb,
        '{}'::jsonb
      );
    `,
    /completion input lineage does not match/i,
    "Scheduled completion accepted a caller digest outside the immutable launch lineage",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.complete_campaign_launch_schedule_claim(
        '${scheduledReceiptRecovery.id}',
        '${scheduledReceiptRecovery.workerId}',
        '${scheduledReceiptRecovery.leaseToken}',
        ${scheduledReceiptRecovery.leaseGeneration},
        'scheduled-meta-campaign',
        '["scheduled-meta-adset"]'::jsonb,
        'scheduled-meta-creative',
        '["scheduled-meta-ad"]'::jsonb,
        jsonb_build_object(
          'source', 'scheduled-disposable-recovery',
          'launchInputDigest',
          (select launch_input_digest from public.campaign_launch_records where id = '${scheduledReceiptRecovery.id}')
        ),
        '{"id":"scheduled-recovered"}'::jsonb
      );
    `, "Complete scheduled claim from successful receipts"),
    "t",
    "Scheduled completion could not reconcile all four successful receipts",
  );
  assert.equal(
    psql(`
      select launch.result_status, campaign.launch_status,
        campaign.plan -> 'launch_runtime' ->> 'status',
        campaign.plan -> 'runtime' ->> 'campaignId',
        campaign.plan -> 'runtime' ->> 'creativeId',
        campaign.plan -> 'runtime' ->> 'metaPushStatus',
        campaign.plan -> 'runtime' ->> 'safetyState',
        launch.meta_creative_id,
        tracking.status, tracking.meta_campaign_id,
        tracking.metadata ->> 'launchReceiptId',
        tracking.pixel_id, tracking.launch_domain, tracking.launch_url,
        tracking.metadata ->> 'launchInputDigest',
        (select count(*) from public.lead_tracking_events event
          where event.event_id = 'launch_tracking:' || launch.id::text)
      from public.campaign_launch_records launch
      join public.campaign_plans campaign on campaign.id = launch.campaign_id
      join public.campaign_tracking_contracts tracking on tracking.campaign_id = campaign.id
      where launch.id = '${scheduledCompletionId}';
    `, "Read terminal scheduled receipt truth"),
    `success|provider_paused|completed|scheduled-meta-campaign|scheduled-meta-creative|provider_paused|paused|scheduled-meta-creative|configured|scheduled-meta-campaign|${scheduledCompletionId}|pixel-proof|proof.example|https://proof.example/f/campaign|${calculateLaunchInputDigest({ campaignId: scheduledCompletionCampaignId, adAccountId: "scheduled-account-a" })}|1`,
    "Scheduled launch record and campaign runtime were not committed atomically",
  );
  psql(`
    set request.jwt.claim.role = 'service_role';
    select public.record_campaign_launch_provider_receipt(
      '${scheduledReceiptRecovery.id}',
      ${scheduledReceiptRecovery.leaseGeneration},
      'creative',
      'scheduled-meta-creative',
      200
    );
  `, "Replay matching terminal provider receipt");
  assert.equal(
    psql(`select result_status from public.campaign_launch_records where id = '${scheduledCompletionId}';`,
      "Read matching late receipt truth"),
    "success",
    "A matching idempotent provider receipt invalidated terminal success",
  );
  psql(`
    set request.jwt.claim.role = 'service_role';
    select public.record_campaign_launch_provider_receipt(
      '${scheduledReceiptClaim.id}',
      ${scheduledReceiptClaim.leaseGeneration},
      'creative',
      'scheduled-meta-creative',
      503
    );
  `, "Replay pre-success non-2xx provider receipt");
  assert.equal(
    psql(`select result_status from public.campaign_launch_records where id = '${scheduledCompletionId}';`,
      "Read duplicate pre-success non-2xx replay truth"),
    "success",
    "An exact duplicate of pre-success non-2xx evidence was misclassified as new late evidence",
  );
  psql(`
    set request.jwt.claim.role = 'service_role';
    select public.record_campaign_launch_provider_receipt(
      '${scheduledReceiptRecovery.id}',
      ${scheduledReceiptRecovery.leaseGeneration},
      'creative',
      'late-conflicting-meta-creative',
      200
    );
  `, "Record conflicting late provider receipt");
  assert.equal(
    psql(`
      select launch.result_status, launch.schedule_last_error_code,
        campaign.launch_status, campaign.plan -> 'launch_runtime' ->> 'status',
        tracking.status, tracking.metadata ->> 'reconciliationRequired'
      from public.campaign_launch_records launch
      join public.campaign_plans campaign on campaign.id = launch.campaign_id
      join public.campaign_tracking_contracts tracking on tracking.campaign_id = launch.campaign_id
      where launch.id = '${scheduledCompletionId}';
    `, "Read conflicting late provider receipt truth"),
    "operator_action_required|late_provider_receipt_conflict|operator_action_required|failed|needs_review|true",
    "Contradictory late provider evidence did not atomically demote launch truth",
  );

  const manualScheduleId = psql(`
    set request.jwt.claim.sub = '${collaboratorId}';
    set request.jwt.claim.role = 'authenticated';
    set role authenticated;
    select (public.schedule_campaign_launch_intent(
      '${organizationId}',
      '${manualCampaignId}',
      '${ownerId}',
      'Disposable manual launch',
      ${nextEasternWindowSql},
      'America/New_York'
    )).id;
    reset role;
  `, "Manual launch schedule failed");
  psql(`
    update public.campaign_launch_records
    set scheduled_for = now() - interval '1 hour'
    where id = '${manualScheduleId}';
  `, "Make the manual schedule due");

  assert.equal(
    psql(`
      select has_function_privilege(
        'authenticated',
        'public.claim_manual_campaign_launch_record(uuid,uuid,uuid,uuid,text,integer)',
        'EXECUTE'
      );
    `, "Read authenticated manual-claim privilege"),
    "f",
    "Authenticated clients can invoke the service-role manual claim RPC",
  );

  const manualClaimSql = (workerId) => `
    set request.jwt.claim.role = 'service_role';
    select id, user_id, schedule_attempt_count, schedule_locked_by,
      schedule_lease_token, schedule_lease_generation
    from public.claim_manual_campaign_launch_record(
      '${manualScheduleId}',
      '${organizationId}',
      '${manualCampaignId}',
      '${ownerId}',
      '${workerId}',
      60000
    ) claimed
    where claimed.id is not null;
  `;
  const concurrentResults = await Promise.all([
    psqlAsync(manualClaimSql("manual-worker-a")),
    psqlAsync(manualClaimSql("manual-worker-b")),
  ]);
  for (const [index, result] of concurrentResults.entries()) {
    assert.equal(
      result.status,
      0,
      `Concurrent manual claimer ${index + 1} failed: ${sanitize(result.stderr)}`,
    );
  }
  const concurrentClaimLines = concurrentResults
    .flatMap((result) => result.stdout.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean);
  assert.equal(
    concurrentClaimLines.length,
    1,
    "Two concurrent authenticated-route workers acquired the same manual launch",
  );
  const manualClaim = parseClaim(concurrentClaimLines[0], "concurrent manual claim");
  assert.equal(manualClaim.id, manualScheduleId);
  assert.equal(manualClaim.attemptCount, 1);
  assert.equal(manualClaim.leaseGeneration, 1);
  assert.equal(
    bindLaunchInput(
      manualClaim,
      { campaignId: manualCampaignId, adAccountId: "manual-account-a" },
      "Bind first manual launch inputs",
    ),
    "t",
  );

  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.renew_campaign_launch_schedule_lease(
        '${manualClaim.id}',
        '${manualClaim.workerId}',
        '${manualClaim.leaseToken}',
        ${manualClaim.leaseGeneration},
        60000
      );
    `, "Manual lease heartbeat failed"),
    "t",
    "The current manual launch owner could not renew its lease",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.persist_campaign_launch_runtime_claim(
        '${manualClaim.id}',
        '${manualClaim.workerId}',
        '${manualClaim.leaseToken}',
        ${manualClaim.leaseGeneration},
        '{"campaign_id":"manual-meta-campaign","adset_id":null,"creative_id":null,"ad_id":null,"current_stage":"campaign","status":"in_progress","updated_at":"2026-07-10T13:00:00.000Z"}'::jsonb,
        'Manual launch first generation is processing.'
      );
    `, "Persist first manual launch runtime"),
    "t",
    "Current manual owner could not persist intermediate runtime",
  );

  for (const [stage, objectId] of [
    ["campaign", "manual-meta-campaign"],
    ["adset", "manual-meta-adset"],
    ["creative", "manual-meta-creative"],
    ["ad", "manual-meta-ad"],
  ]) {
    const receiptId = psql(`
      set request.jwt.claim.role = 'service_role';
      select public.record_campaign_launch_provider_receipt(
        '${manualClaim.id}',
        ${manualClaim.leaseGeneration},
        '${stage}',
        '${objectId}',
        200
      );
    `, `First manual generation ${stage} receipt failed`);
    assert.match(receiptId, /^[0-9a-f-]{36}$/i);
  }

  psql(`
    update public.campaign_launch_records
    set schedule_locked_until = now() - interval '1 second'
    where id = '${manualClaim.id}';
  `, "Expire the first manual request after provider responses");
  const replacementClaim = parseClaim(
    psql(manualClaimSql("manual-worker-recovery"), "Manual recovery claim failed"),
    "manual recovery claim",
  );
  assert.equal(replacementClaim.id, manualClaim.id);
  assert.equal(replacementClaim.attemptCount, 2);
  assert.equal(replacementClaim.leaseGeneration, 2);
  assert.equal(
    bindLaunchInput(
      replacementClaim,
      { campaignId: manualCampaignId, adAccountId: "manual-account-a" },
      "Rebind identical manual launch inputs",
    ),
    "t",
  );

  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.complete_manual_campaign_launch_claim(
        '${manualClaim.id}',
        '${manualClaim.workerId}',
        '${manualClaim.leaseToken}',
        ${manualClaim.leaseGeneration},
        'manual-meta-campaign',
        'manual-meta-adset',
        'manual-meta-creative',
        'manual-meta-ad',
        '{}'::jsonb,
        '{}'::jsonb
      );
    `, "Stale manual completion check failed"),
    "f",
    "An expired request completed after a replacement acquired the launch",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.renew_campaign_launch_schedule_lease(
        '${manualClaim.id}',
        '${manualClaim.workerId}',
        '${manualClaim.leaseToken}',
        ${manualClaim.leaseGeneration},
        60000
      );
    `, "Stale manual heartbeat check failed"),
    "f",
    "An expired request renewed after a replacement acquired the launch",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.persist_campaign_launch_runtime_claim(
        '${manualClaim.id}',
        '${manualClaim.workerId}',
        '${manualClaim.leaseToken}',
        ${manualClaim.leaseGeneration},
        '{"campaign_id":"stale-manual-overwrite","adset_id":null,"creative_id":null,"ad_id":null,"current_stage":"campaign","status":"failed","updated_at":"2026-07-10T13:01:00.000Z"}'::jsonb,
        'A stale manual worker must not overwrite replacement runtime.'
      );
    `, "Reject stale manual runtime writer"),
    "f",
    "An expired manual request overwrote replacement campaign runtime",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.persist_campaign_launch_runtime_claim(
        '${replacementClaim.id}',
        '${replacementClaim.workerId}',
        '${replacementClaim.leaseToken}',
        ${replacementClaim.leaseGeneration},
        '{"campaign_id":"manual-meta-campaign","adset_id":"manual-meta-adset","creative_id":"manual-meta-creative","ad_id":"manual-meta-ad","current_stage":"ad","status":"in_progress","updated_at":"2026-07-10T13:02:00.000Z"}'::jsonb,
        'Manual replacement generation is processing.'
      );
    `, "Persist replacement manual runtime"),
    "t",
  );

  for (const [stage, objectId] of [
    ["campaign", "manual-meta-campaign"],
    ["adset", "manual-meta-adset"],
    ["creative", "manual-meta-creative"],
    ["ad", "manual-meta-ad"],
  ]) {
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.record_campaign_launch_provider_receipt(
        '${replacementClaim.id}',
        ${replacementClaim.leaseGeneration},
        '${stage}',
        '${objectId}',
        200
      );
    `, `Recovered manual generation ${stage} receipt failed`);
  }

  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.complete_manual_campaign_launch_claim(
        '${replacementClaim.id}',
        '${replacementClaim.workerId}',
        '${replacementClaim.leaseToken}',
        ${replacementClaim.leaseGeneration},
        'manual-meta-campaign',
        'manual-meta-adset',
        'manual-meta-creative',
        'manual-meta-ad',
        jsonb_build_object(
          'source', 'manual-disposable-recovery',
          'launchInputDigest',
          (select launch_input_digest from public.campaign_launch_records where id = '${replacementClaim.id}')
        ),
        '{"id":"manual-recovered"}'::jsonb
      );
    `, "Recovered manual completion failed"),
    "t",
    "The replacement owner could not reconcile the same receipted provider IDs",
  );

  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.fail_manual_campaign_launch_claim(
        '${manualClaim.id}',
        '${manualClaim.workerId}',
        '${manualClaim.leaseToken}',
        ${manualClaim.leaseGeneration},
        'stale_failure',
        'manual-meta-campaign',
        '["manual-meta-adset"]'::jsonb,
        '["manual-meta-ad"]'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb
      );
    `, "Stale manual failure check failed"),
    "f",
    "An expired request overwrote the replacement owner's success",
  );
  assert.equal(
    psql(`
      select launch.result_status, launch.schedule_attempt_count, launch.schedule_lease_generation,
        launch.schedule_lease_token is null, launch.meta_campaign_id,
        launch.meta_creative_id, campaign.launch_status,
        campaign.plan -> 'launch_runtime' ->> 'status',
        campaign.plan -> 'runtime' ->> 'campaignId',
        campaign.plan -> 'runtime' ->> 'metaPushStatus',
        campaign.plan -> 'runtime' ->> 'safetyState',
        tracking.status, tracking.meta_campaign_id,
        tracking.metadata ->> 'launchReceiptId',
        tracking.pixel_id, tracking.launch_domain, tracking.launch_url,
        tracking.metadata ->> 'launchInputDigest',
        (select count(*) from public.lead_tracking_events event
          where event.event_id = 'launch_tracking:' || launch.id::text),
        (select count(*) from public.campaign_launch_provider_receipts receipt
          where receipt.launch_id = launch.id)
      from public.campaign_launch_records launch
      join public.campaign_plans campaign on campaign.id = launch.campaign_id
      join public.campaign_tracking_contracts tracking on tracking.campaign_id = campaign.id
      where launch.id = '${manualScheduleId}';
    `, "Read final manual launch proof state"),
    `success|2|2|t|manual-meta-campaign|manual-meta-creative|provider_paused|completed|manual-meta-campaign|provider_paused|paused|configured|manual-meta-campaign|${manualScheduleId}|pixel-proof|proof.example|https://proof.example/f/campaign|${calculateLaunchInputDigest({ campaignId: manualCampaignId, adAccountId: "manual-account-a" })}|1|8`,
    "Manual recovery did not retain exactly two immutable generations and one success",
  );

  const manualFailureScheduleId = psql(`
    set request.jwt.claim.sub = '${collaboratorId}';
    set request.jwt.claim.role = 'authenticated';
    set role authenticated;
    select (public.schedule_campaign_launch_intent(
      '${organizationId}',
      '${manualFailureCampaignId}',
      '${ownerId}',
      'Disposable manual fifth failure',
      ${nextEasternWindowSql},
      'America/New_York'
    )).id;
    reset role;
  `, "Manual fifth-failure fixture failed");
  psql(`
    update public.campaign_launch_records
    set scheduled_for = now() - interval '1 hour', schedule_attempt_count = 4
    where id = '${manualFailureScheduleId}';
  `, "Prepare manual fifth-failure fixture");
  const fifthManualClaim = parseClaim(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select id, user_id, schedule_attempt_count, schedule_locked_by,
        schedule_lease_token, schedule_lease_generation
      from public.claim_manual_campaign_launch_record(
        '${manualFailureScheduleId}', '${organizationId}', '${manualFailureCampaignId}',
        '${ownerId}', 'manual-fifth-failure', 60000
      ) claimed where claimed.id is not null;
    `, "Claim manual fifth-failure fixture"),
    "manual fifth-failure claim",
  );
  assert.equal(fifthManualClaim.attemptCount, 5);
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.fail_manual_campaign_launch_claim(
        '${fifthManualClaim.id}',
        '${fifthManualClaim.workerId}',
        '${fifthManualClaim.leaseToken}',
        ${fifthManualClaim.leaseGeneration},
        'provider_retryable',
        null,
        '[]'::jsonb,
        '[]'::jsonb,
        '{}'::jsonb,
        '{"id":"manual-fifth-failure"}'::jsonb
      );
    `, "Fail manual fifth attempt"),
    "t",
    "The fifth manual failure was not durably settled",
  );
  assert.equal(
    psql(`
      select launch.result_status, launch.schedule_last_error_code,
        campaign.launch_status, campaign.plan -> 'launch_runtime' ->> 'status'
      from public.campaign_launch_records launch
      join public.campaign_plans campaign on campaign.id = launch.campaign_id
      where launch.id = '${manualFailureScheduleId}';
    `, "Read manual fifth-failure truth"),
    "operator_action_required|manual_launch_max_attempts_exhausted|operator_action_required|failed",
    "A normal fifth manual failure remained reclaimable or failed to update campaign truth",
  );

  const ambiguousScheduledLaunchId = psql(`
    set request.jwt.claim.sub = '${collaboratorId}';
    set request.jwt.claim.role = 'authenticated';
    set role authenticated;
    select (public.schedule_campaign_launch_intent(
      '${organizationId}',
      '${ambiguousScheduledCampaignId}',
      '${ownerId}',
      'Ambiguous scheduled provider create proof',
      ${nextEasternWindowSql},
      'America/New_York'
    )).id;
    reset role;
  `, "Create ambiguous scheduled-create fixture");
  psql(`
    update public.campaign_launch_records
    set scheduled_for = now() - interval '1 hour'
    where id = '${ambiguousScheduledLaunchId}';
  `, "Make ambiguous scheduled-create fixture due");
  const ambiguousScheduledClaim = parseClaim(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select id, user_id, schedule_attempt_count, schedule_locked_by,
        schedule_lease_token, schedule_lease_generation
      from public.claim_due_campaign_launch_records('ambiguous-scheduled-worker', 1, 60000);
    `, "Claim ambiguous scheduled-create fixture"),
    "ambiguous scheduled-create claim",
  );
  assert.equal(
    bindLaunchInput(
      ambiguousScheduledClaim,
      { campaignId: ambiguousScheduledCampaignId, adAccountId: "ambiguous-account" },
      "Bind ambiguous scheduled-create lineage",
    ),
    "t",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.arm_campaign_launch_provider_mutation(
        '${ambiguousScheduledClaim.id}',
        '${ambiguousScheduledClaim.workerId}',
        '${ambiguousScheduledClaim.leaseToken}',
        ${ambiguousScheduledClaim.leaseGeneration},
        'campaign',
        '${organizationId}:${ambiguousScheduledCampaignId}:attempt:campaign'
      );
    `, "Arm ambiguous scheduled provider mutation"),
    "t",
    "The provider create was not durably armed before dispatch",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.settle_campaign_launch_provider_mutation(
        '${ambiguousScheduledClaim.id}',
        'unknown-worker',
        '${ambiguousScheduledClaim.leaseToken}',
        ${ambiguousScheduledClaim.leaseGeneration},
        'campaign',
        '${organizationId}:${ambiguousScheduledCampaignId}:attempt:campaign',
        'explicit_provider_rejection',
        null,
        400,
        '100'
      );
    `, "Reject unknown-worker provider settlement"),
    "f",
    "An unknown worker cleared another worker's ambiguous provider mutation",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.release_campaign_launch_schedule_claim(
        '${ambiguousScheduledClaim.id}',
        '${ambiguousScheduledClaim.workerId}',
        '${ambiguousScheduledClaim.leaseToken}',
        ${ambiguousScheduledClaim.leaseGeneration},
        'scheduled',
        now() + interval '5 minutes',
        'provider_timeout_unknown',
        '{"providerMutationOutcome":"operator_reconciliation_required"}'::jsonb,
        '{"id":"ambiguous-scheduled-create","status":"failed"}'::jsonb
      );
    `, "Terminalize ambiguous scheduled provider create"),
    "t",
  );
  assert.equal(
    psql(`
      select result_status, schedule_last_error_code,
        execution_metadata ->> 'operatorActionId',
        execution_metadata -> 'providerMutationPending' ->> 'state',
        execution_metadata ->> 'providerMutationOutcome'
      from public.campaign_launch_records
      where id = '${ambiguousScheduledLaunchId}';
    `, "Read ambiguous scheduled provider truth"),
    `operator_action_required|meta_provider_create_outcome_ambiguous|${ambiguousScheduledLaunchId}|pending|operator_reconciliation_required`,
    "An ambiguous scheduled create remained automatically reclaimable or lost its operator identity",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select count(*) from public.claim_due_campaign_launch_records(
        'ambiguous-scheduled-reclaim', 1, 60000
      );
    `, "Reject ambiguous scheduled recreate"),
    "0",
    "A scheduled worker reclaimed an ambiguous provider create",
  );

  const receiptFailureLaunchId = psql(`
    set request.jwt.claim.sub = '${collaboratorId}';
    set request.jwt.claim.role = 'authenticated';
    set role authenticated;
    select (public.schedule_campaign_launch_intent(
      '${organizationId}',
      '${receiptFailureCampaignId}',
      '${ownerId}',
      'Provider receipt persistence failure proof',
      ${nextEasternWindowSql},
      'America/New_York'
    )).id;
    reset role;
  `, "Create provider receipt-failure fixture");
  psql(`
    update public.campaign_launch_records
    set scheduled_for = now() - interval '1 hour'
    where id = '${receiptFailureLaunchId}';
  `, "Make provider receipt-failure fixture due");
  const receiptFailureClaim = parseClaim(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select id, user_id, schedule_attempt_count, schedule_locked_by,
        schedule_lease_token, schedule_lease_generation
      from public.claim_manual_campaign_launch_record(
        '${receiptFailureLaunchId}', '${organizationId}', '${receiptFailureCampaignId}',
        '${ownerId}', 'receipt-failure-worker', 60000
      ) claimed where claimed.id is not null;
    `, "Claim provider receipt-failure fixture"),
    "provider receipt-failure claim",
  );
  assert.equal(
    bindLaunchInput(
      receiptFailureClaim,
      { campaignId: receiptFailureCampaignId, adAccountId: "receipt-failure-account" },
      "Bind provider receipt-failure lineage",
    ),
    "t",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.arm_campaign_launch_provider_mutation(
        '${receiptFailureClaim.id}',
        '${receiptFailureClaim.workerId}',
        '${receiptFailureClaim.leaseToken}',
        ${receiptFailureClaim.leaseGeneration},
        'campaign',
        '${organizationId}:${receiptFailureCampaignId}:attempt:campaign'
      );
    `, "Arm provider receipt-failure mutation"),
    "t",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.fail_manual_campaign_launch_claim(
        '${receiptFailureClaim.id}',
        '${receiptFailureClaim.workerId}',
        '${receiptFailureClaim.leaseToken}',
        ${receiptFailureClaim.leaseGeneration},
        'campaign_launch_provider_receipt_persist_failed',
        null,
        '[]'::jsonb,
        '[]'::jsonb,
        '{"providerObjectIdAvailableOnlyInMemory":true}'::jsonb,
        '{"id":"provider-receipt-persist-failed","status":"failed"}'::jsonb
      );
    `, "Terminalize provider receipt persistence failure"),
    "t",
  );
  assert.equal(
    psql(`
      select result_status, schedule_last_error_code,
        execution_metadata ->> 'operatorActionId',
        execution_metadata -> 'providerMutationPending' ->> 'state',
        (select count(*) from public.campaign_launch_provider_receipts receipt
          where receipt.launch_id = launch.id)
      from public.campaign_launch_records launch
      where id = '${receiptFailureLaunchId}';
    `, "Read provider receipt-failure truth"),
    `operator_action_required|campaign_launch_provider_receipt_persist_failed|${receiptFailureLaunchId}|pending|0`,
    "A provider ID whose receipt could not persist remained retryable or lost its exact operator error",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select id from public.claim_manual_campaign_launch_record(
        '${receiptFailureLaunchId}', '${organizationId}', '${receiptFailureCampaignId}',
        '${ownerId}', 'receipt-failure-reclaim', 60000
      ) claimed where claimed.id is not null;
    `, "Reject receipt-failure manual recreate"),
    "",
    "A manual worker reclaimed a provider create whose ID was not durably receipted",
  );

  const explicitRejectionLaunchId = psql(`
    set request.jwt.claim.sub = '${collaboratorId}';
    set request.jwt.claim.role = 'authenticated';
    set role authenticated;
    select (public.schedule_campaign_launch_intent(
      '${organizationId}',
      '${explicitRejectionCampaignId}',
      '${ownerId}',
      'Explicit provider rejection retry proof',
      ${nextEasternWindowSql},
      'America/New_York'
    )).id;
    reset role;
  `, "Create explicit provider-rejection fixture");
  psql(`
    update public.campaign_launch_records
    set scheduled_for = now() - interval '1 hour'
    where id = '${explicitRejectionLaunchId}';
  `, "Make explicit provider-rejection fixture due");
  const explicitRejectionClaim = parseClaim(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select id, user_id, schedule_attempt_count, schedule_locked_by,
        schedule_lease_token, schedule_lease_generation
      from public.claim_manual_campaign_launch_record(
        '${explicitRejectionLaunchId}', '${organizationId}', '${explicitRejectionCampaignId}',
        '${ownerId}', 'explicit-rejection-worker', 60000
      ) claimed where claimed.id is not null;
    `, "Claim explicit provider-rejection fixture"),
    "explicit provider-rejection claim",
  );
  assert.equal(
    bindLaunchInput(
      explicitRejectionClaim,
      { campaignId: explicitRejectionCampaignId, adAccountId: "explicit-rejection-account" },
      "Bind explicit provider-rejection lineage",
    ),
    "t",
  );
  const explicitRejectionObjectKey = `${organizationId}:${explicitRejectionCampaignId}:attempt:campaign`;
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.arm_campaign_launch_provider_mutation(
        '${explicitRejectionClaim.id}',
        '${explicitRejectionClaim.workerId}',
        '${explicitRejectionClaim.leaseToken}',
        ${explicitRejectionClaim.leaseGeneration},
        'campaign',
        '${explicitRejectionObjectKey}'
      );
    `, "Arm explicit provider-rejection mutation"),
    "t",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.settle_campaign_launch_provider_mutation(
        '${explicitRejectionClaim.id}',
        '${explicitRejectionClaim.workerId}',
        '${explicitRejectionClaim.leaseToken}',
        ${explicitRejectionClaim.leaseGeneration},
        'campaign',
        '${explicitRejectionObjectKey}',
        'explicit_provider_rejection',
        null,
        400,
        '100'
      );
    `, "Settle explicit provider rejection"),
    "t",
    "An explicit bounded provider rejection could not prove absence",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.fail_manual_campaign_launch_claim(
        '${explicitRejectionClaim.id}',
        '${explicitRejectionClaim.workerId}',
        '${explicitRejectionClaim.leaseToken}',
        ${explicitRejectionClaim.leaseGeneration},
        'meta_provider_request_rejected',
        null,
        '[]'::jsonb,
        '[]'::jsonb,
        '{"providerMutationOutcome":"explicit_provider_rejection"}'::jsonb,
        '{"id":"explicit-provider-rejection","status":"failed"}'::jsonb
      );
    `, "Release explicit provider rejection for safe manual retry"),
    "t",
  );
  assert.equal(
    psql(`
      select result_status, schedule_last_error_code,
        execution_metadata -> 'providerMutationPending' ->> 'state'
      from public.campaign_launch_records
      where id = '${explicitRejectionLaunchId}';
    `, "Read explicit provider-rejection truth"),
    "failed|meta_provider_request_rejected|definitive_absence",
    "An explicit provider rejection was incorrectly classified as an ambiguous create",
  );
  const explicitRejectionRetryClaim = parseClaim(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select id, user_id, schedule_attempt_count, schedule_locked_by,
        schedule_lease_token, schedule_lease_generation
      from public.claim_manual_campaign_launch_record(
        '${explicitRejectionLaunchId}', '${organizationId}', '${explicitRejectionCampaignId}',
        '${ownerId}', 'explicit-rejection-retry', 60000
      ) claimed where claimed.id is not null;
    `, "Reclaim explicit provider rejection after proof of absence"),
    "explicit provider-rejection retry claim",
  );
  assert.equal(explicitRejectionRetryClaim.attemptCount, 2);
  assert.equal(explicitRejectionRetryClaim.leaseGeneration, 2);

  const oauthStateHash = "a".repeat(64);
  psql(`
    insert into public.meta_oauth_states(
      state_hash, organization_id, user_id, return_to, expires_at
    ) values (
      '${oauthStateHash}',
      '${organizationId}',
      '${ownerId}',
      '/launch?campaign=oauth-proof',
      now() + interval '10 minutes'
    );
  `, "Insert disposable OAuth state binding");
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.consume_meta_oauth_state(
        '${oauthStateHash}', '${ownerId}', '${otherOrganizationId}'
      );
    `, "Cross-organization OAuth consume check failed"),
    "",
    "A workspace-switched callback consumed another organization's OAuth state",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.consume_meta_oauth_state(
        '${oauthStateHash}', '${collaboratorId}', '${organizationId}'
      );
    `, "Cross-user OAuth consume check failed"),
    "",
    "A user-switched callback consumed another user's OAuth state",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.consume_meta_oauth_state(
        '${oauthStateHash}', '${ownerId}', '${organizationId}'
      );
    `, "Exact OAuth state consume failed"),
    "/launch?campaign=oauth-proof",
    "The initiating user and workspace could not consume their OAuth state",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.consume_meta_oauth_state(
        '${oauthStateHash}', '${ownerId}', '${organizationId}'
      );
    `, "OAuth replay check failed"),
    "",
    "A consumed OAuth state was replayed",
  );

  const concurrentOAuthHash = "b".repeat(64);
  psql(`
    insert into public.meta_oauth_states(
      state_hash, organization_id, user_id, return_to, expires_at
    ) values (
      '${concurrentOAuthHash}',
      '${organizationId}',
      '${ownerId}',
      '/launch?campaign=concurrent-oauth-proof',
      now() + interval '10 minutes'
    );
  `, "Insert concurrent OAuth state binding");
  const oauthConsumeSql = `
    set request.jwt.claim.role = 'service_role';
    select public.consume_meta_oauth_state(
      '${concurrentOAuthHash}', '${ownerId}', '${organizationId}'
    );
  `;
  const concurrentOAuthResults = await Promise.all([
    psqlAsync(oauthConsumeSql),
    psqlAsync(oauthConsumeSql),
  ]);
  for (const [index, result] of concurrentOAuthResults.entries()) {
    assert.equal(
      result.status,
      0,
      `Concurrent OAuth consumer ${index + 1} failed: ${sanitize(result.stderr)}`,
    );
  }
  const consumedReturnValues = concurrentOAuthResults
    .flatMap((result) => result.stdout.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean);
  assert.deepEqual(
    consumedReturnValues,
    ["/launch?campaign=concurrent-oauth-proof"],
    "Concurrent callbacks consumed the same OAuth state more than once",
  );

  console.log(
    "PASS launch disposable DB: scheduler/manual fencing plus user/workspace-bound one-time OAuth state",
  );
} catch (error) {
  console.error(`FAIL scheduler disposable DB: ${sanitize(error instanceof Error ? error.message : error)}`);
  process.exitCode = 1;
} finally {
  cleanup();
}
