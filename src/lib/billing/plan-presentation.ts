import {
  BILLING_PLANS,
  SELF_SERVE_TRIAL_PERIOD_DAYS,
  type BillingPlanTier,
} from "@/lib/billing/plans";

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

function priceAfterTrialLabel(priceLabel: string) {
  return `${priceLabel} after ${SELF_SERVE_TRIAL_PERIOD_DAYS}-day free trial`;
}

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
      "Same guided launch access as Starter with a lower monthly base and qualified leads billed on your Stripe invoice.",
    features: [
      "Guided campaign setup",
      "Offer-led funnel and creative preview",
      "Recommended optimization checklist",
      "Meta readiness and launch gates",
      "Spam, duplicate, test, and invalid leads are not billed",
      "Lead usage appears on your Stripe invoice",
    ],
    footer: "Lower base, usage tied to qualified leads",
  },
  starter: {
    tier: "starter",
    name: BILLING_PLANS.starter.name,
    priceLabel: priceAfterTrialLabel(BILLING_PLANS.starter.priceLabel),
    recurringPriceLabel: BILLING_PLANS.starter.priceLabel,
    checkoutCtaLabel: `Start ${SELF_SERVE_TRIAL_PERIOD_DAYS}-day free trial`,
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
    priceLabel: priceAfterTrialLabel(BILLING_PLANS.pro.priceLabel),
    recurringPriceLabel: BILLING_PLANS.pro.priceLabel,
    checkoutCtaLabel: `Start ${SELF_SERVE_TRIAL_PERIOD_DAYS}-day free trial`,
    eyebrow: "Operator launch",
    positioning: "Fully covered + self-optimizing",
    summary: "DealFlow keeps the launch fully covered with self-optimizing checks and richer launch guidance.",
    features: [
      "Everything in Starter",
      "Unlimited active campaigns",
      "Fully covered launch workspace",
      "Self-optimizing campaign checks",
      "Autonomous readiness monitoring",
      "Expanded performance recommendations",
    ],
    footer: "DealFlow monitors and guides the full path",
  },
};

export const SELECTABLE_PLAN_TIERS = ["performance", "starter", "pro"] as const;

export function getPlanPresentation(tier: SelectablePlanTier) {
  return PLAN_PRESENTATION[tier];
}
