#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const service = read("src/lib/services/scale-monitor-service.ts");
const internalRoute = read("src/app/api/internal/scale-monitor/route.ts");
const adminPage = read("src/app/(app)/admin/incidents/page.tsx");
const adminActionRoute = read("src/app/api/admin/incidents/[id]/route.ts");
const migration = read("supabase/migrations/20260519023000_create_scale_monitor_incidents.sql");
const vercel = JSON.parse(read("vercel.json"));
const packageJson = JSON.parse(read("package.json"));
const routeSecurity = read("scripts/check-route-security.mjs");
const schemaCheck = read("scripts/check-required-schema.mjs");
const billingCheckout = read("src/app/api/billing/checkout/route.ts");
const creditCheckout = read("src/app/api/billing/credits/checkout/route.ts");
const env = read("src/lib/env.ts");
const layout = read("src/app/layout.tsx");
const navigation = read("src/lib/navigation.ts");
const envExample = read(".env.example");

assert.match(migration, /create table if not exists public\.scale_monitor_incidents/, "incident table migration must exist");
assert.match(migration, /create table if not exists public\.scale_monitor_runs/, "monitor run table migration must exist");
assert.match(migration, /recurrence_count integer not null default 1/, "incident recurrence count must be durable");
assert.match(migration, /clean_check_count integer not null default 0/, "auto-resolution clean count must be durable");
assert.match(migration, /alert_channels jsonb not null default '\[\]'::jsonb/, "alert path must be recorded");
assert.match(migration, /scale_monitor_incidents_service_role_all/, "service role policy must guard incidents");
assert.match(migration, /revoke all on public\.scale_monitor_incidents from anon, authenticated/, "customer roles must not read incidents");
assert.match(migration, /scale_monitor_incidents_schema_version/, "schema metadata must include incident schema version");

assert.ok(
  vercel.crons.some((cron) => cron.path === "/api/internal/scale-monitor" && cron.schedule === "*/15 * * * *"),
  "Vercel Cron must schedule the scale monitor every 15 minutes",
);
assert.equal(
  packageJson.scripts["test:scale-monitoring"],
  "node ./scripts/test-scale-monitoring.mjs",
  "scale monitoring test must be registered",
);

assert.match(internalRoute, /assertInternalSystemRequest/, "scale monitor route must require internal runner auth");
assert.match(internalRoute, /runScaleMonitor/, "scale monitor route must run the monitor");
assert.match(internalRoute, /runSyntheticScaleMonitorProof/, "scale monitor route must expose safe synthetic proof");
assert.doesNotMatch(internalRoute, /sendSms|createBillingCheckoutSession|createFreshdeskTicket|executeMetaCampaignLaunch/i, "monitor route must not perform forbidden side effects");
assert.match(routeSecurity, /\/api\/internal\/scale-monitor/, "route security must know the internal monitor route");
assert.match(routeSecurity, /assertInternalOperatorAccess/, "dynamic admin incident route must be treated as operator-owned");

