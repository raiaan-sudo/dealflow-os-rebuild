import {
  WINNING_FUNNEL_ALLOWED_EDIT_SLOTS,
  WINNING_FUNNEL_FORM_FIELDS,
  WINNING_FUNNEL_TEMPLATE_ID,
  WINNING_FUNNEL_TEMPLATE_VERSION,
  WINNING_FUNNEL_TYPE_BY_GOAL,
  createWinningFunnelSection,
  type WinningFunnelBlueprint,
  type WinningFunnelInput,
} from "@/lib/funnels/winning-template/schema";
import { getWinningFunnelLanguageCopy, normalizeWinningFunnelLanguage } from "@/lib/funnels/winning-template/language";
import { normalizeWinningFunnelTheme } from "@/lib/funnels/winning-template/theme";
import {
  buildWinningCta,
  buildWinningHeadline,
  buildWinningMicroLabel,
  buildWinningQuizSteps,
  buildWinningSubheadline,
  buildWinningTrustBullets,
  resolveWinningAngle,
  resolveWinningLeadCaptureMode,
  resolveWinningLeadType,
  type WinningFunnelSourceInput,
} from "@/lib/funnels/winning-template/variants";
import type { FunnelGoal, FunnelMarketType } from "@/lib/services/funnel-engine";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function marketType(value: unknown): FunnelMarketType {
  return value === "seller" ||
    value === "investor" ||
    value === "approval" ||
    value === "refinance" ||
    value === "other"
    ? value
    : "buyer";
}

function funnelGoal(value: unknown): FunnelGoal {
  return value === "lead_form" || value === "book_call" || value === "survey" ? value : "survey";
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      if (!value || seen.has(value.toLowerCase())) return false;
      seen.add(value.toLowerCase());
      return true;
    });
}

function legalDisclosure(copy: ReturnType<typeof getWinningFunnelLanguageCopy>) {
  return copy.footerCompliance;
}

export function normalizeWinningFunnelInput(input?: WinningFunnelSourceInput | null): WinningFunnelInput {
  const raw = input ?? {};
  const market = text(raw.market) || text(raw.location) || "your market";
  const audience = text(raw.audience) || "qualified local prospects";
  const offer = text(raw.key_offer) || text(raw.offer) || "a clearer next step";
  const leadType = resolveWinningLeadType(raw);
  const language = normalizeWinningFunnelLanguage((raw as Record<string, unknown>).language);
  const copy = getWinningFunnelLanguageCopy(language);
  const campaignAngle = resolveWinningAngle(raw, leadType);
  const leadCaptureMode = resolveWinningLeadCaptureMode(raw);

  return {
    market,
    audience,
    offer,
    cta: text(raw.primaryCTA) || text(raw.primary_cta),
    leadType,
    campaignAngle,
    funnelGoal: funnelGoal(raw.funnel_goal),
    marketType: marketType(raw.market_type),
    language,
    leadCaptureMode,
    agentName: text((raw as Record<string, unknown>).agentName) || text((raw as Record<string, unknown>).agent_name) || copy.defaultAdvisorName,
    brokerageName:
      text((raw as Record<string, unknown>).brokerageName) ||
      text((raw as Record<string, unknown>).brokerage_name) ||
      "DealFlow partner",
    phone: text((raw as Record<string, unknown>).phone) || undefined,
    email: text((raw as Record<string, unknown>).email) || undefined,
    proofBadges: unique([
      ...(((raw as Record<string, unknown>).proofBadges as string[]) ?? []),
      ...(((raw as Record<string, unknown>).proof_badges as string[]) ?? []),
    ]),
    testimonials: Array.isArray((raw as Record<string, unknown>).testimonials)
      ? (((raw as Record<string, unknown>).testimonials as WinningFunnelInput["testimonials"]) ?? [])
      : [],
    theme: normalizeWinningFunnelTheme((raw as Record<string, unknown>).theme as Partial<WinningFunnelInput["theme"]> | undefined),
  };
}

export function buildWinningFunnel(input?: WinningFunnelSourceInput | null): WinningFunnelBlueprint {
  const normalized = normalizeWinningFunnelInput(input);
  const copy = getWinningFunnelLanguageCopy(normalized.language);
  const headline = text(input?.headline) || buildWinningHeadline(normalized);
  const subheadline = text(input?.subheadline) || buildWinningSubheadline(normalized);
  const cta = buildWinningCta({ ...normalized, cta: normalized.cta });
  const microLabel = buildWinningMicroLabel(normalized);
  const quizSteps = buildWinningQuizSteps(normalized);
  const proofBadges = unique(buildWinningTrustBullets(normalized));
  return {
    funnel_type: WINNING_FUNNEL_TYPE_BY_GOAL[normalized.funnelGoal],
    headline,
    subheadline,
    cta,
    sections: [
      createWinningFunnelSection("hero", "reference-opt-in-hero", headline, [microLabel, subheadline, `Primary CTA: ${cta}`], {
        variant: "reference-centered-hero",
        theme: "light",
        spacing: "spacious",
      }),
      createWinningFunnelSection("trust_bar", "reference-opt-in-trust", microLabel, proofBadges, {
        variant: "reference-trust-row",
        theme: "accent",
        spacing: "compact",
      }),
      createWinningFunnelSection("form", "reference-opt-in-form", "Tell us where to send your options", [
        "Name, email, and phone only.",
        `Primary CTA: ${cta}`,
      ], {
        variant: "reference-opt-in-card",
        theme: "light",
        spacing: "compact",
      }),
      createWinningFunnelSection("objections", "reference-opt-in-legal", "Privacy and expectations", [
        legalDisclosure(copy),
      ], {
        variant: "reference-minimal-legal",
        theme: "light",
        spacing: "compact",
      }),
    ],
    form_fields: [...WINNING_FUNNEL_FORM_FIELDS],
    follow_up_action: normalized.funnelGoal === "book_call" ? "redirect_to_calendar" : "show_thank_you_page",
    optimization_notes: [
      "Locked reference_opt_in_funnel_v1 layout. Only copy, trust bullets, language, theme, logo, and opt-in fields should change.",
      `Variant: ${normalized.campaignAngle}. Lead capture mode: simple_opt_in. Language: ${normalized.language}.`,
    ],
    funnelTemplateId: WINNING_FUNNEL_TEMPLATE_ID,
    funnelTemplateVersion: WINNING_FUNNEL_TEMPLATE_VERSION,
    templateLocked: true,
    allowedEditSlots: [...WINNING_FUNNEL_ALLOWED_EDIT_SLOTS],
    leadType: normalized.leadType,
    campaignAngle: normalized.campaignAngle,
    language: normalized.language,
    leadCaptureMode: normalized.leadCaptureMode,
    theme: normalized.theme,
    quizSteps,
    proofBadges,
    testimonials: [],
    agent: {
      name: normalized.agentName,
      brokerageName: normalized.brokerageName ?? "DealFlow partner",
      phone: normalized.phone,
      email: normalized.email,
    },
  };
}
