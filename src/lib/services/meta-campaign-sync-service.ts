import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  fetchAdInsights,
  fetchAdSetStatusReadResults,
  fetchAdStatusReadResults,
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
import { recordLeadTrackingEvent } from "@/lib/services/lead-tracking-service";
import {
  getCampaignLaunchRecordForCampaign,
  getLatestCampaignLaunchRecord,
} from "@/lib/services/campaign-launch-audit-service";
import { getLatestCampaignPlan } from "@/lib/services/campaign-plan-service";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { logError, logWarn } from "@/lib/logging";
import type { Json } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type MetaSyncSupabase = SupabaseClient<Database>;

type SyncErrorStage = "campaign" | "ad_set" | "ad" | "insights" | "connection";

type SyncErrorRecord = {
  stage: SyncErrorStage;
  message: string;
  target?: string;
  code?: number;
  subcode?: number;
  severity?: "warning" | "error";
};

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
  const spend = Number(row.spend ?? 0);
  const impressions = Number(row.impressions ?? 0);
  const clicks = Number(row.clicks ?? 0);
  const leads = Number(row.leads ?? 0);
  const appointments = Number(row.appointments ?? 0);
  const ctr = row.ctr !== undefined ? Number(row.ctr) : clicks / Math.max(impressions, 1);
  const cpl = row.cpl !== undefined ? Number(row.cpl) : leads > 0 ? spend / leads : 0;
  const cpa =
    row.cpa !== undefined ? Number(row.cpa) : appointments > 0 ? spend / appointments : 0;
  const cpc = row.cpc !== undefined ? Number(row.cpc) : clicks > 0 ? spend / clicks : 0;
  const reach = Number(row.reach ?? 0);
  const frequency =
    row.frequency !== undefined ? Number(row.frequency) : reach > 0 ? impressions / reach : 0;

  return {
    spend,
    impressions,
    clicks,
    leads,
    appointments,
    cpl,
    cpa,
    ctr,
    cpc,
    frequency,
    reach,
  };
}

function mapSyncErrors(value: unknown): MetaSyncError[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    if (typeof item === "string") {
      return item;
    }

    const row = item as Record<string, unknown>;
    const stage = row.stage;
    const normalizedStage =
      stage === "campaign" ||
      stage === "ad_set" ||
      stage === "ad" ||
      stage === "insights" ||
      stage === "connection"
        ? stage
        : "campaign";
    const message = String(row.message ?? "Sync issue");
    const target = String(row.target ?? "");
    const code = row.code !== undefined ? ` code=${String(row.code)}` : "";

    return target ? `[${normalizedStage}] ${message}${code} (${target})` : `[${normalizedStage}] ${message}${code}`;
  });
}

function createSyncError(
  stage: SyncErrorStage,
  message: string,
  target?: string | null,
  details?: Partial<Pick<SyncErrorRecord, "code" | "subcode" | "severity">>,
): SyncErrorRecord {
  return {
    stage,
    message,
    target: target?.trim() || undefined,
    code: details?.code,
    subcode: details?.subcode,
    severity: details?.severity ?? "error",
  };
}

function serializeSyncErrors(errors: SyncErrorRecord[]) {
  return errors.map((error) => {
    const payload: SyncErrorRecord = {
      stage: error.stage,
      message: error.message,
      severity: error.severity ?? "error",
    };

    if (error.target) {
      payload.target = error.target;
    }

    if (error.code !== undefined) {
      payload.code = error.code;
    }

    if (error.subcode !== undefined) {
      payload.subcode = error.subcode;
    }

    return payload;
  });
}

function hasDeliveryVolume(metrics: MetaDeliveryMetrics) {
  return (
    Number(metrics.spend ?? 0) > 0 ||
    Number(metrics.impressions ?? 0) > 0 ||
    Number(metrics.clicks ?? 0) > 0 ||
    Number(metrics.leads ?? 0) > 0
  );
}

function mapSyncSnapshot(row: Record<string, unknown> | null): MetaCampaignSyncSnapshot | null {
  if (!row) {
    return null;
  }

  const deliveryMetrics = mapDeliveryMetrics(row.delivery_metrics);

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
    metrics: deliveryMetrics,
    deliveryMetrics,
    syncMetadata:
      row.sync_metadata && typeof row.sync_metadata === "object"
        ? (row.sync_metadata as { [key: string]: Json | undefined })
        : ({} as { [key: string]: Json | undefined }),
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

async function getConnectedMetaAccount(
  organizationId: string,
  supabaseOverride?: MetaSyncSupabase | null,
) {
  const supabase = supabaseOverride ?? (await getMetaSyncContext()).supabase;
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
  organizationId?: string | null;
  userId?: string | null;
}) {
  const { context, supabase } = await getMetaSyncContext();
  const explicitOrganizationId = params.organizationId?.trim() || null;
  const explicitUserId = params.userId?.trim() || null;
  const querySupabase =
    explicitOrganizationId || explicitUserId ? createAdminClient() ?? supabase : supabase;
  const organizationId = explicitOrganizationId ?? context.organization.id;
  const userId = explicitUserId ?? context.user.id;

  const buildQuery = () =>
    querySupabase
      .from("campaign_sync_snapshots")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .order("synced_at", { ascending: false })
      .limit(1);

  if (params.metaCampaignId) {
    const { data } = await buildQuery().eq("meta_campaign_id", params.metaCampaignId).maybeSingle();
    return mapSyncSnapshot((data as Record<string, unknown> | null) ?? null);
  }

  const { data } = await buildQuery().eq("campaign_name", params.campaignName).maybeSingle();
  return mapSyncSnapshot((data as Record<string, unknown> | null) ?? null);
}

