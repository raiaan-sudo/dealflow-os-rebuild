import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
const generatedImageProviderCalls = [];

Module._load = function load(request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }

  if (request === "@/lib/ai/providers") {
    return {
      createImageAd: async (_brief, asset) => {
        generatedImageProviderCalls.push(asset.id);
        return {
          imageUrl: `https://supabase.example.test/storage/v1/object/public/creative-assets/user/campaign/${asset.id}.png`,
          overlayText: asset.hook,
          headline: asset.headline,
          primaryText: asset.primaryText,
          cta: asset.cta,
          generationState: "generated",
          generationMessage: null,
          generationModel: "test-image-model",
          generationProvider: "test-provider",
        };
      },
    };
  }

  if (request === "@/lib/services/static-creative-image-qa") {
    return {
      evaluateStaticCreativeImageQa: async () => ({
        usable: true,
        decision: "accept",
        mode: "background_only",
        reasons: [],
      }),
      getCustomerSafeImageQaMessage: () => null,
    };
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
  STATIC_LAUNCH_MIN_CREATIVE_COUNT,
} = require("../src/lib/services/creative-media-readiness.ts");
const {
  buildComposedStaticAdPreview,
} = require("../src/lib/services/static-ad-template-renderer.ts");
const {
  mapStaticCreativeAssets,
  mapVideoCreativeAssets,
} = require("../src/lib/services/campaign-persistence.ts");
const {
  generateStaticCreativeAds,
  mergeStaticCreativeImageResults,
} = require("../src/lib/services/creative-engine.ts");

