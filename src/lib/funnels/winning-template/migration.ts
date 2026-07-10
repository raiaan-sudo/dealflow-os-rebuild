import { buildWinningFunnel } from "@/lib/funnels/winning-template/build-winning-funnel";
import type { WinningFunnelBlueprint } from "@/lib/funnels/winning-template/schema";
import type { WinningFunnelSourceInput } from "@/lib/funnels/winning-template/variants";

export type WinningFunnelMigrationMode = "dry-run" | "apply";

export type WinningFunnelMigrationInput = {
  campaignId: string;
  campaignPlan: Record<string, unknown>;
  mode?: WinningFunnelMigrationMode;
};

export type WinningFunnelMigrationResult = {
  campaignId: string;
  mode: WinningFunnelMigrationMode;
  changed: boolean;
  winningFunnel: WinningFunnelBlueprint;
  archivedLegacyFunnel: unknown;
  metadata: {
    migratedToTemplateId: string;
    migratedAt: string;
    source: "winning_funnel_v1_migration";
  };
};

function text(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function marketType(value: unknown): WinningFunnelSourceInput["market_type"] {
  const normalized = text(value).toLowerCase();

  return normalized === "buyer" ||
    normalized === "seller" ||
    normalized === "investor" ||
    normalized === "commercial" ||
    normalized === "approval" ||
    normalized === "refinance" ||
    normalized === "other"
    ? normalized
    : "buyer";
}

export function buildWinningFunnelMigration(input: WinningFunnelMigrationInput): WinningFunnelMigrationResult {
  const plan = input.campaignPlan;
  const legacyFunnel = plan.funnel ?? asRecord(plan.campaign_payload)?.funnel ?? null;
  const legacyRecord = asRecord(legacyFunnel);
  const campaignPayload = asRecord(plan.campaign_payload) ?? {};
  const migrationInput: WinningFunnelSourceInput = {
    location: text(plan.market) || text(campaignPayload.market) || "your market",
    audience: text(plan.audience) || text(campaignPayload.audience) || "qualified local prospects",
    offer:
      text(plan.key_offer) ||
      text(plan.keyOffer) ||
      text(campaignPayload.key_offer) ||
      text(legacyRecord?.headline) ||
      "a clearer next step",
    primaryCTA: text(legacyRecord?.cta) || text(campaignPayload.cta) || "Get Started",
    market_type: marketType(plan.intent || campaignPayload.intent),
    language: text(plan.language) || text(campaignPayload.language) || "en",
    theme: asRecord(plan.theme) ?? asRecord(campaignPayload.theme) ?? undefined,
  };
  const winningFunnel = buildWinningFunnel(migrationInput);

  return {
    campaignId: input.campaignId,
    mode: input.mode ?? "dry-run",
    changed: JSON.stringify(legacyFunnel) !== JSON.stringify(winningFunnel),
    winningFunnel,
    archivedLegacyFunnel: legacyFunnel,
    metadata: {
      migratedToTemplateId: winningFunnel.funnelTemplateId,
      migratedAt: new Date().toISOString(),
      source: "winning_funnel_v1_migration",
    },
  };
}
