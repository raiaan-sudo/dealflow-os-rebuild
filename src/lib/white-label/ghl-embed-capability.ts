import { normalizePartnerDomainHost } from "./verified-partner-domain";

export const GHL_EMBED_CAPABILITY_COOKIE = "df_ghl_embed_capability";
export const GHL_EMBED_SESSION_COOKIE = "df_ghl_embed_session";
export const GHL_EMBED_BOOTSTRAP_PATH = "/crm/embed";
export const GHL_EMBED_LEGACY_BOOTSTRAP_PATH = "/ghl/embed";

const CAPABILITY_VERSION = 1;
const AUTH_HANDOFF_VERSION = 1;
const PREAUTH_TTL_SECONDS = 2 * 60;
const AUTHENTICATED_TTL_SECONDS = 5 * 60;
const AUTH_HANDOFF_TTL_SECONDS = 2 * 60;
const SESSION_MARKER_TTL_SECONDS = 12 * 60 * 60;
const OFFICIAL_HIGHLEVEL_PARENT_ORIGINS = Object.freeze([
  "https://app.gohighlevel.com",
  "https://app.leadconnectorhq.com",
]);

export type GhlEmbedCapability = {
  v: number;
  stage: "preauth" | "authenticated";
  partnerId: string | null;
  domain: string;
  organizationId: string;
  locationId: string;
  companyId: string;
  ghlUserId: string;
  ghlEmail: string;
  parentOrigin: string;
  dealflowUserId: string | null;
  jti: string;
  iat: number;
  exp: number;
};

export type GhlEmbedSessionMarker = {
  v: number;
  domain: string;
  partnerId: string | null;
  parentOrigin: string;
  dealflowUserId: string | null;
  iat: number;
  exp: number;
};

export type GhlEmbedAuthHandoff = {
  v: number;
  receiptId: string;
  payloadDigest: string;
  partnerId: string | null;
  domain: string;
  organizationId: string;
  locationId: string;
  companyId: string;
  ghlUserId: string;
  dealflowUserId: string;
  parentOrigin: string;
  iat: number;
  exp: number;
};

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isProviderId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{3,160}$/.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 320 &&
    value === value.trim().toLowerCase() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeExactHttpsOrigin(value: unknown) {
  if (typeof value !== "string" || value.length > 512) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function getGhlAppSharedSecret() {
  const value = process.env.GHL_APP_SHARED_SECRET?.trim() ?? "";
  const unsafePattern = /placeholder|change[-_ ]?me|replace[-_ ]?with|example|test[-_ ]?secret/i;
  return (
    new TextEncoder().encode(value).byteLength >= 32 &&
    new Set(value).size >= 10 &&
    !unsafePattern.test(value)
  ) ? value : null;
}

export function isGhlEmbedCapabilityEnabled() {
  return isGhlEmbedBootstrapEnabled() && Boolean(getGhlAppSharedSecret());
}

export function isGhlEmbedBootstrapEnabled() {
  return process.env.GHL_IFRAME_EMBED_ENABLED === "true";
}

function configuredPartnerParentOrigins(partnerHost: string) {
  const normalizedHost = normalizePartnerDomainHost(partnerHost);
  const raw = process.env.GHL_IFRAME_PARTNER_PARENT_ORIGINS_JSON?.trim();
  if (!normalizedHost || !raw || raw.length > 16_384) return [];

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const configured = parsed[normalizedHost];
    const values = Array.isArray(configured) ? configured : [configured];
    return values
      .map(normalizeExactHttpsOrigin)
      .filter((origin): origin is string => Boolean(origin))
      .filter((origin) => !OFFICIAL_HIGHLEVEL_PARENT_ORIGINS.includes(origin));
  } catch {
    return [];
  }
}

