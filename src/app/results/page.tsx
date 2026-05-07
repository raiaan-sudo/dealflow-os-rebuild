import { redirect } from "next/navigation";

export default async function ResultsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0
      ? params.campaignId
      : null;

  redirect(campaignId ? `/dashboard?campaignId=${encodeURIComponent(campaignId)}` : "/dashboard");
}
