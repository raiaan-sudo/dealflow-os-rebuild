export type BillingPlanTier = "starter" | "pro" | "growth";
export type BillingFeature = "meta_launch" | "campaign_data_import" | "autonomy_access";

/**
 * DealFlow has one acquisition plan. Starter and Growth remain in the type
 * system only so already-paid legacy subscriptions can be reconciled without
 * silently changing their entitlements.
 */
export const NEW_CHECKOUT_PLAN_TIER = "pro" as const;
export type NewCheckoutPlanTier = typeof NEW_CHECKOUT_PLAN_TIER;
export const GRANDFATHERED_PLAN_TIERS = ["starter", "growth"] as const;

export function isNewCheckoutPlanTier(value: unknown): value is NewCheckoutPlanTier {
  return value === NEW_CHECKOUT_PLAN_TIER;
}

export function isGrandfatheredPlanTier(
  value: unknown,
): value is (typeof GRANDFATHERED_PLAN_TIERS)[number] {
  return GRANDFATHERED_PLAN_TIERS.includes(
    value as (typeof GRANDFATHERED_PLAN_TIERS)[number],
  );
}

export const BILLING_PLANS: Record<
  BillingPlanTier,
  {
    name: string;
    priceLabel: string;
    rank: number;
  }
> = {
  starter: {
    name: "Starter",
    priceLabel: "$97/mo",
    rank: 1,
  },
  pro: {
    name: "Pro",
    priceLabel: "$297/mo",
    rank: 2,
  },
  growth: {
    name: "Growth",
    priceLabel: "$497/mo",
    rank: 3,
  },
};

const FEATURE_MIN_PLAN: Record<BillingFeature, BillingPlanTier> = {
  meta_launch: "pro",
  campaign_data_import: "growth",
  autonomy_access: "pro",
};

export function normalizeBillingPlanTier(value: unknown): BillingPlanTier {
  switch (value) {
    case "pro":
    case "growth":
    case "starter":
      return value;
    default:
      return "starter";
  }
}

export function hasFeatureAccess(planTier: BillingPlanTier, feature: BillingFeature) {
  return BILLING_PLANS[planTier].rank >= BILLING_PLANS[FEATURE_MIN_PLAN[feature]].rank;
}
