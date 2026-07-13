import "server-only";

import { createHash } from "crypto";
import { getMetaEnv } from "@/lib/env";
import { decryptSecret } from "@/lib/integrations/meta-crypto";
import {
  buildMetaGraphUrl,
  isMetaCapiWriteAllowed,
  withMetaBearerToken,
} from "@/lib/integrations/meta/contract";
import { fetchMetaResponse } from "@/lib/integrations/meta/request";
import { logError, logOperationalEvent } from "@/lib/logging";
import { normalizePhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { recordLeadTrackingEvent } from "@/lib/services/lead-tracking-service";
import {
  hasValidMetaCapiConsent,
  type MetaCapiConsentEvidence,
} from "@/lib/services/lead-effect-aggregation-service";
import type { Json } from "@/lib/supabase/types";
import { resolveLaunchAuthorizedMetaPixel } from "@/lib/integrations/meta/tracking-attribution";

type MetaConnectionRow = {
  id: string;
  status: string | null;
  pixel_id: string | null;
  access_token_encrypted: string | null;
  connection_metadata: Json | null;
};

type MetaCampaignTrackingContractRow = {
  organization_id: string;
  campaign_id: string;
  tracking_mode: string | null;
  status: string | null;
  pixel_id: string | null;
};

type MetaLeadConversionParams = {
  organizationId: string;
  leadId: string;
  campaignId?: string | null;
  eventSourceUrl?: string | null;
  eventTime?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  clientIp?: string | null;
  clientUserAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  advertisingConsent?: MetaCapiConsentEvidence | null;
};

function getMetadataString(
  metadata: Json | null | undefined,
  key: string,
): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeForHash(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeNameParts(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0]?.toLowerCase() ?? null,
    lastName: parts.slice(1).join(" ").toLowerCase() || null,
  };
}

function getCookieValue(cookieHeader: string | null | undefined, key: string) {
  if (!cookieHeader) {
    return null;
  }

  const prefix = `${key}=`;
  const segment = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!segment) {
    return null;
  }

  return decodeURIComponent(segment.slice(prefix.length));
}

async function getMetaConnectionRow(organizationId: string) {
  const admin = createAdminClient();

  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from("marketing_accounts")
    .select("id, status, pixel_id, access_token_encrypted, connection_metadata")
    .eq("organization_id", organizationId)
    .eq("platform", "meta_ads")
    .eq("status", "connected")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as MetaConnectionRow | null) ?? null;
}

async function getMetaCampaignTrackingContract(
  organizationId: string,
  campaignId: string,
) {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("campaign_tracking_contracts")
    .select("organization_id,campaign_id,tracking_mode,status,pixel_id")
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw error;
  return (data as MetaCampaignTrackingContractRow | null) ?? null;
}

function getWorkspacePixelId(row: MetaConnectionRow | null) {
  return row?.pixel_id?.trim() || getMetadataString(row?.connection_metadata, "pixel_id");
}

export async function getMetaPixelIdForCampaign(params: {
  organizationId: string | null | undefined;
  campaignId: string | null | undefined;
}) {
  if (!params.organizationId || !params.campaignId) return null;
  const [row, contract] = await Promise.all([
    getMetaConnectionRow(params.organizationId),
    getMetaCampaignTrackingContract(params.organizationId, params.campaignId),
  ]);
  const authority = resolveLaunchAuthorizedMetaPixel({
    connectionStatus: row?.status,
    currentPixelId: getWorkspacePixelId(row),
    contractPixelId: contract?.pixel_id,
    contractStatus: contract?.status,
    trackingMode: contract?.tracking_mode,
  });
  return authority.allowed ? authority.pixelId : null;
}

export function getMetaCookiesFromHeader(cookieHeader: string | null | undefined) {
  return {
    fbp: getCookieValue(cookieHeader, "_fbp"),
    fbc: getCookieValue(cookieHeader, "_fbc"),
  };
}

