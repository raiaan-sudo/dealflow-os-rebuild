import { z } from "zod";
import { NextResponse } from "next/server";
import { assertSameOriginRequest, handleApiError, parseOptionalJsonBody } from "@/lib/api/route";
import {
  assertAutonomyExecutionAccess,
  evaluateAutonomy,
} from "@/app/api/autonomy/_shared";
import { executeAutonomyPlanWithSyntheticAdapter } from "@/lib/services/autonomy-execution-service";

const bodySchema = z.object({
  campaignId: z.string().min(1).optional(),
  mode: z.enum(["manual", "assisted", "auto", "autonomous"]).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const body = await parseOptionalJsonBody(request, bodySchema, {});
    const result = await evaluateAutonomy(body.campaignId ?? null, { mode: body.mode ?? "auto" });
    await assertAutonomyExecutionAccess(result.campaignId);
    const executionPlan = await executeAutonomyPlanWithSyntheticAdapter(result.executionPlan, {
      async applySafeAction(action) {
        return {
          mutationId: `synthetic-meta-${action.idempotencyKey.split(":").pop()}`,
          applied: true,
          mode: "synthetic",
          summary:
            "Synthetic Meta adapter recorded a safe internal autonomy action. No real Meta, provider, SMS, or Stripe call was made.",
        };
      },
    });

    return NextResponse.json({
      ...result,
      executionPlan,
      executionQueue: executionPlan.executionQueue,
      appliedExecutionActions: executionPlan.appliedExecutionActions,
      blockedExecutionActions: executionPlan.blockedExecutionActions,
      executionMode: "synthetic_safe_actions_only",
    });
  } catch (error) {
    return handleApiError(error, "Run autonomy");
  }
}
