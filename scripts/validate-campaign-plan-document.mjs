import assert from "node:assert/strict";

import {
  CURRENT_CAMPAIGN_PLAN_VERSION,
  assertCampaignPlanDocument,
  buildCampaignPlanCriticalFieldPatch,
  getLeadLoopVerifiedFromPlan,
  getLaunchStatusFromPlan,
  getPublicSlugFromPlan,
  getSelectedAdIdFromPlan,
  mergeCampaignPlanDocument,
  readCampaignPlanDocument,
  safeParseCampaignPlanDocument,
  withLaunchRuntime,
  withLeadLoopVerified,
  withSelectedAdId,
} from "../src/lib/services/campaign-plan-document.ts";

function testLegacyPlanDefaults() {
  const legacyPlan = {
    client_name: "Legacy Agent",
    campaign_payload: {
      selected_ad_id: "ad_legacy_1",
    },
  };

  const parsed = assertCampaignPlanDocument(legacyPlan);
  assert.equal(parsed.version, CURRENT_CAMPAIGN_PLAN_VERSION);
  assert.equal(parsed.selected_ad_id, "ad_legacy_1");
  assert.equal(parsed.campaign_payload?.selected_ad_id, "ad_legacy_1");
  assert.equal(parsed.lead_loop_verified, false);
}

function testMissingFieldsDefaultSafely() {
  const parsed = readCampaignPlanDocument(undefined);
  assert.equal(parsed.version, CURRENT_CAMPAIGN_PLAN_VERSION);
  assert.equal(parsed.lead_loop_verified, false);
}

function testInvalidShapeFailsClearly() {
  const invalid = safeParseCampaignPlanDocument({
    version: "invalid",
    lead_loop_verified: "not-a-boolean",
  });

  assert.equal(invalid.success, false);
}

function testCriticalHelpersStayInSync() {
  const initial = {
    version: 1,
    campaign_payload: {
      destination_url: "/f/test-slug",
    },
  };

  const withSelection = withSelectedAdId(initial, "ad_123");
  assert.equal(getSelectedAdIdFromPlan(withSelection), "ad_123");

  const withLeadLoop = withLeadLoopVerified(withSelection);
  assert.equal(getLeadLoopVerifiedFromPlan(withLeadLoop), true);

  const withRuntime = withLaunchRuntime(
    withLeadLoop,
    {
      current_stage: "campaign",
      status: "creating",
      campaign_id: "cmp_123",
    },
    {
      status: "launching",
    },
  );

  assert.equal(withRuntime.launch_runtime?.campaign_id, "cmp_123");
  assert.equal(withRuntime.launch_runtime?.current_stage, "campaign");
  assert.equal(withRuntime.runtime?.status, "launching");
  assert.equal(getLaunchStatusFromPlan(withRuntime), "launching");

  const merged = mergeCampaignPlanDocument(withRuntime, {
    launch_runtime: {
      status: "created",
    },
  });

  assert.equal(merged.launch_runtime?.campaign_id, "cmp_123");
  assert.equal(merged.launch_runtime?.status, "created");
  assert.equal(getLaunchStatusFromPlan(merged), "launching");
}

function testExtractedCriticalFields() {
  const plan = mergeCampaignPlanDocument(
    {
      campaign_payload: {
        destination_url: "https://example.com/f/test-public-slug?utm=campaign",
      },
    },
    {
      runtime: {
        status: "live",
      },
      lead_loop_verified: true,
    },
  );

  assert.equal(getPublicSlugFromPlan(plan), "test-public-slug");
  assert.equal(getLaunchStatusFromPlan(plan), "live");

  const patch = buildCampaignPlanCriticalFieldPatch(plan);
  assert.equal(patch.public_slug, "test-public-slug");
  assert.equal(patch.launch_status, "live");
  assert.equal(patch.lead_loop_verified, true);
}

function main() {
  testLegacyPlanDefaults();
  testMissingFieldsDefaultSafely();
  testInvalidShapeFailsClearly();
  testCriticalHelpersStayInSync();
  testExtractedCriticalFields();

  console.log("campaign-plan-document validation passed");
}

main();
