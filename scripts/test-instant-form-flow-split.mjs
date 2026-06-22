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
const { isInstantFormCampaign } = require("../src/lib/campaign-destination.ts");

const onboardingPreview = fs.readFileSync("src/components/onboarding/prepaywall-campaign-preview.tsx", "utf8");
const previewPage = fs.readFileSync("src/app/(app)/preview/page.tsx", "utf8");
const launchPage = fs.readFileSync("src/app/(app)/launch/page.tsx", "utf8");
const launchRoute = fs.readFileSync("src/app/api/campaigns/create/route.ts", "utf8");
const publicFunnelPage = fs.readFileSync("src/app/f/[slug]/page.tsx", "utf8");

assert.equal(isInstantFormCampaign({ objective: "volume" }), false, "volume objective alone must not switch to instant form");
assert.equal(
  isInstantFormCampaign({ leadCaptureMode: "volume_lead_form" }),
  true,
  "volume_lead_form is an explicit native lead-form destination",
);
assert.equal(
  isInstantFormCampaign({ campaign_payload: { form_type: "instant_form" } }),
  true,
  "nested form_type instant_form must classify as instant form",
);
assert.equal(
  isInstantFormCampaign({ campaignDestination: "Website", objective: "volume" }),
  false,
  "website/funnel campaigns stay on the public funnel even with volume-style objectives",
);
assert.equal(
  isInstantFormCampaign({ funnel: { leadCaptureMode: "quality_funnel" }, destination: "landing_page" }),
  false,
  "quality funnel and landing page campaigns must not be treated as instant forms",
);

assert.match(onboardingPreview, /isInstantFormCampaign/, "onboarding preview must use the shared instant-form classifier");
assert.match(onboardingPreview, /function InstantFormSetupPreview/, "onboarding preview must have an instant form setup panel");
assert.match(onboardingPreview, /data-testid="instant-form-setup-preview"/, "instant form setup panel must be test-addressable");
assert.match(onboardingPreview, /compact \? "mt-7 h-\[320px\] max-h-\[42vh\]"/, "compact ad preview must use fixed viewport height instead of stretching beside instant-form setup");
assert.match(onboardingPreview, /grid min-w-0 items-start gap-3/, "preview package grid must align preview cards to the top instead of stretching them vertically");
assert.match(onboardingPreview, /Meta Instant Form Setup/, "instant form panel must name the native Meta setup");
assert.match(onboardingPreview, /Full name/, "instant form panel must show full name as a required field");
assert.match(onboardingPreview, /Email/, "instant form panel must show email as a required field");
assert.match(onboardingPreview, /Phone number/, "instant form panel must show phone as a required field");
assert.match(onboardingPreview, /No Meta instant form/, "preview safety copy must say no Meta form is created");
assert.match(
  onboardingPreview,
  /instantFormCampaign \? \(\s*<InstantFormSetupPreview[\s\S]*:\s*\(\s*<FunnelPreviewMock/,
  "instant form campaigns must render setup preview instead of funnel preview",
);

assert.match(previewPage, /isInstantFormCampaign/, "protected preview page must use the shared instant-form classifier");
assert.match(previewPage, /function InstantFormPreviewPanel/, "protected preview page must have a native lead-form panel");
assert.match(previewPage, /Meta Instant Form preview/, "protected preview must label instant-form campaigns clearly");
assert.match(
  previewPage,
  /instantFormCampaign \? \(\s*<InstantFormPreviewPanel[\s\S]*:\s*\(\s*<>[\s\S]*<FunnelPreview/,
  "protected preview must render instant-form setup instead of the public funnel preview",
);

assert.match(launchPage, /instantFormCampaign\s*\?\s*null\s*:\s*await withTimeout/, "launch page must skip public-funnel Meta preflight for instant forms");
assert.match(launchPage, /Instant form setup/, "launch readiness must include an instant form setup gate");
assert.match(launchPage, /Public funnel publish checks are not required/, "launch copy must not require funnel publishing for instant forms");
assert.match(
  launchPage,
  /!instantFormCampaign && !publicFunnelPublished/,
  "launch page must only show the public funnel publish panel for non-instant-form campaigns",
);
assert.match(
  launchPage,
  /Meta Instant Form setup is operator-assisted/,
  "launch page must block instant-form campaigns behind an operator-assisted setup gate",
);

assert.match(launchRoute, /isInstantFormCampaign/, "launch API must classify instant-form campaigns before public-funnel checks");
assert.match(
  launchRoute,
  /instant_form_operator_assisted/,
  "launch API must fail instant-form launches with an explicit operator-assisted code",
);
assert.doesNotMatch(
  publicFunnelPage,
  /instant_form_operator_assisted|Instant Form setup|InstantFormSetupPreview/,
  "public funnel route must remain untouched by instant-form operator setup UI",
);

console.log("instant form flow split tests passed");
