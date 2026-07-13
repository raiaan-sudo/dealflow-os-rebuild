#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createDisposablePostgresHarness } from "./lib/disposable-postgres-harness.mjs";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "supabase/migrations/20260710235990_create_meta_leadgen_ingestion.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const integrityMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260713018000_harden_meta_reporting_and_leadgen_integrity.sql"),
  "utf8",
);
const leadgenIntegritySql = integrityMigration.slice(
  integrityMigration.indexOf("-- BEGIN META LEADGEN GHL-ONLY SETTLEMENT"),
  integrityMigration.indexOf("-- END META LEADGEN GHL-ONLY SETTLEMENT") +
    "-- END META LEADGEN GHL-ONLY SETTLEMENT".length,
);
const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const containerName = `dealflow-meta-leadgen-${process.pid}-${randomBytes(4).toString("hex")}`;
const disposablePostgres = createDisposablePostgresHarness({ containerName, image, maxBuffer: 12 * 1024 * 1024 });
const password = randomBytes(24).toString("hex");

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "10000000-0000-4000-8000-000000000002";
const USER_ADMIN_A = "10000000-0000-4000-8000-000000000003";
const USER_MEMBER_A = "10000000-0000-4000-8000-000000000004";
const USER_OWNER_A = "10000000-0000-4000-8000-000000000006";
const ORG_A = "20000000-0000-4000-8000-000000000001";
const ORG_B = "20000000-0000-4000-8000-000000000002";
const CAMPAIGN_A = "30000000-0000-4000-8000-000000000001";
const CAMPAIGN_B = "30000000-0000-4000-8000-000000000002";
const CAMPAIGN_A2 = "30000000-0000-4000-8000-000000000003";
const ACCOUNT_A = "40000000-0000-4000-8000-000000000001";
const ACCOUNT_B = "40000000-0000-4000-8000-000000000002";
const ACCOUNT_A2 = "40000000-0000-4000-8000-000000000003";
const RECON_JOB = "50000000-0000-4000-8000-000000000001";
const SIDE_JOB = "50000000-0000-4000-8000-000000000002";
const UNAVAILABLE_JOB = "50000000-0000-4000-8000-000000000003";
const UNSAFE_SIDE_JOB = "50000000-0000-4000-8000-000000000004";
const META_SIDE_JOB = "50000000-0000-4000-8000-000000000005";
const CONSENT_SIDE_JOB = "50000000-0000-4000-8000-000000000006";
const LEAD_A = "60000000-0000-4000-8000-000000000001";
const LEAD_B = "60000000-0000-4000-8000-000000000002";

const PAGE_A = "100000000000001";
const FORM_A = "300000000000001";
const AD_A = "400000000000001";
const ACCOUNT_PROVIDER_A = "500000000000001";
const PAGE_AMBIGUOUS = "100000000000002";
const FORM_AMBIGUOUS = "300000000000002";
const ACCOUNT_PROVIDER_B = "500000000000002";
const ACCOUNT_PROVIDER_A2 = "500000000000003";
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
let cleaned = false;

function docker(args, options = {}) {
  return disposablePostgres.run(args, options);
}

