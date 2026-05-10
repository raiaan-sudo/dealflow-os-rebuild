import { z } from "zod";
import { NextResponse } from "next/server";
import { assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
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
    const record = campaignId ? await getCampaignById(campaignId) : null;
    const plan = record ? canonicalCampaignToPlan(record) : null;
    const metaCampaignId = plan?.runtime.campaignId ?? null;
    const actions = await getCampaignActionSuggestions(metaCampaignId);

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

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "campaign-actions-refresh"),
      limit: 6,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const actions = await refreshCampaignActionSuggestions();

    return NextResponse.json({
      live: true,
      actions,
    });
  } catch (error) {
    return handleApiError(error, "Campaign actions");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginRequest(request);
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
