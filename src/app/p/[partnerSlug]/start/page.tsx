import { notFound } from "next/navigation";
import { PartnerAuthEntry } from "@/components/white-label/partner-auth-entry";
import { resolvePartnerContextBySlug } from "@/lib/white-label/resolver";

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
