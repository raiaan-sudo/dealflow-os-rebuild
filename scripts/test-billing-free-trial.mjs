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

assert.match(plans, /SELF_SERVE_TRIAL_PERIOD_DAYS\s*=\s*0/, "public self-serve trial length must be zero");
assert.match(
  plans,
  /export function getSelfServeTrialPeriodDays\(_planTier: BillingPlanTier\)[\s\S]*return null;/,
  "new self-serve checkout sessions must not receive trial days",
);
assert.doesNotMatch(plans, /SELF_SERVE_TRIAL_PERIOD_DAYS\s*:\s*7/, "7-day trial configuration must not remain active");

assert.match(
  checkoutSessionBody,
  /const checkoutTrialPeriodDays = getSelfServeTrialPeriodDays\(params\.planTier\)/,
  "checkout must still derive trial eligibility from the selected plan tier",
);
assert.match(
  checkoutSessionBody,
  /\.\.\.\(checkoutTrialPeriodDays \? { trial_period_days: checkoutTrialPeriodDays } : {}\)/,
  "subscription checkout must omit trial_period_days when no direct-payment trial exists",
);
assert.match(
  checkoutSessionBody,
  /_trial\$\{checkoutTrialPeriodDays \?\? 0\}_/,
  "checkout idempotency must distinguish legacy trial and direct-payment sessions",
);
assert.match(
  checkoutSessionBody,
  /last_checkout_trial_period_days/,
  "duplicate checkout reuse must record that the new checkout has no trial",
);
assert.match(
  checkoutSessionBody,
  /reusableSession\.metadata\?\.trial_period_days/,
  "duplicate checkout reuse must reject stale sessions with the wrong legacy trial term",
);
assert.match(
  checkoutSessionBody,
  /source: "billing_checkout_bypass"[\s\S]*return { url: `\/unlock\?\$\{bypassParams\.toString\(\)\}`, sessionId: null }/,
  "owner/test billing override must bypass Stripe checkout instead of creating a payment session",
);
assert.match(checkoutSessionBody, /stripe_price_missing/, "unknown or missing Stripe prices must still fail closed");

assert.doesNotMatch(creditTopUpBody, /trial_period_days/, "credit top-up checkout must not receive subscription trial data");
assert.match(creditTopUpBody, /mode:\s*"payment"/, "credit top-ups must remain one-time payment mode");

assert.match(
  stripeService,
  /trialPeriodDays\?: number \| null/,
  "Stripe checkout metadata keeps legacy trial metadata support for audit and stale-session rejection",
);
assert.match(
  stripeService,
  /trial_period_days: String\(params\.trialPeriodDays\)/,
  "Stripe metadata can still expose legacy trial values when explicitly supplied",
);
assert.match(
  billingService,
  /subscription\.status === "trialing" && subscription\.trial_end[\s\S]*\? subscription\.trial_end[\s\S]*: periodItem\?\.current_period_end/,
  "legacy trialing subscriptions should still persist the trial end as the displayed period end",
);

assert.match(planPresentation, /priceLabel: BILLING_PLANS\.starter\.priceLabel/, "Starter paywall copy must show direct monthly pricing");
assert.match(planPresentation, /priceLabel: BILLING_PLANS\.pro\.priceLabel/, "Pro paywall copy must show direct monthly pricing");
assert.doesNotMatch(planPresentation, /free trial|7-day/i, "Paywall presentation must not sell a free trial");
assert.match(planPresentation, /checkoutCtaLabel: "Start Starter"/, "Starter CTA must be direct-payment copy");
assert.match(planPresentation, /checkoutCtaLabel: "Get started now"/, "Pro CTA must be direct-payment copy");
assert.match(paywallSelector, /label=\{selectedPlan\.checkoutCtaLabel\}/, "Paywall checkout CTA must use selected direct-payment copy");
assert.match(
  checkoutRoute,
  /planTier: z\.enum\(\["performance", "starter", "pro", "growth"\]\)/,
  "checkout route plan validation must remain explicit",
);

assert.doesNotMatch(settings, /Free trial active/, "Settings must not promote trial access as a current sales state");
assert.match(settings, /historical subscription as trialing/, "Settings must truthfully handle legacy trialing subscriptions");
assert.match(settings, /Access-through date/, "Settings must show a neutral access-through label for legacy trialing rows");
assert.match(settings, /formatBillingStateLabel/, "Settings billing state display must distinguish trialing from paid active");

console.log("Billing direct-payment checkout, copy, and legacy-trial safety tests passed.");
