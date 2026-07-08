export const CURRENT_PUBLIC_FUNNEL_PRESET_VERSION = "dealflow-public-v1" as const;

export const CANONICAL_PUBLIC_FORM_ID = "lead-form" as const;
export const CANONICAL_PUBLIC_SUBMIT_ENDPOINT = "/api/lead-capture" as const;
export const CANONICAL_PUBLIC_META_EVENT_NAME = "Lead" as const;

export const BANNED_PUBLIC_SECTION_TYPES = [
  "faq",
  "process",
  "market_snapshot",
  "objections",
  "form",
  "closing_cta",
  "vsl",
  "image",
] as const;

export const CANONICAL_PUBLIC_SLOT_NAMES = [
  "hero",
  "trust",
  "offer",
  "value",
  "qualification",
  "expectations",
  "leadForm",
] as const;

