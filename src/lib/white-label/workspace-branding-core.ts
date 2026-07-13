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

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function optionalText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
 * Converts server-side partner configuration into customer-facing branding.
 * Every identity must independently agree with the authenticated workspace;
 * a partner id supplied by a request, cookie or another child workspace is
 * never sufficient authority.
 */
export function resolveWorkspaceBrandingConfig(input: {
  organizationId: unknown;
  organization: unknown;
  attribution: unknown;
  partner: unknown;
  branding?: unknown;
}): WorkspaceBranding {
  const organizationId = input.organizationId;
  const organization = asRecord(input.organization);
  const attribution = asRecord(input.attribution);
  const partner = asRecord(input.partner);
  const branding = asRecord(input.branding);
  const partnerId = attribution.partner_id;

  if (
    !isUuid(organizationId) ||
    !isUuid(organization.id) ||
    organization.id !== organizationId ||
    !isUuid(partnerId) ||
    organization.partner_id !== partnerId ||
    attribution.workspace_id !== organizationId ||
    attribution.active !== true ||
    !isUuid(partner.id) ||
    partner.id !== partnerId ||
    partner.status !== "active" ||
    partner.deleted_at != null ||
    (Object.keys(branding).length > 0 && branding.partner_id !== partnerId)
  ) {
    return DEFAULT_WORKSPACE_BRANDING;
  }

  const theme = asRecord(branding.theme_json);
  const copy = asRecord(branding.copy_json);
  const brandName =
    optionalText(copy.brandName, 120) ??
    optionalText(partner.brand_name, 120) ??
    DEFAULT_WORKSPACE_BRANDING.brandName;
  const productName = optionalText(copy.productName, 120) ?? brandName;

  return {
    partnerId,
    brandName,
    productName,
    primaryColor: safeColor(
      theme.primaryColor ?? partner.primary_color,
      DEFAULT_WORKSPACE_BRANDING.primaryColor,
    ),
    logoUrl: safeLogoUrl(theme.logoUrl ?? partner.logo_url),
    poweredByDealFlow: partner.powered_by_dealflow !== false,
    isWhiteLabel: true,
  };
}
