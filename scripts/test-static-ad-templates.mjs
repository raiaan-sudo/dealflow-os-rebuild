import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const originalResolve = Module._resolveFilename;

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
  buildComposedStaticAdPreview,
  fitStaticAdText,
  normalizeStaticAdTemplateCategory,
} = require("../src/lib/services/static-ad-template-renderer.ts");
const {
  evaluateStaticVisualAssetDecision,
} = require("../src/lib/services/static-creative-visual-qa.ts");
const {
  buildCreativeSystem,
  generateStaticCreativeAds,
  mergeStaticCreativeImageResults,
} = require("../src/lib/services/creative-engine.ts");

process.env.ALLOW_OPENAI_IMAGE_GENERATION = "false";
process.env.ALLOW_HIGGSFIELD_IMAGE_GENERATION = "false";

const seller = buildComposedStaticAdPreview({
  category: "seller",
  location: "Bradford",
  headline: "What is the new price of your home?",
  overlayText: "My Bradford home price in 2019 $950K vs 2024 $1.1M",
  primaryText: "A pre-market positioning strategy compares demand before you list.",
  cta: "Check Your Home Value",
  visualPromptBrief: {
    category: "seller",
    proofStyle: "$950K to $1.1M comparison",
    mechanism: "pre-market positioning strategy",
  },
});
assert.equal(seller.category, "seller");
assert.equal(seller.templateId, "seller_price_comparison");
assert.notEqual(seller.status, "background_failed");
assert.ok(seller.proofChips.some((chip) => /\$950K/i.test(chip)));

const buyer = buildComposedStaticAdPreview({
  category: "buyer",
  location: "Austin",
  headline: "New homes available under $---K",
  overlayText: "Up to $20K towards closing costs",
  primaryText: "Get early access to homes before they hit the market.",
  cta: "Learn More",
});
assert.equal(buyer.category, "buyer");
assert.equal(buyer.templateId, "buyer_affordability");
assert.equal(buyer.cta, "See Matching Homes", "vague buyer CTA is upgraded");

const generatedCreativeInput = {
  category: "buyer",
  location: "Austin",
  headline: "Budget-matched homes before the weekend rush",
  primaryText: "A curated shortlist helps buyers compare fit before the same homes get crowded.",
  cta: "See Matching Homes",
  imageUrl: "https://example.test/background.png",
  imageGenerationState: "generated",
  imagePrompt: "TEXT-FREE BACKGROUND ASSET ONLY. Warm buyer reviewing homes in Austin.",
  visualPromptBrief: {
    category: "buyer",
    visualAssetContract: "text_free_background_v2",
    visualAssetRole: "text_free_background",
  },
  qualityGate: {
    accepted: true,
    score: 8.2,
  },
};
const generatedCreative = buildComposedStaticAdPreview(generatedCreativeInput);
assert.equal(generatedCreative.status, "final_composed", "accepted generated images are primary creative previews");
assert.equal(
  generatedCreative.backgroundMessage,
  "DealFlow composed this creative with a text-free generated background and exact app-rendered copy.",
);

const rejectedGeneratedCreative = buildComposedStaticAdPreview({
  ...generatedCreativeInput,
  imageQa: {
    usable: false,
    decision: "reject",
    reasons: ["text_heavy", "provider_returned_finished_ad"],
    textDensity: 0.22,
    layoutRisk: 0.91,
    detectedTextSamples: ["GET HOMES NOW", "XQZ PLOM"],
  },
});
assert.equal(
  rejectedGeneratedCreative.status,
  "background_rejected",
  "rejected generated images are withheld from the launch preview",
);
assert.equal(rejectedGeneratedCreative.backgroundImageUrl, null);
assert.equal(
  rejectedGeneratedCreative.backgroundMessage,
  "This visual needs a cleaner background before it can be used as launch-ready media.",
  "rejected image state uses customer-safe copy",
);

const legacyGeneratedCreative = buildComposedStaticAdPreview({
  ...generatedCreativeInput,
  imagePrompt: "Make the result look like a finished, high-converting paid social creative frame.",
  visualPromptBrief: null,
});
assert.equal(legacyGeneratedCreative.status, "background_rejected");
assert.equal(legacyGeneratedCreative.backgroundImageUrl, null);

const precon = buildComposedStaticAdPreview({
  location: "Montreal",
  headline: "New Montreal pre-con investments have arrived",
  overlayText: "10% deposit, completion 2028",
  primaryText: "Lock in today's price with a phased deposit structure.",
  cta: "Get the Full List",
});
assert.equal(precon.category, "precon");
assert.ok(precon.templateId.startsWith("precon_"));

