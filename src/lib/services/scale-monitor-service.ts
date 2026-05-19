import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { Database, Json } from "@/lib/supabase/types";
import {
  loadScaleReadinessSnapshot,
  type ScaleIssueClassificationEntry,
  type ScaleReadinessSnapshot,
} from "@/lib/services/scale-readiness-service";
import { getFreshdeskOperationalStatus } from "@/lib/support/freshdesk";
import { getSmsOutboundPolicyStatus } from "@/lib/services/sms-service";

type MonitorClient = SupabaseClient<Database>;

export type ScaleMonitorSeverity = "p0" | "p1" | "p2" | "p3";
export type ScaleMonitorIncidentStatus = "open" | "acknowledged" | "resolved";

export type ScaleMonitorIncident = {
  id: string;
  incident_key: string;
  subsystem: string;
  severity: ScaleMonitorSeverity;
  status: ScaleMonitorIncidentStatus;
  title: string;
  evidence: Json;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  recurrence_count: number;
  clean_check_count: number;
  affected_organization_id: string | null;
  affected_campaign_id: string | null;
  recommended_action: string;
  alert_channels: Json;
  last_alerted_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolution_note: string | null;
  synthetic: boolean;
  created_at: string;
  updated_at: string;
};

type ProposedIncident = {
  incidentKey: string;
  subsystem: string;
  severity: ScaleMonitorSeverity;
  title: string;
  evidence: Record<string, Json>;
  recommendedAction: string;
  affectedOrganizationId?: string | null;
  affectedCampaignId?: string | null;
  synthetic?: boolean;
};

type DurableDebtSummary = {
  unresolvedFailedJobs: number;
  unresolvedDeadLetterJobs: number;
  unresolvedStripeFailures: number;
  failedProviderEvents: number;
  staleProviderReservations: number;
  deliveredNotificationStatusDrift: number;
  failedNotificationStatusDrift: number;
};

type SmokeCheck = {
  label: string;
  url: string;
  status: number | null;
  ok: boolean;
  expected: string;
  code?: string | null;
  marker?: string | null;
};

type SmokeSummary = {
  skipped: boolean;
  expectedDeployId: string | null;
  checks: SmokeCheck[];
};

export type ScaleMonitorRunResult = {
  runId: string | null;
  mode: "scheduled" | "manual" | "synthetic";
  verdict: ScaleReadinessSnapshot["verdict"];
  status: ScaleReadinessSnapshot["status"];
  debt: DurableDebtSummary;
  smoke: SmokeSummary;
  proposedIncidents: number;
  openedOrUpdated: number;
  resolved: number;
  openIncidents: number;
  alertChannels: string[];
};

const DEFAULT_RESOLVE_AFTER_CLEAN_CHECKS = 2;
const QUEUE_AGE_WATCH_MINUTES = 15;
const QUEUE_AGE_BLOCKER_MINUTES = 60;
const PUBLIC_FUNNEL_SMOKE_SLUG = "raiaan-broker-toronto-on-ccbfbfce";
const DEFAULT_ALIAS_URLS = [
  "https://app.agentdealflow.io",
  "https://www.agentdealflow.io",
  "https://agentdealflow.io",
];

function adminOrThrow() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured for scale monitoring.", "scale_monitor_service_role_missing");
  }
  return admin;
}

function nowIso() {
  return new Date().toISOString();
}

function asCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeKey(value: string) {
  return value.replace(/[^a-z0-9:_-]+/gi, "_").toLowerCase().slice(0, 180);
}

function safeEvidenceFromEntry(entry: ScaleIssueClassificationEntry): Record<string, Json> {
  return {
    count: entry.count,
    subsystem: entry.subsystem,
    oldestTimestamp: entry.oldestTimestamp,
    newestTimestamp: entry.newestTimestamp,
    affectedIds: entry.affectedIds.slice(0, 12),
    ageBuckets: entry.ageBuckets,
    reason: entry.reason,
  };
}

