import {
  expect,
  test,
  type Page,
  type Request,
  type Response,
  type Route,
  type TestInfo,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";

import {
  ZERO_EXTERNAL_EFFECTS_ATTESTATION,
  assertZeroExternalEffectsEnvironment,
} from "../../src/lib/safety/zero-external-effects";
import {
  browserCookiesForOrigin,
  isAllowedStagingTurnstileRequest,
  parseSyntheticBrowserSessionBundle,
} from "../../scripts/staging/browser-session-bundle-contract.mjs";
import {
  EXPECTED_HOSTED_SAFE_BROWSER_ORIGIN,
  assertExactHostedSafeBrowserOrigin,
} from "../../scripts/staging/safe-browser-host-contract.mjs";
import {
  exactVercelAutomationProtectionPortfolio,
  installBrowserContextNetworkBoundary,
  isExactLocalNextDevelopmentWebSocket,
  primeVercelAutomationBypassCookies,
  safeHttpEvidenceTarget,
  safeWebSocketEvidenceTarget,
  scopedStagingAccessHeaders,
  stagingAccessCookiesForOrigins,
  STAGING_ACCESS_HEADER,
} from "../../scripts/staging/browser-context-network-boundary.mjs";
import {
  classifyAbortedInterceptedTelemetry,
  isExpectedNavigationAbort,
  sanitizedTelemetryPurposeFingerprint,
} from "./expected-navigation-abort.mjs";
import { isExpectedCanceledHomepagePrefetch } from "./expected-next-prefetch-abort.mjs";

const DEFAULT_BASE_URL = "http://127.0.0.1:3410";
const BASE_URL = process.env.SAFE_E2E_BASE_URL?.trim() || DEFAULT_BASE_URL;
const HOSTED_ACCEPTANCE = Boolean(process.env.SAFE_E2E_BASE_URL?.trim());
const AUTHENTICATED_STAGING_PROOF_ENABLED = process.env.SAFE_E2E_QA_AUTH === "true";
const EXPECTED_STAGING_SAFE_SUFFIX = "qibh";
const EXPECTED_STAGING_PROJECT_FINGERPRINT =
  "c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c";
const CAMPAIGN_UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ALLOWED_LAUNCH_PATHNAMES = new Set([
  "/launch",
  "/en/launch",
  "/fr/launch",
  "/es/launch",
]);
const SAFE_SYNTHETIC_ROLE_EMAILS = Object.freeze({
  paidDirect: "dealflow-staging-20260712@example.com",
});
let cachedSafeBrowserSessionBundle: {
  roles: Record<"paidDirect", {
    userId: string;
    email: string;
    expiresAt: number;
    cookies: Array<{ name: string; value: string }>;
  }>;
} | null = null;

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PRODUCTION_HOSTS = new Set([
  "agentdealflow.io",
  "www.agentdealflow.io",
  "app.agentdealflow.io",
  "internal.agentdealflow.io",
  "clicktoscale.agentdealflow.io",
  "onboarding.agentdealflow.io",
]);
const PUBLIC_LINK_ALLOWLIST = new Set([
  "/",
  "/login",
  "/signup",
  "/privacy",
  "/terms",
  "/data-deletion",
]);

type BrowserDiagnostics = {
  consoleErrors: string[];
  hydrationFailures: string[];
  pageErrors: string[];
  requestFailures: string[];
  serverFailures: string[];
  forbiddenHosts: string[];
  forbiddenMutations: string[];
  blockedWebSockets: string[];
  allowedDevelopmentWebSockets: string[];
  allowedDraftWrites: string[];
  interceptedTelemetry: string[];
  abortedTelemetryCandidates: Array<{
    requestClass: "locally_intercepted_activation_telemetry";
    method: "POST";
    errorText: "net::ERR_ABORTED";
    isNavigationRequest: false;
    target: string;
    resourceType: string;
    initiatorPath: string;
    elapsedMs: number;
    telemetrySequence: number;
    navigationSequenceAtStart: number;
    purposeFingerprint: string | null;
    interceptedBeforeNetwork: boolean;
  }>;
  successfulTelemetryRequests: Array<{
    telemetrySequence: number;
    purposeFingerprint: string;
    status: number;
  }>;
  telemetryRequestCount: number;
  mainFrameNavigationCount: number;
  onboardingPersistenceProven: boolean;
  onboardingUserVisibleErrorCount: number | null;
};

const diagnosticsByPage = new WeakMap<Page, BrowserDiagnostics>();

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizeBrowserDiagnostic(value: string) {
  return String(value)
    .replace(/(?:https?|wss?):\/\/[^\s"'`<>]+/gi, (url) => safeHttpEvidenceTarget(url))
    .replace(/Bearer\s+[^\s"'`<>]+/gi, "Bearer [REDACTED]")
    .replace(/x-vercel-protection-bypass\s*[:=]\s*[^\s"'`<>]+/gi, "x-vercel-protection-bypass=[REDACTED]")
    .replace(/_vercel_jwt=[^\s;"'`<>]+/gi, "_vercel_jwt=[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
    .replace(/sb-[a-z0-9-]+-auth-token(?:\.\d+)?=[^\s;]+/gi, "sb-[REDACTED]-auth-token=[REDACTED]")
    .slice(0, 2_000);
}

function getStagingAccessGateSecret() {
  const secret = process.env.STAGING_ACCESS_GATE_SECRET?.trim() ?? "";
  if (HOSTED_ACCEPTANCE && secret.length < 43) {
    throw new Error("Hosted safe browser proof requires the isolated staging access gate");
  }
  return secret;
}

function getVercelAutomationBypassSecret(required: boolean) {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
  if (
    HOSTED_ACCEPTANCE &&
    (required
      ? secret.length < 32 ||
        secret.trim() !== secret ||
        !/^[\x21-\x7e]+$/.test(secret)
      : secret !== "")
  ) {
    throw new Error("Hosted safe browser proof has inexact Vercel automation bypass authority");
  }
  return secret;
}

function appRequestHeaders(rawTarget: string, additional: Record<string, string> = {}) {
  const target = new URL(rawTarget, BASE_URL);
  if (
    target.origin !== new URL(BASE_URL).origin ||
    target.username !== "" ||
    target.password !== ""
  ) {
    throw new Error("Safe APIRequestContext request escaped the exact application origin");
  }
  const secret = getStagingAccessGateSecret();
  return scopedStagingAccessHeaders({
    headers: additional,
    rawUrl: target.toString(),
    applicationOrigin: target.origin,
    stagingAccessGateSecret: secret,
  });
}

function pathnameOf(rawUrl: string) {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return rawUrl;
  }
}

function mutationDisposition(method: string, rawUrl: string) {
  const requestUrl = new URL(rawUrl);
  const baseUrl = new URL(BASE_URL);
  const sameOrigin =
    requestUrl.origin === baseUrl.origin &&
    requestUrl.username === "" &&
    requestUrl.password === "";
  const exactProjectRef = process.env.QA_ISOLATED_SUPABASE_PROJECT_REF?.trim();
  const exactSupabaseAuthRead =
    Boolean(exactProjectRef) &&
    requestUrl.origin === `https://${exactProjectRef}.supabase.co` &&
    requestUrl.username === "" &&
    requestUrl.password === "" &&
    requestUrl.pathname === "/auth/v1/user" &&
    ["GET", "HEAD", "OPTIONS"].includes(method);
  const exactTurnstileTestRequest = isAllowedStagingTurnstileRequest(
    requestUrl.toString(),
    method,
    HOSTED_ACCEPTANCE &&
      process.env.STAGING_TURNSTILE_TEST_SITE_KEY === "1x00000000000000000000AA",
  );

  if (!sameOrigin && !exactSupabaseAuthRead && !exactTurnstileTestRequest) {
    return "forbidden_host" as const;
  }
  if (READ_ONLY_METHODS.has(method)) return "read" as const;
  if (exactTurnstileTestRequest) return "read" as const;

  if (
    sameOrigin &&
    method === "PUT" &&
    requestUrl.pathname === "/api/onboarding/plan"
  ) {
    return "synthetic_staging_draft" as const;
  }

  if (
    sameOrigin &&
    method === "POST" &&
    requestUrl.pathname === "/api/activation/events"
  ) {
    return "intercepted_telemetry" as const;
  }

  return "forbidden" as const;
}

async function installSafetyHarness(page: Page) {
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    hydrationFailures: [],
    pageErrors: [],
    requestFailures: [],
    serverFailures: [],
    forbiddenHosts: [],
    forbiddenMutations: [],
    blockedWebSockets: [],
    allowedDevelopmentWebSockets: [],
    allowedDraftWrites: [],
    interceptedTelemetry: [],
    abortedTelemetryCandidates: [],
    successfulTelemetryRequests: [],
    telemetryRequestCount: 0,
    mainFrameNavigationCount: 0,
    onboardingPersistenceProven: false,
    onboardingUserVisibleErrorCount: null,
  };
  const context = page.context();
  const successfulResponseStatusByRequest = new WeakMap<Request, number>();
  const locallyInterceptedTelemetry = new WeakMap<Request, true>();
  const requestLifecycle = new WeakMap<
    Request,
    {
      startedAt: number;
      telemetrySequence: number;
      navigationSequenceAtStart: number;
      purposeFingerprint: string | null;
      initiatorPath: string;
    }
  >();
  diagnosticsByPage.set(page, diagnostics);

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) diagnostics.mainFrameNavigationCount += 1;
  });

  if (HOSTED_ACCEPTANCE) {
    const applicationOrigins = [new URL(BASE_URL).origin];
    const serializedProtectionPortfolio =
      process.env.VERCEL_AUTOMATION_PROTECTION_PORTFOLIO ?? "";
    const protectionPortfolio = exactVercelAutomationProtectionPortfolio({
      applicationOrigins,
      serializedPortfolio: serializedProtectionPortfolio,
    });
    const vercelAutomationBypassRequired = protectionPortfolio.some(
      ({ vercelAutomationBypassRequired: required }) => required,
    );
    await primeVercelAutomationBypassCookies({
      context,
      applicationOrigins,
      serializedProtectionPortfolio,
      vercelAutomationBypassSecret: getVercelAutomationBypassSecret(
        vercelAutomationBypassRequired,
      ),
    });
    await context.addCookies(
      stagingAccessCookiesForOrigins({
        applicationOrigins,
        stagingAccessGateSecret: getStagingAccessGateSecret(),
      }),
    );
  }

  // Prevent side effects, not merely detect them after the fact. Only the
  // synthetic onboarding-draft path may write through browser traffic;
  // telemetry is fulfilled locally without reaching the application. Install
  // on BrowserContext so popups and every later page inherit the same policy.
  await installBrowserContextNetworkBoundary(context, {
    handleHttpRoute: async (unknownRoute) => {
      const route = unknownRoute as Route;
      const request = route.request();
      const method = request.method().toUpperCase();
      const disposition = mutationDisposition(method, request.url());
      const record = `${method} ${safeHttpEvidenceTarget(request.url())}`;
      if (disposition === "intercepted_telemetry") {
        locallyInterceptedTelemetry.set(request, true);
        diagnostics.interceptedTelemetry.push(record);
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      if (disposition === "forbidden_host") {
        if (!diagnostics.forbiddenHosts.includes(record)) {
          diagnostics.forbiddenHosts.push(record);
        }
        await route.abort("blockedbyclient");
        return;
      }
      if (disposition === "forbidden") {
        if (!diagnostics.forbiddenMutations.includes(record)) {
          diagnostics.forbiddenMutations.push(record);
        }
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    },
    recordBlockedWebSocket: (url) => {
      diagnostics.blockedWebSockets.push(safeWebSocketEvidenceTarget(url));
    },
    allowWebSocket: (url) =>
      !HOSTED_ACCEPTANCE && isExactLocalNextDevelopmentWebSocket(url),
    recordAllowedWebSocket: (url) => {
      diagnostics.allowedDevelopmentWebSockets.push(safeWebSocketEvidenceTarget(url));
    },
  });

  context.on("console", (message) => {
    const text = sanitizeBrowserDiagnostic(message.text());
    if (/hydration|did not match|server rendered html/i.test(text)) {
      diagnostics.hydrationFailures.push(`${message.type()}: ${text}`);
    }
    if (message.type() === "error") {
      diagnostics.consoleErrors.push(text);
    }
  });

  context.on("weberror", (webError) => {
    diagnostics.pageErrors.push(sanitizeBrowserDiagnostic(webError.error().message));
  });

  context.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "unknown request failure";
    const message = `${request.method()} ${safeHttpEvidenceTarget(request.url())} ${
      sanitizeBrowserDiagnostic(errorText)
    }`;
    const expectedNavigationAbort =
      request.isNavigationRequest() && isExpectedNavigationAbort(errorText);
    let frameUrl = "";
    try {
      frameUrl = request.frame().url();
    } catch {
      // A detached frame cannot qualify as the exact homepage prefetch.
    }
    const requestHeaders = request.headers();
    const expectedCanceledHomepagePrefetch = isExpectedCanceledHomepagePrefetch({
      applicationOrigin: new URL(BASE_URL).origin,
      errorText,
      frameUrl,
      isNavigationRequest: request.isNavigationRequest(),
      method: request.method(),
      nextRouterPrefetchHeader: requestHeaders["next-router-prefetch"],
      requestUrl: request.url(),
      resourceType: request.resourceType(),
      rscHeader: requestHeaders.rsc,
      successfulResponseStatus: successfulResponseStatusByRequest.get(request) ?? null,
    });
    const lifecycle = requestLifecycle.get(request);
    const disposition = mutationDisposition(request.method().toUpperCase(), request.url());
    const exactAbortedInterceptedTelemetry =
      disposition === "intercepted_telemetry" &&
      request.method() === "POST" &&
      !request.isNavigationRequest() &&
      ["fetch", "xhr"].includes(request.resourceType()) &&
      errorText === "net::ERR_ABORTED" &&
      lifecycle?.telemetrySequence;
    if (exactAbortedInterceptedTelemetry && lifecycle) {
      diagnostics.abortedTelemetryCandidates.push({
        requestClass: "locally_intercepted_activation_telemetry",
        method: "POST",
        errorText: "net::ERR_ABORTED",
        isNavigationRequest: false,
        target: safeHttpEvidenceTarget(request.url()),
        resourceType: request.resourceType(),
        initiatorPath: lifecycle.initiatorPath,
        elapsedMs: Math.min(Math.max(Date.now() - lifecycle.startedAt, 0), 60_000),
        telemetrySequence: lifecycle.telemetrySequence,
        navigationSequenceAtStart: lifecycle.navigationSequenceAtStart,
        purposeFingerprint: lifecycle.purposeFingerprint,
        interceptedBeforeNetwork: locallyInterceptedTelemetry.get(request) === true,
      });
    } else if (!expectedNavigationAbort && !expectedCanceledHomepagePrefetch) {
      diagnostics.requestFailures.push(message);
    }
  });

  context.on("response", (response) => {
    if (response.status() >= 200 && response.status() < 400) {
      successfulResponseStatusByRequest.set(response.request(), response.status());
      const lifecycle = requestLifecycle.get(response.request());
      if (
        lifecycle?.telemetrySequence &&
        lifecycle.purposeFingerprint &&
        locallyInterceptedTelemetry.get(response.request()) === true
      ) {
        diagnostics.successfulTelemetryRequests.push({
          telemetrySequence: lifecycle.telemetrySequence,
          purposeFingerprint: lifecycle.purposeFingerprint,
          status: response.status(),
        });
      }
    }
    if (response.status() >= 500) {
      diagnostics.serverFailures.push(
        `${response.status()} ${response.request().method()} ${safeHttpEvidenceTarget(response.url())}`,
      );
    }
  });

  context.on("request", (request) => {
    const method = request.method().toUpperCase();
    const disposition = mutationDisposition(method, request.url());
    const record = `${method} ${safeHttpEvidenceTarget(request.url())}`;
    const telemetrySequence = disposition === "intercepted_telemetry"
      ? diagnostics.telemetryRequestCount + 1
      : 0;
    if (telemetrySequence > 0) diagnostics.telemetryRequestCount = telemetrySequence;
    let initiatorPath = "[detached-frame]";
    try {
      initiatorPath = pathnameOf(request.frame().url());
    } catch {
      // Capture the initiator at request start without retaining its full URL.
    }
    requestLifecycle.set(request, {
      startedAt: Date.now(),
      telemetrySequence,
      navigationSequenceAtStart: diagnostics.mainFrameNavigationCount,
      purposeFingerprint: disposition === "intercepted_telemetry"
        ? sanitizedTelemetryPurposeFingerprint(request.postData())
        : null,
      initiatorPath,
    });

    if (
      disposition === "forbidden_host" &&
      !diagnostics.forbiddenHosts.includes(record)
    ) {
      // Redirect targets are observable here even when Playwright does not
      // re-run the route handler for that redirect hop.
      diagnostics.forbiddenHosts.push(record);
    }
    if (
      disposition === "forbidden" &&
      !diagnostics.forbiddenMutations.includes(record)
    ) {
      diagnostics.forbiddenMutations.push(record);
    }
    if (disposition === "synthetic_staging_draft") {
      diagnostics.allowedDraftWrites.push(record);
    }
  });
}

function diagnosticsFor(page: Page) {
  const diagnostics = diagnosticsByPage.get(page);
  if (!diagnostics) throw new Error("Browser safety diagnostics were not installed.");
  return diagnostics;
}

async function assertDiagnosticsClean(page: Page, testInfo: TestInfo) {
  const diagnostics = diagnosticsFor(page);
  const abortedPostClassifications = diagnostics.abortedTelemetryCandidates.map((candidate) =>
    classifyAbortedInterceptedTelemetry({
      candidate,
      completedMainFrameNavigationCount: diagnostics.mainFrameNavigationCount,
      finalPersistedState: diagnostics.onboardingPersistenceProven,
      successfulTelemetryRequests: diagnostics.successfulTelemetryRequests,
      userVisibleErrorCount: diagnostics.onboardingUserVisibleErrorCount,
    }));
  for (const classification of abortedPostClassifications) {
    if (classification.classification === "unproven") {
      diagnostics.requestFailures.push(
        `POST ${classification.target} net::ERR_ABORTED unproven lifecycle ${JSON.stringify(classification)}`,
      );
    }
  }
  if (abortedPostClassifications.length > 0) {
    await testInfo.attach("aborted-post-classification.json", {
      body: Buffer.from(JSON.stringify({
        schemaVersion: "dealflow.safe-browser-aborted-post-classification.v1",
        records: abortedPostClassifications,
      }, null, 2)),
      contentType: "application/json",
    });
  }
  const failures = {
    forbiddenHosts: diagnostics.forbiddenHosts,
    forbiddenMutations: diagnostics.forbiddenMutations,
    blockedWebSockets: diagnostics.blockedWebSockets,
    hydrationFailures: diagnostics.hydrationFailures,
    pageErrors: diagnostics.pageErrors,
    consoleErrors: diagnostics.consoleErrors,
    requestFailures: diagnostics.requestFailures,
    serverFailures: diagnostics.serverFailures,
  };
  const failureCount = Object.values(failures).reduce(
    (count, entries) => count + entries.length,
    0,
  );

  expect(
    failureCount,
    `${testInfo.title}: browser diagnostics were not clean:\n${JSON.stringify(failures, null, 2)}`,
  ).toBe(0);
}

async function gotoAndSettle(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response, `Navigation to ${path} returned no main document response.`).not.toBeNull();
  expect(response!.status(), `Navigation to ${path} failed.`).toBeLessThan(400);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  return response!;
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = root.clientWidth;
    const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
    const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.right > viewportWidth + 2 || rect.left < -2);
      })
      .slice(0, 10)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        id: element.id,
        className: typeof element.className === "string" ? element.className.slice(0, 120) : "",
        rect: element.getBoundingClientRect().toJSON(),
      }));

    return { viewportWidth, scrollWidth, offenders };
  });

  expect(
    overflow.scrollWidth,
    `Horizontal overflow detected: ${JSON.stringify(overflow, null, 2)}`,
  ).toBeLessThanOrEqual(overflow.viewportWidth + 2);
}

