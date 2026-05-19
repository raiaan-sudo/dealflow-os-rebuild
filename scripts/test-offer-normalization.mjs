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
const { normalizeOfferForCampaign } = require("../src/lib/services/offer-normalization-service.ts");

assert.deepEqual(
  pick(normalizeOfferForCampaign("Guaranteed approvl for 600 n up credit", "buyer")),
  {
    normalizedOffer: "Home Options for 600+ Credit",
    cta: "See 600+ Credit Home Options",
    intent: "approval",
    changed: true,
  },
);

assert.equal(
  normalizeOfferForCampaign("guarenteed sale in 90 day", "seller").normalizedOffer,
  "90-Day Home Sale Plan",
);
assert.equal(
  normalizeOfferForCampaign("600 plus credit", "buyer").normalizedOffer,
  "Home Options for 600+ Credit",
);
assert.equal(
  normalizeOfferForCampaign("full furnish your entire first floor", "buyer").normalizedOffer,
  "Furnish Your Entire First Floor",
);
assert.equal(
  normalizeOfferForCampaign("private inventory preview", "buyer").normalizedOffer,
  "Private Inventory Preview",
);

function pick(result) {
  return {
    normalizedOffer: result.normalizedOffer,
    cta: result.cta,
    intent: result.intent,
    changed: result.changed,
  };
}

console.log("Offer normalization tests passed.");
