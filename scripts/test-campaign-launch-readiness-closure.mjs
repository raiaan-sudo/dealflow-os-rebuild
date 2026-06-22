#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildCampaignLaunchReadinessRepair,
  CAMPAIGN_LAUNCH_READINESS_TARGET,
  isLaunchReadyStaticAsset,
  mapStaticCreativeAssetsForLaunch,
} from "./repair-campaign-launch-readiness-closure.mjs";

function assetRow(index, overrides = {}) {
  const id = `${CAMPAIGN_LAUNCH_READINESS_TARGET.campaignId}-creative-${index}`;
  return {
    id: `asset-row-${index}`,
    campaign_id: CAMPAIGN_LAUNCH_READINESS_TARGET.campaignId,
    user_id: CAMPAIGN_LAUNCH_READINESS_TARGET.userId,
    creative_id: id,
    asset_type: "image_frame",
    format: "1:1",
    status: "ready",
    provider_name: "higgsfield_marketing_studio",
    generation_method: "image_generation",
    file_url: `https://example.test/${index}.png`,
    thumbnail_url: `https://example.test/${index}-thumb.png`,
    metadata: {
      source: "static_ad",
      role: "background_image",
      staticAssetId: `static-approved-${index}`,
      storageNormalized: true,
      storagePath: `proof/${index}.png`,
      imageQa: { mode: "finished_ad", usable: true, decision: "accept", reasons: [] },
      qualityGate: { accepted: true, hardFailures: [] },
      headline: `Approved headline ${index}`,
      cta: "Get My List",
      ...overrides.metadata,
    },
    ...overrides,
  };
}

const targetRow = {
  id: CAMPAIGN_LAUNCH_READINESS_TARGET.campaignId,
  organization_id: CAMPAIGN_LAUNCH_READINESS_TARGET.organizationId,
  user_id: CAMPAIGN_LAUNCH_READINESS_TARGET.userId,
  public_slug: CAMPAIGN_LAUNCH_READINESS_TARGET.publicSlug,
  publish_state: "published",
  staged_snapshot: {
    funnel: { headline: "Old headline", subheadline: "Old subheadline", cta: "Old CTA" },
    staticAds: [],
  },
  published_snapshot: {
    funnel: { headline: "Old headline", subheadline: "Old subheadline", cta: "Old CTA" },
    staticAds: [],
  },
  plan: {
    version: 3,
    funnel: {
      headline: "Get Your Free Custom Home List",
      subheadline: "Get a personalized list of homes matched to your budget, location, and timeline.",
      cta: "Get My List",
    },
    creatives: { staticAds: [] },
    staticAds: [],
    selected_ad_ids: ["static-approved-0", "static-approved-1", "static-approved-2"],
    campaign_payload: {
      selected_ad_ids: ["static-approved-0", "static-approved-1", "static-approved-2"],
    },
  },
};

const rows = [assetRow(0), assetRow(1), assetRow(2), assetRow(3, { status: "requires_review", file_url: null, thumbnail_url: null })];
const mapped = mapStaticCreativeAssetsForLaunch(rows);
assert.equal(mapped.length, 4, "all static groups are mapped");
assert.equal(mapped.filter(isLaunchReadyStaticAsset).length, 3, "only accepted current assets are launch-ready");

const result = buildCampaignLaunchReadinessRepair(targetRow, rows, {
  proofRunId: "campaign_launch_readiness_test",
  now: "2026-06-18T00:00:00.000Z",
});

assert.deepEqual(result.blockers, [], "fixture repair is not blocked");
assert.equal(result.staticSummary.launchReadyCount, 3, "three static creatives satisfy current launch minimum");
assert.deepEqual(result.selectedAfter.selectedAdIds, [
  `${CAMPAIGN_LAUNCH_READINESS_TARGET.campaignId}-creative-0`,
  `${CAMPAIGN_LAUNCH_READINESS_TARGET.campaignId}-creative-1`,
  `${CAMPAIGN_LAUNCH_READINESS_TARGET.campaignId}-creative-2`,
], "legacy static aliases are normalized to canonical creative IDs");
assert.equal(result.nextRow.plan.creatives.staticAds.length, 4, "plan.creatives.staticAds is hydrated");
assert.equal(result.nextRow.plan.staticAds.length, 4, "root plan.staticAds is hydrated");
const selectedLaunchAssets = result.nextRow.plan.creatives.staticAds.filter((asset) =>
  result.selectedAfter.selectedAdIds.includes(asset.id),
);
assert.equal(selectedLaunchAssets.length, 3, "three selected launch assets are present after repair");
for (const asset of selectedLaunchAssets) {
  assert.equal(asset.imageGenerationProvider, "higgsfield_marketing_studio", "selected launch assets keep Higgsfield provider provenance");
  assert.equal(asset.generationMethod, "higgsfield_marketing_studio", "selected launch assets get production launch generation method");
  assert.equal(asset.providerName, "higgsfield_marketing_studio", "selected launch assets get production launch provider name");
  assert.equal(asset.generationMode, "finished_ad", "selected launch assets get finished-ad generation mode");
  assert.equal(asset.assetRole, "final_static_ad", "selected launch assets get final static ad role");
  assert.equal(asset.qualityTier, "higgsfield_finished_ad", "selected launch assets get finished Higgsfield quality tier");
}
assert.equal(result.snapshotSummary.publicFunnelSnapshotCurrentAfter, true, "published snapshot matches current funnel after repair");
assert.equal(result.nextRow.published_snapshot.funnel.headline, targetRow.plan.funnel.headline, "published snapshot funnel is refreshed");
assert.equal(result.nextRow.staged_snapshot.funnel.cta, targetRow.plan.funnel.cta, "staged snapshot funnel is refreshed");
assert.equal(result.safety.creativeAssetsTouched, false, "creative_assets are not mutated");
assert.equal(result.safety.systemJobsTouched, false, "system_jobs are not mutated");
assert.equal(result.safety.providerCalls, false, "provider calls are not made");
assert.equal(result.safety.liveMetaMutation, false, "Meta mutation is not made");

