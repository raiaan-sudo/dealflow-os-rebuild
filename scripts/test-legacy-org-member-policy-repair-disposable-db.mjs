#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const migration = readFileSync(
  "supabase/migrations/20260715010000_move_legacy_org_member_policies_private.sql",
  "utf8",
);

const expectedPolicies = Object.freeze([
  ["appointments", "appointments_member_access"],
  ["audit_logs", "audit_logs_member_access"],
  ["autonomy_action_logs", "autonomy_action_logs_member_access"],
  ["business_profiles", "business_profiles_member_access"],
  ["campaign_snapshots", "campaign_snapshots_member_access"],
  ["data_imports", "data_imports_member_access"],
  ["deals", "deals_member_access"],
  ["generated_artifacts", "generated_artifacts_member_access"],
  ["health_scores", "health_scores_member_access"],
  ["insights", "insights_member_access"],
  ["internal_notes", "internal_notes_member_access"],
  ["jobs", "jobs_member_access"],
  ["markets", "markets_member_access"],
  ["organization_autonomy_settings", "org_autonomy_settings_member_access"],
  ["organization_admin_states", "organization_admin_states_member_access"],
  ["recommendations", "recommendations_member_access"],
  ["service_areas", "service_areas_member_access"],
  ["service_types", "service_types_member_access"],
]);

assert.equal(expectedPolicies.length, 18);
for (const [tableName, policyName] of expectedPolicies) {
  assert.match(
    migration,
    new RegExp(
      `alter policy ${policyName} on public\\.${tableName}\\s+to authenticated\\s+using \\(private\\.is_current_user_org_member\\(organization_id\\)\\)\\s+with check \\(private\\.is_current_user_org_member\\(organization_id\\)\\);`,
      "i",
    ),
  );
}
assert.doesNotMatch(
  migration,
  /grant\s+execute\s+on\s+function\s+public\.is_org_member\s*\([^)]*\)\s+to\s+(?:anon|authenticated|public)/i,
);

const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  expectedVersion: "17.6",
  databasePrefix: `dforgpol_${process.pid}_${randomBytes(2).toString("hex")}`,
  timeoutMs: 120_000,
  maxOutputBytes: 16 * 1024 * 1024,
});

const ids = Object.freeze({
  member: "73000000-0000-4000-8000-000000000001",
  owner: "73000000-0000-4000-8000-000000000002",
  outsider: "73000000-0000-4000-8000-000000000003",
  organization: "73000000-0000-4000-8000-000000000004",
  otherOrganization: "73000000-0000-4000-8000-000000000005",
  otherOwner: "73000000-0000-4000-8000-000000000006",
});

const policyPortfolioSql = expectedPolicies
  .map(([tableName, policyName]) => `('${tableName}', '${policyName}')`)
  .join(",\n");

