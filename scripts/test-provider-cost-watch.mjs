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
const settingsPage = read("src/app/(app)/settings/page.tsx");
const billingService = read("src/lib/services/billing-service.ts");
const envExample = read(".env.example");
const internalLaunchMonitor = read("src/lib/services/internal-launch-monitor.ts");
const observabilityRunbook = read("docs/observability-alerting-runbook.md");
const productionRunbook = read("docs/production-100-client-runbook.md");

assert.match(
  creditService,
  /CREDIT_TOP_UP_MINIMUM_CENTS\s*=\s*2_000/,
  "credit service must enforce the $20 minimum top-up",
);
assert.match(
  creditTopUpButton,
  /amountCents\s*=\s*2000/,
  "credit top-up button fallback must use the $20 minimum",
);
assert.ok(
  settingsPage.includes('formattedMinimumTopUp ?? "$20.00"'),
  "settings fallback copy must show $20.00",
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
  productionRunbook.includes("$20.00"),
  "production runbook must document the $20 credit minimum",
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
