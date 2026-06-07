import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStaticCreativeAds, type CreativeEngineInput, type StaticCreativeAsset } from "@/lib/services/creative-engine";
import type { CampaignStrategyInput } from "@/lib/services/campaign-orchestrator";
import type { CampaignCreativeStrategy } from "@/lib/services/campaign-creative-strategy";
import { evaluateStaticVisualAssetDecision } from "@/lib/services/static-creative-visual-qa";
import {
  composeAndUploadStaticCreativeFinal,
  type StaticCreativeCompositionMetadata,
} from "@/lib/services/static-creative-composition-service";
import {
  normalizeStaticCreativeProviderImage,
  type StaticCreativeStorageNormalizationResult,
} from "@/lib/services/static-creative-storage-normalization";
import {
  retryStaticCreativePersistence,
  toStaticCreativePersistenceApiError,
} from "@/lib/services/static-creative-render-resilience";
import type { Database, Json } from "@/lib/supabase/types";

type PersistStaticCreativeAssetsParams = {
  supabase: SupabaseClient<Database>;
  userId: string;
  campaignId: string;
  staticAds: StaticCreativeAsset[];
  allowAppComposition?: boolean;
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

type CreativeAssetRow = Database["public"]["Tables"]["creative_assets"]["Row"];

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

function buildAppComposedImageQa(composition: StaticCreativeCompositionMetadata | null) {
  const accepted = Boolean(
    composition?.appComposedFinal &&
      composition.qualityTier === "premium_final" &&
      composition.premiumQualityGate.accepted === true,
  );
  const fallbackReasons =
    composition?.sourceBackgroundKind === "app_fallback_visual"
      ? ["app_fallback_visual_not_launch_ready", "generic_template_asset", "icon_house_asset"]
      : composition?.premiumQualityGate.reasons ?? ["image_fetch_failed"];

  return {
    usable: accepted,
    decision: accepted ? "accept" : "review",
    mode: "app_composed_final",
    reasons: accepted ? [] : fallbackReasons,
    textDensity: 0,
    layoutRisk: 0,
    detectedTextSamples: [
      composition?.renderedOffer,
      composition?.renderedCta,
      composition?.renderedBrand,
    ].filter(Boolean),
  };
}

function getCreativeAssetRole(row: CreativeAssetRow | Record<string, unknown>) {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const role = (metadata as Record<string, unknown>).role;
  return typeof role === "string" ? role : null;
}

function newestCreativeAssetRow(rows: CreativeAssetRow[]) {
  return [...rows].sort((a, b) => {
    const aTime = Date.parse(a.created_at ?? "");
    const bTime = Date.parse(b.created_at ?? "");
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  })[0] ?? null;
}

async function findExistingStaticCreativeRows(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  campaignId: string;
  row: Database["public"]["Tables"]["creative_assets"]["Insert"];
}) {
  const role = getCreativeAssetRole(params.row as Record<string, unknown>);

  try {
    const table = params.supabase.from("creative_assets") as unknown as {
      select?: (columns: string) => unknown;
    };

    if (typeof table.select !== "function") {
      return [];
    }

    let query = table.select("*") as {
      eq?: (column: string, value: unknown) => unknown;
      order?: (column: string, options?: { ascending?: boolean }) => unknown;
      limit?: (count: number) => Promise<{ data: CreativeAssetRow[] | null; error: { message?: string } | null }>;
    };
    const eq = (column: string, value: unknown) => {
      if (typeof query.eq === "function") {
        query = query.eq(column, value) as typeof query;
      }
    };

    eq("user_id", params.userId);
    eq("campaign_id", params.campaignId);
    eq("creative_id", params.row.creative_id);
    eq("asset_type", params.row.asset_type);
    eq("format", params.row.format);
    if (role) {
      eq("metadata->>role", role);
    }

    if (typeof query.order === "function") {
      query = query.order("created_at", { ascending: false }) as typeof query;
    }

    const result = typeof query.limit === "function"
      ? await query.limit(12)
      : { data: null, error: null };

    if (result.error) {
      throw result.error;
    }

    return Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    throw toStaticCreativePersistenceApiError(
      error,
      "creative_asset_transient_persist_failed",
      "creative_asset_persist_failed",
    );
  }
}

