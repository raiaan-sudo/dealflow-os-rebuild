#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const creditService = read("src/lib/services/credit-service.ts");
const billingService = read("src/lib/services/billing-service.ts");
const unlockPage = read("src/app/(app)/unlock/page.tsx");

assert.match(
  creditService,
  /export const WELCOME_GENERATION_CREDIT_CENTS = CREDIT_TOP_UP_MINIMUM_CENTS;/,
  "welcome credit must use the canonical $10 top-up amount",
);
assert.match(
  creditService,
  /export const WELCOME_GENERATION_CREDIT_REASON = "new_paid_account_welcome_credit";/,
  "welcome credit ledger reason must be stable and auditable",
);
assert.match(
  creditService,
  /welcome_generation_credit:\$\{params\.organizationId\}:\$\{params\.stripeSubscriptionId\}/,
  "welcome credit idempotency must be per organization and Stripe subscription",
);
assert.match(
  creditService,
  /referenceType: "stripe_subscription"[\s\S]{0,120}referenceId: params\.stripeSubscriptionId/,
  "welcome credit ledger must reference the paid Stripe subscription",
);
assert.match(
  creditService,
  /creditKind: "welcome_generation_credit"/,
  "welcome credit ledger metadata must identify the credit kind",
);

assert.match(
  billingService,
  /grantWelcomeGenerationCredits/,
  "billing service must call the welcome credit grant helper",
);
assert.match(
  billingService,
  /event\.type === "checkout\.session\.completed"[\s\S]{0,260}isPaidSubscriptionCheckoutSession/,
  "paid subscription checkout completion must be eligible for welcome credit",
);
assert.match(
  billingService,
  /session\.mode === "subscription"[\s\S]{0,120}session\.payment_status === "paid"/,
  "welcome credit must only grant for paid subscription checkout sessions",
);
assert.match(
  billingService,
  /event\.type === "invoice\.payment_succeeded"[\s\S]{0,360}isFirstPaidSubscriptionInvoice/,
  "first paid subscription invoice must be eligible for webhook recovery",
);
assert.match(
  billingService,
  /invoice\.billing_reason === "subscription_create" && \(invoice\.amount_paid \?\? invoice\.total \?\? 0\) > 0/,
  "welcome credit must not grant on zero-dollar trials or renewals",
);
assert.match(
  billingService,
  /source: "checkout_return"/,
  "checkout return reconciliation must grant welcome credit before the user reaches Creative Studio",
);
assert.doesNotMatch(
  billingService,
  /invoice\.payment_failed[\s\S]{0,500}grantWelcomeGenerationCredits/,
  "failed invoices must not grant welcome credit",
);
assert.doesNotMatch(
  billingService,
  /customer\.subscription\.updated[\s\S]{0,500}grantWelcomeGenerationCredits/,
  "subscription updates must not grant welcome credit",
);
assert.doesNotMatch(
  billingService,
  /credit_top_up[\s\S]{0,500}grantWelcomeGenerationCredits/,
  "manual credit top-ups must remain separate from welcome credit",
);

assert.match(
  unlockPage,
  /paidCheckoutActivated = checkoutState === "success" && launchAllowed && !reconciliationError/,
  "unlock page must distinguish paid checkout from billing overrides",
);
assert.match(
  unlockPage,
  /WELCOME_GENERATION_CREDIT_CENTS/,
  "unlock page must render the canonical welcome credit amount",
);
assert.match(
  unlockPage,
  /in generation credits added/,
  "unlock page must show a customer-visible welcome credit confirmation",
);
assert.doesNotMatch(
  unlockPage,
  /checkoutOverride[\s\S]{0,260}in generation credits added/,
  "billing override path must not show paid welcome credit copy",
);

console.log("PASS welcome generation credit assertions");
