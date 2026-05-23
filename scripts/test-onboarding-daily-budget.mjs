#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const packageJson = JSON.parse(read("package.json"));
const onboardingPage = read("src/app/(app)/onboarding/page.tsx");
const onboardingRoute = read("src/app/api/onboarding/plan/route.ts");
const campaignPlanService = read("src/lib/services/campaign-plan-service.ts");
const prepaywallPreview = read("src/components/onboarding/prepaywall-campaign-preview.tsx");
const launchPage = read("src/app/(app)/launch/page.tsx");
const builderPage = read("src/app/(app)/builder/page.tsx");
const launchSuccessPage = read("src/app/(app)/launch-success/page.tsx");
const metaLaunchService = read("src/lib/services/meta-launch-service.ts");
const autonomyShared = read("src/app/api/autonomy/_shared.ts");
const autonomyExecution = read("src/lib/services/autonomy-execution-service.ts");

assert.equal(
  packageJson.scripts["test:onboarding-daily-budget"],
  "node ./scripts/test-onboarding-daily-budget.mjs",
  "focused onboarding daily budget test must be registered",
);

for (const label of ["$30/day", "$50/day", "$75/day", "$100/day"]) {
  assert.match(onboardingPage, new RegExp(label.replace("$", "\\$").replace("/", "\\/")), `${label} preset must render`);
}

assert.match(onboardingPage, /dailyBudget:\s*"30"/, "default onboarding budget must be $30/day");
assert.match(onboardingPage, /Daily ad spend budget/, "onboarding budget field must be daily-first");
assert.match(onboardingPage, /Custom daily amount/, "custom amount must be labeled as daily");
assert.match(onboardingPage, /not a monthly commitment/, "onboarding must avoid monthly-commitment framing");
assert.match(onboardingPage, /Estimated 30-day media spend/, "30-day estimate may only be secondary explanatory copy");
assert.match(onboardingPage, /currency:\s*"CAD"/, "onboarding ad spend must label CAD consistently");
assert.doesNotMatch(onboardingPage, /Monthly ad budget|\$1\.5k\/mo|\$3k\/mo|\$5k\/mo|\$7\.5k\+\/mo/, "old monthly onboarding choices must be removed");

assert.match(onboardingPage, /parseCurrencyCents/, "client validation must parse cents without float regex ambiguity");
assert.match(onboardingPage, /MIN_DAILY_BUDGET_CENTS = 500/, "custom daily budget must have a minimum");
assert.match(onboardingPage, /MAX_DAILY_BUDGET_CENTS = 50_000/, "custom daily budget must have a self-serve maximum");
assert.match(onboardingPage, /daily_budget:\s*dailyBudget/, "submit payload must include daily budget dollars");
assert.match(onboardingPage, /daily_budget_cents:\s*dailyBudgetCents/, "submit payload must include daily budget cents");
assert.match(onboardingPage, /budget:\s*internalMonthlyBudget/, "legacy budget payload must be an explicitly derived internal monthly cap");
assert.match(onboardingPage, /migrateLegacyMonthlyBudgetToDaily/, "saved legacy monthly local drafts must be migrated to daily display");

assert.match(onboardingRoute, /daily_budget\?: number \| string/, "API payload must accept explicit daily budget");
assert.match(onboardingRoute, /daily_budget_cents\?: number \| string/, "API payload must accept explicit daily budget cents");
assert.match(onboardingRoute, /function toOnboardingBudget/, "API must normalize budget semantics in one place");
assert.match(onboardingRoute, /source: "daily"/, "explicit daily input must be classified as daily");
assert.match(onboardingRoute, /source: "legacy_monthly"/, "legacy budget-only payloads must remain monthly-compatible");
assert.match(onboardingRoute, /monthlyBudget:\s*Math\.round\(dailyBudgetCents \* 30\) \/ 100/, "internal monthly cap must derive from daily budget times 30");
assert.match(onboardingRoute, /onboarding_daily_budget_cents/, "persisted plan metadata must retain daily budget cents");
assert.match(onboardingRoute, /onboarding_monthly_cap_cents/, "persisted plan metadata must retain derived internal monthly cap cents");

assert.match(campaignPlanService, /getDefaultCampaignRuntime\(dailyBudgetInput\?: number \| null\)/, "campaign runtime must accept explicit daily budget");
assert.match(campaignPlanService, /budgetDailyInput:\s*normalizedDailyBudget/, "saved campaign runtime must persist daily budget input");
assert.match(campaignPlanService, /requestedDailyBudget = Number\(\(params\.generatedPlan\.monthlyBudget \/ 30\)\.toFixed\(2\)\)/, "legacy monthly storage must derive runtime daily budget safely");

assert.match(prepaywallPreview, /dailyBudget\?: string/, "preview draft must accept daily budget");
assert.match(prepaywallPreview, /formatDailyBudget/, "preview budget pill must render daily budget");
assert.match(builderPage, /Daily ad spend/, "builder campaign summary must be daily-first");
assert.match(launchPage, /formatBudgetCap\(dailyBudgetCents\)[\s\S]*\/day/, "launch page budget display must be daily-first and currency-labeled");
assert.match(launchPage, /30-day estimate \{formatBudgetCap\(dailyBudgetCents \* 30\)\}/, "launch page estimate must use the same currency formatter");
assert.match(launchSuccessPage, /monthlyBudget \/ 30/, "launch success fallback must derive a daily budget from legacy monthly records");

assert.ok(
  metaLaunchService.includes("const dailyBudget = Number(payload.daily_budget ?? 0);"),
  "Meta launch safety must still read daily budget payloads",
);
assert.match(metaLaunchService, /meta_budget_cap_exceeded/, "Meta launch must still enforce daily budget cap");
assert.match(autonomyShared, /dailyBudgetCapCents:[\s\S]*Math\.min\(envDailyBudgetCapCents, approvedDailyBudgetCapCents\)/, "Autopilot must keep the stricter daily cap");
assert.match(autonomyExecution, /budgetDelta > 0[\s\S]*high_impact/, "Autopilot budget increases must stay approval-required");

console.log("Onboarding daily budget regression checks passed.");
