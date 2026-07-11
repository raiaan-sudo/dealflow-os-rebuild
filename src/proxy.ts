import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getInternalSystemJobSecrets, getSupabaseEnv } from "@/lib/env";
import { getSupabaseAuthCookieOptions } from "@/lib/supabase/cookie-options";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/privacy",
  "/terms",
  "/data-deletion",
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

  if (/^\/p\/[^/]+\/checkout$/.test(pathname)) {
    return true;
  }

  return PUBLIC_API_PATHS.has(pathname);
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

const CLICK_TO_SCALE_IFRAME_HOSTS = new Set([
  "clicktoscale.io",
  "www.clicktoscale.io",
  "clip2scale.io",
  "www.clip2scale.io",
]);
const ROOT_APP_REDIRECT_HOSTS = new Set([
  "clicktoscale.io",
  "www.clicktoscale.io",
  "clip2scale.io",
  "www.clip2scale.io",
  "agentdealflow.io",
  "app.agentdealflow.io",
]);
const GHL_EMBEDDABLE_PATHS = new Set(["/onboarding"]);
const SHARED_VENDOR_FRAME_HOSTS = new Set([
  "app.gohighlevel.com",
  "app.leadconnectorhq.com",
]);

function normalizeExactFrameAncestor(source: string) {
  try {
    const url = new URL(source);
    const hostname = url.hostname.toLowerCase();
    const validHostname = hostname
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !validHostname ||
      SHARED_VENDOR_FRAME_HOSTS.has(hostname)
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function getConfiguredFrameAncestors() {
  return (process.env.GHL_IFRAME_ALLOWED_FRAME_ANCESTORS ?? "")
    .split(/[\s,]+/)
    .map((source) => source.trim())
    .map(normalizeExactFrameAncestor)
    .filter((source): source is string => Boolean(source));
}

function hasEmbeddedOnboardingReturn(request: NextRequest) {
  if (
    request.nextUrl.pathname !== "/login" ||
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
    return new URL(redirectedFrom, request.url).pathname === "/onboarding";
  } catch {
    return false;
  }
}

function isGhlEmbeddableSurface(request: NextRequest) {
  return (
    GHL_EMBEDDABLE_PATHS.has(request.nextUrl.pathname) ||
    hasEmbeddedOnboardingReturn(request)
  );
}

function getFrameAncestors(request: NextRequest) {
  const host = request.nextUrl.hostname.toLowerCase();
  const configuredAncestors = getConfiguredFrameAncestors();

  if (
    process.env.GHL_IFRAME_EMBED_ENABLED !== "true" ||
    !CLICK_TO_SCALE_IFRAME_HOSTS.has(host) ||
    !isGhlEmbeddableSurface(request) ||
    configuredAncestors.length === 0
  ) {
    return "'none'";
  }

  return Array.from(new Set(configuredAncestors)).join(" ");
}

function addEmbeddedAuthRedirectState(request: NextRequest, loginUrl: URL) {
  if (getFrameAncestors(request) === "'none'") {
    return;
  }

  loginUrl.searchParams.set("embed", "1");
}

function shouldRedirectRootToApp(request: NextRequest) {
  return (
    request.nextUrl.pathname === "/" &&
    ROOT_APP_REDIRECT_HOSTS.has(request.nextUrl.hostname.toLowerCase())
  );
}

function buildRootAppRedirect(request: NextRequest) {
  const redirectUrl = new URL("/onboarding", request.url);
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

function buildContentSecurityPolicy(request: NextRequest, nonce: string) {
  const isProduction = process.env.NODE_ENV === "production";
  const frameAncestors = getFrameAncestors(request);
  const surface = getSecuritySurface(request.nextUrl.pathname);
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isProduction ? [] : ["'unsafe-eval'"]),
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
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function applySecurityHeaders(
  request: NextRequest,
  response: NextResponse,
  nonce: string,
  startedAt?: number,
) {
  const isProduction = process.env.NODE_ENV === "production";
  const frameAncestors = getFrameAncestors(request);
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
    buildContentSecurityPolicy(request, nonce),
  );

  if (isProduction) {
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
  const finalize = (nextResponse: NextResponse) =>
    applySecurityHeaders(request, nextResponse, nonce, startedAt);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", buildContentSecurityPolicy(request, nonce));
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const pathname = request.nextUrl.pathname;

  if (shouldRedirectRootToApp(request)) {
    return finalize(NextResponse.redirect(buildRootAppRedirect(request)));
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
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("reason", "setup");
    if (!pathname.startsWith("/api/")) {
      loginUrl.searchParams.set("redirectedFrom", `${pathname}${request.nextUrl.search}`);
      addEmbeddedAuthRedirectState(request, loginUrl);
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
    return finalize(response);
  }

  if (pathname.startsWith("/api/")) {
    return finalize(NextResponse.json(
      { error: "Authentication is required for this route." },
      { status: 401 },
    ));
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("reason", "expired");
  loginUrl.searchParams.set("redirectedFrom", `${pathname}${request.nextUrl.search}`);
  addEmbeddedAuthRedirectState(request, loginUrl);
  return finalize(NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
