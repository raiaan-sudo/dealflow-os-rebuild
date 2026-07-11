import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const redirectedFrom =
    resolvedSearchParams && typeof resolvedSearchParams.redirectedFrom === "string"
      ? resolvedSearchParams.redirectedFrom
      : undefined;
  const requestedPlan =
    resolvedSearchParams &&
    typeof resolvedSearchParams.plan === "string" &&
    ["starter", "pro", "growth"].includes(resolvedSearchParams.plan)
      ? resolvedSearchParams.plan
      : undefined;
  const planRedirect = requestedPlan ? `/dashboard?plan=${requestedPlan}` : undefined;
  const reason =
    resolvedSearchParams && typeof resolvedSearchParams.reason === "string"
      ? resolvedSearchParams.reason
      : undefined;
  const initialMode =
    resolvedSearchParams && resolvedSearchParams.mode === "sign-up"
      ? "sign-up"
      : "sign-in";

  return (
    <>
      <a className="df-skip-link" href="#auth-content">
        Skip to sign in
      </a>
      <main
        id="auth-content"
        tabIndex={-1}
        className="mx-auto flex min-h-screen w-full max-w-[560px] items-center px-5 py-10 sm:px-6"
      >
        <LoginForm
          redirectedFrom={redirectedFrom ?? planRedirect}
          reason={reason}
          isConfigured={hasSupabaseEnv()}
          initialMode={initialMode}
        />
      </main>
    </>
  );
}
