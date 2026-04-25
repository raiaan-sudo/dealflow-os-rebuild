"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";

type PreviewActionsProps = {
  connectHref?: string;
  campaignId?: string | null;
};

export function PreviewActions({ connectHref = "/launch", campaignId = null }: PreviewActionsProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function completePreview() {
    setSubmitting(true);
    setError("");

    try {
      const response = await fetchWithRetry("/api/preview/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ campaignId }),
        timeoutMs: 10000,
        retries: 0,
      });

      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || data.success !== true) {
        throw new Error(data.error || "We could not open the next step.");
      }

      const nextUrl = new URL(connectHref, window.location.origin);

      if (campaignId) {
        nextUrl.searchParams.set("campaignId", campaignId);
      }

      window.location.assign(nextUrl.pathname + nextUrl.search);
    } catch (completionError) {
      setError(
        completionError instanceof Error
          ? completionError.message
          : "We could not open the next step.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center space-y-4 text-center">
      <div className="flex w-full max-w-[320px] justify-center">
        <Button
          className="h-13 w-full rounded-full bg-[#2f80ff] px-6 text-base font-semibold text-white shadow-[0_26px_70px_-28px_rgba(47,128,255,0.95)] hover:bg-[#3d8bff] sm:h-14"
          onClick={completePreview}
          disabled={submitting}
        >
          {submitting ? "Opening Account Connection..." : "Go to Account Connection"}
        </Button>
      </div>
      <p className="max-w-[560px] text-sm text-muted-foreground">
        This opens account and domain setup. Launch comes after those checks are ready.
      </p>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
