"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { HelpCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";
import { SUPPORT_CATEGORY_OPTIONS, type SupportCategory } from "@/lib/support/support-categories";

type SupportWidgetProps = {
  activeCampaignId?: string | null;
};

type SupportResponse = {
  success?: boolean;
  ticketId?: string | number | null;
  error?: string;
};

const SUPPORT_UNAVAILABLE_MESSAGE = "Support is temporarily unavailable. Please try again shortly.";
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 4000;

function getVisibleDeploymentId() {
  if (typeof document === "undefined") {
    return null;
  }

  return (
    document.documentElement.getAttribute("data-dpl-id") ||
    document.querySelector("[data-dpl-id]")?.getAttribute("data-dpl-id") ||
    null
  );
}

export function SupportWidget({ activeCampaignId }: SupportWidgetProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryCampaignId = searchParams?.get("campaignId");
  const campaignId = queryCampaignId || activeCampaignId || null;
  const mobileCriticalFlowPaths = [
    "/onboarding",
    "/builder",
    "/build",
    "/paywall",
    "/unlock",
    "/dashboard",
    "/preview",
    "/launch",
    "/launching",
    "/launch-success",
  ];
  const hideFloatingButton = pathname?.startsWith("/campaign-built");
  const hideOnMobileCriticalFlow = mobileCriticalFlowPaths.some((path) => pathname === path || pathname?.startsWith(`${path}/`));
  const compactFloatingButton = [
    "/onboarding",
    "/builder",
    "/build",
    "/paywall",
    "/preview",
    "/dashboard",
    "/launch",
  ].some((path) => pathname === path || pathname?.startsWith(`${path}/`));
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [category, setCategory] = useState<SupportCategory>("contact_support");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const trimmedMessage = message.trim();
  const messageTooShort = trimmedMessage.length > 0 && trimmedMessage.length < MIN_MESSAGE_LENGTH;
  const messageTooLong = message.length > MAX_MESSAGE_LENGTH;
  const submitDisabled =
    pending ||
    trimmedMessage.length < MIN_MESSAGE_LENGTH ||
    trimmedMessage.length > MAX_MESSAGE_LENGTH;
  const campaignContextText = useMemo(() => {
    if (!campaignId) {
      return "No campaign context detected on this page.";
    }

    return `Campaign context will be attached: ${campaignId}`;
  }, [campaignId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  async function handleSubmit() {
    if (submitDisabled) {
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetchWithRetry("/api/support/ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category,
          message: trimmedMessage,
          campaignId,
          context: {
            currentUrl: typeof window !== "undefined" ? window.location.href : null,
            route: pathname,
            pathname,
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
            dataDplId: getVisibleDeploymentId(),
            timestamp: new Date().toISOString(),
          },
        }),
        timeoutMs: 10000,
        retries: 0,
      });

      const data = (await response.json().catch(() => null)) as SupportResponse | null;

      if (!response.ok) {
        throw new Error(data?.error || SUPPORT_UNAVAILABLE_MESSAGE);
      }

      const ticketId = data?.ticketId ? ` Ticket #${data.ticketId} was created.` : "";
      setSuccess(`Support request sent.${ticketId}`);
      setCategory("contact_support");
      setMessage("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : SUPPORT_UNAVAILABLE_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {!hideFloatingButton ? (
        <div
          className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40 ${hideOnMobileCriticalFlow ? "hidden sm:block" : ""}`}
        >
          <Button
            type="button"
            size={compactFloatingButton ? "icon" : "lg"}
            className={compactFloatingButton
              ? "size-11 rounded-full shadow-[0_20px_50px_-24px_rgba(47,128,255,0.75)]"
              : "h-12 rounded-full px-5 text-sm shadow-[0_20px_50px_-24px_rgba(47,128,255,0.75)]"}
            aria-label="Open support"
            onClick={() => {
              setOpen(true);
              setError(null);
              setSuccess(null);
            }}
          >
            <HelpCircle className={compactFloatingButton ? "h-4 w-4" : "mr-2 h-4 w-4"} />
            {compactFloatingButton ? <span className="sr-only">Support</span> : "Support"}
          </Button>
        </div>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end overflow-y-auto bg-black/55 p-4 backdrop-blur-sm sm:items-center sm:justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-dialog-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div className="surface-guided max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-df-panel border border-white/10 p-6 shadow-df-elevated">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="df-eyebrow">Support</p>
                <h3 id="support-dialog-title" className="mt-2 text-2xl font-semibold text-white">
                  How can we help?
                </h3>
                <p className="mt-2 text-sm leading-7 text-white/60">
                  Send a support request with the safe page and campaign context our team needs to troubleshoot.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close support"
                className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-white/75" htmlFor="support-category">
                  Category
                </label>
                <select
                  id="support-category"
                  className="h-12 w-full rounded-df-control border border-white/10 bg-white/[0.045] px-4 text-sm text-white outline-none transition duration-200 focus:border-cyan-200/40 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-200/10"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as SupportCategory)}
                  disabled={pending}
                >
                  {SUPPORT_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} className="bg-[#07111f] text-white" value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-[18px] border border-white/10 bg-white/[0.035] px-4 py-3 text-xs leading-6 text-white/60">
                <span className="font-semibold text-white/75">Context:</span>{" "}
                <span className="break-words">{campaignContextText}</span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm text-white/75" htmlFor="support-message">
                    Message
                  </label>
                  <span className={`text-xs ${messageTooLong ? "text-rose-200" : "text-white/45"}`}>
                    {message.length}/{MAX_MESSAGE_LENGTH}
                  </span>
                </div>
                <textarea
                  id="support-message"
                  className="min-h-36 w-full resize-y rounded-df-control border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none transition duration-200 placeholder:text-white/35 focus:border-cyan-200/40 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-200/10"
                  placeholder="Describe what happened, what you expected, and what page or campaign you were working on."
                  value={message}
                  maxLength={MAX_MESSAGE_LENGTH + 1}
                  onChange={(event) => setMessage(event.target.value)}
                  disabled={pending}
                />
                {messageTooShort ? (
                  <p className="text-xs text-amber-100">Please add at least 10 characters so support has enough context.</p>
                ) : null}
              </div>
            </div>

            {error ? (
              <div className="mt-4 break-words rounded-[18px] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="mt-4 break-words rounded-[18px] border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {success}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSubmit()} disabled={submitDisabled}>
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send support request"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
