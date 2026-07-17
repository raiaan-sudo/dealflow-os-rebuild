import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  fingerprintGhlAuthorityValue,
  fingerprintGhlScopes,
  normalizeGhlScopes,
} from "./marketplace-oauth-contract";

export const GHL_MARKETPLACE_TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";
export const GHL_MARKETPLACE_LOCATION_TOKEN_URL = "https://services.leadconnectorhq.com/oauth/location-token";
export const GHL_MARKETPLACE_API_VERSION = "v3";
export const GHL_MARKETPLACE_WEBHOOK_TYPES = [
  "INSTALL",
  "UNINSTALL",
  "UPDATE",
  "UserCreate",
  "UserUpdate",
  "UserDelete",
  "LocationCreate",
  "LocationUpdate",
] as const;

export type GhlMarketplaceWebhookType = (typeof GHL_MARKETPLACE_WEBHOOK_TYPES)[number];
export type GhlMarketplaceUserType = "Company" | "Location";

const PROVIDER_ID = /^[A-Za-z0-9_-]{3,160}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INSTALL_HOST = /(?:^|\.)(?:gohighlevel\.com|leadconnectorhq\.com)$/i;
const TOKEN_MAX_BYTES = 32_768;
const RESPONSE_MAX_BYTES = 256 * 1024;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function providerId(value: unknown) {
  const candidate = text(value);
  return PROVIDER_ID.test(candidate) ? candidate : null;
}

function property(body: Record<string, unknown>, camel: string, snake: string) {
  return body[camel] ?? body[snake];
}

export function isGhlMarketplaceWebhookType(value: unknown): value is GhlMarketplaceWebhookType {
  return typeof value === "string" && (GHL_MARKETPLACE_WEBHOOK_TYPES as readonly string[]).includes(value);
}

export function normalizeGhlMarketplaceReturnPath(value: unknown) {
  const candidate = text(value) || "/settings";
  if (
    candidate.length > 512 ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) throw new Error("ghl_marketplace_return_path_invalid");
  const parsed = new URL(candidate, "https://dealflow.invalid");
  if (parsed.origin !== "https://dealflow.invalid") {
    throw new Error("ghl_marketplace_return_path_invalid");
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function assertGhlMarketplaceInstallUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    !INSTALL_HOST.test(url.hostname)
  ) throw new Error("ghl_marketplace_install_url_not_allowlisted");
  return url;
}

export type GhlMarketplaceLifecycleEvent = Readonly<{
  eventType: GhlMarketplaceWebhookType;
  eventFingerprint: string;
  payloadFingerprint: string;
  appFingerprint: string;
  companyFingerprint: string | null;
  locationFingerprint: string | null;
  accountFingerprint: string | null;
  userFingerprint: string | null;
  emailFingerprint: string | null;
  rawUserEmail: string | null;
  installScope: "company" | "location" | null;
  providerTimestamp: string | null;
  identifiersComplete: boolean;
}>;

