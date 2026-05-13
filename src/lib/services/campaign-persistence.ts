import { ApiError } from "@/lib/api/route";
import { getSupabaseEnv } from "@/lib/env";
import { slugify } from "@/lib/utils";
import { analyzeCampaign, type CampaignAnalysisInput, type CampaignAnalysisResult } from "@/lib/services/ai-optimizer";
import {
  getSavedCampaignDocumentFromRow,
  normalizeCanonicalCampaign,
  type SavedCampaignDocument,
} from "@/lib/services/canonical-campaign";
import { persistCampaignPlanDocumentUpdate } from "@/lib/services/campaign-plan-persistence-service";
import { getAppContext } from "@/lib/services/app-context";
import {
  completeAssetGenerationLifecycle,
  deriveStaticGenerationStatus,
  readPersistedAssetGenerationState,
  shouldReuseStaticGeneration,
  startAssetGenerationLifecycle,
} from "@/lib/services/asset-generation-lifecycle";
import { debugLog } from "@/lib/debug";
import {
  generateStaticCreativeAds,
  mergeStaticCreativeImageResults,
  type CreativeEngineInput,
  type StaticCreativeAsset,
  type VideoCreativeAsset,
} from "@/lib/services/creative-engine";
import {
  getApprovedCreativeIntakeGenerationContext,
  hasSameCreativeIntakeGenerationContext,
  isCreativeChatIntakeEnabled,
} from "@/lib/services/creative-chat-intake-service";
import { evaluateStaticVisualAssetDecision } from "@/lib/services/static-creative-visual-qa";
import { persistStaticCreativeAssets } from "@/lib/services/static-creative-asset-service";
import {
  consumeSessionCostBudget,
  markSessionCostBudgetEvent,
} from "@/lib/services/session-cost-guard";
import { getMediaGenerationProvider } from "@/lib/env";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import type { Database, Json } from "@/lib/supabase/types";
import type {
  Campaign,
  CampaignOptimization,
  CampaignPublishState,
  FullCampaignRecord,
  SaveCampaignPayload,
} from "@/lib/types/campaign-records";
type CampaignPlanRow = Database["public"]["Tables"]["campaign_plans"]["Row"];
type CreativeAssetRow = Database["public"]["Tables"]["creative_assets"]["Row"];
type PersistenceClient =
  | NonNullable<Awaited<ReturnType<typeof createRouteHandlerClient>>>
  | SupabaseClient<Database>;

type CampaignPublishSnapshot = SavedCampaignDocument;

function isMissingPublishSchemaError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? error.code : null;
  const message = "message" in error ? error.message : null;

  return (
    code === "42703" ||
    /schema cache|column .* does not exist|could not find .*publish_state|could not find .*staged_snapshot|could not find .*published_snapshot/i.test(
      String(message ?? ""),
    )
  );
}

function safeText(value: unknown) {
  return (value ?? "").toString().trim();
}

function createPublishedReadClient() {
  return createAdminClient();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === "object") {
    const message =
      "message" in error && typeof error.message === "string" ? error.message.trim() : "";
    const code = "code" in error && typeof error.code === "string" ? error.code.trim() : "";
    const details =
      "details" in error && typeof error.details === "string" ? error.details.trim() : "";
    const combined = [message, code, details].filter(Boolean).join(" | ");

    if (combined) {
      return combined;
    }
  }

  return "Unknown error";
}

async function requireUserSession() {
  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase is not configured.", "config_missing");
  }

  const context = await getAppContext().catch(() => null);

  if (context) {
    return {
      supabase,
      userId: context.user.id,
      ownerId: context.organization.id ?? context.user.id,
    };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new ApiError(401, "Authentication is required for this route.", "unauthorized");
  }

  return { supabase, userId: user.id, ownerId: user.id };
}

function asStringArray(value: Json): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function asObjectRecord(value: Json | null | undefined): Record<string, Json> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, Json>;
}

function asScoreBreakdown(value: Json | null | undefined): StaticCreativeAsset["scoreBreakdown"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as StaticCreativeAsset["scoreBreakdown"];
}

function asImagePromptConfig(value: Json | null | undefined): StaticCreativeAsset["imagePromptConfig"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as StaticCreativeAsset["imagePromptConfig"];
}

function asVisualPromptBrief(value: Json | null | undefined): StaticCreativeAsset["visualPromptBrief"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as StaticCreativeAsset["visualPromptBrief"];
}

function assetErrorMessage(row: CreativeAssetRow, metadata: Record<string, Json> | null) {
  const rowError = "error_message" in row ? row.error_message : null;

  return typeof rowError === "string" && rowError.trim()
    ? rowError
    : typeof metadata?.providerError === "string" && metadata.providerError.trim()
      ? metadata.providerError
      : typeof metadata?.imageGenerationMessage === "string" && metadata.imageGenerationMessage.trim()
        ? metadata.imageGenerationMessage
        : null;
}

