"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";

export function FeedbackWidget() {
  const pathname = usePathname();
  const hideFloatingButton = pathname?.startsWith("/campaign-built");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [confusedText, setConfusedText] = useState("");
  const [blockerText, setBlockerText] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit() {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetchWithRetry("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confusedText,
          blockerText,
          email,
          page: pathname,
        }),
        timeoutMs: 7000,
        retries: 1,
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error || "We couldn’t send your feedback right now.");
      }

      setSuccess("Thanks. Your feedback was recorded.");
      setConfusedText("");
      setBlockerText("");
      setEmail("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "We couldn’t send your feedback right now.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {!hideFloatingButton ? (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-[calc(env(safe-area-inset-right)+1rem)] z-40">
          <Button
            type="button"
            size="lg"
            className="size-14 rounded-full p-0 shadow-[0_20px_50px_-24px_rgba(47,128,255,0.75)] sm:h-12 sm:w-auto sm:px-5 sm:text-sm"
            aria-label="Send feedback"
            onClick={() => {
              setOpen(true);
              setError(null);
              setSuccess(null);
            }}
          >
            <MessageSquare className="h-5 w-5 sm:mr-2 sm:h-4 sm:w-4" />
            <span className="sr-only sm:not-sr-only">Feedback</span>
          </Button>
        </div>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end overflow-y-auto bg-black/55 p-4 backdrop-blur-sm sm:items-center sm:justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-dialog-title"
        >
          <div className="surface-guided max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-df-panel border border-white/10 p-6 shadow-df-elevated">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="df-eyebrow">
                  Early feedback
                </p>
                <h3 id="feedback-dialog-title" className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
                  Tell us what felt off
                </h3>
                <p className="mt-2 text-sm leading-7 text-white/60">
                  This won’t interrupt your flow. We use it to tighten the product quickly during testing.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close feedback"
                className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-white/75" htmlFor="feedback-confused">
                  What confused you?
                </label>
                <textarea
                  id="feedback-confused"
                  className="min-h-28 w-full rounded-df-control border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none transition duration-200 placeholder:text-white/35 focus:border-cyan-200/40 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-200/10"
                  placeholder="Anything unclear, surprising, or harder than it should be."
                  value={confusedText}
                  onChange={(event) => setConfusedText(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-white/75" htmlFor="feedback-blocker">
                  What would stop you from using this?
                </label>
                <textarea
                  id="feedback-blocker"
                  className="min-h-28 w-full rounded-df-control border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none transition duration-200 placeholder:text-white/35 focus:border-cyan-200/40 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-200/10"
                  placeholder="Anything missing, risky, or not believable enough."
                  value={blockerText}
                  onChange={(event) => setBlockerText(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-white/75" htmlFor="feedback-email">
                  Email (optional)
                </label>
                <input
                  id="feedback-email"
                  type="email"
                  className="h-12 w-full rounded-df-control border border-white/10 bg-white/[0.045] px-4 text-sm text-white outline-none transition duration-200 placeholder:text-white/35 focus:border-cyan-200/40 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-200/10"
                  placeholder="you@team.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-[18px] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="mt-4 rounded-[18px] border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {success}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                Close
              </Button>
              <Button type="button" onClick={() => void handleSubmit()} disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send feedback"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
