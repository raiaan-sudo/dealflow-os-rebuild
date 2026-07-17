import { assertSameOriginRequest, handleApiError, parseOptionalJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { createSystemJob } from "@/lib/services/system-job-service";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VideoGenerationJobPayload } from "@/lib/services/video-generation-job";
import {
  getDurableVideoProvider,
  getDurableVideoProviderUnavailableReason,
} from "@/lib/ai/video-provider";
import { assertVideoGenerationClaims } from "@/lib/advertising-claim-boundaries";
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
    const selectedSourceImage =
      campaign.creatives.staticAds[body.creativeIndex] ??
      campaign.creatives.staticAds.find((asset) => asset.imageGenerationState === "generated") ??
      null;
    const selectedSourceImageIndex = selectedSourceImage
      ? campaign.creatives.staticAds.findIndex((asset) => asset.id === selectedSourceImage.id)
      : -1;

    if (!selectedVideo) {
      return Response.json({ error: "Video creative was not found for this campaign." }, { status: 404 });
    }

    let inputImageUrl: string | null = null;
    let inputImageAssetId: string | null = null;
    let inputImagePaidCreativeDispatchId: string | null = null;
    if (
      selectedSourceImage?.imageGenerationState === "generated" &&
      selectedSourceImageIndex >= 0 &&
      /^https:\/\//i.test(selectedSourceImage.imageUrl)
    ) {
      const admin = createAdminClient();
      if (!admin) {
        return Response.json(
          { error: "The source image identity service is unavailable.", code: "video_source_asset_authority_unavailable" },
          { status: 503 },
        );
      }
      const { data: sourceAsset, error: sourceAssetError } = await (admin as any)
        .from("creative_assets")
        .select("id,file_url,paid_creative_dispatch_id")
        .eq("campaign_id", campaignId)
        .eq("user_id", auth.userId)
        .eq("creative_id", `${campaignId}-creative-${selectedSourceImageIndex}`)
        .eq("asset_type", "image_frame")
        .eq("provider_name", "openai")
        .eq("status", "ready")
        .eq("file_url", selectedSourceImage.imageUrl)
        .not("paid_creative_dispatch_id", "is", null)
        .maybeSingle();
      if (sourceAssetError) {
        return Response.json(
          { error: "The source image identity could not be verified.", code: "video_source_asset_lookup_failed" },
          { status: 503 },
        );
      }
      const { data: sourceDispatch, error: sourceDispatchError } = sourceAsset?.paid_creative_dispatch_id
        ? await (admin as any)
            .from("paid_creative_dispatches")
            .select("id")
            .eq("id", sourceAsset.paid_creative_dispatch_id)
            .eq("organization_id", auth.organizationId)
            .eq("user_id", auth.userId)
            .eq("campaign_id", campaignId)
            .eq("provider", "openai")
            .eq("operation", "openai_image_generation")
            .eq("state", "projected")
            .maybeSingle()
        : { data: null, error: null };
      if (sourceDispatchError) {
        return Response.json(
          { error: "The source image dispatch could not be verified.", code: "video_source_dispatch_lookup_failed" },
          { status: 503 },
        );
      }
      if (
        sourceAsset?.id &&
        sourceAsset.file_url &&
        sourceAsset.paid_creative_dispatch_id &&
        sourceDispatch?.id === sourceAsset.paid_creative_dispatch_id
      ) {
        inputImageUrl = sourceAsset.file_url;
        inputImageAssetId = sourceAsset.id;
        inputImagePaidCreativeDispatchId = sourceAsset.paid_creative_dispatch_id;
      }
    }
    const videoProvider = getDurableVideoProvider();
    const unavailableReason = getDurableVideoProviderUnavailableReason({
      provider: videoProvider,
      inputImageUrl,
    });
    if (!videoProvider || unavailableReason) {
      return Response.json(
        {
          error: unavailableReason ?? "Higgsfield video generation is unavailable.",
          code: "video_generation_unavailable",
        },
        { status: 409 },
      );
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
      inputImageAssetId,
      inputImagePaidCreativeDispatchId,
      providerName: videoProvider,
      force: body.force === true,
    };
    assertVideoGenerationClaims(payload);

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
      // At least one lease-reclaim attempt is required to project an accepted
      // provider receipt after a worker crash without issuing another POST.
      maxAttempts: 3,
    });

    return Response.json({
      success: true,
      campaignId,
      job,
      status: job.status,
      provider: videoProvider,
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
