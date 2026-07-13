import type { Metadata } from "next";
import { headers } from "next/headers";
import { hasSupabaseEnv } from "@/lib/env";
import { LoginForm } from "@/components/auth/login-form";
import {
  loadVerifiedPartnerDomainContext,
  verifyPartnerAttributionToken,
} from "@/lib/white-label/verified-partner-domain";

export const metadata: Metadata = {
  title: "Sign in",
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
  const initialMode =
    resolvedSearchParams && resolvedSearchParams.mode === "sign-up"
      ? "sign-up"
      : "sign-in";
  const requestHeaders = await headers();
  const verifiedPartnerDomain = requestHeaders.get("x-dealflow-verified-partner-domain");
  const partnerContext = verifiedPartnerDomain
    ? await loadVerifiedPartnerDomainContext(verifiedPartnerDomain)
    : null;
  const partnerAttributionToken = requestHeaders.get("x-dealflow-partner-attribution");
  const partnerAttribution = partnerContext && partnerAttributionToken
    ? await verifyPartnerAttributionToken(partnerAttributionToken, {
        expectedDomain: partnerContext.domain,
      })
    : null;
  const hasBoundPartnerAttribution = Boolean(
    partnerContext &&
    partnerAttribution &&
    partnerAttribution.partnerId === partnerContext.partnerId &&
    partnerAttribution.partnerSlug === partnerContext.partnerSlug,
  );

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
          redirectedFrom={redirectedFrom}
          reason={reason}
          isConfigured={hasSupabaseEnv()}
          initialMode={initialMode}
          branding={partnerContext?.branding}
          partnerAttribution={hasBoundPartnerAttribution ? {
            partnerSlug: partnerContext?.partnerSlug ?? null,
            bindingToken: partnerAttributionToken,
            source: "domain",
          } : undefined}
        />
      </main>
    </>
  );
}
