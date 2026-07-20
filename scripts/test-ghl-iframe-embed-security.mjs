#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const proxySource = fs.readFileSync("src/proxy.ts", "utf8");
const capabilitySource = fs.readFileSync(
  "src/lib/white-label/ghl-embed-capability.ts",
  "utf8",
);
const requestOriginSource = fs.readFileSync(
  "src/lib/white-label/ghl-embed-request-origin.ts",
  "utf8",
);
const i18nConfigSource = fs.readFileSync("src/lib/i18n/config.ts", "utf8");
const i18nRoutingSource = fs.readFileSync("src/lib/i18n/routing.ts", "utf8");
const exchangeSource = fs.readFileSync(
  "src/app/api/integrations/ghl/embed-context/route.ts",
  "utf8",
);
const bootstrapSource = fs.readFileSync(
  "src/app/ghl/embed/ghl-embed-bootstrap.tsx",
  "utf8",
);
const refresherSource = fs.readFileSync(
  "src/components/ghl/ghl-embed-capability-refresher.tsx",
  "utf8",
);
const appLayoutSource = fs.readFileSync("src/app/(app)/layout.tsx", "utf8");
const nextConfigSource = fs.readFileSync("next.config.mjs", "utf8");
const loginFormSource = fs.readFileSync("src/components/auth/login-form.tsx", "utf8");
const loginPageSource = fs.readFileSync("src/app/(auth)/login/page.tsx", "utf8");
const partnerDomainSource = fs.readFileSync(
  "src/lib/white-label/verified-partner-domain.ts",
  "utf8",
);
const appContextSource = fs.readFileSync("src/lib/services/app-context.ts", "utf8");
const supportPageSource = fs.readFileSync("src/app/(app)/support/page.tsx", "utf8");
const supportFormSource = fs.readFileSync(
  "src/components/support/support-ticket-form.tsx",
  "utf8",
);

const failures = [];
const runtimeProcess = { env: {} };

function normalizePartnerDomainHost(value) {
  const candidate = value?.trim().toLowerCase().replace(/\.$/, "") ?? "";
  if (!candidate || candidate.length > 253 || candidate.includes(":") || candidate.includes("/")) {
    return null;
  }
  const labels = candidate.split(".");
  return labels.length >= 2 && labels.every(
    (label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
  ) ? candidate : null;
}

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
}

function loadCapabilityHelpers() {
  const cjsModule = { exports: {} };
  const evaluate = new Function(
    "require",
    "module",
    "exports",
    "process",
    transpile(capabilitySource),
  );
  evaluate(
    (specifier) => {
      if (specifier.endsWith("verified-partner-domain")) {
        return { normalizePartnerDomainHost };
      }
      throw new Error(`Unexpected capability import: ${specifier}`);
    },
    cjsModule,
    cjsModule.exports,
    runtimeProcess,
  );
  return cjsModule.exports;
}

function loadI18nRoutingHelpers() {
  const configModule = { exports: {} };
  new Function("module", "exports", transpile(i18nConfigSource))(
    configModule,
    configModule.exports,
  );

  const routingModule = { exports: {} };
  const evaluate = new Function(
    "require",
    "module",
    "exports",
    transpile(i18nRoutingSource),
  );
  evaluate(
    (specifier) => {
      if (specifier.endsWith("i18n/config")) {
        return configModule.exports;
      }
      throw new Error(`Unexpected i18n routing import: ${specifier}`);
    },
    routingModule,
    routingModule.exports,
  );
  return routingModule.exports;
}

function loadProxySecurityHelpers(capabilityHelpers, i18nRoutingHelpers) {
  const testSource = proxySource
    .replace(
      "function getFrameAncestors(\n  request: NextRequest,",
      "export function getFrameAncestors(\n  request: NextRequest,",
    )
    .replace(
      "function addEmbeddedAuthRedirectState(\n  request: NextRequest,",
      "export function addEmbeddedAuthRedirectState(\n  request: NextRequest,",
    )
    .replace(
      "function shouldResolvePartnerDomainContext(request: NextRequest)",
      "export function shouldResolvePartnerDomainContext(request: NextRequest)",
    );
  const cjsModule = { exports: {} };
  const emptyModule = new Proxy({}, { get: () => () => undefined });
  const evaluate = new Function(
    "require",
    "module",
    "exports",
    "process",
    transpile(testSource),
  );
  evaluate(
    (specifier) => {
      if (specifier.endsWith("ghl-embed-capability")) {
        return capabilityHelpers;
      }
      if (specifier.endsWith("i18n/routing")) {
        return i18nRoutingHelpers;
      }
      return emptyModule;
    },
    cjsModule,
    cjsModule.exports,
    runtimeProcess,
  );
  return cjsModule.exports;
}

