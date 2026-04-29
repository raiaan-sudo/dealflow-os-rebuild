"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  redirectedFrom?: string;
  reason?: string;
  isConfigured: boolean;
};

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
const TURNSTILE_SCRIPT_ID = "cloudflare-turnstile-script";

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
  isConfigured,
}: LoginFormProps) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY);

  function getSafeRedirectPath(value?: string) {
    if (!value) {
      return "/dashboard";
    }

    if (!value.startsWith("/") || value.startsWith("//")) {
      return "/dashboard";
    }

    return value;
  }

  async function handleProviderLogin(provider: "google") {
    setError(null);
    setMessage(null);

    const supabase = createClient();

    if (!supabase) {
      setError("Supabase environment variables are not configured.");
      return;
    }

    setIsPending(true);

    try {
      const nextPath = getSafeRedirectPath(redirectedFrom);
      const redirectTo = new URL("/", window.location.origin);
      if (nextPath && nextPath !== "/dashboard") {
        redirectTo.searchParams.set("next", nextPath);
      }
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
      setError(
        caughtError instanceof Error ? caughtError.message : "Authentication failed.",
      );
      setIsPending(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const supabase = createClient();

    if (!supabase) {
      setError("Supabase environment variables are not configured.");
      return;
    }

    setIsPending(true);

    try {
      if (mode === "sign-in") {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
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

      if (turnstileEnabled && !turnstileToken) {
        throw new Error("Please complete the verification challenge.");
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          captchaToken: turnstileEnabled ? turnstileToken : undefined,
          data: {
            full_name: fullName,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      setMessage(
        "Account created. If email confirmation is enabled in Supabase, confirm your inbox before signing in.",
      );
      setMode("sign-in");
      resetTurnstile();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Authentication failed.",
      );
      if (mode === "sign-up") {
        resetTurnstile();
      }
    } finally {
      setIsPending(false);
    }
  }

  useEffect(() => {
    if (mode !== "sign-up") {
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
  }, [mode]);

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
        ? "Launch My Campaign"
        : "Create Account";

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_30px_90px_-45px_rgba(0,0,0,0.7)] sm:p-8">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
          Replace your agency
        </p>
        <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
          Build, launch, and optimize your ads without paying an agency
        </p>
        <p className="mt-2 text-sm leading-6 text-white/70">
          Sign in to get your funnel, ads, campaign launch path, and optimization workflow in one place.
        </p>
      </div>

      <div className="flex rounded-full bg-white/[0.04] p-1">
        <button
          className={`flex-1 rounded-full px-4 py-2 text-sm transition ${
            mode === "sign-in"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground"
          }`}
          onClick={() => setMode("sign-in")}
          type="button"
        >
          Sign in
        </button>
        <button
          className={`flex-1 rounded-full px-4 py-2 text-sm transition ${
            mode === "sign-up"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground"
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
              className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none"
            />
          </label>
        ) : null}

        <label className="block space-y-2">
          <span className="text-sm text-white/70">Email</span>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-white/70">Password</span>
          <input
            id="password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none"
          />
        </label>

        {mode === "sign-up" && turnstileEnabled ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div ref={turnstileContainerRef} />
            {!turnstileToken ? (
              <p className="mt-2 text-xs text-white/60">Complete the verification challenge before creating an account.</p>
            ) : null}
          </div>
        ) : null}

        {reason === "setup" ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
            Configure Supabase before accessing protected routes.
          </div>
        ) : null}

        {reason === "expired" ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white/70">
            Your session expired or could not be refreshed. Sign in again to continue.
          </div>
        ) : null}

        {!isConfigured ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
            Missing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
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
          className="h-12 w-full rounded-2xl bg-primary px-4 text-base font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!isConfigured || isPending}
          type="submit"
        >
          {actionLabel}
        </button>

        <button
          className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!isConfigured || isPending}
          onClick={() => handleProviderLogin("google")}
          type="button"
        >
          Continue with Google
        </button>
      </form>
    </div>
  );
}
