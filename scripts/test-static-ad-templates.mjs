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
  imageUrl: "https://example.test/rendered-creative.png",
  imageGenerationState: "generated",
  qualityGate: {
    accepted: true,
    score: 8.2,
  },
};
const generatedCreative = buildComposedStaticAdPreview(generatedCreativeInput);
assert.equal(generatedCreative.status, "final_composed", "accepted generated images are primary creative previews");

const rejectedGeneratedCreative = buildComposedStaticAdPreview({
  ...generatedCreativeInput,
  qualityGate: {
    accepted: false,
    score: 4.8,
  },
});
assert.equal(
  rejectedGeneratedCreative.status,
  "final_composed",
  "generated images remain visible even when a quality gate asks for review",
);
assert.equal(
  rejectedGeneratedCreative.backgroundMessage,
  "Generated image is visible for review, but this one should be regenerated before launch.",
);

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

console.log("Static ad template tests passed.");