export function getAllowedGhlParentOrigins(partnerHost: string) {
  // The bootstrap must be frameable before it can receive and verify GHL's
  // signed user context. Capability/session issuance still requires the
  // independent app shared secret and therefore remains fail-closed.
  if (!isGhlEmbedBootstrapEnabled()) return [];
  const official = process.env.GHL_IFRAME_ALLOW_SHARED_HIGHLEVEL_ORIGINS === "true"
    ? OFFICIAL_HIGHLEVEL_PARENT_ORIGINS
    : [];
  return Array.from(new Set([
    ...official,
    ...configuredPartnerParentOrigins(partnerHost),
  ]));
}

export function resolveAllowedGhlParentOrigin(input: {
  candidate: unknown;
  partnerHost: string;
}) {
  const candidate = normalizeExactHttpsOrigin(input.candidate);
  return candidate && getAllowedGhlParentOrigins(input.partnerHost).includes(candidate)
    ? candidate
    : null;
}

function encodeBase64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getHmacKey(secret: string, usage: KeyUsage[]) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

function capabilitySigningInput(encodedPayload: string) {
  return new TextEncoder().encode(`dealflow-ghl-embed-capability-v1.${encodedPayload}`);
}

function sessionMarkerSigningInput(encodedPayload: string) {
  return new TextEncoder().encode(`dealflow-ghl-embed-session-v1.${encodedPayload}`);
}

function authHandoffSigningInput(encodedPayload: string) {
  return new TextEncoder().encode(`dealflow-ghl-embed-auth-handoff-v1.${encodedPayload}`);
}

