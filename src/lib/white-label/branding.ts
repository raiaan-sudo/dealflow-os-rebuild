import type { Json } from "@/lib/supabase/types";
import type { CSSProperties } from "react";
import {
  DEFAULT_PARTNER_BRANDING,
  type PartnerBranding,
  type PartnerRow,
  type PartnerSupportMode,
  type PartnerVerticalKey,
} from "@/lib/white-label/types";

function asRecord(value: unknown): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizePartnerSlug(value: string | null | undefined) {
  return optionalText(value)
    ?.toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64) ?? null;
}

export function normalizePartnerDomain(value: string | null | undefined) {
  const raw = optionalText(value);
  if (!raw) {
    return null;
  }

  const withoutProtocol = raw.replace(/^https?:\/\//i, "");
  const hostname = withoutProtocol.split("/")[0]?.split(":")[0]?.trim().toLowerCase();
  return hostname?.replace(/\.$/, "") || null;
}

export function isSafeBrandColor(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  return /^#[0-9a-f]{6}$/i.test(value.trim()) || /^#[0-9a-f]{3}$/i.test(value.trim());
}

export function isSafeHttpUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function isSafeEmail(value: unknown) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normalizeSupportMode(value: unknown): PartnerSupportMode {
  return value === "partner_first" || value === "hybrid" || value === "dealflow_first"
    ? value
    : "dealflow_first";
}

export function normalizeVerticalKey(value: unknown): PartnerVerticalKey {
  return value === "real_estate_wholesaler" ? "real_estate_wholesaler" : "real_estate_agent";
}

export function buildPartnerBranding(params: {
  partner?: PartnerRow | null;
  brandingRow?: { theme_json?: unknown; copy_json?: unknown; pricing_json?: unknown; feature_flags_json?: unknown; email_branding_json?: unknown } | null;
  supportRow?: { support_email?: string | null; support_phone?: string | null; support_footer_copy?: string | null } | null;
}): PartnerBranding {
  const partner = params.partner;
  const theme = asRecord(params.brandingRow?.theme_json);
  const copy = asRecord(params.brandingRow?.copy_json);
  const pricing = asRecord(params.brandingRow?.pricing_json);
  const featureFlags = asRecord(params.brandingRow?.feature_flags_json);

  const brandName = optionalText(partner?.brand_name) ?? DEFAULT_PARTNER_BRANDING.brandName;
  const primaryColor = isSafeBrandColor(theme.primaryColor)
    ? String(theme.primaryColor)
    : isSafeBrandColor(partner?.primary_color)
      ? String(partner?.primary_color)
      : DEFAULT_PARTNER_BRANDING.primaryColor;

  const secondaryColor = isSafeBrandColor(theme.secondaryColor)
    ? String(theme.secondaryColor)
    : isSafeBrandColor(partner?.secondary_color)
      ? String(partner?.secondary_color)
      : DEFAULT_PARTNER_BRANDING.secondaryColor;

  const accentColor = isSafeBrandColor(theme.accentColor)
    ? String(theme.accentColor)
    : isSafeBrandColor(partner?.accent_color)
      ? String(partner?.accent_color)
      : DEFAULT_PARTNER_BRANDING.accentColor;

  const logoUrl = isSafeHttpUrl(theme.logoUrl)
    ? String(theme.logoUrl)
    : isSafeHttpUrl(partner?.logo_url)
      ? String(partner?.logo_url)
      : null;

  const faviconUrl = isSafeHttpUrl(theme.faviconUrl)
    ? String(theme.faviconUrl)
    : isSafeHttpUrl(partner?.favicon_url)
      ? String(partner?.favicon_url)
      : null;

  const supportEmail = isSafeEmail(params.supportRow?.support_email)
    ? params.supportRow?.support_email?.trim() ?? null
    : isSafeEmail(partner?.support_email)
      ? partner?.support_email?.trim() ?? null
      : DEFAULT_PARTNER_BRANDING.supportEmail;

  return {
    appName: brandName,
    brandName,
    logoUrl,
    faviconUrl,
    primaryColor,
    secondaryColor,
    accentColor,
    supportEmail,
    supportPhone: optionalText(params.supportRow?.support_phone) ?? optionalText(partner?.support_phone),
    supportFooterCopy:
      optionalText(params.supportRow?.support_footer_copy) ??
      DEFAULT_PARTNER_BRANDING.supportFooterCopy,
    poweredByDealFlow: partner?.powered_by_dealflow ?? true,
    loginEyebrow: optionalText(copy.loginEyebrow) ?? DEFAULT_PARTNER_BRANDING.loginEyebrow,
    loginHeadline:
      optionalText(copy.loginHeadline) ??
      `Launch real estate ads with ${brandName}`,
    loginSubheadline:
      optionalText(copy.loginSubheadline) ??
      "Create your funnel, ads, campaign launch path, and optimization workflow in one branded workspace.",
    pricing,
    featureFlags,
  };
}

export function partnerBrandingCssVars(branding: PartnerBranding): CSSProperties {
  return {
    "--df-primary": branding.primaryColor,
    "--df-accent": branding.accentColor ?? branding.primaryColor,
  } as CSSProperties;
}
