"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useProductI18n } from "@/components/i18n/product-locale-provider";

export function PortalButton({ label }: { label?: string }) {
  const { t } = useProductI18n();
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
        throw new Error(t("billing.portalError"));
      }

      window.location.assign(data.url);
    } catch {
      setError(t("billing.portalError"));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" variant="secondary" onClick={handlePortal} disabled={loading}>
        {loading ? t("billing.openingPortal") : (label ?? t("billing.manage"))}
      </Button>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