function readyStatic(id) {
  return {
    id,
	    imageUrl: `https://supabase.example.test/storage/v1/object/public/creative-assets/user/campaign/${id}.png`,
	    storageNormalized: true,
	    appComposedFinal: false,
    qualityTier: "higgsfield_finished_ad",
    imageGenerationState: "generated",
    imageGenerationProvider: "higgsfield_marketing_studio",
    generationMethod: "higgsfield_marketing_studio",
    providerName: "higgsfield_marketing_studio",
    generationMode: "finished_ad",
    assetRole: "final_static_ad",
    imagePrompt: "Text-free background asset only for a real estate ad.",
    imagePromptConfig: null,
    visualPromptBrief: {
      visualAssetContract: "text_free_background_v2",
      visualAssetRole: "text_free_background",
    },
    qualityGate: { accepted: true },
    visualQualityGate: { accepted: true },
    premiumQualityGate: { accepted: true },
    visualQualityGate: { accepted: true },
    premiumQualityGate: { accepted: true },
	    imageQa: { usable: true, decision: "accept", mode: "finished_ad", reasons: [] },
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

const draftMissingProvenance = {
  ...readyStatic("merge-provenance"),
  imageUrl: "",
  storageNormalized: false,
  imageGenerationState: "failed",
  imageGenerationProvider: null,
  generationMethod: null,
  providerName: null,
  generationMode: null,
  assetRole: null,
  imageQa: null,
  visualQualityGate: null,
  premiumQualityGate: null,
};
const persistedFinishedRender = readyStatic("merge-provenance");
const [mergedFinishedRender] = mergeStaticCreativeImageResults(
  [draftMissingProvenance],
  [persistedFinishedRender],
);
assert.equal(mergedFinishedRender.imageGenerationProvider, "higgsfield_marketing_studio");
assert.equal(mergedFinishedRender.generationMethod, "higgsfield_marketing_studio");
assert.equal(mergedFinishedRender.providerName, "higgsfield_marketing_studio");
assert.equal(mergedFinishedRender.generationMode, "finished_ad");
assert.equal(mergedFinishedRender.assetRole, "final_static_ad");
assert.equal(
  getStaticCreativeReadiness([mergedFinishedRender], [mergedFinishedRender.id]).launchReadyCount,
  1,
  "persisted Higgsfield finished renders must keep provenance fields when merged back into the campaign plan",
);

const reviewOnlyStaticSet = Array.from({ length: STATIC_LAUNCH_MIN_CREATIVE_COUNT }, (_, index) => ({
  id: `review-only-preview-${index + 1}`,
  imageUrl: null,
  storageNormalized: false,
  imageGenerationState: "unavailable",
  imageGenerationMessage: "Review-only placeholder. Select launch-ready media before launch.",
  imagePrompt: null,
  imagePromptConfig: null,
  visualPromptBrief: {
    visualAssetContract: "review-only preview placeholder",
    visualAssetRole: "layout_acceptance_only",
  },
  qualityGate: { accepted: false, hardFailures: ["review_only_preview"] },
  imageQa: {
    usable: false,
    decision: "review",
    mode: "background_only",
    reasons: ["review_only_preview"],
  },
}));
const reviewOnlyReadiness = getStaticCreativeReadiness(
  reviewOnlyStaticSet,
  reviewOnlyStaticSet.map((creative) => creative.id),
);
assert.equal(reviewOnlyReadiness.selectedReadyCount, 0);
assert.equal(reviewOnlyReadiness.allSelectedReady, false);
assert.equal(reviewOnlyReadiness.selectedMinimumMet, false);

const unselectedPreparingReadiness = getStaticCreativeReadiness(creatives, []);
assert.equal(unselectedPreparingReadiness.selectedReadyCount, 0);
assert.equal(unselectedPreparingReadiness.launchReadyCount, 3);
assert.equal(unselectedPreparingReadiness.requiredReadyCount, 3);
assert.equal(unselectedPreparingReadiness.requiredMissingCount, 1);
assert.equal(unselectedPreparingReadiness.optionalReadyCount, 0);
assert.match(unselectedPreparingReadiness.issueLabel ?? "", /4 launch-ready static ads required; 3 available now/);
assert.doesNotMatch(unselectedPreparingReadiness.issueLabel ?? "", /launch-ready ads are available now/);
assert.match(getStaticPreviewStatusMessage(unselectedPreparingReadiness), /3 launch-ready previews available; 4 required for launch/);
assert.doesNotMatch(getStaticPreviewStatusMessage(unselectedPreparingReadiness), /launch can continue/);

const unselectedReviewOnlyReadiness = getStaticCreativeReadiness(reviewOnlyStaticSet, []);
assert.equal(unselectedReviewOnlyReadiness.selectedReadyCount, 0);
assert.equal(unselectedReviewOnlyReadiness.launchReadyCount, 0);
assert.equal(unselectedReviewOnlyReadiness.requiredReadyCount, 0);
assert.equal(unselectedReviewOnlyReadiness.requiredMissingCount, 4);
assert.match(unselectedReviewOnlyReadiness.issueLabel ?? "", /4 launch-ready static ads required; 0 available now/);
assert.doesNotMatch(unselectedReviewOnlyReadiness.issueLabel ?? "", /launch-ready ads are available now/);
assert.match(getStaticPreviewStatusMessage(unselectedReviewOnlyReadiness), /0 launch-ready previews available; 4 required for launch/);
assert.doesNotMatch(getStaticPreviewStatusMessage(unselectedReviewOnlyReadiness), /launch can continue/);

const appFallbackTemplateReadiness = getStaticCreativeReadiness([
  {
    ...readyStatic("app-fallback-template"),
    qualityTier: "draft_preview",
    sourceBackgroundKind: "app_fallback_visual",
    sourceBackgroundProvider: null,
    sourceBackgroundAssetId: null,
    visualQualityGate: { accepted: false },
    premiumQualityGate: { accepted: false },
    imageQa: {
      usable: false,
      decision: "review",
      mode: "app_composed_final",
      reasons: ["app_fallback_visual_not_launch_ready", "generic_template_asset"],
    },
  },
], ["app-fallback-template"]);
assert.equal(appFallbackTemplateReadiness.selectedReadyCount, 0, "app fallback template cards cannot be launch-ready");
assert.equal(appFallbackTemplateReadiness.allSelectedReady, false, "app fallback template cards cannot satisfy static floor");

const oneSelected = getStaticCreativeReadiness(creatives, ["primary"]);
assert.equal(oneSelected.selectionLabel, "1 primary creative selected");
assert.equal(oneSelected.readyLabel, "1 selected launch-ready preview");
assert.equal(oneSelected.availableReadyLabel, "3 launch-ready previews available");
assert.equal(oneSelected.selectedReadyLabel, "1 selected launch-ready preview");
assert.equal(oneSelected.selectedBlockedCount, 0);
assert.equal(oneSelected.selectedMinimumMet, false);
assert.equal(oneSelected.allSelectedReady, false);
assert.equal(oneSelected.retryCount, 2);
assert.equal(oneSelected.missingCount, 1);
assert.match(getStaticPreviewStatusMessage(oneSelected), /1 selected launch-ready preview; 4 required for launch/);
assert.match(getStaticPreviewStatusMessage(oneSelected), /4 launch-ready static ads required/);

const blockedSelection = getStaticCreativeReadiness(creatives, ["primary", "failed-1"]);
assert.equal(blockedSelection.selectedBlockedCount, 1);
assert.equal(blockedSelection.allSelectedReady, false);
assert.match(blockedSelection.issueLabel ?? "", /1 selected creative needs retry before launch/);

const allFailedSelection = getStaticCreativeReadiness([
  { ...readyStatic("selected-primary"), imageUrl: "", imageGenerationState: "failed", qualityGate: { accepted: false } },
  { ...readyStatic("selected-ugc-proof"), imageUrl: "", imageGenerationState: "failed", qualityGate: { accepted: false } },
  { ...readyStatic("selected-ugc-walkthrough"), imageUrl: "", imageGenerationState: "failed", qualityGate: { accepted: false } },
], ["selected-primary", "selected-ugc-proof", "selected-ugc-walkthrough"]);
assert.equal(allFailedSelection.selectedReadyCount, 0);
assert.equal(allFailedSelection.selectedBlockedCount, 3);
assert.equal(allFailedSelection.allSelectedReady, false);
assert.match(getStaticPreviewStatusMessage(allFailedSelection), /0 selected launch-ready previews; 4 required for launch/);
assert.match(getStaticPreviewStatusMessage(allFailedSelection), /3 selected creatives need retry before launch/);

const fourSelected = getStaticCreativeReadiness([
  readyStatic("primary"),
  readyStatic("review-1"),
  readyStatic("review-2"),
  readyStatic("review-3"),
  readyStatic("review-4"),
], ["primary", "review-1", "review-2", "review-3"]);
assert.equal(fourSelected.minimumRequiredCount, STATIC_LAUNCH_MIN_CREATIVE_COUNT);
assert.equal(fourSelected.selectedMinimumMet, true);
assert.equal(fourSelected.allSelectedReady, true);
assert.equal(fourSelected.requiredReadyCount, 4);
assert.equal(fourSelected.requiredMissingCount, 0);
assert.equal(fourSelected.optionalReadyCount, 1);
assert.match(getStaticPreviewStatusMessage(fourSelected), /4 selected launch-ready previews; 4 required for launch/);

const currentBriefContext = {
  staticBriefHash: "static-brief-current",
  offerHash: "offer-current",
  ctaHash: "cta-current",
  brandHash: "brand-current",
};
const currentBriefCreative = {
  ...readyStatic("current-brief-static"),
  ...currentBriefContext,
};
const staleBriefCreative = {
  ...readyStatic("stale-brief-static"),
  staticBriefHash: "static-brief-old",
  offerHash: "offer-current",
  ctaHash: "cta-current",
  brandHash: "brand-current",
};
const staleStaticReadiness = getStaticCreativeReadiness(
  [currentBriefCreative, staleBriefCreative],
  ["current-brief-static", "stale-brief-static"],
  currentBriefContext,
);
assert.equal(staleStaticReadiness.selectedReadyCount, 1);
assert.equal(staleStaticReadiness.selectedStaleCount, 1);
assert.equal(staleStaticReadiness.allSelectedReady, false);
assert.match(staleStaticReadiness.issueLabel ?? "", /Older render, needs refresh/);

process.env.ALLOW_OPENAI_IMAGE_GENERATION = "true";
process.env.OPENAI_API_KEY = "test-openai-key";
const selectedStaticProofIds = [
  "static-buyer-affordability-reality-check",
  "static-ugc-proof",
  "static-ugc-walkthrough",
];
const selectedSetGeneratedStaticAds = await generateStaticCreativeAds({
  location: "Toronto, ON",
  audience: "home buyers searching for $600k-$900k homes in Toronto, ON",
  offer: "Under-market Deals",
  market_type: "buyer",
  max_static_image_generations: 3,
  selected_static_asset_ids: selectedStaticProofIds,
  provider_usage_context: {
    createForAsset: () => ({
      reserve: async () => ({ eventId: null }),
      mark: async () => null,
    }),
  },
});
assert.deepEqual(generatedImageProviderCalls.slice(0, 3), selectedStaticProofIds);
const selectedStaticById = new Map(selectedSetGeneratedStaticAds.map((asset) => [asset.id, asset]));
for (const selectedId of selectedStaticProofIds) {
  assert.equal(selectedStaticById.get(selectedId)?.imageGenerationState, "generated");
  assert.match(selectedStaticById.get(selectedId)?.imageUrl ?? "", /creative-assets/);
}

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
	      headline: "Sell Your Home in 90 Days. Delivered through a tighter property selection process.",
	      primaryText: "Toronto homeowners can review a 90-day sale plan. Delivered through a tighter property selection process.",
	      storageNormalized: true,
	      appComposedFinal: true,
	      qualityGate: { accepted: true },
	      imageQa: { usable: true, decision: "accept", mode: "app_composed_final", reasons: [] },
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
	      appComposedFinal: true,
	      qualityGate: { accepted: true },
	      imageQa: { usable: true, decision: "accept", mode: "app_composed_final", reasons: [] },
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
	      appComposedFinal: true,
	      qualityGate: { accepted: true },
	      imageQa: { usable: true, decision: "accept", mode: "app_composed_final", reasons: [] },
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
assert.equal(productionStaticReadiness.selectedReadyCount, 0);
assert.equal(productionStaticReadiness.selectedBlockedCount, 3);
assert.equal(productionStaticReadiness.selectedMinimumMet, false);
assert.equal(productionStaticReadiness.allSelectedReady, false);
assert.equal(productionStaticReadiness.readyLabel, "0 selected launch-ready previews");
assert.equal(productionMappedStatic.find((asset) => asset.id === "primary")?.imageGenerationState, "failed");
assert.doesNotMatch(productionMappedStatic.find((asset) => asset.id === "primary")?.headline ?? "", /Delivered through|property selection/i);
assert.doesNotMatch(productionMappedStatic.find((asset) => asset.id === "primary")?.primaryText ?? "", /Delivered through|property selection/i);

const fallbackPreview = buildComposedStaticAdPreview({
  headline: "Toronto seller plan",
  primaryText: "Review the strategy before launch.",
  cta: "Get My Plan",
  imageUrl: "",
  imageGenerationState: "unavailable",
});
assert.equal(fallbackPreview.status, "template_fallback");
assert.match(fallbackPreview.backgroundMessage, /Concept preview is ready/i);
assert.doesNotMatch(fallbackPreview.backgroundMessage, /launch-ready|Final ad ready/i);

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

const higgsfieldFinishedPreview = buildComposedStaticAdPreview(readyStatic("higgsfield-finished-preview"));
assert.equal(higgsfieldFinishedPreview.status, "final_composed");
assert.equal(
  higgsfieldFinishedPreview.backgroundImageUrl,
  "https://supabase.example.test/storage/v1/object/public/creative-assets/user/campaign/higgsfield-finished-preview.png",
);

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
  durationSeconds: 20,
  targetDurationSeconds: 20,
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
  videoProductQualityGate: {
    accepted: true,
    usable: true,
    decision: "accept",
    reasons: [],
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
      durationSeconds: 20,
      targetDurationSeconds: 20,
      sourceStaticAssetId: "primary",
      sourceImageUrl: readyVideo.sourceImageUrl,
      promptSource: "campaign_specific_fallback",
      promptHash: "prompt-hash",
      scriptHash: "script-hash",
      promptUsed: readyVideo.promptUsed,
      campaignSpecificContext: readyVideo.campaignSpecificContext,
      videoQualityGate: readyVideo.videoQualityGate,
      videoProductQualityGate: readyVideo.videoProductQualityGate,
    },
  },
  ...productionLikeCreativeAssets,
]);
assert.equal(productionMappedVideo.length, 1);
assert.equal(isLaunchReadyVideoCreative(productionMappedVideo[0]), false, "UGC tied to non-premium static source cannot be launch-ready");
assert.equal(getVideoReadinessLabel(productionMappedVideo[0]), "Playable review sample");

