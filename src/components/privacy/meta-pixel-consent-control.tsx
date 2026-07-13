"use client";

import Link from "next/link";
import { useState } from "react";
import { META_PIXEL_CONSENT_COOKIE } from "@/lib/meta-pixel-consent";
import { normalizePublicFunnelLanguage } from "@/lib/public-funnel-language";

type ConsentState = "granted" | "denied" | "unset";

const PIXEL_CONSENT_COPY = {
  en: {
    ariaLabel: "Marketing tracking choices",
    title: "Optional marketing measurement",
    body: "Meta Pixel helps measure whether advertising led to this page. It is off unless you allow it, and your form submission works either way. See the",
    privacyPolicy: "privacy policy",
    allow: "Allow Meta Pixel",
    deny: "Keep it off",
    choices: "Privacy choices",
    allowed: "Pixel allowed",
    off: "Pixel off",
  },
  fr: {
    ariaLabel: "Choix de suivi marketing",
    title: "Mesure marketing facultative",
    body: "Le pixel Meta aide à mesurer si une publicité a mené à cette page. Il reste désactivé sans votre autorisation et le formulaire fonctionne dans tous les cas. Consultez la",
    privacyPolicy: "politique de confidentialité",
    allow: "Autoriser le pixel Meta",
    deny: "Le garder désactivé",
    choices: "Choix de confidentialité",
    allowed: "Pixel autorisé",
    off: "Pixel désactivé",
  },
  es: {
    ariaLabel: "Opciones de seguimiento de marketing",
    title: "Medición de marketing opcional",
    body: "El píxel de Meta ayuda a medir si un anuncio llevó a esta página. Permanece desactivado sin su autorización y el formulario funciona de cualquier manera. Consulte la",
    privacyPolicy: "política de privacidad",
    allow: "Permitir el píxel de Meta",
    deny: "Mantenerlo desactivado",
    choices: "Opciones de privacidad",
    allowed: "Píxel permitido",
    off: "Píxel desactivado",
  },
} as const;

export function MetaPixelConsentControl({
  policyVersion,
  currentCookieValue,
  language,
}: {
  policyVersion: string;
  currentCookieValue?: string | null;
  language?: unknown;
}) {
  const initialState: ConsentState =
    currentCookieValue === `granted:${policyVersion}`
      ? "granted"
      : currentCookieValue === `denied:${policyVersion}`
        ? "denied"
        : "unset";
  const [state, setState] = useState<ConsentState>(initialState);
  const [choicesOpen, setChoicesOpen] = useState(initialState === "unset");
  const copy = PIXEL_CONSENT_COPY[normalizePublicFunnelLanguage(language)];

  function persist(nextState: Exclude<ConsentState, "unset">) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${META_PIXEL_CONSENT_COOKIE}=${nextState}:${policyVersion}; Path=/; Max-Age=15552000; SameSite=Lax${secure}`;
    setState(nextState);
    setChoicesOpen(false);
    window.location.reload();
  }

  if (!policyVersion) {
    return null;
  }

  return (
    <aside className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl" aria-label={copy.ariaLabel}>
      {choicesOpen ? (
        <div className="rounded-2xl border border-white/15 bg-[#101827]/95 p-4 text-sm text-white shadow-2xl backdrop-blur sm:p-5">
          <h2 className="font-semibold">{copy.title}</h2>
          <p className="mt-2 leading-6 text-white/72">
            {copy.body}{" "}
            <Link className="underline underline-offset-4" href="/privacy">
              {copy.privacyPolicy}
            </Link>
            .
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              className="min-h-11 rounded-xl bg-white px-4 font-semibold text-slate-950"
              onClick={() => persist("granted")}
              type="button"
            >
              {copy.allow}
            </button>
            <button
              className="min-h-11 rounded-xl border border-white/20 px-4 font-semibold text-white"
              onClick={() => persist("denied")}
              type="button"
            >
              {copy.deny}
            </button>
          </div>
        </div>
      ) : (
        <button
          className="ml-auto block min-h-10 rounded-xl border border-white/15 bg-[#101827]/90 px-3 text-xs font-semibold text-white shadow-lg backdrop-blur"
          onClick={() => setChoicesOpen(true)}
          type="button"
        >
          {copy.choices} · {state === "granted" ? copy.allowed : copy.off}
        </button>
      )}
    </aside>
  );
}