await adapter.withDisposableDatabase(async (database) => {
  const psql = (sql, label) => database.psql(sql, { label });
  const mustFail = (sql, pattern, label) =>
    database.psqlMustFail(sql, pattern, { label });

  psql(`
    create schema private;
    revoke all on schema private from public;
    grant usage on schema private to authenticated, service_role;

    create table public.organizations(
      id uuid primary key,
      owner_user_id uuid not null
    );
    create table public.organization_memberships(
      organization_id uuid not null,
      user_id uuid not null,
      primary key (organization_id, user_id)
    );

    insert into public.organizations(id, owner_user_id) values
      ('${ids.organization}', '${ids.owner}'),
      ('${ids.otherOrganization}', '${ids.otherOwner}');
    insert into public.organization_memberships(organization_id, user_id)
    values ('${ids.organization}', '${ids.member}');

    create function public.is_org_member(org_id uuid)
    returns boolean
    language sql
    stable
    security definer
    set search_path = ''
    as $function$
      select exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = org_id
          and membership.user_id = auth.uid()
      )
    $function$;
    revoke all on function public.is_org_member(uuid)
      from public, anon, authenticated;
    grant execute on function public.is_org_member(uuid) to service_role;

    create function private.is_current_user_org_member(p_organization_id uuid)
    returns boolean
    language sql
    stable
    security definer
    set search_path = ''
    as $function$
      select exists (
        select 1
        from public.organizations organization_record
        where organization_record.id = p_organization_id
          and organization_record.owner_user_id = auth.uid()
      ) or exists (
        select 1
        from public.organization_memberships membership_record
        where membership_record.organization_id = p_organization_id
          and membership_record.user_id = auth.uid()
      )
    $function$;
    revoke execute on function private.is_current_user_org_member(uuid)
      from public, anon;
    grant execute on function private.is_current_user_org_member(uuid)
      to authenticated, service_role;

    do $fixture$
    declare
      target record;
    begin
      for target in
        select * from (values
          ${policyPortfolioSql}
        ) as expected(table_name, policy_name)
      loop
        execute format(
          'create table public.%I(id uuid primary key, organization_id uuid not null, payload text)',
          target.table_name
        );
        execute format(
          'insert into public.%I(id, organization_id, payload) values (gen_random_uuid(), %L, %L), (gen_random_uuid(), %L, %L)',
          target.table_name,
          '${ids.organization}',
          'member-row',
          '${ids.otherOrganization}',
          'cross-tenant-row'
        );
        execute format('alter table public.%I enable row level security', target.table_name);
        execute format('alter table public.%I force row level security', target.table_name);
        execute format(
          'create policy %I on public.%I as permissive for all to public using (is_org_member(organization_id)) with check (is_org_member(organization_id))',
          target.policy_name,
          target.table_name
        );
      end loop;
    end;
    $fixture$;
  `, "Create exact broken legacy member-policy portfolio");

  assert.equal(
    psql(`
      select count(*)
      from pg_catalog.pg_policy policy
      where position(
        'is_org_member(' in coalesce(
          pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
          ''
        )
      ) > 0;
    `, "Count broken public-helper policies"),
    "18",
  );

  mustFail(`
    begin;
    set local role authenticated;
    set local "request.jwt.claim.sub" = '${ids.member}';
    select count(*) from public.appointments;
    rollback;
  `, /permission denied for function is_org_member/, "Reproduce hosted dashboard policy failure");

  psql(migration, "Apply private organization membership policy repair");
  psql(migration, "Replay private organization membership policy repair");

  assert.equal(
    psql(`
      select count(*)
      from pg_catalog.pg_policy policy
      join pg_catalog.pg_roles role_record
        on policy.polroles = array[role_record.oid]
      where role_record.rolname = 'authenticated'
        and policy.polcmd = '*'
        and policy.polpermissive
        and pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
          = 'private.is_current_user_org_member(organization_id)'
        and pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)
          = 'private.is_current_user_org_member(organization_id)';
    `, "Verify exact repaired policy portfolio"),
    "18",
  );

  assert.equal(
    psql(`
      begin;
      set local role authenticated;
      set local "request.jwt.claim.sub" = '${ids.member}';
      select payload from public.appointments order by payload;
      rollback;
    `, "Read authorized dashboard row after repair"),
    "member-row",
  );
  assert.equal(
    psql(`
      begin;
      set local role authenticated;
      set local "request.jwt.claim.sub" = '${ids.outsider}';
      select count(*) from public.appointments;
      rollback;
    `, "Reject cross-tenant dashboard read after repair"),
    "0",
  );
  assert.equal(
    psql(`
      begin;
      set local role anon;
      select count(*) from public.appointments;
      rollback;
    `, "Keep anonymous dashboard reads closed"),
    "0",
  );
  mustFail(`
    begin;
    set local role authenticated;
    set local "request.jwt.claim.sub" = '${ids.member}';
    select public.is_org_member('${ids.organization}');
    rollback;
  `, /permission denied for function is_org_member/, "Keep public membership RPC unexposed");
  assert.equal(
    psql(`
      begin;
      set local role authenticated;
      set local "request.jwt.claim.sub" = '${ids.member}';
      select private.is_current_user_org_member('${ids.organization}')::text || '|' ||
        private.is_current_user_org_member('${ids.otherOrganization}')::text;
      rollback;
    `, "Verify private helper member and cross-tenant truth"),
    "true|false",
  );
  assert.equal(
    psql(`
      select
        has_function_privilege('authenticated', 'public.is_org_member(uuid)', 'EXECUTE')::text || '|' ||
        has_function_privilege('anon', 'public.is_org_member(uuid)', 'EXECUTE')::text || '|' ||
        has_function_privilege('authenticated', 'private.is_current_user_org_member(uuid)', 'EXECUTE')::text;
    `, "Verify public and private helper privilege boundary"),
    "false|false|true",
  );
});

console.log(
  "legacy organization member policy repair disposable DB: PASS (hosted 42501 reproduced, 18/18 policies moved private, replay safe, member access restored, cross-tenant and anonymous access denied, public RPC not re-exposed)",
);
