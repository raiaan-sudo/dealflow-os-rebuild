import { redirect } from "next/navigation";

export default async function ResultsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.trim()
      ? params.campaignId.trim()
      : null;

  redirect(
    campaignId
      ? `/dashboard?campaignId=${encodeURIComponent(campaignId)}`
      : "/dashboard",
  );
}
