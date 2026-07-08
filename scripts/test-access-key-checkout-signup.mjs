#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

const packageJson = JSON.parse(read("package.json"));
const migration = read("supabase/migrations/20260705090000_create_billing_access_keys.sql");
const env = read("src/lib/env.ts");
const accessKeyService = read("src/lib/services/access-key-service.ts");
const loginForm = read("src/components/auth/login-form.tsx");
const appContext = read("src/lib/services/app-context.ts");
const stripeWebhookRoute = read("src/app/api/stripe/webhook/route.ts");
const billingService = read("src/lib/services/billing-service.ts");
const proxy = read("src/proxy.ts");
const routeSecurity = read("scripts/check-route-security.mjs");
const checkoutRoute = read("src/app/api/access-keys/checkout/route.ts");
const preclaimRoute = read("src/app/api/access-keys/preclaim/route.ts");
const paywallAccess = read("src/lib/paywall-access.ts");
const adminRevokeRoute = read("src/app/api/admin/access-keys/[id]/revoke/route.ts");
const adminAccessKeysPage = read("src/app/(app)/admin/access-keys/page.tsx");
const checkoutPage = read("src/app/access/checkout/page.tsx");
const partnerCheckoutPage = read("src/app/p/[partnerSlug]/checkout/page.tsx");

assert.equal(
  packageJson.scripts["test:access-key-checkout-signup"],
  "node ./scripts/test-access-key-checkout-signup.mjs",
  "access-key regression script must be registered",
);

assert.match(migration, /create table if not exists public\.billing_access_keys/, "access-key table must exist");
assert.match(migration, /key_hash text not null/, "access keys must be hash-backed");
assert.match(migration, /enable row level security/, "access-key tables must enable RLS");
assert.match(migration, /billing_access_key_events/, "access-key event ledger must exist");
assert.doesNotMatch(migration, /\b(raw_key|plaintext_key|key_plaintext)\s+text\b/i, "migration must not introduce plaintext raw key storage");

