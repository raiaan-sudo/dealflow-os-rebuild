import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  isExactIsolatedStagingVercelHost,
  isExplicitNonProductionDeployment,
} from "@/lib/deployment-target";
import {
  getInternalSystemJobSecrets,
  getSupabaseEnv,
  isStrongSecretValue,
} from "@/lib/env";
import { getSupabaseAuthCookieOptions } from "@/lib/supabase/cookie-options";
import { parseProductLocalePathname } from "@/lib/i18n/routing";
import {
  createPartnerAttributionToken,
  getPartnerAttributionCookieOptions,
  loadVerifiedPartnerDomainContext,
  PARTNER_ATTRIBUTION_COOKIE,
} from "@/lib/white-label/verified-partner-domain";
import {
  getAllowedGhlParentOrigins,
  GHL_EMBED_BOOTSTRAP_PATH,
  GHL_EMBED_LEGACY_BOOTSTRAP_PATH,
  GHL_EMBED_CAPABILITY_COOKIE,
  GHL_EMBED_SESSION_COOKIE,
  type GhlEmbedCapability,
  verifyGhlEmbedCapability,
  verifyGhlEmbedSessionMarker,
} from "@/lib/white-label/ghl-embed-capability";
import { resolveGhlEmbedHostContext } from "@/lib/white-label/ghl-embed-host-context";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/auth/callback",
  "/privacy",
  "/terms",
  "/data-deletion",
  "/crm/embed",
  "/crm/connect",
  "/ghl/embed",
  "/access/checkout",
  "/access-key/success",
  "/access-key/cancel",
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image",
  "/favicon.ico",
  "/file.svg",
  "/globe.svg",
  "/logo-icon.svg",
  "/logo.svg",
  "/next.svg",
  "/vercel.svg",
  "/window.svg",
]);
const PUBLIC_API_PATHS = new Set([
  "/api/meta/data-deletion",
  "/api/meta/leadgen/webhook",
  "/api/integrations/meta/callback",
  "/api/lead-capture",
  "/api/lead-tracking/browser-pixel",
  "/api/sms/twilio",
  "/api/webhooks/twilio/status",
  "/api/stripe/webhook",
  "/api/client-errors",
  "/api/access-keys/checkout",
  "/api/access-keys/preclaim",
  "/api/access-keys/reveal-ack",
  "/api/auth/session",
  "/api/integrations/ghl/embed-context",
  "/api/integrations/ghl/webhook",
  "/api/support/delivery-callback",
]);
const STAGING_ACCESS_HEADER = "x-dealflow-staging-access";
const STAGING_ACCESS_COOKIE = "__Host-dealflow-staging-access";
const VERCEL_PROTECTION_BYPASS_HEADER = "x-vercel-protection-bypass";
const VERCEL_SET_BYPASS_COOKIE_HEADER = "x-vercel-set-bypass-cookie";
const VERCEL_AUTOMATION_BYPASS_COOKIE = "_vercel_jwt";
const STAGING_PRIVATE_IMAGE_SOURCE_PATH_PREFIX =
  "/staging-private-image-gate-proof-v2/";
const STAGING_RETIRED_PUBLIC_IMAGE_SOURCE_PATH =
  "/staging-image-optimizer-proof.png";
const DISABLED_STAGING_IMAGE_OPTIMIZER_PATH =
  "/_dealflow-staging-image-optimizer-disabled";
const STAGING_NATIVE_PROVIDER_CALLBACK_PATHS = new Set([
  "/api/integrations/crm/marketplace/callback",
  "/api/integrations/ghl/marketplace/callback",
  "/api/integrations/ghl/webhook",
  "/api/meta/data-deletion",
  "/api/meta/leadgen/webhook",
  "/api/sms/twilio",
  "/api/stripe/webhook",
  "/api/webhooks/twilio/status",
]);

