import { ApiError } from "@/lib/api/route";
import {
  buildMetaGraphUrl,
  withMetaBearerToken,
} from "@/lib/integrations/meta/contract";
import { fetchMetaResponse } from "@/lib/integrations/meta/request";
import {
  buildMetaReportingTruth,
  buildMetaReportingWindow,
  metaReportingTimeRange,
  normalizeMetaDeliveryInsight,
  type MetaReportingTruth,
  type MetaReportingWindow,
} from "@/lib/integrations/meta/reporting-contract";
import type {
  MetaCampaignSyncStatus,
  MetaConnectionRecord,
  MetaDeliveryMetrics,
  MetaEntityStatus,
  MetaSyncError,
  MetaSyncMode,
} from "@/lib/integrations/meta/types";

type MetaObjectResponse = {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  error?: { message?: string; code?: number; error_subcode?: number };
};

export type MetaAdInsight = {
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
};

type MetaInsightRow = {
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  frequency?: string;
  reach?: string;
  date_start?: string;
  date_stop?: string;
  actions?: Array<{
    action_type?: string;
    value?: string;
  }>;
  conversions?: Array<{
    action_type?: string;
    value?: string;
  }>;
};

type MetaInsightsResponse = {
  data?: MetaInsightRow[];
  paging?: {
    cursors?: { after?: string };
    next?: string;
  };
  error?: { message?: string; code?: number; error_subcode?: number };
};

export type MetaDeliveryMetricsResult = {
  metrics: MetaDeliveryMetrics;
  reportingTruth: MetaReportingTruth;
};

export type MetaAdInsightsResult = {
  insights: MetaAdInsight[];
  reportingTruth: MetaReportingTruth;
};

const META_INSIGHTS_PAGE_SIZE = 100;
const META_INSIGHTS_MAX_PAGES = 20;
const META_INSIGHTS_MAX_ROWS = META_INSIGHTS_PAGE_SIZE * META_INSIGHTS_MAX_PAGES;

const AUTHORITATIVE_LEAD_ACTION_TYPES = [
  "lead",
  "omni_lead",
] as const;

const MUTUALLY_EXCLUSIVE_LEAD_FALLBACK_TYPES = [
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
] as const;

function readActionValue(
  actions: Array<{ action_type?: string; value?: string }>,
  actionType: string,
) {
  const values = actions
    .filter((action) => action.action_type === actionType)
    .map((action) => Number(action.value))
    .filter((value) => Number.isFinite(value) && value >= 0);

  // Meta normally returns one row per action type. If it ever repeats a row,
  // selecting the maximum preserves the aggregate without double-counting it.
  return values.length > 0 ? Math.max(...values) : null;
}

export function extractLeadsFromActions(
  actions: Array<{ action_type?: string; value?: string }> | undefined,
) {
  if (!actions?.length) {
    return 0;
  }

  // `lead` already contains offsite leads plus On-Facebook leads. `omni_lead`
  // is the next aggregate fallback. Never add either aggregate to its
  // component rows or Meta will overstate conversions.
  for (const actionType of AUTHORITATIVE_LEAD_ACTION_TYPES) {
    const authoritativeValue = readActionValue(actions, actionType);

    if (authoritativeValue !== null) {
      return authoritativeValue;
    }
  }

  // If Meta omits both aggregate rows, the onsite and pixel-specific rows are
  // mutually exclusive and can be combined as a conservative fallback.
  return MUTUALLY_EXCLUSIVE_LEAD_FALLBACK_TYPES.reduce((sum, actionType) => {
    return sum + (readActionValue(actions, actionType) ?? 0);
  }, 0);
}

function parseMetaError(data: { error?: { message?: string; code?: number } } | null, fallback: string) {
  const message = data?.error?.message ?? fallback;

  if (message.toLowerCase().includes("expired") || data?.error?.code === 190) {
    throw new ApiError(
      401,
      "Meta connection expired. Reconnect the ad account, then sync campaign status again.",
      "meta_connection_expired",
    );
  }

  throw new ApiError(502, message, "meta_sync_failed");
}

