"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import { getSafeAuthRedirectPath } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/client";

export function MfaChallengeForm({ redirectedFrom }: { redirectedFrom?: string }) {
  const { href, t } = useProductI18n();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const client = createClient();
      if (!client) {
        if (active) setError(t("auth.mfaUnavailable"));
        return;
      }
      const [factorsResult, assuranceResult] = await Promise.all([
        client.auth.mfa.listFactors(),
        client.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      if (!active) return;
      if (factorsResult.error || assuranceResult.error) {
        setError(t("auth.mfaUnavailable"));
      } else if (assuranceResult.data.currentLevel === "aal2") {
        window.location.replace(getSafeAuthRedirectPath(
          redirectedFrom,
          window.location.origin,
          href("/dashboard"),
        ));
      } else {
        setFactorId(factorsResult.data.totp[0]?.id ?? null);
        if (!factorsResult.data.totp[0]) setError(t("auth.mfaEnrollmentRequired"));
      }
      setPending(false);
    })();
    return () => { active = false; };
  }, [href, redirectedFrom, t]);

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) {
      setError(t("auth.mfaCodeInvalid"));
      return;
    }
    const client = createClient();
    if (!client) {
      setError(t("auth.mfaUnavailable"));
      return;
    }
    setPending(true);
    setError(null);
    const result = await client.auth.mfa.challengeAndVerify({ factorId, code });
    if (result.error) {
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
