import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
  type Route,
  type TestInfo,
} from "@playwright/test";
import { createHash } from "node:crypto";
import {
  browserCookiesForOrigin,
  isAllowedStagingTurnstileRequest,
  parseSyntheticBrowserSessionBundle,
  SYNTHETIC_STAGING_ROLE_EMAILS,
} from "../../scripts/staging/browser-session-bundle-contract.mjs";
import {
  exactVercelAutomationProtectionPortfolio,
  installBrowserContextNetworkBoundary,
  isExpectedWebKitTurnstileTestWidgetConsoleError,
  primeVercelAutomationBypassCookies,
  safeHttpEvidenceTarget,
  safeWebSocketEvidenceTarget,
  scopedStagingAccessHeaders,
  stagingAccessCookiesForOrigins,
  STAGING_ACCESS_HEADER,
} from "../../scripts/staging/browser-context-network-boundary.mjs";
import {
  isHarmlessAbortedApplicationRscPrefetch,
  isHarmlessSupersededApplicationRead,
  isExpectedNavigationAbort,
  sanitizedRequestFailureDiagnostic,
  sanitizedRequestTargetFingerprint,
} from "./expected-navigation-abort.mjs";

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
const EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT = 61;
const IMAGE_OPTIMIZER_PATHS = Object.freeze([
  "/_next/image",
  "/_vercel/image",
  "/_dealflow-staging-image-optimizer-disabled",
]);
const IMAGE_OPTIMIZER_PATH_SET = new Set(IMAGE_OPTIMIZER_PATHS);
const PAID_CAMPAIGN_ID = "d2000000-0000-4000-8000-000000000001";
const STALE_REPORTING_CAMPAIGN_ID = "d2000000-0000-4000-8000-000000000002";
const FAILED_REPORTING_CAMPAIGN_ID = "d2000000-0000-4000-8000-000000000003";
const PARTNER_ONE_CAMPAIGN_ID = "d2000000-0000-4000-8000-000000000004";
const PARTNER_TWO_CAMPAIGN_ID = "d2000000-0000-4000-8000-000000000005";
const PARTNER_BRAND_NAME = "DF-STAGING-20260712 Partner Realty OS";
const PARTNER_TWO_BRAND_NAME = "DF-STAGING-20260712 Partner Two Realty OS";
const TURNSTILE_TEST_TITLE =
  "public funnel renders the official staging Turnstile test widget without submitting a lead";
const PARTNER_ONE_CORE_ROUTES_TEST_TITLE =
  "white-label child receives attributed branding across core product routes";
const PARTNER_TWO_CORE_ROUTES_TEST_TITLE =
  "second white-label child receives only partner-two branding and tenant data";
const PARTNER_CORE_ROUTES_TEST_TITLES = new Set([
  PARTNER_ONE_CORE_ROUTES_TEST_TITLE,
  PARTNER_TWO_CORE_ROUTES_TEST_TITLE,
]);
const EXACT_HARMLESS_PARTNER_ROUTE_READ_TARGETS = new Set([
  "sha256:43cc0bb132fdfdcdede8cd25f1a2e5a8b0edda4d7623b2870a178f37430666cc",
]);
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
  imageFailures: string[];
  optimizerNetworkRequests: string[];
  optimizerDomSources: string[];
  optimizerPerformanceEntries: string[];
};

const diagnosticsByPage = new WeakMap<Page, Diagnostics>();

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  expect(value, `${name} is required for staging acceptance`).toBeTruthy();
  return value!;
}

