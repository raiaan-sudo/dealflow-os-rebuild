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
const { getLeadFormTemplate } = require("../src/lib/services/lead-form-template-service.ts");
const {
  ingestLeadForQualification,
  buildLeadDedupeKey,
} = require("../src/lib/services/lead-ingestion-service.ts");
const { getLeadRoutingDecision } = require("../src/lib/services/lead-routing-service.ts");
const { buildLeadAttribution } = require("../src/lib/services/lead-attribution-service.ts");

const template = getLeadFormTemplate("balanced_instant_form");
const lead = ingestLeadForQualification({
  campaignId: "campaign-1",
  organizationId: "org-1",
  source: "meta_instant_form",
  sourceLeadId: "meta-lead-1",
  template,
  rawPayload: {
    full_name: "Lisa Zhao",
    phone: "+14165550101",
    email: "lisa@example.com",
    buying_timeline: "0-3 months",
    target_area: "Austin",
  },
});

assert.equal(lead.qualification.qualified, true);
assert.equal(lead.dedupeKey, "campaign-1:meta_instant_form:meta-lead-1");
assert.equal(
  buildLeadDedupeKey({
    campaignId: "campaign-1",
    source: "website_funnel",
    payload: lead.payload,
  }),
  "campaign-1:website_funnel:+14165550101",
);

const route = getLeadRoutingDecision({ lead, destination: "dealflow_dashboard" });
assert.equal(route.shouldQueueDelivery, true);
assert.equal(route.shouldNotifyOperator, false);

const attribution = buildLeadAttribution({
  campaignId: "campaign-1",
  organizationId: "org-1",
  captureMethod: "meta_instant_form",
  leadCaptureGoal: "balanced",
  query: { utm_source: "meta", utm_campaign: "austin-buyer" },
  metaLeadFormId: "123",
});
assert.equal(attribution.utmSource, "meta");
assert.equal(attribution.metaLeadFormId, "123");

console.log("lead ingestion tests passed");