const videoOnlyMappedCreativeStudioRead = mapVideoCreativeAssets([
  {
    id: "video-row-video-only",
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
    created_at: "2026-05-13T05:09:46.000Z",
    updated_at: "2026-05-13T05:09:46.000Z",
    metadata: {
      storageNormalized: true,
      storageBucket: "creative-assets",
      storagePath: "user/campaign/video.mp4",
      storageContentType: "video/mp4",
      storageByteSize: 7_533_116,
      durationSeconds: 20,
      targetDurationSeconds: 20,
      sourceStaticAssetId: "primary",
      sourceStaticAccepted: true,
      sourceImageUrl: readyVideo.sourceImageUrl,
      promptSource: "campaign_specific_fallback",
      promptHash: "prompt-hash",
      scriptHash: "script-hash",
      promptUsed: readyVideo.promptUsed,
      campaignSpecificContext: readyVideo.campaignSpecificContext,
      videoQualityGate: readyVideo.videoQualityGate,
      videoProductQualityGate: readyVideo.videoProductQualityGate,
    },
  },
]);
assert.equal(isLaunchReadyVideoCreative(videoOnlyMappedCreativeStudioRead[0]), true);

const buildCreativePageSource = fs.readFileSync(
  path.join(repoRoot, "src/app/(app)/build/creatives/page.tsx"),
  "utf8",
);
assert.match(
  buildCreativePageSource,
  /videoProductQualityGate:\s*video\.videoProductQualityGate\s*\?\?\s*null/,
  "Build Creative Studio must serialize videoProductQualityGate so launch-ready UGC does not fall back to review samples",
);

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

