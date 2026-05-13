import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

Module._load = function load(request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }

  return originalLoad.call(this, request, parent, isMain);
};

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolve.call(
      this,
      path.join(repoRoot, "src", request.slice(2)),
      parent,
      isMain,
      options,
    );
  }

  return originalResolve.call(this, request, parent, isMain, options);
};

Module._extensions[".ts"] = function loadTs(module, filename) {
  const source = ts.sys.readFile(filename);
  const output = ts.transpileModule(source ?? "", {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
    fileName: filename,
  });

  module._compile(output.outputText, filename);
};

const require = createRequire(import.meta.url);
const {
  getStaticCreativeReadiness,
  getStaticPreviewStatusMessage,
  getVideoReadinessLabel,
  getVideoReadinessMessage,
  evaluateGeneratedVideoQualityGate,
  isLaunchReadyVideoCreative,
  isPlayableVideoCreative,
} = require("../src/lib/services/creative-media-readiness.ts");
const {
  buildComposedStaticAdPreview,
} = require("../src/lib/services/static-ad-template-renderer.ts");
const {
  mapStaticCreativeAssets,
  mapVideoCreativeAssets,
} = require("../src/lib/services/campaign-persistence.ts");

function readyStatic(id) {
  return {
    id,
    imageUrl: `https://supabase.example.test/storage/v1/object/public/creative-assets/user/campaign/${id}.png`,
    storageNormalized: true,
    imageGenerationState: "generated",
    imagePrompt: "Text-free background asset only for a real estate ad.",
    imagePromptConfig: null,
    visualPromptBrief: {
      visualAssetContract: "text_free_background_v2",
      visualAssetRole: "text_free_background",
    },
    qualityGate: { accepted: true },
    imageQa: { usable: true, decision: "accept", mode: "background_only", reasons: [] },
  };
}

const creatives = [
  readyStatic("primary"),
  readyStatic("review-1"),
  readyStatic("review-2"),
  {
    ...readyStatic("failed-1"),
    imageUrl: "",
    imageGenerationState: "failed",
    imageGenerationMessage: "Image preview rendering needs another attempt.",
  },
  {
    ...readyStatic("missing-1"),
    imageUrl: "",
    imageGenerationState: "unavailable",
  },
  {
    ...readyStatic("legacy-provider"),
    imageUrl: "https://provider.example.test/generated.png",
    storageNormalized: false,
  },
];

const oneSelected = getStaticCreativeReadiness(creatives, ["primary"]);
assert.equal(oneSelected.selectionLabel, "1 primary creative selected");
assert.equal(oneSelected.readyLabel, "1 selected launch-ready preview");
assert.equal(oneSelected.availableReadyLabel, "3 launch-ready previews available");
assert.equal(oneSelected.selectedReadyLabel, "1 selected launch-ready preview");
assert.equal(oneSelected.selectedBlockedCount, 0);
assert.equal(oneSelected.retryCount, 2);
assert.equal(oneSelected.missingCount, 1);
assert.match(getStaticPreviewStatusMessage(oneSelected), /1 selected launch-ready preview; 3 recommended/);
assert.match(getStaticPreviewStatusMessage(oneSelected), /optional variants need retry/);

const blockedSelection = getStaticCreativeReadiness(creatives, ["primary", "failed-1"]);
assert.equal(blockedSelection.selectedBlockedCount, 1);
assert.equal(blockedSelection.allSelectedReady, false);
assert.match(blockedSelection.issueLabel ?? "", /1 selected creative needs retry before launch/);

