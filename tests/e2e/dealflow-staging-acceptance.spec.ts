import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  browserCookiesForOrigin,
  isAllowedStagingTurnstileRequest,
  parseSyntheticBrowserSessionBundle,
  SYNTHETIC_STAGING_ROLE_EMAILS,
} from "../../scripts/staging/browser-session-bundle-contract.mjs";
import {
  installBrowserContextNetworkBoundary,
  safeHttpEvidenceTarget,
  safeWebSocketEvidenceTarget,
  scopedStagingAccessHeaders,
  stagingAccessCookiesForOrigins,
  STAGING_ACCESS_HEADER,
} from "../../scripts/staging/browser-context-network-boundary.mjs";

const EXPECTED_STAGING_HOST = "dealflow-os-rebuild-selfserve-clean.vercel.app";
const EXPECTED_PARTNER_ONE_HOST =
  "dealflow-os-rebuild-selfserve-clean-partner-one-qibh.vercel.app";
const EXPECTED_PARTNER_TWO_HOST =
  "dealflow-os-rebuild-selfserve-clean-partner-two-qibh.vercel.app";
const EXPECTED_SUPABASE_SAFE_SUFFIX = "qibh";
const EXPECTED_SUPABASE_FINGERPRINT =
  "c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c";
const ZERO_EXTERNAL_EFFECTS_ATTESTATION =
  "DEALFLOW_ISOLATED_STAGING_QIBH_ZERO_EXTERNAL_EFFECTS_V1";
const EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT = 60;
const PAID_CAMPAIGN_ID = "d2000000-0000-4000-8000-000000000001";
const STALE_REPORTING_CAMPAIGN_ID = "d2000000-0000-4000-8000-000000000002";
const FAILED_REPORTING_CAMPAIGN_ID = "d2000000-0000-4000-8000-000000000003";
const PARTNER_ONE_CAMPAIGN_ID = "d2000000-0000-4000-8000-000000000004";
const PARTNER_TWO_CAMPAIGN_ID = "d2000000-0000-4000-8000-000000000005";
const PARTNER_BRAND_NAME = "DF-STAGING-20260712 Partner Realty OS";
const PARTNER_TWO_BRAND_NAME = "DF-STAGING-20260712 Partner Two Realty OS";
const LOCALIZED_PRODUCT_COPY = Object.freeze({
  en: Object.freeze({ signIn: "Sign in", dashboard: "Dashboard" }),
  fr: Object.freeze({ signIn: "Se connecter", dashboard: "Tableau de bord" }),
  es: Object.freeze({ signIn: "Iniciar sesión", dashboard: "Panel" }),
});

const ROLE_EMAILS = SYNTHETIC_STAGING_ROLE_EMAILS;

type SyntheticRole = keyof typeof ROLE_EMAILS;

let cachedBrowserSessionBundle: {
  roles: Record<SyntheticRole, {
    userId: string;
    email: string;
    expiresAt: number;
    cookies: Array<{ name: string; value: string }>;
  }>;
} | null = null;

type Diagnostics = {
  blockedMutations: string[];
  forbiddenHosts: string[];
  blockedWebSockets: string[];
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  serverErrors: string[];
};

const diagnosticsByPage = new WeakMap<Page, Diagnostics>();

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  expect(value, `${name} is required for staging acceptance`).toBeTruthy();
  return value!;
}

