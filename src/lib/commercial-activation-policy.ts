export const INITIAL_COMMERCIAL_ACTIVATION_CREDIT_CENTS = 1_000;

export type CommercialActivationSource = "checkout.session.completed" | "invoice.payment_succeeded";

export type CommercialActivationCandidate = {
  source: CommercialActivationSource;
  billingStateApplied: boolean;
  organizationId: string | null;
  userId: string | null;
  sourceEventId: string;
  sourceEventCreated: number;
  amountPaidCents: number;
  paymentStatus: string | null;
  invoiceBillingReason: string | null;
};

export type CommercialActivationDecision =
  | { eligible: true; reason: "qualifying_initial_payment" }
  | {
      eligible: false;
      reason:
        | "billing_state_not_applied"
        | "source_not_qualifying"
        | "identity_missing"
        | "payment_not_positive"
        | "checkout_not_paid"
        | "invoice_not_paid"
        | "invoice_not_initial";
    };

export function evaluateCommercialActivationCandidate(
  candidate: CommercialActivationCandidate,
): CommercialActivationDecision {
  if (!candidate.billingStateApplied) {
    return { eligible: false, reason: "billing_state_not_applied" };
  }

  if (
    candidate.source !== "checkout.session.completed" &&
    candidate.source !== "invoice.payment_succeeded"
  ) {
    return { eligible: false, reason: "source_not_qualifying" };
  }

  if (!Number.isInteger(candidate.amountPaidCents) || candidate.amountPaidCents <= 0) {
    return { eligible: false, reason: "payment_not_positive" };
  }

  if (candidate.source === "checkout.session.completed") {
    if (candidate.paymentStatus !== "paid") {
      return { eligible: false, reason: "checkout_not_paid" };
    }
  } else {
    if (candidate.paymentStatus !== "paid") {
      return { eligible: false, reason: "invoice_not_paid" };
    }
    if (candidate.invoiceBillingReason !== "subscription_create") {
      return { eligible: false, reason: "invoice_not_initial" };
    }
  }

  if (!candidate.organizationId || !candidate.userId) {
    return { eligible: false, reason: "identity_missing" };
  }

  return { eligible: true, reason: "qualifying_initial_payment" };
}

export function applyCommercialActivationDecision(
  state: { activated: boolean; creditBalanceCents: number },
  decision: CommercialActivationDecision,
) {
  if (!decision.eligible || state.activated) {
    return {
      ...state,
      activationCreated: false,
      initialCreditGrantedCents: 0,
    };
  }

  return {
    activated: true,
    creditBalanceCents: state.creditBalanceCents + INITIAL_COMMERCIAL_ACTIVATION_CREDIT_CENTS,
    activationCreated: true,
    initialCreditGrantedCents: INITIAL_COMMERCIAL_ACTIVATION_CREDIT_CENTS,
  };
}
