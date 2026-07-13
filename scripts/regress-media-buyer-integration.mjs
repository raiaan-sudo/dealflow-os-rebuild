import assert from "node:assert/strict";
import fs from "node:fs";
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
const { buildCreativeSystem } = require("../src/lib/services/creative-engine.ts");
const { generateFunnel } = require("../src/lib/services/funnel-engine.ts");
const {
  evaluateOfferQuality,
  evaluateCreativeQuality,
} = require("../src/lib/services/media-buyer-framework.ts");
const {
  buildComposedStaticAdPreview,
} = require("../src/lib/services/static-ad-template-renderer.ts");
const {
  buildMarketingOptimizationBlueprint,
  evaluateMediaBuyingDecision,
} = require("../src/lib/optimization-engine/index.ts");

const B2B_LEAK_PATTERN = /\b(listing appointments?|homeowner appointments?|seller leads?|buyer leads?|realtors?|agents?|pay again|work for free|ad spend|lead quality)\b/i;
const GENERIC_HOOK_PATTERN = /\b(attention realtors|looking for motivated sellers|we help businesses grow|learn more)\b/i;
const REQUIRED_SCRIPT = ["Hook", "Problem", "Mechanism", "Proof", "Offer", "CTA"];

const cases = [
  {
    category: "seller",
    location: "Bradford",
    audience: "homeowners thinking about selling",
    offer: "Get a 2026 price-and-demand update before you list with no obligation",
    property_type: "home",
    mechanism: "pre-market positioning strategy",
    pain_points: ["not knowing if listing now is the right move"],
    market_type: "seller",
    expectedCta: "Get My Price Update",
  },
  {
    category: "buyer",
    location: "Austin",
    audience: "buyers looking for early access",
    offer: "Get early access to 3 homes this month before they hit the market",
    property_type: "homes",
    mechanism: "off-market access system",
    pain_points: ["getting beat before homes go public"],
    market_type: "buyer",
    expectedCta: "Get Access",
  },
  {
    category: "precon",
    location: "Toronto",
    audience: "pre-con buyers looking for low entry",
    offer: "View 10% deposit pre-con projects completing in 2028 before prices move",
    property_type: "pre-con condos",
    mechanism: "phased deposit structure",
    pain_points: ["waiting until future pricing moves up"],
    market_type: "buyer",
    expectedCta: "View Deposit Options",
  },
  {
    category: "investor",
    location: "Montreal",
    audience: "investors comparing ROI criteria",
    offer: "Get 3 off-market properties this month that meet your exact ROI criteria",
    property_type: "investment properties",
    mechanism: "micro-market analysis system",
    pain_points: ["underwriting the wrong deals"],
    market_type: "investor",
    expectedCta: "View Available Deals",
  },
  {
    category: "luxury",
    location: "Miami",
    audience: "luxury buyers seeking private access",
    offer: "Request private access to 2 rare waterfront homes this month before public release",
    property_type: "waterfront homes",
    mechanism: "private access network",
    pain_points: ["seeing rare inventory too late"],
    market_type: "buyer",
    expectedCta: "Request Private Access",
  },
];

const report = [];

