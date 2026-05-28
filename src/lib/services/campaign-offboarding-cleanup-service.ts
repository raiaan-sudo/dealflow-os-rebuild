import "server-only";

import { ApiError } from "@/lib/api/route";
import {
  isCreativeStorageOffboardingDeletionEnabled,
  isMetaOffboardingDeletionEnabled,
} from "@/lib/env";
import { fetchMetaJson } from "@/lib/integrations/meta/request";
import { getMetaAccessToken } from "@/lib/integrations/meta/execution";
import type { MetaConnectionRecord } from "@/lib/integrations/meta/types";
import { logOperationalEvent, logWarn } from "@/lib/logging";
import {
  buildCampaignPlanCriticalFieldPatch,
  mergeCampaignPlanDocument,
} from "@/lib/services/campaign-plan-document";
import { getCampaignEntitlementsForCampaign } from "@/lib/services/campaign-entitlements";
import {
  createSystemJob,
  type SystemJobRecord,
} from "@/lib/services/system-job-service";
import {
  isAppOwnedCreativeAssetUrl,
  STATIC_CREATIVE_STORAGE_BUCKET,
} from "@/lib/services/static-creative-storage-normalization";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/types";

export type CampaignOffboardingCleanupReason =
  | "subscription_canceled"
  | "subscription_unpaid"
  | "subscription_expired";

export type CampaignOffboardingCleanupPayload = {
  organizationId: string;
  campaignId: string;
  stripeSubscriptionId: string | null;
  billingEndedAt: string;
  reason: CampaignOffboardingCleanupReason;
  mode: "dry_run" | "apply";
};

type CampaignPlanRow = Pick<
  Database["public"]["Tables"]["campaign_plans"]["Row"],
  "id" | "user_id" | "organization_id" | "plan" | "launch_status" | "publish_state"
>;

type CreativeAssetRow = Pick<
  Database["public"]["Tables"]["creative_assets"]["Row"],
  "id" | "creative_id" | "campaign_id" | "user_id" | "file_url" | "thumbnail_url" | "metadata" | "asset_type"
>;

export type OffboardingMetaObjectType = "campaign" | "adset" | "ad" | "creative";

export type OffboardingMetaObject = {
  type: OffboardingMetaObjectType;
  id: string;
  source: string;
};

export type OffboardingInventory = {
  campaignId: string;
  organizationId: string;
  metaObjects: OffboardingMetaObject[];
  appOwnedStoragePaths: string[];
  creativeAssetCount: number;
  blockedReasons: string[];
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map(asString).filter((item): item is string => Boolean(item))))
    : [];
}

function normalizeOffboardingReason(reason?: string | null): CampaignOffboardingCleanupReason {
  if (reason === "subscription_unpaid") {
    return "subscription_unpaid";
  }

  if (reason === "subscription_period_ended" || reason === "subscription_expired") {
    return "subscription_expired";
  }

  return "subscription_canceled";
}

function addMetaObject(
  objects: OffboardingMetaObject[],
  seen: Set<string>,
  type: OffboardingMetaObjectType,
  id: string | null,
  source: string,
) {
  if (!id) {
    return;
  }

  const key = `${type}:${id}`;
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  objects.push({ type, id, source });
}

export function collectDealFlowCreatedMetaObjects(plan: unknown): OffboardingMetaObject[] {
  const document = asRecord(plan);
  const runtime = asRecord(document.runtime);
  const launchRuntime = asRecord(document.launch_runtime);
  const objects: OffboardingMetaObject[] = [];
  const seen = new Set<string>();

  addMetaObject(objects, seen, "campaign", asString(runtime.campaignId), "plan.runtime.campaignId");
  addMetaObject(objects, seen, "campaign", asString(launchRuntime.campaign_id), "plan.launch_runtime.campaign_id");
  addMetaObject(objects, seen, "adset", asString(runtime.adSetId), "plan.runtime.adSetId");
  addMetaObject(objects, seen, "adset", asString(launchRuntime.adset_id), "plan.launch_runtime.adset_id");
  asStringArray(runtime.metaAdSetIds).forEach((id) =>
    addMetaObject(objects, seen, "adset", id, "plan.runtime.metaAdSetIds"),
  );
  addMetaObject(objects, seen, "ad", asString(runtime.adId), "plan.runtime.adId");
  addMetaObject(objects, seen, "ad", asString(launchRuntime.ad_id), "plan.launch_runtime.ad_id");
  asStringArray(runtime.metaAdIds).forEach((id) =>
    addMetaObject(objects, seen, "ad", id, "plan.runtime.metaAdIds"),
  );
  addMetaObject(objects, seen, "creative", asString(launchRuntime.creative_id), "plan.launch_runtime.creative_id");
  asStringArray(runtime.metaCreativeIds).forEach((id) =>
    addMetaObject(objects, seen, "creative", id, "plan.runtime.metaCreativeIds"),
  );

  return objects;
}

export function storagePathFromAppOwnedCreativeUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  if (!isAppOwnedCreativeAssetUrl(url)) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const publicPrefix = `/storage/v1/object/public/${encodeURIComponent(STATIC_CREATIVE_STORAGE_BUCKET)}/`;
    const signedPrefix = `/storage/v1/object/sign/${encodeURIComponent(STATIC_CREATIVE_STORAGE_BUCKET)}/`;
    const prefix = parsed.pathname.startsWith(publicPrefix)
      ? publicPrefix
      : parsed.pathname.startsWith(signedPrefix)
        ? signedPrefix
        : null;

    if (!prefix) {
      return null;
    }

    const rawPath = parsed.pathname.slice(prefix.length);
    return rawPath ? decodeURIComponent(rawPath) : null;
  } catch {
    return null;
  }
}

function collectStoragePathsFromAsset(asset: CreativeAssetRow) {
  const metadata = asRecord(asset.metadata);
  const paths = [
    asString(metadata.storagePath),
    asString(metadata.thumbnailStoragePath),
    storagePathFromAppOwnedCreativeUrl(asset.file_url),
    storagePathFromAppOwnedCreativeUrl(asset.thumbnail_url),
  ].filter((path): path is string => Boolean(path));

  return Array.from(new Set(paths));
}

function buildBlockedReasons(params: {
  campaign: CampaignPlanRow;
  metaObjects: OffboardingMetaObject[];
}) {
  const reasons: string[] = [];

  if (!params.campaign.organization_id) {
    reasons.push("organization_missing");
  }

  if (!params.campaign.user_id) {
    reasons.push("user_missing");
  }

  if (params.metaObjects.length > 0 && !params.metaObjects.some((object) => object.type === "campaign")) {
    reasons.push("meta_campaign_id_missing");
  }

  return reasons;
}

async function loadCampaign(params: {
  campaignId: string;
  organizationId: string;
}) {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await supabase
    .from("campaign_plans")
    .select("id,user_id,organization_id,plan,launch_status,publish_state")
    .eq("id", params.campaignId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "campaign_offboarding_campaign_fetch_failed");
  }

  const campaign = (data as CampaignPlanRow | null) ?? null;

  if (!campaign?.organization_id || campaign.organization_id !== params.organizationId) {
    throw new ApiError(403, "Offboarding job does not match the campaign workspace.", "campaign_offboarding_forbidden");
  }

  return campaign;
}

async function loadCreativeAssets(campaignId: string) {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await supabase
    .from("creative_assets")
    .select("id,creative_id,campaign_id,user_id,file_url,thumbnail_url,metadata,asset_type")
    .eq("campaign_id", campaignId);

  if (error) {
    throw new ApiError(500, error.message, "campaign_offboarding_assets_fetch_failed");
  }

  return (Array.isArray(data) ? data : []) as CreativeAssetRow[];
}

export async function buildCampaignOffboardingInventory(params: {
  organizationId: string;
  campaignId: string;
}) {
  const campaign = await loadCampaign(params);
  const assets = await loadCreativeAssets(params.campaignId);
  const metaObjects = collectDealFlowCreatedMetaObjects(campaign.plan);
  const appOwnedStoragePaths = Array.from(
    new Set(assets.flatMap((asset) => collectStoragePathsFromAsset(asset))),
  );

  return {
    campaignId: params.campaignId,
    organizationId: params.organizationId,
    metaObjects,
    appOwnedStoragePaths,
    creativeAssetCount: assets.length,
    blockedReasons: buildBlockedReasons({ campaign, metaObjects }),
  } satisfies OffboardingInventory;
}

