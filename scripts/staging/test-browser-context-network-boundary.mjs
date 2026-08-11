#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "@playwright/test";

import {
  exactVercelAutomationProtectionPortfolio,
  installBrowserContextNetworkBoundary,
  isExactLocalNextDevelopmentWebSocket,
  isExpectedWebKitTurnstileTestWidgetConsoleError,
  primeVercelAutomationBypassCookies,
  scopedStagingAccessHeaders,
  safeHttpEvidenceTarget,
  safeWebSocketEvidenceTarget,
  stagingAccessCookiesForOrigins,
  STAGING_ACCESS_COOKIE,
  VERCEL_AUTOMATION_BYPASS_COOKIE,
  VERCEL_AUTOMATION_BYPASS_HEADER,
  VERCEL_SET_BYPASS_COOKIE_HEADER,
  vercelAutomationBypassHeadersForExactOrigin,
} from "./browser-context-network-boundary.mjs";

const exactWebKitTurnstileConsoleArtifact = {
  browserName: "webkit",
  testTitle:
    "public funnel renders the official staging Turnstile test widget without submitting a lead",
  messageType: "error",
  messageText:
    "Failed to load resource: The operation couldn’t be completed. (WebKitBlobResource error 1.)",
  location: {
    url: "blob:https://challenges.cloudflare.com/123e4567-e89b-12d3-a456-426614174000",
    lineNumber: 0,
    columnNumber: 0,
  },
  stagingAcceptanceExecution: true,
  siteKey: "1x00000000000000000000AA",
};
assert.equal(
  isExpectedWebKitTurnstileTestWidgetConsoleError(
    exactWebKitTurnstileConsoleArtifact,
  ),
  true,
);
for (const nearMiss of [
  { browserName: "chromium" },
  { testTitle: "another staging journey" },
  { messageType: "warning" },
  { messageText: `${exactWebKitTurnstileConsoleArtifact.messageText} extra` },
  { location: { ...exactWebKitTurnstileConsoleArtifact.location, lineNumber: 1 } },
  { location: { ...exactWebKitTurnstileConsoleArtifact.location, columnNumber: 1 } },
  {
    location: {
      ...exactWebKitTurnstileConsoleArtifact.location,
      url: "blob:https://challenges.cloudflare.com/123E4567-E89B-12D3-A456-426614174000",
    },
  },
  {
    location: {
      ...exactWebKitTurnstileConsoleArtifact.location,
      url: "blob:https://evil.example/123e4567-e89b-12d3-a456-426614174000",
    },
  },
  {
    location: {
      ...exactWebKitTurnstileConsoleArtifact.location,
      url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/test",
    },
  },
  { stagingAcceptanceExecution: false },
  { siteKey: "1x00000000000000000000BB" },
]) {
  assert.equal(
    isExpectedWebKitTurnstileTestWidgetConsoleError({
      ...exactWebKitTurnstileConsoleArtifact,
      ...nearMiss,
    }),
    false,
  );
}

let httpPattern = null;
let httpHandler = null;
let webSocketPattern = null;
let webSocketHandler = null;
const context = {
  async route(pattern, handler) {
    httpPattern = pattern;
    httpHandler = handler;
  },
  async routeWebSocket(pattern, handler) {
    webSocketPattern = pattern;
    webSocketHandler = handler;
  },
};
const blockedHttp = [];
const blockedWebSockets = [];
const allowedWebSockets = [];

await installBrowserContextNetworkBoundary(context, {
  async handleHttpRoute(route) {
    blockedHttp.push(route.request().url());
    await route.abort("blockedbyclient");
  },
  recordBlockedWebSocket(url) {
    blockedWebSockets.push(safeWebSocketEvidenceTarget(url));
  },
  allowWebSocket: isExactLocalNextDevelopmentWebSocket,
  recordAllowedWebSocket(url) {
    allowedWebSockets.push(safeWebSocketEvidenceTarget(url));
  },
});

