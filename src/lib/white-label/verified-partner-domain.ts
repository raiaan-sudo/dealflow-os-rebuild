type JsonRecord = Record<string, unknown>;

export const PARTNER_ATTRIBUTION_COOKIE = "df_partner_attribution";
const PARTNER_ATTRIBUTION_VERSION = 1;
const PARTNER_ATTRIBUTION_TTL_SECONDS = 24 * 60 * 60;
const PARTNER_LOOKUP_TIMEOUT_MS = 2_000;

export type VerifiedPartnerDomainContext = {
  partnerId: string;
  partnerSlug: string;
  domain: string;
  branding: {
    appName: string;
    logoUrl: string | null;
    loginEyebrow: string | null;
    loginHeadline: string | null;
    loginSubheadline: string | null;
    supportEmail: string | null;
    poweredByDealFlow: boolean;
  };
};

type PartnerAttributionPayload = {
  v: number;
  partnerId: string;
  partnerSlug: string;
  domain: string;
  iat: number;
  exp: number;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function optionalText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function safeLogoUrl(value: unknown) {
  const candidate = optionalText(value, 2_000);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function safeEmail(value: unknown) {
  const candidate = optionalText(value, 320)?.toLowerCase() ?? null;
  return candidate && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)
    ? candidate
    : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isPartnerSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(value);
}

export function normalizePartnerDomainHost(value: string | null | undefined) {
  const candidate = value?.trim().toLowerCase().replace(/\.$/, "") ?? "";
  if (!candidate || candidate.length > 253 || candidate.includes(":") || candidate.includes("/")) {
    return null;
  }

  const labels = candidate.split(".");
  if (
    labels.length < 2 ||
    labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  ) {
    return null;
  }

  return candidate;
}

function getLookupEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey || typeof window !== "undefined") return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
      return null;
    }
    return { baseUrl: parsed.origin, serviceRoleKey };
  } catch {
    return null;
  }
}

function getSigningSecret() {
  const value = process.env.PARTNER_ATTRIBUTION_SIGNING_SECRET?.trim() ?? "";
  const unsafePattern = /placeholder|change[-_ ]?me|replace[-_ ]?with|example|test[-_ ]?secret/i;
  return (
    new TextEncoder().encode(value).byteLength >= 32 &&
    new Set(value).size >= 10 &&
    !unsafePattern.test(value)
  ) ? value : null;
}

