import { z } from "zod";
import { NextResponse } from "next/server";
import { assertSameOriginRequest, handleApiError, parseOptionalJsonBody } from "@/lib/api/route";
import { evaluateAutonomy } from "@/app/api/autonomy/_shared";

const bodySchema = z.object({
  campaignId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const body = await parseOptionalJsonBody(request, bodySchema, {});
    const result = await evaluateAutonomy(body.campaignId ?? null, {
      persistDecision: true,
    });

    return NextResponse.json({
      ...result,
      executionMode: "recommendation_only",
    });
  } catch (error) {
    return handleApiError(error, "Run autonomy");
  }
}
