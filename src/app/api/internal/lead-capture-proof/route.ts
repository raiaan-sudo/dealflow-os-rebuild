import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertInternalSystemRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APPLY_CONFIRMATION = "APPLY_LEAD_CAPTURE_PROOF";
const CLEANUP_CONFIRMATION = "CLEANUP_LEAD_CAPTURE_PROOF";
const PROOF_SOURCE_PREFIX = "lead_capture_full_go_proof";

const proofSchema = z.object({
  action: z.enum(["status", "apply", "cleanup"]).default("status"),
  proofRunId: z.string().trim().regex(/^[a-zA-Z0-9_-]{8,120}$/),
  confirmation: z.string().trim().optional(),
  funnelSlug: z.string().trim().min(1).max(160).default("raiaan-broker-toronto-on-ccbfbfce"),
  campaignId: z.string().uuid().optional(),
  email: z.string().trim().email().refine(
    (value) => value.toLowerCase().startsWith("qa+dealflow-fullgo-") && value.toLowerCase().endsWith("@example.com"),
    "Proof email must be a qa+dealflow-fullgo-* @example.com address.",
  ),
}).strict();

type ProofInput = z.infer<typeof proofSchema>;
type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type CampaignProofRow = {
  id: string;
  organization_id: string;
  user_id: string | null;
  owner_id: string | null;
  public_slug: string | null;
  partner_id: string | null;
};

type LeadProofRow = {
  id: string;
  organization_id: string | null;
  campaign_id: string | null;
  user_id: string | null;
  email: string | null;
  source: string | null;
};

function assertHarnessEnabled() {
  if (process.env.LEAD_CAPTURE_PROOF_HARNESS_ENABLED !== "true") {
    throw new ApiError(404, "Lead capture proof harness is not enabled.", "lead_capture_proof_harness_disabled");
  }
}

function getAdminClient() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  return admin;
}

function proofSource(proofRunId: string) {
  return `${PROOF_SOURCE_PREFIX}:${proofRunId}`;
}

function proofMetadata(proofRunId: string, requestId: string) {
  return {
    proof_run_id: proofRunId,
    proof_type: "lead_capture_full_go",
    request_id: requestId,
    side_effects_skipped: true,
    sms_email_skipped: true,
    meta_skipped: true,
    stripe_billing_skipped: true,
    provider_generation_skipped: true,
    ghl_crm_sync_skipped: true,
  };
}

async function loadCampaign(admin: AdminClient, input: ProofInput) {
  let query = (admin.from("campaign_plans") as any)
    .select("id, organization_id, user_id, owner_id, public_slug, partner_id")
    .limit(1);

  query = input.campaignId
    ? query.eq("id", input.campaignId)
    : query.eq("public_slug", input.funnelSlug);

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new ApiError(500, error.message, "campaign_lookup_failed");
  }

  const campaign = data as CampaignProofRow | null;
  if (!campaign?.id || !campaign.organization_id) {
    throw new ApiError(404, "Proof campaign was not found.", "proof_campaign_not_found");
  }

  return campaign;
}

async function loadProofLeads(admin: AdminClient, proofRunId: string) {
  const { data, error } = await (admin.from("leads") as any)
    .select("id, organization_id, campaign_id, user_id, email, source")
    .eq("source", proofSource(proofRunId))
    .contains("metadata", { proof_run_id: proofRunId });

  if (error) {
    throw new ApiError(500, error.message, "proof_lead_lookup_failed");
  }

  return Array.isArray(data) ? data as LeadProofRow[] : [];
}

async function countByLeadIds(admin: AdminClient, table: string, leadIds: string[]) {
  if (leadIds.length === 0) {
    return 0;
  }

  const { count, error } = await (admin.from(table) as any)
    .select("id", { count: "exact", head: true })
    .in("lead_id", leadIds);

  if (error) {
    throw new ApiError(500, error.message, `${table}_proof_count_failed`);
  }

  return count ?? 0;
}

async function countProofSystemJobs(admin: AdminClient, leads: LeadProofRow[]) {
  const keys = leads.flatMap((lead) => {
    if (!lead.id || !lead.organization_id || !lead.campaign_id) {
      return [];
    }

    return [
      `lead_side_effects:${lead.id}`,
      `performance_lead_billing:${lead.organization_id}:${lead.campaign_id}:${lead.id}`,
    ];
  });

  if (keys.length === 0) {
    return 0;
  }

  const { count, error } = await (admin.from("system_jobs") as any)
    .select("id", { count: "exact", head: true })
    .in("idempotency_key", keys);

  if (error) {
    throw new ApiError(500, error.message, "proof_system_job_count_failed");
  }

  return count ?? 0;
}

