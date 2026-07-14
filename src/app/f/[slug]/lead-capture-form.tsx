"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { normalizePublicFunnelLanguage } from "@/lib/public-funnel-language";

type LeadCaptureFormProps = {
  campaignId: string;
  funnelSlug: string;
  formFields: string[];
  customQuestions?: string[];
  cta: string;
  language?: string | null;
  metaPixelId?: string | null;
};

const SMS_CONSENT_COPY =
  "By checking this box, I agree to receive SMS messages from DealFlow OS and/or the business operating this campaign about my inquiry, follow-ups, and appointment coordination. Message and data rates may apply. Message frequency may vary. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.";
const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_LEAD_TURNSTILE_SITE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ||
  "";

const FORM_COPY = {
  en: {
    eyebrow: "Get Started",
    title: "Tell us where to send your options",
    name: "Name",
    email: "Email",
    phone: "Phone Number",
    consent: SMS_CONSENT_COPY,
    submitting: "Submitting...",
    validationName: "Please provide your name",
    validationEmail: "Please provide your email",
    validationPhone: "Please provide your phone number",
    validationConsent: "Please check the SMS consent box so we can text you about this request.",
    validationQuestions: "Please answer every qualification question.",
    delayed: "Lead capture is temporarily delayed. Please try again shortly.",
    failed: "Lead capture failed.",
    humanVerification: "Human verification",
    disclaimerPrefix:
      "By submitting, you agree to be contacted about this request. SMS is only sent when you explicitly consent above. See our",
    privacy: "Privacy Policy",
    and: "and",
    terms: "Terms",
  },
  fr: {
    eyebrow: "Commencer",
    title: "Dites-nous où envoyer votre évaluation",
    name: "Nom",
    email: "Courriel",
    phone: "Numéro de téléphone",
    consent:
      "En cochant cette case, j'accepte de recevoir des messages SMS de DealFlow OS et/ou de l'entreprise qui gère cette campagne au sujet de ma demande, des suivis et de la coordination d'un rendez-vous. Des frais de messagerie et de données peuvent s'appliquer. La fréquence des messages peut varier. Répondez STOP pour vous désabonner ou HELP pour obtenir de l'aide. Le consentement n'est pas une condition d'achat.",
    submitting: "Envoi...",
    validationName: "Veuillez inscrire votre nom",
    validationEmail: "Veuillez inscrire votre courriel",
    validationPhone: "Veuillez inscrire votre numéro de téléphone",
    validationConsent: "Veuillez cocher la case de consentement SMS afin que nous puissions vous texter au sujet de cette demande.",
    validationQuestions: "Veuillez répondre à chaque question de qualification.",
    delayed: "La demande est temporairement retardée. Veuillez réessayer sous peu.",
    failed: "La demande n'a pas pu être envoyée.",
    humanVerification: "Vérification humaine",
    disclaimerPrefix:
      "En soumettant ce formulaire, vous acceptez d'être contacté au sujet de cette demande. Les SMS sont envoyés seulement lorsque vous y consentez explicitement ci-dessus. Consultez notre",
    privacy: "Politique de confidentialité",
    and: "et nos",
    terms: "Conditions",
  },
  es: {
    eyebrow: "Comenzar",
    title: "Díganos dónde enviarle sus opciones",
    name: "Nombre",
    email: "Correo electrónico",
    phone: "Número de teléfono",
    consent:
      "Al marcar esta casilla, acepto recibir mensajes SMS de DealFlow OS y/o de la empresa que opera esta campaña sobre mi solicitud, seguimientos y coordinación de citas. Pueden aplicarse tarifas de mensajes y datos. La frecuencia puede variar. Responda STOP para cancelar o HELP para obtener ayuda. El consentimiento no es condición de compra.",
    submitting: "Enviando...",
    validationName: "Indique su nombre",
    validationEmail: "Indique su correo electrónico",
    validationPhone: "Indique su número de teléfono",
    validationConsent: "Marque la casilla de consentimiento SMS para que podamos escribirle sobre esta solicitud.",
    validationQuestions: "Responda todas las preguntas de calificación.",
    delayed: "La solicitud está temporalmente demorada. Inténtelo nuevamente en breve.",
    failed: "No se pudo enviar la solicitud.",
    humanVerification: "Verificación humana",
    disclaimerPrefix:
      "Al enviar, acepta que se comuniquen con usted sobre esta solicitud. Los SMS solo se envían cuando da su consentimiento explícito arriba. Consulte nuestra",
    privacy: "Política de privacidad",
    and: "y",
    terms: "Términos",
  },
} as const;

function getFormCopy(language?: string | null) {
  return FORM_COPY[normalizePublicFunnelLanguage(language)];
}

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
    dealflowLeadTurnstileVerified?: (token: string) => void;
    dealflowLeadTurnstileExpired?: () => void;
  }
}

function includesField(fields: string[], needle: string) {
  return fields.some((field) => field.toLowerCase().includes(needle));
}

