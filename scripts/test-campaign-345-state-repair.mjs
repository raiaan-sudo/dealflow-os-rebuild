#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CAMPAIGN_345_REPAIR,
  buildRepairDecision,
  chooseSelectedStaticIds,
  chooseSelectedUgcVideoIds,
  summarizeStaticGroups,
  summarizeVideos,
} from "./repair-campaign-345-launch-state.mjs";

function publishedFunnel() {
  return {
    headline: "Know what you can actually buy in Toronto",
    subheadline: "Get a realistic $600K-$900K path before you tour.",
    cta: "Check my options",
    sections: [],
    form_fields: [],
  };
}

function staticRow(id, overrides = {}) {
  return {
    id: `${id}-row`,
    campaign_id: CAMPAIGN_345_REPAIR.campaignId,
    creative_id: id,
    asset_type: "image_frame",
    status: "ready",
    file_url: `https://example.invalid/${id}.png`,
    thumbnail_url: null,
    provider_name: "openai",
    provider_asset_id: `${id}-provider`,
    metadata: {
      source: "static_ad",
      staticAssetId: id,
      role: "background_image",
      storageNormalized: true,
      qualityGate: { accepted: true },
      imageQa: { usable: true, decision: "accept", mode: "finished_ad" },
      score: 90,
      ...overrides.metadata,
    },
    ...overrides,
  };
}

function videoRow(id, sourceStaticAssetId, overrides = {}) {
  return {
    id: `${id}-row`,
    campaign_id: CAMPAIGN_345_REPAIR.campaignId,
    creative_id: id,
    asset_type: "ugc_video",
    status: "ready",
    file_url: `https://example.invalid/${id}.mp4`,
    thumbnail_url: null,
    provider_name: "higgsfield",
    provider_asset_id: `${id}-provider`,
    metadata: {
      storageNormalized: true,
      storageBucket: "creative-assets",
      storageContentType: "video/mp4",
      storageByteSize: 123456,
      durationSeconds: 15,
      sourceStaticAssetId,
      sourceImageUrl: `https://example.invalid/${sourceStaticAssetId}.png`,
      promptUsed: "campaign-specific UGC prompt",
      promptSource: "creative_intake",
      promptHash: "prompt-hash",
      scriptHash: "script-hash",
      campaignSpecificContext: { campaignId: CAMPAIGN_345_REPAIR.campaignId },
      videoQualityGate: { accepted: true, usable: true },
      videoProductQualityGate: {
        accepted: true,
        usable: true,
        checks: {
          hook: true,
          marketProblem: true,
          creatorPointOfView: true,
          mechanism: true,
          sourceRelevance: true,
          cta: true,
          duration: true,
        },
      },
      ...overrides.metadata,
    },
    ...overrides,
  };
}

function campaignRow(plan = {}) {
  return {
    id: CAMPAIGN_345_REPAIR.campaignId,
    owner_id: CAMPAIGN_345_REPAIR.ownerId,
    user_id: CAMPAIGN_345_REPAIR.userId,
    organization_id: CAMPAIGN_345_REPAIR.organizationId,
    launch_status: "built",
    public_slug: null,
    publish_state: "published",
    published_snapshot: { funnel: publishedFunnel() },
    plan,
  };
}

function metaProof() {
  return {
    account: {
      organization_id: CAMPAIGN_345_REPAIR.organizationId,
      status: "connected",
      hasAccessToken: true,
    },
    campaign: {
      id: CAMPAIGN_345_REPAIR.meta.campaignId,
      status: "PAUSED",
      effective_status: "PAUSED",
    },
    adset: {
      id: CAMPAIGN_345_REPAIR.meta.adSetId,
      campaign_id: CAMPAIGN_345_REPAIR.meta.campaignId,
      daily_budget: CAMPAIGN_345_REPAIR.meta.dailyBudget,
      status: "PAUSED",
      effective_status: "PAUSED",
    },
    ad: {
      id: CAMPAIGN_345_REPAIR.meta.adId,
      campaign_id: CAMPAIGN_345_REPAIR.meta.campaignId,
      adset_id: CAMPAIGN_345_REPAIR.meta.adSetId,
      creative_id: CAMPAIGN_345_REPAIR.meta.creativeId,
      status: "PAUSED",
      effective_status: "PAUSED",
    },
    creative: {
      id: CAMPAIGN_345_REPAIR.meta.creativeId,
      destinationLink: "https://app.agentdealflow.io/f/raiaan-realty",
    },
  };
}

function testSelectedStaticRepairRequiresFourReadyGroups() {
  const assets = [
    staticRow("static-ugc-proof"),
    staticRow("static-buyer-affordability-reality-check"),
    staticRow("static-buyer-early-access-homes"),
    staticRow("static-ugc-walkthrough"),
  ];
  const groups = summarizeStaticGroups(assets);

  assert.deepEqual(chooseSelectedStaticIds(groups), [
    "static-ugc-proof",
    "static-ugc-walkthrough",
    "static-buyer-affordability-reality-check",
    "static-buyer-early-access-homes",
  ]);
}