function requireMetaAccessToken(accessToken: string | null) {
  if (!accessToken?.trim()) {
    throw new ApiError(
      401,
      "Meta connection expired. Reconnect the ad account, then sync campaign status again.",
      "meta_connection_expired",
    );
  }

  return accessToken;
}

async function fetchMetaInsightPages(params: {
  path: string;
  accessToken: string;
  query: Record<string, string | number | boolean | null | undefined>;
  fallbackError: string;
}) {
  const rows: MetaInsightRow[] = [];
  const seenCursors = new Set<string>();
  let after: string | null = null;

  for (let pageNumber = 1; pageNumber <= META_INSIGHTS_MAX_PAGES; pageNumber += 1) {
    const url = buildMetaGraphUrl(params.path, {
      ...params.query,
      limit: META_INSIGHTS_PAGE_SIZE,
      after,
    });
    const response = await fetchMetaResponse(url, {
      purpose: "sync",
      cache: "no-store",
      ...withMetaBearerToken(params.accessToken),
    });
    const data = (await response.json().catch(() => null)) as MetaInsightsResponse | null;

    if (!response.ok) {
      parseMetaError(data, params.fallbackError);
    }
    if (!data || !Array.isArray(data.data)) {
      throw new ApiError(
        502,
        "Meta insights returned an invalid page.",
        "meta_insights_page_invalid",
      );
    }
    if (rows.length + data.data.length > META_INSIGHTS_MAX_ROWS) {
      throw new ApiError(
        502,
        "Meta insights exceeded the bounded row limit.",
        "meta_insights_row_limit_reached",
      );
    }
    rows.push(...data.data);

    const hasNextPage = typeof data.paging?.next === "string" && data.paging.next.length > 0;
    if (!hasNextPage) {
      return {
        rows,
        pageCount: pageNumber,
        receivedAt: new Date().toISOString(),
      };
    }

    const nextCursor = data.paging?.cursors?.after?.trim() ?? "";
    if (
      data.data.length === 0 ||
      !nextCursor ||
      nextCursor.length > 1_024 ||
      /\s/.test(nextCursor) ||
      nextCursor === after
    ) {
      throw new ApiError(
        502,
        "Meta insights pagination did not make progress.",
        "meta_insights_pagination_nonprogress",
      );
    }
    if (seenCursors.has(nextCursor)) {
      throw new ApiError(
        502,
        "Meta insights repeated a pagination cursor.",
        "meta_insights_pagination_duplicate_cursor",
      );
    }
    if (pageNumber === META_INSIGHTS_MAX_PAGES) {
      throw new ApiError(
        502,
        "Meta insights exceeded the bounded page limit.",
        "meta_insights_page_limit_reached",
      );
    }
    seenCursors.add(nextCursor);
    after = nextCursor;
  }

  throw new ApiError(
    502,
    "Meta insights pagination ended unexpectedly.",
    "meta_insights_pagination_unexpected",
  );
}

async function fetchMetaObject(params: {
  objectId: string;
  accessToken: string;
}): Promise<MetaObjectResponse> {
  const accessToken = requireMetaAccessToken(params.accessToken);
  const url = buildMetaGraphUrl(params.objectId, {
    fields: "id,name,status,effective_status",
  });

  const response = await fetchMetaResponse(url, {
    purpose: "sync",
    cache: "no-store",
    ...withMetaBearerToken(accessToken),
  });
  const data = (await response.json().catch(() => null)) as MetaObjectResponse | null;

  if (!response.ok || !data?.id) {
    parseMetaError(data, "Meta object status could not be loaded.");
  }

  return data as MetaObjectResponse;
}

function toEntityStatus(data: MetaObjectResponse, fallbackName: string): MetaEntityStatus {
  const configuredStatus =
    typeof data.status === "string" && data.status.length > 0 ? data.status : null;
  const effectiveStatus =
    typeof data.effective_status === "string" && data.effective_status.length > 0
      ? data.effective_status
      : null;

  return {
    id: String(data.id ?? ""),
    name: typeof data.name === "string" && data.name.length > 0 ? data.name : fallbackName,
    status: effectiveStatus ?? configuredStatus ?? "UNKNOWN",
    configuredStatus,
    effectiveStatus,
  };
}

