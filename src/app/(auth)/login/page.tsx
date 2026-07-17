import type { Metadata } from "next";
import { headers } from "next/headers";
import { hasSupabaseEnv } from "@/lib/env";
import { LoginForm } from "@/components/auth/login-form";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { translateProductMessage } from "@/lib/i18n/messages";
import { parseProductLocalePathname } from "@/lib/i18n/routing";
import {
  loadVerifiedPartnerDomainContext,
  verifyPartnerAttributionToken,
} from "@/lib/white-label/verified-partner-domain";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = parseProductLocalePathname(
    requestHeaders.get("x-pathname") ?? "/login",
  ).locale;
  return { title: translateProductMessage(locale, "auth.signIn") };
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
  const reason =
    resolvedSearchParams && typeof resolvedSearchParams.reason === "string"
      ? resolvedSearchParams.reason
      : undefined;
  const requestedMode =
    resolvedSearchParams && typeof resolvedSearchParams.mode === "string"
      ? resolvedSearchParams.mode
      : null;
  const initialMode =
    requestedMode === "sign-up" ||
    requestedMode === "reset-password" ||
    requestedMode === "update-password"
      ? requestedMode
      : "sign-in";
  const requestHeaders = await headers();
  const locale = parseProductLocalePathname(
    requestHeaders.get("x-pathname") ?? "/login",
  ).locale;
  const t = (key: Parameters<typeof translateProductMessage>[1]) =>
    translateProductMessage(locale, key);
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
        {t("common.skip.signIn")}
      </a>
      <main
        id="auth-content"
        tabIndex={-1}
        className="mx-auto flex min-h-screen w-full max-w-[560px] items-center px-5 py-10 sm:px-6"
      >
        <div className="w-full space-y-4">
          <div className="flex justify-end">
            <LocaleSwitcher compact />
          </div>
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
        </div>
      </main>
    </>
  );
}
