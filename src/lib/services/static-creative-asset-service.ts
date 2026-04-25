import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/route";
import { generateStaticCreativeAds, type StaticCreativeAsset } from "@/lib/services/creative-engine";
import type { CampaignStrategyInput } from "@/lib/services/campaign-orchestrator";
import type { CampaignCreativeStrategy } from "@/lib/services/campaign-creative-strategy";
import type { Database, Json } from "@/lib/supabase/types";

type PersistStaticCreativeAssetsParams = {
  supabase: SupabaseClient<Database>;
  userId: string;
  campaignId: string;
  staticAds: StaticCreativeAsset[];
};

type GenerateAndPersistParams = {
  supabase: SupabaseClient<Database>;
  userId: string;
  campaignId: string;
  strategy: CampaignStrategyInput;
  creativeStrategy?: CampaignCreativeStrategy | null;
};

function buildStaticCreativeId(campaignId: string, index: number) {
  return `${campaignId}-creative-${index}`;
}

function buildStaticCopyId(campaignId: string, index: number) {
  return `${campaignId}-copy-${index}`;
}

export async function persistStaticCreativeAssets(params: PersistStaticCreativeAssetsParams) {
  const staticAds = Array.isArray(params.staticAds) ? params.staticAds : [];

  if (staticAds.length === 0) {
    return [];
  }

  try {
    await params.supabase
      .from("creative_assets")
      .delete()
      .eq("campaign_id", params.campaignId)
      .eq("user_id", params.userId)
      .eq("generation_method", "image_generation")
      .in("asset_type", ["image_frame", "thumbnail"])
      .like("creative_id", `${params.campaignId}-creative-%`);
  } catch {
    // Ignore cleanup failure and continue with fresh inserts.
  }

  const inserts = staticAds.flatMap((asset, index) => {
    const status =
      asset.imageGenerationState === "generated" && asset.imageUrl
        ? "ready"
        : asset.imageGenerationState === "failed"
          ? "failed"
          : "requires_review";
    const metadataBase = {
      source: "static_ad",
      staticAssetId: asset.id,
      visualConcept: asset.visualConcept,
      imagePrompt: asset.imagePrompt,
      imageGenerationState: asset.imageGenerationState,
      imageGenerationModel: asset.imageGenerationModel,
      imageGenerationMessage: asset.imageGenerationMessage,
      recommended: asset.recommended,
      score: asset.score,
      scoreBreakdown: asset.scoreBreakdown,
      overlayText: asset.overlayText,
      headline: asset.headline,
      primaryText: asset.primaryText,
      cta: asset.cta,
    } satisfies Record<string, Json | string | number | boolean | null>;

    return [
      {
        user_id: params.userId,
        campaign_id: params.campaignId,
        creative_id: buildStaticCreativeId(params.campaignId, index),
        copy_id: buildStaticCopyId(params.campaignId, index),
        asset_type: "image_frame",
        format: "1:1",
        generation_method: "image_generation",
        status,
        provider_name: "openai",
        file_url: asset.imageUrl || null,
        thumbnail_url: asset.imageUrl || null,
        metadata: {
          ...metadataBase,
          assetError:
            status === "ready"
              ? null
              : asset.imageGenerationMessage ?? "Static image was not generated for this creative.",
          role: "background_image",
        } as Json,
      },
      {
        user_id: params.userId,
        campaign_id: params.campaignId,
        creative_id: buildStaticCreativeId(params.campaignId, index),
        copy_id: buildStaticCopyId(params.campaignId, index),
        asset_type: "thumbnail",
        format: "1:1",
        generation_method: "image_generation",
        status,
        provider_name: "openai",
        file_url: asset.imageUrl || null,
        thumbnail_url: asset.imageUrl || null,
        metadata: {
          ...metadataBase,
          assetError:
            status === "ready"
              ? null
              : asset.imageGenerationMessage ?? "Static thumbnail was not generated for this creative.",
          role: "thumbnail",
        } as Json,
      },
    ];
  });

  const { data, error } = await params.supabase
    .from("creative_assets")
    .insert(inserts as never)
    .select("*");

  if (error) {
    throw new ApiError(500, error.message, "creative_asset_persist_failed");
  }

  return Array.isArray(data) ? data : [];
}

export async function generateAndPersistStaticCreativeAssets(params: GenerateAndPersistParams) {
  const staticAds = await generateStaticCreativeAds({
    location: params.strategy.location,
    audience: params.strategy.audience,
    offer: params.strategy.offer,
    price_point: params.strategy.price_point,
    market_type: params.strategy.market_type,
    creative_strategy: params.creativeStrategy ?? undefined,
  });

  return await persistStaticCreativeAssets({
    supabase: params.supabase,
    userId: params.userId,
    campaignId: params.campaignId,
    staticAds,
  });
}
