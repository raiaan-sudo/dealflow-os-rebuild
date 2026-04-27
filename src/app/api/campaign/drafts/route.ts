import { z } from "zod";
import { NextResponse } from "next/server";
import { handleApiError, parseJsonBody } from "@/lib/api/route";
import {
  getCampaignDraftActions,
  refreshCampaignDraftActions,
  updateCampaignDraftActionStatus,
} from "@/lib/services/campaign-draft-action-service";

const bodySchema = z.object({
  id: z.string().min(1),
  status: z.enum(["approved", "dismissed"]),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    const refresh = url.searchParams.get("refresh") === "true";
    const drafts = refresh
      ? await refreshCampaignDraftActions()
      : await getCampaignDraftActions(campaignId);

    return NextResponse.json({
      live: true,
      campaignId: campaignId ?? null,
      drafts,
    });
  } catch (error) {
    return handleApiError(error, "Campaign drafts");
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await parseJsonBody(request, bodySchema);
    const draft = await updateCampaignDraftActionStatus(body);

    return NextResponse.json({
      live: true,
      draft,
    });
  } catch (error) {
    return handleApiError(error, "Campaign drafts");
  }
}