export function mapStaticCreativeAssets(rows: CreativeAssetRow[]): StaticCreativeAsset[] {
  const grouped = new Map<string, CreativeAssetRow[]>();

  for (const row of rows) {
    const metadata = asObjectRecord(row.metadata);
    if (metadata?.source !== "static_ad") {
      continue;
    }

    const key =
      (typeof metadata?.staticAssetId === "string" && metadata.staticAssetId.trim()) ||
      row.creative_id ||
      row.id;
    const existing = grouped.get(key) ?? [];
    existing.push(row);
    grouped.set(key, existing);
  }

  return Array.from(grouped.entries()).map(([key, assetRows]) => {
    const preferredRow =
      assetRows.find((row) => {
        const metadata = asObjectRecord(row.metadata);
        return metadata?.role === "background_image" && isAcceptedSourceStaticRow(row);
      }) ??
      assetRows.find(isAcceptedSourceStaticRow) ??
      assetRows.find((row) => {
        const metadata = asObjectRecord(row.metadata);
        return metadata?.role === "background_image" && row.status === "ready" && Boolean(row.file_url);
      }) ??
      assetRows.find((row) => {
        const metadata = asObjectRecord(row.metadata);
        return metadata?.role === "background_image" && Boolean(row.file_url);
      }) ??
      assetRows.find((row) => row.file_url) ??
      assetRows[0];
    const metadata = asObjectRecord(preferredRow.metadata);
    const imageUrl = preferredRow.file_url ?? preferredRow.thumbnail_url ?? "";
    const storageNormalized =
      metadata?.storageNormalized === true ||
      (metadata?.storageNormalizationReusedExistingAppAsset === true && typeof metadata?.storagePath === "string");
    const qualityGate =
      metadata?.qualityGate && typeof metadata.qualityGate === "object"
        ? metadata.qualityGate as StaticCreativeAsset["qualityGate"]
        : null;
    const preferredImageModel =
      metadata?.preferredImageModel === "gpt-image-1"
        ? "gpt-image-1"
        : "gpt-image-1.5";
    const assetDraft = {
      id: key,
      angle:
        metadata?.angle === "guarantee" ||
        metadata?.angle === "urgency" ||
        metadata?.angle === "contrarian" ||
        metadata?.angle === "authority"
          ? metadata.angle
          : "opportunity",
      imageUrl,
      storageNormalized,
      imageGenerationState: imageUrl ? "generated" : "unavailable",
      imageGenerationMessage:
        typeof metadata?.imageGenerationMessage === "string"
          ? metadata.imageGenerationMessage
          : null,
      imageGenerationModel:
        typeof metadata?.imageGenerationModel === "string"
          ? metadata.imageGenerationModel
          : null,
      imageGenerationProvider:
        typeof metadata?.imageGenerationProvider === "string"
          ? metadata.imageGenerationProvider
          : preferredRow.provider_name ?? null,
      visualConcept: typeof metadata?.visualConcept === "string" ? metadata.visualConcept : "",
      imagePrompt: typeof metadata?.imagePrompt === "string" ? metadata.imagePrompt : "",
      imagePromptConfig: asImagePromptConfig(metadata?.imagePromptConfig),
      preferredImageModel,
      visualPromptBrief: asVisualPromptBrief(metadata?.visualPromptBrief),
      imageQa:
        metadata?.imageQa && typeof metadata.imageQa === "object"
          ? metadata.imageQa as StaticCreativeAsset["imageQa"]
          : null,
      scoreBreakdown: asScoreBreakdown(metadata?.scoreBreakdown),
      offerQuality:
        metadata?.offerQuality && typeof metadata.offerQuality === "object"
          ? metadata.offerQuality as StaticCreativeAsset["offerQuality"]
          : null,
      qualityGate,
      hook: typeof metadata?.overlayText === "string" ? metadata.overlayText : "",
      overlayText: typeof metadata?.overlayText === "string" ? metadata.overlayText : "",
      primaryText: typeof metadata?.primaryText === "string" ? metadata.primaryText : "",
      headline: typeof metadata?.headline === "string" ? metadata.headline : "",
      cta: typeof metadata?.cta === "string" ? metadata.cta : "",
      score: typeof metadata?.score === "number" ? metadata.score : 0,
      recommended: metadata?.recommended === true,
    } satisfies StaticCreativeAsset;
    const visualDecision = evaluateStaticVisualAssetDecision(assetDraft);
    const generationState =
      imageUrl
        ? visualDecision.usable
          ? "generated"
          : "failed"
        : preferredRow.status === "failed"
          ? "failed"
          : "unavailable";

    return {
      ...assetDraft,
      imageGenerationState: generationState,
      imageGenerationMessage:
        generationState === "generated"
          ? null
          : assetErrorMessage(preferredRow, metadata) ||
            visualDecision.reason ||
            (typeof metadata?.imageGenerationMessage === "string"
              ? metadata.imageGenerationMessage
              : "This image preview is not ready yet."),
    } satisfies StaticCreativeAsset;
  });
}

function videoConceptType(assetType: string | null | undefined): VideoCreativeAsset["conceptType"] {
  return assetType === "talking_head_video" ? "founder_expert" : "customer_ugc";
}

function asVideoQualityGate(value: Json | null | undefined): VideoCreativeAsset["videoQualityGate"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as VideoCreativeAsset["videoQualityGate"];
}

