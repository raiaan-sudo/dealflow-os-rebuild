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

assert.equal(
  packageJson.scripts["test:performance-billing"],
  "node ./scripts/test-performance-billing.mjs",
  "performance billing regression script must be registered",
);

assert.match(plans, /export type BillingPlanTier = "performance" \| "starter" \| "pro" \| "growth"/);
assert.match(plans, /performance:[\s\S]*priceLabel:\s*"\$97\/mo \+ \$3\/qualified lead"/);
assert.match(plans, /performance:[\s\S]*includedActiveCampaigns:\s*1/);
assert.match(plans, /autonomy_access:\s*"pro"/, "Performance must not receive Pro autonomy access");
assert.match(plans, /planTier === "starter" \|\| planTier === "pro"\s*\? SELF_SERVE_TRIAL_PERIOD_DAYS\s*:\s*null/, "Performance must have no V1 free trial");

assert.match(presentation, /SELECTABLE_PLAN_TIERS = \["performance", "starter", "pro"\]/);
assert.match(presentation, /checkoutCtaLabel:\s*"Start Performance checkout"/);
assert.match(presentation, /Spam, duplicate, test, and invalid leads are not billed/);

assert.match(stripeService, /getStripePlanPriceConfiguration/);
assert.match(stripeService, /performanceBasePriceId[\s\S]*performanceLeadPriceId/);
assert.match(stripeService, /lineItems:\s*\[[\s\S]*performanceBasePriceId[\s\S]*performanceLeadPriceId[\s\S]*\]/);
assert.match(stripeService, /getPlanTierFromSubscriptionPriceIds/);
assert.match(stripeService, /priceSet\.has\(env\.performanceLeadPriceId\)/, "Performance webhook mapping must require the metered item");

assert.match(stripeProvider, /action: "create_meter_event"/);
assert.match(stripeProvider, /event_name: request\.eventName/);
assert.match(stripeProvider, /identifier: request\.identifier/);

assert.match(billingService, /line_items: priceConfig\.lineItems/);
assert.match(billingService, /price_signature/);
assert.match(billingService, /performance_metered_price_id/);
assert.match(billingService, /stripe_performance_metered_item_missing/);
assert.match(billingService, /metadata: checkoutMetadata/);
assert.doesNotMatch(billingService, /line_items:\s*\[\s*{\s*price: priceId/, "Checkout must not use the legacy one-price line item path");

assert.match(migration, /create table if not exists public\.lead_billing_events/);
assert.match(migration, /constraint lead_billing_events_lead_unique unique \(lead_id\)/);
assert.match(migration, /constraint lead_billing_events_idempotency_unique unique \(idempotency_key\)/);
assert.match(migration, /status in \('pending', 'reported', 'skipped', 'failed', 'credited'\)/);
assert.match(migration, /lead_billing_events_member_select/);

assert.match(systemJobs, /"performance_lead_billing"/);
assert.match(systemJobs, /queuePerformanceLeadBillingJob/);
assert.match(systemJobs, /runPerformanceLeadBillingJob/);
assert.match(leadRoute, /queuePerformanceLeadBillingJob/);
assert.match(leadRoute, /lead_capture\.performance_billing_queued/);
assert.match(leadRoute, /catch\(\(error\) => \{[\s\S]*Performance lead billing job queue failed/, "Lead capture must not fail inline when billing queueing fails");

assert.match(performanceService, /getLedgerIdempotencyKey/);
assert.match(performanceService, /performance_lead:\$\{params\.organizationId\}:\$\{params\.campaignId\}:\$\{params\.leadId\}/);
assert.match(performanceService, /non_performance_plan/);
assert.match(performanceService, /billing_inactive/);
assert.match(performanceService, /non_billable_source/);
assert.match(performanceService, /consent_source_not_billable/);
assert.match(performanceService, /status: "skipped"/);
assert.match(performanceService, /status: "reported"/);
assert.match(performanceService, /status: "failed"/);
assert.match(performanceService, /create_meter_event/);
assert.match(performanceService, /stripe_customer_id: stripeCustomerId/);
assert.match(performanceService, /value: 1/);
assert.match(performanceService, /markPerformanceLeadBillingCredited/);

assert.match(settings, /Performance usage/);
assert.match(settings, /\$97\/mo base \+ \$3 per qualified lead/);
assert.match(settings, /pendingLeadCount/);
assert.match(settings, /failedLeadCount/);

console.log("Performance billing checkout, metering, ledger, and UI guard tests passed.");
