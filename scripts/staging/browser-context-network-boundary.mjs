const WEBSOCKET_CLOSE_CODE = 1008;
const WEBSOCKET_CLOSE_REASON = "DealFlow acceptance blocks WebSockets";
export const STAGING_ACCESS_HEADER = "x-dealflow-staging-access";
export const STAGING_ACCESS_COOKIE = "__Host-dealflow-staging-access";
export const VERCEL_AUTOMATION_BYPASS_HEADER = "x-vercel-protection-bypass";
export const VERCEL_SET_BYPASS_COOKIE_HEADER = "x-vercel-set-bypass-cookie";
export const VERCEL_AUTOMATION_BYPASS_COOKIE = "_vercel_jwt";

const STRONG_VERCEL_AUTOMATION_BYPASS_SECRET = /^[\x21-\x7e]{32,}$/;
const EXACT_VERCEL_PROTECTION_ENTRY_KEYS = Object.freeze([
  "origin",
  "vercelAutomationBypassRequired",
]);

function exactStandardHttpsOrigins(applicationOrigins, errorMessage) {
  if (!Array.isArray(applicationOrigins) || applicationOrigins.length === 0) {
    throw new Error(errorMessage);
  }

  return [...new Set(applicationOrigins)].map((rawOrigin) => {
    let url;
    try {
      url = new URL(rawOrigin);
    } catch {
      throw new Error(errorMessage);
    }
    if (
      url.protocol !== "https:" ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.origin !== rawOrigin
    ) {
      throw new Error(errorMessage);
    }
    return url.origin;
  });
}

function isStrongVercelAutomationBypassSecret(secret) {
  return (
    typeof secret === "string" &&
    secret.trim() === secret &&
    STRONG_VERCEL_AUTOMATION_BYPASS_SECRET.test(secret)
  );
}

/**
 * Parse and bind the runner-produced Vercel protection portfolio to the exact
 * ordered browser origin portfolio. No host can be omitted, added, duplicated,
 * reordered, or silently defaulted to protected/unprotected.
 *
 * @param {{serializedPortfolio: string, applicationOrigins: string[]}} options
 */
export function exactVercelAutomationProtectionPortfolio({
  serializedPortfolio,
  applicationOrigins,
}) {
  const errorMessage =
    "Vercel automation protection portfolio does not exactly cover the browser origins";
  let exactOrigins;
  let parsed;
  try {
    exactOrigins = exactStandardHttpsOrigins(applicationOrigins, errorMessage);
    parsed = JSON.parse(serializedPortfolio);
  } catch {
    throw new Error(errorMessage);
  }
  if (
    exactOrigins.length !== applicationOrigins.length ||
    !Array.isArray(parsed) ||
    parsed.length !== exactOrigins.length ||
    parsed.some((entry, index) =>
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      JSON.stringify(Object.keys(entry).sort()) !==
        JSON.stringify(EXACT_VERCEL_PROTECTION_ENTRY_KEYS) ||
      entry.origin !== exactOrigins[index] ||
      typeof entry.vercelAutomationBypassRequired !== "boolean"
    )
  ) {
    throw new Error(errorMessage);
  }
  return Object.freeze(parsed.map((entry) => Object.freeze({
    origin: entry.origin,
    vercelAutomationBypassRequired:
      entry.vercelAutomationBypassRequired,
  })));
}

/**
 * Construct Vercel automation headers for one exact HTTPS origin.
 *
 * Callers must disable redirects on the request that carries these headers.
 * This helper never accepts caller-provided headers, so a stale or differently
 * cased credential cannot survive when the target is rejected.
 */
export function vercelAutomationBypassHeadersForExactOrigin({
  rawUrl,
  applicationOrigin,
  vercelAutomationBypassSecret,
  setBypassCookie = false,
}) {
  let target;
  let origin;
  try {
    target = new URL(rawUrl);
    [origin] = exactStandardHttpsOrigins(
      [applicationOrigin],
      "Vercel automation bypass requires an exact HTTPS application origin and a strong secret",
    );
  } catch {
    throw new Error(
      "Vercel automation bypass requires an exact HTTPS application origin and a strong secret",
    );
  }
  if (
    target.origin !== origin ||
    target.protocol !== "https:" ||
    target.username !== "" ||
    target.password !== "" ||
    target.hash !== "" ||
    !isStrongVercelAutomationBypassSecret(vercelAutomationBypassSecret)
  ) {
    throw new Error(
      "Vercel automation bypass requires an exact HTTPS application origin and a strong secret",
    );
  }

  return {
    [VERCEL_AUTOMATION_BYPASS_HEADER]: vercelAutomationBypassSecret,
    ...(setBypassCookie ? { [VERCEL_SET_BYPASS_COOKIE_HEADER]: "true" } : {}),
  };
}

