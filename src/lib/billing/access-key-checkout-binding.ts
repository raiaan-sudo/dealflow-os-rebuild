import Stripe from "stripe";
import { ApiError } from "@/lib/api/route";
import { BILLING_PLANS, type BillingPlanTier } from "@/lib/billing/plans";
import { getStripePriceId } from "@/lib/integrations/stripe/service";

export type AccessKeyCheckoutBindingRow = {
  id: string;
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  plan_tier: string;
  partner_id: string | null;
  partner_slug: string | null;
  metadata: Record<string, unknown>;
};

const SETTLED_ACCESS_KEY_STATUSES = new Set(["active", "preclaimed", "claimed"]);

function rejectBinding(message: string, code: string): never {
  throw new ApiError(409, message, code);
}

export function requireAccessKeyPlanTier(value: unknown): BillingPlanTier {
  if (
    typeof value !== "string" ||
    !Object.prototype.hasOwnProperty.call(BILLING_PLANS, value)
  ) {
    rejectBinding(
      "The persisted access-key plan tier is invalid.",
      "access_key_plan_tier_invalid",
    );
  }

  return value as BillingPlanTier;
}

function exactMetadataValue(
  metadata: Stripe.Metadata | null | undefined,
  key: string,
  expected: string,
  code: string,
) {
  if (metadata?.[key] !== expected) {
    rejectBinding("Stripe checkout metadata does not match the access-key record.", code);
  }
}

function getObjectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function getExpandedCustomer(session: Stripe.Checkout.Session) {
  const customer = session.customer;
  if (!customer || typeof customer === "string" || ("deleted" in customer && customer.deleted)) {
    rejectBinding(
      "Stripe checkout customer identity could not be verified.",
      "access_key_customer_binding_invalid",
    );
  }
  return customer;
}

function getStoredPriceId(row: AccessKeyCheckoutBindingRow) {
  const planTier = requireAccessKeyPlanTier(row.plan_tier);
  const configuredPriceId = getStripePriceId(planTier);
  if (!configuredPriceId) {
    throw new ApiError(
      503,
      "The persisted access-key plan is not configured in Stripe.",
      "access_key_configured_price_missing",
    );
  }
  const value = row.metadata.price_ids;
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    typeof value[0] !== "string" ||
    !value[0].trim()
  ) {
    rejectBinding(
      "The access-key price snapshot is missing or ambiguous.",
      "access_key_price_snapshot_invalid",
    );
  }
  const snapshotPriceId = value[0].trim();
  if (snapshotPriceId !== configuredPriceId) {
    rejectBinding(
      "The access-key price snapshot does not match its configured internal plan.",
      "access_key_price_plan_mismatch",
    );
  }
  return configuredPriceId;
}

function assertCommonMetadata(
  metadata: Stripe.Metadata | null | undefined,
  row: AccessKeyCheckoutBindingRow,
  expectedPriceId: string,
  scope: "session" | "subscription",
) {
  exactMetadataValue(metadata, "checkout_flow", "access_key", `access_key_${scope}_flow_mismatch`);
  exactMetadataValue(metadata, "access_key_id", row.id, `access_key_${scope}_key_mismatch`);
  exactMetadataValue(metadata, "plan_tier", row.plan_tier, `access_key_${scope}_plan_mismatch`);
  exactMetadataValue(
    metadata,
    "internal_plan_tier",
    row.plan_tier,
    `access_key_${scope}_plan_mismatch`,
  );
  exactMetadataValue(metadata, "price_ids", expectedPriceId, `access_key_${scope}_price_mismatch`);
  exactMetadataValue(metadata, "partner_id", row.partner_id ?? "", `access_key_${scope}_partner_mismatch`);
  exactMetadataValue(
    metadata,
    "partner_slug",
    row.partner_slug ?? "",
    `access_key_${scope}_partner_mismatch`,
  );
  exactMetadataValue(
    metadata,
    "partner_attribution_source",
    "access_key_checkout",
    `access_key_${scope}_partner_mismatch`,
  );
}