const investor = buildComposedStaticAdPreview({
  category: "investor",
  location: "Montreal",
	  headline: "3 off-market properties this month",
	  overlayText: "ROI brief for Montreal investors",
	  primaryText: "Review cash-flow-ready properties that match your exact ROI criteria.",
	  cta: "Get Deal Flow",
	});
assert.equal(investor.templateId, "investor_roi_dashboard");

const luxury = buildComposedStaticAdPreview({
  category: "luxury",
  location: "Miami",
  headline: "Private access to a rare waterfront release",
  overlayText: "This is not publicly available",
  primaryText: "Request private access before the release is shown publicly.",
  cta: "Request Private Access",
});
assert.equal(luxury.aspectRatio, "16:9");
assert.equal(luxury.templateId, "luxury_scarcity");

assert.equal(
  normalizeStaticAdTemplateCategory({
    headline: "Breaking news: new location pre-con programs have arrived",
  }),
  "precon",
);

const fitted = fitStaticAdText({
  category: "seller",
  headline: "This is a very long headline that must fit in a deterministic static ad template without pushing the CTA or proof chips out of the preview surface",
  overlayText: "This overlay also has to be fitted because direct response ad overlays can get extremely long if a user pastes a full guarantee into the field",
  primaryText: "Long primary text should remain available below the preview while the visual surface uses a fitted version so cards do not overflow or clip.",
  cta: "Get my complete property price update report now",
});
assert.equal(fitted.overflowRisk, true);
assert.ok(fitted.headline.length <= 72);
assert.ok(fitted.overlayText.length <= 82);
assert.ok(fitted.cta.length <= 34);

const contractBrief = {
  visualAssetContract: "text_free_background_v2",
  visualAssetRole: "text_free_background",
};

assert.deepEqual(
  evaluateStaticVisualAssetDecision({
    imageUrl: "https://example.test/text-free-background.png",
    imagePrompt: "TEXT-FREE BACKGROUND ASSET ONLY. Warm buyer reviewing homes in Austin.",
    imagePromptConfig: {
      prompt: "TEXT-FREE BACKGROUND ASSET ONLY. Clean photography with negative space.",
      negativePrompt:
        "finished paid social; ad creative frame; proof modules; dashboard grids; brochure-style ad layout; poster-like typography; cta-safe bottom",
    },
    visualPromptBrief: contractBrief,
    qualityGate: { accepted: true },
  }),
  { usable: true, reason: null },
  "negative prompt legacy terms should not reject valid text-free background assets",
);

const legacyFullAdDecision = evaluateStaticVisualAssetDecision({
  imageUrl: "https://example.test/legacy-full-ad.png",
  imagePrompt:
    "TEXT-FREE BACKGROUND ASSET ONLY, but make a finished paid social ad creative frame with proof modules and a CTA-safe bottom.",
  visualPromptBrief: contractBrief,
  qualityGate: { accepted: true },
});
assert.equal(legacyFullAdDecision.usable, false, "legacy full-ad prompt instructions are still rejected");

const generatedAsset = {
  ...generatedCreativeInput,
  id: "static-preserved",
  angle: "opportunity",
  imagePromptConfig: {
    prompt: generatedCreativeInput.imagePrompt,
    negativePrompt: "poster-like typography; brochure-style ad layout; proof modules",
  },
  preferredImageModel: "gpt-image-1.5",
  scoreBreakdown: null,
  hook: generatedCreativeInput.headline,
  overlayText: generatedCreativeInput.headline,
  visualConcept: "Austin buyer source photo",
  score: 8,
  recommended: true,
};
const downgradedAsset = {
  ...generatedAsset,
  imageUrl: "https://example.test/bad-flyer.png",
  imageGenerationState: "failed",
  imageGenerationMessage: "This visual needs a cleaner background. Preview is using the composed layout while the image refreshes.",
  imageGenerationModel: "gpt-image-1.5",
  imageGenerationProvider: null,
  imageQa: {
    usable: false,
    decision: "reject",
    reasons: ["flyer_or_brochure_layout", "gibberish_text_detected"],
    textDensity: 0.31,
    layoutRisk: 0.88,
    detectedTextSamples: ["QZX PLOM"],
  },
};
const mergedAssets = mergeStaticCreativeImageResults([downgradedAsset], [generatedAsset]);
assert.equal(mergedAssets[0].imageUrl, generatedAsset.imageUrl);
assert.equal(mergedAssets[0].imageGenerationState, "generated");
assert.equal(mergedAssets[0].imageGenerationMessage, null);
assert.notEqual(mergedAssets[0].imageUrl, downgradedAsset.imageUrl, "bad retry does not overwrite previous good image");