async function assertNamedInteractiveControls(page: Page) {
  const unnamed = await page
    .locator("button:visible, a[href]:visible, input:visible, select:visible, textarea:visible")
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const htmlElement = element as HTMLElement;
        const input = element as HTMLInputElement;
        const labelledBy = element.getAttribute("aria-labelledby");
        const labelledByText = labelledBy
          ?.split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
          .join(" ")
          .trim();
        const labels = "labels" in input
          ? Array.from(input.labels ?? []).map((label) => label.textContent?.trim() ?? "").join(" ").trim()
          : "";
        const name = [
          element.getAttribute("aria-label")?.trim(),
          labelledByText,
          labels,
          htmlElement.innerText?.trim(),
          element.getAttribute("title")?.trim(),
          element.getAttribute("alt")?.trim(),
        ].find(Boolean);

        if (name) return [];

        return [
          `${element.tagName.toLowerCase()}#${htmlElement.id || "(no-id)"}.${
            typeof htmlElement.className === "string" ? htmlElement.className.slice(0, 80) : ""
          }`,
        ];
      }),
    );

  expect(unnamed, `Visible interactive controls need accessible names: ${unnamed.join(", ")}`).toEqual([]);
}

async function assertCoreAccessibility(page: Page) {
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await assertNamedInteractiveControls(page);
  const title = (await page.title()).trim();
  expect(title, "Every page must have a non-empty document title.").not.toBe("");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    results.violations,
    `Accessibility violations: ${JSON.stringify(results.violations, null, 2)}`,
  ).toEqual([]);
}