function requiredVercelAutomationBypassSecret(required: boolean) {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
  expect(
    required
      ? secret.length >= 32 &&
        secret.trim() === secret &&
        /^[\x21-\x7e]+$/.test(secret)
      : secret === "",
    "VERCEL_AUTOMATION_BYPASS_SECRET must exactly match the protected-origin requirement",
  ).toBe(true);
  return secret;
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
    .replace(/x-vercel-protection-bypass\s*[:=]\s*[^\s"'`<>]+/gi, "x-vercel-protection-bypass=[REDACTED]")
    .replace(/_vercel_jwt=[^\s;"'`<>]+/gi, "_vercel_jwt=[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
    .replace(/sb-[a-z0-9-]+-auth-token(?:\.\d+)?=[^\s;]+/gi, "sb-[REDACTED]-auth-token=[REDACTED]")
    .slice(0, 2_000);
}

function exactOptimizerPathname(rawUrl: string) {
  const parsed = new URL(rawUrl);
  let pathname = parsed.pathname;
  for (let pass = 0; pass < 3; pass += 1) {
    if (IMAGE_OPTIMIZER_PATH_SET.has(pathname)) return pathname;
    try {
      const decoded = decodeURIComponent(pathname);
      if (decoded === pathname) break;
      pathname = decoded;
    } catch {
      break;
    }
  }
  return IMAGE_OPTIMIZER_PATH_SET.has(pathname) ? pathname : null;
}

type OptimizerBrowserSurfaceScanInput = {
  exactPaths: string[];
  detachedFixtureMarkup?: string;
  detachedCurrentSrcOverrides?: Array<[elementId: string, rawUrl: string]>;
};

function scanOptimizerBrowserSurfaces({
  exactPaths,
  detachedFixtureMarkup,
  detachedCurrentSrcOverrides = [],
}: OptimizerBrowserSurfaceScanInput) {
  const paths = new Set(exactPaths);
  const detachedFixture = typeof detachedFixtureMarkup === "string";
  let root: ParentNode = document;
  if (detachedFixture) {
    const template = document.createElement("template");
    template.innerHTML = detachedFixtureMarkup;
    root = template.content;
    for (const [elementId, rawUrl] of detachedCurrentSrcOverrides) {
      const image = [...root.querySelectorAll("img")].find(
        (element) => element.id === elementId,
      );
      if (!(image instanceof HTMLImageElement)) {
        throw new Error("Detached currentSrc fixture did not target an image");
      }
      Object.defineProperty(image, "currentSrc", {
        configurable: true,
        value: rawUrl,
      });
    }
  } else if (detachedCurrentSrcOverrides.length !== 0) {
    throw new Error("currentSrc overrides are restricted to detached fixtures");
  }
  const decodedVariants = (rawValue: string) => {
    const variants = new Set([
      rawValue.trim(),
      rawValue.trim().replaceAll("&amp;", "&"),
    ]);
    for (let pass = 0; pass < 3; pass += 1) {
      for (const value of [...variants]) {
        try {
          variants.add(decodeURIComponent(value));
        } catch {
          // A malformed encoded candidate remains covered by its raw form.
        }
      }
    }
    return [...variants].filter(Boolean);
  };
  const matchingPathnames = (rawUrl: string) => {
    const matches = new Set<string>();
    for (const variant of decodedVariants(rawUrl)) {
      for (const path of paths) {
        let offset = variant.indexOf(path);
        while (offset !== -1) {
          const suffix = variant[offset + path.length] ?? "";
          if (suffix === "" || /^[?&#,\s"']$/u.test(suffix)) {
            matches.add(path);
          }
          offset = variant.indexOf(path, offset + path.length);
        }
      }
      try {
        let pathname = new URL(variant, document.baseURI).pathname;
        for (let pass = 0; pass < 3; pass += 1) {
          if (paths.has(pathname)) matches.add(pathname);
          const decoded = decodeURIComponent(pathname);
          if (decoded === pathname) break;
          pathname = decoded;
        }
        if (paths.has(pathname)) matches.add(pathname);
      } catch {
        // Invalid URL candidates remain covered by the raw embedded scan.
      }
    }
    return [...matches];
  };
  const srcsetCandidates = (rawValue: string) => [
    rawValue,
    ...rawValue
      .split(",")
      .map((candidate) => candidate.trim().split(/\s+/u)[0] ?? "")
      .filter(Boolean),
  ];
  const domSources = new Set<string>();
  const record = (
    surface: string,
    rawValue: string | null | undefined,
    responsive = false,
  ) => {
    if (!rawValue) return;
    const candidates = responsive ? srcsetCandidates(rawValue) : [rawValue];
    for (const candidate of candidates) {
      for (const pathname of matchingPathnames(candidate)) {
        domSources.add(`${surface}:${pathname}`);
      }
    }
  };
  for (const element of root.querySelectorAll("img, source, link")) {
    if (element instanceof HTMLImageElement) {
      record("img.src.property", element.src);
      record("img.currentSrc.property", element.currentSrc);
      record("img.src.attribute", element.getAttribute("src"));
      record("img.srcset.property", element.srcset, true);
      record("img.srcset.attribute", element.getAttribute("srcset"), true);
    } else if (element instanceof HTMLSourceElement) {
      record("source.src.property", element.src);
      record("source.src.attribute", element.getAttribute("src"));
      record("source.srcset.property", element.srcset, true);
      record("source.srcset.attribute", element.getAttribute("srcset"), true);
    } else if (
      element instanceof HTMLLinkElement &&
      element.relList.contains("preload") &&
      element.as.toLowerCase() === "image"
    ) {
      record("link-preload.href.property", element.href);
      record("link-preload.href.attribute", element.getAttribute("href"));
      record("link-preload.imagesrcset.property", element.imageSrcset, true);
      record(
        "link-preload.imagesrcset.attribute",
        element.getAttribute("imagesrcset"),
        true,
      );
    }
  }
  const performanceEntries = detachedFixture
    ? []
    : performance
        .getEntriesByType("resource")
        .flatMap((entry) => matchingPathnames(entry.name));
  return {
    domSources: [...domSources].sort(),
    performanceEntries: [...new Set(performanceEntries)].sort(),
    detachedFixture,
    rawUrlsOrQueriesPersisted: false,
  };
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
  const protectionPortfolio = exactVercelAutomationProtectionPortfolio({
    applicationOrigins: [
      baseUrl.origin,
      partnerBaseUrl.origin,
      partnerTwoBaseUrl.origin,
    ],
    serializedPortfolio: requiredEnvironment(
      "VERCEL_AUTOMATION_PROTECTION_PORTFOLIO",
    ),
  });
  const bypassRequired = protectionPortfolio.some(
    ({ vercelAutomationBypassRequired: required }) => required,
  );
  const browserBypassSecret = requiredVercelAutomationBypassSecret(bypassRequired);
  if (bypassRequired) {
    expect(browserBypassSecret.length).toBeGreaterThanOrEqual(32);
  } else {
    expect(browserBypassSecret).toBe("");
  }
}

async function installFailClosedNetworkBoundary(
  page: Page,
  browserName: string,
  testTitle: string,
) {
  const diagnostics: Diagnostics = {
    blockedMutations: [],
    forbiddenHosts: [],
    blockedWebSockets: [],
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    serverErrors: [],
    imageFailures: [],
    optimizerNetworkRequests: [],
    optimizerDomSources: [],
    optimizerPerformanceEntries: [],
  };
  const context = page.context();
  diagnosticsByPage.set(page, diagnostics);
  const applicationOrigins = [
    new URL(requiredEnvironment("STAGING_ACCEPTANCE_BASE_URL")).origin,
    new URL(requiredEnvironment("STAGING_ACCEPTANCE_PARTNER_BASE_URL")).origin,
    new URL(requiredEnvironment("STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL")).origin,
  ];
  const allowedApplicationOrigins = new Set(applicationOrigins);
  const serializedProtectionPortfolio = requiredEnvironment(
    "VERCEL_AUTOMATION_PROTECTION_PORTFOLIO",
  );
  const protectionPortfolio = exactVercelAutomationProtectionPortfolio({
    applicationOrigins,
    serializedPortfolio: serializedProtectionPortfolio,
  });
  const vercelAutomationBypassRequired = protectionPortfolio.some(
    ({ vercelAutomationBypassRequired: required }) => required,
  );
  let activeApplicationOrigin: string | null = null;
  let requestSequence = 0;
  let mainFrameNavigationSequence = 0;
  const observedResponseStatusByRequest = new WeakMap<Request, number>();
  const requestLifecycle = new WeakMap<
    Request,
    {
      requestSequence: number;
      startedAt: number;
      mainFrameNavigationSequenceAtStart: number;
    }
  >();

  await primeVercelAutomationBypassCookies({
    context,
    applicationOrigins,
    serializedProtectionPortfolio,
    vercelAutomationBypassSecret: requiredVercelAutomationBypassSecret(
      vercelAutomationBypassRequired,
    ),
  });
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
    const expectedWebKitTurnstileTestWidgetArtifact =
      isExpectedWebKitTurnstileTestWidgetConsoleError({
        browserName,
        testTitle,
        messageType: message.type(),
        messageText: message.text(),
        location: message.location(),
        stagingAcceptanceExecution:
          process.env.STAGING_ACCEPTANCE_EXECUTION === "true",
        siteKey: process.env.STAGING_TURNSTILE_TEST_SITE_KEY,
      });
    if (
      message.type() === "error" &&
      !/ERR_BLOCKED_BY_CLIENT/i.test(message.text()) &&
      !expectedWebKitTurnstileTestWidgetArtifact
    ) {
      diagnostics.consoleErrors.push(sanitizeBrowserDiagnostic(message.text()));
    }
  });
  context.on("weberror", (webError) =>
    diagnostics.pageErrors.push(sanitizeBrowserDiagnostic(webError.error().message)));
  context.on("request", (request) => {
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    requestSequence += 1;
    let exactMainFrameApplicationNavigation = false;
    try {
      exactMainFrameApplicationNavigation =
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame() &&
        allowedApplicationOrigins.has(url.origin) &&
        url.username === "" &&
        url.password === "";
    } catch {
      exactMainFrameApplicationNavigation = false;
    }
    if (exactMainFrameApplicationNavigation) mainFrameNavigationSequence += 1;
    requestLifecycle.set(request, {
      requestSequence,
      startedAt: Date.now(),
      mainFrameNavigationSequenceAtStart: mainFrameNavigationSequence,
    });
    const optimizerPathname = exactOptimizerPathname(request.url());
    if (
      optimizerPathname &&
      !diagnostics.optimizerNetworkRequests.includes(optimizerPathname)
    ) {
      diagnostics.optimizerNetworkRequests.push(optimizerPathname);
    }
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
    const errorText = request.failure()?.errorText ?? "unknown request failure";
    const requestUrl = new URL(request.url());
    const headers = request.headers();
    const lifecycle = requestLifecycle.get(request);
    let frameMatchesActiveApplicationOrigin = false;
    try {
      const frameUrl = new URL(request.frame().url());
      frameMatchesActiveApplicationOrigin =
        activeApplicationOrigin !== null &&
        frameUrl.origin === activeApplicationOrigin &&
        frameUrl.username === "" &&
        frameUrl.password === "";
    } catch {
      frameMatchesActiveApplicationOrigin = false;
    }
    const rscValues = requestUrl.searchParams.getAll("_rsc");
    const sanitizedLifecycle = {
      requestSequence: lifecycle?.requestSequence ?? null,
      mainFrameNavigationSequenceAtStart:
        lifecycle?.mainFrameNavigationSequenceAtStart ?? null,
      mainFrameNavigationSequenceAtFailure: mainFrameNavigationSequence,
      elapsedMs: lifecycle
        ? Math.min(Math.max(Date.now() - lifecycle.startedAt, 0), 60_000)
        : null,
      responseStatus: observedResponseStatusByRequest.get(request) ?? null,
      resourceType: request.resourceType(),
      isNavigationRequest: request.isNavigationRequest(),
      sameActiveApplicationOrigin:
        activeApplicationOrigin !== null &&
        requestUrl.origin === activeApplicationOrigin,
      frameMatchesActiveApplicationOrigin,
      httpsTransport: requestUrl.protocol === "https:",
      hasCredentials: requestUrl.username !== "" || requestUrl.password !== "",
      hasFragment: requestUrl.hash !== "",
      rscHeader: headers.rsc === "1",
      nextRouterPrefetchHeader: headers["next-router-prefetch"] === "1",
      rscQueryCount: rscValues.length,
      exactBoundedRscQuery:
        rscValues.length === 1 &&
        /^[A-Za-z0-9_-]{1,128}$/.test(rscValues[0] ?? ""),
      queryKeyCount: new Set(requestUrl.searchParams.keys()).size,
      failureRecordRawUrlRetained: false,
      failureRecordRawHostRetained: false,
    };
    const requestTargetFingerprint = sanitizedRequestTargetFingerprint(request.url());
    const failure = `${request.method()} ${requestTargetFingerprint} ${sanitizedRequestFailureDiagnostic(
      errorText,
    )} lifecycle=${JSON.stringify(sanitizedLifecycle)}`;
    const expectedNavigationAbort =
      request.isNavigationRequest() && isExpectedNavigationAbort(errorText);
    const harmlessAbortedApplicationRscPrefetch =
      isHarmlessAbortedApplicationRscPrefetch({
        errorText,
        method: request.method(),
        ...sanitizedLifecycle,
      });
    const harmlessSupersededApplicationRead =
      PARTNER_CORE_ROUTES_TEST_TITLES.has(testTitle) &&
      EXACT_HARMLESS_PARTNER_ROUTE_READ_TARGETS.has(requestTargetFingerprint) &&
      isHarmlessSupersededApplicationRead({
        errorText,
        method: request.method(),
        ...sanitizedLifecycle,
      });
    const expectedInterceptedWebKitTurnstileBlobFailure =
      browserName === "webkit" &&
      testTitle === TURNSTILE_TEST_TITLE &&
      process.env.STAGING_ACCEPTANCE_EXECUTION === "true" &&
      process.env.STAGING_TURNSTILE_TEST_SITE_KEY === "1x00000000000000000000AA" &&
      request.resourceType() === "xhr" &&
      request.method() === "GET" &&
      new URL(request.url()).protocol === "blob:" &&
      isAllowedStagingTurnstileRequest(request.url(), request.method(), true) &&
      errorText === "The operation couldn’t be completed. (WebKitBlobResource error 1.)";
    if (
      !expectedNavigationAbort &&
      !harmlessAbortedApplicationRscPrefetch &&
      !harmlessSupersededApplicationRead &&
      !expectedInterceptedWebKitTurnstileBlobFailure
    ) {
      diagnostics.requestFailures.push(failure);
    }
  });
  context.on("response", (response) => {
    observedResponseStatusByRequest.set(response.request(), response.status());
    if (response.status() >= 500) {
      diagnostics.serverErrors.push(
        `${response.status()} ${safeHttpEvidenceTarget(response.url())}`,
      );
    }
    if (
      response.request().resourceType() === "image" &&
      response.status() >= 400
    ) {
      diagnostics.imageFailures.push(
        `${response.status()} ${safeHttpEvidenceTarget(response.url())}`,
      );
    }
  });
}

async function assertDiagnosticsClean(page: Page, testInfo: TestInfo) {
  const diagnostics = diagnosticsByPage.get(page);
  expect(diagnostics, "staging diagnostics were not installed").toBeTruthy();
  const optimizerPathnames = await page.evaluate(
    scanOptimizerBrowserSurfaces,
    { exactPaths: [...IMAGE_OPTIMIZER_PATHS] },
  );
  expect(optimizerPathnames.rawUrlsOrQueriesPersisted).toBe(false);
  expect(optimizerPathnames.detachedFixture).toBe(false);
  diagnostics!.optimizerDomSources.push(...optimizerPathnames.domSources);
  diagnostics!.optimizerPerformanceEntries.push(
    ...optimizerPathnames.performanceEntries,
  );
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
    imageFailures: [],
    optimizerNetworkRequests: [],
    optimizerDomSources: [],
    optimizerPerformanceEntries: [],
  });
}

async function assertDirectImageLoaded(
  image: Locator,
  expectedPathname: string,
) {
  await expect(image).toHaveCount(1);
  await expect(image).toBeVisible();
  await expect.poll(
    async () => image.evaluate((element) => {
      const img = element as HTMLImageElement;
      return Boolean(
        img.complete &&
        img.naturalWidth > 0 &&
        img.naturalHeight > 0 &&
        img.currentSrc,
      );
    }),
    { message: `${expectedPathname} did not finish loading as a real image` },
  ).toBe(true);
  const state = await image.evaluate((element) => {
    const img = element as HTMLImageElement;
    const source = new URL(img.currentSrc || img.src, document.baseURI);
    return {
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      pathname: source.pathname,
      sourceOrigin: source.origin,
      documentOrigin: location.origin,
    };
  });
  expect(state).toMatchObject({
    complete: true,
    pathname: expectedPathname,
  });
  expect(state.naturalWidth).toBeGreaterThan(0);
  expect(state.naturalHeight).toBeGreaterThan(0);
  expect(state.sourceOrigin).toBe(state.documentOrigin);
  expect(state.pathname).not.toBe("/_next/image");
  expect(state.pathname).not.toBe("/_vercel/image");
  expect(state.pathname).not.toBe("/_dealflow-staging-image-optimizer-disabled");
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
  const emailInput = page.getByRole("textbox", { name: "Email" });
  const passwordInput = page.getByLabel("Password");
  const authForm = page.locator("form");
  const submitButton = authForm.getByRole("button", { name: "Sign in", exact: true });
  await expect(emailInput).toBeVisible();
  await expect(emailInput).toBeEditable();
  await expect(passwordInput).toBeEditable();
  await expect(submitButton).toBeEnabled();
  await emailInput.fill(email);
  await passwordInput.fill(password);
  const challenge = page.getByText(/verification challenge|verify you are human/i);
  expect(
    await challenge.count(),
    "Turnstile must be disabled for deterministic isolated-staging credential proof",
  ).toBe(0);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 }),
    submitButton.click(),
  ]);
}

