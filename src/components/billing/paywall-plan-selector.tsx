"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { CheckoutButton } from "@/components/billing/checkout-button";
import type { BillingPlanTier } from "@/lib/billing/plans";
import { BILLING_PLANS } from "@/lib/billing/plans";

type SelectablePlanTier = Extract<BillingPlanTier, "starter" | "pro">;

const PLAN_FEATURES: Record<SelectablePlanTier, string[]> = {
  starter: [
    "Guided campaign builder",
    "Offer-led funnel preview",
    "Static creative test set",
    "Meta connection and launch gates",
    "Manual launch approval controls",
  ],
  pro: [
    "Everything in Starter",
    "Priority launch workspace",
    "Advanced creative and funnel controls",
    "Autonomous operator readiness checks",
    "Expanded optimization reporting",
  ],
};

const PLAN_SUMMARY: Record<SelectablePlanTier, string> = {
  starter: "Best for agents who want a guided campaign launch without autonomous operator controls.",
  pro: "Best for agents who want the full launch room, richer controls, and ongoing optimization signals.",
};

export function PaywallPlanSelector({
  initialPlanTier,
  campaignId,
  disabled = false,
}: {
  initialPlanTier: SelectablePlanTier;
  campaignId: string | null;
  disabled?: boolean;
}) {
  const [selectedTier, setSelectedTier] = useState<SelectablePlanTier>(initialPlanTier);
  const selectedPlan = BILLING_PLANS[selectedTier];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        {(["starter", "pro"] as const).map((tier) => {
          const plan = BILLING_PLANS[tier];
          const selected = selectedTier === tier;

          return (
            <button
              key={tier}
              type="button"
              onClick={() => setSelectedTier(tier)}
              className={[
                "group relative flex min-h-[360px] flex-col rounded-[28px] border p-5 text-left transition duration-200",
                "hover:-translate-y-1 hover:border-cyan-300/45 hover:bg-cyan-300/[0.055] hover:shadow-[0_28px_90px_-44px_rgba(34,211,238,0.55)]",
                selected
                  ? "border-cyan-300/55 bg-cyan-300/[0.08] shadow-[0_26px_80px_-48px_rgba(34,211,238,0.8)]"
                  : "border-white/10 bg-white/[0.035]",
              ].join(" ")}
              aria-pressed={selected}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/75">
                    {tier === "starter" ? "Guided launch" : "Operator launch"}
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                    {plan.name}
                  </h3>
                  <p className="mt-1 text-lg font-semibold text-cyan-100">{plan.priceLabel}</p>
                </div>
                <span
                  className={[
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full border transition",
                    selected
                      ? "border-cyan-300 bg-cyan-300 text-slate-950"
                      : "border-white/15 bg-white/[0.03] text-white/40 group-hover:text-cyan-100",
                  ].join(" ")}
                >
                  {selected ? <Check className="h-4 w-4" /> : null}
                </span>
              </div>

              <p className="mt-4 text-sm leading-6 text-white/68">{PLAN_SUMMARY[tier]}</p>

              <div className="mt-5 space-y-3">
                {PLAN_FEATURES[tier].map((feature) => (
                  <div key={feature} className="flex gap-3 text-sm leading-6 text-white/76">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-cyan-200" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              {tier === "pro" ? (
                <div className="mt-auto pt-5">
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">
                    Recommended
                  </span>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="rounded-[24px] border border-cyan-300/16 bg-cyan-300/[0.055] p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/75">
              Selected plan
            </p>
            <p className="mt-1 text-lg font-semibold text-white">
              {selectedPlan.name} · {selectedPlan.priceLabel}
            </p>
          </div>
          {disabled ? (
            <button
              type="button"
              disabled
              className="rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white/45"
            >
              Build preview first
            </button>
          ) : (
            <CheckoutButton
              campaignId={campaignId}
              planTier={selectedTier}
              label={`Activate ${selectedPlan.name}`}
              className="sm:min-w-[220px]"
              buttonClassName="w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}
