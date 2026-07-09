#!/usr/bin/env node

import {
  asRecord,
  createAdminClient,
  getArg,
  outputJson,
  redactId,
  redactObject,
  splitIds,
} from "./data-hygiene-utils.mjs";

const argv = process.argv.slice(2);
const ids = splitIds(getArg(argv, "--ids"));
const supabase = createAdminClient();

let query = supabase
  .from("system_jobs")
  .select("*")
  .eq("kind", "meta_sync")
  .in("status", ["failed", "pending", "processing"])
  .order("created_at", { ascending: false })
  .limit(1000);

if (ids.length > 0) {
  query = query.in("id", ids);
}

const { data: jobs, error } = await query;
if (error) {
  console.error(`Failed to read meta_sync jobs: ${error.message || error.code}`);
  process.exit(1);
}

const { data: allMetaJobs, error: allJobsError } = await supabase
  .from("system_jobs")
  .select("id, organization_id, campaign_id, kind, status, created_at, result, payload")
  .eq("kind", "meta_sync")
  .order("created_at", { ascending: false })
  .limit(5000);

if (allJobsError) {
  console.error(`Failed to read meta_sync history: ${allJobsError.message || allJobsError.code}`);
  process.exit(1);
}

const { data: trackingContracts, error: trackingError } = await supabase
  .from("campaign_tracking_contracts")
  .select("campaign_id, status, tracking_mode, expected_lead_destination, last_verified_at")
  .limit(5000);

if (trackingError) {
  console.error(`Failed to read campaign tracking contracts: ${trackingError.message || trackingError.code}`);
  process.exit(1);
}

const trackingByCampaign = new Map((trackingContracts ?? []).map((contract) => [contract.campaign_id, contract]));

function jobCampaignId(job) {
  return job.campaign_id ?? asRecord(job.payload).campaignId ?? asRecord(job.payload).campaign_id ?? null;
}

function hasOpsResolution(job) {
  return Boolean(asRecord(job.result).opsResolution);
}

function laterSuccessfulJob(job) {
  const campaignId = jobCampaignId(job);
  return (allMetaJobs ?? []).find((candidate) => {
    if (candidate.id === job.id || candidate.status !== "completed") {
      return false;
    }
    const sameCampaign = campaignId && jobCampaignId(candidate) === campaignId;
    const sameOrg = job.organization_id && candidate.organization_id === job.organization_id;
    return (sameCampaign || sameOrg) && new Date(candidate.created_at) > new Date(job.created_at);
  });
}

function classifyJob(job) {
  const payload = asRecord(job.payload);
  const result = asRecord(job.result);
  const errorText = `${job.error_message ?? ""} ${job.last_error_code ?? ""} ${JSON.stringify(result)}`.toLowerCase();
  const laterSuccess = laterSuccessfulJob(job);
  const trackingContract = trackingByCampaign.get(jobCampaignId(job));
  const resolved = hasOpsResolution(job);
  let classification = "active_or_unknown_meta_sync_failure";
  let recommendedAction = "operator_review_no_retry";

  if (resolved) {
    classification = "already_ops_resolved";
    recommendedAction = "no_action";
  } else if (laterSuccess) {
    classification = "superseded_by_later_success";
    recommendedAction = "resolve_as_superseded";
  } else if (trackingContract?.status === "configured") {
    classification = "superseded_by_configured_tracking_contract";
    recommendedAction = "resolve_as_tracking_contract_current_no_retry";
  } else if (/token|oauth|session|permission|scope|logged|invalid/.test(errorText)) {
    classification = "external_meta_auth_or_permission_blocker";
    recommendedAction = "do_not_retry_without_valid_safe_meta_asset";
  } else if (job.status === "pending" || job.status === "processing") {
    classification = "active_unfinished_meta_sync_job";
    recommendedAction = "monitor_or_worker_review";
  }

  return {
    id: job.id,
    idRedacted: redactId(job.id),
    organizationIdRedacted: redactId(job.organization_id),
    campaignIdRedacted: redactId(jobCampaignId(job)),
    status: job.status,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    retryCount: job.retry_count ?? null,
    lastErrorCode: job.last_error_code ?? null,
    errorCategory: /token|oauth|session|permission|scope|logged|invalid/.test(errorText)
      ? "meta_auth_or_permission"
      : job.error_message
        ? "job_error_message_present"
        : null,
    payloadRedacted: redactObject(payload),
    resultRedacted: redactObject(result),
    laterSuccessfulJobIdRedacted: redactId(laterSuccess?.id),
    trackingContractStatus: trackingContract?.status ?? null,
    trackingMode: trackingContract?.tracking_mode ?? null,
    expectedLeadDestination: trackingContract?.expected_lead_destination ?? null,
    trackingLastVerifiedAt: trackingContract?.last_verified_at ?? null,
    classification,
    recommendedAction,
  };
}

const rows = (jobs ?? []).map(classifyJob);

outputJson({
  checkedAt: new Date().toISOString(),
  mode: "triage_meta_sync",
  total: rows.length,
  summary: rows.reduce((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {}),
  rows,
});
