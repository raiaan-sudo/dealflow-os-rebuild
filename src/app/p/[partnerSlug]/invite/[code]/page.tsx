import { notFound } from "next/navigation";
import { PartnerAuthEntry } from "@/components/white-label/partner-auth-entry";
import { isInviteUsableForPartner, resolvePartnerContextBySlug } from "@/lib/white-label/resolver";

export default async function PartnerInvitePage({
  params,
}: {
  params: Promise<{ partnerSlug: string; code: string }>;
}) {
  const { partnerSlug, code } = await params;
  const partnerContext = await resolvePartnerContextBySlug(partnerSlug, code);

  if (
    partnerContext.nativeFallback ||
    partnerContext.partnerStatus !== "active" ||
    !partnerContext.partnerId ||
    !(await isInviteUsableForPartner(partnerContext.partnerId, code))
  ) {
    notFound();
  }

  return <PartnerAuthEntry partnerContext={partnerContext} inviteCode={code} />;
}
