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
const { getInstantFormSetupReadiness } = require("../src/lib/services/instant-form-readiness.ts");

const onboardingPreview = fs.readFileSync("src/components/onboarding/prepaywall-campaign-preview.tsx", "utf8");
const previewPage = fs.readFileSync("src/app/(app)/preview/page.tsx", "utf8");
const launchPage = fs.readFileSync("src/app/(app)/launch/page.tsx", "utf8");
const launchRoute = fs.readFileSync("src/app/api/campaigns/create/route.ts", "utf8");
const buildCampaignRoute = fs.readFileSync("src/app/api/build-campaign/route.ts", "utf8");
const canonicalCampaign = fs.readFileSync("src/lib/services/canonical-campaign.ts", "utf8");
const campaignPersistence = fs.readFileSync("src/lib/services/campaign-persistence.ts", "utf8");
const campaignPlanDocument = fs.readFileSync("src/lib/services/campaign-plan-document.ts", "utf8");
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
assert.equal(
  getInstantFormSetupReadiness({
    metaSelectionReady: true,
    leadCaptureStatus: "operator_verified",
    leadCaptureReadyAt: "2026-06-30T00:00:00.000Z",
  }).ready,
  true,
  "operator-verified instant form setup must be launch-readiness eligible",
);
assert.equal(
  getInstantFormSetupReadiness({
    metaSelectionReady: true,
    leadCaptureStatus: "draft",
  }).ready,
  false,
  "draft instant form setup must stay blocked until operator verification",
);
assert.equal(
  getInstantFormSetupReadiness({
    metaSelectionReady: false,
    leadCaptureStatus: "operator_verified",
  }).ready,
  false,
  "instant form setup must still require Meta ad account, Page, and pixel selections",
);

