import { ApiError } from "@/lib/api/route";
import { createClient } from "@/lib/supabase/server";
import {
  fetchAdInsights,
  fetchAdSetStatuses,
  fetchAdStatuses,
  fetchCampaignStatus,
  fetchDeliveryMetrics,
  getMetaSyncMode,
  getMetaSyncStatus,
} from "@/lib/integrations/meta/status-sync";
import type {
  MetaCampaignSyncSnapshot,
  MetaConnectionRecord,
  MetaDeliveryMetrics,
  MetaEntityStatus,
  MetaSyncError,
} from "@/lib/integrations/meta/types";
import { getMetaAccessToken } from "@/lib/integrations/meta/execution";
import { getAppContext } from "@/lib/services/app-context";
import { refreshCampaignActionSuggestions } from "@/lib/services/campaign-action-service";
import { refreshCampaignDraftActions } from "@/lib/services/campaign-draft-action-service";
import { recordCreativePerformanceSnapshot } from "@/lib/services/creative-performance-service";
import { getLatestCampaignLaunchRecord } from "@/lib/services/campaign-launch-audit-service";
import { getLatestCampaignPlan } from "@/lib/services/campaign-plan-service";
import { logError, logWarn } from "@/lib/logging";
import type { Json } from "@/lib/supabase/types";

function mapEntityStatuses(value: unknown): MetaEntityStatus[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    const row = item as Record<string, unknown>;

    return {
      id: String(row.id ?? `entity-${index}`),
      name: String(row.name ?? `Entity ${index + 1}`),
      status: String(row.status ?? "UNKNOWN"),
    };
  });
}

function mapDeliveryMetrics(value: unknown): MetaDeliveryMetrics {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    ctr:
      row.ctr !== undefined
        ? Number(row.ctr)
        : Number(row.clicks ?? 0) / Math.max(Number(row.impressions ?? 0), 1),
    leads: Number(row.leads ?? 0),
  };
}

function mapSyncErrors(value: unknown): MetaSyncError[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const row = item as Record<string, unknown>;
    const stage = row.stage;

    return {
      stage:
        stage === "campaign" ||
        stage === "ad_set" ||
        stage === "ad" ||
        stage === "insights" ||
        stage === "connection"
          ? stage
          : "campaign",
      message: String(row.message ?? "Sync issue"),
      target: String(row.target ?? ""),
    };
  });
}

function mapSyncSnapshot(row: Record<string, unknown> | null): MetaCampaignSyncSnapshot | null {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    campaignName: String(row.campaign_name ?? ""),
    accountName: typeof row.account_name === "string" ? row.account_name : null,
    launchMode: String(row.launch_mode ?? ""),
    syncResult:
      row.sync_result === "success" || row.sync_result === "partial_success"
        ? row.sync_result
        : "failed",
    metaCampaignId: typeof row.meta_campaign_id === "string" ? row.meta_campaign_id : null,
    metaAdSetIds: Array.isArray(row.meta_ad_set_ids) ? row.meta_ad_set_ids.map(String) : [],
    metaAdIds: Array.isArray(row.meta_ad_ids) ? row.meta_ad_ids.map(String) : [],
    campaignStatus: typeof row.campaign_status === "string" ? row.campaign_status : null,
    adSetStatuses: mapEntityStatuses(row.ad_set_statuses),
    adStatuses: mapEntityStatuses(row.ad_statuses),
    deliveryMetrics: mapDeliveryMetrics(row.delivery_metrics),
    syncMetadata:
      row.sync_metadata && typeof row.sync_metadata === "object"
        ? (row.sync_metadata as Record<string, unknown>)
        : {},
    syncErrors: mapSyncErrors(row.sync_errors),
    syncedAt: String(row.synced_at ?? row.created_at ?? new Date().toISOString()),
  };
}

async function getMetaSyncContext() {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for this route.", "unauthorized");
  }

  return { context, supabase };
}

