import { redirect } from "next/navigation";
import { normalizeBillingPlanTier } from "@/lib/billing/plans";

export default async function ResultsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const plan =
    typeof params.plan === "string"
      ? normalizeBillingPlanTier(params.plan)
      : null;
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.trim()
      ? params.campaignId.trim()
      : null;

  if (plan) {
    redirect(plan === "pro" ? "/dashboard?plan=pro" : "/dashboard?plan=starter");
  }

  redirect(
    campaignId
      ? `/dashboard?campaignId=${encodeURIComponent(campaignId)}`
      : "/dashboard",
  );
}
