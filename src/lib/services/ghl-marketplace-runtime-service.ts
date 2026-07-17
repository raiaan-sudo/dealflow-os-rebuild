import "server-only";

import { randomBytes } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import {
  fingerprintGhlAuthorityValue,
  fingerprintGhlScopes,
  normalizeGhlScopes,
} from "@/lib/integrations/gohighlevel/marketplace-oauth-contract";
import {
  assertGhlMarketplaceInstallUrl,
  assertGhlMarketplaceTokenBinding,
  decryptGhlMarketplaceCredential,
  encryptGhlMarketplaceCredential,
  GhlMarketplaceOAuthClient,
  GhlMarketplaceProviderError,
  normalizeGhlMarketplaceReturnPath,
  parseGhlMarketplaceLifecycleEvent,
  type GhlEncryptedCredentialEnvelope,
  type GhlMarketplaceLifecycleEvent,
  type GhlMarketplaceUserType,
} from "@/lib/integrations/gohighlevel/marketplace-runtime-contract";
import type { GhlLifecycleEnvironment } from "@/lib/integrations/gohighlevel/lifecycle-gate";
import { createAdminClient } from "@/lib/supabase/admin";

export const GHL_MARKETPLACE_STATE_COOKIE = "df_ghl_marketplace_state";
export const GHL_MARKETPLACE_PROVIDER_ATTESTATION = "DEALFLOW_GHL_MARKETPLACE_EXACT_V1";
export const GHL_MARKETPLACE_SYNTHETIC_ACCOUNT_ATTESTATION =
  "DEALFLOW_GHL_MARKETPLACE_SYNTHETIC_ACCOUNT_V1";
const STATE_TTL_MS = 10 * 60_000;
const REFRESH_TTL_MS = 365 * 24 * 60 * 60_000;
const REFRESH_AMBIGUITY_FENCE_TIMEOUT_MS = 3_000;

type GhlMarketplaceRpcClient = Readonly<{
  rpc: (name: string, params: Record<string, unknown>) => Promise<{
    data: unknown;
    error: unknown;
  }>;
}>;

export class GhlMarketplaceRefreshAmbiguityFenceError extends ApiError {
  readonly retryable = false;
  readonly cause: unknown;

  constructor(originalFailure: unknown) {
    super(
      503,
      "The rotating GHL credential outcome could not be fenced for operator reconciliation.",
      "ghl_marketplace_refresh_ambiguity_fence_failed",
    );
    this.name = "GhlMarketplaceRefreshAmbiguityFenceError";
    this.cause = originalFailure;
  }
}

export class GhlMarketplaceRefreshDispositionFenceError extends ApiError {
  readonly retryable = false;
  readonly cause: unknown;

  constructor(originalFailure: unknown) {
    super(
      503,
      "The GHL refresh failure could not be durably classified.",
      "ghl_marketplace_refresh_disposition_fence_failed",
    );
    this.name = "GhlMarketplaceRefreshDispositionFenceError";
    this.cause = originalFailure;
  }
}

async function boundedGhlMarketplaceRpc(
  operation: Promise<{ data: unknown; error: unknown }>,
  timeoutMs = REFRESH_AMBIGUITY_FENCE_TIMEOUT_MS,
) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("ghl_marketplace_refresh_ambiguity_fence_timeout")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function fenceGhlMarketplaceRefreshAmbiguity(input: {
  client: GhlMarketplaceRpcClient;
  tokenSetId: string;
  claimToken: string;
  expectedGeneration: number;
  originalFailure: unknown;
  timeoutMs?: number;
}) {
  try {
    const result = await boundedGhlMarketplaceRpc(
      input.client.rpc("mark_ghl_marketplace_token_refresh_ambiguous_v2", {
        p_token_set_id: input.tokenSetId,
        p_claim_token: input.claimToken,
        p_expected_generation: input.expectedGeneration,
      }),
      input.timeoutMs,
    );
    if (result.error || result.data !== "operator_required") {
      throw new Error("ghl_marketplace_refresh_ambiguity_fence_not_confirmed");
    }
  } catch {
    // The original post-provider failure remains the causal evidence. This
    // non-retryable wrapper prevents callers from treating an unproven fence as
    // an ordinary transient refresh error.
    throw new GhlMarketplaceRefreshAmbiguityFenceError(input.originalFailure);
  }
}

