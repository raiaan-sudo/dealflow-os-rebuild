import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
  parseRouteParams,
} from "@/lib/api/route";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { assertCampaignCanLaunch } from "@/lib/services/campaign-entitlements";
import {
  getSelectedAdIdsFromPlan,
  getSelectedUgcVideoIdsFromPlan,
  withSelectedLaunchMedia,
} from "@/lib/services/campaign-plan-document";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { persistCampaignPlanDocumentUpdate } from "@/lib/services/campaign-plan-persistence-service";
import {
  getStaticCreativeReadiness,
  isLaunchReadyStaticCreative,
  isLaunchReadyVideoCreative,
} from "@/lib/services/creative-media-readiness";
import {
  getApprovedCreativeIntakeGenerationContext,
  isCreativeChatIntakeEnabled,
} from "@/lib/services/creative-chat-intake-service";
import type { StaticCreativeAsset } from "@/lib/services/creative-engine";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

const paramsSchema = z.object({
  id: z.string().min(1),
});

const bodySchema = z.object({
  selectedAdId: z.string().min(1).optional(),
  selectedAdIds: z.array(z.string().min(1)).min(1).max(6).optional(),
  selectedUgcVideoId: z.string().min(1).optional(),
  selectedUgcVideoIds: z.array(z.string().min(1)).max(3).optional(),
});

