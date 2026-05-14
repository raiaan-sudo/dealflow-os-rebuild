import { assertSameOriginRequest, handleApiError, parseOptionalJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { logWarn } from "@/lib/logging";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import {
  getApprovedCreativeIntakeGenerationContext,
  hasSameCreativeIntakeGenerationContext,
  isCreativeChatIntakeEnabled,
} from "@/lib/services/creative-chat-intake-service";
import { getAvatarVideoProvider } from "@/lib/integrations/creative/avatar-provider";
import { createSystemJob, listSystemJobs } from "@/lib/services/system-job-service";
import type { SystemJobRecord } from "@/lib/services/system-job-service";
import type { VideoGenerationJobPayload } from "@/lib/services/video-generation-job";
import { z } from "zod";

const bodySchema = z.object({
  creativeIndex: z.number().int().min(0).max(9).default(0),
  force: z.boolean().optional(),
});

function scheduleVideoGenerationJob(jobId: string) {
  logWarn("Video generation queued for claimed worker processing", {
    jobId,
    runtime: "system_job_worker",
  });
}

function getVideoProviderReadiness() {
  const provider = getAvatarVideoProvider();
  const validation = provider.validateConfig();
  const generationEnabled =
    provider.name === "higgsfield"
      ? process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION === "true"
      : provider.name === "heygen"
        ? process.env.ALLOW_HEYGEN_VIDEO_GENERATION === "true"
        : false;

  return {
    provider,
    ready: validation.configured && generationEnabled,
  };
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
    const body = await parseOptionalJsonBody(request, bodySchema, { creativeIndex: 0 });

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
            error: "Review and approve the creative brief before rendering paid video previews.",
            code: "creative_brief_review_required",
          },
          { status: 409 },
        );
      }

      if (creativeIntakeContext.generationPhase !== "ugc_video") {
        return Response.json(
          {
            error: "The approved creative brief is scoped to static image generation. Approve a video creative brief before rendering video previews.",
            code: "creative_generation_phase_mismatch",
          },
          { status: 409 },
        );
      }
    }

    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "generate-video", `${auth.organizationId}:${auth.userId}:${campaignId}`),
      limit: 6,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const selectedVideo = campaign.creatives.videoAds[body.creativeIndex] ?? campaign.creatives.videoAds[0] ?? null;
    const selectedCopy = campaign.creatives.copy[body.creativeIndex] ?? campaign.creatives.copy[0] ?? null;

    if (!selectedVideo) {
      return Response.json({ error: "Video creative was not found for this campaign." }, { status: 404 });
    }

    const videoProviderReadiness = getVideoProviderReadiness();

    if (!videoProviderReadiness.ready) {
      return Response.json(
        {
          error: "Video previews are saved as a concept for now. Static creatives can still be reviewed, but launch needs an approved campaign-specific UGC video.",
          code: "video_generation_disabled",
        },
        { status: 409 },
      );
    }

    const activeJobs = (await listSystemJobs({
      userId: auth.userId,
      campaignId,
      kind: "video_generation",
      statuses: ["pending", "processing"],
    })) as SystemJobRecord<"video_generation">[];
    const existingActiveJob =
      activeJobs.find((job) =>
        job.payload.creativeIndex === body.creativeIndex &&
        (!creativeIntakeContext ||
          hasSameCreativeIntakeGenerationContext(job.payload.creativeIntake, creativeIntakeContext)),
      ) ?? null;

    if (existingActiveJob) {
      scheduleVideoGenerationJob(existingActiveJob.id);

      return Response.json({
        success: true,
        campaignId,
        job: existingActiveJob,
        reusedExistingJob: true,
        status: existingActiveJob.status,
        video: {
          hook: selectedVideo.hook,
          script: selectedVideo.script,
          scenes: selectedVideo.shotList.map((text, index) => ({
            id: `scene-${index + 1}`,
            text,
          })),
          url: selectedVideo.videoUrl ?? "",
        },
      });
    }

    const scriptLines = (selectedCopy?.script || selectedVideo.script.join("\n"))
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const normalizedScriptLines = scriptLines.length > 0 ? scriptLines : selectedVideo.script;
    const payload: VideoGenerationJobPayload = {
      creativeIndex: body.creativeIndex,
      creativeId: selectedVideo.id ?? null,
      copyId: selectedCopy?.id ?? null,
      creativeFormat: selectedVideo.conceptType === "customer_ugc" ? "ugc" : "talking_head",
      title: selectedVideo.title || selectedCopy?.headline || `Video ${body.creativeIndex + 1}`,
      hook: selectedVideo.hook || selectedCopy?.hook || normalizedScriptLines[0] || "",
      body:
        selectedCopy?.primary_text ||
        normalizedScriptLines.slice(1, -1).join(" ") ||
        normalizedScriptLines[1] ||
        "",
      cta: selectedVideo.cta || selectedCopy?.cta || campaign.funnel.cta || "Learn more",
      scriptText: normalizedScriptLines.join("\n"),
      scriptLines: normalizedScriptLines,
      scenes: selectedVideo.shotList.map((text, index) => ({
        id: `scene-${index + 1}`,
        text,
      })),
      avatarProfileId: null,
      voiceProfile: null,
      audience: campaign.strategy.audience ?? campaign.campaign.audience ?? null,
      location: campaign.strategy.location ?? campaign.campaign.location ?? null,
      force: body.force === true,
      targetDurationSeconds: creativeIntakeContext?.ugcStyleBrief?.targetDurationSeconds ?? 20,
      creativeIntake: creativeIntakeContext,
    };

    const job = await createSystemJob({
      organizationId: auth.organizationId,
      userId: auth.userId,
      campaignId,
      kind: "video_generation",
      idempotencyKey:
        body.force === true
          ? `video_generation:${auth.organizationId}:${auth.userId}:${campaignId}:${body.creativeIndex}:${crypto.randomUUID()}`
          : `video_generation:${auth.organizationId}:${auth.userId}:${campaignId}:${body.creativeIndex}`,
      payload,
      maxAttempts: 1,
    });
    scheduleVideoGenerationJob(job.id);

    return Response.json({
      success: true,
      campaignId,
      job,
      status: job.status,
      video: {
        hook: payload.hook,
        script: payload.scriptLines,
        scenes: payload.scenes,
        url: "",
      },
    });
  } catch (error) {
    return handleApiError(error, "Generate video");
  }
}
