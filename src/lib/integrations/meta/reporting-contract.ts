export const META_REPORTING_ATTRIBUTION_WINDOW_DAYS = 7 as const;

export type MetaReportingWindow = {
  since: string;
  until: string;
  days: typeof META_REPORTING_ATTRIBUTION_WINDOW_DAYS;
};

export type MetaReportingCompletenessState =
  | "complete"
  | "partial"
  | "missing"
  | "failed";

export type MetaReportingTruth = {
  schemaVersion: 1;
  completeness: MetaReportingCompletenessState;
  missingFields: string[];
  providerSourceStartedAt: string | null;
  providerSourceEndedAt: string | null;
  providerSourceGranularity: "date";
  receivedAt: string;
  pageCount: number;
  rowCount: number;
};

export type ProviderDeliveryInsight = {
  spend?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  ctr?: string | number;
  frequency?: string | number;
  reach?: string | number;
  actions?: unknown[];
  date_start?: string;
  date_stop?: string;
};

function requireNonNegativeProviderNumber(value: unknown, field: string) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim().length === 0)
  ) {
    throw new RangeError(`Meta ${field} must be a finite non-negative number.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new RangeError(`Meta ${field} must be a finite non-negative number.`);
  }
  return parsed;
}

function readOptionalProviderNumber(value: unknown, field: string) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim().length === 0)
  ) {
    return null;
  }
  return requireNonNegativeProviderNumber(value, field);
}

function utcDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function hasProviderField(value: object, field: keyof ProviderDeliveryInsight) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function hasProviderNumber(
  value: ProviderDeliveryInsight,
  field: "spend" | "impressions" | "clicks" | "ctr" | "frequency" | "reach",
) {
  if (!hasProviderField(value, field)) return false;
  const candidate = value[field];
  return candidate !== null &&
    candidate !== undefined &&
    !(typeof candidate === "string" && candidate.trim().length === 0);
}

function reportingBoundary(date: string, boundary: "start" | "end") {
  const timestamp = Date.parse(
    `${date}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}Z`,
  );
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
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
  const impressions = readOptionalProviderNumber(insight?.impressions, "impressions") ?? 0;
  const clicks = readOptionalProviderNumber(insight?.clicks, "clicks") ?? 0;
  const reach = readOptionalProviderNumber(insight?.reach, "reach") ?? 0;
  const providerFrequency = readOptionalProviderNumber(insight?.frequency, "frequency");
  const frequency = providerFrequency ?? (reach > 0 ? impressions / reach : 0);
  const providerCtr = readOptionalProviderNumber(insight?.ctr, "ctr");
  const ctr = providerCtr !== null
    ? providerCtr / 100
    : impressions > 0
      ? clicks / impressions
      : 0;
  return { impressions, clicks, ctr, frequency, reach };
}

export function buildMetaReportingTruth(params: {
  insight: ProviderDeliveryInsight | null | undefined;
  reportingWindow: MetaReportingWindow;
  receivedAt?: string;
  pageCount: number;
  rowCount: number;
}): MetaReportingTruth {
  const receivedAt = params.receivedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(receivedAt))) {
    throw new RangeError("Meta reporting truth requires a valid receipt timestamp.");
  }
  if (!Number.isInteger(params.pageCount) || params.pageCount < 1) {
    throw new RangeError("Meta reporting truth requires a positive page count.");
  }
  if (!Number.isInteger(params.rowCount) || params.rowCount < 0) {
    throw new RangeError("Meta reporting truth requires a non-negative row count.");
  }

  const insight = params.insight;
  if (!insight) {
    return {
      schemaVersion: 1,
      completeness: "missing",
      missingFields: ["insight_row"],
      providerSourceStartedAt: null,
      providerSourceEndedAt: null,
      providerSourceGranularity: "date",
      receivedAt,
      pageCount: params.pageCount,
      rowCount: params.rowCount,
    };
  }

  const missingFields: string[] = [];
  for (const field of ["spend", "impressions", "clicks"] as const) {
    if (!hasProviderNumber(insight, field)) missingFields.push(field);
  }
  if (!Array.isArray(insight.actions)) missingFields.push("lead_actions");
  if (
    !hasProviderNumber(insight, "frequency") &&
    !hasProviderNumber(insight, "reach")
  ) {
    missingFields.push("frequency_or_reach");
  }
  if (insight.date_start !== params.reportingWindow.since) {
    missingFields.push("date_start");
  }
  if (insight.date_stop !== params.reportingWindow.until) {
    missingFields.push("date_stop");
  }

  // Validate every present provider number even when another field is absent.
  // A malformed value is a failed response, not partial evidence.
  for (const field of ["spend", "impressions", "clicks", "ctr", "frequency", "reach"] as const) {
    if (hasProviderNumber(insight, field)) {
      requireNonNegativeProviderNumber(insight[field], field);
    }
  }
  if (
    hasProviderField(insight, "actions") &&
    insight.actions !== null &&
    insight.actions !== undefined &&
    !Array.isArray(insight.actions)
  ) {
    throw new RangeError("Meta actions must be an array.");
  }

  return {
    schemaVersion: 1,
    completeness: missingFields.length === 0 ? "complete" : "partial",
    missingFields: [...new Set(missingFields)].sort(),
    providerSourceStartedAt:
      insight.date_start === params.reportingWindow.since
        ? reportingBoundary(insight.date_start, "start")
        : null,
    providerSourceEndedAt:
      insight.date_stop === params.reportingWindow.until
        ? reportingBoundary(insight.date_stop, "end")
        : null,
    providerSourceGranularity: "date",
    receivedAt,
    pageCount: params.pageCount,
    rowCount: params.rowCount,
  };
}

export function buildFailedMetaReportingTruth(params: {
  reportingWindow: MetaReportingWindow;
  receivedAt?: string;
}): MetaReportingTruth {
  const receivedAt = params.receivedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(receivedAt))) {
    throw new RangeError("Meta reporting truth requires a valid receipt timestamp.");
  }
  return {
    schemaVersion: 1,
    completeness: "failed",
    missingFields: ["provider_response"],
    providerSourceStartedAt: null,
    providerSourceEndedAt: null,
    providerSourceGranularity: "date",
    receivedAt,
    pageCount: 0,
    rowCount: 0,
  };
}

export function readMetaReportingTruth(value: unknown): MetaReportingTruth | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const completeness = row.completeness;
  const missingFields = row.missingFields;
  const receivedAt = row.receivedAt;
  const pageCount = Number(row.pageCount);
  const rowCount = Number(row.rowCount);
  if (
    row.schemaVersion !== 1 ||
    !["complete", "partial", "missing", "failed"].includes(String(completeness)) ||
    !Array.isArray(missingFields) ||
    !missingFields.every((field) => typeof field === "string" && field.length > 0) ||
    typeof receivedAt !== "string" ||
    !Number.isFinite(Date.parse(receivedAt)) ||
    !Number.isInteger(pageCount) ||
    pageCount < 0 ||
    !Number.isInteger(rowCount) ||
    rowCount < 0 ||
    row.providerSourceGranularity !== "date"
  ) {
    return null;
  }
  const providerSourceStartedAt =
    typeof row.providerSourceStartedAt === "string" &&
    Number.isFinite(Date.parse(row.providerSourceStartedAt))
      ? row.providerSourceStartedAt
      : null;
  const providerSourceEndedAt =
    typeof row.providerSourceEndedAt === "string" &&
    Number.isFinite(Date.parse(row.providerSourceEndedAt))
      ? row.providerSourceEndedAt
      : null;
  if (
    completeness === "complete" &&
    (missingFields.length > 0 || !providerSourceStartedAt || !providerSourceEndedAt)
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    completeness: completeness as MetaReportingCompletenessState,
    missingFields: missingFields.map(String),
    providerSourceStartedAt,
    providerSourceEndedAt,
    providerSourceGranularity: "date",
    receivedAt,
    pageCount,
    rowCount,
  };
}