async function loadMetaConnection(organizationId: string) {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await supabase
    .from("marketing_accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("platform", "meta_ads")
    .eq("status", "connected")
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "campaign_offboarding_meta_connection_fetch_failed");
  }

  return (data as MetaConnectionRecord | null) ?? null;
}

async function pauseMetaCampaign(params: {
  accessToken: string;
  objectId: string;
}) {
  const url = new URL(`https://graph.facebook.com/v19.0/${params.objectId}`);
  url.searchParams.set("access_token", params.accessToken);

  const { response, data } = await fetchMetaJson<Record<string, unknown> | null>(url.toString(), {
    purpose: "offboarding_delete",
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ status: "PAUSED" }).toString(),
    retries: 1,
  });

  if (!response.ok) {
    if (response.status === 404) {
      return;
    }

    throw new ApiError(
      response.status,
      asRecord(data?.error).message ? String(asRecord(data?.error).message) : "Meta campaign pause failed.",
      "campaign_offboarding_meta_pause_failed",
    );
  }
}

async function deleteMetaObject(params: {
  accessToken: string;
  object: OffboardingMetaObject;
}) {
  const url = new URL(`https://graph.facebook.com/v19.0/${params.object.id}`);
  url.searchParams.set("access_token", params.accessToken);

  const { response, data } = await fetchMetaJson<Record<string, unknown> | null>(url.toString(), {
    purpose: "offboarding_delete",
    method: "DELETE",
    retries: 1,
  });

  if (!response.ok) {
    if (response.status === 404) {
      return {
        type: params.object.type,
        idPrefix: params.object.id.slice(0, 8),
        status: "already_deleted",
      };
    }

    const error = asRecord(data?.error);
    throw new ApiError(
      response.status,
      asString(error.message) ?? "Meta object deletion failed.",
      response.status === 403 || response.status === 404
        ? "campaign_offboarding_meta_blocked_review"
        : "campaign_offboarding_meta_delete_failed",
    );
  }

  return {
    type: params.object.type,
    idPrefix: params.object.id.slice(0, 8),
    status: "deleted",
  };
}

function orderedMetaDeletionObjects(objects: OffboardingMetaObject[]) {
  const order: Record<OffboardingMetaObjectType, number> = {
    ad: 0,
    creative: 1,
    adset: 2,
    campaign: 3,
  };

  return [...objects].sort((left, right) => order[left.type] - order[right.type]);
}

async function applyMetaDeletion(params: {
  organizationId: string;
  metaObjects: OffboardingMetaObject[];
}) {
  if (params.metaObjects.length === 0) {
    return {
      enabled: isMetaOffboardingDeletionEnabled(),
      deletedObjects: [],
      skippedObjects: [],
    };
  }

  if (!isMetaOffboardingDeletionEnabled()) {
    throw new ApiError(
      409,
      "Meta offboarding deletion is disabled.",
      "campaign_offboarding_meta_deletion_disabled",
    );
  }

  const connection = await loadMetaConnection(params.organizationId);

  if (!connection) {
    throw new ApiError(
      409,
      "Meta connection is unavailable for offboarding cleanup.",
      "campaign_offboarding_meta_connection_missing",
    );
  }

  const accessToken = getMetaAccessToken(connection);
  const campaignObjects = params.metaObjects.filter((object) => object.type === "campaign");

  for (const campaign of campaignObjects) {
    await pauseMetaCampaign({ accessToken, objectId: campaign.id });
  }

  const deletedObjects = [];
  const skippedObjects = [];
  for (const object of orderedMetaDeletionObjects(params.metaObjects)) {
    if (object.type === "creative") {
      skippedObjects.push({
        type: object.type,
        idPrefix: object.id.slice(0, 8),
        status: "skipped_unsupported",
      });
      continue;
    }
    deletedObjects.push(await deleteMetaObject({ accessToken, object }));
  }

  return {
    enabled: true,
    deletedObjects,
    skippedObjects,
  };
}

