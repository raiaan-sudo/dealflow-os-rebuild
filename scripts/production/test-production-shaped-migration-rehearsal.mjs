#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { createNativePostgresTestAdapter } from "../lib/native-postgres-test-adapter.mjs";
import {
  assertPortfolio,
  assertRecoverableHistory,
  buildSql,
  migrationPortfolio,
  parseObservations,
  partitionPortfolio,
} from "./run-exact-production-migrations.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const FOUNDATION = "20260426000000_forward_foundation_bootstrap.sql";
const EVIDENCE_DIR = process.argv[2];
const FIXTURE_TABLES = [
  "auth.users",
  "public.users",
  "public.organizations",
  "public.organization_memberships",
  "public.campaign_plans",
  "public.system_jobs",
  "public.billing_subscriptions",
  "public.provider_usage_events",
];
const IDS = Object.freeze({
  user: "81000000-0000-4000-8000-000000000001",
  organization: "81000000-0000-4000-8000-000000000002",
  campaign: "81000000-0000-4000-8000-000000000003",
  job: "81000000-0000-4000-8000-000000000004",
  billing: "81000000-0000-4000-8000-000000000005",
  provider: "81000000-0000-4000-8000-000000000006",
});

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requireEvidenceDir() {
  if (!EVIDENCE_DIR || !path.isAbsolute(EVIDENCE_DIR)) {
    throw new Error("absolute evidence directory argument is required");
  }
  const relationship = path.relative(fs.realpathSync(ROOT), path.resolve(EVIDENCE_DIR));
  if (relationship === "" || (!relationship.startsWith(`..${path.sep}`) && relationship !== "..")) {
    throw new Error("evidence directory must be outside the repository");
  }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true, mode: 0o700 });
  fs.chmodSync(EVIDENCE_DIR, 0o700);
}

const portfolio = migrationPortfolio();
assertPortfolio(portfolio);
const partition = partitionPortfolio(portfolio);
const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  expectedVersion: "17.6",
  databasePrefix: `dfp59_${process.pid}`,
  timeoutMs: 300_000,
  maxOutputBytes: 64 * 1024 * 1024,
});

function migrationBody(entry) {
  return fs.readFileSync(path.join(MIGRATIONS, entry.name), "utf8");
}

function installExactProduction59(session) {
  session.psql(`
    alter table auth.users
      add column if not exists email text,
      add column if not exists email_confirmed_at timestamptz,
      add column if not exists banned_until timestamptz,
      add column if not exists deleted_at timestamptz,
      add column if not exists is_anonymous boolean default false;
    alter default privileges in schema public grant all privileges on tables to postgres;
    alter default privileges in schema public grant all privileges on sequences to postgres;
    alter default privileges in schema public grant all privileges on functions to postgres;
    alter default privileges in schema public revoke usage on types from anon, authenticated, service_role;
    set role postgres;
    alter default privileges in schema public grant all privileges on tables to postgres, anon, authenticated, service_role;
    alter default privileges in schema public grant all privileges on sequences to postgres, anon, authenticated, service_role;
    alter default privileges in schema public grant all privileges on functions to postgres, anon, authenticated, service_role;
    alter default privileges in schema public revoke usage on types from anon, authenticated, service_role;
    drop extension pgcrypto;
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
    grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
    reset role;
  `, { label: "Install remote-equivalent Supabase defaults" });
  session.psql(`
    set role postgres;
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[] not null default array[]::text[]
    );
    reset role;
  `, { label: "Install exact production migration history" });
  const foundation = portfolio.entries.find((entry) => entry.name === FOUNDATION);
  session.psql(`begin; set role postgres; ${migrationBody(foundation)} reset role; commit;`, {
    label: "Install authoritative foundation without adopting history",
    timeoutMs: 300_000,
  });
  for (const entry of partition.applied) {
    session.psql(`
      begin;
      set role postgres;
      ${migrationBody(entry)}
      insert into supabase_migrations.schema_migrations(version, statements)
      values ('${entry.version}', array[]::text[]);
      reset role;
      commit;
    `, { label: `Apply exact production migration ${entry.name}`, timeoutMs: 300_000 });
  }
  assert.equal(history(session).length, 59);
}

function history(session) {
  const output = session.psql(
    "select version from supabase_migrations.schema_migrations order by version;",
    { label: "Read isolated migration history" },
  );
  return output.split(/\s+/).filter(Boolean);
}

