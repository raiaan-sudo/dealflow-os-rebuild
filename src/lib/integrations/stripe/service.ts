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
    return env.growthPriceId ?? null;
  }

  if (planTier === "pro") {
    return env.proPriceId;
  }

  return env.starterPriceId;
}

export function getPlanTierFromPriceId(priceId?: string | null): BillingPlanTier | null {
  const env = getStripeEnv();

  if (!env || !priceId) {
    return null;
  }

  if (env.growthPriceId && priceId === env.growthPriceId) {
    return "growth";
  }

  if (priceId === env.proPriceId) {
    return "pro";
  }

  if (priceId === env.starterPriceId) {
    return "starter";
  }

  return null;
}

export function getCheckoutUrls(params?: { campaignId?: string | null; planTier?: BillingPlanTier | null }) {
  const baseUrl = getPublicAppUrl();
  const extraQuery = new URLSearchParams();

  if (params?.campaignId) {
    extraQuery.set("campaignId", params.campaignId);
  }

  if (params?.planTier) {
    extraQuery.set("plan", params.planTier);
  }

  const extra = extraQuery.toString();

  return {
    successUrl: `${baseUrl}/unlock?checkout=success&session_id={CHECKOUT_SESSION_ID}${extra ? `&${extra}` : ""}`,
    cancelUrl: `${baseUrl}/unlock?checkout=cancelled${extra ? `&${extra}` : ""}`,
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
  campaignId?: string | null;
  trialPeriodDays?: number | null;
}) {
  return {
    organization_id: params.organizationId,
    user_id: params.userId,
    plan_tier: normalizeBillingPlanTier(params.planTier),
    ...(params.trialPeriodDays ? { trial_period_days: String(params.trialPeriodDays) } : {}),
    ...(params.campaignId ? { campaign_id: params.campaignId } : {}),
  };
}
