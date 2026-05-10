import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/route";
import { generateStaticCreativeAds, type StaticCreativeAsset } from "@/lib/services/creative-engine";
import type { CampaignStrategyInput } from "@/lib/services/campaign-orchestrator";
import type { CampaignCreativeStrategy } from "@/lib/services/campaign-creative-strategy";
import { evaluateStaticVisualAssetDecision } from "@/lib/services/static-creative-visual-qa";
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
    const visualDecision = evaluateStaticVisualAssetDecision(asset);
    const normalizedGenerationState = asset.imageUrl && visualDecision.usable
      ? "generated"
      : asset.imageUrl
        ? "failed"
        : asset.imageGenerationState;
    const status =
      asset.imageUrl && visualDecision.usable
        ? "ready"
        : asset.imageUrl
          ? "requires_review"
          : asset.imageGenerationState === "failed"
          ? "failed"
          : "requires_review";
    const metadataBase = {
      source: "static_ad",
      staticAssetId: asset.id,
      angle: asset.angle,
      visualConcept: asset.visualConcept,
      imagePrompt: asset.imagePrompt,
      imagePromptConfig: (asset.imagePromptConfig ?? null) as Json,
      preferredImageModel: asset.preferredImageModel,
      visualPromptBrief: (asset.visualPromptBrief ?? null) as Json,
      visualAssetContract: asset.visualPromptBrief?.visualAssetContract ?? null,
      visualAssetRole: asset.visualPromptBrief?.visualAssetRole ?? null,
      imageGenerationState: normalizedGenerationState,
      imageGenerationProvider: asset.imageGenerationProvider ?? null,
      imageGenerationModel: asset.imageGenerationModel,
      imageGenerationMessage: asset.imageGenerationMessage,
      recommended: asset.recommended,
      score: asset.score,
      scoreBreakdown: asset.scoreBreakdown,
      offerQuality: (asset.offerQuality ?? null) as Json,
      qualityGate: (asset.qualityGate ?? null) as Json,
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
        provider_name: asset.imageGenerationProvider ?? null,
        file_url: asset.imageUrl || null,
        thumbnail_url: asset.imageUrl || null,
        metadata: {
          ...metadataBase,
          assetError:
            status === "ready"
              ? null
              : asset.imageUrl
                ? visualDecision.reason ?? "Generated background needs review before launch."
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
        provider_name: asset.imageGenerationProvider ?? null,
        file_url: asset.imageUrl || null,
        thumbnail_url: asset.imageUrl || null,
        metadata: {
          ...metadataBase,
          assetError:
            status === "ready"
              ? null
              : asset.imageUrl
                ? visualDecision.reason ?? "Generated background needs review before launch."
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