function boolEnv(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

export function getSafeDegradationStatus() {
  const freshdesk = getFreshdeskOperationalStatus();
  const sms = getSmsOutboundPolicyStatus();

  return {
    providerGeneration: {
      imageEnvName: "ALLOW_HIGGSFIELD_IMAGE_GENERATION",
      videoEnvName: "ALLOW_HIGGSFIELD_VIDEO_GENERATION",
      imageEnabled: boolEnv("ALLOW_HIGGSFIELD_IMAGE_GENERATION"),
      videoEnabled: boolEnv("ALLOW_HIGGSFIELD_VIDEO_GENERATION"),
      queueDelayEnvName: "MARKETING_STUDIO_WORKER_ENABLED",
      queueDelayModeAvailable: true,
    },
    metaLaunch: {
      envName: "ALLOW_META_LIVE_LAUNCH",
      enabled: boolEnv("ALLOW_META_LIVE_LAUNCH"),
    },
    sms: {
      envName: "INTERNAL_LEAD_SMS_ENABLED",
      internalLeadNotificationsEnabled: sms.internalLeadNotificationsEnabled,
      outboundLeadSmsEnabled: sms.outboundLeadSmsEnabled,
      leadSaveContinuesWhenDisabled: true,
    },
    checkout: {
      envName: "BILLING_CHECKOUT_SAFE_MODE",
      safeModeEnabled: boolEnv("BILLING_CHECKOUT_SAFE_MODE"),
    },
    support: {
      envNames: ["FRESHDESK_DOMAIN", "FRESHDESK_API_KEY"],
      configured: freshdesk.configured,
      safeFallbackEnabled: true,
    },
  };
}

type CountQuery = ReturnType<MonitorClient["from"]>;

async function countRows(
  admin: MonitorClient,
  table: string,
  queryBuilder: (query: CountQuery) => PromiseLike<{ count: number | null; error: { message?: string } | null }>,
) {
  const result = await queryBuilder(admin.from(table).select("id", { count: "exact", head: true }));
  if (result.error) {
    throw new ApiError(500, result.error.message ?? `${table} query failed`, "scale_monitor_debt_query_failed");
  }
  return result.count ?? 0;
}

async function countUnreviewedFailedProviderEvents(admin: MonitorClient) {
  const { data, error } = await admin
    .from("provider_usage_events")
    .select("id,metadata")
    .eq("status", "failed");

  if (error) {
    throw new ApiError(500, error.message, "scale_monitor_provider_debt_failed");
  }

  return ((data ?? []) as Array<{ metadata?: { operatorReviewedAt?: unknown } | null }>)
    .filter((row) => !row.metadata?.operatorReviewedAt)
    .length;
}

export async function loadDurableOperatorDebtSummary(admin: MonitorClient): Promise<DurableDebtSummary> {
  const [
    unresolvedFailedJobs,
    unresolvedDeadLetterJobs,
    unresolvedStripeFailures,
    failedProviderEvents,
    staleProviderReservations,
    deliveredNotificationStatusDrift,
    failedNotificationStatusDrift,
  ] = await Promise.all([
    countRows(admin, "system_jobs", (query) => query.eq("status", "failed").is("reviewed_at", null)),
    countRows(admin, "system_jobs", (query) => query.not("dead_lettered_at", "is", null).is("reviewed_at", null)),
    countRows(admin, "stripe_webhook_events", (query) => query.eq("status", "failed").is("reviewed_at", null)),
    countUnreviewedFailedProviderEvents(admin),
    countRows(admin, "provider_usage_events", (query) =>
      query.eq("status", "reserved").lt("created_at", new Date(Date.now() - 30 * 60_000).toISOString()),
    ),
    countRows(admin, "lead_notifications", (query) => query.not("delivered_at", "is", null).neq("status", "delivered")),
    countRows(admin, "lead_notifications", (query) => query.not("failed_at", "is", null).neq("status", "failed")),
  ]);

  return {
    unresolvedFailedJobs,
    unresolvedDeadLetterJobs,
    unresolvedStripeFailures,
    failedProviderEvents,
    staleProviderReservations,
    deliveredNotificationStatusDrift,
    failedNotificationStatusDrift,
  };
}

function hasDebt(debt: DurableDebtSummary) {
  return Object.values(debt).some((value) => value > 0);
}

function debtIncidents(debt: DurableDebtSummary): ProposedIncident[] {
  const incidents: ProposedIncident[] = [];
  for (const [key, value] of Object.entries(debt)) {
    if (value <= 0) {
      continue;
    }
    incidents.push({
      incidentKey: `operator-debt:${safeKey(key)}`,
      subsystem: "operator_debt",
      severity: key.includes("Stripe") || key.includes("FailedJobs") || key.includes("DeadLetter") ? "p1" : "p2",
      title: `Operator debt is non-zero: ${key}`,
      evidence: { count: value, debtKey: key },
      recommendedAction: "Open the incident inbox and clear the underlying durable debt without deleting evidence rows.",
    });
  }
  return incidents;
}

function scaleClassificationIncidents(snapshot: ScaleReadinessSnapshot): ProposedIncident[] {
  const incidents: ProposedIncident[] = [];
  for (const entry of snapshot.issueClassification.activeBlockers) {
    incidents.push({
      incidentKey: `scale-active:${safeKey(entry.subsystem)}`,
      subsystem: entry.subsystem,
      severity: "p1",
      title: `Active scale blocker: ${entry.subsystem}`,
      evidence: safeEvidenceFromEntry(entry),
      recommendedAction: entry.recommendedAction,
    });
  }
  for (const entry of snapshot.issueClassification.currentWatch) {
    incidents.push({
      incidentKey: `scale-watch:${safeKey(entry.subsystem)}`,
      subsystem: entry.subsystem,
      severity: "p2",
      title: `Current scale watch: ${entry.subsystem}`,
      evidence: safeEvidenceFromEntry(entry),
      recommendedAction: entry.recommendedAction,
    });
  }
  return incidents;
}

function snapshotRuleIncidents(snapshot: ScaleReadinessSnapshot): ProposedIncident[] {
  const incidents: ProposedIncident[] = [];

  if (snapshot.billing.stripeWebhookFailures7d > 0 || snapshot.billing.webhookLagWarnings > 0 || snapshot.billing.unknownPriceWarnings > 0) {
    incidents.push({
      incidentKey: "billing:stripe-webhook-lifecycle",
      subsystem: "billing",
      severity: "p1",
      title: "Stripe webhook or billing lifecycle issue detected",
      evidence: {
        stripeWebhookFailures7d: snapshot.billing.stripeWebhookFailures7d,
        webhookLagWarnings: snapshot.billing.webhookLagWarnings,
        unknownPriceWarnings: snapshot.billing.unknownPriceWarnings,
      },
      recommendedAction: "Review Stripe webhook rows and billing subscription state; do not create charges or checkout sessions from the monitor.",
    });
  }

  if (snapshot.meta.driftWarnings > 0 || snapshot.meta.staleSyncSnapshots > 0 || snapshot.meta.activeLaunchLocks > 0) {
    incidents.push({
      incidentKey: "meta:drift-or-stale-latest-snapshot",
      subsystem: "meta",
      severity: snapshot.meta.driftWarnings > 0 ? "p1" : "p2",
      title: "Meta drift, stale latest snapshot, or active launch lock detected",
      evidence: {
        driftWarnings: snapshot.meta.driftWarnings,
        staleSyncSnapshots: snapshot.meta.staleSyncSnapshots,
        activeLaunchLocks: snapshot.meta.activeLaunchLocks,
      },
      recommendedAction: "Use read-only Meta proof. If proof is clean, insert an app-owned sync snapshot; never mutate Meta objects or budgets.",
    });
  }

  for (const cap of snapshot.provider.capPressure) {
    incidents.push({
      incidentKey: `provider-cap:${safeKey(cap.label)}`,
      subsystem: "provider",
      severity: cap.ratio >= 1 ? "p1" : "p2",
      title: `Provider cap pressure: ${cap.label}`,
      evidence: { label: cap.label, usage: cap.usage, limit: cap.limit, ratio: cap.ratio },
      recommendedAction: "Keep provider generation capped; raise caps only with owner approval after debt is clean.",
    });
  }

  if (snapshot.queue.byLane.critical.failed + snapshot.queue.byLane.critical.deadLetter > 0) {
    incidents.push({
      incidentKey: "queue:critical-dead-letter",
      subsystem: "queue",
      severity: "p1",
      title: "Critical lane failed or dead-letter job detected",
      evidence: snapshot.queue.byLane.critical,
      recommendedAction: "Review the critical job and choose a safe resolution; do not retry side-effect jobs without explicit approval.",
    });
  }

  const oldestQueued = snapshot.queue.oldestQueuedAgeMinutes ?? 0;
  if (oldestQueued >= QUEUE_AGE_WATCH_MINUTES) {
    incidents.push({
      incidentKey: "queue:oldest-queued-age",
      subsystem: "queue",
      severity: oldestQueued >= QUEUE_AGE_BLOCKER_MINUTES ? "p1" : "p2",
      title: `Oldest queued job is ${oldestQueued} minutes old`,
      evidence: { oldestQueuedAgeMinutes: oldestQueued, thresholdMinutes: QUEUE_AGE_WATCH_MINUTES },
      recommendedAction: "Check lane caps and stale leases. Keep heavy provider work from starving critical jobs.",
    });
  }

  if (!snapshot.support.configured) {
    incidents.push({
      incidentKey: "support:freshdesk-unavailable",
      subsystem: "support",
      severity: "p3",
      title: "Freshdesk support ticket creation unavailable",
      evidence: { configured: false, warning: snapshot.support.warning, fallback: "customer-safe support fallback enabled" },
      recommendedAction: "Configure Freshdesk env when live ticket creation is required. Until then, admin incident inbox remains the safe alert channel.",
    });
  }

  if (snapshot.clientErrors.status !== "GO") {
    incidents.push({
      incidentKey: "client-errors:spike-or-unresolved",
      subsystem: "client_errors",
      severity: snapshot.clientErrors.status === "DEGRADED" ? "p1" : "p2",
      title: "Client error spike or unresolved high-severity error detected",
      evidence: {
        today: snapshot.clientErrors.today,
        sevenDays: snapshot.clientErrors.sevenDays,
        recentUnresolved: snapshot.clientErrors.recentUnresolved,
        topRoutes: snapshot.clientErrors.topRoutes,
        topClasses: snapshot.clientErrors.topClasses,
      },
      recommendedAction: "Open admin issue logs and route launch-critical errors back to engineering.",
    });
  }

  return incidents;
}

function expectedAliasUrls() {
  const configured = process.env.SCALE_MONITOR_ALIAS_URLS?.trim();
  if (!configured) {
    return DEFAULT_ALIAS_URLS;
  }

  return configured
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

async function smokeFetch(url: string, expected: string, ok: (response: Response, body: string) => boolean): Promise<SmokeCheck> {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "dealflow-scale-monitor/1.0" },
      cache: "no-store",
    });
    const body = await response.text().catch(() => "");
    const marker = body.match(/data-dpl-id="([^"]+)"/)?.[1] ?? null;
    return {
      label: url,
      url,
      status: response.status,
      ok: ok(response, body),
      expected,
      marker,
    };
  } catch (error) {
    return {
      label: url,
      url,
      status: null,
      ok: false,
      expected,
      code: error instanceof Error ? error.name : "fetch_failed",
    };
  }
}

