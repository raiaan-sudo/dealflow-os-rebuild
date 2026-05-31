import { notFound, redirect } from "next/navigation";
import { resolvePartnerContextBySlug } from "@/lib/white-label/resolver";

export default async function PartnerShortStartPage({
  params,
}: {
  params: Promise<{ partnerSlug: string }>;
}) {
  const { partnerSlug } = await params;
  const partnerContext = await resolvePartnerContextBySlug(partnerSlug);

  if (partnerContext.nativeFallback || partnerContext.partnerStatus !== "active") {
    notFound();
  }

  redirect(`/p/${encodeURIComponent(partnerSlug)}/start`);
}
