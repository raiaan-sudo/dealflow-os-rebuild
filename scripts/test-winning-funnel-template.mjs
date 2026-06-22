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
    return originalResolve.call(this, path.join(repoRoot, "src", request.slice(2)), parent, isMain, options);
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
  WINNING_FUNNEL_TEMPLATE_ID,
  WINNING_FUNNEL_TEMPLATE_VERSION,
} = require("../src/lib/funnels/winning-template/schema.ts");
const { generateFunnel, generateLegacyFunnel } = require("../src/lib/services/funnel-engine.ts");

const funnel = generateFunnel({
  location: "Quebec City, QC",
  audience: "downsizers looking for a simpler move",
  offer: "Free custom downsizing home plan",
  market_type: "buyer",
  language: "fr",
  theme: {
    primaryColor: "#0A0A0A",
    secondaryColor: "#F3EEE5",
    accentColor: "#188BF6",
    fontPreset: "luxury",
  },
});

assert.equal(funnel.funnelTemplateId, WINNING_FUNNEL_TEMPLATE_ID, "default customer funnel must use winning template id");
assert.equal(funnel.funnelTemplateVersion, WINNING_FUNNEL_TEMPLATE_VERSION, "winning template version must be persisted");
assert.equal(funnel.templateLocked, true, "winning funnel layout must be locked");
assert.equal(funnel.language, "fr", "French language selection must persist");
assert.equal(funnel.agent.name, "Votre conseiller local", "French funnels must use a localized default advisor name");
assert.equal(funnel.theme.primaryColor, "#0A0A0A", "theme colors must persist");
assert.deepEqual(funnel.form_fields, ["name", "phone", "email"], "reference opt-in funnel must collect name, phone, and email");
assert.equal(funnel.sections.length, 4, "reference opt-in funnel must stay a compact single-page structure");
assert.ok(funnel.sections.some((section) => section.variant === "reference-centered-hero"), "reference opt-in funnel must expose centered hero");
assert.ok(funnel.sections.some((section) => section.variant === "reference-trust-row"), "reference opt-in funnel must expose trust bullet row");
assert.ok(funnel.sections.some((section) => section.variant === "reference-opt-in-card"), "reference opt-in funnel must expose opt-in card");
assert.ok(funnel.optimization_notes.some((note) => /Locked reference_opt_in_funnel_v1 layout/.test(note)), "winning funnel must disclose locked reference layout internally");
assert.doesNotMatch(
  JSON.stringify(funnel),
  /generated sections|old funnel|direct-response funnel V1|View homes that actually match your criteria|Quick capture|Local real estate advisor|Get List|native-multi-step-quiz|Meet your advisor|Real results from real clients|Start with the short quiz/i,
  "default winning funnel must not expose legacy copy",
);

const marketQualifiedAudienceFunnel = generateFunnel({
  location: "Toronto, ON",
  audience: "home buyers searching for $900k-$1.5m homes in Toronto, ON",
  offer: "Free custom home list",
  market_type: "buyer",
});
const marketQualifiedOutput = JSON.stringify(marketQualifiedAudienceFunnel);

assert.doesNotMatch(
  marketQualifiedOutput,
  /in Toronto, ON in Toronto, ON/i,
  "winning funnel must not append the market twice when audience already includes it",
);
assert.doesNotMatch(
  marketQualifiedOutput,
  /Verified local client Client review/i,
  "fallback testimonial copy must not duplicate generic client-review wording",
);

const legacy = generateLegacyFunnel({
  location: "Toronto, ON",
  audience: "buyers",
  offer: "Homes under $900k",
  funnelVariant: "buyer_homes_under_price",
});

assert.notEqual(legacy.funnelTemplateId, WINNING_FUNNEL_TEMPLATE_ID, "legacy generator must stay explicit and separate");

console.log("winning funnel template checks passed.");
