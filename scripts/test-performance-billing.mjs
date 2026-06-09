#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

const packageJson = JSON.parse(read("package.json"));
const plans = read("src/lib/billing/plans.ts");
const presentation = read("src/lib/billing/plan-presentation.ts");
const stripeService = read("src/lib/integrations/stripe/service.ts");
const stripeProvider = read("src/lib/integrations/stripe/provider.ts");
const billingService = read("src/lib/services/billing-service.ts");
const leadRoute = read("src/app/api/lead-capture/route.ts");
const systemJobs = read("src/lib/services/system-job-service.ts");
const performanceService = read("src/lib/services/performance-lead-billing-service.ts");
const migration = read("supabase/migrations/20260530170000_create_lead_billing_events.sql");
const settings = read("src/app/(app)/settings/page.tsx");
const envExample = read(".env.example");
const stripeHarness = read("src/app/api/internal/stripe-test-proof/route.ts");

assert.equal(
  packageJson.scripts["test:performance-billing"],
  "node ./scripts/test-performance-billing.mjs",
  "performance billing regression script must be registered",
);

assert.match(plans, /export type BillingPlanTier = "performance" \| "starter" \| "pro" \| "growth"/);
assert.match(plans, /PERFORMANCE_LEAD_BILLING_MODEL = "base_plus_immediate_lead_charge"/);
assert.match(plans, /performance:[\s\S]*priceLabel:\s*"\$97\/mo \+ \$3\/qualified lead charged immediately"/);
assert.match(plans, /performance:[\s\S]*includedActiveCampaigns:\s*1/);
assert.match(plans, /autonomy_access:\s*"pro"/, "Performance must not receive Pro autonomy access");
assert.match(plans, /export function getSelfServeTrialPeriodDays\(_planTier: BillingPlanTier\)[\s\S]*return null;/, "Performance must have no V1 free trial");

assert.match(presentation, /SELECTABLE_PLAN_TIERS = \["performance", "starter", "pro"\]/);
assert.match(presentation, /checkoutCtaLabel:\s*"Start Performance checkout"/);
assert.match(presentation, /Spam, duplicate, test, and invalid leads are not billed/);

assert.match(stripeService, /getStripePlanPriceConfiguration/);
assert.match(stripeService, /PERFORMANCE_LEAD_BILLING_MODEL/);
assert.match(stripeService, /priceIds = \[partnerPlan\.basePriceId\]/);
assert.match(stripeService, /priceSignature:\s*`\$\{priceIds\.slice\(\)\.sort\(\)\.join\("\+"\)\}:\$\{PERFORMANCE_LEAD_BILLING_MODEL\}`/);
assert.match(stripeService, /lineItems:\s*\[\s*{\s*price: partnerPlan\.basePriceId,\s*quantity: 1\s*}\s*\]/);
assert.match(stripeService, /priceIds = \[env\.performanceBasePriceId\]/);
assert.match(stripeService, /lineItems:\s*\[\s*{\s*price: env\.performanceBasePriceId,\s*quantity: 1\s*}\s*\]/);
assert.match(stripeService, /getPlanTierFromSubscriptionPriceIds/);
assert.doesNotMatch(stripeService, /priceSet\.has\(env\.performanceLeadPriceId\)/, "Performance webhook mapping must not require a legacy metered item");
assert.doesNotMatch(stripeService, /return null;\s*return null;/, "Stripe price mapping must not contain unreachable duplicate returns");

assert.match(stripeProvider, /action: "create_meter_event"/);
assert.match(stripeProvider, /event_name: request\.eventName/);
assert.match(stripeProvider, /identifier: request\.identifier/);
assert.match(stripeProvider, /action: "create_payment_intent"/);
assert.match(stripeProvider, /paymentIntents\.create/);