async function assertSkipLinkAndReducedMotion(page: Page) {
  const skipLink = page.locator('a[href^="#"]').filter({ hasText: /skip to/i }).first();
  await expect(skipLink).toBeAttached();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const nonReducedAnimations = await page.locator("body *").evaluateAll((elements) =>
    elements
      .filter((element) => {
        // Next.js injects its development status control into a `nextjs-portal`.
        // It is framework instrumentation, is absent from production builds, and
        // must not be mistaken for application-owned motion.
        if (element.closest("nextjs-portal") || element.getRootNode() !== document) return false;
        const style = getComputedStyle(element);
        const animationMs = style.animationDuration
          .split(",")
          .map((value) => value.trim().endsWith("ms")
            ? Number.parseFloat(value)
            : Number.parseFloat(value) * 1000)
          .some((value) => Number.isFinite(value) && value > 20);
        const transitionMs = style.transitionDuration
          .split(",")
          .map((value) => value.trim().endsWith("ms")
            ? Number.parseFloat(value)
            : Number.parseFloat(value) * 1000)
          .some((value) => Number.isFinite(value) && value > 20);
        return animationMs || transitionMs;
      })
      .slice(0, 10)
      .map((element) => `${element.tagName.toLowerCase()}#${(element as HTMLElement).id}`),
  );
  expect(
    nonReducedAnimations,
    `Reduced-motion mode left long animations/transitions enabled: ${nonReducedAnimations.join(", ")}`,
  ).toEqual([]);
}

