import { redirect } from "next/navigation";
import { buildOnboardingHref } from "@/lib/routing/campaign-routes";

export default async function BuildFunnelPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0
      ? params.campaignId
      : null;

  redirect(buildOnboardingHref(campaignId));
}