assert.match(accessKeyService, /generateAccessKey/, "service must generate access keys");
assert.match(accessKeyService, /hashAccessKey/, "service must hash access keys");
assert.match(accessKeyService, /encryptRevealSecret/, "service must encrypt reveal payload");
assert.match(accessKeyService, /revealed_at/, "service must enforce one-time access-key reveal");
assert.match(accessKeyService, /reveal_ciphertext: null/, "service must clear reveal ciphertext after first reveal");
assert.match(accessKeyService, /createAccessKeyCheckoutSession/, "service must create checkout sessions");
assert.match(accessKeyService, /activateAccessKeyFromCheckoutSession/, "service must activate keys from Stripe checkout");
assert.match(accessKeyService, /preclaimAccessKey/, "service must preclaim keys");
assert.match(accessKeyService, /claimPendingAccessKeyForCurrentUser/, "service must claim keys after auth bootstrap");
assert.match(accessKeyService, /syncBillingSubscriptionFromStripe/, "claim must reuse real billing subscription sync");
assert.match(accessKeyService, /update_customer/, "claim must attach user workspace metadata to Stripe customer");
assert.match(accessKeyService, /update_subscription/, "claim must attach user workspace metadata to Stripe subscription");
assert.match(accessKeyService, /revokeAccessKey/, "service must support operator revoke");
assert.match(accessKeyService, /listAccessKeyEventsForAdmin/, "service must expose admin event timeline lookup");
assert.match(accessKeyService, /access_key_schema_missing/, "service must fail safely when the access-key migration is missing");
assert.doesNotMatch(accessKeyService, /console\.log\(.*rawKey|logOperationalEvent\([^)]*rawKey/s, "service must not log raw keys");
assert.match(env, /isAccessKeyPublicCheckoutEnabled/, "public checkout must have a separate rollout flag");

assert.match(loginForm, /id="access-key"/, "signup form must expose optional access-key field");
assert.match(loginForm, /\/api\/access-keys\/preclaim/, "signup must preclaim access key before Supabase signup");
assert.match(loginForm, /access_key_claim_token/, "signup metadata must carry claim token");
assert.doesNotMatch(loginForm, /access_key:\s*normalizedAccessKey|access_key_raw|raw_access_key/, "signup metadata must not carry raw key");

assert.match(appContext, /claimPendingAccessKeyForCurrentUser/, "app context must claim pending key after workspace bootstrap");
assert.match(stripeWebhookRoute, /isAccessKeyCheckoutSessionObject/, "Stripe webhook must detect access-key checkout sessions");
assert.match(stripeWebhookRoute, /handleAccessKeyStripeEvent/, "Stripe webhook must activate access-key checkouts");
assert.match(billingService, /access_key_pending_claim/, "billing sync must ignore pre-claim access-key subscription events safely");

assert.match(checkoutRoute, /assertSameOriginRequest/, "checkout API must be same-origin protected");
assert.match(checkoutRoute, /access-key-checkout/, "checkout API must be rate limited");
assert.match(checkoutRoute, /isAccessKeyPublicCheckoutEnabled/, "checkout API must fail closed unless public rollout flag is enabled");
assert.match(checkoutRoute, /access_key_public_checkout_disabled/, "checkout API must return a safe disabled error before creating Stripe sessions");
assert.match(preclaimRoute, /assertSameOriginRequest/, "preclaim API must be same-origin protected");
assert.match(preclaimRoute, /access-key-preclaim/, "preclaim API must be rate limited");
assert.match(proxy, /"\/api\/access-keys\/checkout"/, "checkout API must be intentionally public");
assert.match(proxy, /"\/api\/access-keys\/preclaim"/, "preclaim API must be intentionally public");
assert.match(routeSecurity, /\["\/api\/access-keys\/checkout", new Set\(\["POST"\]\)\]/, "route security must document checkout API");
assert.match(routeSecurity, /\["\/api\/access-keys\/preclaim", new Set\(\["POST"\]\)\]/, "route security must document preclaim API");

assert.match(paywallAccess, /getBillingSummary/, "paywall must continue to use billing summary");
assert.doesNotMatch(paywallAccess, /access[_-]?key/i, "paywall must not add a separate access-key bypass");

assert.match(checkoutPage, /AccessKeyCheckoutForm/, "native checkout page must render checkout form");
assert.match(checkoutPage, /isAccessKeyPublicCheckoutEnabled/, "native checkout page must be hidden until public rollout flag is enabled");
assert.match(checkoutPage, /notFound\(\)/, "native checkout page must fail closed while disabled");
assert.match(partnerCheckoutPage, /partnerSlug=\{partnerSlug\}/, "partner checkout must carry partner slug into checkout");
assert.match(partnerCheckoutPage, /isAccessKeyPublicCheckoutEnabled/, "partner checkout page must be hidden until public rollout flag is enabled");
assert.match(partnerCheckoutPage, /notFound\(\)/, "partner checkout page must fail closed while disabled");
assert.match(accessKeyService, /\.from\("partners"\)/, "partner checkout must validate partner slug server-side");
assert.match(accessKeyService, /partner_slug: partnerBilling\.partnerSlug/, "partner checkout must persist partner attribution");
assert.match(adminRevokeRoute, /assertSameOriginRequest/, "admin revoke must be same-origin protected");
assert.match(adminRevokeRoute, /assertInternalOperatorAccess/, "admin revoke must require internal operator access");
assert.match(adminRevokeRoute, /formData/, "admin revoke route must accept operator revoke reason");
assert.match(adminRevokeRoute, /revokeAccessKey/, "admin revoke route must call service revoke");
assert.match(adminAccessKeysPage, /listAccessKeyEventsForAdmin/, "admin page must show access-key event timeline");
assert.match(adminAccessKeysPage, /name="q"/, "admin page must support search");
assert.match(adminAccessKeysPage, /name="status"/, "admin page must support status filter");
assert.match(adminAccessKeysPage, /name="reason"/, "admin revoke form must capture reason");

console.log("Access-key checkout and signup merge tests passed.");
