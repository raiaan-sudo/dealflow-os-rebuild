import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import {
  assertAutonomyExecutionAccess,
  evaluateAutonomy,
  updateCampaignAutonomyMode,
} from "@/app/api/autonomy/_shared";

export const dynamic = "force-dynamic";

const patchBodySchema = z.object({
  mode: z.enum(["manual", "assisted", "auto", "autonomous"]),
  campaignId: z.string().min(1).optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    const result = await evaluateAutonomy(campaignId);

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "Autonomy");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginRequest(request);
    const body = await parseJsonBody(request, patchBodySchema);
    const result = await evaluateAutonomy(body.campaignId ?? null, { mode: body.mode });

    if (body.mode !== "manual") {
      await assertAutonomyExecutionAccess(result.campaignId);
    }

    await updateCampaignAutonomyMode({
      organizationId: result.executionPlan.campaign.organizationId,
      campaignId: result.campaignId,
      mode: body.mode,
    });

    return NextResponse.json({
      ...result,
      snapshot: {
        ...result.snapshot,
        mode: body.mode,
      },
      message:
        body.mode === "auto" || body.mode === "autonomous"
          ? "Autonomous execution can apply safe internal actions only when the autopilot safe-action flag is enabled. High-impact actions still require approval."
          : "Autonomy mode updated for this session.",
    });
  } catch (error) {
    return handleApiError(error, "Autonomy");
  }
}
