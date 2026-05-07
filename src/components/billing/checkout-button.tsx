"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CheckoutButton({
  planTier = "starter",
  campaignId = null,
  label = "Activate to launch",
  className,
  buttonClassName,
}: {
  planTier?: "starter" | "pro" | "growth";
  campaignId?: string | null;
  label?: string;
  className?: string;
  buttonClassName?: string;
}) {
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
        body: JSON.stringify({ planTier, ...(campaignId ? { campaignId } : {}) }),
      });

      const data = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;

      if (!response.ok || !data?.url) {
        throw new Error(data?.error ?? "Checkout could not be started.");
      }

      window.location.assign(data.url);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Checkout could not be started.");
      setLoading(false);
    }
  }

  return (
    <div className={["space-y-3", className].filter(Boolean).join(" ")}>
      <Button type="button" onClick={handleCheckout} disabled={loading} className={buttonClassName}>
        {loading ? "Opening checkout..." : label}
      </Button>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
