type RetryErrorShape = {
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
  name?: unknown;
  message?: unknown;
  cause?: unknown;
};

const TRANSIENT_RUNTIME_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "EAI_AGAIN",
  "ENETDOWN",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const TRANSIENT_POSTGREST_CODES = new Set([
  "PGRST000",
  "PGRST001",
  "PGRST002",
  "PGRST003",
]);

function asErrorShape(error: unknown): RetryErrorShape | null {
  return error && typeof error === "object" ? (error as RetryErrorShape) : null;
}

function readStatus(error: RetryErrorShape) {
  const rawStatus = error.status ?? error.statusCode;
  const status = typeof rawStatus === "number" ? rawStatus : Number(rawStatus);
  return Number.isFinite(status) ? status : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isTransientLeadCaptureRetryError(error: unknown): boolean {
  const shaped = asErrorShape(error);

  if (!shaped) {
    return false;
  }

  const status = readStatus(shaped);
  if (status !== null) {
    // A known HTTP status is authoritative. Validation, authentication, and
    // tenant/scope failures stay terminal even if their text sounds temporary.
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  const code = readString(shaped.code).toUpperCase();
  if (
    TRANSIENT_RUNTIME_CODES.has(code) ||
    TRANSIENT_POSTGREST_CODES.has(code) ||
    /^08[A-Z0-9]{3}$/.test(code) ||
    /^53[A-Z0-9]{3}$/.test(code) ||
    ["40001", "40P01", "55P03", "57P01", "57P02", "57P03"].includes(code)
  ) {
    return true;
  }

  const name = readString(shaped.name);
  if (name === "AbortError" || name === "TimeoutError") {
    return true;
  }

  const message = readString(shaped.message);
  if (
    /\b(fetch failed|network error|socket hang up|connection (?:closed|refused|reset)|timed? ?out|timeout|temporarily unavailable|service unavailable|bad gateway|gateway timeout)\b/i.test(
      message,
    )
  ) {
    return true;
  }

  return shaped.cause ? isTransientLeadCaptureRetryError(shaped.cause) : false;
}

export function shouldRetryLeadCaptureJob(params: {
  error: unknown;
  currentAttempt: number;
  maxAttempts: number;
}) {
  const currentAttempt = Math.max(1, Math.trunc(params.currentAttempt));
  const maxAttempts = Math.max(1, Math.trunc(params.maxAttempts));

  return (
    currentAttempt < maxAttempts &&
    isTransientLeadCaptureRetryError(params.error)
  );
}
