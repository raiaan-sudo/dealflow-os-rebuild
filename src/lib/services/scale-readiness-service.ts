import "server-only";

import { getMetaDailyBudgetCapCents } from "@/lib/integrations/meta/budget-cap";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { getSmsOutboundPolicyStatus } from "@/lib/services/sms-service";
import { getFreshdeskOperationalStatus } from "@/lib/support/freshdesk";

export type ScaleHealthStatus = "GO" | "WATCH" | "DEGRADED";
export type JobLane = "critical" | "normal" | "heavy";

type RawJob = {
  id: string;
  kind: string | null;
  status: string | null;
  created_at: string | null;
  started_at?: string | null;
  updated_at?: string | null;
  locked_until: string | null;
  attempt_count?: number | null;
  max_attempts?: number | null;
  dead_lettered_at: string | null;
  last_error_code: string | null;
  organization_id?: string | null;
  campaign_id?: string | null;
};

type RawProviderEvent = {
  id: string;
  organization_id: string | null;
  campaign_id: string | null;
  provider: string | null;
  operation: string | null;
  status: string | null;
  estimated_cost: number | string | null;
  actual_cost: number | string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RawProviderLimit = {
  id: string;
  provider: string | null;
  operation: string | null;
  usage_count: number | null;
  limit_count: number | null;
  usage_date: string | null;
  updated_at: string | null;
};

type RawBillingSubscription = {
  organization_id: string;
  plan_tier: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type RawStripeEvent = {
  id: string;
  stripe_event_type: string | null;
  status: string | null;
  error_code: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RawLead = {
  id: string;
  organization_id: string | null;
  campaign_id: string | null;
  status: string | null;
  created_at: string | null;
};

type RawLeadNotification = {
  id: string;
  tenant_id: string | null;
  lead_id: string | null;
  channel: string | null;
  provider: string | null;
  purpose: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RawMetaSnapshot = {
  id: string;
  organization_id: string | null;
  launch_mode: string | null;
  sync_result: string | null;
  meta_campaign_id: string | null;
  campaign_status: string | null;
  ad_set_statuses: unknown;
  ad_statuses: unknown;
  delivery_metrics: unknown;
  sync_errors: unknown;
  synced_at: string | null;
};

type RawMetaLock = {
  campaign_id: string;
  locked_until: string | null;
  updated_at: string | null;
};

type RawClientError = {
  id: string;
  route_path: string | null;
  source: string | null;
  severity: string | null;
  error_name: string | null;
  browser: string | null;
  viewport: string | null;
  occurrence_count: number | null;
  last_seen_at: string | null;
  reviewed_at?: string | null;
};

export type ScaleReadinessSnapshot = {
  status: ScaleHealthStatus;
  verdict: "300 clients: GO with monitoring" | "300 clients: NO-GO";
  generatedAt: string;
  deployId: string;
  commitSha: string;
  warnings: string[];
  blockers: string[];
  nextActions: string[];
  queue: {
    status: ScaleHealthStatus;
    byKind: Record<string, { queued: number; processing: number; failed: number; deadLetter: number; lane: JobLane }>;
    byLane: Record<JobLane, { queued: number; processing: number; failed: number; deadLetter: number }>;
    oldestQueuedAgeMinutes: number | null;
    oldestProcessingAgeMinutes: number | null;
    jobsApproachingMaxAttempts: number;
    staleProcessingJobs: number;
    retryPressure: number;
    workerCaps: Record<JobLane, number>;
  };
  provider: {
    status: ScaleHealthStatus;
    staticToday: number;
    static7d: number;
    videoToday: number;
    video7d: number;
    successRate7d: number | null;
    failed7d: number;
    reservedStale: number;
    consumed7d: number;
    released7d: number;
    estimatedCostTodayCents: number;
    capPressure: Array<{ label: string; usage: number; limit: number; ratio: number }>;
    topFailingScopes: Array<{ scope: string; count: number }>;
    killSwitches: Array<{ label: string; enabled: boolean; envName: string }>;
  };
  billing: {
    status: ScaleHealthStatus;
    trialing: number;
    active: number;
    pastDue: number;
    canceled: number;
    trialEndingSoon: number;
    cancelAtPeriodEnd: number;
    checkoutStarted: number;
    checkoutAbandoned: number;
    stripeWebhookFailures7d: number;
    webhookLagWarnings: number;
    unknownPriceWarnings: number;
  };
  leadSms: {
    status: ScaleHealthStatus;
    leadsToday: number;
    leads7d: number;
    leadCaptureRetryJobs: number;
    notificationsByStatus: Record<string, number>;
    smsSentOrDelivered: number;
    smsFailed: number;
    savedLeadNotificationFailures: number;
    twilioErrorClasses: Array<{ label: string; count: number }>;
    policy: ReturnType<typeof getSmsOutboundPolicyStatus>;
  };
  meta: {
    status: ScaleHealthStatus;
    activeCampaignsTracked: number;
    driftWarnings: number;
    staleSyncSnapshots: number;
    activeLaunchLocks: number;
    expectedBudgetCapCents: number | null;
    spendTodayCents: number | null;
    destinationWarnings: number;
    duplicateObjectWarnings: number;
    trackingDomainWarnings: number;
    spendAnomalyNote: string | null;
  };
  clientErrors: {
    status: ScaleHealthStatus;
    today: number;
    sevenDays: number;
    topRoutes: Array<{ route: string; count: number }>;
    topClasses: Array<{ errorClass: string; count: number }>;
    recentUnresolved: number;
    browsers: Array<{ label: string; count: number }>;
  };
  support: {
    status: ScaleHealthStatus;
    configured: boolean;
    warning: string | null;
    categories: number;
    priorityMapReady: boolean;
    unresolvedTicketsSummary: string;
  };
};

export const JOB_LANE_CONCURRENCY_CAPS: Record<JobLane, number> = {
  critical: 5,
  normal: 3,
  heavy: 1,
};

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

export function classifySystemJobLane(kind: string | null | undefined): JobLane {
  const normalized = kind?.trim() ?? "";

  if (CRITICAL_JOB_KINDS.has(normalized)) {
    return "critical";
  }

  if (HEAVY_JOB_KINDS.has(normalized)) {
    return "heavy";
  }

  return "normal";
}

function countBy<T>(rows: T[], keyFor: (row: T) => string) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = keyFor(row);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function topCounts(counts: Record<string, number>, limit = 5) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function ageMinutes(value: string | null | undefined, nowMs: number) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round((nowMs - parsed) / 60_000)) : null;
}

function oldestAge(rows: Array<{ created_at?: string | null; started_at?: string | null }>, field: "created_at" | "started_at", nowMs: number) {
  const ages = rows
    .map((row) => ageMinutes(row[field], nowMs))
    .filter((value): value is number => typeof value === "number");
  return ages.length > 0 ? Math.max(...ages) : null;
}

function costCents(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 100) : 0;
}

function isToday(value: string | null | undefined, today: string) {
  return Boolean(value?.startsWith(today));
}

function isWithin(value: string | null | undefined, sinceMs: number) {
  if (!value) {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= sinceMs;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function statusFromCounts(params: { critical?: number; high?: number; watch?: number }): ScaleHealthStatus {
  if ((params.critical ?? 0) > 0 || (params.high ?? 0) > 0) {
    return "DEGRADED";
  }

  if ((params.watch ?? 0) > 0) {
    return "WATCH";
  }

  return "GO";
}

function isProviderStaticOperation(operation: string | null) {
  return /image|static|creative|finished_ad/i.test(operation ?? "");
}

function isProviderVideoOperation(operation: string | null) {
  return /video|ugc/i.test(operation ?? "");
}

async function safeTable<T>(
  label: string,
  loader: () => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>,
  warnings: string[],
) {
  try {
    const result = await loader();
    if (result.error) {
      warnings.push(`${label}: ${result.error.code ?? "query_failed"}`);
      return [] as T[];
    }

    return Array.isArray(result.data) ? (result.data as T[]) : [];
  } catch (error) {
    warnings.push(`${label}: ${error instanceof Error ? error.name : "query_exception"}`);
    return [] as T[];
  }
}

export function buildScaleReadinessSnapshot(input: {
  generatedAt?: string;
  deployId?: string | null;
  commitSha?: string | null;
  jobs: RawJob[];
  providerEvents: RawProviderEvent[];
  providerLimits: RawProviderLimit[];
  billingSubscriptions: RawBillingSubscription[];
  stripeEvents: RawStripeEvent[];
  leads: RawLead[];
  leadNotifications: RawLeadNotification[];
  metaSnapshots: RawMetaSnapshot[];
  metaLocks: RawMetaLock[];
  clientErrors: RawClientError[];
  warnings?: string[];
}): ScaleReadinessSnapshot {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const nowMs = Date.parse(generatedAt);
  const today = generatedAt.slice(0, 10);
  const sevenDaysAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
  const oneDayAgo = nowMs - 24 * 60 * 60 * 1000;
  const thirtyMinutesAgo = nowMs - 30 * 60 * 1000;
  const twoHoursAgo = nowMs - 2 * 60 * 60 * 1000;
  const warnings = [...(input.warnings ?? [])];

  const byKind: ScaleReadinessSnapshot["queue"]["byKind"] = {};
  const byLane: ScaleReadinessSnapshot["queue"]["byLane"] = {
    critical: { queued: 0, processing: 0, failed: 0, deadLetter: 0 },
    normal: { queued: 0, processing: 0, failed: 0, deadLetter: 0 },
    heavy: { queued: 0, processing: 0, failed: 0, deadLetter: 0 },
  };
  for (const job of input.jobs) {
    const kind = job.kind ?? "unknown";
    const lane = classifySystemJobLane(kind);
    const bucket = byKind[kind] ?? { queued: 0, processing: 0, failed: 0, deadLetter: 0, lane };
    const laneBucket = byLane[lane];
    if (job.status === "pending") {
      bucket.queued += 1;
      laneBucket.queued += 1;
    }
    if (job.status === "processing") {
      bucket.processing += 1;
      laneBucket.processing += 1;
    }
    if (job.status === "failed") {
      bucket.failed += 1;
      laneBucket.failed += 1;
    }
    if (job.dead_lettered_at) {
      bucket.deadLetter += 1;
      laneBucket.deadLetter += 1;
    }
    byKind[kind] = bucket;
  }
  const queuedJobs = input.jobs.filter((job) => job.status === "pending");
  const processingJobs = input.jobs.filter((job) => job.status === "processing");
  const staleProcessingJobs = processingJobs.filter((job) => {
    if (!job.locked_until) {
      return true;
    }
    const lockedUntil = Date.parse(job.locked_until);
    return Number.isFinite(lockedUntil) && lockedUntil < nowMs;
  }).length;
  const jobsApproachingMaxAttempts = input.jobs.filter((job) => {
    const attempts = Number(job.attempt_count ?? 0);
    const maxAttempts = Number(job.max_attempts ?? 0);
    return maxAttempts > 0 && attempts >= Math.max(1, maxAttempts - 1) && job.status !== "completed";
  }).length;
  const queue = {
    status: statusFromCounts({
      critical: byLane.critical.deadLetter + byLane.critical.failed + staleProcessingJobs,
      watch: byLane.heavy.queued + jobsApproachingMaxAttempts,
    }),
    byKind,
    byLane,
    oldestQueuedAgeMinutes: oldestAge(queuedJobs, "created_at", nowMs),
    oldestProcessingAgeMinutes: oldestAge(processingJobs, "started_at", nowMs),
    jobsApproachingMaxAttempts,
    staleProcessingJobs,
    retryPressure: input.jobs.filter((job) => Number(job.attempt_count ?? 0) > 0 && job.status !== "completed").length,
    workerCaps: JOB_LANE_CONCURRENCY_CAPS,
  };

  const provider7d = input.providerEvents.filter((event) => isWithin(event.created_at, sevenDaysAgo));
  const providerToday = input.providerEvents.filter((event) => isToday(event.created_at, today));
  const providerFailures = provider7d.filter((event) => event.status === "failed");
  const providerCompleted = provider7d.filter((event) => event.status === "consumed" || event.status === "released" || event.status === "failed");
  const providerSuccessRate =
    providerCompleted.length > 0
      ? Math.round((provider7d.filter((event) => event.status === "consumed" || event.status === "released").length / providerCompleted.length) * 100)
      : null;
  const capPressure = input.providerLimits
    .map((row) => {
      const usage = Number(row.usage_count ?? 0);
      const limit = Number(row.limit_count ?? 0);
      return {
        label: `${row.provider ?? "provider"}:${row.operation ?? "operation"}`,
        usage,
        limit,
        ratio: limit > 0 ? usage / limit : 0,
      };
    })
    .filter((row) => row.ratio >= 0.7)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 8);
  const staleProviderReservationCount = provider7d.filter((event) => event.status === "reserved" && Date.parse(event.created_at ?? "") < thirtyMinutesAgo).length;
  const provider = {
    status: statusFromCounts({
      high: staleProviderReservationCount,
      watch: providerFailures.length + capPressure.filter((row) => row.ratio >= 0.8).length,
    }),
    staticToday: providerToday.filter((event) => isProviderStaticOperation(event.operation)).length,
    static7d: provider7d.filter((event) => isProviderStaticOperation(event.operation)).length,
    videoToday: providerToday.filter((event) => isProviderVideoOperation(event.operation)).length,
    video7d: provider7d.filter((event) => isProviderVideoOperation(event.operation)).length,
    successRate7d: providerSuccessRate,
    failed7d: providerFailures.length,
    reservedStale: staleProviderReservationCount,
    consumed7d: provider7d.filter((event) => event.status === "consumed").length,
    released7d: provider7d.filter((event) => event.status === "released").length,
    estimatedCostTodayCents: providerToday.reduce((sum, event) => sum + costCents(event.actual_cost ?? event.estimated_cost), 0),
    capPressure,
    topFailingScopes: topCounts(countBy(providerFailures, (event) => event.organization_id ?? event.campaign_id ?? "unknown"), 5).map(({ label, count }) => ({ scope: label, count })),
    killSwitches: [
      { label: "Marketing Studio worker", enabled: process.env.MARKETING_STUDIO_WORKER_ENABLED === "true", envName: "MARKETING_STUDIO_WORKER_ENABLED" },
      { label: "Image generation", enabled: process.env.ALLOW_HIGGSFIELD_IMAGE_GENERATION === "true", envName: "ALLOW_HIGGSFIELD_IMAGE_GENERATION" },
      { label: "Video generation", enabled: process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION === "true", envName: "ALLOW_HIGGSFIELD_VIDEO_GENERATION" },
    ],
  };

  const billingStatusCounts = countBy(input.billingSubscriptions, (row) => row.status ?? "unknown");
  const checkoutStarted = input.stripeEvents.filter((event) => event.stripe_event_type === "checkout.session.created").length;
  const checkoutCompleted = input.stripeEvents.filter((event) => event.stripe_event_type === "checkout.session.completed").length;
  const trialEndingSoon = input.billingSubscriptions.filter((row) => {
    if (row.status !== "trialing" || !row.current_period_end) {
      return false;
    }
    const end = Date.parse(row.current_period_end);
    return Number.isFinite(end) && end > nowMs && end - nowMs <= 3 * 24 * 60 * 60 * 1000;
  }).length;
  const stripeFailures7d = input.stripeEvents.filter((event) => event.status === "failed").length;
  const webhookLagWarnings = input.stripeEvents.filter((event) => event.status === "processing" && Date.parse(event.updated_at ?? event.created_at ?? "") < thirtyMinutesAgo).length;
  const unknownPriceWarnings = input.stripeEvents.filter((event) => /price/i.test(event.error_code ?? "")).length;
  const billing = {
    status: statusFromCounts({ high: stripeFailures7d + webhookLagWarnings + unknownPriceWarnings, watch: Number(billingStatusCounts.past_due ?? 0) }),
    trialing: billingStatusCounts.trialing ?? 0,
    active: billingStatusCounts.active ?? 0,
    pastDue: (billingStatusCounts.past_due ?? 0) + (billingStatusCounts.unpaid ?? 0) + (billingStatusCounts.incomplete ?? 0),
    canceled: (billingStatusCounts.canceled ?? 0) + (billingStatusCounts.inactive ?? 0),
    trialEndingSoon,
    cancelAtPeriodEnd: input.billingSubscriptions.filter((row) => row.cancel_at_period_end).length,
    checkoutStarted,
    checkoutAbandoned: Math.max(0, checkoutStarted - checkoutCompleted),
    stripeWebhookFailures7d: stripeFailures7d,
    webhookLagWarnings,
    unknownPriceWarnings,
  };

  const notificationsByStatus = countBy(input.leadNotifications, (row) => row.status ?? "unknown");
  const leadSms = {
    status: statusFromCounts({
      high: 0,
      watch: (notificationsByStatus.failed ?? 0) + (notificationsByStatus.undelivered ?? 0) +
        input.jobs.filter((job) => job.kind === "lead_capture_retry" && job.status !== "completed").length,
    }),
    leadsToday: input.leads.filter((lead) => isToday(lead.created_at, today)).length,
    leads7d: input.leads.filter((lead) => isWithin(lead.created_at, sevenDaysAgo)).length,
    leadCaptureRetryJobs: input.jobs.filter((job) => job.kind === "lead_capture_retry" && job.status !== "completed").length,
    notificationsByStatus,
    smsSentOrDelivered: (notificationsByStatus.sent ?? 0) + (notificationsByStatus.delivered ?? 0),
    smsFailed: (notificationsByStatus.failed ?? 0) + (notificationsByStatus.undelivered ?? 0),
    savedLeadNotificationFailures: input.leadNotifications.filter((row) => row.status === "failed" || row.status === "undelivered").length,
    twilioErrorClasses: topCounts(
      countBy(
        input.leadNotifications.filter((row) => row.status === "failed" || row.status === "undelivered"),
        (row) => `${row.provider ?? "twilio"}_${row.status ?? "failed"}`,
      ),
      5,
    ),
    policy: getSmsOutboundPolicyStatus(),
  };

  const activeLaunchLocks = input.metaLocks.filter((lock) => Date.parse(lock.locked_until ?? "") > nowMs).length;
  const staleSyncSnapshots = input.metaSnapshots.filter((snapshot) => Date.parse(snapshot.synced_at ?? "") < twoHoursAgo).length;
  const failedSyncSnapshots = input.metaSnapshots.filter((snapshot) => snapshot.sync_result === "failed" || asArray(snapshot.sync_errors).length > 0).length;
  const activeCampaignsTracked = input.metaSnapshots.filter((snapshot) => /ACTIVE/i.test(snapshot.campaign_status ?? "")).length;
  const spendTodayCents = input.metaSnapshots.length > 0
    ? input.metaSnapshots.reduce((sum, snapshot) => sum + Math.round(Number(asRecord(snapshot.delivery_metrics).spend ?? 0) * 100), 0)
    : null;
  const duplicateObjectWarnings = input.metaSnapshots.filter((snapshot) => {
    const adSetIds = asArray(snapshot.ad_set_statuses).map((item) => String(asRecord(item).id ?? ""));
    const adIds = asArray(snapshot.ad_statuses).map((item) => String(asRecord(item).id ?? ""));
    return new Set(adSetIds).size < adSetIds.length || new Set(adIds).size < adIds.length;
  }).length;
  const meta = {
    status: statusFromCounts({ high: failedSyncSnapshots, watch: staleSyncSnapshots + activeLaunchLocks }),
    activeCampaignsTracked,
    driftWarnings: failedSyncSnapshots,
    staleSyncSnapshots,
    activeLaunchLocks,
    expectedBudgetCapCents: getMetaDailyBudgetCapCents(),
    spendTodayCents,
    destinationWarnings: input.metaSnapshots.filter((snapshot) => /destination|url|domain/i.test(JSON.stringify(snapshot.sync_errors ?? []))).length,
    duplicateObjectWarnings,
    trackingDomainWarnings: 0,
    spendAnomalyNote: spendTodayCents === null ? "Spend data unavailable; dashboard shows drift and stale-sync warnings only." : null,
  };

  const clientErrorsToday = input.clientErrors.filter((error) => isToday(error.last_seen_at, today));
  const clientErrors7d = input.clientErrors.filter((error) => isWithin(error.last_seen_at, sevenDaysAgo));
  const clientErrors = {
    status: statusFromCounts({
      high: clientErrors7d.filter((error) => !error.reviewed_at && isWithin(error.last_seen_at, oneDayAgo) && (error.severity === "critical" || error.severity === "high")).length,
      watch: clientErrors7d.filter((error) => !error.reviewed_at && (error.severity === "critical" || error.severity === "high")).length + (clientErrors7d.length >= 10 ? 1 : 0),
    }),
    today: clientErrorsToday.reduce((sum, row) => sum + Math.max(1, Number(row.occurrence_count ?? 1)), 0),
    sevenDays: clientErrors7d.reduce((sum, row) => sum + Math.max(1, Number(row.occurrence_count ?? 1)), 0),
    topRoutes: topCounts(countBy(clientErrors7d, (row) => row.route_path ?? "/"), 5).map(({ label, count }) => ({ route: label, count })),
    topClasses: topCounts(countBy(clientErrors7d, (row) => row.error_name ?? row.severity ?? "client_error"), 5).map(({ label, count }) => ({ errorClass: label, count })),
    recentUnresolved: clientErrors7d.filter((error) => !error.reviewed_at).length,
    browsers: topCounts(countBy(clientErrors7d, (row) => row.browser ?? "unknown"), 5),
  };

  const supportConfig = getFreshdeskOperationalStatus();
  const support = {
    status: supportConfig.configured ? "GO" as const : "WATCH" as const,
    configured: supportConfig.configured,
    warning: supportConfig.configured ? null : "support ticket creation unavailable until Freshdesk env names are configured",
    categories: supportConfig.categoryCount,
    priorityMapReady: supportConfig.priorityMapReady,
    unresolvedTicketsSummary: supportConfig.configured
      ? "Freshdesk API is configured; unresolved ticket polling is kept out of this no-side-effect pass."
      : "Freshdesk env missing; app falls back to a customer-safe unavailable message.",
  };

  const blockers = [
    queue.status === "DEGRADED" ? "Critical queue/dead-letter/stale-processing issue exists." : null,
    provider.status === "DEGRADED" ? "Provider usage failures or stale reservations require operator review." : null,
    billing.status === "DEGRADED" ? "Billing lifecycle or Stripe webhook failures require operator review." : null,
    leadSms.status === "DEGRADED" ? "Lead notification/SMS failures are visible and need triage." : null,
    meta.status === "DEGRADED" ? "Meta sync/drift warnings require operator review." : null,
    clientErrors.status === "DEGRADED" ? "High-severity client errors are unresolved." : null,
  ].filter((item): item is string => Boolean(item));
  const sectionStatuses = [queue.status, provider.status, billing.status, leadSms.status, meta.status, clientErrors.status, support.status];
  const status: ScaleHealthStatus = blockers.length > 0
    ? "DEGRADED"
    : sectionStatuses.includes("WATCH")
      ? "WATCH"
      : "GO";

  const nextActions = blockers.length > 0
    ? blockers.slice(0, 5)
    : [
        "Run operator:scale-report daily before launch windows.",
        "Keep heavy provider worker concurrency capped and watch stale reservations.",
        "Review client errors and support warnings before raising beyond 300 clients.",
      ];

  return {
    status,
    verdict: status === "DEGRADED" ? "300 clients: NO-GO" : "300 clients: GO with monitoring",
    generatedAt,
    deployId: input.deployId ?? process.env.VERCEL_DEPLOYMENT_ID ?? process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID ?? "local",
    commitSha: input.commitSha ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    warnings,
    blockers,
    nextActions,
    queue,
    provider,
    billing,
    leadSms,
    meta,
    clientErrors,
    support,
  };
}

export async function loadScaleReadinessSnapshot(): Promise<ScaleReadinessSnapshot> {
  const admin = createAdminClient();
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];

  if (!admin) {
    warnings.push("Supabase service role is not configured; showing empty 300-client control-room state.");
    return buildScaleReadinessSnapshot({
      generatedAt,
      jobs: [],
      providerEvents: [],
      providerLimits: [],
      billingSubscriptions: [],
      stripeEvents: [],
      leads: [],
      leadNotifications: [],
      metaSnapshots: [],
      metaLocks: [],
      clientErrors: [],
      warnings,
    });
  }

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const today = generatedAt.slice(0, 10);
  const [
    jobs,
    providerEvents,
    providerLimits,
    billingSubscriptions,
    stripeEvents,
    leads,
    leadNotifications,
    metaSnapshots,
    metaLocks,
    clientErrors,
  ] = await Promise.all([
    safeTable<RawJob>("system_jobs", () => admin.from("system_jobs").select("id,organization_id,campaign_id,kind,status,created_at,started_at,updated_at,locked_until,attempt_count,max_attempts,dead_lettered_at,last_error_code,next_run_at").neq("status", "completed").order("created_at", { ascending: false }).limit(1000), warnings),
    safeTable<RawProviderEvent>("provider_usage_events", () => admin.from("provider_usage_events").select("id,organization_id,campaign_id,provider,operation,status,estimated_cost,actual_cost,created_at,updated_at").gte("created_at", since7d).order("created_at", { ascending: false }).limit(2000), warnings),
    safeTable<RawProviderLimit>("provider_usage_limits", () => admin.from("provider_usage_limits").select("id,provider,operation,usage_count,limit_count,usage_date,updated_at").gte("usage_date", today).order("updated_at", { ascending: false }).limit(1000), warnings),
    safeTable<RawBillingSubscription>("billing_subscriptions", () => admin.from("billing_subscriptions").select("organization_id,plan_tier,status,current_period_end,cancel_at_period_end,created_at,updated_at").order("updated_at", { ascending: false }).limit(5000), warnings),
    safeTable<RawStripeEvent>("stripe_webhook_events", () => admin.from("stripe_webhook_events").select("id,stripe_event_type,status,error_code,created_at,updated_at").gte("created_at", since7d).order("created_at", { ascending: false }).limit(2000), warnings),
    safeTable<RawLead>("leads", () => admin.from("leads").select("id,organization_id,campaign_id,status,created_at").gte("created_at", since7d).order("created_at", { ascending: false }).limit(5000), warnings),
    safeTable<RawLeadNotification>("lead_notifications", () => admin.from("lead_notifications").select("id,tenant_id,lead_id,channel,provider,purpose,status,created_at,updated_at").gte("created_at", since7d).order("created_at", { ascending: false }).limit(5000), warnings),
    safeTable<RawMetaSnapshot>("campaign_sync_snapshots", () => admin.from("campaign_sync_snapshots").select("id,organization_id,launch_mode,sync_result,meta_campaign_id,campaign_status,ad_set_statuses,ad_statuses,delivery_metrics,sync_errors,synced_at").order("synced_at", { ascending: false }).limit(500), warnings),
    safeTable<RawMetaLock>("meta_launch_locks", () => admin.from("meta_launch_locks").select("campaign_id,locked_until,updated_at").order("updated_at", { ascending: false }).limit(500), warnings),
    safeTable<RawClientError>("client_error_events", () => admin.from("client_error_events").select("id,route_path,source,severity,error_name,browser,viewport,occurrence_count,last_seen_at,reviewed_at").gte("last_seen_at", since7d).order("last_seen_at", { ascending: false }).limit(1000), warnings),
  ]);

  return buildScaleReadinessSnapshot({
    generatedAt,
    jobs,
    providerEvents,
    providerLimits,
    billingSubscriptions,
    stripeEvents,
    leads,
    leadNotifications,
    metaSnapshots,
    metaLocks,
    clientErrors,
    warnings,
  });
}
