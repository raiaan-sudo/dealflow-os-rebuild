import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/route";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import {
  getCampaignLaunchRecordForCampaign,
  getLatestCampaignLaunchRecord,
} from "@/lib/services/campaign-launch-audit-service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");

    if (campaignId) {
      const record = await getCampaignById(campaignId);
      const plan = record ? canonicalCampaignToPlan(record) : null;
      const launchAudit = plan
        ? await getCampaignLaunchRecordForCampaign({
            campaignName: plan.businessName,
            metaCampaignId: plan.runtime.campaignId,
          })
        : null;

      return NextResponse.json({
        live: true,
        campaignId,
        launchAudit,
      });
    }

    const launchAudit = await getLatestCampaignLaunchRecord();
    return NextResponse.json({
      live: true,
      campaignId: null,
      launchAudit,
    });
  } catch (error) {
    return handleApiError(error, "Campaign launch audit");
  }
}
