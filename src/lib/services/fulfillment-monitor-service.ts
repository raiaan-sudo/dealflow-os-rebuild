import {
  isGhlAutoProvisioningEnabled,
  isGhlContactWritesEnabled,
  isGhlOpportunityWritesEnabled,
  isGhlProvisioningWritesEnabled,
  isGhlWorkflowEnrollmentEnabled,
} from "@/lib/env";
import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPartnerCrmSyncIdempotencyKey,
  readWorkspaceGhlConfig,
  safeSyncLeadToPartnerCrm,
  type CrmSyncLeadRecord,
} from "@/lib/services/partner-crm-sync-service";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type UntypedAdminClient = {
  from: (table: string) => any;
};

type JsonRecord = Record<string, unknown>;

export type FulfillmentMonitorFilters = {
  workspaceId?: string | null;
  campaignId?: string | null;
  status?: string | null;
  failedOnly?: boolean;
  search?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
};

export type FulfillmentMonitorLeadRow = {
  leadId: string;
  leadLabel: string;
  emailMasked: string;
  workspaceId: string | null;
  workspaceLabel: string;
  campaignId: string | null;
  campaignLabel: string;
  createdAt: string | null;
  source: string;
  proofMarker: string;
  leadSideEffectsJob: RelatedJob | null;
  performanceBillingJob: RelatedJob | null;
  billingEvent: RelatedBillingEvent | null;
  crmEvent: RelatedCrmEvent | null;
  retryEligibility: {
    eligible: boolean;
    requiresDeadLetterConfirmation: boolean;
    reason: string;
  };
};

export type FulfillmentMonitorHealth = {
  checkedAt: string;
  writeGates: {
    contactWritesEnabled: boolean;
    opportunityWritesEnabled: boolean;
    autoProvisioningEnabled: boolean;
    provisioningWritesEnabled: boolean;
    workflowEnrollmentEnabled: boolean;
  };
  recentCrmFailures: number;
  recentDeadLetters: number;
  pendingLeadSideEffectJobs: number;
  failedLeadSideEffectJobs: number;
  mappings: Array<{
    workspaceId: string | null;
    partnerId: string | null;
    locationConfigured: boolean;
    pipelineConfigured: boolean;
    stageConfigured: boolean;
    syncEnabled: boolean;
    credentialConfigured: boolean;
    partnerConfigEnabled: boolean;
  }>;
};

export type FulfillmentMonitorData = {
  filters: FulfillmentMonitorFilters;
  rows: FulfillmentMonitorLeadRow[];
  health: FulfillmentMonitorHealth;
};

type RelatedJob = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  retryEligible: boolean;
  lastErrorCode: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  resultSummary: string;
};

type RelatedBillingEvent = {
  id: string;
  status: string;
  reason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type RelatedCrmEvent = {
  id: string;
  status: string;
  attemptCount: number;
  destination: string;
  contactIdMasked: string | null;
  opportunityIdMasked: string | null;
  locationIdMasked: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  nextRetryAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  proofMarker: string;
  metadataSummary: string;
};

function getAdminClientOrThrow() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service-role client is not configured.", "service_role_missing");
  }

  return admin;
}

