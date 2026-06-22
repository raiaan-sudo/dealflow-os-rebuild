import assert from "node:assert/strict";
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
const {
  evaluateCreativeQuality,
} = require("../src/lib/services/media-buyer-framework.ts");

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

const sellerVerboseOffer = buildComposedStaticAdPreview({
  category: "seller",
  location: "Brampton, ON",
  headline: "14-Day Home Sale Plan. Delivered through a buyer consultation and qualification system for home buyers.",
  overlayText: "Preview 14-Day Home Sale Plan",
  primaryText: "Before you list in Brampton, ON, check your true home value range. A buyer consultation and qualification system gives you neighborhood sale options.",
  cta: "Fill Out A Quick Form To See How We Can Review A 14-Day Home Sale Plan",
  offer: "14-Day Home Sale Plan. Delivered through a buyer consultation and qualification system for home buyers.",
});
assert.equal(sellerVerboseOffer.headline, "14-Day Home Sale Plan");
assert.equal(sellerVerboseOffer.overlayText, "14-Day Home Sale Plan");
assert.doesNotMatch(sellerVerboseOffer.headline, /preview|buyer consultation|qualification system|home buyers/i);
assert.doesNotMatch(sellerVerboseOffer.overlayText, /preview|buyer consultation|qualification system|home buyers/i);
assert.doesNotMatch(sellerVerboseOffer.primaryText, /buyer consultation|qualification system|home buyers/i);

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
assert.equal(buyer.cta, "Learn More", "approved CTA text stays locked even when it is generic");

const sellerApprovedCtaPreview = buildComposedStaticAdPreview({
  category: "seller",
  location: "Toronto, ON",
  headline: "Sell Your Home in 90 Days or We Buy It.",
  overlayText: "Sell Your Home in 90 Days or We Buy It.",
  primaryText: "Toronto sellers can review the plan before listing.",
  cta: "Click Learn More To Get Started",
});
assert.equal(sellerApprovedCtaPreview.cta, "Click Learn More To Get Started", "static visual CTA uses the approved CTA, not the category fallback");

const offMarketBuyerAds = await generateStaticCreativeAds({
  location: "Toronto, ON",
  audience: "buyers",
  offer: "Off-market Property Access",
  market_type: "buyer",
  property_type: "homes",
});
assert.equal(offMarketBuyerAds.length, 6, "buyer campaigns still produce a six-concept static test set");
for (const ad of offMarketBuyerAds) {
  const combined = `${ad.headline} ${ad.primaryText} ${ad.overlayText} ${ad.cta} ${ad.visualConcept}`;
  assert.match(
    combined,
    /off[-\s]?market|private listing|private opportunit|distressed-sale|property access/i,
    `static creative ${ad.id} must stay aligned to the off-market property access offer`,
  );
  assert.doesNotMatch(combined, /600\+\s*credit|approval path|home list/i, `static creative ${ad.id} must not drift back to credit/home-list copy`);
}

const zeroProviderRequestedAssetIds = [];
const immediateConceptAds = await generateStaticCreativeAds({
  location: "Toronto, ON",
  audience: "homeowners",
  offer: "Sell Your Home in 90 Days or We Buy It",
  market_type: "seller",
  max_static_image_generations: 0,
  provider_usage_context: {
    createForAsset: (asset) => {
      zeroProviderRequestedAssetIds.push(asset.id);
      return null;
    },
  },
});
assert.equal(immediateConceptAds.length, 6, "zero-provider static generation still produces the full app-rendered concept set");
assert.deepEqual(zeroProviderRequestedAssetIds, [], "immediate app-rendered concepts do not call the image provider");
assert.ok(
  immediateConceptAds.every((ad) => ad.imageGenerationState === "unavailable" && !ad.imageUrl),
  "immediate app-rendered concepts stay non-launch-ready until final images render",
);