/**
 * Prime one host-only Vercel bypass cookie for each exact staging origin.
 *
 * The secret is sent only by BrowserContext.request to the exact origin root,
 * with redirect following disabled. It is never installed as a context-wide
 * header, browser-route override, query parameter, cookie value, return value,
 * or error detail. Follow-up page/API requests rely only on Vercel's host-only
 * `_vercel_jwt` cookie.
 *
 * @param {{
 *   context: {
 *     request: { get: (url: string, options: {headers: Record<string, string>, maxRedirects: number, failOnStatusCode: boolean}) => Promise<{url: () => string, status: () => number, headers: () => Record<string, string>, dispose?: () => Promise<void>}> },
 *     cookies: (urls?: string | string[]) => Promise<Array<{name: string, value: string, domain: string, path: string, httpOnly: boolean, secure: boolean, sameSite: string}>>,
 *     clearCookies: (options?: {name?: string | RegExp, domain?: string | RegExp, path?: string | RegExp}) => Promise<void>
 *   },
 *   applicationOrigins: string[],
 *   serializedProtectionPortfolio: string,
 *   vercelAutomationBypassSecret: string
 * }} options
 */
export async function primeVercelAutomationBypassCookies({
  context,
  applicationOrigins,
  serializedProtectionPortfolio,
  vercelAutomationBypassSecret,
}) {
  const errorMessage = "Vercel automation bypass cookie priming failed safely";
  if (
    !context ||
    typeof context.request?.get !== "function" ||
    typeof context.cookies !== "function" ||
    typeof context.clearCookies !== "function"
  ) {
    throw new Error(errorMessage);
  }

  let exactOrigins;
  let protectedOrigins;
  try {
    const portfolio = exactVercelAutomationProtectionPortfolio({
      serializedPortfolio: serializedProtectionPortfolio,
      applicationOrigins,
    });
    exactOrigins = portfolio.map(({ origin }) => origin);
    protectedOrigins = portfolio
      .filter(({ vercelAutomationBypassRequired }) =>
        vercelAutomationBypassRequired
      )
      .map(({ origin }) => origin);
    if (
      protectedOrigins.length > 0 &&
      !isStrongVercelAutomationBypassSecret(vercelAutomationBypassSecret)
    ) {
      throw new Error(errorMessage);
    }
  } catch {
    throw new Error(errorMessage);
  }

  try {
    for (const origin of exactOrigins) {
      await context.clearCookies({
        name: VERCEL_AUTOMATION_BYPASS_COOKIE,
        domain: new URL(origin).hostname,
      });
    }
    for (const origin of protectedOrigins) {
      const hostname = new URL(origin).hostname;
      const requestUrl = `${origin}/`;
      const response = await context.request.get(requestUrl, {
        headers: vercelAutomationBypassHeadersForExactOrigin({
          rawUrl: requestUrl,
          applicationOrigin: origin,
          vercelAutomationBypassSecret,
          setBypassCookie: true,
        }),
        maxRedirects: 0,
        failOnStatusCode: false,
      });
      const responseUrl = response.url();
      const responseStatus = response.status();
      const responseLocation = response.headers().location;
      await response.dispose?.();
      let resolvedResponseLocation = null;
      try {
        resolvedResponseLocation = typeof responseLocation === "string" && responseLocation
          ? new URL(responseLocation, requestUrl).toString()
          : null;
      } catch {
        resolvedResponseLocation = null;
      }
      if (
        responseUrl !== requestUrl ||
        responseStatus !== 307 ||
        resolvedResponseLocation !== requestUrl
      ) {
        throw new Error(errorMessage);
      }

      const cookies = await context.cookies(requestUrl);
      const bypassCookies = cookies.filter(
        (cookie) => cookie.name === VERCEL_AUTOMATION_BYPASS_COOKIE,
      );
      if (
        bypassCookies.length !== 1 ||
        bypassCookies[0].domain !== hostname ||
        bypassCookies[0].path !== "/" ||
        bypassCookies[0].secure !== true ||
        bypassCookies[0].httpOnly !== true ||
        bypassCookies[0].sameSite !== "Lax" ||
        typeof bypassCookies[0].value !== "string" ||
        bypassCookies[0].value.length === 0
      ) {
        throw new Error(errorMessage);
      }
    }
  } catch {
    await context.clearCookies({ name: VERCEL_AUTOMATION_BYPASS_COOKIE }).catch(() => undefined);
    throw new Error(errorMessage);
  }

  return Object.freeze({ primedOriginCount: protectedOrigins.length });
}

