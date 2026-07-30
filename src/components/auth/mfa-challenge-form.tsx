"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import { getSafeAuthRedirectPath } from "@/lib/auth/safe-redirect";

type MfaStatusResponse = {
  success?: boolean;
  verifiedFactorId?: string | null;
  assuranceLevel?: string | null;
};

export function MfaChallengeForm({ redirectedFrom }: { redirectedFrom?: string }) {
  const { href, t } = useProductI18n();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/auth/mfa", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const result = await response.json().catch(() => null) as MfaStatusResponse | null;
        if (!active) return;
        if (!response.ok || !result?.success) {
          setError(t("auth.mfaUnavailable"));
        } else if (result.assuranceLevel === "aal2") {
          window.location.replace(getSafeAuthRedirectPath(
            redirectedFrom,
            window.location.origin,
            href("/dashboard"),
          ));
        } else {
          setFactorId(result.verifiedFactorId ?? null);
          if (!result.verifiedFactorId) setError(t("auth.mfaEnrollmentRequired"));
        }
      } catch {
        if (active) setError(t("auth.mfaUnavailable"));
      } finally {
        if (active) setPending(false);
      }
    })();
    return () => { active = false; };
  }, [href, redirectedFrom, t]);

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) {
      setError(t("auth.mfaCodeInvalid"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/mfa", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "verify", factorId, code }),
      });
      if (!response.ok) {
        throw new Error("mfa_code_invalid");
      }
    } catch {
      setError(t("auth.mfaCodeInvalid"));
      setPending(false);
      return;
    }
    window.location.replace(getSafeAuthRedirectPath(
      redirectedFrom,
      window.location.origin,
      href("/dashboard"),
    ));
  }

  return (
    <div className="surface-guided w-full rounded-df-panel border border-white/10 p-6 shadow-df-elevated sm:p-8">
      <p className="df-eyebrow">{t("auth.mfaEyebrow")}</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">{t("auth.mfaChallengeTitle")}</h1>
      <p className="mt-2 text-sm leading-6 text-white/70">{t("auth.mfaChallengeBody")}</p>
      <form className="mt-6 space-y-4" onSubmit={verify}>
        <label className="block space-y-2">
          <span className="text-sm text-white/70">{t("auth.mfaCodeLabel")}</span>
          <input
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={pending || !factorId}
            className="h-12 w-full rounded-df-control border border-white/10 bg-white/[0.045] px-4 text-white outline-none focus:border-cyan-200/40"
          />
        </label>
        {error ? <p role="alert" className="text-sm text-rose-200">{error}</p> : null}
        <Button className="w-full" disabled={pending || !factorId || code.length !== 6} type="submit">
          {pending ? t("common.pleaseWait") : t("auth.mfaVerify")}
        </Button>
        {!factorId && !pending ? (
          <Button asChild className="w-full" variant="secondary">
            <a href={href("/settings")}>{t("auth.mfaOpenSettings")}</a>
          </Button>
        ) : null}
      </form>
    </div>
  );
}
