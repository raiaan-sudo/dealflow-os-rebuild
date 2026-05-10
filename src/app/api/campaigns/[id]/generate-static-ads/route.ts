import { assertSameOriginRequest, apiSuccess, handleApiError, parseOptionalJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { logWarn } from "@/lib/logging";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { createSystemJob, listSystemJobs, processSystemJob } from "@/lib/services/system-job-service";
import { after } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  force: z.boolean().optional(),
});

function scheduleStaticCreativeJob(jobId: string) {
  after(async () => {
    try {
      await processSystemJob(jobId);
    } catch (error) {
      logWarn("Static creative generation kickoff failed", {
        jobId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}

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

    const campaign = await getCampaignById(campaignId);

    if (!campaign) {
      return Response.json({ error: "Campaign not found." }, { status: 404 });
    }

    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "generate-static-ads", `${auth.organizationId}:${auth.userId}:${campaignId}`),
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

    if (existingActiveJob) {
      scheduleStaticCreativeJob(existingActiveJob.id);

      return apiSuccess({
        success: true,
        campaignId,
        job: existingActiveJob,
        reusedExistingJob: true,
      });
    }

    const requestScope = body.force === true
      ? `force:${crypto.randomUUID()}`
      : `attempt:${Date.now()}`;
    const idempotencyKey = `static_creative_generation:${auth.organizationId}:${auth.userId}:${campaignId}:${requestScope}`;

    const job = await createSystemJob({
      organizationId: auth.organizationId,
      userId: auth.userId,
      campaignId,
      kind: "static_creative_generation",
      idempotencyKey,
      payload: {
        force: body.force === true,
      },
    });
    scheduleStaticCreativeJob(job.id);

    return apiSuccess({
      success: true,
      campaignId,
      job,
    });
  } catch (error) {
    return handleApiError(error, "Generate static ads");
  }
}
