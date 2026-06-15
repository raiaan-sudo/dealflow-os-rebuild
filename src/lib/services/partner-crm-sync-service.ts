import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import { GoHighLevelClient, getGhlPrivateTokenFromCredentialRef } from "@/lib/integrations/gohighlevel/client";
import { logError, logOperationalEvent } from "@/lib/logging";
import { getWhiteLabelPartnerById } from "@/lib/partners/partner-config";
import { normalizePhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export type CrmSyncLeadRecord = {
  id: string;
  organization_id?: string | null;
  tenant_id?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_raw?: string | null;
  phone_e164?: string | null;
  source?: string | null;
  lead_type?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  ad_id?: string | null;
  landing_page_url?: string | null;
  created_at?: string | null;
};

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type WorkspaceGhlConfig = {
  partnerId: string;
  locationId: string;
  pipelineId: string | null;
  stageId: string | null;
  credentialRef: string;
  source: string;
  tags: string[];
};

type PartnerTableResponse = Promise<{ data: unknown; error: { message: string } | null }>;

type PartnerTableBuilder = {
  select: (...args: unknown[]) => PartnerTableBuilder;
  eq: (...args: unknown[]) => PartnerTableBuilder;
  maybeSingle: () => PartnerTableResponse;
  insert: (value: unknown) => PartnerTableBuilder;
  update: (value: unknown) => PartnerTableBuilder;
  then: PartnerTableResponse["then"];
};

type NewPartnerTableClient = {
  from: (table: string) => PartnerTableBuilder;
};

function getAdminClientOrThrow() {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  return supabase as AdminClient;
}

function newPartnerTables(supabase: AdminClient) {
  return supabase as unknown as NewPartnerTableClient;
}

function splitName(lead: CrmSyncLeadRecord) {
  const firstName = lead.first_name?.trim();
  const lastName = lead.last_name?.trim();

  if (firstName || lastName) {
    return {
      firstName: firstName || "Lead",
      lastName: lastName || "Contact",
      fullName: [firstName, lastName].filter(Boolean).join(" ") || "Lead Contact",
    };
  }

  const parts = (lead.name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "Lead",
    lastName: parts.slice(1).join(" ") || "Contact",
    fullName: parts.join(" ") || "Lead Contact",
  };
}

function compactTags(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
  );
}

function toCustomFieldValue(value: string | null | undefined) {
  return value?.trim() || "";
}

export function buildPartnerCrmSyncIdempotencyKey(params: {
  partnerId: string;
  workspaceId: string;
  leadId: string;
}) {
  return createHash("sha256")
    .update([params.partnerId, params.workspaceId, params.leadId, "gohighlevel"].join("|"))
    .digest("hex");
}

export function buildGhlContactPayload(params: {
  lead: CrmSyncLeadRecord;
  config: WorkspaceGhlConfig;
}) {
  const name = splitName(params.lead);
  const phone = normalizePhone(params.lead.phone_e164 || params.lead.phone_raw || params.lead.phone || null);
  const email = params.lead.email?.trim().toLowerCase() || undefined;
  const campaignName = params.lead.campaign_name?.trim() || "DealFlow campaign";
  const source = params.config.source || "DealFlow / Click to Scale";

  return {
    locationId: params.config.locationId,
    firstName: name.firstName,
    lastName: name.lastName,
    name: name.fullName,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    source,
    tags: compactTags([
      ...params.config.tags,
      params.lead.lead_type,
      params.lead.utm_source,
      params.lead.utm_campaign,
      campaignName,
    ]),
    customFields: [
      { key: "dealflow_lead_id", field_value: params.lead.id },
      { key: "dealflow_workspace_id", field_value: params.lead.organization_id ?? params.lead.tenant_id ?? "" },
      { key: "dealflow_partner", field_value: params.config.partnerId },
      { key: "dealflow_campaign_id", field_value: toCustomFieldValue(params.lead.campaign_id) },
      { key: "dealflow_campaign_name", field_value: campaignName },
      { key: "dealflow_lead_source", field_value: toCustomFieldValue(params.lead.source) },
      { key: "dealflow_lead_type", field_value: toCustomFieldValue(params.lead.lead_type) },
      { key: "dealflow_landing_page_url", field_value: toCustomFieldValue(params.lead.landing_page_url) },
      { key: "dealflow_meta_ad_id", field_value: toCustomFieldValue(params.lead.ad_id) },
      { key: "dealflow_received_at", field_value: toCustomFieldValue(params.lead.created_at) },
    ],
  };
}

