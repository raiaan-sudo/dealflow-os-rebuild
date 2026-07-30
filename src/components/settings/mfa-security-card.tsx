"use client";

import { useCallback, useEffect, useState } from "react";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Enrollment = { factorId: string; qrCode: string } | null;
type MfaStatusResponse = {
  success?: boolean;
  verifiedFactorId?: string | null;
  assuranceLevel?: string | null;
};
type MfaEnrollmentResponse = {
  success?: boolean;
  factorId?: string;
  qrCode?: string;
};

export function MfaSecurityCard() {
  const { t } = useProductI18n();
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [assuranceLevel, setAssuranceLevel] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/auth/mfa", {
      credentials: "same-origin",
      cache: "no-store",
    });
    const result = await response.json().catch(() => null) as MfaStatusResponse | null;
    if (!response.ok || !result?.success) throw new Error("mfa_unavailable");
    setVerifiedFactorId(result.verifiedFactorId ?? null);
    setAssuranceLevel(result.assuranceLevel ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    void refresh()
      .catch(() => { if (active) setError(t("auth.mfaUnavailable")); })
      .finally(() => { if (active) setPending(false); });
    return () => { active = false; };
  }, [refresh, t]);

  async function beginEnrollment() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/mfa", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "begin-enrollment" }),
      });
      const result = await response.json().catch(() => null) as MfaEnrollmentResponse | null;
      if (!response.ok || !result?.success || !result.factorId || !result.qrCode) {
        throw new Error("mfa_enrollment_failed");
      }
      setEnrollment({ factorId: result.factorId, qrCode: result.qrCode });
    } catch {
      setError(t("auth.mfaEnrollmentFailed"));
    } finally {
      setPending(false);
    }
  }

  async function verify() {
    const factorId = enrollment?.factorId ?? verifiedFactorId;
    if (!factorId || !/^\d{6}$/.test(code)) return setError(t("auth.mfaCodeInvalid"));
    setPending(true);
    setError(null);
    setMessage(null);
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
      setEnrollment(null);
      setCode("");
      setMessage(t(enrollment ? "auth.mfaEnrollmentComplete" : "auth.mfaVerificationComplete"));
      await refresh().catch(() => setError(t("auth.mfaUnavailable")));
    } catch {
      setError(t("auth.mfaCodeInvalid"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="p-5 sm:p-7">
      <div className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("auth.mfaEyebrow")}</p>
          <h2 className="mt-2 text-xl font-semibold">{t("auth.mfaSettingsTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("auth.mfaSettingsBody")}</p>
        </div>
        <p className="text-sm text-foreground">
          {t("common.status")}: {pending
            ? t("common.loading")
            : verifiedFactorId
              ? assuranceLevel === "aal2" ? t("auth.mfaVerifiedNow") : t("auth.mfaEnrolled")
              : t("auth.mfaNotEnrolled")}
        </p>
        {!verifiedFactorId && !enrollment ? (
          <Button disabled={pending} onClick={beginEnrollment} type="button">
            {t("auth.mfaEnroll")}
          </Button>
        ) : null}
        {enrollment ? (
          <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm leading-6 text-white/75">{t("auth.mfaScanQr")}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- The QR is an ephemeral Supabase enrollment SVG and is never persisted. */}
            <img
              alt={t("auth.mfaQrAlt")}
              className="h-52 w-52 rounded-xl bg-white p-2"
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qrCode)}`}
            />
          </div>
        ) : null}
        {(verifiedFactorId || enrollment) && assuranceLevel !== "aal2" ? (
          <div className="space-y-3">
            <label className="block max-w-xs space-y-2">
              <span className="text-sm text-muted-foreground">{t("auth.mfaCodeLabel")}</span>
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="h-11 w-full rounded-df-control border border-white/10 bg-white/[0.045] px-4 text-white outline-none focus:border-cyan-200/40"
              />
            </label>
            <Button disabled={pending || code.length !== 6} onClick={verify} type="button">
              {pending ? t("common.pleaseWait") : t(enrollment ? "auth.mfaFinishEnrollment" : "auth.mfaVerify")}
            </Button>
          </div>
        ) : null}
        <p className="max-w-2xl text-xs leading-5 text-muted-foreground">{t("auth.mfaRecoveryBody")}</p>
        {error ? <p role="alert" className="text-sm text-rose-200">{error}</p> : null}
        {message ? <p role="status" className="text-sm text-emerald-200">{message}</p> : null}
      </div>
    </Card>
  );
}
