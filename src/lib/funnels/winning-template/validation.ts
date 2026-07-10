import {
  WINNING_FUNNEL_ANGLES,
  WINNING_FUNNEL_LANGUAGES,
  WINNING_FUNNEL_LEAD_CAPTURE_MODES,
  WINNING_FUNNEL_LEAD_TYPES,
  WINNING_FUNNEL_TEMPLATE_ID,
  WINNING_FUNNEL_TEMPLATE_VERSION,
  type WinningFunnelMetadata,
} from "@/lib/funnels/winning-template/schema";

export type WinningFunnelValidationResult = {
  ok: boolean;
  blockers: string[];
  warnings: string[];
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isAllowed(value: unknown, allowed: readonly string[]) {
  return typeof value === "string" && allowed.includes(value);
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateWinningFunnel(value: unknown): WinningFunnelValidationResult {
  const funnel = asRecord(value);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!funnel) {
    return {
      ok: false,
      blockers: ["funnel_missing"],
      warnings,
    };
  }

  if (funnel.funnelTemplateId !== WINNING_FUNNEL_TEMPLATE_ID) {
    blockers.push("wrong_template_id");
  }

  if (funnel.funnelTemplateVersion !== WINNING_FUNNEL_TEMPLATE_VERSION) {
    blockers.push("wrong_template_version");
  }

  if (funnel.templateLocked !== true) {
    blockers.push("template_not_locked");
  }

  if (!hasText(funnel.headline)) blockers.push("headline_missing");
  if (!hasText(funnel.subheadline)) blockers.push("subheadline_missing");
  if (!hasText(funnel.cta)) blockers.push("cta_missing");
  const formFields = Array.isArray(funnel.form_fields) ? funnel.form_fields.map(String) : [];
  if (!["name", "phone", "email"].every((field) => formFields.includes(field))) {
    blockers.push("opt_in_fields_missing");
  }
  if (!Array.isArray(funnel.sections) || funnel.sections.length !== 4) blockers.push("reference_sections_missing");

  if (!isAllowed(funnel.leadType, WINNING_FUNNEL_LEAD_TYPES)) warnings.push("lead_type_defaulted_or_unknown");
  if (!isAllowed(funnel.campaignAngle, WINNING_FUNNEL_ANGLES)) warnings.push("campaign_angle_defaulted_or_unknown");
  if (!isAllowed(funnel.language, WINNING_FUNNEL_LANGUAGES)) blockers.push("language_invalid");
  if (!isAllowed(funnel.leadCaptureMode, WINNING_FUNNEL_LEAD_CAPTURE_MODES)) warnings.push("lead_capture_mode_defaulted_or_unknown");

  const sectionVariants = new Set(
    Array.isArray(funnel.sections)
      ? funnel.sections.map((section) => asRecord(section)?.variant).filter(Boolean)
      : [],
  );

  if (!sectionVariants.has("reference-centered-hero")) blockers.push("reference_hero_missing");
  if (!sectionVariants.has("reference-trust-row")) blockers.push("reference_trust_missing");
  if (!sectionVariants.has("reference-opt-in-card")) blockers.push("reference_opt_in_missing");
  if (!sectionVariants.has("reference-minimal-legal")) blockers.push("reference_legal_missing");

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
  };
}

export function assertWinningFunnel(value: unknown): asserts value is WinningFunnelMetadata {
  const result = validateWinningFunnel(value);

  if (!result.ok) {
    throw new Error(`Winning funnel validation failed: ${result.blockers.join(", ")}`);
  }
}
