#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

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

process.env.FUNNEL_PERSONALIZATION_V2 = "true";

const require = createRequire(import.meta.url);
const {
  FUNNEL_ARCHETYPES_V2,
  generateFunnel,
} = require("../src/lib/services/funnel-engine.ts");

const artifactDir = path.join(
  repoRoot,
  "data",
  "engineering-proof-artifacts",
  "2026-06-05",
  "funnel-personalization-v2",
);
fs.mkdirSync(artifactDir, { recursive: true });

const fixtures = [
  {
    name: "RE/MAX buyer campaign in Toronto",
    expectedArchetype: "local_expert_buyer",
    input: {
      campaign_id: "fixture-remax-buyer-toronto",
      workspace_id: "fixture-workspace",
      location: "Toronto, ON",
      audience: "move-ready buyers comparing homes in Toronto",
      offer: "exclusive access to under-market homes in Toronto",
      mechanism: "budget-fit comparison and buyer consultation system",
      market_type: "buyer",
      brokerage: "RE/MAX",
      agentName: "Fixture Agent",
      primaryCTA: "Click Learn More To Get Access",
    },
  },
  {
    name: "eXp seller campaign in Austin",
    expectedArchetype: "local_expert_seller",
    input: {
      campaign_id: "fixture-exp-seller-austin",
      workspace_id: "fixture-workspace",
      location: "Austin, TX",
      audience: "homeowners considering selling in Austin",
      offer: "pricing and demand plan before listing",
      mechanism: "seller demand and positioning review",
      market_type: "seller",
      brokerage: "eXp Realty",
      primaryCTA: "Get My Sale Plan",
    },
  },
  {
    name: "KW first-time buyer campaign in Phoenix",
    expectedArchetype: "first_time_buyer",
    input: {
      campaign_id: "fixture-kw-first-time-phoenix",
      workspace_id: "fixture-workspace",
      location: "Phoenix, AZ",
      audience: "first-time buyers comparing starter homes",
      offer: "first-time buyer approval and starter home path",
      mechanism: "budget-fit and approval-aware shortlist",
      market_type: "buyer",
      brokerage: "Keller Williams",
      primaryCTA: "See If You Qualify",
    },
  },
  {
    name: "Royal LePage home valuation in Vancouver",
    expectedArchetype: "home_valuation",
    input: {
      campaign_id: "fixture-rlp-value-vancouver",
      workspace_id: "fixture-workspace",
      location: "Vancouver, BC",
      audience: "homeowners curious about value",
      offer: "home valuation and current value range check",
      mechanism: "local pricing signals and comparable sale review",
      market_type: "seller",
      brokerage: "Royal LePage",
      primaryCTA: "Check My Value",
    },
  },
  {
    name: "Luxury listing campaign in Miami",
    expectedArchetype: "luxury_listing",
    input: {
      campaign_id: "fixture-luxury-miami",
      workspace_id: "fixture-workspace",
      location: "Miami, FL",
      audience: "luxury buyers requesting private details",
      offer: "private luxury listing access in Miami",
      mechanism: "selective property briefing and private details request",
      market_type: "buyer",
      brokerage: "Compass",
      primaryCTA: "Request Private Details",
    },
  },
  {
    name: "Investor campaign in Dallas",
    expectedArchetype: "investor_opportunity",
    input: {
      campaign_id: "fixture-investor-dallas",
      workspace_id: "fixture-workspace",
      location: "Dallas, TX",
      audience: "real estate investors underwriting rental opportunities",
      offer: "cash-flow deal shortlist for Dallas investors",
      mechanism: "deal-fit filtering and underwriting snapshot",
      market_type: "investor",
      brokerage: "DealFlow Realty",
      primaryCTA: "See Matching Deals",
    },
  },
  {
    name: "Relocation campaign in Tampa",
    expectedArchetype: "relocation",
    input: {
      campaign_id: "fixture-relocation-tampa",
      workspace_id: "fixture-workspace",
      location: "Tampa, FL",
      audience: "buyers relocating to Tampa",
      offer: "relocation shortlist for Tampa home options",
      mechanism: "move timing and local shortlist review",
      market_type: "buyer",
      brokerage: "Coldwell Banker",
      primaryCTA: "Get My Shortlist",
    },
  },
  {
    name: "New construction campaign in Orlando",
    expectedArchetype: "new_construction",
    input: {
      campaign_id: "fixture-new-build-orlando",
      workspace_id: "fixture-workspace",
      location: "Orlando, FL",
      audience: "buyers comparing new construction communities",
      offer: "new construction builder options and incentive comparison",
      mechanism: "builder inventory and timeline comparison",
      market_type: "buyer",
      brokerage: "LPT Realty",
      primaryCTA: "View New-Build Options",
    },
  },
  {
    name: "Downsizer campaign in Scottsdale",
    expectedArchetype: "downsizer",
    input: {
      campaign_id: "fixture-downsizer-scottsdale",
      workspace_id: "fixture-workspace",
      location: "Scottsdale, AZ",
      audience: "owners planning a simpler next move",
      offer: "downsizer move plan and sale timing review",
      mechanism: "equity, timing, and next-home transition map",
      market_type: "seller",
      brokerage: "Berkshire Hathaway HomeServices",
      primaryCTA: "Plan My Next Move",
    },
  },
  {
    name: "Move-up buyer campaign in Denver",
    expectedArchetype: "move_up_buyer",
    input: {
      campaign_id: "fixture-move-up-denver",
      workspace_id: "fixture-workspace",
      location: "Denver, CO",
      audience: "owners buying a bigger next home",
      offer: "move-up buyer plan for selling and buying",
      mechanism: "equity timing and next-home strategy",
      market_type: "buyer",
      brokerage: "The Agency",
      primaryCTA: "Map My Move-Up Plan",
    },
  },
  {
    name: "Expired listing campaign in Atlanta",
    expectedArchetype: "expired_listing",
    input: {
      campaign_id: "fixture-expired-atlanta",
      workspace_id: "fixture-workspace",
      location: "Atlanta, GA",
      audience: "owners whose listing did not sell",
      offer: "expired listing relaunch plan",
      mechanism: "pricing and positioning diagnosis",
      market_type: "seller",
      brokerage: "Ansley Real Estate",
      primaryCTA: "Get Relaunch Plan",
    },
  },
  {
    name: "Open house follow-up campaign in Charlotte",
    expectedArchetype: "open_house_followup",
    input: {
      campaign_id: "fixture-open-house-charlotte",
      workspace_id: "fixture-workspace",
      location: "Charlotte, NC",
      audience: "open house visitors comparing next options",
      offer: "open house follow-up list and matching home options",
      mechanism: "property fit review and next-best shortlist",
      market_type: "buyer",
      brokerage: "Premier Sotheby's International Realty",
      primaryCTA: "Get The Follow-Up List",
    },
  },
  {
    name: "Generic campaign with missing brokerage",
    expectedArchetype: "local_expert_buyer",
    input: {
      campaign_id: "fixture-generic-missing-brokerage",
      workspace_id: "fixture-workspace",
      location: "Columbus, OH",
      audience: "qualified local buyers",
      offer: "local home shortlist",
      mechanism: "short intake and property match",
      market_type: "buyer",
      primaryCTA: "Request Details",
    },
  },
  {
    name: "White-label partner campaign",
    expectedArchetype: "local_expert_seller",
    input: {
      campaign_id: "fixture-white-label-egen",
      workspace_id: "fixture-workspace",
      location: "San Diego, CA",
      audience: "homeowners reviewing sale timing",
      offer: "seller pricing strategy before listing",
      mechanism: "partner-branded demand and pricing review",
      market_type: "seller",
      partnerName: "EGEN Accelerator",
      whiteLabelEnabled: true,
      brandMode: "partner",
      brokerage: "EGEN Partner Brokerage",
      primaryCTA: "Get My Sale Plan",
    },
  },
];

