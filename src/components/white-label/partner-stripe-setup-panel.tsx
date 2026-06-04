"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type SetupMode = "test" | "live";

type SetupResult = {
  success?: boolean;
  setup?: {
    mode: SetupMode;
    product?: {
      id?: string;
      name?: string;
      livemode?: boolean;
    };
    prices?: {
      performanceBasePriceId?: string;
      immediateLeadChargeAmountCents?: number;
    };
    configWritten?: boolean;
  };
  message?: string;
  error?: string;
  code?: string;
};

function shortId(value: string | null | undefined) {
  if (!value) return "none";
  if (value.length <= 16) return value;
  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

export function PartnerStripeSetupPanel({
  partnerId,
  productName = "EGEN ACCELERATOR",
}: {
  partnerId: string;
  productName?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<SetupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runSetup(mode: SetupMode) {
    setError(null);
    setLastResult(null);

    startTransition(() => {
      void fetch(`/api/admin/partners/${encodeURIComponent(partnerId)}/stripe-setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          productName,
          checkoutHeadline: "EGEN Accelerator",
          performanceLabel: "EGEN Accelerator",
          baseAmountCents: 9700,
          leadAmountCents: 300,
        }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as SetupResult | null;
          if (!response.ok || !payload?.success) {
            throw new Error(payload?.message ?? payload?.error ?? payload?.code ?? "Stripe setup failed.");
          }
          setLastResult(payload);
          router.refresh();
        })
        .catch((caughtError: unknown) => {
          setError(caughtError instanceof Error ? caughtError.message : "Stripe setup failed.");
        });
    });
  }

  return (
    <div className="rounded-df-panel border border-cyan-200/15 bg-cyan-200/10 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/75">Stripe setup</p>
          <p className="mt-2 text-sm leading-6 text-cyan-50">
            Creates or verifies the EGEN product and $97/mo base subscription price inside DealFlow&apos;s Stripe
            account. Qualified leads are configured as immediate $3 saved-card charges handled by DealFlow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => runSetup("test")}
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Setup test Stripe
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => runSetup("live")}
            className="rounded-full bg-df-primary px-4 py-2 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Setup live Stripe
          </button>
        </div>
      </div>

      {isPending ? <p className="mt-3 text-sm text-cyan-100">Creating or verifying Stripe objects...</p> : null}
      {error ? (
        <p className="mt-3 rounded-2xl border border-rose-300/25 bg-rose-400/10 p-3 text-sm text-rose-100">
          {error}
        </p>
      ) : null}
      {lastResult?.setup ? (
        <div className="mt-4 grid gap-2 text-xs text-cyan-50 sm:grid-cols-2">
          <span>Mode: {lastResult.setup.mode}</span>
          <span>Product: {shortId(lastResult.setup.product?.id)}</span>
          <span>Base price: {shortId(lastResult.setup.prices?.performanceBasePriceId)}</span>
          <span>
            Lead charge: $
            {(((lastResult.setup.prices?.immediateLeadChargeAmountCents ?? 300) as number) / 100).toFixed(2)}
          </span>
          <span>Checkout config written: {lastResult.setup.configWritten ? "yes" : "test metadata only"}</span>
        </div>
      ) : null}
    </div>
  );
}