assert.match(service, /loadScaleReadinessSnapshot/, "monitor must consume scale report data");
assert.match(service, /loadDurableOperatorDebtSummary/, "monitor must consume operator debt data");
assert.match(service, /runSafeProductionSmokeSummary/, "monitor must include safe production smoke");
assert.match(service, /SCALE_MONITOR_PRODUCT_ALIAS_URLS/, "product alias smoke must be scoped to app aliases");
assert.doesNotMatch(service, /SCALE_MONITOR_ALIAS_URLS/, "legacy mixed alias env must not drive product deploy checks");
assert.match(service, /SCALE_MONITOR_MARKETING_WWW_URL/, "marketing www contract must be smoke-tested separately");
assert.match(service, /SCALE_MONITOR_MARKETING_APEX_URL/, "marketing apex redirect contract must be smoke-tested separately");
assert.match(service, /activeBlockers/, "active blockers must create incidents");
assert.match(service, /currentWatch/, "current watch items must create incidents");
assert.match(service, /resolveCleanIncidents/, "clean checks must auto-resolve incidents");
assert.match(service, /support:freshdesk-unavailable/, "Freshdesk unavailable must create a safe support incident");
assert.match(service, /client-errors:spike-or-unresolved/, "client error spikes must create incidents");
assert.match(service, /admin_incident_inbox/, "admin inbox must be the fail-closed alert channel");
assert.match(service, /SCALE_MONITOR_SLACK_WEBHOOK_URL/, "optional external alert env must be visible by name only");
assert.match(service, /SCALE_MONITOR_ALERT_EMAIL_TO/, "optional email alert env must be visible by name only");
assert.doesNotMatch(service, /stripe\.checkout\.sessions\.create|sendSms\(|createFreshdeskTicket\(|executeMetaCampaignLaunch|ALLOW_META_LIVE_LAUNCH\s*=\s*"true"/, "monitor service must not perform forbidden side effects");

assert.match(adminPage, /assertInternalOperatorAccess/, "incident inbox page must be admin-only");
assert.match(adminPage, /loadScaleMonitorIncidents/, "incident inbox must read durable incidents");
assert.match(adminPage, /Acknowledge/, "incident inbox must support acknowledgement");
assert.match(adminPage, /Resolve/, "incident inbox must support safe manual resolution");
assert.match(adminPage, /getSafeDegradationStatus/, "incident inbox must show safe degradation flags");
assert.match(adminActionRoute, /assertSameOriginRequest/, "incident action route must require same-origin POSTs");
assert.match(adminActionRoute, /assertInternalOperatorAccess/, "incident action route must require operator access");
assert.match(adminActionRoute, /updateScaleMonitorIncidentStatus/, "incident action route must use the service mutation");
assert.match(navigation, /\/admin\/incidents/, "admin navigation must expose the incident inbox");

assert.match(env, /isBillingCheckoutSafeModeEnabled/, "billing checkout safe mode helper must exist");
assert.match(billingCheckout, /billing_checkout_safe_mode/, "subscription checkout must fail closed in safe mode");
assert.match(creditCheckout, /billing_checkout_safe_mode/, "credit checkout must fail closed in safe mode");
assert.match(layout, /data-dpl-id/, "root layout must expose a safe deploy marker");
assert.match(envExample, /BILLING_CHECKOUT_SAFE_MODE=false/, "billing safe-mode env must be documented");
assert.match(envExample, /SCALE_MONITOR_SMOKE_ENABLED=true/, "scale monitor smoke env must be documented");
assert.match(envExample, /SCALE_MONITOR_PRODUCT_ALIAS_URLS=https:\/\/app\.agentdealflow\.io/, "product alias env must avoid marketing aliases by default");
assert.match(envExample, /SCALE_MONITOR_MARKETING_WWW_URL=https:\/\/www\.agentdealflow\.io/, "marketing www env must be documented");
assert.match(envExample, /SCALE_MONITOR_MARKETING_APEX_URL=https:\/\/agentdealflow\.io/, "marketing apex env must be documented");
assert.match(schemaCheck, /20260519023000_create_scale_monitor_incidents\.sql/, "schema check must require the incident migration");
assert.match(schemaCheck, /scale_monitor_incidents table check/, "schema check must probe incidents table");
assert.match(schemaCheck, /scale_monitor_runs table check/, "schema check must probe monitor runs table");

function buildFixtureIncidents(snapshot, debt, smokeChecks = []) {
  const incidents = [];
  for (const entry of snapshot.issueClassification.activeBlockers) {
    incidents.push({ key: `scale-active:${entry.subsystem}`, severity: "p1", subsystem: entry.subsystem });
  }
  for (const entry of snapshot.issueClassification.currentWatch) {
    incidents.push({ key: `scale-watch:${entry.subsystem}`, severity: "p2", subsystem: entry.subsystem });
  }
  if (debt.unresolvedStripeFailures > 0) {
    incidents.push({ key: "operator-debt:unresolvedstripefailures", severity: "p1", subsystem: "operator_debt" });
  }
  if (snapshot.queue.byLane.critical.deadLetter > 0) {
    incidents.push({ key: "queue:critical-dead-letter", severity: "p1", subsystem: "queue" });
  }
  for (const check of smokeChecks) {
    if (!check.ok) {
      incidents.push({ key: `smoke:${check.url}`, severity: "p1", subsystem: "production_smoke" });
    }
  }
  return incidents;
}

function resolveFixtureIncident(row, activeKeys, resolveAfter) {
  if (activeKeys.has(row.key)) {
    return { ...row, status: "open", cleanCheckCount: 0 };
  }
  const cleanCheckCount = row.cleanCheckCount + 1;
  return {
    ...row,
    cleanCheckCount,
    status: cleanCheckCount >= resolveAfter ? "resolved" : row.status,
  };
}

const cleanSnapshot = {
  issueClassification: {
    activeBlockers: [],
    currentWatch: [],
    historicalReviewed: [{ subsystem: "meta", count: 13 }],
  },
  queue: { byLane: { critical: { deadLetter: 0 } } },
};
assert.deepEqual(buildFixtureIncidents(cleanSnapshot, { unresolvedStripeFailures: 0 }), [], "clean report must not create incidents");
assert.deepEqual(
  buildFixtureIncidents(
    {
      issueClassification: {
        activeBlockers: [{ subsystem: "lead_sms" }],
        currentWatch: [{ subsystem: "provider" }],
        historicalReviewed: [],
      },
      queue: { byLane: { critical: { deadLetter: 1 } } },
    },
    { unresolvedStripeFailures: 1 },
  ).map((incident) => incident.severity),
  ["p1", "p2", "p1", "p1"],
  "active blockers, watches, debt, and critical dead letters must map to incidents",
);
assert.equal(
  resolveFixtureIncident({ key: "provider", status: "open", cleanCheckCount: 1 }, new Set(), 2).status,
  "resolved",
  "incident must auto-resolve after consecutive clean checks",
);
assert.equal(
  resolveFixtureIncident({ key: "provider", status: "open", cleanCheckCount: 1 }, new Set(["provider"]), 2).status,
  "open",
  "recurring incident must stay open",
);
assert.equal(
  buildFixtureIncidents(cleanSnapshot, { unresolvedStripeFailures: 0 }).length,
  0,
  "historical reviewed items must not reopen incidents",
);
assert.deepEqual(
  buildFixtureIncidents(cleanSnapshot, { unresolvedStripeFailures: 0 }, [{ url: "https://app.agentdealflow.io/login", ok: false }]).map((incident) => incident.subsystem),
  ["production_smoke"],
  "safe smoke failure must create an incident",
);

console.log("Scale monitoring automation tests passed.");
