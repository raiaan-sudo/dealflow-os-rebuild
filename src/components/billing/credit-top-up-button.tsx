"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProductI18n } from "@/components/i18n/product-locale-provider";

const TOP_UP_PRESETS_CENTS = [2_500, 5_000, 10_000, 25_000] as const;

export function CreditTopUpButton({
  amountCents = 2500,
  minimumAmountCents = 2500,
  maximumAmountCents = 100000,
  allowAmountSelection = false,
  label,
  disabled = false,
}: {
  amountCents?: number;
  minimumAmountCents?: number;
  maximumAmountCents?: number;
  allowAmountSelection?: boolean;
  label?: string;
  disabled?: boolean;
}) {
  const { currency, t } = useProductI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAmountCents, setSelectedAmountCents] = useState(amountCents);
  const clientRequestIdRef = useRef<string | null>(null);
  const amountIsValid =
    Number.isInteger(selectedAmountCents) &&
    selectedAmountCents >= minimumAmountCents &&
    selectedAmountCents <= maximumAmountCents;

  useEffect(() => {
    setSelectedAmountCents(amountCents);
    clientRequestIdRef.current = null;
  }, [amountCents]);

  function updateAmount(nextAmountCents: number) {
    setSelectedAmountCents(nextAmountCents);
    clientRequestIdRef.current = null;
    setError(null);
  }

  async function handleCheckout() {
    setLoading(true);
    setError(null);

    try {
      const clientRequestId = clientRequestIdRef.current ?? crypto.randomUUID();
      clientRequestIdRef.current = clientRequestId;
      const response = await fetch("/api/billing/credits/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amountCents: selectedAmountCents,
          client_request_id: clientRequestId,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;

      if (!response.ok || !data?.url) {
        throw new Error(t("billing.creditCheckoutError"));
      }

      window.location.assign(data.url);
    } catch {
      setError(t("billing.creditCheckoutError"));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {allowAmountSelection ? (
        <div className="space-y-3">
          <label className="block space-y-2 text-sm font-medium text-foreground">
            <span>{t("billing.topUpAmount")}</span>
            <Input
              type="number"
              min={minimumAmountCents / 100}
              max={maximumAmountCents / 100}
              step={5}
              value={selectedAmountCents / 100}
              onChange={(event) => {
                const dollars = Number(event.target.value);
                updateAmount(Number.isFinite(dollars) ? Math.round(dollars * 100) : 0);
              }}
              disabled={disabled || loading}
              aria-describedby="credit-top-up-range"
            />
          </label>
          <div className="flex flex-wrap gap-2" aria-label={t("billing.topUpPresets")}>
            {TOP_UP_PRESETS_CENTS.filter(
              (preset) => preset >= minimumAmountCents && preset <= maximumAmountCents,
            ).map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={selectedAmountCents === preset ? "default" : "secondary"}
                onClick={() => updateAmount(preset)}
                disabled={disabled || loading}
              >
                {currency(preset / 100, "USD", { maximumFractionDigits: 0 })}
              </Button>
            ))}
          </div>
          <p id="credit-top-up-range" className="text-xs text-muted-foreground">
            {t("billing.topUpRange", {
              minimum: currency(minimumAmountCents / 100, "USD", { maximumFractionDigits: 0 }),
              maximum: currency(maximumAmountCents / 100, "USD", { maximumFractionDigits: 0 }),
            })}
          </p>
        </div>
      ) : null}
      <Button
        type="button"
        onClick={handleCheckout}
        disabled={disabled || loading || !amountIsValid}
      >
        {loading
          ? t("billing.openingCheckout")
          : (label ?? `${t("billing.addCredits")} · ${currency(selectedAmountCents / 100, "USD")}`)}
      </Button>
      {error ? <p className="text-sm text-rose-300" role="alert">{error}</p> : null}
    </div>
  );
}
