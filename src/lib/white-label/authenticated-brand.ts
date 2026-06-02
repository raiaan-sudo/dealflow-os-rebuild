import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPartnerBranding, partnerBrandingCssVars } from "@/lib/white-label/branding";
import { DEFAULT_PARTNER_BRANDING, type PartnerBranding, type PartnerRow } from "@/lib/white-label/types";
import type { AppContext } from "@/types/app";
import type { CSSProperties } from "react";

export type BrandContext = {
  brandId: string;
  partnerId: string | null;
  slug: string | null;
  displayName: string;
  logoUrl: string | null;
  colors: {
    primary: string;
    secondary: string | null;
    accent: string | null;
  };
  isPartnerBranded: boolean;
  fallbackName: string;
  planLabelOverrides: Record<string, unknown>;
  cssVars: CSSProperties;
  branding: PartnerBranding;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function fetchBrandingRows(partnerId: string) {
  const admin = createAdminClient();
  if (!admin) {
    return { brandingRow: null, supportRow: null };
  }

  const [brandingResult, supportResult] = await Promise.all([
    admin.from("partner_branding").select("theme_json,copy_json,pricing_json,feature_flags_json,email_branding_json").eq("partner_id", partnerId).maybeSingle(),
    admin.from("partner_support_settings").select("support_email,support_phone,support_footer_copy,support_mode").eq("partner_id", partnerId).maybeSingle(),
  ]);

  return {
    brandingRow: brandingResult.data as Record<string, unknown> | null,
    supportRow: supportResult.data as Record<string, unknown> | null,
  };
}

export async function resolveAuthenticatedBrandContext(context: AppContext | null): Promise<BrandContext> {
  const partner = context?.partner;

  if (!partner?.id || partner.status !== "active") {
    return {
      brandId: "dealflow",
      partnerId: null,
      slug: null,
      displayName: DEFAULT_PARTNER_BRANDING.brandName,
      logoUrl: null,
      colors: {
        primary: DEFAULT_PARTNER_BRANDING.primaryColor,
        secondary: DEFAULT_PARTNER_BRANDING.secondaryColor,
        accent: DEFAULT_PARTNER_BRANDING.accentColor,
      },
      isPartnerBranded: false,
      fallbackName: DEFAULT_PARTNER_BRANDING.brandName,
      planLabelOverrides: {},
      cssVars: partnerBrandingCssVars(DEFAULT_PARTNER_BRANDING),
      branding: DEFAULT_PARTNER_BRANDING,
    };
  }

  const { brandingRow, supportRow } = await fetchBrandingRows(partner.id);
  const branding = buildPartnerBranding({
    partner: partner as PartnerRow,
    brandingRow,
    supportRow,
  });

  return {
    brandId: partner.id,
    partnerId: partner.id,
    slug: text(partner.slug),
    displayName: branding.brandName,
    logoUrl: branding.logoUrl,
    colors: {
      primary: branding.primaryColor,
      secondary: branding.secondaryColor,
      accent: branding.accentColor,
    },
    isPartnerBranded: true,
    fallbackName: text(partner.legal_name) ?? branding.brandName,
    planLabelOverrides: branding.pricing,
    cssVars: partnerBrandingCssVars(branding),
    branding,
  };
}

