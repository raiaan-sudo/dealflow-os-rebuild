import Stripe from "stripe";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRIPE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,255}$/;

export const STRIPE_CHECKOUT_LIFECYCLE_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
] as const;

export const STRIPE_REFUND_LIFECYCLE_EVENT_TYPES = [
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "refund.failed",
] as const;

export const STRIPE_DISPUTE_LIFECYCLE_EVENT_TYPES = [
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
] as const;

export type StripeCheckoutLifecycleEventType = typeof STRIPE_CHECKOUT_LIFECYCLE_EVENT_TYPES[number];
export type StripeCheckoutPaymentState = "pending" | "succeeded" | "failed" | "expired";
export type StripeCheckoutFlow = "subscription" | "access_key" | "credit_top_up";

export class StripeLifecycleValidationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StripeLifecycleValidationError";
    this.code = code;
  }
}

function requiredStripeId(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!STRIPE_ID_PATTERN.test(normalized)) {
    throw new StripeLifecycleValidationError("stripe_lifecycle_identity_invalid", `${label} is invalid.`);
  }
  return normalized;
}

function optionalStripeId(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object" && value && "id" in value) {
    return requiredStripeId((value as { id?: unknown }).id, label);
  }
  return requiredStripeId(value, label);
}

function optionalUuid(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!UUID_PATTERN.test(normalized)) {
    throw new StripeLifecycleValidationError("stripe_lifecycle_tenant_identity_invalid", `${label} is invalid.`);
  }
  return normalized;
}

function nonNegativeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new StripeLifecycleValidationError("stripe_lifecycle_amount_invalid", `${label} is invalid.`);
  }
  return value as number;
}

function normalizedCurrency(value: unknown) {
  const currency = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z]{3}$/.test(currency)) {
    throw new StripeLifecycleValidationError("stripe_lifecycle_currency_invalid", "Stripe currency is invalid.");
  }
  return currency;
}

