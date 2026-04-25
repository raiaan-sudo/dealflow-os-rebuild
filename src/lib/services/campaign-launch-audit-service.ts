import { ApiError } from "@/lib/api/route";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/services/app-context";
import type { Json } from "@/lib/supabase/types";

export type CampaignLaunchEvent = {
  id: string;
  label: string;
  status: "success" | "failed";
  target: string;
  detail: string;
  timestamp: string;
};

export type CampaignLaunchRecord = {
  id: string;
  campaignName: string;
  accountName: string | null;
  launchMode: string;
  resultStatus: string;
  metaCampaignId: string | null;
  metaAdSetIds: string[];
  metaAdIds: string[];
  executionMetadata: Record<string, unknown>;
  eventTimeline: CampaignLaunchEvent[];
  createdAt: string;
};

function mapLaunchRecord(row: Record<string, unknown> | null): CampaignLaunchRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    campaignName: String(row.campaign_name ?? ""),
    accountName: typeof row.account_name === "string" ? row.account_name : null,
    launchMode: String(row.launch_mode ?? ""),
    resultStatus: String(row.result_status ?? ""),
    metaCampaignId:
      typeof row.meta_campaign_id === "string" ? row.meta_campaign_id : null,
    metaAdSetIds: Array.isArray(row.meta_ad_set_ids)
      ? row.meta_ad_set_ids.map(String)
      : [],
    metaAdIds: Array.isArray(row.meta_ad_ids) ? row.meta_ad_ids.map(String) : [],
    executionMetadata:
      row.execution_metadata && typeof row.execution_metadata === "object"
        ? (row.execution_metadata as Record<string, unknown>)
        : {},
    eventTimeline: Array.isArray(row.event_timeline)
      ? row.event_timeline.map((item, index) => {
          const event = item as Record<string, unknown>;
          return {
            id: String(event.id ?? `event-${index}`),
            label: String(event.label ?? "Event"),
            status: event.status === "failed" ? "failed" : "success",
            target: String(event.target ?? ""),
            detail: String(event.detail ?? ""),
            timestamp: String(event.timestamp ?? row.created_at ?? new Date().toISOString()),
          };
        })
      : [],
    createdAt: String(row.created_at),
  };
}

async function getCampaignLaunchContext() {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for this route.", "unauthorized");
  }

  return {
    context,
    supabase,
  };
}

export async function getLatestCampaignLaunchRecord() {
  const { context, supabase } = await getCampaignLaunchContext();
  const { data } = await supabase
    .from("campaign_launch_records")
    .select("*")
    .eq("organization_id", context.organization.id)
    .eq("user_id", context.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return mapLaunchRecord((data as Record<string, unknown> | null) ?? null);
}

export async function getCampaignLaunchRecordForCampaign(params: {
  campaignName: string;
  metaCampaignId?: string | null;
}) {
  const { context, supabase } = await getCampaignLaunchContext();

  const buildQuery = () =>
    supabase
      .from("campaign_launch_records")
      .select("*")
      .eq("organization_id", context.organization.id)
      .eq("user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(1);

  if (params.metaCampaignId) {
    const { data } = await buildQuery().eq("meta_campaign_id", params.metaCampaignId).maybeSingle();
    return mapLaunchRecord((data as Record<string, unknown> | null) ?? null);
  }

  const { data } = await buildQuery().eq("campaign_name", params.campaignName).maybeSingle();
  return mapLaunchRecord((data as Record<string, unknown> | null) ?? null);
}

export async function recordCampaignLaunch(params: {
  campaignName: string;
  accountName: string | null;
  launchMode: string;
  resultStatus: string;
  metaCampaignId: string | null;
  metaAdSetIds: string[];
  metaAdIds: string[];
  executionMetadata: Record<string, unknown>;
  eventTimeline: CampaignLaunchEvent[];
}) {
  const { context, supabase } = await getCampaignLaunchContext();

  const { error } = await supabase.from("campaign_launch_records").insert({
    organization_id: context.organization.id,
    user_id: context.user.id,
    campaign_name: params.campaignName,
    account_name: params.accountName,
    launch_mode: params.launchMode,
    result_status: params.resultStatus,
    meta_campaign_id: params.metaCampaignId,
    meta_ad_set_ids: params.metaAdSetIds as unknown as Json,
    meta_ad_ids: params.metaAdIds as unknown as Json,
    execution_metadata: params.executionMetadata as unknown as Json,
    event_timeline: params.eventTimeline as unknown as Json,
  } as never);

  if (error) {
    throw new ApiError(500, error.message, "campaign_launch_record_insert_failed");
  }
}
