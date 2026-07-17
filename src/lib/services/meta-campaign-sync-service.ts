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
  type MetaAdInsight,
} from "@/lib/integrations/meta/status-sync";
import type {
  MetaCampaignSyncSnapshot,
  MetaConnectionRecord,
  MetaDeliveryMetrics,
  MetaEntityStatus,
  MetaSyncError,
} from "@/lib/integrations/meta/types";
import { getMetaAccessToken } from "@/lib/integrations/meta/execution";
import {
  buildFailedMetaReportingTruth,
  buildMetaReportingWindow,
} from "@/lib/integrations/meta/reporting-contract";
import { getAppContext } from "@/lib/services/app-context";
import { refreshCampaignActionSuggestions } from "@/lib/services/campaign-action-service";
import { refreshCampaignDraftActions } from "@/lib/services/campaign-draft-action-service";
import { recordCreativePerformanceSnapshot } from "@/lib/services/creative-performance-service";
import {
  getCampaignLaunchRecordForCampaign,
  getCampaignLaunchRecordForInternalActor,
  getLatestCampaignLaunchRecord,
} from "@/lib/services/campaign-launch-audit-service";
import { getLatestCampaignPlan } from "@/lib/services/campaign-plan-service";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { getCampaignByIdForInternalActor } from "@/lib/services/campaign-persistence";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { recordLeadTrackingEvent } from "@/lib/services/lead-tracking-service";
import { reconcileCampaignProviderReadback } from "@/lib/services/campaign-runtime-service";
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
      configuredStatus:
        typeof row.configuredStatus === "string" ? row.configuredStatus : null,
      effectiveStatus:
        typeof row.effectiveStatus === "string" ? row.effectiveStatus : null,
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

    return target ? `[${normalizedStage}] ${message} (${target})` : `[${normalizedStage}] ${message}`;
  });
}

function formatSyncError(stage: "campaign" | "ad_set" | "ad" | "insights" | "connection", message: string, target: string) {
  return target ? `[${stage}] ${message} (${target})` : `[${stage}] ${message}`;
}

function mapReportingCompleteness(
  value: unknown,
): NonNullable<MetaCampaignSyncSnapshot["reportingCompleteness"]> {
  return value === "complete" ||
    value === "partial" ||
    value === "missing" ||
    value === "failed"
    ? value
    : "failed";
}

