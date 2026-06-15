import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { syncLeadToPartnerCrm, type CrmSyncLeadRecord } from "@/lib/services/partner-crm-sync-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/white-label/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

const PARTNER_ID = "click_to_scale";

const proofSchema = z.object({
  workspaceId: z.string().uuid(),
  campaignId: z.string().uuid().optional().nullable(),
  leadId: z.string().uuid().optional().nullable(),
  apply: z.boolean().optional().default(false),
}).strict();

type WorkspaceMapping = {
  workspace_id: string;
  partner_id: string;
  ghl_location_id: string | null;
  sync_enabled: boolean;
};

type UntypedTableClient = {
  from: (table: string) => any;
};

function db(admin: Awaited<ReturnType<typeof requireAdminClient>>) {
  return admin as unknown as UntypedTableClient;
}

function maskExternalId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function proofEmail() {
  return `qa+click-to-scale-ghl-lead-sync-${Date.now()}@agentdealflow.test`;
}

async function requireAdminClient() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  return admin;
}

async function loadMapping(admin: Awaited<ReturnType<typeof requireAdminClient>>, workspaceId: string) {
  const { data, error } = await db(admin)
    .from("workspace_ghl_mapping")
    .select("workspace_id, partner_id, ghl_location_id, sync_enabled")
    .eq("workspace_id", workspaceId)
    .eq("partner_id", PARTNER_ID)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "workspace_ghl_mapping_fetch_failed");
  }

  const mapping = data as WorkspaceMapping | null;
  if (!mapping?.sync_enabled || !mapping.ghl_location_id) {
    throw new ApiError(422, "Click to Scale workspace does not have an enabled GHL location mapping.", "ghl_mapping_missing_or_disabled");
  }

  return mapping;
}

async function loadOrCreateProofLead(params: {
  admin: Awaited<ReturnType<typeof requireAdminClient>>;
  workspaceId: string;
  campaignId?: string | null;
  leadId?: string | null;
  apply: boolean;
}) {
  if (params.leadId) {
    const { data, error } = await db(params.admin)
      .from("leads")
      .select("*")
      .eq("id", params.leadId)
      .eq("organization_id", params.workspaceId)
      .maybeSingle();

    if (error) {
      throw new ApiError(500, error.message, "lead_fetch_failed");
    }
    if (!data) {
      throw new ApiError(404, "QA proof lead was not found in the requested workspace.", "qa_proof_lead_not_found");
    }

    return data as CrmSyncLeadRecord;
  }

  const lead = {
    organization_id: params.workspaceId,
    tenant_id: params.workspaceId,
    campaign_id: params.campaignId ?? null,
    first_name: "DealFlow",
    last_name: "GHL Proof",
    name: "DealFlow GHL Proof",
    email: proofEmail(),
    phone: null,
    phone_raw: null,
    phone_e164: null,
    source: "click_to_scale_ghl_proof",
    status: "new",
    estimated_value: 0,
    notes: "Controlled Click to Scale GHL lead-sync proof. Do not contact. No SMS, Meta, Stripe, provider, Freshdesk, or launch side effects.",
    campaign_name: "Click to Scale GHL Proof",
    lead_type: "qa_proof",
    utm_source: "dealflow_internal_proof",
    utm_medium: "admin_proof",
    utm_campaign: "click_to_scale_ghl",
    landing_page_url: "https://app.agentdealflow.io/clicktoscale",
    metadata: {
      qa_proof: true,
      click_to_scale_ghl_lead_sync_proof: true,
      no_sms: true,
      no_meta: true,
      no_stripe: true,
      no_provider_generation: true,
      no_freshdesk: true,
      no_launch: true,
    },
  };

  if (!params.apply) {
    return {
      id: "dry-run-lead-id",
      ...lead,
      created_at: new Date().toISOString(),
    } as CrmSyncLeadRecord;
  }

  const { data, error } = await db(params.admin)
    .from("leads")
    .insert(lead)
    .select("*")
    .single();

  if (error) {
    throw new ApiError(500, error.message, "qa_proof_lead_insert_failed");
  }

  return data as CrmSyncLeadRecord;
}

