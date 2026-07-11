import "server-only";

import { ApiError } from "@/lib/api/route";
import { logError, logOperationalEvent } from "@/lib/logging";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { Json } from "@/lib/supabase/types";

type TrackingMode = "website_funnel" | "instant_form";
type TrackingDestination = "dealflow_dashboard" | "facebook_lead_center";
type TrackingContractStatus = "configured" | "needs_review" | "failed" | "disabled";
type LeadTrackingEventType =
  | "lead_captured"
  | "browser_pixel_attempted"
  | "capi_queued"
  | "capi_sent"
  | "capi_failed"
  | "crm_sync_status"
  | "notification_status"
  | "meta_reporting_checked"
  | "tracking_contract_created"
  | "tracking_contract_failed";
type LeadTrackingEventStatus = "recorded" | "sent" | "failed" | "skipped" | "seen" | "missing";

type TrackingReadinessInput = {
  trackingMode: TrackingMode;
  metaCampaignId?: string | null;
  metaAdsetId?: string | null;
  metaAdIds?: string[] | null;
  pixelId?: string | null;
  launchDomain?: string | null;
  launchUrl?: string | null;
  metaPageId?: string | null;
  accessTokenAvailable?: boolean | null;
};

type TrackingReadiness = {
  ready: boolean;
  status: TrackingContractStatus;
  missing: string[];
};

export type UpsertCampaignTrackingContractInput = TrackingReadinessInput & {
  organizationId: string;
  campaignId: string;
  userId?: string | null;
  expectedLeadDestination?: TrackingDestination | null;
  metadata?: Record<string, Json>;
};

export type RecordLeadTrackingEventInput = {
  organizationId: string;
  campaignId?: string | null;
  leadId?: string | null;
  eventType: LeadTrackingEventType;
  status?: LeadTrackingEventStatus;
  source?: string;
  eventId?: string | null;
  pixelId?: string | null;
  fbtraceId?: string | null;
  metaEventsReceived?: number | null;
  attribution?: Record<string, Json>;
  metadata?: Record<string, Json>;
};

function getAdminOrThrow() {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  return admin as any;
}

function cleanString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function cleanStringArray(values: string[] | null | undefined) {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
}

export function buildTrackingReadiness(input: TrackingReadinessInput): TrackingReadiness {
  const missing: string[] = [];
  const metaAdIds = cleanStringArray(input.metaAdIds);

  if (!cleanString(input.metaCampaignId)) {
    missing.push("meta_campaign_id");
  }

  if (!cleanString(input.metaAdsetId)) {
    missing.push("meta_adset_id");
  }

  if (metaAdIds.length === 0) {
    missing.push("meta_ad_ids");
  }

  if (input.trackingMode === "website_funnel") {
    if (!cleanString(input.pixelId)) {
      missing.push("pixel_id");
    }

    if (!cleanString(input.launchDomain)) {
      missing.push("launch_domain");
    }

    if (!cleanString(input.launchUrl)) {
      missing.push("launch_url");
    }

    if (input.accessTokenAvailable === false) {
      missing.push("meta_access_token");
    }
  }

  if (input.trackingMode === "instant_form" && !cleanString(input.metaPageId)) {
    missing.push("meta_page_id");
  }

  return {
    ready: missing.length === 0,
    status: missing.length === 0 ? "configured" : "needs_review",
    missing,
  };
}

export function getExpectedLeadDestination(trackingMode: TrackingMode): TrackingDestination {
  void trackingMode;
  return "dealflow_dashboard";
}

