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

async function fetchRowsPaged(supabase, table, selectColumns, options = {}) {
  const pageSize = options.pageSize ?? 100;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(selectColumns)
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    rows.push(...(data ?? []));

    if (!data || data.length < pageSize) {
      return rows;
    }
  }
}

function launchRuntimeFromPlan(plan) {
  if (!plan || typeof plan !== "object") {
    return {};
  }

  const runtime = plan.runtime && typeof plan.runtime === "object" ? plan.runtime : {};
  const launchRuntime = plan.launchRuntime && typeof plan.launchRuntime === "object" ? plan.launchRuntime : {};
  const metaLaunch = plan.metaLaunch && typeof plan.metaLaunch === "object" ? plan.metaLaunch : {};

  return {
    ...runtime,
    ...launchRuntime,
    ...metaLaunch,
  };
}

function getRuntimeCampaignId(plan) {
  const runtime = launchRuntimeFromPlan(plan);
  return (
    runtime.metaCampaignId ||
    runtime.meta_campaign_id ||
    runtime.campaignId ||
    runtime.campaign_id ||
    null
  );
}

function runtimeLooksLaunched(plan) {
  const runtime = launchRuntimeFromPlan(plan);
  const statusText = [
    runtime.status,
    runtime.launchStatus,
    runtime.launch_status,
    runtime.metaPushStatus,
    runtime.meta_push_status,
    runtime.campaignStatus,
    runtime.campaign_status,
  ].filter(Boolean).join(" ").toLowerCase();

  return /live|launch|published|sent_to_meta|sent to meta|active/.test(statusText) && Boolean(getRuntimeCampaignId(plan));
}

function hasDeliveryMetrics(snapshot) {
  const metrics = snapshot?.delivery_metrics;

  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    return false;
  }

  return ["spend", "impressions", "clicks", "leads", "ctr", "cpl"].some((key) => Object.hasOwn(metrics, key));
}

function snapshotErrors(snapshot) {
  const errors = snapshot?.sync_errors;
  return Array.isArray(errors) ? errors.filter(Boolean) : [];
}

function isFreshSnapshot(snapshot, freshnessCutoffIso) {
  return Boolean(snapshot?.synced_at && snapshot.synced_at >= freshnessCutoffIso);
}

async function countLaunchedMetaOptimizationDebt(supabase, freshnessCutoffIso) {
  try {
    const campaigns = await fetchRowsPaged(supabase, "campaign_plans", "id,organization_id,user_id,plan", { pageSize: 100 });
    const launched = campaigns
      .filter((campaign) => runtimeLooksLaunched(campaign.plan))
      .map((campaign) => ({
        id: campaign.id,
        organizationId: campaign.organization_id,
        userId: campaign.user_id,
        metaCampaignId: getRuntimeCampaignId(campaign.plan),
      }))
      .filter((campaign) => campaign.organizationId && campaign.userId && campaign.metaCampaignId);

    let staleSnapshots = 0;
    let unreadableObjects = 0;
    let missingPerformanceRows = 0;

    for (const campaign of launched) {
      const { data: snapshots, error: snapshotError } = await supabase
        .from("campaign_sync_snapshots")
        .select("id,campaign_status,delivery_metrics,sync_errors,synced_at")
        .eq("organization_id", campaign.organizationId)
        .eq("user_id", campaign.userId)
        .eq("meta_campaign_id", String(campaign.metaCampaignId))
        .order("synced_at", { ascending: false })
        .limit(1);

      if (snapshotError) {
        return { count: null, error: snapshotError.message };
      }

      const latestSnapshot = snapshots?.[0] ?? null;

      if (!latestSnapshot || !isFreshSnapshot(latestSnapshot, freshnessCutoffIso)) {
        staleSnapshots += 1;
      }

      if (snapshotErrors(latestSnapshot).length > 0) {
        unreadableObjects += 1;
      }

      const activeCampaign = String(latestSnapshot?.campaign_status ?? "").toLowerCase() === "active";
      if (activeCampaign && hasDeliveryMetrics(latestSnapshot)) {
        const { count, error } = await supabase
          .from("performance_tracking")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", campaign.organizationId)
          .eq("user_id", campaign.userId)
          .eq("campaign_id", String(campaign.metaCampaignId));

        if (error) {
          return { count: null, error: error.message };
        }

        if ((count ?? 0) === 0) {
          missingPerformanceRows += 1;
        }
      }
    }

    return {
      count: staleSnapshots + unreadableObjects + missingPerformanceRows,
      error: null,
      staleSnapshots,
      unreadableObjects,
      missingPerformanceRows,
      launchedCampaigns: launched.length,
    };
  } catch (error) {
    return { count: null, error: error instanceof Error ? error.message : String(error) };
  }
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
    launchedMetaOptimizationDebt,
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
    countLaunchedMetaOptimizationDebt(supabase, thirtyMinutesAgo),
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
    launchedMetaOptimizationDebt.count ? `${launchedMetaOptimizationDebt.count} launched campaign Meta optimization readiness issue(s)` : null,
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
      launchedMetaOptimizationDebt,
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