export async function runSafeProductionSmokeSummary(): Promise<SmokeSummary> {
  if (process.env.SCALE_MONITOR_SMOKE_ENABLED?.trim().toLowerCase() === "false") {
    return { skipped: true, expectedDeployId: null, checks: [] };
  }

  const aliases = expectedAliasUrls();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || aliases[0] || "https://app.agentdealflow.io").replace(/\/$/, "");
  const expectedDeployId =
    process.env.SCALE_MONITOR_EXPECTED_DEPLOY_ID?.trim() ||
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID?.trim() ||
    null;
  const checks: SmokeCheck[] = [];

  for (const alias of aliases) {
    checks.push(await smokeFetch(`${alias}/login`, "200 login or redirect", (response) => [200, 307, 308].includes(response.status)));
    if (expectedDeployId && checks[checks.length - 1]?.marker && checks[checks.length - 1].marker !== expectedDeployId) {
      checks[checks.length - 1].ok = false;
      checks[checks.length - 1].expected = `data-dpl-id ${expectedDeployId}`;
    }
  }

  checks.push(await smokeFetch(`${appUrl}/signup`, "200/307 signup", (response) => [200, 307, 308].includes(response.status)));
  checks.push(await smokeFetch(`${appUrl}/dashboard`, "unauth dashboard redirects", (response) => [302, 303, 307, 308].includes(response.status)));
  checks.push(await smokeFetch(`${appUrl}/f/${PUBLIC_FUNNEL_SMOKE_SLUG}`, "public funnel 200", (response) => response.status === 200));

  return { skipped: false, expectedDeployId, checks };
}