async function buildVerification(admin: AdminClient, proofRunId: string) {
  const leads = await loadProofLeads(admin, proofRunId);
  const leadIds = leads.map((lead) => lead.id).filter(Boolean);
  const [systemJobCount, leadNotificationCount, crmEventCount] = await Promise.all([
    countProofSystemJobs(admin, leads),
    countByLeadIds(admin, "lead_notifications", leadIds),
    countByLeadIds(admin, "lead_crm_sync_events", leadIds),
  ]);

  return {
    proofRunId,
    leadCount: leads.length,
    leadIds: leads.map(() => "[redacted]"),
    sideEffectSystemJobCount: systemJobCount,
    leadNotificationCount,
    crmSyncEventCount: crmEventCount,
    noSideEffectsQueued: systemJobCount === 0 && leadNotificationCount === 0 && crmEventCount === 0,
  };
}

async function applyProof(admin: AdminClient, input: ProofInput, requestId: string) {
  if (input.confirmation !== APPLY_CONFIRMATION) {
    throw new ApiError(403, "Apply confirmation is required.", "lead_capture_proof_apply_confirmation_required");
  }

  const existing = await loadProofLeads(admin, input.proofRunId);
  if (existing.length > 0) {
    throw new ApiError(409, "Proof lead already exists for this proof run.", "lead_capture_proof_already_exists");
  }

  const campaign = await loadCampaign(admin, input);
  const leadId = crypto.randomUUID();
  const now = new Date().toISOString();
  const lead = {
    id: leadId,
    organization_id: campaign.organization_id,
    tenant_id: campaign.organization_id,
    campaign_id: campaign.id,
    user_id: campaign.user_id,
    partner_id: campaign.partner_id,
    first_name: "QA",
    last_name: "Full GO Proof",
    name: "QA Full GO Lead Capture Proof",
    email: input.email.toLowerCase(),
    phone: null,
    source: proofSource(input.proofRunId),
    status: "new",
    estimated_value: 0,
    notes: "Controlled internal lead capture proof. Do not contact. Side effects intentionally skipped.",
    campaign_name: campaign.public_slug ?? "lead-capture-proof",
    lead_type: "qa_proof",
    created_at: now,
    updated_at: now,
    metadata: proofMetadata(input.proofRunId, requestId),
    consent_metadata: {
      proof_run_id: input.proofRunId,
      consent_source: "internal_lead_capture_proof_harness",
      sms_consent: false,
    },
  };

  const { error } = await (admin.from("leads") as any).insert([lead]);
  if (error) {
    throw new ApiError(500, error.message, "proof_lead_insert_failed");
  }

  return {
    inserted: true,
    campaign: {
      id: campaign.id,
      organizationId: campaign.organization_id,
      userId: campaign.user_id,
      publicSlug: campaign.public_slug,
    },
    verification: await buildVerification(admin, input.proofRunId),
  };
}

async function cleanupProof(admin: AdminClient, input: ProofInput) {
  if (input.confirmation !== CLEANUP_CONFIRMATION) {
    throw new ApiError(403, "Cleanup confirmation is required.", "lead_capture_proof_cleanup_confirmation_required");
  }

  const before = await buildVerification(admin, input.proofRunId);
  if (!before.noSideEffectsQueued) {
    throw new ApiError(
      409,
      "Refusing cleanup because side-effect rows exist for this proof run.",
      "lead_capture_proof_side_effects_detected",
    );
  }

  const { data, error } = await (admin.from("leads") as any)
    .delete()
    .eq("source", proofSource(input.proofRunId))
    .contains("metadata", { proof_run_id: input.proofRunId })
    .like("email", "qa+dealflow-fullgo-%@example.com")
    .select("id");

  if (error) {
    throw new ApiError(500, error.message, "proof_lead_cleanup_failed");
  }

  return {
    deletedLeadCount: Array.isArray(data) ? data.length : 0,
    before,
    after: await buildVerification(admin, input.proofRunId),
  };
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    assertInternalSystemRequest(request);
    assertHarnessEnabled();

    const input = await parseJsonBody(request, proofSchema, {
      maxBytes: 16 * 1024,
      code: "lead_capture_proof_body_too_large",
    });
    const admin = getAdminClient();

    if (input.action === "apply") {
      return apiSuccess({ success: true, requestId, action: input.action, ...(await applyProof(admin, input, requestId)) }, {
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
      });
    }

    if (input.action === "cleanup") {
      return apiSuccess({ success: true, requestId, action: input.action, ...(await cleanupProof(admin, input)) }, {
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
      });
    }

    return apiSuccess({
      success: true,
      requestId,
      action: input.action,
      verification: await buildVerification(admin, input.proofRunId),
      safety: {
        internalBearerRequired: true,
        envGate: "LEAD_CAPTURE_PROOF_HARNESS_ENABLED",
        publicLeadCaptureUntouched: true,
        queueLeadSideEffectsJobSkipped: true,
        queuePerformanceLeadBillingJobSkipped: true,
        smsEmailSkipped: true,
        metaSkipped: true,
        stripeBillingSkipped: true,
        providerGenerationSkipped: true,
        ghlCrmSyncSkipped: true,
      },
    }, {
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  } catch (error) {
    return handleApiError(error, "Internal lead capture proof harness");
  }
}
