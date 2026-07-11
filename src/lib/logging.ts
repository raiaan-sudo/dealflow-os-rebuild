type LogLevel = "info" | "warn" | "error";

type LogPayload = Record<string, unknown>;

const REDACTED = "[REDACTED]";
const CIRCULAR = "[CIRCULAR]";
const UNREADABLE = "[UNREADABLE]";
const MAX_LOG_DEPTH = 8;
const MAX_LOG_COLLECTION_ITEMS = 100;
const MAX_LOG_STRING_LENGTH = 4_096;
const SENSITIVE_EXACT_KEYS = new Set([
  "body",
  "content",
  "from",
  "ip",
  "key",
  "name",
  "notes",
  "rawbody",
  "to",
]);

const SENSITIVE_KEY_PARTS = [
  "authorization",
  "cookie",
  "credential",
  "password",
  "passwd",
  "privatekey",
  "secret",
  "session",
  "token",
  "apikey",
  "email",
  "phone",
  "address",
  "firstname",
  "lastname",
  "fullname",
  "birthdate",
  "dateofbirth",
  "useragent",
  "ipaddress",
] as const;

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string) {
  const normalized = normalizeKey(key);
  return SENSITIVE_EXACT_KEYS.has(normalized) || SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function sanitizeString(value: string) {
  const sanitized = value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/\bsk-proj-[A-Za-z0-9_-]{12,}\b/g, REDACTED)
    .replace(/\bsb_secret_[A-Za-z0-9_-]{12,}\b/g, REDACTED)
    .replace(/\bwhsec_[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/\b(?:ghp|github_pat|xox[aboprs])_[A-Za-z0-9_-]+\b/gi, REDACTED)
    .replace(/\bAIza[0-9A-Za-z_-]{30,}\b/g, REDACTED)
    .replace(/\bEAA[A-Za-z0-9]{20,}\b/g, REDACTED)
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?\b/g, REDACTED)
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTED)
    .replace(
      /\b(authorization|password|passwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token)=([^\s&]+)/gi,
      "$1=[REDACTED]",
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\+[1-9][\d().\s-]{6,}\d/g, "[REDACTED_PHONE]")
    .replace(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, "[REDACTED_PHONE]");

  if (sanitized.length <= MAX_LOG_STRING_LENGTH) {
    return sanitized;
  }

  return `${sanitized.slice(0, MAX_LOG_STRING_LENGTH)}...[TRUNCATED]`;
}

function sanitizeValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
  key?: string,
): unknown {
  if (key && isSensitiveKey(key)) {
    return typeof value === "boolean" ? value : REDACTED;
  }

  if (value === null || typeof value === "undefined") {
    return value ?? null;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return typeof value === "boolean" || Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "symbol" || typeof value === "function") {
    return `[${typeof value}]`;
  }

  if (depth >= MAX_LOG_DEPTH) {
    return "[MAX_DEPTH]";
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  }

  if (seen.has(value)) {
    return CIRCULAR;
  }
  seen.add(value);

  if (value instanceof Error) {
    const errorRecord = value as Error & { code?: unknown; cause?: unknown };
    const sanitizedError: Record<string, unknown> = {
      name: sanitizeString(errorRecord.name),
      message: sanitizeString(errorRecord.message),
    };
    if (typeof errorRecord.code !== "undefined") {
      sanitizedError.code = sanitizeValue(errorRecord.code, seen, depth + 1, "code");
    }
    if (typeof errorRecord.cause !== "undefined") {
      sanitizedError.cause = sanitizeValue(errorRecord.cause, seen, depth + 1, "cause");
    }
    return sanitizedError;
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_LOG_COLLECTION_ITEMS)
      .map((item) => sanitizeValue(item, seen, depth + 1));
    if (value.length > MAX_LOG_COLLECTION_ITEMS) {
      items.push(`[${value.length - MAX_LOG_COLLECTION_ITEMS} ITEMS TRUNCATED]`);
    }
    return items;
  }

  const sanitizedObject: Record<string, unknown> = {};
  let keys: string[];
  try {
    keys = Object.keys(value).slice(0, MAX_LOG_COLLECTION_ITEMS);
  } catch {
    return UNREADABLE;
  }

  for (const objectKey of keys) {
    try {
      sanitizedObject[objectKey] = sanitizeValue(
        (value as Record<string, unknown>)[objectKey],
        seen,
        depth + 1,
        objectKey,
      );
    } catch {
      sanitizedObject[objectKey] = UNREADABLE;
    }
  }

  const totalKeys = (() => {
    try {
      return Object.keys(value).length;
    } catch {
      return keys.length;
    }
  })();
  if (totalKeys > MAX_LOG_COLLECTION_ITEMS) {
    sanitizedObject.__truncatedKeys = totalKeys - MAX_LOG_COLLECTION_ITEMS;
  }

  return sanitizedObject;
}

export function sanitizeLogValue(value: unknown) {
  return sanitizeValue(value, new WeakSet<object>(), 0);
}

function serializeEntry(level: LogLevel, message: string, payload?: LogPayload) {
  const entry = {
    level,
    message: sanitizeString(message),
    timestamp: new Date().toISOString(),
    ...(payload ? { payload: sanitizeLogValue(payload) } : {}),
  };

  try {
    return JSON.stringify(entry);
  } catch {
    return JSON.stringify({
      level,
      message: "Log entry serialization failed.",
      timestamp: entry.timestamp,
    });
  }
}

function write(level: LogLevel, message: string, payload?: LogPayload) {
  const shouldWriteInfo =
    process.env.NODE_ENV === "development" ||
    process.env.ENABLE_STRUCTURED_INFO_LOGS === "true";
  const shouldWriteWarning = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "production";
  const shouldWriteError = true;

  if (level === "info" && !shouldWriteInfo) {
    return;
  }

  if (level === "warn" && !shouldWriteWarning) {
    return;
  }

  if (level === "error" && !shouldWriteError) {
    return;
  }

  const serialized = serializeEntry(level, message, payload);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}

export function logInfo(message: string, payload?: LogPayload) {
  write("info", message, payload);
}

export function logWarn(message: string, payload?: LogPayload) {
  write("warn", message, payload);
}

export function logError(message: string, payload?: LogPayload) {
  write("error", message, payload);
}

export function logOperationalEvent(message: string, payload?: LogPayload) {
  console.info(serializeEntry("info", message, payload));
}
