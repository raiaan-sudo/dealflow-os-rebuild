#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const DEFAULT_BASE_URL = "https://clicktoscale.io";
const DEFAULT_SLUGS = ["hamza-juma", "homelife-hearts-realty-inc"];
const CANONICAL_VERSION = "dealflow-public-v1";
const FORM_ID = "lead-form";
const LOOKBACK_MINUTES = Number(process.env.CANONICAL_FUNNEL_HEALTH_LOOKBACK_MINUTES ?? 15);

const argv = process.argv.slice(2);

function getArg(name) {
  const equalArg = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equalArg) {
    return equalArg.slice(name.length + 1);
  }

  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countMatches(source, pattern) {
  return [...source.matchAll(new RegExp(pattern, "g"))].length;
}

function hasSupabaseEnv() {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function createSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function fetchText(url) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    headers: {
      "user-agent": "DealFlow canonical funnel health check",
    },
    redirect: "follow",
  });

  return {
    url,
    status: response.status,
    ok: response.ok,
    elapsedMs: Date.now() - startedAt,
    html: await response.text(),
  };
}

function inspectHtml({ slug, html, status, elapsedMs }) {
  const checks = [];
  const add = (name, pass, details = null) => checks.push({ name, pass, details });
  const formIdPattern = `id=["']${escapeRegExp(FORM_ID)}["']`;
  const leadFormCount = countMatches(html, formIdPattern);
  const bannedMarkers = [
    /delivered through a tighter property selection process/i,
    /primary cta:/i,
    /visibleSections/i,
    /legacy public funnel/i,
    /cf-turnstile/i,
    /turnstile/i,
  ].filter((pattern) => pattern.test(html)).map((pattern) => String(pattern));

  add("http_200", status === 200, { status, elapsedMs });
  add("canonical_version_present", html.includes(CANONICAL_VERSION));
  add("one_lead_form", leadFormCount === 1, { leadFormCount });
  add("cta_targets_lead_form", html.includes(`href="#${FORM_ID}"`));
  add("no_turnstile", !/cf-turnstile|turnstile/i.test(html));
  add("no_banned_legacy_markers", bannedMarkers.length === 0, { bannedMarkers });
  add("submit_button_present", /<button[^>]+type=["']submit["']/i.test(html) || /type=["']submit["'][^>]*>/.test(html));

  return {
    slug,
    status,
    elapsedMs,
    canonicalVersion: html.includes(CANONICAL_VERSION) ? CANONICAL_VERSION : null,
    leadFormCount,
    failedChecks: checks.filter((check) => !check.pass),
    checks,
  };
}

async function loadPublishedSlugs(supabase, limit) {
  const { data, error } = await supabase
    .from("campaign_plans")
    .select("public_slug")
    .eq("publish_state", "published")
    .not("public_slug", "is", null)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { slugs: [], error: error.message || error.code || "unknown_error" };
  }

  return { slugs: (data ?? []).map((row) => row.public_slug).filter(Boolean), error: null };
}

async function countRows(supabase, table, buildQuery) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  query = buildQuery(query);
  const { count, error } = await query;
  return error ? { error: error.message || error.code || "unknown_error" } : count ?? 0;
}

