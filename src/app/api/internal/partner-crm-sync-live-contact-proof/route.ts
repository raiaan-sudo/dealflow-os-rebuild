import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertInternalSystemRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPartnerCrmSyncIdempotencyKey,
  readWorkspaceGhlConfig,
  safeSyncLeadToPartnerCrm,
} from "@/lib/services/partner-crm-sync-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type UntypedAdminClient = {
  from: (table: string) => any;
};

const TARGET_WORKSPACE_ID = "2e3b0144-23a9-483a-9e11-61173b4099c4";
const TARGET_PARTNER_ID = "1b22d077-1f54-4327-ba48-1b1b793488a1";
const TARGET_LOCATION_ID = "ehLH5WjzfEaztUXBDG3i";
const TARGET_CAMPAIGN_ID = "acbf7508-b782-479e-bc0e-841ffc421818";
const EXISTING_QA_LEAD_ID = "9559908c-57fc-47f8-8864-9ef9923933a7";
const DEFAULT_PROOF_RUN_ID = "live_ghl_contact_sync_20260618_01";
const OPPORTUNITY_V1_PROOF_RUN_ID = "ghl_opportunity_v1_20260618_01";
const QA_EMAIL = "qa+ghl-live-sync-20260618-01@example.com";
const QA_NAME = "QA GHL Live Sync 20260618 01";

const bodySchema = z.object({
  proofRunId: z.enum([DEFAULT_PROOF_RUN_ID, OPPORTUNITY_V1_PROOF_RUN_ID]).default(DEFAULT_PROOF_RUN_ID),
  leadId: z.string().uuid().optional(),
}).strict();

const auditedTables = [
  "leads",
  "system_jobs",
  "lead_crm_sync_events",
  "ghl_provisioning_jobs",
  "ghl_provisioning_events",
  "workspace_ghl_users",
] as const;

function db(admin: AdminClient) {
  return admin as unknown as UntypedAdminClient;
}

function getAdminClient() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service-role client is not configured.", "service_role_missing");
  }

  return admin;
}

function assertProofEnabled() {
  if (process.env.PARTNER_CRM_SYNC_LIVE_CONTACT_PROOF_ENABLED !== "true") {
    throw new ApiError(404, "Partner CRM live contact proof harness is not enabled.", "partner_crm_sync_live_contact_proof_disabled");
  }
}

function assertWriteGates(proofRunId: string) {
  if (process.env.GHL_CONTACT_WRITES_ENABLED !== "true") {
    throw new ApiError(409, "GHL contact writes are not enabled for this proof.", "ghl_contact_writes_disabled");
  }

  if (proofRunId === OPPORTUNITY_V1_PROOF_RUN_ID && process.env.GHL_OPPORTUNITY_WRITES_ENABLED !== "true") {
    throw new ApiError(409, "GHL opportunity writes are not enabled for this proof.", "ghl_opportunity_writes_disabled");
  }

  if (process.env.INTERNAL_LEAD_SMS_ENABLED === "true") {
    throw new ApiError(409, "Internal lead SMS must remain disabled for this proof.", "internal_lead_sms_enabled");
  }

  if (process.env.GHL_AUTO_PROVISIONING_ENABLED === "true") {
    throw new ApiError(409, "GHL auto-provisioning must remain disabled for this proof.", "ghl_auto_provisioning_enabled");
  }

  if (process.env.GHL_PROVISIONING_WRITES_ENABLED === "true") {
    throw new ApiError(409, "GHL provisioning writes must remain disabled for this proof.", "ghl_provisioning_writes_enabled");
  }

  if (process.env.GHL_WORKFLOW_ENROLLMENT_ENABLED === "true") {
    throw new ApiError(409, "GHL workflow enrollment must remain disabled for this proof.", "ghl_workflow_enrollment_enabled");
  }
}

function maskExternalId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : "***";
}

function maskEmail(value: unknown) {
  if (typeof value !== "string" || !value.includes("@")) {
    return null;
  }

  const [name, domain] = value.trim().toLowerCase().split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}

