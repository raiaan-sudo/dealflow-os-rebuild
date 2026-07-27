import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { createDisposablePostgresHarness } from "./lib/disposable-postgres-harness.mjs";

const repoRoot = process.cwd();
const migrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260710170000_create_ghl_tenant_provisioning_foundation.sql",
);
const ambiguousDispatchMigrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260713016000_terminalize_ambiguous_ghl_dispatches.sql",
);
const providerAwarePublicationMigrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260717082000_provider_aware_funnel_publication.sql",
);
const preinstalledLocationReuseMigrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260727010000_reuse_preinstalled_ghl_marketplace_location.sql",
);
const provisioningLeaseRevisionMigrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260727020000_fix_ghl_provisioning_lease_revision_fencing.sql",
);
const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const containerName = `dealflow-ghl-disposable-${process.pid}-${randomBytes(4).toString("hex")}`;
const disposablePostgres = createDisposablePostgresHarness({ containerName, image });
const disposablePassword = randomBytes(24).toString("hex");
const nativeAdapterRolePrefix = `dfh_${createHash("sha256").update(containerName).digest("hex").slice(0, 10)}`;
const authenticatedProbeRole = `${nativeAdapterRolePrefix}_ghl_authenticated_probe`;
const serviceProbeRole = `${nativeAdapterRolePrefix}_ghl_service_probe`;
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
  disposablePostgres.run(["rm", "--force", containerName], {
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
  return disposablePostgres.run(args, options);
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
  return disposablePostgres.psqlAsync(psqlArgs, sql);
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

function sqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function lifecycleFingerprint(label) {
  return createHash("sha256").update(`dealflow-ghl-lifecycle:${label}`).digest("hex");
}

function ingestLifecycle({
  locationId,
  eventId,
  eventType,
  objectId,
  contactId = null,
  calendarId = null,
  status = null,
  startsAt = null,
  endsAt = null,
  updatedAt = null,
  receivedAt = "2026-07-13T20:00:00.000Z",
  fingerprintLabel = eventId,
}) {
  return psql(`
    select concat_ws(
      '|', projection_status, coalesce(projection_code, ''),
      coalesce(resolved_lead_id::text, ''),
      coalesce(canonical_appointment_id::text, '')
    )
    from public.ingest_ghl_lifecycle_webhook_v1(
      ${sqlLiteral(locationId)}, ${sqlLiteral(eventId)}, ${sqlLiteral(eventType)},
      ${sqlLiteral(objectId)}, ${sqlLiteral(contactId)}, ${sqlLiteral(calendarId)},
      ${sqlLiteral(status)}, ${sqlLiteral(startsAt)}::timestamptz,
      ${sqlLiteral(endsAt)}::timestamptz, ${sqlLiteral(updatedAt)}::timestamptz,
      ${sqlLiteral(lifecycleFingerprint(fingerprintLabel))},
      ${sqlLiteral(receivedAt)}::timestamptz
    );
  `, `GHL lifecycle ingest failed for ${eventId}`);
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
  assert.ok(fs.existsSync(ambiguousDispatchMigrationPath), "GHL ambiguous-dispatch migration is missing");
  assert.ok(
    fs.existsSync(preinstalledLocationReuseMigrationPath),
    "GHL preinstalled-location reuse migration is missing",
  );
  assert.ok(
    fs.existsSync(provisioningLeaseRevisionMigrationPath),
    "GHL provisioning lease-revision migration is missing",
  );
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
      "--network=none",
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

    create role ${authenticatedProbeRole}
      login
      password '${disposablePassword}'
      in role authenticated;

    create role ${serviceProbeRole}
      login
      password '${disposablePassword}'
      in role service_role;

    create table public.organizations (
      id uuid primary key,
      owner_user_id uuid null,
      name text not null default 'Synthetic Realty',
      partner_id uuid null
    );

    create table public.partners (
      id uuid primary key
    );

    create table public.users (
      id uuid primary key,
      email text not null
    );

    create table public.organization_memberships (
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null references public.users(id),
      role text not null,
      primary key (organization_id, user_id)
    );

    create table public.commercial_activations (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null references public.users(id),
      source_provider text not null,
      source_event_id text not null,
      source_event_type text not null,
      source_subscription_id text null,
      amount_paid_cents integer not null
    );

    create table public.campaign_plans (
      id uuid primary key,
      organization_id uuid null references public.organizations(id),
      user_id uuid null references public.users(id),
      plan jsonb not null,
      publish_state text not null default 'draft'
    );

    create unique index campaign_plans_id_organization_unique
      on public.campaign_plans (id, organization_id);
    create unique index campaign_plans_id_organization_user_unique
      on public.campaign_plans (id, organization_id, user_id);

    create table public.leads (
      id uuid primary key,
      organization_id uuid not null references public.organizations (id) on delete cascade,
      user_id uuid null references public.users(id),
      campaign_id uuid null,
      status text not null default 'new',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now()),
      constraint leads_campaign_tenant_user_fk
        foreign key (campaign_id, organization_id, user_id)
        references public.campaign_plans(id, organization_id, user_id)
        on update restrict on delete restrict
    );

    create table public.appointments (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      lead_id uuid null references public.leads(id) on delete set null,
      scheduled_at timestamptz not null,
      status text not null default 'scheduled',
      appointment_type text null,
      notes text null,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
    );

    create table public.deals (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      lead_id uuid null references public.leads(id) on delete set null,
      appointment_id uuid null references public.appointments(id) on delete set null,
      campaign_id uuid null,
      title text not null,
      contact_name text not null,
      status text not null default 'active',
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
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

  psqlAsMustFail(serviceProbeRole, `
    update public.ghl_provider_outbox
    set status = 'operator_action_required'
    where id = '${replacementClaim.outboxId}';
  `, /permission denied/i, "Service role bypassed the outbox settlement RPC");

  psqlAsMustFail(serviceProbeRole, `
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

  psqlAsMustFail(serviceProbeRole, `
    update public.ghl_lead_effect_events
    set status = 'operator_action_required'
    where outbox_id = '${replacementClaim.outboxId}';
  `, /permission denied/i, "Service role bypassed the lead-effect settlement RPC");

  psqlAsMustFail(serviceProbeRole, `
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
  psqlAsMustFail(authenticatedProbeRole, `
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

  const productionMigrationPath = path.join(
    repoRoot,
    "supabase/migrations/20260712223000_complete_ghl_activation_and_lifecycle_foundation.sql",
  );
  const campaignPersonalizationMigrationPath = process.env.DEALFLOW_GHL_CAMPAIGN_PERSONALIZATION_MIGRATION
    ? path.resolve(process.env.DEALFLOW_GHL_CAMPAIGN_PERSONALIZATION_MIGRATION)
    : path.join(
        repoRoot,
        "supabase/migrations/20260713014000_scope_ghl_personalization_to_campaign.sql",
      );
  psql(`
    alter table public.ghl_snapshot_manifests
      add column if not exists installation_mode text not null default 'provider_api';

    create or replace function public.enqueue_ghl_sandbox_lead_effects(
      p_organization_id uuid,
      p_lead_id uuid,
      p_now timestamptz default timezone('utc', now())
    ) returns setof public.ghl_lead_effect_events
    language plpgsql security definer set search_path = public as $$
    begin
      if not exists (
        select 1 from public.ghl_location_mappings
        where organization_id = p_organization_id and environment = 'sandbox'
      ) then return; end if;
      perform jsonb_build_object('provider_mode', 'sandbox');
      return query select * from public.ghl_lead_effect_events where false;
    end;
    $$;

    create or replace function public.claim_next_ghl_sandbox_lead_outbox(
      p_worker_id text,
      p_now timestamptz default timezone('utc', now()),
      p_lease_ms integer default 300000
    ) returns setof public.ghl_provider_outbox
    language plpgsql security definer set search_path = public as $$
    begin
      if p_worker_id is null then raise exception 'p_worker_id is required'; end if;
      perform 1 from public.ghl_location_mappings where environment = 'sandbox';
      return query select * from public.ghl_provider_outbox
      where request_payload @> '{"provider_mode":"sandbox"}'::jsonb and false;
    end;
    $$;
  `, "Synthetic predecessor GHL sandbox protocol failed");
  psql(fs.readFileSync(productionMigrationPath, "utf8"), "GHL production/personalization migration failed");
  assert.ok(
    fs.existsSync(campaignPersonalizationMigrationPath),
    `GHL campaign-personalization migration is missing: ${campaignPersonalizationMigrationPath}`,
  );
  psql(
    fs.readFileSync(campaignPersonalizationMigrationPath, "utf8"),
    "GHL campaign-scoped personalization migration failed",
  );
  psql(`
    create table if not exists public.workspace_ghl_mapping (
      workspace_id uuid primary key,
      ghl_location_id text null,
      sync_enabled boolean not null default false
    );
    create table if not exists public.partner_ghl_config (
      partner_id uuid primary key,
      default_location_id text null,
      enabled boolean not null default false
    );
  `, "GHL compatibility-projection test prerequisites failed");
  psql(
    fs.readFileSync(ambiguousDispatchMigrationPath, "utf8"),
    "GHL ambiguous-dispatch terminalization migration failed",
  );
  psql(
    fs.readFileSync(providerAwarePublicationMigrationPath, "utf8"),
    "GHL provider-aware publication migration failed",
  );
  psql(`
    alter table public.ghl_location_mappings
      add column if not exists retired_at timestamptz null,
      add column if not exists retirement_reason text null,
      add column if not exists retired_by text null;
  `, "GHL preinstalled-location compatibility columns failed");
  psql(
    fs.readFileSync(preinstalledLocationReuseMigrationPath, "utf8"),
    "GHL preinstalled-location reuse migration failed",
  );
  psql(
    fs.readFileSync(provisioningLeaseRevisionMigrationPath, "utf8"),
    "GHL provisioning lease-revision migration failed",
  );

  const ambiguousProvisioningRunId = "60000000-0000-4000-8000-000000000001";
  const ambiguousLocationOutboxId = "60000000-0000-4000-8000-000000000002";
  const ambiguousSnapshotOutboxId = "60000000-0000-4000-8000-000000000003";
  psql(`
    insert into public.ghl_provisioning_runs (
      id, organization_id, environment, activation_event_id, installation_id,
      snapshot_manifest_id, idempotency_key, state
    ) values (
      '${ambiguousProvisioningRunId}', '${organizationId}', 'test',
      'ambiguous-dispatch-activation', '${installationId}', '${manifestId}',
      'ghl-provision-v1:test:ambiguous-dispatch', 'requested'
    );

    update public.ghl_provisioning_runs
    set state = 'location_create_requested', revision = revision + 1
    where id = '${ambiguousProvisioningRunId}';

    insert into public.ghl_provider_outbox (
      id, organization_id, provisioning_run_id, operation, idempotency_key,
      status, request_payload, attempt_count, available_at, locked_at, locked_by,
      lease_token, lease_generation, lease_expires_at
    ) values
      (
        '${ambiguousLocationOutboxId}', '${organizationId}', '${ambiguousProvisioningRunId}',
        'location_create', 'ghl-provision-v1:test:ambiguous-dispatch:location_create',
        'dispatching', '{"environment":"test"}'::jsonb, 1,
        timezone('utc', now()) - interval '2 minutes',
        timezone('utc', now()) - interval '2 minutes', 'expired-location-worker',
        '60000000-0000-4000-8000-000000000012', 1,
        timezone('utc', now()) - interval '1 minute'
      ),
      (
        '${ambiguousSnapshotOutboxId}', '${organizationId}', '${ambiguousProvisioningRunId}',
        'snapshot_install', 'ghl-provision-v1:test:ambiguous-dispatch:snapshot_install',
        'dispatching', '{"environment":"test"}'::jsonb, 1,
        timezone('utc', now()) - interval '2 minutes',
        timezone('utc', now()) - interval '2 minutes', 'expired-snapshot-worker',
        '60000000-0000-4000-8000-000000000013', 1,
        timezone('utc', now()) - interval '1 minute'
      );
  `, "Ambiguous provisioning-dispatch fixture failed");

  assert.equal(
    psql(`
      select count(*) from public.claim_ghl_provider_outbox(
        '${ambiguousLocationOutboxId}', '${organizationId}',
        'replacement-location-worker', timezone('utc', now()), 60000
      );
    `, "Expired location-create terminalization failed"),
    "0",
    "An expired location-create dispatch was automatically re-leased",
  );
  assert.equal(
    psql(`
      select concat_ws(
        '|', outbox.status, outbox.last_error_code,
        (outbox.lease_token is null)::text,
        receipt.outcome,
        receipt.receipt_metadata ->> 'providerMutationAttempted'
      )
      from public.ghl_provider_outbox outbox
      join public.ghl_provider_receipts receipt on receipt.outbox_id = outbox.id
      where outbox.id = '${ambiguousLocationOutboxId}';
    `, "Expired location-create terminal truth failed"),
    "uncertain|ghl_location_create_dispatch_lease_expired_uncertain|true|uncertain|true",
    "Expired location creation was not preserved as durable uncertainty",
  );
  assert.equal(
    psql(`
      select count(*) from public.claim_ghl_provider_outbox(
        '${ambiguousLocationOutboxId}', '${organizationId}',
        'unreconciled-location-worker', timezone('utc', now()), 60000
      );
    `, "Unreconciled location-create replay rejection failed"),
    "0",
    "An uncertain location-create result replayed before proven-absence reconciliation",
  );

  assert.equal(
    psql(`
      select count(*) from public.claim_ghl_provider_outbox(
        '${ambiguousSnapshotOutboxId}', '${organizationId}',
        'replacement-snapshot-worker', timezone('utc', now()), 60000
      );
    `, "Expired snapshot-install terminalization failed"),
    "0",
    "An expired snapshot-install dispatch was automatically re-leased",
  );
  assert.equal(
    psql(`
      select concat_ws('|', outbox.status, outbox.last_error_code, receipt.outcome)
      from public.ghl_provider_outbox outbox
      join public.ghl_provider_receipts receipt on receipt.outbox_id = outbox.id
      where outbox.id = '${ambiguousSnapshotOutboxId}';
    `, "Expired snapshot-install terminal truth failed"),
    "operator_action_required|ghl_provider_dispatch_lease_expired_operator_action_required|operator_action_required",
    "Expired non-location provisioning dispatch was not routed to operator action",
  );

  psql(`
    update public.ghl_provisioning_runs
    set state = 'location_create_requested',
        last_reconciled_at = timezone('utc', now()),
        last_error_code = 'location_absent_after_reconciliation',
        revision = revision + 1
    where id = '${ambiguousProvisioningRunId}';
  `, "Conclusive location-absence reconciliation fixture failed");
  assert.equal(
    psql(`
      select concat_ws('|', status, attempt_count::text, lease_generation::text)
      from public.claim_ghl_provider_outbox(
        '${ambiguousLocationOutboxId}', '${organizationId}',
        'reconciled-location-worker', timezone('utc', now()), 60000
      );
    `, "Reconciled location-create replay claim failed"),
    "dispatching|2|2",
    "A conclusively absent location create did not permit one fenced replay",
  );

  const sandboxDispatchInstallationId = "61000000-0000-4000-8000-000000000001";
  const productionDispatchInstallationId = "61000000-0000-4000-8000-000000000002";
  const sandboxDispatchManifestId = "61000000-0000-4000-8000-000000000003";
  const productionDispatchManifestId = "61000000-0000-4000-8000-000000000004";
  const sandboxDispatchMappingId = "61000000-0000-4000-8000-000000000005";
  const productionDispatchMappingId = "61000000-0000-4000-8000-000000000006";
  const sandboxDispatchLeadId = "61000000-0000-4000-8000-000000000007";
  const productionDispatchLeadId = "61000000-0000-4000-8000-000000000008";
  const sandboxDispatchOutboxId = "61000000-0000-4000-8000-000000000009";
  const productionDispatchOutboxId = "61000000-0000-4000-8000-000000000010";
  const sandboxDispatchEffectId = "61000000-0000-4000-8000-000000000011";
  const productionDispatchEffectId = "61000000-0000-4000-8000-000000000012";
  psql(`
    insert into public.leads (id, organization_id) values
      ('${sandboxDispatchLeadId}', '${organizationId}'),
      ('${productionDispatchLeadId}', '${organizationId}');

    insert into public.ghl_installations (
      id, environment, owner_kind, provider_agency_id,
      encrypted_credential_ref, status
    ) values
      (
        '${sandboxDispatchInstallationId}', 'sandbox', 'platform',
        'sandbox-ambiguous-dispatch-agency', 'env:GHL_SANDBOX_AGENCY_TOKEN', 'active'
      ),
      (
        '${productionDispatchInstallationId}', 'production', 'platform',
        'production-ambiguous-dispatch-agency', 'env:GHL_PRODUCTION_AGENCY_TOKEN', 'active'
      );

    insert into public.ghl_snapshot_manifests (
      id, environment, snapshot_key, snapshot_version, provider_snapshot_id,
      required_objects, installation_mode, installation_id, status, approved_at
    ) values
      (
        '${sandboxDispatchManifestId}', 'sandbox', 'ambiguous-dispatch', 'sandbox-v1',
        'sandbox-ambiguous-snapshot', '[{"kind":"tag","key":"dealflow-lead"}]'::jsonb,
        'preinstalled', '${sandboxDispatchInstallationId}', 'approved', timezone('utc', now())
      ),
      (
        '${productionDispatchManifestId}', 'production', 'ambiguous-dispatch', 'production-v1',
        'production-ambiguous-snapshot', '[{"kind":"tag","key":"dealflow-lead"}]'::jsonb,
        'preinstalled', '${productionDispatchInstallationId}', 'approved', timezone('utc', now())
      );

    insert into public.ghl_location_mappings (
      id, organization_id, installation_id, environment, provider_location_id,
      provisioning_owner, snapshot_manifest_id, status,
      snapshot_verified_at, required_objects_verified_at
    ) values
      (
        '${sandboxDispatchMappingId}', '${organizationId}', '${sandboxDispatchInstallationId}',
        'sandbox', 'sandbox-ambiguous-location', 'platform', '${sandboxDispatchManifestId}',
        'active', timezone('utc', now()), timezone('utc', now())
      ),
      (
        '${productionDispatchMappingId}', '${organizationId}', '${productionDispatchInstallationId}',
        'production', 'production-ambiguous-location', 'platform', '${productionDispatchManifestId}',
        'active', timezone('utc', now()), timezone('utc', now())
      );

    insert into public.ghl_provider_outbox (
      id, organization_id, operation, idempotency_key, status, request_payload,
      attempt_count, available_at, locked_at, locked_by, lease_token,
      lease_generation, lease_expires_at
    ) values
      (
        '${sandboxDispatchOutboxId}', '${organizationId}', 'lead_contact_upsert',
        'ghl-sandbox-ambiguous-dispatch', 'dispatching',
        jsonb_build_object(
          'provider_mode', 'sandbox', 'organization_id', '${organizationId}',
          'lead_id', '${sandboxDispatchLeadId}',
          'location_mapping_id', '${sandboxDispatchMappingId}', 'effect_kind', 'contact_upsert'
        ), 1, timezone('utc', now()) - interval '2 minutes',
        timezone('utc', now()) - interval '2 minutes', 'expired-sandbox-lead-worker',
        '61000000-0000-4000-8000-000000000021', 1,
        timezone('utc', now()) - interval '1 minute'
      ),
      (
        '${productionDispatchOutboxId}', '${organizationId}', 'lead_contact_upsert',
        'ghl-production-ambiguous-dispatch', 'dispatching',
        jsonb_build_object(
          'provider_mode', 'production', 'organization_id', '${organizationId}',
          'lead_id', '${productionDispatchLeadId}',
          'location_mapping_id', '${productionDispatchMappingId}', 'effect_kind', 'contact_upsert'
        ), 1, timezone('utc', now()) - interval '2 minutes',
        timezone('utc', now()) - interval '2 minutes', 'expired-production-lead-worker',
        '61000000-0000-4000-8000-000000000022', 1,
        timezone('utc', now()) - interval '1 minute'
      );

    insert into public.ghl_lead_effect_events (
      id, organization_id, lead_id, location_mapping_id, effect_kind,
      idempotency_key, status, outbox_id, attempt_count
    ) values
      (
        '${sandboxDispatchEffectId}', '${organizationId}', '${sandboxDispatchLeadId}',
        '${sandboxDispatchMappingId}', 'contact_upsert', 'ghl-sandbox-ambiguous-effect',
        'pending', '${sandboxDispatchOutboxId}', 0
      ),
      (
        '${productionDispatchEffectId}', '${organizationId}', '${productionDispatchLeadId}',
        '${productionDispatchMappingId}', 'contact_upsert', 'ghl-production-ambiguous-effect',
        'pending', '${productionDispatchOutboxId}', 0
      );

    update public.ghl_lead_effect_events
    set status = 'dispatching', attempt_count = 1
    where id in ('${sandboxDispatchEffectId}', '${productionDispatchEffectId}');

    update public.ghl_runtime_controls
    set lead_writes_enabled = true
    where environment = 'production';
  `, "Ambiguous sandbox/production lead-dispatch fixture failed");

  for (const [mode, outboxId, effectId] of [
    ["sandbox", sandboxDispatchOutboxId, sandboxDispatchEffectId],
    ["production", productionDispatchOutboxId, productionDispatchEffectId],
  ]) {
    assert.equal(
      psql(`
        select count(*) from public.claim_next_ghl_${mode}_lead_outbox(
          'replacement-${mode}-lead-worker', timezone('utc', now()), 60000
        );
      `, `Expired ${mode} lead dispatch terminalization failed`),
      "0",
      `An expired ${mode} lead dispatch was automatically re-leased`,
    );
    assert.equal(
      psql(`
        select concat_ws(
          '|', outbox.status, effect.status, outbox.last_error_code,
          effect.last_error_code, (outbox.lease_token is null)::text,
          receipt.outcome,
          receipt.receipt_metadata ->> 'provider_mutation_attempted'
        )
        from public.ghl_provider_outbox outbox
        join public.ghl_lead_effect_events effect
          on effect.outbox_id = outbox.id and effect.id = '${effectId}'
        join public.ghl_provider_receipts receipt on receipt.outbox_id = outbox.id
        where outbox.id = '${outboxId}';
      `, `Expired ${mode} lead dispatch terminal truth failed`),
      "uncertain|uncertain|ghl_lead_effect_dispatch_lease_expired_uncertain|ghl_lead_effect_dispatch_lease_expired_uncertain|true|uncertain|true",
      `Expired ${mode} lead dispatch was not preserved as durable uncertainty`,
    );
    assert.equal(
      psql(`
        select count(*) from public.claim_next_ghl_${mode}_lead_outbox(
          'second-${mode}-lead-worker', timezone('utc', now()) + interval '1 hour', 60000
        );
      `, `Terminal ${mode} lead replay check failed`),
      "0",
      `A terminal uncertain ${mode} lead effect was automatically replayed`,
    );
  }
  psql(`
    update public.ghl_location_mappings
    set status = 'inactive'
    where id in ('${sandboxDispatchMappingId}', '${productionDispatchMappingId}');
    update public.ghl_installations
    set status = 'inactive'
    where id in ('${sandboxDispatchInstallationId}', '${productionDispatchInstallationId}');
  `, "Ambiguous-dispatch fixture retirement failed");

  const lifecycleInstallationId = "62000000-0000-4000-8000-000000000001";
  const lifecycleManifestId = "62000000-0000-4000-8000-000000000002";
  const lifecycleMappingAId = "62000000-0000-4000-8000-000000000003";
  const lifecycleMappingBId = "62000000-0000-4000-8000-000000000004";
  const lifecycleUserAId = "62000000-0000-4000-8000-000000000005";
  const lifecycleUserBId = "62000000-0000-4000-8000-000000000006";
  const lifecycleCampaignAId = "62000000-0000-4000-8000-000000000007";
  const lifecycleCampaignBId = "62000000-0000-4000-8000-000000000008";
  const lifecycleLeadAId = "62000000-0000-4000-8000-000000000009";
  const lifecycleLeadBId = "62000000-0000-4000-8000-000000000010";
  const lifecycleAmbiguousLeadId = "62000000-0000-4000-8000-000000000011";
  const lifecycleLocationA = "production_lifecycle_location_a";
  const lifecycleLocationB = "production_lifecycle_location_b";
  const lifecycleContactShared = "contact_shared_across_tenants";
  const lifecycleContactAmbiguous = "contact_ambiguous_within_tenant";
  const lifecycleOpportunityA = "opportunity_lifecycle_a";

  psql(`
    insert into public.users (id, email) values
      ('${lifecycleUserAId}', 'lifecycle-a@example.test'),
      ('${lifecycleUserBId}', 'lifecycle-b@example.test');

    update public.organizations set owner_user_id = '${lifecycleUserAId}'
    where id = '${organizationId}';
    update public.organizations set owner_user_id = '${lifecycleUserBId}'
    where id = '${otherOrganizationId}';

    insert into public.organization_memberships (organization_id, user_id, role) values
      ('${organizationId}', '${lifecycleUserAId}', 'owner'),
      ('${otherOrganizationId}', '${lifecycleUserBId}', 'owner');

    insert into public.ghl_workspace_tenants (
      organization_id, tenant_kind, partner_id, status
    ) values (
      '${otherOrganizationId}', 'direct_realtor', null, 'active'
    );

    insert into public.campaign_plans (id, organization_id, user_id, plan, publish_state) values
      ('${lifecycleCampaignAId}', '${organizationId}', '${lifecycleUserAId}', '{}'::jsonb, 'published'),
      ('${lifecycleCampaignBId}', '${otherOrganizationId}', '${lifecycleUserBId}', '{}'::jsonb, 'published');

    insert into public.leads (id, organization_id, user_id, campaign_id, status) values
      ('${lifecycleLeadAId}', '${organizationId}', '${lifecycleUserAId}', '${lifecycleCampaignAId}', 'new'),
      ('${lifecycleLeadBId}', '${otherOrganizationId}', '${lifecycleUserBId}', '${lifecycleCampaignBId}', 'new'),
      ('${lifecycleAmbiguousLeadId}', '${organizationId}', '${lifecycleUserAId}', '${lifecycleCampaignAId}', 'new');

    insert into public.ghl_installations (
      id, environment, owner_kind, partner_id, provider_agency_id,
      encrypted_credential_ref, status
    ) values (
      '${lifecycleInstallationId}', 'production', 'platform', null,
      'production-lifecycle-agency', 'env:GHL_PRODUCTION_AGENCY_TOKEN', 'active'
    );

    insert into public.ghl_snapshot_manifests (
      id, environment, snapshot_key, snapshot_version, provider_snapshot_id,
      required_objects, installation_mode, installation_id, status, approved_at
    ) values (
      '${lifecycleManifestId}', 'production', 'lifecycle-proof', 'v1',
      'production-lifecycle-snapshot', '[{"kind":"calendar","key":"appointments"}]'::jsonb,
      'preinstalled', '${lifecycleInstallationId}', 'approved', timezone('utc', now())
    );

    insert into public.ghl_location_mappings (
      id, organization_id, installation_id, environment, provider_location_id,
      provisioning_owner, snapshot_manifest_id, status,
      snapshot_verified_at, required_objects_verified_at
    ) values
      (
        '${lifecycleMappingAId}', '${organizationId}', '${lifecycleInstallationId}',
        'production', '${lifecycleLocationA}', 'platform', '${lifecycleManifestId}',
        'active', timezone('utc', now()), timezone('utc', now())
      ),
      (
        '${lifecycleMappingBId}', '${otherOrganizationId}', '${lifecycleInstallationId}',
        'production', '${lifecycleLocationB}', 'platform', '${lifecycleManifestId}',
        'active', timezone('utc', now()), timezone('utc', now())
      );

    insert into public.ghl_lead_effect_events (
      organization_id, lead_id, location_mapping_id, effect_kind,
      idempotency_key, status
    ) values
      ('${organizationId}', '${lifecycleLeadAId}', '${lifecycleMappingAId}',
       'contact_upsert', 'lifecycle-a-contact-shared', 'pending'),
      ('${organizationId}', '${lifecycleLeadAId}', '${lifecycleMappingAId}',
       'opportunity_upsert', 'lifecycle-a-opportunity', 'pending'),
      ('${organizationId}', '${lifecycleLeadAId}', '${lifecycleMappingAId}',
       'contact_upsert', 'lifecycle-a-contact-ambiguous-first', 'pending'),
      ('${organizationId}', '${lifecycleAmbiguousLeadId}', '${lifecycleMappingAId}',
       'contact_upsert', 'lifecycle-a-contact-ambiguous-second', 'pending'),
      ('${otherOrganizationId}', '${lifecycleLeadBId}', '${lifecycleMappingBId}',
       'contact_upsert', 'lifecycle-b-contact-shared', 'pending');

    update public.ghl_lead_effect_events
    set status = 'dispatching', attempt_count = 1
    where idempotency_key like 'lifecycle-%';

    update public.ghl_lead_effect_events
    set status = 'succeeded',
        provider_contact_id = case
          when idempotency_key in (
            'lifecycle-a-contact-ambiguous-first',
            'lifecycle-a-contact-ambiguous-second'
          ) then '${lifecycleContactAmbiguous}'
          else '${lifecycleContactShared}'
        end,
        provider_opportunity_id = case
          when idempotency_key = 'lifecycle-a-opportunity' then '${lifecycleOpportunityA}'
          else null
        end,
        completed_at = timezone('utc', now())
    where idempotency_key like 'lifecycle-%';

    update public.ghl_runtime_controls
    set lifecycle_webhook_enabled = true
    where environment = 'production';
  `, "Tenant-fenced GHL lifecycle fixture failed");

  const mainAppointmentId = "appointment_lifecycle_main";
  const createResult = ingestLifecycle({
    locationId: lifecycleLocationA,
    eventId: "lifecycle_main_create",
    eventType: "AppointmentCreate",
    objectId: mainAppointmentId,
    contactId: lifecycleContactShared,
    calendarId: "calendar_lifecycle_a",
    status: "confirmed",
    startsAt: "2026-07-14T13:00:00.000Z",
    endsAt: "2026-07-14T13:30:00.000Z",
    updatedAt: "2026-07-13T20:01:00.000Z",
    receivedAt: "2026-07-13T20:01:01.000Z",
  });
  assert.match(
    createResult,
    new RegExp(`^reconciled\\|canonical_state_projected\\|${lifecycleLeadAId}\\|[0-9a-f-]{36}$`),
    "AppointmentCreate did not project one exact canonical appointment",
  );
  assert.equal(
    ingestLifecycle({
      locationId: lifecycleLocationA,
      eventId: "lifecycle_main_create",
      eventType: "AppointmentCreate",
      objectId: mainAppointmentId,
      contactId: lifecycleContactShared,
      calendarId: "calendar_lifecycle_a",
      status: "confirmed",
      startsAt: "2026-07-14T13:00:00.000Z",
      endsAt: "2026-07-14T13:30:00.000Z",
      updatedAt: "2026-07-13T20:01:00.000Z",
      receivedAt: "2026-07-13T20:01:01.000Z",
    }),
    createResult,
    "Exact webhook replay did not return the original durable projection",
  );
  assert.equal(
    psql(`
      select concat_ws(
        '|', count(*)::text, min(appointment.status), min(appointment.lead_id::text),
        min(appointment.campaign_id::text), min(lead.status)
      )
      from public.appointments appointment
      join public.leads lead
        on lead.id = appointment.lead_id
       and lead.organization_id = appointment.organization_id
      where appointment.ghl_location_mapping_id = '${lifecycleMappingAId}'
        and appointment.ghl_appointment_id = '${mainAppointmentId}';
    `, "Canonical appointment create truth failed"),
    `1|booked|${lifecycleLeadAId}|${lifecycleCampaignAId}|booked`,
    "Appointment replay duplicated or crossed canonical campaign/lead scope",
  );

  const updateResult = ingestLifecycle({
    locationId: lifecycleLocationA,
    eventId: "lifecycle_main_update",
    eventType: "AppointmentUpdate",
    objectId: mainAppointmentId,
    contactId: lifecycleContactShared,
    calendarId: "calendar_lifecycle_a",
    status: "showed",
    startsAt: "2026-07-14T13:15:00.000Z",
    endsAt: "2026-07-14T13:45:00.000Z",
    updatedAt: "2026-07-13T20:02:00.000Z",
    receivedAt: "2026-07-13T20:02:01.000Z",
  });
  assert.match(updateResult, /^reconciled\|canonical_state_projected\|/);
  assert.equal(
    psql(`
      select concat_ws('|', status, scheduled_at::text, ghl_last_event_id)
      from public.appointments
      where ghl_location_mapping_id = '${lifecycleMappingAId}'
        and ghl_appointment_id = '${mainAppointmentId}';
    `, "Canonical appointment update truth failed"),
    "completed|2026-07-14 13:15:00+00|lifecycle_main_update",
    "AppointmentUpdate did not advance canonical status and schedule",
  );

  assert.equal(
    ingestLifecycle({
      locationId: lifecycleLocationA,
      eventId: "lifecycle_main_same_version_conflict",
      eventType: "AppointmentUpdate",
      objectId: mainAppointmentId,
      contactId: lifecycleContactShared,
      calendarId: "calendar_lifecycle_a",
      status: "active",
      startsAt: "2026-07-14T13:30:00.000Z",
      endsAt: "2026-07-14T14:00:00.000Z",
      updatedAt: "2026-07-13T20:02:00.000Z",
      receivedAt: "2026-07-13T20:02:30.000Z",
    }),
    "operator_action_required|ghl_lifecycle_same_version_conflict||",
    "Same provider version with different content was not durably operator-routed",
  );

  assert.equal(
    ingestLifecycle({
      locationId: lifecycleLocationA,
      eventId: "lifecycle_main_out_of_order",
      eventType: "AppointmentUpdate",
      objectId: mainAppointmentId,
      contactId: lifecycleContactShared,
      calendarId: "calendar_lifecycle_a",
      status: "active",
      startsAt: "2026-07-14T12:45:00.000Z",
      endsAt: "2026-07-14T13:15:00.000Z",
      updatedAt: "2026-07-13T20:01:30.000Z",
      receivedAt: "2026-07-13T20:03:01.000Z",
    }),
    "operator_action_required|ghl_lifecycle_out_of_order_event||",
    "Out-of-order appointment update was not durably operator-routed",
  );
  assert.equal(
    psql(`
      select concat_ws('|', status, scheduled_at::text, ghl_last_event_id)
      from public.appointments
      where ghl_location_mapping_id = '${lifecycleMappingAId}'
        and ghl_appointment_id = '${mainAppointmentId}';
    `, "Out-of-order appointment immutability check failed"),
    "completed|2026-07-14 13:15:00+00|lifecycle_main_update",
    "Out-of-order event mutated canonical appointment truth",
  );

  assert.match(
    ingestLifecycle({
      locationId: lifecycleLocationA,
      eventId: "lifecycle_main_delete",
      eventType: "AppointmentDelete",
      objectId: mainAppointmentId,
      contactId: lifecycleContactShared,
      calendarId: "calendar_lifecycle_a",
      updatedAt: "2026-07-13T20:04:00.000Z",
      receivedAt: "2026-07-13T20:04:01.000Z",
    }),
    /^reconciled\|canonical_state_projected\|/,
  );
  assert.equal(
    psql(`
      select concat_ws('|', status, (ghl_deleted_at is not null)::text, ghl_last_event_id)
      from public.appointments
      where ghl_location_mapping_id = '${lifecycleMappingAId}'
        and ghl_appointment_id = '${mainAppointmentId}';
    `, "Canonical appointment delete truth failed"),
    "canceled|true|lifecycle_main_delete",
    "AppointmentDelete did not preserve a canceled canonical tombstone",
  );

  const documentedAppointmentStatuses = [
    ["new", "booked"],
    ["confirmed", "booked"],
    ["active", "booked"],
    ["showed", "completed"],
    ["completed", "completed"],
    ["cancelled", "canceled"],
    ["noshow", "no_show"],
  ];
  for (const [providerStatus, canonicalStatus] of documentedAppointmentStatuses) {
    const objectId = `appointment_status_${providerStatus}`;
    const eventId = `lifecycle_status_${providerStatus}`;
    assert.match(
      ingestLifecycle({
        locationId: lifecycleLocationA,
        eventId,
        eventType: "AppointmentCreate",
        objectId,
        contactId: lifecycleContactShared,
        calendarId: "calendar_lifecycle_a",
        status: providerStatus,
        startsAt: "2026-07-15T13:00:00.000Z",
        endsAt: "2026-07-15T13:30:00.000Z",
        updatedAt: `2026-07-13T21:${String(documentedAppointmentStatuses.indexOf(documentedAppointmentStatuses.find(([status]) => status === providerStatus))).padStart(2, "0")}:00.000Z`,
        receivedAt: "2026-07-13T22:00:00.000Z",
      }),
      /^reconciled\|canonical_state_projected\|/,
      `${providerStatus} did not reconcile`,
    );
    assert.equal(
      psql(`
        select status from public.appointments
        where ghl_location_mapping_id = '${lifecycleMappingAId}'
          and ghl_appointment_id = '${objectId}';
      `, `Canonical status check failed for ${providerStatus}`),
      canonicalStatus,
      `GHL ${providerStatus} mapped to an unsafe canonical appointment status`,
    );
  }

  assert.equal(
    ingestLifecycle({
      locationId: lifecycleLocationA,
      eventId: "lifecycle_status_unknown",
      eventType: "AppointmentCreate",
      objectId: "appointment_status_unknown",
      contactId: lifecycleContactShared,
      calendarId: "calendar_lifecycle_a",
      status: "rescheduled_somewhere_else",
      startsAt: "2026-07-15T14:00:00.000Z",
      endsAt: "2026-07-15T14:30:00.000Z",
      updatedAt: "2026-07-13T21:30:00.000Z",
      receivedAt: "2026-07-13T22:01:00.000Z",
    }),
    "operator_action_required|ghl_lifecycle_appointment_status_unknown||",
    "Unknown appointment status was counted as booked instead of failing safe",
  );
  assert.equal(
    psql(`
      select count(*) from public.appointments
      where ghl_location_mapping_id = '${lifecycleMappingAId}'
        and ghl_appointment_id = 'appointment_status_unknown';
    `, "Unknown appointment status persistence check failed"),
    "0",
    "Unknown appointment status created a canonical appointment",
  );

  for (const [eventId, timestamp] of [
    ["lifecycle_contact_first", "2026-07-13T23:01:00.000Z"],
    ["lifecycle_contact_latest", "2026-07-13T23:02:00.000Z"],
  ]) {
    assert.match(ingestLifecycle({
      locationId: lifecycleLocationA,
      eventId,
      eventType: "ContactUpdate",
      objectId: lifecycleContactShared,
      contactId: lifecycleContactShared,
      updatedAt: timestamp,
      receivedAt: timestamp,
    }), /^reconciled\|canonical_state_projected\|/);
  }
  for (const [eventId, providerStatus, timestamp] of [
    ["lifecycle_opportunity_open", "open", "2026-07-13T23:03:00.000Z"],
    ["lifecycle_opportunity_won", "won", "2026-07-13T23:04:00.000Z"],
    ["lifecycle_opportunity_lost", "lost", "2026-07-13T23:04:30.000Z"],
  ]) {
    assert.match(ingestLifecycle({
      locationId: lifecycleLocationA,
      eventId,
      eventType: "OpportunityStatusUpdate",
      objectId: lifecycleOpportunityA,
      contactId: lifecycleContactShared,
      status: providerStatus,
      updatedAt: timestamp,
      receivedAt: timestamp,
    }), /^reconciled\|canonical_state_projected\|/);
  }
  assert.equal(
    psql(`
      select string_agg(object_kind || ':' || last_event_id, '|' order by object_kind)
      from public.ghl_lifecycle_object_states
      where location_mapping_id = '${lifecycleMappingAId}'
        and object_kind in ('contact', 'opportunity');
    `, "Latest contact/opportunity lifecycle state check failed"),
    "contact:lifecycle_contact_latest|opportunity:lifecycle_opportunity_lost",
    "Contact or opportunity projection did not retain the latest provider timestamp",
  );

  assert.match(
    ingestLifecycle({
      locationId: lifecycleLocationA,
      eventId: "lifecycle_outbound_message",
      eventType: "OutboundMessage",
      objectId: "outbound_message_lifecycle_a",
      contactId: lifecycleContactShared,
      status: "delivered",
      updatedAt: "2026-07-13T23:04:45.000Z",
      receivedAt: "2026-07-13T23:04:46.000Z",
    }),
    /^reconciled\|canonical_state_projected\|/,
    "Outbound-message outcome did not project to canonical lifecycle state",
  );
  assert.equal(
    psql(`
      select concat_ws('|', object_kind, provider_status, lead_id::text)
      from public.ghl_lifecycle_object_states
      where location_mapping_id = '${lifecycleMappingAId}'
        and provider_object_id = 'outbound_message_lifecycle_a';
    `, "Outbound-message lifecycle state check failed"),
    `outbound_message|delivered|${lifecycleLeadAId}`,
    "Outbound-message outcome was not tenant-fenced to the known lead",
  );

  assert.equal(
    ingestLifecycle({
      locationId: lifecycleLocationA,
      eventId: "lifecycle_unmatched_contact",
      eventType: "ContactUpdate",
      objectId: "contact_not_bound_to_any_lead",
      updatedAt: "2026-07-13T23:05:00.000Z",
      receivedAt: "2026-07-13T23:05:01.000Z",
    }),
    "operator_action_required|ghl_lifecycle_unknown_lead_binding||",
    "Unmatched contact was not durably operator-routed",
  );
  assert.equal(
    ingestLifecycle({
      locationId: lifecycleLocationA,
      eventId: "lifecycle_unmatched_contact",
      eventType: "ContactUpdate",
      objectId: "contact_not_bound_to_any_lead",
      updatedAt: "2026-07-13T23:05:00.000Z",
      receivedAt: "2026-07-13T23:05:01.000Z",
    }),
    "operator_action_required|ghl_lifecycle_unknown_lead_binding||",
    "Unknown-contact replay did not return its original durable operator result",
  );
  assert.equal(
    ingestLifecycle({
      locationId: lifecycleLocationA,
      eventId: "lifecycle_ambiguous_contact",
      eventType: "ContactUpdate",
      objectId: lifecycleContactAmbiguous,
      updatedAt: "2026-07-13T23:06:00.000Z",
      receivedAt: "2026-07-13T23:06:01.000Z",
    }),
    "operator_action_required|ghl_lifecycle_ambiguous_lead_binding||",
    "Ambiguous same-tenant contact was not durably operator-routed",
  );

  const tenantBAppointmentResult = ingestLifecycle({
    locationId: lifecycleLocationB,
    eventId: "lifecycle_tenant_b_create",
    eventType: "AppointmentCreate",
    objectId: "appointment_lifecycle_tenant_b",
    contactId: lifecycleContactShared,
    calendarId: "calendar_lifecycle_b",
    status: "active",
    startsAt: "2026-07-16T15:00:00.000Z",
    endsAt: "2026-07-16T15:30:00.000Z",
    updatedAt: "2026-07-13T23:07:00.000Z",
    receivedAt: "2026-07-13T23:07:01.000Z",
  });
  assert.match(
    tenantBAppointmentResult,
    new RegExp(`^reconciled\\|canonical_state_projected\\|${lifecycleLeadBId}\\|`),
    "Same provider contact id crossed tenant boundaries",
  );
  assert.equal(
    psql(`
      select concat_ws('|', organization_id::text, lead_id::text, campaign_id::text, status)
      from public.appointments
      where ghl_location_mapping_id = '${lifecycleMappingBId}'
        and ghl_appointment_id = 'appointment_lifecycle_tenant_b';
    `, "Second-tenant appointment projection check failed"),
    `${otherOrganizationId}|${lifecycleLeadBId}|${lifecycleCampaignBId}|booked`,
    "Second-tenant appointment was not fenced to its exact campaign and lead",
  );

  assert.ok(
    Number(psql(`
      select count(*) from public.appointments
      where organization_id = '${organizationId}'
        and campaign_id = '${lifecycleCampaignAId}'
        and status in ('booked', 'completed');
    `, "Dashboard-visible lifecycle appointment count failed")) > 0,
    "Canonical lifecycle appointments remained invisible to campaign dashboard reporting",
  );
  assert.equal(
    psql(`
      select concat_ws(
        '|',
        count(*) filter (where projection_status = 'operator_action_required')::text,
        (select count(*) from public.ghl_operator_requests where request_kind = 'lifecycle_reconciliation')::text
      )
      from public.ghl_lifecycle_webhook_events;
    `, "Durable lifecycle operator-action parity check failed"),
    "5|5",
    "Lifecycle conflicts were not paired one-for-one with durable operator work",
  );
  assert.equal(
    psql(`
      select concat(
        has_function_privilege(
          'authenticated',
          'public.ingest_ghl_lifecycle_webhook_v1(text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text,timestamptz)',
          'EXECUTE'
        ),
        '|',
        has_table_privilege('authenticated', 'public.ghl_lifecycle_object_states', 'SELECT'),
        '|',
        has_table_privilege('service_role', 'public.ghl_lifecycle_object_states', 'INSERT'),
        '|',
        has_table_privilege('service_role', 'public.ghl_lifecycle_webhook_events', 'INSERT')
      );
    `, "GHL lifecycle ACL check failed"),
    "f|f|f|f",
    "Lifecycle receipt or projection tables retained direct write authority",
  );
  psqlAsMustFail(
    authenticatedProbeRole,
    `select count(*) from public.ghl_lifecycle_object_states;`,
    /permission denied/i,
    "Authenticated role read internal GHL lifecycle state",
  );

  const paidOrganizationId = "50000000-0000-4000-8000-000000000001";
  const paidUserId = "50000000-0000-4000-8000-000000000002";
  const activationId = "50000000-0000-4000-8000-000000000003";
  const sandboxInstallationId = "50000000-0000-4000-8000-000000000004";
  const sandboxManifestId = "50000000-0000-4000-8000-000000000005";
  const paidMappingId = "50000000-0000-4000-8000-000000000006";
  const firstCampaignId = "50000000-0000-4000-8000-000000000007";
  const secondCampaignId = "50000000-0000-4000-8000-000000000008";
  const thirdCampaignId = "50000000-0000-4000-8000-000000000009";
  const alternatePaidMappingId = "50000000-0000-4000-8000-000000000010";
  psql(`
    insert into public.users (id, email) values ('${paidUserId}', 'paid-synthetic@example.test');
    insert into public.organizations (id, owner_user_id, name)
    values ('${paidOrganizationId}', '${paidUserId}', 'Paid Synthetic Realty');
    insert into public.organization_memberships (organization_id, user_id, role)
    values ('${paidOrganizationId}', '${paidUserId}', 'owner');
    insert into public.commercial_activations (
      id, organization_id, user_id, source_provider, source_event_id,
      source_event_type, source_subscription_id, amount_paid_cents
    ) values (
      '${activationId}', '${paidOrganizationId}', '${paidUserId}', 'stripe', 'evt_paid_synthetic',
      'checkout.session.completed', 'sub_paid_synthetic', 29700
    );
    insert into public.campaign_plans (id, organization_id, publish_state, plan)
    values
      (
        '${firstCampaignId}', '${paidOrganizationId}', 'published',
        '{
          "onboarding_contract_version":1,
          "onboarding_contract":{
            "businessType":"real_estate_realtor","adDestination":"website","campaignMode":"seller",
            "offer":"Free seller valuation","market":"Toronto","audience":"Toronto homeowners",
            "propertyType":"Detached homes","priceRange":"$800k-$1.5m",
            "agentFirstName":"Ada","agentLastName":"Lovelace","agentCompanyName":"Synthetic Realty",
            "agentPhone":"+14165550101","funnelLanguage":"en","themePrimaryColor":"#112233",
            "themeSecondaryColor":"#445566","themeAccentColor":"#778899","logoUrl":"https://assets.example.test/logo-a.png"
          },
          "selected_ad_id":"creative-a",
          "staticAds":[{"id":"creative-a","headline":"Know what your Toronto home is worth","primaryText":"Get a clear local valuation before you list.","cta":"Get my valuation"}],
          "campaign_payload":{
            "selected_ad_id":"creative-a",
            "funnel":{"headlines":["Know what your Toronto home is worth"],"cta":"Get my valuation"},
            "creatives":{"primary_text_variations":["Get a clear local valuation before you list."]}
          }
        }'::jsonb
      ),
      (
        '${secondCampaignId}', '${paidOrganizationId}', 'published',
        '{
          "onboarding_contract_version":1,
          "onboarding_contract":{
            "businessType":"real_estate_realtor","adDestination":"website","campaignMode":"buyer",
            "offer":"Off-market buyer list","market":"Mississauga","audience":"First-time buyers",
            "propertyType":"Condos","priceRange":"$500k-$800k",
            "agentFirstName":"Grace","agentLastName":"Hopper","agentCompanyName":"Synthetic Realty",
            "agentPhone":"+19055550102","funnelLanguage":"en","themePrimaryColor":"#123456",
            "themeSecondaryColor":"#abcdef","themeAccentColor":"#fedcba","logoUrl":"https://assets.example.test/logo-b.png"
          },
          "selected_ad_id":"creative-b",
          "staticAds":[{"id":"creative-b","headline":"See Mississauga homes before everyone else","primaryText":"Find the right condo with a focused local list.","cta":"Get the list"}],
          "campaign_payload":{
            "selected_ad_id":"creative-b",
            "funnel":{"headlines":["See Mississauga homes before everyone else"],"cta":"Get the list"},
            "creatives":{"primary_text_variations":["Find the right condo with a focused local list."]}
          }
        }'::jsonb
      ),
      (
        '${thirdCampaignId}', '${paidOrganizationId}', 'published',
        '{
          "onboarding_contract_version":1,
          "onboarding_contract":{
            "businessType":"real_estate_realtor","adDestination":"website","campaignMode":"investor",
            "offer":"Investor property list","market":"Hamilton","audience":"Local investors",
            "propertyType":"Multiplex","priceRange":"$700k-$1.2m",
            "agentFirstName":"Katherine","agentLastName":"Johnson","agentCompanyName":"Synthetic Realty",
            "agentPhone":"+19055550103","funnelLanguage":"en","themePrimaryColor":"#223344",
            "themeSecondaryColor":"#556677","themeAccentColor":"#8899aa","logoUrl":""
          },
          "selected_ad_id":"creative-c",
          "staticAds":[{"id":"creative-c","headline":"Find Hamilton investment properties","primaryText":"Review focused multiplex opportunities.","cta":"See opportunities"}],
          "campaign_payload":{
            "selected_ad_id":"creative-c",
            "funnel":{"headlines":["Find Hamilton investment properties"],"cta":"See opportunities"},
            "creatives":{"primary_text_variations":["Review focused multiplex opportunities."]}
          }
        }'::jsonb
      );
    insert into public.ghl_installations (
      id, environment, owner_kind, provider_agency_id, encrypted_credential_ref,
      status, capability_manifest
    ) values (
      '${sandboxInstallationId}', 'sandbox', 'platform', 'sandbox-paid-agency',
      'env:GHL_SANDBOX_AGENCY_TOKEN', 'active',
      '{"defaultCountry":"CA","defaultTimezone":"America/Toronto"}'::jsonb
    );
    insert into public.ghl_snapshot_manifests (
      id, environment, snapshot_key, snapshot_version, provider_snapshot_id,
      required_objects, installation_mode, installation_id, personalization_contract, status, approved_at
    ) values (
      '${sandboxManifestId}', 'sandbox', 'paid-snapshot', '1.0.0', 'paid-provider-snapshot',
      '[{"kind":"pipeline","key":"new-lead","providerObjectId":"pipeline-paid"}]'::jsonb,
      'preinstalled', '${sandboxInstallationId}',
      jsonb_build_object(
        'customValues', jsonb_build_object('DealFlow Platform', 'DealFlow'),
        'requiredFormIds', jsonb_build_array('form-paid-root'),
        'destinationUrl', 'https://funnels.example.test/root',
        'campaignSlots', jsonb_build_array(
          jsonb_build_object(
            'slotKey', 'slot-a',
            'destinationUrl', 'https://funnels.example.test/campaign-a',
            'requiredFormIds', jsonb_build_array('form-paid-a'),
            'customValueNames', (
              select jsonb_object_agg(entry.key, entry.value || ' Slot A')
              from jsonb_each_text(public.ghl_default_campaign_custom_value_names_v2()) entry
            )
          ),
          jsonb_build_object(
            'slotKey', 'slot-b',
            'destinationUrl', 'https://funnels.example.test/campaign-b',
            'requiredFormIds', jsonb_build_array('form-paid-b'),
            'customValueNames', (
              select jsonb_object_agg(entry.key, entry.value || ' Slot B')
              from jsonb_each_text(public.ghl_default_campaign_custom_value_names_v2()) entry
            )
          )
        )
      ),
      'approved', timezone('utc', now())
    );
    insert into public.ghl_workspace_tenants (
      organization_id, tenant_kind, partner_id, status
    ) values (
      '${paidOrganizationId}', 'direct_realtor', null, 'active'
    );
    insert into public.ghl_location_mappings (
      id, organization_id, installation_id, environment, provider_location_id,
      provisioning_owner, status
    ) values (
      '${paidMappingId}', '${paidOrganizationId}', '${sandboxInstallationId}', 'sandbox',
      'paid-sandbox-location', 'platform', 'provisioning'
    );
  `, "Paid GHL activation fixture failed");

  psqlMustFail(`
    select count(*) from public.request_ghl_provisioning_from_billing_activation_v1(
      '${paidOrganizationId}', '${paidUserId}', 'sandbox',
      '50000000-0000-4000-8000-000000000099', 'sub_paid_synthetic', timezone('utc', now())
    );
  `, /no data found|query returned no rows/i, "Missing commercial activation was accepted");

  const activationReceipt = psql(`
    select concat_ws('|', request_id::text, request_status, provisioning_run_id::text)
    from public.request_ghl_provisioning_from_billing_activation_v1(
      '${paidOrganizationId}', '${paidUserId}', 'sandbox',
      '${activationId}', 'sub_paid_synthetic', timezone('utc', now())
    );
  `, "Commercial-activation GHL request failed");
  const replayedActivationReceipt = psql(`
    select concat_ws('|', request_id::text, request_status, provisioning_run_id::text)
    from public.request_ghl_provisioning_from_billing_activation_v1(
      '${paidOrganizationId}', '${paidUserId}', 'sandbox',
      '${activationId}', 'sub_paid_synthetic', timezone('utc', now())
    );
  `, "Commercial-activation GHL replay failed");
  assert.equal(replayedActivationReceipt, activationReceipt, "Paid activation replay changed its durable request/run identity");
  const [, activationStatus, provisioningRunId] = activationReceipt.split("|");
  assert.equal(activationStatus, "provisioning_requested");
  assert.match(provisioningRunId, /^[0-9a-f-]{36}$/i);
  assert.equal(
    psql(`
      select concat_ws(
        '|', run.state, run.location_mapping_id::text,
        (run.state_metadata ->> 'preinstalled_location_reused'),
        mapping.snapshot_manifest_id::text
      )
      from public.ghl_provisioning_runs run
      join public.ghl_location_mappings mapping
        on mapping.id = run.location_mapping_id
       and mapping.organization_id = run.organization_id
      where run.id = '${provisioningRunId}';
    `, "Preinstalled GHL location reuse proof failed"),
    `snapshot_install_requested|${paidMappingId}|true|${sandboxManifestId}`,
    "Paid activation did not reuse and bind the exact OAuth-proven GHL location",
  );
  assert.equal(
    psql(`
      select count(*)::text
      from public.ghl_provider_outbox
      where provisioning_run_id = '${provisioningRunId}'
        and operation = 'location_create';
    `, "Duplicate-location outbox absence proof failed"),
    "0",
    "Paid activation created a provider-location mutation outbox",
  );

  psqlMustFail(`
    select count(*) from public.claim_next_ghl_provisioning_run_v1(
      'sandbox', 'closed-control-worker', timezone('utc', now()), 60000
    );
  `, /database kill switch is closed/i, "Closed provisioning database control allowed a claim");
  psql(`
    update public.ghl_runtime_controls set provisioning_writes_enabled = true where environment = 'sandbox';
  `, "Opening synthetic personalization control failed");

  const revisionBeforeLease = Number(
    psql(
      `select revision::text from public.ghl_provisioning_runs where id = '${provisioningRunId}';`,
      "Pre-claim provisioning revision read failed",
    ),
  );
  const claimedLease = psql(`
    select concat_ws(
      '|',
      revision::text,
      lease_generation::text,
      locked_by,
      lease_token::text
    )
    from public.claim_next_ghl_provisioning_run_v1(
      'sandbox', 'revision-fenced-worker', timezone('utc', now()), 60000
    );
  `, "Revision-fenced provisioning claim failed");
  const [
    claimedRevision,
    claimedLeaseGeneration,
    claimedWorker,
    claimedLeaseToken,
  ] = claimedLease.split("|");
  assert.equal(Number(claimedRevision), revisionBeforeLease + 1);
  assert.equal(Number(claimedLeaseGeneration), 1);
  assert.equal(claimedWorker, "revision-fenced-worker");
  assert.match(claimedLeaseToken, /^[0-9a-f-]{36}$/i);
  assert.equal(
    psql(`
      select public.release_ghl_provisioning_run_claim_v1(
        '${provisioningRunId}',
        'revision-fenced-worker',
        '${claimedLeaseToken}',
        ${claimedLeaseGeneration},
        timezone('utc', now())
      )::text;
    `, "Revision-fenced provisioning release failed"),
    "true",
  );
  assert.equal(
    psql(`
      select concat_ws(
        '|',
        revision::text,
        (locked_by is null)::text,
        (lease_token is null)::text,
        (locked_until is null)::text
      )
      from public.ghl_provisioning_runs
      where id = '${provisioningRunId}';
    `, "Post-release provisioning fence read failed"),
    `${revisionBeforeLease + 2}|true|true|true`,
    "Provisioning lease release did not advance the revision and clear every lease field",
  );

  psql(`
    update public.ghl_location_mappings set
      status = 'active',
      snapshot_verified_at = timezone('utc', now()),
      required_objects_verified_at = timezone('utc', now())
    where id = '${paidMappingId}';
    begin;
    set local session_replication_role = replica;
    update public.ghl_provisioning_runs set
      location_mapping_id = '${paidMappingId}', state = 'ready', ready_at = timezone('utc', now())
    where id = '${provisioningRunId}';
    commit;
  `, "Ready provisioning fixture failed");

  function preparePersonalization(campaignId) {
    const prepared = psql(`
      select concat_ws(
        '|', id::text, campaign_id::text, slot_key, status, current_step,
        contract_revision::text, values_fingerprint
      )
      from public.prepare_ghl_campaign_personalization_v2(
        '${paidOrganizationId}', '${campaignId}', 'sandbox', timezone('utc', now())
      );
    `, `Campaign personalization ${campaignId} preparation failed`);
    const [id, preparedCampaignId, slotKey, status, step, revision, fingerprint] = prepared.split("|");
    assert.match(id, /^[0-9a-f-]{36}$/i);
    assert.equal(preparedCampaignId, campaignId);
    assert.match(fingerprint, /^[a-f0-9]{64}$/);
    return { id, campaignId: preparedCampaignId, slotKey, status, step, revision: Number(revision), fingerprint };
  }
  const concurrentPrepareSql = `
    select concat_ws('|', id::text, campaign_id::text, slot_key, values_fingerprint)
    from public.prepare_ghl_campaign_personalization_v2(
      '${paidOrganizationId}', '${firstCampaignId}', 'sandbox', timezone('utc', now())
    );
  `;
  const [concurrentPrepareA, concurrentPrepareB] = await Promise.all([
    psqlAsync(concurrentPrepareSql),
    psqlAsync(concurrentPrepareSql),
  ]);
  assert.equal(concurrentPrepareA.status, 0, `Concurrent campaign prepare A failed: ${sanitize(concurrentPrepareA.stderr)}`);
  assert.equal(concurrentPrepareB.status, 0, `Concurrent campaign prepare B failed: ${sanitize(concurrentPrepareB.stderr)}`);
  assert.equal(
    concurrentPrepareA.stdout.trim(),
    concurrentPrepareB.stdout.trim(),
    "Concurrent identical campaign preparation produced different row/slot identities",
  );
  const firstPrepared = preparePersonalization(firstCampaignId);
  const secondPrepared = preparePersonalization(secondCampaignId);
  assert.equal(firstPrepared.slotKey, "slot-a");
  assert.equal(secondPrepared.slotKey, "slot-b");
  assert.equal(preparePersonalization(firstCampaignId).id, firstPrepared.id, "Preparation replay changed row identity");
  assert.notEqual(firstPrepared.fingerprint, secondPrepared.fingerprint, "Two campaign contracts shared a fingerprint");
  psql(`
    insert into public.ghl_location_mappings (
      id, organization_id, installation_id, environment, provider_location_id,
      provisioning_owner, snapshot_manifest_id, status
    ) values (
      '${alternatePaidMappingId}', '${paidOrganizationId}', '${sandboxInstallationId}', 'sandbox',
      'paid-sandbox-location-retired', 'platform', '${sandboxManifestId}', 'inactive'
    );
  `, "Alternate inactive campaign-mapping fixture failed");
  psqlMustFail(`
    insert into public.ghl_location_personalizations (
      id, organization_id, campaign_id, location_mapping_id, environment, slot_key,
      custom_values, required_form_ids, destination_url, status, current_step,
      values_fingerprint, source_plan_fingerprint, destination_contract_fingerprint
    )
    select gen_random_uuid(), organization_id, campaign_id, '${alternatePaidMappingId}', environment,
      'alternate-slot', custom_values, required_form_ids, destination_url, status, current_step,
      values_fingerprint, source_plan_fingerprint, destination_contract_fingerprint
    from public.ghl_location_personalizations where id = '${firstPrepared.id}';
  `, /ghl_location_personalizations_campaign_scope_unique/i, "One campaign acquired two mapping-scoped personalization identities");

  psqlMustFail(`
    select count(*) from public.prepare_ghl_campaign_personalization_v2(
      '${otherOrganizationId}', '${firstCampaignId}', 'sandbox', timezone('utc', now())
    );
  `, /no data found|query returned no rows/i, "Cross-tenant campaign personalization was accepted");
  psql(`
    begin;
    set local session_replication_role = replica;
    update public.ghl_snapshot_manifests
    set personalization_contract = jsonb_set(
      personalization_contract,
      '{campaignSlots,1,customValueNames}',
      (
        select jsonb_object_agg(entry.key, upper(entry.value) || '   ')
        from jsonb_each_text(personalization_contract #> '{campaignSlots,0,customValueNames}') entry
      )
    )
    where id = '${sandboxManifestId}';
    commit;
  `, "Overlapping GHL campaign-slot fixture failed");
  psqlMustFail(`
    select count(*) from public.prepare_ghl_campaign_personalization_v2(
      '${paidOrganizationId}', '${thirdCampaignId}', 'sandbox', timezone('utc', now())
    );
  `, /invalid or cross-campaign mutable/i, "Overlapping GHL slot custom-value names were accepted");
  psql(`
    begin;
    set local session_replication_role = replica;
    update public.ghl_snapshot_manifests
    set personalization_contract = jsonb_set(
      personalization_contract,
      '{campaignSlots,1,customValueNames}',
      (
        select jsonb_object_agg(entry.key, entry.value || ' Slot B')
        from jsonb_each_text(public.ghl_default_campaign_custom_value_names_v2()) entry
      )
    )
    where id = '${sandboxManifestId}';
    commit;
  `, "Overlapping GHL campaign-slot fixture cleanup failed");
  psql(`
    begin;
    set local session_replication_role = replica;
    update public.ghl_snapshot_manifests
    set personalization_contract = jsonb_set(
      personalization_contract,
      '{campaignSlots,1,requiredFormIds}',
      personalization_contract #> '{campaignSlots,0,requiredFormIds}'
    )
    where id = '${sandboxManifestId}';
    commit;
  `, "Overlapping GHL campaign form fixture failed");
  psqlMustFail(`
    select count(*) from public.prepare_ghl_campaign_personalization_v2(
      '${paidOrganizationId}', '${thirdCampaignId}', 'sandbox', timezone('utc', now())
    );
  `, /invalid or cross-campaign mutable/i, "One preinstalled form was shared across campaign slots");
  psql(`
    begin;
    set local session_replication_role = replica;
    update public.ghl_snapshot_manifests
    set personalization_contract = jsonb_set(
      personalization_contract,
      '{campaignSlots,1,requiredFormIds}',
      '["form-paid-b"]'::jsonb
    )
    where id = '${sandboxManifestId}';
    commit;
  `, "Overlapping GHL campaign form fixture cleanup failed");
  psqlMustFail(`
    select count(*) from public.prepare_ghl_campaign_personalization_v2(
      '${paidOrganizationId}', '${thirdCampaignId}', 'sandbox', timezone('utc', now())
    );
  `, /slot capacity is exhausted/i, "A third campaign reused an occupied GHL slot");

  function claimPersonalization(workerId) {
    const claim = psql(`
      select concat_ws(
        '|', id::text, campaign_id::text, lease_token::text,
        lease_generation::text, current_step, destination_url
      )
      from public.claim_next_ghl_location_personalization_v1(
        'sandbox', '${workerId}', timezone('utc', now()), 60000
      );
    `, `Personalization ${workerId} claim failed`);
    const [id, campaignId, token, generation, step, destinationUrl] = claim.split("|");
    return { id, campaignId, token, generation: Number(generation), step, destinationUrl, workerId };
  }
  function settlePersonalization(claim, outcome) {
    return psql(`
      select concat_ws('|', status, current_step, coalesce(destination_url, ''))
      from public.settle_ghl_location_personalization_v1(
        '${claim.id}', '${claim.workerId}', '${claim.token}', ${claim.generation},
        '${outcome}', (
          select case when '${claim.step}' = 'forms' then jsonb_build_object(
            'synthetic', true,
            'providerMutationAttempted', false,
            'verifiedReferences', personalization.required_form_ids,
            'responseFingerprint', repeat('a', 64)
          ) else '{"synthetic":true,"providerMutationAttempted":false}'::jsonb end
          from public.ghl_location_personalizations personalization
          where personalization.id = '${claim.id}'
        ),
        null, null, timezone('utc', now())
      );
    `, `Personalization ${claim.step} settlement failed`);
  }
  const observedCampaignSteps = [];
  for (let index = 0; index < 4; index += 1) {
    const claim = claimPersonalization(`campaign-worker-${index}`);
    observedCampaignSteps.push(`${claim.campaignId}:${claim.step}`);
    const settled = settlePersonalization(claim, "succeeded");
    if (claim.step === "custom_values") assert.match(settled, /^pending\|forms\|/);
    else assert.match(settled, /^ready\|ready\|https:\/\//);
  }
  assert.deepEqual(
    new Set(observedCampaignSteps),
    new Set([
      `${firstCampaignId}:custom_values`, `${firstCampaignId}:forms`,
      `${secondCampaignId}:custom_values`, `${secondCampaignId}:forms`,
    ]),
    "Both exact campaign personalization sagas did not complete both steps",
  );
  assert.equal(
    psql(`
      select destination_url from public.resolve_ghl_ready_campaign_destination_v2(
        '${paidOrganizationId}', '${firstCampaignId}', 'sandbox'
      );
    `, "First ready GHL campaign destination resolution failed"),
    "https://funnels.example.test/campaign-a",
  );
  assert.equal(
    psql(`
      select destination_url from public.resolve_ghl_ready_campaign_destination_v2(
        '${paidOrganizationId}', '${secondCampaignId}', 'sandbox'
      );
    `, "Second ready GHL campaign destination resolution failed"),
    "https://funnels.example.test/campaign-b",
  );
  psql(`update public.campaign_plans set publish_state = 'draft' where id = '${firstCampaignId}';`,
    "Unpublished campaign destination fixture failed");
  assert.equal(
    psql(`
      select count(*) from public.resolve_ghl_ready_campaign_destination_v2(
        '${paidOrganizationId}', '${firstCampaignId}', 'sandbox'
      );
    `, "Unpublished GHL campaign destination resolution failed"),
    "0",
    "An unpublished campaign retained a ready GHL launch destination",
  );
  psql(`update public.campaign_plans set publish_state = 'published' where id = '${firstCampaignId}';`,
    "Unpublished campaign destination fixture cleanup failed");
  assert.equal(
    psql(`
      select concat_ws(
        '|',
        first.custom_values ->> 'DealFlow Offer Slot A',
        coalesce(first.custom_values ->> 'DealFlow Offer Slot B', ''),
        second.custom_values ->> 'DealFlow Offer Slot B',
        coalesce(second.custom_values ->> 'DealFlow Offer Slot A', '')
      )
      from public.ghl_location_personalizations first
      join public.ghl_location_personalizations second on second.campaign_id = '${secondCampaignId}'
      where first.campaign_id = '${firstCampaignId}';
    `, "Cross-campaign custom-value isolation verification failed"),
    "Free seller valuation||Off-market buyer list|",
    "Campaign custom values leaked into another slot",
  );

  psql(`
    update public.campaign_plans
    set plan = jsonb_set(plan, '{onboarding_contract,offer}', '"Updated seller valuation"'::jsonb)
    where id = '${firstCampaignId}';
  `, "Campaign contract revision fixture failed");
  const revisedPrepared = preparePersonalization(firstCampaignId);
  assert.equal(revisedPrepared.id, firstPrepared.id, "Campaign revision changed stable slot identity");
  assert.equal(revisedPrepared.revision, 2, "Campaign revision did not advance exactly once");
  assert.equal(revisedPrepared.slotKey, "slot-a", "Campaign revision moved to another slot");
  assert.equal(
    psql(`select count(*) from public.resolve_ghl_ready_campaign_destination_v2(
      '${paidOrganizationId}', '${firstCampaignId}', 'sandbox'
    );`, "Stale destination suppression failed"),
    "0",
    "A revised campaign resolved before its new values and forms were verified",
  );
  const revisedCustomClaim = claimPersonalization("campaign-revision-custom-worker");
  assert.equal(revisedCustomClaim.campaignId, firstCampaignId);
  assert.equal(revisedCustomClaim.step, "custom_values");
  assert.equal(
    psql(`
    select id::text from public.prepare_ghl_campaign_personalization_v2(
      '${paidOrganizationId}', '${firstCampaignId}', 'sandbox', timezone('utc', now())
    );
  `, "Idempotent in-flight personalization replay failed"),
    revisedCustomClaim.id,
    "An idempotent in-flight preparation changed campaign personalization identity",
  );
  assert.equal(
    psql(`
      select count(*) from public.claim_next_ghl_location_personalization_v1(
        'sandbox', 'expired-lease-sweeper', timezone('utc', now()) + interval '61 seconds', 60000
      );
    `, "Expired personalization lease sweep failed"),
    "0",
    "An expired ambiguous provider effect was silently reclaimed",
  );
  assert.equal(
    psql(`
      select concat_ws('|', status, last_error_code, (lease_token is null)::text)
      from public.ghl_location_personalizations where id = '${revisedCustomClaim.id}';
    `, "Expired personalization lease state verification failed"),
    "uncertain|ghl_campaign_personalization_lease_expired_uncertain|true",
    "An expired provider effect was not preserved as uncertain",
  );
  psqlMustFail(
    `select count(*) from public.settle_ghl_location_personalization_v1(
      '${revisedCustomClaim.id}', '${revisedCustomClaim.workerId}', '${revisedCustomClaim.token}',
      ${revisedCustomClaim.generation}, 'succeeded', '{}'::jsonb, null, null, timezone('utc', now())
    );`,
    /lease expired or was superseded/i,
    "A stale personalization worker settled after lease expiry",
  );
  psql(`
    select id from public.requeue_ghl_campaign_personalization_v2(
      '${revisedCustomClaim.id}', '${revisedPrepared.fingerprint}', timezone('utc', now())
    );
  `, "Exact-fingerprint personalization reconciliation failed");
  const reconciledCustomClaim = claimPersonalization("campaign-revision-reconciled-worker");
  assert.equal(reconciledCustomClaim.id, revisedCustomClaim.id);
  assert.equal(
    reconciledCustomClaim.generation,
    revisedCustomClaim.generation + 1,
    "Reconciled personalization did not advance its fencing generation exactly once",
  );
  settlePersonalization(reconciledCustomClaim, "succeeded");
  const revisedFormsClaim = claimPersonalization("campaign-revision-forms-worker");
  assert.equal(revisedFormsClaim.campaignId, firstCampaignId);
  assert.equal(revisedFormsClaim.step, "forms");
  settlePersonalization(revisedFormsClaim, "succeeded");
  assert.equal(
    psql(`
      begin;
      set local role service_role;
      set local request.jwt.claim.role = 'service_role';
      select status || '|' || destination_url
      from public.finalize_ghl_funnel_publication_v1('${revisedFormsClaim.id}');
      commit;
    `, "Provider-aware GHL funnel publication failed"),
    "ready|https://funnels.example.test/campaign-a",
    "A verified GHL-hosted funnel was not finalized as ready",
  );
  assert.equal(
    psql(`
      begin;
      set local role service_role;
      set local request.jwt.claim.role = 'service_role';
      select destination_url from public.resolve_ghl_ready_campaign_destination_v3(
        '${paidOrganizationId}', '${firstCampaignId}', 'sandbox'
      );
      commit;
    `, "Provider-aware GHL destination resolution failed"),
    "https://funnels.example.test/campaign-a",
  );
  assert.equal(
    psql(`select count(*) from public.ghl_funnel_publication_receipts
      where publication_id=(select id from public.ghl_funnel_publications where campaign_id='${firstCampaignId}');`),
    "1",
    "Provider-aware GHL publication did not preserve exactly one replay-safe receipt",
  );
  psql(`begin;
    set local role service_role;
    set local request.jwt.claim.role = 'service_role';
    select id from public.finalize_ghl_funnel_publication_v1('${revisedFormsClaim.id}');
    commit;`,
    "Provider-aware GHL publication replay failed");
  assert.equal(
    psql(`select count(*) from public.ghl_funnel_publication_receipts
      where publication_id=(select id from public.ghl_funnel_publications where campaign_id='${firstCampaignId}');`),
    "1",
    "Provider-aware GHL publication replay duplicated its receipt",
  );

  psql(`
    update public.campaign_plans
    set plan = jsonb_set(plan, '{onboarding_contract,offer}', '"Buyer list revision two"'::jsonb)
    where id = '${secondCampaignId}';
  `, "Second campaign contract revision fixture failed");
  const secondRevision = preparePersonalization(secondCampaignId);
  assert.equal(secondRevision.revision, 2);
  const driftClaim = claimPersonalization("campaign-plan-drift-worker");
  assert.equal(driftClaim.campaignId, secondCampaignId);
  psql(`
    update public.campaign_plans
    set plan = jsonb_set(plan, '{onboarding_contract,offer}', '"Buyer list revision three"'::jsonb)
    where id = '${secondCampaignId}';
  `, "In-flight campaign plan drift fixture failed");
  psqlMustFail(`
    select count(*) from public.prepare_ghl_campaign_personalization_v2(
      '${paidOrganizationId}', '${secondCampaignId}', 'sandbox', timezone('utc', now())
    );
  `, /in flight and must settle/i, "A changed in-flight campaign contract replaced provider inputs");
  assert.equal(
    settlePersonalization(driftClaim, "succeeded"),
    "operator_action_required|custom_values|https://funnels.example.test/campaign-b",
    "A provider effect settled as current after its authoritative campaign plan changed",
  );
  assert.equal(
    psql(`select last_error_code from public.ghl_location_personalizations where id = '${driftClaim.id}';`, "Plan-drift blocker lookup failed"),
    "ghl_campaign_plan_changed_during_provider_effect",
  );
  psqlMustFail(`
    select count(*) from public.requeue_ghl_campaign_personalization_v2(
      '${driftClaim.id}', '${secondRevision.fingerprint}', timezone('utc', now())
    );
  `, /identity changed or is not requeueable/i, "A stale plan fingerprint requeued campaign personalization");
  const secondReprepared = preparePersonalization(secondCampaignId);
  assert.equal(secondReprepared.revision, 3, "Plan-drift recovery did not create the next exact contract revision");
  assert.equal(secondReprepared.slotKey, "slot-b", "Plan-drift recovery moved campaigns across slots");
  psql(`
    update public.ghl_location_personalizations set max_attempts = 1
    where id = '${secondReprepared.id}';
  `, "Personalization retry-exhaustion fixture failed");
  const exhaustionClaim = claimPersonalization("campaign-retry-exhaustion-worker");
  assert.equal(exhaustionClaim.campaignId, secondCampaignId);
  assert.equal(
    settlePersonalization(exhaustionClaim, "retryable_failure"),
    "operator_action_required|custom_values|https://funnels.example.test/campaign-b",
    "A final retryable personalization attempt was silently requeued",
  );
  assert.equal(
    psql(`select last_error_code from public.ghl_location_personalizations where id = '${secondReprepared.id}';`, "Personalization exhaustion blocker lookup failed"),
    "ghl_campaign_personalization_attempts_exhausted",
  );
  assert.equal(
    psql(`
      select concat_ws('|', count(*)::text, min(contract_revision)::text, max(contract_revision)::text)
      from public.ghl_campaign_personalization_receipts;
    `, "Append-only personalization receipt verification failed"),
    "8|1|3",
    "Campaign personalization receipts did not preserve both revisions and steps",
  );
  psqlMustFail(`
    update public.ghl_campaign_personalization_receipts
    set receipt = receipt
    where id = (select id from public.ghl_campaign_personalization_receipts order by id limit 1);
  `, /receipts are append-only/i, "A campaign personalization receipt could be updated");
  psqlMustFail(`
    delete from public.ghl_campaign_personalization_receipts
    where id = (select id from public.ghl_campaign_personalization_receipts order by id limit 1);
  `, /receipts are append-only/i, "A campaign personalization receipt could be deleted");

  assert.equal(
    psql(`
      select concat(
        has_function_privilege('authenticated', 'public.request_ghl_provisioning_from_billing_activation_v1(uuid,uuid,text,uuid,text,timestamptz)', 'EXECUTE'),
        '|',
        has_function_privilege('authenticated', 'public.resolve_ghl_ready_campaign_destination_v2(uuid,uuid,text)', 'EXECUTE'),
        '|',
        has_table_privilege('service_role', 'public.ghl_location_personalizations', 'UPDATE'),
        '|',
        has_table_privilege('service_role', 'public.ghl_campaign_personalization_receipts', 'INSERT')
      );
    `, "Production GHL internal RPC privilege lookup failed"),
    "f|f|f|f",
    "GHL campaign personalization retained direct or authenticated mutation authority",
  );

  console.log(
    "GHL disposable database regression passed: fake and production paths; paid activation; exact campaign/org/environment fencing; two-tenant lifecycle contact, opportunity, outbound, and appointment projection; create/update/delete and exact replay; stale and same-version conflict routing; documented-status mapping and unknown-status rejection; unknown/ambiguous lead operator parity; dashboard-visible canonical appointments; durable revisions/leases/receipts; bounded retries; RPC-only mutation; manifest validation; and ACL grants.",
  );
} catch (error) {
  console.error(`GHL disposable database regression failed: ${sanitize(error?.message ?? error)}`);
  process.exitCode = 1;
} finally {
  cleanupContainer();
}
