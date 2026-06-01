#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function functionBody(source, name) {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

const plans = read("src/lib/billing/plans.ts");
const planPresentation = read("src/lib/billing/plan-presentation.ts");
const billingService = read("src/lib/services/billing-service.ts");
const stripeService = read("src/lib/integrations/stripe/service.ts");
const paywallSelector = read("src/components/billing/paywall-plan-selector.tsx");
const settings = read("src/app/(app)/settings/page.tsx");
const checkoutRoute = read("src/app/api/billing/checkout/route.ts");
const checkoutSessionBody = functionBody(billingService, "createBillingCheckoutSession");
const creditTopUpBody = functionBody(billingService, "createCreditTopUpCheckoutSession");

assert.match(plans, /SELF_SERVE_TRIAL_PERIOD_DAYS\s*=\s*7/, "public self-serve trial length must be 7 days");
assert.match(
  plans,
  /planTier === "starter" \|\| planTier === "pro"\s*\? SELF_SERVE_TRIAL_PERIOD_DAYS\s*:\s*null/,
  "trial must apply only to Starter and Pro plans",
);
assert.match(plans, /case "performance":/, "Performance must be a first-class plan tier");
assert.doesNotMatch(
  plans,
  /planTier === "growth"\s*\? SELF_SERVE_TRIAL_PERIOD_DAYS/,
  "Growth must not inherit the public self-serve trial",
);

assert.match(
  checkoutSessionBody,
  /const checkoutTrialPeriodDays = getSelfServeTrialPeriodDays\(params\.planTier\)/,
  "checkout must derive trial eligibility from the selected plan tier",
);
assert.match(
  checkoutSessionBody,
  /subscription_data:\s*{[\s\S]*trial_period_days: checkoutTrialPeriodDays[\s\S]*metadata: checkoutMetadata[\s\S]*}/,
  "subscription checkout must pass subscription_data.trial_period_days",
);
assert.match(
  checkoutSessionBody,
  /_trial\$\{checkoutTrialPeriodDays \?\? 0\}_/,
  "checkout idempotency must distinguish trial and non-trial sessions",
);
assert.match(
  checkoutSessionBody,
  /last_checkout_trial_period_days/,
  "duplicate checkout reuse must record the trial term",
);
assert.match(
  checkoutSessionBody,
  /reusableSession\.metadata\?\.trial_period_days/,
  "duplicate checkout reuse must reject stale sessions with the wrong trial term",
);
assert.match(
  checkoutSessionBody,
  /source: "billing_checkout_bypass"[\s\S]*return { url: `\/unlock\?\$\{bypassParams\.toString\(\)\}`, sessionId: null }/,
  "owner/test billing override must bypass Stripe checkout instead of creating a trial session",
);
assert.match(checkoutSessionBody, /stripe_price_missing/, "unknown or missing Stripe prices must still fail closed");

assert.doesNotMatch(creditTopUpBody, /trial_period_days/, "credit top-up checkout must not receive subscription trial data");
assert.match(creditTopUpBody, /mode:\s*"payment"/, "credit top-ups must remain one-time payment mode");
assert.match(
  billingService,
  /export async function syncCreditTopUpCheckoutSessionFromReturn/,
  "credit top-up success return must reconcile paid Stripe sessions",
);
assert.match(
  billingService,
  /idempotencyKey: `stripe_credit_top_up:\$\{session\.id\}`/,
  "credit top-up return sync and webhook must share the same Stripe session idempotency key",
);
assert.match(
  settings,
  /syncCreditTopUpCheckoutSessionFromReturn\(creditCheckoutSessionId\)/,
  "settings success return must sync paid credit checkout before reading the balance",
);
assert.match(
  settings,
  /Credit top-up confirmed\. Your generation credit balance is updated\./,
  "settings must show clear success copy after return-page credit sync",
);

assert.match(
  stripeService,
  /trialPeriodDays\?: number \| null/,
  "Stripe checkout metadata should explicitly support trial metadata",
);
assert.match(
  stripeService,
  /trial_period_days: String\(params\.trialPeriodDays\)/,
  "Stripe metadata should expose the configured trial length for safe audit and reuse checks",
);
assert.match(stripeService, /performanceBasePriceId[\s\S]*performanceLeadPriceId/, "Stripe pricing config must support Performance base plus metered lead prices");
assert.match(
  billingService,
  /subscription\.status === "trialing" && subscription\.trial_end[\s\S]*\? subscription\.trial_end[\s\S]*: periodItem\?\.current_period_end/,
  "trialing subscriptions should persist the trial end as the displayed period end",
);

assert.match(
  planPresentation,
  /return `\$\{priceLabel\} after \$\{SELF_SERVE_TRIAL_PERIOD_DAYS\}-day free trial`/,
  "Paywall price copy must append the configured trial term",
);
assert.match(
  planPresentation,
  /priceLabel: priceAfterTrialLabel\(BILLING_PLANS\.starter\.priceLabel\)/,
  "Starter paywall copy must include the trial",
);
assert.match(
  planPresentation,
  /priceLabel: priceAfterTrialLabel\(BILLING_PLANS\.pro\.priceLabel\)/,
  "Pro paywall copy must include the trial",
);
assert.match(planPresentation, /Start \$\{SELF_SERVE_TRIAL_PERIOD_DAYS\}-day free trial/, "Paywall CTA copy must start the trial");
assert.match(planPresentation, /performance:[\s\S]*checkoutCtaLabel:\s*"Start Performance checkout"/, "Performance must not advertise a free trial");
assert.match(paywallSelector, /label=\{selectedPlan\.checkoutCtaLabel\}/, "Paywall checkout CTA must use trial copy");
assert.match(checkoutRoute, /planTier: z\.enum\(\["performance", "starter", "pro", "growth"\]\)/, "checkout route plan validation must remain explicit");

assert.match(settings, /title: "Free trial active"/, "Settings must show a truthful trial state");
assert.match(settings, /Stripe subscription status is trialing, not paid active/, "Settings must not call trialing paid active");
assert.match(settings, /Trial ends/, "Settings must show a trial end label when trialing");
assert.match(settings, /formatBillingStateLabel/, "Settings billing state display must distinguish trialing from paid active");

console.log("Billing free-trial checkout, copy, and safety tests passed.");