assert.match(onboardingPreview, /isInstantFormCampaign/, "onboarding preview must use the shared instant-form classifier");
assert.match(onboardingPreview, /data-testid="instant-form-setup-preview"/, "instant form setup panel must be test-addressable");
assert.match(onboardingPreview, /compact \? "mt-7 h-\[320px\] max-h-\[42vh\]"/, "compact ad preview must use fixed viewport height instead of stretching beside instant-form setup");
assert.match(onboardingPreview, /grid min-w-0 items-stretch gap-3/, "preview package grid must keep ad and instant-form cards visually level");
assert.match(onboardingPreview, /flex h-full min-h-\[356px\] flex-col justify-between/, "compact instant-form panel must be balanced against the ad preview height");
assert.match(onboardingPreview, /Meta Instant Form Setup/, "instant form panel must name the native Meta setup");
assert.match(onboardingPreview, /Full name/, "instant form panel must show full name as a required field");
assert.match(onboardingPreview, /Email/, "instant form panel must show email as a required field");
assert.match(onboardingPreview, /Phone number/, "instant form panel must show phone as a required field");
assert.match(onboardingPreview, /No Meta instant form/, "preview safety copy must say no Meta form is created");
assert.match(
  onboardingPreview,
  /instantForm \? \(\s*<div[\s\S]*data-testid="instant-form-setup-preview"[\s\S]*:\s*\(\s*<CanonicalFunnelRenderer/,
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
assert.match(launchPage, /No public funnel publish gate is required/, "launch copy must not require funnel publishing for instant forms");
assert.match(launchPage, /getInstantFormSetupReadiness/, "launch page must derive instant form readiness from durable campaign state");
assert.doesNotMatch(
  launchPage,
  /const instantFormSetupReady = !instantFormCampaign;/,
  "launch page must not permanently block every instant-form campaign",
);
assert.match(
  launchPage,
  /!instantFormCampaign && !publicFunnelPublished/,
  "launch page must only show the public funnel publish panel for non-instant-form campaigns",
);
assert.match(
  launchPage,
  /instantFormReadiness\.blockingReason/,
  "launch page must block instant-form campaigns using the explicit setup readiness reason",
);

assert.match(launchRoute, /isInstantFormCampaign/, "launch API must classify instant-form campaigns before public-funnel checks");
assert.match(
  launchRoute,
  /getInstantFormSetupReadiness/,
  "launch API must gate instant-form launches with durable native-form readiness",
);
assert.match(
  launchRoute,
  /instant_form_setup_not_ready/,
  "launch API must return a specific setup-not-ready code when native form verification is missing",
);
assert.doesNotMatch(
  launchRoute,
  /instant_form_operator_assisted/,
  "launch API must not keep the old permanent instant-form launch block",
);
assert.match(
  launchRoute,
  /leadgen_forms/,
  "launch API must create or recover native Meta lead forms for instant-form campaigns",
);
assert.match(
  launchRoute,
  /assertMetaLeadFormPermissions/,
  "launch API must preflight native Meta lead-form permissions before creating campaign objects",
);
assert.ok(
  launchRoute.indexOf("assertMetaLeadFormPermissions") < launchRoute.indexOf("act_${externalAccountId}/campaigns"),
  "native Meta lead-form permission preflight must happen before campaign creation",
);
assert.match(
  launchRoute,
  /meta_lead_form_permission_missing/,
  "launch API must return a specific permission error when Page lead-form access is unavailable",
);
assert.match(
  launchRoute,
  /lead_gen_form_id/,
  "launch API must attach native Meta lead forms to lead-ad creatives",
);
assert.match(
  launchRoute,
  /optimization_goal: instantFormCampaign[\s\S]*LEAD_GENERATION/,
  "instant-form ad sets must optimize for native lead generation",
);
assert.match(
  launchRoute,
  /destination_type", "ON_AD"/,
  "instant-form ad sets must use on-ad destination delivery",
);
assert.match(
  launchRoute,
  /instantFormCampaign\s*\?\s*\{ ready: true/,
  "launch API must skip public-funnel/domain preflight for native instant forms",
);
assert.doesNotMatch(
  publicFunnelPage,
  /instant_form_operator_assisted|Instant Form setup|InstantFormSetupPreview/,
  "public funnel route must remain untouched by instant-form operator setup UI",
);

assert.match(
  canonicalCampaign,
  /narrowLeadCaptureMode\(params\.savedDocument\)/,
  "canonical campaign normalization must read lead-capture mode from the saved document",
);
assert.match(
  canonicalCampaign,
  /lead_capture_mode: leadCaptureMode/,
  "canonical campaign normalization must promote lead-capture mode into the plan",
);
assert.match(
  canonicalCampaign,
  /campaign_payload\?: Record<string, unknown> \| null/,
  "canonical saved document type must include campaign_payload so destination mode survives roundtrips",
);
assert.match(
  campaignPersistence,
  /const leadCaptureMode =[\s\S]*getLeadCaptureModeFromRecord\(mergedSavedDocument\)/,
  "campaign persistence must recover lead-capture mode before rebuilding the stored plan",
);
assert.match(
  campaignPersistence,
  /form_type: "instant_form"/,
  "campaign persistence must mirror instant-form mode into campaign_payload.form_type",
);
assert.match(
  campaignPlanDocument,
  /getLeadCaptureModeFromRecord/,
  "campaign plan document migration must normalize historical lead-capture mode markers",
);
assert.match(
  campaignPlanDocument,
  /form_type: "instant_form"/,
  "campaign plan document migration must repair missing instant form_type markers at read time",
);
assert.match(
  buildCampaignRoute,
  /getLeadCaptureModeFromRecord\(storedPlan\)/,
  "build campaign route must preserve lead-capture mode when writing campaign payload",
);
assert.ok(
  buildCampaignRoute.indexOf("const instantFormCampaign = isInstantFormCampaign") <
    buildCampaignRoute.indexOf("if (!instantFormCampaign && !hasFunnel)"),
  "build campaign route must classify native instant forms before artifact validation",
);
assert.match(
  buildCampaignRoute,
  /if \(!instantFormCampaign && !hasFunnel\)/,
  "build campaign route must not require public funnel artifacts for native instant forms",
);
assert.match(
  buildCampaignRoute,
  /const destinationUrl = instantFormCampaign\s*\?\s*null\s*:\s*await/,
  "build campaign route must not publish public funnels for native instant forms",
);
assert.ok(
  buildCampaignRoute.indexOf("await assertCampaignCanPublishFunnel(campaignId)") >
    buildCampaignRoute.indexOf("const destinationUrl = instantFormCampaign"),
  "build campaign route must place public-funnel publishing behind the instant-form destination guard",
);
assert.match(
  buildCampaignRoute,
  /\.\.\.\(destinationUrl \? \{ destination_url: destinationUrl \} : \{\}\)/,
  "instant-form campaign payloads must omit public destination_url instead of manufacturing a funnel URL",
);
assert.match(
  buildCampaignRoute,
  /form_type: "instant_form"/,
  "build campaign route must preserve instant-form payload markers",
);

console.log("instant form flow split tests passed");
