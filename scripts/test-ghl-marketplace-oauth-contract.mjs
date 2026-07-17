#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "dealflow-ghl-marketplace-contract-"));
const tsc = path.join(root, "node_modules", ".bin", "tsc");
const source = "src/lib/integrations/gohighlevel/marketplace-oauth-contract.ts";

try {
  const compile = spawnSync(tsc, [
    "--pretty", "false",
    "--target", "ES2022",
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--strict",
    "--esModuleInterop",
    "--skipLibCheck",
    "--rootDir", "src",
    "--outDir", buildDir,
    source,
  ], { cwd: root, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(compile.status, 0, `GHL Marketplace contract compilation failed:\n${compile.stdout}${compile.stderr}`);

  const require = createRequire(import.meta.url);
  const contract = require(path.join(buildDir, "lib", "integrations", "gohighlevel", "marketplace-oauth-contract.js"));
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const rawState = "state-value-kept-in-memory-only";
  const appId = "synthetic-app-id";
  const accountId = "synthetic-location-id";
  const companyId = "synthetic-company-id";
  const verifierRef = "enc-ref:v1:oauth/pkce/synthetic-0001";

  assert.equal(
    contract.deriveGhlPkceS256Challenge(verifier),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    "PKCE must use the RFC 7636 S256 transformation",
  );
  const binding = contract.createGhlMarketplaceOAuthBinding({
    state: rawState,
    codeVerifier: verifier,
    encryptedPkceVerifierRef: verifierRef,
    appId,
    accountId,
    scopes: ["users.write", "contacts.readonly", "users.write"],
    companyId,
    locationId: accountId,
  });
  assert.match(binding.stateHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(binding.scopeFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(binding.pkceMethod, "S256");
  const serializedBinding = JSON.stringify(binding);
  for (const rawValue of [rawState, verifier, appId, accountId, companyId]) {
    assert.equal(serializedBinding.includes(rawValue), false, `binding leaked raw authority value: ${rawValue}`);
  }

  assert.throws(
    () => contract.assertGhlEncryptedReference("plain-token-value"),
    /must_be_opaque_encrypted_reference/,
  );
  assert.throws(
    () => contract.assertGhlSanitizedCredentialMetadata({ nested: { accessToken: "forbidden" } }),
    /raw_credential_field_forbidden:accessToken/,
  );
  assert.doesNotThrow(() => contract.assertGhlSanitizedCredentialMetadata({
    accessCredentialRef: "enc-ref:v1:oauth/access/synthetic-0001",
    accountFingerprint: binding.accountFingerprint,
  }));

  const codeExchange = contract.buildGhlOAuthCodeExchangeContract({
    clientCredentialRef: "enc-ref:v1:oauth/client/synthetic-0001",
    authorizationCodeRef: "enc-ref:v1:oauth/code/synthetic-0001",
    pkceVerifierRef: verifierRef,
    redirectUriRef: "binding:redirect-uri:dealflow-ghl",
  });
  assert.equal(codeExchange.path, "/oauth/token");
  assert.equal(codeExchange.effect, "disabled_contract_only");
  assert.equal(codeExchange.status, "operator_required");
  assert.equal(codeExchange.blockerCode, "ghl_marketplace_inbound_pkce_support_unattested");

  const refresh = contract.buildGhlOAuthRefreshContract({
    clientCredentialRef: "enc-ref:v1:oauth/client/synthetic-0001",
    rotatingRefreshCredentialRef: "enc-ref:v1:oauth/refresh/synthetic-0001",
  });
  assert.equal(refresh.path, "/oauth/token");
  assert.equal(refresh.status, "ready_for_separately_authorized_executor");
  assert.equal(refresh.effect, "disabled_contract_only");

  const locationExchange = contract.buildGhlCompanyToLocationTokenExchangeContract({
    companyAccessCredentialRef: "enc-ref:v1:oauth/company-access/synthetic-0001",
    companyIdRef: "binding:company-id:synthetic-0001",
    locationIdRef: "binding:location-id:synthetic-0001",
  });
  assert.equal(locationExchange.path, "/oauth/location-token");
  assert.equal(locationExchange.method, "POST");
  assert.equal(locationExchange.effect, "disabled_contract_only");

  const createUser = contract.buildGhlRealtorUserOperationContract({
    operation: "user_create",
    accessCredentialRef: "enc-ref:v1:oauth/location-access/synthetic-0001",
    companyIdRef: "binding:company-id:synthetic-0001",
    locationIdRef: "binding:location-id:synthetic-0001",
    realtorProfileRef: "binding:realtor-profile:synthetic-0001",
  });
  assert.deepEqual([createUser.method, createUser.path, createUser.version], ["POST", "/users/", "v3"]);
  const inviteUser = contract.buildGhlRealtorUserOperationContract({
    operation: "user_invite",
    accessCredentialRef: "enc-ref:v1:oauth/location-access/synthetic-0001",
    companyIdRef: "binding:company-id:synthetic-0001",
    locationIdRef: "binding:location-id:synthetic-0001",
  });
  assert.equal(inviteUser.status, "operator_required");
  assert.equal(inviteUser.blockerCode, "ghl_standalone_user_invite_contract_not_documented");
  const revokeUser = contract.buildGhlRealtorUserOperationContract({
    operation: "user_revoke",
    accessCredentialRef: "enc-ref:v1:oauth/location-access/synthetic-0001",
    companyIdRef: "binding:company-id:synthetic-0001",
    locationIdRef: "binding:location-id:synthetic-0001",
    providerUserIdRef: "binding:provider-user-id:synthetic-0001",
  });
  assert.deepEqual([revokeUser.method, revokeUser.path, revokeUser.version], ["DELETE", "/users/:userId", "v3"]);

  assert.deepEqual(contract.GHL_MARKETPLACE_OPERATIONS, [
    "oauth_code_exchange",
    "oauth_refresh",
    "company_to_location_token_exchange",
    "app_install",
    "app_uninstall",
    "user_create",
    "user_invite",
    "user_revoke",
  ]);
  for (const url of Object.values(contract.GHL_MARKETPLACE_DOCUMENTATION)) {
    assert.match(url, /^https:\/\/marketplace\.gohighlevel\.com\/docs\//);
  }
  assert.equal(JSON.stringify({ codeExchange, refresh, locationExchange, createUser, inviteUser, revokeUser }).includes("Bearer "), false);
  console.log("GHL Marketplace OAuth/install pure contract passed (provider effects disabled).\n");
} finally {
  fs.rmSync(buildDir, { recursive: true, force: true });
}
