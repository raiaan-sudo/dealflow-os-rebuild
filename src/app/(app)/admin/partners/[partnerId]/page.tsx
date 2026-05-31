import { PartnerDetailDashboard } from "@/components/white-label/platform-partners-admin";

export default async function AdminPartnerDetailPage({
  params,
}: {
  params: Promise<{ partnerId: string }>;
}) {
  const { partnerId } = await params;
  return <PartnerDetailDashboard partnerId={partnerId} />;
}
