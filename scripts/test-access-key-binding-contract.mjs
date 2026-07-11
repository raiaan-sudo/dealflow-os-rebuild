#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

class TestApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const bindingSource = await readFile(
  "src/lib/billing/access-key-checkout-binding.ts",
  "utf8",
);
const bindingOutput = ts.transpileModule(bindingSource, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const bindingModule = { exports: {} };
new Function("require", "module", "exports", bindingOutput)(
  (specifier) => {
    if (specifier === "@/lib/api/route") {
      return { ApiError: TestApiError };
    }
    if (specifier === "@/lib/billing/plans") {
      return {
        BILLING_PLANS: {
          starter: { name: "Starter", priceLabel: "$97/mo", rank: 1 },
          pro: { name: "Pro", priceLabel: "$297/mo", rank: 2 },
          growth: { name: "Growth", priceLabel: "$497/mo", rank: 3 },
        },
      };
    }
    if (specifier === "@/lib/integrations/stripe/service") {
      return {
        getStripePriceId(planTier) {
          return {
            starter: "price_starter_binding",
            pro: "price_pro_binding",
            growth: "price_growth_binding",
          }[planTier] ?? null;
        },
      };
    }
    throw new Error(`Unexpected binding-contract dependency: ${specifier}`);
  },
  bindingModule,
  bindingModule.exports,
);
const {
  validateAccessKeyCheckoutSessionEnvelope,
  validateAccessKeyCheckoutSessionBinding,
  validateAccessKeyStripeActivationBinding,
  requireAccessKeyPlanTier,
} = bindingModule.exports;

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "active",
  stripe_checkout_session_id: "cs_live_access_binding",
  stripe_customer_id: "cus_access_binding",
  stripe_subscription_id: "sub_access_binding",
  stripe_price_id: "price_pro_binding",
  plan_tier: "pro",
  partner_id: "22222222-2222-4222-8222-222222222222",
  partner_slug: "trusted-partner",
  metadata: {
    created_source: "access_key_checkout",
    price_ids: ["price_pro_binding"],
  },
};
const metadata = {
  checkout_flow: "access_key",
  access_key_id: row.id,
  plan_tier: "pro",
  internal_plan_tier: "pro",
  price_ids: "price_pro_binding",
  partner_id: row.partner_id,
  partner_slug: row.partner_slug,
  partner_attribution_source: "access_key_checkout",
};
const customer = {
  id: "cus_access_binding",
  object: "customer",
  livemode: true,
  metadata: {
    checkout_flow: "access_key",
    access_key_id: row.id,
    partner_id: row.partner_id,
    partner_slug: row.partner_slug,
  },
};
const session = {
  id: "cs_live_access_binding",
  object: "checkout.session",
  livemode: true,
  mode: "subscription",
  status: "complete",
  payment_status: "paid",
  amount_total: 49_900,
  client_reference_id: row.id,
  customer,
  subscription: "sub_access_binding",
  metadata,
};
const subscription = {
  id: "sub_access_binding",
  object: "subscription",
  livemode: true,
  customer: "cus_access_binding",
  metadata,
  items: {
    has_more: false,
    data: [
      {
        quantity: 1,
        price: {
          id: "price_pro_binding",
          type: "recurring",
        },
      },
    ],
  },
};

assert.deepEqual(validateAccessKeyCheckoutSessionEnvelope({ session, row }), {
  customerId: customer.id,
  subscriptionId: subscription.id,
  expectedPriceId: "price_pro_binding",
  nullOnlyRecoveryRequired: false,
});
assert.deepEqual(validateAccessKeyCheckoutSessionBinding({ session, row }), {
  customerId: customer.id,
  subscriptionId: subscription.id,
  expectedPriceId: "price_pro_binding",
  nullOnlyRecoveryRequired: false,
});
assert.deepEqual(validateAccessKeyStripeActivationBinding({ session, subscription, row }), {
  customerId: customer.id,
  subscriptionId: subscription.id,
  priceId: "price_pro_binding",
});

function expectBindingRejection(run, code) {
  assert.throws(
    run,
    (error) => error instanceof TestApiError && error.code === code,
    `Expected immutable binding rejection ${code}`,
  );
}

