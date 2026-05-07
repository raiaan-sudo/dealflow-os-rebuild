import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPublicAppUrl, getMetaEnvOrThrow } from "@/lib/env";
import { logMetaError } from "@/lib/integrations/meta/error-mapper";
import { recordActivationEvent } from "@/lib/services/activation-telemetry-service";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";

const META_STATE_COOKIE = "dealflow_meta_oauth_state";
const META_RETURN_TO_COOKIE = "dealflow_meta_oauth_return_to";

export const dynamic = "force-dynamic";

function getSafeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/launch";
  }

  return value;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const auth = await getAuthenticatedContext();

    const requestUrl = new URL(request.url);
    const returnTo = getSafeReturnTo(requestUrl.searchParams.get("returnTo"));
    const url = new URL("https://www.facebook.com/v18.0/dialog/oauth");
    const env = getMetaEnvOrThrow();
    const redirectUri = env.redirectUri;
    const state = crypto.randomUUID();
    const cookieStore = await cookies();

    cookieStore.set(META_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });
    cookieStore.set(META_RETURN_TO_COOKIE, returnTo, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });

    url.searchParams.set("client_id", env.appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set(
      "scope",
      "ads_management,ads_read,business_management,pages_show_list,pages_read_engagement",
    );
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);

    await recordActivationEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      eventName: "meta_connect_started",
      source: "meta_connect_route",
      metadata: {
        route: "meta_connect",
        returnTo: returnTo.startsWith("/launch") ? "launch" : "other",
      },
      idempotencyKey: `meta_connect_started:${auth.organizationId}`,
    }).catch(() => undefined);

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
