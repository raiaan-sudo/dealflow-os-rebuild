import { hasSupabaseEnv } from "@/lib/env";
import { LoginForm } from "@/components/auth/login-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to DealFlow OS to continue your campaign workspace.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const redirectedFrom =
    resolvedSearchParams && typeof resolvedSearchParams.redirectedFrom === "string"
      ? resolvedSearchParams.redirectedFrom
      : undefined;
  const reason =
    resolvedSearchParams && typeof resolvedSearchParams.reason === "string"
      ? resolvedSearchParams.reason
      : undefined;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] items-center px-5 py-10 sm:px-6">
      <LoginForm
        redirectedFrom={redirectedFrom}
        reason={reason}
        isConfigured={hasSupabaseEnv()}
      />
    </div>
  );
}
