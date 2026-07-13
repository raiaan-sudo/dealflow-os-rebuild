import { ApiError } from "@/lib/api/route";
import {
  buildMetaGraphUrl,
  withMetaBearerToken,
} from "@/lib/integrations/meta/contract";
import { fetchMetaResponse } from "@/lib/integrations/meta/request";
import {
  buildMetaReportingWindow,
  metaReportingTimeRange,
  normalizeMetaDeliveryInsight,
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

type MetaInsightsResponse = {
  data?: Array<{
    ad_id?: string;
    ad_name?: string;
    spend?: string;
    impressions?: string;
    clicks?: string;
    ctr?: string;
    frequency?: string;
    reach?: string;
    actions?: Array<{
      action_type?: string;
      value?: string;
    }>;
    conversions?: Array<{
      action_type?: string;
      value?: string;
    }>;
  }>;
  error?: { message?: string; code?: number; error_subcode?: number };
};

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
}) {
  const accessToken = requireMetaAccessToken(params.accessToken);
  const reportingWindow = params.reportingWindow ?? buildMetaReportingWindow();
  const url = buildMetaGraphUrl(`${params.campaignId}/insights`, {
    fields: "spend,impressions,clicks,ctr,frequency,reach,actions,conversions",
    time_range: metaReportingTimeRange(reportingWindow),
    limit: 1,
  });

  const response = await fetchMetaResponse(url, {
    purpose: "sync",
    cache: "no-store",
    ...withMetaBearerToken(accessToken),
  });
  const data = (await response.json().catch(() => null)) as MetaInsightsResponse | null;

  if (!response.ok) {
    parseMetaError(data, "Meta delivery metrics could not be loaded.");
  }

  const insight = data?.data?.[0];
  const normalized = normalizeMetaDeliveryInsight(insight);

  return {
    spend: Number(insight?.spend ?? 0),
    impressions: normalized.impressions,
    clicks: normalized.clicks,
    ctr: normalized.ctr,
    leads: extractLeadsFromActions(insight?.actions),
    appointments: 0,
    cpl: 0,
    cpa: 0,
    cpc: 0,
    frequency: normalized.frequency,
    reach: normalized.reach,
    attribution_window: reportingWindow,
    raw_actions: insight?.actions ?? [],
    raw_conversions: insight?.conversions ?? [],
  } satisfies MetaDeliveryMetrics;
}

export async function fetchAdInsights(params: {
  campaignId: string;
  accessToken: string | null;
  mode: MetaSyncMode;
  adIds: string[];
  reportingWindow?: MetaReportingWindow;
}) {
  const accessToken = requireMetaAccessToken(params.accessToken);
  const reportingWindow = params.reportingWindow ?? buildMetaReportingWindow();
  const url = buildMetaGraphUrl(`${params.campaignId}/insights`, {
    fields: "ad_id,ad_name,spend,impressions,clicks,ctr,actions",
    level: "ad",
    time_range: metaReportingTimeRange(reportingWindow),
    limit: Math.max(params.adIds.length, 25),
  });

  const response = await fetchMetaResponse(url, {
    purpose: "sync",
    cache: "no-store",
    ...withMetaBearerToken(accessToken),
  });
  const data = (await response.json().catch(() => null)) as MetaInsightsResponse | null;

  if (!response.ok) {
    parseMetaError(data, "Meta ad insights could not be loaded.");
  }

  const allowedIds = new Set(params.adIds);

  return (data?.data ?? [])
    .filter((row) => row.ad_id && allowedIds.has(row.ad_id))
    .map((row, index) => {
      const normalized = normalizeMetaDeliveryInsight(row);

      return {
        adId: String(row.ad_id),
        adName: String(row.ad_name ?? `Ad ${index + 1}`),
        spend: Number(row.spend ?? 0),
        impressions: normalized.impressions,
        clicks: normalized.clicks,
        ctr: normalized.ctr,
        leads: extractLeadsFromActions(row.actions),
      } satisfies MetaAdInsight;
    });
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
