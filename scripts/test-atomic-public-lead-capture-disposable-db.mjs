#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const migration = readFileSync(
  "supabase/migrations/20260713019000_capture_public_lead_and_outbox_atomically.sql",
  "utf8",
);
const routeSource = readFileSync("src/app/api/lead-capture/route.ts", "utf8");
const leadServiceSource = readFileSync("src/lib/services/lead-handler-service.ts", "utf8");

assert.match(routeSource, /createPublicLeadAndQueueSideEffectsAtomically/);
assert.doesNotMatch(routeSource, /queueLeadSideEffectsJob\s*\(/);
assert.ok(
  routeSource.indexOf("createPublicLeadAndQueueSideEffectsAtomically") <
    routeSource.indexOf('eventType: "lead_captured"'),
  "lead and outbox must commit before best-effort tracking",
);
assert.match(leadServiceSource, /capture_public_lead_with_side_effects_v1/);
assert.match(leadServiceSource, /resolveLeadEffectPolicy/);

const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  expectedVersion: "17.6",
  databasePrefix: `dfatomic_${process.pid}_${randomBytes(2).toString("hex")}`,
  timeoutMs: 120_000,
  maxOutputBytes: 16 * 1024 * 1024,
});

const ids = Object.freeze({
  organization: "61000000-0000-4000-8000-000000000001",
  user: "61000000-0000-4000-8000-000000000002",
  campaign: "61000000-0000-4000-8000-000000000003",
  historical: "61000000-0000-4000-8000-000000000004",
  laterHistorical: "61000000-0000-4000-8000-000000000005",
});
const hashes = Object.freeze({
  afterLead: "a".repeat(64),
  afterJob: "b".repeat(64),
  concurrent: "c".repeat(64),
});

function atomicSql({
  requestId,
  dedupeHash,
  email,
  failurePoint = null,
  finalProjection = "lead_record->>'id'||'|'||side_effect_job_id::text||'|'||lead_created||'|'||side_effect_job_created",
}) {
  return `
    set role service_role;
    select set_config('request.jwt.claim.role', 'service_role', false);
    select set_config('dealflow.atomic_lead_capture_test_mode', 'on', false);
    select ${finalProjection}
    from public.capture_public_lead_with_side_effects_v1(
      p_organization_id => '${ids.organization}',
      p_user_id => '${ids.user}',
      p_campaign_id => '${ids.campaign}',
      p_request_id => '${requestId}',
      p_name => 'Atomic Lead',
      p_source => 'lead_capture_generated',
      p_first_name => 'Atomic',
      p_last_name => 'Lead',
      p_email => '${email}',
      p_phone => null,
      p_phone_raw => null,
      p_utm_source => 'facebook',
      p_utm_medium => 'paid_social',
      p_utm_campaign => 'atomic-proof',
      p_ad_id => 'ad-proof',
      p_landing_page_url => 'https://funnel.example.test/f/atomic',
      p_dedupe_hash => '${dedupeHash}',
      p_notes => 'Synthetic disposable-database proof only.',
      p_consent_metadata => '{"source":"test","sms":{"consented":false}}'::jsonb,
      p_metadata => '{"synthetic":true}'::jsonb,
      p_job_payload => '{"enabledEffects":["ghl_delivery"],"requiredEffects":["ghl_delivery"]}'::jsonb,
      p_created_at => '2026-07-13T04:00:00Z',
      p_test_failure_point => ${failurePoint ? `'${failurePoint}'` : "null"}
    );
  `;
}