async function applyStorageDeletion(params: {
  campaignId: string;
  paths: string[];
  jobId: string;
}) {
  if (params.paths.length === 0) {
    return {
      enabled: isCreativeStorageOffboardingDeletionEnabled(),
      deletedStoragePaths: [],
      skippedStoragePaths: [],
    };
  }

  if (!isCreativeStorageOffboardingDeletionEnabled()) {
    throw new ApiError(
      409,
      "Creative storage offboarding deletion is disabled.",
      "campaign_offboarding_storage_deletion_disabled",
    );
  }

  const supabase = createAdminClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const now = new Date().toISOString();
  const { data: assetRows, error: assetFetchError } = await supabase
    .from("creative_assets")
    .select("id,metadata")
    .eq("campaign_id", params.campaignId);

  if (assetFetchError) {
    throw new ApiError(500, assetFetchError.message, "campaign_offboarding_assets_fetch_failed");
  }

  const { error } = await supabase.storage
    .from(STATIC_CREATIVE_STORAGE_BUCKET)
    .remove(params.paths);

  if (error) {
    throw new ApiError(500, error.message, "campaign_offboarding_storage_delete_failed");
  }

  for (const asset of (Array.isArray(assetRows) ? assetRows : []) as Array<{ id: string; metadata: Json | null }>) {
    const currentMetadata = asRecord(asset.metadata);
    const { error: updateError } = await supabase
      .from("creative_assets")
      .update({
        metadata: {
          ...currentMetadata,
          offboardingStatus: "deleted",
          storageDeletedAt: now,
          deletedStoragePaths: params.paths,
          offboardingJobId: params.jobId,
        } as Json,
      } as never)
      .eq("id", asset.id);

    if (updateError) {
      throw new ApiError(500, updateError.message, "campaign_offboarding_assets_update_failed");
    }
  }

  return {
    enabled: true,
    deletedStoragePaths: params.paths,
    skippedStoragePaths: [],
  };
}

async function markCampaignOffboardingState(params: {
  campaign: CampaignPlanRow;
  status: "scheduled" | "deleting" | "deleted" | "blocked_review" | "failed_retryable";
  payload: CampaignOffboardingCleanupPayload;
  jobId: string;
  inventory: OffboardingInventory;
  metaDeletionResult?: Json | null;
  deletedStoragePaths?: string[];
}) {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const now = new Date().toISOString();
  const currentPlan = asRecord(params.campaign.plan);
  const currentRuntime = asRecord(currentPlan.runtime);
  const currentPayload = asRecord(currentPlan.campaign_payload);
  const selectedAudit = {
    selected_ad_id: currentPlan.selected_ad_id ?? currentPayload.selected_ad_id ?? null,
    selected_ad_ids: asStringArray(currentPlan.selected_ad_ids).length > 0
      ? asStringArray(currentPlan.selected_ad_ids)
      : asStringArray(currentPayload.selected_ad_ids),
    selected_ugc_video_id: currentPlan.selected_ugc_video_id ?? currentPayload.selected_ugc_video_id ?? null,
    selected_ugc_video_ids: asStringArray(currentPlan.selected_ugc_video_ids).length > 0
      ? asStringArray(currentPlan.selected_ugc_video_ids)
      : asStringArray(currentPayload.selected_ugc_video_ids),
  };
  const nextPlan = mergeCampaignPlanDocument(currentPlan, {
    selected_ad_id: null,
    selected_ad_ids: [],
    selected_ugc_video_id: null,
    selected_ugc_video_ids: [],
    campaign_payload: {
      ...currentPayload,
      selected_ad_id: null,
      selected_ad_ids: [],
      selected_ugc_video_id: null,
      selected_ugc_video_ids: [],
    },
    launch_status: "offboarded",
    offboarding: {
      status: params.status,
      reason: params.payload.reason,
      billingEndedAt: params.payload.billingEndedAt,
      stripeSubscriptionId: params.payload.stripeSubscriptionId,
      offboardingJobId: params.jobId,
      offboardedAt: params.status === "deleted" ? now : null,
      blockedReasons: params.inventory.blockedReasons,
      selectedLaunchMediaAudit: selectedAudit,
      metaDeletionResult: params.metaDeletionResult ?? null,
      deletedStoragePaths: params.deletedStoragePaths ?? [],
      updatedAt: now,
    } as never,
    runtime: {
      ...currentRuntime,
      status: "offboarded",
      safetyState: "offboarded",
      metaPushStatus: "offboarded",
      metaLastMessage:
        params.status === "deleted"
          ? "Billing ended. DealFlow-managed campaign assets have been removed."
          : "Billing ended. DealFlow-managed campaign assets are paused for operator review.",
      lastAction:
        params.status === "deleted"
          ? "Subscription ended; campaign offboarding cleanup completed."
          : "Subscription ended; campaign offboarding cleanup needs operator review.",
      statusUpdatedAt: now,
      offboardingStatus: params.status,
      offboardingReason: params.payload.reason,
      offboardingJobId: params.jobId,
      offboardedAt: params.status === "deleted" ? now : null,
    },
    launch_runtime: {
      ...asRecord(currentPlan.launch_runtime),
      status: "offboarded",
      step_status: "offboarded",
      updated_at: now,
    },
  });

  const { error } = await supabase
    .from("campaign_plans")
    .update({
      ...buildCampaignPlanCriticalFieldPatch(nextPlan),
      launch_status: "offboarded",
    } as never)
    .eq("id", params.campaign.id);

  if (error) {
    throw new ApiError(500, error.message, "campaign_offboarding_persist_failed");
  }
}

