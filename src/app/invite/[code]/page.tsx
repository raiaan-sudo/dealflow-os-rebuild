import { notFound } from "next/navigation";
import { PartnerAuthEntry } from "@/components/white-label/partner-auth-entry";
import { isInviteUsableForPartner, resolvePartnerContextFromHeaders } from "@/lib/white-label/resolver";

export default async function CustomDomainInvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const partnerContext = await resolvePartnerContextFromHeaders();

  if (
    partnerContext.nativeFallback ||
    partnerContext.partnerStatus !== "active" ||
    !partnerContext.verifiedDomain ||
    !partnerContext.partnerId ||
    !(await isInviteUsableForPartner(partnerContext.partnerId, code))
  ) {
    notFound();
  }

  return <PartnerAuthEntry partnerContext={partnerContext} inviteCode={code} />;
}
