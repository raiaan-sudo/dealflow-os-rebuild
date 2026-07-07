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
  "/start",
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image",
]);
const PUBLIC_API_PATHS = new Set([
  "/api/meta/data-deletion",
  "/api/integrations/meta/callback",
  "/api/lead-capture",
  "/api/lead-tracking/browser-pixel",
  "/api/sms/twilio",
  "/api/webhooks/twilio/status",
  "/api/stripe/webhook",
  "/api/client-errors",
  "/api/client-errors/csp",
]);
const RESERVED_ROOT_PATHS = new Set([
  "admin",
  "api",
  "build",
  "builder",
  "campaign-built",
  "dashboard",
  "data-deletion",
  "f",
  "invite",
  "launch",
  "launch-success",
  "launching",
  "login",
  "onboarding",
  "p",
  "partner",
  "paywall",
  "preview",
  "privacy",
  "results",
  "settings",
  "signup",
  "start",
  "terms",
  "ui-direction",
  "unlock",
  "welcome",
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

  if (pathname.startsWith("/p/") || pathname.startsWith("/invite/")) {
    return true;
  }

  const rootSlugMatch = pathname.match(/^\/([a-z0-9][a-z0-9-]{1,62}[a-z0-9])\/?$/);
  if (rootSlugMatch && !RESERVED_ROOT_PATHS.has(rootSlugMatch[1])) {
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

function getQaAuthHarnessSecrets() {
  return Array.from(
    new Set(
      [
        process.env.QA_AUTH_PROOF_SECRET,
        ...getInternalSystemJobSecrets(),
      ]
        .map((value) => value?.trim() ?? "")
        .filter(Boolean),
    ),
  );
}

function getLeadSideEffectsCrmProofSecrets() {
  return Array.from(
    new Set(
      [
        process.env.LEAD_SIDE_EFFECTS_CRM_PROOF_SECRET,
        ...getInternalSystemJobSecrets(),
      ]
        .map((value) => value?.trim() ?? "")
        .filter(Boolean),
    ),
  );
}

function getPartnerCrmSyncDryProofSecrets() {
  return Array.from(
    new Set(
      [
        process.env.PARTNER_CRM_SYNC_DRY_PROOF_SECRET,
        ...getInternalSystemJobSecrets(),
      ]
        .map((value) => value?.trim() ?? "")
        .filter(Boolean),
    ),
  );
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

function isAuthorizedLeadSideEffectsCrmProofRequest(request: NextRequest) {
  const secrets = getLeadSideEffectsCrmProofSecrets();
  const token =
    getBearerToken(request) ??
    request.headers.get("x-internal-system-key")?.trim() ??
    null;

  return {
    configured: secrets.length > 0,
    authorized: secrets.some((secret) => timingSafeTokenEquals(token, secret)),
  };
}

function isAuthorizedPartnerCrmSyncDryProofRequest(request: NextRequest) {
  const secrets = getPartnerCrmSyncDryProofSecrets();
  const token =
    getBearerToken(request) ??
    request.headers.get("x-internal-system-key")?.trim() ??
    null;

  return {
    configured: secrets.length > 0,
    authorized: secrets.some((secret) => timingSafeTokenEquals(token, secret)),
  };
}

function isAuthorizedQaAuthHarnessRequest(request: NextRequest) {
  const secrets = getQaAuthHarnessSecrets();
  const token =
    getBearerToken(request) ??
    request.headers.get("x-internal-system-key")?.trim() ??
    null;

  return {
    configured: secrets.length > 0,
    authorized: secrets.some((secret) => timingSafeTokenEquals(token, secret)),
  };
}

function getConfiguredOrigin(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    return parsed.origin;
  } catch {
    return null;
  }
}

const CLICK_TO_SCALE_IFRAME_HOSTS = new Set(["clicktoscale.io", "www.clicktoscale.io"]);
const DEFAULT_GHL_FRAME_ANCESTORS = [
  "https://app.gohighlevel.com",
  "https://*.gohighlevel.com",
  "https://app.leadconnectorhq.com",
  "https://*.leadconnectorhq.com",
];

function getConfiguredFrameAncestors() {
  return (process.env.GHL_IFRAME_ALLOWED_FRAME_ANCESTORS ?? "")
    .split(/[\s,]+/)
    .map((source) => source.trim())
    .filter((source) => /^https:\/\/(\*\.)?[a-z0-9.-]+(?::\d+)?$/i.test(source));
}

function getFrameAncestors(request: NextRequest) {
  const host = request.nextUrl.hostname.toLowerCase();

  if (!CLICK_TO_SCALE_IFRAME_HOSTS.has(host)) {
    return "'none'";
  }

  return Array.from(
    new Set([
      ...DEFAULT_GHL_FRAME_ANCESTORS,
      ...getConfiguredFrameAncestors(),
    ]),
  ).join(" ");
}

function applySecurityHeaders(request: NextRequest, response: NextResponse, startedAt?: number) {
  const isProduction = process.env.NODE_ENV === "production";
  const supabaseOrigin = getConfiguredOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const appUrlOrigin = getConfiguredOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const frameAncestors = getFrameAncestors(request);
  const allowsExternalFrameAncestors = frameAncestors !== "'none'";
  const appAssetSources = [
    request.nextUrl.origin,
    appUrlOrigin,
    "https://agentdealflow.io",
    "https://www.agentdealflow.io",
    "https://app.agentdealflow.io",
    supabaseOrigin,
  ].filter((source): source is string => Boolean(source));
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...(isProduction ? [] : ["'unsafe-eval'"]),
    "https://js.stripe.com",
    "https://connect.facebook.net",
    "https://challenges.cloudflare.com",
  ];
  const cspReportUri = "/api/client-errors/csp";
  const metaTrackingConnectSources = [
    "https://graph.facebook.com",
    "https://www.facebook.com",
    "https://capig.datah04.com",
  ];
  const metaTrackingImageSources = [
    "https://www.facebook.com",
  ];
  const cspDirectives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${appAssetSources.join(" ")} ${metaTrackingImageSources.join(" ")}`,
    "font-src 'self' data:",
    `media-src 'self' blob: ${appAssetSources.join(" ")}`,
    `connect-src 'self' ${supabaseOrigin ?? ""} https://api.stripe.com ${metaTrackingConnectSources.join(" ")} https://api.openai.com https://api.heygen.com https://challenges.cloudflare.com`,
    "frame-src https://js.stripe.com https://hooks.stripe.com https://www.facebook.com https://challenges.cloudflare.com",
    "form-action 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `frame-ancestors ${frameAncestors}`,
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ];
  const stagedCspDirectives = [
    "default-src 'self'",
    "script-src 'self' https://js.stripe.com https://connect.facebook.net https://challenges.cloudflare.com",
    "script-src-attr 'none'",
    "style-src 'self'",
    `img-src 'self' data: blob: ${appAssetSources.join(" ")} ${metaTrackingImageSources.join(" ")}`,
    "font-src 'self' data:",
    `media-src 'self' blob: ${appAssetSources.join(" ")}`,
    `connect-src 'self' ${supabaseOrigin ?? ""} https://api.stripe.com ${metaTrackingConnectSources.join(" ")} https://api.openai.com https://api.heygen.com https://challenges.cloudflare.com`,
    "frame-src https://js.stripe.com https://hooks.stripe.com https://www.facebook.com https://challenges.cloudflare.com",
    "form-action 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `frame-ancestors ${frameAncestors}`,
    `report-uri ${cspReportUri}`,
  ];

  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (allowsExternalFrameAncestors) {
    response.headers.delete("X-Frame-Options");
  } else {
    response.headers.set("X-Frame-Options", "DENY");
  }
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Origin-Agent-Cluster", "?1");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  response.headers.set("Content-Security-Policy", cspDirectives.join("; "));
  response.headers.set("Content-Security-Policy-Report-Only", stagedCspDirectives.join("; "));
  response.headers.set("Cross-Origin-Embedder-Policy-Report-Only", "require-corp");

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
  const finalize = (nextResponse: NextResponse) => applySecurityHeaders(request, nextResponse, startedAt);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("x-search", request.nextUrl.search);
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const pathname = request.nextUrl.pathname;

  if (isPublicRequest(pathname)) {
    return finalize(response);
  }

  if (isInternalApiRequest(pathname)) {
    const { configured, authorized } =
      pathname === "/api/internal/qa-auth-session"
        ? isAuthorizedQaAuthHarnessRequest(request)
        : pathname === "/api/internal/lead-side-effects-crm-proof"
          ? isAuthorizedLeadSideEffectsCrmProofRequest(request)
          : pathname === "/api/internal/partner-crm-sync-dry-proof"
            ? isAuthorizedPartnerCrmSyncDryProofRequest(request)
        : isAuthorizedInternalRequest(request);

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
  return finalize(NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
