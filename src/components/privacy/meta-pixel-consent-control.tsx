"use client";

import Link from "next/link";
import { useState } from "react";
import { META_PIXEL_CONSENT_COOKIE } from "@/lib/meta-pixel-consent";

type ConsentState = "granted" | "denied" | "unset";

export function MetaPixelConsentControl({
  policyVersion,
  currentCookieValue,
}: {
  policyVersion: string;
  currentCookieValue?: string | null;
}) {
  const initialState: ConsentState =
    currentCookieValue === `granted:${policyVersion}`
      ? "granted"
      : currentCookieValue === `denied:${policyVersion}`
        ? "denied"
        : "unset";
  const [state, setState] = useState<ConsentState>(initialState);
  const [choicesOpen, setChoicesOpen] = useState(initialState === "unset");

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
    <aside className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl" aria-label="Marketing tracking choices">
      {choicesOpen ? (
        <div className="rounded-2xl border border-white/15 bg-[#101827]/95 p-4 text-sm text-white shadow-2xl backdrop-blur sm:p-5">
          <h2 className="font-semibold">Optional marketing measurement</h2>
          <p className="mt-2 leading-6 text-white/72">
            Meta Pixel helps measure whether advertising led to this page. It is off unless you
            allow it, and your form submission works either way. See the{" "}
            <Link className="underline underline-offset-4" href="/privacy">
              privacy policy
            </Link>
            .
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              className="min-h-11 rounded-xl bg-white px-4 font-semibold text-slate-950"
              onClick={() => persist("granted")}
              type="button"
            >
              Allow Meta Pixel
            </button>
            <button
              className="min-h-11 rounded-xl border border-white/20 px-4 font-semibold text-white"
              onClick={() => persist("denied")}
              type="button"
            >
              Keep it off
            </button>
          </div>
        </div>
      ) : (
        <button
          className="ml-auto block min-h-10 rounded-xl border border-white/15 bg-[#101827]/90 px-3 text-xs font-semibold text-white shadow-lg backdrop-blur"
          onClick={() => setChoicesOpen(true)}
          type="button"
        >
          Privacy choices{state === "granted" ? " · Pixel allowed" : " · Pixel off"}
        </button>
      )}
    </aside>
  );
}