const hardBlockTerms = [
  /guaranteed?\s+(approval|profit|roi|sale|return|appreciation|availability)/i,
  /families with kids|family neighborhood|safe neighborhood|low crime|good schools/i,
  /futuristic|generic lead page|ai-powered real estate portal/i,
];

const results = fixtures.map((fixture) => {
  const funnel = generateFunnel(fixture.input);
  const serialized = JSON.stringify(funnel);
  const customerCopy = JSON.stringify({
    headline: funnel.headline,
    subheadline: funnel.subheadline,
    cta: funnel.cta,
    sections: funnel.sections.map((section) => ({
      title: section.title,
      content: section.content,
    })),
  });
  const lower = serialized.toLowerCase();

  assert.equal(funnel.personalization_version, "funnel_strategy_v2", `${fixture.name} should use V2`);
  assert.equal(funnel.strategy_brief?.version, "funnel_strategy_v2", `${fixture.name} missing strategy brief`);
  assert.equal(funnel.render_schema?.version, "funnel_render_v2", `${fixture.name} missing render schema`);
  assert.equal(funnel.strategy_brief?.archetype.id, fixture.expectedArchetype, `${fixture.name} wrong archetype`);
  assert.notEqual(funnel.qa_result?.status, "block", `${fixture.name} should not be blocked`);
  assert.ok(funnel.headline && funnel.subheadline && funnel.cta, `${fixture.name} missing top-level copy`);
  assert.ok(funnel.sections.length >= 6, `${fixture.name} should have a full section model`);
  assert.ok(funnel.sections.some((section) => section.type === "hero"), `${fixture.name} missing hero`);
  assert.ok(funnel.sections.some((section) => section.type === "form"), `${fixture.name} missing form`);
  assert.ok(funnel.sections.some((section) => section.type === "closing_cta"), `${fixture.name} missing closing CTA`);
  assert.ok(funnel.form_fields.includes("name"), `${fixture.name} should collect name`);
  assert.ok(lower.includes(fixture.input.location.toLowerCase()), `${fixture.name} missing market context`);
  assert.ok(lower.includes(fixture.input.primaryCTA.toLowerCase()), `${fixture.name} missing CTA context`);

  for (const term of hardBlockTerms) {
    assert.equal(term.test(customerCopy), false, `${fixture.name} contains blocked customer-facing language ${term}`);
  }

  if (fixture.input.whiteLabelEnabled) {
    assert.equal(funnel.strategy_brief.white_label.enabled, true, `${fixture.name} should preserve white-label context`);
    assert.equal(funnel.render_schema.theme.mode, "partner", `${fixture.name} should use partner theme mode`);
  }

  return {
    name: fixture.name,
    expectedArchetype: fixture.expectedArchetype,
    selectedArchetype: funnel.strategy_brief.archetype.id,
    headline: funnel.headline,
    subheadline: funnel.subheadline,
    cta: funnel.cta,
    sectionTypes: funnel.sections.map((section) => section.type),
    qa: funnel.qa_result,
    warningCount: funnel.qa_result?.warnings?.length ?? 0,
  };
});

const uniqueHeadlines = new Set(results.map((result) => result.headline));
const uniqueSectionStructures = new Set(results.map((result) => result.sectionTypes.join(">")));

assert.ok(uniqueHeadlines.size >= 12, `expected at least 12 unique headlines, got ${uniqueHeadlines.size}`);
assert.ok(uniqueSectionStructures.size >= 8, `expected at least 8 unique section structures, got ${uniqueSectionStructures.size}`);

const artifact = {
  generatedAt: new Date().toISOString(),
  fixtureCount: fixtures.length,
  uniqueHeadlineCount: uniqueHeadlines.size,
  uniqueSectionStructureCount: uniqueSectionStructures.size,
  archetypeCount: Object.keys(FUNNEL_ARCHETYPES_V2).length,
  results,
};

fs.writeFileSync(
  path.join(artifactDir, "funnel-fixture-results.json"),
  `${JSON.stringify(artifact, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(artifactDir, "qa-results.json"),
  `${JSON.stringify(results.map(({ name, qa }) => ({ name, qa })), null, 2)}\n`,
);

console.log(
  `Funnel Personalization V2 tests passed: ${fixtures.length} fixtures, ${uniqueHeadlines.size} unique headlines, ${uniqueSectionStructures.size} section structures.`,
);
