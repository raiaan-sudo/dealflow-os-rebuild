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
const MARKETING_STUDIO_WORKER_DEFERRED_UNTIL_MS = Date.parse("2099-01-01T00:00:00.000Z");

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

function safeId(value) {
  if (!value) return "none";
  return String(value).length <= 12 ? String(value) : `${String(value).slice(0, 8)}...${String(value).slice(-4)}`;
}

function ageBucket(value, nowMs) {
  const parsed = Date.parse(value ?? "");
  if (!Number.isFinite(parsed)) return "unknown";
  const ageMs = nowMs - parsed;
  if (ageMs <= 24 * 60 * 60 * 1000) return "last24h";
  if (ageMs <= 7 * 24 * 60 * 60 * 1000) return "last7d";
  return "olderThan7d";
}

function isDeferredCreativeRenderJob(row) {
  if (row.status !== "pending") return false;
  if (row.kind !== "static_creative_generation" && row.kind !== "video_generation") return false;
  const nextRunAt = Date.parse(row.next_run_at ?? "");
  return Number.isFinite(nextRunAt) && nextRunAt >= MARKETING_STUDIO_WORKER_DEFERRED_UNTIL_MS;
}

function timestampFor(row) {
  return row.updated_at ?? row.failed_at ?? row.dead_lettered_at ?? row.synced_at ?? row.created_at ?? null;
}

function classificationEntry(subsystem, rows, { nowMs, reason, recommendedAction, timestamp = timestampFor }) {
  const timestamps = rows.map(timestamp).filter(Boolean).sort();
  const ageBuckets = { last24h: 0, last7d: 0, olderThan7d: 0, unknown: 0 };
  for (const row of rows) {
    ageBuckets[ageBucket(timestamp(row), nowMs)] += 1;
  }
  return {
    count: rows.length,
    subsystem,
    oldestTimestamp: timestamps[0] ?? null,
    newestTimestamp: timestamps[timestamps.length - 1] ?? null,
    affectedIds: rows.slice(0, 12).map((row) => safeId(row.id)),
    ageBuckets,
    reason,
    recommendedAction,
  };
}