assert.equal(httpPattern, "**/*");
assert.equal(webSocketPattern.test("wss://forbidden.example/socket"), true);

let httpAbortCode = null;
await httpHandler({
  request: () => ({ url: () => "https://forbidden.example/popup" }),
  abort: async (code) => {
    httpAbortCode = code;
  },
});
assert.deepEqual(blockedHttp, ["https://forbidden.example/popup"]);
assert.equal(httpAbortCode, "blockedbyclient");

let webSocketClose = null;
await webSocketHandler({
  url: () => "wss://user:secret@forbidden.example/socket?token=secret",
  close: async (options) => {
    webSocketClose = options;
  },
});
assert.deepEqual(blockedWebSockets, ["wss://forbidden.example"]);
assert.deepEqual(webSocketClose, {
  code: 1008,
  reason: "DealFlow acceptance blocks WebSockets",
});
let developmentConnected = false;
await webSocketHandler({
  url: () => "ws://127.0.0.1:3410/_next/webpack-hmr",
  close: async () => {
    throw new Error("Exact local Next development WebSocket must not be closed");
  },
  connectToServer: () => {
    developmentConnected = true;
  },
});
assert.equal(developmentConnected, true);
assert.deepEqual(allowedWebSockets, ["ws://127.0.0.1:3410"]);
assert.equal(
  isExactLocalNextDevelopmentWebSocket(
    "ws://127.0.0.1:3410/_next/webpack-hmr?id=synthetic",
  ),
  true,
);
assert.equal(
  isExactLocalNextDevelopmentWebSocket(
    "ws://127.0.0.1:3410/_next/hmr?id=synthetic",
  ),
  true,
);
for (const rejected of [
  "wss://127.0.0.1:3410/_next/webpack-hmr?id=x",
  "ws://localhost:3410/_next/webpack-hmr?id=x",
  "ws://127.0.0.1:3411/_next/webpack-hmr?id=x",
  "ws://user:pass@127.0.0.1:3410/_next/webpack-hmr?id=x",
  "ws://127.0.0.1:3410/_next/webpack-hmr?id=x&extra=y",
  "ws://127.0.0.1:3410/_next/webpack-hmr?other=x",
  "ws://127.0.0.1:3410/not-hmr?id=x",
  "ws://localhost:3410/_next/hmr?id=x",
  "wss://127.0.0.1:3410/_next/hmr?id=x",
  "ws://127.0.0.1:3410/_next/hmr?id=x&extra=y",
]) {
  assert.equal(isExactLocalNextDevelopmentWebSocket(rejected), false);
}

const stagingSecret = "s".repeat(43);
assert.equal(
  scopedStagingAccessHeaders({
    headers: { accept: "text/html" },
    rawUrl: "https://staging.example.test/dashboard",
    applicationOrigin: "https://staging.example.test",
    stagingAccessGateSecret: stagingSecret,
  })["x-dealflow-staging-access"],
  stagingSecret,
);
for (const rawUrl of [
  "http://staging.example.test/dashboard",
  "https://project.supabase.co/auth/v1/user",
  "https://challenges.cloudflare.com/turnstile/v0/api.js",
  "https://user:pass@staging.example.test/dashboard",
  "https://evil.example.test/dashboard",
  "not a url",
]) {
  const headers = scopedStagingAccessHeaders({
    headers: { "x-dealflow-staging-access": stagingSecret },
    rawUrl,
    applicationOrigin: "https://staging.example.test",
    stagingAccessGateSecret: stagingSecret,
  });
  assert.equal(
    Object.hasOwn(headers, "x-dealflow-staging-access"),
    false,
    `staging access gate leaked to ${rawUrl}`,
  );
}
assert.equal(
  JSON.stringify(blockedWebSockets).includes("secret"),
  false,
  "WebSocket evidence must not retain credentials, paths, or query values",
);

