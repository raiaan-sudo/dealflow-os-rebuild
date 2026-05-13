import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/route";
import { generateStaticCreativeAds, type CreativeEngineInput, type StaticCreativeAsset } from "@/lib/services/creative-engine";
import type { CampaignStrategyInput } from "@/lib/services/campaign-orchestrator";
import type { CampaignCreativeStrategy } from "@/lib/services/campaign-creative-strategy";
import { evaluateStaticVisualAssetDecision } from "@/lib/services/static-creative-visual-qa";
import {
  normalizeStaticCreativeProviderImage,
  type StaticCreativeStorageNormalizationResult,
} from "@/lib/services/static-creative-storage-normalization";
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
  providerUsageContext?: CreativeEngineInput["provider_usage_context"];
  creativeIntake?: CreativeEngineInput["creative_intake"];
};

function buildStaticCreativeId(campaignId: string, index: number) {
  return `${campaignId}-creative-${index}`;
}

function buildStaticCopyId(campaignId: string, index: number) {
  return `${campaignId}-copy-${index}`;
}

function buildStorageMetadata(
  result: StaticCreativeStorageNormalizationResult | null,
  providerOriginalUrl: string | null,
) {
  return {
    provider_original_url: providerOriginalUrl,
    storageBucket: result?.storageBucket ?? null,
    storagePath: result?.storagePath ?? null,
    storageContentType: result?.contentType ?? null,
    storageByteSize: result?.byteSize ?? null,
    storageNormalized: Boolean(result?.durableUrl),
    storageNormalizationReusedExistingAppAsset: result?.reusedExistingAppAsset ?? false,
  };
}

function evaluatePreStorageStaticVisualDecision(asset: StaticCreativeAsset) {
  return evaluateStaticVisualAssetDecision({
    ...asset,
    storageNormalized: asset.imageUrl ? true : asset.storageNormalized,
  });
}

function hasAcceptedFinishedAdImageQa(asset: StaticCreativeAsset) {
  return (
    asset.imageQa?.mode === "finished_ad" &&
    asset.imageQa.usable !== false &&
    asset.imageQa.decision === "accept"
  );
}

