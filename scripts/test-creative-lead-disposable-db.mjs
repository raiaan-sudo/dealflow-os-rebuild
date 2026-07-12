#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createDisposablePostgresHarness } from "./lib/disposable-postgres-harness.mjs";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const containerName = `dealflow-creative-lead-disposable-${process.pid}-${randomBytes(4).toString("hex")}`;
const disposablePostgres = createDisposablePostgresHarness({ containerName, image });
const password = randomBytes(24).toString("hex");
const storageMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260710235700_protect_creative_asset_storage_identity.sql"),
  "utf8",
);
const leadMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260710235750_fence_lead_campaign_tenant_identity.sql"),
  "utf8",
);

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "11111111-1111-4111-8111-222222222222";
const ORG_A = "22222222-2222-4222-8222-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_A = "33333333-3333-4333-8333-111111111111";
const CAMPAIGN_B = "33333333-3333-4333-8333-222222222222";
const CAMPAIGN_RACE = "33333333-3333-4333-8333-333333333333";
const GENERATED_ASSET = "44444444-4444-4444-8444-111111111111";
const MANUAL_ASSET = "44444444-4444-4444-8444-222222222222";

let cleaned = false;

function sanitize(value) {
  return String(value ?? "")
    .replaceAll(password, "[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .trim()
    .slice(-2_000);
}

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  disposablePostgres.run(["rm", "--force", containerName], {
    stdio: "ignore",
    timeout: 30_000,
  });
}

for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.once(signal, () => {
    cleanup();
    process.exit(code);
  });
}

function docker(args, options = {}) {
  return disposablePostgres.run(args, options);
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
    "--quiet",
    "--username=supabase_admin",
    "--dbname=postgres",
  ];
}

