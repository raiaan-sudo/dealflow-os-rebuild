export type BillingPlanTier = "starter" | "pro" | "growth";
export type BillingFeature = "meta_launch" | "campaign_data_import" | "autonomy_access";
export type CampaignLimitPolicy = {
  includedActiveCampaigns: number;
  canRequestAdditionalSlots: boolean;
  label: string;
};

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

export const CAMPAIGN_LIMITS: Record<BillingPlanTier, CampaignLimitPolicy> = {
  starter: {
    includedActiveCampaigns: 1,
    canRequestAdditionalSlots: false,
    label: "1 active guided campaign",
  },
  pro: {
    includedActiveCampaigns: 3,
    canRequestAdditionalSlots: true,
    label: "Up to 3 active campaigns",
  },
  growth: {
    includedActiveCampaigns: 10,
    canRequestAdditionalSlots: true,
    label: "Up to 10 active campaigns",
  },
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

export function getCampaignLimitPolicy(planTier: BillingPlanTier) {
  return CAMPAIGN_LIMITS[normalizeBillingPlanTier(planTier)];
}

export function canCreateAdditionalCampaign(params: {
  planTier: BillingPlanTier;
  activeCampaignCount: number;
}) {
  const policy = getCampaignLimitPolicy(params.planTier);
  return params.activeCampaignCount < policy.includedActiveCampaigns;
}
