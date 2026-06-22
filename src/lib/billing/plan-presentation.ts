import {
  BILLING_PLANS,
  type BillingPlanTier,
} from "@/lib/billing/plans";
import {
  getPartnerPlanConfig,
  getPartnerPlanLabel,
  type PartnerPricingConfig,
} from "@/lib/white-label/partner-billing-config";

export type SelectablePlanTier = Extract<BillingPlanTier, "performance" | "starter" | "pro">;

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
  performance: {
    tier: "performance",
    name: BILLING_PLANS.performance.name,
    priceLabel: BILLING_PLANS.performance.priceLabel,
    recurringPriceLabel: BILLING_PLANS.performance.priceLabel,
    checkoutCtaLabel: "Start Performance checkout",
    eyebrow: "Lower base + usage",
    positioning: "Best first launch option",
    summary:
      "Same guided launch access as Starter with a lower monthly base and qualified leads charged immediately to your saved payment method.",
    features: [
      "Guided campaign setup",
      "Offer-led funnel and creative preview",
      "Recommended optimization checklist",
      "Meta readiness and launch gates",
      "Spam, duplicate, test, and invalid leads are not billed",
      "Qualified leads are charged immediately at $3 each",
    ],
    footer: "Lower base, immediate lead charges",
  },
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
      "Meta readiness and launch gates",
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
      "Meta readiness and launch gates",
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
        checkoutCtaLabel:
          tier === "performance" && partnerLabel
            ? `Start ${partnerLabel} checkout`
            : defaultPlan.checkoutCtaLabel,
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