function requireSuccess(result, label) {
  if (result.error || result.status !== 0) {
    const diagnostic = sanitize(result.error?.message ?? result.stderr ?? result.stdout);
    throw new Error(`${label} (status ${String(result.status)}, signal ${String(result.signal)}): ${diagnostic}`);
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
  assert.match(sanitize(result.stderr), pattern, `${label}: unexpected rejection`);
}

function psqlAsync(sql) {
  return disposablePostgres.psqlAsync(psqlArgs(), sql);
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const initProcess = docker([
      "exec",
      containerName,
      "cat",
      "/proc/1/comm",
    ], { timeout: 5_000 });
    const containerHealth = docker([
      "inspect",
      "--format={{.State.Health.Status}}",
      containerName,
    ], { timeout: 5_000 });
    const postgresHealth = docker([
      "exec",
      containerName,
      "pg_isready",
      "--username=supabase_admin",
      "--dbname=postgres",
    ], { timeout: 5_000 });
    if (
      initProcess.status === 0 &&
      initProcess.stdout.trim().toLowerCase().includes("postgres") &&
      containerHealth.status === 0 &&
      containerHealth.stdout.trim() === "healthy" &&
      postgresHealth.status === 0
    ) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Disposable PostgreSQL did not become ready within 30 seconds.");
}

try {
  requireSuccess(docker(["image", "inspect", image]), "cached PostgreSQL image unavailable");
  requireSuccess(docker([
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
  ]), "disposable PostgreSQL start failed");
  await waitForPostgres();

  psql(`
    create schema if not exists private;
    grant usage on schema auth, private to authenticated, service_role;

    create or replace function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    create table public.organizations (
      id uuid primary key,
      owner_user_id uuid not null
    );
    create table public.organization_memberships (
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null,
      primary key (organization_id, user_id)
    );
    create or replace function private.is_current_user_org_member(p_organization_id uuid)
    returns boolean
    language sql stable security definer
    set search_path = ''
    as $$
      select exists (
        select 1 from public.organizations organization_record
        where organization_record.id = p_organization_id
          and organization_record.owner_user_id = auth.uid()
      ) or exists (
        select 1 from public.organization_memberships membership_record
        where membership_record.organization_id = p_organization_id
          and membership_record.user_id = auth.uid()
      )
    $$;
    grant execute on function auth.uid() to authenticated;
    grant execute on function private.is_current_user_org_member(uuid) to authenticated, service_role;

    create table public.campaign_plans (
      id uuid primary key,
      user_id uuid not null,
      owner_id text,
      organization_id uuid not null references public.organizations(id)
    );
    create table public.creative_assets (
      id uuid primary key,
      user_id uuid,
      campaign_id uuid references public.campaign_plans(id),
      provider_name text,
      metadata jsonb not null default '{}'::jsonb
    );
    create table public.leads (
      id uuid primary key,
      campaign_id uuid,
      organization_id uuid not null,
      user_id uuid not null
    );
    alter table public.creative_assets enable row level security;
    alter table public.creative_assets force row level security;
    grant select on public.campaign_plans to authenticated;
    grant select, insert, update, delete on public.creative_assets to authenticated;

    insert into public.organizations (id, owner_user_id)
    values ('${ORG_A}', '${USER_A}'), ('${ORG_B}', '${USER_B}');
    insert into public.campaign_plans (id, user_id, owner_id, organization_id)
    values
      ('${CAMPAIGN_A}', '${USER_A}', '${USER_A}', '${ORG_A}'),
      ('${CAMPAIGN_B}', '${USER_B}', '${USER_B}', '${ORG_B}'),
      ('${CAMPAIGN_RACE}', '${USER_A}', '${USER_A}', '${ORG_A}');
  `, "synthetic prerequisites");

  psql(storageMigration, "creative storage migration");
  psql(leadMigration, "lead campaign identity migration");

  const asUserA = (sql) => `
    set role authenticated;
    set request.jwt.claim.sub = '${USER_A}';
    ${sql}
  `;

  psql(asUserA(`
    insert into public.creative_assets (id, user_id, campaign_id, provider_name)
    values ('${GENERATED_ASSET}', '${USER_A}', '${CAMPAIGN_A}', 'openai');
  `), "current campaign member generated insert");

  psqlMustFail(asUserA(`
    insert into public.creative_assets (id, user_id, campaign_id, provider_name)
    values ('55555555-5555-4555-8555-111111111111', '${USER_A}', '${CAMPAIGN_B}', 'openai');
  `), /row-level security/i, "cross-campaign generated insert");

  psqlMustFail(asUserA(`
    update public.creative_assets
    set campaign_id = '${CAMPAIGN_B}'
    where id = '${GENERATED_ASSET}';
  `), /immutable|row-level security/i, "creative campaign re-parenting");

  psql(`
    update public.organizations set owner_user_id = '${USER_B}' where id = '${ORG_A}';
  `, "remove former organization owner");
  psql(asUserA(`
    update public.creative_assets
    set metadata = '{"tampered":true}'::jsonb
    where id = '${GENERATED_ASSET}';
  `), "former uploader invisible update");
  assert.equal(
    psql(`select metadata::text from public.creative_assets where id = '${GENERATED_ASSET}';`, "read asset metadata"),
    "{}",
    "a former uploader mutated an asset after losing organization access",
  );
  psql(`
    update public.organizations set owner_user_id = '${USER_A}' where id = '${ORG_A}';
    insert into public.creative_assets (
      id, user_id, campaign_id, provider_name, storage_bucket, storage_path
    ) values (
      '${MANUAL_ASSET}', '${USER_A}', '${CAMPAIGN_A}', 'manual_upload', 'creative-assets',
      '${USER_A}/${CAMPAIGN_A}/safe.png'
    );
  `, "canonical manual asset insert");
  psql(asUserA(`delete from public.creative_assets where id = '${MANUAL_ASSET}';`), "manual direct delete filter");
  assert.equal(
    psql(`select count(*) from public.creative_assets where id = '${MANUAL_ASSET}';`, "manual row preservation"),
    "1",
  );

  psql(`
    insert into public.leads (id, campaign_id, organization_id, user_id)
    values ('66666666-6666-4666-8666-111111111111', '${CAMPAIGN_A}', '${ORG_A}', '${USER_A}');
  `, "valid campaign-scoped lead");
  psqlMustFail(`
    insert into public.leads (id, campaign_id, organization_id, user_id)
    values ('66666666-6666-4666-8666-222222222222', '${CAMPAIGN_A}', '${ORG_B}', '${USER_A}');
  `, /foreign key constraint/i, "cross-tenant lead insert");
  psqlMustFail(`
    update public.campaign_plans set user_id = '${USER_B}' where id = '${CAMPAIGN_A}';
  `, /foreign key constraint/i, "campaign reassignment with existing lead");

  const campaignUpdate = psqlAsync(`
    begin;
    update public.campaign_plans set user_id = '${USER_B}' where id = '${CAMPAIGN_RACE}';
    select pg_sleep(0.75);
    commit;
  `);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const staleLeadInsert = psqlAsync(`
    insert into public.leads (id, campaign_id, organization_id, user_id)
    values ('66666666-6666-4666-8666-333333333333', '${CAMPAIGN_RACE}', '${ORG_A}', '${USER_A}');
  `);
  const [campaignUpdateResult, staleLeadResult] = await Promise.all([campaignUpdate, staleLeadInsert]);
  assert.equal(campaignUpdateResult.status, 0, sanitize(campaignUpdateResult.stderr));
  assert.notEqual(staleLeadResult.status, 0, "stale lead scope survived concurrent campaign reassignment");
  assert.match(sanitize(staleLeadResult.stderr), /foreign key constraint/i);

  console.log("Creative/lead disposable database security proof passed (isolated, no network providers). ");
} finally {
  cleanup();
}
