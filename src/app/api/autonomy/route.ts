import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { evaluateAutonomy } from "@/app/api/autonomy/_shared";
import { assertActiveBillingFeatureAccess } from "@/lib/services/billing-service";

export const dynamic = "force-dynamic";

const patchBodySchema = z.object({
  mode: z.enum(["manual", "assisted", "autonomous"]),
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

    if (body.mode === "autonomous") {
      await assertActiveBillingFeatureAccess("autonomy_access");
    }

    const result = await evaluateAutonomy(body.campaignId ?? null);

    return NextResponse.json({
      ...result,
      snapshot: {
        ...result.snapshot,
        mode: body.mode,
      },
      executionMode: body.mode === "autonomous" ? "autonomous_plan_operator" : "recommendation_only",
      message:
        body.mode === "autonomous"
          ? "Autonomous plan optimization is enabled for this workspace."
          : "Autonomy mode updated for this session.",
    });
  } catch (error) {
    return handleApiError(error, "Autonomy");
  }
}
