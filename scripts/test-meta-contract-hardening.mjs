import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const contractPath = path.join(root, "src/lib/integrations/meta/contract.ts");
const contractSource = fs.readFileSync(contractPath, "utf8");
const connectRouteSource = fs.readFileSync(
  path.join(root, "src/app/api/integrations/meta/connect/route.ts"),
  "utf8",
);
assert.match(connectRouteSource, /"leads_retrieval"/);
assert.match(connectRouteSource, /"pages_manage_metadata"/);
assert.match(connectRouteSource, /resolveMetaOAuthScopes\(env\.scopes\)/);
assert.match(connectRouteSource, /missing\.length > 0/);
const transpiledContract = ts.transpileModule(contractSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: contractPath,
}).outputText;

const moduleShim = { exports: {} };
const context = vm.createContext({
  Headers,
  URL,
  URLSearchParams,
  exports: moduleShim.exports,
  module: moduleShim,
  process: { env: {} },
});
vm.runInContext(transpiledContract, context, {
  filename: "meta-contract.compiled.cjs",
});

const contract = moduleShim.exports;
const sentinelToken = "offline-test-token-never-send";
const sentinelSecret = "offline-test-secret-never-send";

const callbackTruthPath = path.join(
  root,
  "src/lib/integrations/meta/callback-truth.ts",
);
const callbackTruthSource = fs.readFileSync(callbackTruthPath, "utf8");
const callbackTruthTranspiled = ts.transpileModule(callbackTruthSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: callbackTruthPath,
}).outputText;
const callbackTruthModule = { exports: {} };
vm.runInContext(
  callbackTruthTranspiled,
  vm.createContext({
    exports: callbackTruthModule.exports,
    module: callbackTruthModule,
  }),
  { filename: "meta-callback-truth.compiled.cjs" },
);
const callbackTruth = callbackTruthModule.exports;

assert.equal(
  callbackTruth.preserveMetaSelection({
    discoveryStatus: "failed",
    previousId: "saved-account",
    discoveredIds: [],
  }),
  "saved-account",
  "failed discovery must not erase a previously valid selection",
);
assert.equal(
  callbackTruth.preserveMetaSelection({
    discoveryStatus: "success",
    previousId: "removed-account",
    discoveredIds: ["current-account"],
  }),
  null,
  "successful discovery may clear a selection that is proven unavailable",
);
assert.equal(
  JSON.stringify(
    callbackTruth.preserveMetaAssetList({
      discoveryStatus: "failed",
      discovered: [],
      previous: [{ id: "saved-page" }],
    }),
  ),
  JSON.stringify([{ id: "saved-page" }]),
  "failed discovery must preserve the prior asset list",
);
assert.equal(
  callbackTruth.deriveMetaCallbackConnectionTruth({
    accountsStatus: "success",
    pagesStatus: "success",
    pixelsStatus: "success",
    selectedAccountId: "account",
    selectedPageId: "page",
    selectedPixelId: "pixel",
  }).status,
  "connected",
);
assert.equal(
  callbackTruth.deriveMetaCallbackConnectionTruth({
    accountsStatus: "failed",
    pagesStatus: "success",
    pixelsStatus: "skipped",
    selectedAccountId: "saved-account",
    selectedPageId: "saved-page",
    selectedPixelId: "saved-pixel",
  }).status,
  "partial",
  "a token alone or incomplete discovery must not be represented as connected",
);

assert.equal(contract.META_GRAPH_API_VERSION, "v23.0");

const graphUrl = contract.buildMetaGraphUrl("me/adaccounts", {
  fields: "id,name",
  limit: 25,
});
assert.equal(graphUrl.origin, "https://graph.facebook.com");
assert.equal(graphUrl.pathname, "/v23.0/me/adaccounts");
assert.equal(graphUrl.searchParams.get("fields"), "id,name");
assert.equal(graphUrl.searchParams.get("limit"), "25");
assert.doesNotMatch(graphUrl.href, /access_token|fb_exchange_token/i);

assert.throws(
  () => contract.buildMetaGraphUrl("me", { access_token: sentinelToken }),
  /credentials must not be placed in URL/i,
);
assert.throws(
  () => contract.buildMetaGraphUrl("oauth/access_token", {
    fb_exchange_token: sentinelToken,
  }),
  /credentials must not be placed in URL/i,
);

