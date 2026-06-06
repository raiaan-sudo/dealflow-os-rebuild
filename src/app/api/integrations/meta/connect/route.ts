import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPublicAppUrl, getMetaEnvOrThrow, isInternalAdminEmail } from "@/lib/env";
import { logMetaError } from "@/lib/integrations/meta/error-mapper";
import { createMetaOAuthState } from "@/lib/integrations/meta/oauth-state";
import { createAdminClient } from "@/lib/supabase/admin";
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

function getCampaignIdFromReturnTo(returnTo: string) {
  try {
    const parsed = new URL(returnTo, "https://app.agentdealflow.local");
    return parsed.pathname === "/launch" ? parsed.searchParams.get("campaignId") : null;
  } catch {
    return null;
  }
}

async function resolveOAuthOrganizationId(params: {
  returnTo: string;
  fallbackOrganizationId: string;
  userId: string;
  userEmail?: string | null;
}) {
  const campaignId = getCampaignIdFromReturnTo(params.returnTo);

  if (!campaignId) {
    return params.fallbackOrganizationId;
  }

  const admin = createAdminClient();

  if (!admin) {
    return params.fallbackOrganizationId;
  }

  const { data: campaign, error } = await admin
    .from("campaign_plans")
    .select("id,user_id,owner_id,organization_id")
    .eq("id", campaignId)
    .maybeSingle();

  const campaignRecord = campaign as {
    user_id?: string | null;
    owner_id?: string | null;
    organization_id?: string | null;
  } | null;

  if (error || !campaignRecord?.organization_id) {
    return params.fallbackOrganizationId;
  }

  const targetOrganizationId = campaignRecord.organization_id;
  const userOwnsCampaign =
    campaignRecord.user_id === params.userId || campaignRecord.owner_id === params.userId;
  const sameWorkspace = targetOrganizationId === params.fallbackOrganizationId;
  const platformAdmin = isInternalAdminEmail(params.userEmail ?? null);

  return userOwnsCampaign || sameWorkspace || platformAdmin
    ? targetOrganizationId
    : params.fallbackOrganizationId;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const auth = await getAuthenticatedContext();

    const requestUrl = new URL(request.url);
    const returnTo = getSafeReturnTo(requestUrl.searchParams.get("returnTo"));
    const organizationId = await resolveOAuthOrganizationId({
      returnTo,
      fallbackOrganizationId: auth.organizationId,
      userId: auth.userId,
      userEmail: auth.context.user.email ?? auth.context.profile?.email ?? null,
    });
    const url = new URL("https://www.facebook.com/v18.0/dialog/oauth");
    const env = getMetaEnvOrThrow();
    const redirectUri = env.redirectUri;
    const state = createMetaOAuthState({
      organizationId,
      userId: auth.userId,
      returnTo,
      secret: env.encryptionKey,
    });
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
    const requestedScopes = env.scopes
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean)
      .join(",");

    url.searchParams.set("scope", requestedScopes);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);

    await recordActivationEvent({
      organizationId,
      userId: auth.userId,
      eventName: "meta_connect_started",
      source: "meta_connect_route",
      metadata: {
        route: "meta_connect",
        returnTo: returnTo.startsWith("/launch") ? "launch" : "other",
        campaignScoped: Boolean(getCampaignIdFromReturnTo(returnTo)),
      },
      idempotencyKey: `meta_connect_started:${organizationId}`,
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