function isPublicRequest(pathname: string) {
  if (
    pathname.startsWith(STAGING_PRIVATE_IMAGE_SOURCE_PATH_PREFIX) &&
    /^[0-9a-f]{40}\.png$/.test(
      pathname.slice(STAGING_PRIVATE_IMAGE_SOURCE_PATH_PREFIX.length),
    ) &&
    isExactIsolatedStagingVercelHost()
  ) {
    return true;
  }
  if (
    pathname === "/ui-direction" &&
    (process.env.NODE_ENV !== "production" || process.env.UI_DIRECTION_PREVIEW === "1")
  ) {
    return true;
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return true;
  }

  if (pathname.startsWith("/f/")) {
    return true;
  }

  if (pathname.startsWith("/api/provider-media/higgsfield-source/")) {
    return true;
  }

  if (/^\/p\/[^/]+\/checkout$/.test(pathname)) {
    return true;
  }

  return PUBLIC_API_PATHS.has(pathname);
}

function getEffectiveProductPathname(request: NextRequest) {
  return parseProductLocalePathname(request.nextUrl.pathname).pathname;
}

function buildLocalePreservingPath(request: NextRequest, pathname: string) {
  const parsed = parseProductLocalePathname(request.nextUrl.pathname);
  if (!parsed.hadLocalePrefix) return pathname;
  return pathname === "/" ? `/${parsed.locale}` : `/${parsed.locale}${pathname}`;
}