export function getMetaSyncMode(
  _connection: MetaConnectionRecord,
  _campaignId: string | null,
): MetaSyncMode {
  return "live";
}

export async function fetchCampaignStatus(params: {
  campaignId: string;
  accessToken: string | null;
  mode: MetaSyncMode;
  runtimeStatus: string;
  campaignName: string;
}) {
  const data = await fetchMetaObject({
    objectId: params.campaignId,
    accessToken: params.accessToken ?? "",
  });

  return toEntityStatus(data, params.campaignName);
}

export async function fetchAdSetStatuses(params: {
  adSetIds: string[];
  accessToken: string | null;
  mode: MetaSyncMode;
}) {
  return Promise.all(
    params.adSetIds.map(async (id, index) => {
      const data = await fetchMetaObject({
        objectId: id,
        accessToken: params.accessToken ?? "",
      });

      return toEntityStatus(data, `Ad Set ${index + 1}`);
    }),
  );
}

export async function fetchAdStatuses(params: {
  adIds: string[];
  accessToken: string | null;
  mode: MetaSyncMode;
}) {
  return Promise.all(
    params.adIds.map(async (id, index) => {
      const data = await fetchMetaObject({
        objectId: id,
        accessToken: params.accessToken ?? "",
      });

      return toEntityStatus(data, `Ad ${index + 1}`);
    }),
  );
}

export async function fetchDeliveryMetrics(params: {
  campaignId: string;
  accessToken: string | null;
  mode: MetaSyncMode;
  campaignStatus: string | null;
  reportingWindow?: MetaReportingWindow;
}): Promise<MetaDeliveryMetricsResult> {
  const accessToken = requireMetaAccessToken(params.accessToken);
  const reportingWindow = params.reportingWindow ?? buildMetaReportingWindow();
  const pageResult = await fetchMetaInsightPages({
    path: `${params.campaignId}/insights`,
    accessToken,
    query: {
      fields: "spend,impressions,clicks,ctr,frequency,reach,actions,conversions,date_start,date_stop",
      time_range: metaReportingTimeRange(reportingWindow),
    },
    fallbackError: "Meta delivery metrics could not be loaded.",
  });
  if (pageResult.rows.length > 1) {
    throw new ApiError(
      502,
      "Meta returned more than one campaign-level aggregate insight row.",
      "meta_delivery_insights_ambiguous",
    );
  }

  const insight = pageResult.rows[0];
  const reportingTruth = buildMetaReportingTruth({
    insight,
    reportingWindow,
    receivedAt: pageResult.receivedAt,
    pageCount: pageResult.pageCount,
    rowCount: pageResult.rows.length,
  });
  const normalized = normalizeMetaDeliveryInsight(insight);
  const spend = Number(insight?.spend ?? 0);
  const leads = extractLeadsFromActions(insight?.actions);

  return {
    metrics: {
      spend,
      impressions: normalized.impressions,
      clicks: normalized.clicks,
      ctr: normalized.ctr,
      leads,
      appointments: 0,
      cpl: leads > 0 ? spend / leads : 0,
      cpa: 0,
      cpc: normalized.clicks > 0 ? spend / normalized.clicks : 0,
      frequency: normalized.frequency,
      reach: normalized.reach,
      attribution_window: reportingWindow,
      raw_actions: insight?.actions ?? [],
      raw_conversions: insight?.conversions ?? [],
    },
    reportingTruth,
  };
}

