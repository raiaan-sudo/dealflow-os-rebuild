import { buildWinningFunnel } from "@/lib/funnels/winning-template/build-winning-funnel";
import { isWinningFunnelBlueprint, type WinningFunnelBlueprint } from "@/lib/funnels/winning-template/schema";
import type { CampaignPlan } from "@/lib/services/campaign-plan-service";
import type { FunnelEngineInput, FunnelMarketType } from "@/lib/services/funnel-engine";
import type { FullCampaignRecord } from "@/lib/types/campaign-records";

const LEGACY_DEFAULT_PATTERNS = [
  ["View homes", "that actually match", "your criteria"].join(" "),
  ["Quick", "capture"].join(" "),
  ["Local real estate", "advisor"].join(" "),
  ["Get", "List"].join(" "),
  ["matched to your", "criteria"].join(" "),
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
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

function isSafeUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function containsLegacyDefaultFunnelCopy(value: unknown) {
  const serialized = JSON.stringify(value ?? {}).toLowerCase();
  return LEGACY_DEFAULT_PATTERNS.some((pattern) => serialized.includes(pattern.toLowerCase()));
}

export function isExplicitLegacyFunnel(value: unknown) {
  const record = asRecord(value);
  const templateKey = text(record.templateKey ?? record.template_key ?? record.funnelTemplateId ?? record.funnel_template_id);

  return templateKey.toLowerCase() === "legacy" || record.legacyTemplate === true || record.legacy_template === true;
}

function shouldRebuildCanonicalFunnel(value: unknown) {
  if (isExplicitLegacyFunnel(value)) return false;
  if (!isWinningFunnelBlueprint(value)) return true;
  return containsLegacyDefaultFunnelCopy(value);
}

function getFunnelTheme(funnel: unknown) {
  const theme = asRecord(asRecord(funnel).theme);

  return {
    primaryColor: text(theme.primaryColor),
    secondaryColor: text(theme.secondaryColor),
    accentColor: text(theme.accentColor),
    fontPreset: text(theme.fontPreset),
    logoUrl: isSafeUrl(theme.logoUrl) ? text(theme.logoUrl) : null,
    agentPhotoUrl: isSafeUrl(theme.agentPhotoUrl) ? text(theme.agentPhotoUrl) : null,
  };
}

function getFunnelAgent(funnel: unknown) {
  const agent = asRecord(asRecord(funnel).agent);

  return {
    agentName: text(agent.name),
    brokerageName: text(agent.brokerageName ?? agent.brokerage_name),
    phone: text(agent.phone),
    email: text(agent.email),
  };
}

function buildInputFromPlan(plan: CampaignPlan): FunnelEngineInput {
  const funnel = asRecord(plan.funnel);
  const agent = getFunnelAgent(funnel);
  const theme = getFunnelTheme(funnel);

  return {
    location: plan.market,
    market: plan.market,
    audience: plan.audience,
    offer: plan.keyOffer || plan.offerSummary || plan.primaryGoal,
    key_offer: plan.keyOffer || plan.offerSummary || plan.primaryGoal,
    market_type: marketType(plan.intent),
    funnel_goal: plan.funnelType === "landing_page_form" ? "lead_form" : plan.funnelType === "landing_page_book_call" ? "book_call" : "survey",
    language: text(funnel.language) || text((plan as unknown as Record<string, unknown>).funnel_language) || "en",
    leadCaptureMode: text(funnel.leadCaptureMode) || text((plan as unknown as Record<string, unknown>).lead_capture_mode),
    primaryCTA: containsLegacyDefaultFunnelCopy(funnel) ? "" : text(funnel.cta),
    theme,
    agentName: agent.agentName,
    brokerageName: agent.brokerageName || plan.businessName || plan.clientName,
    phone: agent.phone,
    email: agent.email,
  };
}

export function buildCanonicalFunnelFromPlan(plan: CampaignPlan): WinningFunnelBlueprint {
  if (!shouldRebuildCanonicalFunnel(plan.funnel)) {
    return plan.funnel as unknown as WinningFunnelBlueprint;
  }

  return buildWinningFunnel(buildInputFromPlan(plan));
}

export function buildCanonicalFunnelFromRecord(record: FullCampaignRecord): WinningFunnelBlueprint {
  if (!shouldRebuildCanonicalFunnel(record.funnel)) {
    return record.funnel as unknown as WinningFunnelBlueprint;
  }

  const funnel = asRecord(record.funnel);
  const agent = getFunnelAgent(funnel);
  const theme = getFunnelTheme(funnel);

  return buildWinningFunnel({
    location: record.plan.market,
    market: record.plan.market,
    audience: record.plan.audience,
    offer: record.plan.offer || record.plan.offer_summary || record.plan.primary_goal,
    key_offer: record.plan.offer || record.plan.offer_summary || record.plan.primary_goal,
    market_type: marketType(record.plan.intent),
    funnel_goal: record.plan.funnel_type === "landing_page_form" ? "lead_form" : record.plan.funnel_type === "landing_page_book_call" ? "book_call" : "survey",
    language: text(funnel.language) || "en",
    leadCaptureMode: text(funnel.leadCaptureMode),
    primaryCTA: containsLegacyDefaultFunnelCopy(funnel) ? "" : text(funnel.cta),
    theme,
    agentName: agent.agentName,
    brokerageName: agent.brokerageName || record.plan.business_name || record.plan.client_name,
    phone: agent.phone,
    email: agent.email,
  });
}
