#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const APP_URL = (
  process.env.OPS_SUMMARY_APP_URL?.trim() ||
  process.env.SCALE_MONITOR_PRODUCT_ALIAS_URLS?.split(",")[0]?.trim() ||
  "https://app.agentdealflow.io"
).replace(/\/$/, "");
const FUNNEL_SLUG = "raiaan-broker-toronto-on-ccbfbfce";
const GATE_NAMES = [
  "QA_AUTH_HARNESS_ENABLED",
  "QA_AUTH_HARNESS_PRODUCTION_ENABLED",
  "QA_AUTH_HARNESS_RUNTIME_UNLOCK",
  "STRIPE_TEST_HARNESS_ENABLED",
  "LEAD_CAPTURE_PROOF_HARNESS_ENABLED",
  "LEAD_SIDE_EFFECTS_CRM_PROOF_ENABLED",
  "PARTNER_CRM_SYNC_DRY_PROOF_ENABLED",
  "PARTNER_CRM_SYNC_LIVE_CONTACT_PROOF_ENABLED",
  "PUBLIC_QA_FUNNEL_TO_GHL_PROOF_ENABLED",
  "QA_GHL_JOB_PROOF_ENABLED",
  "GHL_CONTACT_WRITES_ENABLED",
  "GHL_OPPORTUNITY_WRITES_ENABLED",
  "GHL_AUTO_PROVISIONING_ENABLED",
  "GHL_PROVISIONING_WRITES_ENABLED",
  "GHL_WORKFLOW_ENROLLMENT_ENABLED",
  "ALLOW_META_LIVE_LAUNCH",
  "ALLOW_OPENAI_IMAGE_GENERATION",
  "ALLOW_HIGGSFIELD_IMAGE_GENERATION",
  "ALLOW_HIGGSFIELD_VIDEO_GENERATION",
  "ALLOW_HEYGEN_VIDEO_GENERATION",
  "PROVIDER_STATIC_GENERATION_PROOF_ENABLED",
  "BILLING_CHECKOUT_SAFE_MODE",
  "INTERNAL_LEAD_SMS_ENABLED",
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function boolState(name) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return "absent";
  }
  return raw.toLowerCase() === "true" ? "true" : "present_not_true";
}

async function countRows(supabase, table, queryBuilder) {
  const { count, error } = await queryBuilder(supabase.from(table).select("*", { count: "exact", head: true }));
  if (error) {
    return { count: null, error: error.message };
  }
  return { count: count ?? 0, error: null };
}

async function countUnreviewedProviderFailures(supabase, sinceIso) {
  const { data, error } = await supabase
    .from("provider_usage_events")
    .select("id,metadata")
    .eq("status", "failed")
    .gte("created_at", sinceIso)
    .limit(2000);

  if (error) {
    return { count: null, error: error.message };
  }

  return {
    count: (data ?? []).filter((row) => !row.metadata?.operatorReviewedAt).length,
    error: null,
  };
}

async function countUnreviewedCrmSyncEvents(supabase, status, sinceIso) {
  const { data, error } = await supabase
    .from("lead_crm_sync_events")
    .select("id,metadata")
    .eq("status", status)
    .gte("created_at", sinceIso)
    .limit(2000);

  if (error) {
    return { count: null, error: error.message };
  }

  return {
    count: (data ?? []).filter((row) => !row.metadata?.operatorReviewedAt).length,
    error: null,
  };
}

async function fetchStatus(url, expected) {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      headers: { "user-agent": "dealflow-ops-summary/1.0" },
    });
    const body = await response.text().catch(() => "");
    return {
      url,
      status: response.status,
      ok: expected(response, body),
      deployId: body.match(/data-dpl-id="([^"]+)"/)?.[1] ?? null,
    };
  } catch (error) {
    return {
      url,
      status: null,
      ok: false,
      error: error instanceof Error ? error.message : "fetch_failed",
      deployId: null,
    };
  }
}

