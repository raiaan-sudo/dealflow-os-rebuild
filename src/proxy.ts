import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getInternalSystemJobSecrets, getSupabaseEnv } from "@/lib/env";

const PUBLIC_PATHS = new Set(["/", "/login", "/privacy", "/terms", "/data-deletion"]);
const PUBLIC_API_PATHS = new Set([
  "/api/meta/data-deletion",
  "/api/integrations/meta/callback",
  "/api/lead-capture",
  "/api/sms/twilio",
  "/api/webhooks/twilio/status",
  "/api/stripe/webhook",
  "/api/client-errors",
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

function applySecurityHeaders(response: NextResponse, startedAt?: number) {
  const isProduction = process.env.NODE_ENV === "production";
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...(isProduction ? [] : ["'unsafe-eval'"]),
    "https://js.stripe.com",
    "https://connect.facebook.net",
    "https://challenges.cloudflare.com",
  ];

  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Origin-Agent-Cluster", "?1");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src ${scriptSrc.join(" ")}`,
      "script-src-attr 'none'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "media-src 'self' blob: https:",
      "connect-src 'self' https://*.supabase.co https://api.stripe.com https://graph.facebook.com https://www.facebook.com https://api.openai.com https://api.heygen.com https://challenges.cloudflare.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com https://www.facebook.com https://challenges.cloudflare.com",
      "form-action 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      ...(isProduction ? ["upgrade-insecure-requests"] : []),
    ].join("; "),
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
  const finalize = (nextResponse: NextResponse) => applySecurityHeaders(nextResponse, startedAt);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const pathname = request.nextUrl.pathname;

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
    }
    return finalize(NextResponse.redirect(loginUrl));
  }

  const supabase = createServerClient(supabaseEnv.url, supabaseEnv.anonKey, {
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
