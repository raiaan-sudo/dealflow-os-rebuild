"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PortalButton({ label = "Manage billing" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePortal() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
      });

      const data = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;

      if (!response.ok || !data?.url) {
        throw new Error(data?.error ?? "Billing portal could not be opened.");
      }

      window.location.assign(data.url);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Billing portal could not be opened.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" variant="secondary" onClick={handlePortal} disabled={loading}>
        {loading ? "Opening portal..." : label}
      </Button>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
