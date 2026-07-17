"use client";

import { useEffect, useRef, useState } from "react";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PRIVACY_REQUEST_COPY } from "@/lib/i18n/privacy-request-copy";

type RequestType = "access" | "correction" | "export";
type PrivacyRequest = {
  id: string;
  requestType: RequestType;
  state: string;
  acceptedAt: string;
};

export function PrivacyRequestCard() {
  const { locale } = useProductI18n();
  const copy = PRIVACY_REQUEST_COPY[locale];
  const [available, setAvailable] = useState<boolean | null>(null);
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [requestType, setRequestType] = useState<RequestType>("access");
  const [correctionDetails, setCorrectionDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/privacy/requests", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("status unavailable");
        const payload = (await response.json()) as {
          available?: boolean;
          requests?: PrivacyRequest[];
        };
        if (!active) return;
        setAvailable(payload.available === true);
        setRequests(Array.isArray(payload.requests) ? payload.requests : []);
      })
      .catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, []);

  async function submit() {
    setSubmitting(true);
    setMessage(null);
    try {
      idempotencyKey.current ??= `privacy:${crypto.randomUUID()}`;
      const response = await fetch("/api/privacy/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType,
          idempotencyKey: idempotencyKey.current,
          correctionDetails: requestType === "correction" ? correctionDetails : undefined,
        }),
      });
      const payload = (await response.json()) as { request?: PrivacyRequest };
      if (!response.ok || !payload.request) throw new Error("request failed");
      setRequests((current) => [payload.request!, ...current.filter((item) => item.id !== payload.request!.id)]);
      idempotencyKey.current = null;
      setCorrectionDetails("");
      setMessage(copy.requestAccepted);
    } catch {
      setMessage(copy.requestFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-5 sm:p-7">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{copy.eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold">{copy.title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.body}</p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.recentAal2}</p>

      {available === false ? (
        <p role="status" className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-sm text-amber-100">
          {copy.unavailable}
        </p>
      ) : (
        <div className="mt-5 grid max-w-xl gap-4">
          <label className="grid gap-2 text-sm font-medium">
            {copy.requestType}
            <select
              className="h-11 rounded-xl border border-border bg-background px-3 text-foreground"
              value={requestType}
              onChange={(event) => setRequestType(event.target.value as RequestType)}
            >
              <option value="access">{copy.access}</option>
              <option value="correction">{copy.correction}</option>
              <option value="export">{copy.export}</option>
            </select>
          </label>
          {requestType === "correction" ? (
            <label className="grid gap-2 text-sm font-medium">
              {copy.correctionDetails}
              <textarea
                className="min-h-28 rounded-xl border border-border bg-background p-3 text-foreground"
                maxLength={2_000}
                placeholder={copy.correctionPlaceholder}
                value={correctionDetails}
                onChange={(event) => setCorrectionDetails(event.target.value)}
              />
            </label>
          ) : null}
          <Button
            type="button"
            disabled={available !== true || submitting || (requestType === "correction" && correctionDetails.trim().length < 3)}
            onClick={() => void submit()}
          >
            {submitting ? copy.submitting : copy.submit}
          </Button>
          {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
        </div>
      )}

      {requests.length ? (
        <div className="mt-6 border-t border-white/8 pt-5">
          <h3 className="text-sm font-semibold">{copy.history}</h3>
          <ul className="mt-3 divide-y divide-white/8">
            {requests.map((request) => (
              <li key={request.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span>{copy[request.requestType]}</span>
                <span className="text-muted-foreground">{copy.states[request.state] ?? request.state}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