export async function syncMetaCampaignStatus(params?: { campaignId?: string | null }) {
  const requestedCampaignId = params?.campaignId?.trim() || null;
  const [{ context, supabase }, scopedRecord, latestPlan, latestLaunchRecord] = await Promise.all([
    getMetaSyncContext(),
    requestedCampaignId ? getCampaignById(requestedCampaignId).catch(() => null) : Promise.resolve(null),
    requestedCampaignId ? Promise.resolve(null) : getLatestCampaignPlan(),
    requestedCampaignId ? Promise.resolve(null) : getLatestCampaignLaunchRecord(),
  ]);
  const plan = scopedRecord ? canonicalCampaignToPlan(scopedRecord) : latestPlan;
  const launchRecord = scopedRecord
    ? await getCampaignLaunchRecordForCampaign({
        campaignName: plan?.businessName ?? scopedRecord.campaign.name,
        metaCampaignId: plan?.runtime.campaignId ?? null,
      })
    : latestLaunchRecord;

  if (!plan) {
    throw new ApiError(
      400,
      requestedCampaignId
        ? "Requested campaign could not be found for Meta sync."
        : "Generate and launch a campaign before syncing status.",
      "campaign_plan_missing",
    );
  }

  const effectiveOrganizationId =
    scopedRecord?.campaign.organization_id ??
    scopedRecord?.campaign.user_id ??
    context.organization.id;
  const effectiveUserId = scopedRecord?.campaign.user_id ?? context.user.id;
  const effectiveSupabase = scopedRecord ? createAdminClient() ?? supabase : supabase;
  const isCurrentSessionCampaign =
    effectiveOrganizationId === context.organization.id && effectiveUserId === context.user.id;

  const connection = await getConnectedMetaAccount(effectiveOrganizationId, effectiveSupabase);

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

  const errors: SyncErrorRecord[] = [];
  let campaignStatus: MetaEntityStatus | null = null;
  let adSetStatuses: MetaEntityStatus[] = [];
  let adStatuses: MetaEntityStatus[] = [];
  let deliveryMetrics: MetaDeliveryMetrics = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    appointments: 0,
    cpl: 0,
    cpa: 0,
    ctr: 0,
    cpc: 0,
    frequency: 0,
    reach: 0,
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
    errors.push(createSyncError("campaign", message, ids.campaignId));
  }

  if (ids.adSetIds.length === 0) {
    errors.push(createSyncError("ad_set", "No Meta ad set IDs were stored for this campaign yet.", ids.campaignId));
  } else {
    const result = await fetchAdSetStatusReadResults({
      adSetIds: ids.adSetIds,
      accessToken,
      mode,
    });
    adSetStatuses = result.statuses;
    errors.push(...result.errors.map((error) => createSyncError(error.stage, error.message, error.target, {
      code: error.code,
      subcode: error.subcode,
    })));

    if (result.errors.length > 0) {
      logWarn("Meta ad set status sync partially degraded", {
        campaignId: ids.campaignId,
        unreadableAdSetIds: result.errors.map((error) => error.target),
      });
    }
  }

  if (ids.adIds.length === 0) {
    errors.push(createSyncError("ad", "No Meta ad IDs were stored for this campaign yet.", ids.campaignId));
  } else {
    const result = await fetchAdStatusReadResults({
      adIds: ids.adIds,
      accessToken,
      mode,
    });
    adStatuses = result.statuses;
    errors.push(...result.errors.map((error) => createSyncError(error.stage, error.message, error.target, {
      code: error.code,
      subcode: error.subcode,
    })));

    if (result.errors.length > 0) {
      logWarn("Meta ad status sync partially degraded", {
        campaignId: ids.campaignId,
        unreadableAdIds: result.errors.map((error) => error.target),
      });
    }
  }

  let deliveryMetricsRead = false;
  try {
    deliveryMetrics = await fetchDeliveryMetrics({
      campaignId: ids.campaignId,
      accessToken,
      mode,
      campaignStatus: campaignStatus?.status ?? null,
    });
    deliveryMetricsRead = true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Delivery metrics could not be loaded.";
    logError("Meta delivery metrics sync failed", {
      campaignId: ids.campaignId,
      message,
    });
    errors.push(createSyncError("insights", message, ids.campaignId));
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
      errors.push(createSyncError("ad", message, ids.campaignId, { severity: "warning" }));
    }
  }

  const syncResult = getMetaSyncStatus(campaignStatus, errors);
  const syncedAt = new Date().toISOString();
  const unreadableMetaObjects = errors
    .filter((error) => error.target && (error.stage === "ad" || error.stage === "ad_set" || error.stage === "campaign"))
    .map((error) => ({
      stage: error.stage,
      target: error.target,
      code: error.code,
      subcode: error.subcode,
      message: error.message,
    }));
  const deliveryMetricsStatus = deliveryMetricsRead
    ? hasDeliveryVolume(deliveryMetrics)
      ? "has_delivery"
      : "zero_delivery"
    : "unavailable";

  const insertPayload = {
    organization_id: effectiveOrganizationId,
    user_id: effectiveUserId,
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
    delivery_metrics: deliveryMetricsRead ? (deliveryMetrics as unknown as Json) : ({} as Json),
    sync_metadata: {
      mode,
      ad_insights: adInsights,
      delivery_metrics_status: deliveryMetricsStatus,
      readable_ad_set_count: adSetStatuses.length,
      readable_ad_count: adStatuses.length,
      expected_ad_set_count: ids.adSetIds.length,
      expected_ad_count: ids.adIds.length,
      unreadable_meta_objects: unreadableMetaObjects,
      synced_from_runtime: {
        campaignId: plan.runtime.campaignId,
        metaPushStatus: plan.runtime.metaPushStatus,
      },
    } as Json,
    sync_errors: serializeSyncErrors(errors) as unknown as Json,
    synced_at: syncedAt,
  };

  const { error: insertError } = await effectiveSupabase
    .from("campaign_sync_snapshots")
    .insert(insertPayload as never);

  if (insertError) {
    throw new ApiError(500, insertError.message, "campaign_sync_snapshot_insert_failed");
  }

  if (typeof connection.id !== "string" || connection.id.length === 0) {
    throw new ApiError(500, "Meta account record is missing its internal ID.", "meta_account_id_missing");
  }

  const { error: accountUpdateError } = await effectiveSupabase
    .from("marketing_accounts")
    .update({ last_sync_at: syncedAt } as never)
    .eq("id", connection.id);

  if (accountUpdateError) {
    throw new ApiError(500, accountUpdateError.message, "meta_account_sync_timestamp_failed");
  }

  const snapshot = await getMetaCampaignSyncSnapshotForCampaign({
    campaignName: launchRecord?.campaignName ?? plan.businessName,
    metaCampaignId: ids.campaignId,
    organizationId: effectiveOrganizationId,
    userId: effectiveUserId,
  });

  if (!snapshot) {
    throw new ApiError(500, "Synced snapshot could not be loaded.", "campaign_sync_snapshot_missing");
  }

  if (deliveryMetricsRead) {
    await recordLeadTrackingEvent({
      organizationId: effectiveOrganizationId,
      campaignId: scopedRecord?.campaign.id ?? requestedCampaignId,
      eventType: "meta_reporting_checked",
      status: deliveryMetrics.leads > 0 ? "seen" : "missing",
      source: "meta_campaign_sync",
      metadata: {
        metaCampaignId: ids.campaignId,
        leads: deliveryMetrics.leads,
        spend: deliveryMetrics.spend,
        clicks: deliveryMetrics.clicks,
        impressions: deliveryMetrics.impressions,
        rawActions: deliveryMetrics.raw_actions ?? [],
        rawConversions: deliveryMetrics.raw_conversions ?? [],
      },
    }).catch(() => null);

    const { error: performanceTrackingError } = await effectiveSupabase.from("performance_tracking").insert({
      organization_id: effectiveOrganizationId,
      user_id: effectiveUserId,
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
  } else {
    logWarn("Performance tracking snapshot skipped because Meta delivery insights were unavailable", {
      campaignId: snapshot.metaCampaignId,
      syncResult,
    });
  }

  if (isCurrentSessionCampaign) {
    await recordCreativePerformanceSnapshot({
      plan,
      snapshot,
    }).catch(() => null);
  }

  const targetingPattern = `${plan.audience} in ${plan.market} using ${plan.keyOffer}`;
  const targetingPerformanceTag =
    deliveryMetrics.leads >= 3 && deliveryMetrics.ctr >= 0.012
      ? "high"
      : deliveryMetrics.leads > 0
        ? "medium"
        : "test";
  const targetingSuccess = targetingPerformanceTag === "high" ? 1 : 0;
  const targetingFailure = deliveryMetrics.leads === 0 && deliveryMetrics.spend > 15 ? 1 : 0;

  const { error: targetingUpsertError } = await effectiveSupabase
    .from("targeting_intelligence_patterns")
    .upsert(
      {
        organization_id: effectiveOrganizationId,
        user_id: effectiveUserId,
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

  if (isCurrentSessionCampaign) {
    const suggestions = await refreshCampaignActionSuggestions(snapshot);
    await refreshCampaignDraftActions(suggestions);
  }

  return snapshot;
}
