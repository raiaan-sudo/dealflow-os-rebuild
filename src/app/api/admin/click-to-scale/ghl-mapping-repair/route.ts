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

const PARTNER_ID = "click_to_scale";
const CREDENTIAL_REF = "CLICKTOSCALE_GHL_PRIVATE_INTEGRATION";

const mappingRepairSchema = z.object({
  workspaceId: z.string().uuid(),
  locationId: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  pipelineId: z.string().regex(/^[A-Za-z0-9_-]{3,120}$/).optional().nullable(),
  stageId: z.string().regex(/^[A-Za-z0-9_-]{3,120}$/).optional().nullable(),
  apply: z.boolean().optional().default(false),
}).strict();

type UntypedTableClient = {
  from: (table: string) => any;
};

function db(admin: Awaited<ReturnType<typeof requireAdminClient>>) {
  return admin as unknown as UntypedTableClient;
}

function maskExternalId(value: string | null | undefined) {
  if (!value) return null;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

async function requireAdminClient() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  return admin;
}

function buildRecords(input: z.infer<typeof mappingRepairSchema>, assignedBy: string) {
  const now = new Date().toISOString();
  const defaultTags = ["DealFlow", "Click to Scale", "New Lead"];

  return {
    partnerConfig: {
      partner_id: PARTNER_ID,
      display_name: "Click to Scale",
      product_name: "Click to Scale DealFlow",
      legal_fallback_name: "DealFlow",
      support_email: "support@agentdealflow.io",
      support_phone: null,
      primary_color: "#2999B6",
      secondary_color: "#00254E",
      accent_color: "#225273",
      background_color: "#020610",
      logo_url: "/partners/click-to-scale/logo.png",
      favicon_url: "/partners/click-to-scale/logo.png",
      billing_owner: "dealflow",
      stripe_partner_metadata: PARTNER_ID,
      ghl_enabled: true,
      ghl_default_pipeline_id: input.pipelineId ?? null,
      ghl_default_stage_id: input.stageId ?? null,
      ghl_default_tags: defaultTags,
      sms_template: "click_to_scale_lead_alert",
      updated_at: now,
    },
    ghlConfig: {
      partner_id: PARTNER_ID,
      enabled: true,
      auth_type: "private_integration_token",
      encrypted_credential_ref: CREDENTIAL_REF,
      default_location_id: input.locationId,
      default_pipeline_id: input.pipelineId ?? null,
      default_stage_id: input.stageId ?? null,
      default_tags: defaultTags,
      default_source: "DealFlow / Click to Scale",
      updated_at: now,
    },
    mapping: {
      workspace_id: input.workspaceId,
      partner_id: PARTNER_ID,
      ghl_location_id: input.locationId,
      ghl_pipeline_id: input.pipelineId ?? null,
      ghl_stage_id: input.stageId ?? null,
      sync_enabled: true,
      assigned_by: assignedBy,
      updated_at: now,
    },
    attribution: {
      workspace_id: input.workspaceId,
      partner_id: PARTNER_ID,
      source: "click_to_scale_admin_mapping_repair",
      active: true,
      assigned_by: assignedBy,
      metadata: {
        billing_owner: "dealflow",
        crm_destination: "gohighlevel",
        notification_mode: "sms_alert_only",
        repair_source: "admin_mapping_repair",
      },
      updated_at: now,
    },
  };
}

