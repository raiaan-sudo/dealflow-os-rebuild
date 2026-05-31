import { getPublicAppUrl, getStripeEnv } from "@/lib/env";
import { getStripeBillingProvider } from "@/lib/integrations/stripe/provider";
import {
  PERFORMANCE_LEAD_METER_EVENT_NAME,
  normalizeBillingPlanTier,
  type BillingPlanTier,
} from "@/lib/billing/plans";

export function getStripeClient() {
  return getStripeBillingProvider().getClient();
}

export function getStripePriceId(planTier: BillingPlanTier) {
  const env = getStripeEnv();

  if (!env) {
    return null;
  }

  if (planTier === "performance") {
    return env.performanceBasePriceId ?? null;
  }

  if (planTier === "growth") {
    return env.growthPriceId ?? null;
  }

  if (planTier === "pro") {
    return env.proPriceId;
  }

  return env.starterPriceId;
}

export type StripePlanPriceConfiguration = {
  planTier: BillingPlanTier;
  primaryPriceId: string;
  meteredPriceId: string | null;
  priceIds: string[];
  priceSignature: string;
  lineItems: Array<{ price: string; quantity?: number }>;
  meterEventName: string | null;
};

export function getStripePlanPriceConfiguration(
  planTier: BillingPlanTier,
): StripePlanPriceConfiguration | null {
  const env = getStripeEnv();

  if (!env) {
    return null;
  }

  if (planTier === "performance") {
    if (!env.performanceBasePriceId || !env.performanceLeadPriceId) {
      return null;
    }

    const priceIds = [env.performanceBasePriceId, env.performanceLeadPriceId];
    return {
      planTier,
      primaryPriceId: env.performanceBasePriceId,
      meteredPriceId: env.performanceLeadPriceId,
      priceIds,
      priceSignature: priceIds.slice().sort().join("+"),
      lineItems: [
        { price: env.performanceBasePriceId, quantity: 1 },
        { price: env.performanceLeadPriceId },
      ],
      meterEventName: env.performanceLeadMeterEventName || PERFORMANCE_LEAD_METER_EVENT_NAME,
    };
  }

  const priceId = getStripePriceId(planTier);
  if (!priceId) {
    return null;
  }

  return {
    planTier,
    primaryPriceId: priceId,
    meteredPriceId: null,
    priceIds: [priceId],
    priceSignature: priceId,
    lineItems: [{ price: priceId, quantity: 1 }],
    meterEventName: null,
  };
}

export function getPlanTierFromPriceId(priceId?: string | null): BillingPlanTier | null {
  const env = getStripeEnv();

  if (!env || !priceId) {
    return null;
  }

  if (env.growthPriceId && priceId === env.growthPriceId) {
    return "growth";
  }

  if (env.performanceBasePriceId && priceId === env.performanceBasePriceId) {
    return "performance";
  }

  if (priceId === env.proPriceId) {
    return "pro";
  }

  if (priceId === env.starterPriceId) {
    return "starter";
  }

  return null;
}

export function getPlanTierFromSubscriptionPriceIds(priceIds: string[]) {
  const env = getStripeEnv();

  if (!env) {
    return null;
  }

  const priceSet = new Set(priceIds.filter(Boolean));
  if (env.performanceBasePriceId && priceSet.has(env.performanceBasePriceId)) {
    if (!env.performanceLeadPriceId || !priceSet.has(env.performanceLeadPriceId)) {
      return null;
    }

    return "performance" satisfies BillingPlanTier;
  }

  const configuredTiers: BillingPlanTier[] = ["growth", "pro", "starter"];
  for (const tier of configuredTiers) {
    const priceId = getStripePriceId(tier);
    if (priceId && priceSet.has(priceId)) {
      return tier;
    }
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
  partnerId?: string | null;
  partnerSlug?: string | null;
  partnerAttributionSource?: string | null;
}) {
  return {
    organization_id: params.organizationId,
    user_id: params.userId,
    plan_tier: normalizeBillingPlanTier(params.planTier),
    partner_id: params.partnerId ?? "",
    partner_slug: params.partnerSlug ?? "",
    partner_attribution_source: params.partnerAttributionSource ?? "native",
    ...(params.trialPeriodDays ? { trial_period_days: String(params.trialPeriodDays) } : {}),
    ...(params.campaignId ? { campaign_id: params.campaignId } : {}),
  };
}