export async function persistStaticCreativeAssets(params: PersistStaticCreativeAssetsParams) {
  const staticAds = Array.isArray(params.staticAds) ? params.staticAds : [];

  if (staticAds.length === 0) {
    return [];
  }

  const generationBatchId = crypto.randomUUID();
  const inserts: Array<Database["public"]["Tables"]["creative_assets"]["Insert"]> = [];
  let allInsertedCreativesAreReady = true;

  for (const [index, asset] of staticAds.entries()) {
    const visualDecision = evaluatePreStorageStaticVisualDecision(asset);
    const providerOriginalUrl = asset.imageUrl || null;
    const creativeId = buildStaticCreativeId(params.campaignId, index);
    const copyId = buildStaticCopyId(params.campaignId, index);
    let durableImage: StaticCreativeStorageNormalizationResult | null = null;
    let normalizationError: string | null = null;

    if (asset.imageUrl && (visualDecision.usable || hasAcceptedFinishedAdImageQa(asset))) {
      try {
        durableImage = await normalizeStaticCreativeProviderImage({
          supabase: params.supabase,
          userId: params.userId,
          campaignId: params.campaignId,
          creativeId,
          generationBatchId,
          providerUrl: asset.imageUrl,
        });
      } catch {
        normalizationError = "Generated background could not be stored durably. A cleaner image is being prepared.";
      }
    }

    const readyUrl = durableImage?.durableUrl ?? null;
    const persistedImageQa =
      asset.imageUrl && !readyUrl && normalizationError
        ? {
            ...((asset.imageQa ?? {}) as Record<string, unknown>),
            usable: false,
            decision: "reject",
            reasons: Array.from(
              new Set([
                ...(
                  Array.isArray(asset.imageQa?.reasons)
                    ? asset.imageQa.reasons
                    : []
                ),
                "image_fetch_failed",
              ]),
            ),
          }
        : asset.imageQa ?? null;
    const normalizedGenerationState = readyUrl
      ? "generated"
      : asset.imageUrl
        ? "failed"
        : asset.imageGenerationState;
    const status =
      readyUrl
        ? "ready"
        : asset.imageUrl
          ? "failed"
          : asset.imageGenerationState === "failed"
          ? "failed"
          : "requires_review";
    allInsertedCreativesAreReady = allInsertedCreativesAreReady && status === "ready";
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
      imageQa: persistedImageQa as Json,
      creativeIntakePromptVersionUsed: (asset.creativeIntake?.promptVersion ?? null) as Json,
      creativeIntakeGenerationContext: asset.creativeIntake
        ? ({
            version: asset.creativeIntake.version,
            conversationId: asset.creativeIntake.conversationId,
            campaignId: asset.creativeIntake.campaignId,
            revisionNumber: asset.creativeIntake.revisionNumber,
            approvedAt: asset.creativeIntake.approvedAt,
            outputMode: asset.creativeIntake.outputMode,
            generationPhase: asset.creativeIntake.generationPhase,
            promptVersionCreatedAt: asset.creativeIntake.promptVersion.createdAt,
          } as Json)
        : null,
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
      generationBatchId,
      ...buildStorageMetadata(durableImage, providerOriginalUrl),
    } satisfies Record<string, Json | string | number | boolean | null>;

    inserts.push(
      {
        user_id: params.userId,
        campaign_id: params.campaignId,
        creative_id: creativeId,
        copy_id: copyId,
        asset_type: "image_frame",
        format: "1:1",
        generation_method: "image_generation",
        status,
        provider_name: asset.imageGenerationProvider ?? null,
        file_url: readyUrl,
        thumbnail_url: readyUrl,
        metadata: {
          ...metadataBase,
          assetError:
            status === "ready"
              ? null
              : normalizationError ?? (asset.imageUrl
                ? visualDecision.reason ?? "Generated background needs review before launch."
                : asset.imageGenerationMessage ?? "Static image was not generated for this creative."),
          role: "background_image",
        } as Json,
      },
      {
        user_id: params.userId,
        campaign_id: params.campaignId,
        creative_id: creativeId,
        copy_id: copyId,
        asset_type: "thumbnail",
        format: "1:1",
        generation_method: "image_generation",
        status,
        provider_name: asset.imageGenerationProvider ?? null,
        file_url: readyUrl,
        thumbnail_url: readyUrl,
        metadata: {
          ...metadataBase,
          assetError:
            status === "ready"
              ? null
              : normalizationError ?? (asset.imageUrl
                ? visualDecision.reason ?? "Generated background needs review before launch."
                : asset.imageGenerationMessage ?? "Static thumbnail was not generated for this creative."),
          role: "thumbnail",
        } as Json,
      },
    );
  }

  const { data, error } = await params.supabase
    .from("creative_assets")
    .insert(inserts as never)
    .select("*");

  if (error) {
    throw new ApiError(500, error.message, "creative_asset_persist_failed");
  }

  const insertedRows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  const insertedIds = insertedRows
    .map((row) => (typeof row.id === "string" ? row.id : ""))
    .filter(Boolean);

  if (insertedIds.length > 0) {
    try {
      if (allInsertedCreativesAreReady) {
        await params.supabase
          .from("creative_assets")
          .delete()
          .eq("campaign_id", params.campaignId)
          .eq("user_id", params.userId)
          .eq("generation_method", "image_generation")
          .in("asset_type", ["image_frame", "thumbnail"])
          .like("creative_id", `${params.campaignId}-creative-%`)
          .not("id", "in", `(${insertedIds.join(",")})`);
      }
    } catch {
      // Cleanup is deliberately best-effort. New rows are already written, and
      // loaders prefer the newest rows so old accepted assets are not lost.
    }
  }

  return insertedRows;
}

export async function generateAndPersistStaticCreativeAssets(params: GenerateAndPersistParams) {
  const staticAds = await generateStaticCreativeAds({
    campaign_id: params.campaignId,
    location: params.strategy.location,
    audience: params.strategy.audience,
    offer: params.strategy.offer,
    price_point: params.strategy.price_point,
    market_type: params.strategy.market_type,
    creative_strategy: params.creativeStrategy ?? undefined,
    provider_usage_context: params.providerUsageContext,
    creative_intake: params.creativeIntake ?? null,
  });

  return await persistStaticCreativeAssets({
    supabase: params.supabase,
    userId: params.userId,
    campaignId: params.campaignId,
    staticAds,
  });
}
