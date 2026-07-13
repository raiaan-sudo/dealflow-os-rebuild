import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type WorkspaceBranding = {
  partnerId: string | null;
  brandName: string;
  productName: string;
  primaryColor: string;
  logoUrl: string | null;
  poweredByDealFlow: boolean;
  isWhiteLabel: boolean;
};

export const DEFAULT_WORKSPACE_BRANDING: WorkspaceBranding = {
  partnerId: null,
  brandName: "DealFlow",
  productName: "DealFlow AI",
  primaryColor: "#67e8f9",
  logoUrl: null,
  poweredByDealFlow: false,
  isWhiteLabel: false,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function safeColor(value: unknown, fallback: string) {
  const normalized = optionalText(value, 7);
  return normalized && /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

function safeLogoUrl(value: unknown) {
  const candidate = optionalText(value, 2_000);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

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

  const { data: attribution, error: attributionError } = await (admin as any)
    .from("workspace_partner_attribution")
    .select("partner_id")
    .eq("workspace_id", organizationId)
    .eq("active", true)
    .maybeSingle();
  const partnerId = optionalText(attribution?.partner_id, 64);
  if (attributionError || !partnerId) return DEFAULT_WORKSPACE_BRANDING;

  const [partnerResult, brandingResult] = await Promise.all([
    (admin as any)
      .from("partners")
      .select("id,brand_name,logo_url,primary_color,powered_by_dealflow,status")
      .eq("id", partnerId)
      .eq("status", "active")
      .maybeSingle(),
    (admin as any)
      .from("partner_branding")
      .select("theme_json,copy_json")
      .eq("partner_id", partnerId)
      .maybeSingle(),
  ]);
  if (partnerResult.error || !partnerResult.data?.id) {
    return DEFAULT_WORKSPACE_BRANDING;
  }

  const theme = asRecord(brandingResult.data?.theme_json);
  const copy = asRecord(brandingResult.data?.copy_json);
  const brandName =
    optionalText(copy.brandName, 120) ??
    optionalText(partnerResult.data.brand_name, 120) ??
    DEFAULT_WORKSPACE_BRANDING.brandName;
  const productName =
    optionalText(copy.productName, 120) ??
    brandName;

  return {
    partnerId,
    brandName,
    productName,
    primaryColor: safeColor(
      theme.primaryColor ?? partnerResult.data.primary_color,
      DEFAULT_WORKSPACE_BRANDING.primaryColor,
    ),
    logoUrl: safeLogoUrl(theme.logoUrl ?? partnerResult.data.logo_url),
    poweredByDealFlow: partnerResult.data.powered_by_dealflow !== false,
    isWhiteLabel: true,
  };
}
