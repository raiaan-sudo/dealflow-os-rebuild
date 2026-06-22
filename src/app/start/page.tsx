import { notFound } from "next/navigation";
import { PartnerAuthEntry } from "@/components/white-label/partner-auth-entry";
import { resolvePartnerContextFromHeaders } from "@/lib/white-label/resolver";

export default async function CustomDomainStartPage() {
  const partnerContext = await resolvePartnerContextFromHeaders();

  if (partnerContext.nativeFallback || partnerContext.partnerStatus !== "active" || !partnerContext.verifiedDomain) {
    notFound();
  }

  return <PartnerAuthEntry partnerContext={partnerContext} />;
}