expectBindingRejection(
  () => validateAccessKeyCheckoutSessionEnvelope({
    session: { ...session, client_reference_id: "another-row" },
    row,
  }),
  "access_key_client_reference_mismatch",
);
expectBindingRejection(
  () => validateAccessKeyCheckoutSessionEnvelope({
    session: { ...session, id: "cs_live_other" },
    row,
  }),
  "access_key_checkout_session_binding_mismatch",
);
expectBindingRejection(
  () => validateAccessKeyCheckoutSessionBinding({
    session: { ...session, customer: { ...customer, id: "cus_other" } },
    row,
  }),
  "access_key_customer_binding_mismatch",
);
expectBindingRejection(
  () => validateAccessKeyCheckoutSessionBinding({
    session: {
      ...session,
      customer: { ...customer, metadata: { ...customer.metadata, access_key_id: "other" } },
    },
    row,
  }),
  "access_key_customer_metadata_mismatch",
);
expectBindingRejection(
  () => validateAccessKeyCheckoutSessionEnvelope({
    session: { ...session, metadata: { ...metadata, access_key_id: "other" } },
    row,
  }),
  "access_key_session_key_mismatch",
);
expectBindingRejection(
  () => validateAccessKeyStripeActivationBinding({
    session,
    subscription: { ...subscription, id: "sub_other" },
    row,
  }),
  "access_key_subscription_binding_mismatch",
);
expectBindingRejection(
  () => validateAccessKeyStripeActivationBinding({
    session,
    subscription: { ...subscription, customer: "cus_other" },
    row,
  }),
  "access_key_subscription_customer_mismatch",
);
expectBindingRejection(
  () => validateAccessKeyStripeActivationBinding({
    session,
    subscription: {
      ...subscription,
      metadata: { ...metadata, access_key_id: "other" },
    },
    row,
  }),
  "access_key_subscription_key_mismatch",
);
expectBindingRejection(
  () => validateAccessKeyStripeActivationBinding({
    session,
    subscription: {
      ...subscription,
      items: {
        ...subscription.items,
        data: [...subscription.items.data, subscription.items.data[0]],
      },
    },
    row,
  }),
  "access_key_subscription_item_cardinality_invalid",
);
expectBindingRejection(
  () => validateAccessKeyStripeActivationBinding({
    session,
    subscription: {
      ...subscription,
      items: { ...subscription.items, has_more: true },
    },
    row,
  }),
  "access_key_subscription_item_cardinality_invalid",
);
expectBindingRejection(
  () => validateAccessKeyStripeActivationBinding({
    session,
    subscription: {
      ...subscription,
      items: {
        ...subscription.items,
        data: [{ ...subscription.items.data[0], quantity: 2 }],
      },
    },
    row,
  }),
  "access_key_subscription_quantity_invalid",
);
expectBindingRejection(
  () => validateAccessKeyStripeActivationBinding({
    session,
    subscription: {
      ...subscription,
      items: {
        ...subscription.items,
        data: [{ ...subscription.items.data[0], price: { id: "price_other", type: "recurring" } }],
      },
    },
    row,
  }),
  "access_key_subscription_price_mismatch",
);
expectBindingRejection(
  () => validateAccessKeyCheckoutSessionEnvelope({
    session,
    row: { ...row, metadata: { ...row.metadata, price_ids: ["price_pro_binding", "price_other"] } },
  }),
  "access_key_price_snapshot_invalid",
);
expectBindingRejection(
  () => validateAccessKeyStripeActivationBinding({
    session,
    subscription,
    row: { ...row, stripe_subscription_id: null },
  }),
  "access_key_settled_binding_missing",
);
expectBindingRejection(
  () => requireAccessKeyPlanTier("enterprise"),
  "access_key_plan_tier_invalid",
);
expectBindingRejection(
  () => validateAccessKeyCheckoutSessionEnvelope({
    session: {
      ...session,
      metadata: {
        ...metadata,
        plan_tier: "enterprise",
        internal_plan_tier: "enterprise",
      },
    },
    row: { ...row, plan_tier: "enterprise" },
  }),
  "access_key_plan_tier_invalid",
);
const internallyRepeatedWrongPriceMetadata = {
  ...metadata,
  price_ids: "price_starter_binding",
};
expectBindingRejection(
  () => validateAccessKeyStripeActivationBinding({
    session: { ...session, metadata: internallyRepeatedWrongPriceMetadata },
    subscription: {
      ...subscription,
      metadata: internallyRepeatedWrongPriceMetadata,
      items: {
        has_more: false,
        data: [{
          quantity: 1,
          price: { id: "price_starter_binding", type: "recurring" },
        }],
      },
    },
    row: {
      ...row,
      stripe_price_id: "price_starter_binding",
      metadata: { ...row.metadata, price_ids: ["price_starter_binding"] },
    },
  }),
  "access_key_price_plan_mismatch",
);

