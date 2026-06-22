import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import { isGhlContactWritesEnabled, isGhlOpportunityWritesEnabled, isGhlWorkflowEnrollmentEnabled } from "@/lib/env";
import {
  getGhlPrivateTokenFromCredentialRef,
  GoHighLevelClient,
  type GhlContactPayload,
  type GhlOpportunityPayload,
} from "@/lib/integrations/gohighlevel/client";
import { logError, logOperationalEvent } from "@/lib/logging";
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

export type WorkspaceGhlConfig = {
  partnerId: string;
  workspaceId: string;
  locationId: string;
  pipelineId: string | null;
  stageId: string | null;
  credentialRef: string;
  source: string;
  tags: string[];
  partnerResolutionSource: "input" | "organization" | "workspace_mapping";
};

type CrmSyncStatus = "skipped" | "processing" | "synced" | "failed" | "dead_letter";

type CrmSyncEvent = {
  id: string;
  status: CrmSyncStatus;
  attempt_count: number;
  ghl_contact_id?: string | null;
  ghl_opportunity_id?: string | null;
  metadata?: Json | null;
};

type PartnerGhlWorkflowConfig = {
  workflowId: string;
  enrollmentTrigger: "lead_synced" | "manual";
};

type SyncLeadOptions = {
  partnerId?: string | null;
  dryRun?: boolean;
  writeEventLedger?: boolean;
  metadata?: Record<string, Json>;
};

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type UntypedAdminClient = {
  from: (table: string) => any;
};

const GHL_DESTINATION = "gohighlevel";

function getAdminClientOrThrow() {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase service-role client is not configured.", "service_role_missing");
  }

  return supabase as AdminClient;
}

function db(supabase: AdminClient) {
  return supabase as unknown as UntypedAdminClient;
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

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function mergeMetadata(options: SyncLeadOptions, values: Record<string, Json>) {
  return {
    ...(options.metadata ?? {}),
    ...values,
  };
}

function retryableGhlError(code: string | null) {
  return code === "ghl_rate_limited" || code === "ghl_unavailable" || code === "ghl_request_timeout";
}

function getWorkflowMetadataValue(metadata: Json | null | undefined, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, Json>)[key];
  return typeof value === "string" || typeof value === "boolean" ? value : null;
}

export function classifyPartnerCrmSyncFailure(code: string | null) {
  return retryableGhlError(code)
    ? {
        status: "failed" as const,
        nextRetryAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }
    : {
        status: "dead_letter" as const,
        nextRetryAt: null,
      };
}

export function buildPartnerCrmSyncIdempotencyKey(params: {
  partnerId: string;
  workspaceId: string;
  leadId: string;
  destination?: string;
}) {
  return createHash("sha256")
    .update([params.partnerId, params.workspaceId, params.leadId, params.destination ?? GHL_DESTINATION].join("|"))
    .digest("hex");
}

