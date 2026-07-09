#!/usr/bin/env node

import {
  asRecord,
  countRows,
  createAdminClient,
  getArg,
  mergeOpsMetadata,
  outputJson,
  redactId,
  splitIds,
} from "./data-hygiene-utils.mjs";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const ids = splitIds(getArg(argv, "--ids"));

if (ids.length === 0) {
  console.error("Refusing to run without targeted --ids <comma-separated-campaign-ids>.");
  process.exit(1);
}

if (apply) {
  if (process.env.ALLOW_PRODUCTION_DATA_CLEANUP !== "true") {
    console.error("Refusing --apply without ALLOW_PRODUCTION_DATA_CLEANUP=true.");
    process.exit(1);
  }
  if (process.env.CONFIRM_NULL_SLUG_CLEANUP !== "I understand this changes publish_state or canonical metadata only") {
    console.error("Refusing --apply without exact CONFIRM_NULL_SLUG_CLEANUP confirmation.");
    process.exit(1);
  }
}

const supabase = createAdminClient();

const { data: rows, error } = await supabase
  .from("campaign_plans")
  .select("*")
  .in("id", ids)
  .eq("publish_state", "published")
  .is("public_slug", null);

if (error) {
  console.error(`Failed to read targeted null-slug rows: ${error.message || error.code}`);
  process.exit(1);
}

async function activityCounts(row) {
  const [leadCount, trackingCount, directJobCount] = await Promise.all([
    countRows(supabase, "leads", (q) => q.eq("campaign_id", row.id)),
    countRows(supabase, "lead_tracking_events", (q) => q.eq("campaign_id", row.id)),
    countRows(supabase, "system_jobs", (q) => q.eq("campaign_id", row.id)),
  ]);

  return { leads: leadCount, trackingEvents: trackingCount, directJobs: directJobCount };
}

const actions = [];
for (const row of rows ?? []) {
  const counts = await activityCounts(row);
  const noActivity = Object.values(counts).every((value) => value === 0);
  const action = {
    id: row.id,
    idRedacted: redactId(row.id),
    organizationIdRedacted: redactId(row.organization_id),
    currentPublishState: row.publish_state,
    counts,
    eligible: noActivity,
    plannedAction: noActivity ? "set_publish_state_draft" : "skip_has_activity",
    applied: false,
  };

  if (apply && noActivity) {
    const plan = mergeOpsMetadata(row.plan, {
      nullSlugPublishedCleanup: {
        reason: "null_public_slug_non_public_published_row",
        previousPublishState: row.publish_state,
        publicSlug: null,
      },
    });
    const { error: updateError } = await supabase
      .from("campaign_plans")
      .update({
        publish_state: "draft",
        plan,
      })
      .eq("id", row.id)
      .eq("publish_state", "published")
      .is("public_slug", null);

    if (updateError) {
      action.error = updateError.message || updateError.code || "unknown_error";
    } else {
      action.applied = true;
    }
  }

  actions.push(action);
}

const { count: remainingCount, error: remainingError } = await supabase
  .from("campaign_plans")
  .select("*", { count: "exact", head: true })
  .eq("publish_state", "published")
  .is("public_slug", null);

outputJson({
  checkedAt: new Date().toISOString(),
  mode: apply ? "apply" : "dry_run",
  targetedIds: ids.map(redactId),
  targetedRowsFound: rows?.length ?? 0,
  actions,
  remainingNullSlugPublished: remainingError ? { error: remainingError.message || remainingError.code } : remainingCount ?? 0,
});
