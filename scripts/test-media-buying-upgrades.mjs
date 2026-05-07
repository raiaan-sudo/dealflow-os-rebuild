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
const { generateFunnel } = require("../src/lib/services/funnel-engine.ts");
const { buildCreativeSystem } = require("../src/lib/services/creative-engine.ts");
const {
  buildMediaBuyingCampaignStructure,
  evaluateMediaBuyingDecision,
  selectMediaBuyerCta,
} = require("../src/lib/optimization-engine/media-buying-rules.ts");
const {
  getMediaBuyerCampaignPackages,
  selectMediaBuyerCampaignPackage,
} = require("../src/lib/services/media-buyer-framework.ts");

assert.equal(selectMediaBuyerCta("seller"), "Get My Equity Report");
assert.equal(selectMediaBuyerCta("buyer"), "See Matching Homes");
assert.equal(selectMediaBuyerCta("investor"), "Get Deal Flow");
assert.equal(selectMediaBuyerCta("precon"), "View Deposit Options");
assert.equal(selectMediaBuyerCta("luxury"), "Request Private Access");
assert.equal(selectMediaBuyerCta("seller", { b2bAgent: true }), "See If You Qualify");

for (const category of ["seller", "buyer", "investor"]) {
  const packages = getMediaBuyerCampaignPackages(category);
  assert.equal(packages.length, 3, `${category} should expose the media buyer top three packages`);
  assert.equal(new Set(packages.map((campaignPackage) => campaignPackage.headline)).size, 3, `${category} headlines should be distinct`);
  assert.equal(new Set(packages.map((campaignPackage) => campaignPackage.primaryText)).size, 3, `${category} primary text should be distinct`);
  assert.equal(new Set(packages.map((campaignPackage) => campaignPackage.cta)).size, 3, `${category} CTAs should be distinct`);

  for (const campaignPackage of packages) {
    const combined = [
      campaignPackage.hook,
      campaignPackage.primaryText,
      campaignPackage.headline,
      campaignPackage.cta,
      campaignPackage.funnelHeadline,
      campaignPackage.funnelSubheadline,
    ].join(" ");
    assert.ok(!/payment comparison overlay|better houses options|\$600 k|guaranteed roi|no risk investment|guaranteed approval/i.test(combined), `${campaignPackage.id} has unsafe or broken copy`);
    assert.ok(campaignPackage.complianceNotes.length > 0, `${campaignPackage.id} should carry compliance guidance`);
  }
}

assert.equal(
  selectMediaBuyerCampaignPackage("seller", { offer: "Pre-Listing Buyer Demand Check" })?.id,
  "seller-buyer-demand-pressure",
);
assert.equal(
  selectMediaBuyerCampaignPackage("buyer", { offer: "Affordability Breakdown" })?.id,
  "buyer-affordability-reality-check",
);
assert.equal(
  selectMediaBuyerCampaignPackage("investor", { offer: "ROI Report" })?.id,
  "investor-roi-map-intelligence",
);

const lowBudgetStructure = buildMediaBuyingCampaignStructure(80);
assert.equal(lowBudgetStructure.budgetModel, "CBO");
assert.equal(lowBudgetStructure.creativeCount, 6);
assert.equal(lowBudgetStructure.minVideoCreatives, 3);
assert.ok(lowBudgetStructure.retargetingPools.includes("75% video viewers"));
assert.ok(lowBudgetStructure.retargetingPools.includes("site visitors"));

const highBudgetStructure = buildMediaBuyingCampaignStructure(150);
assert.equal(highBudgetStructure.budgetModel, "ABO+CBO");
assert.equal(highBudgetStructure.creativeCount, 8);
assert.equal(highBudgetStructure.minVideoCreatives, 4);

const killCtr = evaluateMediaBuyingDecision({
  ctr: 0.004,
  cpc: 2,
  cpl: 80,
  frequency: 1,
  spend: 30,
  leads: 1,
  lp_cvr: 0.03,
});
assert.equal(killCtr.action, "kill");
assert.ok(killCtr.reasons.some((reason) => /CTR/.test(reason)));

const killFrequency = evaluateMediaBuyingDecision({
  ctr: 1.2,
  cpc: 1,
  cpl: 45,
  frequency: 4.1,
  spend: 45,
  leads: 1,
  lp_cvr: 0.05,
});
assert.equal(killFrequency.action, "kill");

const killNoLeads = evaluateMediaBuyingDecision({
  ctr: 1,
  cpc: 1,
  cpl: 0,
  frequency: 1,
  spend: 20,
  leads: 0,
  lp_cvr: 0.04,
  hoursElapsed: 24,
});
assert.equal(killNoLeads.action, "kill");