function timingSafeTokenEquals(candidate: string | null, expected: string) {
  if (!candidate || !expected) {
    return false;
  }

  let mismatch = candidate.length ^ expected.length;
  const length = Math.max(candidate.length, expected.length);

  for (let index = 0; index < length; index += 1) {
    mismatch |= candidate.charCodeAt(index % candidate.length) ^ expected.charCodeAt(index % expected.length);
  }

  return mismatch === 0;
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function isInternalApiRequest(pathname: string) {
  return pathname === "/api/internal" || pathname.startsWith("/api/internal/");
}

function isAuthorizedInternalRequest(request: NextRequest) {
  const secrets = getInternalSystemJobSecrets();
  const token =
    getBearerToken(request) ??
    request.headers.get("x-internal-system-key")?.trim() ??
    null;

  return {
    configured: secrets.length > 0,
    authorized: secrets.some((secret) => timingSafeTokenEquals(token, secret)),
  };
}

function getIsolatedStagingAccessDecision(request: NextRequest) {
  const hostedProductionSlot =
    process.env.VERCEL_ENV?.trim().toLowerCase() === "production";
  const explicitlyStaging =
    process.env.DEALFLOW_DEPLOYMENT_TARGET?.trim().toLowerCase() === "staging";
  const exactIsolatedStagingHost = isExactIsolatedStagingVercelHost();

  // A production-slot deployment claiming to be staging must never become
  // public merely because its project identity or attestation is absent or
  // wrong. True production remains intentionally ungated; staging intent
  // without exact authority fails closed before any request can pass through.
  if (hostedProductionSlot && explicitlyStaging && !exactIsolatedStagingHost) {
    return { required: true, configured: false, authorized: false } as const;
  }

  if (!exactIsolatedStagingHost) {
    return { required: false, configured: true, authorized: true } as const;
  }

  // Provider callbacks cannot attach DealFlow's private staging header. Only
  // the exact native callback routes bypass this outer gate; each remains
  // fail-closed behind its route-level signature/verify-token contract or,
  // for the GHL OAuth callbacks, authenticated context plus one-time state.
  if (STAGING_NATIVE_PROVIDER_CALLBACK_PATHS.has(request.nextUrl.pathname)) {
    return { required: false, configured: true, authorized: true } as const;
  }

  const secret = process.env.STAGING_ACCESS_GATE_SECRET?.trim() ?? "";
  const configured = isStrongSecretValue(secret);
  const headerCandidate = request.headers.get(STAGING_ACCESS_HEADER)?.trim() ?? null;
  const cookieCandidate = request.cookies.get(STAGING_ACCESS_COOKIE)?.value.trim() ?? null;
  return {
    required: true,
    configured,
    authorized:
      configured &&
      (timingSafeTokenEquals(headerCandidate, secret) ||
        timingSafeTokenEquals(cookieCandidate, secret)),
  } as const;
}

function removeCookieFromRequestHeader(
  cookieHeader: string | null,
  cookieName: string,
) {
  if (!cookieHeader) return null;
  const retained = cookieHeader
    .split(";")
    .map((segment) => segment.trim())
    .filter((segment) => {
      const separator = segment.indexOf("=");
      const name = separator === -1 ? segment : segment.slice(0, separator);
      return name !== cookieName;
    });
  return retained.length > 0 ? retained.join("; ") : null;
}

function stripStagingAccessCredentials(requestHeaders: Headers) {
  requestHeaders.delete(STAGING_ACCESS_HEADER);
  requestHeaders.delete(VERCEL_PROTECTION_BYPASS_HEADER);
  requestHeaders.delete(VERCEL_SET_BYPASS_COOKIE_HEADER);
  let sanitizedCookieHeader = removeCookieFromRequestHeader(
    requestHeaders.get("cookie"),
    STAGING_ACCESS_COOKIE,
  );
  sanitizedCookieHeader = removeCookieFromRequestHeader(
    sanitizedCookieHeader,
    VERCEL_AUTOMATION_BYPASS_COOKIE,
  );
  if (sanitizedCookieHeader) {
    requestHeaders.set("cookie", sanitizedCookieHeader);
  } else {
    requestHeaders.delete("cookie");
  }
  return requestHeaders;
}

const ROOT_APP_REDIRECT_HOSTS = new Set([
  "agentdealflow.io",
  "app.agentdealflow.io",
]);
const GHL_EMBEDDABLE_PATHS = new Set([
  "/onboarding",
  "/campaign-built",
  "/paywall",
  "/build/funnel",
  "/build/creatives",
  "/preview",
  "/launch",
  "/launching",
  "/launch-success",
  "/unlock",
  "/results",
  "/dashboard",
  "/settings",
  "/support",
  "/builder",
]);
const GHL_EMBED_BOOTSTRAP_PATHS = new Set([
  GHL_EMBED_BOOTSTRAP_PATH,
  GHL_EMBED_LEGACY_BOOTSTRAP_PATH,
]);
const STAGING_GHL_EMBED_CONTEXT_PATH = "/api/integrations/ghl/embed-context";
const STAGING_GHL_BOOTSTRAP_PUBLIC_ASSETS = new Set([
  "/favicon.ico",
  "/logo-icon.svg",
  "/logo.svg",
]);
const STAGING_GHL_EMBED_DENIED_PATHS = new Set([
  "/admin",
  "/api/internal",
]);

function parseHttpRequestUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function isStagingGhlEmbedDeniedPath(pathname: string) {
  return Array.from(STAGING_GHL_EMBED_DENIED_PATHS).some(
    (blocked) => pathname === blocked || pathname.startsWith(`${blocked}/`),
  ) ||
    pathname.startsWith(STAGING_PRIVATE_IMAGE_SOURCE_PATH_PREFIX) ||
    pathname === STAGING_RETIRED_PUBLIC_IMAGE_SOURCE_PATH ||
    pathname === DISABLED_STAGING_IMAGE_OPTIMIZER_PATH;
}

function isExactGhlBootstrapReferer(request: NextRequest) {
  const referer = parseHttpRequestUrl(request.headers.get("referer"));
  return Boolean(
    referer &&
    referer.origin === request.nextUrl.origin &&
    GHL_EMBED_BOOTSTRAP_PATHS.has(
      parseProductLocalePathname(referer.pathname).pathname,
    ),
  );
}

async function isAuthorizedIsolatedStagingGhlEmbedRequest(
  request: NextRequest,
) {
  if (
    process.env.GHL_IFRAME_EMBED_ENABLED !== "true" ||
    isStagingGhlEmbedDeniedPath(request.nextUrl.pathname)
  ) {
    return false;
  }

  const hostContext = await resolveGhlEmbedHostContext(request.nextUrl.hostname);
  if (!hostContext || hostContext.domain !== request.nextUrl.hostname.toLowerCase()) {
    return false;
  }

  const pathname = getEffectiveProductPathname(request);
  const method = request.method.toUpperCase();
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase() ?? "";
  const fetchDest = request.headers.get("sec-fetch-dest")?.trim().toLowerCase() ?? "";

  if (
    GHL_EMBED_BOOTSTRAP_PATHS.has(pathname) &&
    ["GET", "HEAD"].includes(method) &&
    fetchSite === "cross-site" &&
    fetchDest === "iframe"
  ) {
    const referer = parseHttpRequestUrl(request.headers.get("referer"));
    return Boolean(
      referer &&
      getAllowedGhlParentOrigins(hostContext.domain).includes(referer.origin),
    );
  }

  if (
    ["GET", "HEAD"].includes(method) &&
    fetchSite === "same-origin" &&
    isExactGhlBootstrapReferer(request) &&
    (
      request.nextUrl.pathname.startsWith("/_next/static/") ||
      STAGING_GHL_BOOTSTRAP_PUBLIC_ASSETS.has(request.nextUrl.pathname)
    )
  ) {
    return true;
  }

  if (
    request.nextUrl.pathname === STAGING_GHL_EMBED_CONTEXT_PATH &&
    ["GET", "POST"].includes(method) &&
    fetchSite === "same-origin" &&
    fetchDest === "empty" &&
    isExactGhlBootstrapReferer(request)
  ) {
    const origin = request.headers.get("origin")?.trim() ?? "";
    return method === "GET" ? !origin || origin === request.nextUrl.origin : origin === request.nextUrl.origin;
  }

  const [capability, session] = await Promise.all([
    verifyGhlEmbedCapability(
      request.cookies.get(GHL_EMBED_CAPABILITY_COOKIE)?.value,
      { expectedHost: hostContext.domain, requiredStage: "authenticated" },
    ),
    verifyGhlEmbedSessionMarker(
      request.cookies.get(GHL_EMBED_SESSION_COOKIE)?.value,
      { expectedHost: hostContext.domain },
    ),
  ]);
  return Boolean(
    capability &&
    session &&
    capability.stage === "authenticated" &&
    capability.dealflowUserId &&
    capability.dealflowUserId === session.dealflowUserId &&
    capability.partnerId === session.partnerId &&
    capability.parentOrigin === session.parentOrigin &&
    getAllowedGhlParentOrigins(hostContext.domain).includes(capability.parentOrigin),
  );
}
function hasEmbeddedAppReturn(request: NextRequest) {
  if (
    getEffectiveProductPathname(request) !== "/login" ||
    request.nextUrl.searchParams.get("embed") !== "1"
  ) {
    return false;
  }

  const redirectedFrom = request.nextUrl.searchParams.get("redirectedFrom");
  if (
    !redirectedFrom ||
    !redirectedFrom.startsWith("/") ||
    redirectedFrom.startsWith("//") ||
    redirectedFrom.includes("\\")
  ) {
    return false;
  }

  try {
    return GHL_EMBEDDABLE_PATHS.has(
      parseProductLocalePathname(new URL(redirectedFrom, request.url).pathname).pathname,
    );
  } catch {
    return false;
  }
}

function getGhlEmbedReturnPath(request: NextRequest) {
  if (
    getEffectiveProductPathname(request) !== "/login" ||
    request.nextUrl.searchParams.get("embed") !== "ghl"
  ) {
    return null;
  }
  const redirectedFrom = request.nextUrl.searchParams.get("redirectedFrom");
  if (!redirectedFrom || redirectedFrom.startsWith("//") || redirectedFrom.includes("\\")) {
    return null;
  }
  try {
    return parseProductLocalePathname(
      new URL(redirectedFrom, request.url).pathname,
    ).pathname;
  } catch {
    return null;
  }
}

function isGhlEmbeddableSurface(request: NextRequest) {
  return (
    GHL_EMBEDDABLE_PATHS.has(getEffectiveProductPathname(request)) ||
    hasEmbeddedAppReturn(request)
  );
}

function shouldResolvePartnerDomainContext(request: NextRequest) {
  const pathname = getEffectiveProductPathname(request);
  return (
    pathname === "/" ||
    pathname === "/login" ||
    GHL_EMBED_BOOTSTRAP_PATHS.has(pathname) ||
    isGhlEmbeddableSurface(request)
  );
}

function getFrameAncestors(
  request: NextRequest,
  verifiedPartnerDomain: string | null,
  embedCapability: GhlEmbedCapability | null,
) {
  const host = request.nextUrl.hostname.toLowerCase();

  if (
    process.env.GHL_IFRAME_EMBED_ENABLED !== "true" ||
    !verifiedPartnerDomain ||
    verifiedPartnerDomain !== host
  ) {
    return "'none'";
  }

  if (GHL_EMBED_BOOTSTRAP_PATHS.has(getEffectiveProductPathname(request))) {
    const bootstrapParents = getAllowedGhlParentOrigins(host);
    return bootstrapParents.length > 0 ? bootstrapParents.join(" ") : "'none'";
  }

  if (!embedCapability || embedCapability.domain !== host) return "'none'";
  const embedReturnPath = getGhlEmbedReturnPath(request);
  if (
    (embedReturnPath !== null && GHL_EMBED_BOOTSTRAP_PATHS.has(embedReturnPath)) ||
    (embedCapability.stage === "authenticated" &&
      embedReturnPath &&
      GHL_EMBEDDABLE_PATHS.has(embedReturnPath))
  ) {
    return embedCapability.parentOrigin;
  }
  if (embedCapability.stage === "authenticated" && isGhlEmbeddableSurface(request)) {
    return embedCapability.parentOrigin;
  }
  return "'none'";
}

function addEmbeddedAuthRedirectState(
  request: NextRequest,
  loginUrl: URL,
  verifiedPartnerDomain: string | null,
  embedCapability: GhlEmbedCapability | null,
) {
  if (getFrameAncestors(request, verifiedPartnerDomain, embedCapability) === "'none'") {
    return;
  }

  loginUrl.searchParams.set("embed", "ghl");
}

function shouldRedirectRootToApp(
  request: NextRequest,
  verifiedPartnerDomain: string | null,
) {
  const host = request.nextUrl.hostname.toLowerCase();
  return (
    getEffectiveProductPathname(request) === "/" &&
    (ROOT_APP_REDIRECT_HOSTS.has(host) || verifiedPartnerDomain === host)
  );
}

function buildRootAppRedirect(request: NextRequest) {
  const redirectUrl = new URL(
    buildLocalePreservingPath(request, "/onboarding"),
    request.url,
  );
  redirectUrl.search = request.nextUrl.search;
  return redirectUrl;
}

function getSecuritySurface(pathname: string) {
  if (["/", "/privacy", "/terms", "/data-deletion"].includes(pathname)) {
    return "marketing" as const;
  }
  if (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/access") ||
    pathname.startsWith("/f/")
  ) {
    return "public_app" as const;
  }
  return "authenticated_app" as const;
}

function getIsolatedLoopbackSupabaseOrigin() {
  if (!isExplicitNonProductionDeployment()) {
    return null;
  }

  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "");
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase())
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function buildContentSecurityPolicy(
  request: NextRequest,
  nonce: string,
  verifiedPartnerDomain: string | null,
  embedCapability: GhlEmbedCapability | null,
) {
  const isProductionBuild = process.env.NODE_ENV === "production";
  const useProductionTransportSecurity =
    isProductionBuild && !isExplicitNonProductionDeployment();
  const frameAncestors = getFrameAncestors(request, verifiedPartnerDomain, embedCapability);
  const surface = getSecuritySurface(getEffectiveProductPathname(request));
  const isolatedLoopbackSupabaseOrigin = getIsolatedLoopbackSupabaseOrigin();
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isProductionBuild ? [] : ["'unsafe-eval'"]),
    "https://va.vercel-scripts.com",
    ...(surface === "marketing"
      ? []
      : ["https://js.stripe.com", "https://challenges.cloudflare.com"]),
    ...(surface === "authenticated_app" ? ["https://connect.facebook.net"] : []),
  ];
  const connectSrc = [
    "'self'",
    "https://va.vercel-scripts.com",
    "https://vitals.vercel-insights.com",
    ...(surface === "marketing"
      ? []
      : [
          "https://*.supabase.co",
          ...(isolatedLoopbackSupabaseOrigin ? [isolatedLoopbackSupabaseOrigin] : []),
          "https://api.stripe.com",
          "https://challenges.cloudflare.com",
        ]),
    ...(surface === "authenticated_app"
      ? [
          "https://graph.facebook.com",
          "https://www.facebook.com",
          "https://api.openai.com",
          "https://api.heygen.com",
        ]
      : []),
  ];
  const frameSrc = surface === "marketing"
    ? ["'none'"]
    : [
        "https://js.stripe.com",
        "https://hooks.stripe.com",
        "https://challenges.cloudflare.com",
        ...(surface === "authenticated_app" ? ["https://www.facebook.com"] : []),
      ];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "script-src-attr 'none'",
    // Next.js and React still emit framework-managed inline style attributes.
    // Script execution is nonce-bound; style tightening is tracked separately.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob: https:",
    `connect-src ${connectSrc.join(" ")}`,
    `frame-src ${frameSrc.join(" ")}`,
    "form-action 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `frame-ancestors ${frameAncestors}`,
    ...(useProductionTransportSecurity ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function applySecurityHeaders(
  request: NextRequest,
  response: NextResponse,
  nonce: string,
  verifiedPartnerDomain: string | null,
  embedCapability: GhlEmbedCapability | null,
  startedAt?: number,
) {
  const useProductionTransportSecurity =
    process.env.NODE_ENV === "production" && !isExplicitNonProductionDeployment();
  const frameAncestors = getFrameAncestors(request, verifiedPartnerDomain, embedCapability);
  const allowsExternalFrameAncestors = frameAncestors !== "'none'";

  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (allowsExternalFrameAncestors) {
    response.headers.delete("X-Frame-Options");
  } else {
    response.headers.set("X-Frame-Options", "DENY");
  }
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Origin-Agent-Cluster", "?1");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  response.headers.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy(request, nonce, verifiedPartnerDomain, embedCapability),
  );

  if (useProductionTransportSecurity) {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  if (typeof startedAt === "number") {
    const durationMs = Math.max(Date.now() - startedAt, 0);
    response.headers.set("Server-Timing", `app;dur=${durationMs}`);
    response.headers.set("X-DealFlow-Route-Duration-Ms", String(durationMs));
  }

  return response;
}

export async function proxy(request: NextRequest) {
  const startedAt = Date.now();
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const stagingAccess = getIsolatedStagingAccessDecision(request);
  if (stagingAccess.required && !stagingAccess.configured) {
    return applySecurityHeaders(
      request,
      NextResponse.json(
        { error: "Isolated staging access is unavailable." },
        {
          status: 503,
          headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
        },
      ),
      nonce,
      null,
      null,
      startedAt,
    );
  }
  const stagingGhlEmbedAuthorized =
    stagingAccess.required && stagingAccess.configured
      ? await isAuthorizedIsolatedStagingGhlEmbedRequest(request)
      : false;
  // Vercel Cron cannot attach DealFlow's private staging-access header. It
  // does attach the exact configured cron bearer token, which is already one
  // of the internal-system-job secrets. Allow only an exact internal route
  // with that existing constant-time authorization to cross the outer
  // staging gate; the normal internal-route branch below validates it again.
  // Invalid or missing tokens still receive the staging 404, so this does not
  // reveal that the private route exists.
  const stagingInternalRequestAuthorized =
    stagingAccess.required &&
    stagingAccess.configured &&
    isInternalApiRequest(request.nextUrl.pathname) &&
    isAuthorizedInternalRequest(request).authorized;
  if (
    stagingAccess.required &&
    !stagingAccess.authorized &&
    !stagingGhlEmbedAuthorized &&
    !stagingInternalRequestAuthorized
  ) {
    return applySecurityHeaders(
      request,
      NextResponse.json(
        { error: "Not found." },
        {
          status: 404,
          headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
        },
      ),
      nonce,
      null,
      null,
      startedAt,
    );
  }
  const rawPathname = request.nextUrl.pathname;
  if (
    stagingAccess.required &&
    (
      rawPathname === DISABLED_STAGING_IMAGE_OPTIMIZER_PATH ||
      rawPathname === STAGING_RETIRED_PUBLIC_IMAGE_SOURCE_PATH
    )
  ) {
    // The custom staging optimizer path remains application-owned and closed.
    // Vercel's default /_next/image path is edge-owned and is instead proven as
    // an exact disallowed-input response by hosted acceptance. The retired
    // public source is also closed so a historical transform can never refresh
    // from an origin response. Production never enters this branch.
    return applySecurityHeaders(
      request,
      NextResponse.json(
        { error: "Not found." },
        {
          status: 404,
          headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
        },
      ),
      nonce,
      null,
      null,
      startedAt,
    );
  }
  if (
    rawPathname === "/_next" ||
    rawPathname.startsWith("/_next/")
  ) {
    // These paths were historically excluded from the proxy. They must pass
    // through the staging gate first, then retain production's normal static
    // handling with the gate header/cookie stripped from the internal request.
    return NextResponse.next({
      request: {
        headers: stripStagingAccessCredentials(new Headers(request.headers)),
      },
    });
  }
  const pathname = getEffectiveProductPathname(request);
  const shouldResolvePartnerDomain = shouldResolvePartnerDomainContext(request);
  const verifiedPartnerContext = shouldResolvePartnerDomain
    ? await loadVerifiedPartnerDomainContext(request.nextUrl.hostname)
    : null;
  const verifiedPartnerDomain = verifiedPartnerContext?.domain ?? null;
  const ghlEmbedHostContext = shouldResolvePartnerDomain
    ? await resolveGhlEmbedHostContext(request.nextUrl.hostname)
    : null;
  const ghlEmbedHost = ghlEmbedHostContext?.domain ?? null;
  const embedCapability = ghlEmbedHost
    ? await verifyGhlEmbedCapability(
        request.cookies.get(GHL_EMBED_CAPABILITY_COOKIE)?.value,
        { expectedHost: ghlEmbedHost },
      )
    : null;
  const embedSessionMarker = ghlEmbedHost
    ? await verifyGhlEmbedSessionMarker(
        request.cookies.get(GHL_EMBED_SESSION_COOKIE)?.value,
        { expectedHost: ghlEmbedHost },
      )
    : null;
  const partnerAttributionToken = verifiedPartnerContext
    ? await createPartnerAttributionToken(verifiedPartnerContext)
    : null;
  const finalize = (
    nextResponse: NextResponse,
    effectiveEmbedCapability = embedCapability,
  ) => {
    if (verifiedPartnerContext && partnerAttributionToken) {
      nextResponse.cookies.set(
        PARTNER_ATTRIBUTION_COOKIE,
        partnerAttributionToken,
        getPartnerAttributionCookieOptions(request.nextUrl.protocol === "https:"),
      );
    }
    return applySecurityHeaders(
      request,
      nextResponse,
      nonce,
      ghlEmbedHost,
      effectiveEmbedCapability,
      startedAt,
    );
  };
  const requestHeaders = new Headers(request.headers);
  stripStagingAccessCredentials(requestHeaders);
  requestHeaders.delete("x-dealflow-verified-partner-domain");
  requestHeaders.delete("x-dealflow-verified-partner-id");
  requestHeaders.delete("x-dealflow-verified-partner-slug");
  requestHeaders.delete("x-dealflow-partner-attribution");
  requestHeaders.delete("x-dealflow-ghl-embed-organization");
  requestHeaders.delete("x-dealflow-ghl-embed-parent-origin");
  requestHeaders.delete("x-dealflow-ghl-embed-host");
  if (verifiedPartnerContext) {
    requestHeaders.set("x-dealflow-verified-partner-domain", verifiedPartnerContext.domain);
    requestHeaders.set("x-dealflow-verified-partner-id", verifiedPartnerContext.partnerId);
    requestHeaders.set("x-dealflow-verified-partner-slug", verifiedPartnerContext.partnerSlug);
  }
  if (partnerAttributionToken) {
    requestHeaders.set("x-dealflow-partner-attribution", partnerAttributionToken);
  }
  if (ghlEmbedHost) {
    requestHeaders.set("x-dealflow-ghl-embed-host", ghlEmbedHost);
  }
  if (embedCapability?.stage === "authenticated") {
    requestHeaders.set(
      "x-dealflow-ghl-embed-organization",
      embedCapability.organizationId,
    );
    requestHeaders.set(
      "x-dealflow-ghl-embed-parent-origin",
      embedCapability.parentOrigin,
    );
  }
  requestHeaders.set("x-pathname", rawPathname);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy(request, nonce, ghlEmbedHost, embedCapability),
  );
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  if (shouldRedirectRootToApp(request, verifiedPartnerDomain)) {
    return finalize(NextResponse.redirect(buildRootAppRedirect(request)));
  }

  if (
    embedSessionMarker &&
    !embedCapability &&
    !GHL_EMBED_BOOTSTRAP_PATHS.has(pathname) &&
    pathname !== "/api/integrations/ghl/embed-context"
  ) {
    if (pathname.startsWith("/api/")) {
      return finalize(
        NextResponse.json(
          {
            error: "The embedded CRM session must be refreshed.",
            code: "ghl_embed_reauthentication_required",
            nextPath: GHL_EMBED_BOOTSTRAP_PATH,
          },
          { status: 401 },
        ),
        null,
      );
    }
    if (
      GHL_EMBEDDABLE_PATHS.has(pathname) ||
      pathname === "/login"
    ) {
      return finalize(
        NextResponse.redirect(new URL(GHL_EMBED_BOOTSTRAP_PATH, request.url)),
        null,
      );
    }
  }

  if (isPublicRequest(pathname)) {
    return finalize(response);
  }

  if (isInternalApiRequest(pathname)) {
    const { configured, authorized } = isAuthorizedInternalRequest(request);

    if (!configured) {
      return finalize(NextResponse.json(
        { error: "Internal system job runner secret is not configured." },
        { status: 503 },
      ));
    }

    if (!authorized) {
      const rejected = NextResponse.json(
        { error: "Internal system authorization is required." },
        {
          status: 401,
          headers: {
            "WWW-Authenticate": "Bearer",
          },
        },
      );
      return finalize(rejected);
    }

    response.headers.set("X-Internal-Job-Runner", "authorized");
    return finalize(response);
  }

  const supabaseEnv = getSupabaseEnv();
  if (!supabaseEnv) {
    const loginUrl = new URL(
      buildLocalePreservingPath(request, "/login"),
      request.url,
    );
    loginUrl.searchParams.set("reason", "setup");
    if (!pathname.startsWith("/api/")) {
      loginUrl.searchParams.set("redirectedFrom", `${rawPathname}${request.nextUrl.search}`);
      addEmbeddedAuthRedirectState(
        request,
        loginUrl,
        ghlEmbedHost,
        embedCapability,
      );
    }
    return finalize(NextResponse.redirect(loginUrl));
  }

  const supabase = createServerClient(supabaseEnv.url, supabaseEnv.anonKey, {
    cookieOptions: getSupabaseAuthCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        }
        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: suspended, error: suspensionError } = await (supabase as any).rpc(
      "is_current_account_deletion_suspended_v1",
    );
    if (suspensionError || typeof suspended !== "boolean") {
      if (pathname.startsWith("/api/")) {
        return finalize(NextResponse.json(
          {
            error: "Account deletion access status is temporarily unavailable.",
            code: "account_deletion_access_fence_unavailable",
          },
          { status: 503 },
        ));
      }
      const unavailableUrl = new URL(
        buildLocalePreservingPath(request, "/data-deletion"),
        request.url,
      );
      unavailableUrl.searchParams.set("reason", "access_check_unavailable");
      return finalize(NextResponse.redirect(unavailableUrl));
    }
    if (suspended) {
      if (pathname.startsWith("/api/")) {
        return finalize(NextResponse.json(
          {
            error: "This workspace is suspended for verified account deletion.",
            code: "account_deletion_workspace_suspended",
            nextPath: "/data-deletion",
          },
          { status: 423 },
        ));
      }
      const suspendedUrl = new URL(
        buildLocalePreservingPath(request, "/data-deletion"),
        request.url,
      );
      suspendedUrl.searchParams.set("reason", "account_suspended");
      return finalize(NextResponse.redirect(suspendedUrl));
    }
    if (
      embedCapability?.stage === "authenticated" &&
      embedCapability.dealflowUserId !== user.id &&
      getFrameAncestors(request, ghlEmbedHost, embedCapability) !== "'none'"
    ) {
      return finalize(
        NextResponse.json(
          { error: "The embedded CRM session does not match this DealFlow user." },
          { status: 403 },
        ),
        null,
      );
    }
    return finalize(response);
  }

  if (pathname.startsWith("/api/")) {
    return finalize(NextResponse.json(
      { error: "Authentication is required for this route." },
      { status: 401 },
    ));
  }

  const loginUrl = new URL(
    buildLocalePreservingPath(request, "/login"),
    request.url,
  );
  loginUrl.searchParams.set("reason", "expired");
  loginUrl.searchParams.set("redirectedFrom", `${rawPathname}${request.nextUrl.search}`);
  addEmbeddedAuthRedirectState(
    request,
    loginUrl,
    ghlEmbedHost,
    embedCapability,
  );
  return finalize(NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: ["/:path*"],
};