function seedSyntheticPortfolio(session) {
  session.psql(`
    set role postgres;
    insert into auth.users(id,email,email_confirmed_at) values
      ('${IDS.user}','release-rehearsal@example.invalid','2026-08-12T00:00:00Z');
    insert into public.users(id,email) values
      ('${IDS.user}','release-rehearsal@example.invalid');
    insert into public.organizations(id,name,slug,owner_user_id) values
      ('${IDS.organization}','Release rehearsal','release-rehearsal','${IDS.user}');
    insert into public.organization_memberships(organization_id,user_id,role) values
      ('${IDS.organization}','${IDS.user}','owner');
    insert into public.campaign_plans(id,organization_id,user_id,plan,publish_state) values
      ('${IDS.campaign}','${IDS.organization}','${IDS.user}','{"offer":"synthetic"}'::jsonb,'draft');
    insert into public.system_jobs(
      id,organization_id,user_id,campaign_id,kind,status,payload,created_at
    ) values(
      '${IDS.job}','${IDS.organization}','${IDS.user}','${IDS.campaign}',
      'synthetic_rehearsal','pending','{"synthetic":true}'::jsonb,'2026-08-12T00:00:01Z'
    );
    insert into public.billing_subscriptions(
      id,organization_id,user_id,stripe_customer_id,stripe_subscription_id,
      stripe_price_id,plan_tier,status,current_period_start,current_period_end,
      cancel_at_period_end,metadata,created_at,updated_at
    ) values(
      '${IDS.billing}','${IDS.organization}','${IDS.user}','cus_synthetic','sub_synthetic',
      'price_synthetic','pro','active','2026-08-01T00:00:00Z','2026-09-01T00:00:00Z',
      false,'{"synthetic":true}'::jsonb,'2026-08-12T00:00:02Z','2026-08-12T00:00:02Z'
    );
    insert into public.provider_usage_events(
      id,organization_id,user_id,campaign_id,provider,operation,idempotency_key,
      usage_date,estimated_cost,actual_cost,status,metadata,created_at,updated_at
    ) values(
      '${IDS.provider}','${IDS.organization}','${IDS.user}','${IDS.campaign}',
      'synthetic','rehearsal','release-rehearsal-provider','2026-08-12',0,0,
      'consumed','{"synthetic":true}'::jsonb,'2026-08-12T00:00:03Z','2026-08-12T00:00:03Z'
    );
    reset role;
  `, { label: "Seed nonempty synthetic production-shaped portfolio" });
}

function fixtureMaterial(session) {
  return session.psql(`
    select jsonb_build_array('user',id,email)::text from public.users where id='${IDS.user}'
    union all select jsonb_build_array('organization',id,name,slug,owner_user_id)::text from public.organizations where id='${IDS.organization}'
    union all select jsonb_build_array('membership',organization_id,user_id,role)::text from public.organization_memberships where organization_id='${IDS.organization}'
    union all select jsonb_build_array('campaign',id,organization_id,user_id,plan,publish_state)::text from public.campaign_plans where id='${IDS.campaign}'
    union all select jsonb_build_array('job',id,organization_id,user_id,campaign_id,kind,status,payload)::text from public.system_jobs where id='${IDS.job}'
    union all select jsonb_build_array('billing',id,organization_id,user_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,plan_tier,status,cancel_at_period_end,metadata)::text from public.billing_subscriptions where id='${IDS.billing}'
    union all select jsonb_build_array('provider',id,organization_id,user_id,campaign_id,provider,operation,idempotency_key,usage_date,estimated_cost,actual_cost,status,metadata)::text from public.provider_usage_events where id='${IDS.provider}'
    order by 1;
  `, { label: "Capture stable synthetic portfolio" });
}

function schemaDigest(session) {
  const result = spawnSync(path.join(process.env.DEALFLOW_NATIVE_PGBIN, "pg_dump"), [
    "--host", session.host,
    "--port", String(session.port),
    "--username", session.user,
    "--dbname", session.database,
    "--schema-only", "--no-owner", "--no-privileges", "--no-comments",
    "--no-security-labels", "--no-publications", "--no-subscriptions",
    "--schema=public", "--schema=private",
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 300_000 });
  assert.equal(result.status, 0, "schema dump must succeed");
  const normalized = result.stdout.split(/\r?\n/).filter((line) =>
    !line.startsWith("\\restrict ") && !line.startsWith("\\unrestrict ") &&
    !line.startsWith("-- Dumped from") && !line.startsWith("-- Dumped by")
  ).join("\n").trim();
  return { sha256: sha256(normalized), bytes: Buffer.byteLength(normalized) };
}

function dumpFixtures(session, file) {
  const args = [
    "--host", session.host, "--port", String(session.port), "--username", session.user,
    "--dbname", session.database, "--data-only", "--column-inserts", "--no-owner",
    "--no-privileges", "--file", file,
  ];
  for (const table of FIXTURE_TABLES) args.push("--table", table);
  const result = spawnSync(path.join(process.env.DEALFLOW_NATIVE_PGBIN, "pg_dump"), args, {
    encoding: "utf8", timeout: 300_000,
  });
  assert.equal(result.status, 0, "synthetic fixture backup must succeed");
  fs.chmodSync(file, 0o600);
}

