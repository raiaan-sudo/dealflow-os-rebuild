"use client";

import { useMemo, useState } from "react";

type LeadCaptureFormProps = {
  campaignId: string;
  funnelSlug: string;
  formFields: string[];
  cta: string;
};

const SMS_CONSENT_COPY =
  "By checking this box, I agree to receive SMS messages from DealFlow OS and/or the business operating this campaign about my inquiry, follow-ups, and appointment coordination. Message and data rates may apply. Message frequency may vary. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.";

function includesField(fields: string[], needle: string) {
  return fields.some((field) => field.toLowerCase().includes(needle));
}

export function LeadCaptureForm({
  campaignId,
  funnelSlug,
  formFields,
  cta,
}: LeadCaptureFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [formStartedAt] = useState(() => Date.now());

  const normalizedFields = useMemo(
    () => formFields.map((field) => field.trim()).filter(Boolean),
    [formFields],
  );
  const hasConfiguredEmailField = includesField(normalizedFields, "email");
  const showPhone = includesField(normalizedFields, "phone");
  const showEmail = hasConfiguredEmailField || !showPhone;

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
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Lead capture failed.");
      }

      setStatus("success");
      setMessage("Thanks. Your details were received and the team can follow up now.");
      setName("");
      setEmail("");
      setPhone("");
      setSmsConsent(false);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Lead capture failed.");
    }
  }

  return (
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
  );
}