export async function settleGhlMarketplaceRefreshProviderFailure(input: {
  client: GhlMarketplaceRpcClient;
  tokenSetId: string;
  claimToken: string;
  expectedGeneration: number;
  providerError: GhlMarketplaceProviderError;
  timeoutMs?: number;
}) {
  const status = input.providerError.status;
  const transient = status === 429 || (status !== null && status >= 500);
  const terminal = status !== null && status >= 400 && status < 500 && status !== 429;
  if (!transient && !terminal) {
    throw new GhlMarketplaceRefreshDispositionFenceError(input.providerError);
  }
  const rpcName = transient
    ? "release_ghl_marketplace_token_refresh_retry_v2"
    : "mark_ghl_marketplace_token_refresh_reconnect_required_v2";
  const expectedOutcome = transient ? "retry_released" : "reconnect_required";
  try {
    const result = await boundedGhlMarketplaceRpc(
      input.client.rpc(rpcName, {
        p_token_set_id: input.tokenSetId,
        p_claim_token: input.claimToken,
        p_expected_generation: input.expectedGeneration,
        p_failure_code: input.providerError.code,
      }),
      input.timeoutMs,
    );
    if (result.error || result.data !== expectedOutcome) {
      throw new Error("ghl_marketplace_refresh_disposition_not_confirmed");
    }
    return expectedOutcome;
  } catch {
    throw new GhlMarketplaceRefreshDispositionFenceError(input.providerError);
  }
}

function value(input: unknown) {
  return typeof input === "string" ? input.trim() : "";
}

function oneRow(input: unknown) {
  if (Array.isArray(input)) return input.length === 1 ? input[0] as Record<string, unknown> : null;
  return input && typeof input === "object" ? input as Record<string, unknown> : null;
}

function requiredProviderId(input: string, code: string) {
  if (!/^[A-Za-z0-9_-]{3,160}$/.test(input)) throw new ApiError(503, "GHL Marketplace configuration is invalid.", code);
  return input;
}

function exactRedirectUri(input: string) {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) {
    throw new ApiError(503, "GHL Marketplace callback configuration is invalid.", "ghl_marketplace_redirect_invalid");
  }
  return url.toString();
}

export function getGhlMarketplaceApplicationConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const appId = requiredProviderId(value(environment.GHL_MARKETPLACE_APP_ID), "ghl_marketplace_app_id_invalid");
  const clientId = value(environment.GHL_MARKETPLACE_CLIENT_ID);
  const clientSecret = value(environment.GHL_MARKETPLACE_CLIENT_SECRET);
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(clientId) || clientSecret.length < 20 || clientSecret.length > 2_048) {
    throw new ApiError(503, "GHL Marketplace OAuth credentials are unavailable.", "ghl_marketplace_client_credentials_invalid");
  }
  const scopes = normalizeGhlScopes(value(environment.GHL_MARKETPLACE_SCOPES).split(/[ ,]+/));
  const redirectUri = exactRedirectUri(value(environment.GHL_MARKETPLACE_REDIRECT_URI));
  const installUrl = assertGhlMarketplaceInstallUrl(value(environment.GHL_MARKETPLACE_INSTALL_URL));
  const encodedEncryptionKey = value(environment.GHL_MARKETPLACE_TOKEN_ENCRYPTION_KEY);
  const keyVersion = Number(value(environment.GHL_MARKETPLACE_TOKEN_KEY_VERSION) || "1");
  try {
    if (Buffer.from(encodedEncryptionKey, "base64url").length !== 32 || !Number.isSafeInteger(keyVersion) || keyVersion < 1) {
      throw new Error("invalid");
    }
  } catch {
    throw new ApiError(503, "GHL Marketplace encryption authority is unavailable.", "ghl_marketplace_encryption_authority_invalid");
  }
  return Object.freeze({ appId, clientId, clientSecret, scopes, redirectUri, installUrl, encodedEncryptionKey, keyVersion });
}

