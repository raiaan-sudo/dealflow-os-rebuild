#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "dealflow-ghl-runtime-contract-"));
const tsc = path.join(root, "node_modules", ".bin", "tsc");
const source = "src/lib/integrations/gohighlevel/marketplace-runtime-contract.ts";
const runtimeServiceSource = fs.readFileSync(
  path.join(root, "src/lib/services/ghl-marketplace-runtime-service.ts"),
  "utf8",
);
const credentialResolverSource = fs.readFileSync(
  path.join(root, "src/lib/services/ghl-marketplace-credential-resolver.ts"),
  "utf8",
);

try {
  assert.match(
    runtimeServiceSource,
    /export function getGhlMarketplaceWebhookConfig\([\s\S]*?GHL_MARKETPLACE_APP_ID[\s\S]*?return Object\.freeze\(\{ appId \}\);/,
    "signed Marketplace lifecycle webhooks must require only the immutable app identity",
  );
  assert.match(
    runtimeServiceSource,
    /acceptGhlMarketplaceRuntimeEvent\([\s\S]*?const config = getGhlMarketplaceWebhookConfig\(\);/,
    "Marketplace lifecycle ingestion must not require outbound OAuth credentials",
  );
  assert.doesNotMatch(
    runtimeServiceSource,
    /acceptGhlMarketplaceRuntimeEvent\([\s\S]{0,400}?getGhlMarketplaceApplicationConfig\(\)/,
    "Marketplace lifecycle ingestion must remain decoupled from OAuth client secrets",
  );
  assert.match(
    credentialResolverSource,
    /ghl-marketplace-token-set:\(\[0-9a-f\]\{8\}/,
    "Marketplace credentials must use an opaque, exact token-set reference",
  );
  assert.match(
    credentialResolverSource,
    /ghl_marketplace_token_sets[\s\S]*subject_kind", "location"[\s\S]*status", "active"/,
    "Marketplace credentials must resolve only from one active location token set",
  );
  assert.match(
    credentialResolverSource,
    /ghl_marketplace_authorities[\s\S]*environment", input\.providerEnvironment[\s\S]*status", "active"/,
    "Marketplace credentials must remain bound to an active authority in the exact provider environment",
  );
  assert.match(
    credentialResolverSource,
    /resolve_ghl_marketplace_credential_v2[\s\S]*decryptGhlMarketplaceCredential/,
    "Marketplace credentials must remain encrypted until the bounded provider callback",
  );

  const compile = spawnSync(tsc, [
    "--pretty", "false", "--target", "ES2022", "--module", "commonjs",
    "--moduleResolution", "node", "--strict", "--esModuleInterop", "--skipLibCheck",
    "--rootDir", "src", "--outDir", buildDir, source,
  ], { cwd: root, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(compile.status, 0, `GHL runtime contract compilation failed:\n${compile.stdout}${compile.stderr}`);
  const require = createRequire(import.meta.url);
  const runtime = require(path.join(buildDir, "lib", "integrations", "gohighlevel", "marketplace-runtime-contract.js"));
  const oauth = require(path.join(buildDir, "lib", "integrations", "gohighlevel", "marketplace-oauth-contract.js"));

  assert.equal(runtime.normalizeGhlMarketplaceReturnPath("/settings?tab=integrations"), "/settings?tab=integrations");
  for (const bad of ["//evil.example/x", "https://evil.example", "/ok\\evil"]) {
    assert.throws(() => runtime.normalizeGhlMarketplaceReturnPath(bad), /return_path_invalid/);
  }
  assert.equal(runtime.assertGhlMarketplaceInstallUrl("https://marketplace.gohighlevel.com/oauth/chooselocation").hostname, "marketplace.gohighlevel.com");
  assert.throws(() => runtime.assertGhlMarketplaceInstallUrl("https://gohighlevel.com.evil.example/x"), /not_allowlisted/);

  const installBody = JSON.stringify({
    type: "INSTALL", appId: "synthetic_app_001", companyId: "synthetic_company_001",
    webhookId: "install_event_001", timestamp: "2026-07-17T00:00:00.000Z",
  });
  const install = runtime.parseGhlMarketplaceLifecycleEvent(installBody, "synthetic_app_001");
  assert.equal(install.identifiersComplete, true);
  assert.equal(install.installScope, "company");
  assert.match(install.eventFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(install).includes("synthetic_company_001"), false);
  assert.equal(
    runtime.parseGhlMarketplaceLifecycleEvent(installBody, "synthetic_app_001").eventFingerprint,
    install.eventFingerprint,
    "exact duplicate events must have deterministic identity",
  );
  assert.throws(() => runtime.parseGhlMarketplaceLifecycleEvent(installBody, "other_app_001"), /app_mismatch/);

  for (const type of ["UPDATE", "UNINSTALL", "LocationCreate", "LocationUpdate"]) {
    const event = runtime.parseGhlMarketplaceLifecycleEvent(JSON.stringify({
      type, appId: "synthetic_app_001", companyId: "synthetic_company_001",
      locationId: type.startsWith("Location") ? "synthetic_location_001" : undefined,
      webhookId: `event_${type}_001`,
    }), "synthetic_app_001");
    assert.equal(event.identifiersComplete, true, `${type} must retain complete hash-only authority identity`);
  }
  const user = runtime.parseGhlMarketplaceLifecycleEvent(JSON.stringify({
    type: "UserCreate", appId: "synthetic_app_001", companyId: "synthetic_company_001",
    locationId: "synthetic_location_001", id: "synthetic_user_001", email: "user@example.test",
  }), "synthetic_app_001");
  assert.equal(user.identifiersComplete, true);
  assert.equal(user.rawUserEmail, "user@example.test");
  assert.equal(user.emailFingerprint.startsWith("sha256:"), true);

  const companyTokenJson = {
    accessToken: "access-token-value-at-least-twenty-characters",
    refreshToken: "refresh-token-value-at-least-twenty-characters",
    tokenType: "Bearer", expiresIn: 86400,
    scope: "users.write contacts.readonly locations.write snapshots.readonly",
    userType: "Company", companyId: "synthetic_company_001", userId: "synthetic_user_001",
    approvedLocations: ["synthetic_location_002", "synthetic_location_001"],
  };
  const companyToken = runtime.parseGhlMarketplaceTokenResponse(companyTokenJson);
  assert.equal(companyToken.locationId, null);
  assert.deepEqual(companyToken.scopes, [
    "contacts.readonly", "locations.write", "snapshots.readonly", "users.write",
  ]);
  const locationTokenJson = {
    ...companyTokenJson,
    scope: "users.write contacts.readonly oauth.readonly oauth.write",
    userType: "Location",
    locationId: "synthetic_location_001",
  };
  const locationToken = runtime.parseGhlMarketplaceTokenResponse(locationTokenJson);
  assert.equal(locationToken.locationId, "synthetic_location_001");
  assert.deepEqual(runtime.expectedGhlMarketplaceLocationTokenScopes(companyToken.scopes), [
    "contacts.readonly", "oauth.readonly", "oauth.write", "users.write",
  ]);
  assert.throws(() => runtime.parseGhlMarketplaceTokenResponse({ ...companyTokenJson, locationId: "synthetic_location_001" }), /response_invalid/);
  assert.throws(() => runtime.parseGhlMarketplaceTokenResponse({ ...locationTokenJson, locationId: undefined }), /response_invalid/);
  assert.equal(runtime.assertGhlMarketplaceTokenBinding({
    token: locationToken, expectedUserType: "Location",
    expectedCompanyFingerprint: oauth.fingerprintGhlAuthorityValue("synthetic_company_001"),
    expectedLocationFingerprint: oauth.fingerprintGhlAuthorityValue("synthetic_location_001"),
    expectedScopeFingerprint: oauth.fingerprintGhlScopes(
      runtime.expectedGhlMarketplaceLocationTokenScopes(companyToken.scopes),
    ),
  }), true);
  assert.throws(() => runtime.assertGhlMarketplaceTokenBinding({
    token: runtime.parseGhlMarketplaceTokenResponse({
      ...locationTokenJson,
      scope: `${locationTokenJson.scope} opportunities.write`,
    }),
    expectedUserType: "Location",
    expectedCompanyFingerprint: oauth.fingerprintGhlAuthorityValue("synthetic_company_001"),
    expectedLocationFingerprint: oauth.fingerprintGhlAuthorityValue("synthetic_location_001"),
    expectedScopeFingerprint: oauth.fingerprintGhlScopes(
      runtime.expectedGhlMarketplaceLocationTokenScopes(companyToken.scopes),
    ),
  }), /tenant_binding_mismatch/);
  assert.throws(() => runtime.assertGhlMarketplaceTokenBinding({
    token: locationToken, expectedUserType: "Location",
    expectedCompanyFingerprint: oauth.fingerprintGhlAuthorityValue("wrong_company_001"),
    expectedLocationFingerprint: oauth.fingerprintGhlAuthorityValue("synthetic_location_001"),
    expectedScopeFingerprint: oauth.fingerprintGhlScopes(locationToken.scopes),
  }), /tenant_binding_mismatch/);

  const key = Buffer.alloc(32, 7).toString("base64url");
  const credential = "secret-credential-material-at-least-twenty-characters";
  const encrypted = runtime.encryptGhlMarketplaceCredential({
    credential, encodedKey: key, keyVersion: 3, purpose: "refresh",
    id: "10000000-0000-4000-8000-000000000001", iv: Buffer.alloc(12, 9),
  });
  assert.equal(JSON.stringify(encrypted).includes(credential), false);
  assert.equal(runtime.decryptGhlMarketplaceCredential(encrypted.envelope, key), credential);
  assert.throws(() => runtime.decryptGhlMarketplaceCredential({ ...encrypted.envelope, tag: Buffer.alloc(16).toString("base64url") }, key));

  assert.throws(() => new runtime.GhlMarketplaceOAuthClient({ effects: "disabled" }), /provider_effects_disabled/);
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    const parsedBody = init.headers["Content-Type"] === "application/x-www-form-urlencoded"
      ? Object.fromEntries(new URLSearchParams(init.body))
      : JSON.parse(init.body);
    const requestUserType = parsedBody.userType ?? "Location";
    return new Response(JSON.stringify(requestUserType === "Company" ? companyTokenJson : locationTokenJson), {
      status: 200, headers: { "content-type": "application/json", "x-request-id": "synthetic-request-id" },
    });
  };
  const client = new runtime.GhlMarketplaceOAuthClient({ effects: "synthetic_test", fetcher });
  await client.exchangeAuthorizationCode({
    clientId: "synthetic_client", clientSecret: "synthetic-client-secret-long-value",
    code: "synthetic_authorization_code_001", userType: "Location",
    redirectUri: "https://staging.example.test/callback",
  });
  await client.refresh({
    clientId: "synthetic_client", clientSecret: "synthetic-client-secret-long-value",
    refreshToken: companyToken.refreshToken, userType: "Company",
    redirectUri: "https://staging.example.test/callback",
  });
  await client.exchangeCompanyTokenForLocation({
    companyAccessToken: companyToken.accessToken,
    companyId: companyToken.companyId,
    locationId: "synthetic_location_001",
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "https://services.leadconnectorhq.com/oauth/token");
  assert.equal(calls[0].init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[0].init.body)), {
    clientId: "synthetic_client",
    clientSecret: "synthetic-client-secret-long-value",
    grantType: "authorization_code",
    code: "synthetic_authorization_code_001",
    userType: "Location",
    redirectUri: "https://staging.example.test/callback",
  });
  assert.equal(calls[1].init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[1].init.body)), {
    clientId: "synthetic_client",
    clientSecret: "synthetic-client-secret-long-value",
    grantType: "refresh_token",
    refreshToken: companyToken.refreshToken,
    userType: "Company",
    redirectUri: "https://staging.example.test/callback",
  });
  assert.equal(calls[2].url, "https://services.leadconnectorhq.com/oauth/location-token");
  assert.equal(calls[2].init.method, "POST");
  assert.equal(calls[2].init.headers.Version, "v3");
  assert.equal(calls[2].init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[2].init.body), {
    companyId: "synthetic_company_001", locationId: "synthetic_location_001",
  });
  assert.equal(calls[2].init.redirect, "error");

  let transportCalls = 0;
  const failing = new runtime.GhlMarketplaceOAuthClient({
    effects: "synthetic_test",
    fetcher: async () => { transportCalls += 1; throw new TypeError("synthetic transport failure"); },
  });
  await assert.rejects(() => failing.refresh({
    clientId: "synthetic_client", clientSecret: "synthetic-client-secret-long-value",
    refreshToken: companyToken.refreshToken, userType: "Company", redirectUri: "https://staging.example.test/callback",
  }), (error) => error.code === "ghl_oauth_transport_ambiguous" && error.uncertain === true);
  assert.equal(transportCalls, 1, "rotating credentials must never be blindly retried");

  const malformedSuccess = new runtime.GhlMarketplaceOAuthClient({
    effects: "synthetic_test",
    fetcher: async () => new Response(JSON.stringify({ accessToken: "incomplete" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });
  await assert.rejects(() => malformedSuccess.refresh({
    clientId: "synthetic_client", clientSecret: "synthetic-client-secret-long-value",
    refreshToken: companyToken.refreshToken, userType: "Company",
    redirectUri: "https://staging.example.test/callback",
  }), (error) =>
    error.code === "ghl_oauth_refresh_response_ambiguous"
      && error.status === 200
      && error.uncertain === true,
  "a successful rotating response with invalid replacement credentials must be fenced as ambiguous");

  const oversizedSuccess = new runtime.GhlMarketplaceOAuthClient({
    effects: "synthetic_test",
    fetcher: async () => new Response("x".repeat(300 * 1024), { status: 200 }),
  });
  await assert.rejects(() => oversizedSuccess.refresh({
    clientId: "synthetic_client", clientSecret: "synthetic-client-secret-long-value",
    refreshToken: companyToken.refreshToken, userType: "Company",
    redirectUri: "https://staging.example.test/callback",
  }), (error) =>
    error.code === "ghl_oauth_response_too_large"
      && error.status === 200
      && error.uncertain === true,
  "an oversized successful rotating response must be fenced as ambiguous");

  console.log("GHL Marketplace runtime pure contract: PASS (zero live provider effects).\n");
} finally {
  fs.rmSync(buildDir, { recursive: true, force: true });
}
