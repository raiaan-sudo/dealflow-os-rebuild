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
  getCampaignLanguageFromPlan,
  getSelectedAdIdsFromPlan,
  getSelectedUgcVideoIdsFromPlan,
  withSelectedLaunchMedia,
} from "@/lib/services/campaign-plan-document";
import {
  getCampaignById,
  mapStaticCreativeAssets,
  mapVideoCreativeAssets,
} from "@/lib/services/campaign-persistence";
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mergeCreativeAssetsIntoPlan(
  currentPlan: unknown,
  staticAds: StaticCreativeAsset[],
  videoAds: unknown[],
) {
  const plan = asRecord(currentPlan);
  const existingCreatives = asRecord(plan.creatives);

  return {
    ...plan,
    staticAds,
    creatives: {
      ...existingCreatives,
      staticAds,
      ...(videoAds.length > 0 ? { videoAds } : {}),
    },
  };
}

function hasSelectedStaticAssetsInPlan(currentPlan: unknown, selectedAdIds: string[]) {
  const staticAdIds = new Set(readStaticAdsFromPlan(currentPlan).map((ad) => ad.id));
  return selectedAdIds.every((selectedId) => staticAdIds.has(selectedId));
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
    let selectedAdIds = Array.from(
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
    const campaignLanguageCode = getCampaignLanguageFromPlan(currentPlan);
    const creativeIntakeContext = isCreativeChatIntakeEnabled()
      ? getApprovedCreativeIntakeGenerationContext(currentPlan)
      : null;
    const staticBriefReadinessContext = {
      staticBriefHash: creativeIntakeContext?.staticBriefHash,
      offerHash: creativeIntakeContext?.offerHash,
      ctaHash: creativeIntakeContext?.ctaHash,
      brandHash: creativeIntakeContext?.brandHash,
      languageCode: campaignLanguageCode,
    };
    const hydratedRecord = await getCampaignById(id);
    const staticAssetOwnerUserId = typeof row.user_id === "string" && row.user_id.length > 0
      ? row.user_id
      : auth.userId;
    const { data: rawStaticAssetRows, error: staticAssetRowsError } = await supabase
      .from("creative_assets")
      .select("*")
      .eq("campaign_id", id)
      .eq("user_id", staticAssetOwnerUserId)
      .in("asset_type", ["image_frame", "thumbnail", "static_image", "image"])
      .order("created_at", { ascending: false });

    if (staticAssetRowsError) {
      throw staticAssetRowsError;
    }

    const staticAssetRows = (Array.isArray(rawStaticAssetRows) ? rawStaticAssetRows : []) as Array<{
      id: string;
      creative_id: string | null;
      metadata: unknown;
    }>;
    const mappedStaticAssets = mapStaticCreativeAssets(Array.isArray(rawStaticAssetRows) ? rawStaticAssetRows : []);
    const staticAds = mappedStaticAssets.length > 0
      ? mappedStaticAssets
      : hydratedRecord?.creatives.staticAds.length
        ? hydratedRecord.creatives.staticAds
        : readStaticAdsFromPlan(currentPlan);
    const canonicalStaticAdIds = new Set(staticAds.map((ad) => ad.id));
    const aliasToCanonicalStaticAdId = new Map(staticAds.map((ad) => [ad.id, ad.id]));
    const metadataAliasCandidates = new Map<string, Set<string>>();

    for (const row of staticAssetRows) {
      const creativeId = typeof row.creative_id === "string" ? row.creative_id.trim() : "";
      if (!creativeId || !canonicalStaticAdIds.has(creativeId)) {
        continue;
      }

      aliasToCanonicalStaticAdId.set(row.id, creativeId);

      const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : null;
      const staticAssetId = typeof metadata?.staticAssetId === "string" ? metadata.staticAssetId.trim() : "";
      if (staticAssetId) {
        const candidates = metadataAliasCandidates.get(staticAssetId) ?? new Set<string>();
        candidates.add(creativeId);
        metadataAliasCandidates.set(staticAssetId, candidates);
      }
    }

    for (const [staticAssetId, candidates] of metadataAliasCandidates.entries()) {
      if (candidates.size === 1) {
        aliasToCanonicalStaticAdId.set(staticAssetId, Array.from(candidates)[0]);
      }
    }

    selectedAdIds = Array.from(
      new Set(selectedAdIds.map((selectedId) => aliasToCanonicalStaticAdId.get(selectedId) ?? selectedId)),
    ).slice(0, 6);
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

    const { data: videoAssetData, error: videoAssetError } = await supabase
      .from("creative_assets")
      .select("*")
      .eq("campaign_id", id)
      .eq("user_id", auth.userId)
      .in("asset_type", ["ugc_video", "talking_head_video", "montage_video", "video"])
      .order("created_at", { ascending: false });

    if (videoAssetError) {
      throw videoAssetError;
    }

    const mappedVideoAssets = mapVideoCreativeAssets(Array.isArray(videoAssetData) ? videoAssetData : []);
    const videoAds = mappedVideoAssets.length > 0
      ? mappedVideoAssets
      : hydratedRecord?.creatives.videoAds ?? [];
    const videoById = new Map<string, (typeof videoAds)[number]>();
    for (const video of videoAds) {
      if (!videoById.has(video.id)) {
        videoById.set(video.id, video);
      }
    }
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

    const currentPlanHasSelectedStaticAssets = hasSelectedStaticAssetsInPlan(currentPlan, selectedAdIds);

    if (
      currentPlanHasSelectedStaticAssets &&
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

    const nextPlan = withSelectedLaunchMedia(
      mergeCreativeAssetsIntoPlan(currentPlan, staticAds, videoAds),
      {
        selectedAdIds,
        selectedUgcVideoIds,
      },
    );

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