function loadRequestOriginHelper() {
  const cjsModule = { exports: {} };
  const evaluate = new Function(
    "require",
    "module",
    "exports",
    transpile(requestOriginSource),
  );
  evaluate(
    (specifier) => specifier.endsWith("verified-partner-domain")
      ? { normalizePartnerDomainHost }
      : {},
    cjsModule,
    cjsModule.exports,
  );
  return cjsModule.exports;
}

for (const marker of [
  "loadVerifiedPartnerDomainContext",
  "GHL_EMBED_CAPABILITY_COOKIE",
  "GHL_EMBED_SESSION_COOKIE",
  "verifyGhlEmbedSessionMarker",
  "verifyGhlEmbedCapability",
  "x-dealflow-ghl-embed-organization",
  '"/ghl/embed"',
  "shouldResolvePartnerDomainContext(request)",
  '"/builder"',
  "frame-ancestors ${frameAncestors}",
  'response.headers.delete("X-Frame-Options")',
  'response.headers.set("X-Frame-Options", "DENY")',
]) {
  if (!proxySource.includes(marker)) failures.push(`src/proxy.ts is missing: ${marker}`);
}

if (nextConfigSource.includes("X-Frame-Options")) {
  failures.push("next.config.mjs must not globally block the capability-bound iframe surface.");
}
if (/https:\/\/\*\.gohighlevel\.com|DEFAULT_GHL_FRAME_ANCESTORS/.test(proxySource)) {
  failures.push("Proxy must not trust wildcard or default HighLevel ancestors.");
}
if (proxySource.includes("GHL_IFRAME_ALLOWED_FRAME_ANCESTORS")) {
  failures.push("Proxy must not retain the global many-to-many partner ancestor model.");
}
if (!capabilitySource.includes('GHL_IFRAME_ALLOW_SHARED_HIGHLEVEL_ORIGINS === "true"') ||
    !capabilitySource.includes("GHL_IFRAME_PARTNER_PARENT_ORIGINS_JSON")) {
  failures.push("Embed parents must use explicit shared-origin and per-partner gates.");
}
if (!partnerDomainSource.includes('verification_status: "eq.verified"') ||
    !partnerDomainSource.includes('ssl_status: "eq.active"') ||
    !partnerDomainSource.includes('status: "eq.active"') ||
    !partnerDomainSource.includes('deleted_at: "is.null"')) {
  failures.push("Partner host resolution must remain verified, SSL-active, active, and non-deleted.");
}
if (!proxySource.includes('requestHeaders.delete("x-dealflow-ghl-embed-organization")')) {
  failures.push("Proxy must overwrite untrusted inbound embed organization context.");
}
if (!loginPageSource.includes("loadVerifiedPartnerDomainContext") ||
    !loginPageSource.includes("verifyPartnerAttributionToken") ||
    !loginPageSource.includes("branding={partnerContext?.branding}")) {
  failures.push("Login branding must remain server-bound to the verified partner host.");
}
if (!loginFormSource.includes("partner_attribution_token") ||
    !loginFormSource.includes("requestEmbeddedAuthStorageAccess") ||
    !loginFormSource.includes("document.requestStorageAccess") ||
    !loginFormSource.includes("window.self !== window.top")) {
  failures.push("Embedded login must retain signed attribution and Storage Access handling.");
}
if (!appContextSource.includes("resolveVerifiedPartnerAttribution") ||
    !appContextSource.includes("applyVerifiedPartnerAttribution") ||
    !appContextSource.includes("bind_verified_partner_attribution_v1") ||
    !appContextSource.includes("resolveVerifiedEmbeddedWorkspace") ||
    !appContextSource.includes("GHL_EMBED_CAPABILITY_COOKIE") ||
    !appContextSource.includes("embeddedWorkspace?.organization") ||
    !appContextSource.includes("embeddedWorkspace?.membership") ||
    !appContextSource.includes('from("organization_memberships")') ||
    !appContextSource.includes('from("ghl_location_mappings")') ||
    !appContextSource.includes('from("workspace_ghl_users")')) {
  failures.push("Workspace bootstrap must use the atomic verified partner-binding receipt.");
}
for (const marker of [
  "decryptGhlSignedUserContext",
  'from("ghl_location_mappings")',
  'from("ghl_installations")',
  'from("ghl_workspace_tenants")',
  'from("workspace_ghl_users")',
  'from("organization_memberships")',
  '.eq("invite_status", "active")',
  "createGhlEmbedCapability",
  "isExactVerifiedPartnerRequestOrigin",
  "dealflowUser.email?.trim().toLowerCase() !== signedContext.email",
]) {
  if (!exchangeSource.includes(marker)) failures.push(`Embed exchange is missing: ${marker}`);
}
for (const marker of [
  "GhlEmbedCapabilityRefresher",
  'headerStore.get("x-dealflow-ghl-embed-parent-origin")',
]) {
  if (!appLayoutSource.includes(marker)) failures.push(`App layout is missing: ${marker}`);
}
for (const marker of [
  "REFRESH_INTERVAL_MS",
  'event.source !== window.parent',
  "event.origin !== parentOrigin",
  'window.parent.postMessage(',
  'parentOrigin,',
  'window.location.assign("/ghl/embed")',
  'document.addEventListener("visibilitychange"',
]) {
  if (!refresherSource.includes(marker)) failures.push(`Embed refresher is missing: ${marker}`);
}
for (const marker of [
  'event.source !== window.parent',
  "props.allowedParentOrigins.includes(event.origin)",
  'event.data.message !== "REQUEST_USER_DATA_RESPONSE"',
  'window.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*")',
  'fetch("/api/integrations/ghl/embed-context"',
  "Enable embedded access",
  "document.requestStorageAccess",
  "cookieAvailable",
  "finalizationAttemptedRef",
  "finalizeHandoff",
  'target="_blank"',
]) {
  if (!bootstrapSource.includes(marker)) failures.push(`Embed bootstrap is missing: ${marker}`);
}
if (!supportPageSource.includes("SupportTicketForm") ||
    !supportFormSource.includes('fetchWithRetry("/api/feedback",')) {
  failures.push("Embedded support must keep the authenticated durable support path.");
}
const publicPathBlock = proxySource.match(/const PUBLIC_PATHS = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "";
if (publicPathBlock.includes('"/support"')) {
  failures.push("Support must remain authenticated, not public.");
}

runtimeProcess.env = {
  GHL_IFRAME_EMBED_ENABLED: "true",
  GHL_APP_SHARED_SECRET: "sentinel-secure-ghl-app-shared-secret-2026-alpha",
  GHL_IFRAME_ALLOW_SHARED_HIGHLEVEL_ORIGINS: "true",
  GHL_IFRAME_PARTNER_PARENT_ORIGINS_JSON: JSON.stringify({
    "partner.example": "https://crm.partner.example",
    "second-partner.example": "https://crm.second-partner.example",
  }),
};
const capabilityHelpers = loadCapabilityHelpers();
const i18nRoutingHelpers = loadI18nRoutingHelpers();
const proxyHelpers = loadProxySecurityHelpers(capabilityHelpers, i18nRoutingHelpers);
const requestOriginHelpers = loadRequestOriginHelper();

for (const source of [capabilitySource, fs.readFileSync("src/lib/supabase/cookie-options.ts", "utf8")]) {
  assert.match(source, /partitioned:/, "embedded capability and auth cookies must use a secure partitioned strategy");
}

assert.deepEqual(
  capabilityHelpers.getAllowedGhlParentOrigins("partner.example"),
  [
    "https://app.gohighlevel.com",
    "https://app.leadconnectorhq.com",
    "https://crm.partner.example",
  ],
);
assert.ok(
  !capabilityHelpers.getAllowedGhlParentOrigins("partner.example")
    .includes("https://crm.second-partner.example"),
  "one partner's exact desktop origin must never frame another partner host",
);
assert.equal(
  capabilityHelpers.resolveAllowedGhlParentOrigin({
    candidate: "https://evil.example",
    partnerHost: "partner.example",
  }),
  null,
);

const now = 1_800_000_000;
const baseCapability = {
  partnerId: "10000000-0000-4000-8000-000000000026",
  domain: "partner.example",
  organizationId: "20000000-0000-4000-8000-000000000026",
  locationId: "location_partner_026",
  companyId: "company_partner_026",
  ghlUserId: "ghl_user_partner_026",
  ghlEmail: "realtor@partner.example",
  parentOrigin: "https://app.gohighlevel.com",
};
const preauthToken = await capabilityHelpers.createGhlEmbedCapability({
  ...baseCapability,
  stage: "preauth",
  dealflowUserId: null,
}, now);
const authUserId = "30000000-0000-4000-8000-000000000026";
const authToken = await capabilityHelpers.createGhlEmbedCapability({
  ...baseCapability,
  stage: "authenticated",
  dealflowUserId: authUserId,
}, now);
assert.ok(preauthToken && authToken);
const sessionToken = await capabilityHelpers.createGhlEmbedSessionMarker({
  domain: baseCapability.domain,
  partnerId: baseCapability.partnerId,
  parentOrigin: baseCapability.parentOrigin,
  dealflowUserId: authUserId,
}, now);
assert.ok(sessionToken);
const preauthCapability = await capabilityHelpers.verifyGhlEmbedCapability(preauthToken, {
  expectedHost: "partner.example",
  requiredStage: "preauth",
  nowSeconds: now + 10,
});
const authCapability = await capabilityHelpers.verifyGhlEmbedCapability(authToken, {
  expectedHost: "partner.example",
  expectedDealflowUserId: authUserId,
  requiredStage: "authenticated",
  nowSeconds: now + 10,
});
assert.ok(preauthCapability && authCapability);
assert.ok(await capabilityHelpers.verifyGhlEmbedSessionMarker(sessionToken, {
  expectedHost: "partner.example",
  nowSeconds: now + 301,
}), "the inert renewal marker must survive capability expiry");
assert.equal(
  await capabilityHelpers.verifyGhlEmbedSessionMarker(sessionToken, {
    expectedHost: "partner.example",
    nowSeconds: now + (12 * 60 * 60) + 1,
  }),
  null,
  "the renewal marker must expire",
);
assert.equal(
  await capabilityHelpers.verifyGhlEmbedCapability(`${authToken.slice(0, -1)}x`, {
    expectedHost: "partner.example",
    nowSeconds: now + 10,
  }),
  null,
  "tampered capabilities must fail",
);
assert.equal(
  await capabilityHelpers.verifyGhlEmbedCapability(authToken, {
    expectedHost: "second-partner.example",
    nowSeconds: now + 10,
  }),
  null,
  "capabilities must be host-bound",
);
assert.equal(
  await capabilityHelpers.verifyGhlEmbedCapability(authToken, {
    expectedHost: "partner.example",
    nowSeconds: now + 301,
  }),
  null,
  "expired capabilities must fail",
);

const request = (hostname, pathname, search = "") => {
  const url = new URL(`https://${hostname}${pathname}${search}`);
  return {
    url: url.toString(),
    nextUrl: { hostname, pathname, searchParams: url.searchParams },
  };
};

assert.equal(
  proxyHelpers.shouldResolvePartnerDomainContext(request("partner.example", "/ghl/embed")),
  true,
  "the inert bootstrap must resolve verified partner context before CSP and header injection",
);
assert.equal(
  proxyHelpers.shouldResolvePartnerDomainContext(request("partner.example", "/fr/ghl/embed")),
  true,
  "locale-prefixed bootstrap routes must resolve the same verified partner context",
);
assert.equal(
  requestOriginHelpers.isExactVerifiedPartnerRequestOrigin({
    requestUrl: "https://partner.example/api/integrations/ghl/embed-context",
    origin: "https://partner.example",
    referer: "https://partner.example/ghl/embed",
    fetchSite: "same-origin",
    partnerDomain: "partner.example",
    requireHttps: true,
  }),
  true,
  "an exact verified partner same-origin exchange must pass",
);
for (const invalid of [
  { origin: "https://app.agentdealflow.io" },
  { origin: "https://evil.example" },
  { referer: "https://evil.example/embed" },
  { fetchSite: "cross-site" },
  { partnerDomain: "second-partner.example" },
  { requestUrl: "http://partner.example/api/integrations/ghl/embed-context" },
]) {
  assert.equal(
    requestOriginHelpers.isExactVerifiedPartnerRequestOrigin({
      requestUrl: "https://partner.example/api/integrations/ghl/embed-context",
      origin: "https://partner.example",
      referer: "https://partner.example/ghl/embed",
      fetchSite: "same-origin",
      partnerDomain: "partner.example",
      requireHttps: true,
      ...invalid,
    }),
    false,
    `verified partner origin negative must fail: ${JSON.stringify(invalid)}`,
  );
}

assert.equal(
  proxyHelpers.getFrameAncestors(request("partner.example", "/ghl/embed"), "partner.example", null),
  "https://app.gohighlevel.com https://app.leadconnectorhq.com https://crm.partner.example",
  "only the inert bootstrap may be framed before signed context exchange",
);
assert.equal(
  proxyHelpers.getFrameAncestors(
    request("partner.example", "/fr/ghl/embed"),
    "partner.example",
    null,
  ),
  "https://app.gohighlevel.com https://app.leadconnectorhq.com https://crm.partner.example",
  "locale-prefixed bootstrap routes must preserve the exact partner-bound frame policy",
);
assert.equal(
  proxyHelpers.getFrameAncestors(request("partner.example", "/dashboard"), "partner.example", null),
  "'none'",
  "sensitive surfaces must deny shared-parent framing without a capability",
);
assert.equal(
  proxyHelpers.getFrameAncestors(
    request("partner.example", "/login", "?embed=ghl&redirectedFrom=%2Fghl%2Fembed"),
    "partner.example",
    preauthCapability,
  ),
  "https://app.gohighlevel.com",
  "signed preauth context may frame only the bootstrap login continuation",
);
assert.equal(
  proxyHelpers.getFrameAncestors(
    request("partner.example", "/login", "?embed=ghl&redirectedFrom=%2Fdashboard"),
    "partner.example",
    preauthCapability,
  ),
  "'none'",
  "preauth context must not frame an authenticated app continuation",
);

for (const embeddedPath of [
  "/onboarding",
  "/campaign-built",
  "/paywall",
  "/build/funnel",
  "/build/creatives",
  "/builder",
  "/preview",
  "/launch",
  "/launching",
  "/launch-success",
  "/unlock",
  "/results",
  "/dashboard",
  "/settings",
  "/support",
]) {
  assert.equal(
    proxyHelpers.getFrameAncestors(
      request("partner.example", embeddedPath),
      "partner.example",
      authCapability,
    ),
    "https://app.gohighlevel.com",
    `${embeddedPath} must use only its signed capability parent`,
  );
}
assert.equal(
  proxyHelpers.getFrameAncestors(
    request("second-partner.example", "/dashboard"),
    "second-partner.example",
    authCapability,
  ),
  "'none'",
  "a capability must not cross partner hosts",
);
assert.equal(
  proxyHelpers.getFrameAncestors(
    request("partner.example", "/admin/issues"),
    "partner.example",
    authCapability,
  ),
  "'none'",
  "operator surfaces must never be embedded",
);

const embeddedLoginUrl = new URL("https://partner.example/login?redirectedFrom=%2Fdashboard");
proxyHelpers.addEmbeddedAuthRedirectState(
  request("partner.example", "/dashboard"),
  embeddedLoginUrl,
  "partner.example",
  authCapability,
);
assert.equal(embeddedLoginUrl.searchParams.get("embed"), "ghl");
const topLevelLoginUrl = new URL("https://partner.example/login?redirectedFrom=%2Fadmin%2Fissues");
proxyHelpers.addEmbeddedAuthRedirectState(
  request("partner.example", "/admin/issues"),
  topLevelLoginUrl,
  "partner.example",
  authCapability,
);
assert.equal(topLevelLoginUrl.searchParams.get("embed"), null);

runtimeProcess.env.GHL_IFRAME_EMBED_ENABLED = "false";
assert.equal(
  proxyHelpers.getFrameAncestors(
    request("partner.example", "/dashboard"),
    "partner.example",
    authCapability,
  ),
  "'none'",
  "the central kill switch must close every embed surface",
);

if (failures.length > 0) {
  console.error("GHL iframe embed security regression failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("GHL iframe capability, tenant binding, CSP, login, and support security regression passed.");
