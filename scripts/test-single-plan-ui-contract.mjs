#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const appContext = read("src/lib/services/app-context.ts");
const onboarding = read("src/app/(app)/onboarding/page.tsx");
const loginPage = read("src/app/(auth)/login/page.tsx");
const uiDirection = read("src/app/ui-direction/page.tsx");
const plans = read("src/lib/billing/plans.ts");
const planPresentation = read("src/lib/billing/plan-presentation.ts");
const productMessages = read("src/lib/i18n/messages.ts");
const commercialContract = read("scripts/test-commercial-contracts.mjs");

const newWorkspacePlanAssignments = appContext.match(/plan_tier:\s*"pro"/g) ?? [];
assert.equal(
  newWorkspacePlanAssignments.length,
  2,
  "both primary and duplicate-slug new-workspace paths must default to Pro",
);
assert.doesNotMatch(
  appContext,
  /plan_tier:\s*"starter"/,
  "new workspaces must never be initialized as the archived Starter acquisition plan",
);

assert.match(plans, /NEW_CHECKOUT_PLAN_TIER = "pro"/, "new checkout authority must remain Pro");
assert.match(
  plans,
  /GRANDFATHERED_PLAN_TIERS = \["starter", "growth"\]/,
  "stored grandfathered plans must remain parseable",
);
assert.match(
  planPresentation,
  /SELECTABLE_PLAN_TIERS = \["pro"\]/,
  "new onboarding must expose exactly one selectable plan",
);
assert.match(onboarding, /planTier: "pro"/, "new onboarding must default to Pro");
assert.doesNotMatch(
  onboarding,
  /Starter keeps you in control/,
  "new onboarding copy must not present Starter as a current plan",
);
assert.match(
  onboarding,
  /t\("onboarding\.planArchived"\)/,
  "new onboarding must resolve the single-plan explanation through i18n",
);
assert.match(
  productMessages,
  /"onboarding\.planArchived": "[^"]*Operator Launch at \$297\/month\."/,
  "the canonical English catalog must state the single Pro price",
);

assert.doesNotMatch(
  loginPage,
  /resolvedSearchParams\.plan|requestedPlan|planRedirect|dashboard\?plan=/,
  "login must ignore archived plan-selection query parameters",
);
assert.match(loginPage, /redirectedFrom=\{redirectedFrom\}/, "login must preserve only the normal safe redirect path");

assert.match(uiDirection, /notFound\(\)/, "the obsolete design-preview route must fail closed");
assert.doesNotMatch(uiDirection, /BILLING_PLANS|PlanAwareResultsPreview|dashboard\?plan=|\$97/, "the closed route must contain no renderable legacy-plan UI");

assert.match(
  commercialContract,
  /assert\.doesNotMatch\(dashboardPage, \/PlanAwareResultsPreview\|requestedPlanTier\//,
  "the existing commercial contract must continue proving dashboard plan-query indifference",
);
assert.match(
  commercialContract,
  /assert\.doesNotMatch\(resultsPage, \/normalizeBillingPlanTier\|params\\\.plan\//,
  "the existing commercial contract must continue proving results plan-query indifference",
);

console.log("single $297 Pro acquisition UI contract: PASS");
