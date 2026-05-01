import { z } from "zod";
import { NextResponse } from "next/server";
import { assertSameOriginRequest, handleApiError, parseOptionalJsonBody } from "@/lib/api/route";
import { evaluateAutonomy } from "@/app/api/autonomy/_shared";
import { assertActiveBillingFeatureAccess } from "@/lib/services/billing-service";
import {
  refreshCampaignActionSuggestions,
  updateCampaignActionSuggestionStatus,
} from "@/lib/services/campaign-action-service";

const bodySchema = z.object({
  campaignId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    await assertActiveBillingFeatureAccess("autonomy_access");
    const body = await parseOptionalJsonBody(request, bodySchema, {});
    const result = await evaluateAutonomy(body.campaignId ?? null);
    const suggestions = await refreshCampaignActionSuggestions().catch(() => []);
    const candidate = suggestions.find((suggestion) => suggestion.status === "suggested") ?? null;
    const appliedAction = candidate
      ? await updateCampaignActionSuggestionStatus({
          id: candidate.id,
          status: "approved",
        })
      : null;

    return NextResponse.json({
      ...result,
      executionMode: "autonomous_plan_operator",
      appliedAction,
      message: appliedAction
        ? "Autonomous operator applied one campaign-plan optimization."
        : "Autonomous operator found no safe optimization to apply.",
    });
  } catch (error) {
    return handleApiError(error, "Run autonomy");
  }
}