export async function GET() {
  try {
    await requirePlatformAdmin();
    const admin = await requireAdminClient();

    const [
      { data: mappings, error: mappingsError },
      { data: failedEvents, error: failedEventsError },
    ] = await Promise.all([
      db(admin)
        .from("workspace_ghl_mapping")
        .select("workspace_id, partner_id, ghl_location_id, sync_enabled, updated_at")
        .eq("partner_id", PARTNER_ID)
        .order("updated_at", { ascending: false })
        .limit(10),
      db(admin)
        .from("lead_crm_sync_events")
        .select("id, workspace_id, status, last_error_code, updated_at")
        .eq("partner_id", PARTNER_ID)
        .in("status", ["failed", "dead_letter"])
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);

    if (mappingsError) {
      throw new ApiError(500, mappingsError.message, "workspace_ghl_mapping_fetch_failed");
    }
    if (failedEventsError) {
      throw new ApiError(500, failedEventsError.message, "lead_crm_sync_events_fetch_failed");
    }

    return apiSuccess({
      success: true,
      partnerId: PARTNER_ID,
      mappings: ((mappings ?? []) as WorkspaceMapping[]).map((mapping) => ({
        workspaceId: mapping.workspace_id,
        syncEnabled: mapping.sync_enabled,
        locationMapped: Boolean(mapping.ghl_location_id),
        locationIdMasked: maskExternalId(mapping.ghl_location_id),
      })),
      failedLeadSyncEvents: failedEvents ?? [],
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
    return handleApiError(error, "Click to Scale GHL lead-sync proof status");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const auth = await requirePlatformAdmin();
    const input = await parseJsonBody(request, proofSchema);
    const admin = await requireAdminClient();
    const mapping = await loadMapping(admin, input.workspaceId);
    const lead = await loadOrCreateProofLead({
      admin,
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      leadId: input.leadId,
      apply: input.apply,
    });

    if (!input.apply) {
      return apiSuccess({
        success: true,
        partnerId: PARTNER_ID,
        applyRequested: false,
        proofLeadWouldBeCreated: !input.leadId,
        workspaceId: input.workspaceId,
        locationIdMasked: maskExternalId(mapping.ghl_location_id),
        safety: {
          printedSecrets: false,
          calledGhl: false,
          mutatedDatabase: false,
          externalWriteAttempted: false,
          noSms: true,
          noMeta: true,
          noStripe: true,
          noProviderGeneration: true,
          noFreshdesk: true,
          noLaunch: true,
        },
      });
    }

    const firstSync = await syncLeadToPartnerCrm(lead);
    const secondSync = await syncLeadToPartnerCrm(lead);

    return apiSuccess({
      success: true,
      actor: {
        userId: auth.user.id,
      },
      partnerId: PARTNER_ID,
      applyRequested: true,
      workspaceId: input.workspaceId,
      leadId: lead.id,
      locationIdMasked: maskExternalId(mapping.ghl_location_id),
      firstSync: {
        synced: firstSync.synced,
        skipped: firstSync.skipped,
        reason: firstSync.reason ?? null,
        eventId: firstSync.eventId ?? null,
        contactIdMasked: maskExternalId(firstSync.contactId ?? null),
        opportunityIdMasked: maskExternalId(firstSync.opportunityId ?? null),
      },
      secondSync: {
        synced: secondSync.synced,
        skipped: secondSync.skipped,
        reason: secondSync.reason ?? null,
        eventId: secondSync.eventId ?? null,
        contactIdMasked: maskExternalId(secondSync.contactId ?? null),
        opportunityIdMasked: maskExternalId(secondSync.opportunityId ?? null),
      },
      idempotencyProven: Boolean(firstSync.eventId && firstSync.eventId === secondSync.eventId && secondSync.reason === "already_synced"),
      safety: {
        printedSecrets: false,
        calledGhl: true,
        mutatedDatabase: true,
        externalWriteAttempted: true,
        noSms: true,
        noMeta: true,
        noStripe: true,
        noProviderGeneration: true,
        noFreshdesk: true,
        noLaunch: true,
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return handleApiError(error, "Click to Scale GHL lead-sync proof");
  }
}
