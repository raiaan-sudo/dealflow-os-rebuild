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
  evaluateOfferQuality,
  evaluateCreativeQuality,
  getMediaBuyerCategoryStrategy,
} = require("../src/lib/services/media-buyer-framework.ts");

const categories = ["seller", "buyer", "precon", "luxury", "investor"];

for (const category of categories) {
  const strategy = getMediaBuyerCategoryStrategy(category);
  assert.equal(strategy.category, category);
  assert.ok(strategy.triggerConditions.length > 0, `${category} has trigger conditions`);
  assert.ok(strategy.internalTensions.length > 0, `${category} has internal tensions`);
  assert.ok(strategy.mechanismStyles.length > 0, `${category} has mechanisms`);
  assert.ok(strategy.lowFrictionCtas.length > 0, `${category} has low-friction CTAs`);
}

const weakOffer = evaluateOfferQuality({
  category: "seller",
  offer: "We help you get more leads",
  mechanism: "",
  audience: "local homeowners",
  cta: "Learn more",
});
assert.equal(weakOffer.accepted, false);
assert.ok(weakOffer.hardFailures.length >= 4, "weak vague offer is blocked");

const strongInvestorOffer = evaluateOfferQuality({
  category: "investor",
  offer: "Get 3 off-market properties this month that meet your exact ROI criteria",
	  mechanism: "micro-market analysis system",
	  audience: "Montreal investors",
	  cta: "Get Deal Flow",
});
assert.equal(strongInvestorOffer.accepted, true);
assert.ok(strongInvestorOffer.score >= 7);

const b2bLeak = evaluateOfferQuality({
  category: "seller",
  offer: "We book you 10 homeowner appointments in 90 days or you do not pay again",
  mechanism: "AI-powered lead qualification system",
  audience: "Oshawa homeowners",
  cta: "See If You Qualify",
});
assert.equal(b2bLeak.accepted, false);
assert.ok(
  b2bLeak.hardFailures.some((failure) => /B2B agent-acquisition/.test(failure)),
  "consumer seller campaign blocks agent-acquisition offer",
);

const sellerCreative = evaluateCreativeQuality({
  category: "seller",
  offer: "Get a $950K to $1.1M price-and-demand update before you list this month",
  mechanism: "pre-market positioning strategy",
  audience: "Bradford homeowners",
  hook: "Before you sell your home in Bradford, watch this.",
  headline: "Bradford price gap before you list",
  primaryText:
    "A pre-market positioning strategy tests demand before you list, so you can review the price gap before making the wrong move.",
	  overlayText: "$950K to $1.1M",
	  cta: "Get My Equity Report",
	  visualConcept: "neighborhood sale comparison with map overlay and before-after price numbers",
});
assert.equal(sellerCreative.accepted, true);
assert.ok(sellerCreative.score >= 7);

const genericCreative = evaluateCreativeQuality({
  category: "buyer",
  offer: "Beautiful homes for buyers",
  mechanism: "",
  audience: "buyers",
  hook: "Attention Realtors",
  headline: "Dream home",
  primaryText: "We help businesses grow with quality service.",
  overlayText: "Learn more",
  cta: "Learn more",
  visualConcept: "generic empty listings",
  scriptLines: ["Hi, my name is Alex and I am an agent", "Learn more"],
});
assert.equal(genericCreative.accepted, false);
assert.ok(genericCreative.hardFailures.length >= 3);

const weakImagePrompt = evaluateCreativeQuality({
  category: "buyer",
  offer: "Get 3 early-access homes this month before they hit public sites",
  mechanism: "off-market access system",
  audience: "Austin buyers",
  hook: "Before the best homes hit public sites, check this first.",
  headline: "Get early access homes in Austin",
  primaryText:
    "An off-market access system gives Austin buyers a clearer way to review early homes before public listing traffic shows up.",
  overlayText: "3 early homes",
  cta: "View Homes",
  visualConcept: "generic stock photo of a beautiful home with awkward covered text",
  imagePrompt: "A beautiful property photo.",
});
assert.equal(weakImagePrompt.accepted, false);
assert.ok(
  weakImagePrompt.hardFailures.some((failure) => /media-buyer layout reference/i.test(failure)),
  "image prompts without media-buyer reference logic are blocked",
);
assert.ok(
  weakImagePrompt.hardFailures.some((failure) => /stock-photo/i.test(failure)),
  "stock-photo-looking creative direction is blocked",
);
assert.ok(
  weakImagePrompt.hardFailures.some((failure) => /readability|overlay|crop/i.test(failure)),
  "detectable covered/unreadable preview states are blocked",
);

console.log("Media buyer framework tests passed.");
