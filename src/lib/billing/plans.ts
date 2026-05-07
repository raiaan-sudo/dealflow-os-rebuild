export type BillingPlanTier = "starter" | "pro" | "growth";
export type BillingFeature = "meta_launch" | "campaign_data_import" | "autonomy_access";

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
    priceLabel: "$147/mo",
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
  meta_launch: "starter",
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