async function assertTwoHundredPercentZoom(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width < 1_000) return;
  await page.setViewportSize({
    width: Math.floor(viewport.width / 2),
    height: viewport.height,
  });
  await assertNoHorizontalOverflow(page);
  await assertNamedInteractiveControls(page);
  await page.setViewportSize(viewport);
}

async function assertKeyboardFocus(page: Page) {
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return {
      tag: active?.tagName.toLowerCase() ?? null,
      text: active?.innerText?.trim().slice(0, 100) ?? "",
      focusVisible: active?.matches(":focus-visible") ?? false,
    };
  });
  expect(focus.tag, `Keyboard focus did not leave the document body: ${JSON.stringify(focus)}`).not.toBe("body");
  expect(focus.tag).not.toBeNull();
  expect(focus.focusVisible, `First keyboard target is not focus-visible: ${JSON.stringify(focus)}`).toBe(true);
}

async function assertPublicLinksResolve(page: Page) {
  const hrefs = await page.locator("a[href]").evaluateAll((anchors) =>
    anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
  );
  const baseOrigin = new URL(BASE_URL).origin;
  const safeUrls = Array.from(new Set(hrefs))
    .map((href) => new URL(href))
    .filter(
      (url) =>
        url.origin === baseOrigin &&
        !url.hash &&
        PUBLIC_LINK_ALLOWLIST.has(url.pathname),
    );

  expect(safeUrls.length, "No public same-origin links were available for broken-link proof.").toBeGreaterThan(0);

  for (const url of safeUrls) {
    const response = await page.request.get(url.toString(), {
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: appRequestHeaders(url.toString()),
    });
    expect(response.status(), `Broken public link: ${url.toString()}`).toBeLessThan(400);
  }
}

