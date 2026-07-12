#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createDisposablePostgresHarness } from "./lib/disposable-postgres-harness.mjs";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "supabase/migrations/20260710235600_harden_sms_delivery_receipts.sql",
);
const protocolMigrationPath = path.join(
  root,
  "supabase/migrations/20260710235980_harden_sms_protocol_and_tenant_fk.sql",
);
const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const containerName = `dealflow-sms-receipts-${process.pid}-${randomBytes(4).toString("hex")}`;
const disposablePostgres = createDisposablePostgresHarness({ containerName, image });
const password = randomBytes(24).toString("hex");
const organizationA = "00000000-0000-4000-8000-000000000001";
const organizationB = "00000000-0000-4000-8000-000000000002";
const leadA = "10000000-0000-4000-8000-000000000001";
const leadB = "10000000-0000-4000-8000-000000000002";
const agentA = "11000000-0000-4000-8000-000000000001";
const agentB = "11000000-0000-4000-8000-000000000002";
const agentC = "11000000-0000-4000-8000-000000000003";
const digestA = "a".repeat(64);
const digestB = "b".repeat(64);
let cleaned = false;

function docker(args, options = {}) {
  return disposablePostgres.run(args, options);
}

function sanitize(value) {
  return String(value ?? "")
    .replaceAll(password, "[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .trim()
    .slice(-2_000);
}

function requireSuccess(result, label) {
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${sanitize(result.error?.message || result.stderr || result.stdout)}`);
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
  assert.match(sanitize(result.stderr), pattern, `${label}: wrong SQL rejection`);
}

function psqlAsync(sql) {
  return disposablePostgres.psqlAsync(psqlArgs(), sql);
}

function rows(output) {
  return String(output ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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

async function waitForPostgres() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const initProcess = docker([
      "exec",
      containerName,
      "cat",
      "/proc/1/comm",
    ], { timeout: 5_000 });
    const health = docker([
      "inspect",
      "--format={{.State.Health.Status}}",
      containerName,
    ], { timeout: 5_000 });
    const ready = docker([
      "exec",
      containerName,
      "pg_isready",
      "--username=supabase_admin",
      "--dbname=postgres",
    ], { timeout: 5_000 });
    if (
      initProcess.status === 0 &&
      initProcess.stdout.trim().toLowerCase().includes("postgres") &&
      health.status === 0 &&
      health.stdout.trim() === "healthy" &&
      ready.status === 0
    ) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Disposable PostgreSQL did not become ready within 30 seconds.");
}

function loadRouteErrorClassifier() {
  const source = fs.readFileSync(path.join(root, "src/app/api/sms/twilio/route.ts"), "utf8")
    .replace(
      "function handleTwilioWebhookError(error: unknown)",
      "export function handleTwilioWebhookError(error: unknown)",
    );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  class TestApiError extends Error {
    constructor(status, message, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  const stubs = new Proxy({
    ApiError: TestApiError,
    handleApiError: (error) => Response.json({ code: error.code }, { status: error.status }),
  }, {
    get(target, property) {
      if (property in target) return target[property];
      return () => undefined;
    },
  });
  const loaded = { exports: {} };
  const evaluate = new Function("require", "module", "exports", output);
  evaluate(() => stubs, loaded, loaded.exports);
  return { ...loaded.exports, TestApiError };
}

try {
  assert.ok(fs.existsSync(migrationPath), "SMS receipt migration is missing");
  assert.ok(fs.existsSync(protocolMigrationPath), "SMS protocol cutover migration is missing");
  requireSuccess(docker(["image", "inspect", image], { timeout: 15_000 }), "cached PostgreSQL image");
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
  ], { timeout: 30_000 }), "start disposable PostgreSQL");
  await waitForPostgres();

  const migration = fs.readFileSync(migrationPath, "utf8");
  psql(`
    create schema if not exists auth;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end $$;
    create or replace function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    create table public.organizations (id uuid primary key);
    create table public.leads (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id) on delete cascade,
      phone text null,
      status text not null default 'new',
      metadata jsonb null,
      consent_metadata jsonb null,
      sms_opted_out_at timestamptz null
    );
    create unique index leads_id_organization_unique
      on public.leads(id, organization_id);
    create table public.agent_profiles (
      id uuid primary key,
      tenant_id uuid not null references public.organizations(id)
    );
    create table public.lead_notifications (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null,
      lead_id uuid not null references public.leads(id) on delete cascade,
      agent_id uuid null,
      channel text not null default 'sms',
      provider text not null default 'twilio',
      purpose text not null,
      provider_message_id text null,
      status text not null default 'queued',
      error_message text null,
      sent_at timestamptz null,
      delivered_at timestamptz null,
      failed_at timestamptz null,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now()),
      constraint lead_notifications_status_check
        check (status in ('queued', 'sent', 'delivered', 'undelivered', 'failed'))
    );
    create unique index lead_notifications_provider_message_id_key
      on public.lead_notifications(provider_message_id)
      where provider_message_id is not null;
    create unique index lead_notifications_once_per_lead_agent_purpose
      on public.lead_notifications(tenant_id, lead_id, agent_id, purpose)
      where agent_id is not null;
    create unique index lead_notifications_once_per_lead_unassigned_purpose
      on public.lead_notifications(tenant_id, lead_id, purpose)
      where agent_id is null;
    create table public.app_schema_metadata (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default timezone('utc', now())
    );
    insert into public.organizations(id) values ('${organizationA}'), ('${organizationB}');
    insert into public.agent_profiles(id, tenant_id) values
      ('${agentA}', '${organizationA}'),
      ('${agentB}', '${organizationA}'),
      ('${agentC}', '${organizationA}');
    insert into public.leads(id, organization_id, phone)
      values ('${leadA}', '${organizationA}', '+14165550100'), ('${leadB}', '${organizationB}', '+14165550101');
    insert into public.lead_notifications(id, tenant_id, lead_id, purpose, status)
      values ('20000000-0000-4000-8000-000000000001', '${organizationA}', '${leadA}', 'new_lead_alert', 'queued');
    ${migration}
  `, "bootstrap and apply SMS receipt migration");

  assert.equal(
    psql("select status from public.lead_notifications where id = '20000000-0000-4000-8000-000000000001';", "legacy queue"),
    "operator_action_required",
    "legacy queued rows must not become automatically sendable",
  );

  const outboundId = "20000000-0000-4000-8000-000000000002";
  psql(`insert into public.lead_notifications
    (id, tenant_id, lead_id, agent_id, purpose, status, request_digest)
    values ('${outboundId}', '${organizationA}', '${leadA}', '${agentA}', 'new_lead_alert', 'queued', '${digestA}');`, "seed outbound receipt");
  const concurrentSql = (worker) => `
    begin;
    set request.jwt.claim.role = 'service_role';
    select id, status, delivery_locked_by, delivery_lease_token, delivery_lease_generation
    from public.claim_lead_notification_delivery('${outboundId}', '${worker}', '${digestA}', 120000);
    select pg_sleep(0.2);
    commit;
  `;
  const [claimA, claimB] = await Promise.all([
    psqlAsync(concurrentSql("worker-a")),
    psqlAsync(concurrentSql("worker-b")),
  ]);
  requireSuccess(claimA, "outbound concurrent claim A");
  requireSuccess(claimB, "outbound concurrent claim B");
  const claimRows = [...rows(claimA.stdout), ...rows(claimB.stdout)].filter((row) => row.includes(outboundId));
  assert.equal(claimRows.length, 2);
  const owners = new Set(claimRows.map((row) => row.split("|")[2]));
  assert.equal(owners.size, 1, "concurrent outbound claims must expose one lease owner");
  const outboundLease = psql(`select delivery_locked_by, delivery_lease_token, delivery_lease_generation
    from public.lead_notifications where id = '${outboundId}';`, "read outbound lease").split("|");
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select status, delivery_locked_by from public.claim_lead_notification_delivery(
        '${outboundId}', 'different-digest-worker', '${digestB}', 120000
      );`, "do not poison an active provider attempt"),
    `sending|${outboundLease[0]}`,
  );
  assert.equal(psql(`set request.jwt.claim.role = 'service_role';
    select public.settle_lead_notification_delivery(
      '${outboundId}', 'wrong-worker', '${outboundLease[1]}', ${outboundLease[2]},
      'sent', 'SM-wrong', null
    );`, "reject wrong outbound settlement"), "f");
  assert.equal(psql(`set request.jwt.claim.role = 'service_role';
    select public.settle_lead_notification_delivery(
      '${outboundId}', '${outboundLease[0]}', '${outboundLease[1]}', ${outboundLease[2]},
      'sent', 'SM-monotonic', null
    );`, "settle outbound receipt"), "t");

  assert.equal(psql(`set request.jwt.claim.role = 'service_role';
    select public.apply_lead_notification_delivery_status('SM-monotonic', 'queued', null);`, "apply late queued callback"), "t");
  assert.equal(psql(`select status from public.lead_notifications where id = '${outboundId}';`, "queued callback result"), "sent");
  psql(`set request.jwt.claim.role = 'service_role';
    select public.apply_lead_notification_delivery_status('SM-monotonic', 'delivered', null);`, "apply delivered callback");
  psql(`set request.jwt.claim.role = 'service_role';
    select public.apply_lead_notification_delivery_status('SM-monotonic', 'failed', 'late failure');`, "apply late failed callback");
  assert.equal(psql(`select status from public.lead_notifications where id = '${outboundId}';`, "terminal callback result"), "delivered");

  const expiredId = "20000000-0000-4000-8000-000000000003";
  psql(`insert into public.lead_notifications
      (id, tenant_id, lead_id, agent_id, purpose, status, request_digest)
    values ('${expiredId}', '${organizationA}', '${leadA}', '${agentB}', 'lead_reply_template', 'queued', '${digestA}');
    set request.jwt.claim.role = 'service_role';
    select id from public.claim_lead_notification_delivery('${expiredId}', 'crashed-worker', '${digestA}', 30000);
    update public.lead_notifications set delivery_locked_until = timezone('utc', now()) - interval '1 second'
      where id = '${expiredId}';
    select id from public.claim_lead_notification_delivery('${expiredId}', 'retry-worker', '${digestA}', 30000);`, "expire ambiguous outbound send");
  assert.equal(
    psql(`select status, delivery_attempt_count, delivery_locked_by is null
      from public.lead_notifications where id = '${expiredId}';`, "expired outbound state"),
    "operator_action_required|1|t",
  );

  const collisionId = "20000000-0000-4000-8000-000000000004";
  psql(`insert into public.lead_notifications
      (id, tenant_id, lead_id, agent_id, purpose, status, request_digest)
    values ('${collisionId}', '${organizationA}', '${leadA}', '${agentC}', 'lead_reply_template', 'queued', '${digestA}');
    set request.jwt.claim.role = 'service_role';
    select id from public.claim_lead_notification_delivery('${collisionId}', 'collision-worker', '${digestB}', 30000);`, "outbound digest collision");
  assert.equal(psql(`select status from public.lead_notifications where id = '${collisionId}';`, "outbound collision state"), "operator_action_required");

  const inboundSid = "SM-inbound-concurrent";
  const inboundClaimSql = (worker) => `
    begin;
    set request.jwt.claim.role = 'service_role';
    select provider_message_id, status, locked_by, lease_token, lease_generation
    from public.claim_inbound_sms_receipt(
      '${inboundSid}', '${organizationA}', '${leadA}', '${digestA}', '${worker}', 120000
    );
    select pg_sleep(0.2);
    commit;
  `;
  const [inboundA, inboundB] = await Promise.all([
    psqlAsync(inboundClaimSql("inbound-a")),
    psqlAsync(inboundClaimSql("inbound-b")),
  ]);
  requireSuccess(inboundA, "inbound concurrent claim A");
  requireSuccess(inboundB, "inbound concurrent claim B");
  const inboundRows = [...rows(inboundA.stdout), ...rows(inboundB.stdout)].filter((row) => row.includes(inboundSid));
  assert.equal(inboundRows.length, 2);
  assert.equal(new Set(inboundRows.map((row) => row.split("|")[2])).size, 1, "concurrent inbound claims must expose one lease owner");
  const inboundLease = psql(`select locked_by, lease_token, lease_generation
    from public.inbound_sms_receipts where provider_message_id = '${inboundSid}';`, "read inbound lease").split("|");
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select status, last_error_code from public.claim_inbound_sms_receipt(
        '${inboundSid}', '${organizationB}', '${leadB}', '${digestB}', 'active-collision', 120000
      );`, "fail active inbound collision without poisoning lease"),
    "operator_action_required|inbound_sms_identity_collision",
  );
  assert.equal(
    psql(`select status, locked_by from public.inbound_sms_receipts
      where provider_message_id = '${inboundSid}';`, "active inbound lease survived collision"),
    `processing|${inboundLease[0]}`,
  );
  assert.equal(psql(`set request.jwt.claim.role = 'service_role';
    select public.settle_inbound_sms_receipt(
      '${inboundSid}', '${inboundLease[0]}', '${inboundLease[1]}', ${inboundLease[2]},
      'retrying', null, 'transient_test_failure'
    );`, "settle inbound retry"), "t");
  const retryClaim = psql(`set request.jwt.claim.role = 'service_role';
    select status, locked_by, lease_token, lease_generation
    from public.claim_inbound_sms_receipt(
      '${inboundSid}', '${organizationA}', '${leadA}', '${digestA}', 'inbound-retry', 120000
    );`, "retry inbound claim").split("|");
  assert.equal(retryClaim[0], "processing");
  assert.equal(retryClaim[1], "inbound-retry");
  assert.ok(Number(retryClaim[3]) > Number(inboundLease[2]));
  assert.equal(psql(`set request.jwt.claim.role = 'service_role';
    select public.settle_inbound_sms_receipt(
      '${inboundSid}', '${inboundLease[0]}', '${inboundLease[1]}', ${inboundLease[2]},
      'completed', '{}'::jsonb, null
    );`, "reject stale inbound settlement"), "f");
  const completedResult = JSON.stringify({ leadId: leadA, response: "done", status: "engaged", slots: [] });
  assert.equal(psql(`set request.jwt.claim.role = 'service_role';
    select public.settle_inbound_sms_receipt(
      '${inboundSid}', 'inbound-retry', '${retryClaim[2]}', ${retryClaim[3]},
      'completed', $result$${completedResult}$result$::jsonb, null
    );`, "complete inbound receipt"), "t");
  const replay = psql(`set request.jwt.claim.role = 'service_role';
    select status, result->>'leadId', result->>'response'
    from public.claim_inbound_sms_receipt(
      '${inboundSid}', '${organizationA}', '${leadA}', '${digestA}', 'inbound-replay', 120000
    );`, "replay completed inbound receipt");
  assert.equal(replay, `completed|${leadA}|done`);

  psql(`set request.jwt.claim.role = 'service_role';
    select status from public.claim_inbound_sms_receipt(
      '${inboundSid}', '${organizationB}', '${leadB}', '${digestB}', 'collision', 120000
    );`, "inbound identity collision");
  assert.equal(
    psql(`select status, last_error_code from public.inbound_sms_receipts
      where provider_message_id = '${inboundSid}';`, "inbound collision state"),
    "operator_action_required|inbound_sms_identity_collision",
  );

  psqlMustFail(`set request.jwt.claim.role = 'service_role';
    select * from public.claim_inbound_sms_receipt(
      'SM-cross-tenant', '${organizationA}', '${leadB}', '${digestA}', 'cross-tenant', 120000
    );`, /inbound_sms_receipts_lead_organization_fk/, "reject cross-tenant inbound receipt identity");

  const stopSid = "SM-compliance-stop";
  const stopLease = psql(`set request.jwt.claim.role = 'service_role';
    select locked_by, lease_token, lease_generation
    from public.claim_inbound_sms_receipt(
      '${stopSid}', '${organizationA}', '${leadA}', '${digestA}', 'stop-worker', 120000
    );`, "claim STOP receipt").split("|");
  psqlMustFail(`set request.jwt.claim.role = 'service_role';
    select * from public.complete_inbound_sms_compliance_receipt(
      '${stopSid}', '${stopLease[0]}', null, ${stopLease[2]}, 'opt_out'
    );`, /compliance lease identity is incomplete/, "reject null STOP lease token");
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select count(*) from public.complete_inbound_sms_compliance_receipt(
        '${stopSid}', 'wrong-worker', '${stopLease[1]}', ${stopLease[2]}, 'opt_out'
      );`, "fence wrong STOP worker"),
    "0",
  );
  assert.equal(
    psql(`select status, sms_opted_out_at is null from public.leads where id = '${leadA}';`, "wrong STOP worker state"),
    "new|t",
  );
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select status, result->>'status', result->>'complianceAction', result->>'response'
      from public.complete_inbound_sms_compliance_receipt(
        '${stopSid}', '${stopLease[0]}', '${stopLease[1]}', ${stopLease[2]}, 'opt_out'
      );`, "atomically complete STOP"),
    "completed|lost|opt_out|You have been unsubscribed and will not receive more messages.",
  );
  const stoppedState = psql(`select leads.status, sms_opted_out_at::text,
      metadata->'sms_opt_out'->>'status', attempt_count
    from public.leads cross join public.inbound_sms_receipts
    where leads.id = '${leadA}' and provider_message_id = '${stopSid}';`, "read STOP state");
  assert.match(stoppedState, /^lost\|[^|]+\|opted_out\|1$/);
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select status, result->>'complianceAction', attempt_count
      from public.claim_inbound_sms_receipt(
        '${stopSid}', '${organizationA}', '${leadA}', '${digestA}', 'post-crash-replay', 120000
      );`, "replay STOP after simulated post-commit crash"),
    "completed|opt_out|1",
  );
  assert.equal(
    psql(`select leads.status, sms_opted_out_at::text,
      metadata->'sms_opt_out'->>'status', attempt_count
    from public.leads cross join public.inbound_sms_receipts
    where leads.id = '${leadA}' and provider_message_id = '${stopSid}';`, "STOP replay state"),
    stoppedState,
  );

  const startSid = "SM-compliance-start";
  const startLease = psql(`set request.jwt.claim.role = 'service_role';
    select locked_by, lease_token, lease_generation
    from public.claim_inbound_sms_receipt(
      '${startSid}', '${organizationA}', '${leadA}', '${digestB}', 'start-worker', 120000
    );`, "claim START receipt").split("|");
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select status, result->>'complianceAction'
      from public.complete_inbound_sms_compliance_receipt(
        '${startSid}', '${startLease[0]}', '${startLease[1]}', ${startLease[2]}, 'opt_in'
      );`, "atomically complete START"),
    "completed|opt_in",
  );
  const startedState = psql(`select sms_opted_out_at is null,
      metadata->'sms_opt_in'->>'status',
      consent_metadata->'sms'->>'consented',
      consent_metadata->>'source'
    from public.leads where id = '${leadA}';`, "read START state");
  assert.equal(startedState, "t|opted_in|true|inbound_start");
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select status, result->>'complianceAction', attempt_count
      from public.claim_inbound_sms_receipt(
        '${startSid}', '${organizationA}', '${leadA}', '${digestB}', 'start-replay', 120000
      );`, "replay START after simulated post-commit crash"),
    "completed|opt_in|1",
  );
  assert.equal(
    psql(`select sms_opted_out_at is null,
      metadata->'sms_opt_in'->>'status',
      consent_metadata->'sms'->>'consented',
      consent_metadata->>'source'
    from public.leads where id = '${leadA}';`, "START replay state"),
    startedState,
  );

  const blockedSid = "SM-automation-blocked";
  const blockedLease = psql(`set request.jwt.claim.role = 'service_role';
    select locked_by, lease_token, lease_generation
    from public.claim_inbound_sms_receipt(
      '${blockedSid}', '${organizationA}', '${leadA}', '${"c".repeat(64)}', 'blocked-worker', 120000
    );`, "claim blocked non-compliance receipt").split("|");
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select public.settle_inbound_sms_receipt(
        '${blockedSid}', '${blockedLease[0]}', '${blockedLease[1]}', ${blockedLease[2]},
        'completed', '{"leadId":"${leadA}","response":"","status":"lost","slots":[],"blocked":true}'::jsonb, null
      );`, "complete blocked non-compliance receipt"),
    "t",
  );
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select status, result->>'blocked', result->>'response', attempt_count
      from public.claim_inbound_sms_receipt(
        '${blockedSid}', '${organizationA}', '${leadA}', '${"c".repeat(64)}', 'blocked-replay', 120000
      );`, "replay blocked non-compliance receipt"),
    "completed|true||1",
  );

  psqlMustFail(`set request.jwt.claim.role = 'authenticated';
    select * from public.claim_inbound_sms_receipt(
      'SM-unauthorized', '${organizationA}', '${leadA}', '${digestA}', 'bad-worker', 120000
    );`, /service_role is required/, "reject non-service inbound claim");

  const protocolMigration = fs.readFileSync(protocolMigrationPath, "utf8");
  psql(protocolMigration, "apply outbound SMS protocol cutover migration");
  assert.equal(
    psql(`select
      has_table_privilege('service_role', 'public.lead_notifications', 'INSERT'),
      has_table_privilege('service_role', 'public.lead_notifications', 'UPDATE'),
      has_function_privilege(
        'service_role',
        'public.create_lead_notification_delivery_v2(uuid,uuid,uuid,text,text)',
        'EXECUTE'
      );`, "inspect SMS protocol cutover privileges"),
    "f|f|t",
  );

  const createdNotification = psql(`set request.jwt.claim.role = 'service_role';
    select id, tenant_id, lead_id, status
    from public.create_lead_notification_delivery_v2(
      '${organizationA}', '${leadA}', null, 'lead_reply_template', '${digestA}'
    );`, "create versioned outbound SMS receipt");
  const createdParts = createdNotification.split("|");
  assert.equal(createdParts.slice(1).join("|"), `${organizationA}|${leadA}|queued`);
  assert.match(createdParts[0], /^[0-9a-f-]{36}$/);
  assert.equal(
    psql(`set request.jwt.claim.role = 'service_role';
      select id from public.create_lead_notification_delivery_v2(
        '${organizationA}', '${leadA}', null, 'lead_reply_template', '${digestA}'
      );`, "replay versioned outbound SMS receipt"),
    createdParts[0],
  );
  psqlMustFail(`set request.jwt.claim.role = 'service_role';
    select * from public.create_lead_notification_delivery_v2(
      '${organizationA}', '${leadB}', null, 'new_lead_alert', '${digestA}'
    );`, /lead_notifications_lead_tenant_fk/, "reject cross-tenant outbound SMS identity");
  psqlMustFail(`set role service_role;
    insert into public.lead_notifications (tenant_id, lead_id, purpose, status)
    values ('${organizationA}', '${leadA}', 'new_lead_alert', 'queued');`,
    /permission denied for table lead_notifications/,
    "block old direct outbound SMS writers");

  const notificationSource = fs.readFileSync(path.join(root, "src/lib/services/internal-lead-notification-service.ts"), "utf8");
  const smsSource = fs.readFileSync(path.join(root, "src/lib/services/sms-service.ts"), "utf8");
  const leadSource = fs.readFileSync(path.join(root, "src/lib/services/lead-handler-service.ts"), "utf8");
  const routeSource = fs.readFileSync(path.join(root, "src/app/api/sms/twilio/route.ts"), "utf8");
  const twilioHandlerSource = leadSource.slice(
    leadSource.indexOf("export async function handleIncomingMessageByPhone("),
    leadSource.indexOf("export async function createLeadAndStartConversation("),
  );
  assert.match(notificationSource, /new Set\(\["sent", "delivered"\]\)/);
  assert.doesNotMatch(notificationSource, /new Set\(\["queued"/);
  assert.match(smsSource, /apply_lead_notification_delivery_status/);
  assert.match(smsSource, /create_lead_notification_delivery_v2/);
  assert.doesNotMatch(smsSource, /\.from\("lead_notifications"\)[\s\S]{0,120}\.insert\(/);
  assert.match(notificationSource, /record_failed_lead_notification_v2/);
  assert.match(leadSource, /resolveInboundSmsLead/);
  assert.match(leadSource, /existingReceipt\.lead_id/);
  assert.match(twilioHandlerSource, /completeInboundSmsComplianceReceipt/);
  assert.match(twilioHandlerSource, /blocked: true/);
  assert.doesNotMatch(
    twilioHandlerSource,
    /generateResponse|bookAppointment|sendLeadSMS|saveLeadMessage|\.from\("leads"\)\.update/,
  );
  assert.match(migration, /complete_inbound_sms_compliance_receipt/);
  assert.match(routeSource, /Boolean\(result\.response\.trim\(\)\)/);
  assert.match(routeSource, /!result\.blocked/);

  const { handleTwilioWebhookError, TestApiError } = loadRouteErrorClassifier();
  for (const code of [
    "sms_tenant_mapping_invalid",
    "sms_tenant_mapping_ambiguous",
    "sms_tenant_mapping_unresolved",
    "sms_tenant_mapping_missing",
  ]) {
    const response = handleTwilioWebhookError(new TestApiError(503, "mapping", code));
    assert.equal(response.status, 200);
    assert.equal((await response.text()).includes("<Message>"), false);
  }
  for (const error of [
    new TestApiError(500, "storage", "storage_failed"),
    new TestApiError(503, "busy", "inbound_sms_receipt_busy"),
    new Error("unexpected transient failure"),
  ]) {
    const response = handleTwilioWebhookError(error);
    assert.ok(response.status >= 500);
    assert.equal((await response.text()).includes("<Message>"), false);
  }

  console.log("PASS SMS receipt hardening: disposable DB concurrency/fencing/atomic compliance replay plus blocked no-reply and empty-TwiML contracts");
} finally {
  cleanup();
}
