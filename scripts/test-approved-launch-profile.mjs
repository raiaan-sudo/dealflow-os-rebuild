import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const profile = JSON.parse(read("config/release/approved-launch-profile.v1.json"));

assert.equal(profile.schemaVersion, "dealflow.approved-launch-profile.v1");
assert.deepEqual(profile.commercialOffer, {
  plan: "pro",
  priceMinor: 29700,
  currency: "usd",
  interval: "month",
  trialDays: 0,
  initialCreditMinor: 1000,
  staticGenerationMinor: 100,
  videoGenerationMinor: 500,
  topUpMinimumMinor: 2500,
  topUpMaximumMinor: 100000,
  campaignSlots: "unlimited_subject_to_safety_limits",
  cancellation: "period_end",
  refunds: "manual_or_statutory_only",
  guaranteedOutcome: false,
  legacyPlans: "reconcile_existing_only",
});
assert.equal(profile.providers.meta, "paused_excluded");
assert.equal(profile.providers.heygen, "excluded");
assert.equal(profile.providers.elevenlabs, "excluded");
assert.equal(profile.providers.twilioLeadSms, "excluded");
assert.equal(profile.productScope.localBooking, "retired_use_verified_ghl_handoff");
assert.equal(profile.operations.maximumProviderTestSpendUsd, 20);

const releaseModule = read("src/lib/release/approved-launch-profile.ts");
assert.match(releaseModule, /approvedProviderMode\("meta"\) === "included"/);
for (const path of [
  "src/app/api/integrations/meta/connect/route.ts",
  "src/app/api/integrations/meta/callback/route.ts",
  "src/app/api/integrations/meta/selections/route.ts",
  "src/app/api/integrations/meta/status/route.ts",
  "src/app/api/integrations/meta/sync/route.ts",
  "src/app/api/integrations/meta/leadgen/routes/route.ts",
]) {
  assert.match(read(path), /isMetaProviderIncluded/);
}
const messages = read("src/lib/i18n/messages.ts");
assert.doesNotMatch(messages, /Includes live Meta launch access for this workspace/);
assert.match(messages, /External advertising-provider launch is not included in this release/);
assert.doesNotMatch(messages, /Comprend l'accès au lancement Meta en direct/);
assert.doesNotMatch(messages, /Incluye acceso al lanzamiento en vivo de Meta/);
assert.match(read("src/lib/billing/plan-presentation.ts"), /Campaign readiness and GHL handoff/);
const launchPage = read("src/app/(app)/launch/page.tsx");
assert.match(launchPage, /if \(!metaProviderIncluded\)/);
assert.match(launchPage, /DealFlow will not connect to Meta, create an ad/);

console.log("approved launch profile: PASS (offer, scope, provider exclusions, Meta route gates, and bounded operations)");