const script = fs.readFileSync("scripts/repair-campaign-launch-readiness-closure.mjs", "utf8");
assert.doesNotMatch(script, /from\(["']creative_assets["']\)[\s\S]{0,240}\.update\(/, "script must not update creative_assets");
assert.doesNotMatch(script, /from\(["']system_jobs["']\)[\s\S]{0,240}\.(insert|update|delete)\(/, "script must not mutate system_jobs");
assert.doesNotMatch(script, /generateStaticCreative|regenerateStaticCreative|providerUsage|ALLOW_HIGGSFIELD|ALLOW_OPENAI/, "script must not call provider generation paths");
assert.match(script, new RegExp(CAMPAIGN_LAUNCH_READINESS_TARGET.applyConfirm), "apply requires explicit confirmation");

const launchPage = fs.readFileSync("src/app/(app)/launch/page.tsx", "utf8");
assert.match(
  launchPage,
  /asPlainRecord\(nestedPlan\?\.funnel\)/,
  "launch page must treat nested plan.funnel as a valid published snapshot signature source",
);
assert.match(
  launchPage,
  /asPlainRecord\(campaignPayload\?\.funnel\)/,
  "launch page must treat campaign_payload.funnel as a valid published snapshot signature source",
);
assert.match(
  launchPage,
  /function readPersistedStaticAdsFromPlan/,
  "launch page must be able to read persisted plan static ads",
);
assert.match(
  launchPage,
  /function mergeLaunchStaticAds/,
  "launch page must merge persisted selected static ads into launch readiness",
);
assert.match(
  launchPage,
  /getStaticCreativeReadiness\(launchStaticAds,\s*selectedAdIds/,
  "launch readiness must evaluate the merged launch static ad set",
);
assert.match(
  launchPage,
  /validateMetaLaunchSelections\(\{\s*destinationUrl:[\s\S]*organizationId:\s*record\?\.campaign\.organization_id/,
  "launch preflight must validate Meta assets against the campaign organization, not the viewer's default workspace",
);

const launchMetaSelectionPanel = fs.readFileSync("src/components/campaign/launch/launch-meta-selection-panel.tsx", "utf8");
assert.match(
  launchMetaSelectionPanel,
  /campaignId\?:\s*string\s*\|\s*null/,
  "Meta selection saves must accept the launch campaign id",
);
assert.match(
  launchMetaSelectionPanel,
  /saveMetaSelections\(\{\s*externalAccountId:\s*selectedAccountId,\s*campaignId,/,
  "Meta selection saves must include campaignId so admin workspace launch pages update the selected campaign workspace",
);

const metaSelectionsRoute = fs.readFileSync("src/app/api/integrations/meta/selections/route.ts", "utf8");
assert.match(
  metaSelectionsRoute,
  /const record = await getCampaignById\(campaignId\)/,
  "Meta selections route must resolve campaign access before using campaign organization context",
);
assert.match(
  metaSelectionsRoute,
  /targetOrganizationId = record\.campaign\.organization_id \?\? auth\.organizationId/,
  "Meta selections route must target the campaign organization when campaignId is provided",
);
assert.match(
  metaSelectionsRoute,
  /updateMetaLaunchSelections\(\{[\s\S]*organizationId:\s*targetOrganizationId/,
  "Meta selections route must update the resolved campaign organization's Meta connection",
);

const metaService = fs.readFileSync("src/lib/integrations/meta/service.ts", "utf8");
assert.match(
  metaService,
  /const explicitOrganizationId = options\?\.organizationId\?\.trim\(\) \|\| null/,
  "Meta credential lookup must recognize explicit campaign organization ids",
);
assert.match(
  metaService,
  /useAdminClient:\s*Boolean\(explicitOrganizationId\)/,
  "Meta credential lookup must use admin-scoped reads for explicit campaign organizations",
);
assert.match(
  metaService,
  /const writeClient = params\.useAdminClient[\s\S]*\? createAdminClient\(\)[\s\S]*: \(await getMetaSupabaseContext\(\)\)\.supabase/,
  "Derived launch-domain persistence must not require viewer workspace context for admin-scoped campaign validation",
);

console.log("campaign launch readiness closure tests passed");
