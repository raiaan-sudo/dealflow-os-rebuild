"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import type { ProductMessageKey } from "@/lib/i18n/messages";

type LoginFormProps = {
  redirectedFrom?: string;
  reason?: string;
  initialMode?: "sign-in" | "sign-up" | "reset-password";
  isConfigured: boolean;
  branding?: {
    appName?: string;
    logoUrl?: string | null;
    loginEyebrow?: string | null;
    loginHeadline?: string | null;
    loginSubheadline?: string | null;
    supportEmail?: string | null;
    poweredByDealFlow?: boolean;
  };
  partnerAttribution?: {
    partnerSlug?: string | null;
    bindingToken?: string | null;
    source?: "slug" | "invite" | "domain" | "admin" | "import" | "native";
  };
};

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
const GOOGLE_AUTH_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";
const TURNSTILE_SCRIPT_ID = "cloudflare-turnstile-script";
function getSafeRedirectPath(
  value: string | undefined,
  origin: string,
  defaultPath: string,
) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return defaultPath;
  }

  try {
    const resolved = new URL(value, origin);

    if (
      resolved.origin !== new URL(origin).origin ||
      resolved.pathname === "/" ||
      resolved.pathname.startsWith("/login")
    ) {
      return defaultPath;
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return defaultPath;
  }
}

function customerSafeAuthErrorMessage(
  error: unknown,
  t: (key: ProductMessageKey) => string,
) {
  const message = error instanceof Error ? error.message : "";

  if (/supabase|environment|configured|config|url|anon|service|provider|oauth/i.test(message)) {
    return t("auth.error.unavailable");
  }

  if (/no session|session was established|auth session/i.test(message)) {
    return t("auth.error.generic");
  }

  return t("auth.error.generic");
}

