import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import {
  isGhlAutoProvisioningEnabled,
  isGhlProvisioningWritesEnabled,
  isGhlWorkflowEnrollmentEnabled,
} from "@/lib/env";
import { getGhlPrivateTokenFromCredentialRef } from "@/lib/integrations/gohighlevel/client";
import { provisionGhlWorkspaceForDealFlowWorkspace } from "@/lib/services/ghl-provisioning-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/white-label/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

const PARTNER_ID = "click_to_scale";
const CREDENTIAL_REF = "CLICKTOSCALE_GHL_PRIVATE_INTEGRATION";

const proofSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  stripeSubscriptionId: z.string().min(3).max(120).optional().nullable(),
  apply: z.boolean().optional().default(false),
}).strict();

type ProofUser = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type ProofWorkspace = {
  id: string;
  name: string | null;
  owner_user_id: string | null;
};

type PartnerGhlConfig = {
  partner_id: string;
  enabled: boolean;
  encrypted_credential_ref: string | null;
  company_id: string | null;
  default_location_id: string | null;
  default_pipeline_id: string | null;
  default_stage_id: string | null;
};

function isQaProofEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase() ?? "";
  return (
    normalized.endsWith("@agentdealflow.test") ||
    normalized.startsWith("qa+") ||
    normalized.includes("+qa")
  );
}

function serializeProofResult(result: Awaited<ReturnType<typeof provisionGhlWorkspaceForDealFlowWorkspace>>) {
  return {
    provisioned: result.provisioned,
    skipped: result.skipped,
    reusedExisting: "reusedExisting" in result ? result.reusedExisting : false,
    reason: "reason" in result ? result.reason : null,
    jobId: result.jobId,
    locationIdCreated: Boolean("locationId" in result && result.locationId),
    userIdCreated: Boolean("userId" in result && result.userId),
  };
}

async function loadState() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const [{ data: config, error: configError }, { data: failedJobs, error: failedJobsError }] = await Promise.all([
    admin
      .from("partner_ghl_config")
      .select("partner_id, enabled, encrypted_credential_ref, company_id, default_location_id, default_pipeline_id, default_stage_id")
      .eq("partner_id", PARTNER_ID)
      .maybeSingle(),
    admin
      .from("system_jobs")
      .select("id, status, last_error_code, reviewed_at, created_at")
      .eq("kind", "ghl_workspace_provisioning")
      .in("status", ["failed", "dead_letter"])
      .is("reviewed_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (configError) {
    throw new ApiError(500, configError.message, "ghl_partner_config_fetch_failed");
  }
  if (failedJobsError) {
    throw new ApiError(500, failedJobsError.message, "ghl_failed_jobs_fetch_failed");
  }

  const partnerConfig = config as PartnerGhlConfig | null;
  return {
    admin,
    config: partnerConfig,
    status: {
      partnerConfigExists: Boolean(partnerConfig),
      partnerConfigEnabled: partnerConfig?.enabled === true,
      credentialRefExpected: partnerConfig?.encrypted_credential_ref === CREDENTIAL_REF,
      companyIdConfigured: Boolean(partnerConfig?.company_id?.trim()),
      tokenConfigured: Boolean(getGhlPrivateTokenFromCredentialRef(CREDENTIAL_REF)),
      autoProvisioningEnabled: isGhlAutoProvisioningEnabled(),
      writesEnabled: isGhlProvisioningWritesEnabled(),
      workflowEnrollmentEnabled: isGhlWorkflowEnrollmentEnabled(),
      defaultLocationConfigured: Boolean(partnerConfig?.default_location_id?.trim()),
      defaultPipelineConfigured: Boolean(partnerConfig?.default_pipeline_id?.trim()),
      defaultStageConfigured: Boolean(partnerConfig?.default_stage_id?.trim()),
      unreviewedFailedJobCount: (failedJobs ?? []).length,
      failedJobs: (failedJobs ?? []).map((job) => ({
        id: String((job as { id: string }).id),
        status: String((job as { status: string }).status),
        lastErrorCode: (job as { last_error_code?: string | null }).last_error_code ?? null,
      })),
    },
  };
}

async function loadQaProofTarget(admin: NonNullable<ReturnType<typeof createAdminClient>>, input: z.infer<typeof proofSchema>) {
  const [{ data: workspace, error: workspaceError }, { data: user, error: userError }] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, owner_user_id")
      .eq("id", input.workspaceId)
      .maybeSingle(),
    admin
      .from("users")
      .select("id, email, full_name")
      .eq("id", input.userId)
      .maybeSingle(),
  ]);

  if (workspaceError) {
    throw new ApiError(500, workspaceError.message, "workspace_lookup_failed");
  }
  if (userError) {
    throw new ApiError(500, userError.message, "user_lookup_failed");
  }

  const proofWorkspace = workspace as ProofWorkspace | null;
  const proofUser = user as ProofUser | null;
  if (!proofWorkspace?.id || !proofUser?.id) {
    throw new ApiError(404, "QA proof workspace or user was not found.", "qa_proof_target_not_found");
  }
  if (proofWorkspace.owner_user_id !== proofUser.id) {
    throw new ApiError(403, "QA proof workspace must belong to the selected user.", "qa_proof_owner_mismatch");
  }
  if (!isQaProofEmail(proofUser.email)) {
    throw new ApiError(403, "GHL proof only allows QA/test users.", "qa_proof_user_required");
  }

  return {
    workspace: proofWorkspace,
    user: proofUser,
  };
}

export async function GET() {
  try {
    await requirePlatformAdmin();
    const state = await loadState();
    return apiSuccess({
      success: true,
      partnerId: PARTNER_ID,
      status: state.status,
      safety: {
        printedSecrets: false,
        calledGhl: false,
        mutatedDatabase: false,
        externalWriteAttempted: false,
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return handleApiError(error, "Click to Scale GHL proof status");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const auth = await requirePlatformAdmin();
    const input = await parseJsonBody(request, proofSchema);
    const state = await loadState();
    const target = await loadQaProofTarget(state.admin, input);
    const result = await provisionGhlWorkspaceForDealFlowWorkspace({
      source: "admin",
      workspaceId: target.workspace.id,
      userId: target.user.id,
      partnerId: PARTNER_ID,
      stripeSubscriptionId: input.stripeSubscriptionId ?? `qa-ghl-proof-${target.workspace.id}`,
      customerEmail: target.user.email,
      customerName: target.user.full_name,
      workspaceName: target.workspace.name,
      apply: input.apply,
    });

    return apiSuccess({
      success: true,
      actor: {
        userId: auth.user.id,
      },
      partnerId: PARTNER_ID,
      applyRequested: input.apply,
      writesEnabled: state.status.writesEnabled,
      proof: serializeProofResult(result),
      safety: {
        printedSecrets: false,
        externalWriteAttempted: input.apply && state.status.writesEnabled,
        workflowEnrollmentAttempted: false,
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return handleApiError(error, "Click to Scale GHL proof run");
  }
}
