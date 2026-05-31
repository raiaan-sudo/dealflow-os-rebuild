#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const creditService = read("src/lib/services/credit-service.ts");
const creditTopUpButton = read("src/components/billing/credit-top-up-button.tsx");
const generationCreditTopUpPanel = read("src/components/billing/generation-credit-top-up-panel.tsx");
const staticAdsRoute = read("src/app/api/campaigns/[id]/generate-static-ads/route.ts");
const videoRoute = read("src/app/api/campaigns/[id]/generate-video/route.ts");
const creativeWizard = read("src/app/(app)/build/creatives/creative-wizard.tsx");
const settingsPage = read("src/app/(app)/settings/page.tsx");
const billingService = read("src/lib/services/billing-service.ts");
const envExample = read(".env.example");
const internalLaunchMonitor = read("src/lib/services/internal-launch-monitor.ts");
const observabilityRunbook = read("docs/observability-alerting-runbook.md");
const productionRunbook = read("docs/production-100-client-runbook.md");

assert.match(
  creditService,
  /CREDIT_TOP_UP_MINIMUM_CENTS\s*=\s*1_000/,
  "credit service must enforce the $10 minimum top-up",
);
assert.match(
  creditService,
  /DEFAULT_GENERATION_CREDIT_OVERDRAFT_LIMIT_CENTS\s*=\s*0/,
  "normal generation credit policy must be prepaid by default",
);
assert.match(
  creditService,
  /GENERATION_CREDIT_OVERDRAFT_LIMIT_CENTS/,
  "operator-configured generation credit overdraft remains available as an explicit env override",
);
assert.match(
  creditTopUpButton,
  /amountCents\s*=\s*1000/,
  "credit top-up button fallback must use the $10 minimum",
);
assert.ok(
  generationCreditTopUpPanel.includes("CreditTopUpButton") &&
    generationCreditTopUpPanel.includes("Add $10.00 credits"),
  "generation surfaces must show a compact top-up action when credits are insufficient",
);
assert.ok(
  settingsPage.includes('formattedMinimumTopUp ?? "$10.00"'),
  "settings fallback copy must show $10.00",
);
assert.ok(
  billingService.includes("CREDIT_TOP_UP_MINIMUM_CENTS"),
  "Stripe credit checkout must use the canonical minimum",
);
assert.ok(
  creditService.includes("bypassedByQaGenerationCreditOverride"),
  "QA generation credit override can bypass generation-credit friction only through the scoped operator path",
);
assert.ok(
  creditService.includes("qa_generation_credit_override_granted"),
  "QA generation credit override grants are audit logged",
);
assert.ok(
  creditService.includes("evaluateQaGenerationCreditOverride"),
  "QA generation credit override matching must stay isolated in a testable evaluator",
);
assert.ok(
  creditService.includes('matchedBy: "email"'),
  "QA generation credit override supports an explicit email allowlist",
);
assert.ok(
  creditService.includes('matchedBy: "user_id"'),
  "QA generation credit override supports an explicit user id allowlist",
);
assert.ok(
  creditService.includes('matchedBy: "organization_id"'),
  "QA generation credit override supports an explicit organization id allowlist",
);
assert.ok(
  creditService.includes('matchedBy: "campaign_id"'),
  "QA generation credit override supports an explicit campaign id allowlist",
);
assert.ok(
  creditService.includes("params.amountCents > maxCents"),
  "QA generation credit override respects a configured per-reservation maximum",
);
assert.doesNotMatch(
  creditService,
  /qa_generation_credit_override_granted[\s\S]{0,320}email:/,
  "QA generation credit override audit metadata must not log allowlist email values",
);
assert.match(
  creditService,
  /if \(nextBalance < -overdraftLimitCents\)[\s\S]{0,220}"credits_insufficient"/,
  "normal non-allowlisted generation still blocks on the standard overdraft limit",
);
assert.match(
  creditService,
  /assertGenerationCreditsAvailableForUser/,
  "generation routes must have a non-mutating credit preflight before queueing paid work",
);
assert.ok(
  staticAdsRoute.includes("assertGenerationCreditsAvailableForUser") &&
    staticAdsRoute.includes('bucket: "image_generation"'),
  "static generation route preflights image credits before queueing provider work",
);
assert.ok(
  staticAdsRoute.indexOf("await assertGenerationCreditsAvailableForUser") <
    staticAdsRoute.indexOf("const activeJobs = await listSystemJobs"),
  "static generation route must check current credit balance before reusing a queued render job",
);
assert.ok(
  videoRoute.includes("assertGenerationCreditsAvailableForUser") &&
    videoRoute.includes('bucket: "video_generation"'),
  "video generation route preflights video credits before queueing provider work",
);
assert.ok(
  creativeWizard.includes("GenerationCreditTopUpPanel") &&
    creativeWizard.includes("credits_insufficient"),
  "Creative Studio renders the top-up panel for insufficient generation-credit responses",
);
assert.ok(
  creativeWizard.includes("generationCreditOverrideActive") &&
    creativeWizard.includes("hasPersistedCreditBlocker") &&
    creativeWizard.includes("!generationCreditOverrideActive && hasPersistedCreditBlocker"),
  "Creative Studio must suppress stale persisted credit-blocker UI when a scoped generation-credit override is active",
);
assert.match(
  creditService,
  /getQaGenerationCreditOverrideForUser\({[\s\S]*amountCents: amount,[\s\S]*}\)/,
  "QA generation credit override evaluation uses the actual requested reservation amount",
);

assert.ok(
  internalLaunchMonitor.includes('"provider_cost"'),
  "operator issue source must include provider_cost",
);
assert.ok(
  internalLaunchMonitor.includes("provider_usage_limits"),
  "provider quota watch must read provider_usage_limits",
);
assert.ok(
  internalLaunchMonitor.includes("user_credits"),
  "low customer generation-credit watch must read user_credits",
);
assert.ok(
  internalLaunchMonitor.includes("OPERATOR_PROVIDER_DAILY_COST_WARNING_CENTS"),
  "daily provider cost warning threshold must be env-configurable",
);
assert.ok(
  internalLaunchMonitor.includes("PROVIDER_USAGE_WARNING_RATIO"),
  "provider quota watch must have a quota pressure threshold",
);
assert.ok(
  internalLaunchMonitor.includes("CREDIT_TOP_UP_MINIMUM_CENTS"),
  "operator credit watch must use the canonical top-up minimum",
);

assert.ok(
  observabilityRunbook.includes("provider_cost"),
  "observability docs must explain provider cost/quota issue source",
);
assert.ok(
  productionRunbook.includes("$10.00"),
  "production runbook must document the $10 credit minimum",
);
assert.ok(
  envExample.includes("ALLOW_QA_GENERATION_CREDIT_OVERRIDE=false"),
  "QA generation credit override is documented as disabled by default",
);
assert.ok(
  envExample.includes("QA_GENERATION_CREDIT_OVERRIDE_USER_IDS="),
  "QA generation credit override user id allowlist is documented",
);
assert.ok(
  envExample.includes("QA_GENERATION_CREDIT_OVERRIDE_ORG_IDS="),
  "QA generation credit override organization id allowlist is documented",
);
assert.ok(
  envExample.includes("QA_GENERATION_CREDIT_OVERRIDE_MAX_CENTS="),
  "QA generation credit override max cents guard is documented",
);

console.log("PASS provider cost and credit watch assertions");
