#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const plans = read("src/lib/billing/plans.ts");
const billingCheckout = read("src/app/api/billing/checkout/route.ts");
const accessCheckout = read("src/app/api/access-keys/checkout/route.ts");
const checkoutButton = read("src/components/billing/checkout-button.tsx");
const accessForm = read("src/components/access-keys/access-key-checkout-form.tsx");
const billingService = read("src/lib/services/billing-service.ts");
const accessKeyService = read("src/lib/services/access-key-service.ts");
const promotionPolicy = read("src/lib/billing/stripe-promotion-policy.ts");
const stripeResolution = read("src/lib/billing/stripe-plan-resolution.ts");
const partnerPricing = read("src/lib/white-label/partner-billing-config.ts");
const activationPolicy = read("src/lib/commercial-activation-policy.ts");
const creditService = read("src/lib/services/credit-service.ts");
const costGuard = read("src/lib/services/session-cost-guard.ts");
const entitlementService = read("src/lib/services/campaign-entitlements.ts");
const billingStatusRoute = read("src/app/api/billing/status/route.ts");
const financialMigration = read("supabase/migrations/20260710235991_harden_financial_integrity.sql");
const settingsPage = read("src/app/(app)/settings/page.tsx");
const dashboardPage = read("src/app/(app)/dashboard/page.tsx");
const resultsPage = read("src/app/results/page.tsx");
const workspaceBranding = read("src/lib/white-label/workspace-branding.ts");
const workspaceBrandingCore = read("src/lib/white-label/workspace-branding-core.ts");
const appLayout = read("src/app/(app)/layout.tsx");
const sidebar = read("src/components/layout/sidebar.tsx");

assert.match(plans, /NEW_CHECKOUT_PLAN_TIER = "pro"/);
assert.match(plans, /GRANDFATHERED_PLAN_TIERS = \["starter", "growth"\]/);
assert.match(billingCheckout, /z\.literal\(NEW_CHECKOUT_PLAN_TIER\)/);
assert.match(accessCheckout, /z\.literal\(NEW_CHECKOUT_PLAN_TIER\)/);
assert.doesNotMatch(billingCheckout, /z\.enum\(\["starter"/);
assert.doesNotMatch(accessCheckout, /"performance"|z\.enum\(\["starter"/);
assert.match(checkoutButton, /planTier: "pro"/);
assert.doesNotMatch(checkoutButton, /planTier\?:/);
assert.match(accessForm, /BILLING_PLANS\[NEW_CHECKOUT_PLAN_TIER\]/);
assert.doesNotMatch(accessForm, /Object\.keys\(BILLING_PLANS\)|setPlanTier/);
assert.match(billingService, /planTier: NewCheckoutPlanTier/);
assert.match(accessKeyService, /planTier: NewCheckoutPlanTier/);
assert.match(billingService, /params\.planTier !== NEW_CHECKOUT_PLAN_TIER/);
assert.match(accessKeyService, /params\.planTier !== NEW_CHECKOUT_PLAN_TIER/);
assert.match(billingService, /new_checkout_plan_forbidden/);
assert.match(accessKeyService, /new_checkout_plan_forbidden/);
assert.match(stripeResolution, /legacy_tier_authority_missing/);
assert.match(stripeResolution, /input\.legacyTierReconciled !== true/);
assert.match(partnerPricing, /return \["pro"\]/);

assert.doesNotMatch(billingService, /allow_promotion_codes:\s*true/);
assert.doesNotMatch(accessKeyService, /allow_promotion_codes:\s*true/);
assert.match(billingService, /getStripeCheckoutPromotionPolicy/);
assert.match(accessKeyService, /getStripeCheckoutPromotionPolicy/);
assert.match(promotionPolicy, /allow_promotion_codes:\s*false/);
assert.match(promotionPolicy, /STRIPE_ALLOWED_PROMOTION_CODE_IDS/);
assert.match(promotionPolicy, /stripe_promotion_not_allowlisted/);
assert.match(activationPolicy, /amountPaidCents <= 0/);
assert.match(activationPolicy, /invoiceBillingReason !== "subscription_create"/);
assert.match(billingService, /\.from\("commercial_activations"\)/);
assert.match(billingService, /legacy_commercial_activation_reconciled/);
assert.match(entitlementService, /commercial_activation_required/);
assert.match(entitlementService, /commerciallyActivated/);
assert.match(entitlementService, /\.from\("commercial_activations"\)/);
assert.match(billingStatusRoute, /billing\.commerciallyActivated/);
assert.match(billingService, /credit_top_up_active_subscription_required/);
assert.match(billingService, /!existingBillingRow\.stripe_customer_id/);
assert.match(costGuard, /reserve_provider_usage_attempt_v2/);
assert.match(costGuard, /settle_provider_usage_attempt_v2/);
assert.match(costGuard, /operator_action_required/);
assert.match(financialMigration, /provider_usage_compensation:/);
assert.match(financialMigration, /user_credit_ledger_compensation_source_unique/);
assert.match(financialMigration, /normalized_outcome in \('rejected', 'released'\)/);
assert.match(financialMigration, /'operator_action_required'/);
assert.match(financialMigration, /set status = normalized_outcome/);
assert.doesNotMatch(creditService, /expires?_at|expiration/i);
assert.match(creditService, /openai_image_generation: 100/);
assert.match(creditService, /heygen_video_generation: 500/);
assert.match(
  settingsPage,
  /commerciallyActivated \? billing\.planTier : t\("settings\.notActivated"\)/,
);
assert.match(settingsPage, /disabled=\{!billing\?\.commerciallyActivated \|\| !billing\.launchAllowed\}/);
assert.doesNotMatch(dashboardPage, /PlanAwareResultsPreview|requestedPlanTier/);
assert.doesNotMatch(resultsPage, /normalizeBillingPlanTier|params\.plan/);

assert.match(workspaceBranding, /\.eq\("workspace_id", organizationId\)/);
assert.match(workspaceBranding, /\.eq\("active", true\)/);
assert.match(workspaceBranding, /\.from\("organizations"\)/);
assert.match(workspaceBranding, /\.eq\("partner_id", partnerId\)/);
assert.match(workspaceBranding, /\.eq\("id", partnerId\)/);
assert.match(workspaceBranding, /\.eq\("status", "active"\)/);
assert.match(workspaceBrandingCore, /organization\.partner_id !== partnerId/);
assert.match(workspaceBrandingCore, /attribution\.workspace_id !== organizationId/);
assert.match(workspaceBrandingCore, /safeColor/);
assert.match(workspaceBrandingCore, /safeLogoUrl/);
assert.match(appLayout, /loadWorkspaceBranding\(appContext\.organization\.id\)/);
assert.match(sidebar, /poweredByDealFlow/);
assert.match(sidebar, /\{productName\}/);

console.log("commercial acquisition, billing, and credit contract: PASS");
