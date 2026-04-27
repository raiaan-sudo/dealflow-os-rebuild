import { z } from "zod";
import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/lib/api/route";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import {
  getCampaignActionSuggestions,
  refreshCampaignActionSuggestions,
  updateCampaignActionSuggestionStatus,
} from "@/lib/services/campaign-action-service";

const bodySchema = z.object({
  id: z.string().min(1),
  status: z.enum(["approved", "dismissed"]),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    const refresh = url.searchParams.get("refresh") === "true";
    const record = campaignId ? await getCampaignById(campaignId) : null;
    const plan = record ? canonicalCampaignToPlan(record) : null;
    const metaCampaignId = plan?.runtime.campaignId ?? null;
    const actions = refresh
      ? await refreshCampaignActionSuggestions()
      : await getCampaignActionSuggestions(metaCampaignId);

    return NextResponse.json({
      live: true,
      campaignId: campaignId ?? null,
      metaCampaignId,
      actions,
    });
  } catch (error) {
    return handleApiError(error, "Campaign actions");
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await parseJsonBody(request, bodySchema);
    const action = await updateCampaignActionSuggestionStatus(body);

    return NextResponse.json({
      live: true,
      action,
    });
  } catch (error) {
    return handleApiError(error, "Campaign actions");
  }
}
