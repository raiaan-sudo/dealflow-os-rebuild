#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const service = read("src/lib/services/scale-readiness-service.ts");
const page = read("src/app/(app)/admin/control-room/page.tsx");
const report = read("scripts/print-scale-readiness-report.mjs");
const packageJson = JSON.parse(read("package.json"));
const navigation = read("src/lib/navigation.ts");
const freshdesk = read("src/lib/support/freshdesk.ts");

const requiredSections = [
  "queue",
  "provider",
  "billing",
  "leadSms",
  "meta",
  "clientErrors",
  "support",
];

for (const section of requiredSections) {
  assert.match(service, new RegExp(`${section}: \\{`), `scale snapshot must include ${section}`);
}

assert.match(service, /classifySystemJobLane/, "job lane classifier must exist");
assert.match(service, /CRITICAL_JOB_KINDS/, "critical job kinds must be explicit");
assert.match(service, /HEAVY_JOB_KINDS/, "heavy job kinds must be explicit");
assert.match(service, /JOB_LANE_CONCURRENCY_CAPS/, "lane concurrency caps must be explicit");
assert.match(service, /lead_capture_retry/, "lead capture retry must be classified");
assert.match(service, /lead_side_effects/, "lead side effects must be classified");
assert.match(service, /subscription_suspension/, "billing/subscription recovery must be classified");
assert.match(service, /static_creative_generation/, "static generation must be heavy");
assert.match(service, /video_generation/, "video generation must be heavy");
assert.match(service, /provider_polling/, "provider polling must be heavy");

assert.match(page, /assertInternalOperatorAccess/, "control-room page must be internal-operator only");
assert.match(page, /notFound\(\)/, "non-admin access must resolve to notFound");
assert.match(navigation, /\/admin\/control-room/, "admin navigation must expose the control room to approved operators");
assert.equal(
  packageJson.scripts["operator:scale-report"],
  "node ./scripts/print-scale-readiness-report.mjs",
  "daily report script must be registered",
);
assert.equal(
  packageJson.scripts["test:scale-readiness-report"],
  "node ./scripts/test-scale-readiness-report.mjs",
  "scale report test script must be registered",
);

for (const forbiddenSelect of [
  "email",
  "phone",
  "first_name",
  "last_name",
  "phone_raw",
  "phone_e164",
  "error_message",
  "campaign_name",
  "stack",
  "component_stack",
  "payload",
  "metadata",
  "access_token",
]) {
  assert.doesNotMatch(
    service,
    new RegExp(`\\.select\\([^)]*${forbiddenSelect}`, "i"),
    `service aggregate select must not include raw ${forbiddenSelect}`,
  );
  assert.doesNotMatch(
    report,
    new RegExp(`\\.select\\([^)]*${forbiddenSelect}`, "i"),
    `CLI aggregate select must not include raw ${forbiddenSelect}`,
  );
}

for (const forbiddenSideEffect of [
  "createBillingCheckoutSession",
  "createStripeCheckoutSession",
  "stripe.checkout.sessions.create",
  "sendSms(",
  "postTwilioMessage",
  "createFreshdeskTicket(",
  "fetchAdInsights",
  "executeMetaCampaignLaunch",
  ".insert(",
  ".update(",
  ".delete(",
  ".upsert(",
]) {
  assert.doesNotMatch(service, new RegExp(forbiddenSideEffect.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `service must not perform side effect ${forbiddenSideEffect}`);
  assert.doesNotMatch(report, new RegExp(forbiddenSideEffect.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `report must not perform side effect ${forbiddenSideEffect}`);
}

assert.match(freshdesk, /getFreshdeskOperationalStatus/, "Freshdesk operational status must be available to the control room");
assert.match(freshdesk, /missingEnvNames/, "Freshdesk status must expose missing env names only");
assert.doesNotMatch(freshdesk, /apiKey.*return/, "Freshdesk status must not return API key values");

console.log("Scale readiness report tests passed.");