export function parseGhlMarketplaceLifecycleEvent(
  rawBody: string,
  expectedAppId?: string | null,
): GhlMarketplaceLifecycleEvent {
  if (Buffer.byteLength(rawBody, "utf8") > 128 * 1024) {
    throw new Error("ghl_marketplace_webhook_body_too_large");
  }
  let body: Record<string, unknown>;
  try { body = record(JSON.parse(rawBody)); } catch { throw new Error("ghl_marketplace_webhook_json_invalid"); }
  const eventType = text(body.type);
  if (!isGhlMarketplaceWebhookType(eventType)) {
    throw new Error("ghl_marketplace_webhook_type_unsupported");
  }
  const configuredAppId = providerId(expectedAppId);
  const payloadAppId = providerId(body.appId);
  if (payloadAppId && configuredAppId && payloadAppId !== configuredAppId) {
    throw new Error("ghl_marketplace_webhook_app_mismatch");
  }
  const appId = payloadAppId ?? configuredAppId;
  if (!appId) throw new Error("ghl_marketplace_webhook_app_identity_missing");

  const companyId = providerId(body.companyId);
  const locationId = providerId(body.locationId);
  const userId = providerId(body.id) ?? providerId(body.userId);
  const accountId = locationId ?? companyId;
  const email = text(body.email).toLowerCase();
  const normalizedEmail = email && email.length <= 320 && EMAIL.test(email) ? email : null;
  const timestamp = text(body.timestamp);
  const parsedTimestamp = timestamp && Number.isFinite(Date.parse(timestamp))
    ? new Date(timestamp).toISOString()
    : null;
  const payloadFingerprint = fingerprintGhlAuthorityValue(rawBody);
  const webhookId = text(body.webhookId);
  const validWebhookId = /^[A-Za-z0-9:_-]{3,240}$/.test(webhookId) ? webhookId : null;
  const eventFingerprint = fingerprintGhlAuthorityValue(
    validWebhookId ? `${appId}:${validWebhookId}` : `${appId}:${payloadFingerprint}`,
  );
  const appEvent = eventType === "INSTALL" || eventType === "UNINSTALL" || eventType === "UPDATE";
  const userEvent = eventType.startsWith("User");
  const locationEvent = eventType.startsWith("Location");
  const identifiersComplete = appEvent
    ? Boolean(accountId)
    : userEvent
      ? Boolean(accountId && userId && (eventType === "UserDelete" || normalizedEmail))
      : locationEvent
        ? Boolean(locationId)
        : false;

  return Object.freeze({
    eventType,
    eventFingerprint,
    payloadFingerprint,
    appFingerprint: fingerprintGhlAuthorityValue(appId),
    companyFingerprint: companyId ? fingerprintGhlAuthorityValue(companyId) : null,
    locationFingerprint: locationId ? fingerprintGhlAuthorityValue(locationId) : null,
    accountFingerprint: accountId ? fingerprintGhlAuthorityValue(accountId) : null,
    userFingerprint: userId ? fingerprintGhlAuthorityValue(userId) : null,
    emailFingerprint: normalizedEmail ? fingerprintGhlAuthorityValue(normalizedEmail) : null,
    rawUserEmail: normalizedEmail,
    installScope: locationId ? "location" : companyId ? "company" : null,
    providerTimestamp: parsedTimestamp,
    identifiersComplete,
  });
}

export type GhlMarketplaceToken = Readonly<{
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  scopes: readonly string[];
  userType: GhlMarketplaceUserType;
  companyId: string;
  locationId: string | null;
  approvedLocations: readonly string[];
  userId: string;
}>;

export function parseGhlMarketplaceTokenResponse(value: unknown): GhlMarketplaceToken {
  const body = record(value);
  const accessToken = text(property(body, "accessToken", "access_token"));
  const refreshToken = text(property(body, "refreshToken", "refresh_token"));
  const tokenType = text(property(body, "tokenType", "token_type"));
  const expiresIn = Number(property(body, "expiresIn", "expires_in"));
  const userType = text(body.userType);
  const companyId = providerId(body.companyId);
  const locationId = providerId(body.locationId);
  const userId = providerId(body.userId);
  const scope = text(body.scope);
  const approvedLocations = Array.isArray(body.approvedLocations)
    ? [...new Set(body.approvedLocations.map(providerId).filter((item): item is string => Boolean(item)))].sort()
    : [];
  if (
    Buffer.byteLength(accessToken, "utf8") < 20 ||
    Buffer.byteLength(accessToken, "utf8") > TOKEN_MAX_BYTES ||
    Buffer.byteLength(refreshToken, "utf8") < 20 ||
    Buffer.byteLength(refreshToken, "utf8") > TOKEN_MAX_BYTES ||
    tokenType.toLowerCase() !== "bearer" ||
    !Number.isSafeInteger(expiresIn) ||
    expiresIn < 60 ||
    expiresIn > 172_800 ||
    (userType !== "Company" && userType !== "Location") ||
    !companyId ||
    !userId ||
    !scope ||
    (userType === "Location" && !locationId) ||
    (userType === "Company" && locationId)
  ) throw new Error("ghl_marketplace_token_response_invalid");
  return Object.freeze({
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn,
    scopes: normalizeGhlScopes(scope.split(/\s+/)),
    userType,
    companyId,
    locationId,
    approvedLocations: Object.freeze(approvedLocations),
    userId,
  });
}

export type GhlEncryptedCredentialEnvelope = Readonly<{
  version: 1;
  algorithm: "A256GCM";
  keyVersion: number;
  purpose: "access" | "refresh";
  reference: string;
  iv: string;
  ciphertext: string;
  tag: string;
}>;