export async function queueCampaignOffboardingCleanupJobsForOrganization(params: {
  organizationId: string;
  reason: string;
  source: string;
  stripeSubscriptionId?: string | null;
  billingEndedAt?: string | null;
}) {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await supabase
    .from("campaign_plans")
    .select("id,user_id,organization_id,plan,launch_status")
    .eq("organization_id", params.organizationId);

  if (error) {
    throw new ApiError(500, error.message, "campaign_offboarding_campaign_fetch_failed");
  }

  const billingEndedAt = params.billingEndedAt ?? new Date().toISOString();
  const reason = normalizeOffboardingReason(params.reason);
  const campaigns = (Array.isArray(data) ? data : []) as Array<{
    id: string;
    user_id: string | null;
    organization_id: string | null;
    plan?: unknown;
    launch_status?: string | null;
  }>;

  const jobs = await Promise.all(
    campaigns
      .filter((campaign) => {
        const plan = asRecord(campaign.plan);
        const runtime = asRecord(plan.runtime);
        const offboardingStatus = asString(runtime.offboardingStatus) ?? asString(asRecord(plan.offboarding).status);
        return (
          campaign.user_id &&
          campaign.organization_id &&
          campaign.launch_status !== "offboarded" &&
          offboardingStatus !== "deleted"
        );
      })
      .map((campaign) =>
        createSystemJob({
          supabase,
          organizationId: campaign.organization_id as string,
          userId: campaign.user_id as string,
          campaignId: campaign.id,
          kind: "campaign_offboarding_cleanup",
          idempotencyKey: [
            "campaign_offboarding_cleanup",
            campaign.organization_id,
            campaign.id,
            params.stripeSubscriptionId ?? "no_subscription",
            billingEndedAt,
          ].join(":"),
          maxAttempts: 3,
          payload: {
            organizationId: params.organizationId,
            campaignId: campaign.id,
            stripeSubscriptionId: params.stripeSubscriptionId ?? null,
            billingEndedAt,
            reason,
            mode: "apply",
          },
        }),
      ),
  );

  logOperationalEvent("campaign_offboarding.jobs_queued", {
    organizationId: params.organizationId,
    reason,
    source: params.source,
    jobCount: jobs.length,
  });

  return jobs;
}

