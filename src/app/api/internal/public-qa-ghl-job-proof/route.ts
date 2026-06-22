import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import {
  claimSystemJobByIdForWorker,
  processSystemJob,
} from "@/lib/services/system-job-service";
import { safeSyncLeadToPartnerCrm } from "@/lib/services/partner-crm-sync-service";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LEGACY_PROOF_RUN_ID = "public_qa_funnel_to_ghl_contact_20260618_01";
const LEGACY_PROOF_JOB_ID = "9f745251-ac60-45d5-9e0d-617715aeb171";
const LEGACY_PROOF_LEAD_ID = "e7fe6165-f3c5-4fde-8417-4f058326f5b6";
const FULFILLMENT_V1_PROOF_RUN_ID = "ghl_fulfillment_v1_20260618_01";
const FULFILLMENT_V1_QA_EMAIL = "qa+ghl-fulfillment-v1-20260618@example.com";
const PUBLIC_OPPORTUNITY_PROOF_RUN_ID = "public_lead_to_ghl_contact_opportunity_20260618_01";
const PUBLIC_OPPORTUNITY_QA_EMAIL = "qa+public-contact-opportunity-20260618-01@example.com";
const MANUAL_TURNSTILE_PUBLIC_GHL_PROOF_RUN_ID = "manual_turnstile_public_lead_to_ghl_20260618_01";
const MANUAL_TURNSTILE_PUBLIC_GHL_QA_EMAIL = "qa+manual-turnstile-ghl-sync-20260618-01@example.com";
const ORIGINAL_JOB_PUBLIC_GHL_PROOF_RUN_ID = "original_job_public_lead_to_ghl_contact_opportunity_20260618_01";
const ORIGINAL_JOB_PUBLIC_GHL_QA_EMAIL = "qa+original-job-ghl-sync-20260618-01@example.com";
const PROOF_WORKSPACE_ID = "2e3b0144-23a9-483a-9e11-61173b4099c4";
const PROOF_CAMPAIGN_ID = "acbf7508-b782-479e-bc0e-841ffc421818";

const bodySchema = z.object({
  action: z.enum(["process", "crm-idempotency"]).default("process"),
  proofRunId: z.enum([
    LEGACY_PROOF_RUN_ID,
    FULFILLMENT_V1_PROOF_RUN_ID,
    PUBLIC_OPPORTUNITY_PROOF_RUN_ID,
    MANUAL_TURNSTILE_PUBLIC_GHL_PROOF_RUN_ID,
    ORIGINAL_JOB_PUBLIC_GHL_PROOF_RUN_ID,
  ]),
  jobId: z.string().uuid(),
  leadId: z.string().uuid().optional(),
  email: z.string().trim().email().optional(),
}).strict();

type UntypedAdminClient = {
  from: (table: string) => any;
};

function db() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service-role client is not configured.", "service_role_missing");
  }

  return admin as unknown as UntypedAdminClient;
}

