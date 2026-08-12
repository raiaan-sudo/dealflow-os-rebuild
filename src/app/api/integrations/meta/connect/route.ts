import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPublicAppUrl, getMetaEnvOrThrow } from "@/lib/env";
import {
  buildMetaOAuthDialogUrl,
  resolveMetaReturnUrl,
} from "@/lib/integrations/meta/contract";
import { createMetaOAuthStateBinding } from "@/lib/integrations/meta/oauth-state";
import { logMetaError } from "@/lib/integrations/meta/error-mapper";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { isMetaProviderIncluded } from "@/lib/release/approved-launch-profile";

const META_STATE_COOKIE = "dealflow_meta_oauth_state";
const REQUIRED_META_OAUTH_SCOPES = [
  "ads_management",
  "ads_read",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "leads_retrieval",
] as const;

function resolveMetaOAuthScopes(configured: string) {
  const scopes = [...new Set(configured.split(",").map((scope) => scope.trim()).filter(Boolean))];
  const missing = REQUIRED_META_OAUTH_SCOPES.filter((scope) => !scopes.includes(scope));
  if (missing.length > 0) {
    throw new Error("Configured Meta OAuth scopes do not satisfy the DealFlow launch and lead-ingestion contract.");
  }
  return scopes;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  if (!isMetaProviderIncluded()) {
    const unavailableUrl = new URL("/launch", getPublicAppUrl());
    unavailableUrl.searchParams.set("meta_error", "provider_not_in_release");
    return NextResponse.redirect(unavailableUrl);
  }

  try {
    const auth = await getAuthenticatedContext();

    const requestUrl = new URL(request.url);
    const returnUrl = resolveMetaReturnUrl(
      requestUrl.searchParams.get("returnTo"),
      getPublicAppUrl(),
    );
    const returnTo = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
    const env = getMetaEnvOrThrow();
    const redirectUri = env.redirectUri;
    const { state } = await createMetaOAuthStateBinding({
      userId: auth.userId,
      organizationId: auth.organizationId,
      returnTo,
    });
    const cookieStore = await cookies();

    cookieStore.set(META_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });
    const url = buildMetaOAuthDialogUrl({
      clientId: env.appId,
      redirectUri,
      state,
      scopes: resolveMetaOAuthScopes(env.scopes),
    });

    return NextResponse.redirect(url.toString());
  } catch (error) {
    logMetaError({
      context: "oauth_start",
      requestId,
      error,
    });

    const fallbackUrl = new URL("/launch", getPublicAppUrl());
    fallbackUrl.searchParams.set("meta_error", "oauth_start_failed");
    fallbackUrl.searchParams.set("meta_request_id", requestId);
    return NextResponse.redirect(fallbackUrl);
  }
}
