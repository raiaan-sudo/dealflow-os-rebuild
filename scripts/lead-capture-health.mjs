#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
function getArg(name) {
  const equalArg = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equalArg) {
    return equalArg.slice(name.length + 1);
  }

  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const campaignId = getArg("--campaign-id");
const slug = getArg("--slug");
const days = Number(getArg("--days") ?? 7);
const rangeStart = new Date(Date.now() - Math.max(days, 1) * 24 * 60 * 60 * 1000).toISOString();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let planQuery = supabase
  .from("campaign_plans")
  .select("id, public_slug, publish_state, lead_loop_verified, plan")
  .order("id", { ascending: true })
  .limit(50);

if (campaignId) {
  planQuery = planQuery.eq("id", campaignId);
}

if (slug) {
  planQuery = planQuery.eq("public_slug", slug);
}

const { data: plans, error: plansError } = await planQuery;

if (plansError) {
  console.error(`Campaign read failed: ${plansError.message}`);
  process.exit(1);
}

const campaignIds = (plans ?? []).map((plan) => plan.id);
const slugs = (plans ?? []).map((plan) => plan.public_slug).filter(Boolean);

async function count(table, column, values, createdAtColumn = null) {
  if (values.length === 0) {
    return 0;
  }

  let query = supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .in(column, values);

  if (createdAtColumn) {
    query = query.gte(createdAtColumn, rangeStart);
  }

  const { count: total, error } = await query;

  if (error) {
    return { error: error.message || error.code || "unknown_error" };
  }

  return total ?? 0;
}

const { data: leadRows, error: leadRowsError } = campaignIds.length > 0
  ? await supabase
      .from("leads")
      .select("id")
      .in("campaign_id", campaignIds)
      .gte("created_at", rangeStart)
      .limit(5000)
  : { data: [], error: null };

const leadIds = leadRowsError ? [] : (leadRows ?? []).map((lead) => lead.id).filter(Boolean);

const [leads, trackingEvents, notifications] = await Promise.all([
  leadRowsError ? Promise.resolve({ error: leadRowsError.message || leadRowsError.code || "unknown_error" }) : Promise.resolve(leadIds.length),
  count("lead_tracking_events", "campaign_id", campaignIds, "created_at"),
  count("lead_notifications", "lead_id", leadIds, "created_at"),
]);

const { data: clientEventsRaw, error: clientEventsError } = await supabase
  .from("client_error_events")
  .select("error_name, message, route_path, source, metadata, occurrence_count, first_seen_at, last_seen_at")
  .eq("source", "public_lead_capture")
  .gte("last_seen_at", rangeStart)
  .order("last_seen_at", { ascending: false })
  .limit(1000);

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function eventMatchesCampaign(row) {
  const metadata = asRecord(row.metadata);
  const metadataCampaignId = typeof metadata.campaignId === "string" ? metadata.campaignId : null;
  const metadataPublicSlug = typeof metadata.publicSlug === "string" ? metadata.publicSlug : null;

  return (
    campaignIds.length === 0 ||
    (metadataCampaignId && campaignIds.includes(metadataCampaignId)) ||
    (metadataPublicSlug && slugs.includes(metadataPublicSlug))
  );
}

const clientEvents = clientEventsError
  ? []
  : (clientEventsRaw ?? []).filter(eventMatchesCampaign);

function clientEventCount(eventType) {
  return clientEvents
    .filter((row) => {
      const metadata = asRecord(row.metadata);
      return metadata.eventType === eventType || row.error_name === eventType || row.message === eventType;
    })
    .reduce((sum, row) => sum + (Number(row.occurrence_count ?? 1) || 1), 0);
}

const clientTelemetry = {
  leadFormViewed: clientEventCount("lead_form_viewed"),
  leadFormStarted: clientEventCount("lead_form_started"),
  submitAttempts: clientEventCount("lead_form_submit_attempted"),
  validationFailures: clientEventCount("lead_form_validation_failed"),
  clientSuccesses: clientEventCount("lead_capture_client_success"),
  clientFailures: clientEventCount("lead_capture_client_failed"),
};

const latestClientFailures = clientEvents
  .filter((row) => {
    const metadata = asRecord(row.metadata);
    return metadata.eventType === "lead_capture_client_failed" || metadata.eventType === "lead_form_validation_failed";
  })
  .slice(0, 10)
  .map((row) => ({
    eventType: asRecord(row.metadata).eventType ?? row.error_name,
    routePath: row.route_path,
    publicSlug: asRecord(row.metadata).publicSlug ?? null,
    campaignId: asRecord(row.metadata).campaignId ?? null,
    deviceType: asRecord(row.metadata).deviceType ?? null,
    lastSeenAt: row.last_seen_at,
    occurrenceCount: row.occurrence_count ?? 1,
  }));

function dropoff(numerator, denominator) {
  if (!denominator || denominator <= 0) {
    return null;
  }

  return Number((numerator / denominator).toFixed(4));
}

console.log(JSON.stringify({
  campaignFilter: campaignId ?? null,
  slugFilter: slug ?? null,
  rangeDays: Math.max(days, 1),
  clientTelemetrySource: "client_error_events source=public_lead_capture",
  campaigns: (plans ?? []).map((plan) => ({
    id: plan.id,
    publicSlug: plan.public_slug,
    publishState: plan.publish_state,
    leadLoopVerified: plan.lead_loop_verified,
    hasCanonicalPublicFunnel: Boolean(
      plan.plan &&
        typeof plan.plan === "object" &&
        !Array.isArray(plan.plan) &&
        plan.plan.publicFunnel,
    ),
  })),
  counts: {
    leads,
    trackingEvents,
    notifications,
    clientTelemetry: clientEventsError ? { error: clientEventsError.message } : clientTelemetry,
  },
  dropoffs: {
    formViewToStart: dropoff(clientTelemetry.leadFormStarted, clientTelemetry.leadFormViewed),
    startToSubmit: dropoff(clientTelemetry.submitAttempts, clientTelemetry.leadFormStarted),
    submitToClientSuccess: dropoff(clientTelemetry.clientSuccesses, clientTelemetry.submitAttempts),
  },
  latestClientFailures,
}, null, 2));
