export type WhiteLabelPartnerId = "egenmedia" | "click_to_scale";

export type WhiteLabelPartnerConfig = {
  id: WhiteLabelPartnerId;
  slug: string;
  shortSlugs: string[];
  displayName: string;
  productName: string;
  legalFallbackName: string;
  supportEmail: string;
  supportPhone: string | null;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  logoUrl: string | null;
  faviconUrl: string | null;
  billingOwner: "dealflow";
  stripePartnerMetadata: string;
  ghl: {
    enabled: boolean;
    defaultPipelineId: string | null;
    defaultStageId: string | null;
    defaultTags: string[];
    smsTemplate: "click_to_scale_lead_alert" | "default";
  };
};

const PARTNER_CONFIGS: WhiteLabelPartnerConfig[] = [
  {
    id: "egenmedia",
    slug: "egenmedia",
    shortSlugs: ["egenmedia"],
    displayName: "Egen Media",
    productName: "EGEN ACCELERATOR",
    legalFallbackName: "DealFlow",
    supportEmail: "support@agentdealflow.io",
    supportPhone: null,
    colors: {
      primary: "#188BF6",
      secondary: "#0A0A0A",
      accent: "#10B981",
      background: "#05070D",
    },
    logoUrl: null,
    faviconUrl: null,
    billingOwner: "dealflow",
    stripePartnerMetadata: "egenmedia",
    ghl: {
      enabled: false,
      defaultPipelineId: null,
      defaultStageId: null,
      defaultTags: ["DealFlow", "Egen Media", "New Lead"],
      smsTemplate: "default",
    },
  },
  {
    id: "click_to_scale",
    slug: "click-to-scale",
    shortSlugs: ["clicktoscale", "click-to-scale"],
    displayName: "Click to Scale",
    productName: "Click to Scale DealFlow",
    legalFallbackName: "DealFlow",
    supportEmail: "support@agentdealflow.io",
    supportPhone: null,
    colors: {
      primary: "#2999B6",
      secondary: "#00254E",
      accent: "#225273",
      background: "#020610",
    },
    logoUrl: "/partners/click-to-scale/logo.png",
    faviconUrl: "/partners/click-to-scale/logo.png",
    billingOwner: "dealflow",
    stripePartnerMetadata: "click_to_scale",
    ghl: {
      enabled: true,
      defaultPipelineId: null,
      defaultStageId: null,
      defaultTags: ["DealFlow", "Click to Scale", "New Lead"],
      smsTemplate: "click_to_scale_lead_alert",
    },
  },
];

export function getWhiteLabelPartners() {
  return PARTNER_CONFIGS;
}

export function getWhiteLabelPartnerById(id: string | null | undefined) {
  const normalized = id?.trim().toLowerCase();
  return PARTNER_CONFIGS.find((partner) => partner.id === normalized) ?? null;
}

export function getWhiteLabelPartnerBySlug(slug: string | null | undefined) {
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return (
    PARTNER_CONFIGS.find(
      (partner) => partner.slug === normalized || partner.shortSlugs.includes(normalized),
    ) ?? null
  );
}

export function getPublicPartnerSlugs() {
  return new Set(PARTNER_CONFIGS.flatMap((partner) => [partner.slug, ...partner.shortSlugs]));
}
