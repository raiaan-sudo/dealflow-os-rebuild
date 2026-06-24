import { notFound } from "next/navigation";
import { PartnerAuthEntry } from "@/components/white-label/partner-auth-entry";
import { buildPartnerPageMetadata } from "@/lib/white-label/metadata";
import { resolvePartnerContextFromHeaders } from "@/lib/white-label/resolver";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const partnerContext = await resolvePartnerContextFromHeaders();

  return buildPartnerPageMetadata(partnerContext, {
    title: `${partnerContext.branding.brandName} Launch Portal`,
  });
}

export default async function CustomDomainStartPage() {
  const partnerContext = await resolvePartnerContextFromHeaders();

  if (partnerContext.nativeFallback || partnerContext.partnerStatus !== "active" || !partnerContext.verifiedDomain) {
    notFound();
  }

  return <PartnerAuthEntry partnerContext={partnerContext} />;
}