const approvedSellerContext = {
  version: 1,
  conversationId: "seller-cta-lock-test",
  campaignId: "campaign-seller-cta-lock",
  revisionNumber: 1,
  approvedAt: "2026-05-21T00:00:00.000Z",
  outputMode: "finished_ad",
  generationPhase: "static",
  requiredOffer: "Sell Your Home in 90 Days or We Buy It",
  requiredOfferTitle: "Sell Your Home in 90 Days or We Buy It",
  requiredCta: "Click Learn More To Get Started",
  market: "Toronto, ON",
  targetAudience: "Sellers",
  brokerageBrand: "eXp",
  staticBriefHash: "seller-static-brief-current",
  offerHash: "seller-offer-current",
  ctaHash: "seller-cta-current",
  brandHash: "seller-brand-current",
  promptVersion: {
    revisionNumber: 1,
    generatedPrompt: "MARKETING STUDIO FINISHED AD CREATIVE. Create a seller ad with the exact approved offer and CTA.",
    negativePrompt: "wrong CTA; generic category CTA",
    sanitizedPreview: "Seller CTA proof prompt",
    createdAt: "2026-05-21T00:00:00.000Z",
  },
};
const approvedSellerAds = await generateStaticCreativeAds({
  campaign_id: "campaign-seller-cta-lock",
  location: "Toronto, ON",
  audience: "Sellers",
  offer: "Sell Your Home in 90 Days or We Buy It",
  market_type: "seller",
  creative_intake: approvedSellerContext,
  max_static_image_generations: 0,
});
for (const ad of approvedSellerAds) {
  const combined = `${ad.headline} ${ad.primaryText} ${ad.overlayText} ${ad.cta}`;
  assert.equal(ad.cta, "Click Learn More To Get Started", `approved CTA is locked for ${ad.id}`);
  assert.doesNotMatch(combined, /Check My 90-Day Sale Plan|Check Your Home Value/i, `autogenerated CTA drift is removed from ${ad.id}`);
  assert.equal(ad.qualityGate?.accepted, true, `seller buyout offer is treated as a valid risk-reversal offer for ${ad.id}`);
}

const generatedCreativeInput = {
  category: "buyer",
  location: "Austin",
  headline: "Budget-matched homes before the weekend rush",
  primaryText: "A curated shortlist helps buyers compare fit before the same homes get crowded.",
  cta: "See Matching Homes",
	  imageUrl: "https://example.test/background.png",
		  storageNormalized: true,
		  appComposedFinal: true,
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
      visualQualityGate: { accepted: true },
      premiumQualityGate: { accepted: true },
		  imageQa: { usable: true, decision: "accept", mode: "app_composed_final", reasons: [] },
	};
const generatedCreative = buildComposedStaticAdPreview(generatedCreativeInput);
assert.equal(generatedCreative.status, "background_rejected", "non-premium app-composed images stay draft/review-only");
assert.equal(
  generatedCreative.backgroundMessage,
  "Premium visual polish needs another attempt. Launch-ready final ads remain available when selected.",
);

const finishedAdPromptQuality = evaluateCreativeQuality({
  category: "buyer",
  offer: "Get 3 private shortlist homes this week before public sites",
  mechanism: "private access matching system",
  audience: "Toronto buyers",
  hook: "Before public search gets crowded, check this first.",
  headline: "Toronto homes matched this week",
  primaryText: "A private access matching system helps Toronto buyers review 3 shortlist homes this week before public search gets crowded.",
  overlayText: "3 private homes this week",
  cta: "See Matching Homes This Week",
  visualConcept: "buyer listing-alert and affordability collage with clean direct-response layout",
  imagePrompt:
    "MARKETING STUDIO FINISHED AD CREATIVE. Use one dominant hook area, one proof area, and a clear CTA-safe zone. No fake dashboard, no fake listing sheet, no app UI, no gibberish, no tiny text.",
});
assert.equal(
  finishedAdPromptQuality.accepted,
  true,
  "finished-ad prompt contract with timing and prohibition wording is accepted",
);

