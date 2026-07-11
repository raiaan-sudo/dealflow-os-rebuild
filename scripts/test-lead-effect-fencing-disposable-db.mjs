#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const migrationPath = path.join(
  root,
  "supabase/migrations/20260710234500_harden_jobs_lead_effects_meta_deletion.sql",
);
const containerName = `dealflow-lead-effect-fence-${process.pid}-${randomBytes(4).toString("hex")}`;
const password = randomBytes(24).toString("hex");

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const leadId = "30000000-0000-4000-8000-000000000001";
const jobId = "40000000-0000-4000-8000-000000000001";
const generation1Token = "50000000-0000-4000-8000-000000000001";
const generation2Token = "50000000-0000-4000-8000-000000000002";
const generation3Token = "50000000-0000-4000-8000-000000000003";
let cleaned = false;

function docker(args, options = {}) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    input: options.input,
    timeout: options.timeout ?? 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
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
  return new Promise((resolve, reject) => {
    const child = spawn("docker", psqlArgs(), { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(sql);
  });
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

function claimSql({ effectKey, workerId, leaseToken, generation }) {
  return `
    set role service_role;
    select effect_id, claim_disposition, execution_token, attempt_count, status,
      retryable, coalesce(error_code, '')
    from public.claim_lead_system_job_effect(
      '${jobId}',
      '${organizationId}',
      '${leadId}',
      '${effectKey}',
      true,
      'disposable-request',
      '${workerId}',
      '${leaseToken}',
      ${generation}
    );
  `;
}

function settleSql({
  effectId,
  workerId,
  leaseToken,
  generation,
  executionToken,
  status,
  result,
  retryable,
}) {
  const error = status === "succeeded" ? "null" : "'confirmed_provider_failure'";
  return `
    set role service_role;
    select id, status, attempt_count, lease_generation, execution_token,
      coalesce(result->>'receipt', '')
    from public.settle_lead_system_job_effect(
      '${effectId}',
      '${jobId}',
      '${workerId}',
      '${leaseToken}',
      ${generation},
      '${executionToken}',
      '${status}',
      '${JSON.stringify(result).replaceAll("'", "''")}'::jsonb,
      ${retryable ? "true" : "false"},
      ${error},
      ${error}
    );
  `;
}

function parseClaim(output, label) {
  const lines = String(output).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  assert.equal(lines.length, 1, `${label}: expected exactly one row`);
  const [effectId, disposition, executionToken, attemptCount, status, retryable, errorCode] =
    lines[0].split("|");
  assert.match(effectId, /^[0-9a-f-]{36}$/i, `${label}: invalid effect id`);
  assert.match(executionToken, /^[0-9a-f-]{36}$/i, `${label}: invalid execution token`);
  return {
    effectId,
    disposition,
    executionToken,
    attemptCount: Number(attemptCount),
    status,
    retryable,
    errorCode,
  };
}

try {
  assert.ok(fs.existsSync(migrationPath), `Required migration is missing: ${migrationPath}`);
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

    create table public.organizations (
      id uuid primary key
    );

    create table public.leads (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id)
    );
    create unique index leads_id_organization_unique
      on public.leads(id, organization_id);

    create table public.system_jobs (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null,
      campaign_id uuid null,
      kind text not null,
      status text not null default 'pending',
      payload jsonb not null default '{}'::jsonb,
      result jsonb null,
      retry_count integer not null default 0,
      attempt_count integer not null default 0,
      max_attempts integer not null default 3,
      next_run_at timestamptz null,
      locked_by text null,
      locked_until timestamptz null,
      dead_lettered_at timestamptz null,
      dead_letter_reason text null,
      error_message text null,
      started_at timestamptz null,
      completed_at timestamptz null,
      created_at timestamptz not null default now()
    );

    create table public.app_schema_metadata (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default timezone('utc', now())
    );
  `, "Synthetic prerequisite schema failed");

  psql(
    fs.readFileSync(migrationPath, "utf8"),
    `Candidate migration failed: ${path.basename(migrationPath)}`,
  );

  assert.equal(
    psql(`
      select
        to_regprocedure('public.claim_next_system_job(text,integer)') is null,
        has_function_privilege(
          'service_role',
          'public.claim_next_system_job_v2(text,integer,integer)',
          'EXECUTE'
        );
    `, "Read system-job claim protocol privileges"),
    "t|t",
    "Mixed-version migration did not disable v1 while enabling v2",
  );

  psqlMustFail(
    `set role service_role;
     select id from public.claim_next_system_job('legacy-worker', 300000);`,
    /function public\.claim_next_system_job\(unknown, integer\) does not exist|function public\.claim_next_system_job\(text, integer\) does not exist/i,
    "Legacy worker claim protocol must fail closed after migration",
  );

  psqlMustFail(
    `set role service_role;
     select id from public.claim_next_system_job_v2('wrong-protocol-worker', 300000, 1);`,
    /system_job_claim_protocol_unsupported/i,
    "Unsupported v2 protocol version must fail closed",
  );

  psql(`
    insert into public.organizations(id) values ('${organizationId}');
    insert into public.leads(id, organization_id) values ('${leadId}', '${organizationId}');
    insert into public.system_jobs (
      id, organization_id, user_id, kind, status, payload, attempt_count, max_attempts,
      locked_by, locked_until, lease_token, lease_generation, lease_heartbeat_at
    ) values (
      '${jobId}', '${organizationId}', '${userId}', 'lead_side_effects', 'processing',
      '{"requestId":"disposable-request","lead":{"id":"${leadId}","organization_id":"${organizationId}"}}'::jsonb,
      1, 3,
      'worker-generation-1', now() + interval '5 minutes', '${generation1Token}', 1, now()
    );
  `, "Synthetic lead-effect fixtures failed");

  assert.equal(
    psql(`
      insert into public.system_jobs (
        id, organization_id, user_id, kind, status, payload, attempt_count, max_attempts,
        next_run_at
      ) values (
        '40000000-0000-4000-8000-000000000099', '${organizationId}', '${userId}',
        'lead_capture_retry', 'pending', '{}'::jsonb, 0, 3, now()
      );
      set role service_role;
      select status, locked_by, lease_generation,
        (lease_token is not null), (locked_until > now())
      from public.claim_next_system_job_v2('v2-worker', 300000, 2)
      where id = '40000000-0000-4000-8000-000000000099';
    `, "V2 system-job claim failed"),
    "processing|v2-worker|1|t|t",
    "V2 claim did not return a fenced live lease",
  );

  assert.equal(
    psql(`
      select
        has_function_privilege(
          'authenticated',
          'public.claim_lead_system_job_effect(uuid,uuid,uuid,text,boolean,text,text,uuid,bigint)',
          'EXECUTE'
        ),
        has_function_privilege(
          'authenticated',
          'public.settle_lead_system_job_effect(uuid,uuid,text,uuid,bigint,text,text,jsonb,boolean,text,text)',
          'EXECUTE'
        );
    `, "Read authenticated lead-effect function privileges"),
    "f|f",
    "Authenticated callers retain lead-effect claim or settlement execution privilege",
  );

  psqlMustFail(
    claimSql({
      effectKey: "agent_notification",
      workerId: "wrong-worker",
      leaseToken: generation1Token,
      generation: 1,
    }),
    /system_job_effect_parent_lease_not_owned/i,
    "Wrong parent worker must not claim a child effect",
  );

  psql(`
    update public.system_jobs
    set locked_until = now() - interval '1 second'
    where id = '${jobId}';
  `, "Expire generation-1 parent lease fixture");
  psqlMustFail(
    claimSql({
      effectKey: "agent_notification",
      workerId: "worker-generation-1",
      leaseToken: generation1Token,
      generation: 1,
    }),
    /system_job_effect_parent_lease_not_owned/i,
    "Expired parent lease must not claim a child effect",
  );
  psql(`
    update public.system_jobs
    set locked_until = now() + interval '5 minutes'
    where id = '${jobId}';
  `, "Restore generation-1 parent lease fixture");

  const generation1Claim = parseClaim(
    psql(claimSql({
      effectKey: "agent_notification",
      workerId: "worker-generation-1",
      leaseToken: generation1Token,
      generation: 1,
    }), "Generation-1 effect claim failed"),
    "generation-1 claim",
  );
  assert.equal(generation1Claim.disposition, "claimed");
  assert.equal(generation1Claim.attemptCount, 1);

  psql(
    settleSql({
      ...generation1Claim,
      workerId: "worker-generation-1",
      leaseToken: generation1Token,
      generation: 1,
      status: "failed",
      result: { receipt: "generation-1-confirmed-failure" },
      retryable: true,
    }),
    "Generation-1 confirmed failure settlement failed",
  );

  psql(`
    update public.system_jobs
    set status = 'processing',
        locked_by = 'worker-generation-2',
        locked_until = now() + interval '5 minutes',
        lease_token = '${generation2Token}',
        lease_generation = 2,
        lease_heartbeat_at = now(),
        attempt_count = 2
    where id = '${jobId}';
  `, "Generation-2 parent claim fixture failed");

  const generation2Claim = parseClaim(
    psql(claimSql({
      effectKey: "agent_notification",
      workerId: "worker-generation-2",
      leaseToken: generation2Token,
      generation: 2,
    }), "Generation-2 effect claim failed"),
    "generation-2 claim",
  );
  assert.equal(generation2Claim.disposition, "claimed");
  assert.equal(generation2Claim.attemptCount, 2);
  assert.notEqual(generation2Claim.executionToken, generation1Claim.executionToken);

  const delayedGeneration1 = psqlAsync(`
    select pg_sleep(0.75);
    ${settleSql({
      ...generation1Claim,
      workerId: "worker-generation-1",
      leaseToken: generation1Token,
      generation: 1,
      status: "succeeded",
      result: { receipt: "stale-generation-1-success" },
      retryable: false,
    })}
  `);

  const generation2Settlement = psql(
    settleSql({
      ...generation2Claim,
      workerId: "worker-generation-2",
      leaseToken: generation2Token,
      generation: 2,
      status: "succeeded",
      result: { receipt: "generation-2-success" },
      retryable: false,
    }),
    "Generation-2 success settlement failed",
  );
  assert.match(generation2Settlement, /\|succeeded\|2\|2\|/);
  assert.match(generation2Settlement, /\|generation-2-success$/);

  const staleResult = await delayedGeneration1;
  assert.notEqual(staleResult.status, 0, "Delayed generation-1 settlement unexpectedly succeeded");
  assert.match(
    sanitize(staleResult.stderr || staleResult.stdout),
    /system_job_effect_parent_lease_not_owned/i,
    "Delayed generation-1 settlement did not fail on the parent lease fence",
  );

  assert.equal(
    psql(`
      select status, attempt_count, lease_generation, execution_token,
        result->>'receipt'
      from public.system_job_effects
      where system_job_id = '${jobId}' and effect_key = 'agent_notification';
    `, "Read final generation-2 effect truth"),
    `succeeded|2|2|${generation2Claim.executionToken}|generation-2-success`,
    "Delayed generation-1 completion overwrote generation-2 truth",
  );

  const succeededReplay = parseClaim(
    psql(claimSql({
      effectKey: "agent_notification",
      workerId: "worker-generation-2",
      leaseToken: generation2Token,
      generation: 2,
    }), "Succeeded child reuse failed"),
    "succeeded child reuse",
  );
  assert.equal(succeededReplay.disposition, "reused_succeeded");
  assert.equal(succeededReplay.attemptCount, 2);
  assert.equal(succeededReplay.executionToken, generation2Claim.executionToken);

  const inFlightGeneration2 = parseClaim(
    psql(claimSql({
      effectKey: "meta_conversion",
      workerId: "worker-generation-2",
      leaseToken: generation2Token,
      generation: 2,
    }), "Generation-2 in-flight effect claim failed"),
    "generation-2 in-flight claim",
  );
  assert.equal(inFlightGeneration2.disposition, "claimed");

  psql(`
    update public.system_jobs
    set locked_by = 'worker-generation-3',
        locked_until = now() + interval '5 minutes',
        lease_token = '${generation3Token}',
        lease_generation = 3,
        lease_heartbeat_at = now(),
        attempt_count = 3
    where id = '${jobId}';
  `, "Generation-3 parent claim fixture failed");

  const uncertainClaim = parseClaim(
    psql(claimSql({
      effectKey: "meta_conversion",
      workerId: "worker-generation-3",
      leaseToken: generation3Token,
      generation: 3,
    }), "Expired in-flight reconciliation claim failed"),
    "expired in-flight claim",
  );
  assert.equal(uncertainClaim.disposition, "operator_required");
  assert.equal(uncertainClaim.status, "operator_required");
  assert.equal(uncertainClaim.attemptCount, 1, "Uncertain provider effect was replayed");
  assert.equal(uncertainClaim.errorCode, "provider_effect_outcome_uncertain");
  assert.equal(
    uncertainClaim.executionToken,
    inFlightGeneration2.executionToken,
    "Uncertain provider effect received a new execution token",
  );

  psqlMustFail(
    settleSql({
      ...inFlightGeneration2,
      workerId: "worker-generation-2",
      leaseToken: generation2Token,
      generation: 2,
      status: "succeeded",
      result: { receipt: "late-uncertain-provider-success" },
      retryable: false,
    }),
    /system_job_effect_parent_lease_not_owned/i,
    "Expired in-flight generation must not settle",
  );

  psqlMustFail(
    `set role service_role;
     update public.system_job_effects set status = 'succeeded'
     where system_job_id = '${jobId}';`,
    /permission denied for table system_job_effects/i,
    "Service role must not bypass the claim/settle RPCs with direct mutation",
  );

  assert.equal(
    psql(`
      select status, attempt_count, lease_generation, error_code
      from public.system_job_effects
      where system_job_id = '${jobId}' and effect_key = 'meta_conversion';
    `, "Read uncertain provider-effect truth"),
    "operator_required|1|2|provider_effect_outcome_uncertain",
    "Expired in-flight effect was replayed or overwritten",
  );

  console.log(
    "Lead-effect parent-lease fencing disposable PostgreSQL tests passed (network disabled).",
  );
} finally {
  cleanup();
}
