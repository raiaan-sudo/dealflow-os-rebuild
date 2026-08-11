"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, KeyRound } from "lucide-react";

export function AccessKeyRevealPanel({
  accessKey,
  deliveryToken,
  sessionId,
}: {
  accessKey: string;
  deliveryToken: string;
  sessionId: string;
}) {
  const [copied, setCopied] = useState(false);
  const [handoffAcknowledged, setHandoffAcknowledged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;

    const acknowledge = async (attempt: number) => {
      try {
        const response = await fetch("/api/access-keys/reveal-ack", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, deliveryToken }),
          keepalive: true,
        });
        if (!response.ok) {
          throw new Error("Access-key reveal acknowledgement failed.");
        }
        if (!cancelled) {
          setHandoffAcknowledged(true);
        }
      } catch {
        if (!cancelled && attempt < 3) {
          retryTimer = window.setTimeout(
            () => void acknowledge(attempt + 1),
            500 * 2 ** attempt,
          );
        }
      }
    };

    void acknowledge(0);
    return () => {
      cancelled = true;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [deliveryToken, sessionId]);

  async function copyKey() {
    await navigator.clipboard.writeText(accessKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-df-panel border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/75">
          Access key
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 rounded-df-control border border-white/10 bg-black/30 px-4 py-3 text-sm text-cyan-50 [overflow-wrap:anywhere]">
            {accessKey}
          </code>
          <button
            type="button"
            onClick={copyKey}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-df-control border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white transition hover:border-cyan-300/35"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-cyan-50/70" aria-live="polite">
          {handoffAcknowledged
            ? "One-time handoff secured. Copy this key before leaving the page."
            : "Securing this one-time handoff. Copy the key now; an interrupted acknowledgement remains recoverable for a bounded retry."}
        </p>
      </div>

      <Link
        href="/login?mode=sign-up"
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-df-control bg-df-primary px-5 text-base font-semibold text-slate-950 shadow-df-button transition hover:-translate-y-0.5"
      >
        <KeyRound className="h-4 w-4" />
        Create account with this key
      </Link>
    </div>
  );
}
