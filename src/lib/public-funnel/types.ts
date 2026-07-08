import type { CURRENT_PUBLIC_FUNNEL_PRESET_VERSION } from "@/lib/public-funnel/constants";

export type CanonicalPublicFunnelPresetVersion = typeof CURRENT_PUBLIC_FUNNEL_PRESET_VERSION;

export type CanonicalPublicFunnelMetric = {
  label: string;
  value: string;
};

export type CanonicalPublicFunnelTrustItem = {
  label: string;
};

export type CanonicalPublicFunnelStep = {
  title: string;
  body: string;
};

export type CanonicalPublicFunnelFormField = "name" | "email" | "phone";

export type CanonicalPublicFunnel = {
  presetVersion: CanonicalPublicFunnelPresetVersion;
  campaignId: string;
  organizationId: string | null;
  slug: string;
  campaignName: string;
  businessName: string;
  market: string;
  offer: string;
  hero: {
    eyebrow: string;
    headline: string;
    subheadline: string;
    primaryCta: string;
  };
  trust: {
    items: CanonicalPublicFunnelTrustItem[];
  };
  offerCard: {
    headline: string;
    description: string;
    bullets: string[];
  };
  valueStack: {
    headline: string;
    metrics: CanonicalPublicFunnelMetric[];
    bullets: string[];
  };
  qualification: {
    headline: string;
    steps: CanonicalPublicFunnelStep[];
  };
  expectations: {
    headline: string;
    bullets: string[];
  };
  form: {
    id: string;
    title: string;
    cta: string;
    fields: CanonicalPublicFunnelFormField[];
  };
  tracking: {
    metaPixelId?: string | null;
  };
};

export type CanonicalPublicFunnelBuildResult = {
  funnel: CanonicalPublicFunnel;
  blockedSectionTypes: string[];
};

