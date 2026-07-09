import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/services/app-context";

export default async function BuilderPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const context = await getAppContext();

  if (!context) {
    redirect("/login?redirectedFrom=%2Fbuilder&reason=expired");
  }

  const params = new URLSearchParams();
  if (resolvedSearchParams && typeof resolvedSearchParams.campaignId === "string") {
    params.set("campaignId", resolvedSearchParams.campaignId);
  }

  redirect(`/onboarding${params.size ? `?${params.toString()}` : ""}`);
}