const stalePlanSelectedIds = ["primary", "review-1", "review-2"];
const productionLikeCreativeAssets = [
  {
    id: "newer-failed-primary",
    campaign_id: "campaign-1",
    creative_id: "campaign-1-creative-0",
    asset_type: "image_frame",
    status: "failed",
    file_url: null,
    thumbnail_url: null,
    provider_name: "gpt-image-1.5",
    provider_asset_id: null,
    copy_id: null,
    error_message: null,
    created_at: "2026-05-13T04:02:31.000Z",
    updated_at: "2026-05-13T04:02:31.000Z",
    metadata: {
      source: "static_ad",
      staticAssetId: "primary",
      role: "background_image",
      storageNormalized: false,
      qualityGate: { accepted: false },
      imageQa: { usable: true, decision: "accept", mode: "background_only", reasons: [] },
      imagePrompt: "Text-free background asset only for a real estate ad.",
      visualPromptBrief: {
        visualAssetContract: "text_free_background_v2",
        visualAssetRole: "text_free_background",
      },
      imageGenerationMessage: "A cleaner image is being prepared for this creative.",
    },
  },
  {
    id: "older-ready-primary",
    campaign_id: "campaign-1",
    creative_id: "campaign-1-creative-0",
    asset_type: "image_frame",
    status: "ready",
    file_url: "https://supabase.example.test/storage/v1/object/public/creative-assets/user/campaign/primary.png",
    thumbnail_url: "https://supabase.example.test/storage/v1/object/public/creative-assets/user/campaign/primary-thumb.png",
    provider_name: "gpt-image-1.5",
    provider_asset_id: "asset-primary",
    copy_id: null,
    error_message: null,
    created_at: "2026-05-13T03:56:30.000Z",
    updated_at: "2026-05-13T03:56:30.000Z",
    metadata: {
      source: "static_ad",
      staticAssetId: "primary",
      role: "background_image",
      storageNormalized: true,
      qualityGate: { accepted: true },
      imageQa: { usable: true, decision: "accept", mode: "background_only", reasons: [] },
      imagePrompt: "Text-free background asset only for a real estate ad.",
      imagePromptConfig: { prompt: "Text-free background asset only for a real estate ad." },
      visualPromptBrief: {
        visualAssetContract: "text_free_background_v2",
        visualAssetRole: "text_free_background",
      },
    },
  },
  {
    id: "ready-review-1",
    campaign_id: "campaign-1",
    creative_id: "campaign-1-creative-1",
    asset_type: "image_frame",
    status: "ready",
    file_url: "https://supabase.example.test/storage/v1/object/public/creative-assets/user/campaign/review-1.png",
    thumbnail_url: null,
    provider_name: "gpt-image-1.5",
    provider_asset_id: "asset-review-1",
    copy_id: null,
    error_message: null,
    created_at: "2026-05-13T03:56:30.000Z",
    updated_at: "2026-05-13T03:56:30.000Z",
    metadata: {
      source: "static_ad",
      staticAssetId: "review-1",
      role: "background_image",
      storageNormalized: true,
      qualityGate: { accepted: true },
      imageQa: { usable: true, decision: "accept", mode: "background_only", reasons: [] },
      imagePrompt: "Text-free background asset only for a real estate ad.",
      visualPromptBrief: {
        visualAssetContract: "text_free_background_v2",
        visualAssetRole: "text_free_background",
      },
    },
  },
  {
    id: "ready-review-2",
    campaign_id: "campaign-1",
    creative_id: "campaign-1-creative-2",
    asset_type: "image_frame",
    status: "ready",
    file_url: "https://supabase.example.test/storage/v1/object/public/creative-assets/user/campaign/review-2.png",
    thumbnail_url: null,
    provider_name: "gpt-image-1.5",
    provider_asset_id: "asset-review-2",
    copy_id: null,
    error_message: null,
    created_at: "2026-05-13T03:56:30.000Z",
    updated_at: "2026-05-13T03:56:30.000Z",
    metadata: {
      source: "static_ad",
      staticAssetId: "review-2",
      role: "background_image",
      storageNormalized: true,
      qualityGate: { accepted: true },
      imageQa: { usable: true, decision: "accept", mode: "background_only", reasons: [] },
      imagePrompt: "Text-free background asset only for a real estate ad.",
      visualPromptBrief: {
        visualAssetContract: "text_free_background_v2",
        visualAssetRole: "text_free_background",
      },
    },
  },
];
const productionMappedStatic = mapStaticCreativeAssets(productionLikeCreativeAssets);
const productionStaticReadiness = getStaticCreativeReadiness(productionMappedStatic, stalePlanSelectedIds);
assert.equal(productionStaticReadiness.selectedReadyCount, 3);
assert.equal(productionStaticReadiness.selectedBlockedCount, 0);
assert.equal(productionStaticReadiness.readyLabel, "3 selected launch-ready previews");
assert.equal(productionMappedStatic.find((asset) => asset.id === "primary")?.imageGenerationState, "generated");

