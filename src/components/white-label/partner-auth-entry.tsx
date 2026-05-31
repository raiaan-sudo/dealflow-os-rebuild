import { LoginForm } from "@/components/auth/login-form";
import { hasSupabaseEnv } from "@/lib/env";
import type { PartnerContext } from "@/lib/white-label/types";

type PartnerAuthEntryProps = {
  partnerContext: PartnerContext;
  inviteCode?: string | null;
};

export function PartnerAuthEntry({ partnerContext, inviteCode }: PartnerAuthEntryProps) {
  const redirectedFrom = partnerContext.nativeFallback
    ? "/welcome?fresh=1"
    : `/welcome?fresh=1&partner=${encodeURIComponent(partnerContext.partnerSlug ?? "")}`;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] items-center px-5 py-10 sm:px-6">
      <LoginForm
        redirectedFrom={redirectedFrom}
        initialMode="sign-up"
        isConfigured={hasSupabaseEnv()}
        branding={partnerContext.branding}
        partnerAttribution={{
          partnerSlug: partnerContext.partnerSlug,
          inviteCode,
          source: partnerContext.attributionSource,
        }}
      />
    </div>
  );
}
