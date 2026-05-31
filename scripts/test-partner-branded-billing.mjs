#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

const packageJson = JSON.parse(read("package.json"));
const partnerBillingConfig = read("src/lib/white-label/partner-billing-config.ts");
const stripeService = read("src/lib/integrations/stripe/service.ts");
const billingService = read("src/lib/services/billing-service.ts");
const planPresentation = read("src/lib/billing/plan-presentation.ts");
const paywallPage = read("src/app/(app)/paywall/page.tsx");
const paywallSelector = read("src/components/billing/paywall-plan-selector.tsx");
const partnerCreateForm = read("src/components/white-label/partner-create-form.tsx");
const adminPartnerRoute = read("src/app/api/admin/partners/route.ts");
const platformPartnersAdmin = read("src/components/white-label/platform-partners-admin.tsx");
const migration = read("supabase/migrations/20260531193000_add_partner_branded_billing_metadata.sql");
const settings = read("src/app/(app)/settings/page.tsx");

assert.equal(
  packageJson.scripts["test:partner-branded-billing"],
  "node ./scripts/test-partner-branded-billing.mjs",
  "partner branded billing regression script must be registered",
);

assert.match(partnerBillingConfig, /parsePartnerPricingConfig/, "partner pricing parser must exist");
assert.match(partnerBillingConfig, /validatePartnerPricingConfig/, "partner pricing validator must exist");
assert.match(partnerBillingConfig, /Performance base price ID must start with price_/, "performance base price must be validated");
assert.match(partnerBillingConfig, /Performance metered lead price ID must start with price_/, "performance metered price must be validated");
assert.match(partnerBillingConfig, /allowDefaultDealFlowPrices/, "default DealFlow price fallback must be explicit");

assert.match(stripeService, /partnerPricing\?: PartnerPricingConfig/, "Stripe price config must accept partner pricing");
assert.match(stripeService, /partnerProductName/, "Stripe price config must carry partner product name");
assert.match(stripeService, /partnerPlanLabel/, "Stripe price config must carry partner plan label");
assert.match(stripeService, /partnerPriceIds/, "Stripe price config must carry partner price IDs");
assert.match(stripeService, /internal_plan_tier/, "Checkout metadata must preserve internal entitlement tier");
assert.match(stripeService, /commission_rate_snapshot/, "Checkout metadata must snapshot partner commission rate");
assert.match(stripeService, /getPartnerPlanTierFromSubscriptionPriceIds/, "Partner webhook mapping must validate partner price IDs");
assert.match(stripeService, /metadataPriceIds\.every\(\(priceId\) => priceSet\.has\(priceId\)\)/, "Partner metadata price IDs must match actual subscription items");

assert.match(billingService, /getPartnerBillingConfigBundle/, "Billing service must load partner pricing and commission config");
assert.match(billingService, /partner_stripe_price_missing/, "Partner checkout must fail closed when price config is missing");
assert.match(billingService, /line_items: priceConfig\.lineItems/, "Checkout must use resolved line items");
assert.match(billingService, /partner_product_name: priceConfig\.partnerProductName/, "Subscription rows must store partner product name");
assert.match(billingService, /partner_plan_label: priceConfig\.partnerPlanLabel/, "Subscription rows must store partner plan label");
assert.match(billingService, /partner_price_ids: priceConfig\.partnerPriceIds/, "Subscription rows must store partner price IDs");
assert.match(billingService, /buildPartnerPriceConfigFromSubscriptionMetadata/, "Webhook sync must support metadata-snapshotted partner prices");
assert.match(billingService, /commission_rate_source/, "Commission events must record snapshot/current commission source");
assert.doesNotMatch(billingService, /Stripe Connect|partner-owned Stripe/i, "Billing code must not introduce Stripe Connect or partner-owned Stripe branching");

assert.match(planPresentation, /getPlanPresentationsForPartner/, "Paywall presentation must support partner labels");
assert.match(paywallPage, /loadPartnerPricingForCurrentWorkspace/, "Paywall must load current partner pricing");
assert.match(paywallPage, /getStripePlanPriceConfiguration\(tier, partnerPricing\)/, "Paywall must show only configured partner plan tiers");
assert.match(paywallSelector, /planPresentations/, "Client selector must render partner plan presentation");

assert.match(partnerCreateForm, /Product display name/, "Partner admin form must capture product display name");
assert.match(partnerCreateForm, /Performance base price/, "Partner admin form must capture performance base price");
assert.match(partnerCreateForm, /Performance lead price/, "Partner admin form must capture performance metered price");
assert.match(partnerCreateForm, /Allow default DealFlow prices/, "Partner admin form must expose explicit fallback toggle");
assert.match(adminPartnerRoute, /partner_pricing_invalid/, "Admin create API must fail closed on invalid active partner pricing");
assert.match(adminPartnerRoute, /partner_branding/, "Admin create API must write partner branding/pricing config");
assert.match(platformPartnersAdmin, /Partner payouts are handled manually from the commission ledger/, "Admin copy must describe manual payouts accurately");

assert.match(migration, /partner_product_name text/, "Migration must add partner product name column");
assert.match(migration, /partner_plan_label text/, "Migration must add partner plan label column");
assert.match(migration, /partner_price_ids jsonb/, "Migration must add partner price id ledger column");
assert.match(migration, /commission_rate_snapshot numeric/, "Migration must add commission snapshot column");
assert.match(migration, /partner_commission_events[\s\S]*metadata_json/, "Migration must add commission metadata");

assert.match(settings, /partnerProductName/, "Settings must read partner product name");
assert.match(settings, /partnerPlanLabel/, "Settings must read partner plan label");

console.log("Partner-branded Stripe checkout tests passed.");
