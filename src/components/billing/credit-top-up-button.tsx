"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useProductI18n } from "@/components/i18n/product-locale-provider";

export function CreditTopUpButton({
  amountCents = 2500,
  label,
  disabled = false,
}: {
  amountCents?: number;
  label?: string;
  disabled?: boolean;
}) {
  const { t } = useProductI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/billing/credits/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amountCents }),
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
      <Button type="button" onClick={handleCheckout} disabled={disabled || loading}>
        {loading ? t("billing.openingCheckout") : (label ?? t("billing.addCredits"))}
      </Button>
      {error ? <p className="text-sm text-rose-300" role="alert">{error}</p> : null}
    </div>
  );
}
