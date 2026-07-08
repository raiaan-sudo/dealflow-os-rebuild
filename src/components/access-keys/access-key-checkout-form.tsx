"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { BILLING_PLANS, type BillingPlanTier } from "@/lib/billing/plans";

type AccessKeyCheckoutFormProps = {
  partnerSlug?: string | null;
  brandName?: string | null;
};

export function AccessKeyCheckoutForm({
  partnerSlug,
  brandName,
}: AccessKeyCheckoutFormProps) {
  const [planTier, setPlanTier] = useState<BillingPlanTier>("pro");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const selectedPlan = BILLING_PLANS[planTier];
  const selectablePlanTiers = Object.keys(BILLING_PLANS) as BillingPlanTier[];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      const response = await fetch("/api/access-keys/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planTier,
          partnerSlug: partnerSlug || undefined,
          buyerEmail: buyerEmail || undefined,
          buyerName: buyerName || undefined,
        }),
      });
      const payload = await response.json().catch(() => null) as { url?: string; error?: string } | null;

      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Checkout could not be started.");
      }

      window.location.assign(payload.url);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Checkout could not be started.");
      setIsPending(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-3 sm:grid-cols-3">
        {selectablePlanTiers.map((tier) => {
          const plan = BILLING_PLANS[tier];
          const selected = planTier === tier;
          return (
            <button
              key={tier}
              type="button"
              onClick={() => setPlanTier(tier)}
              className={[
                "min-h-[150px] rounded-df-panel border p-4 text-left transition",
                selected
                  ? "border-cyan-300/60 bg-cyan-300/[0.09] text-white"
                  : "border-white/10 bg-white/[0.035] text-white/75 hover:border-cyan-300/35",
              ].join(" ")}
              aria-pressed={selected}
            >
              <p className="text-sm font-semibold text-white">{plan.name}</p>
              <p className="mt-1 text-sm text-cyan-100">{plan.priceLabel}</p>
              <p className="mt-3 text-xs leading-5 text-white/58">
                Paid access key for the {plan.name} workspace tier.
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-sm text-white/70">Name</span>
          <input
            value={buyerName}
            onChange={(event) => setBuyerName(event.target.value)}
            placeholder="Alex Morgan"
            className="h-12 w-full rounded-df-control border border-white/10 bg-white/[0.045] px-4 text-white outline-none placeholder:text-white/35 focus:border-cyan-200/40"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm text-white/70">Email</span>
          <input
            type="email"
            value={buyerEmail}
            onChange={(event) => setBuyerEmail(event.target.value)}
            placeholder="you@company.com"
            className="h-12 w-full rounded-df-control border border-white/10 bg-white/[0.045] px-4 text-white outline-none placeholder:text-white/35 focus:border-cyan-200/40"
          />
        </label>
      </div>

      {error ? (
        <div className="rounded-df-control border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-df-control bg-df-primary px-5 text-base font-semibold text-slate-950 shadow-df-button transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        {isPending ? "Starting checkout" : `Pay for ${brandName ?? "DealFlow"} ${selectedPlan.name}`}
      </button>
    </form>
  );
}
