import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/white-label/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const proofSchema = z.object({
  partnerSlug: z.string().trim().min(1).max(80).default("click-to-scale"),
  workspaceId: z.string().uuid(),
  campaignId: z.string().uuid().optional().nullable(),
  leadId: z.string().uuid().optional().nullable(),
  apply: z.boolean().optional().default(false),
}).strict();

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type TableResponse = Promise<{ data: unknown; error: { message: string } | null }>;
type TableBuilder = {
  select: (...args: unknown[]) => TableBuilder;
  eq: (...args: unknown[]) => TableBuilder;
  in: (...args: unknown[]) => TableBuilder;
  maybeSingle: () => TableResponse;
  order: (...args: unknown[]) => TableBuilder;
  limit: (...args: unknown[]) => TableBuilder;
  then: TableResponse["then"];
};
type UntypedAdminClient = {
  from: (table: string) => TableBuilder;
};

function db(admin: AdminClient) {
  return admin as unknown as UntypedAdminClient;
}

function maskExternalId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : "***";
}

async function requireAdminClient() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  return admin;
}

async function loadPartnerBySlug(admin: AdminClient, slug: string) {
  const { data, error } = await db(admin)
    .from("partners")
    .select("id, slug, brand_name, status")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "partner_lookup_failed");
  }

  const partner = data as { id?: string; slug?: string; brand_name?: string; status?: string } | null;
  if (!partner?.id) {
    throw new ApiError(404, "Partner was not found.", "partner_not_found");
  }

  return {
    id: partner.id,
    slug: partner.slug ?? slug,
    brandName: partner.brand_name ?? slug,
    status: partner.status ?? "unknown",
  };
}

async function loadProofState(admin: AdminClient, params: { partnerId: string; workspaceId: string }) {
  const [
    { data: mapping, error: mappingError },
    { data: failedEvents, error: failedEventsError },
  ] = await Promise.all([
    db(admin)
      .from("workspace_ghl_mapping")
      .select("workspace_id, partner_id, ghl_location_id, ghl_pipeline_id, ghl_stage_id, sync_enabled, updated_at")
      .eq("workspace_id", params.workspaceId)
      .eq("partner_id", params.partnerId)
      .maybeSingle(),
    db(admin)
      .from("lead_crm_sync_events")
      .select("id, workspace_id, status, last_error_code, updated_at")
      .eq("workspace_id", params.workspaceId)
      .eq("partner_id", params.partnerId)
      .in("status", ["failed", "dead_letter"])
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);

  if (mappingError) {
    throw new ApiError(500, mappingError.message, "workspace_ghl_mapping_fetch_failed");
  }
  if (failedEventsError) {
    throw new ApiError(500, failedEventsError.message, "lead_crm_sync_events_fetch_failed");
  }

  const mapped = mapping as {
    workspace_id?: string;
    ghl_location_id?: string | null;
    ghl_pipeline_id?: string | null;
    ghl_stage_id?: string | null;
    sync_enabled?: boolean;
  } | null;

  return {
    mapping: mapped
      ? {
          workspaceId: mapped.workspace_id ?? params.workspaceId,
          syncEnabled: Boolean(mapped.sync_enabled),
          locationMapped: Boolean(mapped.ghl_location_id),
          locationIdMasked: maskExternalId(mapped.ghl_location_id),
          pipelineIdMasked: maskExternalId(mapped.ghl_pipeline_id),
          stageIdMasked: maskExternalId(mapped.ghl_stage_id),
        }
      : null,
    failedLeadSyncEvents: Array.isArray(failedEvents) ? failedEvents : [],
  };
}

async function loadExistingLead(admin: AdminClient, params: { workspaceId: string; leadId?: string | null }) {
  if (!params.leadId) {
    return null;
  }

  const { data, error } = await db(admin)
    .from("leads")
    .select("id, organization_id, tenant_id, campaign_id, email, source, created_at")
    .eq("id", params.leadId)
    .eq("organization_id", params.workspaceId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "lead_fetch_failed");
  }

  if (!data) {
    throw new ApiError(404, "Lead was not found in the requested workspace.", "lead_not_found");
  }

  return data as Record<string, unknown>;
}

export async function GET() {
  try {
    await requirePlatformAdmin();

    return apiSuccess({
      success: true,
      route: "click_to_scale_ghl_lead_sync_proof",
      requiredBody: {
        partnerSlug: "click-to-scale",
        workspaceId: "uuid",
        campaignId: "optional uuid",
        leadId: "optional existing lead uuid",
        apply: false,
      },
      safety: {
        adminOnly: true,
        sameOriginPostRequired: true,
        dryRunDefault: true,
        applyEnabledInThisBatch: false,
        printedSecrets: false,
        calledGhl: false,
        mutatedDatabase: false,
        sentSmsOrEmail: false,
        touchedMetaStripeProviderOrFreshdesk: false,
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return handleApiError(error, "Click to Scale GHL lead-sync proof status");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    await requirePlatformAdmin();
    const admin = await requireAdminClient();
    const body = await parseJsonBody(request, proofSchema);
    const partner = await loadPartnerBySlug(admin, body.partnerSlug);
    const [proofState, existingLead] = await Promise.all([
      loadProofState(admin, { partnerId: partner.id, workspaceId: body.workspaceId }),
      loadExistingLead(admin, { workspaceId: body.workspaceId, leadId: body.leadId }),
    ]);

    if (body.apply) {
      throw new ApiError(409, "Batch 3A only exposes dry-run proof structure. Live GHL sync is intentionally disabled.", "ghl_lead_sync_apply_disabled");
    }

    return apiSuccess({
      success: true,
      dryRun: true,
      partner,
      proofState,
      existingLeadFound: Boolean(existingLead),
      proposedProof: {
        workspaceId: body.workspaceId,
        campaignId: body.campaignId ?? null,
        leadId: body.leadId ?? "dry-run-generated-qa-lead",
        wouldCreateQaLead: !body.leadId,
        wouldSyncToGhl: false,
        blockedReason: "Batch 3A does not wire live lead sync or external GHL calls.",
      },
      safety: {
        printedSecrets: false,
        calledGhl: false,
        mutatedDatabase: false,
        sentSmsOrEmail: false,
        touchedMetaStripeProviderOrFreshdesk: false,
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return handleApiError(error, "Click to Scale GHL lead-sync proof dry-run");
  }
}
