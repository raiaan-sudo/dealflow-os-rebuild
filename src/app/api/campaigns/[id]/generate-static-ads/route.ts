import { apiSuccess, handleApiError, parseOptionalJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { createSystemJob, listSystemJobs } from "@/lib/services/system-job-service";
import { consumeSessionCostBudget } from "@/lib/services/session-cost-guard";
import { z } from "zod";

const bodySchema = z.object({
  force: z.boolean().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
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

    await consumeSessionCostBudget({
      bucket: "openai_image_generation",
      userId: auth.userId,
      campaignId,
    });

    const job = await createSystemJob({
      organizationId: auth.organizationId,
      userId: auth.userId,
      campaignId,
      kind: "static_creative_generation",
      payload: {
        force: body.force === true,
      },
    });

    return apiSuccess({
      success: true,
      campaignId,
      job,
    });
  } catch (error) {
    return handleApiError(error, "Generate static ads");
  }
}
