import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  isInstantFormCampaign,
  resolveCampaignDestinationContract,
} from "../src/lib/campaign-destination";

function source(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

const volume = resolveCampaignDestinationContract({
  lead_capture_mode: "volume_lead_form",
});
assert.deepEqual(volume, {
  captureExperience: "dealflow_website",
  adDestination: "website",
  explicitAdDestination: false,
});
assert.equal(isInstantFormCampaign({ lead_capture_mode: "volume_lead_form" }), false);

const explicitMeta = resolveCampaignDestinationContract({
  lead_capture_mode: "volume_lead_form",
  ad_destination: "meta_instant_form",
});
assert.deepEqual(explicitMeta, {
  captureExperience: "dealflow_website",
  adDestination: "meta_instant_form",
  explicitAdDestination: true,
});
assert.equal(isInstantFormCampaign({ ad_destination: "meta_instant_form" }), true);
assert.equal(
  isInstantFormCampaign({ campaign_payload: { form_type: "instant_form" } }),
  true,
);
assert.equal(
  isInstantFormCampaign({ plan: { lead_capture_mode: "quality_funnel" } }),
  false,
);

const launchSource = source("src/app/api/campaigns/create/route.ts");
assert.match(launchSource, /resolveCampaignDestinationContract/);
assert.match(launchSource, /await ensureMetaInstantForm\(/);
assert.match(launchSource, /marketingAccountId: credentials\.connectionId/);
assert.match(launchSource, /providerFormId: instantForm\?\.providerFormId/);
assert.match(launchSource, /formDefinitionDigest: instantForm\?\.definition\.digest/);
assert.match(launchSource, /adSetBody\.set\("destination_type", "ON_AD"\)/);
assert.match(launchSource, /lead_gen_form_id: instantForm!\.providerFormId/);

const routeSource = source("src/app/api/campaigns/[id]/launch/route.ts");
assert.match(routeSource, /provisionCompletedMetaInstantFormRoute/);
assert.match(routeSource, /launchCompletionCommitted = true/);
assert.match(routeSource, /!launchCompletionCommitted/);

const snapshotSource = source("src/lib/meta-launch-input-snapshot.ts");
assert.match(snapshotSource, /capture_experience/);
assert.match(snapshotSource, /ad_destination/);
assert.match(snapshotSource, /provider_form_id/);
assert.match(snapshotSource, /form_definition_digest/);

const routingSource = source(
  "src/lib/services/meta-instant-form-route-service.ts",
);
assert.match(routingSource, /provisionMetaLeadgenRouteForCampaign/);
assert.match(routingSource, /definition_digest/);

const serviceSource = source("src/lib/services/meta-instant-form-service.ts");
assert.match(serviceSource, /for \(let page = 0; page < 20; page \+= 1\)/);
assert.match(serviceSource, /seenCursors/);
assert.match(serviceSource, /renew_meta_instant_form_provisioning/);
assert.match(serviceSource, /arm_meta_instant_form_provider_mutation/);
assert.match(serviceSource, /record_meta_instant_form_provider_receipt/);
assert.match(serviceSource, /meta_instant_form_operator_required/);
assert.match(serviceSource, /privacy_policy: JSON\.stringify/);
assert.match(serviceSource, /follow_up_action_url/);
assert.match(serviceSource, /application\/x-www-form-urlencoded/);

const migrationSource = source(
  "supabase/migrations/20260712235991_create_meta_instant_form_provisioning.sql",
);
assert.match(migrationSource, /processing_locked_until timestamptz/);
assert.match(migrationSource, /provider_mutation_state text/);
assert.match(migrationSource, /subscription_state text/);
assert.match(migrationSource, /existing\.processing_locked_until > timezone\('utc', now\(\)\)/);
assert.match(migrationSource, /meta_instant_form_expired_ambiguous_write/);
assert.match(migrationSource, /create or replace function public\.renew_meta_instant_form_provisioning/);
assert.match(migrationSource, /create or replace function public\.arm_meta_instant_form_provider_mutation/);
assert.match(migrationSource, /create or replace function public\.record_meta_instant_form_provider_receipt/);
assert.match(migrationSource, /create constraint trigger finalize_meta_instant_form_launch_route/);
assert.match(migrationSource, /perform \* from public\.upsert_meta_leadgen_route/);

console.log(
  "Meta Instant Form destination, launch wiring, durable claim, pagination, route, and immutable identity contracts passed.",
);
