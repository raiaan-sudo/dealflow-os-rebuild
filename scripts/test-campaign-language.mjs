#!/usr/bin/env node

import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

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
  getCampaignLanguageProfile,
  normalizeCampaignLanguage,
} = require("../src/lib/services/campaign-language.ts");
const { generateCampaignPlan } = require("../src/lib/services/campaign-plan-service.ts");
const { buildCreativeSystem } = require("../src/lib/services/creative-engine.ts");
const { generateFunnel } = require("../src/lib/services/funnel-engine.ts");
const { isLaunchReadyStaticCreative } = require("../src/lib/services/creative-media-readiness.ts");

assert.equal(normalizeCampaignLanguage("fr-CA"), "fr");
assert.equal(normalizeCampaignLanguage("Spanish"), "es");
assert.equal(normalizeCampaignLanguage(""), "en");
assert.equal(getCampaignLanguageProfile("fr").label, "French");

const baseInput = {
  clientName: "Quebec Agent",
  businessName: "Montreal Realty",
  intent: "buyer",
  market: "Montreal, QC",
  monthlyBudget: 1500,
  primaryGoal: "Generate more buyer leads",
  timeline: "30 days",
  audience: "Home buyers searching for $600k-$900k homes in Montreal",
  propertyType: "Detached homes",
  keyOffer: "Private listings and a fast buyer strategy call",
  painPoints: [
    "Buyers miss listings because they react too late",
    "Buyers do not know which homes fit their budget",
  ],
  mechanism: "buyer consultation and qualification system",
  languageCode: "fr",
};

const frenchPlan = await generateCampaignPlan(baseInput, null, null, undefined, { deferAssetGeneration: true });
assert.equal(frenchPlan.languageCode, "fr");
assert.equal(frenchPlan.campaignLanguage.label, "French");
assert.match(frenchPlan.funnel.cta, /acces|Verifier|Cliquez|Voir|Reserver/i);
assert.ok(frenchPlan.funnel.formFields.includes("courriel"), "French funnel should localize email field");
assert.equal(frenchPlan.creativeBrief.languageCode, "fr");

const spanishCreativeSystem = buildCreativeSystem({
  location: "Austin, TX",
  audience: "Home buyers searching for $600k-$900k homes",
  offer: "Private listings and a fast buyer strategy call",
  property_type: "Detached homes",
  mechanism: "buyer consultation and qualification system",
  pain_points: ["Buyers miss listings because they react too late"],
  market_type: "buyer",
  language_code: "es",
});

assert.equal(spanishCreativeSystem.brief.languageCode, "es");
assert.equal(spanishCreativeSystem.staticAds[0].languageCode, "es");
assert.equal(spanishCreativeSystem.videoAds[0].languageCode, "es");
assert.match(
  [spanishCreativeSystem.staticAds[0].cta, spanishCreativeSystem.staticAds[0].headline].join(" "),
  /acceso|casas|compradores|Ver|Haz/i,
);

const frenchFunnel = generateFunnel({
  location: "Quebec City, QC",
  audience: "Home buyers searching for private listings",
  offer: "Private listings",
  funnel_goal: "lead_form",
  language_code: "fr",
});
assert.equal(frenchFunnel.language_code, "fr");
assert.equal(frenchFunnel.languageCode, "fr");
assert.ok(frenchFunnel.form_fields.includes("courriel"));

const launchSafeBaseAsset = {
  id: "asset-1",
  creativeAssetSource: "higgsfield",
  creativeAssetStatus: "provider_ready",
  creativeAssetQaStatus: "passed",
  imageUrl: "https://app.agentdealflow.io/storage/v1/object/public/creative-assets/campaign/asset-1.png",
  storageNormalized: true,
  appComposedFinal: false,
  qualityTier: "higgsfield_finished_ad",
  imageGenerationProvider: "higgsfield_marketing_studio",
  generationMethod: "higgsfield_marketing_studio",
  providerName: "higgsfield_marketing_studio",
  generationMode: "finished_ad",
  assetRole: "final_static_ad",
  imageQa: {
    usable: true,
    decision: "accept",
    mode: "finished_ad",
    reasons: [],
  },
  sourceImageQa: {
    usable: true,
    decision: "accept",
    mode: "finished_ad",
    reasons: [],
  },
  visualQualityGate: { accepted: true },
  premiumQualityGate: { accepted: true },
  qualityGate: {
    accepted: false,
    score: 6,
    hardFailures: [],
    improvementHints: ["offer could be stronger"],
    notes: ["needs risk reversal"],
  },
  hook: "Off-market homes",
  overlayText: "Off-market homes",
  primaryText: "Home buyers can review private listings before everyone else.",
  headline: "Private listings",
  cta: "Check Now",
};

assert.equal(
  isLaunchReadyStaticCreative(
    {
      ...launchSafeBaseAsset,
      languageCode: "fr",
      hook: "Maisons hors marche",
      overlayText: "Maisons hors marche",
      primaryText: "Les acheteurs peuvent voir les proprietes privees avant les autres.",
      headline: "Proprietes privees",
      cta: "Verifier maintenant",
    },
    { languageCode: "fr" },
  ),
  true,
  "Launch-safe French asset should pass even with advisory quality notes",
);

assert.equal(
  isLaunchReadyStaticCreative(
    {
      ...launchSafeBaseAsset,
      languageCode: "en",
    },
    { languageCode: "fr" },
  ),
  false,
  "English asset should not count for a French campaign",
);

console.log("campaign-language checks passed");
