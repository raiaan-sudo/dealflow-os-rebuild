#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { createNativePostgresTestAdapter } from "./lib/native-postgres-test-adapter.mjs";

const migration = readFileSync(
  "supabase/migrations/20260713018000_harden_meta_reporting_and_leadgen_integrity.sql",
  "utf8",
);
const lineageSql = migration.slice(
  migration.indexOf("-- BEGIN CAMPAIGN REPORTING AND CRM LINEAGE"),
  migration.indexOf("-- END CAMPAIGN REPORTING AND CRM LINEAGE") +
    "-- END CAMPAIGN REPORTING AND CRM LINEAGE".length,
);
const syncServiceSource = readFileSync(
  "src/lib/services/meta-campaign-sync-service.ts",
  "utf8",
);
const dashboardServiceSource = readFileSync(
  "src/lib/services/dashboard-service.ts",
  "utf8",
);
const reportingWorkerSource = readFileSync(
  "src/lib/services/meta-reporting-worker-service.ts",
  "utf8",
);

assert.match(syncServiceSource, /delivery_metrics_confirmed:\s*deliveryMetricsConfirmed/);
assert.match(syncServiceSource, /\.eq\("delivery_metrics_confirmed", true\)/);
assert.match(syncServiceSource, /latestAttemptDeliveryMetricsConfirmed/);
assert.match(syncServiceSource, /campaign_id:\s*internalCampaignId/);
assert.match(reportingWorkerSource, /snapshot\.deliveryMetricsConfirmed !== true/);
assert.match(dashboardServiceSource, /\.from\("campaign_sync_snapshots"\)/);
assert.match(dashboardServiceSource, /\.eq\("campaign_id", scopedCampaignId\)/);
assert.match(dashboardServiceSource, /get_campaign_dashboard_aggregates_v1/);
assert.doesNotMatch(
  dashboardServiceSource,
  /snapshotsQuery\.eq\("campaign_id"/,
  "legacy workspace snapshots do not have campaign lineage",
);

const adapter = createNativePostgresTestAdapter({
  pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
  host: process.env.DEALFLOW_NATIVE_PGHOST,
  port: process.env.DEALFLOW_NATIVE_PGPORT,
  user: process.env.DEALFLOW_NATIVE_PGUSER,
  expectedVersion: "17.6",
  databasePrefix: `dfdash_${process.pid}_${randomBytes(2).toString("hex")}`,
  timeoutMs: 120_000,
  maxOutputBytes: 16 * 1024 * 1024,
});

const ids = Object.freeze({
  orgA: "71000000-0000-4000-8000-000000000001",
  orgB: "71000000-0000-4000-8000-000000000002",
  userA: "71000000-0000-4000-8000-000000000003",
  userB: "71000000-0000-4000-8000-000000000004",
  campaignA: "71000000-0000-4000-8000-000000000005",
  campaignB: "71000000-0000-4000-8000-000000000006",
  leadA: "71000000-0000-4000-8000-000000000007",
  leadB: "71000000-0000-4000-8000-000000000008",
});

await adapter.withDisposableDatabase(async (database) => {
  const psql = (sql, label) => database.psql(sql, { label });
  const mustFail = (sql, pattern, label) =>
    database.psqlMustFail(sql, pattern, { label });

  psql(`
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    create schema if not exists private;
    create table public.campaign_plans(
      id uuid primary key,
      organization_id uuid not null,
      user_id uuid not null,
      unique(id, organization_id),
      unique(id, organization_id, user_id)
    );
    create table public.leads(
      id uuid primary key,
      organization_id uuid not null,
      campaign_id uuid
    );
    create table public.appointments(
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      lead_id uuid,
      scheduled_at timestamptz not null,
      status text not null default 'scheduled',
      created_at timestamptz not null default timezone('utc', now())
    );
    create table public.deals(
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      lead_id uuid,
      appointment_id uuid,
      status text not null default 'active',
      estimated_value numeric not null default 0,
      closed_value numeric,
      commission_revenue numeric,
      created_at timestamptz not null default timezone('utc', now())
    );
    create table public.campaign_launch_records(
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      user_id uuid not null,
      campaign_id uuid,
      result_status text not null,
      meta_campaign_id text
    );
    create table public.campaign_sync_snapshots(
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      user_id uuid not null,
      sync_result text not null default 'failed',
      meta_campaign_id text,
      synced_at timestamptz not null default timezone('utc', now())
    );
    create table public.performance_tracking(
      id uuid primary key default gen_random_uuid(),
      source_snapshot_id uuid,
      campaign_id text not null
    );
    insert into public.campaign_plans(id,organization_id,user_id) values
      ('${ids.campaignA}','${ids.orgA}','${ids.userA}'),
      ('${ids.campaignB}','${ids.orgB}','${ids.userB}');
    insert into public.leads(id,organization_id,campaign_id) values
      ('${ids.leadA}','${ids.orgA}','${ids.campaignA}'),
      ('${ids.leadB}','${ids.orgB}','${ids.campaignB}');
    insert into public.campaign_launch_records(
      organization_id,user_id,campaign_id,result_status,meta_campaign_id
    ) values
      ('${ids.orgA}','${ids.userA}','${ids.campaignA}','success','meta-a'),
      ('${ids.orgB}','${ids.userB}','${ids.campaignB}','success','meta-b');
    insert into public.campaign_sync_snapshots(
      organization_id,user_id,sync_result,meta_campaign_id,synced_at
    ) values
      ('${ids.orgA}','${ids.userA}','success','meta-a','2026-07-13T01:00:00Z'),
      ('${ids.orgA}','${ids.userA}','partial_success','meta-a','2026-07-13T02:00:00Z');
  `, "Create two-tenant campaign lineage fixture");

  psql(lineageSql, "Apply campaign reporting and CRM lineage migration");

  assert.equal(
    psql(`
      select campaign_id||'|'||delivery_metrics_confirmed
      from public.campaign_sync_snapshots
      where organization_id='${ids.orgA}'
      order by synced_at;
    `, "Read migrated reporting attempts"),
    `${ids.campaignA}|true\n${ids.campaignA}|false`,
  );
  assert.equal(
    psql(`
      select synced_at
      from public.campaign_sync_snapshots
      where organization_id='${ids.orgA}'
        and campaign_id='${ids.campaignA}'
        and delivery_metrics_confirmed
      order by synced_at desc limit 1;
    `, "Prove failed attempt does not replace last confirmed metrics"),
    "2026-07-13 01:00:00+00",
  );

  const appointmentA = psql(`
    insert into public.appointments(organization_id,lead_id,scheduled_at)
    values ('${ids.orgA}','${ids.leadA}','2026-07-14T14:00:00Z')
    returning id;
  `, "Insert campaign A appointment through trigger");
  psql(`
    insert into public.appointments(organization_id,lead_id,scheduled_at)
    values ('${ids.orgB}','${ids.leadB}','2026-07-14T15:00:00Z');
    insert into public.deals(organization_id,lead_id,appointment_id)
    values ('${ids.orgA}','${ids.leadA}','${appointmentA}');
    insert into public.deals(organization_id,lead_id)
    values ('${ids.orgB}','${ids.leadB}');
  `, "Insert scoped appointments and deals");

  assert.equal(
    psql(`select count(*) from public.appointments where organization_id='${ids.orgA}' and campaign_id='${ids.campaignA}';`, "Campaign A appointment count"),
    "1",
  );
  assert.equal(
    psql(`select count(*) from public.deals where organization_id='${ids.orgA}' and campaign_id='${ids.campaignA}';`, "Campaign A deal count"),
    "1",
  );
  assert.equal(
    psql(`select count(*) from public.appointments where organization_id='${ids.orgA}' and campaign_id='${ids.campaignB}';`, "Cross-campaign appointment exclusion"),
    "0",
  );
  assert.equal(
    psql(`select count(*) from public.deals where organization_id='${ids.orgA}' and campaign_id='${ids.campaignB}';`, "Cross-campaign deal exclusion"),
    "0",
  );
  mustFail(
    `insert into public.appointments(organization_id,lead_id,scheduled_at) values ('${ids.orgA}','${ids.leadB}',now());`,
    /appointment_lead_scope_mismatch/,
    "Reject cross-tenant appointment binding",
  );
  mustFail(
    `insert into public.deals(organization_id,lead_id) values ('${ids.orgA}','${ids.leadB}');`,
    /deal_lead_scope_mismatch/,
    "Reject cross-tenant deal binding",
  );
  mustFail(
    `update public.leads set campaign_id=null where id='${ids.leadA}';`,
    /foreign key constraint/,
    "Reject lead campaign reassignment after downstream lifecycle attribution",
  );
  mustFail(
    `update public.appointments set campaign_id='${ids.campaignB}' where id='${appointmentA}';`,
    /appointment_campaign_lineage_mismatch/,
    "Reject appointment campaign reassignment away from its lead",
  );

  psql(`
    insert into public.appointments(organization_id,lead_id,scheduled_at,status)
    values
      ('${ids.orgA}','${ids.leadA}','2026-07-15T14:00:00Z','canceled'),
      ('${ids.orgA}','${ids.leadA}','2026-07-16T14:00:00Z','no_show'),
      ('${ids.orgA}','${ids.leadA}','2026-07-17T14:00:00Z','invalid'),
      ('${ids.orgA}','${ids.leadA}','2026-07-18T14:00:00Z','deleted');
    insert into public.deals(organization_id,lead_id,status,estimated_value)
    select '${ids.orgA}','${ids.leadA}','active',100
    from generate_series(1,9);
    insert into public.deals(
      organization_id,lead_id,status,estimated_value,closed_value,commission_revenue
    ) values
      ('${ids.orgA}','${ids.leadA}','closed_won',500,500,50),
      ('${ids.orgA}','${ids.leadA}','won',700,700,70);
  `, "Seed more than eight deals plus explicit appointment terminal states");
  assert.equal(
    psql(`
      select appointments_booked||'|'||active_deals||'|'||closed_deals||'|'||
        total_deals||'|'||pipeline_value||'|'||closed_volume||'|'||commission_revenue
      from public.get_campaign_dashboard_aggregates_v1('${ids.orgA}','${ids.campaignA}');
    `, "Read exact campaign aggregates beyond recent-row display limits"),
    "3|10|2|12|900|1200|120",
  );

  psql(`
    insert into public.campaign_sync_snapshots(
      organization_id,user_id,campaign_id,sync_result,meta_campaign_id,
      delivery_metrics_confirmed,synced_at
    ) values (
      '${ids.orgA}','${ids.userA}','${ids.campaignA}','success','meta-a',true,
      '2026-07-13T03:00:00Z'
    );
  `, "Insert fresh confirmed delivery snapshot");
  assert.equal(
    psql(`
      select synced_at
      from public.campaign_sync_snapshots
      where organization_id='${ids.orgA}'
        and campaign_id='${ids.campaignA}'
        and delivery_metrics_confirmed
      order by synced_at desc limit 1;
    `, "Fresh confirmed delivery becomes authoritative"),
    "2026-07-13 03:00:00+00",
  );
});

console.log("dashboard campaign lineage disposable DB: PASS (two-tenant isolation, trigger attribution, failed Meta attempt retention, fresh confirmed recovery)");
