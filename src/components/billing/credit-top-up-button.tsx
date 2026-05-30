"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CreditTopUpButton({
  amountCents = 1000,
  label = "Add credits",
}: {
  amountCents?: number;
  label?: string;
}) {
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
        throw new Error(data?.error ?? "Credit checkout could not be started.");
      }

      window.location.assign(data.url);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Credit checkout could not be started.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" onClick={handleCheckout} disabled={loading}>
        {loading ? "Opening checkout..." : label}
      </Button>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
