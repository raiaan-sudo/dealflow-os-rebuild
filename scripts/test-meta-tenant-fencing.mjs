#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

class FakeApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function loadTsModuleWithMocks(file, mocks) {
  const source = fs.readFileSync(file, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const context = {
    module: { exports: {} },
    exports: {},
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier === "node:crypto") return crypto;
      throw new Error(`Unexpected test import: ${specifier}`);
    },
    process: { env: { NODE_ENV: "test" } },
    crypto,
    Buffer,
    Date,
    URL,
    Error,
    console,
  };
  context.exports = context.module.exports;
  vm.runInNewContext(transpiled, context, { filename: file });
  return context.module.exports;
}

const ORG_A = "10000000-0000-4000-8000-000000000001";
const ORG_B = "10000000-0000-4000-8000-000000000002";
const USER_A = "20000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";
const credentials = {
  workspaceId: ORG_A,
  connectionId: "connection-a",
  adAccountId: "act_account-a",
  currency: "USD",
  pageId: "page-a",
  pixelId: "pixel-a",
  accessToken: "offline-redacted-token",
};
const marketingRow = {
  id: "connection-a",
  organization_id: ORG_A,
  platform: "meta_ads",
  external_account_id: "act_account-a",
  access_token_encrypted: "offline-encrypted-token",
  pixel_id: "pixel-a",
  launch_domain: "app.invalid",
  domain_verified: true,
  tracking_status: "configured",
  connection_metadata: {
    selected_external_account_id: "act_account-a",
    selected_page_id: "page-a",
    pixel_id: "pixel-a",
    available_accounts: [
      {
        id: "account-a",
        external_account_id: "act_account-a",
        name: "Account A",
        currency: "USD",
      },
    ],
    available_pages: [{ id: "page-a", name: "Page A" }],
    available_pixels: [{ id: "pixel-a", name: "Pixel A" }],
  },
};
let sessionLookupCount = 0;
let adminLookupCount = 0;
const admin = {
  from(relation) {
    assert.equal(relation, "marketing_accounts");
    const filters = {};
    return {
      select() { return this; },
      eq(key, value) { filters[key] = value; return this; },
      async maybeSingle() {
        adminLookupCount += 1;
        assert.equal(filters.organization_id, ORG_A);
        assert.equal(filters.platform, "meta_ads");
        return { data: marketingRow, error: null };
      },
    };
  },
};
const metaService = loadTsModuleWithMocks("src/lib/integrations/meta/service.ts", {
  "@/lib/api/route": { ApiError: FakeApiError },
  "@/lib/env": { getMetaEnv: () => ({ encryptionKey: "offline-encryption-key" }) },
  "@/lib/integrations/meta/error-mapper": {
    createMetaApiError: () => new FakeApiError(400, "mapped", "mapped"),
    mapMetaError: () => ({ userMessage: "Invalid Meta selection.", recommendedAction: "Reconnect." }),
  },
  "@/lib/integrations/meta-crypto": { decryptSecret: () => "offline-redacted-token" },
  "@/lib/integrations/meta/contract": {
    buildMetaGraphUrl: (path) => `https://graph.invalid/${path}`,
    withMetaBearerToken: (_token, init) => init,
  },
  "@/lib/integrations/meta/request": {
    fetchMetaJson: async (url) => {
      const path = String(url).replace("https://graph.invalid/", "");
      if (path === "me") return { response: { ok: true }, data: { id: "meta-user" } };
      if (path === "act_account-a") {
        return { response: { ok: true }, data: { id: "account-a", account_status: 1, currency: "USD" } };
      }
      if (path === "page-a") return { response: { ok: true }, data: { id: "page-a" } };
      if (path === "act_account-a/adspixels") {
        return { response: { ok: true }, data: { data: [{ id: "pixel-a", name: "Pixel A" }] } };
      }
      throw new Error(`Unexpected offline Meta URL: ${path}`);
    },
  },
  "@/lib/supabase/server": {
    createClient: async () => {
      sessionLookupCount += 1;
      throw new Error("A queue preflight attempted to use a browser session");
    },
  },
  "@/lib/supabase/admin": { createAdminClient: () => admin },
  "@/lib/services/app-context": {
    getAppContext: async () => {
      sessionLookupCount += 1;
      throw new Error("A queue preflight attempted to use app session context");
    },
  },
});

