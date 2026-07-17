#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeStripeCheckoutLifecycleEvent,
  normalizeStripeFinancialLifecycleEvent,
  StripeLifecycleValidationError,
} from "../src/lib/billing/stripe-lifecycle";
import { getStripeCheckoutPromotionPolicy } from "../src/lib/billing/stripe-promotion-policy";

const ROOT = process.cwd();
const ORGANIZATION_ID = "a1000000-0000-4000-8000-000000000001";
const USER_ID = "a2000000-0000-4000-8000-000000000001";
const ACCESS_KEY_ID = "a3000000-0000-4000-8000-000000000001";
const CREDIT_INTENT_ID = "a4000000-0000-4000-8000-000000000001";

function checkoutEvent(input: {
  type: string;
  id: string;
  flow?: "subscription" | "access_key" | "credit_top_up";
  status: "open" | "complete" | "expired";
  paymentStatus: "paid" | "unpaid" | "no_payment_required";
  amount?: number;
}) {
  const flow = input.flow ?? "subscription";
  const metadata = flow === "access_key"
    ? { checkout_flow: "access_key", access_key_id: ACCESS_KEY_ID, organization_id: "", user_id: "" }
    : flow === "credit_top_up"
      ? { checkout_kind: "credit_top_up", credit_top_up_intent_id: CREDIT_INTENT_ID }
      : { organization_id: ORGANIZATION_ID, user_id: USER_ID, internal_plan_tier: "pro" };
  return {
    id: input.id,
    type: input.type,
    created: 1_784_000_000,
    livemode: false,
    data: {
      object: {
        id: `cs_${input.id}`,
        object: "checkout.session",
        livemode: false,
        mode: flow === "credit_top_up" ? "payment" : "subscription",
        status: input.status,
        payment_status: input.paymentStatus,
        amount_total: input.amount ?? 29_700,
        currency: "usd",
        customer: "cus_lifecycle_fixture",
        payment_intent: "pi_lifecycle_fixture",
        subscription: flow === "credit_top_up" ? null : "sub_lifecycle_fixture",
        client_reference_id: flow === "access_key"
          ? ACCESS_KEY_ID
          : flow === "credit_top_up"
            ? ORGANIZATION_ID
            : ORGANIZATION_ID,
        metadata,
      },
    },
  } as any;
}

const pending = normalizeStripeCheckoutLifecycleEvent(checkoutEvent({
  id: "evt_checkout_pending",
  type: "checkout.session.completed",
  status: "complete",
  paymentStatus: "unpaid",
}));
assert.equal(pending?.paymentState, "pending");

const delayedSuccess = normalizeStripeCheckoutLifecycleEvent(checkoutEvent({
  id: "evt_checkout_delayed_success",
  type: "checkout.session.async_payment_succeeded",
  status: "complete",
  paymentStatus: "paid",
}));
assert.equal(delayedSuccess?.paymentState, "succeeded");
assert.equal(delayedSuccess?.flow, "subscription");

assert.equal(normalizeStripeCheckoutLifecycleEvent(checkoutEvent({
  id: "evt_credit_failed",
  type: "checkout.session.async_payment_failed",
  flow: "credit_top_up",
  status: "complete",
  paymentStatus: "unpaid",
}))?.paymentState, "failed");
assert.equal(normalizeStripeCheckoutLifecycleEvent(checkoutEvent({
  id: "evt_access_expired",
  type: "checkout.session.expired",
  flow: "access_key",
  status: "expired",
  paymentStatus: "unpaid",
}))?.paymentState, "expired");

assert.throws(
  () => normalizeStripeCheckoutLifecycleEvent(checkoutEvent({
    id: "evt_zero_paid",
    type: "checkout.session.completed",
    status: "complete",
    paymentStatus: "paid",
    amount: 0,
  })),
  (error) => error instanceof StripeLifecycleValidationError &&
    error.code === "stripe_checkout_lifecycle_payment_not_positive",
);
const wrongTenant = checkoutEvent({
  id: "evt_wrong_tenant",
  type: "checkout.session.completed",
  status: "complete",
  paymentStatus: "paid",
});
wrongTenant.data.object.client_reference_id = ACCESS_KEY_ID;
assert.throws(
  () => normalizeStripeCheckoutLifecycleEvent(wrongTenant),
  (error) => error instanceof StripeLifecycleValidationError &&
    error.code === "stripe_checkout_lifecycle_tenant_mismatch",
);

const chargeRefund = normalizeStripeFinancialLifecycleEvent({
  id: "evt_charge_refunded",
  type: "charge.refunded",
  created: 1_784_000_100,
  livemode: false,
  data: { object: {
    id: "ch_refund_fixture",
    object: "charge",
    amount: 2_500,
    amount_refunded: 1_000,
    currency: "usd",
    customer: "cus_lifecycle_fixture",
    payment_intent: "pi_lifecycle_fixture",
    metadata: { credit_top_up_intent_id: CREDIT_INTENT_ID },
  } },
} as any);
assert.equal(chargeRefund?.kind, "charge_refund");
assert.equal(chargeRefund?.amountRefundedCents, 1_000);