async function main() {
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const [
    failedJobs,
    deadLetters,
    failedStripe,
    failedProvider,
    staleProviderReservations,
    failedGhlEvents,
    deadLetterGhlEvents,
    failedLeadNotifications,
    activeMetaLocks,
    clientErrors,
  ] = await Promise.all([
    countRows(supabase, "system_jobs", (query) => query.eq("status", "failed").is("reviewed_at", null)),
    countRows(supabase, "system_jobs", (query) => query.not("dead_lettered_at", "is", null).is("reviewed_at", null)),
    countRows(supabase, "stripe_webhook_events", (query) => query.eq("status", "failed").is("reviewed_at", null)),
    countUnreviewedProviderFailures(supabase, sevenDaysAgo),
    countRows(supabase, "provider_usage_events", (query) => query.eq("status", "reserved").lt("created_at", thirtyMinutesAgo)),
    countUnreviewedCrmSyncEvents(supabase, "failed", sevenDaysAgo),
    countUnreviewedCrmSyncEvents(supabase, "dead_letter", sevenDaysAgo),
    countRows(supabase, "lead_notifications", (query) => query.not("failed_at", "is", null).neq("status", "failed")),
    countRows(supabase, "meta_launch_locks", (query) => query.gte("locked_until", new Date().toISOString())),
    countRows(supabase, "client_error_events", (query) => query.gte("last_seen_at", sevenDaysAgo).is("reviewed_at", null)),
  ]);

  const [app, dashboard, funnel, systemJobs] = await Promise.all([
    fetchStatus(`${APP_URL}/`, (response) => response.status === 200),
    fetchStatus(`${APP_URL}/dashboard`, (response) => [302, 303, 307, 308].includes(response.status)),
    fetchStatus(`${APP_URL}/f/${FUNNEL_SLUG}`, (response) => response.status === 200),
    fetchStatus(`${APP_URL}/api/internal/system-jobs`, (response) => response.status === 401),
  ]);

  const gates = Object.fromEntries(GATE_NAMES.map((name) => [name, boolState(name)]));
  const blockers = [
    failedJobs.count ? `${failedJobs.count} unreviewed failed system job(s)` : null,
    deadLetters.count ? `${deadLetters.count} unreviewed dead-letter system job(s)` : null,
    failedStripe.count ? `${failedStripe.count} unreviewed failed Stripe webhook event(s)` : null,
    failedProvider.count ? `${failedProvider.count} failed provider event(s) in 7d` : null,
    staleProviderReservations.count ? `${staleProviderReservations.count} stale provider reservation(s)` : null,
    failedGhlEvents.count ? `${failedGhlEvents.count} failed CRM sync event(s) in 7d` : null,
    deadLetterGhlEvents.count ? `${deadLetterGhlEvents.count} dead-letter CRM sync event(s) in 7d` : null,
    failedLeadNotifications.count ? `${failedLeadNotifications.count} lead notification status drift row(s)` : null,
    clientErrors.count ? `${clientErrors.count} unresolved client error event(s) in 7d` : null,
    [app, dashboard, funnel, systemJobs].some((check) => !check.ok) ? "safe production smoke check failed" : null,
  ].filter(Boolean);

  const nextAction = blockers.length > 0
    ? "Open /admin/control-room and resolve or acknowledge the highest-severity debt with an audit note."
    : "Run authenticated operator QA and keep live mutation gates closed unless a specific proof is approved.";

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    appUrl: APP_URL,
    deployId: app.deployId,
    verdict: blockers.length === 0 ? "OPS_READY" : "OPS_REVIEW_REQUIRED",
    blockers,
    counts: {
      failedJobs,
      deadLetters,
      failedStripe,
      failedProvider,
      staleProviderReservations,
      failedGhlEvents,
      deadLetterGhlEvents,
      failedLeadNotifications,
      activeMetaLocks,
      clientErrors,
    },
    gates,
    smoke: {
      app,
      dashboard,
      funnel,
      systemJobs,
    },
    nextAction,
    sideEffects: {
      sendsSlack: false,
      sendsEmail: false,
      mutatesGhl: false,
      mutatesMeta: false,
      createsStripeCharge: false,
      runsProviderGeneration: false,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
