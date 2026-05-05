import { hasSupabaseEnv } from "@/lib/env";
import { LoginForm } from "@/components/auth/login-form";

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
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] items-center px-5 py-10 sm:px-6">
      <LoginForm
        redirectedFrom={redirectedFrom ?? planRedirect}
        reason={reason}
        isConfigured={hasSupabaseEnv()}
        initialMode={initialMode}
      />
    </div>
  );
}
