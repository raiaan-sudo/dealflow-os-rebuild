import { redirect } from "next/navigation";
import { getRequestProductI18n } from "@/lib/i18n/server";

export default async function ResultsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { href } = await getRequestProductI18n();
  const params = searchParams ? await searchParams : {};
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.trim()
      ? params.campaignId.trim()
      : null;

  redirect(href(
    campaignId
      ? `/dashboard?campaignId=${encodeURIComponent(campaignId)}`
      : "/dashboard",
  ));
}