async function collectDbHealth(supabase, rangeStart) {
  const [
    publishedRows,
    clientFailures,
    capiFailures,
    dbInsertFailures,
    notificationFailures,
    jobFailures,
    submitAttempts,
    capturedLeads,
  ] = await Promise.all([
    supabase
      .from("campaign_plans")
      .select("id, public_slug, publish_state, plan, staged_snapshot, published_snapshot")
      .eq("publish_state", "published")
      .not("public_slug", "is", null)
      .limit(1000),
    countRows(supabase, "client_error_events", (query) =>
      query
        .eq("source", "public_lead_capture")
        .gte("last_seen_at", rangeStart)
        .or("error_name.eq.lead_capture_client_failed,error_name.eq.lead_form_validation_failed"),
    ),
    countRows(supabase, "lead_tracking_events", (query) =>
      query.eq("event_type", "capi_failed").gte("created_at", rangeStart),
    ),
    countRows(supabase, "lead_tracking_events", (query) =>
      query.eq("event_type", "lead_capture_db_insert_failed").gte("created_at", rangeStart),
    ),
    countRows(supabase, "lead_notifications", (query) =>
      query.eq("status", "failed").gte("created_at", rangeStart),
    ),
    countRows(supabase, "system_jobs", (query) =>
      query.eq("status", "failed").gte("created_at", rangeStart),
    ),
    countRows(supabase, "client_error_events", (query) =>
      query
        .eq("source", "public_lead_capture")
        .eq("error_name", "lead_form_submit_attempted")
        .gte("last_seen_at", rangeStart),
    ),
    countRows(supabase, "lead_tracking_events", (query) =>
      query.eq("event_type", "lead_captured").gte("created_at", rangeStart),
    ),
  ]);

  const rows = publishedRows.error ? [] : publishedRows.data ?? [];
  const missingPublicFunnel = rows.filter((row) => {
    const plan = row.plan && typeof row.plan === "object" && !Array.isArray(row.plan) ? row.plan : {};
    const snapshot = row.published_snapshot && typeof row.published_snapshot === "object" && !Array.isArray(row.published_snapshot)
      ? row.published_snapshot
      : {};
    const stagedSnapshot = row.staged_snapshot && typeof row.staged_snapshot === "object" && !Array.isArray(row.staged_snapshot)
      ? row.staged_snapshot
      : {};
    return !plan.publicFunnel && !stagedSnapshot.publicFunnel && !snapshot.publicFunnel;
  });
  const wrongVersion = rows.filter((row) => {
    const plan = row.plan && typeof row.plan === "object" && !Array.isArray(row.plan) ? row.plan : {};
    const snapshot = row.published_snapshot && typeof row.published_snapshot === "object" && !Array.isArray(row.published_snapshot)
      ? row.published_snapshot
      : {};
    const stagedSnapshot = row.staged_snapshot && typeof row.staged_snapshot === "object" && !Array.isArray(row.staged_snapshot)
      ? row.staged_snapshot
      : {};
    const version = snapshot.publicFunnelPresetVersion ?? stagedSnapshot.publicFunnelPresetVersion ?? plan.publicFunnelPresetVersion;
    return version !== CANONICAL_VERSION;
  });

  const alerts = [];
  const addAlert = (name, value, threshold, condition = Number(value) > threshold) => {
    if (condition) {
      alerts.push({ name, value, threshold });
    }
  };

  addAlert("client_failures", clientFailures, 0, typeof clientFailures === "number" && clientFailures > 0);
  addAlert("lead_capture_db_insert_failed", dbInsertFailures, 0, typeof dbInsertFailures === "number" && dbInsertFailures > 0);
  addAlert("capi_failed", capiFailures, 0, typeof capiFailures === "number" && capiFailures > 0);
  addAlert("notification_failed", notificationFailures, 0, typeof notificationFailures === "number" && notificationFailures > 0);
  addAlert("side_effect_job_failed", jobFailures, 0, typeof jobFailures === "number" && jobFailures > 0);
  addAlert("published_missing_public_funnel", missingPublicFunnel.length, 0);
  addAlert("published_wrong_version", wrongVersion.length, 0);
  addAlert(
    "submit_attempts_without_captures",
    { submitAttempts, capturedLeads },
    0,
    typeof submitAttempts === "number" && submitAttempts > 0 && capturedLeads === 0,
  );

  return {
    published: {
      total: rows.length,
      missingPublicFunnel: missingPublicFunnel.length,
      wrongVersion: wrongVersion.length,
      readError: publishedRows.error?.message ?? null,
    },
    recent: {
      rangeStart,
      clientFailures,
      leadCaptureDbInsertFailures: dbInsertFailures,
      capiFailures,
      notificationFailures,
      sideEffectJobFailures: jobFailures,
      submitAttempts,
      capturedLeads,
    },
    alerts,
  };
}

const baseUrl = (getArg("--base-url") ?? process.env.CANONICAL_FUNNEL_HEALTH_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
const explicitSlugs = getArg("--slugs")?.split(",").map((slug) => slug.trim()).filter(Boolean);
const sampleLimit = Number(getArg("--sample-limit") ?? process.env.CANONICAL_FUNNEL_HEALTH_SAMPLE_LIMIT ?? 6);
const rangeStart = new Date(Date.now() - Math.max(LOOKBACK_MINUTES, 1) * 60 * 1000).toISOString();
const supabase = hasSupabaseEnv() ? createSupabase() : null;
const publishedSlugResult = supabase ? await loadPublishedSlugs(supabase, sampleLimit) : { slugs: [], error: "supabase_env_missing" };
const slugs = unique([...(explicitSlugs ?? DEFAULT_SLUGS), ...publishedSlugResult.slugs]).slice(0, Math.max(sampleLimit, DEFAULT_SLUGS.length));

const routeResults = [];
for (const slug of slugs) {
  try {
    const result = await fetchText(`${baseUrl}/f/${encodeURIComponent(slug)}`);
    routeResults.push(inspectHtml({ slug, html: result.html, status: result.status, elapsedMs: result.elapsedMs }));
  } catch (error) {
    routeResults.push({
      slug,
      status: null,
      elapsedMs: null,
      canonicalVersion: null,
      leadFormCount: 0,
      failedChecks: [{ name: "fetch_failed", pass: false, details: { message: error instanceof Error ? error.message : "unknown_error" } }],
      checks: [],
    });
  }
}

const dbHealth = supabase ? await collectDbHealth(supabase, rangeStart) : null;
const routeAlerts = routeResults.flatMap((result) =>
  result.failedChecks.map((check) => ({ slug: result.slug, check: check.name, details: check.details ?? null })),
);
const alerts = [...routeAlerts, ...(dbHealth?.alerts ?? [])];

const report = {
  checkedAt: new Date().toISOString(),
  baseUrl,
  lookbackMinutes: LOOKBACK_MINUTES,
  slugs,
  publishedSlugReadError: publishedSlugResult.error,
  routes: routeResults.map((result) => ({
    slug: result.slug,
    status: result.status,
    elapsedMs: result.elapsedMs,
    canonicalVersion: result.canonicalVersion,
    leadFormCount: result.leadFormCount,
    failedChecks: result.failedChecks,
  })),
  dbHealth,
  alerts,
};

console.log(JSON.stringify(report, null, 2));

if (alerts.length > 0) {
  process.exit(1);
}
