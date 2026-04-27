import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/env";

const PUBLIC_PATHS = new Set(["/", "/login"]);
const PUBLIC_API_PREFIXES = ["/api/integrations/meta/", "/api/lead-capture", "/api/stripe/webhook"];
const TEMP_DIAGNOSTIC_PUBLIC_API_PATHS = new Set([
  // TEMP DIAGNOSTIC ROUTE. REMOVE BEFORE LAUNCH.
  "/api/test",
  // TEMP DIAGNOSTIC ROUTE. REMOVE BEFORE LAUNCH.
  "/api/onboarding/ping",
]);

function isPublicRequest(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) {
    return true;
  }

  if (TEMP_DIAGNOSTIC_PUBLIC_API_PATHS.has(pathname)) {
    return true;
  }

  if (
    // TEMP DIAGNOSTIC ROUTE. REMOVE BEFORE LAUNCH.
    pathname === "/api/onboarding/plan" &&
    process.env.ONBOARDING_PLAN_ISOLATION_MODE === "true"
  ) {
    return true;
  }

  if (pathname.startsWith("/f/")) {
    return true;
  }

  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const pathname = request.nextUrl.pathname;

  if (isPublicRequest(pathname)) {
    return response;
  }

  const supabaseEnv = getSupabaseEnv();
  if (!supabaseEnv) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("reason", "setup");
    if (!pathname.startsWith("/api/")) {
      loginUrl.searchParams.set("redirectedFrom", `${pathname}${request.nextUrl.search}`);
    }
    return NextResponse.redirect(loginUrl);
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
    return response;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication is required for this route." },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("reason", "expired");
  loginUrl.searchParams.set("redirectedFrom", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
