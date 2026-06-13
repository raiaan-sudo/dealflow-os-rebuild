#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const creditService = read("src/lib/services/credit-service.ts");
const billingService = read("src/lib/services/billing-service.ts");
const unlockPage = read("src/app/(app)/unlock/page.tsx");
const packageJson = read("package.json");

assert.match(
  creditService,
  /SIGNUP_GENERATION_CREDIT_GRANT_CENTS\s*=\s*1_000/,
  "signup credit grant must be exactly $10.00",
);
assert.match(
  creditService,
  /SIGNUP_GENERATION_CREDIT_REASON\s*=\s*"signup_generation_credit"/,
  "signup credit grant must use a dedicated ledger reason",
);
assert.match(
  creditService,
  /export async function grantSignupGenerationCredits/,
  "signup credit grant helper must be exported",
);
assert.match(
  creditService,
  /export async function getSignupGenerationCreditGrant/,
  "signup credit grant lookup helper must be exported for post-checkout UI truth",
);
assert.match(
  creditService,
  /idempotencyKey:\s*`signup_generation_credit_v1:\$\{params\.organizationId\}`/,
  "signup credit grant must be idempotent per organization",
);
assert.match(
  creditService,
  /referenceType:\s*"billing_subscription"/,
  "signup credit grant must be tied to billing subscription provenance",
);

assert.match(
  billingService,
  /grantSignupGenerationCredits/,
  "Stripe subscription sync must import the signup credit grant helper",
);
assert.match(
  billingService,
  /subscription\.status === "active" && subscriptionUserId/,
  "signup credits must grant only after paid active subscription state",
);
assert.match(
  billingService,
  /signup_generation_credit_granted/,
  "successful signup credit grants must be operationally logged",
);
assert.match(
  billingService,
  /signup_generation_credit_grant_failed/,
  "failed signup credit grants must be operationally logged without hiding the error",
);

assert.match(
  unlockPage,
  /getSignupGenerationCreditGrant/,
  "post-checkout unlock page must verify the signup credit ledger before claiming credits were added",
);
assert.match(
  unlockPage,
  /\$10\.00 generation credits added/,
  "post-checkout activation checklist must include confirmed credit grant copy",
);
assert.match(
  unlockPage,
  /\$10\.00 generation credits syncing/,
  "post-checkout activation checklist must show a syncing state when the credit ledger is not confirmed",
);

assert.match(
  packageJson,
  /"test:signup-generation-credit-grant":\s*"node \.\/scripts\/test-signup-generation-credit-grant\.mjs"/,
  "package.json must expose the signup generation credit regression",
);

console.log("Signup generation credit grant tests passed.");