function smokeIncidents(smoke: SmokeSummary): ProposedIncident[] {
  if (smoke.skipped) {
    return [];
  }

  return smoke.checks
    .filter((check) => !check.ok)
    .map((check) => ({
      incidentKey: `smoke:${safeKey(check.url)}`,
      subsystem: check.expected.includes("data-dpl-id") ? "alias_deploy" : "production_smoke",
      severity: "p1" as const,
      title: `Safe production smoke failed: ${check.expected}`,
      evidence: {
        url: check.url,
        status: check.status,
        expected: check.expected,
        code: check.code ?? null,
        marker: check.marker ?? null,
        expectedDeployId: smoke.expectedDeployId,
      },
      recommendedAction: "Verify the alias/deploy mapping and route health using read-only GET probes before customer traffic scales.",
    }));
}

function buildProposedIncidents(params: {
  snapshot: ScaleReadinessSnapshot;
  debt: DurableDebtSummary;
  smoke: SmokeSummary;
  includeSupportIncident?: boolean;
}) {
  const incidents = [
    ...scaleClassificationIncidents(params.snapshot),
    ...debtIncidents(params.debt),
    ...snapshotRuleIncidents(params.snapshot),
    ...smokeIncidents(params.smoke),
  ];

  if (params.includeSupportIncident === false) {
    return incidents.filter((incident) => incident.incidentKey !== "support:freshdesk-unavailable");
  }

  return incidents;
}

