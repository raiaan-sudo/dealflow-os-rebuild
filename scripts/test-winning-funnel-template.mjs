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
assert.equal(funnel.theme.primaryColor, "#0A0A0A", "theme colors must persist");
assert.ok(funnel.quizSteps.length >= 4, "winning funnel must include native quiz steps");
assert.ok(funnel.sections.some((section) => section.variant === "native-multi-step-quiz"), "winning funnel must expose quiz section");
assert.ok(funnel.optimization_notes.some((note) => /Locked real_estate_lead_quiz_v1 layout/.test(note)), "winning funnel must disclose locked layout internally");
assert.doesNotMatch(JSON.stringify(funnel), /generated sections|old funnel|direct-response funnel V1/i, "default winning funnel must not expose legacy copy");

const legacy = generateLegacyFunnel({
  location: "Toronto, ON",
  audience: "buyers",
  offer: "Homes under $900k",
  funnelVariant: "buyer_homes_under_price",
});

assert.notEqual(legacy.funnelTemplateId, WINNING_FUNNEL_TEMPLATE_ID, "legacy generator must stay explicit and separate");

console.log("winning funnel template checks passed.");
