import { createHash } from "node:crypto";

const SHA256_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ENCRYPTED_REFERENCE_PATTERN = /^enc-ref:v[1-9][0-9]*:[A-Za-z0-9][A-Za-z0-9._:/-]{15,255}$/;
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

export const GHL_MARKETPLACE_DOCUMENTATION = Object.freeze({
  oauth: "https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/",
  accessToken: "https://marketplace.gohighlevel.com/docs/ghl/oauth/get-access-token/",
  locationToken: "https://marketplace.gohighlevel.com/docs/ghl/oauth/get-location-access-token/",
  appInstall: "https://marketplace.gohighlevel.com/docs/webhook/AppInstall/",
  appUninstall: "https://marketplace.gohighlevel.com/docs/webhook/AppUninstall/",
  appUpdate: "https://marketplace.gohighlevel.com/docs/webhook/AppUpdate/",
  webhookSecurity: "https://marketplace.gohighlevel.com/docs/2021-07-28/webhook/WebhookIntegrationGuide/",
  userCreateWebhook: "https://marketplace.gohighlevel.com/docs/webhook/UserCreate/",
  userUpdateWebhook: "https://marketplace.gohighlevel.com/docs/webhook/UserUpdate/",
  userDeleteWebhook: "https://marketplace.gohighlevel.com/docs/webhook/UserDelete/",
  createUser: "https://marketplace.gohighlevel.com/docs/ghl/users/create-user/",
  deleteUser: "https://marketplace.gohighlevel.com/docs/ghl/users/delete-user/",
} as const);

export const GHL_MARKETPLACE_OPERATIONS = [
  "oauth_code_exchange",
  "oauth_refresh",
  "company_to_location_token_exchange",
  "app_install",
  "app_uninstall",
  "app_update",
  "user_created",
  "user_updated",
  "user_deleted",
  "location_created",
  "location_updated",
  "user_create",
  "user_invite",
  "user_revoke",
] as const;

export type GhlMarketplaceOperation = (typeof GHL_MARKETPLACE_OPERATIONS)[number];
export type GhlRealtorUserOperation = Extract<
  GhlMarketplaceOperation,
  "user_create" | "user_invite" | "user_revoke"
>;

export type GhlMarketplaceProviderContract = Readonly<{
  operation: GhlMarketplaceOperation;
  effect: "disabled_contract_only";
  method: "POST" | "DELETE" | null;
  path: string | null;
  version: "v3" | null;
  requiredEncryptedReferences: readonly string[];
  requiredOpaqueBindings: readonly string[];
  status: "ready_for_separately_authorized_executor" | "operator_required";
  blockerCode: string | null;
}>;

export type GhlMarketplaceOAuthBinding = Readonly<{
  stateHash: string;
  stateProtection: "single_use_hash_cookie_binding";
  pkceChallenge: string | null;
  pkceMethod: "S256" | null;
  encryptedPkceVerifierRef: string | null;
  appFingerprint: string;
  accountFingerprint: string;
  scopeFingerprint: string;
  companyFingerprint: string;
  locationFingerprint: string | null;
}>;

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`ghl_${field}_required`);
  }
  return normalized;
}

export function fingerprintGhlAuthorityValue(value: string): string {
  const normalized = requireNonEmpty(value, "fingerprint_source");
  // Provider authority values are fingerprinted for equality/idempotency.
  // lgtm[js/insufficient-password-hash]
  return `sha256:${createHash("sha256").update(normalized, "utf8").digest("hex")}`;
}

export function normalizeGhlScopes(scopes: readonly string[]): readonly string[] {
  const normalized = [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))].sort();
  if (normalized.length === 0) {
    throw new Error("ghl_scope_set_required");
  }
  return Object.freeze(normalized);
}

export function fingerprintGhlScopes(scopes: readonly string[]): string {
  return fingerprintGhlAuthorityValue(normalizeGhlScopes(scopes).join(" "));
}