const generationInput = {
  location: "Austin",
  audience: "first-time buyers",
  offer: "approval-first home shortlist",
  property_type: "homes",
  mechanism: "approval-first matching",
  desired_result: "more qualified buyer conversations",
  market_type: "buyer",
};
const baseStaticAds = buildCreativeSystem(generationInput).staticAds;
const reusableStaticAds = baseStaticAds.slice(0, -1).map((asset) => ({
  ...asset,
  imageUrl: `https://example.test/${asset.id}.png`,
  imageGenerationState: "generated",
  imageGenerationMessage: null,
  imageGenerationModel: "gpt-image-1.5",
  imageGenerationProvider: "higgsfield",
  qualityGate: {
    ...(asset.qualityGate ?? {}),
    accepted: true,
  },
  imagePromptConfig: {
    ...asset.imagePromptConfig,
    negativePrompt: `${asset.imagePromptConfig?.negativePrompt ?? ""}; proof modules; poster-like typography`,
  },
}));
const requestedAssetIds = [];
const missingOnlyStaticAds = await generateStaticCreativeAds({
  ...generationInput,
  reuse_static_assets: reusableStaticAds,
  provider_usage_context: {
    createForAsset: (asset) => {
      requestedAssetIds.push(asset.id);
      return null;
    },
  },
});
assert.deepEqual(
  requestedAssetIds,
  [baseStaticAds.at(-1).id],
  "missing-only retries should only request provider generation for assets without a usable preserved image",
);
for (const reusable of reusableStaticAds) {
  const result = missingOnlyStaticAds.find((asset) => asset.id === reusable.id);
  assert.equal(result?.imageUrl, reusable.imageUrl, `preserved image for ${reusable.id}`);
  assert.equal(result?.imageGenerationState, "generated", `preserved state for ${reusable.id}`);
}

const forcedRequestedAssetIds = [];
const allReusableStaticAds = baseStaticAds.map((asset) => ({
  ...asset,
  imageUrl: `https://example.test/ready-${asset.id}.png`,
  storageNormalized: true,
  imageGenerationState: "generated",
  imageGenerationMessage: null,
  imageGenerationModel: "gpt-image-1.5",
  imageGenerationProvider: "higgsfield",
  qualityGate: {
    ...(asset.qualityGate ?? {}),
    accepted: true,
  },
}));
const forcedStaticAds = await generateStaticCreativeAds({
  ...generationInput,
  force: true,
  max_static_image_generations: 1,
  reuse_static_assets: allReusableStaticAds,
  provider_usage_context: {
    createForAsset: (asset) => {
      forcedRequestedAssetIds.push(asset.id);
      return null;
    },
  },
});
assert.deepEqual(
  forcedRequestedAssetIds,
  [baseStaticAds[0].id],
  "force:true should bypass reusable-image selection and request a fresh provider generation",
);
assert.equal(
  forcedStaticAds.find((asset) => asset.id === allReusableStaticAds[0].id)?.imageUrl,
  allReusableStaticAds[0].imageUrl,
  "failed forced refresh preserves the previous good image after provider failure",
);

const boundedRequestedAssetIds = [];
await generateStaticCreativeAds({
  ...generationInput,
  max_static_image_generations: 2,
  provider_usage_context: {
    createForAsset: (asset) => {
      boundedRequestedAssetIds.push(asset.id);
      return null;
    },
  },
});
assert.deepEqual(
  boundedRequestedAssetIds,
  baseStaticAds.slice(0, 2).map((asset) => asset.id),
  "bounded static retries should only request the configured number of provider generations",
);

const boundedPriorityRequestedAssetIds = [];
await generateStaticCreativeAds({
  ...generationInput,
  max_static_image_generations: 2,
  reuse_static_assets: [
    {
      ...baseStaticAds[0],
      imageUrl: "https://example.test/rejected-full-ad.png",
      imageGenerationState: "failed",
      imageGenerationProvider: "higgsfield",
      imageQa: {
        usable: false,
        decision: "reject",
        reasons: ["provider_returned_finished_ad", "gibberish_text_detected"],
      },
    },
  ],
  provider_usage_context: {
    createForAsset: (asset) => {
      boundedPriorityRequestedAssetIds.push(asset.id);
      return null;
    },
  },
});
assert.deepEqual(
  boundedPriorityRequestedAssetIds,
  baseStaticAds.slice(1, 3).map((asset) => asset.id),
  "bounded static retries should prioritize missing backgrounds before retrying already rejected rasters",
);