function metadataString(metadata: Record<string, Json> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function metadataNumber(metadata: Record<string, Json> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isAcceptedSourceStaticRow(row: CreativeAssetRow) {
  const metadata = asObjectRecord(row.metadata);
  const imageUrl = row.file_url ?? row.thumbnail_url ?? "";
  const assetDraft = {
    imageUrl,
    storageNormalized:
      metadata?.storageNormalized === true ||
      (metadata?.storageNormalizationReusedExistingAppAsset === true && typeof metadata?.storagePath === "string"),
    imagePrompt: typeof metadata?.imagePrompt === "string" ? metadata.imagePrompt : "",
    imagePromptConfig: asImagePromptConfig(metadata?.imagePromptConfig),
    visualPromptBrief: asVisualPromptBrief(metadata?.visualPromptBrief),
    qualityGate:
      metadata?.qualityGate && typeof metadata.qualityGate === "object"
        ? metadata.qualityGate as StaticCreativeAsset["qualityGate"]
        : null,
    imageQa:
      metadata?.imageQa && typeof metadata.imageQa === "object"
        ? metadata.imageQa as StaticCreativeAsset["imageQa"]
        : null,
  };

  return row.status === "ready" && evaluateStaticVisualAssetDecision(assetDraft).usable;
}

function sourceStaticAccepted(rows: CreativeAssetRow[], sourceStaticAssetId: string | null) {
  if (!sourceStaticAssetId) {
    return false;
  }

  return rows.some((row) => {
    const metadata = asObjectRecord(row.metadata);
    const staticAssetId =
      (typeof metadata?.staticAssetId === "string" && metadata.staticAssetId.trim()) ||
      row.creative_id ||
      null;

    return staticAssetId === sourceStaticAssetId && isAcceptedSourceStaticRow(row);
  });
}

export function mapVideoCreativeAssets(rows: CreativeAssetRow[]): VideoCreativeAsset[] {
  const videoRows = rows.filter((row) =>
    ["talking_head_video", "ugc_video", "montage_video", "video"].includes(String(row.asset_type ?? "")),
  );

  return videoRows.map((row, index): VideoCreativeAsset => {
    const metadata = asObjectRecord(row.metadata);
    const status = String(row.status ?? "").toLowerCase();
    const fileUrl = typeof row.file_url === "string" ? row.file_url.trim() : "";
    const scriptText = typeof metadata?.scriptText === "string" ? metadata.scriptText : "";
    const scenes = Array.isArray(metadata?.scenes) ? metadata.scenes : [];
    const script = scriptText
      ? scriptText.split(/\n+/).map((line) => line.trim()).filter(Boolean)
      : [
          typeof metadata?.hook === "string" ? metadata.hook : "",
          typeof metadata?.body === "string" ? metadata.body : "",
          typeof metadata?.cta === "string" ? metadata.cta : "",
        ].filter(Boolean);
    const shotList = scenes
      .map((scene) => {
        if (typeof scene === "string") {
          return scene;
        }

        if (scene && typeof scene === "object" && "text" in scene && typeof scene.text === "string") {
          return scene.text;
        }

        return "";
      })
      .filter(Boolean);
    const errorMessage = assetErrorMessage(row, metadata);
    const conceptType = videoConceptType(row.asset_type);
    const promptVersion = metadata?.creativeIntakePromptVersionUsed && typeof metadata.creativeIntakePromptVersionUsed === "object"
      ? metadata.creativeIntakePromptVersionUsed as Record<string, Json>
      : null;
    const intakeContext = metadata?.creativeIntakeGenerationContext && typeof metadata.creativeIntakeGenerationContext === "object"
      ? metadata.creativeIntakeGenerationContext as Record<string, Json>
      : null;
    const promptUsed =
      metadataString(metadata, "promptUsed") ??
      metadataString(metadata, "generationPrompt") ??
      (typeof promptVersion?.generatedPrompt === "string" ? promptVersion.generatedPrompt : null);
    const sourceStaticAssetId = metadataString(metadata, "sourceStaticAssetId");
    const storageByteSize = metadataNumber(metadata, "storageByteSize");

    return {
      id: row.creative_id || row.id,
      conceptType,
      title:
        typeof metadata?.title === "string" && metadata.title.trim()
          ? metadata.title
          : conceptType === "founder_expert"
            ? "Founder-style video preview"
            : `UGC video ${index + 1}`,
      hook: typeof metadata?.hook === "string" ? metadata.hook : script[0] ?? "",
      script,
      shotList,
      onScreenText: [
        typeof metadata?.hook === "string" ? metadata.hook : "",
        typeof metadata?.cta === "string" ? metadata.cta : "",
      ].filter(Boolean),
      videoUrl: status === "ready" && fileUrl ? fileUrl : undefined,
      videoGenerationState:
        status === "ready" && fileUrl
          ? "generated"
          : status === "failed"
            ? "failed"
            : "generating",
      videoGenerationMessage:
        status === "ready" && fileUrl
          ? null
          : errorMessage ?? "This video preview is not ready yet.",
      providerName: row.provider_name ?? null,
      providerAssetId: row.provider_asset_id ?? null,
      providerStatus: metadataString(metadata, "providerStatus"),
      storageNormalized: metadata?.storageNormalized === true,
      storageBucket: metadataString(metadata, "storageBucket"),
      storagePath: metadataString(metadata, "storagePath"),
      storageContentType: metadataString(metadata, "storageContentType"),
      storageByteSize,
      sourceStaticAssetId,
      sourceImageUrl: metadataString(metadata, "sourceImageUrl"),
      sourceStaticAccepted: sourceStaticAccepted(rows, sourceStaticAssetId),
      promptUsed,
      promptSource: metadataString(metadata, "promptSource"),
      promptHash: metadataString(metadata, "promptHash"),
      scriptHash: metadataString(metadata, "scriptHash"),
      campaignSpecificContext:
        metadata?.campaignSpecificContext && typeof metadata.campaignSpecificContext === "object"
          ? metadata.campaignSpecificContext as VideoCreativeAsset["campaignSpecificContext"]
          : {
              campaignId:
                typeof intakeContext?.campaignId === "string" ? intakeContext.campaignId : row.campaign_id,
              audience: metadataString(metadata, "audience"),
              location: metadataString(metadata, "location"),
              offer: metadataString(metadata, "offer"),
              cta: typeof metadata?.cta === "string" ? metadata.cta : null,
              persona: metadataString(metadata, "persona"),
            },
      videoQualityGate: asVideoQualityGate(metadata?.videoQualityGate),
      videoQa:
        metadata?.videoQa && typeof metadata.videoQa === "object"
          ? metadata.videoQa as VideoCreativeAsset["videoQa"]
          : null,
      sampleOnly: metadata?.sampleOnly === true,
      cta: typeof metadata?.cta === "string" && metadata.cta.trim() ? metadata.cta : "Learn More",
      creatorStyle: conceptType === "founder_expert" ? "polished expert walkthrough" : "native creator-style walkthrough",
      voiceStyle: "clear and direct",
      avatarProfile: {
        id: "trusted_expert",
        genderPresentation: "polished professional",
        ageRange: "30-45",
        stylePersona: "trusted real estate expert",
        energy: "calm and decisive",
        nicheFit: "",
      },
      voiceProfile: {
        id: "authoritative",
        tone: "authoritative and clear",
        accent: "local neutral",
        speed: "measured",
        authorityLevel: "high",
      },
      qualityGate: null,
    };
  });
}

async function loadStaticCreativeAssets(
  supabase: PersistenceClient,
  userId: string,
  campaignId: string,
) {
  try {
    const { data, error } = await supabase
      .from("creative_assets")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return mapStaticCreativeAssets(Array.isArray(data) ? (data as CreativeAssetRow[]) : []);
  } catch {
    return [];
  }
}

async function loadVideoCreativeAssets(
  supabase: PersistenceClient,
  userId: string,
  campaignId: string,
) {
  try {
    const { data, error } = await supabase
      .from("creative_assets")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return mapVideoCreativeAssets(Array.isArray(data) ? (data as CreativeAssetRow[]) : []);
  } catch {
    return [];
  }
}

async function persistGeneratedStaticAdsToCampaignPlan(params: {
  supabase: PersistenceClient;
  campaignId: string;
  userId: string;
  staticAds: StaticCreativeAsset[];
  row: CampaignPlanRow;
  generationError?: string | null;
}) {
  const savedDocument = getSavedCampaignDocumentFromRow(params.row) ?? {};
  const previousGenerationState = readPersistedAssetGenerationState(savedDocument?.assetGeneration);
  const nextPlan = {
    ...(savedDocument as Record<string, unknown>),
    staticAds: params.staticAds,
    assetGeneration: {
      ...((savedDocument?.assetGeneration as Record<string, unknown> | null) ?? {}),
      staticAds: completeAssetGenerationLifecycle({
        previous: previousGenerationState.staticAds,
        status: deriveStaticGenerationStatus(params.staticAds),
        error: params.generationError ?? null,
      }),
    },
  } as Json;

  try {
    await persistCampaignPlanDocumentUpdate({
      supabase: params.supabase,
      campaignId: params.campaignId,
      userId: params.userId,
      plan: nextPlan,
      source: "campaign_static_ads_save",
      existingRow: params.row,
    });
  } catch (error) {
    throw new ApiError(500, getErrorMessage(error), "campaign_static_ads_save_failed");
  }

  return {
    ...(savedDocument as Record<string, unknown>),
    staticAds: params.staticAds,
    assetGeneration: {
      ...((savedDocument?.assetGeneration as Record<string, unknown> | null) ?? {}),
      staticAds: completeAssetGenerationLifecycle({
        previous: previousGenerationState.staticAds,
        status: deriveStaticGenerationStatus(params.staticAds),
        error: params.generationError ?? null,
      }),
    },
  } as SavedCampaignDocument;
}

function mapCampaignRow(row: CampaignPlanRow): Campaign {
  const plan = getSavedCampaignDocumentFromRow(row);

  return {
    id: row.id,
    user_id: row.user_id,
    organization_id: row.organization_id,
    name: safeText(plan?.name) || "Untitled Campaign",
    location: plan?.strategy?.location ?? null,
    audience: plan?.strategy?.audience ?? null,
    offer: plan?.strategy?.offer ?? null,
    price_point: plan?.strategy?.price_point ?? null,
    market_type: plan?.strategy?.market_type ?? null,
    funnel_goal: plan?.strategy?.funnel_goal ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapPublishRecord(row: CampaignPlanRow) {
  return {
    state:
      row.publish_state === "staged" || row.publish_state === "published"
        ? row.publish_state
        : ("draft" as CampaignPublishState),
    slug: row.public_slug ?? null,
    stagedAt: row.staged_at ?? null,
    publishedAt: row.published_at ?? null,
    stagedSnapshot:
      row.staged_snapshot && typeof row.staged_snapshot === "object" && !Array.isArray(row.staged_snapshot)
        ? (row.staged_snapshot as unknown as CampaignPublishSnapshot)
        : null,
    publishedSnapshot:
      row.published_snapshot && typeof row.published_snapshot === "object" && !Array.isArray(row.published_snapshot)
        ? (row.published_snapshot as unknown as CampaignPublishSnapshot)
        : null,
  };
}

function buildPersistedSavedDocument(record: FullCampaignRecord): CampaignPublishSnapshot {
  return {
    name: record.campaign.name,
    plan: record.plan as unknown as Record<string, unknown>,
    strategy: record.strategy,
    items: record.creatives.items,
    creatives: record.creatives.ideas,
    staticAds: record.creatives.staticAds,
    videoAds: record.creatives.videoAds,
    copy: record.creatives.copy,
    ads: record.creatives.ads,
    funnel: record.funnel as unknown as Record<string, unknown>,
    launch: record.launch,
    results: record.results,
  };
}

function buildPublicSlug(record: FullCampaignRecord, requestedSlug?: string | null) {
  const explicitSlug = safeText(requestedSlug) || safeText(record.publish.slug);
  const automaticSlug = `${record.campaign.name}-${record.plan.market}-${record.campaign.id.slice(0, 8)}`;
  const candidate = explicitSlug || automaticSlug;
  const normalized = slugify(candidate);

  if (!normalized) {
    throw new ApiError(400, "A valid publish slug is required.", "validation_error");
  }

  return normalized;
}

async function assertCampaignOwnership(
  campaignId: string,
): Promise<{
  supabase: PersistenceClient;
  userId: string;
  row: CampaignPlanRow;
  campaign: Campaign;
}> {
  const { supabase, userId, ownerId } = await requireUserSession();
  const row = await loadCampaignPlanRowForUser(supabase, userId, ownerId, campaignId);
  return { supabase, userId, row, campaign: mapCampaignRow(row) };
}

async function loadCampaignPlanRowForUser(
  supabase: PersistenceClient,
  userId: string,
  ownerIdOrCampaignId: string,
  maybeCampaignId?: string,
) {
  const campaignId = maybeCampaignId ?? ownerIdOrCampaignId;
  const ownerId = maybeCampaignId ? ownerIdOrCampaignId : userId;
  const { data, error } = await supabase
    .from("campaign_plans")
    .select("*")
    .eq("id", campaignId)
    .or(`user_id.eq.${userId},owner_id.eq.${ownerId}`)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new ApiError(404, "Campaign not found.", "not_found");
  }

  return data as CampaignPlanRow;
}

export async function saveCampaign(payload: SaveCampaignPayload) {
  const { supabase, userId, ownerId } = await requireUserSession();
  const campaignName = (payload.name ?? "").trim();

  if (!campaignName) {
    throw new ApiError(400, "Campaign name is required.", "validation_error");
  }

  const requestedCampaignId = safeText(payload.campaignId);
  const campaignId = requestedCampaignId || crypto.randomUUID();
  let existingSavedDocument: SavedCampaignDocument | null = null;
  let existingAssetGeneration: Record<string, unknown> | null = null;

  if (requestedCampaignId) {
    const { data: existingRow } = await supabase
      .from("campaign_plans")
      .select("plan")
      .eq("id", campaignId)
      .eq("user_id", userId)
      .maybeSingle();

    existingSavedDocument = existingRow
      ? getSavedCampaignDocumentFromRow(existingRow as CampaignPlanRow)
      : null;

    existingAssetGeneration =
      existingSavedDocument?.assetGeneration &&
      typeof existingSavedDocument.assetGeneration === "object" &&
      !Array.isArray(existingSavedDocument.assetGeneration)
        ? (existingSavedDocument.assetGeneration as Record<string, unknown>)
        : null;
  }

  const incomingSavedDocument: SavedCampaignDocument = {
    name: campaignName,
    plan: payload.plan ?? null,
    strategy: payload.campaign?.strategy ?? null,
    creatives: payload.creatives ?? payload.campaign?.creatives ?? null,
    items: payload.campaign?.items ?? null,
    copy: payload.copy ?? payload.campaign?.copy ?? null,
    ads: payload.ads ?? null,
    funnel: payload.funnel ?? payload.campaign?.funnel ?? null,
    launch: payload.launch ?? null,
    results: payload.results ?? null,
  };
  const mergedSavedDocument: SavedCampaignDocument =
    requestedCampaignId && existingSavedDocument
      ? {
          ...existingSavedDocument,
          ...incomingSavedDocument,
          name: campaignName,
          plan: {
            ...((existingSavedDocument.plan as Record<string, unknown> | null) ?? {}),
            ...((incomingSavedDocument.plan as Record<string, unknown> | null) ?? {}),
          },
          strategy: {
            ...((existingSavedDocument.strategy as Record<string, unknown> | null) ?? {}),
            ...((incomingSavedDocument.strategy as Record<string, unknown> | null) ?? {}),
          },
          funnel: {
            ...((existingSavedDocument.funnel as Record<string, unknown> | null) ?? {}),
            ...((incomingSavedDocument.funnel as Record<string, unknown> | null) ?? {}),
          },
          launch: incomingSavedDocument.launch ?? existingSavedDocument.launch ?? null,
          results: incomingSavedDocument.results ?? existingSavedDocument.results ?? null,
          assetGeneration: existingSavedDocument.assetGeneration,
        }
      : incomingSavedDocument;

  const canonical = normalizeCanonicalCampaign({
    campaign: {
      id: campaignId,
      user_id: userId,
      name: campaignName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    savedDocument: mergedSavedDocument,
    builtCampaign: payload.campaign,
    publish: {
      state: "draft",
      slug: null,
      stagedAt: null,
      publishedAt: null,
      stagedSnapshot: null,
      publishedSnapshot: null,
    },
  });
  const plan = {
    name: canonical.campaign.name,
    plan: canonical.plan,
    strategy: canonical.strategy,
    items: canonical.creatives.items,
    creatives: canonical.creatives.ideas,
    staticAds: canonical.creatives.staticAds,
    videoAds: canonical.creatives.videoAds,
    copy: canonical.creatives.copy,
    ads: canonical.creatives.ads,
    funnel: canonical.funnel,
    launch: canonical.launch,
    results: canonical.results,
  };

  const persistencePayload = {
    id: campaignId,
    owner_id: ownerId,
    organization_id: ownerId,
    user_id: userId,
    plan: {
      ...(plan as Record<string, unknown>),
      ...(existingAssetGeneration ? { assetGeneration: existingAssetGeneration } : {}),
    } as unknown as Json,
  };

  const query = requestedCampaignId
    ? supabase
        .from("campaign_plans")
        .update(persistencePayload as never)
        .eq("id", campaignId)
        .eq("user_id", userId)
        .select("*")
        .single()
    : supabase
        .from("campaign_plans")
        .insert(persistencePayload as never)
        .select("*")
        .single();

  const { data, error } = await query;

  if (error) {
    if (
      !requestedCampaignId &&
      error.code === "23505" &&
      /campaign_plans_user_id_unique|campaign_plans.*user_id.*unique|duplicate key value/i.test(
        error.message,
      )
    ) {
      const { data: existingRow, error: existingRowError } = await supabase
        .from("campaign_plans")
        .select("id, plan")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingRowError) {
        throw new ApiError(500, existingRowError.message, "campaign_save_failed");
      }

      const existingCampaignId =
        existingRow && typeof (existingRow as Pick<CampaignPlanRow, "id">).id === "string"
          ? (existingRow as Pick<CampaignPlanRow, "id">).id
          : "";

      if (existingCampaignId) {
        const recoveredExistingDocument = getSavedCampaignDocumentFromRow(existingRow as CampaignPlanRow);
        const currentPersistencePlan = persistencePayload.plan as Record<string, unknown>;
        const recoveredPlan = recoveredExistingDocument
          ? {
              ...currentPersistencePlan,
              plan: {
                ...((recoveredExistingDocument.plan as Record<string, unknown> | null) ?? {}),
                ...((currentPersistencePlan.plan as Record<string, unknown> | null) ?? {}),
              },
              strategy: {
                ...((recoveredExistingDocument.strategy as Record<string, unknown> | null) ?? {}),
                ...((currentPersistencePlan.strategy as Record<string, unknown> | null) ?? {}),
              },
              funnel: {
                ...((recoveredExistingDocument.funnel as Record<string, unknown> | null) ?? {}),
                ...((currentPersistencePlan.funnel as Record<string, unknown> | null) ?? {}),
              },
              ...(recoveredExistingDocument.assetGeneration
                ? { assetGeneration: recoveredExistingDocument.assetGeneration }
                : {}),
            }
          : currentPersistencePlan;
        const recoveredUpdatePayload = {
          ...(persistencePayload as Record<string, unknown>),
          id: existingCampaignId,
          plan: recoveredPlan,
        };
        const { data: recoveredData, error: recoveredError } = await supabase
          .from("campaign_plans")
          .update(recoveredUpdatePayload as never)
          .eq("id", existingCampaignId)
          .eq("user_id", userId)
          .select("*")
          .single();

        if (recoveredError) {
          throw new ApiError(500, recoveredError.message, "campaign_save_failed");
        }

        if (recoveredData) {
          return {
            success: true,
            campaignId: (recoveredData as CampaignPlanRow).id,
          };
        }
      }
    }

    debugLog("campaign-save-failed", {
      message: error.message,
      code: "campaign_save_failed",
    });
    if (requestedCampaignId && error.code === "PGRST116") {
      throw new ApiError(404, "Campaign not found.", "campaign_not_found");
    }

    throw new ApiError(500, error.message, "campaign_save_failed");
  }

  if (!data) {
    throw new ApiError(500, "Campaign could not be saved.", "campaign_save_failed");
  }

  return {
    success: true,
    campaignId: (data as CampaignPlanRow).id,
  };
}

export async function listCampaignsForUser() {
  const { supabase, userId } = await requireUserSession();
  const { data, error } = await supabase
    .from("campaign_plans")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => {
    const typedRow = row as CampaignPlanRow;
    const campaign = mapCampaignRow(typedRow);
    const savedDocument = getSavedCampaignDocumentFromRow(typedRow);

    return normalizeCanonicalCampaign({
      campaign,
      savedDocument,
      publish: mapPublishRecord(typedRow),
    });
  });
}

export async function getCampaignOptimizations(campaignId: string) {
  const record = await getCampaignById(campaignId);
  return record?.results.optimizations ?? [];
}

export async function getCampaignById(campaignId: string): Promise<FullCampaignRecord | null> {
  const { supabase, row, campaign } = await assertCampaignOwnership(campaignId);
  const savedDocument = getSavedCampaignDocumentFromRow(row);
  const [staticAds, videoAds] = await Promise.all([
    loadStaticCreativeAssets(supabase, campaign.user_id, campaignId),
    loadVideoCreativeAssets(supabase, campaign.user_id, campaignId),
  ]);

  return normalizeCanonicalCampaign({
    campaign,
    savedDocument,
    staticAds,
    videoAds: videoAds.length > 0 ? videoAds : undefined,
    publish: mapPublishRecord(row),
  });
}

export async function getLatestCampaignRecord(): Promise<FullCampaignRecord | null> {
  const { supabase, userId } = await requireUserSession();
  const latestQuery = () =>
    supabase
      .from("campaign_plans")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  let { data, error } = await latestQuery();

  if (error) {
    ({ data, error } = await supabase
      .from("campaign_plans")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle());
  }

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const row = data as CampaignPlanRow;
  const [staticAds, videoAds] = await Promise.all([
    loadStaticCreativeAssets(supabase, userId, row.id),
    loadVideoCreativeAssets(supabase, userId, row.id),
  ]);
  return normalizeCanonicalCampaign({
    campaign: mapCampaignRow(row),
    savedDocument: getSavedCampaignDocumentFromRow(row),
    staticAds,
    videoAds: videoAds.length > 0 ? videoAds : undefined,
    publish: mapPublishRecord(row),
  });
}

export async function regenerateStaticCreativeAssets(
  campaignId: string,
  options?: { force?: boolean },
): Promise<FullCampaignRecord> {
  const { supabase, userId } = await requireUserSession();
  return regenerateStaticCreativeAssetsForUser(campaignId, userId, {
    force: options?.force,
    supabase,
  });
}

export async function regenerateStaticCreativeAssetsForUser(
  campaignId: string,
  userId: string,
  options?: {
    force?: boolean;
    missingOnly?: boolean;
    maxGenerations?: number;
    creativeIntake?: CreativeEngineInput["creative_intake"];
    supabase?: PersistenceClient;
    providerUsageRunId?: string | null;
  },
): Promise<FullCampaignRecord> {
  const supabase =
    options?.supabase ??
    createAdminClient() ??
    (await createRouteHandlerClient());

  if (!supabase) {
    throw new ApiError(503, "Supabase is not configured.", "config_missing");
  }

  const row = await loadCampaignPlanRowForUser(supabase, userId, campaignId);
  const campaign = mapCampaignRow(row);
  const savedDocument = getSavedCampaignDocumentFromRow(row);
  const durableCreativeIntake = isCreativeChatIntakeEnabled()
    ? getApprovedCreativeIntakeGenerationContext(savedDocument)
    : options?.creativeIntake ?? null;

  if (isCreativeChatIntakeEnabled()) {
    if (!durableCreativeIntake || durableCreativeIntake.generationPhase !== "static") {
      throw new ApiError(
        409,
        "Review and approve the static creative brief before rendering paid image previews.",
        "creative_brief_review_required",
      );
    }

    if (
      options?.creativeIntake &&
      !hasSameCreativeIntakeGenerationContext(options.creativeIntake, durableCreativeIntake)
    ) {
      throw new ApiError(
        409,
        "The queued static creative job no longer matches the approved creative brief.",
        "creative_brief_version_mismatch",
      );
    }
  }

  const [persistedStaticAds, persistedVideoAds] = await Promise.all([
    loadStaticCreativeAssets(supabase, userId, campaignId),
    loadVideoCreativeAssets(supabase, userId, campaignId),
  ]);
  const savedStaticAds = Array.isArray(savedDocument?.staticAds)
    ? (savedDocument.staticAds as StaticCreativeAsset[])
    : [];
  const currentStaticAds =
    savedStaticAds.length > 0
      ? mergeStaticCreativeImageResults(savedStaticAds, persistedStaticAds)
      : persistedStaticAds;
  const currentRecord = normalizeCanonicalCampaign({
    campaign,
    savedDocument,
    staticAds: currentStaticAds.length > 0 ? currentStaticAds : undefined,
    videoAds: persistedVideoAds.length > 0 ? persistedVideoAds : undefined,
    publish: mapPublishRecord(row),
  });
  const generationState = readPersistedAssetGenerationState(savedDocument?.assetGeneration);

  if (
    shouldReuseStaticGeneration({
      force: options?.force,
      missingOnly: options?.missingOnly,
      lifecycle: generationState.staticAds,
      staticAds: currentRecord.creatives.staticAds,
    })
  ) {
    return currentRecord;
  }

  const nextPlan = {
    ...((savedDocument as Record<string, unknown> | null) ?? {}),
    assetGeneration: {
      ...((savedDocument?.assetGeneration as Record<string, unknown> | null) ?? {}),
      staticAds: startAssetGenerationLifecycle(generationState.staticAds),
    },
  } as Json;

  try {
    await persistCampaignPlanDocumentUpdate({
      supabase,
      campaignId,
      userId,
      plan: nextPlan,
      source: "campaign_static_generation_state_save",
      existingRow: row,
    });
  } catch (error) {
    throw new ApiError(500, getErrorMessage(error), "campaign_static_generation_state_save_failed");
  }

  try {
    const generatedStaticAds = await generateStaticCreativeAds({
      location: currentRecord.strategy.location,
      audience: currentRecord.strategy.audience,
      offer: currentRecord.strategy.offer,
      price_point: currentRecord.strategy.price_point,
      market_type: currentRecord.strategy.market_type,
      creative_strategy: currentRecord.plan.creative_strategy,
      campaign_id: campaignId,
      reuse_static_assets: currentRecord.creatives.staticAds,
      max_static_image_generations: options?.maxGenerations,
      creative_intake: durableCreativeIntake,
      force: options?.force === true,
      provider_usage_context: {
        createForAsset: (asset) => {
          const runScope = options?.providerUsageRunId?.trim() || "default";
          const provider = getMediaGenerationProvider();
          const idempotencyKey = `image_generation:${provider}:${row.organization_id ?? "org"}:${userId}:${campaignId}:${asset.id}:${asset.preferredImageModel}:${runScope}`;

          return {
            reserve: () =>
              consumeSessionCostBudget({
                bucket: "image_generation",
                userId,
                organizationId: row.organization_id,
                campaignId,
                idempotencyKey,
              }),
            mark: markSessionCostBudgetEvent,
          };
        },
      },
    });
    const staticAds = mergeStaticCreativeImageResults(
      generatedStaticAds,
      currentRecord.creatives.staticAds,
    );

    await persistStaticCreativeAssets({
      supabase,
      userId,
      campaignId,
      staticAds,
    });

    const updatedSavedDocument = await persistGeneratedStaticAdsToCampaignPlan({
      supabase,
      campaignId,
      userId,
      staticAds,
      row: {
        ...row,
        plan: nextPlan,
      } as CampaignPlanRow,
    });

    return normalizeCanonicalCampaign({
      campaign,
      savedDocument: updatedSavedDocument,
      staticAds,
      publish: mapPublishRecord(row),
    });
  } catch (error) {
    const failurePlan = {
      ...((savedDocument as Record<string, unknown> | null) ?? {}),
      assetGeneration: {
        ...((savedDocument?.assetGeneration as Record<string, unknown> | null) ?? {}),
        staticAds: completeAssetGenerationLifecycle({
          previous: startAssetGenerationLifecycle(generationState.staticAds),
          status: "failed",
          error: error instanceof Error ? error.message : "Static generation failed.",
        }),
      },
    } as Json;

    await persistCampaignPlanDocumentUpdate({
      supabase,
      campaignId,
      userId,
      plan: failurePlan,
      source: "campaign_static_generation_failure",
      existingRow: row,
    });

    throw error;
  }
}

export async function updateCampaignPublishState(params: {
  campaignId: string;
  state: CampaignPublishState;
  slug?: string | null;
}) {
  const { supabase, row, campaign } = await assertCampaignOwnership(params.campaignId);
  const currentRecord = normalizeCanonicalCampaign({
    campaign,
    savedDocument: getSavedCampaignDocumentFromRow(row),
    publish: mapPublishRecord(row),
  });
  const slug = buildPublicSlug(currentRecord, params.slug);
  const snapshot = buildPersistedSavedDocument(currentRecord);
  const nextState = params.state;
  const now = new Date().toISOString();

  const update: Database["public"]["Tables"]["campaign_plans"]["Update"] = {
    public_slug: slug,
  };

  if (nextState === "staged") {
    update.publish_state = "staged";
    update.staged_snapshot = snapshot as unknown as Json;
    update.staged_at = now;
  } else if (nextState === "published") {
    update.publish_state = "published";
    update.staged_snapshot = snapshot as unknown as Json;
    update.staged_at = row.staged_at ?? now;
    update.published_snapshot = snapshot as unknown as Json;
    update.published_at = now;
  } else {
    update.publish_state = "draft";
    update.public_slug = slug;
    update.staged_snapshot = null;
    update.staged_at = null;
  }

  const writeClient = createAdminClient() ?? supabase;
  const { data, error } = await writeClient
    .from("campaign_plans")
    .update(update as never)
    .eq("id", params.campaignId)
    .eq("user_id", campaign.user_id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (isMissingPublishSchemaError(error)) {
      throw new ApiError(
        503,
        "Publishing is not available because the public funnel publishing migration is missing. Apply 032_public_funnel_publishing.sql.",
        "publishing_schema_missing",
      );
    }

    if (error.code === "23505") {
      throw new ApiError(409, "That public slug is already in use.", "conflict");
    }

    throw error;
  }

  if (!data) {
    throw new ApiError(404, "Campaign not found for publish update.", "campaign_not_found");
  }

  const updatedRow = data as CampaignPlanRow;
  return normalizeCanonicalCampaign({
    campaign: mapCampaignRow(updatedRow),
    savedDocument: getSavedCampaignDocumentFromRow(updatedRow),
    publish: mapPublishRecord(updatedRow),
  });
}

export async function getPublishedCampaignBySlug(slug: string): Promise<FullCampaignRecord | null> {
  const normalizedSlug = slugify(slug);

  if (!normalizedSlug) {
    return null;
  }

  const admin = createPublishedReadClient();

  if (!admin) {
    throw new ApiError(503, "Publishing is not configured.", "config_missing");
  }

  const { data, error } = await admin
    .from("campaign_plans")
    .select("*")
    .eq("public_slug", normalizedSlug)
    .eq("publish_state", "published")
    .maybeSingle();

  if (error) {
    if (isMissingPublishSchemaError(error)) {
      throw new ApiError(
        503,
        "Publishing is not available because the public funnel publishing migration is missing. Apply 032_public_funnel_publishing.sql.",
        "publishing_schema_missing",
      );
    }

    throw error;
  }

  if (!data) {
    return null;
  }

  const row = data as CampaignPlanRow;
  const publishedSnapshot = mapPublishRecord(row).publishedSnapshot;

  if (!publishedSnapshot) {
    return null;
  }

  return normalizeCanonicalCampaign({
    campaign: mapCampaignRow(row),
    savedDocument: publishedSnapshot,
    publish: mapPublishRecord(row),
  });
}

export async function saveOptimizationResult(
  campaignId: string,
  metrics: CampaignAnalysisInput,
  result?: CampaignAnalysisResult,
) {
  const { supabase, userId, row, campaign } = await assertCampaignOwnership(campaignId);
  const analysis = result ?? analyzeCampaign(metrics);
  const savedDocument = getSavedCampaignDocumentFromRow(row) ?? {};
  const currentRecord = normalizeCanonicalCampaign({
    campaign,
    savedDocument,
    publish: mapPublishRecord(row),
  });
  const nextOptimization: CampaignOptimization = {
    ctr: Number(metrics.ctr),
    cpc: Number(metrics.cpc),
    cpl: Number(metrics.cpl),
    frequency: Number(metrics.frequency),
    spend: Number(metrics.spend),
    leads: Number(metrics.leads),
    lp_cvr: Number(metrics.lp_cvr),
    status: analysis.status,
    reasons: analysis.reasons,
    actions: analysis.actions,
    created_at: new Date().toISOString(),
  };
  const nextPlan = {
    ...(savedDocument as Record<string, unknown>),
    results: {
      ...((savedDocument.results as Record<string, unknown> | null) ?? {}),
      optimizations: [nextOptimization, ...currentRecord.results.optimizations],
    },
  } as Json;

  try {
    await persistCampaignPlanDocumentUpdate({
      supabase,
      campaignId,
      userId,
      plan: nextPlan,
      source: "campaign_optimization_save",
      existingRow: row,
    });
  } catch (error) {
    throw new ApiError(500, getErrorMessage(error), "optimization_save_failed");
  }

  return nextOptimization;
}