const preflight = await metaService.validateMetaLaunchSelectionsForOrganization({
  organizationId: ORG_A,
  credentials,
  destinationUrl: "https://app.invalid/f/offline-proof",
});
assert.equal(preflight.ready, true, `No-session preflight failed: ${preflight.errors.join(" | ")}`);
assert.equal(sessionLookupCount, 0, "Queue preflight read browser session state");
assert.equal(adminLookupCount, 1, "Queue preflight did not use one exact organization lookup");
await assert.rejects(
  metaService.validateMetaLaunchSelectionsForOrganization({
    organizationId: ORG_B,
    credentials,
    destinationUrl: "https://app.invalid/f/offline-proof",
  }),
  (error) => error?.code === "meta_preflight_actor_mismatch" && error?.status === 403,
  "Wrong-organization queue credentials were not rejected",
);
assert.equal(adminLookupCount, 1, "Wrong-organization denial occurred after a database lookup");

const oauthRows = new Map();
const oauthAdmin = {
  from(relation) {
    assert.equal(relation, "meta_oauth_states");
    return {
      async insert(row) {
        oauthRows.set(row.state_hash, { ...row, consumed: false });
        return { error: null };
      },
    };
  },
  async rpc(name, params) {
    assert.equal(name, "consume_meta_oauth_state");
    const row = oauthRows.get(params.p_state_hash);
    if (
      !row ||
      row.consumed ||
      row.user_id !== params.p_user_id ||
      row.organization_id !== params.p_organization_id ||
      new Date(row.expires_at).getTime() <= Date.now()
    ) {
      return { data: null, error: null };
    }
    row.consumed = true;
    return { data: row.return_to, error: null };
  },
};
const oauthState = loadTsModuleWithMocks("src/lib/integrations/meta/oauth-state.ts", {
  "server-only": {},
  "@/lib/api/route": { ApiError: FakeApiError },
  "@/lib/supabase/admin": { createAdminClient: () => oauthAdmin },
});
const binding = await oauthState.createMetaOAuthStateBinding({
  userId: USER_A,
  organizationId: ORG_A,
  returnTo: "/launch?campaign=offline",
});
await assert.rejects(
  oauthState.consumeMetaOAuthStateBinding({
    state: binding.state,
    userId: USER_A,
    organizationId: ORG_B,
  }),
  (error) => error?.code === "meta_state_invalid",
  "A session switch to another workspace consumed the OAuth state",
);
await assert.rejects(
  oauthState.consumeMetaOAuthStateBinding({
    state: binding.state,
    userId: USER_B,
    organizationId: ORG_A,
  }),
  (error) => error?.code === "meta_state_invalid",
  "A different signed-in user consumed the OAuth state",
);
assert.equal(
  (
    await oauthState.consumeMetaOAuthStateBinding({
      state: binding.state,
      userId: USER_A,
      organizationId: ORG_A,
    })
  ).returnTo,
  "/launch?campaign=offline",
);
await assert.rejects(
  oauthState.consumeMetaOAuthStateBinding({
    state: binding.state,
    userId: USER_A,
    organizationId: ORG_A,
  }),
  (error) => error?.code === "meta_state_invalid",
  "The same OAuth state was replayed",
);

const callbackSource = fs.readFileSync(
  "src/app/api/integrations/meta/callback/route.ts",
  "utf8",
);
const connectSource = fs.readFileSync("src/app/api/integrations/meta/connect/route.ts", "utf8");
const statusSource = fs.readFileSync("src/app/api/integrations/meta/status/route.ts", "utf8");
const oauthMigrationSource = fs.readFileSync(
  "supabase/migrations/20260710235800_harden_meta_oauth_state.sql",
  "utf8",
);
assert.match(connectSource, /userId: auth\.userId/);
assert.match(connectSource, /organizationId: auth\.organizationId/);
assert.match(connectSource, /createMetaOAuthStateBinding/);
assert.match(callbackSource, /consumeMetaOAuthStateBinding/);
assert.match(callbackSource, /userId: auth\.userId/);
assert.match(callbackSource, /organizationId: auth\.organizationId/);
assert.match(callbackSource, /token_expires_at: tokenExpiresAt/);
assert.match(oauthMigrationSource, /add column if not exists token_expires_at timestamptz null/);
assert.match(oauthMigrationSource, /add column if not exists refresh_token_encrypted text null/);
const callbackStart = callbackSource.indexOf("export async function GET");
assert.ok(
  callbackSource.indexOf("await consumeMetaOAuthStateBinding", callbackStart) <
    callbackSource.indexOf("buildMetaTokenExchangeRequest({", callbackStart),
  "OAuth token exchange occurs before the one-time user/workspace state check",
);
const statusCatch = statusSource.slice(statusSource.indexOf("} catch (error)"));
assert.ok(
  statusCatch.indexOf("error.status === 401") <
    statusCatch.indexOf("!validateMetaEnv().configured"),
  "Meta status exposes missing-config success before preserving authentication failure",
);