function safeEquals(candidate: string | null, expected: string) {
  if (!candidate || !expected) {
    return false;
  }

  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function assertProofRequest(request: Request) {
  if (process.env.QA_GHL_JOB_PROOF_ENABLED !== "true") {
    throw new ApiError(404, "Public QA GHL job proof is not enabled.", "public_qa_ghl_job_proof_disabled");
  }

  const expected = process.env.QA_GHL_JOB_PROOF_SECRET?.trim() ?? "";
  const provided =
    request.headers.get("x-dealflow-proof-secret")?.trim() ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    null;

  if (expected.length < 32 || !safeEquals(provided, expected)) {
    throw new ApiError(401, "Proof authorization is required.", "public_qa_ghl_job_proof_unauthorized");
  }
}

function assertGates(proofRunId: string) {
  if (process.env.GHL_CONTACT_WRITES_ENABLED !== "true") {
    throw new ApiError(409, "GHL contact writes must be enabled for this proof.", "ghl_contact_writes_disabled");
  }

  if (
    (proofRunId === PUBLIC_OPPORTUNITY_PROOF_RUN_ID ||
      proofRunId === MANUAL_TURNSTILE_PUBLIC_GHL_PROOF_RUN_ID ||
      proofRunId === ORIGINAL_JOB_PUBLIC_GHL_PROOF_RUN_ID) &&
    process.env.GHL_OPPORTUNITY_WRITES_ENABLED !== "true"
  ) {
    throw new ApiError(409, "GHL opportunity writes must be enabled for this proof.", "ghl_opportunity_writes_disabled");
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

type ProofJobPayloadLead = {
  id?: unknown;
  organization_id?: unknown;
  campaign_id?: unknown;
  campaign_name?: unknown;
  name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
  phone?: unknown;
  phone_raw?: unknown;
  phone_e164?: unknown;
  source?: unknown;
  lead_type?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  ad_id?: unknown;
  landing_page_url?: unknown;
  created_at?: unknown;
};

function getExpectedTarget(input: z.infer<typeof bodySchema>) {
  if (input.proofRunId === LEGACY_PROOF_RUN_ID) {
    return {
      proofRunId: LEGACY_PROOF_RUN_ID,
      jobId: LEGACY_PROOF_JOB_ID,
      leadId: LEGACY_PROOF_LEAD_ID,
      email: "qa+public-funnel-ghl-sync-20260618-01@example.com",
      source: "lead_capture_load_test",
    };
  }

  if (input.proofRunId === PUBLIC_OPPORTUNITY_PROOF_RUN_ID) {
    return {
      proofRunId: PUBLIC_OPPORTUNITY_PROOF_RUN_ID,
      jobId: input.jobId,
      leadId: input.leadId,
      email: PUBLIC_OPPORTUNITY_QA_EMAIL,
      source: "lead_capture_launched",
    };
  }

  if (input.proofRunId === MANUAL_TURNSTILE_PUBLIC_GHL_PROOF_RUN_ID) {
    return {
      proofRunId: MANUAL_TURNSTILE_PUBLIC_GHL_PROOF_RUN_ID,
      jobId: input.jobId,
      leadId: input.leadId,
      email: MANUAL_TURNSTILE_PUBLIC_GHL_QA_EMAIL,
      source: "lead_capture_launched",
    };
  }

  if (input.proofRunId === ORIGINAL_JOB_PUBLIC_GHL_PROOF_RUN_ID) {
    return {
      proofRunId: ORIGINAL_JOB_PUBLIC_GHL_PROOF_RUN_ID,
      jobId: input.jobId,
      leadId: input.leadId,
      email: ORIGINAL_JOB_PUBLIC_GHL_QA_EMAIL,
      source: "lead_capture_launched",
    };
  }

  return {
    proofRunId: FULFILLMENT_V1_PROOF_RUN_ID,
    jobId: input.jobId,
    leadId: input.leadId,
    email: FULFILLMENT_V1_QA_EMAIL,
    source: "lead_capture_load_test",
  };
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

async function assertProofJob(input: z.infer<typeof bodySchema>) {
  const expected = getExpectedTarget(input);

  if (input.jobId !== expected.jobId) {
    throw new ApiError(409, "Proof job ID does not match the approved proof target.", "proof_job_id_mismatch");
  }

  if (
    input.proofRunId === FULFILLMENT_V1_PROOF_RUN_ID ||
    input.proofRunId === PUBLIC_OPPORTUNITY_PROOF_RUN_ID ||
    input.proofRunId === MANUAL_TURNSTILE_PUBLIC_GHL_PROOF_RUN_ID ||
    input.proofRunId === ORIGINAL_JOB_PUBLIC_GHL_PROOF_RUN_ID
  ) {
    if (!input.leadId || input.leadId !== expected.leadId) {
      throw new ApiError(409, "Proof lead ID is required for this proof.", "proof_lead_id_mismatch");
    }

    if (input.email && normalizeEmail(input.email) !== expected.email) {
      throw new ApiError(409, "Proof email does not match the approved QA contact.", "proof_email_mismatch");
    }
  }

  const { data, error } = await db()
    .from("system_jobs")
    .select("id, kind, status, organization_id, campaign_id, payload")
    .eq("id", input.jobId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "proof_job_lookup_failed");
  }

  const payload = data?.payload && typeof data.payload === "object" && !Array.isArray(data.payload)
    ? data.payload as Record<string, unknown>
    : {};
  const lead = payload.lead && typeof payload.lead === "object" && !Array.isArray(payload.lead)
    ? payload.lead as Record<string, unknown>
    : {};

  if (data?.kind !== "lead_side_effects" || data.organization_id !== PROOF_WORKSPACE_ID || data.campaign_id !== PROOF_CAMPAIGN_ID) {
    throw new ApiError(409, "Proof job does not match the approved lead-side-effects target.", "proof_job_scope_mismatch");
  }

  if (lead.id !== expected.leadId || lead.organization_id !== PROOF_WORKSPACE_ID || lead.campaign_id !== PROOF_CAMPAIGN_ID) {
    throw new ApiError(409, "Proof job lead payload does not match the approved target.", "proof_job_lead_scope_mismatch");
  }

  if (normalizeEmail(lead.email) !== expected.email || lead.source !== expected.source) {
    throw new ApiError(409, "Proof job lead identity does not match the approved QA lead.", "proof_job_lead_identity_mismatch");
  }

  return {
    ...(data as { id: string; status: string }),
    lead: lead as ProofJobPayloadLead,
  };
}

export async function POST(request: Request) {
  try {
    assertProofRequest(request);
    assertSameOriginRequest(request);
    const input = await parseJsonBody(request, bodySchema, {
      code: "public_qa_ghl_job_proof_body_invalid",
    });
    assertGates(input.proofRunId);
    const currentJob = await assertProofJob(input);

    if (input.action === "crm-idempotency") {
      const crmSyncResult = await safeSyncLeadToPartnerCrm({
        id: String(currentJob.lead.id),
        organization_id: PROOF_WORKSPACE_ID,
        tenant_id: PROOF_WORKSPACE_ID,
        campaign_id: PROOF_CAMPAIGN_ID,
        campaign_name: typeof currentJob.lead.campaign_name === "string" ? currentJob.lead.campaign_name : "GHL public contact opportunity proof",
        name: typeof currentJob.lead.name === "string" ? currentJob.lead.name : "QA Public Contact Opportunity 20260618 01",
        first_name: typeof currentJob.lead.first_name === "string" ? currentJob.lead.first_name : "QA",
        last_name: typeof currentJob.lead.last_name === "string" ? currentJob.lead.last_name : "Public Contact Opportunity 20260618 01",
        email: normalizeEmail(currentJob.lead.email),
        phone: null,
        phone_raw: null,
        phone_e164: null,
        source: typeof currentJob.lead.source === "string" ? currentJob.lead.source : "lead_capture_load_test",
        lead_type: typeof currentJob.lead.lead_type === "string" ? currentJob.lead.lead_type : null,
        utm_source: typeof currentJob.lead.utm_source === "string" ? currentJob.lead.utm_source : null,
        utm_medium: typeof currentJob.lead.utm_medium === "string" ? currentJob.lead.utm_medium : null,
        utm_campaign: typeof currentJob.lead.utm_campaign === "string" ? currentJob.lead.utm_campaign : null,
        ad_id: typeof currentJob.lead.ad_id === "string" ? currentJob.lead.ad_id : null,
        landing_page_url: typeof currentJob.lead.landing_page_url === "string" ? currentJob.lead.landing_page_url : null,
        created_at: typeof currentJob.lead.created_at === "string" ? currentJob.lead.created_at : null,
      }, {
        dryRun: false,
        metadata: {
          proof_run_id: input.proofRunId,
          proof_type:
            input.proofRunId === PUBLIC_OPPORTUNITY_PROOF_RUN_ID ||
            input.proofRunId === MANUAL_TURNSTILE_PUBLIC_GHL_PROOF_RUN_ID ||
            input.proofRunId === ORIGINAL_JOB_PUBLIC_GHL_PROOF_RUN_ID
            ? "public_lead_to_ghl_contact_opportunity_idempotency"
            : "ghl_fulfillment_v1_idempotency",
          source: "public_qa_ghl_job_proof_idempotency",
          systemJobId: currentJob.id,
        },
      });
      const crmResult = crmSyncResult as { opportunityId?: unknown };

      return apiSuccess({
        proofRunId: input.proofRunId,
        action: input.action,
        processedRealSystemJob: false,
        createdRealLead: false,
        createdSystemJob: false,
        smsEmailSent: false,
        metaMutation: false,
        stripeBillingProviderAction: false,
        providerGeneration: false,
        opportunityCreation: Boolean(crmResult.opportunityId),
        provisioning: false,
        workflowEnrollment: false,
        tokensExposed: false,
        credentialRefsExposed: false,
        crmSyncResult,
      });
    }

    if (currentJob.status !== "pending") {
      throw new ApiError(409, "Proof job must be pending before processing.", "proof_job_not_pending");
    }

    const workerId = `public-qa-ghl-proof:${crypto.randomUUID()}`;
    const claimedJob = await claimSystemJobByIdForWorker({
      jobId: input.jobId,
      workerId,
      ignoreNextRunAt: true,
    });

    if (!claimedJob) {
      throw new ApiError(409, "Proof job could not be claimed.", "proof_job_claim_failed");
    }

    const completedJob = await processSystemJob(input.jobId);

    return apiSuccess({
      proofRunId: input.proofRunId,
      processedRealSystemJob: true,
      createdRealLead: false,
      createdSystemJob: false,
      smsEmailSent: false,
      metaMutation: false,
      stripeBillingProviderAction: false,
      providerGeneration: false,
      opportunityCreation: false,
      provisioning: false,
      workflowEnrollment: false,
      tokensExposed: false,
      credentialRefsExposed: false,
      job: {
        id: completedJob.id,
        kind: completedJob.kind,
        status: completedJob.status,
        result: completedJob.result,
      },
    });
  } catch (error) {
    return handleApiError(error, "Public QA GHL job proof");
  }
}
