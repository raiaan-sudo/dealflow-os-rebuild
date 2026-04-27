"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { syncCampaignStatus } from "@/components/campaign/launch/launch-runtime-api";

export function MetaSyncRefreshButton({
  label = "Refresh Meta status",
}: {
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRefresh() {
    setError(null);

    startTransition(() => {
      void syncCampaignStatus()
        .then(() => {
          router.refresh();
        })
        .catch((nextError: unknown) => {
          setError(nextError instanceof Error ? nextError.message : "Meta status could not be refreshed.");
        });
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" onClick={handleRefresh} disabled={isPending}>
        {isPending ? "Refreshing Meta status..." : label}
      </Button>
      {error ? <p className="text-sm text-amber-100">{error}</p> : null}
    </div>
  );
}
