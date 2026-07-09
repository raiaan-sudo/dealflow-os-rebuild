#!/usr/bin/env node

import {
  asRecord,
  createAdminClient,
  getArg,
  outputJson,
  redactId,
  splitIds,
} from "./data-hygiene-utils.mjs";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const ids = splitIds(getArg(argv, "--ids"));
const reason = getArg(argv, "--reason");

if (ids.length === 0) {
  console.error("Refusing to run without targeted --ids <comma-separated-job-ids>.");
  process.exit(1);
}

if (!reason || reason.trim().length < 8) {
  console.error("Refusing to run without --reason <clear-resolution-reason>.");
  process.exit(1);
}

if (apply && process.env.ALLOW_PRODUCTION_JOB_CLEANUP !== "true") {
  console.error("Refusing --apply without ALLOW_PRODUCTION_JOB_CLEANUP=true.");
  process.exit(1);
}

const supabase = createAdminClient();

const { data: jobs, error } = await supabase
  .from("system_jobs")
  .select("*")
  .in("id", ids)
  .eq("kind", "meta_sync");

if (error) {
  console.error(`Failed to read targeted meta_sync jobs: ${error.message || error.code}`);
  process.exit(1);
}

const actions = [];
for (const job of jobs ?? []) {
  const result = asRecord(job.result);
  const alreadyResolved = Boolean(result.opsResolution);
  const action = {
    id: job.id,
    idRedacted: redactId(job.id),
    organizationIdRedacted: redactId(job.organization_id),
    campaignIdRedacted: redactId(job.campaign_id ?? asRecord(job.payload).campaignId),
    status: job.status,
    plannedAction: alreadyResolved ? "skip_already_resolved" : "add_ops_resolution_metadata",
    applied: false,
  };

  if (apply && !alreadyResolved) {
    const nextResult = {
      ...result,
      opsResolution: {
        reason,
        resolvedAt: new Date().toISOString(),
        resolvedBy: "codex_final_data_provider_closure",
        statusPreserved: job.status,
      },
    };
    const { error: updateError } = await supabase
      .from("system_jobs")
      .update({
        result: nextResult,
        dead_lettered_at: job.dead_lettered_at ?? new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("kind", "meta_sync");

    if (updateError) {
      action.error = updateError.message || updateError.code || "unknown_error";
    } else {
      action.applied = true;
    }
  }

  actions.push(action);
}

outputJson({
  checkedAt: new Date().toISOString(),
  mode: apply ? "apply" : "dry_run",
  reason,
  targetedIds: ids.map(redactId),
  targetedRowsFound: jobs?.length ?? 0,
  actions,
});