function sanitize(value) {
  return String(value ?? "")
    .replaceAll(password, "[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .trim()
    .slice(-3_000);
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

function requireSuccess(result, label) {
  if (result.error || result.status !== 0) {
    throw new Error(
      `${label}: ${sanitize(result.error?.message ?? result.stderr ?? result.stdout)}`,
    );
  }
  return String(result.stdout ?? "").trim();
}

function psql(sql, label) {
  return requireSuccess(docker(psqlArgs(), { input: sql }), label);
}

function psqlMustFail(sql, pattern, label) {
  const result = docker(psqlArgs(), { input: sql });
  if (result.error) throw result.error;
  assert.notEqual(result.status, 0, `${label}: SQL unexpectedly succeeded`);
  assert.match(sanitize(result.stderr), pattern, `${label}: wrong SQL rejection`);
}

function rows(output) {
  return String(output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function asService(sql) {
  return `set request.jwt.claim.role = 'service_role';\n${sql}`;
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const init = docker(["exec", containerName, "cat", "/proc/1/comm"], { timeout: 5_000 });
    const health = docker(["inspect", "--format={{.State.Health.Status}}", containerName], { timeout: 5_000 });
    const ready = docker(["exec", containerName, "pg_isready", "--username=supabase_admin", "--dbname=postgres"], { timeout: 5_000 });
    if (
      init.status === 0 &&
      init.stdout.trim().toLowerCase().includes("postgres") &&
      health.status === 0 &&
      health.stdout.trim() === "healthy" &&
      ready.status === 0
    ) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Disposable PostgreSQL did not become ready within 30 seconds.");
}

function acceptSql({ leadgenId, pageId, formId, adId, digest }) {
  return asService(`
    select * from public.accept_meta_leadgen_webhook_event(
      '${leadgenId}', '${pageId}', '${formId}', ${adId ? `'${adId}'` : "null"},
      '2026-07-11T00:00:00Z', '${digest}', 'offline-webhook', 60000
    );
  `);
}

try {
  const migrationVersions = fs
    .readdirSync(path.join(root, "supabase/migrations"))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .map((name) => name.split("_", 1)[0]);
  const duplicateVersions = migrationVersions.filter(
    (version, index) => migrationVersions.indexOf(version) !== index,
  );
  assert.deepEqual(
    [...new Set(duplicateVersions)],
    [],
    "candidate contains duplicate migration versions",
  );

  requireSuccess(docker(["image", "inspect", image]), "cached PostgreSQL image unavailable");
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
    ]),
    "disposable PostgreSQL start failed",
  );
  await waitForPostgres();

  psql(`
    create schema if not exists private;
    create table public.organizations (
      id uuid primary key,
      owner_user_id uuid not null
    );
    create table public.organization_memberships (
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null,
      role text not null check (role in ('owner', 'admin', 'member')),
      primary key (organization_id, user_id)
    );
    create table public.campaign_plans (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null,
      launch_status text,
      unique(id, organization_id, user_id)
    );
    create table public.marketing_accounts (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      platform text not null,
      status text not null,
      external_account_id text,
      access_token_encrypted text,
      connection_metadata jsonb
    );
    create table public.leads (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null,
      campaign_id uuid,
      name text,
      email text,
      phone text,
      metadata jsonb not null default '{}'::jsonb,
      unique(id, organization_id),
      foreign key (campaign_id, organization_id, user_id)
        references public.campaign_plans(id, organization_id, user_id)
    );
    create table public.system_jobs (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null,
      campaign_id uuid,
      kind text not null,
      status text not null default 'pending',
      payload jsonb not null default '{}'::jsonb,
      result jsonb,
      retry_count integer not null default 0,
      error_message text,
      started_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz not null default timezone('utc', now()),
      idempotency_key text,
      locked_by text,
      locked_until timestamptz,
      next_run_at timestamptz,
      last_error_code text,
      dead_lettered_at timestamptz,
      dead_letter_reason text,
      max_attempts integer not null default 3,
      attempt_count integer not null default 0,
      lease_token uuid,
      lease_generation bigint not null default 0,
      lease_heartbeat_at timestamptz,
      unique(idempotency_key),
      foreign key (campaign_id, organization_id, user_id)
        references public.campaign_plans(id, organization_id, user_id)
    );
    create table public.campaign_launch_records (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      user_id uuid not null,
      campaign_id uuid not null,
      result_status text not null,
      launch_mode text not null,
      meta_campaign_id text,
      meta_ad_set_ids jsonb not null default '[]'::jsonb,
      meta_creative_id text,
      meta_ad_ids jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default timezone('utc', now()),
      foreign key (campaign_id, organization_id, user_id)
        references public.campaign_plans(id, organization_id, user_id)
    );
    create table public.campaign_tracking_contracts (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      user_id uuid not null,
      campaign_id uuid not null unique,
      tracking_mode text not null,
      expected_lead_destination text not null,
      meta_campaign_id text,
      meta_adset_id text,
      meta_ad_ids text[] not null default '{}',
      meta_page_id text,
      expected_event_name text not null default 'Lead',
      expected_action_source text not null default 'website',
      expected_attribution_params text[] not null default '{}',
      status text not null,
      readiness jsonb not null default '{}',
      metadata jsonb not null default '{}',
      last_verified_at timestamptz,
      updated_at timestamptz not null default timezone('utc', now()),
      foreign key (campaign_id, organization_id, user_id)
        references public.campaign_plans(id, organization_id, user_id)
    );
    create table public.app_schema_metadata (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default timezone('utc', now())
    );
    grant all on public.organizations, public.organization_memberships,
      public.campaign_plans, public.marketing_accounts,
      public.leads, public.system_jobs, public.campaign_launch_records,
      public.campaign_tracking_contracts, public.app_schema_metadata to service_role;

    insert into public.organizations(id, owner_user_id) values
      ('${ORG_A}', '${USER_OWNER_A}'),
      ('${ORG_B}', '${USER_B}');
    insert into public.organization_memberships(organization_id, user_id, role) values
      ('${ORG_A}', '${USER_OWNER_A}', 'owner'),
      ('${ORG_A}', '${USER_A}', 'member'),
      ('${ORG_A}', '${USER_ADMIN_A}', 'admin'),
      ('${ORG_A}', '${USER_MEMBER_A}', 'member'),
      ('${ORG_B}', '${USER_B}', 'owner');
    insert into public.campaign_plans(id, organization_id, user_id, launch_status) values
      ('${CAMPAIGN_A}', '${ORG_A}', '${USER_A}', 'provider_paused'),
      ('${CAMPAIGN_B}', '${ORG_B}', '${USER_B}', 'provider_paused'),
      ('${CAMPAIGN_A2}', '${ORG_A}', '${USER_A}', 'provider_paused');
    insert into public.marketing_accounts(
      id, organization_id, platform, status, external_account_id,
      access_token_encrypted, connection_metadata
    ) values
      ('${ACCOUNT_A}', '${ORG_A}', 'meta_ads', 'connected', 'act_${ACCOUNT_PROVIDER_A}', 'encrypted-a', '{"selected_page_id":"${PAGE_A}"}'),
      ('${ACCOUNT_B}', '${ORG_B}', 'meta_ads', 'connected', 'act_${ACCOUNT_PROVIDER_B}', 'encrypted-b', '{"selected_page_id":"${PAGE_AMBIGUOUS}"}'),
      ('${ACCOUNT_A2}', '${ORG_A}', 'meta_ads', 'connected', 'act_${ACCOUNT_PROVIDER_A2}', 'encrypted-a2', '{"selected_page_id":"${PAGE_AMBIGUOUS}"}');
    insert into public.campaign_launch_records(
      organization_id, user_id, campaign_id, result_status, launch_mode,
      meta_campaign_id, meta_ad_set_ids, meta_creative_id, meta_ad_ids
    ) values
      ('${ORG_A}', '${USER_A}', '${CAMPAIGN_A}', 'success', 'provider_paused',
       '710000000000001', '["720000000000001"]', '730000000000001', '["740000000000001"]'),
      ('${ORG_B}', '${USER_B}', '${CAMPAIGN_B}', 'success', 'provider_paused',
       '710000000000002', '["720000000000002"]', '730000000000002', '["740000000000002"]'),
      ('${ORG_A}', '${USER_A}', '${CAMPAIGN_A2}', 'success', 'provider_paused',
       '710000000000003', '["720000000000003"]', '730000000000003', '["740000000000003"]');
    insert into public.campaign_tracking_contracts(
      organization_id, user_id, campaign_id, tracking_mode,
      expected_lead_destination, meta_campaign_id, meta_adset_id, meta_ad_ids, status
    ) values
      ('${ORG_A}', '${USER_A}', '${CAMPAIGN_A}', 'website_funnel', 'dealflow_dashboard',
       '710000000000001', '720000000000001', array['740000000000001'], 'configured'),
      ('${ORG_B}', '${USER_B}', '${CAMPAIGN_B}', 'website_funnel', 'dealflow_dashboard',
       '710000000000002', '720000000000002', array['740000000000002'], 'configured'),
      ('${ORG_A}', '${USER_A}', '${CAMPAIGN_A2}', 'website_funnel', 'dealflow_dashboard',
       '710000000000003', '720000000000003', array['740000000000003'], 'configured');
  `, "synthetic prerequisite schema");

  psql(migration, "Meta leadgen migration");
  psql(leadgenIntegritySql, "Meta leadgen GHL-only integrity migration");

  psql(
    asService(`
      select id from public.upsert_meta_leadgen_route(
        '${ORG_A}', '${USER_A}', '${USER_A}', '${CAMPAIGN_A}', '${ACCOUNT_A}',
        '${ACCOUNT_PROVIDER_A}', '${PAGE_A}', '${FORM_A}', 'active'
      );
    `),
    "valid exact Meta leadgen route",
  );

  psqlMustFail(
    asService(`
      select id from public.upsert_meta_leadgen_route(
        '${ORG_A}', '${USER_MEMBER_A}', '${USER_A}', '${CAMPAIGN_A}', '${ACCOUNT_A}',
        '${ACCOUNT_PROVIDER_A}', '${PAGE_A}', '${FORM_A}', 'active'
      );
    `),
    /meta_leadgen_route_role_required/,
    "ordinary member route mutation denial",
  );

  psql(
    `delete from public.organization_memberships
      where organization_id = '${ORG_A}' and user_id = '${USER_A}';`,
    "remove campaign owner membership",
  );
  psqlMustFail(
    asService(`
      select id from public.upsert_meta_leadgen_route(
        '${ORG_A}', '${USER_A}', '${USER_A}', '${CAMPAIGN_A}', '${ACCOUNT_A}',
        '${ACCOUNT_PROVIDER_A}', '${PAGE_A}', '${FORM_A}', 'active'
      );
    `),
    /meta_leadgen_membership_required/,
    "removed campaign owner route mutation denial",
  );
  psql(
    `insert into public.organization_memberships(organization_id, user_id, role)
      values ('${ORG_A}', '${USER_A}', 'member');`,
    "restore campaign owner membership",
  );

  psql(
    asService(`
      select id from public.upsert_meta_leadgen_route(
        '${ORG_A}', '${USER_ADMIN_A}', '${USER_A}', '${CAMPAIGN_A}', '${ACCOUNT_A}',
        '${ACCOUNT_PROVIDER_A}', '${PAGE_A}', '${FORM_A}', 'active'
      );
      select id from public.upsert_meta_leadgen_route(
        '${ORG_A}', '${USER_OWNER_A}', '${USER_A}', '${CAMPAIGN_A}', '${ACCOUNT_A}',
        '${ACCOUNT_PROVIDER_A}', '${PAGE_A}', '${FORM_A}', 'active'
      );
    `),
    "workspace admin and organization owner route authorization",
  );

  psqlMustFail(
    asService(`
      select id from public.upsert_meta_leadgen_route(
        '${ORG_B}', '${USER_B}', '${USER_B}', '${CAMPAIGN_A}', '${ACCOUNT_B}',
        '${ACCOUNT_PROVIDER_B}', '${PAGE_AMBIGUOUS}', '${FORM_AMBIGUOUS}', 'active'
      );
    `),
    /meta_leadgen_campaign_scope_or_launch_mismatch/,
    "cross-tenant route denial",
  );
  assert.equal(
    psql(`select tracking_mode || '|' || expected_lead_destination || '|' || (metadata ->> 'providerFormId') from public.campaign_tracking_contracts where campaign_id = '${CAMPAIGN_A}';`, "native tracking route projection"),
    `instant_form|dealflow_dashboard|${FORM_A}`,
  );

  psql(
    asService(`
      select id from public.upsert_meta_leadgen_route(
        '${ORG_B}', '${USER_B}', '${USER_B}', '${CAMPAIGN_B}', '${ACCOUNT_B}',
        '${ACCOUNT_PROVIDER_B}', '${PAGE_AMBIGUOUS}', '${FORM_AMBIGUOUS}', 'active'
      );
      select id from public.upsert_meta_leadgen_route(
        '${ORG_A}', '${USER_A}', '${USER_A}', '${CAMPAIGN_A2}', '${ACCOUNT_A2}',
        '${ACCOUNT_PROVIDER_A2}', '${PAGE_AMBIGUOUS}', '${FORM_AMBIGUOUS}', 'active'
      );
    `),
    "ambiguous Page/Form route fixtures",
  );

  const unknown = rows(
    psql(
      acceptSql({
        leadgenId: "200000000000010",
        pageId: "100000000000099",
        formId: "300000000000099",
        adId: "400000000000099",
        digest: DIGEST_A,
      }),
      "unknown route receipt",
    ),
  ).at(-1).split("|");
  assert.equal(unknown[1], "unknown_route");
  assert.equal(unknown[5], "", "unknown route selected an organization");

  const ambiguous = rows(
    psql(
      acceptSql({
        leadgenId: "200000000000011",
        pageId: PAGE_AMBIGUOUS,
        formId: FORM_AMBIGUOUS,
        adId: "400000000000011",
        digest: DIGEST_A,
      }),
      "ambiguous route receipt",
    ),
  ).at(-1).split("|");
  assert.equal(ambiguous[1], "ambiguous_route");
  assert.equal(ambiguous[5], "", "ambiguous route selected an organization");

  const accepted = rows(
    psql(
      acceptSql({
        leadgenId: "200000000000001",
        pageId: PAGE_A,
        formId: FORM_A,
        adId: AD_A,
        digest: DIGEST_A,
      }),
      "valid event accept",
    ),
  ).at(-1).split("|");
  assert.equal(accepted[1], "claimed");
  assert.equal(accepted[5], ORG_A);
  assert.equal(accepted[6], USER_A);
  assert.equal(accepted[7], CAMPAIGN_A);
  assert.equal(accepted[8], ACCOUNT_PROVIDER_A);
  const [eventId, , processingToken, generation] = accepted;

  const busy = rows(
    psql(
      acceptSql({
        leadgenId: "200000000000001",
        pageId: PAGE_A,
        formId: FORM_A,
        adId: AD_A,
        digest: DIGEST_A,
      }),
      "concurrent replay",
    ),
  ).at(-1).split("|");
  assert.equal(busy[1], "busy");
  assert.equal(busy[2], "", "replay received the active processing token");

  psql(`
    insert into public.system_jobs(id, organization_id, user_id, campaign_id, kind, status, payload)
    values (
      '${RECON_JOB}', '${ORG_A}', '${USER_A}', '${CAMPAIGN_A}',
      'meta_leadgen_reconciliation', 'pending', '{"eventId":"${eventId}"}'
    );
  `, "reconciliation job fixture");
  assert.equal(
    psql(
      asService(`
        select public.settle_meta_leadgen_event(
          p_event_id => '${eventId}',
          p_processing_token => '${processingToken}',
          p_processing_generation => ${generation},
          p_status => 'pending_reconciliation',
          p_reconciliation_job_id => '${RECON_JOB}',
          p_error_code => 'meta_leadgen_provider_lookup_unavailable'
        );
      `),
      "queue event reconciliation",
    ).split(/\r?\n/).at(-1),
    "t",
  );
  assert.equal(
    psql(`select status from public.meta_leadgen_events where id = '${eventId}';`, "queued status"),
    "pending_reconciliation",
  );
  assert.equal(
    psql(`select status from public.meta_leadgen_effect_receipts where event_id = '${eventId}' and effect_key = 'provider_lookup';`, "queued provider effect"),
    "queued",
  );

  const reconciledClaim = rows(
    psql(
      asService(`
        select * from public.claim_meta_leadgen_reconciliation(
          '${eventId}', 'offline-reconciler', 300000
        );
      `),
      "reconciliation claim",
    ),
  ).at(-1).split("|");
  assert.equal(reconciledClaim[1], "claimed");
  assert.equal(reconciledClaim[5], ORG_A);
  assert.equal(reconciledClaim[9], ACCOUNT_A);
  const reconciliationToken = reconciledClaim[2];
  const reconciliationGeneration = reconciledClaim[3];

  psql(`
    insert into public.leads(id, organization_id, user_id, campaign_id, name, email) values
      ('${LEAD_A}', '${ORG_A}', '${USER_A}', '${CAMPAIGN_A}', 'Fixture A', 'a@example.com'),
      ('${LEAD_B}', '${ORG_B}', '${USER_B}', '${CAMPAIGN_B}', 'Fixture B', 'b@example.com');
    insert into public.system_jobs(id, organization_id, user_id, campaign_id, kind, status, payload)
    values
    (
      '${SIDE_JOB}', '${ORG_A}', '${USER_A}', '${CAMPAIGN_A}',
      'lead_side_effects', 'pending',
      '{"requestId":"app-shaped-meta-leadgen","enabledEffects":["ghl_delivery"],"requiredEffects":["ghl_delivery"],"advertisingConsent":null,"lead":{"id":"${LEAD_A}","organization_id":"${ORG_A}","campaign_id":"${CAMPAIGN_A}"}}'
    ),
    (
      '${UNSAFE_SIDE_JOB}', '${ORG_A}', '${USER_A}', '${CAMPAIGN_A}',
      'lead_side_effects', 'pending', '{"enabledEffects":["agent_notification"],"requiredEffects":[]}'
    ),
    (
      '${META_SIDE_JOB}', '${ORG_A}', '${USER_A}', '${CAMPAIGN_A}',
      'lead_side_effects', 'pending', '{"enabledEffects":["ghl_delivery","meta_conversion"],"requiredEffects":["ghl_delivery"],"advertisingConsent":null,"metaConversion":{"eventName":"Lead"}}'
    ),
    (
      '${CONSENT_SIDE_JOB}', '${ORG_A}', '${USER_A}', '${CAMPAIGN_A}',
      'lead_side_effects', 'pending', '{"enabledEffects":["ghl_delivery"],"requiredEffects":["ghl_delivery"],"advertisingConsent":{"granted":true}}'
    );
  `, "lead and suppressed side-effect fixtures");

  psqlMustFail(
    asService(`
      select public.settle_meta_leadgen_event(
        p_event_id => '${eventId}',
        p_processing_token => '${reconciliationToken}',
        p_processing_generation => ${reconciliationGeneration},
        p_status => 'persisted',
        p_provider_ad_account_id => '${ACCOUNT_PROVIDER_A}',
        p_provider_ad_id => '${AD_A}',
        p_lead_id => '${LEAD_B}',
        p_side_effect_job_id => '${SIDE_JOB}'
      );
    `),
    /meta_leadgen_lead_scope_mismatch/,
    "cross-tenant lead settlement denial",
  );

  psqlMustFail(
    asService(`
      select public.settle_meta_leadgen_event(
        p_event_id => '${eventId}',
        p_processing_token => '${reconciliationToken}',
        p_processing_generation => ${reconciliationGeneration},
        p_status => 'persisted',
        p_provider_ad_account_id => '${ACCOUNT_PROVIDER_A}',
        p_provider_ad_id => '${AD_A}',
        p_lead_id => '${LEAD_A}',
        p_side_effect_job_id => '${UNSAFE_SIDE_JOB}'
      );
    `),
    /meta_leadgen_side_effect_policy_mismatch/,
    "communication-enabled side-effect settlement denial",
  );

  for (const [jobId, label] of [
    [META_SIDE_JOB, "CAPI/Meta-enabled side-effect settlement denial"],
    [CONSENT_SIDE_JOB, "non-null advertising consent settlement denial"],
  ]) {
    psqlMustFail(
      asService(`
        select public.settle_meta_leadgen_event(
          p_event_id => '${eventId}',
          p_processing_token => '${reconciliationToken}',
          p_processing_generation => ${reconciliationGeneration},
          p_status => 'persisted',
          p_provider_ad_account_id => '${ACCOUNT_PROVIDER_A}',
          p_provider_ad_id => '${AD_A}',
          p_lead_id => '${LEAD_A}',
          p_side_effect_job_id => '${jobId}'
        );
      `),
      /meta_leadgen_side_effect_policy_mismatch/,
      label,
    );
  }

  assert.equal(
    psql(
      asService(`
        select public.settle_meta_leadgen_event(
          p_event_id => '${eventId}',
          p_processing_token => '${reconciliationToken}',
          p_processing_generation => ${reconciliationGeneration},
          p_status => 'persisted',
          p_provider_ad_account_id => '${ACCOUNT_PROVIDER_A}',
          p_provider_ad_id => '${AD_A}',
          p_lead_id => '${LEAD_A}',
          p_side_effect_job_id => '${SIDE_JOB}'
        );
      `),
      "exact-tenant event settlement",
    ).split(/\r?\n/).at(-1),
    "t",
  );
  assert.equal(
    psql(`select status from public.meta_leadgen_events where id = '${eventId}';`, "persisted status"),
    "persisted",
  );
  assert.equal(
    psql(`
      select count(*) from public.system_jobs
      where id = '${SIDE_JOB}' and kind = 'lead_side_effects'
        and payload -> 'enabledEffects' = '["ghl_delivery"]'::jsonb
        and payload -> 'requiredEffects' = '["ghl_delivery"]'::jsonb
        and jsonb_typeof(payload -> 'advertisingConsent') = 'null'
        and not (payload ? 'metaConversion');
    `, "exactly one app-shaped GHL-only job"),
    "1",
  );
  assert.equal(
    psql(`
      select count(*) from public.system_jobs
      where id = '${SIDE_JOB}' and (
        payload -> 'enabledEffects' ?| array['agent_notification','sms','email','meta_conversion']
        or payload ? 'metaConversion'
      );
    `, "no communication or CAPI effect on accepted job"),
    "0",
  );
  assert.equal(
    psql(`select count(*) from public.meta_leadgen_effect_receipts where event_id = '${eventId}' and status = 'suppressed';`, "suppressed effect count"),
    "3",
  );
  assert.equal(
    psql(`select count(*) from public.meta_leadgen_effect_receipts where event_id = '${eventId}' and status = 'succeeded';`, "succeeded effect count"),
    "2",
  );

  const duplicate = rows(
    psql(
      acceptSql({
        leadgenId: "200000000000001",
        pageId: PAGE_A,
        formId: FORM_A,
        adId: AD_A,
        digest: DIGEST_A,
      }),
      "persisted replay",
    ),
  ).at(-1).split("|");
  assert.equal(duplicate[1], "duplicate_persisted");

  const unavailable = rows(
    psql(
      acceptSql({
        leadgenId: "200000000000003",
        pageId: PAGE_A,
        formId: FORM_A,
        adId: "400000000000003",
        digest: DIGEST_B,
      }),
      "provider unavailable event accept",
    ),
  ).at(-1).split("|");
  psql(`
    insert into public.system_jobs(id, organization_id, user_id, campaign_id, kind, status, payload)
    values (
      '${UNAVAILABLE_JOB}', '${ORG_A}', '${USER_A}', '${CAMPAIGN_A}',
      'meta_leadgen_reconciliation', 'pending', '{"eventId":"${unavailable[0]}"}'
    );
  `, "unavailable reconciliation job fixture");
  psql(
    asService(`
      select public.settle_meta_leadgen_event(
        p_event_id => '${unavailable[0]}',
        p_processing_token => '${unavailable[2]}',
        p_processing_generation => ${unavailable[3]},
        p_status => 'pending_reconciliation',
        p_reconciliation_job_id => '${UNAVAILABLE_JOB}',
        p_error_code => 'meta_leadgen_provider_lookup_unavailable'
      );
    `),
    "provider lookup unavailable queued reconciliation",
  );
  assert.equal(
    psql(`select status || '|' || last_error_code from public.meta_leadgen_events where id = '${unavailable[0]}';`, "provider unavailable truth"),
    "pending_reconciliation|meta_leadgen_provider_lookup_unavailable",
  );

  psqlMustFail(
    `set role service_role; insert into public.meta_leadgen_events(
      provider_leadgen_id, provider_page_id, provider_form_id, payload_digest
    ) values ('299999999999999', '${PAGE_A}', '${FORM_A}', '${DIGEST_A}');`,
    /permission denied for table meta_leadgen_events/,
    "service role direct event DML denial",
  );
  assert.equal(
    psql(
      `select has_function_privilege(
        'authenticated',
        'public.accept_meta_leadgen_webhook_event(text,text,text,text,timestamptz,text,text,integer)',
        'EXECUTE'
      );`,
      "authenticated leadgen RPC privilege",
    ),
    "f",
    "authenticated role can execute the service-role leadgen claim RPC",
  );
  assert.equal(
    psql(
      `select has_function_privilege(
        'authenticated',
        'public.upsert_meta_leadgen_route(uuid,uuid,uuid,uuid,uuid,text,text,text,text)',
        'EXECUTE'
      );`,
      "authenticated leadgen route RPC privilege",
    ),
    "f",
    "authenticated role can execute the actor-fenced leadgen route RPC",
  );
  assert.equal(
    psql(
      `select to_regprocedure(
        'public.upsert_meta_leadgen_route(uuid,uuid,uuid,uuid,text,text,text,text)'
      ) is null;`,
      "actor-less leadgen route RPC removal",
    ),
    "t",
    "actor-less leadgen route RPC survived the RBAC cutover",
  );
  psqlMustFail(
    `set role service_role; truncate public.meta_leadgen_effect_receipts;`,
    /permission denied for table meta_leadgen_effect_receipts/,
    "service role effect truncate denial",
  );

  assert.equal(
    psql(`select count(*) from public.system_jobs where kind not in ('meta_leadgen_reconciliation', 'lead_side_effects');`, "unexpected job kinds"),
    "0",
  );
  assert.equal(
    psql(`select count(*) from public.meta_leadgen_effect_receipts where effect_key in ('agent_notification','meta_conversion','provider_mutation') and status <> 'suppressed';`, "forbidden effect activation"),
    "0",
  );
  psql(`
    update public.system_jobs
    set attempt_count = max_attempts,
        status = 'pending',
        locked_by = null,
        locked_until = null
    where id = '${UNAVAILABLE_JOB}';
  `, "exhaust reconciliation attempts");
  assert.equal(
    psql(
      asService(`
        select kind from public.claim_next_system_job_v2(
          'offline-system-worker', 300000, 2
        );
      `),
      "v2 reconciliation worker claim",
    ).split(/\r?\n/).at(-1),
    "meta_leadgen_reconciliation",
  );
  assert.equal(
    psql(`select status || '|' || last_error_code from public.meta_leadgen_events where id = '${unavailable[0]}';`, "exhausted event truth"),
    "operator_required|meta_leadgen_max_attempts_exhausted",
  );

  console.log(
    "PASS Meta leadgen disposable DB: owner/admin RBAC, ordinary/removed-member denial, exact tenant routes, replay fencing, scoped persistence, and suppressed effects",
  );
} finally {
  cleanup();
}
