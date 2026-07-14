const WEBSOCKET_CLOSE_CODE = 1008;
const WEBSOCKET_CLOSE_REASON = "DealFlow acceptance blocks WebSockets";
export const STAGING_ACCESS_HEADER = "x-dealflow-staging-access";
export const STAGING_ACCESS_COOKIE = "__Host-dealflow-staging-access";

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

  const exactOrigins = [...new Set(applicationOrigins)].map((rawOrigin) => {
    let url;
    try {
      url = new URL(rawOrigin);
    } catch {
      throw new Error("Staging access cookies require exact HTTPS origins and a strong secret");
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
      throw new Error("Staging access cookies require exact HTTPS origins and a strong secret");
    }
    return url.origin;
  });

  return exactOrigins.map((origin) => ({
    name: STAGING_ACCESS_COOKIE,
    value: stagingAccessGateSecret,
    url: `${origin}/`,
    httpOnly: true,
    secure: true,
    sameSite: /** @type {"Lax"} */ ("Lax"),
  }));
}