const lowQualityUgcVideo = {
  ...readyVideo,
  id: "generic-ugc-video",
  videoProductQualityGate: {
    accepted: false,
    usable: false,
    decision: "review",
    reasons: ["generic_creator_output"],
    checks: {
      hook: true,
      marketProblem: false,
      creatorPointOfView: false,
      mechanism: false,
      sourceRelevance: false,
      cta: true,
      duration: true,
    },
  },
};
assert.equal(isLaunchReadyVideoCreative(lowQualityUgcVideo), false);
assert.match(getVideoReadinessMessage(lowQualityUgcVideo), /DealFlow review/);
assert.doesNotMatch(getVideoReadinessMessage(lowQualityUgcVideo), /QA|metadata|storage|provider|job/i);
assert.deepEqual(
  evaluateGeneratedVideoQualityGate(lowQualityUgcVideo, new Date("2026-05-13T00:00:00.000Z")).reasons,
  ["missing_product_quality_acceptance"],
);

const tooShortUgcVideo = {
  ...readyVideo,
  id: "too-short-ugc-video",
  durationSeconds: 5,
};
assert.equal(isLaunchReadyVideoCreative(tooShortUgcVideo), false);
assert.match(getVideoReadinessMessage(tooShortUgcVideo), /too short/);
assert.deepEqual(
  evaluateGeneratedVideoQualityGate(tooShortUgcVideo, new Date("2026-05-13T00:00:00.000Z")).reasons,
  ["video_duration_too_short"],
);