export function validateAccessKeyCheckoutSessionEnvelope(params: {
  session: Stripe.Checkout.Session;
  row: AccessKeyCheckoutBindingRow;
  allowNullOnlyRecovery?: boolean;
}) {
  const { session, row } = params;
  const expectedPriceId = getStoredPriceId(row);

  if (session.id !== row.stripe_checkout_session_id) {
    const nullOnlyRecoveryAllowed =
      params.allowNullOnlyRecovery === true &&
      row.status === "created" &&
      row.stripe_checkout_session_id === null &&
      row.stripe_customer_id === null &&
      row.stripe_subscription_id === null &&
      row.stripe_price_id === null &&
      row.metadata.created_source === "access_key_checkout";

    if (!nullOnlyRecoveryAllowed) {
      rejectBinding(
        "Stripe checkout session does not match the persisted access-key checkout.",
        "access_key_checkout_session_binding_mismatch",
      );
    }
  }

  if (session.mode !== "subscription") {
    rejectBinding(
      "Stripe checkout mode does not match the access-key subscription flow.",
      "access_key_checkout_mode_mismatch",
    );
  }

  if (session.client_reference_id !== row.id) {
    rejectBinding(
      "Stripe checkout client reference does not match the access-key record.",
      "access_key_client_reference_mismatch",
    );
  }

  assertCommonMetadata(session.metadata, row, expectedPriceId, "session");

  const customerId = getObjectId(session.customer);
  if (!customerId) {
    rejectBinding(
      "Stripe checkout customer identity is missing.",
      "access_key_customer_binding_invalid",
    );
  }
  if (
    row.stripe_customer_id !== null &&
    row.stripe_customer_id !== customerId
  ) {
    rejectBinding(
      "Stripe checkout customer does not match the persisted access-key customer.",
      "access_key_customer_binding_mismatch",
    );
  }
  if (
    row.stripe_customer_id === null &&
    !(
      params.allowNullOnlyRecovery === true &&
      row.status === "created" &&
      row.stripe_checkout_session_id === null
    )
  ) {
    rejectBinding(
      "The access-key customer binding is missing.",
      "access_key_customer_binding_missing",
    );
  }

  const subscriptionId = getObjectId(session.subscription);
  if (!subscriptionId) {
    rejectBinding(
      "Stripe checkout session is missing its subscription binding.",
      "access_key_subscription_missing",
    );
  }

  return {
    customerId,
    subscriptionId,
    expectedPriceId,
    nullOnlyRecoveryRequired: row.stripe_checkout_session_id === null,
  };
}

export function validateAccessKeyCheckoutSessionBinding(params: {
  session: Stripe.Checkout.Session;
  row: AccessKeyCheckoutBindingRow;
  allowNullOnlyRecovery?: boolean;
}) {
  const envelope = validateAccessKeyCheckoutSessionEnvelope(params);
  const customer = getExpandedCustomer(params.session);

  exactMetadataValue(
    customer.metadata,
    "checkout_flow",
    "access_key",
    "access_key_customer_metadata_mismatch",
  );
  exactMetadataValue(
    customer.metadata,
    "access_key_id",
    params.row.id,
    "access_key_customer_metadata_mismatch",
  );
  exactMetadataValue(
    customer.metadata,
    "partner_id",
    params.row.partner_id ?? "",
    "access_key_customer_metadata_mismatch",
  );
  exactMetadataValue(
    customer.metadata,
    "partner_slug",
    params.row.partner_slug ?? "",
    "access_key_customer_metadata_mismatch",
  );

  return envelope;
}

export function validateAccessKeyStripeActivationBinding(params: {
  session: Stripe.Checkout.Session;
  subscription: Stripe.Subscription;
  row: AccessKeyCheckoutBindingRow;
}) {
  const sessionBinding = validateAccessKeyCheckoutSessionBinding({
    session: params.session,
    row: params.row,
  });
  const { subscription, row } = params;

  if (subscription.id !== sessionBinding.subscriptionId) {
    rejectBinding(
      "Stripe subscription does not match the checkout session.",
      "access_key_subscription_binding_mismatch",
    );
  }
  if (getObjectId(subscription.customer) !== sessionBinding.customerId) {
    rejectBinding(
      "Stripe subscription customer does not match the checkout customer.",
      "access_key_subscription_customer_mismatch",
    );
  }

  assertCommonMetadata(
    subscription.metadata,
    row,
    sessionBinding.expectedPriceId,
    "subscription",
  );

  if (
    subscription.items.data.length !== 1 ||
    subscription.items.has_more !== false
  ) {
    rejectBinding(
      "Stripe subscription must contain exactly one access-key plan item.",
      "access_key_subscription_item_cardinality_invalid",
    );
  }
  const item = subscription.items.data[0];
  if (item.quantity !== 1) {
    rejectBinding(
      "Stripe subscription quantity does not match the access-key checkout.",
      "access_key_subscription_quantity_invalid",
    );
  }
  if (
    item.price.id !== sessionBinding.expectedPriceId ||
    item.price.type !== "recurring"
  ) {
    rejectBinding(
      "Stripe subscription price does not match the immutable access-key plan snapshot.",
      "access_key_subscription_price_mismatch",
    );
  }

  if (
    row.stripe_subscription_id !== null &&
    row.stripe_subscription_id !== subscription.id
  ) {
    rejectBinding(
      "Stripe subscription does not match the persisted access-key subscription.",
      "access_key_subscription_binding_mismatch",
    );
  }
  if (
    row.stripe_price_id !== null &&
    row.stripe_price_id !== item.price.id
  ) {
    rejectBinding(
      "Stripe price does not match the persisted access-key price.",
      "access_key_persisted_price_mismatch",
    );
  }

  if (
    SETTLED_ACCESS_KEY_STATUSES.has(row.status) &&
    (row.stripe_subscription_id === null || row.stripe_price_id === null)
  ) {
    rejectBinding(
      "The settled access key is missing its immutable Stripe subscription binding.",
      "access_key_settled_binding_missing",
    );
  }

  return {
    customerId: sessionBinding.customerId,
    subscriptionId: subscription.id,
    priceId: item.price.id,
  };
}