function db(admin: AdminClient) {
  return admin as unknown as UntypedAdminClient;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function maskEmail(value: unknown) {
  const email = asString(value)?.toLowerCase();
  if (!email || !email.includes("@")) {
    return "No email";
  }

  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskExternalId(value: unknown) {
  const id = asString(value);
  if (!id) {
    return null;
  }

  return id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-4)}` : "***";
}

function normalizeSearch(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function isUuid(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function createdAtInRange(createdAt: string | null | undefined, filters: FulfillmentMonitorFilters) {
  if (!createdAt) {
    return true;
  }

  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) {
    return true;
  }

  if (filters.from) {
    const from = Date.parse(filters.from);
    if (Number.isFinite(from) && timestamp < from) {
      return false;
    }
  }

  if (filters.to) {
    const to = Date.parse(filters.to);
    if (Number.isFinite(to) && timestamp > to) {
      return false;
    }
  }

  return true;
}

function deriveLeadLabel(lead: JsonRecord) {
  const name = asString(lead.name);
  const first = asString(lead.first_name);
  const last = asString(lead.last_name);
  const email = asString(lead.email);

  return name || [first, last].filter(Boolean).join(" ") || email || "Lead";
}

function deriveProofMarker(...values: unknown[]) {
  const joined = values
    .map((value) => {
      if (!value) {
        return "";
      }
      if (typeof value === "string") {
        return value;
      }
      try {
        return JSON.stringify(value);
      } catch {
        return "";
      }
    })
    .join(" ")
    .toLowerCase();

  if (/proof|qa_|qa\+|test|fullgo|ghl/.test(joined)) {
    return "proof/test signal";
  }

  return "none";
}

function summarizeResult(value: unknown) {
  const result = asRecord(value);
  if (!result) {
    return "No result payload";
  }

  const crm = asRecord(result.crmSyncResult);
  if (crm) {
    return `CRM: ${asString(crm.reason) ?? asString(crm.status) ?? "unknown"}`;
  }

  const reason = asString(result.reason);
  if (reason) {
    return reason;
  }

  return Object.keys(result).slice(0, 4).join(", ") || "Result recorded";
}

function mapJob(row: JsonRecord | null): RelatedJob | null {
  if (!row) {
    return null;
  }

  const attempts = Number(row.attempt_count ?? 0);
  const maxAttempts = Number(row.max_attempts ?? 0);
  const status = asString(row.status) ?? "unknown";

  return {
    id: String(row.id),
    kind: asString(row.kind) ?? "unknown",
    status,
    attempts,
    maxAttempts,
    retryEligible: status === "failed" && (maxAttempts === 0 || attempts < maxAttempts),
    lastErrorCode: asString(row.last_error_code),
    errorMessage: asString(row.error_message) ?? asString(row.dead_letter_reason),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    resultSummary: summarizeResult(row.result),
  };
}

function mapCrmEvent(row: JsonRecord | null): RelatedCrmEvent | null {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    status: asString(row.status) ?? "unknown",
    attemptCount: Number(row.attempt_count ?? 0),
    destination: asString(row.destination) ?? "gohighlevel",
    contactIdMasked: maskExternalId(row.ghl_contact_id),
    opportunityIdMasked: maskExternalId(row.ghl_opportunity_id),
    locationIdMasked: maskExternalId(row.ghl_location_id),
    lastErrorCode: asString(row.last_error_code),
    lastErrorMessage: asString(row.last_error_message),
    nextRetryAt: asString(row.next_retry_at),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    proofMarker: deriveProofMarker(row.metadata),
    metadataSummary: summarizeMetadata(row.metadata),
  };
}

function summarizeMetadata(value: unknown) {
  const metadata = asRecord(value);
  if (!metadata) {
    return "No metadata";
  }

  const parts = [
    asString(metadata.reason),
    metadata.provisioning === false ? "no provisioning" : null,
    metadata.workflow_enrollment === false ? "no workflow" : null,
    asString(metadata.proof_run_id) ? "proof run" : null,
  ].filter(Boolean);

  return parts.join(" · ") || Object.keys(metadata).slice(0, 4).join(", ");
}

function mapBillingEvent(row: JsonRecord | null): RelatedBillingEvent | null {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    status: asString(row.status) ?? "unknown",
    reason: asString(row.skip_reason),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function retryEligibility(crmEvent: RelatedCrmEvent | null) {
  if (!crmEvent) {
    return {
      eligible: true,
      requiresDeadLetterConfirmation: false,
      reason: "No CRM event exists yet.",
    };
  }

  if (crmEvent.status === "synced") {
    return {
      eligible: true,
      requiresDeadLetterConfirmation: false,
      reason: "Already synced; retry should return already_synced without duplicate writes.",
    };
  }

  if (crmEvent.status === "dead_letter") {
    return {
      eligible: true,
      requiresDeadLetterConfirmation: true,
      reason: "Dead-lettered event requires explicit confirmation before retry.",
    };
  }

  if (crmEvent.status === "failed" || crmEvent.status === "skipped" || crmEvent.status === "queued") {
    return {
      eligible: true,
      requiresDeadLetterConfirmation: false,
      reason: `CRM event is ${crmEvent.status}.`,
    };
  }

  return {
    eligible: false,
    requiresDeadLetterConfirmation: false,
    reason: `CRM event is ${crmEvent.status}.`,
  };
}

async function loadByIds(admin: AdminClient, table: string, ids: string[], columns: string) {
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await db(admin)
    .from(table)
    .select(columns)
    .in("id", ids);

  if (error) {
    throw new ApiError(500, error.message, `${table}_lookup_failed`);
  }

  return Array.isArray(data) ? (data as JsonRecord[]) : [];
}

function latestByLeadId(rows: JsonRecord[], leadId: string) {
  return rows
    .filter((row) => row.lead_id === leadId)
    .sort((a, b) => Date.parse(asString(b.updated_at) ?? asString(b.created_at) ?? "") - Date.parse(asString(a.updated_at) ?? asString(a.created_at) ?? ""))[0] ?? null;
}

function jobLeadId(row: JsonRecord) {
  const payload = asRecord(row.payload);
  const lead = asRecord(payload?.lead);
  return asString(lead?.id);
}

function jobMatchesLead(row: JsonRecord, lead: JsonRecord, kind: string) {
  if (row.kind !== kind) {
    return false;
  }

  const leadId = asString(lead.id);
  if (leadId && jobLeadId(row) === leadId) {
    return true;
  }

  return Boolean(lead.campaign_id && row.campaign_id === lead.campaign_id && row.organization_id === lead.organization_id);
}

function matchesSearch(lead: JsonRecord, search: string | null) {
  if (!search) {
    return true;
  }

  const haystack = [
    lead.id,
    lead.email,
    lead.name,
    lead.first_name,
    lead.last_name,
    lead.campaign_id,
    lead.organization_id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search);
}

function matchesStatus(row: FulfillmentMonitorLeadRow, status: string | null | undefined) {
  if (!status) {
    return true;
  }

  return row.crmEvent?.status === status
    || row.leadSideEffectsJob?.status === status
    || row.performanceBillingJob?.status === status
    || row.billingEvent?.status === status;
}

async function loadHealth(admin: AdminClient): Promise<FulfillmentMonitorHealth> {
  const [
    { count: recentCrmFailures, error: crmFailureError },
    { count: recentDeadLetters, error: deadLetterError },
    { count: pendingLeadSideEffectJobs, error: pendingJobError },
    { count: failedLeadSideEffectJobs, error: failedJobError },
    { data: mappings, error: mappingsError },
  ] = await Promise.all([
    db(admin).from("lead_crm_sync_events").select("id", { count: "exact", head: true }).eq("status", "failed"),
    db(admin).from("lead_crm_sync_events").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
    db(admin).from("system_jobs").select("id", { count: "exact", head: true }).eq("kind", "lead_side_effects").eq("status", "pending"),
    db(admin).from("system_jobs").select("id", { count: "exact", head: true }).eq("kind", "lead_side_effects").eq("status", "failed"),
    db(admin)
      .from("workspace_ghl_mapping")
      .select("workspace_id, partner_id, ghl_location_id, ghl_pipeline_id, ghl_stage_id, sync_enabled")
      .limit(25),
  ]);

  const firstError = crmFailureError ?? deadLetterError ?? pendingJobError ?? failedJobError ?? mappingsError;
  if (firstError) {
    throw new ApiError(500, firstError.message, "fulfillment_health_lookup_failed");
  }

  const partnerIds = Array.from(
    new Set(
      (Array.isArray(mappings) ? mappings : [])
        .map((mapping: JsonRecord) => asString(mapping.partner_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const { data: configs, error: configsError } = partnerIds.length > 0
    ? await db(admin)
      .from("partner_ghl_config")
      .select("partner_id, enabled, encrypted_credential_ref")
      .in("partner_id", partnerIds)
    : { data: [], error: null };

  if (configsError) {
    throw new ApiError(500, configsError.message, "fulfillment_health_config_lookup_failed");
  }

  const configsByPartner = new Map(
    (Array.isArray(configs) ? configs : []).map((config: JsonRecord) => [asString(config.partner_id), config]),
  );

  return {
    checkedAt: new Date().toISOString(),
    writeGates: {
      contactWritesEnabled: isGhlContactWritesEnabled(),
      opportunityWritesEnabled: isGhlOpportunityWritesEnabled(),
      autoProvisioningEnabled: isGhlAutoProvisioningEnabled(),
      provisioningWritesEnabled: isGhlProvisioningWritesEnabled(),
      workflowEnrollmentEnabled: isGhlWorkflowEnrollmentEnabled(),
    },
    recentCrmFailures: recentCrmFailures ?? 0,
    recentDeadLetters: recentDeadLetters ?? 0,
    pendingLeadSideEffectJobs: pendingLeadSideEffectJobs ?? 0,
    failedLeadSideEffectJobs: failedLeadSideEffectJobs ?? 0,
    mappings: (Array.isArray(mappings) ? mappings : []).map((mapping: JsonRecord) => {
      const partnerId = asString(mapping.partner_id);
      const config = configsByPartner.get(partnerId) ?? null;

      return {
        workspaceId: asString(mapping.workspace_id),
        partnerId,
        locationConfigured: Boolean(asString(mapping.ghl_location_id)),
        pipelineConfigured: Boolean(asString(mapping.ghl_pipeline_id)),
        stageConfigured: Boolean(asString(mapping.ghl_stage_id)),
        syncEnabled: mapping.sync_enabled === true,
        credentialConfigured: Boolean(asString(config?.encrypted_credential_ref)),
        partnerConfigEnabled: config?.enabled === true,
      };
    }),
  };
}

export async function loadFulfillmentMonitorData(filters: FulfillmentMonitorFilters = {}): Promise<FulfillmentMonitorData> {
  const admin = getAdminClientOrThrow();
  const limit = Math.min(Math.max(Number(filters.limit ?? 50), 1), 100);
  let leadQuery = db(admin)
    .from("leads")
    .select("id, organization_id, campaign_id, source, status, email, first_name, last_name, name, created_at, metadata")
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 3, 80));
  const search = normalizeSearch(filters.search);

  if (isUuid(filters.workspaceId)) {
    leadQuery = leadQuery.eq("organization_id", filters.workspaceId);
  }

  if (isUuid(filters.campaignId)) {
    leadQuery = leadQuery.eq("campaign_id", filters.campaignId);
  }

  if (isUuid(search)) {
    leadQuery = leadQuery.eq("id", search);
  } else if (search?.includes("@")) {
    leadQuery = leadQuery.ilike("email", `%${search}%`);
  }

  const { data: leadsRaw, error: leadsError } = await leadQuery;
  if (leadsError) {
    throw new ApiError(500, leadsError.message, "fulfillment_leads_lookup_failed");
  }

  const leads = (Array.isArray(leadsRaw) ? (leadsRaw as JsonRecord[]) : [])
    .filter((lead) => createdAtInRange(asString(lead.created_at), filters))
    .filter((lead) => matchesSearch(lead, search))
    .slice(0, limit);

  const leadIds = leads.map((lead) => String(lead.id));
  const campaignIds = Array.from(new Set(leads.map((lead) => asString(lead.campaign_id)).filter((value): value is string => Boolean(value))));
  const workspaceIds = Array.from(new Set(leads.map((lead) => asString(lead.organization_id)).filter((value): value is string => Boolean(value))));

  const [
    campaigns,
    organizations,
    { data: crmEventsRaw, error: crmEventsError },
    { data: jobsRaw, error: jobsError },
    { data: billingEventsRaw, error: billingEventsError },
    health,
  ] = await Promise.all([
    loadByIds(admin, "campaign_plans", campaignIds, "id, organization_id, public_slug, launch_status, plan"),
    loadByIds(admin, "organizations", workspaceIds, "id, name"),
    leadIds.length > 0
      ? db(admin)
        .from("lead_crm_sync_events")
        .select("id, lead_id, workspace_id, partner_id, destination, ghl_location_id, ghl_contact_id, ghl_opportunity_id, status, attempt_count, last_error_code, last_error_message, next_retry_at, metadata, created_at, updated_at")
        .in("lead_id", leadIds)
        .order("updated_at", { ascending: false })
      : { data: [], error: null },
    db(admin)
      .from("system_jobs")
      .select("id, organization_id, campaign_id, kind, status, payload, result, attempt_count, max_attempts, last_error_code, error_message, dead_letter_reason, created_at")
      .in("kind", ["lead_side_effects", "performance_lead_billing"])
      .order("created_at", { ascending: false })
      .limit(250),
    leadIds.length > 0
      ? db(admin)
        .from("lead_billing_events")
        .select("id, lead_id, status, skip_reason, created_at, updated_at")
        .in("lead_id", leadIds)
        .order("updated_at", { ascending: false })
      : { data: [], error: null },
    loadHealth(admin),
  ]);

  const firstError = crmEventsError ?? jobsError ?? billingEventsError;
  if (firstError) {
    throw new ApiError(500, firstError.message, "fulfillment_related_lookup_failed");
  }

  const campaignById = new Map(campaigns.map((campaign) => [String(campaign.id), campaign]));
  const organizationById = new Map(organizations.map((organization) => [String(organization.id), organization]));
  const crmEvents = Array.isArray(crmEventsRaw) ? (crmEventsRaw as JsonRecord[]) : [];
  const jobs = Array.isArray(jobsRaw) ? (jobsRaw as JsonRecord[]) : [];
  const billingEvents = Array.isArray(billingEventsRaw) ? (billingEventsRaw as JsonRecord[]) : [];

  const rows = leads.map((lead) => {
    const campaign = asString(lead.campaign_id) ? campaignById.get(String(lead.campaign_id)) : null;
    const organization = asString(lead.organization_id) ? organizationById.get(String(lead.organization_id)) : null;
    const crmEvent = mapCrmEvent(latestByLeadId(crmEvents, String(lead.id)));
    const leadSideEffectsJob = mapJob(jobs.find((job) => jobMatchesLead(job, lead, "lead_side_effects")) ?? null);
    const performanceBillingJob = mapJob(jobs.find((job) => jobMatchesLead(job, lead, "performance_lead_billing")) ?? null);
    const billingEvent = mapBillingEvent(latestByLeadId(billingEvents, String(lead.id)));
    const proofMarker = deriveProofMarker(lead.email, lead.source, lead.metadata, crmEvent?.proofMarker);

    return {
      leadId: String(lead.id),
      leadLabel: deriveLeadLabel(lead),
      emailMasked: maskEmail(lead.email),
      workspaceId: asString(lead.organization_id),
      workspaceLabel: asString(organization?.name) ?? asString(lead.organization_id) ?? "Unknown workspace",
      campaignId: asString(lead.campaign_id),
      campaignLabel: asString(campaign?.public_slug) ?? asString(lead.campaign_id) ?? "No campaign",
      createdAt: asString(lead.created_at),
      source: asString(lead.source) ?? "unknown",
      proofMarker,
      leadSideEffectsJob,
      performanceBillingJob,
      billingEvent,
      crmEvent,
      retryEligibility: retryEligibility(crmEvent),
    } satisfies FulfillmentMonitorLeadRow;
  }).filter((row) => matchesStatus(row, filters.status));

  return {
    filters: {
      ...filters,
      limit,
    },
    rows: filters.failedOnly
      ? rows.filter((row) => row.crmEvent?.status === "failed" || row.crmEvent?.status === "dead_letter" || row.leadSideEffectsJob?.status === "failed")
      : rows,
    health,
  };
}

export async function retryFulfillmentCrmSync(params: {
  leadId: string;
  allowDeadLetter?: boolean;
  confirmation: string;
}) {
  if (params.confirmation !== "RETRY_CRM_SYNC") {
    throw new ApiError(400, "Retry confirmation is required.", "retry_confirmation_required");
  }

  const admin = getAdminClientOrThrow();
  const { data: lead, error: leadError } = await db(admin)
    .from("leads")
    .select("id, organization_id, tenant_id, campaign_id, source, email, first_name, last_name, name, phone, phone_raw, phone_e164, lead_type, utm_source, utm_medium, utm_campaign, ad_id, landing_page_url, created_at")
    .eq("id", params.leadId)
    .maybeSingle();

  if (leadError) {
    throw new ApiError(500, leadError.message, "fulfillment_retry_lead_lookup_failed");
  }

  if (!lead?.id) {
    throw new ApiError(404, "Lead was not found.", "lead_not_found");
  }

  const leadRecord = lead as CrmSyncLeadRecord;
  const workspaceId = leadRecord.organization_id ?? leadRecord.tenant_id ?? null;
  if (!workspaceId) {
    throw new ApiError(409, "Lead is missing workspace context.", "lead_workspace_missing");
  }

  const config = await readWorkspaceGhlConfig({ supabase: admin, workspaceId });
  if (!config) {
    return {
      synced: false,
      skipped: true,
      reason: "crm_not_configured",
      leadId: params.leadId,
      noSmsEmail: true,
      noMetaMutation: true,
      noStripeBillingProviderAction: true,
      provisioning: false,
      workflowEnrollment: false,
    };
  }

  const idempotencyKey = buildPartnerCrmSyncIdempotencyKey({
    partnerId: config.partnerId,
    workspaceId,
    leadId: params.leadId,
    destination: "gohighlevel",
  });
  const { data: existingEvent, error: existingEventError } = await db(admin)
    .from("lead_crm_sync_events")
    .select("id, status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingEventError) {
    throw new ApiError(500, existingEventError.message, "fulfillment_retry_event_lookup_failed");
  }

  if (existingEvent?.status === "dead_letter" && !params.allowDeadLetter) {
    throw new ApiError(409, "Dead-lettered CRM sync requires explicit dead-letter confirmation.", "dead_letter_confirmation_required");
  }

  const crmSyncResult = await safeSyncLeadToPartnerCrm(leadRecord, {
    partnerId: config.partnerId,
    dryRun: false,
    writeEventLedger: true,
    metadata: {
      source: "fulfillment_monitor_retry",
      recovery_action: "crm_sync_only",
      no_sms_email: true,
      no_meta_mutation: true,
      no_stripe_billing_provider_action: true,
      provisioning: false,
      workflow_enrollment: false,
    },
  });

  return {
    leadId: params.leadId,
    workspaceId,
    partnerId: config.partnerId,
    mappingResolved: true,
    contactWritesEnabled: isGhlContactWritesEnabled(),
    opportunityWritesEnabled: isGhlOpportunityWritesEnabled(),
    provisioning: false,
    workflowEnrollment: false,
    noSmsEmail: true,
    noMetaMutation: true,
    noStripeBillingProviderAction: true,
    noProviderGeneration: true,
    crmSyncResult,
  };
}
