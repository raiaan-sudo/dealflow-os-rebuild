#!/usr/bin/env node

import {
  asRecord,
  asString,
  countRows,
  createAdminClient,
  getArg,
  outputJson,
  redactId,
  redactObject,
  splitIds,
} from "./data-hygiene-utils.mjs";

const argv = process.argv.slice(2);
const ids = splitIds(getArg(argv, "--ids"));
const days = Number(getArg(argv, "--days") ?? 60);
const rangeStart = new Date(Date.now() - Math.max(days, 1) * 24 * 60 * 60 * 1000).toISOString();
const supabase = createAdminClient();

let leadQuery = supabase
  .from("leads")
  .select("*")
  .is("campaign_id", null)
  .gte("created_at", rangeStart)
  .order("created_at", { ascending: false })
  .limit(1000);

if (ids.length > 0) {
  leadQuery = leadQuery.in("id", ids);
}

const [{ data: leads, error: leadsError }, { data: campaigns, error: campaignsError }] = await Promise.all([
  leadQuery,
  supabase
    .from("campaign_plans")
    .select("id, organization_id, public_slug, publish_state")
    .limit(5000),
]);

if (leadsError) {
  console.error(`Failed to read null-campaign leads: ${leadsError.message || leadsError.code}`);
  process.exit(1);
}
if (campaignsError) {
  console.error(`Failed to read campaigns for classification: ${campaignsError.message || campaignsError.code}`);
  process.exit(1);
}

const campaignById = new Map((campaigns ?? []).map((campaign) => [campaign.id, campaign]));
const campaignBySlug = new Map((campaigns ?? []).filter((campaign) => campaign.public_slug).map((campaign) => [campaign.public_slug, campaign]));

function leadSource(row) {
  const metadata = asRecord(row.metadata);
  return (
    asString(row.source) ??
    asString(row.lead_source) ??
    asString(row.lead_type) ??
    asString(metadata.source) ??
    asString(metadata.leadSource) ??
    "unknown"
  );
}

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

async function classifyLead(row) {
  const source = leadSource(row);
  const campaignIdFromMetadata = metadataCampaignId(row);
  const publicSlugFromMetadata = metadataPublicSlug(row);
  const campaignFromId = campaignIdFromMetadata ? campaignById.get(campaignIdFromMetadata) : null;
  const campaignFromSlug = publicSlugFromMetadata ? campaignBySlug.get(publicSlugFromMetadata) : null;
  const candidateCampaign = campaignFromId ?? campaignFromSlug ?? null;
  const orgMatches = candidateCampaign ? candidateCampaign.organization_id === row.organization_id : false;
  const [trackingCount, notificationCount] = await Promise.all([
    countRows(supabase, "lead_tracking_events", (q) => q.eq("lead_id", row.id)),
    countRows(supabase, "lead_notifications", (q) => q.eq("lead_id", row.id)),
  ]);

  const normalizedSource = source.toLowerCase();
  const isOrgOnly = /manual|import|crm|conversation|contact|operator|zillow|referral|flex/.test(normalizedSource);
  const isQa = /qa|test|proof|smoke/.test(normalizedSource) || /qa|test|proof|smoke/i.test(JSON.stringify(row.metadata ?? {}));
  let classification = "unknown_null_campaign_lead";
  let recommendedAction = "manual_review_no_mutation";

  if (candidateCampaign && orgMatches) {
    classification = "strong_campaign_evidence";
    recommendedAction = "backfill_campaign_id";
  } else if (candidateCampaign && !orgMatches) {
    classification = "candidate_campaign_org_mismatch";
  } else if (isQa) {
    classification = "qa_or_test_lead_campaign_null_expected";
    recommendedAction = "leave_unattached_tag_if_needed";
  } else if (isOrgOnly) {
    classification = "organization_level_lead_campaign_null_expected";
    recommendedAction = "leave_unattached";
  }

  return {
    id: row.id,
    idRedacted: redactId(row.id),
    organizationIdRedacted: redactId(row.organization_id),
    createdAt: row.created_at,
    source,
    publicSlugFromMetadata,
    campaignIdFromMetadataRedacted: redactId(campaignIdFromMetadata),
    candidateCampaignIdRedacted: redactId(candidateCampaign?.id),
    candidatePublicSlug: candidateCampaign?.public_slug ?? null,
    candidatePublishState: candidateCampaign?.publish_state ?? null,
    orgMatches,
    counts: {
      trackingEvents: trackingCount,
      notifications: notificationCount,
    },
    classification,
    recommendedAction,
    metadataRedacted: redactObject(row.metadata),
    attributionRedacted: redactObject(row.attribution),
  };
}

const classified = [];
for (const row of leads ?? []) {
  classified.push(await classifyLead(row));
}

outputJson({
  checkedAt: new Date().toISOString(),
  mode: "classify_null_campaign_leads",
  rangeStart,
  total: classified.length,
  summary: classified.reduce((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {}),
  rows: classified,
});
