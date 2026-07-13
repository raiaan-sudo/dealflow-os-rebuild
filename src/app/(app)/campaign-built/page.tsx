import { redirect } from "next/navigation";
import { buildCampaignScopedPath } from "@/lib/paywall-access";
import { getRequestProductI18n } from "@/lib/i18n/server";

export default async function CampaignBuiltPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { href } = await getRequestProductI18n();
  const params = searchParams ? await searchParams : {};
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0
      ? params.campaignId
      : null;

  redirect(href(buildCampaignScopedPath("/preview", campaignId)));
}