assert.match(billingService, /line_items: priceConfig\.lineItems/);
assert.match(billingService, /price_signature/);
assert.match(billingService, /payment_method_collection:\s*"always"/);
assert.match(billingService, /saved_payment_method_options:\s*{[\s\S]*payment_method_save:\s*"enabled"/);
assert.match(billingService, /stripe_default_payment_method_id/);
assert.match(billingService, /billing_model:\s*PERFORMANCE_LEAD_BILLING_MODEL/);
assert.doesNotMatch(billingService, /stripe_performance_metered_item_missing/);
assert.match(billingService, /metadata: checkoutMetadata/);
assert.doesNotMatch(billingService, /line_items:\s*\[\s*{\s*price: priceId/, "Checkout must not use the legacy one-price line item path");

assert.match(migration, /create table if not exists public\.lead_billing_events/);
assert.match(migration, /constraint lead_billing_events_lead_unique unique \(lead_id\)/);
assert.match(migration, /constraint lead_billing_events_idempotency_unique unique \(idempotency_key\)/);
assert.match(migration, /status in \('pending', 'reported', 'skipped', 'failed', 'credited'\)/);
assert.match(migration, /lead_billing_events_member_select/);
const immediateChargeMigration = read("supabase/migrations/20260604120000_add_immediate_lead_charge_fields.sql");
assert.match(immediateChargeMigration, /stripe_payment_intent_id text/);
assert.match(immediateChargeMigration, /stripe_charge_id text/);
assert.match(immediateChargeMigration, /status in \('pending', 'charging', 'charged', 'reported', 'skipped', 'failed', 'credited'\)/);
assert.match(immediateChargeMigration, /charged_at timestamptz/);
assert.match(immediateChargeMigration, /attempt_count integer/);

assert.match(systemJobs, /"performance_lead_billing"/);
assert.match(systemJobs, /queuePerformanceLeadBillingJob/);
assert.match(systemJobs, /runPerformanceLeadBillingJob/);
assert.match(leadRoute, /queuePerformanceLeadBillingJob/);
assert.match(leadRoute, /lead_capture\.performance_billing_queued/);
assert.match(leadRoute, /catch\(\(error\) => \{[\s\S]*Performance lead billing job queue failed/, "Lead capture must not fail inline when billing queueing fails");

assert.match(performanceService, /getLedgerIdempotencyKey/);
assert.match(performanceService, /performance_lead_charge:\$\{params\.organizationId\}:\$\{params\.campaignId\}:\$\{params\.leadId\}/);
assert.match(performanceService, /non_performance_plan/);
assert.match(performanceService, /billing_inactive/);
assert.match(performanceService, /default_payment_method_missing/);
assert.match(performanceService, /non_billable_source/);
assert.match(performanceService, /consent_source_not_billable/);
assert.match(performanceService, /status: "skipped"/);
assert.match(performanceService, /status: "charging"/);
assert.match(performanceService, /status: "charged"/);
assert.match(performanceService, /status: "failed"/);
assert.match(performanceService, /create_payment_intent/);
assert.match(performanceService, /off_session:\s*true/);
assert.match(performanceService, /confirm:\s*true/);
assert.match(performanceService, /stripe_payment_intent_id/);
assert.match(performanceService, /stripe_customer_id: stripeCustomerId/);
assert.match(performanceService, /markPerformanceLeadBillingCredited/);

assert.match(settings, /Performance usage/);
assert.match(settings, /\$97\/mo base \+ \$3 per qualified lead charged immediately/);
assert.match(settings, /pendingLeadCount/);
assert.match(settings, /failedLeadCount/);
assert.match(settings, /Last successful lead charge/);

assert.match(envExample, /STRIPE_TEST_PERFORMANCE_BASE_PRICE_ID/);
assert.match(envExample, /STRIPE_TEST_PERFORMANCE_LEAD_PRICE_ID=.*optional legacy/);
assert.match(stripeHarness, /STRIPE_TEST_PERFORMANCE_BASE_PRICE_ID/);
assert.doesNotMatch(stripeHarness, /STRIPE_TEST_PERFORMANCE_LEAD_PRICE_ID/);
assert.match(stripeHarness, /price: env\.performanceBasePriceId/);
assert.doesNotMatch(stripeHarness, /price: env\.performanceLeadPriceId/);
assert.match(stripeHarness, /saved_payment_method_options:\s*{[\s\S]*payment_method_save:\s*"enabled"/);
assert.match(stripeHarness, /plan_tier:\s*"performance"/);
assert.match(stripeHarness, /billing_model:\s*PERFORMANCE_LEAD_BILLING_MODEL/);
assert.match(stripeHarness, /lineItemCount:\s*1/);

console.log("Performance billing checkout, immediate lead charge ledger, and UI guard tests passed.");