function stagingAppHeaders(rawTarget: string, additional: Record<string, string> = {}) {
  const base = requiredEnvironment("STAGING_ACCEPTANCE_BASE_URL");
  const target = new URL(rawTarget, base);
  const allowedOrigins = new Set([
    new URL(base).origin,
    new URL(requiredEnvironment("STAGING_ACCEPTANCE_PARTNER_BASE_URL")).origin,
    new URL(requiredEnvironment("STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL")).origin,
  ]);
  if (
    !allowedOrigins.has(target.origin) ||
    target.username !== "" ||
    target.password !== ""
  ) {
    throw new Error("Staging APIRequestContext request escaped the exact application origins");
  }
  const secret = requiredEnvironment("STAGING_ACCESS_GATE_SECRET");
  expect(secret.length, "The staging access gate must be a strong isolated secret")
    .toBeGreaterThanOrEqual(43);
  return scopedStagingAccessHeaders({
    headers: additional,
    rawUrl: target.toString(),
    applicationOrigin: target.origin,
    stagingAccessGateSecret: secret,
  });
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizeBrowserDiagnostic(value: string) {
  return String(value)
    .replace(/(?:https?|wss?):\/\/[^\s"'`<>]+/gi, (url) => safeHttpEvidenceTarget(url))
    .replace(/Bearer\s+[^\s"'`<>]+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
    .replace(/sb-[a-z0-9-]+-auth-token(?:\.\d+)?=[^\s;]+/gi, "sb-[REDACTED]-auth-token=[REDACTED]")
    .slice(0, 2_000);
}

function isExpectedNavigationAbort(value: string) {
  return /net::ERR_ABORTED/i.test(value);
}

function browserSessionBundle(minimumRemainingLifetimeSeconds = 15 * 60) {
  if (cachedBrowserSessionBundle) return cachedBrowserSessionBundle;
  const projectRef = requiredEnvironment("QA_ISOLATED_SUPABASE_PROJECT_REF");
  cachedBrowserSessionBundle = parseSyntheticBrowserSessionBundle(
    requiredEnvironment("STAGING_SYNTHETIC_BROWSER_SESSION_BUNDLE"),
    {
      projectRef,
      projectFingerprint: EXPECTED_SUPABASE_FINGERPRINT,
      safeSuffix: EXPECTED_SUPABASE_SAFE_SUFFIX,
      expectedRoleEmails: ROLE_EMAILS,
      minimumRemainingLifetimeSeconds,
    },
  ) as typeof cachedBrowserSessionBundle;
  return cachedBrowserSessionBundle!;
}

function assertGlobalPreconditions() {
  const baseUrl = new URL(requiredEnvironment("STAGING_ACCEPTANCE_BASE_URL"));
  const partnerBaseUrl = new URL(requiredEnvironment("STAGING_ACCEPTANCE_PARTNER_BASE_URL"));
  const partnerTwoBaseUrl = new URL(
    requiredEnvironment("STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL"),
  );
  expect(baseUrl.protocol).toBe("https:");
  expect(baseUrl.hostname).toBe(EXPECTED_STAGING_HOST);
  expect(partnerBaseUrl.protocol).toBe("https:");
  expect(partnerBaseUrl.hostname).toBe(EXPECTED_PARTNER_ONE_HOST);
  expect(partnerTwoBaseUrl.protocol).toBe("https:");
  expect(partnerTwoBaseUrl.hostname).toBe(EXPECTED_PARTNER_TWO_HOST);
  expect(partnerBaseUrl.hostname).not.toBe(EXPECTED_STAGING_HOST);
  expect(partnerTwoBaseUrl.hostname).not.toBe(partnerBaseUrl.hostname);
  expect(process.env.DEALFLOW_DEPLOYMENT_TARGET).toBe("staging");
  expect(process.env.STAGING_ACCEPTANCE_EXECUTION).toBe("true");
  expect(process.env.STAGING_ACCEPTANCE_ZERO_EXTERNAL_EFFECTS_ATTESTATION)
    .toBe(ZERO_EXTERNAL_EFFECTS_ATTESTATION);
  const projectRef = requiredEnvironment("QA_ISOLATED_SUPABASE_PROJECT_REF");
  expect(projectRef).toMatch(new RegExp(`${EXPECTED_SUPABASE_SAFE_SUFFIX}$`));
  expect(sha256(projectRef)).toBe(EXPECTED_SUPABASE_FINGERPRINT);
  expect(requiredEnvironment("STAGING_QA_PASSWORD").length).toBeGreaterThanOrEqual(16);
  expect(Object.keys(browserSessionBundle(15 * 60).roles).sort())
    .toEqual(Object.keys(ROLE_EMAILS).sort());
  expect(requiredEnvironment("STAGING_TURNSTILE_TEST_SITE_KEY"))
    .toBe("1x00000000000000000000AA");
  expect(requiredEnvironment("STAGING_ACCESS_GATE_SECRET").length)
    .toBeGreaterThanOrEqual(43);
}

async function installFailClosedNetworkBoundary(page: Page) {
  const diagnostics: Diagnostics = {
    blockedMutations: [],
    forbiddenHosts: [],
    blockedWebSockets: [],
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    serverErrors: [],
  };
  const context = page.context();
  diagnosticsByPage.set(page, diagnostics);
  const allowedApplicationOrigins = new Set([
    new URL(requiredEnvironment("STAGING_ACCEPTANCE_BASE_URL")).origin,
    new URL(requiredEnvironment("STAGING_ACCEPTANCE_PARTNER_BASE_URL")).origin,
    new URL(requiredEnvironment("STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL")).origin,
  ]);
  let activeApplicationOrigin: string | null = null;

  await context.addCookies(
    stagingAccessCookiesForOrigins({
      applicationOrigins: [...allowedApplicationOrigins],
      stagingAccessGateSecret: requiredEnvironment("STAGING_ACCESS_GATE_SECRET"),
    }),
  );

  await installBrowserContextNetworkBoundary(context, {
    handleHttpRoute: async (unknownRoute) => {
      const route = unknownRoute as Route;
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method().toUpperCase();
      const isExactTopLevelNavigation =
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame() &&
        url.username === "" &&
        url.password === "" &&
        allowedApplicationOrigins.has(url.origin);
      if (isExactTopLevelNavigation && activeApplicationOrigin === null) {
        activeApplicationOrigin = url.origin;
      }
      const sameOrigin =
        url.origin === activeApplicationOrigin &&
        url.username === "" &&
        url.password === "";
      const exactProjectRef = requiredEnvironment("QA_ISOLATED_SUPABASE_PROJECT_REF");
      const exactSupabase =
        url.origin === `https://${exactProjectRef}.supabase.co` &&
        url.username === "" &&
        url.password === "";
      const isAllowedAuthRead =
        exactSupabase &&
        ["GET", "HEAD", "OPTIONS"].includes(method) &&
        url.pathname === "/auth/v1/user";
      const isExactPasswordSignIn =
        exactSupabase &&
        method === "POST" &&
        url.pathname === "/auth/v1/token" &&
        url.searchParams.size === 1 &&
        url.searchParams.get("grant_type") === "password";
      const isAllowedAuthRequest = isAllowedAuthRead || isExactPasswordSignIn;
      const exactTurnstileTestRequest = isAllowedStagingTurnstileRequest(
        url.toString(),
        method,
        process.env.STAGING_ACCEPTANCE_EXECUTION === "true" &&
          process.env.STAGING_TURNSTILE_TEST_SITE_KEY === "1x00000000000000000000AA",
      );

      if (!sameOrigin && !isAllowedAuthRequest && !exactTurnstileTestRequest) {
        const record = `${method} ${safeHttpEvidenceTarget(url.toString())}`;
        if (!diagnostics.forbiddenHosts.includes(record)) {
          diagnostics.forbiddenHosts.push(record);
        }
        await route.abort("blockedbyclient");
        return;
      }

      if (
        sameOrigin &&
        method === "POST" &&
        url.pathname === "/api/activation/events"
      ) {
        await route.fulfill({ status: 204, body: "" });
        return;
      }

      if (
        !["GET", "HEAD", "OPTIONS"].includes(method) &&
        !isExactPasswordSignIn &&
        !exactTurnstileTestRequest
      ) {
        diagnostics.blockedMutations.push(`${method} ${url.pathname}`);
        await route.abort("blockedbyclient");
        return;
      }

      await route.continue();
    },
    recordBlockedWebSocket: (url) => {
      diagnostics.blockedWebSockets.push(safeWebSocketEvidenceTarget(url));
    },
  });

  context.on("console", (message) => {
    if (message.type() === "error" && !/ERR_BLOCKED_BY_CLIENT/i.test(message.text())) {
      diagnostics.consoleErrors.push(sanitizeBrowserDiagnostic(message.text()));
    }
  });
  context.on("weberror", (webError) =>
    diagnostics.pageErrors.push(sanitizeBrowserDiagnostic(webError.error().message)));
  context.on("request", (request) => {
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const exactProjectRef = requiredEnvironment("QA_ISOLATED_SUPABASE_PROJECT_REF");
    const exactSupabaseAuth =
      url.origin === `https://${exactProjectRef}.supabase.co` &&
      url.username === "" &&
      url.password === "" &&
      ((["GET", "HEAD", "OPTIONS"].includes(method) && url.pathname === "/auth/v1/user") ||
        (method === "POST" &&
          url.pathname === "/auth/v1/token" &&
          url.searchParams.size === 1 &&
          url.searchParams.get("grant_type") === "password"));
    const exactTurnstileTestRequest = isAllowedStagingTurnstileRequest(
      url.toString(),
      method,
      process.env.STAGING_ACCEPTANCE_EXECUTION === "true" &&
        process.env.STAGING_TURNSTILE_TEST_SITE_KEY === "1x00000000000000000000AA",
    );
    const allowedApplicationRequest =
      allowedApplicationOrigins.has(url.origin) &&
      url.username === "" &&
      url.password === "";
    if (!allowedApplicationRequest && !exactSupabaseAuth && !exactTurnstileTestRequest) {
      const record = `${method} ${safeHttpEvidenceTarget(url.toString())}`;
      if (!diagnostics.forbiddenHosts.includes(record)) {
        // Detect redirect targets that Playwright's route handler cannot
        // preventively intercept after the first routed request.
        diagnostics.forbiddenHosts.push(record);
      }
    }
  });
  context.on("requestfailed", (request) => {
    const failure = `${request.method()} ${safeHttpEvidenceTarget(request.url())} ${sanitizeBrowserDiagnostic(
      request.failure()?.errorText ?? "unknown request failure",
    )}`;
    if (!isExpectedNavigationAbort(failure)) diagnostics.requestFailures.push(failure);
  });
  context.on("response", (response) => {
    if (response.status() >= 500) {
      diagnostics.serverErrors.push(
        `${response.status()} ${safeHttpEvidenceTarget(response.url())}`,
      );
    }
  });
}

function assertDiagnosticsClean(page: Page, testInfo: TestInfo) {
  const diagnostics = diagnosticsByPage.get(page);
  expect(diagnostics, "staging diagnostics were not installed").toBeTruthy();
  expect(
    diagnostics,
    `${testInfo.title}: fail-closed browser diagnostics were not clean`,
  ).toEqual({
    blockedMutations: [],
    forbiddenHosts: [],
    blockedWebSockets: [],
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    serverErrors: [],
  });
}

async function assertHostedZeroEffects(page: Page) {
  const secret = requiredEnvironment("SAFE_E2E_INTERNAL_SECRET");
  const endpoint = new URL(
    "/api/internal/zero-external-effects",
    requiredEnvironment("STAGING_ACCEPTANCE_BASE_URL"),
  );
  expect(endpoint.origin).toBe(`https://${EXPECTED_STAGING_HOST}`);
  const response = await page.request.get(endpoint.toString(), {
    failOnStatusCode: false,
    maxRedirects: 0,
    headers: stagingAppHeaders(endpoint.toString(), {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
    }),
  });
  expect(response.url(), "zero-effects proof must not redirect").toBe(endpoint.toString());
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  expect(response.status(), `zero-effects preflight failed: ${JSON.stringify(body)}`).toBe(200);
  expect(body).toMatchObject({
    ok: true,
    attestation: ZERO_EXTERNAL_EFFECTS_ATTESTATION,
    failedControls: [],
  });
  expect(Number(body?.checkedControlCount)).toBe(EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT);
}

async function credentialSignIn(
  page: Page,
  email: string,
  redirectedFrom: string,
  origin = requiredEnvironment("STAGING_ACCEPTANCE_BASE_URL"),
) {
  const password = requiredEnvironment("STAGING_QA_PASSWORD");
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("redirectedFrom", redirectedFrom);
  await page.goto(loginUrl.toString(), {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByLabel("Password").fill(password);
  const challenge = page.getByText(/verification challenge|verify you are human/i);
  expect(
    await challenge.count(),
    "Turnstile must be disabled for deterministic isolated-staging credential proof",
  ).toBe(0);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);
}

async function openAuthenticatedSession(
  page: Page,
  role: SyntheticRole,
  redirectedFrom: string,
  origin = requiredEnvironment("STAGING_ACCEPTANCE_BASE_URL"),
) {
  const projectRef = requiredEnvironment("QA_ISOLATED_SUPABASE_PROJECT_REF");
  const session = browserSessionBundle().roles[role];
  expect(session.email).toBe(ROLE_EMAILS[role]);
  expect(session.expiresAt - Math.floor(Date.now() / 1000)).toBeGreaterThan(10 * 60);
  const authCookieName = `sb-${projectRef}-auth-token`;
  await page.context().clearCookies({
    name: new RegExp(`^${authCookieName}(?:\\.\\d+)?$`),
  });
  await page.context().addCookies(
    browserCookiesForOrigin(session, new URL(origin).origin, projectRef),
  );
  const response = await page.goto(new URL(redirectedFrom, origin).toString(), {
    waitUntil: "domcontentloaded",
  });
  expect(response, `Authenticated ${role} navigation returned no response`).not.toBeNull();
  expect(response!.status(), `Authenticated ${role} navigation failed`).toBeLessThan(500);
  expect(new URL(page.url()).pathname, `${role} remained unauthenticated`).not.toBe("/login");
}

async function assertNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    results.violations.filter((violation) =>
      violation.impact === "critical" || violation.impact === "serious"),
  ).toEqual([]);
}

test.beforeAll(assertGlobalPreconditions);
test.beforeEach(async ({ page }) => {
  await installFailClosedNetworkBoundary(page);
  await assertHostedZeroEffects(page);
});
test.afterEach(async ({ page }, testInfo) => assertDiagnosticsClean(page, testInfo));

test("new direct realtor is authenticated but remains unpaid and launch-blocked", async ({ page }) => {
  await credentialSignIn(page, ROLE_EMAILS.newDirect, "/paywall");
  const billingResponse = await page.request.get("/api/billing/status", {
    maxRedirects: 0,
    headers: stagingAppHeaders("/api/billing/status"),
  });
  const billing = await billingResponse.json() as Record<string, unknown>;
  expect(billingResponse.status()).toBe(200);
  expect(billing.commerciallyActivated).toBe(false);
  expect(billing.launchAllowed).toBe(false);
  expect(billing.launchOverride).toBe(false);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("paid direct realtor sees exact Pro activation and seeded campaign truth", async ({ page }) => {
  await openAuthenticatedSession(page, "paidDirect", "/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const billingResponse = await page.request.get("/api/billing/status", {
    maxRedirects: 0,
    headers: stagingAppHeaders("/api/billing/status"),
  });
  const billing = await billingResponse.json() as Record<string, unknown>;
  expect(billingResponse.status()).toBe(200);
  expect(billing).toMatchObject({
    planTier: "pro",
    subscriptionStatus: "active",
    commerciallyActivated: true,
    launchAllowed: true,
    launchOverride: false,
  });
  const campaignResponse = await page.request.get(`/api/campaigns/${PAID_CAMPAIGN_ID}`, {
    maxRedirects: 0,
    headers: stagingAppHeaders(`/api/campaigns/${PAID_CAMPAIGN_ID}`),
  });
  expect(campaignResponse.status()).toBe(200);
  for (const providerBoundaryPath of [
    "/api/integrations/meta/status",
    `/api/campaigns/${PAID_CAMPAIGN_ID}/meta-activation`,
    `/api/campaigns/${PAID_CAMPAIGN_ID}/optimization-policy`,
  ]) {
    const providerBoundary = await page.request.get(providerBoundaryPath, {
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: stagingAppHeaders(providerBoundaryPath),
    });
    expect(providerBoundary.status(), providerBoundaryPath).toBeLessThan(500);
    const body = await providerBoundary.text();
    expect(body).not.toMatch(/access_token|refresh_token|client_secret|private_key/i);
  }
  await assertNoSeriousAccessibilityViolations(page);
});

test("hosted reporting renders fresh stale and failed-refresh truth without false zeros", async ({ page }) => {
  await openAuthenticatedSession(page, "paidDirect", "/dashboard");
  for (const [campaignId, expectedLabel] of [
    [PAID_CAMPAIGN_ID, "Confirmed in Meta"],
    [STALE_REPORTING_CAMPAIGN_ID, "Confirmed state is stale"],
    [FAILED_REPORTING_CAMPAIGN_ID, "Showing last confirmed Meta data"],
  ] as const) {
    const response = await page.goto(`/dashboard?campaignId=${campaignId}`, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByText(expectedLabel, { exact: true })).toBeVisible();
  }
  const failedDashboard = await page.request.get(
    `/api/dashboard?campaignId=${FAILED_REPORTING_CAMPAIGN_ID}`,
    {
      maxRedirects: 0,
      headers: stagingAppHeaders(`/api/dashboard?campaignId=${FAILED_REPORTING_CAMPAIGN_ID}`),
    },
  );
  expect(failedDashboard.status()).toBe(200);
  const failedBody = await failedDashboard.json() as {
    metrics?: { totalSpend?: number };
    chartSeries?: Array<{ leads?: number }>;
  };
  expect(failedBody.metrics?.totalSpend).toBe(42);
  expect(failedBody.chartSeries?.at(-1)?.leads).toBe(4);
});

test("EN FR ES public product routes preserve language accessibility keyboard reduced-motion and 200-percent zoom", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [locale, copy] of Object.entries(LOCALIZED_PRODUCT_COPY)) {
    await page.goto(`/${locale}/login`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("button", { name: copy.signIn, exact: true })).toBeVisible();
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);

    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      return {
        tag: element.tagName,
        text: element.textContent?.trim().slice(0, 120) ?? "",
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    expect(focused, `${locale} login must expose a keyboard target`).not.toBeNull();
    expect(
      focused?.outlineStyle !== "none" && focused?.outlineWidth !== "0px",
      `${locale} first keyboard target must retain a visible focus outline: ${JSON.stringify(focused)}`,
    ).toBe(true);

    await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });
    await expect(page.getByRole("button", { name: copy.signIn, exact: true })).toBeVisible();
    await assertNoSeriousAccessibilityViolations(page);
    await page.evaluate(() => {
      document.documentElement.style.zoom = "";
    });
  }
});

test("public funnel renders the official staging Turnstile test widget without submitting a lead", async ({ page }) => {
  const response = await page.goto("/f/df-staging-20260712-funnel", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Tell us where to send your options" }))
    .toBeVisible();
  await expect(page.getByLabel("Human verification")).toBeVisible();
  const submit = page.getByRole("button", { name: "Learn More" });
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  expect(diagnosticsByPage.get(page)?.blockedMutations).toEqual([]);
});

test("paid realtor can use authenticated EN FR ES dashboards without mixed-language headings", async ({ page }) => {
  await openAuthenticatedSession(page, "paidDirect", "/dashboard");
  for (const [locale, copy] of Object.entries(LOCALIZED_PRODUCT_COPY)) {
    const response = await page.goto(`/${locale}/dashboard`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { level: 1, name: copy.dashboard, exact: true })).toBeVisible();
    for (const [otherLocale, otherCopy] of Object.entries(LOCALIZED_PRODUCT_COPY)) {
      if (otherLocale !== locale && otherCopy.dashboard !== copy.dashboard) {
        await expect(page.getByRole("heading", { level: 1, name: otherCopy.dashboard, exact: true })).toHaveCount(0);
      }
    }
    await assertNoSeriousAccessibilityViolations(page);
  }
});

test("grandfathered legacy realtor retains reconciled active entitlement", async ({ page }) => {
  await openAuthenticatedSession(page, "legacy", "/dashboard");
  const billingResponse = await page.request.get("/api/billing/status", {
    maxRedirects: 0,
    headers: stagingAppHeaders("/api/billing/status"),
  });
  const billing = await billingResponse.json() as Record<string, unknown>;
  expect(billingResponse.status()).toBe(200);
  expect(billing).toMatchObject({
    planTier: "growth",
    subscriptionStatus: "active",
    commerciallyActivated: true,
    launchAllowed: true,
    launchOverride: false,
  });
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
});

test("white-label child receives attributed branding across core product routes", async ({ page }) => {
  const partnerOrigin = requiredEnvironment("STAGING_ACCEPTANCE_PARTNER_BASE_URL");
  await page.goto(new URL("/login", partnerOrigin).toString(), { waitUntil: "domcontentloaded" });
  await expect(page.getByText(PARTNER_BRAND_NAME, { exact: false }).first()).toBeVisible();
  await openAuthenticatedSession(page, "partnerChild", "/dashboard", partnerOrigin);
  for (const path of ["/dashboard", "/builder", "/launch", "/results", "/support"]) {
    const response = await page.goto(new URL(path, partnerOrigin).toString(), {
      waitUntil: "domcontentloaded",
    });
    expect(response, `${path} returned no document response`).not.toBeNull();
    expect(response!.status(), `${path} returned a server failure`).toBeLessThan(500);
    await expect(page.getByText(PARTNER_BRAND_NAME, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(PARTNER_TWO_BRAND_NAME, { exact: false })).toHaveCount(0);
  }
  const partnerCampaignsUrl = new URL("/api/campaigns", partnerOrigin).toString();
  const campaigns = await page.request.get(partnerCampaignsUrl, {
    maxRedirects: 0,
    headers: stagingAppHeaders(partnerCampaignsUrl),
  });
  expect(campaigns.status()).toBe(200);
  const campaignBody = await campaigns.text();
  expect(campaignBody).toContain(PARTNER_ONE_CAMPAIGN_ID);
  expect(campaignBody).not.toContain(PARTNER_TWO_CAMPAIGN_ID);
});

test("second white-label child receives only partner-two branding and tenant data", async ({ page }) => {
  const partnerOrigin = requiredEnvironment("STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL");
  await page.goto(new URL("/login", partnerOrigin).toString(), { waitUntil: "domcontentloaded" });
  await expect(page.getByText(PARTNER_TWO_BRAND_NAME, { exact: false }).first()).toBeVisible();
  await expect(page.getByText(PARTNER_BRAND_NAME, { exact: false })).toHaveCount(0);
  await openAuthenticatedSession(page, "partnerChildTwo", "/dashboard", partnerOrigin);
  for (const path of ["/dashboard", "/builder", "/launch", "/results", "/support"]) {
    const response = await page.goto(new URL(path, partnerOrigin).toString(), {
      waitUntil: "domcontentloaded",
    });
    expect(response, `${path} returned no document response`).not.toBeNull();
    expect(response!.status(), `${path} returned a server failure`).toBeLessThan(500);
    await expect(page.getByText(PARTNER_TWO_BRAND_NAME, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(PARTNER_BRAND_NAME, { exact: false })).toHaveCount(0);
  }
  const partnerCampaignsUrl = new URL("/api/campaigns", partnerOrigin).toString();
  const campaigns = await page.request.get(partnerCampaignsUrl, {
    maxRedirects: 0,
    headers: stagingAppHeaders(partnerCampaignsUrl),
  });
  expect(campaigns.status()).toBe(200);
  const campaignBody = await campaigns.text();
  expect(campaignBody).toContain(PARTNER_TWO_CAMPAIGN_ID);
  expect(campaignBody).not.toContain(PARTNER_ONE_CAMPAIGN_ID);
});

test("partner admin authenticates without gaining an unassigned customer workspace", async ({ page }) => {
  await openAuthenticatedSession(
    page,
    "partnerAdmin",
    "/dashboard",
    requiredEnvironment("STAGING_ACCEPTANCE_PARTNER_BASE_URL"),
  );
  const campaigns = await page.request.get(
    new URL(
      "/api/campaigns",
      requiredEnvironment("STAGING_ACCEPTANCE_PARTNER_BASE_URL"),
    ).toString(),
    {
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: stagingAppHeaders(
        new URL(
          "/api/campaigns",
          requiredEnvironment("STAGING_ACCEPTANCE_PARTNER_BASE_URL"),
        ).toString(),
      ),
    },
  );
  expect([200, 401, 403, 404]).toContain(campaigns.status());
  expect(await campaigns.text()).not.toContain("DF-STAGING-20260712 Toronto Buyer Campaign");
});

test("second partner admin authenticates without gaining a child customer workspace", async ({ page }) => {
  await openAuthenticatedSession(
    page,
    "partnerAdminTwo",
    "/dashboard",
    requiredEnvironment("STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL"),
  );
  const campaigns = await page.request.get(
    new URL(
      "/api/campaigns",
      requiredEnvironment("STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL"),
    ).toString(),
    {
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: stagingAppHeaders(
        new URL(
          "/api/campaigns",
          requiredEnvironment("STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL"),
        ).toString(),
      ),
    },
  );
  expect([200, 401, 403, 404]).toContain(campaigns.status());
  const body = await campaigns.text();
  expect(body).not.toContain(PARTNER_ONE_CAMPAIGN_ID);
  expect(body).not.toContain(PARTNER_TWO_CAMPAIGN_ID);
});

test("internal operator reaches the command center without provider execution", async ({ page }) => {
  await openAuthenticatedSession(page, "operator", "/admin/command-center");
  await expect(page.getByRole("heading", { level: 1, name: /DealFlow control room/i })).toBeVisible();
  await expect(page.getByText(/Meta provider proof/i)).toBeVisible();
  await expect(page.getByText("not queried", { exact: true })).toBeVisible();
});

test("cross-tenant attacker cannot read the paid realtor campaign", async ({ page }) => {
  await openAuthenticatedSession(page, "attacker", "/dashboard");
  const direct = await page.request.get(`/api/campaigns/${PAID_CAMPAIGN_ID}`, {
    failOnStatusCode: false,
    maxRedirects: 0,
    headers: stagingAppHeaders(`/api/campaigns/${PAID_CAMPAIGN_ID}`),
  });
  expect([403, 404]).toContain(direct.status());
  expect(await direct.text()).not.toContain("DF-STAGING-20260712 Toronto Buyer Campaign");
  const list = await page.request.get("/api/campaigns", {
    failOnStatusCode: false,
    maxRedirects: 0,
    headers: stagingAppHeaders("/api/campaigns"),
  });
  expect(list.status()).toBe(200);
  expect(await list.text()).not.toContain(PAID_CAMPAIGN_ID);
});

test("account-deletion realtor is suspended from product and API access", async ({ page }) => {
  await openAuthenticatedSession(page, "deletion", "/dashboard");
  const current = new URL(page.url());
  expect(current.pathname).toBe("/data-deletion");
  expect(current.searchParams.get("reason")).toBe("account_suspended");

  const billing = await page.request.get("/api/billing/status", {
    failOnStatusCode: false,
    maxRedirects: 0,
    headers: stagingAppHeaders("/api/billing/status"),
  });
  expect(billing.status()).toBe(423);
  expect(await billing.json()).toMatchObject({
    code: "account_deletion_workspace_suspended",
    nextPath: "/data-deletion",
  });
});