export async function runCampaignOffboardingCleanupJob(params: {
  job: SystemJobRecord<"campaign_offboarding_cleanup">;
}) {
  const payload = params.job.payload as CampaignOffboardingCleanupPayload;
  const campaignId = params.job.campaign_id ?? payload.campaignId;

  if (!campaignId || campaignId !== payload.campaignId) {
    throw new ApiError(400, "Campaign offboarding job is missing campaign id.", "campaign_offboarding_campaign_missing");
  }

  const campaign = await loadCampaign({
    campaignId,
    organizationId: payload.organizationId,
  });
  const entitlements = await getCampaignEntitlementsForCampaign(campaignId);

  if (!entitlements.requiresSuspension) {
    await markCampaignOffboardingState({
      campaign,
      status: "scheduled",
      payload,
      jobId: params.job.id,
      inventory: {
        campaignId,
        organizationId: payload.organizationId,
        metaObjects: [],
        appOwnedStoragePaths: [],
        creativeAssetCount: 0,
        blockedReasons: ["billing_reactivated"],
      },
    });

    return {
      skipped: true,
      status: "skipped_reactivated",
      campaignId,
      organizationId: payload.organizationId,
      billingState: entitlements.billingState,
    } satisfies Json;
  }

  const inventory = await buildCampaignOffboardingInventory({
    organizationId: payload.organizationId,
    campaignId,
  });
  const dryRun = payload.mode === "dry_run";

  if (dryRun) {
    return {
      dryRun: true,
      inventory,
      metaDeletionEnabled: isMetaOffboardingDeletionEnabled(),
      storageDeletionEnabled: isCreativeStorageOffboardingDeletionEnabled(),
    } satisfies Json;
  }

  if (inventory.blockedReasons.length > 0) {
    await markCampaignOffboardingState({
      campaign,
      status: "blocked_review",
      payload,
      jobId: params.job.id,
      inventory,
    });

    return {
      status: "blocked_review",
      campaignId,
      organizationId: payload.organizationId,
      blockedReasons: inventory.blockedReasons,
      inventory,
    } satisfies Json;
  }

  const disabledReasons = [
    ...(inventory.metaObjects.length > 0 && !isMetaOffboardingDeletionEnabled()
      ? ["meta_deletion_disabled"]
      : []),
    ...(inventory.appOwnedStoragePaths.length > 0 && !isCreativeStorageOffboardingDeletionEnabled()
      ? ["storage_deletion_disabled"]
      : []),
  ];

  if (disabledReasons.length > 0) {
    const blockedInventory = {
      ...inventory,
      blockedReasons: disabledReasons,
    };
    await markCampaignOffboardingState({
      campaign,
      status: "blocked_review",
      payload,
      jobId: params.job.id,
      inventory: blockedInventory,
    });

    return {
      status: "blocked_review",
      campaignId,
      organizationId: payload.organizationId,
      blockedReasons: disabledReasons,
      inventory: blockedInventory,
    } satisfies Json;
  }

  try {
    await markCampaignOffboardingState({
      campaign,
      status: "deleting",
      payload,
      jobId: params.job.id,
      inventory,
    });

    const metaDeletionResult = await applyMetaDeletion({
      organizationId: payload.organizationId,
      metaObjects: inventory.metaObjects,
    });
    const storageDeletionResult = await applyStorageDeletion({
      campaignId,
      paths: inventory.appOwnedStoragePaths,
      jobId: params.job.id,
    });

    await markCampaignOffboardingState({
      campaign,
      status: "deleted",
      payload,
      jobId: params.job.id,
      inventory,
      metaDeletionResult: metaDeletionResult as unknown as Json,
      deletedStoragePaths: storageDeletionResult.deletedStoragePaths,
    });

    return {
      status: "deleted",
      campaignId,
      organizationId: payload.organizationId,
      metaDeletionResult,
      storageDeletionResult,
      inventory,
    } satisfies Json;
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "campaign_offboarding_cleanup_failed";
    const status = /disabled|missing|blocked|forbidden|permission|provenance/i.test(code)
      ? "blocked_review"
      : "failed_retryable";

    await markCampaignOffboardingState({
      campaign,
      status,
      payload,
      jobId: params.job.id,
      inventory,
    }).catch((persistError) => {
      logWarn("campaign_offboarding.state_persist_failed", {
        campaignId,
        message: persistError instanceof Error ? persistError.message : "Unknown offboarding state persistence failure",
      });
    });

    throw error;
  }
}
