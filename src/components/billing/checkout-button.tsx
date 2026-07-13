"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useProductI18n } from "@/components/i18n/product-locale-provider";

export function CheckoutButton({
  label,
}: {
  label?: string;
}) {
  const { t } = useProductI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ planTier: "pro" }),
      });

      const data = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;

      if (!response.ok || !data?.url) {
        throw new Error(t("billing.checkoutError"));
      }

      window.location.assign(data.url);
    } catch {
      setError(t("billing.checkoutError"));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" onClick={handleCheckout} disabled={loading}>
        {loading ? t("billing.openingCheckout") : (label ?? t("billing.activate"))}
      </Button>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