const scaleDecision = evaluateMediaBuyingDecision({
  ctr: 2.4,
  cpc: 0.8,
  cpl: 42,
  frequency: 2,
  spend: 84,
  leads: 2,
  lp_cvr: 0.06,
});
assert.equal(scaleDecision.action, "scale_duplicate");
assert.equal(scaleDecision.duplicateWinners, true);
assert.ok(scaleDecision.strongMetrics.length >= 2);

const sellerFunnel = generateFunnel({
  location: "Bradford",
  audience: "homeowners",
  offer: "Home Equity Snapshot Report",
  mechanism: "pre-market positioning strategy",
  market_type: "seller",
});
assert.equal(sellerFunnel.cta, "Get Report");
assert.equal(sellerFunnel.headline, "Unlock your home's current value range");
assert.deepEqual(sellerFunnel.form_fields, ["name", "phone", "email"]);
assert.equal(sellerFunnel.sections[0].type, "hero");
assert.equal(sellerFunnel.sections[2].type, "proof_metrics");
assert.equal(sellerFunnel.sections[3].type, "market_snapshot");
assert.ok(sellerFunnel.follow_up_action.includes("5_15"));

const investorFunnel = generateFunnel({
  location: "Montreal",
  audience: "investors",
  offer: "Cash Flow Deal List",
  mechanism: "micro-market analysis system",
  market_type: "investor",
});
assert.equal(investorFunnel.cta, "Get Deals");
assert.equal(investorFunnel.headline, "View pre-screened cash flow opportunities");

const preconFunnel = generateFunnel({
  location: "Austin",
  audience: "buyers",
  offer: "View 10% deposit pre-con projects completing in 2028",
  mechanism: "phased deposit structure",
  market_type: "buyer",
});
assert.equal(preconFunnel.cta, "View Deposit Options");

const creativePackage = buildCreativeSystem({
  location: "Austin",
  audience: "buyers looking for early access",
  offer: "Early Access Listings",
  property_type: "homes",
  mechanism: "off-market access system",
  desired_result: "early access",
  pain_points: ["getting beat before homes go public"],
  market_type: "buyer",
});

const buyerStaticAds = creativePackage.staticAds.slice(0, 3);
assert.equal(new Set(buyerStaticAds.map((ad) => ad.headline)).size, 3, "buyer static ads should present distinct media-buyer headlines");
assert.equal(new Set(buyerStaticAds.map((ad) => ad.primaryText)).size, 3, "buyer static ads should present distinct media-buyer primary text");
assert.ok(
  buyerStaticAds.some((ad) => /early access listings|get early access|view homes/i.test(`${ad.headline} ${ad.primaryText} ${ad.cta}`)),
  "selected buyer offer should drive at least one static creative",
);

assert.ok(creativePackage.videoAds.length >= 2);
for (const video of creativePackage.videoAds) {
  assert.deepEqual(video.shotList, ["Hook", "Problem", "Mechanism", "Proof", "Offer", "CTA"]);
  assert.equal(video.script.length, 6);
  assert.ok(!/^hi,?\s+my name is/i.test(video.script[0]));
  assert.ok(/early access listings/i.test(video.script.join(" ")));
  assert.ok(/system|process|structure|filters|screens/i.test(video.script[2]));
  assert.ok(video.qualityGate?.score >= 7, `${video.id} score ${video.qualityGate?.score}`);
  assert.equal(video.qualityGate?.accepted, true);
}

const sellerGuaranteePackage = buildCreativeSystem({
  location: "Toronto, ON",
  audience: "homeowners",
  offer: "Guaranteed Sale in 90 days",
  property_type: "homes",
  mechanism: "pre-market pricing and demand plan",
  desired_result: "sell with a clearer plan",
  pain_points: ["pricing too late", "listing without buyer demand"],
  market_type: "seller",
});

assert.equal(sellerGuaranteePackage.staticAds[0].cta, "Check My 90-Day Sale Plan");
assert.ok(
  sellerGuaranteePackage.staticAds
    .slice(0, 3)
    .every((ad) => /guaranteed sale|90-day sale|90 days/i.test(`${ad.headline} ${ad.overlayText} ${ad.primaryText} ${ad.cta}`)),
  "seller guarantee offer should stay visible across static creatives",
);
assert.ok(
  sellerGuaranteePackage.videoAds.every((video) =>
    /guaranteed sale in 90 days/i.test(video.script.join(" ")) &&
    !/Before you sell your home in Toronto, ON, watch this/i.test(video.script.join(" ")),
  ),
  "seller guarantee UGC scripts should preserve the offer and avoid repetitive placeholder hooks",
);

console.log("Media buying upgrade tests passed.");
