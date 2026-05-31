import { assertSameOriginRequest, apiSuccess, handleApiError, parseOptionalJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { logWarn } from "@/lib/logging";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import {
  isLaunchReadyStaticCreative,
  STATIC_LAUNCH_MIN_CREATIVE_COUNT,
} from "@/lib/services/creative-media-readiness";
import {
  creativeIntakeIncludesStatic,
  getApprovedCreativeIntakeGenerationContext,
  hasSameCreativeIntakeGenerationContext,
  isCreativeChatIntakeEnabled,
} from "@/lib/services/creative-chat-intake-service";
import { assertGenerationCreditsAvailableForUser } from "@/lib/services/credit-service";
import { isMarketingStudioStaticGenerationPayload } from "@/lib/services/marketing-studio-worker-contract";
import { createSystemJob, listSystemJobs } from "@/lib/services/system-job-service";
import { z } from "zod";

export const maxDuration = 800;

const bodySchema = z.object({
  force: z.boolean().optional(),
  missingOnly: z.boolean().optional(),
  maxGenerations: z.number().int().min(1).max(6).optional(),
});

function scheduleStaticCreativeJob(
  jobId: string,
  payload?: { creativeIntake?: unknown } | null,
) {
  if (isMarketingStudioStaticGenerationPayload(payload)) {
    logWarn("Static creative generation deferred to Marketing Studio worker", {
      jobId,
      runtime: "marketing_studio_cli_worker",
    });
    return;
  }

  logWarn("Static creative generation queued for claimed worker processing", {
    jobId,
    runtime: "system_job_worker",
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

    let creativeIntakeContext = null;

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

      creativeIntakeContext = getApprovedCreativeIntakeGenerationContext(intakeRow.plan);

      if (!creativeIntakeContext) {
        return Response.json(
          {
            error: "Review and approve the creative brief before rendering paid image previews.",
            code: "creative_brief_review_required",
          },
          { status: 409 },
        );
      }

      if (!creativeIntakeIncludesStatic(creativeIntakeContext.generationPhase)) {
        return Response.json(
          {
            error: "The approved creative brief is scoped to video generation only. Approve a static or combined creative brief before rendering image previews.",
            code: "creative_generation_phase_mismatch",
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

    const staticBriefReadinessContext = creativeIntakeContext
      ? {
          staticBriefHash: creativeIntakeContext.staticBriefHash,
          offerHash: creativeIntakeContext.offerHash,
          ctaHash: creativeIntakeContext.ctaHash,
          brandHash: creativeIntakeContext.brandHash,
        }
      : null;
    const launchReadyStaticCount = campaign.creatives.staticAds
      .filter((creative) => isLaunchReadyStaticCreative(creative, staticBriefReadinessContext))
      .length;
    const missingLaunchReadyFloorCount = Math.max(0, STATIC_LAUNCH_MIN_CREATIVE_COUNT - launchReadyStaticCount);
    let previewUpdated = false;

    const maxGenerations = body.maxGenerations ??
      (body.missingOnly === true
        ? Math.min(6, Math.max(2, missingLaunchReadyFloorCount))
        : undefined);

    await assertGenerationCreditsAvailableForUser({
      bucket: "image_generation",
      userId: auth.userId,
      organizationId: auth.organizationId,
      campaignId,
      quantity: maxGenerations ?? 6,
    });

    const activeJobs = await listSystemJobs({
      userId: auth.userId,
      campaignId,
      kind: "static_creative_generation",
      statuses: ["pending", "processing"],
    });
    const existingActiveJob =
      activeJobs.find((job) => {
        const payload = job.payload as { creativeIntake?: typeof creativeIntakeContext };
        return (
          isMarketingStudioStaticGenerationPayload(job.payload) &&
          (
            !creativeIntakeContext ||
            hasSameCreativeIntakeGenerationContext(payload.creativeIntake, creativeIntakeContext)
          )
        );
      }) ?? null;

    if (existingActiveJob && body.force !== true) {
      scheduleStaticCreativeJob(existingActiveJob.id, existingActiveJob.payload as { creativeIntake?: unknown });

      return apiSuccess({
        success: true,
        campaignId,
        job: existingActiveJob,
        reusedExistingJob: true,
        previewUpdated,
      });
    }

    const requestScope = body.force === true
      ? `force:${crypto.randomUUID()}`
      : [
          "finished",
          creativeIntakeContext?.staticBriefHash ?? creativeIntakeContext?.briefHash ?? "brief",
          creativeIntakeContext?.offerHash ?? "offer",
          creativeIntakeContext?.ctaHash ?? "cta",
          creativeIntakeContext?.brandHash ?? "brand",
          `window:${Math.floor(Date.now() / (10 * 60_000))}`,
        ].join(":");
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
        targetVariantCount: 6,
        promoteThreshold: STATIC_LAUNCH_MIN_CREATIVE_COUNT,
        outputMode: "finished_ad",
        provider: "higgsfield_marketing_studio",
        creativeIntake: creativeIntakeContext,
        ...(maxGenerations ? { maxGenerations } : {}),
      },
    });
    scheduleStaticCreativeJob(job.id, job.payload as { creativeIntake?: unknown });

    return apiSuccess({
      success: true,
      campaignId,
      job,
      previewUpdated,
    });
  } catch (error) {
    return handleApiError(error, "Generate static ads");
  }
}
