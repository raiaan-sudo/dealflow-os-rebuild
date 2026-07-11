import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const migrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260710170000_create_ghl_tenant_provisioning_foundation.sql",
);
const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const containerName = `dealflow-ghl-disposable-${process.pid}-${randomBytes(4).toString("hex")}`;
const disposablePassword = randomBytes(24).toString("hex");
function buildPsqlArgs(username = "supabase_admin", useTcp = false) {
  const args = [
    "exec",
    "-i",
    "--env",
    `PGPASSWORD=${disposablePassword}`,
    containerName,
    "psql",
    "--no-psqlrc",
    "--set=ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--quiet",
    `--username=${username}`,
    "--dbname=postgres",
  ];
  if (useTcp) {
    args.push("--host=127.0.0.1");
  }
  return args;
}

const psqlArgs = buildPsqlArgs();

let cleanupComplete = false;

function sanitize(value) {
  return String(value ?? "")
    .replaceAll(disposablePassword, "[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(password|passwd|pwd)\s*[=:]\s*\S+/gi, "$1=[REDACTED]")
    .trim()
    .slice(-1_500);
}

function cleanupContainer() {
  if (cleanupComplete) {
    return;
  }
  cleanupComplete = true;
  spawnSync("docker", ["rm", "--force", containerName], {
    encoding: "utf8",
    stdio: "ignore",
    timeout: 30_000,
  });
}

function failOnSignal(signal, code) {
  process.once(signal, () => {
    cleanupContainer();
    process.exit(code);
  });
}

failOnSignal("SIGINT", 130);
failOnSignal("SIGTERM", 143);

function dockerSync(args, options = {}) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    input: options.input,
    timeout: options.timeout ?? 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function assertCommandSucceeded(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${sanitize(result.error.message)}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label}: ${sanitize(result.stderr || result.stdout || `exit ${result.status}`)}`);
  }
  return String(result.stdout ?? "").trim();
}

function psqlRaw(sql) {
  return dockerSync(psqlArgs, { input: sql });
}

function psqlRawAs(username, sql) {
  return dockerSync(buildPsqlArgs(username, true), { input: sql });
}

function psql(sql, label) {
  return assertCommandSucceeded(psqlRaw(sql), label);
}

function psqlMustFail(sql, pattern, label) {
  return psqlResultMustFail(psqlRaw(sql), pattern, label);
}

function psqlResultMustFail(result, pattern, label) {
  if (result.error) {
    throw new Error(`${label}: ${sanitize(result.error.message)}`);
  }
  assert.notEqual(result.status, 0, `${label}: SQL unexpectedly succeeded`);
  const diagnostic = sanitize(result.stderr);
  assert.match(diagnostic, pattern, `${label}: unexpected database rejection: ${diagnostic}`);
}

function psqlAsMustFail(username, sql, pattern, label) {
  return psqlResultMustFail(psqlRawAs(username, sql), pattern, label);
}

function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => {
      resolve({ status, stdout, stderr });
    });
    child.stdin.end(sql);
  });
}

function parseClaim(output, label) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  assert.equal(lines.length, 1, `${label}: expected at most one claimed row`);
  const [outboxId, organizationId, workerId, leaseToken, generation] = lines[0].split("|");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.match(outboxId, uuid, `${label}: invalid outbox id`);
  assert.match(organizationId, uuid, `${label}: invalid organization id`);
  assert.match(leaseToken, uuid, `${label}: invalid lease token`);
  assert.match(generation, /^\d+$/, `${label}: invalid lease generation`);
  assert.ok(workerId, `${label}: missing worker id`);
  return { outboxId, organizationId, workerId, leaseToken, generation: Number(generation) };
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const initProcess = dockerSync([
      "exec",
      containerName,
      "cat",
      "/proc/1/comm",
    ], { timeout: 5_000 });
    const health = dockerSync([
      "inspect",
      "--format={{.State.Health.Status}}",
      containerName,
    ], { timeout: 5_000 });
    const result = dockerSync([
      "exec",
      containerName,
      "pg_isready",
      "--username=supabase_admin",
      "--dbname=postgres",
    ], { timeout: 5_000 });
    if (
      initProcess.status === 0
      && initProcess.stdout.trim().toLowerCase().includes("postgres")
      && health.status === 0
      && health.stdout.trim() === "healthy"
      && result.status === 0
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Disposable PostgreSQL did not become ready within 30 seconds.");
}

const organizationId = "00000000-0000-4000-8000-000000000001";
const otherOrganizationId = "00000000-0000-4000-8000-000000000002";
const leadId = "10000000-0000-4000-8000-000000000001";
const otherLeadId = "10000000-0000-4000-8000-000000000002";
const exhaustedLeadId = "10000000-0000-4000-8000-000000000003";
const retryExhaustedLeadId = "10000000-0000-4000-8000-000000000004";
const installationId = "20000000-0000-4000-8000-000000000001";
const manifestId = "30000000-0000-4000-8000-000000000001";
const mappingId = "40000000-0000-4000-8000-000000000001";

try {
  assert.ok(fs.existsSync(migrationPath), "GHL migration is missing");
  assertCommandSucceeded(
    dockerSync(["image", "inspect", image], { timeout: 15_000 }),
    "Cached Supabase PostgreSQL image is unavailable",
  );

  assertCommandSucceeded(
    dockerSync([
      "run",
      "--detach",
      "--rm",
      "--pull=never",
      "--name",
      containerName,
      "--env",
      `POSTGRES_PASSWORD=${disposablePassword}`,
      image,
    ], { timeout: 30_000 }),
    "Disposable PostgreSQL container failed to start",
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

    create role ghl_authenticated_probe
      login
      password '${disposablePassword}'
      in role authenticated;

    create role ghl_service_probe
      login
      password '${disposablePassword}'
      in role service_role;

    create table public.organizations (
      id uuid primary key
    );

    create table public.partners (
      id uuid primary key
    );

    create table public.leads (
      id uuid primary key,
      organization_id uuid not null references public.organizations (id) on delete cascade
    );

    create table public.app_schema_metadata (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default timezone('utc', now())
    );
  `, "Synthetic prerequisite schema failed");

  psql(
    fs.readFileSync(migrationPath, "utf8"),
    "GHL migration failed against the disposable database",
  );

  psql(`
    insert into public.organizations (id)
    values ('${organizationId}'), ('${otherOrganizationId}');

    insert into public.leads (id, organization_id)
    values
      ('${leadId}', '${organizationId}'),
      ('${otherLeadId}', '${otherOrganizationId}'),
      ('${exhaustedLeadId}', '${organizationId}'),
      ('${retryExhaustedLeadId}', '${organizationId}');

    insert into public.ghl_workspace_tenants (
      organization_id,
      tenant_kind,
      partner_id,
      status
    ) values (
      '${organizationId}',
      'direct_realtor',
      null,
      'active'
    );

    insert into public.ghl_installations (
      id,
      environment,
      owner_kind,
      partner_id,
      provider_agency_id,
      status
    ) values (
      '${installationId}',
      'test',
      'platform',
      null,
      'synthetic-agency',
      'active'
    );

    insert into public.ghl_snapshot_manifests (
      id,
      environment,
      snapshot_key,
      snapshot_version,
      provider_snapshot_id,
      required_objects,
      status,
      approved_at
    ) values (
      '${manifestId}',
      'test',
      'synthetic-snapshot',
      '1.0.0',
      'synthetic-provider-snapshot',
      '[{"kind":"pipeline","key":"new-lead"}]'::jsonb,
      'approved',
      timezone('utc', now())
    );

    insert into public.ghl_location_mappings (
      id,
      organization_id,
      partner_id,
      installation_id,
      environment,
      provider_location_id,
      provisioning_owner,
      snapshot_manifest_id,
      status,
      snapshot_verified_at,
      required_objects_verified_at
    ) values (
      '${mappingId}',
      '${organizationId}',
      null,
      '${installationId}',
      'test',
      'synthetic-location',
      'platform',
      '${manifestId}',
      'active',
      timezone('utc', now()),
      timezone('utc', now())
    );
  `, "Synthetic GHL fixture creation failed");

  psqlMustFail(`
    select count(*)
    from public.enqueue_ghl_fake_lead_effects(
      '${organizationId}',
      '${leadId}',
      'production',
      timezone('utc', now())
    );
  `, /restricted to the test environment/i, "Non-test fake enqueue was not rejected");

  psqlMustFail(`
    select count(*)
    from public.enqueue_ghl_fake_lead_effects(
      '${organizationId}',
      '${otherLeadId}',
      'test',
      timezone('utc', now())
    );
  `, /missing or cross-tenant lead/i, "Cross-tenant fake enqueue was not rejected");

  const firstEnqueue = psql(`
    select string_agg(id::text, ',' order by id)
    from public.enqueue_ghl_fake_lead_effects(
      '${organizationId}',
      '${leadId}',
      'test',
      timezone('utc', now())
    );
  `, "Initial fake lead-effect enqueue failed");
  const secondEnqueue = psql(`
    select string_agg(id::text, ',' order by id)
    from public.enqueue_ghl_fake_lead_effects(
      '${organizationId}',
      '${leadId}',
      'test',
      timezone('utc', now())
    );
  `, "Idempotent fake lead-effect enqueue failed");
  assert.equal(secondEnqueue, firstEnqueue, "Fake enqueue returned a different event identity on replay");
  assert.equal(firstEnqueue.split(",").length, 4, "Fake enqueue did not create the four modeled effects");
  assert.equal(
    psql(`
      select concat(
        (select count(*) from public.ghl_lead_effect_events where organization_id = '${organizationId}'),
        '|',
        (select count(*) from public.ghl_provider_outbox where organization_id = '${organizationId}')
      );
    `, "Fake enqueue count verification failed"),
    "4|4",
    "Idempotent fake enqueue duplicated durable rows",
  );

  psql(`
    update public.ghl_lead_effect_events
    set status = 'canceled'
    where organization_id = '${organizationId}'
      and effect_kind <> 'contact_upsert';

    update public.ghl_provider_outbox outbox
    set status = 'canceled'
    where outbox.organization_id = '${organizationId}'
      and exists (
        select 1
        from public.ghl_lead_effect_events effect
        where effect.outbox_id = outbox.id
          and effect.organization_id = outbox.organization_id
          and effect.effect_kind <> 'contact_upsert'
      );
  `, "Synthetic claim fixture narrowing failed");

  const claimSql = (workerId) => `
    select concat_ws(
      '|',
      id::text,
      organization_id::text,
      locked_by,
      lease_token::text,
      lease_generation::text
    )
    from public.claim_next_ghl_fake_lead_outbox(
      '${workerId}',
      timezone('utc', now()),
      60000
    );
  `;
  const [claimAResult, claimBResult] = await Promise.all([
    psqlAsync(claimSql("synthetic-worker-a")),
    psqlAsync(claimSql("synthetic-worker-b")),
  ]);
  assert.equal(claimAResult.status, 0, `Concurrent claimer A failed: ${sanitize(claimAResult.stderr)}`);
  assert.equal(claimBResult.status, 0, `Concurrent claimer B failed: ${sanitize(claimBResult.stderr)}`);
  const concurrentClaims = [
    parseClaim(claimAResult.stdout, "Concurrent claimer A"),
    parseClaim(claimBResult.stdout, "Concurrent claimer B"),
  ].filter(Boolean);
  assert.equal(concurrentClaims.length, 1, "Two concurrent workers did not yield exactly one claim");
  const staleClaim = concurrentClaims[0];

  const replacementClaim = parseClaim(psql(`
    select concat_ws(
      '|',
      id::text,
      organization_id::text,
      locked_by,
      lease_token::text,
      lease_generation::text
    )
    from public.claim_next_ghl_fake_lead_outbox(
      'synthetic-worker-reclaimer',
      timezone('utc', now()) + interval '61 seconds',
      60000
    );
  `, "Expired fake lease reclaim failed"), "Replacement claimer");
  assert.ok(replacementClaim, "Expired fake lease was not reclaimed");
  assert.equal(replacementClaim.outboxId, staleClaim.outboxId, "Reclaimer acquired a different outbox row");
  assert.equal(
    replacementClaim.generation,
    staleClaim.generation + 1,
    "Lease reclaim did not advance the fencing generation exactly once",
  );

  const settleSql = (claim, providerRequestId, providerReference) => `
    select count(*)
    from public.settle_ghl_provider_outbox(
      '${claim.outboxId}',
      '${claim.organizationId}',
      '${claim.workerId}',
      '${claim.leaseToken}',
      ${claim.generation},
      timezone('utc', now()),
      'succeeded',
      '${providerRequestId}',
      '${providerReference}',
      200,
      'synthetic-fingerprint',
      '{"fake_provider":true,"provider_network_access":"none","provider_mutation_attempted":false}'::jsonb,
      'succeeded',
      timezone('utc', now()),
      null
    );
  `;

  psqlMustFail(
    settleSql(staleClaim, "synthetic-stale-request", "synthetic-stale-reference"),
    /lease expired or was superseded/i,
    "Stale fake worker settlement was not fenced",
  );
  assert.equal(
    psql("select count(*) from public.ghl_provider_receipts;", "Stale receipt count failed"),
    "0",
    "Fenced stale settlement appended a receipt",
  );

  assert.equal(
    psql(
      settleSql(replacementClaim, "synthetic-winning-request", "synthetic-winning-contact"),
      "Live fake worker settlement failed",
    ),
    "1",
    "Live fake worker did not settle exactly one outbox row",
  );
  assert.equal(
    psql(`
      select concat_ws(
        '|',
        outbox.status,
        effect.status,
        outbox.attempt_count::text,
        effect.attempt_count::text,
        effect.provider_contact_id,
        (select count(*)::text from public.ghl_provider_receipts receipt where receipt.outbox_id = outbox.id),
        effect.metadata ->> 'outbox_lease_generation'
      )
      from public.ghl_provider_outbox outbox
      join public.ghl_lead_effect_events effect
        on effect.outbox_id = outbox.id
       and effect.organization_id = outbox.organization_id
      where outbox.id = '${replacementClaim.outboxId}';
    `, "Atomic fake settlement verification failed"),
    `succeeded|succeeded|2|2|synthetic-winning-contact|1|${replacementClaim.generation}`,
    "Valid settlement did not atomically update outbox, effect, and receipt",
  );

  psqlMustFail(
    settleSql(staleClaim, "synthetic-second-stale-request", "synthetic-second-stale-reference"),
    /lease expired or was superseded/i,
    "Terminal outbox accepted a stale settlement replay",
  );
  assert.equal(
    psql("select count(*) from public.ghl_provider_receipts;", "Final receipt count failed"),
    "1",
    "Stale settlement replay created an extra receipt",
  );

  assert.equal(
    psql(`
      select concat_ws(
        '|',
        has_table_privilege('service_role', 'public.ghl_provider_outbox', 'UPDATE')::text,
        has_table_privilege('service_role', 'public.ghl_provider_receipts', 'INSERT')::text,
        has_table_privilege('service_role', 'public.ghl_lead_effect_events', 'UPDATE')::text,
        has_column_privilege('service_role', 'public.ghl_provider_outbox', 'organization_id', 'INSERT')::text,
        has_column_privilege('service_role', 'public.ghl_provider_outbox', 'status', 'INSERT')::text
      );
    `, "Service-role GHL table privilege lookup failed"),
    "false|false|false|true|false",
    "Service role retained a direct receipt or terminal-state mutation privilege",
  );

  psqlAsMustFail("ghl_service_probe", `
    update public.ghl_provider_outbox
    set status = 'operator_action_required'
    where id = '${replacementClaim.outboxId}';
  `, /permission denied/i, "Service role bypassed the outbox settlement RPC");

  psqlAsMustFail("ghl_service_probe", `
    insert into public.ghl_provider_receipts (
      outbox_id,
      attempt_number,
      outcome,
      receipt_metadata
    ) values (
      '${replacementClaim.outboxId}',
      99,
      'succeeded',
      '{}'::jsonb
    );
  `, /permission denied/i, "Service role bypassed the receipt append RPC");

  psqlAsMustFail("ghl_service_probe", `
    update public.ghl_lead_effect_events
    set status = 'operator_action_required'
    where outbox_id = '${replacementClaim.outboxId}';
  `, /permission denied/i, "Service role bypassed the lead-effect settlement RPC");

  psqlAsMustFail("ghl_service_probe", `
    insert into public.ghl_provider_outbox (
      organization_id,
      operation,
      idempotency_key,
      status,
      request_payload
    ) values (
      '${organizationId}',
      'lead_contact_upsert',
      'forbidden-terminal-insert',
      'operator_action_required',
      '{"fake_only":true}'::jsonb
    );
  `, /permission denied/i, "Service role inserted a terminal outbox state directly");

  assert.equal(
    psql(`
      select concat_ws(
        '|',
        has_function_privilege(
          'service_role',
          'public.prepare_ghl_provider_outbox_replay(uuid,text,timestamptz)',
          'EXECUTE'
        )::text,
        has_function_privilege(
          'service_role',
          'public.request_ghl_lead_effect_replay(uuid,uuid,uuid,timestamptz)',
          'EXECUTE'
        )::text,
        has_function_privilege(
          'authenticated',
          'public.prepare_ghl_provider_outbox_replay(uuid,text,timestamptz)',
          'EXECUTE'
        )::text
      );
    `, "GHL mutation RPC privilege lookup failed"),
    "true|true|false",
    "GHL mutation RPC grants are not service-role-only",
  );

  psql(`
    select count(*)
    from public.enqueue_ghl_fake_lead_effects(
      '${organizationId}',
      '${exhaustedLeadId}',
      'test',
      timezone('utc', now())
    );

    update public.ghl_lead_effect_events
    set status = 'canceled'
    where lead_id = '${exhaustedLeadId}'
      and effect_kind <> 'contact_upsert';

    update public.ghl_provider_outbox outbox
    set status = 'canceled'
    where exists (
      select 1
      from public.ghl_lead_effect_events effect
      where effect.outbox_id = outbox.id
        and effect.lead_id = '${exhaustedLeadId}'
        and effect.effect_kind <> 'contact_upsert'
    );

    update public.ghl_lead_effect_events
    set max_attempts = 1
    where lead_id = '${exhaustedLeadId}'
      and effect_kind = 'contact_upsert';
  `, "Exhausted fake-lead fixture setup failed");

  const exhaustedClaim = parseClaim(psql(`
    select concat_ws(
      '|',
      id::text,
      organization_id::text,
      locked_by,
      lease_token::text,
      lease_generation::text
    )
    from public.claim_next_ghl_fake_lead_outbox(
      'synthetic-exhaustion-worker',
      timezone('utc', now()),
      60000
    );
  `, "Final-attempt fake-lead claim failed"), "Final-attempt claimer");
  assert.ok(exhaustedClaim, "Final-attempt fake-lead row was not claimed");

  assert.equal(
    psql(`
      select count(*)
      from public.claim_next_ghl_fake_lead_outbox(
        'synthetic-post-exhaustion-worker',
        timezone('utc', now()) + interval '61 seconds',
        60000
      );
    `, "Expired max-attempt fake-lead sweep failed"),
    "0",
    "An exhausted fake-lead row was reclaimed instead of terminalized",
  );
  assert.equal(
    psql(`
      select concat_ws(
        '|',
        outbox.status,
        effect.status,
        outbox.attempt_count::text,
        effect.attempt_count::text,
        outbox.last_error_code,
        effect.last_error_code,
        (outbox.lease_token is null)::text,
        (outbox.locked_by is null)::text
      )
      from public.ghl_provider_outbox outbox
      join public.ghl_lead_effect_events effect
        on effect.outbox_id = outbox.id
       and effect.organization_id = outbox.organization_id
      where effect.lead_id = '${exhaustedLeadId}'
        and effect.effect_kind = 'contact_upsert';
    `, "Expired max-attempt fake-lead terminal truth verification failed"),
    "operator_action_required|operator_action_required|1|1|ghl_lead_effect_attempts_exhausted|ghl_lead_effect_attempts_exhausted|true|true",
    "Expired max-attempt GHL outbox/effect truth was not atomically terminalized",
  );

  psql(`
    select count(*)
    from public.enqueue_ghl_fake_lead_effects(
      '${organizationId}',
      '${retryExhaustedLeadId}',
      'test',
      timezone('utc', now())
    );

    update public.ghl_lead_effect_events
    set status = 'canceled'
    where lead_id = '${retryExhaustedLeadId}'
      and effect_kind <> 'contact_upsert';

    update public.ghl_provider_outbox outbox
    set status = 'canceled'
    where exists (
      select 1
      from public.ghl_lead_effect_events effect
      where effect.outbox_id = outbox.id
        and effect.lead_id = '${retryExhaustedLeadId}'
        and effect.effect_kind <> 'contact_upsert'
    );

    update public.ghl_lead_effect_events
    set max_attempts = 1
    where lead_id = '${retryExhaustedLeadId}'
      and effect_kind = 'contact_upsert';
  `, "Retryable max-attempt fake-lead fixture setup failed");

  const retryExhaustedClaim = parseClaim(psql(`
    select concat_ws(
      '|',
      id::text,
      organization_id::text,
      locked_by,
      lease_token::text,
      lease_generation::text
    )
    from public.claim_next_ghl_fake_lead_outbox(
      'synthetic-retry-exhaustion-worker',
      timezone('utc', now()),
      60000
    );
  `, "Retryable final-attempt fake-lead claim failed"), "Retryable final-attempt claimer");
  assert.ok(retryExhaustedClaim, "Retryable final-attempt fake-lead row was not claimed");

  assert.equal(
    psql(`
      select count(*)
      from public.settle_ghl_provider_outbox(
        '${retryExhaustedClaim.outboxId}',
        '${retryExhaustedClaim.organizationId}',
        '${retryExhaustedClaim.workerId}',
        '${retryExhaustedClaim.leaseToken}',
        ${retryExhaustedClaim.generation},
        timezone('utc', now()),
        'retryable_failure',
        'synthetic-retry-exhausted-request',
        null,
        503,
        'synthetic-retry-exhausted-fingerprint',
        '{"fake_provider":true,"provider_network_access":"none","provider_mutation_attempted":false}'::jsonb,
        'retryable_failure',
        timezone('utc', now()),
        'synthetic_retryable_failure'
      );
    `, "Retryable final-attempt settlement failed"),
    "1",
    "Retryable final-attempt settlement did not persist",
  );
  assert.equal(
    psql(`
      select count(*)
      from public.claim_next_ghl_fake_lead_outbox(
        'synthetic-retry-post-exhaustion-worker',
        timezone('utc', now()) + interval '1 second',
        60000
      );
    `, "Due retryable max-attempt fake-lead sweep failed"),
    "0",
    "A due retryable max-attempt fake-lead row was reclaimed",
  );
  assert.equal(
    psql(`
      select concat_ws(
        '|',
        outbox.status,
        effect.status,
        outbox.last_error_code,
        effect.last_error_code
      )
      from public.ghl_provider_outbox outbox
      join public.ghl_lead_effect_events effect
        on effect.outbox_id = outbox.id
       and effect.organization_id = outbox.organization_id
      where effect.lead_id = '${retryExhaustedLeadId}'
        and effect.effect_kind = 'contact_upsert';
    `, "Due retryable max-attempt terminal truth verification failed"),
    "operator_action_required|operator_action_required|ghl_lead_effect_attempts_exhausted|ghl_lead_effect_attempts_exhausted",
    "Due retryable max-attempt GHL truth was not atomically terminalized",
  );

  assert.equal(
    psql(`
      select has_function_privilege(
        'authenticated',
        'public.enqueue_ghl_fake_lead_effects(uuid,uuid,text,timestamptz)',
        'EXECUTE'
      );
    `, "Authenticated RPC privilege lookup failed"),
    "f",
    "Authenticated role retained execute privilege on the internal fake RPC",
  );
  psqlAsMustFail("ghl_authenticated_probe", `
    select count(*)
    from public.enqueue_ghl_fake_lead_effects(
      '${organizationId}',
      '${leadId}',
      'test',
      timezone('utc', now())
    );
  `, /permission denied.*function|permission denied/i, "Authenticated role executed an internal fake RPC");

  psqlMustFail(`
    insert into public.ghl_snapshot_manifests (
      id,
      environment,
      snapshot_key,
      snapshot_version,
      provider_snapshot_id,
      required_objects,
      status,
      approved_at
    ) values (
      '30000000-0000-4000-8000-000000000002',
      'test',
      'empty-synthetic-snapshot',
      '1.0.0',
      'empty-synthetic-provider-snapshot',
      '[]'::jsonb,
      'approved',
      timezone('utc', now())
    );
  `, /check constraint|required objects/i, "Empty approved snapshot manifest was not rejected");

  console.log(
    "GHL disposable database regression passed: migration, fake enqueue, tenant/environment gates, concurrent fencing, atomic settlement, max-attempt sweeping, RPC-only terminal mutation, manifest validation, and grants.",
  );
} catch (error) {
  console.error(`GHL disposable database regression failed: ${sanitize(error?.message ?? error)}`);
  process.exitCode = 1;
} finally {
  cleanupContainer();
}
