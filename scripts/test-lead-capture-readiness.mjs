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
  const output = ts.transpileModule(ts.sys.readFile(filename) ?? "", {
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
const { normalizeLeadCaptureStrategy } = require("../src/lib/services/lead-capture-strategy-service.ts");
const {
  evaluateLeadCaptureReadiness,
} = require("../src/lib/services/lead-capture-readiness-service.ts");
const {
  getLaunchBlockingReasons,
  getLaunchRequirements,
} = require("../src/lib/services/launch-readiness.ts");

const env = {
  LEAD_CAPTURE_STRATEGY_ENABLED: "true",
  META_INSTANT_FORMS_ENABLED: "true",
};

const website = normalizeLeadCaptureStrategy(
  { lead_capture_goal: "quality", capture_method: "website_funnel" },
  { env, intent: "buyer", privacyPolicyUrl: "https://app.agentdealflow.io/privacy", funnelId: "funnel-1" },
);
assert.equal(
  evaluateLeadCaptureReadiness({ strategy: website, funnelExists: true }).ready,
  true,
);

const instant = normalizeLeadCaptureStrategy(
  {
    lead_capture_goal: "balanced",
    capture_method: "meta_instant_form",
    privacy_policy_url: "https://app.agentdealflow.io/privacy",
  },
  { env, intent: "seller" },
);
const blockedInstant = evaluateLeadCaptureReadiness({
  strategy: instant,
  metaConnected: false,
  pageSelected: false,
  adAccountSelected: false,
});
assert.equal(blockedInstant.ready, false);
assert.ok(blockedInstant.blockers.includes("meta_connection_missing"));
assert.ok(blockedInstant.blockers.includes("meta_page_missing"));

const readyInstant = evaluateLeadCaptureReadiness({
  strategy: instant,
  metaConnected: true,
  pageSelected: true,
  adAccountSelected: true,
  pixelSelected: true,
});
assert.equal(readyInstant.ready, true);

const requirements = getLaunchRequirements({
  campaignSaved: true,
  metaConnected: true,
  metaTrackingState: {
    status: {
      metadata: {
        pixelId: "pixel-1",
        launchDomain: "app.agentdealflow.io",
        domainVerified: true,
      },
    },
  },
  leadCapture: blockedInstant,
});
assert.deepEqual(getLaunchBlockingReasons(requirements), ["meta_connection_missing"]);

console.log("lead capture readiness tests passed");