function decodeKey(encoded: string) {
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) throw new Error("ghl_marketplace_encryption_key_invalid");
  return key;
}

function credentialAad(reference: string, purpose: string, keyVersion: number) {
  return Buffer.from(`dealflow-ghl-marketplace-v1|${reference}|${purpose}|${keyVersion}`, "utf8");
}

export function encryptGhlMarketplaceCredential(input: {
  credential: string;
  encodedKey: string;
  keyVersion: number;
  purpose: "access" | "refresh";
  id?: string;
  iv?: Buffer;
}): { envelope: GhlEncryptedCredentialEnvelope; credentialFingerprint: string } {
  if (
    Buffer.byteLength(input.credential, "utf8") < 20 ||
    Buffer.byteLength(input.credential, "utf8") > TOKEN_MAX_BYTES ||
    !Number.isSafeInteger(input.keyVersion) ||
    input.keyVersion < 1
  ) throw new Error("ghl_marketplace_credential_invalid");
  const id = input.id ?? randomUUID();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("ghl_marketplace_credential_id_invalid");
  const reference = `enc-ref:v${input.keyVersion}:ghl-marketplace/${input.purpose}/${id}`;
  const iv = input.iv ?? randomBytes(12);
  if (iv.length !== 12) throw new Error("ghl_marketplace_credential_iv_invalid");
  const cipher = createCipheriv("aes-256-gcm", decodeKey(input.encodedKey), iv);
  cipher.setAAD(credentialAad(reference, input.purpose, input.keyVersion));
  const ciphertext = Buffer.concat([cipher.update(input.credential, "utf8"), cipher.final()]);
  const envelope = Object.freeze({
    version: 1 as const,
    algorithm: "A256GCM" as const,
    keyVersion: input.keyVersion,
    purpose: input.purpose,
    reference,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  });
  if (JSON.stringify(envelope).includes(input.credential)) {
    throw new Error("ghl_marketplace_credential_envelope_leak");
  }
  return { envelope, credentialFingerprint: fingerprintGhlAuthorityValue(input.credential) };
}

export function decryptGhlMarketplaceCredential(
  envelope: GhlEncryptedCredentialEnvelope,
  encodedKey: string,
) {
  if (
    envelope.version !== 1 ||
    envelope.algorithm !== "A256GCM" ||
    !/^enc-ref:v[1-9][0-9]*:ghl-marketplace\/(access|refresh)\/[0-9a-f-]{36}$/i.test(envelope.reference) ||
    envelope.reference.split(":", 3)[1] !== `v${envelope.keyVersion}` ||
    !envelope.reference.includes(`/${envelope.purpose}/`)
  ) throw new Error("ghl_marketplace_credential_envelope_invalid");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    decodeKey(encodedKey),
    Buffer.from(envelope.iv, "base64url"),
  );
  decipher.setAAD(credentialAad(envelope.reference, envelope.purpose, envelope.keyVersion));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  if (Buffer.byteLength(plaintext, "utf8") < 20 || Buffer.byteLength(plaintext, "utf8") > TOKEN_MAX_BYTES) {
    throw new Error("ghl_marketplace_decrypted_credential_invalid");
  }
  return plaintext;
}

export class GhlMarketplaceProviderError extends Error {
  constructor(
    readonly code: string,
    readonly status: number | null,
    readonly requestId: string | null,
    readonly uncertain: boolean,
  ) {
    super(code);
    this.name = "GhlMarketplaceProviderError";
  }
}

function providerErrorCode(status: number, body: unknown) {
  const message = text(record(body).message).toLowerCase();
  if (status === 400 && message.includes("refresh token") && message.includes("invalid")) return "ghl_refresh_token_invalid";
  if (status === 400 && message.includes("location is not active")) return "ghl_location_inactive";
  if (status === 401 || status === 403) return "ghl_oauth_credential_rejected";
  if (status === 429) return "ghl_oauth_rate_limited";
  if (status >= 500) return "ghl_oauth_provider_unavailable";
  return "ghl_oauth_provider_rejected";
}

export class GhlMarketplaceOAuthClient {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  constructor(options: {
    effects: "disabled" | "synthetic_test" | "authorized_runtime";
    fetcher?: typeof fetch;
    timeoutMs?: number;
  }) {
    if (options.effects === "disabled") throw new Error("ghl_marketplace_provider_effects_disabled");
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = Math.min(Math.max(options.timeoutMs ?? 10_000, 1_000), 15_000);
  }

