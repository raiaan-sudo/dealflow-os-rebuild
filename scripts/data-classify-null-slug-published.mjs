#!/usr/bin/env node

import {
  asRecord,
  asString,
  countRows,
  createAdminClient,
  getArg,
  outputJson,
  redactId,
  splitIds,
} from "./data-hygiene-utils.mjs";

const argv = process.argv.slice(2);
const ids = splitIds(getArg(argv, "--ids"));
const supabase = createAdminClient();

let query = supabase
  .from("campaign_plans")
  .select("*")
  .eq("publish_state", "published")
  .is("public_slug", null)
  .order("published_at", { ascending: false, nullsFirst: false })
  .order("created_at", { ascending: false })
  .limit(1000);

if (ids.length > 0) {
  query = query.in("id", ids);
}

const { data: rows, error } = await query;
if (error) {
  console.error(`Failed to read null-slug published rows: ${error.message || error.code}`);
  process.exit(1);
}

async function classifyRow(row) {
  const [leadCount, trackingCount, directJobCount, payloadJobRows] = await Promise.all([
    countRows(supabase, "leads", (q) => q.eq("campaign_id", row.id)),
    countRows(supabase, "lead_tracking_events", (q) => q.eq("campaign_id", row.id)),
    countRows(supabase, "system_jobs", (q) => q.eq("campaign_id", row.id)),
    supabase
      .from("system_jobs")
      .select("id, campaign_id, payload")
      .limit(1000),
  ]);

  const payloadJobCount = payloadJobRows.error
    ? { error: payloadJobRows.error.message || payloadJobRows.error.code || "unknown_error" }
    : (payloadJobRows.data ?? []).filter((job) => asRecord(job.payload).campaignId === row.id).length;
  const plan = asRecord(row.plan);
  const snapshot = asRecord(row.published_snapshot);
  const stagedSnapshot = asRecord(row.staged_snapshot);
  const version = asString(snapshot.publicFunnelPresetVersion) ??
    asString(stagedSnapshot.publicFunnelPresetVersion) ??
    asString(plan.publicFunnelPresetVersion);
  const hasPublicFunnel = Boolean(plan.publicFunnel || snapshot.publicFunnel || stagedSnapshot.publicFunnel);
  const campaignName =
    asString(plan.campaignName) ??
    asString(plan.name) ??
    asString(snapshot.campaignName) ??
    asString(snapshot.name);
  const noActivity = [leadCount, trackingCount, directJobCount, payloadJobCount].every((value) => value === 0);
  const classification = noActivity
    ? "published_null_slug_inactive_non_public_candidate"
    : "published_null_slug_has_activity_review_required";

  return {
    id: row.id,
    idRedacted: redactId(row.id),
    organizationIdRedacted: redactId(row.organization_id),
    publishState: row.publish_state,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    campaignName,
    publicFunnelPresetVersion: version,
    hasPublicFunnel,
    planHasFunnel: Boolean(plan.funnel),
    snapshotHasFunnel: Boolean(snapshot.funnel),
    counts: {
      leads: leadCount,
      trackingEvents: trackingCount,
      directJobs: directJobCount,
      payloadJobs: payloadJobCount,
    },
    classification,
    recommendedAction: noActivity
      ? "set_publish_state_draft_with_ops_metadata"
      : "manual_review_no_mutation",
  };
}

const classifiedRows = [];
for (const row of rows ?? []) {
  classifiedRows.push(await classifyRow(row));
}

outputJson({
  checkedAt: new Date().toISOString(),
  mode: "classify_null_slug_published",
  total: classifiedRows.length,
  summary: classifiedRows.reduce((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {}),
  rows: classifiedRows,
});