let statusAuthDenial = 401;
const statusRoute = loadTsModuleWithMocks(
  "src/app/api/integrations/meta/status/route.ts",
  {
    "@/lib/api/route": {
      ApiError: FakeApiError,
      apiSuccess: (data) => ({ status: 200, data }),
      retryRouteStep: async (task) => task(),
      withRouteTimeout: async (task) => task(new AbortController().signal),
    },
    "@/lib/env": {
      validateMetaEnv: () => ({ configured: false, missing: ["META_APP_ID"] }),
    },
    "@/lib/integrations/meta/error-mapper": {
      createMetaFailureResponse: ({ status, error }) => ({
        status,
        code: error?.code ?? null,
      }),
    },
    "@/lib/integrations/meta/service": {
      getDefaultMetaConnectionState: () => ({ tracking: null }),
      getMetaConnectionState: async () => ({ tracking: null }),
    },
    "@/lib/services/authenticated-context": {
      getAuthenticatedContext: async () => {
        throw new FakeApiError(
          statusAuthDenial,
          "Offline authentication denial",
          statusAuthDenial === 401 ? "authentication_required" : "forbidden",
        );
      },
    },
  },
);
for (const denialStatus of [401, 403]) {
  statusAuthDenial = denialStatus;
  const response = await statusRoute.GET();
  assert.equal(
    response.status,
    denialStatus,
    `Meta status must preserve ${denialStatus} even when provider configuration is missing`,
  );
}

