#!/usr/bin/env node

import assert from "node:assert/strict";
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

const require = createRequire(import.meta.url);
const {
  DIRECT_RESPONSE_FUNNEL_VARIANTS,
  buildDirectResponseFunnel,
  validateDirectResponseCompliance,
  validateDirectResponseMessageMatch,
} = require("../src/lib/direct-response-funnel.ts");
const { generateFunnel } = require("../src/lib/services/funnel-engine.ts");

assert.equal(DIRECT_RESPONSE_FUNNEL_VARIANTS.length, 10, "all 10 FRIDAY variants should be registered");

const requiredSections = new Set([
  "hero",
  "form",
  "proof_metrics",
  "process",
  "faq",
  "market_snapshot",
  "closing_cta",
]);
const expectedMetadataFields = [
  "funnelVariant",
  "audienceType",
  "offerType",
  "market",
  "priceThreshold",
  "leadMagnetTitle",
  "primaryCTA",
  "formFields",
  "proofClaims",
  "complianceDisclaimer",
  "messageMatchSource",
  "adHook",
  "formMode",
];
const formModes = new Set();

for (const variant of DIRECT_RESPONSE_FUNNEL_VARIANTS) {
  const funnel = buildDirectResponseFunnel({
    funnelVariant: variant,
    market: "Toronto, ON",
    priceThreshold: "$750,000",
  });

  assert.equal(funnel.funnelVariant, variant, `${variant} should echo the selected variant`);
  assert.equal(funnel.market, "Toronto, ON", `${variant} should preserve the market`);
  assert.equal(funnel.priceThreshold, "$750,000", `${variant} should preserve the price threshold`);
  assert.equal(funnel.primaryCTA, funnel.cta, `${variant} should align top-level CTA fields`);
  assert.deepEqual(funnel.formFields, funnel.form_fields, `${variant} should align form field fields`);
  assert.equal(funnel.aboveFoldFormConfig.submitLabel, funnel.primaryCTA, `${variant} should align form submit label`);
  assert.equal(funnel.hero.eyebrow, funnel.heroEyebrow, `${variant} should expose hero eyebrow`);
  assert.equal(funnel.hero.headline, funnel.headline, `${variant} should expose hero headline`);
  assert.equal(funnel.hero.subheadline, funnel.subheadline, `${variant} should expose hero subheadline`);

  for (const field of expectedMetadataFields) {
    assert.ok(funnel[field] !== undefined, `${variant} missing metadata field ${field}`);
  }

  for (const sectionType of requiredSections) {
    assert.ok(
      funnel.sections.some((section) => section.type === sectionType),
      `${variant} missing ${sectionType} section`,
    );
  }

  assert.ok(
    funnel.sections.find((section) => section.type === "hero").content.some((line) => line.startsWith("Eyebrow:")),
    `${variant} hero should include eyebrow copy`,
  );
  assert.ok(
    funnel.sections.find((section) => section.type === "form").content.some((line) => line.startsWith("Lead-capture fields:")),
    `${variant} form should include lead-capture field notes`,
  );
  assert.ok(
    funnel.sections.find((section) => section.type === "closing_cta").content.some((line) => line.includes("Compliance footer:")),
    `${variant} closing CTA should include compliance footer`,
  );

  const compliance = validateDirectResponseCompliance(funnel);
  assert.deepEqual(compliance.issues, [], `${variant} compliance issues: ${compliance.issues.join(", ")}`);
  assert.equal(compliance.valid, true, `${variant} should pass compliance validation`);

  const messageMatch = validateDirectResponseMessageMatch(funnel);
  assert.deepEqual(messageMatch.issues, [], `${variant} message-match issues: ${messageMatch.issues.join(", ")}`);
  assert.equal(messageMatch.valid, true, `${variant} should pass message-match validation`);
  assert.ok(messageMatch.matchedTerms.length >= 2, `${variant} should have at least two matched terms`);

  if (funnel.formMode === "minimal") {
    assert.deepEqual(
      funnel.leadCaptureFields.map((field) => field.name),
      ["name", "phone"],
      `${variant} minimal mode should collect name plus one contact method`,
    );
  } else {
    assert.ok(funnel.leadCaptureFields.length >= 4, `${variant} should collect a qualifying field`);
  }
  assert.ok(funnel.proofClaims.length >= 3, `${variant} should include proof claims`);
  assert.ok(funnel.complianceDisclaimer.includes("Equal housing opportunity"), `${variant} should include fair-housing disclaimer`);
  assert.ok(!/guaranteed?\s+(profit|return|roi|approval|sale|showing|appointment|incentive|availability)/i.test(JSON.stringify(funnel)));

  formModes.add(funnel.formMode);
}

assert.deepEqual(
  [...formModes].sort(),
  ["highIntent", "minimal", "standard"],
  "variant defaults should cover every supported form mode",
);

const generated = generateFunnel({
  funnel_variant: "buyer_homes_under_price",
  location: "Austin, TX",
  price_threshold: "$600,000",
});
assert.equal(generated.funnelVariant, "buyer_homes_under_price");
assert.equal(generated.market, "Austin, TX");
assert.equal(generated.funnel_type, "landing_page_form");
assert.ok(generated.headline.includes("$600,000"));

const first = generateFunnel({
  funnel_variant: "appointment_strategy_call",
  location: "Miami, FL",
});
const second = generateFunnel({
  funnel_variant: "appointment_strategy_call",
  location: "Miami, FL",
});
assert.deepEqual(first, second, "direct-response generation should be deterministic");
assert.equal(first.formMode, "minimal");
assert.equal(first.funnel_type, "landing_page_book_call");

const explicitSurvey = buildDirectResponseFunnel({
  funnelVariant: "seller_cma",
  market: "Denver, CO",
  formMode: "standard",
});
assert.equal(explicitSurvey.formMode, "standard");
assert.equal(explicitSurvey.funnel_type, "landing_page_form");

console.log("Direct-response funnel tests passed.");