function buildAdInsightsTruth(params: {
  rows: MetaInsightRow[];
  requestedAdCount: number;
  reportingWindow: MetaReportingWindow;
  receivedAt: string;
  pageCount: number;
}) {
  if (params.rows.length === 0) {
    return buildMetaReportingTruth({
      insight: null,
      reportingWindow: params.reportingWindow,
      receivedAt: params.receivedAt,
      pageCount: params.pageCount,
      rowCount: 0,
    });
  }
  const rowTruth = params.rows.map((row) => buildMetaReportingTruth({
    insight: row,
    reportingWindow: params.reportingWindow,
    receivedAt: params.receivedAt,
    pageCount: params.pageCount,
    rowCount: params.rows.length,
  }));
  const missingFields = new Set(rowTruth.flatMap((truth) => truth.missingFields));
  if (params.rows.length !== params.requestedAdCount) {
    missingFields.add("requested_ad_rows");
  }
  const missing = [...missingFields].sort();
  return {
    schemaVersion: 1 as const,
    completeness: missing.length === 0 ? "complete" as const : "partial" as const,
    missingFields: missing,
    providerSourceStartedAt:
      rowTruth.every((truth) => truth.providerSourceStartedAt === rowTruth[0]?.providerSourceStartedAt)
        ? rowTruth[0]?.providerSourceStartedAt ?? null
        : null,
    providerSourceEndedAt:
      rowTruth.every((truth) => truth.providerSourceEndedAt === rowTruth[0]?.providerSourceEndedAt)
        ? rowTruth[0]?.providerSourceEndedAt ?? null
        : null,
    providerSourceGranularity: "date" as const,
    receivedAt: params.receivedAt,
    pageCount: params.pageCount,
    rowCount: params.rows.length,
  } satisfies MetaReportingTruth;
}

export async function fetchAdInsights(params: {
  campaignId: string;
  accessToken: string | null;
  mode: MetaSyncMode;
  adIds: string[];
  reportingWindow?: MetaReportingWindow;
}): Promise<MetaAdInsightsResult> {
  const accessToken = requireMetaAccessToken(params.accessToken);
  const reportingWindow = params.reportingWindow ?? buildMetaReportingWindow();
  const pageResult = await fetchMetaInsightPages({
    path: `${params.campaignId}/insights`,
    accessToken,
    query: {
      fields: "ad_id,ad_name,spend,impressions,clicks,ctr,frequency,reach,actions,date_start,date_stop",
      level: "ad",
      time_range: metaReportingTimeRange(reportingWindow),
    },
    fallbackError: "Meta ad insights could not be loaded.",
  });
  const allowedIds = new Set(params.adIds);
  const allowedRows = pageResult.rows.filter((row) => row.ad_id && allowedIds.has(row.ad_id));
  const seenIds = new Set<string>();
  for (const row of allowedRows) {
    if (!row.ad_id || seenIds.has(row.ad_id)) {
      throw new ApiError(
        502,
        "Meta repeated an ad insight row across pages.",
        "meta_ad_insights_duplicate_row",
      );
    }
    seenIds.add(row.ad_id);
  }
  const reportingTruth = buildAdInsightsTruth({
    rows: allowedRows,
    requestedAdCount: allowedIds.size,
    reportingWindow,
    receivedAt: pageResult.receivedAt,
    pageCount: pageResult.pageCount,
  });
  const completeRows = allowedRows.filter((row) => buildMetaReportingTruth({
    insight: row,
    reportingWindow,
    receivedAt: pageResult.receivedAt,
    pageCount: pageResult.pageCount,
    rowCount: allowedRows.length,
  }).completeness === "complete");

  return {
    insights: completeRows.map((row, index) => {
      const normalized = normalizeMetaDeliveryInsight(row);
      return {
        adId: String(row.ad_id),
        adName: String(row.ad_name ?? `Ad ${index + 1}`),
        spend: Number(row.spend),
        impressions: normalized.impressions,
        clicks: normalized.clicks,
        ctr: normalized.ctr,
        leads: extractLeadsFromActions(row.actions),
      } satisfies MetaAdInsight;
    }),
    reportingTruth,
  };
}

export function getMetaSyncStatus(
  campaignStatus: MetaEntityStatus | null,
  errors: MetaSyncError[],
): MetaCampaignSyncStatus {
  if (!campaignStatus) {
    return "failed";
  }

  if (errors.length > 0) {
    return "partial_success";
  }

  return "success";
}
