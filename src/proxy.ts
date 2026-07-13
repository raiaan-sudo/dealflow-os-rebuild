import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isExplicitNonProductionDeployment } from "@/lib/deployment-target";
import { getInternalSystemJobSecrets, getSupabaseEnv } from "@/lib/env";
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
  GHL_EMBED_CAPABILITY_COOKIE,
  GHL_EMBED_SESSION_COOKIE,
  type GhlEmbedCapability,
  verifyGhlEmbedCapability,
  verifyGhlEmbedSessionMarker,
} from "@/lib/white-label/ghl-embed-capability";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/privacy",
  "/terms",
  "/data-deletion",
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
  "/api/integrations/ghl/embed-context",
  "/api/integrations/ghl/webhook",
]);

function isPublicRequest(pathname: string) {
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
    pathname === GHL_EMBED_BOOTSTRAP_PATH ||
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

  if (getEffectiveProductPathname(request) === GHL_EMBED_BOOTSTRAP_PATH) {
    const bootstrapParents = getAllowedGhlParentOrigins(host);
    return bootstrapParents.length > 0 ? bootstrapParents.join(" ") : "'none'";
  }

  if (!embedCapability || embedCapability.domain !== host) return "'none'";
  const embedReturnPath = getGhlEmbedReturnPath(request);
  if (
    embedReturnPath === GHL_EMBED_BOOTSTRAP_PATH ||
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
  const rawPathname = request.nextUrl.pathname;
  const pathname = getEffectiveProductPathname(request);
  const shouldResolvePartnerDomain = shouldResolvePartnerDomainContext(request);
  const verifiedPartnerContext = shouldResolvePartnerDomain
    ? await loadVerifiedPartnerDomainContext(request.nextUrl.hostname)
    : null;
  const verifiedPartnerDomain = verifiedPartnerContext?.domain ?? null;
  const embedCapability = verifiedPartnerDomain
    ? await verifyGhlEmbedCapability(
        request.cookies.get(GHL_EMBED_CAPABILITY_COOKIE)?.value,
        { expectedHost: verifiedPartnerDomain },
      )
    : null;
  const embedSessionMarker = verifiedPartnerDomain
    ? await verifyGhlEmbedSessionMarker(
        request.cookies.get(GHL_EMBED_SESSION_COOKIE)?.value,
        { expectedHost: verifiedPartnerDomain },
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
      verifiedPartnerDomain,
      effectiveEmbedCapability,
      startedAt,
    );
  };
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-dealflow-verified-partner-domain");
  requestHeaders.delete("x-dealflow-verified-partner-id");
  requestHeaders.delete("x-dealflow-verified-partner-slug");
  requestHeaders.delete("x-dealflow-partner-attribution");
  requestHeaders.delete("x-dealflow-ghl-embed-organization");
  requestHeaders.delete("x-dealflow-ghl-embed-parent-origin");
  if (verifiedPartnerContext) {
    requestHeaders.set("x-dealflow-verified-partner-domain", verifiedPartnerContext.domain);
    requestHeaders.set("x-dealflow-verified-partner-id", verifiedPartnerContext.partnerId);
    requestHeaders.set("x-dealflow-verified-partner-slug", verifiedPartnerContext.partnerSlug);
  }
  if (partnerAttributionToken) {
    requestHeaders.set("x-dealflow-partner-attribution", partnerAttributionToken);
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
    buildContentSecurityPolicy(request, nonce, verifiedPartnerDomain, embedCapability),
  );
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  if (shouldRedirectRootToApp(request, verifiedPartnerDomain)) {
    return finalize(NextResponse.redirect(buildRootAppRedirect(request)));
  }

  if (
    embedSessionMarker &&
    !embedCapability &&
    pathname !== GHL_EMBED_BOOTSTRAP_PATH &&
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
        verifiedPartnerDomain,
        embedCapability,
      );
    }
    return finalize(NextResponse.redirect(loginUrl));
  }

  const supabase = createServerClient(supabaseEnv.url, supabaseEnv.anonKey, {
    cookieOptions: getSupabaseAuthCookieOptions(),
    cookies: {
      get(name) {
        return request.cookies.get(name)?.value;
      },
      set(name, value, options) {
        request.cookies.set({ name, value, ...options });
        response.cookies.set({ name, value, ...options });
      },
      remove(name, options) {
        request.cookies.set({ name, value: "", ...options });
        response.cookies.set({ name, value: "", ...options });
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
      getFrameAncestors(request, verifiedPartnerDomain, embedCapability) !== "'none'"
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
    verifiedPartnerDomain,
    embedCapability,
  );
  return finalize(NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
