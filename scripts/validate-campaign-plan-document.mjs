import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadTypeScriptCommonJsModule(relativePath) {
  const filename = resolve(__dirname, relativePath);
  const source = readFileSync(filename, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  const commonJsModule = { exports: {} };
  const wrapper = `(function(exports, require, module, __filename, __dirname) {\n${transpiled}\n})`;
  const compiled = vm.runInThisContext(wrapper, { filename });
  compiled(commonJsModule.exports, require, commonJsModule, filename, dirname(filename));
  return commonJsModule.exports;
}

const {
  CURRENT_CAMPAIGN_PLAN_VERSION,
  assertCampaignPlanDocument,
  buildCampaignPlanCriticalFieldPatch,
  getSelectedAdIdsFromPlan,
  getLeadLoopVerifiedFromPlan,
  getLaunchStatusFromPlan,
  getPublicSlugFromPlan,
  getSelectedAdIdFromPlan,
  getSelectedUgcVideoIdsFromPlan,
  mergeCampaignPlanDocument,
  readCampaignPlanDocument,
  safeParseCampaignPlanDocument,
  withLaunchRuntime,
  withLeadLoopVerified,
  withSelectedAdId,
  withSelectedLaunchMedia,
} = loadTypeScriptCommonJsModule("../src/lib/services/campaign-plan-document.ts");

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
  const withLaunchMedia = withSelectedLaunchMedia(withSelection, {
    selectedAdIds: ["ad_123", "ad_456"],
    selectedUgcVideoIds: ["ugc_video_1"],
  });
  assert.deepEqual(getSelectedUgcVideoIdsFromPlan(withLaunchMedia), ["ugc_video_1"]);
  assert.deepEqual(getSelectedAdIdsFromPlan(withLaunchMedia), ["ad_123", "ad_456"]);
  assert.deepEqual(withLaunchMedia.campaign_payload?.selected_ugc_video_ids, ["ugc_video_1"]);

  const withLeadLoop = withLeadLoopVerified(withLaunchMedia);
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

function testNestedAndCamelCaseLaunchMediaSelection() {
  const savedDocumentShape = {
    plan: {
      selectedAdIds: ["static-camel-1", "static-camel-2"],
      campaignPayload: {
        selectedUgcVideoIds: ["ugc-camel-1"],
      },
    },
  };

  assert.deepEqual(getSelectedAdIdsFromPlan(savedDocumentShape), ["static-camel-1", "static-camel-2"]);
  assert.deepEqual(getSelectedUgcVideoIdsFromPlan(savedDocumentShape), ["ugc-camel-1"]);

  const nestedSnakeCaseShape = {
    plan: {
      selected_ad_ids: ["static-nested-1", "static-nested-2", "static-nested-3", "static-nested-4"],
      campaign_payload: {
        selected_ugc_video_id: "ugc-nested-primary",
      },
    },
  };

  assert.deepEqual(getSelectedAdIdsFromPlan(nestedSnakeCaseShape), [
    "static-nested-1",
    "static-nested-2",
    "static-nested-3",
    "static-nested-4",
  ]);
  assert.deepEqual(getSelectedUgcVideoIdsFromPlan(nestedSnakeCaseShape), ["ugc-nested-primary"]);
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
  testNestedAndCamelCaseLaunchMediaSelection();
  testExtractedCriticalFields();

  console.log("campaign-plan-document validation passed");
}

main();
