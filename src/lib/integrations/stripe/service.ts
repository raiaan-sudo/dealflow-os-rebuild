import { getPublicAppUrl, getStripeEnv } from "@/lib/env";
import { getStripeBillingProvider } from "@/lib/integrations/stripe/provider";
import { normalizeBillingPlanTier, type BillingPlanTier } from "@/lib/billing/plans";

export function getStripeClient() {
  return getStripeBillingProvider().getClient();
}

export function getStripePriceId(planTier: BillingPlanTier) {
  const env = getStripeEnv();

  if (!env) {
    return null;
  }

  if (planTier === "growth") {
    return env.growthPriceId;
  }

  if (planTier === "pro") {
    return env.proPriceId;
  }

  return env.starterPriceId;
}

export function getPlanTierFromPriceId(priceId?: string | null): BillingPlanTier {
  const env = getStripeEnv();

  if (!env) {
    return "starter";
  }

  if (priceId === env.growthPriceId) {
    return "growth";
  }

  if (priceId === env.proPriceId) {
    return "pro";
  }

  return "starter";
}

export function getCheckoutUrls() {
  const baseUrl = getPublicAppUrl();

  return {
    successUrl: `${baseUrl}/unlock?checkout=success`,
    cancelUrl: `${baseUrl}/unlock?checkout=cancelled`,
  };
}

export function getBillingPortalUrls() {
  const baseUrl = getPublicAppUrl();

  return {
    returnUrl: `${baseUrl}/settings?billing=portal`,
  };
}

export function buildStripeCheckoutMetadata(params: {
  organizationId: string;
  userId: string;
  planTier: BillingPlanTier;
}) {
  return {
    organization_id: params.organizationId,
    user_id: params.userId,
    plan_tier: normalizeBillingPlanTier(params.planTier),
  };
}
