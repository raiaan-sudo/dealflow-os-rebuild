import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";

const EXPECTED_STAGING_HOST = "dealflow-os-rebuild-selfserve-clean.vercel.app";
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
const OPERATOR_EMAIL = "dealflow-staging-operator-20260712@example.com";
const LOCALIZED_PRODUCT_COPY = Object.freeze({
  en: Object.freeze({ signIn: "Sign in", dashboard: "Dashboard" }),
  fr: Object.freeze({ signIn: "Se connecter", dashboard: "Tableau de bord" }),
  es: Object.freeze({ signIn: "Iniciar sesión", dashboard: "Panel" }),
});

const ROLE_EMAILS = Object.freeze({
  newDirect: "dealflow-staging-new-direct-20260712@example.com",
  paidDirect: "dealflow-staging-20260712@example.com",
  legacy: "dealflow-staging-legacy-20260712@example.com",
  partnerAdmin: "dealflow-staging-partner-admin-20260712@example.com",
  partnerChild: "dealflow-staging-partner-child-20260712@example.com",
  partnerAdminTwo: "dealflow-staging-partner-two-admin-20260712@example.com",
  partnerChildTwo: "dealflow-staging-partner-two-child-20260712@example.com",
  operator: OPERATOR_EMAIL,
  attacker: "dealflow-staging-attacker-20260712@example.com",
});

type Diagnostics = {
  blockedMutations: string[];
  forbiddenHosts: string[];
  consoleErrors: string[];
  pageErrors: string[];
  serverErrors: string[];
};

const diagnosticsByPage = new WeakMap<Page, Diagnostics>();

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  expect(value, `${name} is required for staging acceptance`).toBeTruthy();
  return value!;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
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
  expect(partnerBaseUrl.hostname).not.toBe(EXPECTED_STAGING_HOST);
  expect(partnerBaseUrl.hostname).toMatch(
    /^dealflow-os-rebuild-selfserve-clean-.+\.vercel\.app$/,
  );
  expect(partnerTwoBaseUrl.protocol).toBe("https:");
  expect(partnerTwoBaseUrl.hostname)
    .toBe("dealflow-os-rebuild-selfserve-clean-partner-two-qibh.vercel.app");
  expect(partnerTwoBaseUrl.hostname).not.toBe(partnerBaseUrl.hostname);
  expect(process.env.DEALFLOW_DEPLOYMENT_TARGET).toBe("staging");
  expect(process.env.STAGING_ACCEPTANCE_EXECUTION).toBe("true");
  expect(process.env.STAGING_ACCEPTANCE_ZERO_EXTERNAL_EFFECTS_ATTESTATION)
    .toBe(ZERO_EXTERNAL_EFFECTS_ATTESTATION);
  const projectRef = requiredEnvironment("QA_ISOLATED_SUPABASE_PROJECT_REF");
  expect(projectRef).toMatch(new RegExp(`${EXPECTED_SUPABASE_SAFE_SUFFIX}$`));
  expect(sha256(projectRef)).toBe(EXPECTED_SUPABASE_FINGERPRINT);
  expect(requiredEnvironment("STAGING_QA_PASSWORD").length).toBeGreaterThanOrEqual(16);
  expect(requiredEnvironment("PARTNER_ATTRIBUTION_SIGNING_SECRET").length)
    .toBeGreaterThanOrEqual(32);
  const admins = requiredEnvironment("INTERNAL_ADMIN_EMAILS")
    .split(",")
    .map((value) => value.trim().toLowerCase());
  expect(admins).toContain(OPERATOR_EMAIL);
}

