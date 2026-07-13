import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_WORKSPACE_BRANDING,
  resolveWorkspaceBrandingConfig,
  type WorkspaceBranding,
} from "@/lib/white-label/workspace-branding-core";

export { DEFAULT_WORKSPACE_BRANDING } from "@/lib/white-label/workspace-branding-core";
export type { WorkspaceBranding } from "@/lib/white-label/workspace-branding-core";

/**
 * Resolves branding only after the caller has an authenticated workspace.
 * Attribution is tenant-scoped first; partner data is then read server-side so
 * a workspace never selects another partner by a client-controlled identifier.
 */
export async function loadWorkspaceBranding(
  organizationId: string,
): Promise<WorkspaceBranding> {
  const admin = createAdminClient();
  if (!admin || !organizationId) return DEFAULT_WORKSPACE_BRANDING;

  const { data: attributionRows, error: attributionError } = await (admin as any)
    .from("workspace_partner_attribution")
    .select("workspace_id,partner_id,active")
    .eq("workspace_id", organizationId)
    .eq("active", true)
    .limit(2);
  if (attributionError || !Array.isArray(attributionRows) || attributionRows.length !== 1) {
    return DEFAULT_WORKSPACE_BRANDING;
  }
  const attribution = attributionRows[0];
  const partnerId = typeof attribution?.partner_id === "string"
    ? attribution.partner_id
    : null;
  if (!partnerId) return DEFAULT_WORKSPACE_BRANDING;

  const [organizationResult, partnerResult, brandingResult] = await Promise.all([
    (admin as any)
      .from("organizations")
      .select("id,partner_id")
      .eq("id", organizationId)
      .eq("partner_id", partnerId)
      .limit(2),
    (admin as any)
      .from("partners")
      .select("id,brand_name,logo_url,primary_color,powered_by_dealflow,status,deleted_at")
      .eq("id", partnerId)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(2),
    (admin as any)
      .from("partner_branding")
      .select("partner_id,theme_json,copy_json")
      .eq("partner_id", partnerId)
      .limit(2),
  ]);
  const organizationRows = organizationResult.data;
  const partnerRows = partnerResult.data;
  const brandingRows = brandingResult.data;
  if (
    organizationResult.error ||
    partnerResult.error ||
    brandingResult.error ||
    !Array.isArray(organizationRows) ||
    organizationRows.length !== 1 ||
    !Array.isArray(partnerRows) ||
    partnerRows.length !== 1 ||
    !Array.isArray(brandingRows) ||
    brandingRows.length > 1
  ) {
    return DEFAULT_WORKSPACE_BRANDING;
  }

  return resolveWorkspaceBrandingConfig({
    organizationId,
    organization: organizationRows[0],
    attribution,
    partner: partnerRows[0],
    branding: brandingRows[0] ?? null,
  });
}