function latestMetaSnapshotsByKey(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = [row.organization_id ?? "org", row.user_id ?? "user", row.meta_campaign_id ?? row.id].join(":");
    const current = byKey.get(key);
    const rowTime = Date.parse(row.synced_at ?? "");
    const currentTime = Date.parse(current?.synced_at ?? "");
    if (!current || (Number.isFinite(rowTime) && (!Number.isFinite(currentTime) || rowTime > currentTime))) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

function isSyntheticMetaSnapshot(row) {
  const metaCampaignId = row.meta_campaign_id ?? "";
  return /^qa-/i.test(metaCampaignId) || /autopilot-proof/i.test(metaCampaignId);
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
    leadBillingEvents,
    leads,
    notifications,
    metaSnapshots,
    metaLocks,
    clientErrors,
  ] = await Promise.all([
    readRows(supabase, "system_jobs", supabase.from("system_jobs").select("id,organization_id,campaign_id,kind,status,created_at,started_at,locked_until,next_run_at,attempt_count,max_attempts,dead_lettered_at,last_error_code,reviewed_at,resolution_note").neq("status", "completed").order("created_at", { ascending: false }).limit(1000), warnings),
    readRows(supabase, "provider_usage_events", supabase.from("provider_usage_events").select("id,organization_id,campaign_id,provider,operation,status,estimated_cost,actual_cost,operator_reviewed_at:metadata->>operatorReviewedAt,created_at").gte("created_at", sevenDaysAgoIso).order("created_at", { ascending: false }).limit(2000), warnings),
    readRows(supabase, "provider_usage_limits", supabase.from("provider_usage_limits").select("provider,operation,usage_count,limit_count,usage_date,updated_at").gte("usage_date", today).order("updated_at", { ascending: false }).limit(1000), warnings),
    readRows(supabase, "billing_subscriptions", supabase.from("billing_subscriptions").select("organization_id,plan_tier,status,current_period_end,cancel_at_period_end,created_at,updated_at").limit(5000), warnings),
    readRows(supabase, "stripe_webhook_events", supabase.from("stripe_webhook_events").select("id,stripe_event_type,status,error_code,created_at,updated_at").gte("created_at", sevenDaysAgoIso).order("created_at", { ascending: false }).limit(2000), warnings),
    readRows(supabase, "lead_billing_events", supabase.from("lead_billing_events").select("id,organization_id,campaign_id,status,skip_reason,amount_cents,created_at,reported_at,charged_at").gte("created_at", sevenDaysAgoIso).order("created_at", { ascending: false }).limit(5000), warnings),
    readRows(supabase, "leads", supabase.from("leads").select("id,status,created_at").gte("created_at", sevenDaysAgoIso).order("created_at", { ascending: false }).limit(5000), warnings),
    readRows(supabase, "lead_notifications", supabase.from("lead_notifications").select("id,status,created_at,updated_at,delivered_at,failed_at").gte("created_at", sevenDaysAgoIso).order("created_at", { ascending: false }).limit(5000), warnings),
    readRows(supabase, "campaign_sync_snapshots", supabase.from("campaign_sync_snapshots").select("id,organization_id,user_id,meta_campaign_id,sync_result,campaign_status,delivery_metrics,sync_errors,synced_at").order("synced_at", { ascending: false }).limit(500), warnings),
    readRows(supabase, "meta_launch_locks", supabase.from("meta_launch_locks").select("campaign_id,locked_until,updated_at").order("updated_at", { ascending: false }).limit(500), warnings),
    readRows(supabase, "client_error_events", supabase.from("client_error_events").select("id,route_path,severity,error_name,browser,occurrence_count,last_seen_at,reviewed_at").gte("last_seen_at", sevenDaysAgoIso).order("last_seen_at", { ascending: false }).limit(1000), warnings),
  ]);

  const byLane = {
    critical: { queued: 0, processing: 0, failed: 0, deadLetter: 0 },
    normal: { queued: 0, processing: 0, failed: 0, deadLetter: 0 },
    heavy: { queued: 0, processing: 0, failed: 0, deadLetter: 0 },
  };
  const failedOrDeadLetterJobs = jobs.filter((job) => job.status === "failed" || job.dead_lettered_at);
  const reviewedFailedOrDeadLetterJobs = failedOrDeadLetterJobs.filter((job) => job.reviewed_at);
  const activeFailedOrDeadLetterJobs = failedOrDeadLetterJobs.filter((job) => !job.reviewed_at);
  const activeCriticalFailedJobs = activeFailedOrDeadLetterJobs.filter((job) => laneFor(job.kind) === "critical");
  const activeNonCriticalFailedJobs = activeFailedOrDeadLetterJobs.filter((job) => laneFor(job.kind) !== "critical");
  const activeJobs = jobs.filter((job) => !job.reviewed_at);

  for (const job of activeJobs) {
    const lane = laneFor(job.kind);
    if (job.status === "pending") byLane[lane].queued += 1;
    if (job.status === "processing") byLane[lane].processing += 1;
    if (job.status === "failed") byLane[lane].failed += 1;
    if (job.dead_lettered_at) byLane[lane].deadLetter += 1;
  }
  const staleProcessingRows = activeJobs.filter((job) => job.status === "processing" && (!job.locked_until || Date.parse(job.locked_until) < Date.now()));
  const staleProcessingJobs = staleProcessingRows.length;
  const deferredCreativeRows = activeJobs.filter(isDeferredCreativeRenderJob);
  const staleDeferredCreativeRows = deferredCreativeRows.filter((job) => {
    const createdAt = Date.parse(job.created_at ?? "");
    return Number.isFinite(createdAt) && Date.now() - createdAt > 15 * 60 * 1000;
  });
  const jobsApproachingMaxAttempts = activeJobs.filter((job) => Number(job.max_attempts ?? 0) > 0 && Number(job.attempt_count ?? 0) >= Math.max(1, Number(job.max_attempts) - 1)).length;
  const providerFailures = providerEvents.filter((event) => event.status === "failed");
  const activeProviderFailures = providerFailures.filter((event) => !event.operator_reviewed_at);
  const currentProviderFailures = activeProviderFailures.filter((event) => isWithin(event.created_at, oneDayAgoMs));
  const historicalProviderFailures = providerFailures.filter((event) => event.operator_reviewed_at || !isWithin(event.created_at, oneDayAgoMs));
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
  const performanceSubscriptions = billingSubscriptions.filter((row) => row.plan_tier === "performance");
  const performanceLeadBillingByStatus = countBy(leadBillingEvents, (row) => row.status ?? "unknown");
  const performanceSkippedByReason = countBy(
    leadBillingEvents.filter((row) => row.status === "skipped"),
    (row) => row.skip_reason ?? "unknown",
  );
  const performanceFailedEvents = leadBillingEvents.filter((row) => row.status === "failed").length;
  const performancePendingEvents = leadBillingEvents.filter((row) => row.status === "pending" || row.status === "charging").length;
  const performanceBillableLeadEvents = leadBillingEvents.filter((row) => ["pending", "charging", "charged", "reported", "failed"].includes(row.status ?? ""));
  const performanceUsageRevenueCents = performanceBillableLeadEvents.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);
  const notificationsByStatus = countBy(notifications, (row) => row.status ?? "unknown");
  const failedLeadNotificationRows = notifications.filter((row) => row.status === "failed" || row.status === "undelivered");
  const recentFailedLeadNotificationRows = failedLeadNotificationRows.filter((row) => isWithin(row.updated_at ?? row.failed_at ?? row.created_at, oneDayAgoMs));
  const historicalLeadNotificationRows = failedLeadNotificationRows.filter((row) => !isWithin(row.updated_at ?? row.failed_at ?? row.created_at, oneDayAgoMs));
  const productionMetaSnapshots = metaSnapshots.filter((row) => !isSyntheticMetaSnapshot(row));
  const latestMetaSnapshots = latestMetaSnapshotsByKey(productionMetaSnapshots);
  const metaFailures = latestMetaSnapshots.filter((row) => row.sync_result === "failed" || (Array.isArray(row.sync_errors) && row.sync_errors.length > 0)).length;
  const staleLatestMetaSnapshots = latestMetaSnapshots.filter((row) => row.synced_at && Date.now() - Date.parse(row.synced_at) > 2 * 60 * 60 * 1000);
  const staleMetaSnapshots = staleLatestMetaSnapshots.length;
  const historicalStaleMetaSnapshots = productionMetaSnapshots.filter((row) => row.synced_at && Date.now() - Date.parse(row.synced_at) > 2 * 60 * 60 * 1000 && !staleLatestMetaSnapshots.some((latest) => latest.id === row.id));
  const activeLocks = metaLocks.filter((lock) => lock.locked_until && Date.parse(lock.locked_until) > Date.now()).length;
  const unresolvedClientErrors = clientErrors.filter((row) => !row.reviewed_at);
  const clientErrorOccurrences = clientErrors.reduce((sum, row) => sum + Math.max(1, Number(row.occurrence_count ?? 1)), 0);
  const unresolvedClientErrorOccurrences = unresolvedClientErrors.reduce((sum, row) => sum + Math.max(1, Number(row.occurrence_count ?? 1)), 0);
  const highClientErrors = unresolvedClientErrors.filter((row) => isWithin(row.last_seen_at, oneDayAgoMs) && (row.severity === "critical" || row.severity === "high")).length;
  const highClientErrors7d = unresolvedClientErrors.filter((row) => row.severity === "critical" || row.severity === "high").length;
  const supportConfigured = Boolean(process.env.FRESHDESK_DOMAIN?.trim() && process.env.FRESHDESK_API_KEY?.trim());

  const queueStatus = statusFrom({ high: activeCriticalFailedJobs.length + staleProcessingJobs, watch: activeNonCriticalFailedJobs.length + byLane.heavy.queued + jobsApproachingMaxAttempts });
  const providerStatus = statusFrom({ high: staleProviderReservations, watch: currentProviderFailures.length + capPressure.filter((limit) => limit.usage / limit.limit >= 0.8).length });
  const billingStatus = statusFrom({ high: stripeFailures + performanceFailedEvents, watch: Number(billingCounts.past_due ?? 0) + performancePendingEvents });
  const leadCaptureRetryJobs = activeJobs.filter((job) => job.kind === "lead_capture_retry" && job.status !== "completed");
  const leadStatus = statusFrom({ high: 0, watch: recentFailedLeadNotificationRows.length + leadCaptureRetryJobs.length });
  const metaStatus = statusFrom({ high: metaFailures, watch: staleMetaSnapshots + activeLocks });
  const clientErrorStatus = statusFrom({ high: highClientErrors, watch: highClientErrors7d + (unresolvedClientErrorOccurrences >= 10 ? 1 : 0) });
  const status = [queueStatus, providerStatus, billingStatus, leadStatus, metaStatus, clientErrorStatus].includes("DEGRADED")
    ? "DEGRADED"
    : [queueStatus, providerStatus, billingStatus, leadStatus, metaStatus, clientErrorStatus].includes("WATCH")
      ? "WATCH"
      : "GO";
  const verdict = status === "DEGRADED" ? "300 clients: NO-GO" : "300 clients: GO with automated monitoring";
  const issueClassification = {
    activeBlockers: [],
    currentWatch: [],
    historicalReviewed: [],
    cleared: [],
    summary: {
      metaSnapshots: staleLatestMetaSnapshots.length > 0
        ? `Meta snapshots: ACTIVE BLOCKER/WATCH - ${staleLatestMetaSnapshots.length} latest snapshot(s) stale`
        : historicalStaleMetaSnapshots.length > 0
          ? `Meta snapshots: historical reviewed artifacts only (${historicalStaleMetaSnapshots.length} superseded stale snapshot(s))`
          : "Meta snapshots: CLEARED",
      leadNotifications: recentFailedLeadNotificationRows.length > 0
        ? `Lead notifications: ACTIVE WATCH - ${recentFailedLeadNotificationRows.length} failed/undelivered notification(s) in last 24h`
        : historicalLeadNotificationRows.length > 0
          ? `Lead notifications: 0 active failures, ${historicalLeadNotificationRows.length} historical reviewed failure(s)`
          : "Lead notifications: CLEARED",
      deadLetters: activeCriticalFailedJobs.length > 0
        ? `Dead letters: ACTIVE BLOCKER - ${activeCriticalFailedJobs.length} critical failed/dead-letter job(s)`
        : activeNonCriticalFailedJobs.length > 0
          ? `Dead letters: CURRENT WATCH - ${activeNonCriticalFailedJobs.length} non-critical unreviewed failed/dead-letter job(s)`
          : reviewedFailedOrDeadLetterJobs.length > 0
            ? `Dead letters: 0 active failures, ${reviewedFailedOrDeadLetterJobs.length} historical reviewed job(s)`
            : "Dead letters: CLEARED",
    },
  };

  if (activeCriticalFailedJobs.length > 0) {
    issueClassification.activeBlockers.push(classificationEntry("failed/dead-letter jobs", activeCriticalFailedJobs, {
      nowMs: Date.now(),
      reason: "Current critical lane failed/dead-letter jobs are unreviewed.",
      recommendedAction: "Review and resolve the critical job without triggering SMS, Stripe, Meta, provider, or lead side effects.",
    }));
  } else {
    issueClassification.cleared.push(classificationEntry("critical failed/dead-letter jobs", [], {
      nowMs: Date.now(),
      reason: "No unreviewed critical failed or dead-letter jobs are present.",
      recommendedAction: "Continue daily operator:debt and operator:scale-report checks.",
    }));
  }

  if (activeNonCriticalFailedJobs.length > 0) {
    issueClassification.currentWatch.push(classificationEntry("non-critical failed/dead-letter jobs", activeNonCriticalFailedJobs, {
      nowMs: Date.now(),
      reason: "Non-critical failed/dead-letter jobs remain unreviewed.",
      recommendedAction: "Classify as retryable or reviewed before increasing scale; do not retry provider jobs without explicit approval.",
    }));
  }

  if (reviewedFailedOrDeadLetterJobs.length > 0) {
    issueClassification.historicalReviewed.push(classificationEntry("reviewed failed/dead-letter jobs", reviewedFailedOrDeadLetterJobs, {
      nowMs: Date.now(),
      reason: "Rows have reviewed_at set and operator:debt excludes them from active failed/dead-letter debt.",
      recommendedAction: "Keep as evidence; do not delete historical job rows.",
    }));
  }

  if (staleDeferredCreativeRows.length > 0) {
    issueClassification.currentWatch.push(classificationEntry("stale deferred creative render jobs", staleDeferredCreativeRows, {
      nowMs: Date.now(),
      reason: "Creative render jobs are deferred to the Marketing Studio worker and stale without a worker claim.",
      recommendedAction: "Verify MARKETING_STUDIO_WORKER_ENABLED, HIGGSFIELD_MARKETING_STUDIO_MODE, HIGGSFIELD_CLI_ENABLED, HIGGSFIELD_CLI_PATH, ALLOW_HIGGSFIELD_IMAGE_GENERATION, ALLOW_HIGGSFIELD_VIDEO_GENERATION, FINISHED_AD_VISION_QA_ENABLED, and AI_API_KEY or OPENAI_API_KEY before a scoped requeue.",
    }));
  } else if (deferredCreativeRows.length > 0) {
    issueClassification.currentWatch.push(classificationEntry("deferred creative render jobs", deferredCreativeRows, {
      nowMs: Date.now(),
      reason: "Creative render jobs are waiting for the dedicated Marketing Studio worker.",
      recommendedAction: "Keep the worker running or leave customer previews in concept/composed mode until it is ready.",
    }));
  }

  if (metaFailures > 0) {
    issueClassification.activeBlockers.push(classificationEntry("Meta latest sync failures", latestMetaSnapshots.filter((row) => row.sync_result === "failed" || (Array.isArray(row.sync_errors) && row.sync_errors.length > 0)), {
      nowMs: Date.now(),
      timestamp: (row) => row.synced_at,
      reason: "The latest app-owned Meta snapshot has sync errors.",
      recommendedAction: "Run read-only Meta proof; only insert an app-owned reconciliation snapshot if proof is clean.",
    }));
  }

  if (staleLatestMetaSnapshots.length > 0) {
    issueClassification.currentWatch.push(classificationEntry("Meta latest stale snapshots", staleLatestMetaSnapshots, {
      nowMs: Date.now(),
      timestamp: (row) => row.synced_at,
      reason: "The latest app-owned snapshot for at least one tracked Meta campaign is older than the freshness threshold.",
      recommendedAction: "Run read-only Meta proof and insert a fresh app-owned sync snapshot if proof is clean.",
    }));
  } else {
    issueClassification.cleared.push(classificationEntry("Meta latest snapshots", latestMetaSnapshots, {
      nowMs: Date.now(),
      timestamp: (row) => row.synced_at,
      reason: "Latest app-owned Meta snapshot per tracked campaign is fresh and has no sync errors.",
      recommendedAction: "Refresh via read-only/app-owned sync before the next launch window if it ages past the threshold.",
    }));
  }

  if (historicalStaleMetaSnapshots.length > 0) {
    issueClassification.historicalReviewed.push(classificationEntry("Meta historical stale snapshots", historicalStaleMetaSnapshots, {
      nowMs: Date.now(),
      timestamp: (row) => row.synced_at,
      reason: "Older stale snapshots are superseded by a newer fresh successful snapshot and are retained as audit artifacts.",
      recommendedAction: "Do not delete evidence rows; judge Meta freshness from the latest snapshot per campaign.",
    }));
  }

  if (recentFailedLeadNotificationRows.length > 0) {
    issueClassification.currentWatch.push(classificationEntry("lead notification failures", recentFailedLeadNotificationRows, {
      nowMs: Date.now(),
      reason: "Failed or undelivered lead notifications exist in the last 24 hours.",
      recommendedAction: "Confirm lead save and assignment state; do not retry SMS without explicit owner approval.",
    }));
  } else {
    issueClassification.cleared.push(classificationEntry("current lead notification failures", [], {
      nowMs: Date.now(),
      reason: "No failed or undelivered lead notifications occurred in the last 24 hours.",
      recommendedAction: "Continue daily drift checks and do not send SMS without explicit approval.",
    }));
  }

  if (historicalLeadNotificationRows.length > 0) {
    issueClassification.historicalReviewed.push(classificationEntry("lead notification historical failures", historicalLeadNotificationRows, {
      nowMs: Date.now(),
      reason: "Older failed notification rows have no status drift and are outside the current 24-hour operational window.",
      recommendedAction: "Keep evidence rows; do not retry SMS without explicit owner approval.",
    }));
  }

  if (historicalProviderFailures.length > 0) {
    issueClassification.historicalReviewed.push(classificationEntry("historical provider failures", historicalProviderFailures, {
      nowMs: Date.now(),
      reason: "Failed provider events are outside the current 24-hour operational window, and operator:debt reports no active provider debt.",
      recommendedAction: "Keep as evidence; do not retry provider work without explicit approval.",
    }));
  }

  return {
    generatedAt,
    deployId: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID ?? "local",
    verdict,
    status,
    warnings,
    issueClassification,
    queue: { status: queueStatus, byLane, staleProcessingJobs, deferredCreativeJobs: deferredCreativeRows.length, staleDeferredCreativeJobs: staleDeferredCreativeRows.length, jobsApproachingMaxAttempts, caps: JOB_LANE_CONCURRENCY_CAPS },
    provider: { status: providerStatus, events7d: providerEvents.length, failures7d: currentProviderFailures.length, staleReservations: staleProviderReservations, costToday: providerCostToday, capPressure },
    billing: {
      status: billingStatus,
      trialing: billingCounts.trialing ?? 0,
      active: billingCounts.active ?? 0,
      pastDue: billingCounts.past_due ?? 0,
      canceled: (billingCounts.canceled ?? 0) + (billingCounts.inactive ?? 0),
      stripeFailures,
      performanceSubscriptions: performanceSubscriptions.length,
      performanceLeadBillingByStatus,
      performanceSkippedByReason,
      performancePendingEvents,
      performanceFailedEvents,
      performanceUsageRevenueCents,
    },
    leads: { status: leadStatus, leads7d: leads.filter((lead) => isWithin(lead.created_at, sevenDaysAgoMs)).length, notificationsByStatus, failedLeadNotifications: failedLeadNotificationRows.length },
    meta: { status: metaStatus, snapshots: metaSnapshots.length, metaFailures, staleMetaSnapshots, activeLocks },
    support: { status: "GO", configured: supportConfigured, warning: supportConfigured ? null : "Freshdesk env missing; support route uses customer-safe fallback." },
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
  console.log(`- Deferred creative render jobs: ${report.queue.deferredCreativeJobs}`);
  console.log(`- Stale deferred creative render jobs: ${report.queue.staleDeferredCreativeJobs}`);
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
  console.log(`- Performance subscriptions: ${report.billing.performanceSubscriptions}`);
  console.log(`- Performance lead billing statuses: ${JSON.stringify(report.billing.performanceLeadBillingByStatus)}`);
  console.log(`- Performance skipped lead reasons: ${JSON.stringify(report.billing.performanceSkippedByReason)}`);
  console.log(`- Performance pending/failed usage events: ${report.billing.performancePendingEvents}/${report.billing.performanceFailedEvents}`);
  console.log(`- Estimated Performance usage revenue 7d: ${money(report.billing.performanceUsageRevenueCents)}`);
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
  console.log(`## WATCH Classification`);
  console.log(`- ${report.issueClassification.summary.metaSnapshots}`);
  console.log(`- ${report.issueClassification.summary.leadNotifications}`);
  console.log(`- ${report.issueClassification.summary.deadLetters}`);
  console.log(`- Active blockers: ${report.issueClassification.activeBlockers.length}`);
  console.log(`- Current watch: ${report.issueClassification.currentWatch.length}`);
  console.log(`- Historical reviewed: ${report.issueClassification.historicalReviewed.length}`);
  console.log(`- Cleared: ${report.issueClassification.cleared.length}`);
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