export function buildGhlContactPayload(params: {
  lead: CrmSyncLeadRecord;
  config: WorkspaceGhlConfig;
}): GhlContactPayload {
  const name = splitName(params.lead);
  const phone = normalizePhone(params.lead.phone_e164 || params.lead.phone_raw || params.lead.phone || null);
  const email = params.lead.email?.trim().toLowerCase() || undefined;
  const campaignName = params.lead.campaign_name?.trim() || "DealFlow campaign";

  return {
    locationId: params.config.locationId,
    firstName: name.firstName,
    lastName: name.lastName,
    name: name.fullName,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    source: params.config.source || "DealFlow",
    tags: compactTags([
      ...params.config.tags,
      params.lead.lead_type,
      params.lead.utm_source,
      params.lead.utm_campaign,
      campaignName,
    ]),
    customFields: [
      { key: "dealflow_lead_id", field_value: params.lead.id },
      { key: "dealflow_workspace_id", field_value: params.config.workspaceId },
      { key: "dealflow_partner_id", field_value: params.config.partnerId },
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

export function buildGhlOpportunityPayload(params: {
  lead: CrmSyncLeadRecord;
  config: WorkspaceGhlConfig;
  contactId: string;
}): GhlOpportunityPayload | null {
  if (!params.config.pipelineId || !params.config.stageId) {
    return null;
  }

  const name = splitName(params.lead);
  const campaignName = params.lead.campaign_name?.trim() || "DealFlow campaign";
  const leadName = name.fullName || params.lead.email?.trim() || params.lead.phone?.trim() || "DealFlow lead";

  return {
    locationId: params.config.locationId,
    pipelineId: params.config.pipelineId,
    stageId: params.config.stageId,
    contactId: params.contactId,
    name: `${leadName} - ${campaignName}`,
    source: params.config.source || "DealFlow",
  };
}

export async function readWorkspaceGhlConfig(params: {
  supabase?: AdminClient;
  workspaceId: string;
  partnerId?: string | null;
}) {
  const supabase = params.supabase ?? getAdminClientOrThrow();
  const client = db(supabase);
  let partnerId = params.partnerId?.trim() || null;
  let partnerResolutionSource: WorkspaceGhlConfig["partnerResolutionSource"] = partnerId ? "input" : "organization";

  if (!partnerId) {
    const { data: organization, error: organizationError } = await client
      .from("organizations")
      .select("id, partner_id")
      .eq("id", params.workspaceId)
      .maybeSingle();

    if (organizationError) {
      throw new ApiError(500, organizationError.message, "workspace_partner_lookup_failed");
    }

    partnerId = typeof organization?.partner_id === "string" ? organization.partner_id : null;
  }

  if (!partnerId) {
    const { data: mappings, error: mappingLookupError } = await client
      .from("workspace_ghl_mapping")
      .select("partner_id")
      .eq("workspace_id", params.workspaceId)
      .eq("sync_enabled", true)
      .limit(2);

    if (mappingLookupError) {
      throw new ApiError(500, mappingLookupError.message, "workspace_ghl_mapping_partner_lookup_failed");
    }

    const enabledPartnerIds = Array.from(
      new Set(
        (Array.isArray(mappings) ? mappings : [])
          .map((mapping: { partner_id?: unknown }) => mapping.partner_id)
          .filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0),
      ),
    );

    if (enabledPartnerIds.length > 1) {
      throw new ApiError(
        409,
        "Multiple enabled GHL partner mappings exist for this workspace.",
        "ghl_mapping_ambiguous",
      );
    }

    if (enabledPartnerIds.length === 1) {
      partnerId = enabledPartnerIds[0];
      partnerResolutionSource = "workspace_mapping";
    }
  }

  if (!partnerId) {
    return null;
  }

  const { data: mapping, error: mappingError } = await client
    .from("workspace_ghl_mapping")
    .select("workspace_id, partner_id, ghl_location_id, ghl_pipeline_id, ghl_stage_id, sync_enabled")
    .eq("workspace_id", params.workspaceId)
    .eq("partner_id", partnerId)
    .eq("sync_enabled", true)
    .maybeSingle();

  if (mappingError) {
    throw new ApiError(500, mappingError.message, "ghl_mapping_fetch_failed");
  }

  if (!mapping?.ghl_location_id) {
    return null;
  }

  const { data: partnerConfig, error: partnerConfigError } = await client
    .from("partner_ghl_config")
    .select("partner_id, enabled, encrypted_credential_ref, default_location_id, default_pipeline_id, default_stage_id, default_tags, default_source")
    .eq("partner_id", partnerId)
    .maybeSingle();

  if (partnerConfigError) {
    throw new ApiError(500, partnerConfigError.message, "ghl_partner_config_fetch_failed");
  }

  if (!partnerConfig?.enabled) {
    return null;
  }

  return {
    partnerId,
    workspaceId: params.workspaceId,
    locationId: String(mapping.ghl_location_id),
    pipelineId:
      typeof mapping.ghl_pipeline_id === "string" && mapping.ghl_pipeline_id.trim()
        ? mapping.ghl_pipeline_id
        : typeof partnerConfig.default_pipeline_id === "string" && partnerConfig.default_pipeline_id.trim()
          ? partnerConfig.default_pipeline_id
          : null,
    stageId:
      typeof mapping.ghl_stage_id === "string" && mapping.ghl_stage_id.trim()
        ? mapping.ghl_stage_id
        : typeof partnerConfig.default_stage_id === "string" && partnerConfig.default_stage_id.trim()
          ? partnerConfig.default_stage_id
          : null,
    credentialRef: String(partnerConfig.encrypted_credential_ref),
    source:
      typeof partnerConfig.default_source === "string" && partnerConfig.default_source.trim()
        ? partnerConfig.default_source
        : "DealFlow",
    tags: asStringArray(partnerConfig.default_tags),
    partnerResolutionSource,
  } satisfies WorkspaceGhlConfig;
}

export async function readPartnerGhlWorkflowConfig(params: {
  supabase?: AdminClient;
  partnerId: string;
}) {
  const supabase = params.supabase ?? getAdminClientOrThrow();
  const { data, error } = await db(supabase)
    .from("partner_ghl_workflow_config")
    .select("partner_id, enabled, workflow_id, enrollment_trigger")
    .eq("partner_id", params.partnerId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "ghl_workflow_config_fetch_failed");
  }

  if (!data?.enabled || typeof data.workflow_id !== "string" || !data.workflow_id.trim()) {
    return null;
  }

  const enrollmentTrigger = data.enrollment_trigger === "manual" ? "manual" : "lead_synced";

  return {
    workflowId: data.workflow_id.trim(),
    enrollmentTrigger,
  } satisfies PartnerGhlWorkflowConfig;
}

async function upsertSyncEvent(params: {
  supabase: AdminClient;
  lead: CrmSyncLeadRecord;
  workspaceId: string;
  partnerId: string;
  locationId: string | null;
  status: CrmSyncStatus;
  idempotencyKey: string;
  metadata?: Json;
}) {
  const client = db(params.supabase);
  const { data: existing, error: existingError } = await client
    .from("lead_crm_sync_events")
    .select("id, status, attempt_count, ghl_contact_id, ghl_opportunity_id, metadata")
    .eq("idempotency_key", params.idempotencyKey)
    .maybeSingle();

  if (existingError) {
    throw new ApiError(500, existingError.message, "lead_crm_sync_event_fetch_failed");
  }

  if (existing?.status === "synced") {
    return existing as CrmSyncEvent;
  }

  if (existing?.status === "dead_letter") {
    return existing as CrmSyncEvent;
  }

  if (existing?.id) {
    const { data, error } = await client
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
      .select("id, status, attempt_count, ghl_contact_id, ghl_opportunity_id, metadata")
      .maybeSingle();

    if (error) {
      throw new ApiError(500, error.message, "lead_crm_sync_event_update_failed");
    }

    return data as CrmSyncEvent | null;
  }

  const { data, error } = await client
    .from("lead_crm_sync_events")
    .insert({
      lead_id: params.lead.id,
      workspace_id: params.workspaceId,
      partner_id: params.partnerId,
      destination: GHL_DESTINATION,
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
    .select("id, status, attempt_count, ghl_contact_id, ghl_opportunity_id, metadata")
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "lead_crm_sync_event_insert_failed");
  }

  return data as CrmSyncEvent | null;
}

async function markSyncEvent(params: {
  supabase: AdminClient;
  eventId: string;
  status: CrmSyncStatus;
  contactId?: string | null;
  opportunityId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  nextRetryAt?: string | null;
  metadata?: Json;
}) {
  const { error } = await db(params.supabase)
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

async function maybeEnrollContactInWorkflow(params: {
  supabase: AdminClient;
  ghl: GoHighLevelClient;
  config: WorkspaceGhlConfig;
  contactId: string;
  opportunityConfigured: boolean;
  opportunityId: string | null;
}) {
  if (!isGhlWorkflowEnrollmentEnabled()) {
    return {
      workflowEnrollment: false,
      workflowSkipped: true,
      workflowReason: "workflow_enrollment_disabled",
    };
  }

  const workflowConfig = await readPartnerGhlWorkflowConfig({
    supabase: params.supabase,
    partnerId: params.config.partnerId,
  });

  if (!workflowConfig) {
    return {
      workflowEnrollment: false,
      workflowSkipped: true,
      workflowReason: "workflow_config_missing",
    };
  }

  if (workflowConfig.enrollmentTrigger === "manual") {
    return {
      workflowEnrollment: false,
      workflowSkipped: true,
      workflowReason: "workflow_trigger_manual",
      workflowId: workflowConfig.workflowId,
    };
  }

  if (params.opportunityConfigured && !params.opportunityId) {
    return {
      workflowEnrollment: false,
      workflowSkipped: true,
      workflowReason: "workflow_waiting_for_opportunity_sync",
      workflowId: workflowConfig.workflowId,
    };
  }

  try {
    const enrollment = await params.ghl.addContactToWorkflow({
      contactId: params.contactId,
      workflowId: workflowConfig.workflowId,
    });

    return {
      workflowEnrollment: true,
      workflowSkipped: false,
      workflowReason: "workflow_enrolled",
      workflowId: workflowConfig.workflowId,
      workflowEnrollmentId: enrollment.enrollmentId,
      workflowMessage: enrollment.message,
    };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "ghl_workflow_enrollment_exception";
    const message = error instanceof Error ? error.message : "Unknown GoHighLevel workflow enrollment failure.";

    logError("partner_crm_sync.workflow_enrollment_failed", {
      partnerId: params.config.partnerId,
      workspaceId: params.config.workspaceId,
      locationId: params.config.locationId,
      workflowId: workflowConfig.workflowId,
      code,
      message,
    });

    return {
      workflowEnrollment: false,
      workflowSkipped: false,
      workflowReason: "workflow_enrollment_failed",
      workflowId: workflowConfig.workflowId,
      workflowErrorCode: code,
      workflowErrorMessage: message,
    };
  }
}

export async function syncLeadToPartnerCrm(lead: CrmSyncLeadRecord, options: SyncLeadOptions = {}) {
  const workspaceId = lead.organization_id ?? lead.tenant_id ?? null;
  const dryRun = options.dryRun !== false;
  const writeEventLedger = options.writeEventLedger !== false;

  if (!workspaceId || !lead.id) {
    return { synced: false, skipped: true, reason: "missing_workspace_or_lead" };
  }

  const supabase = getAdminClientOrThrow();
  const config = await readWorkspaceGhlConfig({
    supabase,
    workspaceId,
    partnerId: options.partnerId,
  });

  if (!config) {
    return { synced: false, skipped: true, reason: "crm_not_configured" };
  }

  const idempotencyKey = buildPartnerCrmSyncIdempotencyKey({
    partnerId: config.partnerId,
    workspaceId,
    leadId: lead.id,
    destination: GHL_DESTINATION,
  });
  const contactPayload = buildGhlContactPayload({ lead, config });
  const opportunityConfigReady = Boolean(config.pipelineId && config.stageId);
  const event = writeEventLedger
    ? await upsertSyncEvent({
        supabase,
        lead,
        workspaceId,
        partnerId: config.partnerId,
        locationId: config.locationId,
	        status: "processing",
	        idempotencyKey,
	        metadata: mergeMetadata(options, {
          dry_run: dryRun,
          destination: GHL_DESTINATION,
          campaign_id: lead.campaign_id ?? null,
          source: lead.source ?? null,
          pipeline_configured: opportunityConfigReady,
          partner_resolution_source: config.partnerResolutionSource,
        }),
      })
    : null;

  if (event?.status === "synced") {
    const workflowEnrollment = getWorkflowMetadataValue(event.metadata, "workflow_enrollment") === true;
    const workflowReason = getWorkflowMetadataValue(event.metadata, "workflow_reason");

    return {
      synced: true,
      skipped: true,
      reason: "already_synced",
      eventId: event.id,
      contactId: event.ghl_contact_id ?? null,
      opportunityId: event.ghl_opportunity_id ?? null,
      workflowEnrollment,
      workflowReason: workflowReason ?? (workflowEnrollment ? "workflow_already_enrolled" : "already_synced"),
    };
  }

  if (event?.status === "dead_letter") {
    return {
      synced: false,
      skipped: true,
      reason: "existing_dead_letter",
      eventId: event.id,
    };
  }

  if (dryRun) {
    if (event?.id) {
      await markSyncEvent({
        supabase,
        eventId: event.id,
	        status: "skipped",
	        metadata: mergeMetadata(options, {
	          dry_run: true,
          reason: "dry_run",
          idempotency_key: idempotencyKey,
          contact_payload_ready: Boolean(contactPayload.locationId),
          pipeline_configured: opportunityConfigReady,
          opportunity_skipped: true,
          opportunity_reason: "dry_run",
          workflow_enrollment: false,
          workflow_reason: "dry_run",
          partner_resolution_source: config.partnerResolutionSource,
        }),
      });
    }

    logOperationalEvent("partner_crm_sync.dry_run", {
      leadId: lead.id,
      workspaceId,
      partnerId: config.partnerId,
      eventId: event?.id ?? null,
    });

    return {
      synced: false,
      skipped: true,
      dryRun: true,
      reason: "dry_run",
      eventId: event?.id ?? null,
      idempotencyKey,
      opportunitySkipped: true,
      opportunityReason: "dry_run",
      workflowEnrollment: false,
      workflowReason: "dry_run",
    };
  }

	  if (!isGhlContactWritesEnabled()) {
	    if (event?.id) {
	      await markSyncEvent({
	        supabase,
	        eventId: event.id,
	        status: "skipped",
	        metadata: mergeMetadata(options, {
	          dry_run: false,
          reason: "ghl_contact_writes_disabled",
          idempotency_key: idempotencyKey,
          workflow_enrollment: false,
          workflow_reason: "contact_writes_disabled",
          partner_resolution_source: config.partnerResolutionSource,
        }),
      });
    }

	    return {
	      synced: false,
	      skipped: true,
	      reason: "ghl_contact_writes_disabled",
	      eventId: event?.id ?? null,
        workflowEnrollment: false,
        workflowReason: "contact_writes_disabled",
	    };
	  }

  const token = getGhlPrivateTokenFromCredentialRef(config.credentialRef);
  if (!token) {
    if (event?.id) {
      await markSyncEvent({
        supabase,
        eventId: event.id,
	        status: "skipped",
	        errorCode: "ghl_auth_missing",
	        errorMessage: "GoHighLevel credential reference is configured but the server token is missing.",
	        metadata: mergeMetadata(options, {
	          dry_run: false,
          reason: "ghl_auth_missing",
          idempotency_key: idempotencyKey,
          workflow_enrollment: false,
          workflow_reason: "ghl_auth_missing",
          partner_resolution_source: config.partnerResolutionSource,
        }),
      });
    }

    return {
      synced: false,
      skipped: true,
      reason: "ghl_auth_missing",
      eventId: event?.id ?? null,
      workflowEnrollment: false,
      workflowReason: "ghl_auth_missing",
    };
  }

	  try {
	    const ghl = new GoHighLevelClient({ token });
	    const contactId = await ghl.upsertContact(contactPayload);
    const opportunityPayload = buildGhlOpportunityPayload({ lead, config, contactId });
    let opportunityId: string | null = null;
    let opportunitySkipped = true;
    let opportunityReason = "opportunity_writes_disabled";

    if (!opportunityPayload) {
      opportunityReason = "pipeline_or_stage_missing";
    } else if (isGhlOpportunityWritesEnabled()) {
      try {
        opportunityId = await ghl.createOpportunity(opportunityPayload);
        opportunitySkipped = false;
        opportunityReason = "opportunity_created";
      } catch (error) {
        const code = error instanceof ApiError ? error.code : "ghl_opportunity_create_exception";
        const failure = classifyPartnerCrmSyncFailure(code);
        const message = error instanceof Error ? error.message : "Unknown GoHighLevel opportunity creation failure.";

        if (event?.id) {
          await markSyncEvent({
            supabase,
            eventId: event.id,
            status: failure.status,
            contactId,
            opportunityId: null,
            errorCode: code,
            errorMessage: message,
            nextRetryAt: failure.nextRetryAt,
            metadata: mergeMetadata(options, {
              dry_run: false,
              reason: "ghl_opportunity_create_failed",
              idempotency_key: idempotencyKey,
              contact_payload_ready: Boolean(contactPayload.locationId),
              pipeline_configured: opportunityConfigReady,
              opportunity_skipped: false,
              opportunity_reason: "ghl_opportunity_create_failed",
              retryable: failure.status === "failed",
              provisioning: false,
              workflow_enrollment: false,
              partner_resolution_source: config.partnerResolutionSource,
            }),
          });
        }

        return {
          synced: false,
          skipped: false,
          reason: "ghl_opportunity_create_failed",
          status: failure.status,
          errorCode: code,
          eventId: event?.id ?? null,
          contactId,
          opportunityId: null,
          locationId: config.locationId,
          provisioning: false,
          workflowEnrollment: false,
        };
      }
    }

    const workflowResult = await maybeEnrollContactInWorkflow({
      supabase,
      ghl,
      config,
      contactId,
      opportunityConfigured: opportunityConfigReady,
      opportunityId,
    });

	    if (event?.id) {
	      await markSyncEvent({
	        supabase,
	        eventId: event.id,
	        status: "synced",
	        contactId,
	        opportunityId,
	        metadata: mergeMetadata(options, {
	          dry_run: false,
	          reason: opportunityId ? "contact_and_opportunity_synced" : "contact_upserted",
	          idempotency_key: idempotencyKey,
	          contact_payload_ready: Boolean(contactPayload.locationId),
          pipeline_configured: opportunityConfigReady,
          opportunity_skipped: opportunitySkipped,
          opportunity_reason: opportunityReason,
          opportunity_id_present: Boolean(opportunityId),
          provisioning: false,
          workflow_enrollment: workflowResult.workflowEnrollment,
          workflow_reason: workflowResult.workflowReason,
          workflow_id: "workflowId" in workflowResult ? (workflowResult.workflowId ?? null) : null,
          workflow_enrollment_id:
            "workflowEnrollmentId" in workflowResult ? (workflowResult.workflowEnrollmentId ?? null) : null,
          workflow_error_code: "workflowErrorCode" in workflowResult ? (workflowResult.workflowErrorCode ?? null) : null,
          workflow_error_message:
            "workflowErrorMessage" in workflowResult ? (workflowResult.workflowErrorMessage ?? null) : null,
          partner_resolution_source: config.partnerResolutionSource,
        }),
      });
    }

	    logOperationalEvent("partner_crm_sync.contact_upserted", {
	      leadId: lead.id,
	      workspaceId,
	      partnerId: config.partnerId,
	      eventId: event?.id ?? null,
	      locationId: config.locationId,
      opportunityCreated: Boolean(opportunityId),
	    });

	    return {
	      synced: true,
	      skipped: false,
	      reason: opportunityId ? "contact_and_opportunity_synced" : "contact_upserted",
	      eventId: event?.id ?? null,
	      contactId,
	      opportunityId,
	      locationId: config.locationId,
      opportunitySkipped,
      opportunityReason,
	      provisioning: false,
	      workflowEnrollment: workflowResult.workflowEnrollment,
        workflowReason: workflowResult.workflowReason,
        workflowId: "workflowId" in workflowResult ? (workflowResult.workflowId ?? null) : null,
        workflowEnrollmentId:
          "workflowEnrollmentId" in workflowResult ? (workflowResult.workflowEnrollmentId ?? null) : null,
        workflowErrorCode: "workflowErrorCode" in workflowResult ? (workflowResult.workflowErrorCode ?? null) : null,
	    };
	  } catch (error) {
	    const code = error instanceof ApiError ? error.code : "ghl_contact_upsert_exception";
	    const failure = classifyPartnerCrmSyncFailure(code);
	    const message = error instanceof Error ? error.message : "Unknown GoHighLevel contact upsert failure.";

	    if (event?.id) {
	      await markSyncEvent({
	        supabase,
	        eventId: event.id,
	        status: failure.status,
	        errorCode: code,
	        errorMessage: message,
	        nextRetryAt: failure.nextRetryAt,
	        metadata: mergeMetadata(options, {
	          dry_run: false,
          reason: "ghl_contact_upsert_failed",
          idempotency_key: idempotencyKey,
          retryable: failure.status === "failed",
          workflow_enrollment: false,
          workflow_reason: "contact_upsert_failed",
          partner_resolution_source: config.partnerResolutionSource,
        }),
      });
    }

	    return {
	      synced: false,
	      skipped: false,
	      reason: "ghl_contact_upsert_failed",
	      status: failure.status,
	      errorCode: code,
	      eventId: event?.id ?? null,
        workflowEnrollment: false,
        workflowReason: "contact_upsert_failed",
	    };
	  }
	}

export async function safeSyncLeadToPartnerCrm(lead: CrmSyncLeadRecord, options: SyncLeadOptions = {}) {
  try {
    return await syncLeadToPartnerCrm(lead, options);
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "crm_sync_exception";
    const failure = classifyPartnerCrmSyncFailure(code);

    logError("partner_crm_sync_failed", {
      leadId: lead.id,
      workspaceId: lead.organization_id ?? lead.tenant_id ?? null,
      code,
      retryable: failure.status === "failed",
      message: error instanceof Error ? error.message : "Unknown CRM sync failure.",
    });

    return {
      synced: false,
      skipped: false,
      reason: failure.status === "failed" ? "crm_sync_retryable_error" : "crm_sync_exception",
      status: failure.status,
      errorCode: code,
    };
  }
}