function mapSyncSnapshot(row: Record<string, unknown> | null): MetaCampaignSyncSnapshot | null {
  if (!row) {
    return null;
  }

  const deliveryMetrics = mapDeliveryMetrics(row.delivery_metrics);
  const syncMetadata =
    row.sync_metadata && typeof row.sync_metadata === "object"
      ? (row.sync_metadata as { [key: string]: Json | undefined })
      : ({} as { [key: string]: Json | undefined });

  return {
    id: String(row.id),
    internalCampaignId:
      typeof row.campaign_id === "string" ? row.campaign_id : null,
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
    campaignEntityId:
      typeof syncMetadata.campaign_entity_id === "string"
        ? syncMetadata.campaign_entity_id
        : null,
    campaignConfiguredStatus:
      typeof syncMetadata.campaign_configured_status === "string"
        ? syncMetadata.campaign_configured_status
        : null,
    campaignEffectiveStatus:
      typeof syncMetadata.campaign_effective_status === "string"
        ? syncMetadata.campaign_effective_status
        : null,
    adSetStatuses: mapEntityStatuses(row.ad_set_statuses),
    adStatuses: mapEntityStatuses(row.ad_statuses),
    metrics: deliveryMetrics,
    deliveryMetrics,
    syncMetadata,
    syncErrors: mapSyncErrors(row.sync_errors),
    deliveryMetricsConfirmed: row.delivery_metrics_confirmed === true,
    reportingCompleteness: mapReportingCompleteness(
      syncMetadata.reporting_truth &&
        typeof syncMetadata.reporting_truth === "object" &&
        !Array.isArray(syncMetadata.reporting_truth)
        ? (syncMetadata.reporting_truth as Record<string, unknown>).completeness
        : undefined,
    ),
    syncedAt: String(row.synced_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function attachLatestMetaSyncAttempt(
  confirmed: MetaCampaignSyncSnapshot | null,
  attemptRow: Record<string, unknown> | null,
) {
  if (!confirmed || !attemptRow || String(attemptRow.id ?? "") === confirmed.id) {
    return confirmed;
  }

  const attempt = mapSyncSnapshot(attemptRow);
  if (!attempt) {
    return confirmed;
  }

  return {
    ...confirmed,
    latestAttemptAt: attempt.syncedAt ?? null,
    latestAttemptResult: attempt.syncResult ?? null,
    latestAttemptDeliveryMetricsConfirmed:
      attempt.deliveryMetricsConfirmed ?? false,
    latestAttemptErrors: attempt.syncErrors ?? [],
  } satisfies MetaCampaignSyncSnapshot;
}

async function getMetaSyncContext() {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for this route.", "unauthorized");
  }

  return { context, supabase };
}

async function getConnectedMetaAccount(organizationId: string, providedClient?: any) {
  const supabase = providedClient ?? (await getMetaSyncContext()).supabase;
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
  launchCreativeId: string | null;
  launchAdIds: string[];
  launchResultStatus: string | null;
}) {
  const hasAuthoritativeSuccessReceipt =
    params.launchResultStatus === "success" &&
    Boolean(params.launchCampaignId) &&
    params.launchAdSetIds.length === 1 &&
    Boolean(params.launchCreativeId) &&
    params.launchAdIds.length === 1;

  if (hasAuthoritativeSuccessReceipt) {
    return {
      campaignId: params.launchCampaignId,
      adSetIds: params.launchAdSetIds,
      adIds: params.launchAdIds,
      source: "durable_success_receipt" as const,
    };
  }

  return {
    campaignId: params.runtimeCampaignId ?? params.launchCampaignId,
    adSetIds:
      params.runtimeAdSetIds.length > 0 ? params.runtimeAdSetIds : params.launchAdSetIds,
    adIds: params.runtimeAdIds.length > 0 ? params.runtimeAdIds : params.launchAdIds,
    source: "mutable_runtime" as const,
  };
}

function normalizeProviderStatus(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function classifyProviderReadback(params: {
  campaignStatus: MetaEntityStatus | null;
  adSetStatuses: MetaEntityStatus[];
  adStatuses: MetaEntityStatus[];
  expectedCampaignId: string;
  expectedAdSetIds: string[];
  expectedAdIds: string[];
}) {
  const expectedAdSetIds = new Set(params.expectedAdSetIds);
  const expectedAdIds = new Set(params.expectedAdIds);
  const exactIdentity =
    params.campaignStatus?.id === params.expectedCampaignId &&
    params.adSetStatuses.length === expectedAdSetIds.size &&
    params.adStatuses.length === expectedAdIds.size &&
    params.adSetStatuses.every((status) => expectedAdSetIds.has(status.id)) &&
    params.adStatuses.every((status) => expectedAdIds.has(status.id));
  if (!exactIdentity) return null;

  const statuses = [
    params.campaignStatus!,
    ...params.adSetStatuses,
    ...params.adStatuses,
  ];
  const effectiveStatuses = statuses.map((status) =>
    normalizeProviderStatus(status.effectiveStatus ?? status.status),
  );
  const configuredStatuses = statuses.map((status) =>
    normalizeProviderStatus(status.configuredStatus),
  );

  if (effectiveStatuses.every((status) => status === "ACTIVE")) {
    return "active" as const;
  }
  if (
    statuses.every((_, index) => configuredStatuses[index] === "ACTIVE") &&
    effectiveStatuses.every((status) =>
      ["ACTIVE", "IN_PROCESS", "PENDING_REVIEW", "PREAPPROVED"].includes(status),
    )
  ) {
    return "processing" as const;
  }
  if (
    configuredStatuses.some((status) => status === "PAUSED") ||
    effectiveStatuses.some((status) => status === "PAUSED" || status.endsWith("_PAUSED"))
  ) {
    return "paused" as const;
  }
  return "operator_action_required" as const;
}

async function readActivationAuthority(params: {
  supabase: any;
  organizationId: string;
  userId: string;
  campaignId: string;
}) {
  const { data, error } = await params.supabase
    .from("meta_campaign_activation_intents")
    .select("status,provider_delivery_status")
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .eq("campaign_id", params.campaignId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logWarn("Meta activation authority readback failed", {
      campaignId: params.campaignId,
      message: error.message,
    });
    return null;
  }

  const row = data as Record<string, unknown> | null;
  return Boolean(
    row?.status === "active" &&
      (row.provider_delivery_status === "delivery_active" ||
        row.provider_delivery_status === "configured_active_pending_review"),
  );
}

export async function getLatestMetaCampaignSyncSnapshot() {
  const { context, supabase } = await getMetaSyncContext();
  const baseQuery = () =>
    supabase
      .from("campaign_sync_snapshots")
      .select("*")
      .eq("organization_id", context.organization.id)
      .eq("user_id", context.user.id)
      .order("synced_at", { ascending: false })
      .limit(1);
  const [confirmedResult, attemptResult] = await Promise.all([
    baseQuery().eq("delivery_metrics_confirmed", true).maybeSingle(),
    baseQuery().maybeSingle(),
  ]);
  if (confirmedResult.error || attemptResult.error) {
    throw new ApiError(
      500,
      confirmedResult.error?.message ?? attemptResult.error?.message ?? "Meta reporting history could not be loaded.",
      "campaign_sync_snapshot_lookup_failed",
    );
  }

  return attachLatestMetaSyncAttempt(
    mapSyncSnapshot((confirmedResult.data as Record<string, unknown> | null) ?? null),
    (attemptResult.data as Record<string, unknown> | null) ?? null,
  );
}

export async function getMetaCampaignSyncSnapshotForCampaign(params: {
  campaignId?: string | null;
  campaignName: string;
  metaCampaignId?: string | null;
}) {
  const { context, supabase } = await getMetaSyncContext();

  const buildQuery = (confirmedOnly: boolean) => {
    let query = supabase
      .from("campaign_sync_snapshots")
      .select("*")
      .eq("organization_id", context.organization.id)
      .eq("user_id", context.user.id)
      .order("synced_at", { ascending: false })
      .limit(1);
    if (confirmedOnly) {
      query = query.eq("delivery_metrics_confirmed", true);
    }
    if (params.campaignId) {
      return query.eq("campaign_id", params.campaignId);
    }
    if (params.metaCampaignId) {
      return query.eq("meta_campaign_id", params.metaCampaignId);
    }
    return query.eq("campaign_name", params.campaignName);
  };

  const [confirmedResult, attemptResult] = await Promise.all([
    buildQuery(true).maybeSingle(),
    buildQuery(false).maybeSingle(),
  ]);
  if (confirmedResult.error || attemptResult.error) {
    throw new ApiError(
      500,
      confirmedResult.error?.message ?? attemptResult.error?.message ?? "Meta campaign reporting history could not be loaded.",
      "campaign_sync_snapshot_lookup_failed",
    );
  }

  return attachLatestMetaSyncAttempt(
    mapSyncSnapshot((confirmedResult.data as Record<string, unknown> | null) ?? null),
    (attemptResult.data as Record<string, unknown> | null) ?? null,
  );
}

export async function syncMetaCampaignStatus(params?: {
  campaignId?: string | null;
  internalActor?: { organizationId: string; userId: string };
}) {
  const requestedCampaignId = params?.campaignId?.trim() || null;
  if (params?.internalActor && !requestedCampaignId) {
    throw new ApiError(400, "Internal Meta sync requires a campaign ID.", "campaign_id_required");
  }
  const admin = params?.internalActor ? createAdminClient() : null;
  if (params?.internalActor && !admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }
  const scopedContext = params?.internalActor
    ? {
        context: {
          organization: { id: params.internalActor.organizationId },
          user: { id: params.internalActor.userId },
        },
        supabase: admin as any,
      }
    : await getMetaSyncContext();
  const [{ context, supabase }, scopedRecord, latestPlan, latestLaunchRecord] = await Promise.all([
    Promise.resolve(scopedContext),
    requestedCampaignId
      ? params?.internalActor
        ? getCampaignByIdForInternalActor({
            campaignId: requestedCampaignId,
            organizationId: params.internalActor.organizationId,
            userId: params.internalActor.userId,
          }).catch(() => null)
        : getCampaignById(requestedCampaignId).catch(() => null)
      : Promise.resolve(null),
    requestedCampaignId ? Promise.resolve(null) : getLatestCampaignPlan(),
    requestedCampaignId ? Promise.resolve(null) : getLatestCampaignLaunchRecord(),
  ]);
  const plan = scopedRecord ? canonicalCampaignToPlan(scopedRecord) : latestPlan;
  const launchRecord = scopedRecord
    ? params?.internalActor
      ? await getCampaignLaunchRecordForInternalActor({
          campaignId: requestedCampaignId!,
          organizationId: params.internalActor.organizationId,
          userId: params.internalActor.userId,
        })
      : await getCampaignLaunchRecordForCampaign({
        campaignId: requestedCampaignId,
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

  const connection = await getConnectedMetaAccount(context.organization.id, supabase);

  if (!connection) {
    throw new ApiError(400, "Connect a Meta ad account before syncing status.", "meta_not_connected");
  }

  const ids = resolveLaunchIds({
    runtimeCampaignId: plan.runtime.campaignId,
    runtimeAdSetIds: plan.runtime.metaAdSetIds ?? [],
    runtimeAdIds: plan.runtime.metaAdIds ?? [],
    launchCampaignId: launchRecord?.metaCampaignId ?? null,
    launchAdSetIds: launchRecord?.metaAdSetIds ?? [],
    launchCreativeId: launchRecord?.metaCreativeId ?? null,
    launchAdIds: launchRecord?.metaAdIds ?? [],
    launchResultStatus: launchRecord?.resultStatus ?? null,
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
  const reportingWindow = buildMetaReportingWindow();
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
  let deliveryMetricsConfirmed = false;
  let deliveryReportingTruth = buildFailedMetaReportingTruth({ reportingWindow });
  let adInsights: MetaAdInsight[] = [];
  let adInsightsReportingTruth = buildFailedMetaReportingTruth({ reportingWindow });

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
    errors.push(formatSyncError("campaign", message, ids.campaignId));
  }

  if (ids.adSetIds.length === 0) {
    errors.push(formatSyncError("ad_set", "No Meta ad set IDs were stored for this campaign yet.", ids.campaignId));
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
      errors.push(formatSyncError("ad_set", message, ids.campaignId));
    }
  }

  if (ids.adIds.length === 0) {
    errors.push(formatSyncError("ad", "No Meta ad IDs were stored for this campaign yet.", ids.campaignId));
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
      errors.push(formatSyncError("ad", message, ids.campaignId));
    }
  }

  try {
    const deliveryResult = await fetchDeliveryMetrics({
      campaignId: ids.campaignId,
      accessToken,
      mode,
      campaignStatus: campaignStatus?.status ?? null,
      reportingWindow,
    });
    deliveryMetrics = deliveryResult.metrics;
    deliveryReportingTruth = deliveryResult.reportingTruth;
    deliveryMetricsConfirmed = deliveryReportingTruth.completeness === "complete";
    if (!deliveryMetricsConfirmed) {
      errors.push(formatSyncError(
        "insights",
        `Meta delivery insights are ${deliveryReportingTruth.completeness}; missing fields: ${
          deliveryReportingTruth.missingFields.join(",") || "unknown"
        }.`,
        ids.campaignId,
      ));
    }
  } catch (error) {
    deliveryReportingTruth = buildFailedMetaReportingTruth({ reportingWindow });
    const message =
      error instanceof Error ? error.message : "Delivery metrics could not be loaded.";
    logError("Meta delivery metrics sync failed", {
      campaignId: ids.campaignId,
      message,
    });
    errors.push(formatSyncError("insights", message, ids.campaignId));
  }

  if (ids.adIds.length > 0) {
    try {
      const adInsightResult = await fetchAdInsights({
        campaignId: ids.campaignId,
        accessToken,
        mode,
        adIds: ids.adIds,
        reportingWindow,
      });
      adInsights = adInsightResult.insights;
      adInsightsReportingTruth = adInsightResult.reportingTruth;
      if (adInsightsReportingTruth.completeness !== "complete") {
        errors.push(formatSyncError(
          "ad",
          `Meta ad insights are ${adInsightsReportingTruth.completeness}; missing fields: ${
            adInsightsReportingTruth.missingFields.join(",") || "unknown"
          }.`,
          ids.campaignId,
        ));
      }
    } catch (error) {
      adInsightsReportingTruth = buildFailedMetaReportingTruth({ reportingWindow });
      const message =
        error instanceof Error ? error.message : "Ad insights could not be loaded.";
      logWarn("Meta ad insights sync degraded", {
        campaignId: ids.campaignId,
        message,
      });
      errors.push(formatSyncError("ad", message, ids.campaignId));
    }
  }

  const syncResult = getMetaSyncStatus(campaignStatus, errors);
  const syncedAt = deliveryReportingTruth.receivedAt;
  const internalCampaignId =
    scopedRecord?.campaign.id ??
    requestedCampaignId ??
    launchRecord?.campaignId ??
    (typeof plan.id === "string" ? plan.id : null);

  const insertPayload = {
    organization_id: context.organization.id,
    user_id: context.user.id,
    campaign_id: internalCampaignId,
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
    delivery_metrics_confirmed: deliveryMetricsConfirmed,
    sync_metadata: {
      mode,
      delivery_metrics_confirmed: deliveryMetricsConfirmed,
      launch_id_source: ids.source,
      campaign_entity_id: campaignStatus?.id ?? null,
      campaign_configured_status: campaignStatus?.configuredStatus ?? null,
      campaign_effective_status: campaignStatus?.effectiveStatus ?? null,
      ad_insights: adInsights,
      reporting_truth: deliveryReportingTruth,
      ad_insights_truth: adInsightsReportingTruth,
      reporting_window: reportingWindow,
      synced_from_runtime: {
        campaignId: plan.runtime.campaignId,
        metaPushStatus: plan.runtime.metaPushStatus,
      },
    } as Json,
    sync_errors: errors as unknown as Json,
    synced_at: syncedAt,
  };

  const { data: insertedSnapshotRow, error: insertError } = await supabase
    .from("campaign_sync_snapshots")
    .insert(insertPayload as never)
    .select("*")
    .single();

  if (insertError) {
    throw new ApiError(500, insertError.message, "campaign_sync_snapshot_insert_failed");
  }

  if (deliveryMetricsConfirmed && (typeof connection.id !== "string" || connection.id.length === 0)) {
    throw new ApiError(500, "Meta account record is missing its internal ID.", "meta_account_id_missing");
  }

  if (deliveryMetricsConfirmed) {
    const { error: accountUpdateError } = await supabase
      .from("marketing_accounts")
      .update({ last_sync_at: syncedAt } as never)
      .eq("id", connection.id);

    if (accountUpdateError) {
      throw new ApiError(500, accountUpdateError.message, "meta_account_sync_timestamp_failed");
    }
  }
  const snapshot = mapSyncSnapshot(
    (insertedSnapshotRow as Record<string, unknown> | null) ?? null,
  );

  if (!snapshot) {
    throw new ApiError(500, "Synced snapshot could not be loaded.", "campaign_sync_snapshot_missing");
  }

  if (ids.source === "durable_success_receipt" && internalCampaignId) {
    const providerState = classifyProviderReadback({
      campaignStatus,
      adSetStatuses,
      adStatuses,
      expectedCampaignId: ids.campaignId,
      expectedAdSetIds: ids.adSetIds,
      expectedAdIds: ids.adIds,
    });
    if (providerState) {
      const activationAuthorized =
        providerState === "paused" || providerState === "operator_action_required"
          ? false
          : await readActivationAuthority({
              supabase,
              organizationId: context.organization.id,
              userId: context.user.id,
              campaignId: internalCampaignId,
            });
      if (activationAuthorized !== null) {
        await reconcileCampaignProviderReadback({
          internalCampaignId,
          metaCampaignId: ids.campaignId,
          providerState,
          activationAuthorized,
          readAt: syncedAt,
          message:
            providerState === "active" && activationAuthorized
              ? "Meta readback confirmed the exact authorized provider hierarchy is active."
              : providerState === "processing" && activationAuthorized
                ? "Meta readback confirmed activation while delivery review or startup is still processing."
                : providerState === "paused"
                  ? "Meta readback confirmed the exact provider hierarchy is paused."
                  : "Meta readback did not match a safely classifiable authorized delivery state; operator reconciliation is required.",
          internalActor: params?.internalActor,
        });
      }
    }
  }

  if (!deliveryMetricsConfirmed) {
    return snapshot;
  }

  await recordLeadTrackingEvent({
    organizationId: context.organization.id,
    campaignId: scopedRecord?.campaign.id ?? params?.campaignId ?? null,
    eventType: "meta_reporting_checked",
    status: deliveryMetrics.leads > 0 ? "seen" : "missing",
    source: "meta_campaign_sync",
    metadata: {
      metaCampaignId: ids.campaignId,
      leads: deliveryMetrics.leads,
      spend: deliveryMetrics.spend,
      clicks: deliveryMetrics.clicks,
      impressions: deliveryMetrics.impressions,
    },
  }).catch(() => null);

  const { error: performanceTrackingError } = await supabase.from("performance_tracking").insert({
    organization_id: context.organization.id,
    user_id: context.user.id,
    source_snapshot_id: snapshot.id,
    campaign_id: internalCampaignId ?? snapshot.metaCampaignId ?? snapshot.campaignName,
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

  if (!params?.internalActor) {
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

  if (!params?.internalActor) {
    const suggestions = await refreshCampaignActionSuggestions(snapshot);
    await refreshCampaignDraftActions(suggestions);
  }

  return snapshot;
}