function waitForExactApplicationRead(
  page: Page,
  origin: string,
  pathname: string,
) {
  return page.waitForResponse((response) => {
    const request = response.request();
    const url = new URL(response.url());
    return (
      request.method() === "GET" &&
      url.origin === origin &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === pathname &&
      url.search === "" &&
      url.hash === ""
    );
  }, { timeout: 30_000 });
}

async function openFullySettledPartnerLogin(page: Page, partnerOrigin: string) {
  const target = new URL("/login", partnerOrigin);
  const response = await page.goto(target.toString(), { waitUntil: "load" });
  expect(response, "partner login returned no document response").not.toBeNull();
  expect(response!.url()).toBe(target.toString());
  expect(response!.status()).toBe(200);
  expect(await response!.finished()).toBeNull();
  await page.waitForURL(
    (url) => url.origin === target.origin && url.pathname === "/login",
    { waitUntil: "load", timeout: 30_000 },
  );
}

async function navigateAndSettleExactApplicationRead(
  page: Page,
  rawTarget: string,
  options: {
    expectedFinalPathname: string;
    expectedReadPathname?: string;
  },
) {
  const target = new URL(rawTarget, requiredEnvironment("STAGING_ACCEPTANCE_BASE_URL"));
  const expectedRead = options.expectedReadPathname
    ? waitForExactApplicationRead(page, target.origin, options.expectedReadPathname)
    : null;
  const [response, readResponse] = await Promise.all([
    page.goto(target.toString(), { waitUntil: "load" }),
    expectedRead ?? Promise.resolve(null),
  ]);
  expect(response, `${target.pathname} returned no document response`).not.toBeNull();
  expect(response!.status(), `${target.pathname} returned a server failure`).toBeLessThan(500);
  await page.waitForURL((url) =>
    url.origin === target.origin &&
    url.pathname === options.expectedFinalPathname,
  { waitUntil: "load", timeout: 30_000 });
  if (readResponse) {
    expect(await readResponse.finished()).toBeNull();
    expect(
      readResponse.status(),
      `${options.expectedReadPathname} did not return the exact seeded read contract`,
    ).toBe(200);
  }
  return response;
}

