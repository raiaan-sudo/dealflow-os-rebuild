import type { Json } from "@/lib/supabase/types";

export type PartnerStatus = "draft" | "active" | "paused" | "archived";
export type PartnerRole = "partner_admin" | "partner_sales_rep" | "partner_support" | "partner_viewer";
export type PartnerAttributionSource = "domain" | "slug" | "invite" | "admin" | "import";
export type PartnerSupportMode = "partner_first" | "dealflow_first" | "hybrid";
export type PartnerVerticalKey = "real_estate_agent" | "real_estate_wholesaler";

export type PartnerBranding = {
  appName: string;
  brandName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  accentColor: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  supportFooterCopy: string | null;
  poweredByDealFlow: boolean;
  loginEyebrow: string;
  loginHeadline: string;
  loginSubheadline: string;
  pricing: Record<string, Json>;
  featureFlags: Record<string, Json>;
};

export type PartnerContext = {
  partnerId: string | null;
  partnerSlug: string | null;
  partnerStatus: PartnerStatus | null;
  branding: PartnerBranding;
  supportMode: PartnerSupportMode;
  verticalKey: PartnerVerticalKey;
  attributionSource: PartnerAttributionSource | "native";
  attributionDetail: string | null;
  verifiedDomain: boolean;
  nativeFallback: boolean;
};

export type PartnerResolutionInput = {
  hostname?: string | null;
  pathname?: string | null;
  partnerSlug?: string | null;
  inviteCode?: string | null;
};

export type PartnerRow = {
  id: string;
  slug: string;
  brand_name: string;
  legal_name?: string | null;
  logo_url?: string | null;
  favicon_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  support_email?: string | null;
  support_phone?: string | null;
  commission_rate?: number | null;
  default_timezone?: string | null;
  status?: PartnerStatus | null;
  powered_by_dealflow?: boolean | null;
};

export type PartnerMembershipRow = {
  partner_id: string;
  user_id: string;
  role: PartnerRole;
  status: "active" | "invited" | "disabled";
};

export const DEFAULT_PARTNER_BRANDING: PartnerBranding = {
  appName: "DealFlow",
  brandName: "DealFlow",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#67e8f9",
  secondaryColor: null,
  accentColor: "#86efac",
  supportEmail: "support@agentdealflow.io",
  supportPhone: null,
  supportFooterCopy: "Support is handled by DealFlow.",
  poweredByDealFlow: true,
  loginEyebrow: "Replace your agency",
  loginHeadline: "Build, launch, and optimize your ads without paying an agency",
  loginSubheadline: "Sign in to get your funnel, ads, campaign launch path, and optimization workflow in one place.",
  pricing: {},
  featureFlags: {},
};

export const NATIVE_PARTNER_CONTEXT: PartnerContext = {
  partnerId: null,
  partnerSlug: null,
  partnerStatus: null,
  branding: DEFAULT_PARTNER_BRANDING,
  supportMode: "dealflow_first",
  verticalKey: "real_estate_agent",
  attributionSource: "native",
  attributionDetail: null,
  verifiedDomain: false,
  nativeFallback: true,
};
