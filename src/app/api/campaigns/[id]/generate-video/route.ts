import { assertSameOriginRequest, handleApiError, parseOptionalJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { createSystemJob } from "@/lib/services/system-job-service";
import type { VideoGenerationJobPayload } from "@/lib/services/video-generation-job";
import { z } from "zod";

const bodySchema = z.object({
  creativeIndex: z.number().int().min(0).max(9).default(0),
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
    const body = await parseOptionalJsonBody(request, bodySchema, { creativeIndex: 0 });

    if (!campaignId) {
      return Response.json({ error: "Campaign id is required." }, { status: 400 });
    }

    const campaign = await getCampaignById(campaignId);

    if (!campaign) {
      return Response.json({ error: "Campaign not found." }, { status: 404 });
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