const callbackTruth = loadTsModuleWithMocks(
  "src/lib/integrations/meta/callback-truth.ts",
  {},
);
const callbackWrites = [];
const callbackBearerTokens = [];
const deletedCallbackCookies = [];
let encryptedCallbackToken = null;
let callbackAdminCall = 0;
const priorConnectionMetadata = {
  selected_external_account_id: "act_saved-account",
  selected_account_name: "Saved Account",
  selected_page_id: "saved-page",
  selected_page_name: "Saved Page",
  pixel_id: "saved-pixel",
  available_accounts: [{ id: "act_saved-account", name: "Saved Account" }],
  available_pages: [{ id: "saved-page", name: "Saved Page" }],
  available_pixels: [{ id: "saved-pixel", name: "Saved Pixel" }],
  durable_custom_metadata: "preserve-me",
};
const priorMarketingRow = {
  id: "marketing-account-id",
  pixel_id: "saved-pixel",
  name: "Saved Account",
  account_name: "Saved Account",
  external_account_id: "act_saved-account",
  connection_metadata: priorConnectionMetadata,
};
const callbackAdmin = {
  from(relation) {
    assert.equal(relation, "marketing_accounts");
    callbackAdminCall += 1;
    const call = callbackAdminCall;
    const builder = {
      select() { return this; },
      eq() { return this; },
      update(payload) {
        callbackWrites.push(payload);
        return this;
      },
      insert(payload) {
        callbackWrites.push(payload);
        return this;
      },
      async maybeSingle() {
        if (call === 1) {
          return { data: priorMarketingRow, error: null };
        }

        return {
          data: {
            ...priorMarketingRow,
            connection_metadata:
              callbackWrites[callbackWrites.length - 1]?.connection_metadata ??
              priorConnectionMetadata,
          },
          error: null,
        };
      },
    };
    return builder;
  },
};
const callbackRoute = loadTsModuleWithMocks(
  "src/app/api/integrations/meta/callback/route.ts",
  {
    "next/headers": {
      cookies: async () => ({
        get(name) {
          if (name === "dealflow_meta_oauth_state") return { value: "saved-state" };
          return undefined;
        },
        delete(name) {
          deletedCallbackCookies.push(name);
        },
      }),
    },
    "next/server": {
      NextResponse: {
        redirect(url) {
          return { status: 307, url: String(url) };
        },
      },
    },
    "@/lib/env": {
      getMetaEnvOrThrow: () => ({
        appId: "offline-app-id",
        appSecret: "offline-app-secret",
        redirectUri: "https://app.invalid/api/integrations/meta/callback",
        encryptionKey: "offline-encryption-key",
      }),
      getPublicAppUrl: () => "https://app.invalid",
    },
    "@/lib/debug": { debugLog: () => undefined },
    "@/lib/integrations/meta-crypto": {
      encryptSecret(token) {
        encryptedCallbackToken = token;
        return "encrypted-long-lived-token";
      },
    },
    "@/lib/integrations/meta/contract": {
      buildMetaGraphUrl: (path) => `graph:${path}`,
      buildMetaTokenExchangeRequest: ({ kind }) => ({
        url: `token:${kind}`,
        init: { method: "POST" },
      }),
      resolveMetaReturnUrl: (value, appUrl) => new URL(value ?? "/launch", appUrl),
      withMetaBearerToken: (token, init = {}) => {
        callbackBearerTokens.push(token);
        return init;
      },
    },
    "@/lib/integrations/meta/callback-truth": callbackTruth,
    "@/lib/integrations/meta/oauth-state": {
      consumeMetaOAuthStateBinding: async () => ({
        returnTo: "/launch?campaignId=offline-campaign",
      }),
      metaOAuthStateMatches: () => true,
    },
    "@/lib/integrations/meta/request": {
      fetchMetaJson: async (url) => {
        if (url === "token:authorization_code") {
          return {
            response: { ok: true },
            data: {
              access_token: "short-lived-token",
              expires_in: 3_600,
              token_type: "bearer",
            },
          };
        }
        if (url === "token:long_lived_token") {
          return {
            response: { ok: true },
            data: {
              access_token: "long-lived-token",
              expires_in: 5_184_000,
              token_type: "bearer",
            },
          };
        }
        if (url === "graph:me/adaccounts") {
          throw new Error("offline ad-account discovery interruption");
        }
        if (url === "graph:me/accounts") {
          return {
            response: { ok: true },
            data: { data: [{ id: "saved-page", name: "Saved Page Refreshed" }] },
          };
        }
        throw new Error(`Unexpected callback request: ${url}`);
      },
    },
    "@/lib/integrations/meta/error-mapper": {
      logMetaError: () => undefined,
      logMetaWarning: () => undefined,
    },
    "@/lib/supabase/admin": { createAdminClient: () => callbackAdmin },
    "@/lib/services/authenticated-context": {
      getAuthenticatedContext: async () => ({
        userId: USER_A,
        organizationId: ORG_A,
      }),
    },
  },
);
const callbackResponse = await callbackRoute.GET({
  nextUrl: new URL(
    "https://app.invalid/api/integrations/meta/callback?code=offline-code&state=saved-state",
  ),
});
assert.equal(callbackResponse.status, 307);
assert.equal(
  new URL(callbackResponse.url).searchParams.get("meta_warning"),
  "asset_discovery_incomplete",
);
assert.equal(encryptedCallbackToken, "long-lived-token");
assert.deepEqual(callbackBearerTokens, ["long-lived-token", "long-lived-token"]);
assert.deepEqual(
  deletedCallbackCookies.sort(),
  ["dealflow_meta_oauth_return_to", "dealflow_meta_oauth_state"],
);
assert.equal(callbackWrites.length, 2, "callback must persist connecting and final truth states");
assert.equal(callbackWrites[0].status, "connecting");
assert.equal(callbackWrites[1].status, "partial");
assert.equal(callbackWrites[1].external_account_id, "act_saved-account");
assert.equal(callbackWrites[1].pixel_id, "saved-pixel");
assert.equal(
  callbackWrites[1].connection_metadata.durable_custom_metadata,
  "preserve-me",
);
assert.equal(
  JSON.stringify(callbackWrites[1].connection_metadata.available_accounts),
  JSON.stringify(priorConnectionMetadata.available_accounts),
);
assert.equal(
  JSON.stringify(callbackWrites[1].connection_metadata.available_pixels),
  JSON.stringify(priorConnectionMetadata.available_pixels),
);
assert.equal(
  callbackWrites[1].connection_metadata.selected_page_name,
  "Saved Page Refreshed",
);
assert.ok(
  Number.isFinite(new Date(callbackWrites[1].token_expires_at).getTime()),
  "long-lived token expiry must be persisted",
);

console.log(
  "PASS Meta tenant fencing: org preflight, OAuth binding, 401/403 preservation, and callback reconnect truth",
);