const fallbackPreview = buildComposedStaticAdPreview({
  headline: "Toronto seller plan",
  primaryText: "Review the strategy before launch.",
  cta: "Get My Plan",
  imageUrl: "",
  imageGenerationState: "unavailable",
});
assert.equal(fallbackPreview.status, "template_fallback");
assert.doesNotMatch(fallbackPreview.backgroundMessage, /is ready/i);

const rejectedPreview = buildComposedStaticAdPreview({
  headline: "Toronto seller plan",
  primaryText: "Review the strategy before launch.",
  cta: "Get My Plan",
  imageUrl: "https://provider.example.test/generated.png",
  storageNormalized: false,
  imageGenerationState: "generated",
});
assert.equal(rejectedPreview.status, "background_rejected");
assert.doesNotMatch(rejectedPreview.backgroundMessage, /provider\.example|https?:\/\//);

const readyVideo = {
  id: "campaign-video",
  videoUrl: "https://supabase.example.test/storage/v1/object/public/creative-assets/user/campaign/video.mp4",
  videoGenerationState: "generated",
  providerName: "higgsfield",
  providerAssetId: "provider-job-1",
  storageNormalized: true,
  storageBucket: "creative-assets",
  storagePath: "user/campaign/video.mp4",
  storageContentType: "video/mp4",
  storageByteSize: 7_533_116,
  sourceStaticAssetId: "primary",
  sourceImageUrl: "https://supabase.example.test/storage/v1/object/public/creative-assets/user/campaign/primary.png",
  sourceStaticAccepted: true,
  promptUsed: "Campaign a18d77f7 Toronto buyer UGC prompt with offer and CTA.",
  promptSource: "campaign_specific_fallback",
  promptHash: "prompt-hash",
  scriptHash: "script-hash",
  campaignSpecificContext: {
    campaignId: "a18d77f7-398b-4920-8d93-8332dfff2d44",
    audience: "Toronto buyers",
    location: "Toronto, ON",
    offer: "matching homes",
    cta: "See Matching Homes",
  },
  videoQualityGate: {
    accepted: true,
    usable: true,
    decision: "accept",
    reasons: [],
  },
};
assert.equal(isPlayableVideoCreative(readyVideo), true);
assert.equal(isLaunchReadyVideoCreative(readyVideo), true);
assert.equal(getVideoReadinessLabel(readyVideo), "Campaign-specific UGC ready");
assert.match(getVideoReadinessMessage(readyVideo), /Campaign-specific app-owned UGC video is ready/);
assert.deepEqual(
  evaluateGeneratedVideoQualityGate(readyVideo, new Date("2026-05-13T00:00:00.000Z")),
  {
    accepted: true,
    usable: true,
    decision: "accept",
    reasons: [],
    evaluatedAt: "2026-05-13T00:00:00.000Z",
    mode: "deterministic_provenance",
  },
);

const productionMappedVideo = mapVideoCreativeAssets([
  {
    id: "video-row-1",
    campaign_id: "campaign-1",
    creative_id: "video-ugc-launch-proof",
    copy_id: "copy-1",
    asset_type: "ugc_video",
    status: "ready",
    file_url: readyVideo.videoUrl,
    thumbnail_url: null,
    provider_name: readyVideo.providerName,
    provider_asset_id: readyVideo.providerAssetId,
    error_message: null,
    created_at: "2026-05-13T05:08:46.000Z",
    updated_at: "2026-05-13T05:08:46.000Z",
    metadata: {
      storageNormalized: true,
      storageBucket: "creative-assets",
      storagePath: "user/campaign/video.mp4",
      storageContentType: "video/mp4",
      storageByteSize: 7_533_116,
      sourceStaticAssetId: "primary",
      sourceImageUrl: readyVideo.sourceImageUrl,
      promptSource: "campaign_specific_fallback",
      promptHash: "prompt-hash",
      scriptHash: "script-hash",
      promptUsed: readyVideo.promptUsed,
      campaignSpecificContext: readyVideo.campaignSpecificContext,
      videoQualityGate: readyVideo.videoQualityGate,
    },
  },
  ...productionLikeCreativeAssets,
]);
assert.equal(productionMappedVideo.length, 1);
assert.equal(isLaunchReadyVideoCreative(productionMappedVideo[0]), true);
assert.equal(getVideoReadinessLabel(productionMappedVideo[0]), "Campaign-specific UGC ready");

const reviewOnlyVideo = {
  ...readyVideo,
  id: "review-only-video",
  promptUsed: null,
  promptSource: null,
  promptHash: null,
  videoQualityGate: { accepted: false, usable: false, decision: "review", reasons: ["video_qa_required"] },
};
assert.equal(isPlayableVideoCreative(reviewOnlyVideo), true);
assert.equal(isLaunchReadyVideoCreative(reviewOnlyVideo), false);
assert.equal(getVideoReadinessLabel(reviewOnlyVideo), "Playable review sample");
assert.match(getVideoReadinessMessage(reviewOnlyVideo), /missing campaign-specific prompt/);

const promptSourceOnlyVideo = {
  ...readyVideo,
  id: "prompt-source-only-video",
  promptUsed: null,
  promptHash: null,
  promptSource: "campaign_specific_fallback",
};
assert.equal(isLaunchReadyVideoCreative(promptSourceOnlyVideo), false);
assert.match(getVideoReadinessMessage(promptSourceOnlyVideo), /missing campaign-specific prompt/);
assert.deepEqual(
  evaluateGeneratedVideoQualityGate(promptSourceOnlyVideo, new Date("2026-05-13T00:00:00.000Z")).reasons,
  ["missing_prompt_provenance"],
);

const sampleVideo = {
  ...readyVideo,
  id: "demo-sample-video",
  sampleOnly: true,
};
assert.equal(isLaunchReadyVideoCreative(sampleVideo), false);
assert.match(getVideoReadinessMessage(sampleVideo), /sample\/template/);

const conceptOnlyVideo = {
  videoUrl: "",
  videoGenerationState: "unavailable",
  videoGenerationMessage: null,
};
assert.equal(isPlayableVideoCreative(conceptOnlyVideo), false);
assert.equal(getVideoReadinessLabel(conceptOnlyVideo), "Concept ready, render needed");
assert.doesNotMatch(getVideoReadinessMessage(conceptOnlyVideo), /preview is ready/i);

const creativeWizardSource = fs.readFileSync("src/app/(app)/build/creatives/creative-wizard.tsx", "utf8");
const previewSource = fs.readFileSync("src/app/(app)/preview/page.tsx", "utf8");
const launchSource = fs.readFileSync("src/app/(app)/launch/page.tsx", "utf8");

for (const [name, source] of [
  ["Creative Studio", creativeWizardSource],
  ["Preview", previewSource],
  ["Launch", launchSource],
]) {
  assert.doesNotMatch(source, />\s*(Download|Export|Copy URL|Open original)\s*</i, `${name} must not expose raw asset actions`);
  assert.match(source, /controlsList="nodownload noplaybackrate"/, `${name} video controls disable download`);
  assert.match(source, /disablePictureInPicture/, `${name} disables picture-in-picture`);
}

assert.doesNotMatch(creativeWizardSource, /Ready to render/);
assert.doesNotMatch(creativeWizardSource, /Video preview concept is ready/);
assert.doesNotMatch(creativeWizardSource, /Video concept is ready/);

console.log("creative media readiness regression checks passed");