function safeBrowserSessionBundle() {
  if (cachedSafeBrowserSessionBundle) return cachedSafeBrowserSessionBundle;
  const raw = process.env.STAGING_SYNTHETIC_BROWSER_SESSION_BUNDLE?.trim();
  const projectRef = process.env.QA_ISOLATED_SUPABASE_PROJECT_REF?.trim();
  expect(raw, "The phase-specific safe-browser session bundle is required").toBeTruthy();
  expect(projectRef, "The exact isolated QA Supabase project ref is required").toBeTruthy();
  cachedSafeBrowserSessionBundle = parseSyntheticBrowserSessionBundle(raw!, {
    projectRef: projectRef!,
    projectFingerprint: EXPECTED_STAGING_PROJECT_FINGERPRINT,
    safeSuffix: EXPECTED_STAGING_SAFE_SUFFIX,
    expectedRoleEmails: SAFE_SYNTHETIC_ROLE_EMAILS,
    minimumRemainingLifetimeSeconds: 10 * 60,
  }) as typeof cachedSafeBrowserSessionBundle;
  return cachedSafeBrowserSessionBundle!;
}

function assertAuthenticatedStagingPreconditions() {
  const base = new URL(BASE_URL);
  const exactBase = assertExactHostedSafeBrowserOrigin(BASE_URL);
  const target = process.env.DEALFLOW_DEPLOYMENT_TARGET?.trim().toLowerCase();
  const qaProjectRef = process.env.QA_ISOLATED_SUPABASE_PROJECT_REF?.trim();
  const internalSecret = getInternalQaSecret();

  expect(
    process.env.SAFE_E2E_ZERO_EXTERNAL_EFFECTS_ATTESTATION,
    "The exact isolated-staging zero-external-effects attestation is required.",
  ).toBe(ZERO_EXTERNAL_EFFECTS_ATTESTATION);
  expect(
    ["staging", "preview", "test"],
    "DEALFLOW_DEPLOYMENT_TARGET must explicitly attest a nonproduction target.",
  ).toContain(target);
  expect(exactBase.origin).toBe(EXPECTED_HOSTED_SAFE_BROWSER_ORIGIN);
  expect(PRODUCTION_HOSTS.has(base.hostname.toLowerCase()), "Authenticated proof is blocked on production hosts.").toBe(false);
  expect(process.env.QA_AUTH_HARNESS_ENABLED, "The QA auth harness must be explicitly enabled.").toBe("true");
  expect(qaProjectRef, "The exact isolated QA Supabase project ref is required.").toBeTruthy();
  expect(
    qaProjectRef?.endsWith(EXPECTED_STAGING_SAFE_SUFFIX),
    "The configured QA Supabase project does not match the isolated staging safe suffix.",
  ).toBe(true);
  expect(
    sha256(qaProjectRef ?? ""),
    "The configured QA Supabase project does not match the exact isolated staging fingerprint.",
  ).toBe(EXPECTED_STAGING_PROJECT_FINGERPRINT);
  expect(internalSecret, "A restricted internal QA harness secret is required.").toBeTruthy();
  const protectionPortfolio = exactVercelAutomationProtectionPortfolio({
    applicationOrigins: [exactBase.origin],
    serializedPortfolio:
      process.env.VERCEL_AUTOMATION_PROTECTION_PORTFOLIO ?? "",
  });
  const bypassRequired = protectionPortfolio.some(
    ({ vercelAutomationBypassRequired: required }) => required,
  );
  const browserBypassSecret = getVercelAutomationBypassSecret(bypassRequired);
  if (bypassRequired) {
    expect(browserBypassSecret.length).toBeGreaterThanOrEqual(32);
  } else {
    expect(browserBypassSecret).toBe("");
  }
  expect(getStagingAccessGateSecret().length).toBeGreaterThanOrEqual(43);
  expect(Object.keys(safeBrowserSessionBundle().roles)).toEqual(["paidDirect"]);
}

function getInternalQaSecret() {
  return process.env.SAFE_E2E_INTERNAL_SECRET?.trim() ?? "";
}

async function establishQaHarnessSession(page: Page) {
  const target = new URL("/api/internal/qa-auth-session", BASE_URL);
  if (
    target.origin !== EXPECTED_HOSTED_SAFE_BROWSER_ORIGIN ||
    target.pathname !== "/api/internal/qa-auth-session" ||
    target.search !== "" ||
    target.hash !== "" ||
    target.username !== "" ||
    target.password !== ""
  ) {
    throw new Error("QA harness APIRequestContext target was not exact");
  }
  const response = await page.request.fetch(target.toString(), {
    method: "POST",
    failOnStatusCode: false,
    maxRedirects: 0,
    headers: {
      ...appRequestHeaders(target.toString(), {
        Authorization: `Bearer ${getInternalQaSecret()}`,
        Accept: "application/json",
      }),
    },
  });
  expect(response.url(), "QA session harness must not redirect").toBe(target.toString());
  const payload = await response.json().catch(() => null) as
    | {
        success?: boolean;
        email?: string;
        access?: string;
        cookieCount?: number;
        access_token?: unknown;
        refresh_token?: unknown;
      }
    | null;

  expect(response.status(), `QA session harness failed: ${JSON.stringify(payload)}`).toBe(200);
  expect(payload?.success).toBe(true);
  expect(payload?.access).toBe("non_admin_qa");
  expect(payload?.email).toMatch(/\*\*\*@/);
  expect(payload?.cookieCount).toBeGreaterThan(0);
  expect(payload?.access_token, "QA harness must never return a raw access token.").toBeUndefined();
  expect(payload?.refresh_token, "QA harness must never return a raw refresh token.").toBeUndefined();
}

async function establishQaSession(page: Page) {
  const projectRef = process.env.QA_ISOLATED_SUPABASE_PROJECT_REF?.trim();
  expect(projectRef).toBeTruthy();
  const session = safeBrowserSessionBundle().roles.paidDirect;
  await page.context().addCookies(
    browserCookiesForOrigin(session, new URL(BASE_URL).origin, projectRef!),
  );
}