function alertChannelsForIncident() {
  const channels = ["admin_incident_inbox"];
  if (process.env.SCALE_MONITOR_SLACK_WEBHOOK_URL?.trim()) {
    channels.push("slack_configured_not_sent");
  }
  if (process.env.SCALE_MONITOR_ALERT_EMAIL_TO?.trim()) {
    channels.push("email_configured_not_sent");
  }
  return channels;
}

async function upsertIncident(admin: MonitorClient, incident: ProposedIncident, timestamp: string) {
  const channels = alertChannelsForIncident();
  const { data: existing, error: lookupError } = await admin
    .from("scale_monitor_incidents")
    .select("*")
    .eq("incident_key", incident.incidentKey)
    .maybeSingle();

  if (lookupError) {
    throw new ApiError(500, lookupError.message, "scale_monitor_incident_lookup_failed");
  }

  if (existing) {
    const existingRow = existing as ScaleMonitorIncident;
    const nextRecurrence = existingRow.status === "resolved" ? existingRow.recurrence_count + 1 : existingRow.recurrence_count;
    const { error } = await admin
      .from("scale_monitor_incidents")
      .update({
        subsystem: incident.subsystem,
        severity: incident.severity,
        status: existingRow.status === "acknowledged" ? "acknowledged" : "open",
        title: incident.title,
        evidence: incident.evidence as Json,
        last_seen_at: timestamp,
        resolved_at: null,
        recurrence_count: nextRecurrence,
        clean_check_count: 0,
        affected_organization_id: incident.affectedOrganizationId ?? null,
        affected_campaign_id: incident.affectedCampaignId ?? null,
        recommended_action: incident.recommendedAction,
        alert_channels: channels as unknown as Json,
        last_alerted_at: timestamp,
        synthetic: Boolean(incident.synthetic),
        updated_at: timestamp,
      } as never)
      .eq("id", existingRow.id);
    if (error) {
      throw new ApiError(500, error.message, "scale_monitor_incident_update_failed");
    }
    return { opened: existingRow.status === "resolved" ? 1 : 0, updated: 1 };
  }

  const { error } = await admin
    .from("scale_monitor_incidents")
    .insert({
      incident_key: incident.incidentKey,
      subsystem: incident.subsystem,
      severity: incident.severity,
      status: "open",
      title: incident.title,
      evidence: incident.evidence as Json,
      first_seen_at: timestamp,
      last_seen_at: timestamp,
      affected_organization_id: incident.affectedOrganizationId ?? null,
      affected_campaign_id: incident.affectedCampaignId ?? null,
      recommended_action: incident.recommendedAction,
      alert_channels: channels as unknown as Json,
      last_alerted_at: timestamp,
      synthetic: Boolean(incident.synthetic),
      updated_at: timestamp,
    } as never);
  if (error) {
    throw new ApiError(500, error.message, "scale_monitor_incident_insert_failed");
  }
  return { opened: 1, updated: 0 };
}

