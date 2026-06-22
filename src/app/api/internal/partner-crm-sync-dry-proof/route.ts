import {
  ApiError,
  apiSuccess,
  assertInternalSystemRequest,
  handleApiError,
} from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  readWorkspaceGhlConfig,
  safeSyncLeadToPartnerCrm,
} from "@/lib/services/partner-crm-sync-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type UntypedAdminClient = {
  from: (table: string) => any;
};
type MappingRow = {
  workspace_id: string;
  partner_id: string;
  sync_enabled: boolean | null;
  ghl_location_id: string | null;
  ghl_pipeline_id: string | null;
  ghl_stage_id: string | null;
};

const AUDITED_TABLES = [
  "leads",
  "system_jobs",
  "lead_crm_sync_events",
  "ghl_provisioning_jobs",
  "ghl_provisioning_events",
  "workspace_ghl_users",
] as const;

function assertProofEnabled() {
  if (process.env.PARTNER_CRM_SYNC_DRY_PROOF_ENABLED !== "true") {
    throw new ApiError(404, "Partner CRM sync dry proof harness is not enabled.", "partner_crm_sync_dry_proof_disabled");
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
    const proofSecret = process.env.PARTNER_CRM_SYNC_DRY_PROOF_SECRET?.trim();
    const token = getBearerToken(request) ?? request.headers.get("x-internal-system-key")?.trim() ?? null;

    if (proofSecret && timingSafeTokenEquals(token, proofSecret)) {
      return;
    }

    throw error;
  }
}

function getAdminClient() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service-role client is not configured.", "service_role_missing");
  }

  return admin;
}

function db(admin: AdminClient) {
  return admin as unknown as UntypedAdminClient;
}

async function countTableRows(admin: AdminClient) {
  const entries = await Promise.all(
    AUDITED_TABLES.map(async (table) => {
      const { count, error } = await db(admin)
        .from(table)
        .select("id", { count: "exact", head: true });

      if (error) {
        throw new ApiError(500, error.message, `${table}_count_failed`);
      }

      return [table, count ?? 0] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<(typeof AUDITED_TABLES)[number], number>;
}

function diffCounts(before: Record<string, number>, after: Record<string, number>) {
  return Object.fromEntries(
    AUDITED_TABLES.map((table) => [table, (after[table] ?? 0) - (before[table] ?? 0)]),
  );
}

async function findConfiguredMapping(admin: AdminClient) {
  const { data, error } = await db(admin)
    .from("workspace_ghl_mapping")
    .select("workspace_id, partner_id, sync_enabled, ghl_location_id, ghl_pipeline_id, ghl_stage_id")
    .eq("sync_enabled", true)
    .limit(25);

  if (error) {
    throw new ApiError(500, error.message, "workspace_ghl_mapping_lookup_failed");
  }

  for (const row of (Array.isArray(data) ? data as MappingRow[] : [])) {
    const config = await readWorkspaceGhlConfig({
      supabase: admin,
      workspaceId: row.workspace_id,
      partnerId: row.partner_id,
    });

    if (config) {
      return {
        row,
        config,
      };
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    assertProofRequest(request);
    assertProofEnabled();

    const requestId = crypto.randomUUID();
    const admin = getAdminClient();
    const beforeCounts = await countTableRows(admin);
    const resolved = await findConfiguredMapping(admin);

    if (!resolved) {
      return apiSuccess({
        success: true,
        proof: "partner_crm_sync_real_service_dry",
        requestId,
        crmSyncResult: {
          synced: false,
          skipped: true,
          reason: "crm_not_configured",
        },
        resolution: {
          mappingResolved: false,
          configResolved: false,
        },
        safety: {
          internalBearerRequired: true,
          envGate: "PARTNER_CRM_SYNC_DRY_PROOF_ENABLED",
          liveGhlCall: false,
          createdRealLead: false,
          createdSystemJob: false,
          smsEmailSent: false,
          metaMutation: false,
          stripeBillingProviderAction: false,
          provisioning: false,
          workflowEnrollment: false,
          tokensExposed: false,
          credentialRefsExposed: false,
        },
        rowCountDelta: diffCounts(beforeCounts, await countTableRows(admin)),
      }, {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      });
    }

    const { row, config } = resolved;
    const syntheticLeadId = `crm-dry-proof-${requestId}`;
    const crmSyncResult = await safeSyncLeadToPartnerCrm({
      id: syntheticLeadId,
      organization_id: config.workspaceId,
      campaign_id: "partner-crm-sync-dry-proof",
      campaign_name: "Partner CRM Sync Dry Proof",
      name: "Partner CRM Sync Dry Proof",
      email: "qa+partner-crm-sync-dry-proof@example.com",
      phone: null,
      source: "partner_crm_sync_dry_proof",
      lead_type: "qa_proof",
      created_at: new Date().toISOString(),
    }, {
      partnerId: config.partnerId,
      dryRun: true,
      writeEventLedger: false,
    });
    const afterCounts = await countTableRows(admin);

    return apiSuccess({
      success: true,
      proof: "partner_crm_sync_real_service_dry",
      requestId,
      resolvedWorkspaceId: config.workspaceId,
      resolvedPartnerId: config.partnerId,
      resolution: {
        mappingResolved: true,
        configResolved: true,
        mappingSyncEnabled: row.sync_enabled === true,
        locationConfigured: Boolean(config.locationId),
        pipelineConfigured: Boolean(config.pipelineId),
        stageConfigured: Boolean(config.stageId),
        configEnabled: true,
        credentialConfigured: Boolean(config.credentialRef),
      },
      writeGateStatus: {
        dryRun: true,
        writeEventLedger: false,
        ghlProvisioningWritesEnabled: process.env.GHL_PROVISIONING_WRITES_ENABLED === "true",
        ghlAutoProvisioningEnabled: process.env.GHL_AUTO_PROVISIONING_ENABLED === "true",
        ghlWorkflowEnrollmentEnabled: process.env.GHL_WORKFLOW_ENROLLMENT_ENABLED === "true",
      },
      crmSyncResult,
      rowCountDelta: diffCounts(beforeCounts, afterCounts),
      safety: {
        internalBearerRequired: true,
        envGate: "PARTNER_CRM_SYNC_DRY_PROOF_ENABLED",
        processedRealSystemJob: false,
        createdRealLead: false,
        createdSystemJob: false,
        liveGhlCall: false,
        smsEmailSent: false,
        metaMutation: false,
        stripeBillingProviderAction: false,
        provisioning: false,
        workflowEnrollment: false,
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
    return handleApiError(error, "Partner CRM sync dry proof harness");
  }
}
