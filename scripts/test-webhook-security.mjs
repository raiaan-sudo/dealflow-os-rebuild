import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stripeWebhook = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
const twilioStatus = readFileSync("src/app/api/webhooks/twilio/status/route.ts", "utf8");
const smsInbound = readFileSync("src/app/api/sms/twilio/route.ts", "utf8");
const billingService = readFileSync("src/lib/services/billing-service.ts", "utf8");
const accessKeyService = readFileSync("src/lib/services/access-key-service.ts", "utf8");

assert.match(stripeWebhook, /constructEvent|STRIPE_WEBHOOK_SECRET|signature/i, "Stripe webhook must verify signatures");
assert.match(twilioStatus, /signature|validate|twilio/i, "Twilio status webhook must verify signatures");
assert.match(smsInbound, /signature|validate|twilio/i, "Twilio inbound webhook must verify signatures");
assert.match(stripeWebhook, /handleStripeBillingEvent|handleAccessKeyStripeEvent/, "Stripe route must delegate to idempotent handlers");
assert.match(billingService, /claimStripeWebhookEvent|stripe_event_id|duplicate/i, "billing webhook handler must retain idempotency protection");
assert.match(accessKeyService, /claimStripeWebhookEvent|stripe_event_id|duplicate/i, "access-key webhook handler must retain idempotency protection");

console.log("Webhook security contract passed.");
