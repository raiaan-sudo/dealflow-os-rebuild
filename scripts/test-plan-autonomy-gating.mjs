#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const packageJson = JSON.parse(read("package.json"));
const plans = read("src/lib/billing/plans.ts");
const entitlements = read("src/lib/services/campaign-entitlements.ts");
const billingService = read("src/lib/services/billing-service.ts");
const shared = read("src/app/api/autonomy/_shared.ts");
const route = read("src/app/api/autonomy/route.ts");
const runRoute = read("src/app/api/autonomy/run/route.ts");
const dashboard = read("src/components/dashboard/campaign-dashboard-view.tsx");
const modeControl = read("src/components/dashboard/autonomy-mode-control.tsx");
const feed = read("src/components/dashboard/autonomy-actions-feed.tsx");

assert.equal(
  packageJson.scripts["test:plan-autonomy-gating"],
  "node ./scripts/test-plan-autonomy-gating.mjs",
  "plan/autonomy gating regression script must be registered",
);

assert.match(plans, /starter:[\s\S]*priceLabel:\s*"\$147\/mo"/, "Starter must stay $147/mo");
assert.match(plans, /pro:[\s\S]*priceLabel:\s*"\$297\/mo"/, "Pro must stay $297/mo");
assert.match(plans, /growth:[\s\S]*priceLabel:\s*"\$497\/mo"/, "Growth must not interfere with Starter/Pro pricing");
assert.match(plans, /performance:[\s\S]*priceLabel:\s*"\$97\/mo \+ \$3\/qualified lead charged immediately"/, "Performance must be the only $97 base plan");
assert.match(plans, /autonomy_access:\s*"pro"/, "autonomy access must remain Pro-gated");

assert.match(entitlements, /ACTIVE_SUBSCRIPTION_STATUSES = new Set\(\["active", "trialing"\]\)/, "active and trialing billing are active states");
assert.match(entitlements, /PAYMENT_ISSUE_STATUSES = new Set\(\["past_due", "incomplete"\]\)/, "past due billing must be classified separately");
assert.match(entitlements, /SUSPENDED_SUBSCRIPTION_STATUSES = new Set\(\[[\s\S]*"canceled"[\s\S]*"unpaid"[\s\S]*\]\)/, "canceled and unpaid billing must suspend execution");
assert.match(entitlements, /canRunOptimization: paidLaunchAccess \|\| launchOverride/, "recommendations require active billing or explicit override");
assert.match(entitlements, /canRunAutonomy: \(paidLaunchAccess \|\| launchOverride\) && autonomyFeatureAllowed/, "autonomy execution requires active billing and Pro feature access");

assert.doesNotMatch(
  billingService,
  /canRunAutonomy: summary\.canRunAutonomy \|\| launchOverride/,
  "billing override must not make Starter look autonomy-entitled",
);

assert.match(shared, /getCampaignEntitlementsForCampaign\(plan\.id\)/, "autonomy evaluation must load entitlements");
assert.match(shared, /effectiveMode = entitlements\.canRunAutonomy \? requestedMode : "manual"/, "Starter must be forced to manual recommendation mode");
assert.match(shared, /Optimization recommendations require active billing/, "inactive billing must block recommendation evaluation");
assert.match(shared, /Customer Autopilot mode is not enabled for this campaign/, "Pro Autopilot execution must require customer settings");
assert.match(shared, /A current published funnel snapshot is required before Autopilot execution/, "Autopilot must require a current funnel snapshot");
assert.match(shared, /Meta\/app campaign identity drift blocks automation/, "Autopilot must block Meta/app drift");
assert.match(shared, /dailyBudgetCapCents:\s*approvedDailyBudgetCapCents/, "autonomy budget cap must use explicit customer or campaign caps only");
assert.doesNotMatch(shared, /META_DAILY_BUDGET_CAP_CENTS|envDailyBudgetCapCents/, "removed platform budget cap must not constrain autonomy recommendations");

assert.match(route, /body\.mode !== "manual"[\s\S]*assertAutonomyExecutionAccess\(result\.campaignId\)/, "Starter cannot enable assisted or Autopilot modes");
assert.match(route, /updateCampaignAutonomyMode/, "Pro mode selection must persist to campaign Autopilot settings");
assert.match(runRoute, /assertSameOriginRequest/, "autonomy run route must reject cross-site mutation attempts");
assert.match(runRoute, /assertAutonomyExecutionAccess\(result\.campaignId\)/, "autonomy run route must require Pro execution access");
assert.match(runRoute, /Synthetic Meta adapter recorded a safe internal autonomy action/, "dry-run/synthetic route must not call live Meta");
assert.doesNotMatch(runRoute, /executeMetaCampaignLaunch|stripe\.checkout|sendSms|createFreshdeskTicket|generateCreativePackage/, "autonomy run route must not call live side-effect helpers");

assert.match(modeControl, /planTier === "starter"/, "Starter mode controls must stay locked");
assert.match(modeControl, /autonomyEntitled/, "mode controls must require Pro autonomy entitlement");
assert.match(dashboard, /Starter keeps you in control with guided recommendations/, "Starter dashboard copy must be guided");
assert.match(dashboard, /Upgrade to Pro to enable safe optimization execution/, "Starter dashboard must show Pro upgrade path");
assert.match(dashboard, /planTier !== "starter" && autonomyEntitled/, "dashboard action controls must require non-Starter entitlement");
assert.match(feed, /Starter keeps execution manual/, "Starter feed must not show executable approval controls");
assert.doesNotMatch(dashboard, /Autopilot can execute without approval|executed successfully from this dashboard/i, "dashboard must not overclaim execution");

console.log("Plan and autonomy gating regression tests passed.");
