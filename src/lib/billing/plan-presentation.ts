import {
  BILLING_PLANS,
  type BillingPlanTier,
} from "@/lib/billing/plans";
import {
  getPartnerPlanConfig,
  getPartnerPlanLabel,
  type PartnerPricingConfig,
} from "@/lib/white-label/partner-billing-config";

export type SelectablePlanTier = Extract<BillingPlanTier, "starter" | "pro">;

export type PlanPresentation = {
  tier: SelectablePlanTier;
  name: string;
  priceLabel: string;
  recurringPriceLabel: string;
  checkoutCtaLabel: string;
  eyebrow: string;
  positioning: string;
  summary: string;
  features: string[];
  footer: string;
};

export const PLAN_PRESENTATION: Record<SelectablePlanTier, PlanPresentation> = {
  starter: {
    tier: "starter",
    name: BILLING_PLANS.starter.name,
    priceLabel: BILLING_PLANS.starter.priceLabel,
    recurringPriceLabel: BILLING_PLANS.starter.priceLabel,
    checkoutCtaLabel: "Start Starter",
    eyebrow: "Guided launch",
    positioning: "Recommended optimization",
    summary: "DealFlow maps the optimizations while you approve and apply each next step.",
    features: [
      "Guided campaign setup",
      "Offer-led funnel and creative preview",
      "Recommended optimization checklist",
      "Campaign readiness and GHL handoff",
      "You approve and apply each step",
    ],
    footer: "Guided by DealFlow, executed by you",
  },
  pro: {
    tier: "pro",
    name: BILLING_PLANS.pro.name,
    priceLabel: BILLING_PLANS.pro.priceLabel,
    recurringPriceLabel: BILLING_PLANS.pro.priceLabel,
    checkoutCtaLabel: "Get started now",
    eyebrow: "Operator launch",
    positioning: "Only launch plan",
    summary: "DealFlow builds the campaign workspace, launch checks, creative review, and operator guidance under one monthly plan.",
    features: [
      "Guided campaign setup",
      "Offer-led funnel and creative preview",
      "Campaign readiness and GHL handoff",
      "Selected creative review before launch",
      "Operator launch workspace",
      "Unlimited active campaigns",
      "Autonomous readiness monitoring",
    ],
    footer: "One plan for launch access",
  },
};

export const SELECTABLE_PLAN_TIERS = ["pro"] as const satisfies readonly SelectablePlanTier[];

export function getPlanPresentation(tier: SelectablePlanTier) {
  return PLAN_PRESENTATION[tier];
}

export function getPlanPresentationsForPartner(
  pricing: PartnerPricingConfig | null | undefined,
): Record<SelectablePlanTier, PlanPresentation> {
  if (!pricing) {
    return PLAN_PRESENTATION;
  }

  return (Object.keys(PLAN_PRESENTATION) as SelectablePlanTier[]).reduce(
    (presentations, tier) => {
      const defaultPlan = PLAN_PRESENTATION[tier];
      const partnerPlan = getPartnerPlanConfig(pricing, tier);
      const partnerLabel = getPartnerPlanLabel(pricing, tier);

      presentations[tier] = {
        ...defaultPlan,
        name: partnerLabel ?? defaultPlan.name,
        checkoutCtaLabel: defaultPlan.checkoutCtaLabel,
        summary:
          partnerPlan?.label || pricing.displayProductName
            ? defaultPlan.summary.replace("DealFlow", pricing.checkoutHeadline ?? pricing.displayProductName ?? "DealFlow")
            : defaultPlan.summary,
      };
      return presentations;
    },
    {} as Record<SelectablePlanTier, PlanPresentation>,
  );
}
