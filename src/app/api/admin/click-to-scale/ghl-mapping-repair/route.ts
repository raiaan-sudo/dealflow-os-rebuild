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

const CREDENTIAL_REF = "CLICKTOSCALE_GHL_PRIVATE_INTEGRATION";

const mappingRepairSchema = z.object({
  partnerSlug: z.string().trim().min(1).max(80).default("click-to-scale"),
  workspaceId: z.string().uuid(),
  locationId: z.string().regex(/^[A-Za-z0-9_-]{3,120}$/),
  pipelineId: z.string().regex(/^[A-Za-z0-9_-]{3,160}$/).optional().nullable(),
  stageId: z.string().regex(/^[A-Za-z0-9_-]{3,160}$/).optional().nullable(),
  apply: z.boolean().optional().default(false),
}).strict();

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type TableResponse = Promise<{ data: unknown; error: { message: string } | null }>;
type TableBuilder = {
  select: (...args: unknown[]) => TableBuilder;
  eq: (...args: unknown[]) => TableBuilder;
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

async function loadCurrentState(admin: AdminClient, params: { partnerId: string; workspaceId: string }) {
  const [
    { data: organization, error: organizationError },
    { data: partnerAccount, error: partnerAccountError },
    { data: ghlConfig, error: ghlConfigError },
    { data: mapping, error: mappingError },
  ] = await Promise.all([
    db(admin)
      .from("organizations")
      .select("id, name, partner_id")
      .eq("id", params.workspaceId)
      .maybeSingle(),
    db(admin)
      .from("partner_accounts")
      .select("partner_id, account_id, attribution_source, locked")
      .eq("account_id", params.workspaceId)
      .maybeSingle(),
    db(admin)
      .from("partner_ghl_config")
      .select("partner_id, enabled, encrypted_credential_ref, default_location_id, default_pipeline_id, default_stage_id")
      .eq("partner_id", params.partnerId)
      .maybeSingle(),
    db(admin)
      .from("workspace_ghl_mapping")
      .select("workspace_id, partner_id, ghl_location_id, ghl_pipeline_id, ghl_stage_id, sync_enabled")
      .eq("workspace_id", params.workspaceId)
      .eq("partner_id", params.partnerId)
      .maybeSingle(),
  ]);

  if (organizationError) throw new ApiError(500, organizationError.message, "organization_lookup_failed");
  if (partnerAccountError) throw new ApiError(500, partnerAccountError.message, "partner_account_lookup_failed");
  if (ghlConfigError) throw new ApiError(500, ghlConfigError.message, "partner_ghl_config_lookup_failed");
  if (mappingError) throw new ApiError(500, mappingError.message, "workspace_ghl_mapping_lookup_failed");

  const org = organization as { id?: string; name?: string | null; partner_id?: string | null } | null;
  if (!org?.id) {
    throw new ApiError(404, "Workspace was not found.", "workspace_not_found");
  }

  return {
    organization: {
      id: org.id,
      name: org.name ?? null,
      partnerId: org.partner_id ?? null,
    },
    partnerAccount: partnerAccount
      ? {
          partnerId: (partnerAccount as { partner_id?: string | null }).partner_id ?? null,
          accountId: (partnerAccount as { account_id?: string | null }).account_id ?? null,
          attributionSource: (partnerAccount as { attribution_source?: string | null }).attribution_source ?? null,
          locked: Boolean((partnerAccount as { locked?: boolean }).locked),
        }
      : null,
    ghlConfig: ghlConfig
      ? {
          enabled: Boolean((ghlConfig as { enabled?: boolean }).enabled),
          credentialRefExpected:
            (ghlConfig as { encrypted_credential_ref?: string | null }).encrypted_credential_ref === CREDENTIAL_REF,
          locationIdMasked: maskExternalId((ghlConfig as { default_location_id?: string | null }).default_location_id),
          pipelineIdMasked: maskExternalId((ghlConfig as { default_pipeline_id?: string | null }).default_pipeline_id),
          stageIdMasked: maskExternalId((ghlConfig as { default_stage_id?: string | null }).default_stage_id),
        }
      : null,
    mapping: mapping
      ? {
          syncEnabled: Boolean((mapping as { sync_enabled?: boolean }).sync_enabled),
          locationIdMasked: maskExternalId((mapping as { ghl_location_id?: string | null }).ghl_location_id),
          pipelineIdMasked: maskExternalId((mapping as { ghl_pipeline_id?: string | null }).ghl_pipeline_id),
          stageIdMasked: maskExternalId((mapping as { ghl_stage_id?: string | null }).ghl_stage_id),
        }
      : null,
  };
}

export async function GET() {
  try {
    await requirePlatformAdmin();

    return apiSuccess({
      success: true,
      route: "click_to_scale_ghl_mapping_repair",
      requiredBody: {
        partnerSlug: "click-to-scale",
        workspaceId: "uuid",
        locationId: "gohighlevel_location_id",
        pipelineId: "optional",
        stageId: "optional",
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
    await requirePlatformAdmin();
    const admin = await requireAdminClient();
    const body = await parseJsonBody(request, mappingRepairSchema);
    const partner = await loadPartnerBySlug(admin, body.partnerSlug);
    const currentState = await loadCurrentState(admin, {
      partnerId: partner.id,
      workspaceId: body.workspaceId,
    });

    if (body.apply) {
      throw new ApiError(409, "Batch 3A only exposes dry-run mapping proof structure. Apply is intentionally disabled.", "ghl_mapping_apply_disabled");
    }

    return apiSuccess({
      success: true,
      dryRun: true,
      partner,
      currentState,
      proposed: {
        partnerGhlConfig: {
          partnerId: partner.id,
          enabled: true,
          credentialRef: CREDENTIAL_REF,
          locationIdMasked: maskExternalId(body.locationId),
          pipelineIdMasked: maskExternalId(body.pipelineId ?? null),
          stageIdMasked: maskExternalId(body.stageId ?? null),
        },
        workspaceGhlMapping: {
          workspaceId: body.workspaceId,
          partnerId: partner.id,
          locationIdMasked: maskExternalId(body.locationId),
          pipelineIdMasked: maskExternalId(body.pipelineId ?? null),
          stageIdMasked: maskExternalId(body.stageId ?? null),
          syncEnabled: true,
        },
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
    return handleApiError(error, "Click to Scale GHL mapping repair dry-run");
  }
}