async function resolveCleanIncidents(admin: MonitorClient, activeKeys: Set<string>, timestamp: string, resolveAfterCleanChecks: number) {
  const { data, error } = await admin
    .from("scale_monitor_incidents")
    .select("*")
    .in("status", ["open", "acknowledged"]);

  if (error) {
    throw new ApiError(500, error.message, "scale_monitor_incident_open_lookup_failed");
  }

  let resolved = 0;
  for (const row of (data ?? []) as ScaleMonitorIncident[]) {
    if (activeKeys.has(row.incident_key)) {
      continue;
    }
    const cleanCount = asCount(row.clean_check_count) + 1;
    const shouldResolve = cleanCount >= resolveAfterCleanChecks;
    const { error: updateError } = await admin
      .from("scale_monitor_incidents")
      .update({
        clean_check_count: cleanCount,
        status: shouldResolve ? "resolved" : row.status,
        resolved_at: shouldResolve ? timestamp : row.resolved_at,
        resolution_note: shouldResolve ? "Auto-resolved after consecutive clean scale monitor checks." : row.resolution_note,
        updated_at: timestamp,
      } as never)
      .eq("id", row.id);
    if (updateError) {
      throw new ApiError(500, updateError.message, "scale_monitor_incident_resolve_failed");
    }
    if (shouldResolve) {
      resolved += 1;
    }
  }
  return resolved;
}

async function createRunRow(admin: MonitorClient, timestamp: string) {
  const { data, error } = await admin
    .from("scale_monitor_runs")
    .insert({ started_at: timestamp, status: "running" } as never)
    .select("id")
    .single();

  if (error) {
    throw new ApiError(500, error.message, "scale_monitor_run_create_failed");
  }

  return (data as { id: string }).id;
}

async function updateRunRow(admin: MonitorClient, id: string, values: Record<string, unknown>) {
  const { error } = await admin
    .from("scale_monitor_runs")
    .update(values as never)
    .eq("id", id);

  if (error) {
    throw new ApiError(500, error.message, "scale_monitor_run_update_failed");
  }
}

async function countOpenIncidents(admin: MonitorClient) {
  const { count, error } = await admin
    .from("scale_monitor_incidents")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "acknowledged"]);

  if (error) {
    throw new ApiError(500, error.message, "scale_monitor_incident_count_failed");
  }

  return count ?? 0;
}

export async function runScaleMonitor(options?: {
  mode?: "scheduled" | "manual";
  includeSmoke?: boolean;
  includeSupportIncident?: boolean;
  resolveAfterCleanChecks?: number;
}): Promise<ScaleMonitorRunResult> {
  const admin = adminOrThrow();
  const timestamp = nowIso();
  const runId = await createRunRow(admin, timestamp);

  try {
    const [snapshot, debt, smoke] = await Promise.all([
      loadScaleReadinessSnapshot(),
      loadDurableOperatorDebtSummary(admin),
      options?.includeSmoke === false
        ? Promise.resolve({ skipped: true, expectedDeployId: null, checks: [] } satisfies SmokeSummary)
        : runSafeProductionSmokeSummary(),
    ]);
    const proposed = buildProposedIncidents({
      snapshot,
      debt,
      smoke,
      includeSupportIncident: options?.includeSupportIncident,
    });
    const activeKeys = new Set(proposed.map((incident) => incident.incidentKey));
    let openedOrUpdated = 0;

    for (const incident of proposed) {
      const result = await upsertIncident(admin, incident, timestamp);
      openedOrUpdated += result.opened + result.updated;
    }

    const resolved = await resolveCleanIncidents(
      admin,
      activeKeys,
      timestamp,
      options?.resolveAfterCleanChecks ?? DEFAULT_RESOLVE_AFTER_CLEAN_CHECKS,
    );
    const openIncidents = await countOpenIncidents(admin);
    const result: ScaleMonitorRunResult = {
      runId,
      mode: options?.mode ?? "scheduled",
      verdict: snapshot.verdict,
      status: hasDebt(debt) || proposed.some((incident) => incident.severity === "p0" || incident.severity === "p1")
        ? "DEGRADED"
        : snapshot.status,
      debt,
      smoke,
      proposedIncidents: proposed.length,
      openedOrUpdated,
      resolved,
      openIncidents,
      alertChannels: alertChannelsForIncident(),
    };

    await updateRunRow(admin, runId, {
      completed_at: timestamp,
      status: "completed",
      verdict: result.verdict,
      summary: {
        status: result.status,
        debt,
        proposedIncidents: proposed.length,
        openIncidents,
      } as Json,
      smoke_summary: smoke as unknown as Json,
      incidents_opened: openedOrUpdated,
      incidents_resolved: resolved,
    });

    return result;
  } catch (error) {
    await updateRunRow(admin, runId, {
      completed_at: nowIso(),
      status: "failed",
      error_code: error instanceof ApiError ? error.code : "scale_monitor_failed",
      summary: { message: error instanceof Error ? error.message : "Scale monitor failed." } as Json,
    }).catch(() => undefined);
    throw error;
  }
}