async function clearExactQaAuthCookies(page: Page) {
  const projectRef = process.env.QA_ISOLATED_SUPABASE_PROJECT_REF?.trim();
  expect(projectRef).toBeTruthy();
  await page.context().clearCookies({
    name: new RegExp(`^sb-${projectRef}-auth-token(?:\\.\\d+)?$`),
  });
}

async function waitForSuccessfulDraftWrite(
  page: Page,
  action: () => Promise<unknown>,
) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/onboarding/plan",
    { timeout: 10_000 },
  );
  await action();
  const response = await responsePromise;
  expect(response.status(), "Synthetic staging onboarding draft write failed.").toBeLessThan(300);
  return response;
}

async function chooseDestination(page: Page, destination: "Website funnel" | "Meta Instant Form") {
  const destinationButton = page.getByRole("button", { name: new RegExp(destination, "i") }).first();
  await expect(destinationButton).toBeVisible();
  await waitForSuccessfulDraftWrite(page, () => destinationButton.click());
  await expect(destinationButton).toHaveAttribute("aria-pressed", "true");
}

async function goToReviewFromBudget(page: Page) {
  const reviewProgressButton = page.getByRole("button", { name: /Review/i }).first();
  await expect(reviewProgressButton).toBeEnabled();
  await waitForSuccessfulDraftWrite(page, () => reviewProgressButton.click());
  await expect(page.getByRole("heading", { name: "Confirm and build" })).toBeVisible();
}

async function returnToBudget(page: Page) {
  const budgetProgressButton = page.getByRole("button", { name: /Budget/i }).first();
  await expect(budgetProgressButton).toBeEnabled();
  await waitForSuccessfulDraftWrite(page, () => budgetProgressButton.click());
  await expect(page.getByRole("heading", { name: "Set budget and capture style" })).toBeVisible();
}

async function assertReviewDestination(page: Page, destination: "Website funnel" | "Meta Instant Form") {
  const reviewPanel = page.getByTestId("onboarding-current-step-panel");
  const assertReviewCard = async (key: string, label: string, value: string | RegExp) => {
    const card = reviewPanel.getByTestId(`onboarding-review-${key}`);
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId("onboarding-review-label")).toHaveText(label);
    await expect(card.getByTestId("onboarding-review-value")).toHaveText(value);
  };

  await assertReviewCard("agent", "Agent", "Safe Browserproof");
  await assertReviewCard("campaign-type", "Type", "Buyer leads");
  await assertReviewCard("market", "Market", "Safe QA Market, ON");
  await assertReviewCard("property-type", "Property type", "Single Family Homes");
  await assertReviewCard("price-deal-size", "Price or deal size", "$600k-$900k");
  await assertReviewCard("daily-budget", "Daily ad spend budget", "$30/day");
  await assertReviewCard(
    "monthly-estimate",
    "30-day estimate",
    "Estimated 30-day media spend: $900.",
  );
  await assertReviewCard(
    "offer",
    "Offer",
    "Private Listings and a Fast Buyer Strategy Call",
  );
  await assertReviewCard("lead-capture-style", "Lead capture style", "Quality leads");
  await assertReviewCard("destination", "Ad destination", destination);
  await assertReviewCard(
    "launch-access",
    "Launch access",
    "Pro access: unlimited campaign slots",
  );
  await expect(page.getByTestId("prepaywall-campaign-preview")).toBeVisible();
}

async function progressFreshOnboardingToReview(page: Page) {
  await gotoAndSettle(page, "/onboarding?new=1");
  await expect(page.getByRole("heading", { name: "Choose campaign type" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Buyer leads.*Selected/i })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /Continue to market/i }).click();
  await expect(page.getByRole("heading", { name: "Pick the city or market" })).toBeVisible();
  await page.getByRole("textbox", { name: "City or market" }).fill("Safe QA Market, ON");

  await page.getByRole("button", { name: /Continue to property/i }).click();
  await expect(page.getByRole("heading", { name: "Choose inventory focus" })).toBeVisible();
  await page.getByRole("button", { name: /Continue to audience/i }).click();
  await expect(page.getByRole("heading", { name: "Define audience and price" })).toBeVisible();

  await page.getByRole("button", { name: /Continue to budget/i }).click();
  await expect(page.getByRole("heading", { name: "Set budget and capture style" })).toBeVisible();
  await expect(page.getByLabel("Custom daily ad spend amount")).toHaveValue("30");
  await expect(page.getByText("Estimated 30-day media spend:", { exact: false })).toContainText("$900");

  await chooseDestination(page, "Meta Instant Form");
  await gotoAndSettle(page, "/onboarding?resume=1");
  await expect(page.getByRole("heading", { name: "Set budget and capture style" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Meta Instant Form/i }).first()).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /Continue to setup/i }).click();
  await expect(page.getByRole("heading", { name: "Configure capture path" })).toBeVisible();
  await expect(page.getByText("Meta Instant Form questions", { exact: true })).toBeVisible();
  await expect(page.getByText("One qualification question included", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Continue to offer/i }).click();
  await expect(page.getByRole("heading", { name: "Choose offer or lead magnet" })).toBeVisible();
  await page.getByRole("button", { name: /Continue to agent/i }).click();
  await expect(page.getByRole("heading", { name: "Identify the agent" })).toBeVisible();

  await page.getByRole("textbox", { name: "Agent first name" }).fill("Safe");
  await page.getByRole("textbox", { name: "Agent last name" }).fill("Browserproof");
  await page.getByRole("textbox", { name: "Company or brokerage" }).fill("Synthetic QA Realty");
  await page.getByRole("textbox", { name: "SMS alert phone" }).fill("+14165550100");

  const agentContinue = page.getByRole("button", { name: /Continue to (plan|review)/i });
  await agentContinue.click();

  if (await page.getByRole("heading", { name: "Confirm launch plan" }).isVisible().catch(() => false)) {
    await expect(page.getByText("$297/mo", { exact: false }).first()).toBeVisible();
    await waitForSuccessfulDraftWrite(page, () =>
      page.getByRole("button", { name: /Continue to review/i }).click(),
    );
  } else {
    await expect(page.getByRole("heading", { name: "Confirm and build" })).toBeVisible();
    await waitForSuccessfulDraftWrite(page, async () => {
      await page.getByRole("button", { name: /Review/i }).first().click();
    });
  }

  await expect(page.getByRole("heading", { name: "Confirm and build" })).toBeVisible();
  await expect(
    page.getByTestId("onboarding-current-step-panel").getByText("Safe Browserproof", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("prepaywall-campaign-preview").getByText("Safe Browserproof", { exact: true }),
  ).toBeVisible();
}