export function assertGhlMarketplaceProviderEffectsAllowed(
  providerEnvironment: GhlLifecycleEnvironment,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const exactCommon = environment.GHL_MARKETPLACE_PROVIDER_EFFECTS_ENABLED === "true"
    && environment.GHL_MARKETPLACE_PROVIDER_ATTESTATION === GHL_MARKETPLACE_PROVIDER_ATTESTATION;
  const syntheticStaging = providerEnvironment === "sandbox"
    && environment.GHL_MARKETPLACE_SYNTHETIC_ACCOUNT_ATTESTATION === GHL_MARKETPLACE_SYNTHETIC_ACCOUNT_ATTESTATION
    && environment.GHL_PROVIDER_ENVIRONMENT === "sandbox";
  const protectedProduction = providerEnvironment === "production"
    && environment.GHL_PROVIDER_ENVIRONMENT === "production"
    && environment.GHL_PRODUCTION_WRITES_ENABLED === "true";
  if (!exactCommon || (!syntheticStaging && !protectedProduction)) {
    throw new ApiError(503, "GHL Marketplace provider execution is disabled.", "ghl_marketplace_provider_effects_disabled");
  }
  return true;
}

export async function createGhlMarketplaceConnectBinding(input: {
  userId: string;
  organizationId: string;
  providerEnvironment: GhlLifecycleEnvironment;
  installScope: "company" | "location";
  returnPath: unknown;
  reconnectRequested: boolean;
  now?: Date;
}) {
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "GHL Marketplace persistence is unavailable.", "service_role_missing");
  assertGhlMarketplaceProviderEffectsAllowed(input.providerEnvironment);
  const config = getGhlMarketplaceApplicationConfig();
  const databaseEnvironment = input.providerEnvironment === "production" ? "production" : "sandbox";
  const mappingResult = await (admin as any).from("ghl_location_mappings")
    .select("id,organization_id,installation_id,environment,provider_location_id,partner_id,status")
    .eq("organization_id", input.organizationId).eq("environment", databaseEnvironment)
    .eq("status", "active").limit(2);
  const mappings = Array.isArray(mappingResult.data) ? mappingResult.data as Record<string, unknown>[] : [];
  if (mappingResult.error || mappings.length !== 1) {
    throw new ApiError(409, "The workspace does not have one exact active GHL location.", "ghl_marketplace_location_ambiguous");
  }
  const mapping = mappings[0];
  const installationResult = await (admin as any).from("ghl_installations")
    .select("id,environment,provider_agency_id,partner_id,status")
    .eq("id", mapping.installation_id).eq("environment", databaseEnvironment)
    .eq("status", "active").limit(2);
  const installations = Array.isArray(installationResult.data) ? installationResult.data as Record<string, unknown>[] : [];
  if (installationResult.error || installations.length !== 1) {
    throw new ApiError(409, "The workspace GHL installation is unavailable.", "ghl_marketplace_installation_ambiguous");
  }
  const installation = installations[0];
  if (installation.partner_id !== mapping.partner_id) {
    throw new ApiError(403, "The GHL installation does not belong to this workspace.", "ghl_marketplace_partner_mismatch");
  }
  const companyId = requiredProviderId(value(installation.provider_agency_id), "ghl_marketplace_company_invalid");
  const locationId = requiredProviderId(value(mapping.provider_location_id), "ghl_marketplace_location_invalid");
  const state = randomBytes(32).toString("base64url");
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + STATE_TTL_MS).toISOString();
  const returnPath = normalizeGhlMarketplaceReturnPath(input.returnPath);
  const locationScope = input.installScope === "location";
  const { data, error } = await (admin as any).rpc("create_ghl_marketplace_oauth_state_v2", {
    p_organization_id: input.organizationId,
    p_initiated_by_user_id: input.userId,
    p_partner_id: mapping.partner_id ?? null,
    p_environment: databaseEnvironment,
    p_state_hash: fingerprintGhlAuthorityValue(state),
    p_installation_id: mapping.installation_id,
    p_location_mapping_id: locationScope ? mapping.id : null,
    p_install_scope: input.installScope,
    p_app_fingerprint: fingerprintGhlAuthorityValue(config.appId),
    p_account_fingerprint: fingerprintGhlAuthorityValue(locationScope ? locationId : companyId),
    p_scope_fingerprint: fingerprintGhlScopes(config.scopes),
    p_company_fingerprint: fingerprintGhlAuthorityValue(companyId),
    p_location_fingerprint: locationScope ? fingerprintGhlAuthorityValue(locationId) : null,
    p_redirect_uri_fingerprint: fingerprintGhlAuthorityValue(config.redirectUri),
    p_return_path: returnPath,
    p_reconnect_requested: input.reconnectRequested,
    p_expires_at: expiresAt,
  });
  if (error || !value(data)) throw new ApiError(409, "The GHL connection could not be started.", "ghl_marketplace_state_create_failed");
  return { state, expiresAt, installUrl: config.installUrl, returnPath };
}

