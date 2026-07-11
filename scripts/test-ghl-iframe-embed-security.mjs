#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const proxySource = fs.readFileSync("src/proxy.ts", "utf8");
const nextConfigSource = fs.readFileSync("next.config.mjs", "utf8");
const loginFormSource = fs.readFileSync("src/components/auth/login-form.tsx", "utf8");

const requiredProxyMarkers = [
  "CLICK_TO_SCALE_IFRAME_HOSTS",
  "\"clicktoscale.io\"",
  "\"www.clicktoscale.io\"",
  "GHL_EMBEDDABLE_PATHS",
  'new Set(["/onboarding"])',
  "GHL_IFRAME_EMBED_ENABLED",
  "GHL_IFRAME_ALLOWED_FRAME_ANCESTORS",
  "SHARED_VENDOR_FRAME_HOSTS",
  "normalizeExactFrameAncestor",
  "frame-ancestors ${frameAncestors}",
  "response.headers.delete(\"X-Frame-Options\")",
  "response.headers.set(\"X-Frame-Options\", \"DENY\")",
];

const failures = [];

function loadProxySecurityHelpers() {
  const testSource = proxySource
    .replace(
      "function normalizeExactFrameAncestor(source: string)",
      "export function normalizeExactFrameAncestor(source: string)",
    )
    .replace(
      "function getFrameAncestors(request: NextRequest)",
      "export function getFrameAncestors(request: NextRequest)",
    )
    .replace(
      "function hasEmbeddedOnboardingReturn(request: NextRequest)",
      "export function hasEmbeddedOnboardingReturn(request: NextRequest)",
    )
    .replace(
      "function addEmbeddedAuthRedirectState(request: NextRequest, loginUrl: URL)",
      "export function addEmbeddedAuthRedirectState(request: NextRequest, loginUrl: URL)",
    );
  const output = ts.transpileModule(testSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  const emptyModule = new Proxy({}, { get: () => () => undefined });
  const runtimeProcess = { env: {} };
  const evaluate = new Function("require", "module", "exports", "process", output);
  evaluate(() => emptyModule, loadedModule, loadedModule.exports, runtimeProcess);
  return { helpers: loadedModule.exports, runtimeProcess };
}

for (const marker of requiredProxyMarkers) {
  if (!proxySource.includes(marker)) {
    failures.push(`src/proxy.ts is missing required marker: ${marker}`);
  }
}

if (nextConfigSource.includes("X-Frame-Options")) {
  failures.push("next.config.mjs must not set X-Frame-Options globally; it blocks GoHighLevel iframes.");
}

if (proxySource.includes("DEFAULT_GHL_FRAME_ANCESTORS") || proxySource.includes("https://*.gohighlevel.com")) {
  failures.push("src/proxy.ts must not trust shared/wildcard GHL origins by default.");
}

if (!proxySource.includes('process.env.GHL_IFRAME_EMBED_ENABLED !== "true"')) {
  failures.push("src/proxy.ts must keep iframe embedding behind an explicit closed-by-default gate.");
}

if (!proxySource.includes("!isGhlEmbeddableSurface(request)")) {
  failures.push("src/proxy.ts must restrict framing to the fixed embedded surface.");
}

if (!loginFormSource.includes("requestEmbeddedAuthStorageAccess")) {
  failures.push("src/components/auth/login-form.tsx must request storage access before iframe auth submission.");
}

if (!loginFormSource.includes("document.requestStorageAccess")) {
  failures.push("src/components/auth/login-form.tsx must support strict browser third-party storage handling.");
}

if (!loginFormSource.includes("window.self !== window.top")) {
  failures.push("src/components/auth/login-form.tsx must detect embedded auth surfaces.");
}

const { helpers, runtimeProcess } = loadProxySecurityHelpers();
assert.equal(helpers.normalizeExactFrameAncestor("https://partner.example"), "https://partner.example");
assert.equal(helpers.normalizeExactFrameAncestor("https://partner.example:8443"), "https://partner.example:8443");
for (const rejectedAncestor of [
  "http://partner.example",
  "https://app.gohighlevel.com",
  "https://app.leadconnectorhq.com",
  "https://*.gohighlevel.com",
  "https://partner.example/path",
  "https://user@partner.example",
]) {
  assert.equal(
    helpers.normalizeExactFrameAncestor(rejectedAncestor),
    null,
    `${rejectedAncestor} must not be accepted as an exact partner frame ancestor`,
  );
}

const request = (hostname, pathname, search = "") => {
  const url = new URL(`https://${hostname}${pathname}${search}`);
  return {
    url: url.toString(),
    nextUrl: {
      hostname,
      pathname,
      searchParams: url.searchParams,
    },
  };
};
runtimeProcess.env = {
  GHL_IFRAME_EMBED_ENABLED: "false",
  GHL_IFRAME_ALLOWED_FRAME_ANCESTORS: "https://partner.example",
};
assert.equal(helpers.getFrameAncestors(request("clicktoscale.io", "/onboarding")), "'none'");
runtimeProcess.env.GHL_IFRAME_EMBED_ENABLED = "true";
assert.equal(helpers.getFrameAncestors(request("app.agentdealflow.io", "/onboarding")), "'none'");
assert.equal(helpers.getFrameAncestors(request("clicktoscale.io", "/dashboard")), "'none'");
runtimeProcess.env.GHL_IFRAME_ALLOWED_FRAME_ANCESTORS = "";
assert.equal(helpers.getFrameAncestors(request("clicktoscale.io", "/onboarding")), "'none'");
runtimeProcess.env.GHL_IFRAME_ALLOWED_FRAME_ANCESTORS =
  "https://partner.example, https://partner.example https://second-partner.example";
assert.equal(
  helpers.getFrameAncestors(request("clicktoscale.io", "/onboarding")),
  "https://partner.example https://second-partner.example",
);
assert.equal(
  helpers.getFrameAncestors(
    request(
      "clicktoscale.io",
      "/login",
      "?embed=1&redirectedFrom=%2Fonboarding%3FcampaignId%3Dsafe",
    ),
  ),
  "https://partner.example https://second-partner.example",
  "the exact embedded auth continuation must retain the exact partner frame ancestors",
);
for (const unsafeLoginSearch of [
  "",
  "?embed=1",
  "?embed=1&redirectedFrom=%2Fdashboard",
  "?embed=1&redirectedFrom=%2F%2Fevil.example%2Fonboarding",
]) {
  assert.equal(
    helpers.getFrameAncestors(request("clicktoscale.io", "/login", unsafeLoginSearch)),
    "'none'",
    `login framing must remain denied for ${unsafeLoginSearch || "a normal login"}`,
  );
}
assert.equal(
  helpers.getFrameAncestors(
    request("app.agentdealflow.io", "/login", "?embed=1&redirectedFrom=%2Fonboarding"),
  ),
  "'none'",
  "embedded login framing must remain denied on non-partner hosts",
);
const embeddedLoginUrl = new URL("https://clicktoscale.io/login?redirectedFrom=%2Fonboarding");
helpers.addEmbeddedAuthRedirectState(
  request("clicktoscale.io", "/onboarding"),
  embeddedLoginUrl,
);
assert.equal(embeddedLoginUrl.searchParams.get("embed"), "1");
const normalLoginUrl = new URL("https://clicktoscale.io/login?redirectedFrom=%2Fdashboard");
helpers.addEmbeddedAuthRedirectState(
  request("clicktoscale.io", "/dashboard"),
  normalLoginUrl,
);
assert.equal(normalLoginUrl.searchParams.get("embed"), null);

if (failures.length > 0) {
  console.error("GHL iframe embed security regression failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("GHL iframe embed security regression passed.");
