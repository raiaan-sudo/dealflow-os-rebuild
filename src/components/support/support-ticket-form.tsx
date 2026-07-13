"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";

export function SupportTicketForm() {
  const [issue, setIssue] = useState("");
  const [blocker, setBlocker] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetchWithRetry("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          confusedText: issue,
          blockerText: blocker,
          page: "/support",
        }),
        timeoutMs: 7_000,
        retries: 1,
      });
      const payload = await response.json().catch(() => null) as {
        error?: string;
        correlationId?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Your support request could not be recorded.");
      }

      const reference = payload?.correlationId?.slice(0, 8);
      setMessage(
        reference
          ? `Your request was recorded. Reference ${reference}.`
          : "Your request was recorded.",
      );
      setIssue("");
      setBlocker("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your support request could not be recorded.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">What do you need help with?</span>
        <textarea
          className="min-h-32 w-full rounded-df-control border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
          value={issue}
          onChange={(event) => setIssue(event.target.value)}
          maxLength={4_000}
          required={!blocker.trim()}
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">What is blocked?</span>
        <textarea
          className="min-h-28 w-full rounded-df-control border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
          value={blocker}
          onChange={(event) => setBlocker(event.target.value)}
          maxLength={4_000}
          required={!issue.trim()}
        />
      </label>
      <p className="text-sm leading-6 text-muted-foreground">
        Replies use the verified email on your signed-in DealFlow account. We do not store a second
        email address on the support ticket.
      </p>

      {message ? <p className="text-sm text-emerald-300" role="status">{message}</p> : null}
      {error ? <p className="text-sm text-rose-300" role="alert">{error}</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        {pending ? "Recording request..." : "Submit support request"}
      </Button>
    </form>
  );
}