async function storeEncryptedPair(input: {
  admin: any;
  stateId?: string | null;
  authorityId?: string | null;
  organizationId: string;
  token: { accessToken: string; refreshToken: string };
  key: string;
  keyVersion: number;
  generation: number;
}) {
  const access = encryptGhlMarketplaceCredential({
    credential: input.token.accessToken, encodedKey: input.key, keyVersion: input.keyVersion, purpose: "access",
  });
  const refresh = encryptGhlMarketplaceCredential({
    credential: input.token.refreshToken, encodedKey: input.key, keyVersion: input.keyVersion, purpose: "refresh",
  });
  const { error } = await input.admin.rpc("store_staged_ghl_marketplace_credential_pair_v2", {
    p_oauth_state_id: input.stateId ?? null,
    p_authority_id: input.authorityId ?? null,
    p_organization_id: input.organizationId,
    p_access_credential_ref: access.envelope.reference,
    p_access_envelope: access.envelope,
    p_access_fingerprint: access.credentialFingerprint,
    p_refresh_credential_ref: refresh.envelope.reference,
    p_refresh_envelope: refresh.envelope,
    p_refresh_fingerprint: refresh.credentialFingerprint,
    p_key_version: input.keyVersion,
    p_generation: input.generation,
  });
  if (error) throw new ApiError(503, "Encrypted GHL credentials could not be staged.", "ghl_marketplace_credential_stage_failed");
  return { access, refresh };
}

export async function completeGhlMarketplaceOAuthCallback(input: {
  state: string;
  code: string;
  userId: string;
  organizationId: string;
  providerEnvironment: GhlLifecycleEnvironment;
  now?: Date;
  client?: GhlMarketplaceOAuthClient;
}) {
  if (!/^[A-Za-z0-9._~-]{8,4096}$/.test(input.code)) {
    throw new ApiError(400, "The GHL authorization code is invalid.", "ghl_marketplace_code_invalid");
  }
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "GHL Marketplace persistence is unavailable.", "service_role_missing");
  const config = getGhlMarketplaceApplicationConfig();
  assertGhlMarketplaceProviderEffectsAllowed(input.providerEnvironment);
  const { data, error } = await (admin as any).rpc("consume_ghl_marketplace_oauth_state_v2", {
    p_state_hash: fingerprintGhlAuthorityValue(input.state),
    p_organization_id: input.organizationId,
    p_initiated_by_user_id: input.userId,
    p_redirect_uri_fingerprint: fingerprintGhlAuthorityValue(config.redirectUri),
  });
  const state = oneRow(data);
  if (error || state?.result_outcome !== "consumed") {
    throw new ApiError(400, "The GHL connection state is invalid, expired, or already used.", "ghl_marketplace_state_invalid");
  }
  if (
    state.result_app_fingerprint !== fingerprintGhlAuthorityValue(config.appId) ||
    state.result_scope_fingerprint !== fingerprintGhlScopes(config.scopes)
  ) throw new ApiError(403, "The GHL OAuth authority changed during connection.", "ghl_marketplace_authority_drift");
  const userType: GhlMarketplaceUserType = state.result_install_scope === "location" ? "Location" : "Company";
  const client = input.client ?? new GhlMarketplaceOAuthClient({ effects: "authorized_runtime" });
  const token = await client.exchangeAuthorizationCode({
    clientId: config.clientId, clientSecret: config.clientSecret, code: input.code,
    userType, redirectUri: config.redirectUri,
  });
  assertGhlMarketplaceTokenBinding({
    token, expectedUserType: userType,
    expectedCompanyFingerprint: value(state.result_company_fingerprint),
    expectedLocationFingerprint: value(state.result_location_fingerprint) || null,
    expectedScopeFingerprint: value(state.result_scope_fingerprint),
  });
  const pair = await storeEncryptedPair({
    admin, stateId: value(state.result_state_id), organizationId: input.organizationId,
    token, key: config.encodedEncryptionKey, keyVersion: config.keyVersion, generation: 1,
  });
  const now = input.now ?? new Date();
  const { data: finalized, error: finalizeError } = await (admin as any).rpc("finalize_ghl_marketplace_oauth_callback_v2", {
    p_oauth_state_id: state.result_state_id,
    p_access_credential_ref: pair.access.envelope.reference,
    p_refresh_credential_ref: pair.refresh.envelope.reference,
    p_token_account_fingerprint: fingerprintGhlAuthorityValue(token.locationId ?? token.companyId),
    p_token_scope_fingerprint: fingerprintGhlScopes(token.scopes),
    p_token_company_fingerprint: fingerprintGhlAuthorityValue(token.companyId),
    p_token_location_fingerprint: token.locationId ? fingerprintGhlAuthorityValue(token.locationId) : null,
    p_access_expires_at: new Date(now.getTime() + token.expiresIn * 1_000).toISOString(),
    p_refresh_expires_at: new Date(now.getTime() + REFRESH_TTL_MS).toISOString(),
    p_key_version: config.keyVersion,
  });
  const result = oneRow(finalized);
  if (finalizeError || result?.result_outcome !== "finalized") {
    throw new ApiError(503, "The encrypted GHL connection requires operator reconciliation.", "ghl_marketplace_callback_finalize_failed");
  }
  return { returnPath: value(state.result_return_path) || "/settings", authorityId: result.result_authority_id, tokenSetId: result.result_token_set_id };
}

