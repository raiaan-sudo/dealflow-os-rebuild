"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  redirectedFrom?: string;
  reason?: string;
  initialMode?: "sign-in" | "sign-up" | "reset-password";
  isConfigured: boolean;
  branding?: {
    appName?: string;
    logoUrl?: string | null;
    loginEyebrow?: string;
    loginHeadline?: string;
    loginSubheadline?: string;
    supportEmail?: string | null;
    poweredByDealFlow?: boolean;
  };
  partnerAttribution?: {
    partnerSlug?: string | null;
    inviteCode?: string | null;
    source?: "slug" | "invite" | "domain" | "admin" | "import" | "native";
  };
};

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
const GOOGLE_AUTH_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";
const TURNSTILE_SCRIPT_ID = "cloudflare-turnstile-script";
const DEFAULT_AUTH_REDIRECT_PATH = "/welcome?fresh=1";
const AUTH_TEMPORARILY_UNAVAILABLE_COPY =
  "Sign-in is temporarily unavailable. Please try again shortly or contact support if it continues.";

function customerSafeAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/supabase|environment|configured|config|url|anon|service|provider|oauth/i.test(message)) {
    return AUTH_TEMPORARILY_UNAVAILABLE_COPY;
  }

  if (/no session|session was established|auth session/i.test(message)) {
    return "We could not finish signing you in. Please try again.";
  }

  return message || "Authentication failed. Please try again.";
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
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "reset-password" | "update-password">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [logoFailed, setLogoFailed] = useState(false);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY);
  const requiresTurnstile = turnstileEnabled && mode !== "update-password";

  function getSafeRedirectPath(value?: string) {
    if (!value) {
      return DEFAULT_AUTH_REDIRECT_PATH;
    }

    if (!value.startsWith("/") || value.startsWith("//")) {
      return DEFAULT_AUTH_REDIRECT_PATH;
    }

    if (value === "/" || value.startsWith("/login")) {
      return DEFAULT_AUTH_REDIRECT_PATH;
    }

    return value;
  }

  async function handleProviderLogin(provider: "google") {
    setError(null);
    setMessage(null);

    const supabase = createClient();

    if (!supabase) {
      setError(AUTH_TEMPORARILY_UNAVAILABLE_COPY);
      return;
    }

    setIsPending(true);

    try {
      const nextPath = getSafeRedirectPath(redirectedFrom);
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
      setError(customerSafeAuthErrorMessage(caughtError));
      setIsPending(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const supabase = createClient();

    if (!supabase) {
      setError(AUTH_TEMPORARILY_UNAVAILABLE_COPY);
      return;
    }

    setIsPending(true);

    try {
      if (requiresTurnstile && !turnstileToken) {
        throw new Error("Please complete the verification challenge.");
      }

      if (mode === "reset-password") {
        const redirectTo = new URL("/login", window.location.origin);
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: redirectTo.toString(),
          captchaToken: turnstileEnabled ? turnstileToken : undefined,
        });

        if (resetError) {
          throw resetError;
        }

        setMessage("Password reset link sent. Check your inbox to continue.");
        resetTurnstile();
        return;
      }

      if (mode === "update-password") {
        const { error: updateError } = await supabase.auth.updateUser({ password });

        if (updateError) {
          throw updateError;
        }

        setMessage("Password updated. You can continue to your dashboard.");
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
          throw new Error("Sign-in completed but no session was established.");
        }

        const nextPath = getSafeRedirectPath(redirectedFrom);
        window.location.assign(nextPath);
        return;
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          captchaToken: turnstileEnabled ? turnstileToken : undefined,
          data: {
            full_name: fullName,
            ...(partnerAttribution?.partnerSlug ? { partner_slug: partnerAttribution.partnerSlug } : {}),
            ...(partnerAttribution?.inviteCode ? { partner_invite_code: partnerAttribution.inviteCode } : {}),
            ...(partnerAttribution?.source && partnerAttribution.source !== "native"
              ? { partner_attribution_source: partnerAttribution.source }
              : {}),
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      if (signUpData.session) {
        window.location.assign(getSafeRedirectPath(redirectedFrom));
        return;
      }

      setMessage(
        "Account created. If email confirmation is enabled in Supabase, confirm your inbox before signing in.",
      );
      setMode("sign-in");
      resetTurnstile();
    } catch (caughtError) {
      setError(customerSafeAuthErrorMessage(caughtError));
      if (turnstileEnabled) {
        resetTurnstile();
      }
    } finally {
      setIsPending(false);
    }
  }

  useEffect(() => {
    const supabase = createClient();

    if (!supabase) {
      return;
    }

    const client = supabase;

    async function recoverSessionFromHash() {
      if (typeof window === "undefined" || !window.location.hash) {
        return;
      }

      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const recoveryType = hashParams.get("type");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (recoveryType !== "recovery" || !accessToken || !refreshToken) {
        return;
      }

      const { error: sessionError } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        setError(customerSafeAuthErrorMessage(sessionError));
        return;
      }

      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      setError(null);
      setMessage("Enter a new password to finish account recovery.");
      setPassword("");
      setMode("update-password");
    }

    void recoverSessionFromHash();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setError(null);
        setMessage("Enter a new password to finish account recovery.");
        setPassword("");
        setMode("update-password");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
      ? "Please wait..."
      : mode === "sign-in"
        ? "Sign in"
        : mode === "sign-up"
          ? "Create Account"
          : mode === "reset-password"
            ? "Send Reset Link"
            : "Update Password";

  const inputClassName =
    "h-12 w-full rounded-df-control border border-white/10 bg-white/[0.045] px-4 text-white outline-none transition duration-200 placeholder:text-white/35 focus:border-cyan-200/40 focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(103,232,249,0.08)]";

  return (
    <div className="surface-guided w-full min-w-0 max-w-[calc(100vw-40px)] rounded-df-panel border border-white/10 p-6 shadow-df-elevated sm:max-w-none sm:p-8">
      <div className="mb-6">
        {branding?.logoUrl && !logoFailed ? (
          <div className="mb-5 flex items-center">
            <div className="flex max-h-14 max-w-[220px] items-center justify-start rounded-2xl border border-white/10 bg-white p-3 shadow-[0_18px_60px_-36px_rgba(0,0,0,0.8)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- Partner logos are runtime-configured URLs and need client-side fallback. */}
              <img
                src={branding.logoUrl}
                alt={`${branding.appName ?? "Partner"} logo`}
                className="max-h-9 max-w-[180px] object-contain"
                onError={() => setLogoFailed(true)}
              />
            </div>
          </div>
        ) : null}
        <p className="df-eyebrow">
          {branding?.loginEyebrow ?? "Replace your agency"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white [overflow-wrap:anywhere] sm:tracking-[-0.04em]">
          {branding?.loginHeadline ?? "Build, launch, and optimize your ads without paying an agency"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/70 [overflow-wrap:anywhere]">
          {branding?.loginSubheadline ?? "Sign in to get your funnel, ads, campaign launch path, and optimization workflow in one place."}
        </p>
        {branding?.poweredByDealFlow ? (
          <p className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-white/45">
            Powered by DealFlow
          </p>
        ) : null}
      </div>

      <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-1 shadow-inner shadow-black/30">
        <button
          className={`flex-1 rounded-full px-4 py-2 text-sm transition ${
            mode === "sign-in"
              ? "bg-df-primary text-slate-950 shadow-df-button"
              : "text-muted-foreground hover:text-white"
          }`}
          onClick={() => setMode("sign-in")}
          type="button"
        >
          Sign in
        </button>
        <button
          className={`flex-1 rounded-full px-4 py-2 text-sm transition ${
            mode === "sign-up"
              ? "bg-df-primary text-slate-950 shadow-df-button"
              : "text-muted-foreground hover:text-white"
          }`}
          onClick={() => setMode("sign-up")}
          type="button"
        >
          Create account
        </button>
      </div>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        {mode === "sign-up" ? (
          <label className="block space-y-2">
            <span className="text-sm text-white/70">Full name</span>
            <input
              id="full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Alex Morgan"
              className={inputClassName}
            />
          </label>
        ) : null}

        {mode !== "update-password" ? (
          <label className="block space-y-2">
            <span className="text-sm text-white/70">Email</span>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              className={inputClassName}
            />
          </label>
        ) : null}

        {mode !== "reset-password" ? (
          <label className="block space-y-2">
            <span className="text-sm text-white/70">
              {mode === "update-password" ? "New password" : "Password"}
            </span>
            <input
              id="password"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className={inputClassName}
            />
          </label>
        ) : null}

        {requiresTurnstile ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div ref={turnstileContainerRef} />
            {!turnstileToken ? (
              <p className="mt-2 text-xs text-white/60">Complete the verification challenge before continuing.</p>
            ) : null}
          </div>
        ) : null}

        {reason === "setup" ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
            Sign-in is temporarily unavailable. Please try again shortly.
          </div>
        ) : null}

        {reason === "expired" ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white/70">
            Your session expired or could not be refreshed. Sign in again to continue.
          </div>
        ) : null}

        {!isConfigured ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
            Sign-in is temporarily unavailable. Please try again shortly.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-sm text-primary">
            {message}
          </div>
        ) : null}

        <button
          className="h-12 w-full rounded-df-control bg-df-primary px-4 text-base font-semibold text-slate-950 shadow-df-button transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_70px_-32px_rgba(103,232,249,0.95)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          disabled={!isConfigured || isPending}
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
            type="button"
          >
            Forgot password?
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
            type="button"
          >
            Back to sign in
          </button>
        ) : null}

        {GOOGLE_AUTH_ENABLED && (mode === "sign-in" || mode === "sign-up") ? (
          <button
            className="h-12 w-full rounded-df-control border border-white/10 bg-white/[0.035] px-4 text-base font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:border-cyan-200/25 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            disabled={!isConfigured || isPending}
            onClick={() => handleProviderLogin("google")}
            type="button"
          >
            Continue with Google
          </button>
        ) : null}
      </form>
    </div>
  );
}
