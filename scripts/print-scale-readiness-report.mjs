#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const JOB_LANE_CONCURRENCY_CAPS = { critical: 5, normal: 3, heavy: 1 };
const CRITICAL_JOB_KINDS = new Set([
  "stripe_webhook_recovery",
  "billing_subscription_recovery",
  "billing_recovery",
  "lead_capture_retry",
  "lead_side_effects",
  "subscription_suspension",
]);
const HEAVY_JOB_KINDS = new Set([
  "static_creative_generation",
  "video_generation",
  "video_generation_status",
  "provider_polling",
]);

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function laneFor(kind) {
  if (CRITICAL_JOB_KINDS.has(kind)) return "critical";
  if (HEAVY_JOB_KINDS.has(kind)) return "heavy";
  return "normal";
}

function countBy(rows, keyFor) {
  return rows.reduce((acc, row) => {
    const key = keyFor(row);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function money(cents) {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function costCents(value) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 100) : 0;
}

function isWithin(value, sinceMs) {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= sinceMs;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function top(counts, limit = 5) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

async function readRows(supabase, label, query, warnings) {
  const { data, error } = await query;
  if (error) {
    warnings.push(`${label}: ${error.code ?? "query_failed"}`);
    return [];
  }
  return data ?? [];
}

function statusFrom({ high = 0, watch = 0 }) {
  if (high > 0) return "DEGRADED";
  if (watch > 0) return "WATCH";
  return "GO";
}

async function buildReport() {
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const generatedAt = new Date().toISOString();
  const today = todayIso();
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgoMs = Date.parse(sevenDaysAgoIso);
  const oneDayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
  const thirtyMinutesAgoIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const warnings = [];

  const [
    jobs,
    providerEvents,
    providerLimits,
    billingSubscriptions,
    stripeEvents,
    leads,
    notifications,
    metaSnapshots,
    metaLocks,
    clientErrors,
  ] = await Promise.all([
    readRows(supabase, "system_jobs", supabase.from("system_jobs").select("id,kind,status,created_at,started_at,locked_until,attempt_count,max_attempts,dead_lettered_at").neq("status", "completed").order("created_at", { ascending: false }).limit(1000), warnings),
    readRows(supabase, "provider_usage_events", supabase.from("provider_usage_events").select("id,organization_id,campaign_id,provider,operation,status,estimated_cost,actual_cost,created_at").gte("created_at", sevenDaysAgoIso).order("created_at", { ascending: false }).limit(2000), warnings),
    readRows(supabase, "provider_usage_limits", supabase.from("provider_usage_limits").select("provider,operation,usage_count,limit_count,usage_date,updated_at").gte("usage_date", today).order("updated_at", { ascending: false }).limit(1000), warnings),
    readRows(supabase, "billing_subscriptions", supabase.from("billing_subscriptions").select("organization_id,plan_tier,status,current_period_end,cancel_at_period_end,created_at,updated_at").limit(5000), warnings),
    readRows(supabase, "stripe_webhook_events", supabase.from("stripe_webhook_events").select("id,stripe_event_type,status,error_code,created_at,updated_at").gte("created_at", sevenDaysAgoIso).order("created_at", { ascending: false }).limit(2000), warnings),
    readRows(supabase, "leads", supabase.from("leads").select("id,status,created_at").gte("created_at", sevenDaysAgoIso).order("created_at", { ascending: false }).limit(5000), warnings),
    readRows(supabase, "lead_notifications", supabase.from("lead_notifications").select("id,status,created_at,updated_at").gte("created_at", sevenDaysAgoIso).order("created_at", { ascending: false }).limit(5000), warnings),
    readRows(supabase, "campaign_sync_snapshots", supabase.from("campaign_sync_snapshots").select("id,sync_result,campaign_status,delivery_metrics,sync_errors,synced_at").order("synced_at", { ascending: false }).limit(500), warnings),
    readRows(supabase, "meta_launch_locks", supabase.from("meta_launch_locks").select("campaign_id,locked_until,updated_at").order("updated_at", { ascending: false }).limit(500), warnings),
    readRows(supabase, "client_error_events", supabase.from("client_error_events").select("id,route_path,severity,error_name,browser,occurrence_count,last_seen_at,reviewed_at").gte("last_seen_at", sevenDaysAgoIso).order("last_seen_at", { ascending: false }).limit(1000), warnings),
  ]);

  const byLane = {
    critical: { queued: 0, processing: 0, failed: 0, deadLetter: 0 },
    normal: { queued: 0, processing: 0, failed: 0, deadLetter: 0 },
    heavy: { queued: 0, processing: 0, failed: 0, deadLetter: 0 },
  };
  for (const job of jobs) {
    const lane = laneFor(job.kind);
    if (job.status === "pending") byLane[lane].queued += 1;
    if (job.status === "processing") byLane[lane].processing += 1;
    if (job.status === "failed") byLane[lane].failed += 1;
    if (job.dead_lettered_at) byLane[lane].deadLetter += 1;
  }
  const staleProcessingJobs = jobs.filter((job) => job.status === "processing" && (!job.locked_until || Date.parse(job.locked_until) < Date.now())).length;
  const jobsApproachingMaxAttempts = jobs.filter((job) => Number(job.max_attempts ?? 0) > 0 && Number(job.attempt_count ?? 0) >= Math.max(1, Number(job.max_attempts) - 1)).length;
  const providerFailures = providerEvents.filter((event) => event.status === "failed");
  const staleProviderReservations = providerEvents.filter((event) => event.status === "reserved" && event.created_at < thirtyMinutesAgoIso).length;
  const providerCostToday = providerEvents
    .filter((event) => event.created_at?.startsWith(today))
    .reduce((sum, event) => sum + costCents(event.actual_cost ?? event.estimated_cost), 0);
  const capPressure = providerLimits
    .map((limit) => ({
      label: `${limit.provider ?? "provider"}:${limit.operation ?? "operation"}`,
      usage: Number(limit.usage_count ?? 0),
      limit: Number(limit.limit_count ?? 0),
    }))
    .filter((limit) => limit.limit > 0 && limit.usage / limit.limit >= 0.7);
  const billingCounts = countBy(billingSubscriptions, (row) => row.status ?? "unknown");
  const stripeFailures = stripeEvents.filter((event) => event.status === "failed").length;
  const notificationsByStatus = countBy(notifications, (row) => row.status ?? "unknown");
  const failedLeadNotifications = (notificationsByStatus.failed ?? 0) + (notificationsByStatus.undelivered ?? 0);
  const metaFailures = metaSnapshots.filter((row) => row.sync_result === "failed" || (Array.isArray(row.sync_errors) && row.sync_errors.length > 0)).length;
  const staleMetaSnapshots = metaSnapshots.filter((row) => row.synced_at && Date.now() - Date.parse(row.synced_at) > 2 * 60 * 60 * 1000).length;
  const activeLocks = metaLocks.filter((lock) => lock.locked_until && Date.parse(lock.locked_until) > Date.now()).length;
  const clientErrorOccurrences = clientErrors.reduce((sum, row) => sum + Math.max(1, Number(row.occurrence_count ?? 1)), 0);
  const highClientErrors = clientErrors.filter((row) => !row.reviewed_at && isWithin(row.last_seen_at, oneDayAgoMs) && (row.severity === "critical" || row.severity === "high")).length;
  const highClientErrors7d = clientErrors.filter((row) => !row.reviewed_at && (row.severity === "critical" || row.severity === "high")).length;
  const supportConfigured = Boolean(process.env.FRESHDESK_DOMAIN?.trim() && process.env.FRESHDESK_API_KEY?.trim());

  const queueStatus = statusFrom({ high: byLane.critical.failed + byLane.critical.deadLetter + staleProcessingJobs, watch: byLane.heavy.queued + jobsApproachingMaxAttempts });
  const providerStatus = statusFrom({ high: staleProviderReservations, watch: providerFailures.length + capPressure.filter((limit) => limit.usage / limit.limit >= 0.8).length });
  const billingStatus = statusFrom({ high: stripeFailures, watch: Number(billingCounts.past_due ?? 0) });
  const leadStatus = statusFrom({ high: 0, watch: failedLeadNotifications + jobs.filter((job) => job.kind === "lead_capture_retry" && job.status !== "completed").length });
  const metaStatus = statusFrom({ high: metaFailures, watch: staleMetaSnapshots + activeLocks });
  const clientErrorStatus = statusFrom({ high: highClientErrors, watch: highClientErrors7d + (clientErrorOccurrences >= 10 ? 1 : 0) });
  const status = [queueStatus, providerStatus, billingStatus, leadStatus, metaStatus, clientErrorStatus].includes("DEGRADED")
    ? "DEGRADED"
    : [queueStatus, providerStatus, billingStatus, leadStatus, metaStatus, clientErrorStatus].includes("WATCH") || !supportConfigured
      ? "WATCH"
      : "GO";
  const verdict = status === "DEGRADED" ? "300 clients: NO-GO" : "300 clients: GO with monitoring";

  return {
    generatedAt,
    deployId: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID ?? "local",
    verdict,
    status,
    warnings,
    queue: { status: queueStatus, byLane, staleProcessingJobs, jobsApproachingMaxAttempts, caps: JOB_LANE_CONCURRENCY_CAPS },
    provider: { status: providerStatus, events7d: providerEvents.length, failures7d: providerFailures.length, staleReservations: staleProviderReservations, costToday: providerCostToday, capPressure },
    billing: { status: billingStatus, trialing: billingCounts.trialing ?? 0, active: billingCounts.active ?? 0, pastDue: billingCounts.past_due ?? 0, canceled: (billingCounts.canceled ?? 0) + (billingCounts.inactive ?? 0), stripeFailures },
    leads: { status: leadStatus, leads7d: leads.filter((lead) => isWithin(lead.created_at, sevenDaysAgoMs)).length, notificationsByStatus, failedLeadNotifications },
    meta: { status: metaStatus, snapshots: metaSnapshots.length, metaFailures, staleMetaSnapshots, activeLocks },
    support: { status: supportConfigured ? "GO" : "WATCH", configured: supportConfigured, warning: supportConfigured ? null : "Freshdesk env missing; support route uses customer-safe fallback." },
    clientErrors: {
      status: clientErrorStatus,
      occurrences7d: clientErrorOccurrences,
      highSeverityGroups: highClientErrors,
      highSeverityGroups7d: highClientErrors7d,
      topRoutes: top(countBy(clientErrors, (row) => row.route_path ?? "/"), 5),
      topClasses: top(countBy(clientErrors, (row) => row.error_name ?? row.severity ?? "client_error"), 5),
    },
  };
}

function printMarkdown(report) {
  console.log(`# DealFlow 300-Client Daily Operator Report`);
  console.log("");
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Deploy ID: ${report.deployId}`);
  console.log(`Final summary: ${report.verdict}`);
  console.log("");
  console.log(`## Queue / Job Health - ${report.queue.status}`);
  console.log(`- Critical lane: ${report.queue.byLane.critical.queued} queued, ${report.queue.byLane.critical.processing} processing, ${report.queue.byLane.critical.failed} failed, ${report.queue.byLane.critical.deadLetter} dead-letter`);
  console.log(`- Heavy lane: ${report.queue.byLane.heavy.queued} queued, ${report.queue.byLane.heavy.processing} processing, ${report.queue.byLane.heavy.failed} failed, ${report.queue.byLane.heavy.deadLetter} dead-letter`);
  console.log(`- Stale processing jobs: ${report.queue.staleProcessingJobs}`);
  console.log(`- Jobs approaching max attempts: ${report.queue.jobsApproachingMaxAttempts}`);
  console.log(`- Lane caps: critical ${report.queue.caps.critical}, normal ${report.queue.caps.normal}, heavy ${report.queue.caps.heavy}`);
  console.log("");
  console.log(`## Provider Usage / Cost - ${report.provider.status}`);
  console.log(`- Provider events 7d: ${report.provider.events7d}`);
  console.log(`- Failed provider events 7d: ${report.provider.failures7d}`);
  console.log(`- Stale reservations: ${report.provider.staleReservations}`);
  console.log(`- Estimated cost today: ${money(report.provider.costToday)}`);
  console.log(`- Cap pressure: ${report.provider.capPressure.length ? report.provider.capPressure.map((cap) => `${cap.label} ${cap.usage}/${cap.limit}`).join(", ") : "clear"}`);
  console.log("");
  console.log(`## Billing Lifecycle - ${report.billing.status}`);
  console.log(`- Trialing: ${report.billing.trialing}`);
  console.log(`- Active: ${report.billing.active}`);
  console.log(`- Past due: ${report.billing.pastDue}`);
  console.log(`- Canceled/inactive: ${report.billing.canceled}`);
  console.log(`- Stripe webhook failures: ${report.billing.stripeFailures}`);
  console.log("");
  console.log(`## Lead / SMS Reliability - ${report.leads.status}`);
  console.log(`- Leads 7d: ${report.leads.leads7d}`);
  console.log(`- Notification statuses: ${JSON.stringify(report.leads.notificationsByStatus)}`);
  console.log(`- Failed or undelivered notifications: ${report.leads.failedLeadNotifications}`);
  console.log("");
  console.log(`## Meta Spend / Drift - ${report.meta.status}`);
  console.log(`- Sync snapshots: ${report.meta.snapshots}`);
  console.log(`- Drift/sync failures: ${report.meta.metaFailures}`);
  console.log(`- Stale snapshots: ${report.meta.staleMetaSnapshots}`);
  console.log(`- Active launch locks: ${report.meta.activeLocks}`);
  console.log("");
  console.log(`## Support / Freshdesk - ${report.support.status}`);
  console.log(`- Configured: ${report.support.configured}`);
  console.log(`- Warning: ${report.support.warning ?? "none"}`);
  console.log("");
  console.log(`## Client Errors - ${report.clientErrors.status}`);
  console.log(`- Occurrences 7d: ${report.clientErrors.occurrences7d}`);
  console.log(`- High severity groups: ${report.clientErrors.highSeverityGroups}`);
  console.log(`- Top routes: ${report.clientErrors.topRoutes.length ? report.clientErrors.topRoutes.map(([route, count]) => `${route} (${count})`).join(", ") : "none"}`);
  console.log("");
  if (report.warnings.length > 0) {
    console.log(`## Data Warnings`);
    for (const warning of report.warnings) console.log(`- ${warning}`);
    console.log("");
  }
  console.log(`## Final Summary`);
  console.log(report.verdict);
}

const report = await buildReport();
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printMarkdown(report);
}

if (report.status === "DEGRADED") {
  process.exitCode = 1;
}