export async function safeSendMetaLeadConversion(params: MetaLeadConversionParams) {
  try {
    const recordSkippedConversion = (reason: string, pixelId?: string | null) =>
      recordLeadTrackingEvent({
        organizationId: params.organizationId,
        campaignId: params.campaignId ?? null,
        leadId: params.leadId,
        eventType: "capi_failed",
        status: "skipped",
        source: "meta_conversions_api",
        eventId: params.leadId,
        pixelId: pixelId ?? null,
        attribution: {
          event_source_url: params.eventSourceUrl ?? null,
          has_fbp: Boolean(params.fbp),
          has_fbc: Boolean(params.fbc),
        },
        metadata: {
          reason,
        },
      }).catch(() => null);
    if (!hasValidMetaCapiConsent(params.advertisingConsent)) {
      await recordSkippedConversion("meta_capi_consent_missing");
      return { sent: false, reason: "meta_capi_consent_missing" } as const;
    }

    const [row, trackingContract] = await Promise.all([
      getMetaConnectionRow(params.organizationId),
      params.campaignId
        ? getMetaCampaignTrackingContract(params.organizationId, params.campaignId)
        : Promise.resolve(null),
    ]);

    if (!row) {
      await recordSkippedConversion("meta_connection_missing");
      return { sent: false, reason: "meta_connection_missing" } as const;
    }

    const pixelAuthority = resolveLaunchAuthorizedMetaPixel({
      connectionStatus: row.status,
      currentPixelId: getWorkspacePixelId(row),
      contractPixelId: trackingContract?.pixel_id,
      contractStatus: trackingContract?.status,
      trackingMode: trackingContract?.tracking_mode,
    });
    if (!pixelAuthority.allowed) {
      await recordSkippedConversion(pixelAuthority.reason);
      return { sent: false, reason: pixelAuthority.reason } as const;
    }
    const pixelId = pixelAuthority.pixelId;

    if (!isMetaCapiWriteAllowed()) {
      await recordSkippedConversion("meta_capi_events_disabled", pixelId);
      return { sent: false, reason: "meta_capi_events_disabled" } as const;
    }

    if (!row.access_token_encrypted) {
      await recordSkippedConversion("meta_access_token_missing", pixelId);
      return { sent: false, reason: "meta_access_token_missing" } as const;
    }

    const env = getMetaEnv();

    if (!env?.encryptionKey) {
      await recordSkippedConversion("meta_env_missing", pixelId);
      return { sent: false, reason: "meta_env_missing" } as const;
    }

    const accessToken = decryptSecret(row.access_token_encrypted, env.encryptionKey);
    const { firstName, lastName } = normalizeNameParts(params.name);
    const normalizedEmail = normalizeForHash(params.email);
    const normalizedPhone = normalizePhone(params.phone ?? null)?.replace(/^\+/, "") ?? null;

    const userData: Record<string, unknown> = {};

    if (normalizedEmail) {
      userData.em = [sha256(normalizedEmail)];
    }

    if (normalizedPhone) {
      userData.ph = [sha256(normalizedPhone)];
    }

    if (firstName) {
      userData.fn = [sha256(firstName)];
    }

    if (lastName) {
      userData.ln = [sha256(lastName)];
    }

    userData.external_id = [sha256(params.leadId)];

    if (params.clientIp) {
      userData.client_ip_address = params.clientIp;
    }

    if (params.clientUserAgent) {
      userData.client_user_agent = params.clientUserAgent;
    }

    if (params.fbp) {
      userData.fbp = params.fbp;
    }

    if (params.fbc) {
      userData.fbc = params.fbc;
    }

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: "Lead",
          event_time: Math.floor(
            new Date(params.eventTime ?? new Date().toISOString()).getTime() / 1000,
          ),
          event_id: params.leadId,
          action_source: "website",
          event_source_url: params.eventSourceUrl ?? null,
          user_data: userData,
          custom_data: {
            content_name: params.campaignId ?? "dealflow_public_funnel",
            campaign_id: params.campaignId ?? null,
            lead_id: params.leadId,
          },
        },
      ],
    };

    if (process.env.META_TEST_EVENT_CODE?.trim()) {
      payload.test_event_code = process.env.META_TEST_EVENT_CODE.trim();
    }

    const response = await fetchMetaResponse(
      buildMetaGraphUrl(`${encodeURIComponent(pixelId)}/events`),
      {
        purpose: "conversion",
        method: "POST",
        ...withMetaBearerToken(accessToken, {
          headers: {
            "Content-Type": "application/json",
          },
        }),
        body: JSON.stringify(payload),
      },
    );

    const responseBody = (await response.json().catch(() => null)) as
      | { events_received?: number; fbtrace_id?: string; error?: { message?: string } }
      | null;

    if (!response.ok || responseBody?.error?.message) {
      throw new Error(
        responseBody?.error?.message || `Meta Conversions API request failed with ${response.status}.`,
      );
    }

    logOperationalEvent("meta_conversion.lead_sent", {
      organizationId: params.organizationId,
      leadId: params.leadId,
      campaignId: params.campaignId ?? null,
      pixelId,
      eventsReceived: responseBody?.events_received ?? null,
      fbTraceId: responseBody?.fbtrace_id ?? null,
    });

    await recordLeadTrackingEvent({
      organizationId: params.organizationId,
      campaignId: params.campaignId ?? null,
      leadId: params.leadId,
      eventType: "capi_sent",
      status: "sent",
      source: "meta_conversions_api",
      eventId: params.leadId,
      pixelId,
      fbtraceId: responseBody?.fbtrace_id ?? null,
      metaEventsReceived: responseBody?.events_received ?? null,
      attribution: {
        event_source_url: params.eventSourceUrl ?? null,
        has_fbp: Boolean(params.fbp),
        has_fbc: Boolean(params.fbc),
      },
      metadata: {
        action_source: "website",
        event_name: "Lead",
      },
    }).catch(() => null);

    return {
      sent: true,
      pixelId,
      eventsReceived: responseBody?.events_received ?? null,
      fbTraceId: responseBody?.fbtrace_id ?? null,
    } as const;
  } catch (error) {
    logError("Meta lead conversion failed", {
      organizationId: params.organizationId,
      leadId: params.leadId,
      campaignId: params.campaignId ?? null,
      message: error instanceof Error ? error.message : "Unknown Meta lead conversion failure",
    });

    await recordLeadTrackingEvent({
      organizationId: params.organizationId,
      campaignId: params.campaignId ?? null,
      leadId: params.leadId,
      eventType: "capi_failed",
      status: "failed",
      source: "meta_conversions_api",
      eventId: params.leadId,
      attribution: {
        event_source_url: params.eventSourceUrl ?? null,
        has_fbp: Boolean(params.fbp),
        has_fbc: Boolean(params.fbc),
      },
      metadata: {
        reason: "meta_conversion_failed",
        message: error instanceof Error ? error.message : "Unknown Meta lead conversion failure",
      },
    }).catch(() => null);

    return { sent: false, reason: "meta_conversion_failed" } as const;
  }
}
