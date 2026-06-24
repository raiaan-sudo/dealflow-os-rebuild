import { hasSupabaseEnv } from "@/lib/env";
import { LoginForm } from "@/components/auth/login-form";
import { buildPartnerPageMetadata } from "@/lib/white-label/metadata";
import { resolvePartnerContextFromHeaders } from "@/lib/white-label/resolver";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const partnerContext = await resolvePartnerContextFromHeaders();

  return buildPartnerPageMetadata(partnerContext, {
    title: partnerContext.nativeFallback
      ? "Sign in | DealFlow OS"
      : `Sign in to ${partnerContext.branding.brandName}`,
    description: partnerContext.nativeFallback
      ? "Sign in to DealFlow OS to continue your campaign workspace."
      : partnerContext.branding.loginSubheadline,
    fallbackTitle: "Sign in | DealFlow OS",
    fallbackDescription: "Sign in to DealFlow OS to continue your campaign workspace.",
  });
}

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
  const emailConfirmed =
    resolvedSearchParams && resolvedSearchParams.confirmed === "1";
  const reason =
    emailConfirmed
      ? "confirmed"
      : resolvedSearchParams && typeof resolvedSearchParams.reason === "string"
        ? resolvedSearchParams.reason
        : undefined;
  const initialMode =
    resolvedSearchParams && resolvedSearchParams.mode === "sign-up"
      ? "sign-up"
      : resolvedSearchParams && resolvedSearchParams.mode === "reset-password"
        ? "reset-password"
        : "sign-in";
  const partnerContext = await resolvePartnerContextFromHeaders();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] items-center px-5 py-10 sm:px-6">
      <LoginForm
        redirectedFrom={redirectedFrom}
        reason={reason}
        initialMode={initialMode}
        isConfigured={hasSupabaseEnv()}
        branding={partnerContext.branding}
        partnerAttribution={{
          partnerSlug: partnerContext.partnerSlug,
          source: partnerContext.attributionSource,
        }}
      />
    </div>
  );
}
