import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/route";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { getCampaignRuntimeSnapshot } from "@/lib/services/campaign-runtime-service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");

    if (campaignId) {
      const record = await getCampaignById(campaignId);
      const plan = record ? canonicalCampaignToPlan(record) : null;

      return NextResponse.json({
        live: Boolean(plan),
        campaignId,
        runtime: plan?.runtime ?? null,
        placeholder: !plan,
        message: plan ? null : "Campaign runtime is not live for this campaign yet.",
      });
    }

    const snapshot = await getCampaignRuntimeSnapshot();
    return NextResponse.json({
      live: Boolean(snapshot),
      campaignId: snapshot?.plan.id ?? null,
      runtime: snapshot?.runtime ?? null,
      placeholder: !snapshot,
      message: snapshot ? null : "Campaign runtime is not live yet.",
    });
  } catch (error) {
    return handleApiError(error, "Campaign runtime");
  }
}