export async function createGhlEmbedSignedContextDigest(encryptedData: string) {
  const secret = getGhlAppSharedSecret();
  if (!secret || encryptedData.length < 24 || encryptedData.length > 32_768) return null;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getHmacKey(secret, ["sign"]),
    new TextEncoder().encode(`dealflow-ghl-signed-context-v1.${encryptedData}`),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createGhlEmbedAuthHandoff(
  input: Omit<GhlEmbedAuthHandoff, "v" | "iat" | "exp">,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const secret = getGhlAppSharedSecret();
  const domain = normalizePartnerDomainHost(input.domain);
  const parentOrigin = domain
    ? resolveAllowedGhlParentOrigin({ candidate: input.parentOrigin, partnerHost: domain })
    : null;
  if (
    !secret ||
    !domain ||
    !parentOrigin ||
    !isUuid(input.receiptId) ||
    !isSha256(input.payloadDigest) ||
    !isNullableUuid(input.partnerId) ||
    !isUuid(input.organizationId) ||
    !isProviderId(input.locationId) ||
    !isProviderId(input.companyId) ||
    !isProviderId(input.ghlUserId) ||
    !isUuid(input.dealflowUserId)
  ) {
    return null;
  }
  const payload: GhlEmbedAuthHandoff = {
    ...input,
    v: AUTH_HANDOFF_VERSION,
    domain,
    parentOrigin,
    iat: nowSeconds,
    exp: nowSeconds + AUTH_HANDOFF_TTL_SECONDS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getHmacKey(secret, ["sign"]),
    authHandoffSigningInput(encodedPayload),
  );
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyGhlEmbedAuthHandoff(
  token: string | null | undefined,
  options: { expectedHost: string; nowSeconds?: number },
): Promise<GhlEmbedAuthHandoff | null> {
  const secret = getGhlAppSharedSecret();
  const [encodedPayload, encodedSignature, extra] = token?.split(".") ?? [];
  if (!secret || !encodedPayload || !encodedSignature || extra || token!.length > 8_192) return null;
  try {
    const signatureBytes = decodeBase64Url(encodedSignature);
    const payloadBytes = decodeBase64Url(encodedPayload);
    if (
      encodeBase64Url(signatureBytes) !== encodedSignature ||
      encodeBase64Url(payloadBytes) !== encodedPayload ||
      !await crypto.subtle.verify(
        "HMAC",
        await getHmacKey(secret, ["verify"]),
        signatureBytes,
        authHandoffSigningInput(encodedPayload),
      )
    ) {
      return null;
    }
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as GhlEmbedAuthHandoff;
    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
    const expectedHost = normalizePartnerDomainHost(options.expectedHost);
    if (
      payload.v !== AUTH_HANDOFF_VERSION ||
      !isUuid(payload.receiptId) ||
      !isSha256(payload.payloadDigest) ||
      !isNullableUuid(payload.partnerId) ||
      !isUuid(payload.organizationId) ||
      !isProviderId(payload.locationId) ||
      !isProviderId(payload.companyId) ||
      !isProviderId(payload.ghlUserId) ||
      !isUuid(payload.dealflowUserId) ||
      !Number.isSafeInteger(payload.iat) ||
      !Number.isSafeInteger(payload.exp) ||
      payload.iat > nowSeconds + 30 ||
      payload.exp <= nowSeconds ||
      payload.exp - payload.iat !== AUTH_HANDOFF_TTL_SECONDS ||
      !expectedHost ||
      normalizePartnerDomainHost(payload.domain) !== expectedHost ||
      !resolveAllowedGhlParentOrigin({
        candidate: payload.parentOrigin,
        partnerHost: expectedHost,
      })
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function createGhlEmbedCapability(
  input: Omit<GhlEmbedCapability, "v" | "jti" | "iat" | "exp">,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const secret = getGhlAppSharedSecret();
  const domain = normalizePartnerDomainHost(input.domain);
  const parentOrigin = domain
    ? resolveAllowedGhlParentOrigin({ candidate: input.parentOrigin, partnerHost: domain })
    : null;
  if (!secret || !domain || !parentOrigin) return null;

  const ttl = input.stage === "authenticated"
    ? AUTHENTICATED_TTL_SECONDS
    : PREAUTH_TTL_SECONDS;
  const payload: GhlEmbedCapability = {
    ...input,
    domain,
    ghlEmail: input.ghlEmail.trim().toLowerCase(),
    parentOrigin,
    v: CAPABILITY_VERSION,
    jti: crypto.randomUUID(),
    iat: nowSeconds,
    exp: nowSeconds + ttl,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getHmacKey(secret, ["sign"]),
    capabilitySigningInput(encodedPayload),
  );
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyGhlEmbedCapability(
  token: string | null | undefined,
  options: {
    expectedHost: string;
    expectedDealflowUserId?: string | null;
    requiredStage?: "preauth" | "authenticated";
    nowSeconds?: number;
  },
): Promise<GhlEmbedCapability | null> {
  const secret = getGhlAppSharedSecret();
  const [encodedPayload, encodedSignature, extra] = token?.split(".") ?? [];
  if (!secret || !encodedPayload || !encodedSignature || extra || token!.length > 8_192) return null;

  try {
    const signatureBytes = decodeBase64Url(encodedSignature);
    const payloadBytes = decodeBase64Url(encodedPayload);
    if (
      encodeBase64Url(signatureBytes) !== encodedSignature ||
      encodeBase64Url(payloadBytes) !== encodedPayload
    ) return null;
    const verified = await crypto.subtle.verify(
      "HMAC",
      await getHmacKey(secret, ["verify"]),
      signatureBytes,
      capabilitySigningInput(encodedPayload),
    );
    if (!verified) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(payloadBytes),
    ) as GhlEmbedCapability;
    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
    const expectedHost = normalizePartnerDomainHost(options.expectedHost);
    const ttl = payload.stage === "authenticated"
      ? AUTHENTICATED_TTL_SECONDS
      : PREAUTH_TTL_SECONDS;
    if (
      payload.v !== CAPABILITY_VERSION ||
      !["preauth", "authenticated"].includes(payload.stage) ||
      !isNullableUuid(payload.partnerId) ||
      !isUuid(payload.organizationId) ||
      !isProviderId(payload.locationId) ||
      !isProviderId(payload.companyId) ||
      !isProviderId(payload.ghlUserId) ||
      !isEmail(payload.ghlEmail) ||
      !isUuid(payload.jti) ||
      !Number.isSafeInteger(payload.iat) ||
      !Number.isSafeInteger(payload.exp) ||
      payload.iat > nowSeconds + 30 ||
      payload.exp <= nowSeconds ||
      payload.exp - payload.iat !== ttl ||
      !expectedHost ||
      normalizePartnerDomainHost(payload.domain) !== expectedHost ||
      !resolveAllowedGhlParentOrigin({
        candidate: payload.parentOrigin,
        partnerHost: expectedHost,
      }) ||
      (payload.stage === "authenticated" && !isUuid(payload.dealflowUserId)) ||
      (payload.stage === "preauth" && payload.dealflowUserId !== null) ||
      (options.requiredStage && payload.stage !== options.requiredStage) ||
      (options.expectedDealflowUserId !== undefined &&
        payload.dealflowUserId !== options.expectedDealflowUserId)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function createGhlEmbedSessionMarker(
  input: Omit<GhlEmbedSessionMarker, "v" | "iat" | "exp">,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const secret = getGhlAppSharedSecret();
  const domain = normalizePartnerDomainHost(input.domain);
  const parentOrigin = domain
    ? resolveAllowedGhlParentOrigin({ candidate: input.parentOrigin, partnerHost: domain })
    : null;
  if (!secret || !domain || !parentOrigin || !isNullableUuid(input.partnerId)) return null;
  if (input.dealflowUserId !== null && !isUuid(input.dealflowUserId)) return null;
  const payload: GhlEmbedSessionMarker = {
    ...input,
    v: CAPABILITY_VERSION,
    domain,
    parentOrigin,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_MARKER_TTL_SECONDS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getHmacKey(secret, ["sign"]),
    sessionMarkerSigningInput(encodedPayload),
  );
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyGhlEmbedSessionMarker(
  token: string | null | undefined,
  options: { expectedHost: string; nowSeconds?: number },
): Promise<GhlEmbedSessionMarker | null> {
  const secret = getGhlAppSharedSecret();
  const [encodedPayload, encodedSignature, extra] = token?.split(".") ?? [];
  if (!secret || !encodedPayload || !encodedSignature || extra || token!.length > 4_096) return null;
  try {
    const signatureBytes = decodeBase64Url(encodedSignature);
    const payloadBytes = decodeBase64Url(encodedPayload);
    if (
      encodeBase64Url(signatureBytes) !== encodedSignature ||
      encodeBase64Url(payloadBytes) !== encodedPayload
    ) return null;
    const verified = await crypto.subtle.verify(
      "HMAC",
      await getHmacKey(secret, ["verify"]),
      signatureBytes,
      sessionMarkerSigningInput(encodedPayload),
    );
    if (!verified) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(payloadBytes),
    ) as GhlEmbedSessionMarker;
    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
    const expectedHost = normalizePartnerDomainHost(options.expectedHost);
    if (
      payload.v !== CAPABILITY_VERSION ||
      !expectedHost ||
      normalizePartnerDomainHost(payload.domain) !== expectedHost ||
      !isNullableUuid(payload.partnerId) ||
      (payload.dealflowUserId !== null && !isUuid(payload.dealflowUserId)) ||
      !Number.isSafeInteger(payload.iat) ||
      !Number.isSafeInteger(payload.exp) ||
      payload.iat > nowSeconds + 30 ||
      payload.exp <= nowSeconds ||
      payload.exp - payload.iat !== SESSION_MARKER_TTL_SECONDS ||
      !resolveAllowedGhlParentOrigin({
        candidate: payload.parentOrigin,
        partnerHost: expectedHost,
      })
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function getGhlEmbedCapabilityCookieOptions(isSecure: boolean, stage: "preauth" | "authenticated") {
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? "none" as const : "lax" as const,
    partitioned: isSecure,
    path: "/",
    maxAge: stage === "authenticated" ? AUTHENTICATED_TTL_SECONDS : PREAUTH_TTL_SECONDS,
  };
}

export function getGhlEmbedSessionCookieOptions(isSecure: boolean) {
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? "none" as const : "lax" as const,
    partitioned: isSecure,
    path: "/",
    maxAge: SESSION_MARKER_TTL_SECONDS,
  };
}
