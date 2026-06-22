import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertInternalSystemRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { getMediaGenerationProvider } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assertProviderGenerationHardCapsConfigured,
  assertProviderGenerationSpendAllowed,
  getProviderGenerationSpendGateSnapshot,
} from "@/lib/services/provider-generation-spend-guard";
import {
  consumeSessionCostBudget,
  markSessionCostBudgetEvent,
} from "@/lib/services/session-cost-guard";
import {
  generateStaticCreativeAds,
  type StaticCreativeAsset,
} from "@/lib/services/creative-engine";
import { persistStaticCreativeAssets } from "@/lib/services/static-creative-asset-service";
import type { Database, Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

const PROOF_ENV_GATE = "PROVIDER_STATIC_GENERATION_PROOF_ENABLED";
const PROOF_NAME = "provider_static_generation_live_capped";
const DEFAULT_PROOF_RUN_ID = "provider_static_generation_caps_v1_20260618_01";
const DEFAULT_PROOF_CAMPAIGN_ID = "acbe135e-4eff-464f-9387-0a4e98c5bc43";

const requestSchema = z.object({
  mode: z.enum(["dryRun", "generate", "duplicate", "capExceeded", "verify"]).default("dryRun"),
  proofRunId: z.string().trim().min(12).max(120).default(DEFAULT_PROOF_RUN_ID),
  campaignId: z.string().uuid().default(DEFAULT_PROOF_CAMPAIGN_ID),
});

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type UntypedAdminClient = {
  from: (table: string) => any;
};
type CampaignPlanRow = Pick<
  Database["public"]["Tables"]["campaign_plans"]["Row"],
  "id" | "user_id" | "organization_id" | "plan" | "public_slug" | "publish_state" | "launch_status"
>;
type ProviderUsageEventRow = Pick<
  Database["public"]["Tables"]["provider_usage_events"]["Row"],
  "id" | "status" | "provider" | "operation" | "campaign_id" | "idempotency_key" | "estimated_cost" | "actual_cost" | "created_at" | "metadata"
>;
type CreativeAssetRow = Pick<
  Database["public"]["Tables"]["creative_assets"]["Row"],
  "id" | "campaign_id" | "creative_id" | "asset_type" | "status" | "file_url" | "thumbnail_url" | "provider_name" | "metadata" | "created_at"
>;

const AUDITED_TABLES = [
  "provider_usage_events",
  "provider_usage_limits",
  "creative_assets",
  "user_credit_ledger",
  "leads",
  "system_jobs",
  "lead_crm_sync_events",
  "ghl_provisioning_jobs",
  "ghl_provisioning_events",
  "workspace_ghl_users",
] as const;

function assertProofEnabled() {
  if (process.env[PROOF_ENV_GATE] !== "true") {
    throw new ApiError(404, "Provider static generation proof harness is not enabled.", "provider_static_generation_proof_disabled");
  }
}

function getAdminClient() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service-role client is not configured.", "service_role_missing");
  }

  return admin;
}

function db(admin: AdminClient) {
  return admin as unknown as UntypedAdminClient;
}

function getProviderName() {
  const provider = getMediaGenerationProvider();
  return provider === "higgsfield_marketing_studio" ? "higgsfield" : provider;
}

function buildProofIdempotencyPrefix(params: {
  proofRunId: string;
  organizationId: string;
  userId: string;
  campaignId: string;
}) {
  return [
    "provider_static_generation_proof",
    params.proofRunId,
    params.organizationId,
    params.userId,
    params.campaignId,
  ].join(":");
}

function summarizeProviderEvent(row: ProviderUsageEventRow) {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};

  return {
    id: row.id,
    status: row.status,
    provider: row.provider,
    operation: row.operation,
    campaignId: row.campaign_id,
    idempotencyKey: row.idempotency_key,
    estimatedCost: row.estimated_cost,
    actualCost: row.actual_cost,
    createdAt: row.created_at,
    proofRunId: typeof metadata.proof_run_id === "string" ? metadata.proof_run_id : null,
    proofMode: typeof metadata.proof_mode === "string" ? metadata.proof_mode : null,
    tokenExposed: false,
    secretExposed: false,
  };
}