export async function acceptGhlMarketplaceRuntimeEvent(
  rawBody: string,
  providerEnvironment: GhlLifecycleEnvironment,
) {
  const config = getGhlMarketplaceApplicationConfig();
  const event = parseGhlMarketplaceLifecycleEvent(rawBody, config.appId);
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "GHL Marketplace persistence is unavailable.", "service_role_missing");
  const { data, error } = await (admin as any).rpc("ingest_ghl_marketplace_runtime_event_v2", {
    p_environment: providerEnvironment === "production" ? "production" : "sandbox",
    p_event_type: event.eventType,
    p_event_fingerprint: event.eventFingerprint,
    p_payload_fingerprint: event.payloadFingerprint,
    p_app_fingerprint: event.appFingerprint,
    p_company_fingerprint: event.companyFingerprint,
    p_location_fingerprint: event.locationFingerprint,
    p_account_fingerprint: event.accountFingerprint,
    p_user_fingerprint: event.userFingerprint,
    p_email_fingerprint: event.emailFingerprint,
    p_raw_user_email: event.rawUserEmail,
    p_identifiers_complete: event.identifiersComplete,
    p_provider_occurred_at: event.providerTimestamp,
  });
  const result = oneRow(data);
  if (error || !result) throw new ApiError(503, "The GHL Marketplace event could not be durably recorded.", "ghl_marketplace_event_ingest_failed");
  return { event, outcome: value(result.result_outcome), eventId: value(result.result_event_id) };
}