async function readWorkspaceGhlConfig(params: {
  supabase: AdminClient;
  workspaceId: string;
}) {
  const db = newPartnerTables(params.supabase);
  const { data: mappingRaw, error: mappingError } = await db
    .from("workspace_ghl_mapping")
    .select("partner_id, ghl_location_id, ghl_pipeline_id, ghl_stage_id, sync_enabled")
    .eq("workspace_id", params.workspaceId)
    .eq("sync_enabled", true)
    .maybeSingle();

  if (mappingError) {
    throw new ApiError(500, mappingError.message, "ghl_mapping_fetch_failed");
  }

  const mapping = mappingRaw as {
    partner_id: string;
    ghl_location_id: string | null;
    ghl_pipeline_id: string | null;
    ghl_stage_id: string | null;
  } | null;

  if (!mapping) {
    return null;
  }

  const { data: partnerConfigRaw, error: partnerError } = await db
    .from("partner_ghl_config")
    .select("partner_id, enabled, encrypted_credential_ref, default_location_id, default_pipeline_id, default_stage_id, default_tags, default_source")
    .eq("partner_id", mapping.partner_id)
    .maybeSingle();

  if (partnerError) {
    throw new ApiError(500, partnerError.message, "ghl_partner_config_fetch_failed");
  }

  const partnerConfig = partnerConfigRaw as {
    partner_id: string;
    enabled: boolean;
    encrypted_credential_ref: string;
    default_location_id: string | null;
    default_pipeline_id: string | null;
    default_stage_id: string | null;
    default_tags: unknown;
    default_source: string | null;
  } | null;

  if (!partnerConfig?.enabled) {
    return null;
  }

  const locationId = mapping.ghl_location_id || partnerConfig.default_location_id;
  if (!locationId) {
    throw new ApiError(422, "Click to Scale GHL location mapping is missing.", "missing_location_mapping");
  }

  const partner = getWhiteLabelPartnerById(mapping.partner_id);
  const tags = Array.isArray(partnerConfig.default_tags)
    ? partnerConfig.default_tags.filter((value: unknown): value is string => typeof value === "string")
    : partner?.ghl.defaultTags ?? [];

  return {
    partnerId: mapping.partner_id,
    locationId,
    pipelineId: mapping.ghl_pipeline_id || partnerConfig.default_pipeline_id || null,
    stageId: mapping.ghl_stage_id || partnerConfig.default_stage_id || null,
    credentialRef: partnerConfig.encrypted_credential_ref,
    source: partnerConfig.default_source || "DealFlow / Click to Scale",
    tags,
  } satisfies WorkspaceGhlConfig;
}

async function upsertSyncEvent(params: {
  supabase: AdminClient;
  lead: CrmSyncLeadRecord;
  workspaceId: string;
  partnerId: string;
  locationId: string | null;
  status: "processing" | "skipped";
  idempotencyKey: string;
  metadata?: Json;
}) {
  const db = newPartnerTables(params.supabase);
  const { data: existingRaw, error: existingError } = await db
    .from("lead_crm_sync_events")
    .select("id, status, attempt_count, ghl_contact_id, ghl_opportunity_id")
    .eq("idempotency_key", params.idempotencyKey)
    .maybeSingle();

  if (existingError) {
    throw new ApiError(500, existingError.message, "lead_crm_sync_event_fetch_failed");
  }

  const existing = existingRaw as {
    id: string;
    status: string;
    attempt_count: number;
    ghl_contact_id?: string | null;
    ghl_opportunity_id?: string | null;
  } | null;

  if (existing?.status === "synced") {
    return existing as {
      id: string;
      status: string;
      attempt_count: number;
      ghl_contact_id?: string | null;
      ghl_opportunity_id?: string | null;
    };
  }

  if (existing?.id) {
    const { data, error } = await db
      .from("lead_crm_sync_events")
      .update({
        status: params.status,
        attempt_count: Number(existing.attempt_count ?? 0) + 1,
        last_error_code: null,
        last_error_message: null,
        next_retry_at: null,
        metadata: params.metadata ?? {},
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id, status, attempt_count, ghl_contact_id, ghl_opportunity_id")
      .maybeSingle();

    if (error) {
      throw new ApiError(500, error.message, "lead_crm_sync_event_update_failed");
    }

    return data as {
      id: string;
      status: string;
      attempt_count: number;
      ghl_contact_id?: string | null;
      ghl_opportunity_id?: string | null;
    } | null;
  }

  const { data, error } = await db
    .from("lead_crm_sync_events")
    .insert({
      lead_id: params.lead.id,
      workspace_id: params.workspaceId,
      partner_id: params.partnerId,
      destination: "gohighlevel",
      ghl_location_id: params.locationId,
      status: params.status,
      idempotency_key: params.idempotencyKey,
      attempt_count: 1,
      last_error_code: null,
      last_error_message: null,
      next_retry_at: null,
      metadata: params.metadata ?? {},
      updated_at: new Date().toISOString(),
    })
    .select("id, status, attempt_count, ghl_contact_id, ghl_opportunity_id")
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "lead_crm_sync_event_upsert_failed");
  }

  return data as {
    id: string;
    status: string;
    attempt_count: number;
    ghl_contact_id?: string | null;
    ghl_opportunity_id?: string | null;
  } | null;
}

