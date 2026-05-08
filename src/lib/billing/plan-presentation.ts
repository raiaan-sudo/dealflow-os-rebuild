import { BILLING_PLANS, type BillingPlanTier } from "@/lib/billing/plans";

export type SelectablePlanTier = Extract<BillingPlanTier, "starter" | "pro">;

export type PlanPresentation = {
  tier: SelectablePlanTier;
  name: string;
  priceLabel: string;
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
    eyebrow: "Operator launch",
    positioning: "Fully covered + self-optimizing",
    summary: "DealFlow keeps the launch fully covered with self-optimizing checks and richer launch guidance.",
    features: [
      "Everything in Starter",
      "Fully covered launch workspace",
      "Self-optimizing campaign checks",
      "Autonomous readiness monitoring",
      "Expanded performance recommendations",
    ],
    footer: "DealFlow monitors and guides the full path",
  },
};

export const SELECTABLE_PLAN_TIERS = ["starter", "pro"] as const;

export function getPlanPresentation(tier: SelectablePlanTier) {
  return PLAN_PRESENTATION[tier];
}
