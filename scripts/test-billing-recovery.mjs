#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const migration = read("supabase/migrations/20260504203000_create_billing_cancellation_intents.sql");
const service = read("src/lib/services/billing-cancellation-intent-service.ts");
const route = read("src/app/api/billing/cancellation-intent/route.ts");
const portalRoute = read("src/app/api/billing/portal/route.ts");
const form = read("src/components/billing/cancellation-intent-form.tsx");
const settings = read("src/app/(app)/settings/page.tsx");
const launchPage = read("src/app/(app)/launch/page.tsx");
const paywallPage = read("src/app/(app)/paywall/page.tsx");
const internalMonitor = read("src/lib/services/internal-launch-monitor.ts");
const lifecycleTest = read("scripts/test-subscription-lifecycle.mjs");

assert.match(migration, /create table if not exists public\.billing_cancellation_intents/);
assert.match(migration, /alter table public\.billing_cancellation_intents enable row level security/);
assert.match(migration, /alter table public\.billing_cancellation_intents force row level security/);
assert.match(migration, /billing_cancellation_intents_member_select/);
assert.match(migration, /billing_cancellation_intents_service_role_all/);
assert.match(migration, /Stripe remains the payment source of truth/);
assert.doesNotMatch(migration, /card_number|payment_method_details|client_secret/i);

assert.match(route, /assertSameOriginRequest/);
assert.match(route, /consumeRateLimit/);
assert.match(route, /recordBillingCancellationIntent/);
assert.doesNotMatch(route, /subscriptions\.cancel|cancel_subscription|createBillingCheckoutSession|stripe\.subscriptions\.update/i);

assert.match(portalRoute, /assertSameOriginRequest/);
assert.match(portalRoute, /createBillingPortalSession/);

assert.match(service, /past_due/);
assert.match(service, /payment_issue/);
assert.match(service, /cancel_at_period_end/);
assert.match(service, /requiresSuspension/);
assert.match(service, /loadBillingRecoveryIssues/);
assert.match(service, /sanitizeReasonDetail/);
assert.match(service, /slice\(0, 500\)/);
assert.doesNotMatch(service, /subscriptions\.cancel|cancel_subscription|delete\s*\(/i);

assert.match(form, /Continue to Stripe Portal/);
assert.match(form, /Skip reason/);
assert.match(form, /\/api\/billing\/cancellation-intent/);
assert.match(form, /\/api\/billing\/portal/);
assert.match(form, /Stripe Portal remains the cancellation/);
assert.match(form, /support a recovery signal/);
assert.match(form, /Do not include card numbers, passwords, or private credentials/);

assert.match(settings, /Payment method needs attention/);
assert.match(settings, /Subscription scheduled to cancel/);
assert.match(settings, /Subscription inactive/);
assert.match(settings, /CancellationIntentForm/);
assert.match(settings, /Update payment method/);
assert.match(settings, /support can help recover the workspace/);
assert.match(settings, /Need help before cancelling/);

assert.match(launchPage, /Update the payment method in Stripe Portal before launching/);
assert.match(launchPage, /Billing is inactive/);
assert.match(launchPage, /Billing recovery is required before launch/);
assert.match(launchPage, /No Meta launch will run until these gates pass/);
assert.match(launchPage, /Owner\/test billing acceptance is active for this campaign/);
assert.match(launchPage, /No Stripe subscription is being claimed/);
assert.match(paywallPage, /Open billing settings/);
assert.match(paywallPage, /payment issue/);
assert.match(paywallPage, /Billing is inactive/);

assert.match(internalMonitor, /loadBillingRecoveryIssues/);
assert.match(internalMonitor, /source: "billing_recovery"/);

assert.match(lifecycleTest, /pastDue\.billingState, "payment_issue"/);
assert.match(lifecycleTest, /cancelFuture\.billingState, "grace_period"/);
assert.match(lifecycleTest, /cancelEnded\.billingState, "suspended"/);

console.log("Billing recovery and cancellation intelligence tests passed.");
