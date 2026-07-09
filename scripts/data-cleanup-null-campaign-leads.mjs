#!/usr/bin/env node

import {
  asRecord,
  asString,
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
  console.error("Refusing to run without targeted --ids <comma-separated-lead-ids>.");
  process.exit(1);
}

if (apply && process.env.ALLOW_PRODUCTION_DATA_CLEANUP !== "true") {
  console.error("Refusing --apply without ALLOW_PRODUCTION_DATA_CLEANUP=true.");
  process.exit(1);
}

const supabase = createAdminClient();

const [{ data: leads, error: leadsError }, { data: campaigns, error: campaignsError }] = await Promise.all([
  supabase
    .from("leads")
    .select("*")
    .in("id", ids)
    .is("campaign_id", null),
  supabase
    .from("campaign_plans")
    .select("id, organization_id, public_slug, publish_state")
    .limit(5000),
]);

if (leadsError) {
  console.error(`Failed to read targeted null-campaign leads: ${leadsError.message || leadsError.code}`);
  process.exit(1);
}
if (campaignsError) {
  console.error(`Failed to read campaigns for cleanup: ${campaignsError.message || campaignsError.code}`);
  process.exit(1);
}

const campaignById = new Map((campaigns ?? []).map((campaign) => [campaign.id, campaign]));
const campaignBySlug = new Map((campaigns ?? []).filter((campaign) => campaign.public_slug).map((campaign) => [campaign.public_slug, campaign]));

function metadataCampaignId(row) {
  const metadata = asRecord(row.metadata);
  return asString(metadata.campaignId) ?? asString(metadata.campaign_id);
}

function metadataPublicSlug(row) {
  const metadata = asRecord(row.metadata);
  const attribution = asRecord(row.attribution);
  return (
    asString(row.public_slug) ??
    asString(metadata.publicSlug) ??
    asString(metadata.public_slug) ??
    asString(attribution.publicSlug) ??
    asString(attribution.public_slug)
  );
}

const actions = [];
for (const row of leads ?? []) {
  const candidate =
    campaignById.get(metadataCampaignId(row)) ??
    campaignBySlug.get(metadataPublicSlug(row)) ??
    null;
  const orgMatches = candidate ? candidate.organization_id === row.organization_id : false;
  const eligible = Boolean(candidate && orgMatches);
  const action = {
    id: row.id,
    idRedacted: redactId(row.id),
    organizationIdRedacted: redactId(row.organization_id),
    candidateCampaignIdRedacted: redactId(candidate?.id),
    candidatePublicSlug: candidate?.public_slug ?? null,
    eligible,
    plannedAction: eligible ? "backfill_campaign_id" : "skip_no_strong_campaign_evidence",
    applied: false,
  };

  if (apply && eligible) {
    const metadata = mergeOpsMetadata(row.metadata, {
      campaignIdBackfill: {
        reason: "metadata_or_public_slug_matched_existing_campaign_same_org",
        backfilledCampaignId: candidate.id,
        previousCampaignId: null,
      },
    });
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        campaign_id: candidate.id,
        metadata,
      })
      .eq("id", row.id)
      .is("campaign_id", null);

    if (updateError) {
      action.error = updateError.message || updateError.code || "unknown_error";
    } else {
      action.applied = true;
    }
  }

  actions.push(action);
}

const { count: remainingCount, error: remainingError } = await supabase
  .from("leads")
  .select("*", { count: "exact", head: true })
  .is("campaign_id", null);

outputJson({
  checkedAt: new Date().toISOString(),
  mode: apply ? "apply" : "dry_run",
  targetedIds: ids.map(redactId),
  targetedRowsFound: leads?.length ?? 0,
  actions,
  remainingNullCampaignLeads: remainingError ? { error: remainingError.message || remainingError.code } : remainingCount ?? 0,
});