function summarizeCreativeAsset(row: CreativeAssetRow) {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const storagePath = typeof metadata.storagePath === "string" ? metadata.storagePath : null;
  const providerOriginalUrl = typeof metadata.provider_original_url === "string" ? metadata.provider_original_url : null;

  return {
    id: row.id,
    campaignId: row.campaign_id,
    creativeId: row.creative_id,
    assetType: row.asset_type,
    status: row.status,
    providerName: row.provider_name,
    createdAt: row.created_at,
    storagePath,
    hasAppOwnedFileUrl: Boolean(row.file_url && !row.file_url.includes("higgsfield") && !row.file_url.includes("openai")),
    hasAppOwnedThumbnailUrl: Boolean(row.thumbnail_url && !row.thumbnail_url.includes("higgsfield") && !row.thumbnail_url.includes("openai")),
    providerOriginalUrlStoredOnlyInMetadata: Boolean(providerOriginalUrl),
    proofRunId: typeof metadata.providerProofRunId === "string" ? metadata.providerProofRunId : null,
    tokenExposed: false,
    secretExposed: false,
  };
}

async function countTableRows(admin: AdminClient) {
  const entries = await Promise.all(
    AUDITED_TABLES.map(async (table) => {
      const { count, error } = await db(admin)
        .from(table)
        .select("id", { count: "exact", head: true });

      if (error) {
        throw new ApiError(500, error.message, `${table}_count_failed`);
      }

      return [table, count ?? 0] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<(typeof AUDITED_TABLES)[number], number>;
}

function diffCounts(before: Record<string, number>, after: Record<string, number>) {
  return Object.fromEntries(
    AUDITED_TABLES.map((table) => [table, (after[table] ?? 0) - (before[table] ?? 0)]),
  );
}

async function readCampaign(admin: AdminClient, campaignId: string) {
  const { data, error } = await db(admin)
    .from("campaign_plans")
    .select("id,user_id,organization_id,plan,public_slug,publish_state,launch_status")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "campaign_lookup_failed");
  }

  const row = data as CampaignPlanRow | null;
  if (!row?.id || !row.user_id || !row.organization_id) {
    throw new ApiError(404, "Proof campaign was not found or lacks workspace ownership.", "proof_campaign_unavailable");
  }

  return row;
}

async function listProofProviderEvents(admin: AdminClient, prefix: string) {
  const { data, error } = await db(admin)
    .from("provider_usage_events")
    .select("id,status,provider,operation,campaign_id,idempotency_key,estimated_cost,actual_cost,created_at,metadata")
    .like("idempotency_key", `${prefix}%`)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    throw new ApiError(500, error.message, "provider_usage_events_lookup_failed");
  }

  return (Array.isArray(data) ? data : []) as ProviderUsageEventRow[];
}

async function listProofCreativeAssets(admin: AdminClient, campaignId: string, proofRunId: string) {
  const { data, error } = await db(admin)
    .from("creative_assets")
    .select("id,campaign_id,creative_id,asset_type,status,file_url,thumbnail_url,provider_name,metadata,created_at")
    .eq("campaign_id", campaignId)
    .eq("metadata->>providerProofRunId", proofRunId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    throw new ApiError(500, error.message, "proof_creative_assets_lookup_failed");
  }

  return (Array.isArray(data) ? data : []) as CreativeAssetRow[];
}