async function countRows(admin: AdminClient) {
  const entries = await Promise.all(
    auditedTables.map(async (table) => {
      const { count, error } = await db(admin).from(table).select("id", { count: "exact", head: true });
      if (error) {
        throw new ApiError(500, error.message, `${table}_count_failed`);
      }

      return [table, count ?? 0] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<(typeof auditedTables)[number], number>;
}

function diffCounts(before: Record<string, number>, after: Record<string, number>) {
  return Object.fromEntries(Object.keys(after).map((key) => [key, after[key] - (before[key] ?? 0)]));
}

async function countProofEvents(admin: AdminClient, proofRunId: string) {
  const { count, error } = await db(admin)
    .from("lead_crm_sync_events")
    .select("id", { count: "exact", head: true })
    .contains("metadata", { proof_run_id: proofRunId });

  if (error) {
    throw new ApiError(500, error.message, "lead_crm_sync_events_proof_count_failed");
  }

  return count ?? 0;
}

async function loadExistingQaLead(admin: AdminClient, body: z.infer<typeof bodySchema>) {
  const leadId = body.proofRunId === OPPORTUNITY_V1_PROOF_RUN_ID
    ? body.leadId
    : EXISTING_QA_LEAD_ID;

  if (!leadId) {
    throw new ApiError(409, "Opportunity V1 proof requires an approved QA lead ID.", "qa_lead_id_required");
  }

  const query = db(admin)
    .from("leads")
    .select("id, organization_id, campaign_id, source, email, first_name, last_name, name, created_at")
    .eq("id", leadId)
    .eq("organization_id", TARGET_WORKSPACE_ID);

  if (body.proofRunId === OPPORTUNITY_V1_PROOF_RUN_ID) {
    query.eq("campaign_id", TARGET_CAMPAIGN_ID);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "qa_lead_lookup_failed");
  }

  if (!data?.id) {
    throw new ApiError(409, "The required existing QA lead is missing from the target workspace.", "qa_lead_missing");
  }

  if (body.proofRunId === OPPORTUNITY_V1_PROOF_RUN_ID) {
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    if (!email.startsWith("qa+") || !email.endsWith("@example.com")) {
      throw new ApiError(409, "Opportunity V1 proof lead must use a QA example.com email.", "qa_lead_email_mismatch");
    }
  }

  return data as {
    id: string;
    organization_id: string;
    campaign_id: string | null;
    source: string | null;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
    created_at?: string | null;
  };
}

async function loadCampaignForProof(admin: AdminClient) {
  const { data, error } = await db(admin)
    .from("campaign_plans")
    .select("id, organization_id, user_id, public_slug")
    .eq("id", TARGET_CAMPAIGN_ID)
    .eq("organization_id", TARGET_WORKSPACE_ID)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "qa_campaign_lookup_failed");
  }

  if (!data?.id) {
    throw new ApiError(409, "The approved proof campaign is missing.", "qa_campaign_missing");
  }

  return data as {
    id: string;
    organization_id: string;
    user_id: string | null;
    public_slug?: string | null;
  };
}

async function loadEvent(admin: AdminClient, idempotencyKey: string) {
  const { data, error } = await db(admin)
    .from("lead_crm_sync_events")
    .select("id, status, attempt_count, ghl_contact_id, ghl_opportunity_id, metadata, updated_at")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "lead_crm_sync_event_lookup_failed");
  }

  const event = data as {
    id?: string;
    status?: string;
    attempt_count?: number;
    ghl_contact_id?: string | null;
    ghl_opportunity_id?: string | null;
    metadata?: unknown;
    updated_at?: string | null;
  } | null;

  return event?.id
    ? {
        id: event.id,
        status: event.status ?? null,
        attemptCount: event.attempt_count ?? null,
        ghlContactIdMasked: maskExternalId(event.ghl_contact_id),
        hasOpportunityId: Boolean(event.ghl_opportunity_id),
        updatedAt: event.updated_at ?? null,
      }
    : null;
}