export async function refreshGhlMarketplaceTokenSet(input: {
  tokenSetId: string;
  expectedGeneration: number;
  workerId: string;
  providerEnvironment: GhlLifecycleEnvironment;
  client?: GhlMarketplaceOAuthClient;
  now?: Date;
}) {
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "GHL Marketplace persistence is unavailable.", "service_role_missing");
  const config = getGhlMarketplaceApplicationConfig();
  assertGhlMarketplaceProviderEffectsAllowed(input.providerEnvironment);
  const { data: claimed, error: claimError } = await (admin as any).rpc("claim_ghl_marketplace_token_refresh_v1", {
    p_token_set_id: input.tokenSetId, p_expected_generation: input.expectedGeneration,
    p_worker_id: input.workerId, p_lease_seconds: 120,
  });
  const claim = oneRow(claimed);
  if (claimError || claim?.result_outcome !== "claimed") return { outcome: value(claim?.result_outcome) || "not_claimed" };
  const tokenQuery = await (admin as any).from("ghl_marketplace_token_sets")
    .select("id,authority_id,organization_id,subject_kind,account_fingerprint,scope_fingerprint,generation")
    .eq("id", input.tokenSetId).limit(2);
  const tokenSet = Array.isArray(tokenQuery.data) && tokenQuery.data.length === 1 ? tokenQuery.data[0] as Record<string, unknown> : null;
  if (tokenQuery.error || !tokenSet) throw new ApiError(503, "The claimed GHL token set is unavailable.", "ghl_marketplace_token_set_missing");
  const authorityQuery = await (admin as any).from("ghl_marketplace_authorities")
    .select("id,company_fingerprint,location_fingerprint,status")
    .eq("id", tokenSet.authority_id).eq("status", "active").limit(2);
  const authority = Array.isArray(authorityQuery.data) && authorityQuery.data.length === 1 ? authorityQuery.data[0] as Record<string, unknown> : null;
  if (authorityQuery.error || !authority) throw new ApiError(503, "The GHL token authority is unavailable.", "ghl_marketplace_token_authority_missing");
  const { data: envelopeData, error: resolveError } = await (admin as any).rpc("resolve_ghl_marketplace_credential_v2", {
    p_credential_ref: claim.result_encrypted_refresh_credential_ref,
    p_authority_id: tokenSet.authority_id,
  });
  if (resolveError || !envelopeData) throw new ApiError(503, "The encrypted GHL refresh credential is unavailable.", "ghl_marketplace_refresh_credential_missing");
  const refreshToken = decryptGhlMarketplaceCredential(envelopeData as GhlEncryptedCredentialEnvelope, config.encodedEncryptionKey);
  const client = input.client ?? new GhlMarketplaceOAuthClient({ effects: "authorized_runtime" });
  let providerResponseReceived = false;
  try {
    const userType: GhlMarketplaceUserType = tokenSet.subject_kind === "location" ? "Location" : "Company";
    const token = await client.refresh({ clientId: config.clientId, clientSecret: config.clientSecret, refreshToken, userType, redirectUri: config.redirectUri });
    // HighLevel refresh tokens rotate. Once a valid provider response arrives,
    // every later local failure is ambiguous because the previously persisted
    // refresh token may already be invalid.
    providerResponseReceived = true;
    assertGhlMarketplaceTokenBinding({
      token, expectedUserType: userType,
      expectedCompanyFingerprint: value(authority.company_fingerprint),
      expectedLocationFingerprint: userType === "Location" ? value(tokenSet.account_fingerprint) : null,
      expectedScopeFingerprint: value(tokenSet.scope_fingerprint),
    });
    const pair = await storeEncryptedPair({
      admin, authorityId: value(tokenSet.authority_id), organizationId: value(tokenSet.organization_id), token,
      key: config.encodedEncryptionKey, keyVersion: config.keyVersion, generation: input.expectedGeneration + 1,
    });
    const now = input.now ?? new Date();
    const { data: settled, error: settleError } = await (admin as any).rpc("settle_ghl_marketplace_token_refresh_encrypted_v2", {
      p_token_set_id: input.tokenSetId, p_claim_token: claim.result_claim_token,
      p_expected_generation: input.expectedGeneration,
      p_access_credential_ref: pair.access.envelope.reference,
      p_refresh_credential_ref: pair.refresh.envelope.reference,
      p_account_fingerprint: tokenSet.account_fingerprint,
      p_scope_fingerprint: tokenSet.scope_fingerprint,
      p_access_expires_at: new Date(now.getTime() + token.expiresIn * 1_000).toISOString(),
      p_refresh_expires_at: new Date(now.getTime() + REFRESH_TTL_MS).toISOString(),
      p_key_version: config.keyVersion,
      p_outcome_fingerprint: fingerprintGhlAuthorityValue(`refresh:${input.tokenSetId}:${input.expectedGeneration + 1}`),
    });
    const result = oneRow(settled);
    if (settleError || result?.result_outcome !== "settled") throw new ApiError(503, "GHL refresh settlement failed closed.", "ghl_marketplace_refresh_settle_failed");
    return { outcome: "settled", generation: result.result_generation };
  } catch (error) {
    if (providerResponseReceived || (error instanceof GhlMarketplaceProviderError && error.uncertain)) {
      await fenceGhlMarketplaceRefreshAmbiguity({
        client: admin as unknown as GhlMarketplaceRpcClient,
        tokenSetId: input.tokenSetId,
        claimToken: value(claim.result_claim_token),
        expectedGeneration: input.expectedGeneration,
        originalFailure: error,
      });
    } else if (error instanceof GhlMarketplaceProviderError) {
      await settleGhlMarketplaceRefreshProviderFailure({
        client: admin as unknown as GhlMarketplaceRpcClient,
        tokenSetId: input.tokenSetId,
        claimToken: value(claim.result_claim_token),
        expectedGeneration: input.expectedGeneration,
        providerError: error,
      });
    }
    throw error;
  }
}