async function readRows(path: string, params: URLSearchParams) {
  const env = getLookupEnvironment();
  if (!env) return null;

  const url = new URL(`/rest/v1/${path}`, env.baseUrl);
  url.search = params.toString();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: env.serviceRoleKey,
        authorization: `Bearer ${env.serviceRoleKey}`,
        accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(PARTNER_LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    return Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export function sanitizeVerifiedPartnerContext(input: {
  domain: unknown;
  domainPartnerId: unknown;
  partner: unknown;
  branding?: unknown;
}): VerifiedPartnerDomainContext | null {
  const domain = normalizePartnerDomainHost(optionalText(input.domain, 253));
  const partner = asRecord(input.partner);
  const branding = asRecord(input.branding);
  const theme = asRecord(branding.theme_json);
  const copy = asRecord(branding.copy_json);
  const partnerId = input.domainPartnerId;
  const partnerSlug = partner.slug;

  if (
    !domain ||
    !isUuid(partnerId) ||
    !isUuid(partner.id) ||
    partner.id !== partnerId ||
    !isPartnerSlug(partnerSlug) ||
    partner.status !== "active" ||
    partner.deleted_at != null
  ) {
    return null;
  }

  const brandName =
    optionalText(copy.brandName, 120) ??
    optionalText(partner.brand_name, 120) ??
    "DealFlow";
  const appName = optionalText(copy.productName, 120) ?? brandName;
  return {
    partnerId,
    partnerSlug,
    domain,
    branding: {
      appName,
      logoUrl: safeLogoUrl(theme.logoUrl ?? partner.logo_url),
      loginEyebrow: optionalText(copy.loginEyebrow, 120),
      loginHeadline: optionalText(copy.loginHeadline, 180),
      loginSubheadline: optionalText(copy.loginSubheadline, 320),
      supportEmail: safeEmail(copy.supportEmail ?? partner.support_email),
      poweredByDealFlow: partner.powered_by_dealflow !== false,
    },
  };
}

/**
 * Resolves only a unique, non-deleted, SSL-active and verified domain whose
 * partner is still active. Every decision comes from server-side records;
 * caller-provided slugs or attribution headers are never trusted.
 */
export async function loadVerifiedPartnerDomainContext(
  rawHost: string | null | undefined,
): Promise<VerifiedPartnerDomainContext | null> {
  const domain = normalizePartnerDomainHost(rawHost);
  if (!domain) return null;

  const domainRows = await readRows("partner_domains", new URLSearchParams({
    select: "partner_id,domain,verification_status,ssl_status,deleted_at",
    domain: `eq.${domain}`,
    verification_status: "eq.verified",
    ssl_status: "eq.active",
    deleted_at: "is.null",
    limit: "2",
  }));
  if (!domainRows || domainRows.length !== 1) return null;

  const domainRow = asRecord(domainRows[0]);
  if (normalizePartnerDomainHost(optionalText(domainRow.domain, 253)) !== domain) return null;
  const partnerId = optionalText(domainRow.partner_id, 64);
  if (!isUuid(partnerId)) return null;

  const partnerRows = await readRows("partners", new URLSearchParams({
    select: "id,slug,brand_name,logo_url,primary_color,support_email,powered_by_dealflow,status,deleted_at",
    id: `eq.${partnerId}`,
    status: "eq.active",
    deleted_at: "is.null",
    limit: "2",
  }));
  if (!partnerRows || partnerRows.length !== 1) return null;

  const brandingRows = await readRows("partner_branding", new URLSearchParams({
    select: "theme_json,copy_json",
    partner_id: `eq.${partnerId}`,
    limit: "2",
  }));
  if (brandingRows && brandingRows.length > 1) return null;

  return sanitizeVerifiedPartnerContext({
    domain,
    domainPartnerId: partnerId,
    partner: partnerRows[0],
    branding: brandingRows?.[0] ?? null,
  });
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

export async function createPartnerAttributionToken(
  context: Pick<VerifiedPartnerDomainContext, "partnerId" | "partnerSlug" | "domain">,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const secret = getSigningSecret();
  if (!secret) return null;
  const payload: PartnerAttributionPayload = {
    v: PARTNER_ATTRIBUTION_VERSION,
    partnerId: context.partnerId,
    partnerSlug: context.partnerSlug,
    domain: context.domain,
    iat: nowSeconds,
    exp: nowSeconds + PARTNER_ATTRIBUTION_TTL_SECONDS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getHmacKey(secret, ["sign"]),
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyPartnerAttributionToken(
  token: string | null | undefined,
  options: { expectedDomain?: string | null; nowSeconds?: number } = {},
): Promise<PartnerAttributionPayload | null> {
  const secret = getSigningSecret();
  const [encodedPayload, encodedSignature, extra] = token?.split(".") ?? [];
  if (!secret || !encodedPayload || !encodedSignature || extra) return null;

  try {
    const verified = await crypto.subtle.verify(
      "HMAC",
      await getHmacKey(secret, ["verify"]),
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );
    if (!verified) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as PartnerAttributionPayload;
    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
    const expectedDomain = options.expectedDomain
      ? normalizePartnerDomainHost(options.expectedDomain)
      : null;
    if (
      payload.v !== PARTNER_ATTRIBUTION_VERSION ||
      !isUuid(payload.partnerId) ||
      !isPartnerSlug(payload.partnerSlug) ||
      normalizePartnerDomainHost(payload.domain) !== payload.domain ||
      !Number.isSafeInteger(payload.iat) ||
      !Number.isSafeInteger(payload.exp) ||
      payload.iat > nowSeconds + 60 ||
      payload.exp <= nowSeconds ||
      payload.exp - payload.iat !== PARTNER_ATTRIBUTION_TTL_SECONDS ||
      (expectedDomain && payload.domain !== expectedDomain)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function resolveVerifiedPartnerAttribution(
  token: string | null | undefined,
) {
  const payload = await verifyPartnerAttributionToken(token);
  if (!payload) return null;
  const context = await loadVerifiedPartnerDomainContext(payload.domain);
  if (
    !context ||
    context.partnerId !== payload.partnerId ||
    context.partnerSlug !== payload.partnerSlug ||
    context.domain !== payload.domain
  ) {
    return null;
  }
  return context;
}

export function getPartnerAttributionCookieOptions(isSecure: boolean) {
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? "none" as const : "lax" as const,
    partitioned: isSecure,
    path: "/",
    maxAge: PARTNER_ATTRIBUTION_TTL_SECONDS,
  };
}
