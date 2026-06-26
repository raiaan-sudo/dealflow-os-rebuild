import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPublicAppUrl, getMetaEnvOrThrow } from "@/lib/env";
import { logMetaError } from "@/lib/integrations/meta/error-mapper";
import {
  createMetaOAuthState,
  hashMetaOAuthState,
  verifyMetaOAuthState,
} from "@/lib/integrations/meta/oauth-state";
import { recordActivationEvent } from "@/lib/services/activation-telemetry-service";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCampaignIdFromMetaReturnPath,
  getMetaReturnOrigin,
  sanitizeMetaReturnHost,
  sanitizeMetaReturnPath,
} from "@/lib/routing/campaign-routes";

const META_STATE_COOKIE = "dealflow_meta_oauth_state";
const META_RETURN_TO_COOKIE = "dealflow_meta_oauth_return_to";

export const dynamic = "force-dynamic";

type CampaignPlanOAuthContextRow = {
  id: string;
  organization_id: string | null;
};

function getSafeReturnTo(value: string | null) {
  return sanitizeMetaReturnPath(value, "/launch");
}

function getRequestHost(value: string) {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

async function getCampaignContext(params: {
  campaignId: string | null;
  organizationId: string;
}) {
  if (!params.campaignId) {
    return { campaignId: null, partnerId: null };
  }

  const supabase = createAdminClient();

  if (!supabase) {
    throw new Error("Supabase service role is required for Meta OAuth state binding.");
  }

  const { data, error } = await supabase
    .from("campaign_plans")
    .select("id, organization_id")
    .eq("id", params.campaignId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const campaignRow = data as CampaignPlanOAuthContextRow | null;

  if (!campaignRow || campaignRow.organization_id !== params.organizationId) {
    throw new Error("Meta OAuth return campaign is not in the active workspace.");
  }

  return { campaignId: campaignRow.id, partnerId: null };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const auth = await getAuthenticatedContext();

    const requestUrl = new URL(request.url);
    const returnTo = getSafeReturnTo(requestUrl.searchParams.get("returnTo"));
    const requestHost = sanitizeMetaReturnHost(getRequestHost(request.url));
    const fallbackHost = sanitizeMetaReturnHost(new URL(getPublicAppUrl()).host);
    const returnHost = requestHost ?? fallbackHost;
    const campaignContext = await getCampaignContext({
      campaignId: getCampaignIdFromMetaReturnPath(returnTo),
      organizationId: auth.organizationId,
    });
    const env = getMetaEnvOrThrow();
    const url = new URL(`https://www.facebook.com/${env.apiVersion}/dialog/oauth`);
    const redirectUri = env.redirectUri;
    const state = createMetaOAuthState({
      organizationId: auth.organizationId,
      userId: auth.userId,
      returnTo,
      originHost: returnHost,
      returnHost,
      campaignId: campaignContext.campaignId,
      partnerId: campaignContext.partnerId,
      secret: env.encryptionKey,
    });
    const statePayload = verifyMetaOAuthState(state, env.encryptionKey);

    if (!statePayload) {
      throw new Error("Meta OAuth state could not be verified after creation.");
    }
    const supabase = createAdminClient();

    if (!supabase) {
      throw new Error("Supabase service role is required for Meta OAuth state binding.");
    }

    const { error: stateInsertError } = await supabase
      .from("integration_oauth_states")
      .insert({
        provider: "meta",
        nonce: statePayload.nonce,
        state_hash: hashMetaOAuthState(state),
        organization_id: auth.organizationId,
        user_id: auth.userId,
        campaign_id: campaignContext.campaignId,
        partner_id: campaignContext.partnerId,
        origin_host: returnHost ?? new URL(getPublicAppUrl()).host.toLowerCase(),
        return_host: returnHost ?? new URL(getPublicAppUrl()).host.toLowerCase(),
        return_to: returnTo,
        expires_at: new Date(statePayload.exp).toISOString(),
        metadata: {
          purpose: "meta_oauth",
          route: "meta_connect",
          returnOrigin: getMetaReturnOrigin(returnHost, getPublicAppUrl()),
        },
      } as never);

    if (stateInsertError) {
      throw stateInsertError;
    }
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
    url.searchParams.set("scope", env.scopes);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("auth_type", "rerequest");
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
