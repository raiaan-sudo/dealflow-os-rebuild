#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createNativePostgresTestAdapter,
  sanitizePostgresDiagnostic,
} from "./lib/native-postgres-test-adapter.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const FOUNDATION_LAST =
  "20260710235994_create_execution_and_creative_app_contracts.sql";
const EXACT_INTEGRATED_MIGRATION_COUNT = 104;
const TRANSACTION_OWNING_MIGRATION =
  "20260710160000_validate_and_normalize_pre_candidate_shape.sql";
const REQUIRED_EXTENSIONS = [
  "20260712213000_create_ghl_sandbox_provider_path.sql",
  "20260712214000_create_continuous_reporting_and_safe_optimizer.sql",
  "20260712223000_complete_ghl_activation_and_lifecycle_foundation.sql",
  "20260712235991_create_meta_instant_form_provisioning.sql",
  "20260713010000_harden_support_external_delivery.sql",
  "20260713011000_create_customer_authorized_meta_activation.sql",
  "20260713012000_require_meta_activation_preauthorization.sql",
  "20260713012100_harden_meta_activation_delivery_and_recovery.sql",
  "20260713013000_create_customer_authorized_meta_optimizer_executor.sql",
  "20260713014000_scope_ghl_personalization_to_campaign.sql",
  "20260713015000_bind_verified_partner_attribution_atomically.sql",
  "20260713016000_terminalize_ambiguous_ghl_dispatches.sql",
  "20260713017000_make_paid_creative_dispatch_recoverable.sql",
  "20260713018000_harden_meta_reporting_and_leadgen_integrity.sql",
  "20260713019000_capture_public_lead_and_outbox_atomically.sql",
  "20260713020000_add_fair_reporting_worker_claim.sql",
  "20260713021000_require_paid_activation_for_campaign_creation.sql",
  "20260713022000_reconcile_native_ghl_form_submissions.sql",
  "20260713024000_add_durable_ghl_periodic_form_sweeps.sql",
  "20260713025000_add_generated_video_canonical_storage.sql",
  "20260713026000_add_account_deletion_and_provider_offboarding.sql",
  "20260713027000_add_ghl_location_display_name_finalization.sql",
  "20260713028000_harden_account_deletion_retention_authority.sql",
  "20260715010000_move_legacy_org_member_policies_private.sql",
];
const config = Object.freeze({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
});
const migrations = readdirSync(MIGRATIONS)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();
const foundationBoundary = migrations.indexOf(FOUNDATION_LAST) + 1;
const prefix = `dfi_${process.pid}_${randomBytes(3).toString("hex")}`;
const adapter = createNativePostgresTestAdapter({
  ...config,
  databasePrefix: prefix,
  expectedVersion: "17.6",
  maxOutputBytes: 64 * 1024 * 1024,
  timeoutMs: 180_000,
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function installHistory(session) {
  session.psql(`
    set role postgres;
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[] not null default array[]::text[]
    );
    reset role;
  `, { label: "Create isolated migration history" });
}

function transactionSafeMigrationSource(file, source) {
  const topLevelBegins = [...source.matchAll(/^BEGIN;\s*$/gim)];
  const topLevelCommits = [...source.matchAll(/^COMMIT;\s*$/gim)];
  if (file === TRANSACTION_OWNING_MIGRATION) {
    assert.equal(topLevelBegins.length, 1, `${file} must own exactly one BEGIN boundary`);
    assert.equal(topLevelCommits.length, 1, `${file} must own exactly one COMMIT boundary`);
    return source
      .replace(/^BEGIN;\s*$/im, "")
      .replace(/^COMMIT;\s*$/im, "");
  }
  assert.equal(topLevelBegins.length, 0, `${file} unexpectedly owns a BEGIN boundary`);
  assert.equal(topLevelCommits.length, 0, `${file} unexpectedly owns a COMMIT boundary`);
  return source;
}

function applyMigrationSource(session, { file, version, source }) {
  const transactionSafeSource = transactionSafeMigrationSource(file, source);
  session.psql(
    `begin;
     set role postgres;
     ${transactionSafeSource}
     insert into supabase_migrations.schema_migrations(version, statements)
     values ('${version}', array[]::text[]);
     reset role;
     commit;`,
    { label: `Apply integrated migration ${file}`, timeoutMs: 180_000 },
  );
}

function installRemoteEquivalentDefaults(session) {
  session.psql(`
    alter default privileges in schema public
      grant all privileges on tables to postgres;
    alter default privileges in schema public
      grant all privileges on sequences to postgres;
    alter default privileges in schema public
      grant all privileges on functions to postgres;
    alter default privileges in schema public
      revoke usage on types from anon, authenticated, service_role;

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
    grant select, insert, update, delete on storage.objects
      to anon, authenticated, service_role;
    reset role;
  `, { label: "Install remote-equivalent migration-owner and Storage defaults" });
}

function applyMigrations(session, files) {
  installHistory(session);
  const applied = [];
  const skipped = [];
  for (const file of files) {
    const version = file.slice(0, 14);
    const exists = session.psql(
      `select exists(
         select 1 from supabase_migrations.schema_migrations
          where version = '${version}'
       );`,
      { label: `Check migration history ${version}` },
    );
    if (exists === "t") {
      skipped.push(file);
      continue;
    }
    const source = readFileSync(join(MIGRATIONS, file), "utf8");
    applyMigrationSource(session, { file, version, source });
    applied.push(file);
  }
  return { applied, skipped };
}

function normalizedSchemaDump(session) {
  const result = spawnSync(
    join(config.pgbin, "pg_dump"),
    [
      "--host", session.host,
      "--port", String(session.port),
      "--username", session.user,
      "--dbname", session.database,
      "--schema-only",
      "--no-owner",
      "--no-privileges",
      "--no-comments",
      "--no-security-labels",
      "--no-publications",
      "--no-subscriptions",
      "--schema=public",
      "--schema=private",
    ],
    {
      encoding: "utf8",
      env: {
        PATH: `${config.pgbin}:/usr/bin:/bin`,
        PGHOST: session.host,
        PGPORT: String(session.port),
        PGUSER: session.user,
      },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 180_000,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `Integrated schema dump failed: ${sanitizePostgresDiagnostic(
        result.error?.message || result.stderr,
      )}`,
    );
  }
  const normalized = result.stdout
    .split(/\r?\n/)
    .filter(
      (line) =>
        !line.startsWith("\\restrict ") &&
        !line.startsWith("\\unrestrict ") &&
        !line.startsWith("-- Dumped from") &&
        !line.startsWith("-- Dumped by"),
    )
    .join("\n")
    .trim();
  return { digest: sha256(normalized), bytes: Buffer.byteLength(normalized) };
}

function normalizedSecurityOracle(session) {
  const sections = [
    {
      label: "schema_acl",
      sql: `
        select jsonb_build_object(
          'schema', namespace.nspname,
          'grantor', grantor.rolname,
          'grantee', coalesce(grantee.rolname, 'PUBLIC'),
          'privilege', privilege.privilege_type,
          'grantable', privilege.is_grantable
        )::text
        from pg_namespace namespace
        cross join lateral aclexplode(coalesce(
          namespace.nspacl,
          acldefault('n'::"char", namespace.nspowner)
        )) privilege
        join pg_roles grantor on grantor.oid = privilege.grantor
        left join pg_roles grantee on grantee.oid = privilege.grantee
        where namespace.nspname in ('public', 'private')
        order by namespace.nspname, grantor.rolname,
          coalesce(grantee.rolname, 'PUBLIC'), privilege.privilege_type,
          privilege.is_grantable;
      `,
    },
    {
      label: "relation_acl",
      sql: `
        select jsonb_build_object(
          'schema', namespace.nspname,
          'relation', relation.relname,
          'kind', relation.relkind,
          'grantor', grantor.rolname,
          'grantee', coalesce(grantee.rolname, 'PUBLIC'),
          'privilege', privilege.privilege_type,
          'grantable', privilege.is_grantable
        )::text
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        cross join lateral aclexplode(coalesce(
          relation.relacl,
          acldefault(
            case when relation.relkind = 'S' then 'S'::"char" else 'r'::"char" end,
            relation.relowner
          )
        )) privilege
        join pg_roles grantor on grantor.oid = privilege.grantor
        left join pg_roles grantee on grantee.oid = privilege.grantee
        where namespace.nspname in ('public', 'private')
          and relation.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
        order by namespace.nspname, relation.relname, relation.relkind,
          grantor.rolname, coalesce(grantee.rolname, 'PUBLIC'),
          privilege.privilege_type, privilege.is_grantable;
      `,
    },
    {
      label: "routine_acl",
      sql: `
        select jsonb_build_object(
          'schema', namespace.nspname,
          'routine', routine.proname,
          'arguments', pg_get_function_identity_arguments(routine.oid),
          'grantor', grantor.rolname,
          'grantee', coalesce(grantee.rolname, 'PUBLIC'),
          'privilege', privilege.privilege_type,
          'grantable', privilege.is_grantable
        )::text
        from pg_proc routine
        join pg_namespace namespace on namespace.oid = routine.pronamespace
        cross join lateral aclexplode(coalesce(
          routine.proacl,
          acldefault('f'::"char", routine.proowner)
        )) privilege
        join pg_roles grantor on grantor.oid = privilege.grantor
        left join pg_roles grantee on grantee.oid = privilege.grantee
        where namespace.nspname in ('public', 'private')
        order by namespace.nspname, routine.proname,
          pg_get_function_identity_arguments(routine.oid), grantor.rolname,
          coalesce(grantee.rolname, 'PUBLIC'), privilege.privilege_type,
          privilege.is_grantable;
      `,
    },
    {
      label: "default_acl",
      sql: `
        select jsonb_build_object(
          'owner', owner.rolname,
          'schema', coalesce(namespace.nspname, '*'),
          'objectType', defaults.defaclobjtype,
          'grantor', grantor.rolname,
          'grantee', coalesce(grantee.rolname, 'PUBLIC'),
          'privilege', privilege.privilege_type,
          'grantable', privilege.is_grantable
        )::text
        from pg_default_acl defaults
        join pg_roles owner on owner.oid = defaults.defaclrole
        left join pg_namespace namespace on namespace.oid = defaults.defaclnamespace
        cross join lateral aclexplode(defaults.defaclacl) privilege
        join pg_roles grantor on grantor.oid = privilege.grantor
        left join pg_roles grantee on grantee.oid = privilege.grantee
        where namespace.nspname in ('public', 'private')
           or defaults.defaclnamespace = 0
        order by owner.rolname, coalesce(namespace.nspname, '*'),
          defaults.defaclobjtype, grantor.rolname,
          coalesce(grantee.rolname, 'PUBLIC'), privilege.privilege_type,
          privilege.is_grantable;
      `,
    },
    {
      label: "policies",
      sql: `
        select jsonb_build_object(
          'schema', namespace.nspname,
          'table', relation.relname,
          'name', policy.polname,
          'permissive', policy.polpermissive,
          'command', policy.polcmd,
          'roles', coalesce((
            select string_agg(
              coalesce(role_name.rolname, 'PUBLIC'),
              ',' order by coalesce(role_name.rolname, 'PUBLIC')
            )
            from unnest(policy.polroles) as policy_role(oid)
            left join pg_roles role_name on role_name.oid = policy_role.oid
          ), ''),
          'using', coalesce(pg_get_expr(policy.polqual, policy.polrelid), ''),
          'withCheck', coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '')
        )::text
        from pg_policy policy
        join pg_class relation on relation.oid = policy.polrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname in ('public', 'private')
        order by namespace.nspname, relation.relname, policy.polname;
      `,
    },
    {
      label: "functions",
      sql: `
        select jsonb_build_object(
          'schema', namespace.nspname,
          'name', routine.proname,
          'arguments', pg_get_function_identity_arguments(routine.oid),
          'result', pg_get_function_result(routine.oid),
          'language', language.lanname,
          'securityDefiner', routine.prosecdef,
          'volatility', routine.provolatile,
          'parallel', routine.proparallel,
          'strict', routine.proisstrict,
          'leakproof', routine.proleakproof,
          'configuration', coalesce(array_to_string(routine.proconfig, ','), ''),
          'definition', pg_get_functiondef(routine.oid)
        )::text
        from pg_proc routine
        join pg_namespace namespace on namespace.oid = routine.pronamespace
        join pg_language language on language.oid = routine.prolang
        where namespace.nspname in ('public', 'private')
        order by namespace.nspname, routine.proname,
          pg_get_function_identity_arguments(routine.oid);
      `,
    },
  ];
  const rendered = sections.map(({ label, sql }) => {
    const output = session.psql(sql, { label: `Capture ${label} security oracle` });
    return `${label}\n${output}`;
  });
  const normalized = rendered.join("\n-- next security oracle section --\n");
  return {
    digest: sha256(normalized),
    bytes: Buffer.byteLength(normalized),
    sectionDigests: Object.fromEntries(
      rendered.map((value, index) => [sections[index].label, sha256(value)]),
    ),
  };
}

function assertFunctionPrivilegeMatrix(session, signature, expected) {
  const actual = session.psql(`
    select
      has_function_privilege('anon', '${signature}', 'EXECUTE') || '|' ||
      has_function_privilege('authenticated', '${signature}', 'EXECUTE') || '|' ||
      has_function_privilege('service_role', '${signature}', 'EXECUTE');
  `, { label: `Verify RPC grants for ${signature}` });
  assert.equal(actual, expected, `unexpected RPC privilege matrix for ${signature}`);
}

function verifyIntegratedObjects(session) {
  const tables = session.psql(`
    select string_agg(c.relname, ',' order by c.relname)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relname in (
         'ghl_billing_activation_requests',
         'ghl_location_personalizations',
         'ghl_runtime_controls',
         'meta_instant_form_provisioning',
         'meta_optimization_action_receipts',
         'meta_optimization_execution_intents',
         'meta_optimization_policy_authorizations',
         'meta_optimization_runtime_controls',
         'meta_reporting_schedules',
         'meta_campaign_activation_intents',
         'meta_campaign_activation_objects',
         'meta_campaign_activation_preauthorizations',
         'meta_campaign_activation_runtime_controls',
         'support_delivery_receipts'
       );
  `, { label: "Verify integrated extension tables" });
  assert.equal(
    tables,
    "ghl_billing_activation_requests,ghl_location_personalizations,ghl_runtime_controls,meta_campaign_activation_intents,meta_campaign_activation_objects,meta_campaign_activation_preauthorizations,meta_campaign_activation_runtime_controls,meta_instant_form_provisioning,meta_optimization_action_receipts,meta_optimization_execution_intents,meta_optimization_policy_authorizations,meta_optimization_runtime_controls,meta_reporting_schedules,support_delivery_receipts",
  );
  assert.equal(
    session.psql(
      `select count(*)
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in (
            'ghl_billing_activation_requests',
            'ghl_location_personalizations',
            'meta_instant_form_provisioning',
            'meta_optimization_action_receipts',
            'meta_reporting_schedules',
            'support_delivery_receipts'
          )
          and c.relrowsecurity
          and c.relforcerowsecurity;`,
      { label: "Verify integrated extension RLS" },
    ),
    "6",
  );
  assert.equal(
    session.psql(`
      select string_agg(
        c.relname || ':' || c.relrowsecurity || ':' || c.relforcerowsecurity,
        ',' order by c.relname
      )
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'meta_campaign_activation_intents',
          'meta_campaign_activation_objects',
          'meta_campaign_activation_preauthorizations',
          'meta_campaign_activation_runtime_controls'
        );
    `, { label: "Verify activation tables use forced RLS" }),
    "meta_campaign_activation_intents:true:true,meta_campaign_activation_objects:true:true,meta_campaign_activation_preauthorizations:true:true,meta_campaign_activation_runtime_controls:true:true",
  );
  assert.equal(
    session.psql(`
      select string_agg(
        environment || ':' || activation_writes_enabled || ':' || control_generation,
        ',' order by environment
      )
      from public.meta_campaign_activation_runtime_controls;
    `, { label: "Verify activation controls are default closed" }),
    "production:false:1,staging:false:1",
  );
  assert.equal(
    session.psql(`
      select string_agg(
        c.relname || ':' || c.relrowsecurity || ':' || c.relforcerowsecurity,
        ',' order by c.relname
      )
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in (
        'meta_optimization_runtime_controls',
        'meta_optimization_policy_authorizations',
        'meta_optimization_execution_intents'
      );
    `, { label: "Verify optimization authority tables use forced RLS" }),
    "meta_optimization_execution_intents:true:true,meta_optimization_policy_authorizations:true:true,meta_optimization_runtime_controls:true:true",
  );
  assert.equal(
    session.psql(`
      select string_agg(environment||':'||provider_mode||':'||execution_writes_enabled||':'||global_kill_switch||':'||control_generation,',' order by environment)
      from public.meta_optimization_runtime_controls;
    `, { label: "Verify optimization controls are default closed" }),
    "production:shadow:false:true:1,staging:shadow:false:true:1",
  );

  const optimizationCustomerRpcs = [
    "public.get_meta_optimization_policy_status(uuid,uuid)",
    "public.revoke_meta_optimization_policy(uuid,uuid,uuid,text)",
  ];
  const optimizationWorkerRpcs = [
    "public.authorize_meta_optimization_policy(uuid,uuid,uuid,bigint,text,text,text)",
    "public.set_meta_optimization_staging_runtime_control(bigint,boolean,boolean,text,text)",
    "public.set_meta_optimization_production_runtime_control(bigint,boolean,boolean,text,text)",
    "public.enqueue_meta_optimization_execution_intent(uuid,uuid,uuid,uuid,text,text,text,bigint,text)",
    "public.claim_meta_optimization_execution_intent(text,text,integer)",
    "public.arm_meta_optimization_execution_intent(uuid,text,uuid,bigint,jsonb)",
    "public.confirm_meta_optimization_execution_dispatch(uuid,text,uuid,bigint,uuid)",
    "public.release_meta_optimization_execution_claim(uuid,text,uuid,bigint,text,text,text)",
    "public.settle_meta_optimization_execution_intent(uuid,text,uuid,bigint,uuid,text,boolean,text,jsonb,text,text)",
  ];
  for (const signature of optimizationCustomerRpcs) {
    assertFunctionPrivilegeMatrix(session, signature, "false|true|false");
  }
  for (const signature of optimizationWorkerRpcs) {
    assertFunctionPrivilegeMatrix(session, signature, "false|false|true");
  }
  assert.equal(
    session.psql(`
      select string_agg(column_name, ',' order by ordinal_position)
      from information_schema.columns
      where table_schema='public'
        and table_name='meta_optimization_execution_intents'
        and column_name in (
          'dispatch_authority_nonce', 'dispatch_authority_checked_at',
          'dispatch_control_generation', 'dispatch_authority_digest'
        );
    `, { label: "Verify durable optimizer dispatch fence columns" }),
    "dispatch_authority_nonce,dispatch_authority_checked_at,dispatch_control_generation,dispatch_authority_digest",
  );
  for (const table of [
    "meta_optimization_runtime_controls",
    "meta_optimization_policy_authorizations",
    "meta_optimization_execution_intents",
  ]) {
    assert.equal(
      session.psql(`
        select
          has_table_privilege('anon','public.${table}','SELECT')||'|'||
          has_table_privilege('authenticated','public.${table}','SELECT')||'|'||
          has_table_privilege('service_role','public.${table}','SELECT')||'|'||
          has_table_privilege('service_role','public.${table}','INSERT')||'|'||
          has_table_privilege('service_role','public.${table}','UPDATE')||'|'||
          has_table_privilege('service_role','public.${table}','DELETE');
      `, { label: `Verify optimizer table ACL for ${table}` }),
      "false|false|true|false|false|false",
    );
  }

  const customerRpcs = [
    "public.cancel_meta_campaign_activation(uuid)",
    "public.get_meta_campaign_activation_authorization_status(uuid,uuid)",
    "public.cancel_meta_campaign_activation_preauthorization(uuid,uuid,uuid)",
  ];
  const revokedRpcs = [
    "public.authorize_meta_campaign_activation(uuid,uuid,uuid,timestamp with time zone,bigint,text,text,text)",
  ];
  const workerRpcs = [
    "public.claim_due_meta_campaign_activation(text,text,integer)",
    "public.renew_meta_campaign_activation_claim(uuid,text,uuid,bigint,integer)",
    "public.arm_meta_campaign_activation_object(uuid,uuid,text,uuid,bigint)",
    "public.record_meta_campaign_activation_receipt(uuid,uuid,text,uuid,bigint,text,text,jsonb)",
    "public.settle_meta_campaign_activation_object(uuid,uuid,text,uuid,bigint)",
    "public.record_meta_campaign_activation_delivery_state(uuid,text,uuid,bigint,text,text,text)",
    "public.settle_meta_campaign_activation(uuid,text,uuid,bigint,text,text,text)",
    "public.reconcile_meta_campaign_activation_object(uuid,uuid,text,text,text,text)",
    "public.preauthorize_meta_campaign_activation(uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,text,text)",
    "public.schedule_and_preauthorize_meta_campaign_activation(uuid,uuid,uuid,text,timestamp with time zone,text,bigint,text,text,text,text,text,text,text,jsonb,text,text)",
    "public.assert_meta_campaign_activation_preauthorization(uuid,uuid,uuid,uuid)",
    "public.finalize_meta_campaign_activation_preauthorization(uuid,uuid,uuid,uuid)",
    "public.finalize_due_meta_campaign_activation_preauthorizations(integer)",
    "public.arm_meta_instant_form_subscription_mutation(uuid,uuid,bigint)",
    "public.record_meta_instant_form_subscription_receipt(uuid,uuid,bigint,text,text)",
    "public.reacquire_meta_instant_form_verification(uuid,uuid,integer)",
  ];
  for (const signature of revokedRpcs) {
    assertFunctionPrivilegeMatrix(session, signature, "false|false|false");
  }
  for (const signature of customerRpcs) {
    assertFunctionPrivilegeMatrix(session, signature, "false|true|false");
  }
  for (const signature of workerRpcs) {
    assertFunctionPrivilegeMatrix(session, signature, "false|false|true");
  }
  assert.equal(
    session.psql(`
      select count(*)
      from pg_proc routine
      where routine.oid = any(array[
        ${[...revokedRpcs, ...customerRpcs, ...workerRpcs]
          .map((signature) => `to_regprocedure('${signature}')`)
          .join(",\n        ")}
      ]::oid[])
        and routine.prosecdef;
    `, { label: "Verify activation RPCs are security definer" }),
    String(revokedRpcs.length + customerRpcs.length + workerRpcs.length),
  );

  for (const table of [
    "meta_campaign_activation_intents",
    "meta_campaign_activation_objects",
    "meta_campaign_activation_preauthorizations",
    "meta_campaign_activation_runtime_controls",
  ]) {
    assert.equal(
      session.psql(`
        select
          has_table_privilege('anon', 'public.${table}', 'SELECT') || '|' ||
          has_table_privilege('authenticated', 'public.${table}', 'SELECT') || '|' ||
          has_table_privilege('service_role', 'public.${table}', 'SELECT') || '|' ||
          has_table_privilege('service_role', 'public.${table}', 'INSERT') || '|' ||
          has_table_privilege('service_role', 'public.${table}', 'UPDATE') || '|' ||
          has_table_privilege('service_role', 'public.${table}', 'DELETE');
      `, { label: `Verify activation table ACL for ${table}` }),
      "false|false|true|false|false|false",
    );
  }
  assert.equal(
    session.psql(
      "select count(*) from supabase_migrations.schema_migrations;",
      { label: "Count integrated migration history" },
    ),
    String(migrations.length),
  );
}

async function proveFreshAndReplay() {
  return adapter.withDisposableDatabase(async (session) => {
    installRemoteEquivalentDefaults(session);
    const first = applyMigrations(session, migrations);
    assert.equal(first.applied.length, migrations.length);
    assert.equal(first.skipped.length, 0);
    verifyIntegratedObjects(session);
    const beforeReplay = {
      schema: normalizedSchemaDump(session),
      security: normalizedSecurityOracle(session),
    };
    const replay = applyMigrations(session, migrations);
    assert.equal(replay.applied.length, 0);
    assert.equal(replay.skipped.length, migrations.length);
    const afterReplay = {
      schema: normalizedSchemaDump(session),
      security: normalizedSecurityOracle(session),
    };
    assert.deepEqual(afterReplay, beforeReplay);
    return beforeReplay;
  });
}

async function proveFoundationThenExtensions() {
  return adapter.withDisposableDatabase(async (session) => {
    installRemoteEquivalentDefaults(session);
    const foundation = applyMigrations(
      session,
      migrations.slice(0, foundationBoundary),
    );
    assert.equal(foundation.applied.length, 80);
    const extensions = applyMigrations(
      session,
      migrations.slice(foundationBoundary),
    );
    assert.equal(extensions.applied.length, migrations.length - 80);
    verifyIntegratedObjects(session);
    return {
      schema: normalizedSchemaDump(session),
      security: normalizedSecurityOracle(session),
    };
  });
}

async function provePerFileAtomicFailure() {
  return adapter.withDisposableDatabase(async (session) => {
    installRemoteEquivalentDefaults(session);
    installHistory(session);
    let failed = false;
    try {
      applyMigrationSource(session, {
        file: "20990101000000_atomic_failure_probe.sql",
        version: "20990101000000",
        source: `
          create table public.dealflow_atomic_failure_probe(id integer primary key);
          select 1 / 0;
        `,
      });
    } catch {
      failed = true;
    }
    assert.equal(failed, true, "the injected transactional migration must fail");
    assert.equal(
      session.psql("select to_regclass('public.dealflow_atomic_failure_probe') is null;", {
        label: "Verify failed migration DDL rolled back",
      }),
      "t",
    );
    assert.equal(
      session.psql(
        "select count(*) from supabase_migrations.schema_migrations where version = '20990101000000';",
        { label: "Verify failed migration history rolled back" },
      ),
      "0",
    );
  });
}

let createdPostgresRole = false;
try {
  assert.equal(foundationBoundary, 80);
  assert.equal(migrations.length, EXACT_INTEGRATED_MIGRATION_COUNT);
  assert.equal(
    new Set(migrations.map((name) => name.slice(0, 14))).size,
    migrations.length,
  );
  for (const required of REQUIRED_EXTENSIONS) assert.ok(migrations.includes(required));
  adapter.preflight();
  const postgresExists = adapter.psql(
    "select exists(select 1 from pg_roles where rolname = 'postgres');",
  );
  if (postgresExists !== "t") {
    adapter.psql("create role postgres superuser nologin;", {
      label: "Create isolated migration-owner role",
    });
    createdPostgresRole = true;
  }
  const fresh = await proveFreshAndReplay();
  const staged = await proveFoundationThenExtensions();
  await provePerFileAtomicFailure();
  assert.deepEqual(staged, fresh);
  assert.deepEqual(adapter.listDisposableDatabases(), []);
  console.log(
    `Integrated migration chain PASS: ${migrations.length} migrations, ` +
      `fresh/replay/foundation-extension schema=${fresh.schema.digest}, ` +
      `schemaBytes=${fresh.schema.bytes}, security=${fresh.security.digest}, ` +
      `securityBytes=${fresh.security.bytes}`,
  );
} finally {
  if (createdPostgresRole) {
    adapter.psql("drop role if exists postgres;", {
      label: "Remove isolated migration-owner role",
    });
  }
}