async function installFailClosedNetworkBoundary(page: Page) {
  const diagnostics: Diagnostics = {
    blockedMutations: [],
    forbiddenHosts: [],
    consoleErrors: [],
    pageErrors: [],
    serverErrors: [],
  };
  diagnosticsByPage.set(page, diagnostics);

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const allowedStagingHosts = new Set([
      EXPECTED_STAGING_HOST,
      new URL(requiredEnvironment("STAGING_ACCEPTANCE_PARTNER_BASE_URL")).hostname,
      new URL(requiredEnvironment("STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL")).hostname,
    ]);
    const sameOrigin = allowedStagingHosts.has(url.hostname);
    const exactProjectRef = requiredEnvironment("QA_ISOLATED_SUPABASE_PROJECT_REF");
    const exactSupabase =
      url.protocol === "https:" &&
      url.hostname === `${exactProjectRef}.supabase.co`;
    const isAuthRequest = exactSupabase && url.pathname.startsWith("/auth/v1/");

    if (!sameOrigin && !exactSupabase) {
      diagnostics.forbiddenHosts.push(`${method} ${url.origin}${url.pathname}`);
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

    if (!["GET", "HEAD", "OPTIONS"].includes(method) && !isAuthRequest) {
      diagnostics.blockedMutations.push(`${method} ${url.pathname}`);
      await route.abort("blockedbyclient");
      return;
    }

    await route.continue();
  });

  page.on("console", (message) => {
    if (message.type() === "error" && !/ERR_BLOCKED_BY_CLIENT/i.test(message.text())) {
      diagnostics.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      diagnostics.serverErrors.push(`${response.status()} ${response.url()}`);
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
    consoleErrors: [],
    pageErrors: [],
    serverErrors: [],
  });
}