const missingTimingQuality = evaluateCreativeQuality({
  category: "buyer",
  offer: "Private buyer shortlist",
  mechanism: "private access matching system",
  audience: "Toronto buyers",
  hook: "Before public search gets crowded, check this first.",
  headline: "Toronto homes matched privately",
  primaryText: "A private access matching system helps Toronto buyers review shortlist homes before public search gets crowded.",
  overlayText: "Private buyer shortlist",
  cta: "See Matching Homes",
  visualConcept: "buyer listing-alert and affordability collage with clean direct-response layout",
  imagePrompt: "MARKETING STUDIO FINISHED AD CREATIVE. Use one dominant hook area and a clear CTA-safe zone.",
});
assert.equal(missingTimingQuality.accepted, false, "product-quality gate still rejects missing timing context");
assert.ok(
  missingTimingQuality.hardFailures.some((failure) => /timeframe|timing/i.test(failure)),
  "missing timing maps to an actionable hard failure",
);

const overlayCropQuality = evaluateCreativeQuality({
  category: "buyer",
  offer: "Get 3 private shortlist homes this week before public sites",
  mechanism: "private access matching system",
  audience: "Toronto buyers",
  hook: "Before public search gets crowded, check this first.",
  headline: "Toronto homes matched this week",
  primaryText: "A private access matching system helps Toronto buyers review 3 shortlist homes this week before public search gets crowded.",
  overlayText: "3 private homes this week",
  cta: "See Matching Homes This Week",
  visualConcept: "generic stock photo with awkward crop and covered text over the CTA",
  imagePrompt: "MARKETING STUDIO FINISHED AD CREATIVE. Use one dominant hook area and a clear CTA-safe zone.",
});
assert.equal(overlayCropQuality.accepted, false, "product-quality gate still rejects overlay/crop/readability defects");
assert.ok(
  overlayCropQuality.hardFailures.some((failure) => /readability|overlay|crop/i.test(failure)),
  "overlay/crop defect maps to an actionable hard failure",
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
  "Premium visual polish needs another attempt. Launch-ready final ads remain available when selected.",
  "rejected image state uses customer-safe copy",
);

const legacyGeneratedCreative = buildComposedStaticAdPreview({
  ...generatedCreativeInput,
  appComposedFinal: false,
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
    storageNormalized: true,
    imagePrompt: "TEXT-FREE BACKGROUND ASSET ONLY. Warm buyer reviewing homes in Austin.",
    imagePromptConfig: {
      prompt: "TEXT-FREE BACKGROUND ASSET ONLY. Clean photography with negative space.",
      negativePrompt:
        "finished paid social; ad creative frame; proof modules; dashboard grids; brochure-style ad layout; poster-like typography; cta-safe bottom",
    },
    visualPromptBrief: contractBrief,
    qualityGate: { accepted: true },
  }),
  {
    usable: false,
    reason: "This draft needs a finished render before it can be selected for launch.",
  },
  "text-free provider backgrounds are review-only and cannot satisfy final static launch readiness",
);

assert.deepEqual(
  evaluateStaticVisualAssetDecision({
    imageUrl: "https://example.test/app-composed-final.png",
    storageNormalized: true,
    appComposedFinal: true,
    qualityTier: "draft_preview",
    sourceBackgroundKind: "app_fallback_visual",
    qualityGate: { accepted: true },
    imageQa: { usable: false, decision: "review", mode: "app_composed_final", reasons: ["app_fallback_visual_not_launch_ready"] },
  }),
  {
    usable: false,
    reason: "This draft needs final approval before it can be selected for launch.",
  },
  "app-composed fallback statics are draft-only until premium provenance is accepted",
);