const boundedFailedNoImageRequestedAssetIds = [];
await generateStaticCreativeAds({
  ...generationInput,
  max_static_image_generations: 2,
  reuse_static_assets: [
    {
      ...baseStaticAds[0],
      imageUrl: "",
      imageGenerationState: "failed",
      imageGenerationMessage: "Image generation failed.",
    },
    {
      ...baseStaticAds[1],
      imageUrl: "",
      imageGenerationState: "failed",
      imageGenerationMessage: "Image generation failed.",
    },
  ],
  provider_usage_context: {
    createForAsset: (asset) => {
      boundedFailedNoImageRequestedAssetIds.push(asset.id);
      return null;
    },
  },
});
assert.deepEqual(
  boundedFailedNoImageRequestedAssetIds,
  baseStaticAds.slice(2, 4).map((asset) => asset.id),
  "bounded static retries should try never-attempted missing backgrounds before failed no-image attempts",
);

const finishedAdCreativeIntake = {
  version: 1,
  conversationId: "finished-ad-retry-test",
  campaignId: "campaign-test",
  revisionNumber: 1,
  approvedAt: "2026-05-12T00:00:00.000Z",
  outputMode: "finished_ad",
  generationPhase: "static",
  promptVersion: {
    revisionNumber: 1,
    generatedPrompt: "Create one finished paid-social real estate ad raster with the required CTA.",
    negativePrompt: "gibberish; fake dashboard; listing sheet",
    sanitizedPreview: "Create one finished paid-social real estate ad raster with the required CTA.",
    createdAt: "2026-05-12T00:00:00.000Z",
  },
};
const staleImageFetchFailedAsset = {
  ...baseStaticAds[0],
  imageUrl: "https://example.test/stale-failed-provider-output.png",
  storageNormalized: false,
  imageGenerationState: "failed",
  imageGenerationMessage: "Generated finished-ad output could not be stored durably.",
  imageGenerationModel: "marketing_studio_image",
  imageGenerationProvider: "higgsfield_marketing_studio",
  imageQa: {
    mode: "finished_ad",
    usable: false,
    decision: "reject",
    reasons: ["image_fetch_failed"],
    textDensity: 0,
    layoutRisk: 0,
    detectedTextSamples: [],
  },
};
const secondStaleImageFetchFailedAsset = {
  ...baseStaticAds[1],
  imageUrl: "https://example.test/second-stale-failed-provider-output.png",
  storageNormalized: false,
  imageGenerationState: "failed",
  imageGenerationMessage: "Generated finished-ad output could not be stored durably.",
  imageGenerationModel: "marketing_studio_image",
  imageGenerationProvider: "higgsfield_marketing_studio",
  imageQa: {
    mode: "finished_ad",
    usable: false,
    decision: "reject",
    reasons: ["image_fetch_failed"],
    textDensity: 0,
    layoutRisk: 0,
    detectedTextSamples: [],
  },
};
const finishedAdRequestedAssetIds = [];
const finishedAdRetryResult = await generateStaticCreativeAds({
  ...generationInput,
  max_static_image_generations: 1,
  creative_intake: finishedAdCreativeIntake,
  reuse_static_assets: [
    staleImageFetchFailedAsset,
    secondStaleImageFetchFailedAsset,
    {
      ...baseStaticAds[2],
      imageUrl: "",
      imageGenerationState: "unavailable",
      imageGenerationMessage: "A cleaner image is being prepared for this creative.",
    },
  ],
  provider_usage_context: {
    createForAsset: (asset) => {
      finishedAdRequestedAssetIds.push(asset.id);
      return null;
    },
  },
});
assert.deepEqual(
  finishedAdRequestedAssetIds,
  [baseStaticAds[0].id],
  "finished_ad capped retries force a fresh provider attempt for stale image_fetch_failed concepts",
);
const firstFinishedAdResult = finishedAdRetryResult.find((asset) => asset.id === baseStaticAds[0].id);
assert.equal(firstFinishedAdResult?.imageUrl, "", "fresh finished_ad retry does not reuse the stale provider URL");
assert.notEqual(firstFinishedAdResult?.imageUrl, staleImageFetchFailedAsset.imageUrl);
const secondFinishedAdResult = finishedAdRetryResult.find((asset) => asset.id === baseStaticAds[1].id);
assert.equal(
  secondFinishedAdResult?.imageUrl,
  "",
  "finished_ad carry-forward strips stale image_fetch_failed provider URLs when not regenerated",
);
assert.notEqual(secondFinishedAdResult?.imageUrl, secondStaleImageFetchFailedAsset.imageUrl);
assert.equal(secondFinishedAdResult?.imageGenerationState, "failed");
assert.equal(secondFinishedAdResult?.imageQa?.decision, "reject");

console.log("Static ad template tests passed.");
