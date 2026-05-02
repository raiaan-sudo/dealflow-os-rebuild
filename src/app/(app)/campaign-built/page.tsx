import { redirect } from "next/navigation";
import { buildCampaignScopedPath } from "@/lib/paywall-access";

export default async function CampaignBuiltPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0
      ? params.campaignId
      : null;

  redirect(buildCampaignScopedPath("/preview", campaignId));
}
