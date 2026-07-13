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

assert.equal(selectMediaBuyerCta("seller"), "Get My Price Update");
assert.equal(selectMediaBuyerCta("buyer"), "Get Access");
assert.equal(selectMediaBuyerCta("investor"), "View Available Deals");
assert.equal(selectMediaBuyerCta("precon"), "View Deposit Options");
assert.equal(selectMediaBuyerCta("luxury"), "Request Private Access");
assert.equal(selectMediaBuyerCta("seller", { b2bAgent: true }), "See If You Qualify");

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
  ctr: 0.012,
  cpc: 1,
  cpl: 45,
  frequency: 4.1,
  spend: 45,
  leads: 1,
  lp_cvr: 0.05,
});
assert.equal(killFrequency.action, "kill");

const killNoLeads = evaluateMediaBuyingDecision({
  ctr: 0.01,
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
  ctr: 0.024,
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
  offer: "Get a 2026 price-and-demand update before you list with no obligation",
  mechanism: "pre-market positioning strategy",
  market_type: "seller",
});
assert.equal(sellerFunnel.cta, "Get My Price Update");
assert.deepEqual(sellerFunnel.form_fields, ["name", "phone", "email"]);
assert.equal(sellerFunnel.sections[0].type, "hero");
assert.equal(sellerFunnel.sections[2].type, "proof_metrics");
assert.equal(sellerFunnel.sections[3].type, "market_snapshot");
assert.ok(sellerFunnel.follow_up_action.includes("5_15"));

const investorFunnel = generateFunnel({
  location: "Montreal",
  audience: "investors",
  offer: "Get 3 off-market properties this month that match your ROI criteria",
  mechanism: "micro-market analysis system",
  market_type: "investor",
});
assert.equal(investorFunnel.cta, "View Available Deals");

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
  offer: "Get early access to 3 homes this month before they hit the market",
  property_type: "homes",
  mechanism: "off-market access system",
  desired_result: "early access",
  pain_points: ["getting beat before homes go public"],
  market_type: "buyer",
});

assert.ok(creativePackage.videoAds.length >= 2);
for (const video of creativePackage.videoAds) {
  assert.deepEqual(video.shotList, ["Hook", "Problem", "Mechanism", "Proof", "Offer", "CTA"]);
  assert.equal(video.script.length, 6);
  assert.ok(!/^hi,?\s+my name is/i.test(video.script[0]));
  assert.ok(/get early access/i.test(video.script.join(" ")));
  assert.ok(/system|process|structure|filters|screens/i.test(video.script[2]));
  assert.ok(video.qualityGate?.score >= 7, `${video.id} score ${video.qualityGate?.score}`);
  assert.equal(video.qualityGate?.accepted, true);
}

console.log("Media buying upgrade tests passed.");