async function loadCurrentState(admin: Awaited<ReturnType<typeof requireAdminClient>>, workspaceId: string) {
  const [
    { data: partnerConfig, error: partnerConfigError },
    { data: ghlConfig, error: ghlConfigError },
    { data: mapping, error: mappingError },
    { data: attribution, error: attributionError },
  ] = await Promise.all([
    db(admin)
      .from("partner_configs")
      .select("partner_id, display_name, ghl_enabled")
      .eq("partner_id", PARTNER_ID)
      .maybeSingle(),
    db(admin)
      .from("partner_ghl_config")
      .select("partner_id, enabled, encrypted_credential_ref, default_location_id, default_pipeline_id, default_stage_id")
      .eq("partner_id", PARTNER_ID)
      .maybeSingle(),
    db(admin)
      .from("workspace_ghl_mapping")
      .select("workspace_id, partner_id, ghl_location_id, ghl_pipeline_id, ghl_stage_id, sync_enabled")
      .eq("workspace_id", workspaceId)
      .eq("partner_id", PARTNER_ID)
      .maybeSingle(),
    db(admin)
      .from("workspace_partner_attribution")
      .select("workspace_id, partner_id, active, source")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);

  if (partnerConfigError) throw new ApiError(500, partnerConfigError.message, "partner_config_fetch_failed");
  if (ghlConfigError) throw new ApiError(500, ghlConfigError.message, "partner_ghl_config_fetch_failed");
  if (mappingError) throw new ApiError(500, mappingError.message, "workspace_ghl_mapping_fetch_failed");
  if (attributionError) throw new ApiError(500, attributionError.message, "workspace_partner_attribution_fetch_failed");

  return {
    partnerConfigExists: Boolean(partnerConfig),
    ghlConfig: ghlConfig ? {
      enabled: Boolean((ghlConfig as { enabled?: boolean }).enabled),
      credentialRefExpected: (ghlConfig as { encrypted_credential_ref?: string | null }).encrypted_credential_ref === CREDENTIAL_REF,
      locationIdMasked: maskExternalId((ghlConfig as { default_location_id?: string | null }).default_location_id),
      pipelineIdMasked: maskExternalId((ghlConfig as { default_pipeline_id?: string | null }).default_pipeline_id),
      stageIdMasked: maskExternalId((ghlConfig as { default_stage_id?: string | null }).default_stage_id),
    } : null,
    mapping: mapping ? {
      syncEnabled: Boolean((mapping as { sync_enabled?: boolean }).sync_enabled),
      locationIdMasked: maskExternalId((mapping as { ghl_location_id?: string | null }).ghl_location_id),
      pipelineIdMasked: maskExternalId((mapping as { ghl_pipeline_id?: string | null }).ghl_pipeline_id),
      stageIdMasked: maskExternalId((mapping as { ghl_stage_id?: string | null }).ghl_stage_id),
    } : null,
    attribution: attribution ? {
      active: Boolean((attribution as { active?: boolean }).active),
      partnerId: (attribution as { partner_id?: string | null }).partner_id ?? null,
      source: (attribution as { source?: string | null }).source ?? null,
    } : null,
  };
}

async function applyRecords(admin: Awaited<ReturnType<typeof requireAdminClient>>, records: ReturnType<typeof buildRecords>) {
  const { error: partnerError } = await db(admin)
    .from("partner_configs")
    .upsert(records.partnerConfig, { onConflict: "partner_id" });
  if (partnerError) throw new ApiError(500, partnerError.message, "partner_config_upsert_failed");

  const { error: ghlError } = await db(admin)
    .from("partner_ghl_config")
    .upsert(records.ghlConfig, { onConflict: "partner_id" });
  if (ghlError) throw new ApiError(500, ghlError.message, "partner_ghl_config_upsert_failed");

  const { error: mappingError } = await db(admin)
    .from("workspace_ghl_mapping")
    .upsert(records.mapping, { onConflict: "workspace_id,partner_id" });
  if (mappingError) throw new ApiError(500, mappingError.message, "workspace_ghl_mapping_upsert_failed");

  const { error: attributionError } = await db(admin)
    .from("workspace_partner_attribution")
    .upsert(records.attribution, { onConflict: "workspace_id" });
  if (attributionError) throw new ApiError(500, attributionError.message, "workspace_partner_attribution_upsert_failed");
}

export async function GET() {
  try {
    await requirePlatformAdmin();
    return apiSuccess({
      success: true,
      partnerId: PARTNER_ID,
      requiredBody: {
        workspaceId: "uuid",
        locationId: "gohighlevel_location_id",
        pipelineId: "optional",
        stageId: "optional",
        apply: false,
      },
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
    return handleApiError(error, "Click to Scale GHL mapping repair status");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const auth = await requirePlatformAdmin();
    const input = await parseJsonBody(request, mappingRepairSchema);
    const admin = await requireAdminClient();
    const before = await loadCurrentState(admin, input.workspaceId);
    const records = buildRecords(input, auth.user.id);

    if (input.apply) {
      await applyRecords(admin, records);
    }

    const after = input.apply ? await loadCurrentState(admin, input.workspaceId) : null;

    return apiSuccess({
      success: true,
      partnerId: PARTNER_ID,
      applyRequested: input.apply,
      actor: {
        userId: auth.user.id,
      },
      workspaceId: input.workspaceId,
      target: {
        locationIdMasked: maskExternalId(input.locationId),
        pipelineIdMasked: maskExternalId(input.pipelineId ?? null),
        stageIdMasked: maskExternalId(input.stageId ?? null),
      },
      before,
      after,
      safety: {
        printedSecrets: false,
        calledGhl: false,
        mutatedDatabase: input.apply,
        externalWriteAttempted: false,
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
    return handleApiError(error, "Click to Scale GHL mapping repair");
  }
}
