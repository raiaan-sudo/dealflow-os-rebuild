import { ApiError } from "@/lib/api/route";
import { fetchWithRetryServer } from "@/lib/http/fetch-with-retry-server";
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
    actions?: Array<{
      action_type?: string;
      value?: string;
    }>;
  }>;
  error?: { message?: string; code?: number; error_subcode?: number };
};

const LEAD_ACTION_TYPES = [
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "offsite_conversion.custom",
  "omni_lead",
] as const;

function extractLeadsFromActions(
  actions: Array<{ action_type?: string; value?: string }> | undefined,
) {
  if (!actions?.length) {
    return 0;
  }

  return actions.reduce((sum, action) => {
    if (!action.action_type || !LEAD_ACTION_TYPES.includes(action.action_type as (typeof LEAD_ACTION_TYPES)[number])) {
      return sum;
    }

    return sum + Number(action.value ?? 0);
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

async function fetchMetaObject(params: {
  objectId: string;
  accessToken: string;
}): Promise<MetaObjectResponse> {
  const url = new URL(`https://graph.facebook.com/v19.0/${params.objectId}`);
  url.searchParams.set("fields", "id,name,status,effective_status");
  url.searchParams.set("access_token", params.accessToken);

  const response = await fetchWithRetryServer(url.toString(), { cache: "no-store" });
  const data = (await response.json().catch(() => null)) as MetaObjectResponse | null;

  if (!response.ok || !data?.id) {
    parseMetaError(data, "Meta object status could not be loaded.");
  }

  return data as MetaObjectResponse;
}

function toEntityStatus(data: MetaObjectResponse, fallbackName: string): MetaEntityStatus {
  return {
    id: String(data.id ?? ""),
    name: typeof data.name === "string" && data.name.length > 0 ? data.name : fallbackName,
    status:
      typeof data.effective_status === "string" && data.effective_status.length > 0
        ? data.effective_status
        : typeof data.status === "string" && data.status.length > 0
          ? data.status
          : "UNKNOWN",
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
}) {
  const url = new URL(`https://graph.facebook.com/v19.0/${params.campaignId}/insights`);
  url.searchParams.set("fields", "spend,impressions,clicks,actions");
  url.searchParams.set("date_preset", "maximum");
  url.searchParams.set("limit", "1");
  url.searchParams.set("access_token", params.accessToken ?? "");

  const response = await fetchWithRetryServer(url.toString(), { cache: "no-store" });
  const data = (await response.json().catch(() => null)) as MetaInsightsResponse | null;

  if (!response.ok) {
    parseMetaError(data, "Meta delivery metrics could not be loaded.");
  }

  const insight = data?.data?.[0];

  return {
    spend: Number(insight?.spend ?? 0),
    impressions: Number(insight?.impressions ?? 0),
    clicks: Number(insight?.clicks ?? 0),
    ctr:
      insight?.ctr !== undefined
        ? Number(insight.ctr)
        : Number(insight?.clicks ?? 0) / Math.max(Number(insight?.impressions ?? 0), 1),
    leads: extractLeadsFromActions(insight?.actions),
  } satisfies MetaDeliveryMetrics;
}

export async function fetchAdInsights(params: {
  campaignId: string;
  accessToken: string | null;
  mode: MetaSyncMode;
  adIds: string[];
}) {
  const url = new URL(`https://graph.facebook.com/v19.0/${params.campaignId}/insights`);
  url.searchParams.set("fields", "ad_id,ad_name,spend,impressions,clicks,ctr,actions");
  url.searchParams.set("level", "ad");
  url.searchParams.set("date_preset", "maximum");
  url.searchParams.set("limit", String(Math.max(params.adIds.length, 25)));
  url.searchParams.set("access_token", params.accessToken ?? "");

  const response = await fetchWithRetryServer(url.toString(), { cache: "no-store" });
  const data = (await response.json().catch(() => null)) as MetaInsightsResponse | null;

  if (!response.ok) {
    parseMetaError(data, "Meta ad insights could not be loaded.");
  }

  const allowedIds = new Set(params.adIds);

  return (data?.data ?? [])
    .filter((row) => row.ad_id && allowedIds.has(row.ad_id))
    .map((row, index) => {
      const impressions = Number(row.impressions ?? 0);
      const clicks = Number(row.clicks ?? 0);

      return {
        adId: String(row.ad_id),
        adName: String(row.ad_name ?? `Ad ${index + 1}`),
        spend: Number(row.spend ?? 0),
        impressions,
        clicks,
        ctr: row.ctr !== undefined ? Number(row.ctr) / 100 : clicks / Math.max(impressions, 1),
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