async function persistStaticCreativeAssetRow(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  campaignId: string;
  row: Database["public"]["Tables"]["creative_assets"]["Insert"];
}) {
  return retryStaticCreativePersistence(async () => {
    const existingRows = await findExistingStaticCreativeRows(params);
    const canonical = newestCreativeAssetRow(existingRows);

    if (canonical?.id) {
      const updatePayload = {
        status: params.row.status,
        provider_name: params.row.provider_name,
        generation_method: params.row.generation_method,
        file_url: params.row.file_url,
        thumbnail_url: params.row.thumbnail_url,
        metadata: params.row.metadata,
      } satisfies Database["public"]["Tables"]["creative_assets"]["Update"];
      const { data, error } = await (params.supabase.from("creative_assets") as any)
        .update(updatePayload)
        .eq("id", canonical.id)
        .eq("user_id", params.userId)
        .eq("campaign_id", params.campaignId)
        .select("*")
        .single();

      if (error || !data) {
        throw error ?? new Error("Creative asset update returned no row.");
      }

      return data as CreativeAssetRow;
    }

    type InsertResult = {
      data: CreativeAssetRow[] | CreativeAssetRow | null;
      error: { message?: string } | null;
    };
    const insertSelection = params.supabase
      .from("creative_assets")
      .insert([params.row] as never)
      .select("*") as unknown as
        | Promise<InsertResult>
        | {
            single?: () => Promise<InsertResult>;
          };
    const insertResult: InsertResult =
      typeof (insertSelection as { single?: unknown }).single === "function"
        ? await (insertSelection as { single: () => Promise<InsertResult> }).single()
        : await (insertSelection as Promise<InsertResult>);
    const data = Array.isArray(insertResult.data) ? insertResult.data[0] ?? null : insertResult.data;
    const error = insertResult.error;

    if (error || !data) {
      throw error ?? new Error("Creative asset insert returned no row.");
    }

    return data as CreativeAssetRow;
  }).catch(async (error) => {
    const maybeErrorCode =
      error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : null;

    if (maybeErrorCode === "23505") {
      const recoveredRows = await findExistingStaticCreativeRows(params);
      const recovered = newestCreativeAssetRow(recoveredRows);
      if (recovered) {
        return recovered;
      }
    }

    throw toStaticCreativePersistenceApiError(
      error,
      "creative_asset_transient_persist_failed",
      "creative_asset_persist_failed",
    );
  });
}

async function findExistingAppComposedFinalRows(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  campaignId: string;
  staticAssetId: string;
  composition: StaticCreativeCompositionMetadata;
}) {
  try {
    const table = params.supabase.from("creative_assets") as unknown as {
      select?: (columns: string) => unknown;
    };

    if (typeof table.select !== "function") {
      return [];
    }

    let query = table.select("*") as {
      eq?: (column: string, value: unknown) => unknown;
      order?: (column: string, options?: { ascending?: boolean }) => unknown;
      limit?: (count: number) => Promise<{ data: CreativeAssetRow[] | null; error: { message?: string } | null }>;
    };

    const eq = (column: string, value: unknown) => {
      if (typeof query.eq === "function") {
        query = query.eq(column, value) as typeof query;
      }
    };

    eq("campaign_id", params.campaignId);
    eq("user_id", params.userId);
    eq("generation_method", "app_composed_static");
    eq("status", "ready");
    eq("metadata->>staticAssetId", params.staticAssetId);
    eq("metadata->>appComposedFinal", "true");
    eq("metadata->>compositionHash", params.composition.compositionHash);

    if (params.composition.staticBriefHash) {
      eq("metadata->>staticBriefHash", params.composition.staticBriefHash);
    }

    if (typeof query.order === "function") {
      query = query.order("created_at", { ascending: false }) as typeof query;
    }

    const result = typeof query.limit === "function"
      ? await query.limit(12)
      : { data: null, error: null };

    if (result.error || !Array.isArray(result.data)) {
      return [];
    }

    return result.data.filter((row) => {
      const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : {};
      const sourceImageQa = metadata.sourceImageQa && typeof metadata.sourceImageQa === "object" && !Array.isArray(metadata.sourceImageQa)
        ? metadata.sourceImageQa as Record<string, unknown>
        : {};
      const appComposedV2Accepted = Boolean(
        metadata.compositionVersion === "app_composed_static_v2" &&
          metadata.qualityTier === "premium_final" &&
          typeof metadata.sourceBackgroundAssetId === "string" &&
          metadata.sourceBackgroundAssetId.trim() &&
          metadata.sourceBackgroundKind === "higgsfield_visual_background" &&
          (
            metadata.sourceBackgroundProvider === "higgsfield_marketing_studio" ||
            metadata.sourceBackgroundProvider === "higgsfield"
          ),
      );

      return Boolean(
        row.file_url &&
          row.thumbnail_url &&
          (
            getCreativeAssetRole(row) === "app_composed_final_static" ||
            getCreativeAssetRole(row) === "app_composed_final_thumbnail"
          ) &&
          (
            (
              sourceImageQa.mode === "background_only" &&
              sourceImageQa.decision === "accept" &&
              sourceImageQa.usable !== false
            ) ||
            appComposedV2Accepted
          ),
      );
    });
  } catch {
    return [];
  }
}

