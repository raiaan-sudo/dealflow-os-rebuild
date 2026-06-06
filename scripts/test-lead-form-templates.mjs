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
const {
  BUILT_IN_LEAD_FORM_TEMPLATES,
  getLeadFormTemplate,
  getLeadFormTemplateForGoal,
  validateLeadFormTemplate,
} = require("../src/lib/services/lead-form-template-service.ts");
const {
  buildMetaLeadFormQuestions,
  buildWebsiteFunnelFormFields,
} = require("../src/lib/services/lead-form-question-builder.ts");

assert.equal(BUILT_IN_LEAD_FORM_TEMPLATES.length, 3);
assert.equal(getLeadFormTemplateForGoal("volume").frictionLevel, "low");
assert.equal(getLeadFormTemplateForGoal("balanced").frictionLevel, "medium");
assert.equal(getLeadFormTemplateForGoal("quality").frictionLevel, "high");

const balanced = getLeadFormTemplate("balanced_instant_form");
const questions = buildMetaLeadFormQuestions(balanced);
assert.ok(questions.some((question) => question.type === "FULL_NAME"));
assert.ok(questions.some((question) => question.type === "CUSTOM_WITH_OPTIONS"));

const fields = buildWebsiteFunnelFormFields(getLeadFormTemplate("quality_website_funnel"));
assert.ok(fields.includes("phone"));
assert.ok(fields.includes("budget_or_value_range"));

assert.deepEqual(
  validateLeadFormTemplate(balanced, {
    privacyPolicyUrl: "",
    smsConsentEnabled: true,
  }).blockers,
  ["privacy_policy_url_missing"],
);
assert.equal(
  validateLeadFormTemplate(balanced, {
    privacyPolicyUrl: "https://app.agentdealflow.io/privacy",
    smsConsentEnabled: true,
  }).valid,
  true,
);

console.log("lead form template tests passed");