  private async post(input: {
    url: typeof GHL_MARKETPLACE_TOKEN_URL | typeof GHL_MARKETPLACE_LOCATION_TOKEN_URL;
    body: Record<string, string>;
    bearer?: string;
    encoding: "json" | "form";
  }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(input.url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": input.encoding === "form"
            ? "application/x-www-form-urlencoded"
            : "application/json",
          Version: GHL_MARKETPLACE_API_VERSION,
          ...(input.bearer ? { Authorization: `Bearer ${input.bearer}` } : {}),
        },
        body: input.encoding === "form"
          ? new URLSearchParams(input.body).toString()
          : JSON.stringify(input.body),
        redirect: "error",
        signal: controller.signal,
      });
      const raw = await response.text();
      if (Buffer.byteLength(raw, "utf8") > RESPONSE_MAX_BYTES) {
        throw new GhlMarketplaceProviderError(
          "ghl_oauth_response_too_large",
          response.status,
          null,
          response.ok,
        );
      }
      let body: unknown = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { /* classified below */ }
      const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-correlation-id");
      if (!response.ok) {
        throw new GhlMarketplaceProviderError(providerErrorCode(response.status, body), response.status, requestId, false);
      }
      return body;
    } catch (error) {
      if (error instanceof GhlMarketplaceProviderError) throw error;
      const timeoutFailure = controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      throw new GhlMarketplaceProviderError(
        timeoutFailure ? "ghl_oauth_timeout_ambiguous" : "ghl_oauth_transport_ambiguous",
        null,
        null,
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async exchangeAuthorizationCode(input: {
    clientId: string;
    clientSecret: string;
    code: string;
    userType: GhlMarketplaceUserType;
    redirectUri: string;
  }) {
    return parseGhlMarketplaceTokenResponse(await this.post({
      url: GHL_MARKETPLACE_TOKEN_URL,
      encoding: "json",
      body: {
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        grantType: "authorization_code",
        code: input.code,
        userType: input.userType,
        redirectUri: input.redirectUri,
      },
    }));
  }

  async refresh(input: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    userType: GhlMarketplaceUserType;
    redirectUri: string;
  }) {
    const response = await this.post({
      url: GHL_MARKETPLACE_TOKEN_URL,
      encoding: "json",
      body: {
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        grantType: "refresh_token",
        refreshToken: input.refreshToken,
        userType: input.userType,
        redirectUri: input.redirectUri,
      },
    });
    try {
      return parseGhlMarketplaceTokenResponse(response);
    } catch {
      // The provider returned success for a rotating refresh request, but the
      // returned replacement credential could not be proven. The prior token
      // may already be invalid, so this is an ambiguous outcome, never an
      // ordinary parse error or retryable pre-response failure.
      throw new GhlMarketplaceProviderError(
        "ghl_oauth_refresh_response_ambiguous",
        200,
        null,
        true,
      );
    }
  }

  async exchangeCompanyTokenForLocation(input: {
    companyAccessToken: string;
    companyId: string;
    locationId: string;
  }) {
    return parseGhlMarketplaceTokenResponse(await this.post({
      url: GHL_MARKETPLACE_LOCATION_TOKEN_URL,
      encoding: "json",
      bearer: input.companyAccessToken,
      body: { companyId: input.companyId, locationId: input.locationId },
    }));
  }
}

export function assertGhlMarketplaceTokenBinding(input: {
  token: GhlMarketplaceToken;
  expectedUserType: GhlMarketplaceUserType;
  expectedCompanyFingerprint: string;
  expectedLocationFingerprint: string | null;
  expectedScopeFingerprint: string;
}) {
  if (
    input.token.userType !== input.expectedUserType ||
    fingerprintGhlAuthorityValue(input.token.companyId) !== input.expectedCompanyFingerprint ||
    (input.expectedLocationFingerprint
      ? !input.token.locationId || fingerprintGhlAuthorityValue(input.token.locationId) !== input.expectedLocationFingerprint
      : input.token.locationId !== null) ||
    fingerprintGhlScopes(input.token.scopes) !== input.expectedScopeFingerprint
  ) throw new Error("ghl_marketplace_token_tenant_binding_mismatch");
  return true;
}
