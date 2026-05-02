"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";

type LeadCaptureFormProps = {
  campaignId: string;
  funnelSlug: string;
  formFields: string[];
  cta: string;
  metaPixelId?: string | null;
};

const SMS_CONSENT_COPY =
  "By checking this box, I agree to receive SMS messages from DealFlow OS and/or the business operating this campaign about my inquiry, follow-ups, and appointment coordination. Message and data rates may apply. Message frequency may vary. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
const TURNSTILE_SCRIPT_ID = "cloudflare-turnstile-script";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

function includesField(fields: string[], needle: string) {
  return fields.some((field) => field.toLowerCase().includes(needle));
}

export function LeadCaptureForm({
  campaignId,
  funnelSlug,
  formFields,
  cta,
  metaPixelId,
}: LeadCaptureFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [formStartedAt] = useState(() => Date.now());
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const pageViewTrackedRef = useRef(false);
  const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY);

  const normalizedFields = useMemo(
    () => formFields.map((field) => field.trim()).filter(Boolean),
    [formFields],
  );
  const hasConfiguredEmailField = includesField(normalizedFields, "email");
  const showPhone = includesField(normalizedFields, "phone");
  const showEmail = hasConfiguredEmailField || !showPhone;

  useEffect(() => {
    if (!metaPixelId || pageViewTrackedRef.current) {
      return;
    }
    const intervalId = window.setInterval(() => {
      if (typeof window.fbq !== "function" || pageViewTrackedRef.current) {
        return;
      }

      window.fbq("init", metaPixelId);
      window.fbq("track", "PageView");
      pageViewTrackedRef.current = true;
      window.clearInterval(intervalId);
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [metaPixelId]);

  useEffect(() => {
    const siteKey = TURNSTILE_SITE_KEY;

    if (!siteKey || !turnstileContainerRef.current || turnstileWidgetIdRef.current) {
      return;
    }

    function renderTurnstile(siteKey: string) {
      if (!window.turnstile || !turnstileContainerRef.current || turnstileWidgetIdRef.current) {
        return;
      }

      turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: siteKey,
        callback: setTurnstileToken,
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => setTurnstileToken(""),
      });
    }

    const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID);
    if (existingScript) {
      const renderExistingTurnstile = () => renderTurnstile(siteKey);
      renderExistingTurnstile();
      existingScript.addEventListener("load", renderExistingTurnstile, { once: true });
      return () => existingScript.removeEventListener("load", renderExistingTurnstile);
    }

    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    const renderNewTurnstile = () => renderTurnstile(siteKey);
    script.addEventListener("load", renderNewTurnstile, { once: true });
    document.head.appendChild(script);

    return () => script.removeEventListener("load", renderNewTurnstile);
  }, []);

  function resetTurnstile() {
    if (!turnstileWidgetIdRef.current) {
      return;
    }

    setTurnstileToken("");
    window.turnstile?.reset(turnstileWidgetIdRef.current);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedEmail = email.trim();
    const normalizedPhone = phone.trim();

    if (!normalizedName) {
      setStatus("error");
      setMessage("Please provide your name");
      return;
    }

    if (!normalizedEmail && !normalizedPhone) {
      setStatus("error");
      setMessage("Please provide email or phone");
      return;
    }

    if (normalizedPhone && !smsConsent) {
      setStatus("error");
      setMessage("Please check the SMS consent box so we can text you about this request.");
      return;
    }

    if (turnstileEnabled && !turnstileToken) {
      setStatus("error");
      setMessage("Please complete the verification challenge.");
      return;
    }

    setStatus("submitting");
    setMessage(null);

    try {
      const response = await fetch("/api/lead-capture", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          campaign_id: campaignId,
          funnel_id: funnelSlug,
          name: normalizedName,
          email: showEmail ? normalizedEmail || undefined : undefined,
          phone: showPhone ? normalizedPhone || undefined : undefined,
          sms_consent: Boolean(showPhone && normalizedPhone && smsConsent),
          sms_consent_copy: SMS_CONSENT_COPY,
          stage: "launched",
          company_website: "",
          formStartedAt,
          turnstile_token: turnstileToken || undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; lead_id?: string; id?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Lead capture failed.");
      }

      const leadId = data?.lead_id ?? data?.id ?? null;

      if (metaPixelId && leadId && typeof window.fbq === "function") {
        window.fbq("track", "Lead", { campaign_id: campaignId }, { eventID: leadId });
      }

      setStatus("success");
      setMessage("Thanks. Your details were received and the team can follow up now.");
      setName("");
      setEmail("");
      setPhone("");
      setSmsConsent(false);
      resetTurnstile();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Lead capture failed.");
      resetTurnstile();
    }
  }

  return (
    <>
      {metaPixelId ? (
        <>
          <Script id="meta-pixel-base" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');`}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              height="1"
              src={`https://www.facebook.com/tr?id=${encodeURIComponent(metaPixelId)}&ev=PageView&noscript=1`}
              style={{ display: "none" }}
              width="1"
            />
          </noscript>
        </>
      ) : null}
      <form className="space-y-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-6" onSubmit={handleSubmit}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
          Get Started
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
          Tell us where to send your next steps
        </h2>
      </div>

      <label className="block space-y-2">
        <span className="text-sm text-white/70">Name</span>
        <input
          className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none"
          onChange={(event) => {
            setName(event.target.value);
            if (message) {
              setMessage(null);
              setStatus("idle");
            }
          }}
          required
          value={name}
        />
      </label>

      {showEmail ? (
        <label className="block space-y-2">
          <span className="text-sm text-white/70">Email</span>
          <input
            className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none"
            onChange={(event) => {
              setEmail(event.target.value);
              if (message) {
                setMessage(null);
                setStatus("idle");
              }
            }}
            type="email"
            value={email}
          />
        </label>
      ) : null}

      {showPhone ? (
        <div className="space-y-3">
          <label className="block space-y-2">
            <span className="text-sm text-white/70">Phone</span>
            <input
              className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none"
              onChange={(event) => {
                setPhone(event.target.value);
                if (message) {
                  setMessage(null);
                  setStatus("idle");
                }
              }}
              type="tel"
              value={phone}
            />
          </label>
          <label className="flex gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-white/62">
            <input
              checked={smsConsent}
              className="mt-1 size-4 shrink-0 accent-primary"
              onChange={(event) => {
                setSmsConsent(event.target.checked);
                if (message) {
                  setMessage(null);
                  setStatus("idle");
                }
              }}
              required={Boolean(phone.trim())}
              type="checkbox"
            />
            <span>{SMS_CONSENT_COPY}</span>
          </label>
        </div>
      ) : null}

      {message ? (
        <div
          className={`rounded-2xl border p-3 text-sm ${
            status === "success"
              ? "border-primary/20 bg-primary/10 text-primary"
              : "border-red-500/20 bg-red-500/10 text-red-200"
          }`}
        >
          {message}
        </div>
      ) : null}

      {turnstileEnabled ? (
        <div
          ref={turnstileContainerRef}
          className="min-h-[65px] overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-2"
        />
      ) : null}

      <button
        className="h-12 w-full rounded-2xl bg-primary px-4 text-base font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
        disabled={status === "submitting"}
        type="submit"
      >
        {status === "submitting" ? "Submitting..." : cta}
      </button>
      <p className="text-xs leading-relaxed text-white/45">
        By submitting, you agree to be contacted about this request. SMS is only sent
        when you explicitly consent above. See our{" "}
        <a className="text-primary underline-offset-4 hover:underline" href="/privacy">
          Privacy Policy
        </a>{" "}
        and{" "}
        <a className="text-primary underline-offset-4 hover:underline" href="/terms">
          Terms
        </a>
        .
      </p>
      </form>
    </>
  );
}