async function markProofCreativeRows(params: {
  admin: AdminClient;
  rows: CreativeAssetRow[];
  proofRunId: string;
  proofMode: string;
  idempotencyPrefix: string;
}) {
  const updated: CreativeAssetRow[] = [];

  for (const row of params.rows) {
    const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {};
    const nextMetadata = {
      ...metadata,
      providerProof: PROOF_NAME,
      providerProofRunId: params.proofRunId,
      providerProofMode: params.proofMode,
      providerProofIdempotencyPrefix: params.idempotencyPrefix,
      providerProofMarkedAt: new Date().toISOString(),
    } satisfies Record<string, Json | string | number | boolean | null>;

    const { data, error } = await db(params.admin)
      .from("creative_assets")
      .update({ metadata: nextMetadata })
      .eq("id", row.id)
      .select("id,campaign_id,creative_id,asset_type,status,file_url,thumbnail_url,provider_name,metadata,created_at")
      .single();

    if (error || !data) {
      throw new ApiError(500, error?.message ?? "Creative asset proof tagging returned no row.", "proof_creative_asset_tag_failed");
    }

    updated.push(data as CreativeAssetRow);
  }

  return updated;
}

function buildStrategyFromCampaign(campaign: CampaignPlanRow) {
  const plan = campaign.plan && typeof campaign.plan === "object" && !Array.isArray(campaign.plan)
    ? campaign.plan as Record<string, any>
    : {};
  const strategy = plan.strategy && typeof plan.strategy === "object" ? plan.strategy as Record<string, unknown> : {};
  const payload = plan.campaign_payload && typeof plan.campaign_payload === "object"
    ? plan.campaign_payload as Record<string, any>
    : {};
  const payloadStrategy = payload.strategy && typeof payload.strategy === "object"
    ? payload.strategy as Record<string, unknown>
    : {};
  const source = { ...payloadStrategy, ...strategy };

  return {
    location: typeof source.location === "string" && source.location.trim() ? source.location.trim() : "Toronto, ON",
    audience: typeof source.audience === "string" && source.audience.trim() ? source.audience.trim() : "home buyers",
    offer: typeof source.offer === "string" && source.offer.trim()
      ? source.offer.trim()
      : "Get a free custom home list matched to your budget, location, and timeline.",
    price_point: typeof source.price_point === "string" && source.price_point.trim() ? source.price_point.trim() : "homes",
    market_type: source.market_type === "seller" ||
      source.market_type === "buyer" ||
      source.market_type === "investor" ||
      source.market_type === "commercial" ||
      source.market_type === "approval" ||
      source.market_type === "refinance" ||
      source.market_type === "other"
      ? source.market_type
      : "buyer",
  } as const;
}

function assertLiveStaticProofCaps() {
  const snapshot = getProviderGenerationSpendGateSnapshot();
  const caps = assertProviderGenerationHardCapsConfigured({
    operation: "image_generation",
    requestedCount: 1,
  });

  if (caps.maxPerRequest !== 1 || caps.dailyCountCap !== 1) {
    throw new ApiError(
      409,
      "Provider static proof requires image daily cap and per-request cap to both equal 1.",
      "provider_static_proof_cap_not_one",
    );
  }

  if (!snapshot.image.liveEnvEnabled) {
    throw new ApiError(
      409,
      "Provider static proof requires image generation live env to be enabled for the proof window.",
      "provider_static_image_live_env_disabled",
    );
  }

  if (snapshot.video.liveEnvEnabled) {
    throw new ApiError(
      409,
      "Provider static proof requires video generation live env to remain disabled.",
      "provider_video_generation_not_allowed_for_static_proof",
    );
  }

  return { snapshot, caps };
}

async function buildBaseProofState(admin: AdminClient, campaignId: string, proofRunId: string) {
  const campaign = await readCampaign(admin, campaignId);
  const prefix = buildProofIdempotencyPrefix({
    proofRunId,
    organizationId: campaign.organization_id,
    userId: campaign.user_id,
    campaignId: campaign.id,
  });
  const providerEvents = await listProofProviderEvents(admin, prefix);
  const creativeAssets = await listProofCreativeAssets(admin, campaign.id, proofRunId);

  return { campaign, prefix, providerEvents, creativeAssets };
}