const authenticatedInit = contract.withMetaBearerToken(sentinelToken, {
  headers: { "Content-Type": "application/json" },
});
const authenticatedHeaders = new Headers(authenticatedInit.headers);
assert.equal(authenticatedHeaders.get("Authorization"), `Bearer ${sentinelToken}`);
assert.equal(authenticatedHeaders.get("Content-Type"), "application/json");
assert.doesNotMatch(graphUrl.href, new RegExp(sentinelToken));

const codeExchange = contract.buildMetaTokenExchangeRequest({
  kind: "authorization_code",
  clientId: "offline-client-id",
  clientSecret: sentinelSecret,
  redirectUri: "https://app.agentdealflow.io/api/integrations/meta/callback",
  code: "offline-authorization-code",
});
assert.equal(codeExchange.url.pathname, "/v23.0/oauth/access_token");
assert.equal(codeExchange.init.method, "POST");
assert.doesNotMatch(codeExchange.url.href, /offline-client-id|offline-test-secret|authorization-code/);
assert.equal(codeExchange.init.body.get("client_secret"), sentinelSecret);
assert.equal(codeExchange.init.body.get("code"), "offline-authorization-code");

const longLivedExchange = contract.buildMetaTokenExchangeRequest({
  kind: "long_lived_token",
  clientId: "offline-client-id",
  clientSecret: sentinelSecret,
  accessToken: sentinelToken,
});
assert.equal(longLivedExchange.init.body.get("grant_type"), "fb_exchange_token");
assert.equal(longLivedExchange.init.body.get("fb_exchange_token"), sentinelToken);
assert.doesNotMatch(longLivedExchange.url.href, new RegExp(sentinelToken));

const oauthUrl = contract.buildMetaOAuthDialogUrl({
  clientId: "offline-client-id",
  redirectUri: "https://app.agentdealflow.io/api/integrations/meta/callback",
  state: "offline-state",
  scopes: ["ads_management", "ads_read"],
});
assert.equal(oauthUrl.pathname, "/v23.0/dialog/oauth");
assert.equal(
  oauthUrl.searchParams.get("redirect_uri"),
  "https://app.agentdealflow.io/api/integrations/meta/callback",
);
assert.equal(oauthUrl.searchParams.get("scope"), "ads_management,ads_read");
assert.equal(oauthUrl.searchParams.get("response_type"), "code");
assert.equal(oauthUrl.searchParams.get("state"), "offline-state");
assert.doesNotMatch(oauthUrl.href, /access_token|fb_exchange_token/i);

const appUrl = "https://app.agentdealflow.io";
assert.equal(
  contract.resolveMetaReturnUrl("/launch?step=meta", appUrl).href,
  "https://app.agentdealflow.io/launch?step=meta",
);
assert.equal(
  contract.resolveMetaReturnUrl("https://attacker.invalid/callback", appUrl).href,
  "https://app.agentdealflow.io/launch",
);
assert.equal(
  contract.resolveMetaReturnUrl("//attacker.invalid/callback", appUrl).href,
  "https://app.agentdealflow.io/launch",
);
assert.equal(
  contract.resolveMetaReturnUrl(null, appUrl).href,
  "https://app.agentdealflow.io/launch",
);

assert.equal(contract.isMetaLiveWriteAllowed({}), false);
assert.equal(contract.isMetaLiveWriteAllowed({ ALLOW_META_LIVE_LAUNCH: "false" }), false);
assert.equal(contract.isMetaLiveWriteAllowed({ ALLOW_META_LIVE_LAUNCH: "TRUE" }), false);
assert.equal(contract.isMetaLiveWriteAllowed({ ALLOW_META_LIVE_LAUNCH: "true" }), true);
assert.equal(contract.isMetaCapiWriteAllowed({}), false);
assert.equal(contract.isMetaCapiWriteAllowed({ ALLOW_META_CAPI_EVENTS: "false" }), false);
assert.equal(contract.isMetaCapiWriteAllowed({ ALLOW_META_CAPI_EVENTS: "true" }), true);

