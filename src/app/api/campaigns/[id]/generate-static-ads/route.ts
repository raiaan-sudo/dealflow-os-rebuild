import { assertSameOriginRequest, apiSuccess, handleApiError, parseOptionalJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { createSystemJob, listSystemJobs } from "@/lib/services/system-job-service";
import {
  consumeSessionCostBudget,
  markSessionCostBudgetEvent,
} from "@/lib/services/session-cost-guard";
import { z } from "zod";

const bodySchema = z.object({
  force: z.boolean().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const { id } = await context.params;
    const campaignId = id?.trim();
    const body = await parseOptionalJsonBody(request, bodySchema, {});

    if (!campaignId) {
      return Response.json({ error: "Campaign id is required." }, { status: 400 });
    }

    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "generate-static-ads", auth.userId),
      limit: 6,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const activeJobs = await listSystemJobs({
      userId: auth.userId,
      campaignId,
      kind: "static_creative_generation",
      statuses: ["pending", "processing"],
    });
    const existingActiveJob = activeJobs[0] ?? null;

    if (existingActiveJob && body.force !== true) {
      return apiSuccess({
        success: true,
        campaignId,
        job: existingActiveJob,
        reusedExistingJob: true,
      });
    }

    const idempotencyKey = `static_creative_generation:${auth.organizationId}:${auth.userId}:${campaignId}`;

    const budgetReservation = await consumeSessionCostBudget({
      bucket: "openai_image_generation",
      userId: auth.userId,
      organizationId: auth.organizationId,
      campaignId,
      idempotencyKey,
    });

    let job;

    try {
      job = await createSystemJob({
        organizationId: auth.organizationId,
        userId: auth.userId,
        campaignId,
        kind: "static_creative_generation",
        idempotencyKey,
        payload: {
          force: body.force === true,
        },
      });
      await markSessionCostBudgetEvent({
        eventId: budgetReservation.eventId,
        status: "consumed",
        metadata: {
          jobId: job.id,
          campaignId,
          operation: "static_creative_generation",
        },
      });
    } catch (error) {
      await markSessionCostBudgetEvent({
        eventId: budgetReservation.eventId,
        status: "released",
        metadata: {
          campaignId,
          operation: "static_creative_generation",
          reason: error instanceof Error ? error.message : "job_create_failed",
        },
      }).catch(() => null);
      throw error;
    }

    return apiSuccess({
      success: true,
      campaignId,
      job,
    });
  } catch (error) {
    return handleApiError(error, "Generate static ads");
  }
}
