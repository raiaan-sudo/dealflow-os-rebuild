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
  const reason =
    resolvedSearchParams && typeof resolvedSearchParams.reason === "string"
      ? resolvedSearchParams.reason
      : undefined;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-[520px] items-center py-10">
      <LoginForm
        redirectedFrom={redirectedFrom}
        reason={reason}
        isConfigured={hasSupabaseEnv()}
      />
    </div>
  );
}
