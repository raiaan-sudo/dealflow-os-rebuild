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
  buildCreativeSystem,
} = require("../src/lib/services/creative-engine.ts");
const {
  isLaunchReadyStaticCreative,
} = require("../src/lib/services/creative-media-readiness.ts");
const {
  getCreativeAssetTierLabel,
  rankBestAvailableStaticCreatives,
} = require("../src/lib/services/creative-asset-status.ts");
const {
  buildComposedStaticAdPreview,
} = require("../src/lib/services/static-ad-template-renderer.ts");

const start = Date.now();
const buyerSystem = buildCreativeSystem({
  location: "Toronto, ON",
  audience: "qualified buyers",
  offer: "Off-market property access",
  property_type: "family homes",
  mechanism: "a buyer consultation and qualification system",
  desired_result: "book more serious buyer calls",
  market_type: "buyer",
});
const durationMs = Date.now() - start;

assert.ok(durationMs < 5000, `fallback generation should complete under 5 seconds, got ${durationMs}ms`);
assert.ok(buyerSystem.staticAds.length >= 4, "buyer fallback renderer creates at least 4 static assets");

for (const asset of buyerSystem.staticAds.slice(0, 4)) {
  assert.equal(asset.creativeAssetSource, "fallback", "instant assets are marked as fallback source");
  assert.equal(asset.creativeAssetStatus, "fallback_ready", "instant assets are marked fallback_ready");
  assert.equal(asset.creativeAssetQaStatus, "pending", "fallback assets require QA before launch approval");
  assert.equal(asset.fallbackUsed, true, "fallback usage is explicit");
  assert.match(asset.imageGenerationMessage ?? "", /Preview creative ready/i);
  assert.equal(isLaunchReadyStaticCreative(asset), false, "fallback previews are not launch-ready by default");
  assert.equal(getCreativeAssetTierLabel(asset), "Instant draft");
}

const sellerSystem = buildCreativeSystem({
  location: "Westchester County, NY",
  audience: "homeowners considering a sale",
  offer: "Neighbourhood Sale Comparison Report",
  property_type: "luxury listings",
  mechanism: "a local sale comparison before listing",
  desired_result: "more seller conversations",
  market_type: "seller",
});
const sellerCopy = sellerSystem.staticAds
  .map((asset) => [asset.headline, asset.primaryText, asset.overlayText, asset.cta].join(" "))
  .join("\n");

assert.doesNotMatch(sellerCopy, /Request Private Access/i, "seller fallback copy avoids buyer private-access CTA");
assert.doesNotMatch(sellerCopy, /Qualified buyer positioning/i, "seller fallback copy avoids buyer positioning");
assert.doesNotMatch(sellerCopy, /private-access path/i, "seller fallback copy avoids buyer path language");

const fallbackPreview = buildComposedStaticAdPreview({
  headline: buyerSystem.staticAds[0].headline,
  primaryText: buyerSystem.staticAds[0].primaryText,
  cta: buyerSystem.staticAds[0].cta,
  imageUrl: null,
  storageNormalized: false,
  appComposedFinal: false,
  qualityTier: "draft_preview",
  category: "buyer",
});
assert.equal(fallbackPreview.status, "template_fallback", "fallback preview renders a deterministic template instead of blank space");
assert.match(fallbackPreview.backgroundMessage, /Concept preview is ready/i);

const approvedFallback = {
  ...buyerSystem.staticAds[0],
  creativeAssetStatus: "launch_approved",
  creativeAssetQaStatus: "operator_approved",
  fallbackLaunchQa: {
    passed: true,
    checkedAt: new Date("2026-05-30T00:00:00.000Z").toISOString(),
    reasons: [],
    approvedBy: "operator:test",
  },
  imageUrl: "https://app.agentdealflow.io/storage/creative-assets/test/fallback.png",
  storageNormalized: true,
};
assert.equal(
  isLaunchReadyStaticCreative(approvedFallback),
  true,
  "operator-approved app-owned fallback can count only after explicit launch approval",
);

const noImageApprovedFallback = {
  ...approvedFallback,
  imageUrl: "",
};
assert.equal(
  isLaunchReadyStaticCreative(noImageApprovedFallback),
  false,
  "fallback launch approval still requires an app-owned image URL",
);

const premiumAsset = {
  ...buyerSystem.staticAds[1],
  creativeAssetSource: "higgsfield",
  creativeAssetStatus: "launch_approved",
  imageUrl: "https://app.agentdealflow.io/storage/creative-assets/test/higgsfield.png",
  storageNormalized: true,
  providerName: "higgsfield",
  score: 1,
};
const ranked = rankBestAvailableStaticCreatives([buyerSystem.staticAds[0], premiumAsset]);
assert.equal(ranked[0].id, premiumAsset.id, "premium launch-approved creative ranks ahead of instant fallback");
assert.equal(getCreativeAssetTierLabel(premiumAsset), "Premium Higgsfield");

console.log("creative fallback resilience tests passed");
