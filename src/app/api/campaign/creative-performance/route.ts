import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/route";
import {
  getCreativePerformanceSummaryForCampaign,
  getLatestCreativePerformanceSummary,
} from "@/lib/services/creative-performance-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    const summary = campaignId
      ? await getCreativePerformanceSummaryForCampaign(campaignId)
      : await getLatestCreativePerformanceSummary();

    return NextResponse.json({
      live: Boolean(summary),
      campaignId: campaignId ?? summary?.campaignId ?? null,
      summary,
      placeholder: !summary,
      message: summary
        ? null
        : "Creative performance is not live yet for this campaign.",
    });
  } catch (error) {
    return handleApiError(error, "Campaign creative performance");
  }
}