await adapter.withDisposableDatabase(async (database) => {
  const psql = (sql, label) => database.psql(sql, { label });
  const mustFail = (sql, pattern, label) => database.psqlMustFail(sql, pattern, { label });

  psql(`
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
    create schema if not exists private;
    create schema if not exists auth;
    create or replace function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;

    create table public.campaign_plans(
      id uuid primary key,
      organization_id uuid not null,
      user_id uuid not null,
      publish_state text not null
    );
    create table public.leads(
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      tenant_id uuid,
      user_id uuid,
      campaign_id uuid,
      name text,
      source text not null,
      first_name text not null,
      last_name text not null,
      email text,
      phone text,
      phone_raw text,
      phone_e164 text,
      campaign_name text,
      lead_type text,
      utm_source text,
      utm_medium text,
      utm_campaign text,
      ad_id text,
      landing_page_url text,
      dedupe_hash text,
      status text not null default 'new',
      notes text,
      consent_metadata jsonb,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
    );
    create unique index leads_dedupe_hash_unique
      on public.leads(dedupe_hash) where dedupe_hash is not null;
    create table public.system_jobs(
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      user_id uuid not null,
      campaign_id uuid,
      kind text not null,
      status text not null default 'pending',
      payload jsonb not null default '{}'::jsonb,
      idempotency_key text,
      max_attempts integer not null default 2,
      created_at timestamptz not null default timezone('utc', now())
    );
    create unique index system_jobs_idempotency_key_unique
      on public.system_jobs(idempotency_key) where idempotency_key is not null;
    create table public.app_schema_metadata(
      key text primary key,
      value text not null,
      updated_at timestamptz not null default timezone('utc', now())
    );

    insert into public.campaign_plans(id, organization_id, user_id, publish_state)
    values ('${ids.campaign}', '${ids.organization}', '${ids.user}', 'published');
    insert into public.leads(
      id, organization_id, tenant_id, user_id, campaign_id, name, source,
      first_name, last_name, email, dedupe_hash, status, metadata, created_at
    ) values (
      '${ids.historical}', '${ids.organization}', '${ids.organization}', '${ids.user}',
      '${ids.campaign}', 'Historical Lead', 'website_funnel', 'Historical', 'Lead',
      'historical@example.test', '${"d".repeat(64)}', 'new', '{}', '2026-07-12T00:00:00Z'
    );
  `, "Create isolated atomic lead fixture with one historical gap");

  psql(migration, "Apply atomic public lead and outbox migration");

  assert.equal(
    psql(`select count(*) from public.system_jobs where idempotency_key='lead_side_effects:${ids.historical}';`, "Prove migration creates no historical delivery job"),
    "0",
  );

  mustFail(
    atomicSql({
      requestId: "failure-after-lead",
      dedupeHash: hashes.afterLead,
      email: "after-lead@example.test",
      failurePoint: "after_lead",
    }),
    /atomic_lead_capture_injected_after_lead/,
    "Inject crash after lead insert",
  );
  assert.equal(
    psql(`select count(*) from public.leads where dedupe_hash='${hashes.afterLead}';`, "Prove lead insert rolled back"),
    "0",
  );
  assert.equal(
    psql(`select count(*) from public.system_jobs where payload #>> '{requestId}'='failure-after-lead';`, "Prove no orphan job after lead crash"),
    "0",
  );

  const recoveredAfterTransient = psql(
    atomicSql({
      requestId: "failure-after-lead",
      dedupeHash: hashes.afterLead,
      email: "after-lead@example.test",
    }),
    "Retry transiently failed capture atomically",
  );
  assert.match(
    recoveredAfterTransient,
    /^[0-9a-f-]{36}\|[0-9a-f-]{36}\|true\|true$/m,
    "the retry must create the lead and its side-effect job in one commit",
  );
  const replayedAfterRecovery = psql(
    atomicSql({
      requestId: "failure-after-lead",
      dedupeHash: hashes.afterLead,
      email: "after-lead@example.test",
    }),
    "Replay recovered capture to prove exact-once behavior",
  );
  assert.match(
    replayedAfterRecovery,
    /^[0-9a-f-]{36}\|[0-9a-f-]{36}\|false\|false$/m,
  );
  assert.equal(
    psql(`select count(*) from public.leads where dedupe_hash='${hashes.afterLead}';`, "Count recovered lead"),
    "1",
  );
  assert.equal(
    psql(`select count(*) from public.system_jobs job join public.leads lead
      on job.idempotency_key='lead_side_effects:'||lead.id::text
      where lead.dedupe_hash='${hashes.afterLead}';`, "Count recovered side-effect job"),
    "1",
  );

  mustFail(
    atomicSql({
      requestId: "failure-after-job",
      dedupeHash: hashes.afterJob,
      email: "after-job@example.test",
      failurePoint: "after_job",
    }),
    /atomic_lead_capture_injected_after_job/,
    "Inject crash after job insert",
  );
  assert.equal(
    psql(`select count(*) from public.leads where dedupe_hash='${hashes.afterJob}';`, "Prove lead and job transaction rolled back"),
    "0",
  );
  assert.equal(
    psql(`select count(*) from public.system_jobs where payload #>> '{requestId}'='failure-after-job';`, "Prove job insert rolled back"),
    "0",
  );

  const concurrentOutputs = await database.psqlConcurrent([
    atomicSql({
      requestId: "concurrent-a",
      dedupeHash: hashes.concurrent,
      email: "concurrent@example.test",
    }),
    atomicSql({
      requestId: "concurrent-b",
      dedupeHash: hashes.concurrent,
      email: "concurrent@example.test",
    }),
  ], { label: "Race duplicate public lead submissions" });
  const receipts = concurrentOutputs
    .flatMap((output) => output.split(/\r?\n/))
    .filter((line) => /^[0-9a-f-]{36}\|[0-9a-f-]{36}\|(?:true|false)\|(?:true|false)$/.test(line));
  assert.equal(
    receipts.length,
    2,
    `both duplicate submissions must receive persistence receipts: ${JSON.stringify(concurrentOutputs)}`,
  );
  assert.equal(new Set(receipts.map((line) => line.split("|")[0])).size, 1, "duplicate submissions must reuse one lead");
  assert.equal(new Set(receipts.map((line) => line.split("|")[1])).size, 1, "duplicate submissions must reuse one job");
  assert.equal(receipts.filter((line) => line.endsWith("|true|true")).length, 1, "one transaction creates both records");
  assert.equal(receipts.filter((line) => line.endsWith("|false|false")).length, 1, "one transaction reuses both records");
  assert.equal(
    psql(`select count(*) from public.leads where dedupe_hash='${hashes.concurrent}';`, "Count concurrently deduped leads"),
    "1",
  );
  assert.equal(
    psql(`select count(*) from public.system_jobs job join public.leads lead
      on job.idempotency_key='lead_side_effects:'||lead.id::text
      where lead.dedupe_hash='${hashes.concurrent}';`, "Count concurrently deduped side-effect jobs"),
    "1",
  );
  assert.equal(
    psql(`select (payload -> 'enabledEffects') ? 'ghl_delivery'
      from public.system_jobs job join public.leads lead
        on job.idempotency_key='lead_side_effects:'||lead.id::text
      where lead.dedupe_hash='${hashes.concurrent}';`, "Verify eventual GHL delivery contract"),
    "t",
  );

  psql(`insert into public.leads(
      id, organization_id, tenant_id, user_id, campaign_id, name, source,
      first_name, last_name, email, dedupe_hash, status, metadata
    ) values (
      '${ids.laterHistorical}', '${ids.organization}', '${ids.organization}', '${ids.user}',
      '${ids.campaign}', 'Later Historical', 'website_funnel', 'Later', 'Historical',
      'later-historical@example.test', '${"e".repeat(64)}', 'new', '{}'
    );`, "Create a post-migration historical-gap fixture");
  mustFail(
    `set role service_role; select set_config('request.jwt.claim.role','service_role',false);
     select * from public.stage_missing_lead_side_effect_jobs_for_review_v1('WRONG', 10);`,
    /historical_lead_recovery_authorization_invalid/,
    "Reject historical staging without the exact operator authorization",
  );

  const reviewReceipts = psql(
    `set role service_role; select set_config('request.jwt.claim.role','service_role',false);
     select lead_id||'|'||side_effect_job_id
       from public.stage_missing_lead_side_effect_jobs_for_review_v1(
         'DEALFLOW_STAGE_HISTORICAL_LEAD_RECOVERY_FOR_OPERATOR_REVIEW_V1', 10
       );`,
    "Stage explicit inert historical operator-review records",
  ).split(/\r?\n/).filter((line) => /^[0-9a-f-]{36}\|[0-9a-f-]{36}$/.test(line));
  assert.deepEqual(
    new Set(reviewReceipts.map((line) => line.split("|")[0])),
    new Set([ids.historical, ids.laterHistorical]),
  );
  assert.equal(
    psql(`select count(*) from public.system_jobs
      where idempotency_key in (
        'lead_side_effects:${ids.historical}',
        'lead_side_effects:${ids.laterHistorical}'
      )
      and status = 'operator_action_required'
      and payload -> 'enabledEffects' = '[]'::jsonb
      and payload -> 'requiredEffects' = '[]'::jsonb
      and payload ->> 'historicalRecoveryReviewRequired' = 'true';`, "Verify historical records are inert and non-claimable"),
    "2",
  );
  assert.equal(
    psql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false);
      select count(*) from public.stage_missing_lead_side_effect_jobs_for_review_v1(
        'DEALFLOW_STAGE_HISTORICAL_LEAD_RECOVERY_FOR_OPERATOR_REVIEW_V1', 10
      );`, "Replay explicit inert review staging").split(/\r?\n/).at(-1),
    "0",
  );

  mustFail(
    `set role authenticated; select set_config('request.jwt.claim.role','authenticated',false);
     select * from public.stage_missing_lead_side_effect_jobs_for_review_v1(
       'DEALFLOW_STAGE_HISTORICAL_LEAD_RECOVERY_FOR_OPERATOR_REVIEW_V1', 10
     );`,
    /permission denied|service_role_required/,
    "Reject browser-role reconciliation",
  );

  assert.equal(
    psql(`select count(*) from public.system_jobs where kind <> 'lead_side_effects';`, "Prove no unrelated jobs or provider actions"),
    "0",
  );

  console.log(
    "atomic public lead capture disposable DB: PASS (rollback injection, concurrent dedupe, exactly-one lead/job, receipts, inert authorized historical review, eventual GHL contract, service-role fencing, zero provider calls)",
  );
});
