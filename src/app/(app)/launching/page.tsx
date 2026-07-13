"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  GHL_DESTINATION_POLL_INTERVAL_MS,
  shouldRetryPendingGhlDestination,
} from "@/lib/ghl-destination-polling";

type ScheduleApiResponse = {
  campaignId?: string;
  scheduleId?: string | null;
  status?: "scheduled";
  scheduledFor?: string;
  timeZone?: string;
  providerMutationPerformed?: boolean;
  activationAuthorization?: {
    authorizationId?: string;
    status?: string;
    approvedDailyBudgetMinor?: number;
    approvedCurrency?: string;
  };
  error?: string;
  code?: string;
};

type LaunchAuthorizationReview = {
  campaignId: string;
  campaignName: string;
  reviewDigest: string;
  scheduledFor: string;
  timeZone: string;
  approvedDailyBudgetMinor: number;
  approvedCurrency: "USD" | "CAD";
  provider: {
    ad_account_id: string;
    account_currency: string;
    page_id: string;
    pixel_id: string;
  };
  creative: {
    selectedAdId: string;
    headline: string;
    imageContentSha256: string;
  };
  destination: {
    type: "website" | "meta_instant_form";
    url: string;
    host: string;
    formDefinitionDigest: string | null;
  };
  delivery: {
    objective: string;
    country_code: string;
    location: string;
    daily_budget_minor: string;
    special_ad_categories: ["HOUSING"];
  };
  providerMutationPerformed: false;
  error?: string;
  code?: string;
};

function compactIdentity(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value;
}

export default function LaunchingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaignId");
  const [review, setReview] = useState<LaunchAuthorizationReview | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "submitting" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [reviewRetryGeneration, setReviewRetryGeneration] = useState(0);
  const approvalReady = Boolean(
    review &&
    review.providerMutationPerformed === false &&
    /^[0-9a-f]{64}$/.test(review.reviewDigest),
  );

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    if (!campaignId) {
      setStatus("error");
      setError("Return to final review and select a campaign.");
      return () => { cancelled = true; };
    }
    setStatus("loading");
    setError(null);
    const loadReview = async (attempt: number): Promise<void> => {
      try {
        const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/schedule-launch`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as LaunchAuthorizationReview | null;
        if (response.ok && data?.reviewDigest && data.providerMutationPerformed === false) {
          if (!cancelled) {
            setReview(data);
            setError(null);
            setStatus("idle");
          }
          return;
        }
        if (shouldRetryPendingGhlDestination({
          status: response.status,
          code: data?.code,
          attempt,
        })) {
          if (!cancelled) {
            setError(data?.error || "Preparing the verified GHL funnel for this campaign…");
            retryTimer = setTimeout(() => {
              void loadReview(attempt + 1);
            }, GHL_DESTINATION_POLL_INTERVAL_MS);
          }
          return;
        }
        throw new Error(
          data?.code === "ghl_destination_pending"
            ? "GHL funnel preparation is still running. Retry this check in a moment."
            : data?.error || "The exact launch authorization review is unavailable.",
        );
      } catch (caughtError) {
        if (!cancelled) {
          setStatus("error");
          setError(caughtError instanceof Error ? caughtError.message : "Launch review failed.");
        }
      }
    };
    void loadReview(0);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [campaignId, reviewRetryGeneration]);

  async function scheduleLaunch() {
    if (!campaignId || !review || !approvalReady || status === "submitting") {
      return;
    }

    setStatus("submitting");
    setError(null);

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/schedule-launch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approvedDailyBudgetMinor: review.approvedDailyBudgetMinor,
            approvedCurrency: review.approvedCurrency,
            reviewDigest: review.reviewDigest,
            confirmation: "SCHEDULE_AND_AUTHORIZE_META_CAMPAIGN_ACTIVATION",
          }),
        },
      );
      const data = (await response.json().catch(() => null)) as ScheduleApiResponse | null;

      if (!response.ok || data?.status !== "scheduled" || !data.scheduledFor) {
        throw new Error(data?.error || "The launch schedule could not be saved.");
      }

      if (data.providerMutationPerformed !== false) {
        throw new Error("The scheduling response did not preserve the no-provider-mutation contract.");
      }
      if (
        data.activationAuthorization?.status !== "authorized" &&
        data.activationAuthorization?.status !== "finalized"
      ) {
        throw new Error("The exact customer activation authorization was not saved.");
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
        {!campaignId || status === "loading" ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
            <Spinner className="size-4" />
            {error || "Loading the exact server-verified authorization contract…"}
          </div>
        ) : !review || !approvalReady ? (
          <div className="space-y-3" role="alert">
            <p className="text-lg font-semibold text-foreground">Campaign unavailable</p>
            <p className="text-sm text-rose-300">
              {error || "Return to final review so the exact daily budget and Meta account currency can be confirmed."}
            </p>
            <Button
              onClick={() => {
                setReview(null);
                setError(null);
                setStatus("loading");
                setReviewRetryGeneration((value) => value + 1);
              }}
              type="button"
              variant="secondary"
            >
              Retry preparation
            </Button>
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
              <p className="max-w-2xl rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-50">
                You are authorizing an exact daily budget of {new Intl.NumberFormat("en-CA", {
                  style: "currency",
                  currency: review.approvedCurrency,
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(review.approvedDailyBudgetMinor / 100)} {review.approvedCurrency}. DealFlow will first
                verify every Meta object in PAUSED state, then may activate only that exact receipted
                campaign at the scheduled window under the configured safety gates.
              </p>
              <dl className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Campaign</dt><dd className="mt-1 font-medium">{review.campaignName}</dd></div>
                <div><dt className="text-muted-foreground">Launch window</dt><dd className="mt-1 font-medium">{new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: review.timeZone }).format(new Date(review.scheduledFor))} ET</dd></div>
                <div><dt className="text-muted-foreground">Meta account</dt><dd className="mt-1 font-mono text-xs">{compactIdentity(review.provider.ad_account_id)}</dd></div>
                <div><dt className="text-muted-foreground">Page / pixel</dt><dd className="mt-1 font-mono text-xs">{compactIdentity(review.provider.page_id)} / {compactIdentity(review.provider.pixel_id)}</dd></div>
                <div><dt className="text-muted-foreground">Creative</dt><dd className="mt-1 font-medium">{review.creative.headline}</dd><dd className="font-mono text-xs text-muted-foreground">{compactIdentity(review.creative.selectedAdId)} · bytes {compactIdentity(review.creative.imageContentSha256)}</dd></div>
                <div><dt className="text-muted-foreground">Destination</dt><dd className="mt-1 font-medium">{review.destination.type === "meta_instant_form" ? "Meta Instant Form" : "GHL website funnel"}</dd><dd className="break-all text-xs text-muted-foreground">{review.destination.url}</dd></div>
                <div><dt className="text-muted-foreground">Audience</dt><dd className="mt-1 font-medium">{review.delivery.location} ({review.delivery.country_code})</dd></div>
                <div><dt className="text-muted-foreground">Delivery contract</dt><dd className="mt-1 font-medium">{review.delivery.objective} · HOUSING</dd></div>
              </dl>
              <p className="max-w-2xl rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
                This click records the schedule and your activation authorization. It does not call
                Meta now and does not mean the campaign is already live, active, or spending.
              </p>
            </div>

            {error ? (
              <p aria-live="assertive" className="text-sm text-rose-300" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              disabled={status === "submitting" || !approvalReady}
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
                "Schedule and authorize launch"
              )}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