assert.deepEqual(
  evaluateStaticVisualAssetDecision({
    imageUrl: "https://example.test/premium-final.png",
    storageNormalized: true,
    appComposedFinal: true,
    qualityTier: "premium_final",
    sourceBackgroundKind: "higgsfield_visual_background",
    sourceBackgroundProvider: "higgsfield_marketing_studio",
    sourceBackgroundAssetId: "provider-source-1",
    qualityGate: { accepted: true },
    visualQualityGate: { accepted: true },
    premiumQualityGate: { accepted: true },
    imageQa: { usable: true, decision: "accept", mode: "app_composed_final", reasons: [] },
    sourceImageQa: { usable: true, decision: "accept", mode: "background_only", reasons: [] },
  }),
  {
    usable: false,
    reason: "This draft needs final approval before it can be selected for launch.",
  },
  "app-composed Higgsfield-backed statics are review-only and cannot satisfy launch readiness",
);

assert.equal(
  evaluateStaticVisualAssetDecision({
    imageUrl: "https://example.test/unaccepted-background.png",
    storageNormalized: true,
    imagePrompt: "TEXT-FREE BACKGROUND ASSET ONLY. Warm buyer reviewing homes in Austin.",
    visualPromptBrief: contractBrief,
    imageQa: { usable: true, decision: "accept", reasons: [] },
  }).usable,
  false,
  "static assets cannot be launch-ready until the creative quality gate is explicitly accepted",
);

const legacyFullAdDecision = evaluateStaticVisualAssetDecision({
  imageUrl: "https://example.test/legacy-full-ad.png",
  storageNormalized: true,
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
  appComposedFinal: false,
  qualityTier: "higgsfield_finished_ad",
  imageGenerationProvider: "higgsfield_marketing_studio",
  generationMethod: "higgsfield_marketing_studio",
  providerName: "higgsfield_marketing_studio",
  generationMode: "finished_ad",
  assetRole: "final_static_ad",
  visualQualityGate: { accepted: true, mode: "finished_ad_qa", reasons: [] },
  premiumQualityGate: { accepted: true, mode: "higgsfield_finished_ad_provenance", reasons: [] },
  imageQa: { usable: true, decision: "accept", mode: "finished_ad", reasons: [] },
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
  imageGenerationMessage: "This visual needs a cleaner final render before it can be launch-ready.",
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
	  storageNormalized: true,
	  appComposedFinal: false,
  qualityTier: "higgsfield_finished_ad",
  imageGenerationState: "generated",
  imageGenerationMessage: null,
  imageGenerationModel: "gpt-image-1.5",
  imageGenerationProvider: "higgsfield_marketing_studio",
  generationMethod: "higgsfield_marketing_studio",
  providerName: "higgsfield_marketing_studio",
  generationMode: "finished_ad",
  assetRole: "final_static_ad",
	  qualityGate: {
	    ...(asset.qualityGate ?? {}),
	    accepted: true,
	  },
  visualQualityGate: { accepted: true, mode: "finished_ad_qa", reasons: [] },
  premiumQualityGate: { accepted: true, mode: "higgsfield_finished_ad_provenance", reasons: [] },
	  imageQa: { usable: true, decision: "accept", mode: "finished_ad", reasons: [] },
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
		  appComposedFinal: false,
      qualityTier: "higgsfield_finished_ad",
	  imageGenerationState: "generated",
  imageGenerationMessage: null,
  imageGenerationModel: "gpt-image-1.5",
  imageGenerationProvider: "higgsfield_marketing_studio",
  generationMethod: "higgsfield_marketing_studio",
  providerName: "higgsfield_marketing_studio",
  generationMode: "finished_ad",
  assetRole: "final_static_ad",
		  qualityGate: {
		    ...(asset.qualityGate ?? {}),
		    accepted: true,
		  },
      visualQualityGate: { accepted: true, mode: "finished_ad_qa", reasons: [] },
      premiumQualityGate: { accepted: true, mode: "higgsfield_finished_ad_provenance", reasons: [] },
		  imageQa: { usable: true, decision: "accept", mode: "finished_ad", reasons: [] },
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
