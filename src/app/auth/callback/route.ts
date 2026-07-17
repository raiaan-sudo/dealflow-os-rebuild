import { NextResponse } from "next/server";
import { getSafeAuthRedirectPath } from "@/lib/auth/safe-redirect";
import { normalizeProductLocale } from "@/lib/i18n/config";
import { localizeProductHref } from "@/lib/i18n/routing";
import { createServerSupabase } from "@/lib/supabase/server";

const AUTH_CODE_PATTERN = /^[^\s\u0000-\u001f\u007f]{8,2048}$/u;
const AUTH_CALLBACK_FLOWS = new Set(["oauth", "signup", "recovery"]);

function noStoreRedirect(request: Request, pathname: string) {
  const response = NextResponse.redirect(new URL(pathname, request.url));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

function loginRedirect(params: {
  request: Request;
  locale: ReturnType<typeof normalizeProductLocale>;
  nextPath: string;
  reason: "auth_callback_failed" | "confirmed" | "recovery" | "recovery_failed";
  mode?: "reset-password" | "update-password";
}) {
  const loginUrl = new URL(localizeProductHref("/login", params.locale), params.request.url);
  loginUrl.searchParams.set("reason", params.reason);
  loginUrl.searchParams.set("redirectedFrom", params.nextPath);
  if (params.mode) {
    loginUrl.searchParams.set("mode", params.mode);
  }
  return `${loginUrl.pathname}${loginUrl.search}`;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const locale = normalizeProductLocale(requestUrl.searchParams.get("locale"));
  const defaultNextPath = localizeProductHref("/onboarding?fresh=1", locale);
  const nextPath = getSafeAuthRedirectPath(
    requestUrl.searchParams.get("next"),
    requestUrl.origin,
    defaultNextPath,
  );
  const flowValue = requestUrl.searchParams.get("flow") ?? "";
  const flow = AUTH_CALLBACK_FLOWS.has(flowValue) ? flowValue : null;
  const code = requestUrl.searchParams.get("code")?.trim() ?? "";

  const failurePath = loginRedirect({
    request,
    locale,
    nextPath,
    reason: flow === "recovery" ? "recovery_failed" : "auth_callback_failed",
    mode: flow === "recovery" ? "reset-password" : undefined,
  });

  if (!flow || !AUTH_CODE_PATTERN.test(code)) {
    return noStoreRedirect(request, failurePath);
  }

  const successPath = flow === "recovery"
    ? loginRedirect({
        request,
        locale,
        nextPath,
        reason: "recovery",
        mode: "update-password",
      })
    : nextPath;
  const response = noStoreRedirect(request, successPath);
  const supabase = await createServerSupabase(response);

  if (!supabase) {
    return noStoreRedirect(request, failurePath);
  }

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return noStoreRedirect(request, failurePath);
    }
  } catch {
    return noStoreRedirect(request, failurePath);
  }

  return response;
}