declare global {
  interface Window {
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

export function LoginForm({
  redirectedFrom,
  reason,
  initialMode = "sign-in",
  isConfigured,
  branding,
  partnerAttribution,
}: LoginFormProps) {
  const { href, t } = useProductI18n();
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "reset-password" | "update-password">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [logoFailed, setLogoFailed] = useState(false);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY);
  const requiresTurnstile = turnstileEnabled && mode !== "update-password";

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  function getEmailConfirmationRedirectUrl(value?: string) {
    const nextPath = getSafeRedirectPath(
      value,
      window.location.origin,
      href("/onboarding?fresh=1"),
    );
    const redirectTo = new URL(href("/login"), window.location.origin);
    redirectTo.searchParams.set("confirmed", "1");
    redirectTo.searchParams.set("redirectedFrom", nextPath);
    return redirectTo.toString();
  }

  function isEmbeddedAuthSurface() {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }

  async function requestEmbeddedAuthStorageAccess() {
    if (!isEmbeddedAuthSurface()) {
      return;
    }

    if (
      typeof document.hasStorageAccess !== "function" ||
      typeof document.requestStorageAccess !== "function"
    ) {
      return;
    }

    try {
      if (await document.hasStorageAccess()) {
        return;
      }

      await document.requestStorageAccess();
    } catch {
      // Browsers can deny iframe storage access; auth still falls back to SameSite=None cookies where allowed.
    }
  }

  async function handleProviderLogin(provider: "google") {
    setError(null);
    setMessage(null);

    const supabase = createClient();

    if (!supabase) {
      setError(t("auth.error.unavailable"));
      return;
    }

    setIsPending(true);

    try {
      const nextPath = getSafeRedirectPath(
        redirectedFrom,
        window.location.origin,
        href("/onboarding?fresh=1"),
      );
      const redirectTo = new URL(nextPath, window.location.origin);
      redirectTo.searchParams.set("next", nextPath);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectTo.toString(),
        },
      });

      if (oauthError) {
        throw oauthError;
      }
    } catch (caughtError) {
      setError(customerSafeAuthErrorMessage(caughtError, t));
      setIsPending(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isHydrated) {
      return;
    }

    setError(null);
    setMessage(null);

    const supabase = createClient();

    if (!supabase) {
      setError(t("auth.error.unavailable"));
      return;
    }

    setIsPending(true);

    try {
      if (requiresTurnstile && !turnstileToken) {
        throw new Error(t("auth.error.challenge"));
      }

      await requestEmbeddedAuthStorageAccess();

      if (mode === "reset-password") {
        const redirectTo = new URL(href("/login"), window.location.origin);
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: redirectTo.toString(),
          captchaToken: turnstileEnabled ? turnstileToken : undefined,
        });

        if (resetError) {
          throw resetError;
        }

        setMessage(t("auth.message.resetSent"));
        resetTurnstile();
        return;
      }

      if (mode === "update-password") {
        const { error: updateError } = await supabase.auth.updateUser({ password });

        if (updateError) {
          throw updateError;
        }

        setMessage(t("auth.message.updated"));
        setMode("sign-in");
        return;
      }

      if (mode === "sign-in") {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: {
            captchaToken: turnstileEnabled ? turnstileToken : undefined,
          },
        });

        if (signInError) {
          throw signInError;
        }

        const session =
          signInData.session ??
          (await supabase.auth.getSession()).data.session;

        if (!session) {
          throw new Error(t("auth.error.session"));
        }

        const nextPath = getSafeRedirectPath(
          redirectedFrom,
          window.location.origin,
          href("/onboarding?fresh=1"),
        );
        window.location.assign(nextPath);
        return;
      }

      let accessKeyClaimToken: string | null = null;
      let accessKeyPartnerSlug: string | null = null;
      const normalizedAccessKey = accessKey.trim();

      if (normalizedAccessKey) {
        const preclaimResponse = await fetch("/api/access-keys/preclaim", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accessKey: normalizedAccessKey,
            email,
            partnerSlug: partnerAttribution?.partnerSlug ?? undefined,
          }),
        });
        const preclaimPayload = await preclaimResponse.json().catch(() => null) as {
          claimToken?: string;
          partnerSlug?: string | null;
          error?: string;
        } | null;

        if (!preclaimResponse.ok || !preclaimPayload?.claimToken) {
          throw new Error(preclaimPayload?.error || t("auth.error.accessKey"));
        }

        accessKeyClaimToken = preclaimPayload.claimToken;
        accessKeyPartnerSlug = preclaimPayload.partnerSlug ?? null;
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          captchaToken: turnstileEnabled ? turnstileToken : undefined,
          emailRedirectTo: getEmailConfirmationRedirectUrl(redirectedFrom),
          data: {
            full_name: fullName,
            ...(partnerAttribution?.bindingToken
              ? { partner_attribution_token: partnerAttribution.bindingToken }
              : {}),
            ...(accessKeyClaimToken ? { access_key_claim_token: accessKeyClaimToken } : {}),
            ...(accessKeyPartnerSlug ? { access_key_partner_slug: accessKeyPartnerSlug } : {}),
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      if (signUpData.session) {
        window.location.assign(
          getSafeRedirectPath(
            redirectedFrom,
            window.location.origin,
            href("/onboarding?fresh=1"),
          ),
        );
        return;
      }

      setMessage(t("auth.message.accountCreated"));
      setMode("sign-in");
      resetTurnstile();
    } catch (caughtError) {
      setError(customerSafeAuthErrorMessage(caughtError, t));
      if (turnstileEnabled) {
        resetTurnstile();
      }
    } finally {
      setIsPending(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const recoveryType = hashParams.get("type");
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const hasRecoveryTokenFragment =
      recoveryType === "recovery" && Boolean(accessToken || refreshToken);
    const recoveryTokens =
      recoveryType === "recovery" && accessToken && refreshToken
        ? { accessToken, refreshToken }
        : null;

    if (hasRecoveryTokenFragment) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }

    const supabase = createClient();

    if (!supabase) {
      if (hasRecoveryTokenFragment) {
        setError(t("auth.error.unavailable"));
      }
      return;
    }

    const client = supabase;

    async function recoverSessionFromHash() {
      if (!hasRecoveryTokenFragment) {
        return;
      }

      if (!recoveryTokens) {
        setError(t("auth.error.recovery"));
        return;
      }

      const { error: sessionError } = await client.auth.setSession({
        access_token: recoveryTokens.accessToken,
        refresh_token: recoveryTokens.refreshToken,
      });

      if (sessionError) {
        setError(customerSafeAuthErrorMessage(sessionError, t));
        return;
      }

      setError(null);
      setMessage(t("auth.message.newPassword"));
      setPassword("");
      setMode("update-password");
    }

    void recoverSessionFromHash();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setError(null);
        setMessage(t("auth.message.newPassword"));
        setPassword("");
        setMode("update-password");
      }
    });

    return () => subscription.unsubscribe();
  }, [t]);

  useEffect(() => {
    if (!requiresTurnstile) {
      setTurnstileToken("");
      turnstileWidgetIdRef.current = null;
      return;
    }

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
  }, [mode, requiresTurnstile]);

  function resetTurnstile() {
    if (!turnstileWidgetIdRef.current) {
      return;
    }

    setTurnstileToken("");
    window.turnstile?.reset(turnstileWidgetIdRef.current);
  }

  const actionLabel =
    isPending
      ? t("common.pleaseWait")
      : mode === "sign-in"
        ? t("auth.signIn")
        : mode === "sign-up"
          ? t("auth.signUp")
          : mode === "reset-password"
            ? t("auth.sendReset")
            : t("auth.updatePassword");

  const inputClassName =
    "h-12 w-full rounded-df-control border border-white/10 bg-white/[0.045] px-4 text-white outline-none transition duration-200 placeholder:text-white/35 focus:border-cyan-200/40 focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(103,232,249,0.08)]";

  return (
    <div className="surface-guided w-full min-w-0 max-w-[calc(100vw-40px)] rounded-df-panel border border-white/10 p-6 shadow-df-elevated sm:max-w-none sm:p-8">
      <div className="mb-6">
        {branding?.appName ? (
          <div className="mb-5 flex min-w-0 items-center gap-3">
            {branding.logoUrl && !logoFailed ? (
              <div className="flex max-h-14 max-w-[220px] shrink-0 items-center justify-start rounded-2xl border border-white/10 bg-black/25 p-3 shadow-[0_18px_60px_-36px_rgba(0,0,0,0.8)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- Partner logos are runtime-configured URLs and need client-side fallback. */}
                <img
                  src={branding.logoUrl}
                  alt={`${branding.appName} logo`}
                  className="max-h-9 max-w-[180px] object-contain"
                  onError={() => setLogoFailed(true)}
                />
              </div>
            ) : null}
            <p className="min-w-0 text-sm font-semibold leading-5 text-white [overflow-wrap:anywhere]">
              {branding.appName}
            </p>
          </div>
        ) : null}
        <p className="df-eyebrow">
          {branding?.loginEyebrow ?? t("auth.defaultEyebrow")}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white [overflow-wrap:anywhere] sm:tracking-[-0.04em]">
          {branding?.loginHeadline ?? t("auth.defaultHeadline")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/70 [overflow-wrap:anywhere]">
          {branding?.loginSubheadline ?? t("auth.defaultSubheadline")}
        </p>
        {branding?.poweredByDealFlow ? (
          <p className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-white/45">
            {t("shell.poweredBy")}
          </p>
        ) : null}
      </div>

      <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-1 shadow-inner shadow-black/30">
        <button
          aria-label={t("auth.switchToSignIn")}
          aria-pressed={mode === "sign-in"}
          className={`flex-1 rounded-full px-4 py-2 text-sm transition ${
            mode === "sign-in"
              ? "bg-df-primary text-slate-950 shadow-df-button"
              : "text-muted-foreground hover:text-white"
          }`}
          onClick={() => setMode("sign-in")}
          disabled={!isHydrated || isPending}
          type="button"
        >
          {t("auth.signIn")}
        </button>
        <button
          aria-label={t("auth.switchToSignUp")}
          aria-pressed={mode === "sign-up"}
          className={`flex-1 rounded-full px-4 py-2 text-sm transition ${
            mode === "sign-up"
              ? "bg-df-primary text-slate-950 shadow-df-button"
              : "text-muted-foreground hover:text-white"
          }`}
          onClick={() => setMode("sign-up")}
          disabled={!isHydrated || isPending}
          type="button"
        >
          {t("auth.signUp")}
        </button>
      </div>

      <form aria-busy={isPending} className="mt-6 space-y-4" onSubmit={handleSubmit}>
        {mode === "sign-up" ? (
          <>
            <label className="block space-y-2">
              <span className="text-sm text-white/70">{t("auth.fullName")}</span>
              <input
                id="full-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                disabled={!isHydrated || isPending}
                placeholder="Alex Morgan"
                className={inputClassName}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-white/70">{t("auth.accessKeyOptional")}</span>
              <input
                id="access-key"
                autoComplete="off"
                value={accessKey}
                onChange={(event) => setAccessKey(event.target.value)}
                disabled={!isHydrated || isPending}
                placeholder="df_live_..."
                className={inputClassName}
              />
            </label>
          </>
        ) : null}

        {mode !== "update-password" ? (
          <label className="block space-y-2">
            <span className="text-sm text-white/70">{t("common.email")}</span>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={!isHydrated || isPending}
              placeholder="you@company.com"
              className={inputClassName}
            />
          </label>
        ) : null}

        {mode !== "reset-password" ? (
          <label className="block space-y-2">
            <span className="text-sm text-white/70">
              {mode === "update-password" ? t("auth.newPassword") : t("common.password")}
            </span>
            <input
              id="password"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={!isHydrated || isPending}
              placeholder="••••••••"
              className={inputClassName}
            />
          </label>
        ) : null}

        {requiresTurnstile ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div ref={turnstileContainerRef} />
            {!turnstileToken ? (
              <p aria-live="polite" className="mt-2 text-xs text-white/60" role="status">
                {t("auth.message.challenge")}
              </p>
            ) : null}
          </div>
        ) : null}

        {reason === "setup" ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
            {t("auth.error.unavailable")}
          </div>
        ) : null}

        {reason === "expired" ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white/70">
            {t("auth.message.sessionExpired")}
          </div>
        ) : null}

        {reason === "confirmed" ? (
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-sm text-primary">
            {t("auth.message.confirmed")}
          </div>
        ) : null}

        {!isConfigured ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
            {t("auth.error.unavailable")}
          </div>
        ) : null}

        {error ? (
          <div
            id="login-form-error"
            aria-live="assertive"
            className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {message ? (
          <div
            id="login-form-message"
            aria-live="polite"
            className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-sm text-primary"
            role="status"
          >
            {message}
          </div>
        ) : null}

        <button
          className="h-12 w-full rounded-df-control bg-df-primary px-4 text-base font-semibold text-slate-950 shadow-df-button transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_70px_-32px_rgba(103,232,249,0.95)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          disabled={!isHydrated || !isConfigured || isPending}
          type="submit"
        >
          {actionLabel}
        </button>

        {mode === "sign-in" ? (
          <button
            className="w-full text-sm font-medium text-white/65 transition hover:text-white"
            onClick={() => {
              setError(null);
              setMessage(null);
              setMode("reset-password");
            }}
            disabled={!isHydrated || isPending}
            type="button"
          >
            {t("auth.forgotPassword")}
          </button>
        ) : null}

        {mode === "reset-password" || mode === "update-password" ? (
          <button
            className="w-full text-sm font-medium text-white/65 transition hover:text-white"
            onClick={() => {
              setError(null);
              setMessage(null);
              setMode("sign-in");
            }}
            disabled={!isHydrated || isPending}
            type="button"
          >
            {t("auth.backToSignIn")}
          </button>
        ) : null}

        {GOOGLE_AUTH_ENABLED && (mode === "sign-in" || mode === "sign-up") ? (
          <button
            className="h-12 w-full rounded-df-control border border-white/10 bg-white/[0.035] px-4 text-base font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:border-cyan-200/25 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            disabled={!isHydrated || !isConfigured || isPending}
            onClick={() => handleProviderLogin("google")}
            type="button"
          >
            {t("auth.google")}
          </button>
        ) : null}
      </form>
    </div>
  );
}