async function getConnectedMetaAccount(organizationId: string) {
  const { supabase } = await getMetaSyncContext();
  const { data } = await supabase
    .from("marketing_accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("platform", "meta_ads")
    .eq("status", "connected")
    .maybeSingle();

  return (data as MetaConnectionRecord | null) ?? null;
}

function resolveLaunchIds(params: {
  runtimeCampaignId: string | null;
  runtimeAdSetIds: string[];
  runtimeAdIds: string[];
  launchCampaignId: string | null;
  launchAdSetIds: string[];
  launchAdIds: string[];
}) {
  return {
    campaignId: params.runtimeCampaignId ?? params.launchCampaignId,
    adSetIds:
      params.runtimeAdSetIds.length > 0 ? params.runtimeAdSetIds : params.launchAdSetIds,
    adIds: params.runtimeAdIds.length > 0 ? params.runtimeAdIds : params.launchAdIds,
  };
}

export async function getLatestMetaCampaignSyncSnapshot() {
  const { context, supabase } = await getMetaSyncContext();
  const { data } = await supabase
    .from("campaign_sync_snapshots")
    .select("*")
    .eq("organization_id", context.organization.id)
    .eq("user_id", context.user.id)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return mapSyncSnapshot((data as Record<string, unknown> | null) ?? null);
}

export async function getMetaCampaignSyncSnapshotForCampaign(params: {
  campaignName: string;
  metaCampaignId?: string | null;
}) {
  const { context, supabase } = await getMetaSyncContext();

  const buildQuery = () =>
    supabase
      .from("campaign_sync_snapshots")
      .select("*")
      .eq("organization_id", context.organization.id)
      .eq("user_id", context.user.id)
      .order("synced_at", { ascending: false })
      .limit(1);

  if (params.metaCampaignId) {
    const { data } = await buildQuery().eq("meta_campaign_id", params.metaCampaignId).maybeSingle();
    return mapSyncSnapshot((data as Record<string, unknown> | null) ?? null);
  }

  const { data } = await buildQuery().eq("campaign_name", params.campaignName).maybeSingle();
  return mapSyncSnapshot((data as Record<string, unknown> | null) ?? null);
}

export async function syncMetaCampaignStatus() {
  const [{ context, supabase }, plan, launchRecord] = await Promise.all([
    getMetaSyncContext(),
    getLatestCampaignPlan(),
    getLatestCampaignLaunchRecord(),
  ]);

  if (!plan) {
    throw new ApiError(400, "Generate and launch a campaign before syncing status.", "campaign_plan_missing");
  }

  const connection = await getConnectedMetaAccount(context.organization.id);

  if (!connection) {
    throw new ApiError(400, "Connect a Meta ad account before syncing status.", "meta_not_connected");
  }

  const ids = resolveLaunchIds({
    runtimeCampaignId: plan.runtime.campaignId,
    runtimeAdSetIds: plan.runtime.metaAdSetIds ?? [],
    runtimeAdIds: plan.runtime.metaAdIds ?? [],
    launchCampaignId: launchRecord?.metaCampaignId ?? null,
    launchAdSetIds: launchRecord?.metaAdSetIds ?? [],
    launchAdIds: launchRecord?.metaAdIds ?? [],
  });

  if (!ids.campaignId) {
    throw new ApiError(400, "Publish the campaign first so Meta IDs exist for syncing.", "meta_sync_ids_missing");
  }

  const mode = getMetaSyncMode(connection, ids.campaignId);
  let accessToken: string | null = null;

  if (mode === "live") {
    accessToken = getMetaAccessToken(connection);
  }

  const errors: MetaSyncError[] = [];
  let campaignStatus: MetaEntityStatus | null = null;
  let adSetStatuses: MetaEntityStatus[] = [];
  let adStatuses: MetaEntityStatus[] = [];
  let deliveryMetrics: MetaDeliveryMetrics = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    leads: 0,
  };
  let adInsights: ReturnType<typeof fetchAdInsights> extends Promise<infer T> ? T : never = [];

  try {
    campaignStatus = await fetchCampaignStatus({
      campaignId: ids.campaignId,
      accessToken,
      mode,
      runtimeStatus: plan.runtime.status,
      campaignName: launchRecord?.campaignName ?? plan.businessName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campaign status sync failed.";
    logError("Meta campaign status sync failed", {
      campaignId: ids.campaignId,
      message,
    });
    errors.push({
      stage: "campaign",
      message,
      target: ids.campaignId,
    });
  }

  if (ids.adSetIds.length === 0) {
    errors.push({
      stage: "ad_set",
      message: "No Meta ad set IDs were stored for this campaign yet.",
      target: ids.campaignId,
    });
  } else {
    try {
      adSetStatuses = await fetchAdSetStatuses({
        adSetIds: ids.adSetIds,
        accessToken,
        mode,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ad set statuses could not be loaded.";
      logError("Meta ad set status sync failed", {
        campaignId: ids.campaignId,
        message,
      });
      errors.push({
        stage: "ad_set",
        message,
        target: ids.campaignId,
      });
    }
  }

  if (ids.adIds.length === 0) {
    errors.push({
      stage: "ad",
      message: "No Meta ad IDs were stored for this campaign yet.",
      target: ids.campaignId,
    });
  } else {
    try {
      adStatuses = await fetchAdStatuses({
        adIds: ids.adIds,
        accessToken,
        mode,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ad statuses could not be loaded.";
      logError("Meta ad status sync failed", {
        campaignId: ids.campaignId,
        message,
      });
      errors.push({
        stage: "ad",
        message,
        target: ids.campaignId,
      });
    }
  }

  try {
    deliveryMetrics = await fetchDeliveryMetrics({
      campaignId: ids.campaignId,
      accessToken,
      mode,
      campaignStatus: campaignStatus?.status ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Delivery metrics could not be loaded.";
    logError("Meta delivery metrics sync failed", {
      campaignId: ids.campaignId,
      message,
    });
    errors.push({
      stage: "insights",
      message,
      target: ids.campaignId,
    });
  }

  if (ids.adIds.length > 0) {
    try {
      adInsights = await fetchAdInsights({
        campaignId: ids.campaignId,
        accessToken,
        mode,
        adIds: ids.adIds,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Ad insights could not be loaded.";
      logWarn("Meta ad insights sync degraded", {
        campaignId: ids.campaignId,
        message,
      });
      errors.push({
        stage: "ad",
        message,
        target: ids.campaignId,
      });
    }
  }

  const syncResult = getMetaSyncStatus(campaignStatus, errors);
  const syncedAt = new Date().toISOString();

  const insertPayload = {
    organization_id: context.organization.id,
    user_id: context.user.id,
    campaign_name: launchRecord?.campaignName ?? plan.businessName,
    account_name: connection.account_name,
    launch_mode: plan.runtime.launchMode ?? "test",
    sync_result: syncResult,
    meta_campaign_id: ids.campaignId,
    meta_ad_set_ids: ids.adSetIds as unknown as Json,
    meta_ad_ids: ids.adIds as unknown as Json,
    campaign_status: campaignStatus?.status ?? null,
    ad_set_statuses: adSetStatuses as unknown as Json,
    ad_statuses: adStatuses as unknown as Json,
    delivery_metrics: deliveryMetrics as unknown as Json,
    sync_metadata: {
      mode,
      ad_insights: adInsights,
      synced_from_runtime: {
        campaignId: plan.runtime.campaignId,
        metaPushStatus: plan.runtime.metaPushStatus,
      },
    } as Json,
    sync_errors: errors as unknown as Json,
    synced_at: syncedAt,
  };

  const { error: insertError } = await supabase
    .from("campaign_sync_snapshots")
    .insert(insertPayload as never);

  if (insertError) {
    throw new ApiError(500, insertError.message, "campaign_sync_snapshot_insert_failed");
  }

  const { error: accountUpdateError } = await supabase
    .from("marketing_accounts")
    .update({ last_sync_at: syncedAt } as never)
    .eq("id", connection.id);

  if (accountUpdateError) {
    throw new ApiError(500, accountUpdateError.message, "meta_account_sync_timestamp_failed");
  }

  const snapshot = await getLatestMetaCampaignSyncSnapshot();

  if (!snapshot) {
    throw new ApiError(500, "Synced snapshot could not be loaded.", "campaign_sync_snapshot_missing");
  }

  const { error: performanceTrackingError } = await supabase.from("performance_tracking").insert({
    organization_id: context.organization.id,
    user_id: context.user.id,
    source_snapshot_id: snapshot.id,
    campaign_id: snapshot.metaCampaignId ?? snapshot.campaignName,
    spend: deliveryMetrics.spend,
    impressions: deliveryMetrics.impressions,
    clicks: deliveryMetrics.clicks,
    ctr: Number(deliveryMetrics.ctr.toFixed(4)),
    leads: deliveryMetrics.leads,
    cpl:
      deliveryMetrics.leads > 0
        ? Number((deliveryMetrics.spend / deliveryMetrics.leads).toFixed(2))
        : null,
    synced_at: syncedAt,
  } as never);

  if (performanceTrackingError) {
    logWarn("Performance tracking snapshot insert failed", {
      campaignId: snapshot.metaCampaignId,
      message: performanceTrackingError.message,
    });
  }

  await recordCreativePerformanceSnapshot({
    plan,
    snapshot,
  }).catch(() => null);

  const targetingPattern = `${plan.audience} in ${plan.market} using ${plan.keyOffer}`;
  const targetingPerformanceTag =
    deliveryMetrics.leads >= 3 && deliveryMetrics.ctr >= 0.012
      ? "high"
      : deliveryMetrics.leads > 0
        ? "medium"
        : "test";
  const targetingSuccess = targetingPerformanceTag === "high" ? 1 : 0;
  const targetingFailure = deliveryMetrics.leads === 0 && deliveryMetrics.spend > 15 ? 1 : 0;

  const { error: targetingUpsertError } = await supabase
    .from("targeting_intelligence_patterns")
    .upsert(
      {
        organization_id: context.organization.id,
        user_id: context.user.id,
        audience: plan.audience,
        location: plan.market,
        targeting_pattern: targetingPattern,
        spend: deliveryMetrics.spend,
        impressions: deliveryMetrics.impressions,
        clicks: deliveryMetrics.clicks,
        ctr: Number(deliveryMetrics.ctr.toFixed(4)),
        leads: deliveryMetrics.leads,
        cpl:
          deliveryMetrics.leads > 0
            ? Number((deliveryMetrics.spend / deliveryMetrics.leads).toFixed(2))
            : null,
        performance_tag: targetingPerformanceTag,
        success_count: targetingSuccess,
        failure_count: targetingFailure,
        confidence_score:
          targetingSuccess > targetingFailure
            ? 0.7
            : targetingFailure > targetingSuccess
              ? 0.35
              : 0.5,
        last_seen: syncedAt,
      } as never,
      { onConflict: "organization_id,user_id,audience,location,targeting_pattern" },
    );

  if (targetingUpsertError) {
    // Targeting intelligence should not block the primary sync snapshot.
  }

  const suggestions = await refreshCampaignActionSuggestions(snapshot);
  await refreshCampaignDraftActions(suggestions);

  return snapshot;
}
