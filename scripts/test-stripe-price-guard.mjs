#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const plans = readFileSync("src/lib/billing/plans.ts", "utf8");
const presentation = readFileSync("src/lib/billing/plan-presentation.ts", "utf8");
const stripeService = readFileSync("src/lib/integrations/stripe/service.ts", "utf8");
const billingService = readFileSync("src/lib/services/billing-service.ts", "utf8");

assert.match(plans, /starter:[\s\S]*priceLabel:\s*"\$147\/mo"/, "Starter must remain $147/mo in code");
assert.match(plans, /pro:[\s\S]*priceLabel:\s*"\$297\/mo"/, "Pro must remain $297/mo in code");
assert.match(plans, /growth:[\s\S]*priceLabel:\s*"\$497\/mo"/, "Growth must remain $497/mo in code");
assert.match(plans, /PERFORMANCE_LEAD_BILLING_MODEL = "base_plus_immediate_lead_charge"/, "Performance lead billing model must be immediate charge");
assert.match(plans, /performance:[\s\S]*priceLabel:\s*"\$97\/mo \+ \$3\/qualified lead charged immediately"/, "Performance must be the only $97 base plan");
assert.doesNotMatch(
  plans
    .replace(/export const PERFORMANCE_BASE_AMOUNT_CENTS = 9700;\n/, "")
    .replace(/performance:[\s\S]*?starter:/, "starter:"),
  /\$97\/mo|\b9700\b/,
  "Starter must not regress to the legacy $97 price",
);
assert.match(presentation, /checkoutCtaLabel:\s*"Start Performance checkout"/, "Performance must have no free-trial checkout copy");
assert.match(stripeService, /priceId === env\.starterPriceId[\s\S]*return "starter"/, "Starter mapping must require the configured Stripe starter price ID");
assert.match(stripeService, /priceId === env\.performanceBasePriceId[\s\S]*return "performance"/, "Performance mapping must require the configured base price ID");
assert.match(stripeService, /getPlanTierFromSubscriptionPriceIds/, "Subscription price-set mapping must inspect all Stripe items");
assert.doesNotMatch(stripeService, /priceSet\.has\(env\.performanceLeadPriceId\)/, "Performance subscription mapping must not require the legacy metered lead price");
assert.match(stripeService, /priceId === env\.performanceBasePriceId[\s\S]*return "performance"/, "Performance mapping must require the configured base price ID");
assert.match(billingService, /stripe_price_unrecognized/, "Stripe subscription sync must fail closed for unknown price IDs");
assert.doesNotMatch(
  billingService,
  /metadataTier[\s\S]*getPlanTierFromSubscriptionPriceIds/,
  "Stripe metadata must not override an unknown configured price ID",
);

console.log("Stripe price guard tests passed.");
