"use client";

import { useMemo, useState } from "react";

type LeadCaptureFormProps = {
  campaignId: string;
  funnelSlug: string;
  formFields: string[];
  cta: string;
};

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
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

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
          stage: "launched",
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
            value={phone}
          />
        </label>
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
    </form>
  );
}
