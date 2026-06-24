import { notFound } from "next/navigation";
import { PartnerAuthEntry } from "@/components/white-label/partner-auth-entry";
import { buildPartnerPageMetadata } from "@/lib/white-label/metadata";
import { resolvePartnerContextBySlug } from "@/lib/white-label/resolver";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ partnerSlug: string }>;
}): Promise<Metadata> {
  const { partnerSlug } = await params;
  const partnerContext = await resolvePartnerContextBySlug(partnerSlug);

  if (partnerContext.nativeFallback || partnerContext.partnerStatus !== "active") {
    return {};
  }

  return buildPartnerPageMetadata(partnerContext, {
    title: `${partnerContext.branding.brandName} Launch Portal`,
  });
}

export default async function PartnerStartPage({
  params,
}: {
  params: Promise<{ partnerSlug: string }>;
}) {
  const { partnerSlug } = await params;
  const partnerContext = await resolvePartnerContextBySlug(partnerSlug);

  if (partnerContext.nativeFallback || partnerContext.partnerStatus !== "active") {
    notFound();
  }

  return <PartnerAuthEntry partnerContext={partnerContext} />;
}