for (const scenario of cases) {
  const creativePackage = buildCreativeSystem({
    location: scenario.location,
    audience: scenario.audience,
    offer: scenario.offer,
    property_type: scenario.property_type,
    mechanism: scenario.mechanism,
    desired_result: scenario.offer,
    pain_points: scenario.pain_points,
    market_type: scenario.market_type,
  });
  const funnel = generateFunnel({
    location: scenario.location,
    audience: scenario.audience,
    offer: scenario.offer,
    key_offer: scenario.offer,
    mechanism: scenario.mechanism,
    pain_points: scenario.pain_points,
    market_type: scenario.market_type,
  });
  const primaryStatic = creativePackage.staticAds[0];
  const primaryVideo = creativePackage.videoAds[0];
  const offerQuality = primaryStatic.offerQuality ?? evaluateOfferQuality({
    category: scenario.category,
    offer: scenario.offer,
    mechanism: scenario.mechanism,
    audience: scenario.audience,
    cta: primaryStatic.cta,
  });
  const staticQuality = primaryStatic.qualityGate ?? evaluateCreativeQuality({
    category: scenario.category,
    offer: scenario.offer,
    mechanism: scenario.mechanism,
    audience: scenario.audience,
    hook: primaryStatic.hook,
    headline: primaryStatic.headline,
    primaryText: primaryStatic.primaryText,
    overlayText: primaryStatic.overlayText,
    cta: primaryStatic.cta,
    visualConcept: primaryStatic.visualConcept,
  });
  const preview = buildComposedStaticAdPreview({
    ...primaryStatic,
    category: scenario.category,
    location: scenario.location,
    offer: scenario.offer,
  });
  const selectedCreatives = creativePackage.staticAds.slice(0, 3);
  const blueprint = buildMarketingOptimizationBlueprint({
    audience: scenario.category,
    location: scenario.location,
    budget: 80,
    offer: scenario.offer,
  });
  const combinedConsumerCopy = [
    ...creativePackage.staticAds.flatMap((ad) => [ad.hook, ad.headline, ad.overlayText, ad.primaryText, ad.cta]),
    ...creativePackage.videoAds.flatMap((video) => [video.hook, video.cta, ...video.script]),
    funnel.headline,
    funnel.subheadline,
    funnel.cta,
    ...funnel.sections.flatMap((section) => [section.title, ...section.content]),
  ].join("\n");

  assert.ok(offerQuality.score >= 7, `${scenario.category} offer score ${offerQuality.score}`);
  assert.ok(staticQuality.components.hookStrength >= 7, `${scenario.category} hook score ${staticQuality.components.hookStrength}`);
  assert.ok(staticQuality.components.mechanismClarity >= 7, `${scenario.category} mechanism score ${staticQuality.components.mechanismClarity}`);
  assert.ok(staticQuality.components.proofStrength >= 7, `${scenario.category} proof score ${staticQuality.components.proofStrength}`);
  assert.ok(staticQuality.components.ctaFriction >= 7, `${scenario.category} CTA friction score ${staticQuality.components.ctaFriction}`);
  assert.equal(funnel.cta, scenario.expectedCta, `${scenario.category} CTA`);
  assert.equal(funnel.sections[0].type, "hero", `${scenario.category} hero first`);
  assert.equal(funnel.sections[2].type, "proof_metrics", `${scenario.category} proof section`);
  assert.equal(funnel.sections[3].type, "market_snapshot", `${scenario.category} problem section`);
  assert.ok(funnel.sections.some((section) => section.type === "process"), `${scenario.category} mechanism breakdown`);
  assert.ok(funnel.sections.some((section) => section.type === "faq"), `${scenario.category} FAQ`);
  assert.deepEqual(funnel.form_fields, ["name", "phone", "email"], `${scenario.category} form fields`);
  assert.equal(preview.category, scenario.category, `${scenario.category} composed preview category`);
  assert.ok(preview.headline.length <= 72, `${scenario.category} fitted headline length`);
  assert.ok(preview.overlayText.length <= 82, `${scenario.category} fitted overlay length`);
  assert.ok(preview.cta.length <= 34, `${scenario.category} fitted CTA length`);
  assert.ok(selectedCreatives.length >= 2 && selectedCreatives.length <= 6, `${scenario.category} selected creative count`);
  assert.ok(creativePackage.staticAds.length >= 6, `${scenario.category} static creative depth`);
  assert.ok(blueprint.creativePlan.totalCreatives >= 6, `${scenario.category} launch creative count`);
  assert.ok(blueprint.creativePlan.videoCreatives >= Math.ceil(blueprint.creativePlan.totalCreatives / 2), `${scenario.category} video ratio`);
  assert.ok(blueprint.audienceStrategy.retargetingPools.some((pool) => /75% video/i.test(pool)), `${scenario.category} video retargeting`);
  assert.ok(blueprint.audienceStrategy.retargetingPools.some((pool) => /site visitors|landing-page/i.test(pool)), `${scenario.category} site retargeting`);
  assert.deepEqual(primaryVideo.shotList, REQUIRED_SCRIPT, `${scenario.category} UGC script structure`);
  assert.equal(primaryVideo.script.length, 6, `${scenario.category} UGC script segment count`);
  assert.ok(!/^hi,?\s+my name is/i.test(primaryVideo.script[0]), `${scenario.category} no intro`);
  assert.ok(/casual|ugc|expert|customer/i.test(primaryVideo.creatorStyle), `${scenario.category} UGC style`);
  assert.ok(primaryVideo.qualityGate?.score >= 7, `${scenario.category} UGC score`);
  assert.equal(primaryVideo.qualityGate?.accepted, true, `${scenario.category} UGC accepted`);
  assert.ok(!GENERIC_HOOK_PATTERN.test(combinedConsumerCopy), `${scenario.category} generic hook blocked`);
  assert.ok(!B2B_LEAK_PATTERN.test(combinedConsumerCopy), `${scenario.category} no B2B offer leak`);

  report.push({
    category: scenario.category,
    offerScore: Number(offerQuality.score.toFixed(2)),
    hookScore: Number(staticQuality.components.hookStrength.toFixed(2)),
    mechanismScore: Number(staticQuality.components.mechanismClarity.toFixed(2)),
    proofScore: Number(staticQuality.components.proofStrength.toFixed(2)),
    cta: funnel.cta,
    staticTemplate: preview.templateId,
    selectedCreatives: selectedCreatives.length,
    launchCreatives: blueprint.creativePlan.totalCreatives,
    launchVideos: blueprint.creativePlan.videoCreatives,
    ugcScore: Number(primaryVideo.qualityGate.score.toFixed(2)),
  });
}

const weakOfferPackage = buildCreativeSystem({
  location: "Austin",
  audience: "buyers",
  offer: "Get more leads",
  property_type: "homes",
  mechanism: "",
  pain_points: [],
  market_type: "buyer",
});
assert.ok(
  weakOfferPackage.staticAds.some((ad) => ad.offerQuality && (ad.offerQuality.score >= 7 || ad.offerQuality.hardFailures.length > 0)),
  "weak offers are scored, repaired, or marked with improvement reasons",
);

const killDecision = evaluateMediaBuyingDecision({
  ctr: 0.004,
  cpc: 1.4,
  cpl: 70,
  frequency: 4.5,
  spend: 110,
  leads: 0,
  lp_cvr: 0.02,
});
assert.equal(killDecision.action, "kill");

const scaleDecision = evaluateMediaBuyingDecision({
  ctr: 0.025,
  cpc: 0.8,
  cpl: 42,
  frequency: 2,
  spend: 84,
  leads: 2,
  lp_cvr: 0.06,
});
assert.equal(scaleDecision.action, "scale_duplicate");
assert.equal(scaleDecision.duplicateWinners, true);

const actionService = fs.readFileSync(
  path.join(repoRoot, "src/lib/services/campaign-action-service.ts"),
  "utf8",
);
assert.ok(actionService.includes("evaluateMediaBuyingDecision"), "dashboard recommendations use KPI decision rules");
assert.ok(actionService.includes("duplicate_winner_do_not_edit"), "scale action duplicates winners rather than editing");

console.table(report);
console.log(JSON.stringify({ categories: report, killDecision, scaleDecision }, null, 2));
