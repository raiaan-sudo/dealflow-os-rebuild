"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type ScheduleApiResponse = {
  campaignId?: string;
  scheduleId?: string | null;
  status?: "scheduled";
  scheduledFor?: string;
  timeZone?: string;
  providerMutationPerformed?: boolean;
  error?: string;
};

export default function LaunchingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaignId");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function scheduleLaunch() {
    if (!campaignId || status === "submitting") {
      return;
    }

    setStatus("submitting");
    setError(null);

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/schedule-launch`,
        { method: "POST" },
      );
      const data = (await response.json().catch(() => null)) as ScheduleApiResponse | null;

      if (!response.ok || data?.status !== "scheduled" || !data.scheduledFor) {
        throw new Error(data?.error || "The launch schedule could not be saved.");
      }

      if (data.providerMutationPerformed !== false) {
        throw new Error("The scheduling response did not preserve the no-provider-mutation contract.");
      }

      const params = new URLSearchParams({ campaignId });
      if (data.scheduleId) {
        params.set("scheduleId", data.scheduleId);
      }
      router.replace(`/launch-success?${params.toString()}`);
    } catch (caughtError) {
      setStatus("error");
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The launch schedule could not be saved.",
      );
    }
  }

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-8">
      <PageHeader
        eyebrow="Launch schedule"
        title="Schedule campaign launch"
        description="New campaigns are queued for the next 9:00 a.m. Eastern window using America/New_York daylight-saving rules. Scheduling does not create or activate Meta objects."
      />

      <Card className="p-6 sm:p-8">
        {!campaignId ? (
          <div className="space-y-3" role="alert">
            <p className="text-lg font-semibold text-foreground">Campaign unavailable</p>
            <p className="text-sm text-rose-300">A campaign identifier is required.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">
              Confirmation required
            </div>
            <div className="space-y-3">
              <p className="text-lg font-semibold text-foreground">
                Queue the next eligible launch window
              </p>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                If today&apos;s 9:00 a.m. Eastern window has passed, the campaign is queued for
                9:00 a.m. Eastern tomorrow. No weekend or holiday restriction is invented.
              </p>
              <p className="max-w-2xl rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
                This records a durable schedule only. It is not a provider receipt and does not
                mean the campaign is live, active, or spending.
              </p>
            </div>

            {error ? (
              <p aria-live="assertive" className="text-sm text-rose-300" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              disabled={status === "submitting"}
              onClick={() => void scheduleLaunch()}
              type="button"
            >
              {status === "submitting" ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Saving schedule...
                </>
              ) : status === "error" ? (
                "Retry schedule"
              ) : (
                "Schedule for 9:00 a.m. Eastern"
              )}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
