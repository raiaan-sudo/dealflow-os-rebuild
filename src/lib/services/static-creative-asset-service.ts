import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import { generateStaticCreativeAds, type StaticCreativeAsset } from "@/lib/services/creative-engine";
import type { CampaignStrategyInput } from "@/lib/services/campaign-orchestrator";
import type { CampaignCreativeStrategy } from "@/lib/services/campaign-creative-strategy";
import type { Database, Json } from "@/lib/supabase/types";
import { finalizePaidCreativeProjection } from "@/lib/services/paid-creative-dispatch-service";
import { importGeneratedStaticToCanonicalStorage } from "@/lib/services/generated-static-storage-service";

type PersistStaticCreativeAssetsParams = {
  supabase: SupabaseClient<Database>;
  userId: string;
  organizationId?: string | null;
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

function buildPaidCreativeAssetId(dispatchId: string, role: "image_frame" | "thumbnail") {
  const hex = createHash("sha256").update(`${dispatchId}:${role}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function firstRow(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

async function bindGeneratedStaticStorage(params: {
  supabase: SupabaseClient<Database>;
  dispatchId: string;
  organizationId: string;
  userId: string;
  campaignId: string;
  imageAssetId: string;
  thumbnailAssetId: string;
  storageBucket: string;
  storagePath: string;
  fileUrl: string;
  contentSha256: string;
  contentLength: number;
  mimeType: string;
}) {
  const { data, error } = await params.supabase.rpc(
    "bind_generated_static_storage_v1" as never,
    {
      p_dispatch_id: params.dispatchId,
      p_organization_id: params.organizationId,
      p_user_id: params.userId,
      p_campaign_id: params.campaignId,
      p_image_asset_id: params.imageAssetId,
      p_thumbnail_asset_id: params.thumbnailAssetId,
      p_storage_bucket: params.storageBucket,
      p_storage_path: params.storagePath,
      p_file_url: params.fileUrl,
      p_content_sha256: params.contentSha256,
      p_content_length: params.contentLength,
      p_mime_type: params.mimeType,
    } as never,
  );
  const receipt = firstRow(data) as Record<string, unknown> | null;
  if (error || !receipt || receipt.bound !== true) {
    throw new ApiError(
      500,
      error?.message ?? "Generated static media could not be bound to its tenant.",
      "generated_static_storage_binding_failed",
    );
  }
  return receipt;
}

type PreparedStaticCreativeAsset = StaticCreativeAsset & {
  canonicalStorage: Awaited<ReturnType<typeof importGeneratedStaticToCanonicalStorage>> | null;
};

async function prepareStaticCreativeAssetsForPersistence(
  params: PersistStaticCreativeAssetsParams,
): Promise<PreparedStaticCreativeAsset[]> {
  const prepared: PreparedStaticCreativeAsset[] = [];
  for (const asset of Array.isArray(params.staticAds) ? params.staticAds : []) {
    const sourceUrl = asset.imageUrl?.trim() ?? "";
    if (asset.imageGenerationState !== "generated") {
      if (sourceUrl) {
        throw new ApiError(
          409,
          "A non-generated static creative cannot carry provider media.",
          "static_creative_state_media_mismatch",
        );
      }
      prepared.push({ ...asset, imageUrl: "", canonicalStorage: null });
      continue;
    }
    if (!sourceUrl || !asset.providerDispatchId?.trim() || !params.organizationId) {
      throw new ApiError(
        409,
        "Generated static media requires a paid dispatch and workspace-scoped canonical storage.",
        "static_creative_canonical_identity_missing",
      );
    }
    const canonicalStorage = await importGeneratedStaticToCanonicalStorage({
      client: params.supabase as any,
      organizationId: params.organizationId,
      userId: params.userId,
      campaignId: params.campaignId,
      providerName: "openai",
      dispatchId: asset.providerDispatchId,
      sourceUrl,
    });
    // The caller persists this same array into the campaign plan after the
    // creative rows. Propagate only the DealFlow-owned URL so the provider URL
    // cannot survive in either customer-facing persistence path.
    asset.imageUrl = canonicalStorage.publicUrl;
    prepared.push({
      ...asset,
      imageUrl: canonicalStorage.publicUrl,
      canonicalStorage,
    });
  }
  return prepared;
}

export async function persistStaticCreativeAssets(params: PersistStaticCreativeAssetsParams) {
  // Validate and import every generated provider output before any creative row
  // write or paid-dispatch settlement can occur.
  const staticAds = await prepareStaticCreativeAssetsForPersistence(params);

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
      .is("paid_creative_dispatch_id", null)
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
      paidCreativeDispatchId: asset.providerDispatchId ?? null,
      canonicalStorage: asset.canonicalStorage
        ? {
            bucket: asset.canonicalStorage.storageBucket,
            path: asset.canonicalStorage.storagePath,
            contentSha256: asset.canonicalStorage.contentSha256,
            contentLength: asset.canonicalStorage.contentLength,
            mimeType: asset.canonicalStorage.mimeType,
            reused: asset.canonicalStorage.reusedExistingObject,
            provenance: "dealflow_canonical_storage",
          }
        : null,
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
        ...(asset.providerDispatchId
          ? { id: buildPaidCreativeAssetId(asset.providerDispatchId, "image_frame") }
          : {}),
        user_id: params.userId,
        campaign_id: params.campaignId,
        creative_id: buildStaticCreativeId(params.campaignId, index),
        copy_id: buildStaticCopyId(params.campaignId, index),
        asset_type: "image_frame",
        format: "1:1",
        generation_method: "image_generation",
        status,
        provider_name: "openai",
        paid_creative_dispatch_id: asset.providerDispatchId ?? null,
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
        ...(asset.providerDispatchId
          ? { id: buildPaidCreativeAssetId(asset.providerDispatchId, "thumbnail") }
          : {}),
        user_id: params.userId,
        campaign_id: params.campaignId,
        creative_id: buildStaticCreativeId(params.campaignId, index),
        copy_id: buildStaticCopyId(params.campaignId, index),
        asset_type: "thumbnail",
        format: "1:1",
        generation_method: "image_generation",
        status,
        provider_name: "openai",
        paid_creative_dispatch_id: asset.providerDispatchId ?? null,
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
    .upsert(inserts as never, { onConflict: "id" })
    .select("*");

  if (error) {
    throw new ApiError(500, error.message, "creative_asset_persist_failed");
  }

  const persisted = Array.isArray(data) ? data : [];

  for (const asset of staticAds) {
    if (!asset.providerDispatchId) continue;
    if (!params.organizationId) {
      throw new ApiError(
        500,
        "Workspace identity is required to finalize paid creative output.",
        "paid_creative_projection_scope_missing",
      );
    }
    const assetIds = persisted
      .filter(
        (row: Record<string, unknown>) =>
          row.paid_creative_dispatch_id === asset.providerDispatchId,
      )
      .map((row: Record<string, unknown>) => String(row.id))
      .sort();
    if (assetIds.length !== 2) {
      throw new ApiError(
        500,
        "Paid static creative projection did not persist both canonical asset roles.",
        "paid_creative_projection_incomplete",
      );
    }
    const imageAsset = persisted.find(
      (row: Record<string, unknown>) =>
        row.paid_creative_dispatch_id === asset.providerDispatchId &&
        row.asset_type === "image_frame",
    ) as Record<string, unknown> | undefined;
    const thumbnailAsset = persisted.find(
      (row: Record<string, unknown>) =>
        row.paid_creative_dispatch_id === asset.providerDispatchId &&
        row.asset_type === "thumbnail",
    ) as Record<string, unknown> | undefined;
    if (!imageAsset || !thumbnailAsset || !asset.canonicalStorage) {
      throw new ApiError(
        500,
        "Paid static creative storage identity was incomplete.",
        "paid_creative_storage_projection_incomplete",
      );
    }
    await bindGeneratedStaticStorage({
      supabase: params.supabase,
      dispatchId: asset.providerDispatchId,
      organizationId: params.organizationId,
      userId: params.userId,
      campaignId: params.campaignId,
      imageAssetId: String(imageAsset.id),
      thumbnailAssetId: String(thumbnailAsset.id),
      storageBucket: asset.canonicalStorage.storageBucket,
      storagePath: asset.canonicalStorage.storagePath,
      fileUrl: asset.imageUrl,
      contentSha256: asset.canonicalStorage.contentSha256,
      contentLength: asset.canonicalStorage.contentLength,
      mimeType: asset.canonicalStorage.mimeType,
    });
    // The binding RPC is the canonical database write. Mirror the confirmed
    // identity into this return value so callers never observe metadata-only
    // storage truth after the transaction succeeds.
    for (const row of [imageAsset, thumbnailAsset]) {
      row.storage_bucket = asset.canonicalStorage.storageBucket;
      row.storage_path = asset.canonicalStorage.storagePath;
    }
    await finalizePaidCreativeProjection({
      supabase: params.supabase as any,
      dispatchId: asset.providerDispatchId,
      organizationId: params.organizationId,
      userId: params.userId,
      projectionReceipt: {
        kind: "static_creative",
        campaignId: params.campaignId,
        staticAssetId: asset.id,
        creativeAssetIds: assetIds,
        storageBucket: asset.canonicalStorage?.storageBucket ?? null,
        storagePath: asset.canonicalStorage?.storagePath ?? null,
        contentSha256: asset.canonicalStorage?.contentSha256 ?? null,
      },
    });
  }

  return persisted;
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