const missingDurationUgcVideo = {
  ...readyVideo,
  id: "missing-duration-ugc-video",
  durationSeconds: null,
};
assert.equal(isLaunchReadyVideoCreative(missingDurationUgcVideo), false);
assert.match(getVideoReadinessMessage(missingDurationUgcVideo), /missing verified duration metadata/);
assert.deepEqual(
  evaluateGeneratedVideoQualityGate(missingDurationUgcVideo, new Date("2026-05-13T00:00:00.000Z")).reasons,
  ["missing_video_duration_metadata"],
);

const conceptOnlyVideo = {
  videoUrl: "",
  videoGenerationState: "unavailable",
  videoGenerationMessage: null,
};
assert.equal(isPlayableVideoCreative(conceptOnlyVideo), false);
assert.equal(getVideoReadinessLabel(conceptOnlyVideo), "Concept ready, render needed");
assert.doesNotMatch(getVideoReadinessMessage(conceptOnlyVideo), /preview is ready/i);

const creativeWizardSource = fs.readFileSync("src/app/(app)/build/creatives/creative-wizard.tsx", "utf8");
const buildCreativesPageSource = fs.readFileSync("src/app/(app)/build/creatives/page.tsx", "utf8");
const selectAdRouteSource = fs.readFileSync("src/app/api/campaigns/[id]/select-ad/route.ts", "utf8");
const previewSource = fs.readFileSync("src/app/(app)/preview/page.tsx", "utf8");
const launchSource = fs.readFileSync("src/app/(app)/launch/page.tsx", "utf8");
const customerVideoPlayerSource = fs.readFileSync("src/components/campaign/customer-video-player.tsx", "utf8");
const paywallAccessSource = fs.readFileSync("src/lib/paywall-access.ts", "utf8");
const funnelPreviewSource = fs.readFileSync("src/components/funnel/funnel-preview.tsx", "utf8");
const builderPanelsSource = fs.readFileSync("src/components/campaign/builder/builder-panels.tsx", "utf8");
const campaignBuilderWorkspaceSource = fs.readFileSync("src/components/campaign/campaign-builder-workspace.tsx", "utf8");