/**
 * Install the acceptance network boundary on the browser context so it covers
 * the initial page, every popup, and every later page in the context. Playwright
 * does not re-run route handlers for every server redirect hop, so callers must
 * also retain request-event diagnostics. The host-only staging cookie below
 * prevents the private gate secret from following those redirect hops.
 *
 * @param {{
 *   route: (url: string, handler: (route: unknown) => unknown) => Promise<unknown>,
 *   routeWebSocket: (url: RegExp, handler: (route: {url: () => string, close: (options: {code: number, reason: string}) => Promise<void>, connectToServer: () => unknown}) => unknown) => Promise<unknown>
 * }} context
 * @param {{
 *   handleHttpRoute: (route: unknown) => unknown,
 *   recordBlockedWebSocket: (url: string) => void,
 *   allowWebSocket?: (url: string) => boolean,
 *   recordAllowedWebSocket?: (url: string) => void
 * }} handlers
 */
export async function installBrowserContextNetworkBoundary(context, handlers) {
  if (
    !context ||
    typeof context.route !== "function" ||
    typeof context.routeWebSocket !== "function" ||
    typeof handlers?.handleHttpRoute !== "function" ||
    typeof handlers?.recordBlockedWebSocket !== "function"
  ) {
    throw new Error("Browser context network boundary requires exact HTTP and WebSocket handlers");
  }

  await context.route("**/*", handlers.handleHttpRoute);
  await context.routeWebSocket(/.*/, async (webSocketRoute) => {
    const url = webSocketRoute.url();
    if (handlers.allowWebSocket?.(url) === true) {
      handlers.recordAllowedWebSocket?.(url);
      webSocketRoute.connectToServer();
      return;
    }
    handlers.recordBlockedWebSocket(url);
    await webSocketRoute.close({
      code: WEBSOCKET_CLOSE_CODE,
      reason: WEBSOCKET_CLOSE_REASON,
    });
  });
}

export function safeWebSocketEvidenceTarget(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.origin;
  } catch {
    return "[invalid-websocket-url]";
  }
}

export function safeHttpEvidenceTarget(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol)) return "[invalid-http-url]";
    return `${url.origin}${url.pathname}`;
  } catch {
    return "[invalid-http-url]";
  }
}

export function isExactLocalNextDevelopmentWebSocket(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const exactDevelopmentSearch =
      url.search === "" ||
      (url.searchParams.size === 1 &&
        typeof url.searchParams.get("id") === "string" &&
        url.searchParams.get("id").length > 0);
    return (
      url.protocol === "ws:" &&
      url.hostname === "127.0.0.1" &&
      url.port === "3410" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/_next/webpack-hmr" &&
      exactDevelopmentSearch &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

export function scopedStagingAccessHeaders({
  headers,
  rawUrl,
  applicationOrigin,
  stagingAccessGateSecret,
}) {
  const scoped = { ...(headers ?? {}) };
  delete scoped[STAGING_ACCESS_HEADER];
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return scoped;
  }
  const exactApplicationRequest =
    typeof applicationOrigin === "string" &&
    target.origin === applicationOrigin &&
    target.username === "" &&
    target.password === "" &&
    target.protocol === "https:";
  if (exactApplicationRequest && typeof stagingAccessGateSecret === "string" && stagingAccessGateSecret) {
    scoped[STAGING_ACCESS_HEADER] = stagingAccessGateSecret;
  }
  return scoped;
}

/**
 * Build host-only browser cookies for the isolated staging gate.
 *
 * BrowserContext route overrides must never carry the gate header: Playwright
 * preserves route.continue() header overrides across redirects without
 * re-running the route handler for the redirect target. A __Host- cookie is
 * therefore the browser-safe transport: it is host-only, HTTPS-only,
 * unavailable to page JavaScript, and never sent to another host. Lax is
 * deliberate so a top-level GET return from Meta OAuth or Stripe can re-enter
 * the private staging host without weakening the host boundary.
 */
export function stagingAccessCookiesForOrigins({
  applicationOrigins,
  stagingAccessGateSecret,
}) {
  if (
    !Array.isArray(applicationOrigins) ||
    applicationOrigins.length === 0 ||
    typeof stagingAccessGateSecret !== "string" ||
    stagingAccessGateSecret.trim() !== stagingAccessGateSecret ||
    stagingAccessGateSecret.length < 43
  ) {
    throw new Error("Staging access cookies require exact HTTPS origins and a strong secret");
  }

  const exactOrigins = exactStandardHttpsOrigins(
    applicationOrigins,
    "Staging access cookies require exact HTTPS origins and a strong secret",
  );

  return exactOrigins.map((origin) => ({
    name: STAGING_ACCESS_COOKIE,
    value: stagingAccessGateSecret,
    url: `${origin}/`,
    httpOnly: true,
    secure: true,
    sameSite: /** @type {"Lax"} */ ("Lax"),
  }));
}