function metadataString(metadata: Stripe.Metadata | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function assertEventEnvelope(event: Stripe.Event) {
  if (!STRIPE_ID_PATTERN.test(event.id) || !Number.isSafeInteger(event.created) || event.created < 0) {
    throw new StripeLifecycleValidationError("stripe_lifecycle_event_identity_invalid", "Stripe event identity is invalid.");
  }
}

function isCheckoutLifecycleEventType(type: string): type is StripeCheckoutLifecycleEventType {
  return (STRIPE_CHECKOUT_LIFECYCLE_EVENT_TYPES as readonly string[]).includes(type);
}

function checkoutState(eventType: StripeCheckoutLifecycleEventType, session: Stripe.Checkout.Session) {
  if (eventType === "checkout.session.expired") {
    if (session.status !== "expired" || session.payment_status === "paid") {
      throw new StripeLifecycleValidationError(
        "stripe_checkout_lifecycle_state_invalid",
        "Expired Checkout Session state is inconsistent.",
      );
    }
    return "expired" as const;
  }

  if (eventType === "checkout.session.async_payment_failed") {
    if (session.payment_status === "paid") {
      throw new StripeLifecycleValidationError(
        "stripe_checkout_lifecycle_state_invalid",
        "Failed Checkout Session is marked paid.",
      );
    }
    return "failed" as const;
  }

  if (session.status !== "complete") {
    throw new StripeLifecycleValidationError(
      "stripe_checkout_lifecycle_state_invalid",
      "Successful or pending Checkout Session is not complete.",
    );
  }

  if (eventType === "checkout.session.async_payment_succeeded") {
    if (session.payment_status !== "paid") {
      throw new StripeLifecycleValidationError(
        "stripe_checkout_lifecycle_state_invalid",
        "Successful Checkout Session is not marked paid.",
      );
    }
    return "succeeded" as const;
  }

  return session.payment_status === "paid" ? "succeeded" as const : "pending" as const;
}

export type NormalizedStripeCheckoutLifecycle = {
  eventId: string;
  eventType: StripeCheckoutLifecycleEventType;
  eventCreated: number;
  checkoutSessionId: string;
  flow: StripeCheckoutFlow;
  paymentState: StripeCheckoutPaymentState;
  organizationId: string | null;
  userId: string | null;
  accessKeyId: string | null;
  creditTopUpIntentId: string | null;
  stripeCustomerId: string | null;
  stripePaymentIntentId: string | null;
  stripeSubscriptionId: string | null;
  amountTotal: number;
  currency: string;
};

export function normalizeStripeCheckoutLifecycleEvent(
  event: Stripe.Event,
): NormalizedStripeCheckoutLifecycle | null {
  if (!isCheckoutLifecycleEventType(event.type)) return null;
  assertEventEnvelope(event);

  if (event.data.object.object !== "checkout.session") {
    throw new StripeLifecycleValidationError(
      "stripe_checkout_lifecycle_object_invalid",
      "Stripe Checkout lifecycle event did not contain a Checkout Session.",
    );
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const checkoutKind = metadataString(session.metadata, "checkout_kind");
  const checkoutFlow = metadataString(session.metadata, "checkout_flow");
  if (checkoutKind && checkoutFlow) {
    throw new StripeLifecycleValidationError(
      "stripe_checkout_lifecycle_flow_ambiguous",
      "Checkout Session declares more than one DealFlow flow.",
    );
  }

  const flow: StripeCheckoutFlow = checkoutKind === "credit_top_up"
    ? "credit_top_up"
    : checkoutFlow === "access_key"
      ? "access_key"
      : "subscription";
  if ((checkoutKind && checkoutKind !== "credit_top_up") || (checkoutFlow && checkoutFlow !== "access_key")) {
    throw new StripeLifecycleValidationError(
      "stripe_checkout_lifecycle_flow_invalid",
      "Checkout Session flow is not recognized.",
    );
  }

  const organizationId = optionalUuid(metadataString(session.metadata, "organization_id"), "organization_id");
  const userId = optionalUuid(metadataString(session.metadata, "user_id"), "user_id");
  const accessKeyId = optionalUuid(metadataString(session.metadata, "access_key_id"), "access_key_id");
  const creditTopUpIntentId = optionalUuid(
    metadataString(session.metadata, "credit_top_up_intent_id"),
    "credit_top_up_intent_id",
  );
  const clientReferenceId = typeof session.client_reference_id === "string"
    ? session.client_reference_id.trim()
    : null;

  if (flow === "subscription" && (!organizationId || !userId || clientReferenceId !== organizationId)) {
    throw new StripeLifecycleValidationError(
      "stripe_checkout_lifecycle_tenant_mismatch",
      "Subscription Checkout Session tenant binding is incomplete or mismatched.",
    );
  }
  if (flow === "access_key" && (!accessKeyId || clientReferenceId !== accessKeyId || organizationId || userId)) {
    throw new StripeLifecycleValidationError(
      "stripe_checkout_lifecycle_access_key_mismatch",
      "Access-key Checkout Session binding is incomplete or mismatched.",
    );
  }
  if (flow === "credit_top_up" && (!creditTopUpIntentId || !clientReferenceId || organizationId || userId)) {
    throw new StripeLifecycleValidationError(
      "stripe_checkout_lifecycle_credit_intent_mismatch",
      "Credit Checkout Session binding is incomplete or mismatched.",
    );
  }

  const amountTotal = nonNegativeInteger(session.amount_total, "Checkout total");
  const paymentState = checkoutState(event.type, session);
  if (paymentState === "succeeded" && amountTotal <= 0) {
    throw new StripeLifecycleValidationError(
      "stripe_checkout_lifecycle_payment_not_positive",
      "A successful DealFlow Checkout Session must have a positive total.",
    );
  }

  return {
    eventId: event.id,
    eventType: event.type,
    eventCreated: event.created,
    checkoutSessionId: requiredStripeId(session.id, "Checkout Session id"),
    flow,
    paymentState,
    organizationId,
    userId,
    accessKeyId,
    creditTopUpIntentId,
    stripeCustomerId: optionalStripeId(session.customer, "Stripe customer id"),
    stripePaymentIntentId: optionalStripeId(session.payment_intent, "Stripe PaymentIntent id"),
    stripeSubscriptionId: optionalStripeId(session.subscription, "Stripe subscription id"),
    amountTotal,
    currency: normalizedCurrency(session.currency),
  };
}

export type NormalizedStripeChargeRefund = {
  kind: "charge_refund";
  eventId: string;
  eventType: "charge.refunded";
  eventCreated: number;
  stripeChargeId: string;
  stripePaymentIntentId: string | null;
  stripeCustomerId: string | null;
  organizationIdHint: string | null;
  creditTopUpIntentIdHint: string | null;
  amountCents: number;
  amountRefundedCents: number;
  currency: string;
};

export type NormalizedStripeRefund = {
  kind: "refund";
  eventId: string;
  eventType: "refund.created" | "refund.updated" | "refund.failed";
  eventCreated: number;
  stripeRefundId: string;
  stripeChargeId: string | null;
  stripePaymentIntentId: string | null;
  organizationIdHint: string | null;
  creditTopUpIntentIdHint: string | null;
  amountCents: number;
  currency: string;
  status: string;
  failureReason: string | null;
};

export type NormalizedStripeDispute = {
  kind: "dispute";
  eventId: string;
  eventType: "charge.dispute.created" | "charge.dispute.updated" | "charge.dispute.closed";
  eventCreated: number;
  stripeDisputeId: string;
  stripeChargeId: string;
  stripePaymentIntentId: string | null;
  organizationIdHint: string | null;
  creditTopUpIntentIdHint: string | null;
  amountCents: number;
  currency: string;
  status: string;
  reason: string;
};

export type NormalizedStripeFinancialLifecycle =
  | NormalizedStripeChargeRefund
  | NormalizedStripeRefund
  | NormalizedStripeDispute;

export function normalizeStripeFinancialLifecycleEvent(
  event: Stripe.Event,
): NormalizedStripeFinancialLifecycle | null {
  assertEventEnvelope(event);

  if (event.type === "charge.refunded") {
    if (event.data.object.object !== "charge") {
      throw new StripeLifecycleValidationError("stripe_refund_object_invalid", "Refund event did not contain a Charge.");
    }
    const charge = event.data.object as Stripe.Charge;
    const amountCents = nonNegativeInteger(charge.amount, "Charge amount");
    const amountRefundedCents = nonNegativeInteger(charge.amount_refunded, "Refunded amount");
    if (amountRefundedCents > amountCents) {
      throw new StripeLifecycleValidationError("stripe_refund_amount_invalid", "Refund exceeds the original Charge.");
    }
    return {
      kind: "charge_refund",
      eventId: event.id,
      eventType: event.type,
      eventCreated: event.created,
      stripeChargeId: requiredStripeId(charge.id, "Stripe Charge id"),
      stripePaymentIntentId: optionalStripeId(charge.payment_intent, "Stripe PaymentIntent id"),
      stripeCustomerId: optionalStripeId(charge.customer, "Stripe customer id"),
      organizationIdHint: optionalUuid(metadataString(charge.metadata, "organization_id"), "organization_id"),
      creditTopUpIntentIdHint: optionalUuid(
        metadataString(charge.metadata, "credit_top_up_intent_id"),
        "credit_top_up_intent_id",
      ),
      amountCents,
      amountRefundedCents,
      currency: normalizedCurrency(charge.currency),
    };
  }

  if (event.type === "refund.created" || event.type === "refund.updated" || event.type === "refund.failed") {
    if (event.data.object.object !== "refund") {
      throw new StripeLifecycleValidationError("stripe_refund_object_invalid", "Refund event did not contain a Refund.");
    }
    const refund = event.data.object as Stripe.Refund;
    const status = typeof refund.status === "string" ? refund.status.trim().toLowerCase() : "";
    if (!new Set(["pending", "requires_action", "succeeded", "failed", "canceled"]).has(status)) {
      throw new StripeLifecycleValidationError("stripe_refund_status_invalid", "Stripe Refund status is invalid.");
    }
    return {
      kind: "refund",
      eventId: event.id,
      eventType: event.type,
      eventCreated: event.created,
      stripeRefundId: requiredStripeId(refund.id, "Stripe Refund id"),
      stripeChargeId: optionalStripeId(refund.charge, "Stripe Charge id"),
      stripePaymentIntentId: optionalStripeId(refund.payment_intent, "Stripe PaymentIntent id"),
      organizationIdHint: optionalUuid(metadataString(refund.metadata, "organization_id"), "organization_id"),
      creditTopUpIntentIdHint: optionalUuid(
        metadataString(refund.metadata, "credit_top_up_intent_id"),
        "credit_top_up_intent_id",
      ),
      amountCents: nonNegativeInteger(refund.amount, "Refund amount"),
      currency: normalizedCurrency(refund.currency),
      status,
      failureReason: typeof refund.failure_reason === "string" && refund.failure_reason.trim()
        ? refund.failure_reason.trim().slice(0, 160)
        : null,
    };
  }

  if (
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.updated" ||
    event.type === "charge.dispute.closed"
  ) {
    if (event.data.object.object !== "dispute") {
      throw new StripeLifecycleValidationError("stripe_dispute_object_invalid", "Dispute event did not contain a Dispute.");
    }
    const dispute = event.data.object as Stripe.Dispute;
    const status = typeof dispute.status === "string" ? dispute.status.trim().toLowerCase() : "";
    const allowedStatuses = new Set([
      "warning_needs_response",
      "warning_under_review",
      "warning_closed",
      "needs_response",
      "under_review",
      "won",
      "lost",
      "prevented",
    ]);
    if (!allowedStatuses.has(status)) {
      throw new StripeLifecycleValidationError("stripe_dispute_status_invalid", "Stripe Dispute status is invalid.");
    }
    return {
      kind: "dispute",
      eventId: event.id,
      eventType: event.type,
      eventCreated: event.created,
      stripeDisputeId: requiredStripeId(dispute.id, "Stripe Dispute id"),
      stripeChargeId: requiredStripeId(dispute.charge, "Stripe Charge id"),
      stripePaymentIntentId: optionalStripeId(dispute.payment_intent, "Stripe PaymentIntent id"),
      organizationIdHint: optionalUuid(metadataString(dispute.metadata, "organization_id"), "organization_id"),
      creditTopUpIntentIdHint: optionalUuid(
        metadataString(dispute.metadata, "credit_top_up_intent_id"),
        "credit_top_up_intent_id",
      ),
      amountCents: nonNegativeInteger(dispute.amount, "Dispute amount"),
      currency: normalizedCurrency(dispute.currency),
      status,
      reason: typeof dispute.reason === "string" && dispute.reason.trim()
        ? dispute.reason.trim().slice(0, 160)
        : "unknown",
    };
  }

  return null;
}