async function markSyncEvent(params: {
  supabase: AdminClient;
  eventId: string;
  status: "synced" | "failed" | "dead_letter" | "skipped";
  contactId?: string | null;
  opportunityId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  nextRetryAt?: string | null;
  metadata?: Json;
}) {
  const db = newPartnerTables(params.supabase);
  const { error } = await db
    .from("lead_crm_sync_events")
    .update({
      status: params.status,
      ghl_contact_id: params.contactId ?? null,
      ghl_opportunity_id: params.opportunityId ?? null,
      last_error_code: params.errorCode ?? null,
      last_error_message: params.errorMessage ?? null,
      next_retry_at: params.nextRetryAt ?? null,
      metadata: params.metadata ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.eventId);

  if (error) {
    throw new ApiError(500, error.message, "lead_crm_sync_event_update_failed");
  }
}

export async function syncLeadToPartnerCrm(lead: CrmSyncLeadRecord) {
  const workspaceId = lead.organization_id ?? lead.tenant_id ?? null;

  if (!workspaceId || !lead.id) {
    return { synced: false, skipped: true, reason: "missing_workspace_or_lead" };
  }

  const supabase = getAdminClientOrThrow();
  const config = await readWorkspaceGhlConfig({ supabase, workspaceId });

  if (!config) {
    return { synced: false, skipped: true, reason: "crm_not_configured" };
  }

  const idempotencyKey = buildPartnerCrmSyncIdempotencyKey({
    partnerId: config.partnerId,
    workspaceId,
    leadId: lead.id,
  });
  const event = await upsertSyncEvent({
    supabase,
    lead,
    workspaceId,
    partnerId: config.partnerId,
    locationId: config.locationId,
    status: "processing",
    idempotencyKey,
    metadata: { campaign_id: lead.campaign_id ?? null, source: lead.source ?? null },
  });

  if (!event?.id) {
    throw new ApiError(500, "Lead CRM sync event could not be created.", "lead_crm_sync_event_missing");
  }

  if (event.status === "synced") {
    return {
      synced: true,
      skipped: true,
      reason: "already_synced",
      eventId: event.id,
      contactId: event.ghl_contact_id ?? null,
      opportunityId: event.ghl_opportunity_id ?? null,
    };
  }

  const token = getGhlPrivateTokenFromCredentialRef(config.credentialRef);
  if (!token) {
    await markSyncEvent({
      supabase,
      eventId: event.id,
      status: "failed",
      errorCode: "ghl_auth_missing",
      errorMessage: "GoHighLevel credential reference is configured but the server token is missing.",
    });
    return { synced: false, skipped: false, reason: "ghl_auth_missing", eventId: event.id };
  }

  const client = new GoHighLevelClient({ token });
  const contactPayload = buildGhlContactPayload({ lead, config });

  try {
    const contactId = await client.upsertContact(contactPayload);
    let opportunityId: string | null = null;

    if (config.pipelineId && config.stageId) {
      opportunityId = await client.createOpportunity({
        locationId: config.locationId,
        pipelineId: config.pipelineId,
        stageId: config.stageId,
        contactId,
        name: `${contactPayload.name} - ${lead.campaign_name || "DealFlow campaign"}`,
        source: config.source,
      });
    }

    await markSyncEvent({
      supabase,
      eventId: event.id,
      status: "synced",
      contactId,
      opportunityId,
      metadata: {
        idempotency_key: idempotencyKey,
        pipeline_configured: Boolean(config.pipelineId && config.stageId),
      },
    });

    logOperationalEvent("partner_crm_sync.synced", {
      leadId: lead.id,
      workspaceId,
      partnerId: config.partnerId,
      eventId: event.id,
      hasOpportunity: Boolean(opportunityId),
    });

    return { synced: true, skipped: false, eventId: event.id, contactId, opportunityId };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "unknown_error";
    const message = error instanceof Error ? error.message : "Unknown GHL sync failure.";
    const retryable = code === "ghl_rate_limited" || code === "ghl_unavailable";
    const nextRetryAt = retryable ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null;
    await markSyncEvent({
      supabase,
      eventId: event.id,
      status: retryable ? "failed" : "dead_letter",
      errorCode: code,
      errorMessage: message,
      nextRetryAt,
    });
    throw error;
  }
}

export async function safeSyncLeadToPartnerCrm(lead: CrmSyncLeadRecord) {
  try {
    return await syncLeadToPartnerCrm(lead);
  } catch (error) {
    logError("partner_crm_sync_failed", {
      leadId: lead.id,
      workspaceId: lead.organization_id ?? lead.tenant_id ?? null,
      code: error instanceof ApiError ? error.code : "unknown_error",
      message: error instanceof Error ? error.message : "Unknown GHL sync failure.",
    });
    return { synced: false, skipped: false, reason: "crm_sync_exception" };
  }
}
