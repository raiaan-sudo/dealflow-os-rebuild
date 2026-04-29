"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";
import {
  consumePendingLeadCapture,
  GLOBAL_LEAD_CAPTURE_SCOPE,
  hasHandledLeadCapture,
  LEAD_CAPTURE_EVENT,
  markLeadCaptureHandled,
  queueLeadCapture,
  type LeadCaptureStage,
} from "@/lib/lead-capture";

type LeadCaptureTriggerProps = {
  defaultName: string;
  defaultEmail: string;
};

function getStageMessage(stage: LeadCaptureStage) {
  if (stage === "launched") {
    return "Your campaign is live. If you want help tightening the first launch, leave your details and we can follow up.";
  }

  if (stage === "generated") {
    return "Your campaign is ready. If you want help getting it live, leave your details and we can follow up.";
  }

  return "Your campaign is taking shape. If you want help getting the first launch over the line, leave your details and we can follow up.";
}

export function LeadCaptureTrigger({
  defaultName,
  defaultEmail,
}: LeadCaptureTriggerProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState<LeadCaptureStage | null>(null);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const generatedQueuedRef = useRef(false);
  const submitAbortRef = useRef<AbortController | null>(null);
  const submitTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setName((current) => current || defaultName);
  }, [defaultName]);

  useEffect(() => {
    setEmail((current) => current || defaultEmail);
  }, [defaultEmail]);

  useEffect(() => {
    if (
      pathname === "/campaign" &&
      searchParams.get("activated") === "1" &&
      !generatedQueuedRef.current &&
      !hasHandledLeadCapture(GLOBAL_LEAD_CAPTURE_SCOPE, "generated")
    ) {
      generatedQueuedRef.current = true;
      queueLeadCapture(GLOBAL_LEAD_CAPTURE_SCOPE, "generated");
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    function openFromPending() {
      const pendingStage = consumePendingLeadCapture(GLOBAL_LEAD_CAPTURE_SCOPE);

      if (!pendingStage) {
        return;
      }

      setStage(pendingStage);
      setError(null);
      setSuccess(null);
      setOpen(true);
    }

    openFromPending();

    const handleOpen = () => openFromPending();
    window.addEventListener(LEAD_CAPTURE_EVENT, handleOpen);

    return () => {
      window.removeEventListener(LEAD_CAPTURE_EVENT, handleOpen);
    };
  }, [pathname, searchParams]);

  useEffect(() => {
    return () => {
      submitAbortRef.current?.abort();

      if (submitTimeoutRef.current !== null) {
        window.clearTimeout(submitTimeoutRef.current);
      }
    };
  }, []);

  async function handleSubmit() {
    if (pending || !stage) {
      return;
    }

    if (!name.trim() || !email.trim()) {
      setError("Add your name and email so we can follow up.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    const abortController = new AbortController();
    submitAbortRef.current = abortController;
    submitTimeoutRef.current = window.setTimeout(() => {
      abortController.abort();
    }, 3000);

    try {
      const response = await fetchWithRetry("/api/lead-capture", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: abortController.signal,
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          stage,
        }),
        timeoutMs: 3000,
        retries: 1,
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error || "We couldn’t save your details right now.");
      }

      markLeadCaptureHandled(GLOBAL_LEAD_CAPTURE_SCOPE, stage);
      setSuccess("Thanks. We have your details and can help you launch.");
      window.setTimeout(() => {
        setOpen(false);
        setSuccess(null);
      }, 1000);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error && caughtError.name === "AbortError"
          ? "Something went wrong — please try again."
          : caughtError instanceof Error
            ? caughtError.message
            : "Something went wrong — please try again.",
      );
    } finally {
      if (submitTimeoutRef.current !== null) {
        window.clearTimeout(submitTimeoutRef.current);
        submitTimeoutRef.current = null;
      }

      submitAbortRef.current = null;
      setPending(false);
    }
  }

  function handleClose() {
    submitAbortRef.current?.abort();

    if (submitTimeoutRef.current !== null) {
      window.clearTimeout(submitTimeoutRef.current);
      submitTimeoutRef.current = null;
    }

    if (stage) {
      markLeadCaptureHandled(GLOBAL_LEAD_CAPTURE_SCOPE, stage);
    }

    setPending(false);
    setOpen(false);
    setError(null);
    setSuccess(null);
  }

  if (!open || !stage) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/55 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="surface-guided w-full max-w-md rounded-df-panel border border-white/10 p-6 shadow-df-elevated">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold tracking-[-0.04em] text-white">
              Want help getting your first campaign live?
            </h3>
            <p className="mt-2 text-sm leading-7 text-white/60">{getStageMessage(stage)}</p>
          </div>
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/70 transition hover:bg-white/[0.08] hover:text-white"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-white/75" htmlFor="lead-capture-name">
              Name
            </label>
            <Input
              id="lead-capture-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jordan Walker"
              className="h-12"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-white/75" htmlFor="lead-capture-email">
              Email
            </label>
            <Input
              id="lead-capture-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@team.com"
              className="h-12"
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

        {pending ? (
          <div className="mt-4 rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
            Saving your details now. If this takes longer than a few seconds, you can close this and try again.
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Close
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Help Me Launch"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