async function assertOptimizationPolicySettled(page: Page) {
  await expect(page.getByText("Checking", { exact: true })).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(
    page.getByText("Optimization status is unavailable.", { exact: true }),
  ).toHaveCount(0);
}

async function openAuthenticatedSession(
  page: Page,
  role: SyntheticRole,
  redirectedFrom: string,
  origin = requiredEnvironment("STAGING_ACCEPTANCE_BASE_URL"),
  expectedReadPathname: string | null = null,
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
  const destination = new URL(redirectedFrom, origin);
  const response = expectedReadPathname
    ? await navigateAndSettleExactApplicationRead(page, destination.toString(), {
        expectedFinalPathname: destination.pathname,
        expectedReadPathname,
      })
    : await page.goto(destination.toString(), { waitUntil: "load" });
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
test.beforeEach(async ({ page, browserName }, testInfo) => {
  await installFailClosedNetworkBoundary(page, browserName, testInfo.title);
  await assertHostedZeroEffects(page);
});
test.afterEach(async ({ page }, testInfo) => {
  await assertDiagnosticsClean(page, testInfo);
});

test("optimizer DOM scanner detects every dormant responsive and preload surface without network use", async ({ page }) => {
  const diagnostics = diagnosticsByPage.get(page);
  expect(diagnostics, "staging diagnostics were not installed").toBeTruthy();
  let fixtureNetworkRequestCount = 0;
  const countFixtureNetworkRequest = () => {
    fixtureNetworkRequestCount += 1;
  };
  page.on("request", countFixtureNetworkRequest);
  let scan;
  try {
    scan = await page.evaluate(scanOptimizerBrowserSurfaces, {
      exactPaths: [...IMAGE_OPTIMIZER_PATHS],
      detachedFixtureMarkup: `
        <img id="current-next" src="/_next/image?url=%2Flogo.svg&amp;w=32&amp;q=75">
        <img id="current-vercel" src="%2F_vercel%2Fimage%3Furl%3D%252Flogo.svg%26w%3D32%26q%3D75">
        <img id="current-disabled" src="https://fixture.invalid/_dealflow-staging-image-optimizer-disabled?url=%2Flogo.svg">
        <img srcset="/_next/image?url=%2Flogo.svg&amp;w=32&amp;q=75 1x, %2F_vercel%2Fimage%3Furl%3D%252Flogo.svg%26w%3D64%26q%3D75 2x, https://fixture.invalid/_dealflow-staging-image-optimizer-disabled?url=%2Flogo.svg 3x">
        <source src="/_next/image?url=%2Flogo.svg&amp;w=32&amp;q=75">
        <source src="%2F_vercel%2Fimage%3Furl%3D%252Flogo.svg%26w%3D32%26q%3D75">
        <source src="https://fixture.invalid/_dealflow-staging-image-optimizer-disabled?url=%2Flogo.svg">
        <source srcset="/_next/image?url=%2Flogo.svg&amp;amp;w=32&amp;amp;q=75 1x, %2F_vercel%2Fimage%3Furl%3D%252Flogo.svg%26w%3D64%26q%3D75 2x, https://fixture.invalid/_dealflow-staging-image-optimizer-disabled?url=%2Flogo.svg 3x">
        <link rel="preload" as="image" href="/_next/image?url=%2Flogo.svg&amp;w=32&amp;q=75">
        <link rel="preload" as="image" href="%2F_vercel%2Fimage%3Furl%3D%252Flogo.svg%26w%3D32%26q%3D75">
        <link rel="preload" as="image" href="https://fixture.invalid/_dealflow-staging-image-optimizer-disabled?url=%2Flogo.svg">
        <link rel="preload" as="image" imagesrcset="/_next/image?url=%2Flogo.svg&amp;w=32&amp;q=75 1x, %2F_vercel%2Fimage%3Furl%3D%252Flogo.svg%26w%3D64%26q%3D75 2x, https://fixture.invalid/_dealflow-staging-image-optimizer-disabled?url=%2Flogo.svg 3x">
      `,
      detachedCurrentSrcOverrides: [
        ["current-next", "%252F_next%252Fimage%253Furl%253D%25252Flogo.svg%2526w%253D32%2526q%253D75"],
        ["current-vercel", "%2F_vercel%2Fimage%3Furl%3D%252Flogo.svg%26w%3D32%26q%3D75"],
        ["current-disabled", "https://fixture.invalid/_dealflow-staging-image-optimizer-disabled?url=%2Flogo.svg"],
      ] as Array<[string, string]>,
    });
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
  } finally {
    page.off("request", countFixtureNetworkRequest);
  }
  const expectedSurfaces = [
    "img.src.property",
    "img.currentSrc.property",
    "img.src.attribute",
    "img.srcset.property",
    "img.srcset.attribute",
    "source.src.property",
    "source.src.attribute",
    "source.srcset.property",
    "source.srcset.attribute",
    "link-preload.href.property",
    "link-preload.href.attribute",
    "link-preload.imagesrcset.property",
    "link-preload.imagesrcset.attribute",
  ];
  expect(scan).toEqual({
    domSources: expectedSurfaces
      .flatMap((surface) =>
        IMAGE_OPTIMIZER_PATHS.map((pathname) => `${surface}:${pathname}`),
      )
      .sort(),
    performanceEntries: [],
    detachedFixture: true,
    rawUrlsOrQueriesPersisted: false,
  });
  const serializedScan = JSON.stringify(scan);
  for (const forbiddenRawEvidence of ["https://", "?", "&", "="]) {
    expect(serializedScan).not.toContain(forbiddenRawEvidence);
  }
  expect(fixtureNetworkRequestCount).toBe(0);
  expect(diagnostics!.optimizerNetworkRequests).toEqual([]);
  expect(diagnostics!.requestFailures).toEqual([]);
});

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
  await openAuthenticatedSession(
    page,
    "paidDirect",
    `/dashboard?campaignId=${PAID_CAMPAIGN_ID}`,
    requiredEnvironment("STAGING_ACCEPTANCE_BASE_URL"),
    `/api/campaigns/${PAID_CAMPAIGN_ID}/optimization-policy`,
  );
  await assertOptimizationPolicySettled(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await assertDirectImageLoaded(
      page.locator('img[alt="DealFlow AI icon"]:visible').first(),
      "/logo-icon.svg",
    );
  }
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
  await openAuthenticatedSession(
    page,
    "paidDirect",
    `/dashboard?campaignId=${PAID_CAMPAIGN_ID}`,
    requiredEnvironment("STAGING_ACCEPTANCE_BASE_URL"),
    `/api/campaigns/${PAID_CAMPAIGN_ID}/optimization-policy`,
  );
  await assertOptimizationPolicySettled(page);
  for (const [campaignId, expectedLabel] of [
    [PAID_CAMPAIGN_ID, "Confirmed in Meta"],
    [STALE_REPORTING_CAMPAIGN_ID, "Confirmed state is stale"],
    [FAILED_REPORTING_CAMPAIGN_ID, "Showing last confirmed Meta data"],
  ] as const) {
    const response = await navigateAndSettleExactApplicationRead(
      page,
      `/dashboard?campaignId=${campaignId}`,
      {
        expectedFinalPathname: "/dashboard",
        expectedReadPathname: `/api/campaigns/${campaignId}/optimization-policy`,
      },
    );
    expect(response?.status()).toBeLessThan(500);
    await assertOptimizationPolicySettled(page);
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
    const authSubmit = page.locator("form").getByRole("button", {
      name: copy.signIn,
      exact: true,
    });
    await expect(authSubmit).toBeVisible();
    await expect(authSubmit).toBeEnabled();
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);

    await page.locator("body").click({ position: { x: 1, y: 1 } });
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
    await expect(authSubmit).toBeVisible();
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
  await openAuthenticatedSession(
    page,
    "paidDirect",
    `/dashboard?campaignId=${PAID_CAMPAIGN_ID}`,
    requiredEnvironment("STAGING_ACCEPTANCE_BASE_URL"),
    `/api/campaigns/${PAID_CAMPAIGN_ID}/optimization-policy`,
  );
  await assertOptimizationPolicySettled(page);
  for (const [locale, copy] of Object.entries(LOCALIZED_PRODUCT_COPY)) {
    const response = await navigateAndSettleExactApplicationRead(
      page,
      `/${locale}/dashboard?campaignId=${PAID_CAMPAIGN_ID}`,
      {
        expectedFinalPathname: `/${locale}/dashboard`,
        expectedReadPathname: `/api/campaigns/${PAID_CAMPAIGN_ID}/optimization-policy`,
      },
    );
    expect(response?.status()).toBeLessThan(500);
    await assertOptimizationPolicySettled(page);
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
  await openFullySettledPartnerLogin(page, partnerOrigin);
  await expect(
    page.getByText(PARTNER_BRAND_NAME, { exact: false }).filter({ visible: true }).first(),
  ).toBeVisible();
  await assertDirectImageLoaded(
    page.locator(`img[alt="${PARTNER_BRAND_NAME} logo"]`),
    "/logo.svg",
  );
  const policyPath = `/api/campaigns/${PARTNER_ONE_CAMPAIGN_ID}/optimization-policy`;
  await openAuthenticatedSession(page, "partnerChild", "/dashboard", partnerOrigin, policyPath);
  await assertOptimizationPolicySettled(page);
  await expect(
    page.getByText(PARTNER_BRAND_NAME, { exact: false }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(PARTNER_TWO_BRAND_NAME, { exact: false })).toHaveCount(0);
  for (const route of [
    { path: "/builder?resume=1", finalPathname: "/en/onboarding", readPathname: "/api/billing/status" },
    { path: "/launch", finalPathname: "/launch" },
    { path: "/results", finalPathname: "/en/dashboard", readPathname: policyPath },
    { path: "/support", finalPathname: "/support" },
  ]) {
    await navigateAndSettleExactApplicationRead(
      page,
      new URL(route.path, partnerOrigin).toString(),
      {
        expectedFinalPathname: route.finalPathname,
        expectedReadPathname: route.readPathname,
      },
    );
    if (route.readPathname === policyPath) await assertOptimizationPolicySettled(page);
    await expect(
      page.getByText(PARTNER_BRAND_NAME, { exact: false }).filter({ visible: true }).first(),
    ).toBeVisible();
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
  await openFullySettledPartnerLogin(page, partnerOrigin);
  await expect(
    page.getByText(PARTNER_TWO_BRAND_NAME, { exact: false }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(PARTNER_BRAND_NAME, { exact: false })).toHaveCount(0);
  await assertDirectImageLoaded(
    page.locator(`img[alt="${PARTNER_TWO_BRAND_NAME} logo"]`),
    "/logo.svg",
  );
  const policyPath = `/api/campaigns/${PARTNER_TWO_CAMPAIGN_ID}/optimization-policy`;
  await openAuthenticatedSession(page, "partnerChildTwo", "/dashboard", partnerOrigin, policyPath);
  await assertOptimizationPolicySettled(page);
  await expect(
    page.getByText(PARTNER_TWO_BRAND_NAME, { exact: false }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(PARTNER_BRAND_NAME, { exact: false })).toHaveCount(0);
  for (const route of [
    { path: "/builder?resume=1", finalPathname: "/en/onboarding", readPathname: "/api/billing/status" },
    { path: "/launch", finalPathname: "/launch" },
    { path: "/results", finalPathname: "/en/dashboard", readPathname: policyPath },
    { path: "/support", finalPathname: "/support" },
  ]) {
    await navigateAndSettleExactApplicationRead(
      page,
      new URL(route.path, partnerOrigin).toString(),
      {
        expectedFinalPathname: route.finalPathname,
        expectedReadPathname: route.readPathname,
      },
    );
    if (route.readPathname === policyPath) await assertOptimizationPolicySettled(page);
    await expect(
      page.getByText(PARTNER_TWO_BRAND_NAME, { exact: false }).filter({ visible: true }).first(),
    ).toBeVisible();
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