export async function runSyntheticScaleMonitorProof() {
  const admin = adminOrThrow();
  const timestamp = nowIso();
  const synthetic: ProposedIncident = {
    incidentKey: "synthetic:scale-monitor-test",
    subsystem: "synthetic_monitor_test",
    severity: "p3",
    title: "Synthetic scale monitor test incident",
    evidence: {
      synthetic: true,
      sideEffects: "none",
      createdBy: "scale_monitor_test_harness",
    },
    recommendedAction: "No operator action required. This incident should auto-resolve inside the harness.",
    synthetic: true,
  };

  await upsertIncident(admin, synthetic, timestamp);
  const resolved = await resolveCleanIncidents(admin, new Set(), nowIso(), 1);
  const { data, error } = await admin
    .from("scale_monitor_incidents")
    .select("*")
    .eq("incident_key", synthetic.incidentKey)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "scale_monitor_synthetic_lookup_failed");
  }

  const incident = data as ScaleMonitorIncident | null;
  return {
    created: Boolean(incident),
    resolved: incident?.status === "resolved",
    resolvedCount: resolved,
    incidentId: incident?.id ?? null,
    alertChannels: incident?.alert_channels ?? [],
    sideEffects: "none",
  };
}

export async function loadScaleMonitorIncidents(params?: {
  status?: string | null;
  severity?: string | null;
  subsystem?: string | null;
  limit?: number;
}) {
  const admin = adminOrThrow();
  let query = admin
    .from("scale_monitor_incidents")
    .select("*")
    .order("last_seen_at", { ascending: false })
    .limit(Math.min(Math.max(params?.limit ?? 100, 1), 250));

  if (params?.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }
  if (params?.severity && params.severity !== "all") {
    query = query.eq("severity", params.severity);
  }
  if (params?.subsystem && params.subsystem !== "all") {
    query = query.eq("subsystem", params.subsystem);
  }

  const { data, error } = await query;
  if (error) {
    throw new ApiError(500, error.message, "scale_monitor_incidents_load_failed");
  }

  return (data ?? []) as ScaleMonitorIncident[];
}

export async function updateScaleMonitorIncidentStatus(params: {
  id: string;
  action: "acknowledge" | "resolve";
  actor: string;
  note?: string | null;
}) {
  const admin = adminOrThrow();
  const timestamp = nowIso();
  const patch = params.action === "acknowledge"
    ? {
        status: "acknowledged",
        acknowledged_at: timestamp,
        acknowledged_by: params.actor,
        updated_at: timestamp,
      }
    : {
        status: "resolved",
        resolved_at: timestamp,
        resolution_note: params.note?.trim() || "Resolved by internal operator.",
        updated_at: timestamp,
      };

  const { error } = await admin
    .from("scale_monitor_incidents")
    .update(patch as never)
    .eq("id", params.id);

  if (error) {
    throw new ApiError(500, error.message, "scale_monitor_incident_status_update_failed");
  }
}