export async function POST(request: Request) {
  try {
    assertInternalSystemRequest(request);
    assertProofEnabled();

    const body = await parseJsonBody(request, bodySchema);
    assertWriteGates(body.proofRunId);

    const admin = getAdminClient();
    const qaLead = await loadExistingQaLead(admin, body);
    const config = await readWorkspaceGhlConfig({
      supabase: admin,
      workspaceId: TARGET_WORKSPACE_ID,
      partnerId: TARGET_PARTNER_ID,
    });

    if (!config) {
      throw new ApiError(409, "Target workspace GHL config could not be resolved.", "ghl_config_unresolved");
    }

    if (config.locationId !== TARGET_LOCATION_ID) {
      throw new ApiError(409, "Resolved GHL location does not match the approved proof target.", "ghl_location_mismatch");
    }

    const idempotencyKey = buildPartnerCrmSyncIdempotencyKey({
      partnerId: TARGET_PARTNER_ID,
      workspaceId: TARGET_WORKSPACE_ID,
      leadId: qaLead.id,
      destination: "gohighlevel",
    });
    const beforeCounts = await countRows(admin);
    const beforeProofEvents = await countProofEvents(admin, body.proofRunId);
    const qaEmail = body.proofRunId === OPPORTUNITY_V1_PROOF_RUN_ID
        ? qaLead.email
        : QA_EMAIL;
    const proofName = body.proofRunId === OPPORTUNITY_V1_PROOF_RUN_ID
        ? qaLead.name || "QA GHL Opportunity V1 20260618"
        : QA_NAME;
    const crmSyncResult = await safeSyncLeadToPartnerCrm({
      id: qaLead.id,
      organization_id: TARGET_WORKSPACE_ID,
      tenant_id: TARGET_WORKSPACE_ID,
      campaign_id: qaLead.campaign_id,
      campaign_name: body.proofRunId === OPPORTUNITY_V1_PROOF_RUN_ID
        ? "DealFlow controlled GHL opportunity proof"
        : "DealFlow controlled GHL contact proof",
      name: proofName,
      first_name: qaLead.first_name || "QA",
      last_name: qaLead.last_name || (body.proofRunId === OPPORTUNITY_V1_PROOF_RUN_ID
        ? "GHL Opportunity V1 20260618"
        : "GHL Live Sync 20260618 01"),
      email: qaEmail,
      phone: null,
      phone_raw: null,
      phone_e164: null,
      source: qaLead.source || (body.proofRunId === OPPORTUNITY_V1_PROOF_RUN_ID
        ? "live_ghl_opportunity_v1_proof"
        : "live_ghl_contact_sync_proof"),
      lead_type: body.proofRunId === OPPORTUNITY_V1_PROOF_RUN_ID
          ? "qa_opportunity_sync"
          : "qa_contact_sync",
      created_at: qaLead.created_at || new Date().toISOString(),
    }, {
      partnerId: TARGET_PARTNER_ID,
      dryRun: false,
      writeEventLedger: true,
      metadata: {
        proof_run_id: body.proofRunId,
        proof_type: body.proofRunId === OPPORTUNITY_V1_PROOF_RUN_ID
          ? "live_ghl_contact_and_opportunity_sync"
          : "live_ghl_contact_sync",
        approved_location_id: TARGET_LOCATION_ID,
        qa_contact_email: qaEmail ?? null,
        public_lead_created: false,
        system_job_processed: false,
        sms_email_sent: false,
        meta_mutation: false,
        stripe_billing_provider_action: false,
        provisioning: false,
        workflow_enrollment: false,
        workflow_reason: "workflow_enrollment_retired",
      },
    });
    const afterCounts = await countRows(admin);
    const afterProofEvents = await countProofEvents(admin, body.proofRunId);
    const event = await loadEvent(admin, idempotencyKey);

    return apiSuccess({
      success: Boolean(
        (crmSyncResult as { synced?: unknown; reason?: unknown }).synced
          || (crmSyncResult as { reason?: unknown }).reason === "already_synced",
      ),
      proof: "partner_crm_sync_live_contact",
      proofRunId: body.proofRunId,
      target: {
        workspaceId: TARGET_WORKSPACE_ID,
        partnerId: TARGET_PARTNER_ID,
        locationId: TARGET_LOCATION_ID,
        existingQaLeadId: qaLead.id,
        qaContactEmailMasked: maskEmail(qaEmail),
      },
      resolved: {
        mappingResolved: true,
        configResolved: true,
        locationConfigured: config.locationId === TARGET_LOCATION_ID,
        pipelineConfigured: Boolean(config.pipelineId),
        stageConfigured: Boolean(config.stageId),
        credentialConfigured: Boolean(config.credentialRef),
      },
      writeGateStatus: {
        ghlContactWritesEnabled: process.env.GHL_CONTACT_WRITES_ENABLED === "true",
        ghlOpportunityWritesEnabled: process.env.GHL_OPPORTUNITY_WRITES_ENABLED === "true",
        ghlProvisioningWritesEnabled: process.env.GHL_PROVISIONING_WRITES_ENABLED === "true",
        ghlAutoProvisioningEnabled: process.env.GHL_AUTO_PROVISIONING_ENABLED === "true",
        ghlWorkflowEnrollmentEnabled: process.env.GHL_WORKFLOW_ENROLLMENT_ENABLED === "true",
      },
      crmSyncResult: {
        ...(crmSyncResult as Record<string, unknown>),
        contactId: undefined,
        opportunityId: undefined,
        ghlContactIdMasked: maskExternalId((crmSyncResult as { contactId?: unknown }).contactId),
        ghlOpportunityIdMasked: maskExternalId((crmSyncResult as { opportunityId?: unknown }).opportunityId),
      },
      event,
      rowCountDelta: diffCounts(beforeCounts, afterCounts),
      proofEventDelta: afterProofEvents - beforeProofEvents,
      safety: {
        internalBearerRequired: true,
        envGate: "PARTNER_CRM_SYNC_LIVE_CONTACT_PROOF_ENABLED",
        contactWriteGate: "GHL_CONTACT_WRITES_ENABLED",
        opportunityWriteGate: "GHL_OPPORTUNITY_WRITES_ENABLED",
        publicLeadCreated: false,
        processedRealSystemJob: false,
        smsEmailSent: false,
        metaMutation: false,
        stripeBillingProviderAction: false,
        providerGeneration: false,
        opportunityCreation: Boolean((crmSyncResult as { opportunityId?: unknown }).opportunityId),
        provisioning: false,
        workflowEnrollment: false,
        workflowEnrollmentRetired: true,
        tokensExposed: false,
        credentialRefsExposed: false,
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return handleApiError(error, "Partner CRM live contact proof");
  }
}
