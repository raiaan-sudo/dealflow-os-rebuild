"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const REASONS = [
  { value: "not_provided", label: "I would rather not say" },
  { value: "too_expensive", label: "It is too expensive right now" },
  { value: "not_enough_leads", label: "I have not seen enough lead volume yet" },
  { value: "campaign_paused", label: "My campaign is paused or no longer needed" },
  { value: "missing_features", label: "I need something DealFlow does not have yet" },
  { value: "switched_provider", label: "I switched to another provider" },
  { value: "temporary_pause", label: "This is a temporary pause" },
  { value: "other", label: "Other" },
];

async function openStripePortal() {
  const response = await fetch("/api/billing/portal", {
    method: "POST",
  });
  const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;

  if (!response.ok || !data?.url) {
    throw new Error(data?.error ?? "Billing portal could not be opened.");
  }

  window.location.assign(data.url);
}

export function CancellationIntentForm() {
  const [reasonCode, setReasonCode] = useState("not_provided");
  const [reasonDetail, setReasonDetail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setLoading(true);
    setError(null);

    try {
      await fetch("/api/billing/cancellation-intent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          reasonCode,
          reasonDetail: reasonDetail.trim() || undefined,
        }),
      }).catch(() => null);

      await openStripePortal();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Billing portal could not be opened.");
      setLoading(false);
    }
  }

  async function handleSkip() {
    setLoading(true);
    setError(null);

    try {
      await openStripePortal();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Billing portal could not be opened.");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.035] p-4">
      <p className="mb-4 text-sm leading-6 text-muted-foreground">
        Use this only if you intend to manage or cancel billing in Stripe. Sharing the reason first gives support a recovery signal, but it never blocks access to Stripe Portal.
      </p>
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium text-foreground" htmlFor="billing-cancel-reason">
            Before Stripe opens, what is the main reason?
          </label>
          <select
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-foreground outline-none focus:border-cyan-200/35 focus:ring-2 focus:ring-cyan-200/15"
            disabled={loading}
            id="billing-cancel-reason"
            onChange={(event) => setReasonCode(event.target.value)}
            value={reasonCode}
          >
            {REASONS.map((reason) => (
              <option className="bg-[#07111f] text-white" key={reason.value} value={reason.value}>
                {reason.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground" htmlFor="billing-cancel-detail">
            Optional detail
          </label>
          <textarea
            aria-describedby="billing-cancel-detail-help"
            className="mt-2 min-h-24 w-full resize-y rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-cyan-200/35 focus:ring-2 focus:ring-cyan-200/15"
            disabled={loading}
            id="billing-cancel-detail"
            maxLength={500}
            onChange={(event) => setReasonDetail(event.target.value)}
            placeholder="One sentence is enough."
            value={reasonDetail}
          />
          <p id="billing-cancel-detail-help" className="mt-2 text-xs leading-5 text-muted-foreground">
            Do not include card numbers, passwords, or private credentials.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Button type="button" onClick={handleContinue} disabled={loading}>
          {loading ? "Opening Stripe Portal..." : "Continue to Stripe Portal"}
        </Button>
        <Button type="button" variant="secondary" onClick={handleSkip} disabled={loading}>
          Skip reason
        </Button>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Stripe Portal remains the cancellation and payment-method surface. This short note helps DealFlow understand churn without delaying access to Stripe.
      </p>
      {error ? <p className="mt-3 text-sm text-rose-300" aria-live="assertive">{error}</p> : null}
    </div>
  );
}
