import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  isInstantFormCampaign,
  resolveCampaignDestinationContract,
} from "../src/lib/campaign-destination";
import { resolveMetaInstantFormQualificationQuestions } from "../src/lib/meta-instant-form-qualification";

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
  isInstantFormCampaign({ adDestination: "meta_instant_form" }),
  true,
);
assert.equal(
  isInstantFormCampaign({ campaign_payload: { form_type: "instant_form" } }),
  true,
);
assert.equal(
  isInstantFormCampaign({ plan: { lead_capture_mode: "quality_funnel" } }),
  false,
);

assert.deepEqual(
  resolveMetaInstantFormQualificationQuestions({
    leadCaptureMode: "volume_lead_form",
    customQuestions: ["When are you moving?"],
  }),
  [],
);
assert.equal(
  resolveMetaInstantFormQualificationQuestions({
    leadCaptureMode: "quality_funnel",
    customQuestions: ["First custom question?", "Second custom question?"],
  }).length,
  1,
);
assert.equal(
  resolveMetaInstantFormQualificationQuestions({
    leadCaptureMode: "deep_qualification",
    customQuestions: [],
  }).length,
  3,
);
assert.deepEqual(
  resolveMetaInstantFormQualificationQuestions({
    leadCaptureMode: "deep_qualification",
    customQuestions: ["My first question?", "My second question?", "My third question?"],
  }),
  [
    "When are you hoping to make a move?",
    "What type of property or opportunity are you considering?",
    "Which city or neighbourhood are you focused on?",
  ],
);
assert.doesNotMatch(
  resolveMetaInstantFormQualificationQuestions({
    leadCaptureMode: "deep_qualification",
    customQuestions: ["What is your age?"],
  }).join(" "),
  /age/i,
);
assert.doesNotMatch(
  resolveMetaInstantFormQualificationQuestions({
    leadCaptureMode: "quality_funnel",
    language: "fr",
    customQuestions: ["Quel âge avez-vous ?"],
  }).join(" "),
  /âge/i,
);
assert.doesNotMatch(
  resolveMetaInstantFormQualificationQuestions({
    leadCaptureMode: "quality_funnel",
    language: "es",
    customQuestions: ["¿Cuál es su estado civil?"],
  }).join(" "),
  /estado civil/i,
);

const launchSource = source("src/app/api/campaigns/create/route.ts");
assert.match(launchSource, /resolveCampaignDestinationContract/);
assert.match(launchSource, /await ensureMetaInstantForm\(/);
assert.match(launchSource, /marketingAccountId: credentials\.connectionId/);
assert.match(launchSource, /provider_form_id: instantForm\?\.providerFormId \?\? null/);
assert.match(launchSource, /formDefinitionDigest: instantFormDefinition\?\.digest \?\? null/);
assert.match(
  launchSource,
  /adSetBody\.set\("destination_type", providerContract\.ad_set\.destination_type!\)/,
);
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
assert.match(snapshotSource, /destination_type: adDestination === "meta_instant_form" \? "ON_AD" : null/);

const routingSource = source(
  "src/lib/services/meta-instant-form-route-service.ts",
);
assert.match(routingSource, /provisionMetaLeadgenRouteForCampaign/);
assert.match(routingSource, /definition_digest/);

const serviceSource = source("src/lib/services/meta-instant-form-service.ts");
assert.match(serviceSource, /for \(let page = 0; page < 20; page \+= 1\)/);
assert.match(serviceSource, /seenCursors/);
assert.match(serviceSource, /match\.status !== "ACTIVE"/);
assert.match(serviceSource, /meta_instant_form_not_active/);
assert.match(serviceSource, /meta_instant_form_identity_conflict/);
assert.match(serviceSource, /meta_instant_form_revalidation_claim_required/);
assert.match(serviceSource, /reacquire_meta_instant_form_verification/);
assert.match(serviceSource, /readPageLeadgenSubscription/);
assert.match(serviceSource, /observedAppIds: sortedObservedAppIds/);
assert.doesNotMatch(
  serviceSource,
  /provisioning_status === "created" && claim\.provider_form_id\) \{\s*return/,
);
assert.match(serviceSource, /renew_meta_instant_form_provisioning/);
assert.match(serviceSource, /arm_meta_instant_form_provider_mutation/);
assert.match(serviceSource, /record_meta_instant_form_provider_receipt/);
assert.match(serviceSource, /meta_instant_form_operator_required/);
assert.match(serviceSource, /privacy_policy: JSON\.stringify/);
assert.match(serviceSource, /follow_up_action_url/);
assert.match(serviceSource, /application\/x-www-form-urlencoded/);
assert.match(serviceSource, /resolveMetaInstantFormQualificationQuestions/);
assert.match(
  source("src/lib/meta-instant-form-qualification.ts"),
  /never forwarded into a Meta Instant Form/,
);

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