function evaluatePreStorageStaticVisualDecision(asset: StaticCreativeAsset) {
  return evaluateStaticVisualAssetDecision({
    ...asset,
    storageNormalized: asset.imageUrl ? true : asset.storageNormalized,
  });
}

function hasAcceptedFinishedAdImageQa(asset: StaticCreativeAsset) {
  return (
    asset.imageGenerationProvider === "higgsfield_marketing_studio" &&
    asset.appComposedFinal !== true &&
    asset.compositionVersion !== "app_composed_static_v2" &&
    asset.imageQa?.mode === "finished_ad" &&
    asset.imageQa.usable !== false &&
    asset.imageQa.decision === "accept"
  );
}

function isFinishedAdOnlyAsset(asset: StaticCreativeAsset) {
  return (
    asset.creativeIntake?.outputMode === "finished_ad" ||
    asset.imageGenerationProvider === "higgsfield_marketing_studio" ||
    asset.qualityTier === "higgsfield_finished_ad"
  );
}

export async function persistStaticCreativeAssets(params: PersistStaticCreativeAssetsParams) {
  const staticAds = Array.isArray(params.staticAds) ? params.staticAds : [];

  if (staticAds.length === 0) {
    return [];
  }

  const generationBatchId = crypto.randomUUID();
  const inserts: Array<Database["public"]["Tables"]["creative_assets"]["Insert"]> = [];
  const existingRows: CreativeAssetRow[] = [];
  let allInsertedCreativesAreReady = true;

  for (const [index, asset] of staticAds.entries()) {
    const visualDecision = evaluatePreStorageStaticVisualDecision(asset);
    const providerOriginalUrl = asset.imageUrl || null;
    const creativeId = buildStaticCreativeId(params.campaignId, index);
    const copyId = buildStaticCopyId(params.campaignId, index);
    let durableImage: StaticCreativeStorageNormalizationResult | null = null;
    let composedFinal: (StaticCreativeStorageNormalizationResult & { metadata: StaticCreativeCompositionMetadata }) | null = null;
    let normalizationError: string | null = null;

    const acceptedHiggsfieldFinishedAd = hasAcceptedFinishedAdImageQa(asset);

    const finishedAdOnlyAsset = isFinishedAdOnlyAsset(asset);
    const canNormalizeProviderImage = Boolean(
      asset.imageUrl &&
        (visualDecision.usable || acceptedHiggsfieldFinishedAd || finishedAdOnlyAsset),
    );

    if (canNormalizeProviderImage) {
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

    if (!acceptedHiggsfieldFinishedAd && params.allowAppComposition !== false && !finishedAdOnlyAsset) {
      try {
        composedFinal = await composeAndUploadStaticCreativeFinal({
          supabase: params.supabase,
          userId: params.userId,
          campaignId: params.campaignId,
          creativeId,
          generationBatchId,
          asset,
        });
      } catch {
        normalizationError = "Final ad could not be stored durably. Refresh this creative before launch.";
      }
    } else if (!acceptedHiggsfieldFinishedAd && finishedAdOnlyAsset && asset.imageUrl) {
      normalizationError = "Finished Higgsfield render needs review before it can be selected for launch.";
    }

    const readyUrl = acceptedHiggsfieldFinishedAd
      ? durableImage?.durableUrl ?? null
      : composedFinal?.durableUrl ?? null;
    const storageResult = composedFinal ?? durableImage;
    const compositionMetadata = composedFinal?.metadata ?? null;
    const persistedImageQa =
      acceptedHiggsfieldFinishedAd
        ? asset.imageQa ?? null
        : readyUrl && compositionMetadata
        ? buildAppComposedImageQa(compositionMetadata)
        : asset.imageUrl && !readyUrl && normalizationError
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
    const finalRasterAccepted =
      Boolean(readyUrl) &&
      persistedImageQa?.usable === true &&
      persistedImageQa?.decision === "accept";
    const normalizedGenerationState = readyUrl && finalRasterAccepted
      ? "generated"
      : readyUrl
        ? "generated"
        : asset.imageUrl
          ? "failed"
          : asset.imageGenerationState;
    const status =
      readyUrl && finalRasterAccepted
        ? "ready"
        : readyUrl
          ? "requires_review"
          : asset.imageUrl
            ? "failed"
            : asset.imageGenerationState === "failed"
            ? "failed"
            : "requires_review";
    allInsertedCreativesAreReady = allInsertedCreativesAreReady && status === "ready";
    const existingReadyRows = compositionMetadata
      ? await findExistingAppComposedFinalRows({
          supabase: params.supabase,
          userId: params.userId,
          campaignId: params.campaignId,
          staticAssetId: asset.id,
          composition: compositionMetadata,
        })
      : [];
    const hasExistingStatic = existingReadyRows.some((row) => getCreativeAssetRole(row) === "app_composed_final_static");
    const hasExistingThumbnail = existingReadyRows.some((row) => getCreativeAssetRole(row) === "app_composed_final_thumbnail");
    existingRows.push(...existingReadyRows);
    const metadataBase = {
      source: "static_ad",
      provider: acceptedHiggsfieldFinishedAd || finishedAdOnlyAsset ? "higgsfield_marketing_studio" : "static_ad",
      providerRuntime: acceptedHiggsfieldFinishedAd || finishedAdOnlyAsset ? "cli" : null,
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
      sourceImageQa: acceptedHiggsfieldFinishedAd ? null : (asset.imageQa ?? null) as Json,
      appComposedFinal: acceptedHiggsfieldFinishedAd ? false : compositionMetadata?.appComposedFinal ?? false,
      qualityTier: acceptedHiggsfieldFinishedAd
        ? "higgsfield_finished_ad"
        : finishedAdOnlyAsset
          ? "higgsfield_finished_ad_review"
          : compositionMetadata?.qualityTier ?? "draft_preview",
      visualQualityGate: (acceptedHiggsfieldFinishedAd
        ? { accepted: true, mode: "finished_ad_qa", reasons: [] }
        : compositionMetadata?.visualQualityGate ?? null) as Json,
      premiumQualityGate: (acceptedHiggsfieldFinishedAd
        ? { accepted: true, mode: "higgsfield_finished_ad_provenance", reasons: [] }
        : compositionMetadata?.premiumQualityGate ?? null) as Json,
      compositionHash: compositionMetadata?.compositionHash ?? null,
      compositionVersion: compositionMetadata?.compositionVersion ?? null,
      layoutTemplateId: compositionMetadata?.layoutTemplateId ?? null,
      sourceBackgroundKind: compositionMetadata?.sourceBackgroundKind ?? null,
      sourceBackgroundProvider: compositionMetadata?.sourceBackgroundProvider ?? null,
      sourceBackgroundAssetId: compositionMetadata?.sourceBackgroundAssetId ?? null,
      sourceImageQaMode: compositionMetadata?.sourceImageQaMode ?? null,
      sourceImageQaDecision: compositionMetadata?.sourceImageQaDecision ?? null,
      sourceImageQaOverride: compositionMetadata?.sourceImageQaOverride ?? null,
      generationMode: acceptedHiggsfieldFinishedAd || finishedAdOnlyAsset ? "finished_ad" : null,
      assetRole: acceptedHiggsfieldFinishedAd ? "final_static_ad" : finishedAdOnlyAsset ? "final_static_ad_review" : null,
      renderedOffer: compositionMetadata?.renderedOffer ?? null,
      renderedCta: compositionMetadata?.renderedCta ?? null,
      renderedBrand: compositionMetadata?.renderedBrand ?? null,
      location: asset.location ?? asset.creativeIntake?.market ?? null,
      audience: asset.audience ?? asset.creativeIntake?.targetAudience ?? null,
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
            requiredOfferTitle: asset.creativeIntake.requiredOfferTitle ?? null,
            requiredCta: asset.creativeIntake.requiredCta ?? null,
            market: asset.creativeIntake.market ?? null,
            targetAudience: asset.creativeIntake.targetAudience ?? null,
            brokerageBrand: asset.creativeIntake.brokerageBrand ?? null,
            briefHash: asset.creativeIntake.briefHash ?? null,
            staticBriefHash: asset.creativeIntake.staticBriefHash ?? null,
            offerHash: asset.creativeIntake.offerHash ?? null,
            ctaHash: asset.creativeIntake.ctaHash ?? null,
            brandHash: asset.creativeIntake.brandHash ?? null,
            promptVersionCreatedAt: asset.creativeIntake.promptVersion.createdAt,
          } as Json)
        : null,
      briefHash: asset.briefHash ?? asset.creativeIntake?.briefHash ?? null,
      staticBriefHash: asset.staticBriefHash ?? asset.creativeIntake?.staticBriefHash ?? null,
      offerHash: asset.offerHash ?? asset.creativeIntake?.offerHash ?? null,
      ctaHash: asset.ctaHash ?? asset.creativeIntake?.ctaHash ?? null,
      brandHash: asset.brandHash ?? asset.creativeIntake?.brandHash ?? null,
      briefRevisionNumber: asset.briefRevisionNumber ?? asset.creativeIntake?.revisionNumber ?? null,
      approvedOfferTitle: asset.approvedOfferTitle ?? asset.creativeIntake?.requiredOfferTitle ?? null,
      approvedCta: asset.approvedCta ?? asset.creativeIntake?.requiredCta ?? null,
      approvedBrand: asset.approvedBrand ?? asset.creativeIntake?.brokerageBrand ?? null,
      imageGenerationState: normalizedGenerationState,
      imageGenerationProvider: asset.imageGenerationProvider ?? null,
      generationMethod: acceptedHiggsfieldFinishedAd || finishedAdOnlyAsset ? "higgsfield_marketing_studio" : "app_composed_static",
      providerName: acceptedHiggsfieldFinishedAd || finishedAdOnlyAsset ? "higgsfield_marketing_studio" : "dealflow_app_composer",
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
      ...buildStorageMetadata(storageResult, providerOriginalUrl),
    } satisfies Record<string, Json | string | number | boolean | null>;

    const imageFrameRow = {
        user_id: params.userId,
        campaign_id: params.campaignId,
        creative_id: creativeId,
        copy_id: copyId,
        asset_type: "image_frame",
        format: "1:1",
        generation_method: acceptedHiggsfieldFinishedAd || finishedAdOnlyAsset ? "higgsfield_marketing_studio" : "app_composed_static",
        status,
        provider_name: acceptedHiggsfieldFinishedAd || finishedAdOnlyAsset ? "higgsfield_marketing_studio" : "dealflow_app_composer",
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
          role: acceptedHiggsfieldFinishedAd ? "higgsfield_finished_static_ad" : finishedAdOnlyAsset ? "higgsfield_finished_static_ad_review" : "app_composed_final_static",
        } as Json,
      };
    const thumbnailRow = {
        user_id: params.userId,
        campaign_id: params.campaignId,
        creative_id: creativeId,
        copy_id: copyId,
        asset_type: "thumbnail",
        format: "1:1",
        generation_method: acceptedHiggsfieldFinishedAd || finishedAdOnlyAsset ? "higgsfield_marketing_studio" : "app_composed_static",
        status,
        provider_name: acceptedHiggsfieldFinishedAd || finishedAdOnlyAsset ? "higgsfield_marketing_studio" : "dealflow_app_composer",
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
          role: acceptedHiggsfieldFinishedAd ? "higgsfield_finished_static_thumbnail" : finishedAdOnlyAsset ? "higgsfield_finished_static_thumbnail_review" : "app_composed_final_thumbnail",
        } as Json,
      };

    if (!hasExistingStatic) {
      inserts.push(imageFrameRow);
    }

    if (!hasExistingThumbnail) {
      inserts.push(thumbnailRow);
    }
  }

  if (inserts.length === 0) {
    return existingRows;
  }

  const persistedRows: CreativeAssetRow[] = [];
  for (const row of inserts) {
    persistedRows.push(
      await persistStaticCreativeAssetRow({
        supabase: params.supabase,
        userId: params.userId,
        campaignId: params.campaignId,
        row,
      }),
    );
  }

  void allInsertedCreativesAreReady;

  return [
    ...existingRows,
    ...persistedRows,
  ];
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