const requestPath = path.join(root, "src/lib/integrations/meta/request.ts");
const requestSource = fs.readFileSync(requestPath, "utf8");
const transpiledRequest = ts.transpileModule(requestSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: requestPath,
}).outputText;
const requestModuleShim = { exports: {} };
let providerFetchCount = 0;
class OfflineApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const requestContext = vm.createContext({
  AbortController,
  Error,
  Request,
  Response,
  URL,
  clearTimeout,
  exports: requestModuleShim.exports,
  fetch: async () => {
    providerFetchCount += 1;
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
  module: requestModuleShim,
  require: (specifier) => {
    if (specifier === "@/lib/api/route") {
      return { ApiError: OfflineApiError };
    }
    if (specifier === "@/lib/integrations/meta/contract") {
      return contract;
    }
    if (specifier === "@/lib/logging") {
      return { logWarn: () => undefined };
    }
    throw new Error(`Unexpected offline test import: ${specifier}`);
  },
  setTimeout,
});
vm.runInContext(transpiledRequest, requestContext, {
  filename: "meta-request.compiled.cjs",
});

await assert.rejects(
  () =>
    requestModuleShim.exports.fetchMetaResponse(
      contract.buildMetaGraphUrl("act_offline/campaigns"),
      { purpose: "launch_create", method: "POST" },
    ),
  (error) => error?.code === "meta_live_launch_disabled" && error?.status === 403,
);
await assert.rejects(
  () =>
    requestModuleShim.exports.fetchMetaResponse(
      contract.buildMetaGraphUrl("offline-pixel/events"),
      { purpose: "conversion", method: "POST" },
    ),
  (error) => error?.code === "meta_capi_events_disabled" && error?.status === 403,
);
assert.equal(providerFetchCount, 0, "default-off provider writes stop before fetch");

await requestModuleShim.exports.fetchMetaResponse(
  contract.buildMetaGraphUrl("me", { fields: "id" }),
  { purpose: "discovery", method: "GET" },
);
assert.equal(providerFetchCount, 1, "read-only discovery remains available");
await assert.rejects(
  () =>
    requestModuleShim.exports.fetchMetaResponse(
      `https://graph.facebook.com/v23.0/me?access_token=${sentinelToken}`,
      { purpose: "discovery", method: "GET" },
    ),
  /credentials must not be placed in URL/i,
);
assert.equal(providerFetchCount, 1, "credential-bearing URLs stop before fetch");

providerFetchCount = 0;
requestContext.fetch = async () => {
  providerFetchCount += 1;
  return new Response('{"error":{"message":"upstream uncertain"}}', {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
};
await assert.rejects(
  () =>
    requestModuleShim.exports.fetchMetaResponse(
      contract.buildMetaGraphUrl("oauth/access_token"),
      { purpose: "oauth_code_exchange", method: "POST", retryDelayMs: 0 },
    ),
  (error) => error?.code === "meta_oauth_code_exchange_ambiguous",
);
assert.equal(providerFetchCount, 1, "one-time authorization code was retried after a 5xx");

providerFetchCount = 0;
requestContext.fetch = async () => {
  providerFetchCount += 1;
  throw new TypeError("offline simulated network ambiguity");
};
await assert.rejects(
  () =>
    requestModuleShim.exports.fetchMetaResponse(
      contract.buildMetaGraphUrl("oauth/access_token"),
      { purpose: "oauth_code_exchange", method: "POST", retryDelayMs: 0 },
    ),
  (error) => error?.code === "meta_oauth_code_exchange_ambiguous",
);
assert.equal(providerFetchCount, 1, "one-time authorization code was retried after transport ambiguity");

providerFetchCount = 0;
requestContext.fetch = async () => {
  providerFetchCount += 1;
  return new Response("{}", {
    status: providerFetchCount === 1 ? 500 : 200,
    headers: { "Content-Type": "application/json" },
  });
};
const tokenExtensionResponse = await requestModuleShim.exports.fetchMetaResponse(
  contract.buildMetaGraphUrl("oauth/access_token"),
  { purpose: "oauth_token_extension", method: "POST", retryDelayMs: 0 },
);
assert.equal(tokenExtensionResponse.status, 200);
assert.equal(providerFetchCount, 2, "long-lived token extension did not use its bounded retry");

const metaIntegrationDirectory = path.join(root, "src/lib/integrations/meta");
const ownedSourcePaths = [
  ...fs
    .readdirSync(metaIntegrationDirectory)
    .filter((name) => name.endsWith(".ts") && name !== "contract.ts")
    .map((name) => path.join(metaIntegrationDirectory, name)),
  path.join(root, "src/lib/services/meta-ads-service.ts"),
  path.join(root, "src/lib/services/meta-launch-service.ts"),
  path.join(root, "src/app/api/integrations/meta/connect/route.ts"),
  path.join(root, "src/app/api/integrations/meta/callback/route.ts"),
  path.join(root, "src/app/api/campaigns/create/route.ts"),
];

for (const sourcePath of ownedSourcePaths) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const relativePath = path.relative(root, sourcePath);

  assert.doesNotMatch(
    source,
    /^.*https:\/\/(?:graph|www)\.facebook\.com\/v\d+\.\d+.*$/m,
    `${relativePath} bypasses the centralized Meta version contract`,
  );
  assert.doesNotMatch(
    source,
    /(?:searchParams\.set\(\s*["']access_token["']|[?&](?:access_token|fb_exchange_token)=)/i,
    `${relativePath} places a Meta token in a URL`,
  );
  assert.doesNotMatch(
    source,
    /\bv(?:18|19|20|21|22|23)\.0\b/,
    `${relativePath} contains a Meta API version outside the central contract`,
  );
}

const directFetchCallers = ownedSourcePaths
  .filter((sourcePath) => /\bfetch\s*\(/.test(fs.readFileSync(sourcePath, "utf8")))
  .map((sourcePath) => path.relative(root, sourcePath));
assert.deepEqual(directFetchCallers, ["src/lib/integrations/meta/request.ts"]);

const executionSource = fs.readFileSync(
  path.join(root, "src/lib/integrations/meta/execution.ts"),
  "utf8",
);
const launchSource = fs.readFileSync(
  path.join(root, "src/lib/services/meta-launch-service.ts"),
  "utf8",
);
const conversionSource = fs.readFileSync(
  path.join(root, "src/lib/integrations/meta/conversions.ts"),
  "utf8",
);
assert.match(executionSource, /assertMetaLiveWriteEnabled\(\);/);
assert.match(launchSource, /assertMetaLiveWriteEnabled\(\);/);
assert.match(conversionSource, /if \(!isMetaCapiWriteAllowed\(\)\)/);

const routeTimeoutSource = fs.readFileSync(
  path.join(root, "src/lib/api/route.ts"),
  "utf8",
);
const metaStatusSource = fs.readFileSync(
  path.join(root, "src/app/api/integrations/meta/status/route.ts"),
  "utf8",
);
const metaServiceSource = fs.readFileSync(
  path.join(root, "src/lib/integrations/meta/service.ts"),
  "utf8",
);
assert.match(routeTimeoutSource, /task: \(signal: AbortSignal\) => Promise<T>/);
assert.match(routeTimeoutSource, /controller\.abort\(\)/);
assert.match(metaStatusSource, /withRouteTimeout\(\s*\(signal\) =>/);
assert.match(metaServiceSource, /query\.abortSignal\(signal\)/);

const callbackRouteSource = fs.readFileSync(
  path.join(root, "src/app/api/integrations/meta/callback/route.ts"),
  "utf8",
);
const shortLivedExchangeIndex = callbackRouteSource.indexOf(
  'kind: "authorization_code"',
);
const longLivedExchangeIndex = callbackRouteSource.indexOf(
  'kind: "long_lived_token"',
  shortLivedExchangeIndex,
);
const encryptedTokenIndex = callbackRouteSource.indexOf(
  "encryptSecret(access_token",
  longLivedExchangeIndex,
);
assert.ok(
  shortLivedExchangeIndex >= 0 &&
    longLivedExchangeIndex > shortLivedExchangeIndex &&
    encryptedTokenIndex > longLivedExchangeIndex,
  "callback must exchange for a long-lived token before encrypting and persisting it",
);
assert.match(callbackRouteSource, /token_expires_at: tokenExpiresAt/);
assert.match(callbackRouteSource, /status: "connecting"/);
assert.match(callbackRouteSource, /status: connectionStatus/);
assert.match(callbackRouteSource, /\.\.\.existingMetadata/);
assert.match(callbackRouteSource, /purpose: "oauth_code_exchange"/);
assert.match(callbackRouteSource, /purpose: "oauth_token_extension"/);

console.log("Meta contract hardening test passed (offline; no provider requests executed).");
