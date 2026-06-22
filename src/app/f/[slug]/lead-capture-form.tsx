"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";

type LeadCaptureFormProps = {
  campaignId: string;
  funnelSlug: string;
  formFields: string[];
  cta: string;
  language?: string | null;
  metaPixelId?: string | null;
};

const FORM_COPY = {
  en: {
    eyebrow: "Get Started",
    title: "Tell us where to send your options",
    name: "Name",
    email: "Email",
    phone: "Phone Number",
    consent:
      "By checking this box, I agree to receive SMS messages from DealFlow OS and/or the business operating this campaign about my inquiry, follow-ups, and appointment coordination. Message and data rates may apply. Message frequency may vary. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.",
    submitting: "Submitting...",
    validationName: "Please provide your name",
    validationEmail: "Please provide your email",
    validationPhone: "Please provide your phone number",
    validationConsent: "Please check the SMS consent box so we can text you about this request.",
    validationTurnstile: "Please complete the verification challenge.",
    delayed: "Lead capture is temporarily delayed. Please try again shortly.",
    failed: "Lead capture failed.",
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
    validationTurnstile: "Veuillez compléter la vérification.",
    delayed: "La demande est temporairement retardée. Veuillez réessayer sous peu.",
    failed: "La demande n'a pas pu être envoyée.",
    disclaimerPrefix:
      "En soumettant ce formulaire, vous acceptez d'être contacté au sujet de cette demande. Les SMS sont envoyés seulement lorsque vous y consentez explicitement ci-dessus. Consultez notre",
    privacy: "Politique de confidentialité",
    and: "et nos",
    terms: "Conditions",
  },
  es: {
    eyebrow: "Comenzar",
    title: "Dinos donde enviarte tus opciones",
    name: "Nombre",
    email: "Correo electronico",
    phone: "Numero de telefono",
    consent:
      "Al marcar esta casilla, acepto recibir mensajes SMS de DealFlow OS y/o de la empresa que opera esta campana sobre mi solicitud, seguimientos y coordinacion de citas. Pueden aplicarse tarifas de mensajes y datos. La frecuencia puede variar. Responde STOP para cancelar o HELP para obtener ayuda. El consentimiento no es condicion de compra.",
    submitting: "Enviando...",
    validationName: "Indica tu nombre",
    validationEmail: "Indica tu correo electronico",
    validationPhone: "Indica tu numero de telefono",
    validationConsent: "Marca la casilla de consentimiento SMS para que podamos escribirte sobre esta solicitud.",
    validationTurnstile: "Completa la verificacion.",
    delayed: "La captura del lead esta temporalmente demorada. Intentalo nuevamente en breve.",
    failed: "No se pudo enviar la solicitud.",
    disclaimerPrefix:
      "Al enviar, aceptas que te contacten sobre esta solicitud. Los SMS solo se envian cuando das tu consentimiento explicito arriba. Consulta nuestra",
    privacy: "Politica de privacidad",
    and: "y",
    terms: "Terminos",
  },
} as const;

function getFormCopy(language?: string | null) {
  if (language === "fr" || language === "es") {
    return FORM_COPY[language];
  }

  return FORM_COPY.en;
}

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
  language,
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
  const submitInFlightRef = useRef(false);
  const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY);
  const copy = getFormCopy(language);

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

    if (turnstileEnabled && !turnstileToken) {
      setStatus("error");
      setMessage(copy.validationTurnstile);
      return;
    }

    setStatus("submitting");
    setMessage(null);
    submitInFlightRef.current = true;

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
          sms_consent_copy: copy.consent,
          stage: "launched",
          company_website: "",
          formStartedAt,
          turnstile_token: turnstileToken || undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; message?: string; success?: boolean; ok?: boolean; queued?: boolean; lead_id?: string; id?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Lead capture failed.");
      }

      if (data?.success !== true || data?.ok !== true) {
        throw new Error(data?.message ?? copy.delayed);
      }

      const leadId = data?.lead_id ?? data?.id ?? null;

      if (metaPixelId && leadId && typeof window.fbq === "function") {
        window.fbq("track", "Lead", { campaign_id: campaignId }, { eventID: leadId });
      }

      const thankYouUrl = new URL(`/f/${encodeURIComponent(funnelSlug)}/thank-you`, window.location.origin);
      thankYouUrl.searchParams.set("submitted", "1");
      window.location.assign(thankYouUrl.toString());
      return;
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : copy.failed);
      resetTurnstile();
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
      <form className="space-y-4 rounded-[26px] border border-[#dfd5c8] bg-[#fffdf9] p-5 text-left shadow-[0_24px_80px_-54px_rgba(28,43,58,0.48)] sm:p-6" onSubmit={handleSubmit}>
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
          className="h-12 w-full rounded-2xl border border-[#d8ccbd] bg-[#f8f2ea] px-4 text-[#17283c] outline-none transition focus:border-[var(--funnel-accent)] focus:bg-white"
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
            className="h-12 w-full rounded-2xl border border-[#d8ccbd] bg-[#f8f2ea] px-4 text-[#17283c] outline-none transition focus:border-[var(--funnel-accent)] focus:bg-white"
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
              className="h-12 w-full rounded-2xl border border-[#d8ccbd] bg-[#f8f2ea] px-4 text-[#17283c] outline-none transition focus:border-[var(--funnel-accent)] focus:bg-white"
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
              className="mt-1 size-4 shrink-0 accent-[var(--funnel-accent)]"
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

      {message ? (
        <div
          className={`rounded-2xl border p-3 text-sm ${
            status === "success"
              ? "border-[var(--funnel-accent)]/20 bg-[#f6efe5] text-[#4d443b]"
              : "border-red-500/20 bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      ) : null}

      {turnstileEnabled ? (
        <div
          ref={turnstileContainerRef}
          className="min-h-[65px] overflow-hidden rounded-2xl border border-[#e2d6c7] bg-[#fbf7ef] p-2"
        />
      ) : null}

      <button
        className="h-12 w-full rounded-2xl bg-[var(--funnel-accent)] px-4 text-base font-semibold text-white shadow-[0_14px_32px_-24px_rgba(28,43,58,0.8)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={status === "submitting"}
        type="submit"
      >
        {status === "submitting" ? copy.submitting : cta}
      </button>
      <p className="text-xs leading-relaxed text-[#74685b]">
        {copy.disclaimerPrefix}{" "}
        <a className="font-medium text-[var(--funnel-accent)] underline-offset-4 hover:underline" href="/privacy">
          {copy.privacy}
        </a>{" "}
        {copy.and}{" "}
        <a className="font-medium text-[var(--funnel-accent)] underline-offset-4 hover:underline" href="/terms">
          {copy.terms}
        </a>
        .
      </p>
      </form>
    </>
  );
}