test.beforeAll(() => {
  if (HOSTED_ACCEPTANCE) {
    assertAuthenticatedStagingPreconditions();
    return;
  }

  expect(assertZeroExternalEffectsEnvironment(process.env).ok).toBe(true);
});

test.beforeEach(async ({ page }) => {
  await installSafetyHarness(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await assertDiagnosticsClean(page, testInfo);
});

test.describe("public and unauthenticated route truth", () => {
  const publicRoutes = [
    { path: "/", heading: /Stop buying.*agency promises/i },
    { path: "/login", heading: /Build, launch, and optimize your ads/i },
    { path: "/privacy", heading: "Privacy Policy" },
    { path: "/terms", heading: "Terms of Service" },
  ];

  for (const route of publicRoutes) {
    test(`${route.path} renders without overflow, hydration, console, or accessibility failures`, async ({ page }) => {
      await gotoAndSettle(page, route.path);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await assertCoreAccessibility(page);
      await assertSkipLinkAndReducedMotion(page);
    });
  }

  test("homepage keyboard focus and public links are usable and unbroken", async ({ page }) => {
    await gotoAndSettle(page, "/");
    await assertKeyboardFocus(page);
    await assertPublicLinksResolve(page);
    await assertTwoHundredPercentZoom(page);
  });

  test("login controls are keyboard reachable, named, and do not submit during proof", async ({ page }) => {
    await gotoAndSettle(page, "/login");
    await expect(
      page.getByRole("button", { name: "Show sign-in form", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await assertKeyboardFocus(page);
    await assertCoreAccessibility(page);
  });

  for (const protectedRoute of ["/dashboard", "/launch", "/admin/issues", "/admin/command-center"]) {
    test(`${protectedRoute} redirects an unauthenticated visitor to sign in`, async ({ page }) => {
      await gotoAndSettle(page, protectedRoute);
      await expect(page).toHaveURL((url) => {
        const redirectedFrom = url.searchParams.get("redirectedFrom");
        return url.pathname === "/login" && redirectedFrom === protectedRoute;
      });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });
  }
});

test.describe("authenticated isolated-staging product proof", () => {
  test.skip(
    !AUTHENTICATED_STAGING_PROOF_ENABLED,
    "Set SAFE_E2E_QA_AUTH=true only for the explicitly attested isolated staging project.",
  );

  test.beforeAll(() => {
    assertAuthenticatedStagingPreconditions();
  });

  test.beforeEach(async ({ page }) => {
    await establishQaSession(page);
  });

  test("restricted QA harness creates a masked non-admin session without returning credentials", async ({ page }) => {
    await clearExactQaAuthCookies(page);
    const beforeHarness = await page.request.get("/api/billing/status", {
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: appRequestHeaders("/api/billing/status", { Accept: "application/json" }),
    });
    expect(beforeHarness.status(), "QA harness proof must begin unauthenticated").toBe(401);
    await establishQaHarnessSession(page);
    const billingResponse = await page.request.get("/api/billing/status", {
      maxRedirects: 0,
      headers: appRequestHeaders("/api/billing/status", { Accept: "application/json" }),
    });
    expect(billingResponse.status()).toBe(200);
    expect(await billingResponse.json()).toMatchObject({
      planTier: "pro",
      subscriptionStatus: "active",
      commerciallyActivated: true,
      launchAllowed: true,
      launchOverride: false,
    });
  });

  test("zero-external-effects precondition and paid activation truth are exact", async ({ page }) => {
    expect(process.env.SAFE_E2E_ZERO_EXTERNAL_EFFECTS_ATTESTATION).toBe(
      ZERO_EXTERNAL_EFFECTS_ATTESTATION,
    );

    const billingResponse = await page.request.get("/api/billing/status", {
      maxRedirects: 0,
      headers: appRequestHeaders("/api/billing/status", { Accept: "application/json" }),
    });
    const billing = (await billingResponse.json()) as Record<string, unknown>;
    expect(billingResponse.status()).toBe(200);
    expect(billing.planTier).toBe("pro");
    expect(billing.subscriptionStatus).toMatch(/^(active|trialing)$/);
    expect(billing.commerciallyActivated).toBe(true);
    expect(billing.launchAllowed).toBe(true);
    expect(billing.launchOverride).toBe(false);
    expect(billing.truthBoundary).toEqual({
      activationIsHistorical: true,
      entitlementIsCurrent: true,
      setupReadinessIsSeparate: true,
    });

    const creditsResponse = await page.request.get("/api/billing/credits", {
      maxRedirects: 0,
      headers: appRequestHeaders("/api/billing/credits", { Accept: "application/json" }),
    });
    const credits = (await creditsResponse.json()) as Record<string, unknown>;
    expect(creditsResponse.status()).toBe(200);
    expect(credits.balance).toBe(1000);
    expect(credits.formattedBalance).toBe("$10.00");
    expect(credits.imageGenerationCostCents).toBe(100);
    expect(credits.videoGenerationCostCents).toBe(500);

    await gotoAndSettle(page, "/paywall");
    await expect(page.getByRole("heading", { name: "Your campaign is ready" })).toBeVisible();
    await expect(page.getByText("Pro · $297/mo", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Activate to launch" })).toBeVisible();
    expect(diagnosticsFor(page).forbiddenMutations).toEqual([]);
  });

  test("website and Meta destinations persist and render correctly in review", async ({ page }) => {
    await progressFreshOnboardingToReview(page);
    await assertReviewDestination(page, "Meta Instant Form");

    await returnToBudget(page);
    await chooseDestination(page, "Website funnel");
    await goToReviewFromBudget(page);
    await assertReviewDestination(page, "Website funnel");
    await gotoAndSettle(page, "/onboarding?resume=1");
    await expect(page.getByRole("heading", { name: "Confirm and build" })).toBeVisible();
    await assertReviewDestination(page, "Website funnel");

    await returnToBudget(page);
    await chooseDestination(page, "Meta Instant Form");
    await goToReviewFromBudget(page);
    await assertReviewDestination(page, "Meta Instant Form");
    await gotoAndSettle(page, "/onboarding?resume=1");
    await expect(page.getByRole("heading", { name: "Confirm and build" })).toBeVisible();
    await assertReviewDestination(page, "Meta Instant Form");
    const userVisibleErrorCount = await page
      .getByTestId("onboarding-current-step-panel")
      .locator(".text-rose-300, .text-rose-400")
      .count();
    expect(userVisibleErrorCount).toBe(0);
    diagnosticsFor(page).onboardingPersistenceProven = true;
    diagnosticsFor(page).onboardingUserVisibleErrorCount = userVisibleErrorCount;

    expect(diagnosticsFor(page).allowedDraftWrites.length).toBeGreaterThanOrEqual(5);
    expect(diagnosticsFor(page).interceptedTelemetry.length).toBeGreaterThan(0);
    expect(diagnosticsFor(page).forbiddenMutations).toEqual([]);
    await assertNoHorizontalOverflow(page);
    await assertCoreAccessibility(page);
    await assertSkipLinkAndReducedMotion(page);
  });

  test("dashboard renders synthetic truth and launch remains behind explicit safe gates", async ({ page }) => {
    await gotoAndSettle(page, "/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertCoreAccessibility(page);

    const campaignLaunchLink = page.locator('a[href*="/launch?campaignId="]').first();
    const launchLink = (await campaignLaunchLink.count()) > 0
      ? campaignLaunchLink
      : page.locator(
          'a[href="/launch"], a[href="/en/launch"], a[href="/fr/launch"], a[href="/es/launch"]',
        ).first();
    await expect(launchLink).toHaveCount(1);
    const campaignLaunchHref = await launchLink.getAttribute("href");
    expect(campaignLaunchHref).toBeTruthy();
    const campaignLaunchUrl = new URL(campaignLaunchHref!, BASE_URL);
    expect(campaignLaunchUrl.origin).toBe(new URL(BASE_URL).origin);
    expect(ALLOWED_LAUNCH_PATHNAMES.has(campaignLaunchUrl.pathname)).toBe(true);
    expect(campaignLaunchUrl.hash).toBe("");
    const expectedCampaignId = campaignLaunchUrl.searchParams.get("campaignId");
    if (expectedCampaignId === null) {
      expect([...campaignLaunchUrl.searchParams.keys()]).toEqual([]);
    } else {
      expect([...campaignLaunchUrl.searchParams.keys()]).toEqual(["campaignId"]);
      expect(expectedCampaignId).toMatch(CAMPAIGN_UUID_PATTERN);
    }
    await gotoAndSettle(page, campaignLaunchHref!);

    const launchStateHeadings = [
      page.getByRole("heading", { level: 1, name: "Campaign plan not found", exact: true }),
      page.getByRole("heading", { level: 1, name: "Selected creative required", exact: true }),
      page.getByRole("heading", { level: 1, name: "Final review before launch", exact: true }),
    ];
    const launchStateCounts = await Promise.all(
      launchStateHeadings.map((heading) => heading.count()),
    );
    expect(
      launchStateCounts.reduce((total, count) => total + count, 0),
      `Launch page must expose exactly one terminal state: ${JSON.stringify(launchStateCounts)}`,
    ).toBe(1);
    const launchState = launchStateCounts.findIndex((count) => count === 1);

    if (launchState === 0) {
      const dashboardRecoveryLink = page.getByRole("link", { name: "Open dashboard" });
      await expect(dashboardRecoveryLink).toHaveCount(1);
      await expect(dashboardRecoveryLink).toHaveAttribute(
        "href",
        "/dashboard",
      );
      await expect(page.locator('a[href^="/launching"]')).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Ready to attempt launch|Activate to launch/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Ready to attempt launch|Activate to launch/i })).toHaveCount(0);
    } else if (launchState === 1) {
      const launchLocale = new URL(page.url()).pathname.split("/")[1];
      expect(["en", "fr", "es"]).toContain(launchLocale);
      const buildCreativesLink = page.locator('a[href*="/build/creatives?campaignId="]');
      await expect(buildCreativesLink).toHaveCount(1);
      const buildCreativesHref = await buildCreativesLink.getAttribute("href");
      expect(buildCreativesHref).toBeTruthy();
      const buildCreativesUrl = new URL(buildCreativesHref!, BASE_URL);
      expect(buildCreativesUrl.pathname).toBe(`/${launchLocale}/build/creatives`);
      expect([...buildCreativesUrl.searchParams.keys()]).toEqual(["campaignId"]);
      const resolvedCampaignId = buildCreativesUrl.searchParams.get("campaignId");
      expect(resolvedCampaignId).toMatch(CAMPAIGN_UUID_PATTERN);
      if (expectedCampaignId !== null) {
        expect(resolvedCampaignId).toBe(expectedCampaignId);
      }
      await expect(page.locator('a[href^="/launching"]')).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Ready to attempt launch|Activate to launch/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Ready to attempt launch|Activate to launch/i })).toHaveCount(0);
    } else {
      const launchAttemptLink = page.getByRole("link", { name: "Ready to attempt launch" });
      const disabledLaunchButton = page.getByRole("button", { name: "Ready to attempt launch" });
      const activationLink = page.getByRole("link", { name: "Activate to launch" });
      const safeGateCount =
        (await launchAttemptLink.count()) +
        (await disabledLaunchButton.count()) +
        (await activationLink.count());
      expect(safeGateCount, "Launch page must expose exactly one explicit final gate state.").toBe(1);

      if (await launchAttemptLink.count()) {
        await expect(launchAttemptLink).toHaveAttribute("href", /\/launching\?campaignId=/);
      }
      if (await disabledLaunchButton.count()) {
        await expect(disabledLaunchButton).toBeDisabled();
      }
      if (await activationLink.count()) {
        await expect(activationLink).toHaveAttribute(
          "href",
          /^\/paywall\?campaignId=[a-f0-9-]{36}$/i,
        );
      }
    }

    expect(diagnosticsFor(page).forbiddenMutations).toEqual([]);
    await assertNoHorizontalOverflow(page);
  });
});