async function runCapExceededProof(params: {
  campaign: CampaignPlanRow;
  prefix: string;
}) {
  try {
    await consumeSessionCostBudget({
      bucket: "image_generation",
      userId: params.campaign.user_id,
      organizationId: params.campaign.organization_id,
      campaignId: params.campaign.id,
      idempotencyKey: `${params.prefix}:cap-exceeded-proof`,
    });

    throw new ApiError(
      500,
      "Provider cap exceeded proof unexpectedly reserved additional budget.",
      "provider_cap_exceeded_not_blocked",
    );
  } catch (error) {
    if (error instanceof ApiError && (
      error.code === "provider_usage_limit_reached" ||
      error.code === "provider_generation_daily_cost_cap_reached" ||
      error.code === "provider_generation_request_cap_exceeded"
    )) {
      return {
        blocked: true,
        code: error.code,
        message: error.message,
        providerCall: false,
      };
    }

    throw error;
  }
}

async function runGenerateProof(params: {
  admin: AdminClient;
  campaign: CampaignPlanRow;
  proofRunId: string;
  prefix: string;
}) {
  const existingAssets = await listProofCreativeAssets(params.admin, params.campaign.id, params.proofRunId);
  const existingEvents = await listProofProviderEvents(params.admin, params.prefix);
  const consumedEvent = existingEvents.find((event) => event.status === "consumed");

  if (existingAssets.length > 0 || consumedEvent) {
    return {
      status: "already_generated" as const,
      providerCall: false,
      providerEvents: existingEvents.map(summarizeProviderEvent),
      creativeAssets: existingAssets.map(summarizeCreativeAsset),
    };
  }

  assertLiveStaticProofCaps();
  const strategy = buildStrategyFromCampaign(params.campaign);
  const generated = await generateStaticCreativeAds({
    campaign_id: params.campaign.id,
    location: strategy.location,
    audience: strategy.audience,
    offer: strategy.offer,
    price_point: strategy.price_point,
    market_type: strategy.market_type,
    max_static_image_generations: 1,
    force: true,
    selected_static_asset_ids: [],
    provider_usage_context: {
      createForAsset: (asset: StaticCreativeAsset) => {
        const provider = getMediaGenerationProvider();
        const idempotencyKey = `${params.prefix}:${asset.id}:${asset.preferredImageModel}`;

        return {
          reserve: () =>
            consumeSessionCostBudget({
              bucket: "image_generation",
              userId: params.campaign.user_id,
              organizationId: params.campaign.organization_id,
              campaignId: params.campaign.id,
              idempotencyKey,
            }),
          mark: (eventParams) =>
            markSessionCostBudgetEvent({
              ...eventParams,
              metadata: {
                ...(eventParams.metadata ?? {}),
                proof: PROOF_NAME,
                proof_run_id: params.proofRunId,
                proof_mode: "live_static_one_asset",
                idempotency_prefix: params.prefix,
                campaign_id: params.campaign.id,
                organization_id: params.campaign.organization_id,
                provider,
                max_static_image_generations: 1,
                video_generation_attempted: false,
                meta_mutation: false,
                ghl_mutation: false,
                stripe_billing_provider_action: false,
                sms_email_sent: false,
              },
            }),
        };
      },
    },
  });
  const generatedWithImage = generated.find((asset) => asset.imageUrl && asset.imageGenerationProvider);

  if (!generatedWithImage) {
    const proofEvents = await listProofProviderEvents(params.admin, params.prefix);
    throw new ApiError(
      502,
      `Provider proof did not return a generated static image. Events: ${proofEvents.map((event) => event.status).join(",") || "none"}`,
      "provider_static_generation_no_image",
    );
  }

  const persistedRows = await persistStaticCreativeAssets({
    supabase: params.admin,
    userId: params.campaign.user_id,
    campaignId: params.campaign.id,
    staticAds: [generatedWithImage],
  });
  const taggedRows = await markProofCreativeRows({
    admin: params.admin,
    rows: persistedRows as CreativeAssetRow[],
    proofRunId: params.proofRunId,
    proofMode: "live_static_one_asset",
    idempotencyPrefix: params.prefix,
  });
  const proofEvents = await listProofProviderEvents(params.admin, params.prefix);

  return {
    status: "generated" as const,
    providerCall: true,
    generatedStaticAssetId: generatedWithImage.id,
    imageGenerationState: generatedWithImage.imageGenerationState,
    imageGenerationProvider: generatedWithImage.imageGenerationProvider ?? null,
    imageGenerationModel: generatedWithImage.imageGenerationModel ?? null,
    imageQaDecision: generatedWithImage.imageQa?.decision ?? null,
    persistedRowCount: taggedRows.length,
    providerEvents: proofEvents.map(summarizeProviderEvent),
    creativeAssets: taggedRows.map(summarizeCreativeAsset),
  };
}

