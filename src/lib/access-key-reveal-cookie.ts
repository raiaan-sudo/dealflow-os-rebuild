import { createHash } from "node:crypto";

export const ACCESS_KEY_REVEAL_COOKIE_PREFIX = "df_access_key_reveal_";
export const ACCESS_KEY_REVEAL_INDEX_COOKIE_NAME = "df_access_key_reveal_index";
export const ACCESS_KEY_REVEAL_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;
export const ACCESS_KEY_REVEAL_MAX_IN_FLIGHT = 4;

export type AccessKeyRevealCookieIndexEntry = {
  sessionKey: string;
  createdAtSeconds: number;
};

function getSessionKey(sessionId: string) {
  return createHash("sha256").update(sessionId.trim(), "utf8").digest("hex").slice(0, 24);
}

export function getAccessKeyRevealCookieName(sessionId: string) {
  return `${ACCESS_KEY_REVEAL_COOKIE_PREFIX}${getSessionKey(sessionId)}`;
}

export function readRequestCookie(cookieHeader: string | null | undefined, name: string) {
  for (const part of (cookieHeader ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1 || part.slice(0, separator).trim() !== name) {
      continue;
    }

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

export function parseAccessKeyRevealCookieIndex(
  value: string | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const minimumCreatedAt = nowSeconds - ACCESS_KEY_REVEAL_COOKIE_MAX_AGE_SECONDS;
  const maximumCreatedAt = nowSeconds + 5 * 60;
  const entries = new Map<string, AccessKeyRevealCookieIndexEntry>();

  for (const candidate of (value ?? "").split(",")) {
    const [sessionKey, timestamp] = candidate.split(":");
    const createdAtSeconds = Number(timestamp);
    if (
      !sessionKey ||
      !/^[0-9a-f]{24}$/.test(sessionKey) ||
      !Number.isSafeInteger(createdAtSeconds) ||
      createdAtSeconds < minimumCreatedAt ||
      createdAtSeconds > maximumCreatedAt
    ) {
      continue;
    }
    entries.set(sessionKey, { sessionKey, createdAtSeconds });
  }

  return Array.from(entries.values()).sort(
    (left, right) => left.createdAtSeconds - right.createdAtSeconds,
  );
}

export function appendAccessKeyRevealCookieIndex(
  entries: AccessKeyRevealCookieIndexEntry[],
  sessionId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const sessionKey = getSessionKey(sessionId);
  const withoutCurrent = entries.filter((entry) => entry.sessionKey !== sessionKey);
  if (withoutCurrent.length >= ACCESS_KEY_REVEAL_MAX_IN_FLIGHT) {
    return null;
  }

  return [...withoutCurrent, { sessionKey, createdAtSeconds: nowSeconds }];
}

export function removeAccessKeyRevealCookieIndex(
  entries: AccessKeyRevealCookieIndexEntry[],
  sessionId: string,
) {
  const sessionKey = getSessionKey(sessionId);
  return entries.filter((entry) => entry.sessionKey !== sessionKey);
}

export function serializeAccessKeyRevealCookieIndex(
  entries: AccessKeyRevealCookieIndexEntry[],
) {
  return entries
    .slice(-ACCESS_KEY_REVEAL_MAX_IN_FLIGHT)
    .map((entry) => `${entry.sessionKey}:${entry.createdAtSeconds}`)
    .join(",");
}

export function serializeAccessKeyRevealCookie(params: {
  name: string;
  value: string;
  path: string;
  maxAgeSeconds: number;
  secure: boolean;
}) {
  return [
    `${params.name}=${encodeURIComponent(params.value)}`,
    `Path=${params.path}`,
    `Max-Age=${params.maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Lax",
    params.secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}