async function assertHostedZeroEffects(page: Page) {
  const secret = requiredEnvironment("STAGING_ACCEPTANCE_INTERNAL_SECRET");
  const response = await page.request.get("/api/internal/zero-external-effects", {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  expect(response.status(), `zero-effects preflight failed: ${JSON.stringify(body)}`).toBe(200);
  expect(body).toMatchObject({
    ok: true,
    attestation: ZERO_EXTERNAL_EFFECTS_ATTESTATION,
    failedControls: [],
  });
  expect(Number(body?.checkedControlCount)).toBe(EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT);
}

async function signIn(
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
  await signIn(page, ROLE_EMAILS.newDirect, "/paywall");
  const billingResponse = await page.request.get("/api/billing/status");
  const billing = await billingResponse.json() as Record<string, unknown>;
  expect(billingResponse.status()).toBe(200);
  expect(billing.commerciallyActivated).toBe(false);
  expect(billing.launchAllowed).toBe(false);
  expect(billing.launchOverride).toBe(false);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("paid direct realtor sees exact Pro activation and seeded campaign truth", async ({ page }) => {
  await signIn(page, ROLE_EMAILS.paidDirect, "/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const billingResponse = await page.request.get("/api/billing/status");
  const billing = await billingResponse.json() as Record<string, unknown>;
  expect(billingResponse.status()).toBe(200);
  expect(billing).toMatchObject({
    planTier: "pro",
    subscriptionStatus: "active",
    commerciallyActivated: true,
    launchAllowed: true,
    launchOverride: false,
  });
  const campaignResponse = await page.request.get(`/api/campaigns/${PAID_CAMPAIGN_ID}`);
  expect(campaignResponse.status()).toBe(200);
  for (const providerBoundaryPath of [
    "/api/integrations/meta/status",
    `/api/campaigns/${PAID_CAMPAIGN_ID}/meta-activation`,
    `/api/campaigns/${PAID_CAMPAIGN_ID}/optimization-policy`,
  ]) {
    const providerBoundary = await page.request.get(providerBoundaryPath, {
      failOnStatusCode: false,
    });
    expect(providerBoundary.status(), providerBoundaryPath).toBeLessThan(500);
    const body = await providerBoundary.text();
    expect(body).not.toMatch(/access_token|refresh_token|client_secret|private_key/i);
  }
  await assertNoSeriousAccessibilityViolations(page);
});

test("hosted reporting renders fresh stale and failed-refresh truth without false zeros", async ({ page }) => {
  await signIn(page, ROLE_EMAILS.paidDirect, "/dashboard");
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

test("paid realtor can use authenticated EN FR ES dashboards without mixed-language headings", async ({ page }) => {
  await signIn(page, ROLE_EMAILS.paidDirect, "/dashboard");
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
  await signIn(page, ROLE_EMAILS.legacy, "/dashboard");
  const billingResponse = await page.request.get("/api/billing/status");
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
  await signIn(page, ROLE_EMAILS.partnerChild, "/dashboard", partnerOrigin);
  for (const path of ["/dashboard", "/builder", "/launch", "/results", "/support"]) {
    const response = await page.goto(new URL(path, partnerOrigin).toString(), {
      waitUntil: "domcontentloaded",
    });
    expect(response, `${path} returned no document response`).not.toBeNull();
    expect(response!.status(), `${path} returned a server failure`).toBeLessThan(500);
    await expect(page.getByText(PARTNER_BRAND_NAME, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(PARTNER_TWO_BRAND_NAME, { exact: false })).toHaveCount(0);
  }
  const campaigns = await page.request.get(new URL("/api/campaigns", partnerOrigin).toString());
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
  await signIn(page, ROLE_EMAILS.partnerChildTwo, "/dashboard", partnerOrigin);
  for (const path of ["/dashboard", "/builder", "/launch", "/results", "/support"]) {
    const response = await page.goto(new URL(path, partnerOrigin).toString(), {
      waitUntil: "domcontentloaded",
    });
    expect(response, `${path} returned no document response`).not.toBeNull();
    expect(response!.status(), `${path} returned a server failure`).toBeLessThan(500);
    await expect(page.getByText(PARTNER_TWO_BRAND_NAME, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(PARTNER_BRAND_NAME, { exact: false })).toHaveCount(0);
  }
  const campaigns = await page.request.get(new URL("/api/campaigns", partnerOrigin).toString());
  expect(campaigns.status()).toBe(200);
  const campaignBody = await campaigns.text();
  expect(campaignBody).toContain(PARTNER_TWO_CAMPAIGN_ID);
  expect(campaignBody).not.toContain(PARTNER_ONE_CAMPAIGN_ID);
});

test("partner admin authenticates without gaining an unassigned customer workspace", async ({ page }) => {
  await signIn(
    page,
    ROLE_EMAILS.partnerAdmin,
    "/dashboard",
    requiredEnvironment("STAGING_ACCEPTANCE_PARTNER_BASE_URL"),
  );
  const campaigns = await page.request.get(
    new URL(
      "/api/campaigns",
      requiredEnvironment("STAGING_ACCEPTANCE_PARTNER_BASE_URL"),
    ).toString(),
    { failOnStatusCode: false },
  );
  expect([200, 401, 403, 404]).toContain(campaigns.status());
  expect(await campaigns.text()).not.toContain("DF-STAGING-20260712 Toronto Buyer Campaign");
});

test("second partner admin authenticates without gaining a child customer workspace", async ({ page }) => {
  await signIn(
    page,
    ROLE_EMAILS.partnerAdminTwo,
    "/dashboard",
    requiredEnvironment("STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL"),
  );
  const campaigns = await page.request.get(
    new URL(
      "/api/campaigns",
      requiredEnvironment("STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL"),
    ).toString(),
    { failOnStatusCode: false },
  );
  expect([200, 401, 403, 404]).toContain(campaigns.status());
  const body = await campaigns.text();
  expect(body).not.toContain(PARTNER_ONE_CAMPAIGN_ID);
  expect(body).not.toContain(PARTNER_TWO_CAMPAIGN_ID);
});

test("internal operator reaches the command center without provider execution", async ({ page }) => {
  await signIn(page, ROLE_EMAILS.operator, "/admin/command-center");
  await expect(page.getByRole("heading", { level: 1, name: /DealFlow control room/i })).toBeVisible();
  await expect(page.getByText(/Meta provider proof/i)).toBeVisible();
  await expect(page.getByText("not queried", { exact: true })).toBeVisible();
});

test("cross-tenant attacker cannot read the paid realtor campaign", async ({ page }) => {
  await signIn(page, ROLE_EMAILS.attacker, "/dashboard");
  const direct = await page.request.get(`/api/campaigns/${PAID_CAMPAIGN_ID}`, {
    failOnStatusCode: false,
  });
  expect([403, 404]).toContain(direct.status());
  expect(await direct.text()).not.toContain("DF-STAGING-20260712 Toronto Buyer Campaign");
  const list = await page.request.get("/api/campaigns", { failOnStatusCode: false });
  expect(list.status()).toBe(200);
  expect(await list.text()).not.toContain(PAID_CAMPAIGN_ID);
});