export async function POST(request: Request) {
  try {
    assertInternalSystemRequest(request);
    assertProofEnabled();

    const body = await parseJsonBody(request, requestSchema);
    const admin = getAdminClient();
    const beforeCounts = await countTableRows(admin);
    const { campaign, prefix, providerEvents, creativeAssets } = await buildBaseProofState(
      admin,
      body.campaignId,
      body.proofRunId,
    );
    const gateSnapshot = getProviderGenerationSpendGateSnapshot();
    const capPreflight = (() => {
      try {
        return {
          ok: true,
          image: assertProviderGenerationHardCapsConfigured({ operation: "image_generation", requestedCount: 1 }),
          videoGenerationAllowed: false,
        };
      } catch (error) {
        return {
          ok: false,
          code: error instanceof ApiError ? error.code : "cap_preflight_failed",
          message: error instanceof Error ? error.message : "Cap preflight failed.",
          videoGenerationAllowed: false,
        };
      }
    })();
    let proofResult: Record<string, unknown>;

    if (body.mode === "dryRun") {
      proofResult = {
        status: "dry_run_planned",
        providerCall: false,
        storageWrite: false,
        idempotencyPrefix: prefix,
        promptPlan: buildStrategyFromCampaign(campaign),
        duplicateAlreadyPlanned: providerEvents.length > 0 || creativeAssets.length > 0,
      };
    } else if (body.mode === "verify") {
      proofResult = {
        status: "verified",
        providerCall: false,
        providerEvents: providerEvents.map(summarizeProviderEvent),
        creativeAssets: creativeAssets.map(summarizeCreativeAsset),
      };
    } else if (body.mode === "capExceeded") {
      if (providerEvents.length === 0) {
        throw new ApiError(409, "Cap exceeded proof requires one prior proof provider event.", "provider_cap_exceeded_missing_baseline");
      }
      proofResult = await runCapExceededProof({ campaign, prefix });
    } else {
      proofResult = await runGenerateProof({
        admin,
        campaign,
        proofRunId: body.proofRunId,
        prefix,
      });
    }

    const afterCounts = await countTableRows(admin);

    return apiSuccess({
      success: true,
      proof: PROOF_NAME,
      mode: body.mode,
      proofRunId: body.proofRunId,
      campaign: {
        id: campaign.id,
        userId: campaign.user_id,
        organizationId: campaign.organization_id,
        publicSlug: campaign.public_slug,
        publishState: campaign.publish_state,
        launchStatus: campaign.launch_status,
      },
      gateSnapshot,
      capPreflight,
      result: proofResult,
      safety: {
        internalBearerRequired: true,
        envGate: PROOF_ENV_GATE,
        liveProviderPathOnlyWhenModeGenerate: true,
        maxStaticAssetProviderCalls: 1,
        maxStaticImageGenerations: 1,
        videoGenerationAttempted: false,
        batchGeneration: false,
        createdRealLead: false,
        createdSystemJob: false,
        smsEmailSent: false,
        metaMutation: false,
        ghlMutation: false,
        stripeBillingProviderAction: false,
        tokensExposed: false,
        credentialRefsExposed: false,
      },
      rowCountDelta: diffCounts(beforeCounts, afterCounts),
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return handleApiError(error, "provider_static_generation_proof");
  }
}