function getCurrentPageAttribution() {
  const url = new URL(window.location.href);

  return {
    landingPageUrl: url.toString(),
    utmSource: url.searchParams.get("utm_source") || undefined,
    utmMedium: url.searchParams.get("utm_medium") || undefined,
    utmCampaign: url.searchParams.get("utm_campaign") || url.searchParams.get("utm_id") || undefined,
    adId: url.searchParams.get("ad_id") || url.searchParams.get("utm_content") || undefined,
  };
}

function waitForMetaPixelDispatch() {
  return new Promise((resolve) => window.setTimeout(resolve, 350));
}

function recordBrowserPixelAttempt(params: {
  leadId: string;
  campaignId: string;
  pixelId: string;
}) {
  const payload = JSON.stringify({
    lead_id: params.leadId,
    campaign_id: params.campaignId,
    pixel_id: params.pixelId,
    event_id: params.leadId,
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/api/lead-tracking/browser-pixel", blob);
    return;
  }

  void fetch("/api/lead-tracking/browser-pixel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: payload,
    keepalive: true,
  }).catch(() => null);
}

export function LeadCaptureForm({
  campaignId,
  funnelSlug,
  formFields,
  customQuestions = [],
  cta,
  language,
  metaPixelId,
}: LeadCaptureFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [formStartedAt] = useState(() => Date.now());
  const pageViewTrackedRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const normalizedLanguage = normalizePublicFunnelLanguage(language);
  const copy = getFormCopy(normalizedLanguage);

  const normalizedFields = useMemo(
    () => formFields.map((field) => field.trim()).filter(Boolean),
    [formFields],
  );
  const normalizedCustomQuestions = useMemo(
    () =>
      Array.from(
        new Set(customQuestions.map((question) => question.trim()).filter(Boolean)),
      ).slice(0, 3),
    [customQuestions],
  );
  const hasConfiguredEmailField = includesField(normalizedFields, "email");
  const showPhone = includesField(normalizedFields, "phone");
  const showEmail = hasConfiguredEmailField || !showPhone;

  useEffect(() => {
    window.dealflowLeadTurnstileVerified = (token) => setTurnstileToken(token);
    window.dealflowLeadTurnstileExpired = () => setTurnstileToken("");
    return () => {
      delete window.dealflowLeadTurnstileVerified;
      delete window.dealflowLeadTurnstileExpired;
    };
  }, []);

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitInFlightRef.current) {
      return;
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim();
    const normalizedPhone = phone.trim();

    if (!normalizedName) {
      setStatus("error");
      setMessage(copy.validationName);
      return;
    }

    if (showEmail && !normalizedEmail) {
      setStatus("error");
      setMessage(copy.validationEmail);
      return;
    }

    if (showPhone && !normalizedPhone) {
      setStatus("error");
      setMessage(copy.validationPhone);
      return;
    }

    if (normalizedPhone && !smsConsent) {
      setStatus("error");
      setMessage(copy.validationConsent);
      return;
    }

    if (
      normalizedCustomQuestions.some(
        (question) => !(customAnswers[question] ?? "").trim(),
      )
    ) {
      setStatus("error");
      setMessage(copy.validationQuestions);
      return;
    }

    setStatus("submitting");
    setMessage(null);
    submitInFlightRef.current = true;

    try {
      const attribution = getCurrentPageAttribution();
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
          sms_consent_copy: copy.consent,
          stage: "launched",
          company_website: "",
          formStartedAt,
          utm_source: attribution.utmSource,
          utm_medium: attribution.utmMedium,
          utm_campaign: attribution.utmCampaign,
          ad_id: attribution.adId,
          landing_page_url: attribution.landingPageUrl,
          custom_answers: Object.fromEntries(
            normalizedCustomQuestions.map((question) => [
              question,
              (customAnswers[question] ?? "").trim(),
            ]),
          ),
          turnstile_token: turnstileToken || undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; message?: string; success?: boolean; ok?: boolean; queued?: boolean; lead_id?: string; id?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.message ?? copy.failed);
      }

      if (data?.success !== true || data?.ok !== true) {
        throw new Error(data?.message ?? copy.delayed);
      }

      const leadId = data?.lead_id ?? data?.id ?? null;

      if (metaPixelId && leadId && typeof window.fbq === "function") {
        window.fbq("track", "Lead", { campaign_id: campaignId }, { eventID: leadId });
        recordBrowserPixelAttempt({ leadId, campaignId, pixelId: metaPixelId });
        await waitForMetaPixelDispatch();
      }

      const thankYouUrl = new URL(`/f/${encodeURIComponent(funnelSlug)}/thank-you`, window.location.origin);
      thankYouUrl.searchParams.set("submitted", "1");
      window.location.assign(thankYouUrl.toString());
      return;
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : copy.failed);
      setTurnstileToken("");
      window.turnstile?.reset();
      submitInFlightRef.current = false;
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
      {TURNSTILE_SITE_KEY ? (
        <Script
          id="lead-capture-turnstile-script"
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
        />
      ) : null}
      <form
        aria-busy={status === "submitting"}
        aria-describedby={message ? "lead-capture-status" : undefined}
        className="space-y-4 rounded-[26px] border border-[#dfd5c8] bg-[#fffdf9] p-5 text-left shadow-[0_24px_80px_-54px_rgba(28,43,58,0.48)] sm:p-6"
        lang={normalizedLanguage}
        onSubmit={handleSubmit}
      >
      <div>
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--funnel-accent)]">
          {copy.eyebrow}
        </p>
        <h2 className="mt-2 text-center text-2xl font-semibold tracking-normal text-[#17283c]">
          {copy.title}
        </h2>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#40372f]">{copy.name}</span>
        <input
          autoComplete="name"
          className="h-12 w-full rounded-2xl border border-[#d8ccbd] bg-[#f8f2ea] px-4 text-[#17283c] transition focus:border-[var(--funnel-accent)] focus:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--funnel-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffdf9]"
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
          <span className="text-sm font-medium text-[#40372f]">{copy.email}</span>
          <input
            autoComplete="email"
            className="h-12 w-full rounded-2xl border border-[#d8ccbd] bg-[#f8f2ea] px-4 text-[#17283c] transition focus:border-[var(--funnel-accent)] focus:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--funnel-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffdf9]"
            onChange={(event) => {
              setEmail(event.target.value);
              if (message) {
                setMessage(null);
                setStatus("idle");
              }
            }}
            required
            type="email"
            value={email}
          />
        </label>
      ) : null}

      {showPhone ? (
        <div className="space-y-3">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[#40372f]">{copy.phone}</span>
            <input
              autoComplete="tel"
              className="h-12 w-full rounded-2xl border border-[#d8ccbd] bg-[#f8f2ea] px-4 text-[#17283c] transition focus:border-[var(--funnel-accent)] focus:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--funnel-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffdf9]"
              onChange={(event) => {
                setPhone(event.target.value);
                if (message) {
                  setMessage(null);
                  setStatus("idle");
                }
              }}
              required
              type="tel"
              value={phone}
            />
          </label>
          <label className="flex gap-3 rounded-2xl border border-[#e2d6c7] bg-[#fbf7ef] p-3 text-xs leading-relaxed text-[#6b5f53]">
            <input
              checked={smsConsent}
              className="mt-1 size-4 shrink-0 accent-[var(--funnel-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--funnel-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffdf9]"
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
            <span>{copy.consent}</span>
          </label>
        </div>
      ) : null}

      {normalizedCustomQuestions.map((question, index) => (
        <label className="block space-y-2" key={question}>
          <span className="text-sm font-medium text-[#40372f]">{question}</span>
          <textarea
            aria-label={question}
            className="min-h-24 w-full resize-y rounded-2xl border border-[#d8ccbd] bg-[#f8f2ea] px-4 py-3 text-[#17283c] transition focus:border-[var(--funnel-accent)] focus:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--funnel-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffdf9]"
            maxLength={500}
            name={`qualification_${index + 1}`}
            onChange={(event) => {
              setCustomAnswers((current) => ({
                ...current,
                [question]: event.target.value,
              }));
              if (message) {
                setMessage(null);
                setStatus("idle");
              }
            }}
            required
            value={customAnswers[question] ?? ""}
          />
        </label>
      ))}

      {message ? (
        <div
          id="lead-capture-status"
          aria-atomic="true"
          aria-live={status === "error" ? "assertive" : "polite"}
          className={`rounded-2xl border p-3 text-sm ${
            status === "success"
              ? "border-[var(--funnel-accent)]/20 bg-[#f6efe5] text-[#4d443b]"
              : "border-red-500/20 bg-red-50 text-red-700"
          }`}
          role={status === "error" ? "alert" : "status"}
        >
          {message}
        </div>
      ) : null}

      {TURNSTILE_SITE_KEY ? (
        <div aria-label={copy.humanVerification} className="flex min-h-[65px] justify-center">
          <div
            className="cf-turnstile"
            data-action="lead_capture"
            data-callback="dealflowLeadTurnstileVerified"
            data-error-callback="dealflowLeadTurnstileExpired"
            data-expired-callback="dealflowLeadTurnstileExpired"
            data-sitekey={TURNSTILE_SITE_KEY}
          />
        </div>
      ) : null}

      <p aria-live="polite" className="sr-only" role="status">
        {status === "submitting" ? copy.submitting : ""}
      </p>

      <button
        className="h-12 w-full rounded-2xl bg-[var(--funnel-accent)] px-4 text-base font-semibold text-white shadow-[0_14px_32px_-24px_rgba(28,43,58,0.8)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--funnel-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffdf9] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={status === "submitting" || Boolean(TURNSTILE_SITE_KEY && !turnstileToken)}
        type="submit"
      >
        {status === "submitting" ? copy.submitting : cta}
      </button>
      <p className="text-xs leading-relaxed text-[#74685b]">
        {copy.disclaimerPrefix}{" "}
        <Link className="rounded-sm font-medium text-[var(--funnel-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--funnel-accent)]" href="/privacy">
          {copy.privacy}
        </Link>{" "}
        {copy.and}{" "}
        <Link className="rounded-sm font-medium text-[var(--funnel-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--funnel-accent)]" href="/terms">
          {copy.terms}
        </Link>
        .
      </p>
      </form>
    </>
  );
}
