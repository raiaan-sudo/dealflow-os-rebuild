export const META_REPORTING_ATTRIBUTION_WINDOW_DAYS = 7 as const;

export type MetaReportingWindow = {
  since: string;
  until: string;
  days: typeof META_REPORTING_ATTRIBUTION_WINDOW_DAYS;
};

type ProviderDeliveryInsight = {
  impressions?: string | number;
  clicks?: string | number;
  ctr?: string | number;
  frequency?: string | number;
  reach?: string | number;
};

function requireNonNegativeProviderNumber(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new RangeError(`Meta ${field} must be a finite non-negative number.`);
  }
  return parsed;
}

function utcDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function buildMetaReportingWindow(now = new Date()): MetaReportingWindow {
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError("Meta reporting window requires a valid timestamp.");
  }
  const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (META_REPORTING_ATTRIBUTION_WINDOW_DAYS - 1));
  return {
    since: utcDate(since),
    until: utcDate(until),
    days: META_REPORTING_ATTRIBUTION_WINDOW_DAYS,
  };
}

export function readMetaReportingWindow(value: unknown): MetaReportingWindow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.since !== "string" ||
    typeof row.until !== "string" ||
    row.days !== META_REPORTING_ATTRIBUTION_WINDOW_DAYS ||
    !/^\d{4}-\d{2}-\d{2}$/.test(row.since) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(row.until)
  ) {
    return null;
  }
  const since = Date.parse(`${row.since}T00:00:00.000Z`);
  const until = Date.parse(`${row.until}T00:00:00.000Z`);
  if (
    !Number.isFinite(since) ||
    !Number.isFinite(until) ||
    until < since ||
    Math.round((until - since) / 86_400_000) + 1 !== META_REPORTING_ATTRIBUTION_WINDOW_DAYS
  ) {
    return null;
  }
  return { since: row.since, until: row.until, days: META_REPORTING_ATTRIBUTION_WINDOW_DAYS };
}

export function metaReportingTimeRange(window: MetaReportingWindow) {
  return JSON.stringify({ since: window.since, until: window.until });
}

/** Meta's Insights API reports CTR as percent; DealFlow persists CTR as a ratio. */
export function metaCtrPercentToRatio(providerCtr: unknown) {
  return requireNonNegativeProviderNumber(providerCtr, "ctr") / 100;
}

/** Optimizer policy thresholds are expressed in percentage points. */
export function metaCtrRatioToPolicyPercent(persistedRatio: unknown) {
  return requireNonNegativeProviderNumber(persistedRatio, "ctr ratio") * 100;
}

export function normalizeMetaDeliveryInsight(insight: ProviderDeliveryInsight | null | undefined) {
  const impressions = requireNonNegativeProviderNumber(insight?.impressions ?? 0, "impressions");
  const clicks = requireNonNegativeProviderNumber(insight?.clicks ?? 0, "clicks");
  const reach = requireNonNegativeProviderNumber(insight?.reach ?? 0, "reach");
  const frequency =
    insight?.frequency !== undefined
      ? requireNonNegativeProviderNumber(insight.frequency, "frequency")
      : reach > 0
        ? impressions / reach
        : 0;
  const ctr =
    insight?.ctr !== undefined
      ? metaCtrPercentToRatio(insight.ctr)
      : impressions > 0
        ? clicks / impressions
        : 0;
  return { impressions, clicks, ctr, frequency, reach };
}
