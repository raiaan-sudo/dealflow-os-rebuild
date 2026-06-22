import {
  ApiError,
  apiSuccess,
  assertInternalSystemRequest,
  handleApiError,
} from "@/lib/api/route";
import { runLeadSideEffects } from "@/lib/services/system-job-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function assertProofEnabled() {
  if (process.env.LEAD_SIDE_EFFECTS_CRM_PROOF_ENABLED !== "true") {
    throw new ApiError(404, "Lead side-effects CRM proof harness is not enabled.", "lead_side_effects_crm_proof_disabled");
  }
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function timingSafeTokenEquals(candidate: string | null, expected: string) {
  if (!candidate || !expected) {
    return false;
  }

  let mismatch = candidate.length ^ expected.length;
  const length = Math.max(candidate.length, expected.length);

  for (let index = 0; index < length; index += 1) {
    mismatch |= candidate.charCodeAt(index % candidate.length) ^ expected.charCodeAt(index % expected.length);
  }

  return mismatch === 0;
}

function assertProofRequest(request: Request) {
  try {
    assertInternalSystemRequest(request);
    return;
  } catch (error) {
    const proofSecret = process.env.LEAD_SIDE_EFFECTS_CRM_PROOF_SECRET?.trim();
    const token = getBearerToken(request) ?? request.headers.get("x-internal-system-key")?.trim() ?? null;

    if (proofSecret && timingSafeTokenEquals(token, proofSecret)) {
      return;
    }

    throw error;
  }
}

export async function POST(request: Request) {
  try {
    assertProofRequest(request);
    assertProofEnabled();

    const requestId = crypto.randomUUID();
    const calls: string[] = [];
    const logEvents: Array<{ eventName: string; hasCrmSyncResult: boolean }> = [];
    const payload = {
      requestId,
      lead: {
        id: "lead-side-effects-crm-proof-lead",
        organization_id: "lead-side-effects-crm-proof-org",
        campaign_id: "lead-side-effects-crm-proof-campaign",
        name: "Lead Side Effects CRM Proof",
        email: "qa+lead-side-effects-crm-proof@example.com",
        phone: null,
        source: "lead_side_effects_crm_proof",
      },
      metaConversion: {
        organizationId: "lead-side-effects-crm-proof-org",
        leadId: "lead-side-effects-crm-proof-lead",
        campaignId: "lead-side-effects-crm-proof-campaign",
        email: "qa+lead-side-effects-crm-proof@example.com",
      },
    };

    const result = await runLeadSideEffects({
      payload,
      jobId: "lead-side-effects-crm-proof-job",
      deps: {
        getCampaignEntitlementsForOrganization: async () => ({
          canCaptureLeads: true,
          canSendLeadAlerts: true,
          billingState: "proof_active",
        }),
        safeNotifyAssignedAgentOfNewLead: async (lead) => {
          calls.push(`sms_stub:${lead.id}`);
          return {
            notified: false,
            reason: "proof_sms_stub_no_send",
          };
        },
        safeSendMetaLeadConversion: async (params) => {
          calls.push(`meta_stub:${params.leadId}`);
          return {
            sent: false,
            reason: "proof_meta_stub_no_mutation",
          };
        },
        safeSyncLeadToPartnerCrm: async (lead) => {
          calls.push(`crm_stub:${lead.id}`);
          return {
            synced: false,
            skipped: true,
            reason: "proof_ghl_writes_disabled_stub",
            dryRun: true,
          };
        },
        logOperationalEvent: (eventName, details) => {
          logEvents.push({
            eventName,
            hasCrmSyncResult: Boolean(
              details &&
              typeof details === "object" &&
              !Array.isArray(details) &&
              "crmSyncResult" in details
            ),
          });
        },
      },
    });

    return apiSuccess({
      success: true,
      proof: "lead_side_effects_crm_production_dry",
      requestId,
      result,
      calls,
      logEvents,
      safety: {
        internalBearerRequired: true,
        envGate: "LEAD_SIDE_EFFECTS_CRM_PROOF_ENABLED",
        proofSecretAccepted: Boolean(process.env.LEAD_SIDE_EFFECTS_CRM_PROOF_SECRET?.trim()),
        processedRealSystemJob: false,
        createdRealLead: false,
        createdSystemJob: false,
        liveGhlCall: false,
        smsEmailSent: false,
        metaMutation: false,
        stripeBillingProviderAction: false,
        provisioning: false,
        workflowEnrollment: false,
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return handleApiError(error, "Lead side-effects CRM proof harness");
  }
}
