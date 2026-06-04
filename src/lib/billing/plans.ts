export type BillingPlanTier = "performance" | "starter" | "pro" | "growth";
export type BillingFeature = "meta_launch" | "campaign_data_import" | "autonomy_access";
export type CampaignLimitPolicy = {
  includedActiveCampaigns: number | null;
  canRequestAdditionalSlots: boolean;
  label: string;
};

export const SELF_SERVE_TRIAL_PERIOD_DAYS = 7;
export const PERFORMANCE_BASE_AMOUNT_CENTS = 9700;
export const PERFORMANCE_LEAD_UNIT_AMOUNT_CENTS = 300;
export const PERFORMANCE_LEAD_METER_EVENT_NAME = "dealflow_billable_lead";
export const PERFORMANCE_LEAD_BILLING_MODEL = "base_plus_immediate_lead_charge";

export const BILLING_PLANS: Record<
  BillingPlanTier,
  {
    name: string;
    priceLabel: string;
    rank: number;
  }
> = {
  performance: {
    name: "Performance",
    priceLabel: "$97/mo + $3/qualified lead charged immediately",
    rank: 1,
  },
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
  performance: {
    includedActiveCampaigns: 1,
    canRequestAdditionalSlots: false,
    label: "1 active guided campaign",
  },
  starter: {
    includedActiveCampaigns: 1,
    canRequestAdditionalSlots: false,
    label: "1 active guided campaign",
  },
  pro: {
    includedActiveCampaigns: null,
    canRequestAdditionalSlots: false,
    label: "Unlimited active campaigns",
  },
  growth: {
    includedActiveCampaigns: null,
    canRequestAdditionalSlots: false,
    label: "Unlimited active campaigns",
  },
};

export function normalizeBillingPlanTier(value: unknown): BillingPlanTier {
  switch (value) {
    case "performance":
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

export function getSelfServeTrialPeriodDays(planTier: BillingPlanTier) {
  return planTier === "starter" || planTier === "pro" ? SELF_SERVE_TRIAL_PERIOD_DAYS : null;
}

export function canCreateAdditionalCampaign(params: {
  planTier: BillingPlanTier;
  activeCampaignCount: number;
}) {
  const policy = getCampaignLimitPolicy(params.planTier);
  if (policy.includedActiveCampaigns === null) {
    return true;
  }

  return params.activeCampaignCount < policy.includedActiveCampaigns;
}