function readStaticAdsFromPlan(value: unknown): StaticCreativeAsset[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const creatives = record.creatives && typeof record.creatives === "object" && !Array.isArray(record.creatives)
    ? record.creatives as Record<string, unknown>
    : null;
  const staticAds = Array.isArray(record.staticAds)
    ? record.staticAds
    : Array.isArray(creatives?.staticAds)
      ? creatives.staticAds
      : [];

  return staticAds as StaticCreativeAsset[];
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string>> },
) {
  try {
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const { id } = await parseRouteParams(context.params, paramsSchema);
    const body = await parseJsonBody(request, bodySchema);
    const selectedAdIds = Array.from(
      new Set([...(body.selectedAdIds ?? []), ...(body.selectedAdId ? [body.selectedAdId] : [])]),
    ).slice(0, 6);
    const selectedUgcVideoIds = Array.from(
      new Set([...(body.selectedUgcVideoIds ?? []), ...(body.selectedUgcVideoId ? [body.selectedUgcVideoId] : [])]),
    ).slice(0, 3);
    const supabase = await createRouteHandlerClient();

    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
    }

    const { data, error } = await supabase
      .from("campaign_plans")
      .select("plan, user_id, organization_id")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const row = (data as {
      plan?: unknown;
      user_id?: string | null;
      organization_id?: string | null;
    } | null) ?? null;

    if (!row) {
      throw new ApiError(404, "Campaign not found.", "campaign_not_found");
    }

    if (
      row.organization_id !== auth.organizationId &&
      row.user_id !== auth.userId
    ) {
      throw new ApiError(404, "Campaign not found.", "campaign_not_found");
    }

    const currentPlan = row?.plan ?? {};
    if (selectedAdIds.length === 0) {
      throw new ApiError(400, "Select at least one creative before continuing.", "selected_ads_missing");
    }

    await assertCampaignCanLaunch(id);

    const existingSelectedAdIds = getSelectedAdIdsFromPlan(currentPlan);
    const existingSelectedUgcVideoIds = getSelectedUgcVideoIdsFromPlan(currentPlan);
    const creativeIntakeContext = isCreativeChatIntakeEnabled()
      ? getApprovedCreativeIntakeGenerationContext(currentPlan)
      : null;
    const staticBriefReadinessContext = creativeIntakeContext
      ? {
          staticBriefHash: creativeIntakeContext.staticBriefHash,
          offerHash: creativeIntakeContext.offerHash,
          ctaHash: creativeIntakeContext.ctaHash,
          brandHash: creativeIntakeContext.brandHash,
        }
      : null;
    const hydratedRecord = await getCampaignById(id);
    const staticAds = hydratedRecord?.creatives.staticAds.length
      ? hydratedRecord.creatives.staticAds
      : readStaticAdsFromPlan(currentPlan);
    const staticAdById = new Map(staticAds.map((ad) => [ad.id, ad]));
    const missingIds = selectedAdIds.filter((selectedId) => !staticAdById.has(selectedId));

    if (missingIds.length > 0) {
      throw new ApiError(400, "One or more selected creatives are no longer available.", "selected_ad_not_found");
    }

    const rejectedIds = selectedAdIds.filter((selectedId) => {
      const ad = staticAdById.get(selectedId);
      return !ad || !isLaunchReadyStaticCreative(ad, staticBriefReadinessContext);
    });

    if (rejectedIds.length > 0) {
      throw new ApiError(400, "Regenerate the selected creative before saving it to the launch set.", "selected_ad_not_launch_safe");
    }

    const staticReadiness = getStaticCreativeReadiness(staticAds, selectedAdIds, staticBriefReadinessContext);

    if (!staticReadiness.selectedMinimumMet) {
      throw new ApiError(
        400,
        `Select at least ${staticReadiness.minimumRequiredCount} launch-ready static ads before saving the launch set.`,
        "selected_static_minimum_not_met",
      );
    }

    const videoAds = hydratedRecord?.creatives.videoAds ?? [];
    const videoById = new Map(videoAds.map((video) => [video.id, video]));
    const missingVideoIds = selectedUgcVideoIds.filter((selectedId) => !videoById.has(selectedId));

    if (missingVideoIds.length > 0) {
      throw new ApiError(400, "One or more selected UGC videos are no longer available.", "selected_ugc_video_not_found");
    }

    const rejectedVideoIds = selectedUgcVideoIds.filter((selectedId) => {
      const video = videoById.get(selectedId);
      return !video ||
        !isLaunchReadyVideoCreative(video) ||
        video.conceptType !== "customer_ugc" ||
        (creativeIntakeContext?.ugcScriptHash ? video.ugcScriptHash !== creativeIntakeContext.ugcScriptHash && video.scriptHash !== creativeIntakeContext.ugcScriptHash : false);
    });

    if (rejectedVideoIds.length > 0) {
      throw new ApiError(
        400,
        "Render and approve the selected UGC video before saving it to the launch set.",
        "selected_ugc_video_not_launch_safe",
      );
    }

    if (
      existingSelectedAdIds.length === selectedAdIds.length &&
      existingSelectedAdIds.every((selectedId, index) => selectedId === selectedAdIds[index]) &&
      existingSelectedUgcVideoIds.length === selectedUgcVideoIds.length &&
      existingSelectedUgcVideoIds.every((selectedId, index) => selectedId === selectedUgcVideoIds[index])
    ) {
      return NextResponse.json({
        campaign_id: id,
        selected_ad_id: selectedAdIds[0],
        selected_ad_ids: selectedAdIds,
        selected_ugc_video_id: selectedUgcVideoIds[0] ?? null,
        selected_ugc_video_ids: selectedUgcVideoIds,
        unchanged: true,
      });
    }

    const nextPlan = withSelectedLaunchMedia(currentPlan, {
      selectedAdIds,
      selectedUgcVideoIds,
    });

    await persistCampaignPlanDocumentUpdate({
      supabase,
      campaignId: id,
      plan: nextPlan,
      userId: auth.userId,
      source: "select_ad",
    });

    return NextResponse.json({
      campaign_id: id,
      selected_ad_id: selectedAdIds[0],
      selected_ad_ids: selectedAdIds,
      selected_ugc_video_id: selectedUgcVideoIds[0] ?? null,
      selected_ugc_video_ids: selectedUgcVideoIds,
    });
  } catch (error) {
    return handleApiError(error, "Select ad");
  }
}