export function assertGhlSha256Fingerprint(value: string, field = "fingerprint"): string {
  if (!SHA256_FINGERPRINT_PATTERN.test(value)) {
    throw new Error(`ghl_${field}_invalid`);
  }
  return value;
}

export function assertGhlEncryptedReference(value: string, field = "credential_reference"): string {
  if (!ENCRYPTED_REFERENCE_PATTERN.test(value)) {
    throw new Error(`ghl_${field}_must_be_opaque_encrypted_reference`);
  }
  return value;
}

export function deriveGhlPkceS256Challenge(codeVerifier: string): string {
  if (!PKCE_VERIFIER_PATTERN.test(codeVerifier)) {
    throw new Error("ghl_pkce_verifier_invalid");
  }
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

export function createGhlMarketplaceOAuthBinding(input: {
  state: string;
  codeVerifier?: string | null;
  encryptedPkceVerifierRef?: string | null;
  appId: string;
  accountId: string;
  scopes: readonly string[];
  companyId: string;
  locationId?: string | null;
}): GhlMarketplaceOAuthBinding {
  const locationId = input.locationId?.trim() || null;
  const codeVerifier = input.codeVerifier?.trim() || null;
  const verifierRef = input.encryptedPkceVerifierRef?.trim() || null;
  if (Boolean(codeVerifier) !== Boolean(verifierRef)) {
    throw new Error("ghl_pkce_binding_incomplete");
  }
  return Object.freeze({
    stateHash: fingerprintGhlAuthorityValue(requireNonEmpty(input.state, "oauth_state")),
    stateProtection: "single_use_hash_cookie_binding",
    pkceChallenge: codeVerifier ? deriveGhlPkceS256Challenge(codeVerifier) : null,
    pkceMethod: codeVerifier ? "S256" : null,
    encryptedPkceVerifierRef: verifierRef
      ? assertGhlEncryptedReference(verifierRef, "pkce_verifier_reference")
      : null,
    appFingerprint: fingerprintGhlAuthorityValue(input.appId),
    accountFingerprint: fingerprintGhlAuthorityValue(input.accountId),
    scopeFingerprint: fingerprintGhlScopes(input.scopes),
    companyFingerprint: fingerprintGhlAuthorityValue(input.companyId),
    locationFingerprint: locationId ? fingerprintGhlAuthorityValue(locationId) : null,
  });
}

export function buildGhlOAuthCodeExchangeContract(input: {
  clientCredentialRef: string;
  authorizationCodeRef: string;
  redirectUriRef: string;
  userTypeRef: string;
  pkceVerifierRef?: string | null;
}): GhlMarketplaceProviderContract {
  const pkceVerifierRef = input.pkceVerifierRef?.trim();
  return Object.freeze({
    operation: "oauth_code_exchange",
    effect: "disabled_contract_only",
    method: "POST",
    path: "/oauth/token",
    version: "v3",
    requiredEncryptedReferences: Object.freeze([
      assertGhlEncryptedReference(input.clientCredentialRef, "client_credential_reference"),
      assertGhlEncryptedReference(input.authorizationCodeRef, "authorization_code_reference"),
      ...(pkceVerifierRef
        ? [assertGhlEncryptedReference(pkceVerifierRef, "pkce_verifier_reference")]
        : []),
    ]),
    requiredOpaqueBindings: Object.freeze([
      requireNonEmpty(input.redirectUriRef, "redirect_uri_reference"),
      requireNonEmpty(input.userTypeRef, "user_type_reference"),
    ]),
    status: "ready_for_separately_authorized_executor",
    blockerCode: null,
  });
}

export function buildGhlOAuthRefreshContract(input: {
  clientCredentialRef: string;
  rotatingRefreshCredentialRef: string;
}): GhlMarketplaceProviderContract {
  return Object.freeze({
    operation: "oauth_refresh",
    effect: "disabled_contract_only",
    method: "POST",
    path: "/oauth/token",
    version: "v3",
    requiredEncryptedReferences: Object.freeze([
      assertGhlEncryptedReference(input.clientCredentialRef, "client_credential_reference"),
      assertGhlEncryptedReference(input.rotatingRefreshCredentialRef, "refresh_credential_reference"),
    ]),
    requiredOpaqueBindings: Object.freeze([]),
    status: "ready_for_separately_authorized_executor",
    blockerCode: null,
  });
}

export function buildGhlCompanyToLocationTokenExchangeContract(input: {
  companyAccessCredentialRef: string;
  companyIdRef: string;
  locationIdRef: string;
}): GhlMarketplaceProviderContract {
  return Object.freeze({
    operation: "company_to_location_token_exchange",
    effect: "disabled_contract_only",
    method: "POST",
    path: "/oauth/location-token",
    version: "v3",
    requiredEncryptedReferences: Object.freeze([
      assertGhlEncryptedReference(input.companyAccessCredentialRef, "company_access_credential_reference"),
    ]),
    requiredOpaqueBindings: Object.freeze([
      requireNonEmpty(input.companyIdRef, "company_id_reference"),
      requireNonEmpty(input.locationIdRef, "location_id_reference"),
    ]),
    status: "ready_for_separately_authorized_executor",
    blockerCode: null,
  });
}

export function buildGhlRealtorUserOperationContract(input: {
  operation: GhlRealtorUserOperation;
  accessCredentialRef: string;
  companyIdRef: string;
  locationIdRef: string;
  realtorProfileRef?: string;
  providerUserIdRef?: string;
}): GhlMarketplaceProviderContract {
  const accessCredentialRef = assertGhlEncryptedReference(
    input.accessCredentialRef,
    "user_operation_access_credential_reference",
  );
  const commonBindings = [
    requireNonEmpty(input.companyIdRef, "company_id_reference"),
    requireNonEmpty(input.locationIdRef, "location_id_reference"),
  ];

  if (input.operation === "user_invite") {
    return Object.freeze({
      operation: input.operation,
      effect: "disabled_contract_only",
      method: null,
      path: null,
      version: null,
      requiredEncryptedReferences: Object.freeze([accessCredentialRef]),
      requiredOpaqueBindings: Object.freeze(commonBindings),
      status: "operator_required",
      blockerCode: "ghl_standalone_user_invite_contract_not_documented",
    });
  }

  if (input.operation === "user_create") {
    return Object.freeze({
      operation: input.operation,
      effect: "disabled_contract_only",
      method: "POST",
      path: "/users/",
      version: "v3",
      requiredEncryptedReferences: Object.freeze([accessCredentialRef]),
      requiredOpaqueBindings: Object.freeze([
        ...commonBindings,
        requireNonEmpty(input.realtorProfileRef ?? "", "realtor_profile_reference"),
      ]),
      status: "ready_for_separately_authorized_executor",
      blockerCode: null,
    });
  }

  return Object.freeze({
    operation: input.operation,
    effect: "disabled_contract_only",
    method: "DELETE",
    path: "/users/:userId",
    version: "v3",
    requiredEncryptedReferences: Object.freeze([accessCredentialRef]),
    requiredOpaqueBindings: Object.freeze([
      ...commonBindings,
      requireNonEmpty(input.providerUserIdRef ?? "", "provider_user_id_reference"),
    ]),
    status: "ready_for_separately_authorized_executor",
    blockerCode: null,
  });
}

export function assertGhlSanitizedCredentialMetadata(input: Readonly<Record<string, unknown>>): void {
  const forbidden = /^(raw.*(?:token|secret|code|verifier)|access_?token|refresh_?token|client_?secret|code_?verifier|authorization_?code|password)$/i;
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (forbidden.test(key)) {
        throw new Error(`ghl_raw_credential_field_forbidden:${key}`);
      }
      walk(nested);
    }
  };
  walk(input);
}
