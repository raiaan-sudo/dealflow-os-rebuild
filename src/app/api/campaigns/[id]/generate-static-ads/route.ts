import { assertSameOriginRequest, apiSuccess, handleApiError, parseOptionalJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { logWarn } from "@/lib/logging";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import {
  isCreativeChatIntakeEnabled,
  isCreativeIntakeApproved,
} from "@/lib/services/creative-chat-intake-service";
import { createSystemJob, listSystemJobs, processSystemJob } from "@/lib/services/system-job-service";
import { after } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  force: z.boolean().optional(),
  missingOnly: z.boolean().optional(),
  maxGenerations: z.number().int().min(1).max(6).optional(),
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

    if (isCreativeChatIntakeEnabled()) {
      const { data, error } = await auth.supabase
        .from("campaign_plans")
        .select("plan,user_id,organization_id")
        .eq("id", campaignId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const intakeRow = data as { plan?: unknown; user_id?: string | null; organization_id?: string | null } | null;

      if (!intakeRow || (intakeRow.user_id !== auth.userId && intakeRow.organization_id !== auth.organizationId)) {
        return Response.json({ error: "Campaign not found." }, { status: 404 });
      }

      if (!isCreativeIntakeApproved(intakeRow.plan)) {
        return Response.json(
          {
            error: "Review and approve the creative brief before rendering paid image previews.",
            code: "creative_brief_review_required",
          },
          { status: 409 },
        );
      }
    }

    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "generate-static-ads", `${auth.organizationId}:${auth.userId}:${campaignId}`),
      limit: 6,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const maxGenerations = body.maxGenerations ?? (body.missingOnly === true ? 2 : undefined);

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
      : body.missingOnly === true
        ? `missing:${crypto.randomUUID()}`
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
        missingOnly: body.missingOnly === true,
        ...(maxGenerations ? { maxGenerations } : {}),
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
