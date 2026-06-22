import type {
  FunnelBlueprint,
  FunnelGoal,
  FunnelMarketType,
  FunnelSection,
  FunnelType,
} from "@/lib/services/funnel-engine";

export const WINNING_FUNNEL_TEMPLATE_ID = "reference_opt_in_funnel_v1" as const;
export const WINNING_FUNNEL_TEMPLATE_VERSION = 2 as const;

export const WINNING_FUNNEL_LANGUAGES = ["en", "fr", "es"] as const;
export type WinningFunnelLanguage = (typeof WINNING_FUNNEL_LANGUAGES)[number];

export const WINNING_FUNNEL_LEAD_TYPES = ["buyer", "seller", "investor", "commercial"] as const;
export type WinningFunnelLeadType = (typeof WINNING_FUNNEL_LEAD_TYPES)[number];

export const WINNING_FUNNEL_ANGLES = [
  "buyer_access",
  "seller_valuation",
  "investor_opportunity",
  "commercial",
  "upsizer",
  "downsizer",
  "first_time_buyer",
  "luxury",
  "off_market",
  "home_value",
  "seller_consultation",
] as const;
export type WinningFunnelAngle = (typeof WINNING_FUNNEL_ANGLES)[number];

export const WINNING_FUNNEL_LEAD_CAPTURE_MODES = [
  "quality_funnel",
  "volume_lead_form",
  "deep_qualification",
] as const;
export type WinningFunnelLeadCaptureMode = (typeof WINNING_FUNNEL_LEAD_CAPTURE_MODES)[number];

export type WinningFunnelTheme = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontPreset: "modern" | "classic" | "luxury";
  logoUrl?: string | null;
  agentPhotoUrl?: string | null;
};

export type WinningFunnelTestimonial = {
  quote: string;
  name: string;
  label?: string;
};

export type WinningFunnelQuizStep = {
  id: "motivation" | "budget" | "timeline" | "contact";
  question: string;
  options?: string[];
  fields?: string[];
};

export type WinningFunnelInput = {
  market: string;
  audience: string;
  offer: string;
  cta: string;
  leadType: WinningFunnelLeadType;
  campaignAngle: WinningFunnelAngle;
  funnelGoal: FunnelGoal;
  marketType: FunnelMarketType;
  language: WinningFunnelLanguage;
  leadCaptureMode: WinningFunnelLeadCaptureMode;
  agentName: string;
  brokerageName?: string;
  phone?: string;
  email?: string;
  proofBadges: string[];
  testimonials: WinningFunnelTestimonial[];
  theme: WinningFunnelTheme;
};

export type WinningFunnelMetadata = {
  funnelTemplateId: typeof WINNING_FUNNEL_TEMPLATE_ID;
  funnelTemplateVersion: typeof WINNING_FUNNEL_TEMPLATE_VERSION;
  templateLocked: true;
  allowedEditSlots: string[];
  leadType: WinningFunnelLeadType;
  campaignAngle: WinningFunnelAngle;
  language: WinningFunnelLanguage;
  leadCaptureMode: WinningFunnelLeadCaptureMode;
  theme: WinningFunnelTheme;
  quizSteps: WinningFunnelQuizStep[];
  proofBadges: string[];
  testimonials: WinningFunnelTestimonial[];
  agent: {
    name: string;
    brokerageName: string;
    phone?: string;
    email?: string;
  };
};

export type WinningFunnelBlueprint = FunnelBlueprint & WinningFunnelMetadata;

export const WINNING_FUNNEL_ALLOWED_EDIT_SLOTS = [
  "market",
  "audience",
  "offer",
  "cta",
  "headline",
  "subheadline",
  "proofBadges",
  "agentName",
  "brokerageName",
  "phone",
  "email",
  "language",
  "theme.primaryColor",
  "theme.secondaryColor",
  "theme.accentColor",
  "theme.logoUrl",
  "theme.agentPhotoUrl",
] as const;

export const WINNING_FUNNEL_FORM_FIELDS = ["name", "phone", "email"] as const;

export const WINNING_FUNNEL_TYPE_BY_GOAL: Record<FunnelGoal, FunnelType> = {
  lead_form: "landing_page_form",
  survey: "landing_page_survey",
  book_call: "landing_page_book_call",
};

export function isWinningFunnelBlueprint(value: unknown): value is WinningFunnelBlueprint {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Record<string, unknown>).funnelTemplateId === WINNING_FUNNEL_TEMPLATE_ID,
  );
}

export function createWinningFunnelSection(
  type: FunnelSection["type"],
  id: string,
  title: string,
  content: string[],
  options?: {
    variant?: string;
    visible?: boolean;
    theme?: "light" | "dark" | "accent";
    width?: "full" | "content" | "narrow";
    align?: "left" | "center";
    spacing?: "compact" | "comfortable" | "spacious";
  },
): FunnelSection {
  return {
    id,
    type,
    variant: options?.variant ?? "winning-template",
    title,
    content: content.map((item) => item.trim()).filter(Boolean),
    visible: options?.visible ?? true,
    style: {
      spacing: options?.spacing ?? "comfortable",
      width: options?.width ?? "content",
      align: options?.align ?? "center",
      theme: options?.theme ?? "light",
    },
    media: null,
  };
}
