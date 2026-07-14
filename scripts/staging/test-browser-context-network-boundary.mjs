#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "@playwright/test";

import {
  installBrowserContextNetworkBoundary,
  isExactLocalNextDevelopmentWebSocket,
  scopedStagingAccessHeaders,
  safeHttpEvidenceTarget,
  safeWebSocketEvidenceTarget,
  stagingAccessCookiesForOrigins,
  STAGING_ACCESS_COOKIE,
} from "./browser-context-network-boundary.mjs";

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
for (const rejected of [
  "wss://127.0.0.1:3410/_next/webpack-hmr?id=x",
  "ws://localhost:3410/_next/webpack-hmr?id=x",
  "ws://127.0.0.1:3411/_next/webpack-hmr?id=x",
  "ws://user:pass@127.0.0.1:3410/_next/webpack-hmr?id=x",
  "ws://127.0.0.1:3410/_next/webpack-hmr?id=x&extra=y",
  "ws://127.0.0.1:3410/_next/webpack-hmr?other=x",
  "ws://127.0.0.1:3410/not-hmr?id=x",
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