const stagingCookies = stagingAccessCookiesForOrigins({
  applicationOrigins: [
    "https://staging.example.test",
    "https://partner-staging.example.test",
    "https://staging.example.test",
  ],
  stagingAccessGateSecret: stagingSecret,
});
assert.deepEqual(stagingCookies, [
  {
    name: STAGING_ACCESS_COOKIE,
    value: stagingSecret,
    url: "https://staging.example.test/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  },
  {
    name: STAGING_ACCESS_COOKIE,
    value: stagingSecret,
    url: "https://partner-staging.example.test/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  },
]);
for (const cookie of stagingCookies) {
  assert.equal(Object.hasOwn(cookie, "domain"), false);
  assert.equal(Object.hasOwn(cookie, "path"), false);
}
for (const invalidOrigin of [
  "http://staging.example.test",
  "https://user:pass@staging.example.test",
  "https://staging.example.test/path",
  "https://staging.example.test/?query=1",
  "https://staging.example.test/#fragment",
  "https://staging.example.test:443",
  "https://staging.example.test:8443",
  "not a url",
]) {
  assert.throws(
    () => stagingAccessCookiesForOrigins({
      applicationOrigins: [invalidOrigin],
      stagingAccessGateSecret: stagingSecret,
    }),
    /exact HTTPS origins and a strong secret/,
  );
}
for (const invalidSecret of ["weak", ` ${stagingSecret}`, `${stagingSecret} `]) {
  assert.throws(
    () => stagingAccessCookiesForOrigins({
      applicationOrigins: ["https://staging.example.test"],
      stagingAccessGateSecret: invalidSecret,
    }),
    /exact HTTPS origins and a strong secret/,
  );
}

const vercelBypassSecret = `vercel-${"b".repeat(48)}`;
const mixedApplicationOrigins = [
  "https://staging.example.test",
  "https://partner-one-staging.example.test",
  "https://partner-two-staging.example.test",
];
const mixedProtectionPortfolio = JSON.stringify([
  {
    origin: mixedApplicationOrigins[0],
    vercelAutomationBypassRequired: false,
  },
  {
    origin: mixedApplicationOrigins[1],
    vercelAutomationBypassRequired: true,
  },
  {
    origin: mixedApplicationOrigins[2],
    vercelAutomationBypassRequired: true,
  },
]);
assert.deepEqual(
  exactVercelAutomationProtectionPortfolio({
    serializedPortfolio: mixedProtectionPortfolio,
    applicationOrigins: mixedApplicationOrigins,
  }),
  JSON.parse(mixedProtectionPortfolio),
);
for (const rejectedPortfolio of [
  JSON.stringify(JSON.parse(mixedProtectionPortfolio).slice(0, 2)),
  JSON.stringify([
    JSON.parse(mixedProtectionPortfolio)[1],
    JSON.parse(mixedProtectionPortfolio)[0],
    JSON.parse(mixedProtectionPortfolio)[2],
  ]),
  JSON.stringify([
    ...JSON.parse(mixedProtectionPortfolio),
    {
      origin: "https://extra.example.test",
      vercelAutomationBypassRequired: true,
    },
  ]),
  JSON.stringify([
    {
      origin: mixedApplicationOrigins[0],
      vercelAutomationBypassRequired: "false",
    },
    ...JSON.parse(mixedProtectionPortfolio).slice(1),
  ]),
  JSON.stringify([
    {
      ...JSON.parse(mixedProtectionPortfolio)[0],
      unexpected: true,
    },
    ...JSON.parse(mixedProtectionPortfolio).slice(1),
  ]),
  "not-json",
]) {
  assert.throws(
    () => exactVercelAutomationProtectionPortfolio({
      serializedPortfolio: rejectedPortfolio,
      applicationOrigins: mixedApplicationOrigins,
    }),
    /does not exactly cover the browser origins/,
  );
}
assert.deepEqual(
  vercelAutomationBypassHeadersForExactOrigin({
    rawUrl: "https://staging.example.test/api/internal/zero-external-effects",
    applicationOrigin: "https://staging.example.test",
    vercelAutomationBypassSecret: vercelBypassSecret,
  }),
  { [VERCEL_AUTOMATION_BYPASS_HEADER]: vercelBypassSecret },
);
assert.deepEqual(
  vercelAutomationBypassHeadersForExactOrigin({
    rawUrl: "https://staging.example.test/",
    applicationOrigin: "https://staging.example.test",
    vercelAutomationBypassSecret: vercelBypassSecret,
    setBypassCookie: true,
  }),
  {
    [VERCEL_AUTOMATION_BYPASS_HEADER]: vercelBypassSecret,
    [VERCEL_SET_BYPASS_COOKIE_HEADER]: "true",
  },
);
for (const rejected of [
  {
    rawUrl: "https://third-party.example.test/",
    applicationOrigin: "https://staging.example.test",
    vercelAutomationBypassSecret: vercelBypassSecret,
  },
  {
    rawUrl: "https://staging.example.test/#redirect",
    applicationOrigin: "https://staging.example.test",
    vercelAutomationBypassSecret: vercelBypassSecret,
  },
  {
    rawUrl: "http://staging.example.test/",
    applicationOrigin: "https://staging.example.test",
    vercelAutomationBypassSecret: vercelBypassSecret,
  },
  {
    rawUrl: "https://staging.example.test/",
    applicationOrigin: "https://staging.example.test",
    vercelAutomationBypassSecret: "weak",
  },
]) {
  assert.throws(
    () => vercelAutomationBypassHeadersForExactOrigin(rejected),
    (error) => {
      assert.equal(String(error).includes(vercelBypassSecret), false);
      return /exact HTTPS application origin and a strong secret/.test(String(error));
    },
  );
}

const vercelPrimingCalls = [];
const vercelPrimedCookies = new Map();
const clearedVercelCookies = [];
const fakeVercelContext = {
  request: {
    async get(url, options) {
      vercelPrimingCalls.push({ url, options });
      const hostname = new URL(url).hostname;
      vercelPrimedCookies.set(hostname, [{
        name: VERCEL_AUTOMATION_BYPASS_COOKIE,
        value: `jwt-${hostname}`,
        domain: hostname,
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      }]);
      return {
        url: () => url,
        status: () => 307,
        headers: () => ({
          location: hostname === "staging.example.test" ? "/" : url,
        }),
        dispose: async () => {},
      };
    },
  },
  async cookies(url) {
    return vercelPrimedCookies.get(new URL(url).hostname) ?? [];
  },
  async clearCookies(options) {
    clearedVercelCookies.push(options);
    if (typeof options?.domain === "string") {
      vercelPrimedCookies.delete(options.domain);
      return;
    }
    if (options?.name === VERCEL_AUTOMATION_BYPASS_COOKIE) {
      vercelPrimedCookies.clear();
    }
  },
};
const primingResult = await primeVercelAutomationBypassCookies({
  context: fakeVercelContext,
  applicationOrigins: mixedApplicationOrigins,
  serializedProtectionPortfolio: mixedProtectionPortfolio,
  vercelAutomationBypassSecret: vercelBypassSecret,
});
assert.deepEqual(primingResult, { primedOriginCount: 2 });
assert.deepEqual(
  vercelPrimingCalls.map(({ url, options }) => ({
    url,
    maxRedirects: options.maxRedirects,
    failOnStatusCode: options.failOnStatusCode,
    setBypassCookie: options.headers[VERCEL_SET_BYPASS_COOKIE_HEADER],
    hasExactSecret: options.headers[VERCEL_AUTOMATION_BYPASS_HEADER] === vercelBypassSecret,
    headerCount: Object.keys(options.headers).length,
  })),
  [
    {
      url: "https://partner-one-staging.example.test/",
      maxRedirects: 0,
      failOnStatusCode: false,
      setBypassCookie: "true",
      hasExactSecret: true,
      headerCount: 2,
    },
    {
      url: "https://partner-two-staging.example.test/",
      maxRedirects: 0,
      failOnStatusCode: false,
      setBypassCookie: "true",
      hasExactSecret: true,
      headerCount: 2,
    },
  ],
);
assert.deepEqual(clearedVercelCookies, [
  {
    name: VERCEL_AUTOMATION_BYPASS_COOKIE,
    domain: "staging.example.test",
  },
  {
    name: VERCEL_AUTOMATION_BYPASS_COOKIE,
    domain: "partner-one-staging.example.test",
  },
  {
    name: VERCEL_AUTOMATION_BYPASS_COOKIE,
    domain: "partner-two-staging.example.test",
  },
]);
assert.equal(
  vercelPrimingCalls.some(({ url }) =>
    url === "https://staging.example.test/"
  ),
  false,
  "the unprotected stable alias received a Vercel bypass request",
);
assert.equal(JSON.stringify(primingResult).includes(vercelBypassSecret), false);
assert.equal(
  vercelPrimingCalls.some(({ url }) => url.includes(vercelBypassSecret)),
  false,
  "Vercel bypass secret entered the URL or redirect surface",
);

let unprotectedRequestCount = 0;
assert.deepEqual(
  await primeVercelAutomationBypassCookies({
    context: {
      request: {
        async get() {
          unprotectedRequestCount += 1;
          throw new Error("unprotected origin must not receive bypass authority");
        },
      },
      async cookies() { return []; },
      async clearCookies() {},
    },
    applicationOrigins: [mixedApplicationOrigins[0]],
    serializedProtectionPortfolio: JSON.stringify([
      {
        origin: mixedApplicationOrigins[0],
        vercelAutomationBypassRequired: false,
      },
    ]),
    vercelAutomationBypassSecret: "",
  }),
  { primedOriginCount: 0 },
);
assert.equal(unprotectedRequestCount, 0);

const partialFailureCookies = new Map();
const partialFailureClears = [];
const partialFailureContext = {
  request: {
    async get(url) {
      const hostname = new URL(url).hostname;
      if (hostname === "partner-two-staging.example.test") {
        return {
          url: () => url,
          status: () => 500,
          headers: () => ({}),
          dispose: async () => {},
        };
      }
      partialFailureCookies.set(hostname, [{
        name: VERCEL_AUTOMATION_BYPASS_COOKIE,
        value: "prior-synthetic-jwt",
        domain: hostname,
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      }]);
      return {
        url: () => url,
        status: () => 307,
        headers: () => ({ location: url }),
        dispose: async () => {},
      };
    },
  },
  async cookies(url) {
    return partialFailureCookies.get(new URL(url).hostname) ?? [];
  },
  async clearCookies(options) {
    partialFailureClears.push(options);
    if (typeof options?.domain === "string") {
      partialFailureCookies.delete(options.domain);
    } else if (options?.name === VERCEL_AUTOMATION_BYPASS_COOKIE) {
      partialFailureCookies.clear();
    }
  },
};
await assert.rejects(
  primeVercelAutomationBypassCookies({
    context: partialFailureContext,
    applicationOrigins: mixedApplicationOrigins,
    serializedProtectionPortfolio: mixedProtectionPortfolio,
    vercelAutomationBypassSecret: vercelBypassSecret,
  }),
  /failed safely/,
);
assert.equal(partialFailureCookies.size, 0);
assert.deepEqual(partialFailureClears.at(-1), {
  name: VERCEL_AUTOMATION_BYPASS_COOKIE,
});

for (const failureMode of [
  "redirect-followed",
  "wrong-location",
  "wrong-status",
  "missing-cookie",
  "domain-cookie",
  "non-http-only-cookie",
]) {
  const failureCalls = [];
  const failureContext = {
    request: {
      async get(url, options) {
        failureCalls.push({ url, options });
        return {
          url: () => failureMode === "redirect-followed"
            ? "https://third-party.example.test/"
            : url,
          status: () => failureMode === "wrong-status" ? 302 : 307,
          headers: () => ({
            location: failureMode === "redirect-followed" || failureMode === "wrong-location"
              ? "https://third-party.example.test/"
              : url,
          }),
          dispose: async () => {},
        };
      },
    },
    async cookies() {
      if (failureMode === "missing-cookie") return [];
      return [{
        name: VERCEL_AUTOMATION_BYPASS_COOKIE,
        value: "synthetic-jwt",
        domain: failureMode === "domain-cookie"
          ? ".staging.example.test"
          : "staging.example.test",
        path: "/",
        httpOnly: failureMode !== "non-http-only-cookie",
        secure: true,
        sameSite: "Lax",
      }];
    },
    async clearCookies() {},
  };
  await assert.rejects(
    primeVercelAutomationBypassCookies({
      context: failureContext,
      applicationOrigins: ["https://staging.example.test"],
      serializedProtectionPortfolio: JSON.stringify([{
        origin: "https://staging.example.test",
        vercelAutomationBypassRequired: true,
      }]),
      vercelAutomationBypassSecret: vercelBypassSecret,
    }),
    (error) => {
      assert.equal(String(error).includes(vercelBypassSecret), false);
      assert.equal(String(error).includes("third-party.example.test"), false);
      return /failed safely/.test(String(error));
    },
  );
  assert.equal(failureCalls.length, 1);
  assert.equal(failureCalls[0].options.maxRedirects, 0);
}

let rejectedOriginRequestCount = 0;
await assert.rejects(
  primeVercelAutomationBypassCookies({
    context: {
      request: { async get() { rejectedOriginRequestCount += 1; } },
      async cookies() { return []; },
      async clearCookies() {},
    },
    applicationOrigins: ["https://staging.example.test/redirect"],
    serializedProtectionPortfolio: JSON.stringify([{
      origin: "https://staging.example.test/redirect",
      vercelAutomationBypassRequired: true,
    }]),
    vercelAutomationBypassSecret: vercelBypassSecret,
  }),
  /failed safely/,
);
assert.equal(rejectedOriginRequestCount, 0, "an inexact origin reached the priming transport");

assert.equal(
  safeHttpEvidenceTarget(
    "https://user:secret@forbidden.example/oauth/callback?token=secret#secret",
  ),
  "https://forbidden.example/oauth/callback",
);
assert.equal(safeHttpEvidenceTarget("not a url"), "[invalid-http-url]");
assert.equal(safeHttpEvidenceTarget("file:///private/secret"), "[invalid-http-url]");

await assert.rejects(
  installBrowserContextNetworkBoundary({ route: async () => {} }, {
    handleHttpRoute: async () => {},
    recordBlockedWebSocket: () => {},
  }),
  /requires exact HTTP and WebSocket handlers/,
);

// Real browser negative: Playwright does not re-run a route handler for every
// redirect hop. Prove the replacement __Host- cookie is present at the exact
// app host but absent from the cross-origin redirect target in every engine.
const redirectRequests = [];
const tlsDirectory = mkdtempSync(join(tmpdir(), "dealflow-browser-gate-"));
const tlsKeyPath = join(tlsDirectory, "key.pem");
const tlsCertificatePath = join(tlsDirectory, "certificate.pem");
try {
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", tlsKeyPath,
    "-out", tlsCertificatePath,
    "-subj", "/CN=source.localhost",
    "-days", "1",
  ], { stdio: "ignore" });
} catch (error) {
  rmSync(tlsDirectory, { recursive: true, force: true });
  throw error;
}
let redirectTargetPort = null;
const redirectTargetServer = createServer({
  key: readFileSync(tlsKeyPath),
  cert: readFileSync(tlsCertificatePath),
}, (request, response) => {
  redirectRequests.push({
    path: request.url ?? "",
    host: request.headers.host ?? "",
    cookie: request.headers.cookie ?? "",
  });
  if ((request.url ?? "").startsWith("/start?engine=")) {
    response.writeHead(302, {
      Location: `https://target.localhost:${redirectTargetPort}${
        (request.url ?? "").replace("/start", "/redirect-target")
      }`,
      "Cache-Control": "no-store",
    });
    response.end();
    return;
  }
  if ((request.url ?? "").startsWith("/provider-return?engine=")) {
    response.writeHead(302, {
      Location: `https://source.localhost:${redirectTargetPort}${
        (request.url ?? "").replace("/provider-return", "/provider-callback")
      }`,
      "Cache-Control": "no-store",
    });
    response.end();
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
  response.end("<!doctype html><title>redirect target</title>");
});
try {
  await new Promise((resolve, reject) => {
    redirectTargetServer.once("error", reject);
    redirectTargetServer.listen(0, "127.0.0.1", resolve);
  });
} catch (error) {
  rmSync(tlsDirectory, { recursive: true, force: true });
  throw error;
}

try {
  const address = redirectTargetServer.address();
  assert.ok(address && typeof address === "object");
  redirectTargetPort = address.port;
  for (const [engineName, browserType] of [
    ["chromium", chromium],
    ["firefox", firefox],
    ["webkit", webkit],
  ]) {
    const browser = await browserType.launch({ headless: true });
    try {
      const realContext = await browser.newContext({
        serviceWorkers: "block",
        ignoreHTTPSErrors: true,
      });
      const browserSecret = `${engineName}-${"r".repeat(48)}`;
      const applicationOrigin = `https://source.localhost:${address.port}`;
      // Local TLS uses an ephemeral port, while production helper inputs are
      // deliberately restricted to standard HTTPS. This exact cookie shape
      // verifies browser host scoping without weakening the production helper.
      await realContext.addCookies([{
        name: STAGING_ACCESS_COOKIE,
        value: browserSecret,
        url: `${applicationOrigin}/`,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      }]);
      await installBrowserContextNetworkBoundary(realContext, {
        handleHttpRoute: (route) => route.continue(),
        recordBlockedWebSocket: () => {},
      });
      const realPage = await realContext.newPage();
      const response = await realPage.goto(`${applicationOrigin}/start?engine=${engineName}`, {
        waitUntil: "domcontentloaded",
      });
      assert.equal(response?.status(), 200);
      const sourceRequest = redirectRequests.find(({ path, host }) =>
        path === `/start?engine=${engineName}` && host.startsWith("source.localhost:"),
      );
      assert.ok(sourceRequest, `${engineName} did not reach the source host`);
      assert.match(sourceRequest.cookie, new RegExp(`${STAGING_ACCESS_COOKIE}=${browserSecret}`));
      const targetRequest = redirectRequests.find(({ path, host }) =>
        host.startsWith("target.localhost:") &&
        path === `/redirect-target?engine=${engineName}`,
      );
      assert.ok(targetRequest, `${engineName} did not reach the redirect target`);
      assert.equal(
        targetRequest.cookie,
        "",
        `${engineName} leaked the staging access cookie across origins`,
      );

      const providerReturnResponse = await realPage.goto(
        `https://target.localhost:${address.port}/provider-return?engine=${engineName}`,
        { waitUntil: "domcontentloaded" },
      );
      assert.equal(providerReturnResponse?.status(), 200);
      const providerRequest = redirectRequests.find(({ path, host }) =>
        host.startsWith("target.localhost:") &&
        path === `/provider-return?engine=${engineName}`,
      );
      assert.ok(providerRequest, `${engineName} did not reach the provider-return host`);
      assert.equal(providerRequest.cookie, "");
      const callbackRequest = redirectRequests.find(({ path, host }) =>
        host.startsWith("source.localhost:") &&
        path === `/provider-callback?engine=${engineName}`,
      );
      assert.ok(callbackRequest, `${engineName} did not return to the exact staging host`);
      assert.match(callbackRequest.cookie, new RegExp(`${STAGING_ACCESS_COOKIE}=${browserSecret}`));
      await realContext.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve, reject) => {
    redirectTargetServer.close((error) => error ? reject(error) : resolve());
  });
  rmSync(tlsDirectory, { recursive: true, force: true });
}

process.stdout.write("PASS browser-context HTTP and WebSocket boundary contract\n");
