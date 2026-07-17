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
import type { CampaignIntent } from "@/lib/campaign-intent";
import { sanitizeAdClaimText } from "@/lib/copy/claim-safety";

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

function winningClaimIntent(leadType: WinningFunnelInput["leadType"]): CampaignIntent {
  if (leadType === "seller") return "seller";
  if (leadType === "investor") return "investor";
  return "buyer";
}

function localizedSafeOffer(params: Pick<WinningFunnelInput, "language" | "leadType" | "market">) {
  if (params.language === "fr") {
    return params.leadType === "seller"
      ? `Examinez une estimation et un plan de vente fondés sur le marché à ${params.market}`
      : `Examinez des options immobilières personnalisées à ${params.market}`;
  }

  if (params.language === "es") {
    return params.leadType === "seller"
      ? `Revise una valoración y un plan de venta basados en el mercado en ${params.market}`
      : `Revise opciones inmobiliarias personalizadas en ${params.market}`;
  }

  return params.leadType === "seller"
    ? `Review a market-based home value and sale plan in ${params.market}`
    : `Review personalized real estate options in ${params.market}`;
}

export function normalizeWinningFunnelInput(input?: WinningFunnelSourceInput | null): WinningFunnelInput {
  const raw = input ?? {};
  const market = text(raw.market) || text(raw.location) || "your market";
  const audience = text(raw.audience) || "qualified local prospects";
  const leadType = resolveWinningLeadType(raw);
  const language = normalizeWinningFunnelLanguage((raw as Record<string, unknown>).language);
  const claimIntent = winningClaimIntent(leadType);
  const offer = sanitizeAdClaimText(text(raw.key_offer) || text(raw.offer) || "a clearer next step", {
    intent: claimIntent,
    location: market,
    fallback: localizedSafeOffer({ language, leadType, market }),
  });
  const copy = getWinningFunnelLanguageCopy(language);
  const campaignAngle = resolveWinningAngle(raw, leadType);
  const leadCaptureMode = resolveWinningLeadCaptureMode(raw);

  return {
    market,
    audience,
    offer,
    cta: sanitizeAdClaimText(text(raw.primaryCTA) || text(raw.primary_cta), {
      intent: claimIntent,
      location: market,
      fallback: language === "fr" ? "Voir mes options" : language === "es" ? "Ver mis opciones" : "Review My Options",
    }),
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
  const claimIntent = winningClaimIntent(normalized.leadType);
  const safeFallback = localizedSafeOffer(normalized);
  const sanitize = (value: unknown, fallback = safeFallback) => sanitizeAdClaimText(value, {
    intent: claimIntent,
    location: normalized.market,
    fallback,
  });
  const headline = sanitize(text(input?.headline) || buildWinningHeadline(normalized));
  const subheadline = sanitize(text(input?.subheadline) || buildWinningSubheadline(normalized));
  const cta = sanitize(
    buildWinningCta({ ...normalized, cta: normalized.cta }),
    normalized.language === "fr" ? "Voir mes options" : normalized.language === "es" ? "Ver mis opciones" : "Review My Options",
  );
  const microLabel = sanitize(buildWinningMicroLabel(normalized));
  const quizSteps = buildWinningQuizSteps(normalized);
  const proofBadges = unique(buildWinningTrustBullets(normalized).map((value) => sanitize(value)));
  return {
    funnel_type: WINNING_FUNNEL_TYPE_BY_GOAL[normalized.funnelGoal],
    headline,
    subheadline,
    cta,
    sections: [
      createWinningFunnelSection("hero", "reference-opt-in-hero", headline, [microLabel, subheadline], {
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