export async function upsertCampaignTrackingContract(input: UpsertCampaignTrackingContractInput) {
  const admin = getAdminOrThrow();
  const readiness = buildTrackingReadiness(input);
  const trackingMode = input.trackingMode;
  const expectedLeadDestination =
    input.expectedLeadDestination ?? getExpectedLeadDestination(trackingMode);
  const now = new Date().toISOString();
  const row = {
    organization_id: input.organizationId,
    campaign_id: input.campaignId,
    user_id: input.userId ?? null,
    tracking_mode: trackingMode,
    expected_lead_destination: expectedLeadDestination,
    meta_campaign_id: cleanString(input.metaCampaignId),
    meta_adset_id: cleanString(input.metaAdsetId),
    meta_ad_ids: cleanStringArray(input.metaAdIds),
    meta_page_id: cleanString(input.metaPageId),
    pixel_id: cleanString(input.pixelId),
    launch_domain: cleanString(input.launchDomain),
    launch_url: cleanString(input.launchUrl),
    expected_event_name: "Lead",
    expected_action_source: trackingMode === "instant_form" ? "system_generated" : "website",
    expected_attribution_params:
      trackingMode === "website_funnel"
        ? ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid"]
        : [],
    status: readiness.status,
    readiness: {
      ready: readiness.ready,
      missing: readiness.missing,
      checked_at: now,
    },
    metadata: input.metadata ?? {},
    last_verified_at: readiness.ready ? now : null,
    updated_at: now,
  };

  const { data, error } = await admin
    .from("campaign_tracking_contracts")
    .upsert(row, { onConflict: "campaign_id" })
    .select("*")
    .single();

  if (error) {
    throw new ApiError(500, error.message, "tracking_contract_upsert_failed");
  }

  await recordLeadTrackingEvent({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    eventType: readiness.ready ? "tracking_contract_created" : "tracking_contract_failed",
    status: readiness.ready ? "recorded" : "failed",
    source: "tracking_contract",
    pixelId: cleanString(input.pixelId),
    metadata: {
      trackingMode,
      expectedLeadDestination,
      missing: readiness.missing as unknown as Json,
    },
  }).catch(() => null);

  return data;
}

export async function recordLeadTrackingEvent(input: RecordLeadTrackingEventInput) {
  const admin = createAdminClient() as any;

  if (!admin) {
    logOperationalEvent("lead_tracking.event_skipped", {
      reason: "service_role_missing",
      eventType: input.eventType,
      leadId: input.leadId ?? null,
      campaignId: input.campaignId ?? null,
      organizationId: input.organizationId,
    });
    return null;
  }

  const { data, error } = await admin
    .from("lead_tracking_events")
    .insert({
      organization_id: input.organizationId,
      campaign_id: input.campaignId ?? null,
      lead_id: input.leadId ?? null,
      event_type: input.eventType,
      status: input.status ?? "recorded",
      source: input.source ?? "dealflow",
      event_id: input.eventId ?? null,
      pixel_id: input.pixelId ?? null,
      fbtrace_id: input.fbtraceId ?? null,
      meta_events_received: input.metaEventsReceived ?? null,
      attribution: input.attribution ?? {},
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) {
    logError("lead_tracking.event_write_failed", {
      eventType: input.eventType,
      leadId: input.leadId ?? null,
      campaignId: input.campaignId ?? null,
      organizationId: input.organizationId,
      message: error.message,
    });
    return null;
  }

  return data as { id: string };
}

export async function getCampaignTrackingHealth(campaignId: string) {
  const admin = getAdminOrThrow();

  const [{ data: contract, error: contractError }, { data: events, error: eventsError }] =
    await Promise.all([
      admin
        .from("campaign_tracking_contracts")
        .select("*")
        .eq("campaign_id", campaignId)
        .maybeSingle(),
      admin
        .from("lead_tracking_events")
        .select("event_type,status,lead_id,fbtrace_id,meta_events_received,created_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(250),
    ]);

  if (contractError || eventsError) {
    throw new ApiError(
      500,
      contractError?.message ?? eventsError?.message ?? "Tracking health lookup failed.",
      "tracking_health_lookup_failed",
    );
  }

  const rows = Array.isArray(events) ? events : [];
  const count = (eventType: LeadTrackingEventType, status?: LeadTrackingEventStatus) =>
    rows.filter((row: any) => row.event_type === eventType && (!status || row.status === status)).length;

  return {
    contract,
    checkedAt: new Date().toISOString(),
    totals: {
      leadsCaptured: count("lead_captured"),
      browserPixelAttempts: count("browser_pixel_attempted"),
      capiQueued: count("capi_queued"),
      capiSent: count("capi_sent", "sent"),
      capiFailed: count("capi_failed", "failed"),
      metaReportingSeen: count("meta_reporting_checked", "seen"),
      metaReportingMissing: count("meta_reporting_checked", "missing"),
    },
    latestEvents: rows.slice(0, 25),
  };
}
