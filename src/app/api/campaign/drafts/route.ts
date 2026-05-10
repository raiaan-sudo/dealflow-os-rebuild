import { z } from "zod";
import { NextResponse } from "next/server";
import { assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
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
    const drafts = await getCampaignDraftActions(campaignId);

    return NextResponse.json({
      live: true,
      campaignId: campaignId ?? null,
      drafts,
    });
  } catch (error) {
    return handleApiError(error, "Campaign drafts");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "campaign-drafts-refresh"),
      limit: 6,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const drafts = await refreshCampaignDraftActions();

    return NextResponse.json({
      live: true,
      drafts,
    });
  } catch (error) {
    return handleApiError(error, "Campaign drafts");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginRequest(request);
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