function applyBroker(session, completedPendingVersions = []) {
  const output = session.psql(buildSql(portfolio, { completedPendingVersions }), {
    label: "Apply canonical exact-production migration broker SQL",
    timeoutMs: 300_000,
  });
  const remaining = 72 - completedPendingVersions.length;
  const observations = parseObservations(output, remaining);
  assert.equal(history(session).length, 131);
  return observations;
}

async function completeScenario({ fixtureBackup, restore = false }) {
  return adapter.withDisposableDatabase(async (session) => {
    installExactProduction59(session);
    if (restore) {
      session.psql(fs.readFileSync(fixtureBackup, "utf8"), {
        label: "Restore synthetic exact-59 portfolio backup",
        timeoutMs: 300_000,
      });
    } else {
      seedSyntheticPortfolio(session);
      dumpFixtures(session, fixtureBackup);
    }
    const before = fixtureMaterial(session);
    const observations = applyBroker(session);
    const after = fixtureMaterial(session);
    assert.equal(after, before, "synthetic production-shaped data must be preserved");
    assert.equal(session.psql("select count(*) from public.system_jobs where id='" + IDS.job + "';"), "1");
    return {
      fixtureSha256: sha256(after),
      schema: schemaDigest(session),
      observations: observations.length,
      history: history(session).length,
    };
  });
}

async function proveInterruptedForwardRecovery(fixtureBackup) {
  return adapter.withDisposableDatabase(async (session) => {
    installExactProduction59(session);
    session.psql(fs.readFileSync(fixtureBackup, "utf8"), {
      label: "Restore synthetic fixtures before interruption drill",
      timeoutMs: 300_000,
    });
    const before = fixtureMaterial(session);
    const fullSql = buildSql(portfolio);
    const commits = [...fullSql.matchAll(/^COMMIT;$/gm)];
    assert.ok(commits.length >= 4);
    const partial = `${fullSql.slice(0, commits[3].index + "COMMIT;".length)}\nSELECT pg_advisory_unlock(hashtextextended('dealflow-exact-production-migrations', 0));\n`;
    session.psql(partial, { label: "Apply bounded interrupted migration prefix", timeoutMs: 300_000 });
    const recovery = assertRecoverableHistory(history(session), portfolio);
    assert.equal(recovery.completedPendingVersions.length, 5);
    const observations = applyBroker(session, recovery.completedPendingVersions);
    assert.equal(fixtureMaterial(session), before);
    return { interruptedAfter: 5, recovered: observations.length, finalHistory: history(session).length };
  });
}

async function proveDriftRejection() {
  return adapter.withDisposableDatabase(async (session) => {
    installExactProduction59(session);
    session.psql("alter table public.organizations add column dealflow_rehearsal_drift_probe text;", {
      label: "Inject isolated structural drift",
    });
    let rejection;
    try {
      session.psql(buildSql(portfolio), {
        label: "Reject drifted production shape",
        timeoutMs: 300_000,
      });
    } catch (error) {
      rejection = String(error?.message ?? error);
    }
    assert.match(rejection ?? "", /foundation|adoption|mismatch|drift|expected/i);
    const actual = history(session);
    assert.equal(actual.length, 59);
    assert.ok(!actual.includes("20260426000000"));
    return { status: "PASS", historyAfterRejection: actual.length };
  });
}

requireEvidenceDir();
adapter.preflight();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "dealflow-production-shaped-"));
const fixtureBackup = path.join(temp, "synthetic-fixtures.sql");
let result;
try {
  const first = await completeScenario({ fixtureBackup });
  const second = await completeScenario({ fixtureBackup, restore: true });
  assert.deepEqual(second.schema, first.schema);
  assert.equal(second.fixtureSha256, first.fixtureSha256);
  const recovery = await proveInterruptedForwardRecovery(fixtureBackup);
  const drift = await proveDriftRejection();
  result = {
    schema: "dealflow.production-shaped-migration-rehearsal.v1",
    status: "PASS",
    productionHistoryBefore: 59,
    candidateHistoryAfter: 131,
    forwardDelta: 72,
    portfolioSha256: portfolio.digest,
    syntheticSurfaces: FIXTURE_TABLES.length,
    deterministicRuns: 2,
    first,
    second,
    recovery,
    drift,
  };
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
const evidenceFile = path.join(EVIDENCE_DIR, "production-shaped-migration-rehearsal.json");
fs.writeFileSync(evidenceFile, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ status: result.status, evidenceFile })}\n`);