const recoverableRow = {
  ...row,
  status: "created",
  stripe_checkout_session_id: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  stripe_price_id: null,
};
expectBindingRejection(
  () => validateAccessKeyCheckoutSessionEnvelope({ session, row: recoverableRow }),
  "access_key_checkout_session_binding_mismatch",
);
assert.equal(
  validateAccessKeyCheckoutSessionBinding({
    session,
    row: recoverableRow,
    allowNullOnlyRecovery: true,
  }).nullOnlyRecoveryRequired,
  true,
);
for (const unsafeRecoveryRow of [
  { ...recoverableRow, status: "pending_payment" },
  { ...recoverableRow, stripe_customer_id: customer.id },
  { ...recoverableRow, stripe_subscription_id: subscription.id },
  { ...recoverableRow, stripe_price_id: "price_pro_binding" },
  { ...recoverableRow, metadata: { ...recoverableRow.metadata, created_source: "unknown" } },
]) {
  expectBindingRejection(
    () => validateAccessKeyCheckoutSessionEnvelope({
      session,
      row: unsafeRecoveryRow,
      allowNullOnlyRecovery: true,
    }),
    "access_key_checkout_session_binding_mismatch",
  );
}

const serviceSource = await readFile("src/lib/services/access-key-service.ts", "utf8");
const serviceSourceFile = ts.createSourceFile(
  "src/lib/services/access-key-service.ts",
  serviceSource,
  ts.ScriptTarget.Latest,
  true,
);
function readServiceFunction(name) {
  const declaration = serviceSourceFile.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  assert.ok(declaration, `Missing service function ${name}`);
  return declaration.getText(serviceSourceFile);
}
const authoritativeUnitOutput = ts.transpileModule(
  [
    readServiceFunction("assertQualifyingAccessKeyCheckout"),
    readServiceFunction("loadAuthoritativeAccessKeyCheckoutSession"),
    "module.exports = { loadAuthoritativeAccessKeyCheckoutSession };",
  ].join("\n"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const authoritativeUnitModule = { exports: {} };
let checkoutRefreshCalls = 0;
const staleExpandedSession = {
  ...session,
  customer: {
    ...customer,
    metadata: { ...customer.metadata, partner_slug: "stale-partner" },
  },
};
const currentExpandedSession = { ...session, customer };
new Function(
  "validateAccessKeyCheckoutSessionEnvelope",
  "validateAccessKeyCheckoutSessionBinding",
  "assertStripeObjectRuntimeMode",
  "ApiError",
  "module",
  "exports",
  authoritativeUnitOutput,
)(
  ({ session: candidate }) => ({
    customerId: candidate.customer.id,
    subscriptionId: subscription.id,
    expectedPriceId: "price_pro_binding",
  }),
  ({ session: candidate }) => {
    assert.equal(candidate, currentExpandedSession, "stale expanded input bypassed checkout refresh");
    return {
      customerId: candidate.customer.id,
      subscriptionId: subscription.id,
      expectedPriceId: "price_pro_binding",
    };
  },
  () => undefined,
  TestApiError,
  authoritativeUnitModule,
  authoritativeUnitModule.exports,
);
const authoritativeResult = await authoritativeUnitModule.exports
  .loadAuthoritativeAccessKeyCheckoutSession({
    session: staleExpandedSession,
    row,
    stripeProvider: {
      async execute(request) {
        checkoutRefreshCalls += 1;
        assert.deepEqual(request, {
          action: "retrieve_checkout_session",
          sessionId: session.id,
        });
        return currentExpandedSession;
      },
    },
  });
assert.equal(checkoutRefreshCalls, 1, "already-expanded checkout input was not refreshed");
assert.equal(authoritativeResult.session, currentExpandedSession);
const settledReturnIndex = serviceSource.indexOf('existingRow.status === "claimed"');
const bindingValidationIndex = serviceSource.indexOf("validateAccessKeyStripeActivationBinding({");
assert.ok(
  bindingValidationIndex >= 0 && settledReturnIndex > bindingValidationIndex,
  "settled access keys are returned before immutable Stripe bindings are validated",
);
assert.match(serviceSource, /\.eq\("stripe_checkout_session_id", authoritative\.session\.id\)/);
assert.match(serviceSource, /\.is\("stripe_subscription_id", null\)/);
assert.match(serviceSource, /assertStripeObjectRuntimeMode\(subscription/);
assert.match(serviceSource, /assertStripeObjectRuntimeMode\(customer/);
assert.match(serviceSource, /plan_tier: requireAccessKeyPlanTier\(row\.plan_tier\)/);
assert.doesNotMatch(
  serviceSource.slice(
    serviceSource.indexOf("async function loadAuthoritativeAccessKeyCheckoutSession"),
    serviceSource.indexOf("async function recoverNullOnlyAccessKeyCheckoutBinding"),
  ),
  /if \(!params\.session\.customer|typeof params\.session\.customer === "string"/,
  "already-expanded sessions still bypass the authoritative checkout refresh",
);
assert.doesNotMatch(
  serviceSource,
  /error\.code === "access_key_checkout_incomplete"[\s\S]{0,500}stripe_checkout_session_id/,
  "checkout success bypasses immutable activation binding on an incomplete session",
);

const partnerPageSource = await readFile("src/app/p/[partnerSlug]/checkout/page.tsx", "utf8");
assert.doesNotMatch(partnerPageSource, /formatPartnerName|formatResolvedPartnerName/);
assert.doesNotMatch(partnerPageSource, /title:\s*`\$\{[^}]*partnerSlug/);
assert.match(partnerPageSource, /const resolvePartnerCheckout = cache\(loadPublicPartnerCheckout\)/);
assert.equal(
  (partnerPageSource.match(/await resolvePartnerCheckout\(partnerSlug\)/g) ?? []).length,
  2,
  "page and metadata do not share the exact partner resolver",
);
assert.match(partnerPageSource, /title:\s*`\$\{partner\.brandName\} Checkout`/);
assert.match(partnerPageSource, /partnerSlug=\{partner\.slug\}/);
assert.match(serviceSource, /export async function loadPublicPartnerCheckout/);
assert.match(serviceSource, /\.eq\("status", "active"\)/);
assert.match(serviceSource, /\.is\("deleted_at", null\)/);
assert.match(serviceSource, /resolvedSlug !== normalizedSlug/);

const successTruthSource = await readFile("src/lib/access-key-success-truth.ts", "utf8");
const successTruthOutput = ts.transpileModule(successTruthSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const successTruthModule = { exports: {} };
new Function("module", "exports", successTruthOutput)(
  successTruthModule,
  successTruthModule.exports,
);
const { getAccessKeySuccessTruthState } = successTruthModule.exports;
assert.deepEqual(
  getAccessKeySuccessTruthState({ checkoutVerified: true, keyAvailable: true }),
  {
    state: "verified_key_available",
    eyebrow: "Checkout verified",
    title: "Your access key is ready",
    description:
      "Use this key on the create account screen. Once claimed, it links this verified paid Stripe subscription to your DealFlow workspace.",
    notice: null,
  },
);
const verifiedUnavailable = getAccessKeySuccessTruthState({
  checkoutVerified: true,
  keyAvailable: false,
});
assert.equal(verifiedUnavailable.state, "verified_key_unavailable");
assert.equal(verifiedUnavailable.eyebrow, "Checkout verified");
assert.match(verifiedUnavailable.title, /not available in this browser/);
assert.doesNotMatch(verifiedUnavailable.description, /not verified|no access key has been revealed/i);
assert.doesNotMatch(verifiedUnavailable.notice, /Stripe finishes confirmation/i);
assert.equal(
  verifiedUnavailable.notice,
  "This checkout is verified, but DealFlow cannot reveal the key from this browser handoff. Return to checkout or use the original verified handoff.",
);
assert.doesNotMatch(
  verifiedUnavailable.notice,
  /original delivery is complete|another delivery is in progress/i,
);
const unverified = getAccessKeySuccessTruthState({
  checkoutVerified: false,
  keyAvailable: false,
});
assert.equal(unverified.state, "unverified");
assert.equal(unverified.eyebrow, "Checkout not verified");
assert.equal(unverified.title, "Access key is not ready");
assert.match(unverified.description, /No key is available to reveal/);

const successPageSource = await readFile("src/app/access-key/success/page.tsx", "utf8");
assert.match(successPageSource, /checkoutVerified: result !== null/);
assert.match(successPageSource, /keyAvailable: verifiedHandoff !== null/);
assert.match(successPageSource, /\{truth\.eyebrow\}/);
assert.match(successPageSource, /\{truth\.title\}/);
assert.match(successPageSource, /\{truth\.description\}/);
assert.match(successPageSource, /\{truth\.notice\}/);
assert.doesNotMatch(successPageSource, /No access key has been revealed/);
assert.doesNotMatch(successPageSource, /Stripe finishes confirmation/);

console.log("PASS access-key immutable Stripe binding and resolved partner checkout contract");
