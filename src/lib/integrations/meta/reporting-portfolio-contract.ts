import type { MetaCampaignSyncSnapshot } from "@/lib/integrations/meta/types";

export type ReportingPortfolioState =
  | "current"
  | "delayed"
  | "stale"
  | "partial"
  | "missing"
  | "failed";

export type ReportingMetricValue = number | null;

export type LeadOutcomePortfolio = {
  capturedLeads: number;
  conversations: number;
  appointments: number;
  qualified: number;
  closedWon: number;
  latestReceivedAt: string | null;
} | null;

export type MetaReportingPortfolio = {
  state: ReportingPortfolioState;
  source: "meta";
  receivedAt: string | null;
  ageMinutes: number | null;
  metrics: {
    spend: ReportingMetricValue;
    impressions: ReportingMetricValue;
    clicks: ReportingMetricValue;
    leads: ReportingMetricValue;
    ctr: ReportingMetricValue;
    cpl: ReportingMetricValue;
  };
  outcomes: LeadOutcomePortfolio;
};

function finiteNonnegative(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
}

export function buildMetaReportingPortfolio(params: {
  snapshot: MetaCampaignSyncSnapshot | null | undefined;
  outcomes?: LeadOutcomePortfolio;
  now?: Date;
  delayedAfterMinutes?: number;
  staleAfterMinutes?: number;
}): MetaReportingPortfolio {
  const snapshot = params.snapshot;
  const receivedAt = snapshot?.syncedAt ?? snapshot?.lastSyncedAt ?? null;
  const receivedAtMs = receivedAt ? Date.parse(receivedAt) : Number.NaN;
  const nowMs = (params.now ?? new Date()).getTime();
  const ageMinutes = Number.isFinite(receivedAtMs)
    ? Math.max(0, Math.floor((nowMs - receivedAtMs) / 60_000))
    : null;
  const completeness = snapshot?.reportingCompleteness;
  let state: ReportingPortfolioState;
  if (!snapshot || !receivedAt || completeness === "missing") state = "missing";
  else if (completeness === "failed" || snapshot.syncResult === "failed") state = "failed";
  else if (completeness === "partial" || snapshot.syncResult === "partial_success") state = "partial";
  else if (ageMinutes === null) state = "missing";
  else if (ageMinutes > (params.staleAfterMinutes ?? 60)) state = "stale";
  else if (ageMinutes > (params.delayedAfterMinutes ?? 15)) state = "delayed";
  else state = "current";

  const mayDisplayProviderMetrics = !["missing", "failed"].includes(state);
  const delivery = snapshot?.deliveryMetrics;
  const spend = mayDisplayProviderMetrics ? finiteNonnegative(delivery?.spend) : null;
  const leads = mayDisplayProviderMetrics ? finiteNonnegative(delivery?.leads) : null;
  return {
    state,
    source: "meta",
    receivedAt,
    ageMinutes,
    metrics: {
      spend,
      impressions: mayDisplayProviderMetrics ? finiteNonnegative(delivery?.impressions) : null,
      clicks: mayDisplayProviderMetrics ? finiteNonnegative(delivery?.clicks) : null,
      leads,
      ctr: mayDisplayProviderMetrics ? finiteNonnegative(delivery?.ctr) : null,
      cpl: spend !== null && leads !== null && leads > 0 ? spend / leads : null,
    },
    outcomes: params.outcomes ?? null,
  };
}