for (const [name, source] of [
  ["Creative Studio", creativeWizardSource],
  ["Preview", previewSource],
  ["Launch", launchSource],
]) {
  assert.doesNotMatch(source, />\s*(Download|Export|Copy URL|Open original)\s*</i, `${name} must not expose raw asset actions`);
  assert.match(source, /controlsList="nodownload noplaybackrate"/, `${name} video controls disable download`);
  assert.match(source, /disablePictureInPicture/, `${name} disables picture-in-picture`);
}
assert.match(customerVideoPlayerSource, /controls=\{false\}/, "customer video player must not expose native video controls");
assert.match(customerVideoPlayerSource, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/, "customer video player suppresses context-menu raw file actions");
for (const [name, source] of [
  ["Funnel preview", funnelPreviewSource],
  ["Builder panels", builderPanelsSource],
  ["Campaign builder workspace", campaignBuilderWorkspaceSource],
]) {
  assert.match(source, /CustomerVideoPlayer/, `${name} must use the customer video player`);
  assert.doesNotMatch(source, /<video[\s\S]{0,260}\bcontrols\b(?!List)/, `${name} must not render native video controls`);
}
assert.match(creativeWizardSource, /draft concept\{draftCreatives\.length === 1 \? "" : "s"\} need regeneration/, "Creative Studio separates draft concepts from launch-ready carousel");
assert.match(creativeWizardSource, /Pick at least \$\{STATIC_LAUNCH_MIN_CREATIVE_COUNT\} launch-ready static ads/, "Creative Studio treats four static ads as the launch floor");
assert.match(creativeWizardSource, /Render fresh UGC video/, "stale UGC renders can be refreshed against the approved script");
assert.match(creativeWizardSource, /videoMatchesApprovedScript/, "Creative Studio blocks stale UGC videos whose script hash no longer matches the approved script");
assert.match(creativeWizardSource, /currentVideoStatusJob/, "Creative Studio tracks video status polling jobs after the initial render job completes");
assert.match(creativeWizardSource, /currentVideoRenderJob/, "Creative Studio uses a unified video render job state for customer messaging and polling");
assert.match(creativeWizardSource, /setActiveVideoJobId\(data\.job\.id\)/, "Creative Studio keeps deferred UGC jobs active for browser polling");
assert.match(creativeWizardSource, /window\.setInterval\(\(\) => \{\s*router\.refresh\(\);\s*\}, 10_000\)/s, "Creative Studio refreshes while UGC jobs are deferred to the worker");
assert.match(buildCreativesPageSource, /creativeIntake\?\.brief\?\.ugcScriptHash \?\?/, "Creative Studio must pass the canonical approved UGC script hash to the client");
assert.match(selectAdRouteSource, /mapVideoCreativeAssets/, "Save launch package must validate UGC selections against current creative_assets video rows");
assert.match(selectAdRouteSource, /if \(!videoById\.has\(video\.id\)\)/, "Save launch package must preserve the newest launch-ready UGC asset when duplicate creative IDs exist");
assert.match(creativeWizardSource, /selectedCount=\{selected \? selectedCreatives\.length : null\}/, "retry cards cannot inherit selected count badges");
assert.match(creativeWizardSource, /!activeCreativeLaunchReady && \(activeCreative\.imageGenerationState === "failed" \|\| activeCreative\.qualityGate\?\.accepted === false\)/, "launch-ready Higgsfield renders must not keep showing a retry CTA because of legacy copy-quality flags");
assert.match(creativeWizardSource, /selectedUgcVideoIds/, "Creative Studio persists selected UGC launch video IDs");
assert.match(creativeWizardSource, /Select UGC for launch/, "Creative Studio lets UGC videos be selected like static creatives");
assert.match(previewSource, /getSelectedUgcVideoIdsFromPlan/, "Preview consumes persisted selected UGC video IDs");
assert.match(previewSource, /selectedUgcVideoIds\.length > 0 \? "Selected UGC video ads" : "UGC video options"/, "Preview labels unselected UGC fallback as options, not selected ads");
assert.match(previewSource, /dedupeVideoIds/, "Preview dedupes duplicate UGC creative IDs before display/readiness");
assert.match(launchSource, /getSelectedUgcVideoIdsFromPlan/, "Launch consumes persisted selected UGC video IDs");
assert.match(launchSource, /dedupeVideoIds/, "Launch dedupes duplicate UGC creative IDs before display/readiness");
assert.match(launchSource, /\/build\/creatives\?campaignId=/, "Launch missing-creative CTA must return to Creative Studio");

assert.doesNotMatch(creativeWizardSource, /Ready to render/);
assert.doesNotMatch(creativeWizardSource, /Video preview concept is ready/);
assert.doesNotMatch(creativeWizardSource, /Video concept is ready/);
assert.doesNotMatch(paywallAccessSource, /campaignId: requestedCampaignId,\s*record: null/s, "invalid requested campaign IDs must not become active campaign context");
assert.match(paywallAccessSource, /campaignId: resolvedRecord\?\.campaign\.id \?\? null/, "campaign context must come from an owned resolved record");
assert.match(
  fs.readFileSync("src/lib/services/campaign-persistence.ts", "utf8"),
  /selected_static_asset_ids: generationPreferredStaticAssetIds/,
  "capped static regeneration must target the selected or default launch set",
);

console.log("creative media readiness regression checks passed");
process.exit(0);
