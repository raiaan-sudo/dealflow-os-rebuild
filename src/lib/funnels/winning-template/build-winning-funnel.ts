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
  buildWinningQuizSteps,
  buildWinningSubheadline,
  resolveWinningAngle,
  resolveWinningLeadCaptureMode,
  resolveWinningLeadType,
} from "@/lib/funnels/winning-template/variants";
import type { FunnelEngineInput, FunnelGoal, FunnelMarketType } from "@/lib/services/funnel-engine";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function marketType(value: unknown): FunnelMarketType {
  return value === "seller" ||
    value === "investor" ||
    value === "approval" ||
    value === "refinance" ||
    value === "commercial" ||
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

export function normalizeWinningFunnelInput(input?: FunnelEngineInput | null): WinningFunnelInput {
  const raw = input ?? {};
  const market = text(raw.market) || text(raw.location) || "your market";
  const audience = text(raw.audience) || "qualified local prospects";
  const offer = text(raw.key_offer) || text(raw.offer) || "a clearer next step";
  const leadType = resolveWinningLeadType(raw);
  const language = normalizeWinningFunnelLanguage((raw as Record<string, unknown>).language);
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
    agentName: text((raw as Record<string, unknown>).agentName) || text((raw as Record<string, unknown>).agent_name) || "Your local advisor",
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

export function buildWinningFunnel(input?: FunnelEngineInput | null): WinningFunnelBlueprint {
  const normalized = normalizeWinningFunnelInput(input);
  const copy = getWinningFunnelLanguageCopy(normalized.language);
  const headline = text((input as FunnelEngineInput | null | undefined)?.headline) || buildWinningHeadline(normalized);
  const subheadline = text((input as FunnelEngineInput | null | undefined)?.subheadline) || buildWinningSubheadline(normalized);
  const cta = buildWinningCta({ ...normalized, cta: normalized.cta });
  const quizSteps = buildWinningQuizSteps(normalized);
  const proofBadges = unique([
    copy.trustFree,
    copy.trustNoObligation,
    copy.trustAdvisor,
    ...normalized.proofBadges,
  ]).slice(0, 6);
  const testimonials =
    normalized.testimonials.length > 0
      ? normalized.testimonials.slice(0, 4)
      : [
          {
            quote: "The process felt clear, calm, and practical from the first step.",
            name: "Verified local client",
            label: "Client review",
          },
        ];

  return {
    funnel_type: WINNING_FUNNEL_TYPE_BY_GOAL[normalized.funnelGoal],
    headline,
    subheadline,
    cta,
    sections: [
      createWinningFunnelSection("hero", "winning-hero", headline, [subheadline, `Primary CTA: ${cta}`], {
        variant: "locked-hero",
        theme: "dark",
        spacing: "spacious",
      }),
      createWinningFunnelSection("trust_bar", "winning-trust-bar", copy.freeNoObligation, proofBadges, {
        variant: "risk-reversal-strip",
        theme: "accent",
        spacing: "compact",
      }),
      createWinningFunnelSection("form", "winning-quiz-form", "Start with the short quiz", [
        copy.quizIntro,
        ...quizSteps.map((step) => `${step.question}: ${(step.options ?? step.fields ?? []).join(", ")}`),
        `Primary CTA: ${cta}`,
      ], {
        variant: "native-multi-step-quiz",
        theme: "dark",
      }),
      createWinningFunnelSection("process", "winning-agent-authority", copy.agentSectionEyebrow, [
        `${normalized.agentName} helps ${normalized.audience} in ${normalized.market} make the next move with clearer timing, fit, and local context.`,
        normalized.brokerageName ?? "DealFlow partner",
      ], {
        variant: "agent-authority",
        theme: "light",
      }),
      createWinningFunnelSection("proof_metrics", "winning-proof-badges", copy.proofSectionEyebrow, proofBadges, {
        variant: "credential-badges",
        theme: "accent",
      }),
      createWinningFunnelSection("social_proof", "winning-testimonials", copy.proofSectionEyebrow, testimonials.map((item) => {
        const label = item.label ? ` ${item.label}` : "";
        return `"${item.quote}" - ${item.name}${label}`;
      }), {
        variant: "review-cards",
        theme: "light",
      }),
      createWinningFunnelSection("objections", "winning-compliance", "Clear expectations", [
        copy.footerCompliance,
        normalized.leadCaptureMode === "volume_lead_form"
          ? "This campaign uses a low-friction lead form for higher response volume."
          : normalized.leadCaptureMode === "deep_qualification"
            ? "This campaign uses deeper qualification before follow-up."
            : "This campaign uses a short quiz to balance lead quality and conversion rate.",
      ], {
        variant: "safe-expectations",
        theme: "light",
      }),
      createWinningFunnelSection("closing_cta", "winning-thank-you", copy.thankYouHeadline, [
        copy.thankYouBody,
        `Primary CTA: ${cta}`,
      ], {
        variant: "thank-you-state",
        theme: "accent",
      }),
    ],
    form_fields: [...WINNING_FUNNEL_FORM_FIELDS],
    follow_up_action: normalized.funnelGoal === "book_call" ? "redirect_to_calendar" : "show_thank_you_page",
    optimization_notes: [
      "Locked real_estate_lead_quiz_v1 layout. Only copy, proof, language, theme, logo, and quiz slots should change.",
      `Variant: ${normalized.campaignAngle}. Lead capture mode: ${normalized.leadCaptureMode}. Language: ${normalized.language}.`,
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
    testimonials,
    agent: {
      name: normalized.agentName,
      brokerageName: normalized.brokerageName ?? "DealFlow partner",
      phone: normalized.phone,
      email: normalized.email,
    },
  };
}