function testMissingStaticMediaBlocksRepair() {
  const assets = [
    staticRow("static-ugc-proof"),
    staticRow("static-buyer-affordability-reality-check"),
    staticRow("static-buyer-early-access-homes"),
    videoRow("video-ugc-final", "static-ugc-proof"),
  ];
  const decision = buildRepairDecision({
    campaignRow: campaignRow({}),
    assets,
    metaProof: metaProof(),
    now: "2026-05-16T00:00:00.000Z",
  });

  assert.equal(decision.sufficientEvidence, false);
  assert.match(decision.blockers.join(","), /insufficient_launch_ready_static_media/);
}

function testSelectedUgcRepairRecognizesOnlyLaunchReadyUgc() {
  const staticAssets = [
    staticRow("static-ugc-proof"),
    staticRow("static-buyer-affordability-reality-check"),
    staticRow("static-buyer-early-access-homes"),
    staticRow("static-ugc-walkthrough"),
  ];
  const acceptedStaticIds = new Set(summarizeStaticGroups(staticAssets).filter((group) => group.launchReady).map((group) => group.id));
  const videoAssets = [
    videoRow("video-ugc-final", "static-ugc-proof"),
    videoRow("video-sample", "static-ugc-proof", { metadata: { sampleOnly: true } }),
    videoRow("video-founder", "static-ugc-proof", { asset_type: "talking_head_video" }),
  ];
  const videos = summarizeVideos(videoAssets, acceptedStaticIds);

  assert.equal(videos.find((video) => video.id === "video-ugc-final")?.launchReady, true);
  assert.deepEqual(chooseSelectedUgcVideoIds(videos), ["video-ugc-final"]);
}

function testRepairBuildsPausedRuntimeAndIsIdempotentAfterApplyShape() {
  const assets = [
    staticRow("static-ugc-proof"),
    staticRow("static-buyer-affordability-reality-check"),
    staticRow("static-buyer-early-access-homes"),
    staticRow("static-ugc-walkthrough"),
    videoRow("video-ugc-final", "static-ugc-proof"),
  ];
  const firstDecision = buildRepairDecision({
    campaignRow: campaignRow({ runtime: { status: "built" } }),
    assets,
    metaProof: metaProof(),
    now: "2026-05-16T00:00:00.000Z",
  });

  assert.equal(firstDecision.sufficientEvidence, true);
  assert.equal(firstDecision.after.runtime.runtime.status, "paused");
  assert.equal(firstDecision.after.runtime.runtime.safetyState, "paused");
  assert.equal(firstDecision.after.runtime.launch_runtime.campaign_id, CAMPAIGN_345_REPAIR.meta.campaignId);
  assert.equal(firstDecision.after.row.public_slug, CAMPAIGN_345_REPAIR.aliasSlug);
  assert.deepEqual(firstDecision._afterPlan.funnel, publishedFunnel());
  assert.deepEqual(firstDecision.after.selectedMedia.selectedUgcVideoIds, ["video-ugc-final"]);

  const secondDecision = buildRepairDecision({
    campaignRow: {
      ...campaignRow(firstDecision._afterPlan),
      launch_status: "paused",
      public_slug: CAMPAIGN_345_REPAIR.aliasSlug,
    },
    assets,
    metaProof: metaProof(),
    now: "2026-05-16T00:00:00.000Z",
  });

  assert.equal(secondDecision.sufficientEvidence, true);
  assert.equal(secondDecision.idempotentNoop, true);
}

function testLegacyPublicFunnelRedirectPreemptsCampaignLookup() {
  const source = fs.readFileSync("src/app/f/[slug]/page.tsx", "utf8");
  const redirectIndex = source.indexOf("const redirectSlug = LEGACY_PUBLIC_FUNNEL_SLUG_REDIRECTS");
  const lookupIndex = source.indexOf("getPublishedCampaignBySlug(resolvedParams.slug)");

  assert.ok(redirectIndex >= 0, "legacy redirect lookup is present");
  assert.ok(lookupIndex >= 0, "public campaign lookup is present");
  assert.ok(
    redirectIndex < lookupIndex,
    "legacy paid alias redirect must run before campaign lookup so an app-state public_slug repair cannot hijack /f/raiaan-realty",
  );
}

testSelectedStaticRepairRequiresFourReadyGroups();
testMissingStaticMediaBlocksRepair();
testSelectedUgcRepairRecognizesOnlyLaunchReadyUgc();
testRepairBuildsPausedRuntimeAndIsIdempotentAfterApplyShape();
testLegacyPublicFunnelRedirectPreemptsCampaignLookup();

console.log("campaign 345 launch-state repair tests passed");