const refund = normalizeStripeFinancialLifecycleEvent({
  id: "evt_refund_created",
  type: "refund.created",
  created: 1_784_000_101,
  livemode: false,
  data: { object: {
    id: "re_refund_fixture",
    object: "refund",
    amount: 1_000,
    currency: "usd",
    status: "succeeded",
    charge: "ch_refund_fixture",
    payment_intent: "pi_lifecycle_fixture",
    metadata: {},
  } },
} as any);
assert.equal(refund?.kind, "refund");
assert.equal(refund?.status, "succeeded");

const dispute = normalizeStripeFinancialLifecycleEvent({
  id: "evt_dispute_created",
  type: "charge.dispute.created",
  created: 1_784_000_102,
  livemode: false,
  data: { object: {
    id: "dp_dispute_fixture",
    object: "dispute",
    amount: 2_500,
    currency: "usd",
    status: "needs_response",
    reason: "fraudulent",
    charge: "ch_refund_fixture",
    payment_intent: "pi_lifecycle_fixture",
    metadata: {},
  } },
} as any);
assert.equal(dispute?.kind, "dispute");
assert.equal(dispute?.status, "needs_response");

const savedEnv = {
  allowed: process.env.STRIPE_ALLOWED_PROMOTION_CODE_IDS,
  direct: process.env.STRIPE_DIRECT_PROMOTION_CODE_ID,
  access: process.env.STRIPE_ACCESS_KEY_PROMOTION_CODE_ID,
  partners: process.env.STRIPE_PARTNER_PROMOTION_CODE_MAP_JSON,
};
try {
  delete process.env.STRIPE_ALLOWED_PROMOTION_CODE_IDS;
  delete process.env.STRIPE_DIRECT_PROMOTION_CODE_ID;
  delete process.env.STRIPE_ACCESS_KEY_PROMOTION_CODE_ID;
  delete process.env.STRIPE_PARTNER_PROMOTION_CODE_MAP_JSON;
  assert.deepEqual(getStripeCheckoutPromotionPolicy({ surface: "direct" }), {
    allow_promotion_codes: false,
  });
  process.env.STRIPE_DIRECT_PROMOTION_CODE_ID = "promo_Approved123";
  assert.throws(
    () => getStripeCheckoutPromotionPolicy({ surface: "direct" }),
    (error: any) => error?.code === "stripe_promotion_not_allowlisted",
  );
  process.env.STRIPE_ALLOWED_PROMOTION_CODE_IDS = "promo_Approved123,promo_Partner456";
  assert.deepEqual(getStripeCheckoutPromotionPolicy({ surface: "direct" }), {
    allow_promotion_codes: false,
    discounts: [{ promotion_code: "promo_Approved123" }],
  });
  process.env.STRIPE_PARTNER_PROMOTION_CODE_MAP_JSON = JSON.stringify({
    "approved-partner": "promo_Partner456",
  });
  assert.deepEqual(getStripeCheckoutPromotionPolicy({
    surface: "access_key",
    partnerSlug: "approved-partner",
  }), {
    allow_promotion_codes: false,
    discounts: [{ promotion_code: "promo_Partner456" }],
  });
} finally {
  if (savedEnv.allowed === undefined) delete process.env.STRIPE_ALLOWED_PROMOTION_CODE_IDS;
  else process.env.STRIPE_ALLOWED_PROMOTION_CODE_IDS = savedEnv.allowed;
  if (savedEnv.direct === undefined) delete process.env.STRIPE_DIRECT_PROMOTION_CODE_ID;
  else process.env.STRIPE_DIRECT_PROMOTION_CODE_ID = savedEnv.direct;
  if (savedEnv.access === undefined) delete process.env.STRIPE_ACCESS_KEY_PROMOTION_CODE_ID;
  else process.env.STRIPE_ACCESS_KEY_PROMOTION_CODE_ID = savedEnv.access;
  if (savedEnv.partners === undefined) delete process.env.STRIPE_PARTNER_PROMOTION_CODE_MAP_JSON;
  else process.env.STRIPE_PARTNER_PROMOTION_CODE_MAP_JSON = savedEnv.partners;
}

const billingSource = readFileSync(join(ROOT, "src/lib/services/billing-service.ts"), "utf8");
const accessSource = readFileSync(join(ROOT, "src/lib/services/access-key-service.ts"), "utf8");
const webhookSource = readFileSync(join(ROOT, "src/app/api/stripe/webhook/route.ts"), "utf8");
assert.match(billingSource, /checkout\.session\.async_payment_succeeded/);
assert.match(billingSource, /project_stripe_checkout_payment_lifecycle_v1/);
assert.match(billingSource, /project_stripe_charge_refund_lifecycle_v1/);
assert.match(billingSource, /project_stripe_refund_lifecycle_v1/);
assert.match(billingSource, /project_stripe_dispute_lifecycle_v1/);
assert.match(accessSource, /payment_failed/);
assert.doesNotMatch(billingSource, /allow_promotion_codes:\s*true/);
assert.doesNotMatch(accessSource, /allow_promotion_codes:\s*true/);
assert.match(webhookSource, /event\.data\.object\.object === "checkout\.session"/);

console.log("PASS Stripe lifecycle contract: delayed settlement, failed/expired fail-closed states, refund/dispute normalization, tenant binding, and server-only promotion allowlist");