export async function exchangeGhlCompanyTokenForLocation(input: {
  companyTokenSetId: string;
  organizationId: string;
  locationMappingId: string;
  partnerId: string | null;
  requestFingerprint: string;
  idempotencyKey: string;
  providerEnvironment: GhlLifecycleEnvironment;
  client?: GhlMarketplaceOAuthClient;
  now?: Date;
}) {
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "GHL Marketplace persistence is unavailable.", "service_role_missing");
  const config = getGhlMarketplaceApplicationConfig();
  assertGhlMarketplaceProviderEffectsAllowed(input.providerEnvironment);
  const now = input.now ?? new Date();
  const { data: exchangeIdData, error: requestError } = await (admin as any).rpc(
    "request_ghl_marketplace_location_token_exchange_v2",
    {
      p_company_token_set_id: input.companyTokenSetId,
      p_organization_id: input.organizationId,
      p_location_mapping_id: input.locationMappingId,
      p_partner_id: input.partnerId,
      p_request_fingerprint: input.requestFingerprint,
      p_idempotency_key: input.idempotencyKey,
      p_now: now.toISOString(),
    },
  );
  const exchangeId = value(exchangeIdData);
  if (requestError || !exchangeId) {
    throw new ApiError(409, "The GHL location-token exchange could not be started.", "ghl_marketplace_location_exchange_request_failed");
  }
  const exchangeQuery = await (admin as any).from("ghl_marketplace_location_token_exchanges")
    .select("id,authority_id,company_token_set_id,organization_id,location_mapping_id,partner_id,status,result_token_set_id,company_fingerprint,location_fingerprint,scope_fingerprint")
    .eq("id", exchangeId).limit(2);
  const exchange = Array.isArray(exchangeQuery.data) && exchangeQuery.data.length === 1
    ? exchangeQuery.data[0] as Record<string, unknown> : null;
  if (exchangeQuery.error || !exchange) {
    throw new ApiError(503, "The GHL location-token exchange receipt is unavailable.", "ghl_marketplace_location_exchange_missing");
  }
  if (exchange.status !== "pending") {
    return { outcome: value(exchange.status), exchangeId, tokenSetId: value(exchange.result_token_set_id) || null };
  }
  const [tokenQuery, authorityQuery, mappingQuery] = await Promise.all([
    (admin as any).from("ghl_marketplace_token_sets")
      .select("id,authority_id,organization_id,partner_id,subject_kind,status,encrypted_access_credential_ref,scope_fingerprint,access_expires_at")
      .eq("id", input.companyTokenSetId).limit(2),
    (admin as any).from("ghl_marketplace_authorities")
      .select("id,installation_id,organization_id,partner_id,status,company_fingerprint")
      .eq("id", exchange.authority_id).limit(2),
    (admin as any).from("ghl_location_mappings")
      .select("id,installation_id,organization_id,partner_id,environment,provider_location_id,status")
      .eq("id", input.locationMappingId).limit(2),
  ]);
  const companyToken = Array.isArray(tokenQuery.data) && tokenQuery.data.length === 1
    ? tokenQuery.data[0] as Record<string, unknown> : null;
  const authority = Array.isArray(authorityQuery.data) && authorityQuery.data.length === 1
    ? authorityQuery.data[0] as Record<string, unknown> : null;
  const mapping = Array.isArray(mappingQuery.data) && mappingQuery.data.length === 1
    ? mappingQuery.data[0] as Record<string, unknown> : null;
  const companyAccessExpiresAt = Date.parse(value(companyToken?.access_expires_at));
  if (
    tokenQuery.error || authorityQuery.error || mappingQuery.error || !companyToken || !authority || !mapping ||
    companyToken.subject_kind !== "company" || companyToken.status !== "active" || authority.status !== "active" ||
    value(companyToken.organization_id) !== input.organizationId || value(authority.organization_id) !== input.organizationId ||
    value(mapping.organization_id) !== input.organizationId || value(companyToken.authority_id) !== value(authority.id) ||
    value(mapping.installation_id) !== value(authority.installation_id) ||
    companyToken.partner_id !== input.partnerId || authority.partner_id !== input.partnerId || mapping.partner_id !== input.partnerId ||
    value(exchange.company_fingerprint) !== value(authority.company_fingerprint) ||
    value(exchange.location_fingerprint) !== fingerprintGhlAuthorityValue(value(mapping.provider_location_id)) ||
    value(exchange.scope_fingerprint) !== value(companyToken.scope_fingerprint) ||
    !Number.isFinite(companyAccessExpiresAt) || companyAccessExpiresAt <= now.getTime()
  ) {
    throw new ApiError(403, "The GHL location-token exchange tenant binding is invalid.", "ghl_marketplace_location_exchange_binding_mismatch");
  }
  const installationQuery = await (admin as any).from("ghl_installations")
    .select("id,provider_agency_id,environment,status")
    .eq("id", authority.installation_id).eq("status", "active").limit(2);
  const installation = Array.isArray(installationQuery.data) && installationQuery.data.length === 1
    ? installationQuery.data[0] as Record<string, unknown> : null;
  if (
    installationQuery.error || !installation ||
    fingerprintGhlAuthorityValue(value(installation.provider_agency_id)) !== value(authority.company_fingerprint)
  ) throw new ApiError(403, "The GHL company authority is invalid.", "ghl_marketplace_company_binding_mismatch");
  const { data: accessEnvelope, error: resolveError } = await (admin as any).rpc("resolve_ghl_marketplace_credential_v2", {
    p_credential_ref: companyToken.encrypted_access_credential_ref,
    p_authority_id: authority.id,
  });
  if (resolveError || !accessEnvelope) {
    throw new ApiError(503, "The encrypted GHL company credential is unavailable.", "ghl_marketplace_company_credential_missing");
  }
  const companyAccessToken = decryptGhlMarketplaceCredential(
    accessEnvelope as GhlEncryptedCredentialEnvelope,
    config.encodedEncryptionKey,
  );
  const client = input.client ?? new GhlMarketplaceOAuthClient({ effects: "authorized_runtime" });
  let providerResponseReceived = false;
  try {
    const token = await client.exchangeCompanyTokenForLocation({
      companyAccessToken,
      companyId: requiredProviderId(value(installation.provider_agency_id), "ghl_marketplace_company_invalid"),
      locationId: requiredProviderId(value(mapping.provider_location_id), "ghl_marketplace_location_invalid"),
    });
    providerResponseReceived = true;
    assertGhlMarketplaceTokenBinding({
      token,
      expectedUserType: "Location",
      expectedCompanyFingerprint: value(authority.company_fingerprint),
      expectedLocationFingerprint: value(exchange.location_fingerprint),
      expectedScopeFingerprint: value(exchange.scope_fingerprint),
    });
    const pair = await storeEncryptedPair({
      admin,
      authorityId: value(authority.id),
      organizationId: input.organizationId,
      token,
      key: config.encodedEncryptionKey,
      keyVersion: config.keyVersion,
      generation: 1,
    });
    const { data: settled, error: settleError } = await (admin as any).rpc(
      "settle_ghl_marketplace_location_exchange_encrypted_v2",
      {
        p_exchange_id: exchangeId,
        p_outcome: "succeeded",
        p_access_credential_ref: pair.access.envelope.reference,
        p_refresh_credential_ref: pair.refresh.envelope.reference,
        p_access_expires_at: new Date(now.getTime() + token.expiresIn * 1_000).toISOString(),
        p_refresh_expires_at: new Date(now.getTime() + REFRESH_TTL_MS).toISOString(),
        p_key_version: config.keyVersion,
        p_now: now.toISOString(),
      },
    );
    const result = oneRow(settled);
    if (settleError || result?.result_outcome !== "succeeded") {
      throw new ApiError(503, "The GHL location token requires operator reconciliation.", "ghl_marketplace_location_exchange_settle_failed");
    }
    return { outcome: "succeeded", exchangeId, tokenSetId: value(result.result_token_set_id) };
  } catch (error) {
    const deterministicProviderFailure = error instanceof GhlMarketplaceProviderError && !error.uncertain;
    const ambiguous = providerResponseReceived || (error instanceof GhlMarketplaceProviderError && error.uncertain);
    if (deterministicProviderFailure || ambiguous) {
      await (admin as any).rpc("settle_ghl_marketplace_location_exchange_encrypted_v2", {
        p_exchange_id: exchangeId,
        p_outcome: ambiguous ? "ambiguous" : "operator_required",
        p_access_credential_ref: null,
        p_refresh_credential_ref: null,
        p_access_expires_at: null,
        p_refresh_expires_at: null,
        p_key_version: config.keyVersion,
        p_now: now.toISOString(),
      });
    }
    throw error;
  }
}

export function sanitizedGhlMarketplaceEvent(event: GhlMarketplaceLifecycleEvent) {
  return {
    eventType: event.eventType,
    eventFingerprint: event.eventFingerprint.slice(0, 19),
    identifiersComplete: event.identifiersComplete,
  };
}
