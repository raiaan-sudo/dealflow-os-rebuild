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
  normalizeLeadCaptureStrategy,
  inferSpecialAdCategory,
  isLiveMetaLeadFormCreationAllowed,
} = require("../src/lib/services/lead-capture-strategy-service.ts");
const {
  buildMetaLeadFormPreview,
  createMetaLeadForm,
} = require("../src/lib/services/meta-lead-form-service.ts");

const disabledEnv = {
  LEAD_CAPTURE_STRATEGY_ENABLED: "false",
  META_INSTANT_FORMS_ENABLED: "false",
  LEAD_FORM_LAUNCH_ENABLED: "false",
  ALLOW_META_LIVE_LAUNCH: "false",
};

const enabledEnv = {
  LEAD_CAPTURE_STRATEGY_ENABLED: "true",
  META_INSTANT_FORMS_ENABLED: "true",
  LEAD_FORM_LAUNCH_ENABLED: "false",
  ALLOW_META_LIVE_LAUNCH: "false",
};

const legacyDefault = normalizeLeadCaptureStrategy(
  { lead_capture_goal: "volume", capture_method: "meta_instant_form" },
  { env: disabledEnv, intent: "buyer" },
);
assert.equal(legacyDefault.capture_method, "website_funnel");
assert.equal(legacyDefault.lead_capture_goal, "quality");
assert.equal(legacyDefault.special_ad_category, "HOUSING");

const balanced = normalizeLeadCaptureStrategy(
  {
    lead_capture_goal: "balanced",
    capture_method: "meta_instant_form",
    privacy_policy_url: "https://app.agentdealflow.io/privacy",
  },
  { env: enabledEnv, intent: "seller" },
);
assert.equal(balanced.capture_method, "meta_instant_form");
assert.equal(balanced.form_friction_level, "medium");
assert.equal(balanced.lead_form_template_id, "balanced_instant_form");
assert.equal(inferSpecialAdCategory({ intent: "commercial_real_estate" }), "HOUSING");

const preview = buildMetaLeadFormPreview({
  campaignId: "campaign-1",
  organizationId: "org-1",
  strategy: balanced,
  formName: "QA Balanced Form",
});
assert.equal(preview.formName, "QA Balanced Form");
assert.equal(preview.specialAdCategory, "HOUSING");
assert.ok(preview.mockLeadFormId.startsWith("mock_meta_lead_form_"));
assert.ok(preview.questions.some((question) => question.type === "PHONE"));

assert.equal(isLiveMetaLeadFormCreationAllowed(enabledEnv), false);
await assert.rejects(
  () =>
    createMetaLeadForm({
      campaignId: "campaign-1",
      organizationId: "org-1",
      strategy: balanced,
      env: enabledEnv,
    }),
  /Live Meta lead form creation is disabled/,
);

const mockResult = await createMetaLeadForm({
  campaignId: "campaign-1",
  organizationId: "org-1",
  strategy: balanced,
  env: enabledEnv,
  mockOnly: true,
});
assert.equal(mockResult.mode, "mock");
assert.equal(mockResult.leadFormId, preview.mockLeadFormId);

console.log("lead capture strategy tests passed");
