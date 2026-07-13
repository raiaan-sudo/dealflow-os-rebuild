#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const migration = readFileSync(
  "supabase/migrations/20260713015000_bind_verified_partner_attribution_atomically.sql",
  "utf8",
);
const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  expectedVersion: "17.6",
  databasePrefix: `dfpartner_${process.pid}_${randomBytes(3).toString("hex")}`,
  timeoutMs: 120_000,
  maxOutputBytes: 16 * 1024 * 1024,
});

const ids = Object.freeze({
  user: "51000000-0000-4000-8000-000000000001",
  organization: "51000000-0000-4000-8000-000000000002",
  partnerA: "51000000-0000-4000-8000-000000000003",
  partnerB: "51000000-0000-4000-8000-000000000004",
  otherOwner: "51000000-0000-4000-8000-000000000005",
  member: "51000000-0000-4000-8000-000000000006",
  memberOrganization: "51000000-0000-4000-8000-000000000007",
  revokeRaceOwner: "51000000-0000-4000-8000-000000000008",
  revokeRaceOrganization: "51000000-0000-4000-8000-000000000009",
  revokeRacePartner: "51000000-0000-4000-8000-00000000000a",
});

await adapter.withDisposableDatabase(async (database) => {
  const psql = (sql, label = "Run verified partner attribution proof") =>
    database.psql(sql, { label });
  const mustFail = (sql, pattern, label) =>
    database.psqlMustFail(sql, pattern, { label });

  psql(`
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
    create schema if not exists auth;
    create or replace function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    alter table auth.users add column if not exists email text;

    create table public.users(
      id uuid primary key references auth.users(id),
      email text not null unique,
      partner_id uuid,
      updated_at timestamptz not null default timezone('utc', now())
    );
    create table public.organizations(
      id uuid primary key,
      owner_user_id uuid not null references public.users(id),
      partner_id uuid,
      updated_at timestamptz not null default timezone('utc', now())
    );
    create table public.organization_memberships(
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null references public.users(id),
      primary key(organization_id, user_id)
    );
    create table public.partners(
      id uuid primary key,
      status text not null,
      deleted_at timestamptz
    );
    create table public.partner_domains(
      id uuid primary key default gen_random_uuid(),
      partner_id uuid not null references public.partners(id),
      domain text not null unique,
      verification_status text not null,
      ssl_status text not null,
      deleted_at timestamptz
    );
    create table public.workspace_partner_attribution(
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null unique references public.organizations(id),
      source text not null default 'admin',
      active boolean not null default true,
      metadata jsonb not null default '{}'::jsonb,
      assigned_by uuid references auth.users(id),
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now()),
      partner_id uuid not null references public.partners(id)
    );
    create table public.app_schema_metadata(
      key text primary key,
      value text not null,
      updated_at timestamptz not null default timezone('utc', now())
    );
  `, "Create isolated verified partner fixture schema");
  psql(migration, "Apply atomic verified partner attribution migration");
  psql(`
    insert into auth.users(id,email) values
      ('${ids.user}','owner@example.test'),
      ('${ids.otherOwner}','other-owner@example.test'),
      ('${ids.member}','member@example.test'),
      ('${ids.revokeRaceOwner}','revoke-race-owner@example.test');
    insert into public.users(id,email) values
      ('${ids.user}','owner@example.test'),
      ('${ids.otherOwner}','other-owner@example.test'),
      ('${ids.member}','member@example.test'),
      ('${ids.revokeRaceOwner}','revoke-race-owner@example.test');
    insert into public.organizations(id,owner_user_id) values
      ('${ids.organization}','${ids.user}'),
      ('${ids.memberOrganization}','${ids.otherOwner}'),
      ('${ids.revokeRaceOrganization}','${ids.revokeRaceOwner}');
    insert into public.organization_memberships(organization_id,user_id) values
      ('${ids.organization}','${ids.user}'),
      ('${ids.memberOrganization}','${ids.otherOwner}'),
      ('${ids.memberOrganization}','${ids.member}'),
      ('${ids.revokeRaceOrganization}','${ids.revokeRaceOwner}');
    insert into public.partners(id,status) values
      ('${ids.partnerA}','active'),
      ('${ids.partnerB}','active'),
      ('${ids.revokeRacePartner}','active');
    insert into public.partner_domains(partner_id,domain,verification_status,ssl_status) values
      ('${ids.partnerA}','partner-a.example','verified','active'),
      ('${ids.partnerB}','partner-b.example','verified','active'),
      ('${ids.revokeRacePartner}','revoke-race.example','verified','active');
  `, "Seed isolated verified partner fixture");

  const rolePrefix = `set local role service_role;
    select set_config('request.jwt.claim.role','service_role',true);`;
  const directRolePrefix = `set role service_role;
    select set_config('request.jwt.claim.role','service_role',false);`;
  const [raceA, raceB] = await database.psqlConcurrent([
    `begin; ${rolePrefix}
     select binding_status||'|'||coalesce(resolved_partner_id::text,'')
     from public.bind_verified_partner_attribution_v1(
       '${ids.user}','${ids.organization}','${ids.partnerA}','partner-a.example'
     );
     select pg_sleep(0.15); commit;`,
    `begin; ${rolePrefix}
     select binding_status||'|'||coalesce(resolved_partner_id::text,'')
     from public.bind_verified_partner_attribution_v1(
       '${ids.user}','${ids.organization}','${ids.partnerB}','partner-b.example'
     );
     select pg_sleep(0.15); commit;`,
  ], { label: "Race two valid partner-domain bindings" });
  const raceResults = [raceA, raceB]
    .flatMap((output) => output.split("\n"))
    .filter((line) => /^(?:bound|conflict_preserved)\|/.test(line));
  assert.equal(raceResults.length, 2, "both serialized binding calls must return a receipt");
  assert.equal(raceResults.filter((line) => line.startsWith("bound|")).length, 1);
  assert.equal(raceResults.filter((line) => line.startsWith("conflict_preserved|")).length, 1);

  const finalBinding = psql(`
    select profile.partner_id||'|'||workspace.partner_id||'|'||attribution.partner_id||'|'||attribution.active
    from public.users profile
    join public.organizations workspace on workspace.id='${ids.organization}'
    join public.workspace_partner_attribution attribution on attribution.workspace_id=workspace.id
    where profile.id='${ids.user}';
  `, "Verify atomic partner binding postcondition");
  const [userPartner, workspacePartner, attributionPartner, active] = finalBinding.split("|");
  assert.equal(userPartner, workspacePartner);
  assert.equal(workspacePartner, attributionPartner);
  assert.equal(active, "true");
  assert.ok([ids.partnerA, ids.partnerB].includes(userPartner));

  const winningDomain = userPartner === ids.partnerA ? "partner-a.example" : "partner-b.example";
  assert.equal(
    psql(`${directRolePrefix}
      select binding_status from public.bind_verified_partner_attribution_v1(
        '${ids.user}','${ids.organization}','${userPartner}','${winningDomain}'
      );`, "Replay the winning partner binding").split("\n").at(-1),
    "already_bound",
  );

  assert.equal(
    psql(`${directRolePrefix}
      select binding_status from public.bind_verified_partner_attribution_v1(
        '${ids.member}','${ids.memberOrganization}','${ids.partnerA}','partner-a.example'
      );`, "Reject member establishment of unbound workspace authority").split("\n").at(-1),
    "workspace_owner_required",
  );
  assert.equal(
    psql(`select count(*) from public.workspace_partner_attribution where workspace_id='${ids.memberOrganization}';`),
    "0",
  );
  assert.equal(
    psql(`select count(*) from public.users where id='${ids.member}' and partner_id is not null;`),
    "0",
  );

  const [bindBeforeRevoke] = await database.psqlConcurrent([
    `begin; ${rolePrefix}
     select binding_status from public.bind_verified_partner_attribution_v1(
       '${ids.revokeRaceOwner}','${ids.revokeRaceOrganization}',
       '${ids.revokeRacePartner}','revoke-race.example'
     );
     select pg_sleep(0.20); commit;`,
    `begin;
     select pg_sleep(0.05);
     update public.partner_domains
       set verification_status='failed'
     where partner_id='${ids.revokeRacePartner}' and domain='revoke-race.example';
     commit;`,
  ], { label: "Serialize verified binding against concurrent domain revocation" });
  assert.ok(
    bindBeforeRevoke.split("\n").includes("bound"),
    "valid authority must bind before the staged revocation transaction",
  );
  assert.equal(
    psql(`select verification_status from public.partner_domains where partner_id='${ids.revokeRacePartner}';`),
    "failed",
  );
  assert.equal(
    psql(`select profile.partner_id=workspace.partner_id and workspace.partner_id=attribution.partner_id
      from public.users profile
      join public.organizations workspace on workspace.id='${ids.revokeRaceOrganization}'
      join public.workspace_partner_attribution attribution on attribution.workspace_id=workspace.id
      where profile.id='${ids.revokeRaceOwner}';`),
    "t",
  );

  mustFail(
    `${directRolePrefix}
     select * from public.bind_verified_partner_attribution_v1(
       '${ids.member}','${ids.memberOrganization}','${ids.partnerA}','unverified.example'
     );`,
    /domain authority is not active/,
    "Reject unverified domain authority before mutation",
  );
  mustFail(
    `set role authenticated;
     select set_config('request.jwt.claim.role','authenticated',false);
     select * from public.bind_verified_partner_attribution_v1(
       '${ids.user}','${ids.organization}','${userPartner}','${winningDomain}'
     );`,
    /permission denied|service_role_required/,
    "Reject browser role execution",
  );

  console.log(
    "verified partner attribution disposable DB: PASS (transactional domain revalidation, owner authority, concurrent conflict serialization, exact replay, and service-role-only execution)",
  );
});
