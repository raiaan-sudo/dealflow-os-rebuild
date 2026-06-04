import type Stripe from "stripe";
import { getPublicAppUrl, getStripeEnv } from "@/lib/env";
import { getStripeBillingProvider } from "@/lib/integrations/stripe/provider";
import {
  PERFORMANCE_LEAD_BILLING_MODEL,
  PERFORMANCE_LEAD_METER_EVENT_NAME,
  PERFORMANCE_LEAD_UNIT_AMOUNT_CENTS,
  normalizeBillingPlanTier,
  type BillingPlanTier,
} from "@/lib/billing/plans";
import {
  getPartnerMeterEventName,
  getPartnerPlanConfig,
  getPartnerPlanLabel,
  type PartnerPricingConfig,
} from "@/lib/white-label/partner-billing-config";

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
  partnerProductName: string | null;
  partnerPlanLabel: string | null;
  partnerPriceIds: Record<string, string>;
};

export function getStripePlanPriceConfiguration(
  planTier: BillingPlanTier,
  partnerPricing?: PartnerPricingConfig | null,
): StripePlanPriceConfiguration | null {
  const partnerPlan = getPartnerPlanConfig(partnerPricing, planTier);

  if (partnerPlan && planTier === "performance") {
    if (!partnerPlan.basePriceId) {
      return partnerPricing?.allowDefaultDealFlowPrices
        ? getStripePlanPriceConfiguration(planTier, null)
        : null;
    }

    const priceIds = [partnerPlan.basePriceId];
    const partnerPriceIds: Record<string, string> = {
      performance_base: partnerPlan.basePriceId,
    };
    if (partnerPlan.meteredLeadPriceId) {
      partnerPriceIds.performance_metered_lead_legacy = partnerPlan.meteredLeadPriceId;
    }

    return {
      planTier,
      primaryPriceId: partnerPlan.basePriceId,
      meteredPriceId: partnerPlan.meteredLeadPriceId ?? null,
      priceIds,
      priceSignature: `${priceIds.slice().sort().join("+")}:${PERFORMANCE_LEAD_BILLING_MODEL}`,
      lineItems: [{ price: partnerPlan.basePriceId, quantity: 1 }],
      meterEventName: getPartnerMeterEventName(partnerPlan),
      partnerProductName: partnerPricing?.displayProductName ?? null,
      partnerPlanLabel: getPartnerPlanLabel(partnerPricing, planTier),
      partnerPriceIds,
    };
  }

  if (partnerPlan && planTier !== "growth") {
    if (!partnerPlan.priceId) {
      return partnerPricing?.allowDefaultDealFlowPrices
        ? getStripePlanPriceConfiguration(planTier, null)
        : null;
    }

    return {
      planTier,
      primaryPriceId: partnerPlan.priceId,
      meteredPriceId: null,
      priceIds: [partnerPlan.priceId],
      priceSignature: partnerPlan.priceId,
      lineItems: [{ price: partnerPlan.priceId, quantity: 1 }],
      meterEventName: null,
      partnerProductName: partnerPricing?.displayProductName ?? null,
      partnerPlanLabel: getPartnerPlanLabel(partnerPricing, planTier),
      partnerPriceIds: {
        [planTier]: partnerPlan.priceId,
      },
    };
  }

  if (partnerPricing && !partnerPricing.allowDefaultDealFlowPrices && planTier !== "growth") {
    return null;
  }

  const env = getStripeEnv();

  if (!env) {
    return null;
  }

  if (planTier === "performance") {
    if (!env.performanceBasePriceId) {
      return null;
    }

    const priceIds = [env.performanceBasePriceId];
    const partnerPriceIds: Record<string, string> = {};
    if (env.performanceLeadPriceId) {
      partnerPriceIds.performance_metered_lead_legacy = env.performanceLeadPriceId;
    }

    return {
      planTier,
      primaryPriceId: env.performanceBasePriceId,
      meteredPriceId: env.performanceLeadPriceId ?? null,
      priceIds,
      priceSignature: `${priceIds.slice().sort().join("+")}:${PERFORMANCE_LEAD_BILLING_MODEL}`,
      lineItems: [{ price: env.performanceBasePriceId, quantity: 1 }],
      meterEventName: env.performanceLeadMeterEventName || PERFORMANCE_LEAD_METER_EVENT_NAME,
      partnerProductName: null,
      partnerPlanLabel: null,
      partnerPriceIds,
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
    partnerProductName: null,
    partnerPlanLabel: null,
    partnerPriceIds: {},
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

export function getPartnerPlanTierFromSubscriptionPriceIds(params: {
  priceIds: string[];
  metadata: Stripe.Metadata | Record<string, string | undefined>;
}) {
  const partnerId = params.metadata.partner_id?.trim();
  const metadataTier = normalizeBillingPlanTier(params.metadata.internal_plan_tier || params.metadata.plan_tier);
  if (!partnerId || metadataTier === "growth") {
    return null;
  }

  const priceSet = new Set(params.priceIds.filter(Boolean));
  const metadataPriceIds = (params.metadata.partner_price_ids ?? "")
    .split(",")
    .map((priceId) => priceId.trim())
    .filter(Boolean);

  if (!metadataPriceIds.length || !metadataPriceIds.every((priceId) => priceSet.has(priceId))) {
    return null;
  }

  if (metadataTier === "performance" && metadataPriceIds.length < 1) {
    return null;
  }

  return metadataTier;
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
  partnerProductName?: string | null;
  partnerPlanLabel?: string | null;
  partnerPriceIds?: string[] | null;
  commissionRateSnapshot?: number | null;
}) {
  return {
    organization_id: params.organizationId,
    user_id: params.userId,
    plan_tier: normalizeBillingPlanTier(params.planTier),
    internal_plan_tier: normalizeBillingPlanTier(params.planTier),
    partner_id: params.partnerId ?? "",
    partner_slug: params.partnerSlug ?? "",
    partner_attribution_source: params.partnerAttributionSource ?? "native",
    partner_product_name: params.partnerProductName ?? "",
    partner_plan_label: params.partnerPlanLabel ?? "",
    partner_price_ids: params.partnerPriceIds?.join(",") ?? "",
    billing_model:
      normalizeBillingPlanTier(params.planTier) === "performance"
        ? PERFORMANCE_LEAD_BILLING_MODEL
        : "licensed_subscription",
    lead_charge_amount_cents:
      normalizeBillingPlanTier(params.planTier) === "performance"
        ? String(PERFORMANCE_LEAD_UNIT_AMOUNT_CENTS)
        : "",
    commission_rate_snapshot:
      typeof params.commissionRateSnapshot === "number" && Number.isFinite(params.commissionRateSnapshot)
        ? String(params.commissionRateSnapshot)
        : "",
    ...(params.trialPeriodDays ? { trial_period_days: String(params.trialPeriodDays) } : {}),
    ...(params.campaignId ? { campaign_id: params.campaignId } : {}),
  };
}
