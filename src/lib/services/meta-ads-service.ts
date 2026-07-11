import { cookies } from "next/headers";
import { ApiError } from "@/lib/api/route";
import { getMetaEnv } from "@/lib/env";
import { encryptSecret } from "@/lib/integrations/meta-crypto";
import {
  buildMetaGraphUrl,
  buildMetaOAuthDialogUrl,
  buildMetaTokenExchangeRequest,
  withMetaBearerToken,
} from "@/lib/integrations/meta/contract";
import {
  consumeMetaOAuthStateBinding,
  createMetaOAuthStateBinding,
  metaOAuthStateMatches,
} from "@/lib/integrations/meta/oauth-state";
import { fetchMetaJson as fetchMetaRequestJson } from "@/lib/integrations/meta/request";
import { normalizeMetaConnectionMetadata } from "@/lib/integrations/meta/service";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import type { Database, Json } from "@/lib/supabase/types";

const META_STATE_COOKIE = "dealflow_meta_oauth_state";

type MetaAdAccount = {
  id: string;
  account_id: string;
  name: string;
};

type MetaPixel = {
  id: string;
  name?: string;
};

type MetaTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

async function fetchMetaJson<T>(url: string | URL, init?: RequestInit) {
  const { response, data } = await fetchMetaRequestJson<T | { error?: { message?: string } } | null>(
    url,
    {
      purpose: "discovery",
      ...(init ?? {}),
    },
  );

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? data.error?.message ?? "Meta request failed."
        : "Meta request failed.";
    throw new ApiError(502, message, "meta_request_failed");
  }

  return data as T;
}

export async function createMetaConnectionUrl() {
  const env = getMetaEnv();

  if (!env) {
    throw new ApiError(
      503,
      "Meta Ads is not configured. Set META_APP_ID, META_APP_SECRET, META_REDIRECT_URI, and META_TOKEN_ENCRYPTION_KEY.",
      "meta_config_missing",
    );
  }

  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    throw new ApiError(401, "Authentication is required for this route.", "unauthorized");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new ApiError(401, "Authentication is required for this route.", "unauthorized");
  }

  const auth = await getAuthenticatedContext();
  if (auth.userId !== user.id) {
    throw new ApiError(403, "Authenticated Meta connection context changed.", "meta_actor_mismatch");
  }
  const { state } = await createMetaOAuthStateBinding({
    userId: auth.userId,
    organizationId: auth.organizationId,
    returnTo: "/launch",
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
    redirectUri: env.redirectUri,
    state,
    scopes: "ads_read,business_management",
  });

  return url.toString();
}

async function exchangeCodeForAccessToken(code: string) {
  const env = getMetaEnv();

  if (!env) {
    throw new ApiError(503, "Meta Ads is not configured.", "meta_config_missing");
  }

  const request = buildMetaTokenExchangeRequest({
    kind: "authorization_code",
    clientId: env.appId,
    clientSecret: env.appSecret,
    redirectUri: env.redirectUri,
    code,
  });

  return fetchMetaJson<MetaTokenResponse>(request.url, request.init);
}

async function exchangeForLongLivedAccessToken(accessToken: string) {
  const env = getMetaEnv();

  if (!env) {
    throw new ApiError(503, "Meta Ads is not configured.", "meta_config_missing");
  }

  const request = buildMetaTokenExchangeRequest({
    kind: "long_lived_token",
    clientId: env.appId,
    clientSecret: env.appSecret,
    accessToken,
  });

  return fetchMetaJson<MetaTokenResponse>(request.url, request.init);
}

async function getMetaAdAccounts(accessToken: string) {
  const url = buildMetaGraphUrl("me/adaccounts", {
    fields: "id,account_id,name",
  });

  const response = await fetchMetaJson<{ data: MetaAdAccount[] }>(
    url,
    withMetaBearerToken(accessToken),
  );
  return response.data ?? [];
}

async function getMetaPixels(accessToken: string, externalAccountId: string) {
  const normalizedAccountId = externalAccountId.replace(/^act_/, "");
  const url = buildMetaGraphUrl(`act_${normalizedAccountId}/adspixels`, {
    fields: "id,name",
  });

  const response = await fetchMetaJson<{ data: MetaPixel[] }>(
    url,
    withMetaBearerToken(accessToken),
  );
  return response.data ?? [];
}

function serializeAvailableAccounts(adAccounts: MetaAdAccount[]) {
  return adAccounts
    .map((account) => {
      const externalAccountId = account.account_id || account.id;

      if (!account.id || !externalAccountId || !account.name) {
        return null;
      }

      return {
        id: account.id,
        external_account_id: externalAccountId,
        name: account.name,
      };
    })
    .filter((account): account is { id: string; external_account_id: string; name: string } => Boolean(account));
}

async function upsertMetaMarketingAccount(
  organizationId: string,
  adAccount: MetaAdAccount,
  availableAccounts: MetaAdAccount[],
  availablePixels: MetaPixel[],
  accessToken: string,
  refreshToken: string | null,
  expiresAt: string | null,
) {
  const env = getMetaEnv();

  if (!env) {
    throw new ApiError(503, "Meta Ads is not configured.", "meta_config_missing");
  }

  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    throw new ApiError(401, "Authentication is required for this route.", "unauthorized");
  }

  const encryptedToken = encryptSecret(accessToken, env.encryptionKey);
  const encryptedRefreshToken = refreshToken ? encryptSecret(refreshToken, env.encryptionKey) : null;
  const now = new Date().toISOString();
  const serializedAccounts = serializeAvailableAccounts(availableAccounts);
  const serializedPixels = availablePixels
    .map((pixel) => {
      if (!pixel.id) {
        return null;
      }

      return {
        id: pixel.id,
        name: pixel.name ?? pixel.id,
      };
    })
    .filter((pixel): pixel is { id: string; name: string } => Boolean(pixel));
  const { data: existing } = await supabase
    .from("marketing_accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("platform", "meta_ads")
    .maybeSingle();
  const existingRow =
    existing as Database["public"]["Tables"]["marketing_accounts"]["Row"] | null;
  const existingMetadata = normalizeMetaConnectionMetadata(existingRow?.connection_metadata ?? null);
  const basePayload: Database["public"]["Tables"]["marketing_accounts"]["Insert"] = {
    organization_id: organizationId,
    name: adAccount.name,
    account_name: adAccount.name,
    platform: "meta_ads",
    status: "connected",
    external_account_id: adAccount.account_id || adAccount.id,
    access_token_encrypted: encryptedToken,
    refresh_token_encrypted: encryptedRefreshToken,
    token_expires_at: expiresAt,
    token_last_synced_at: now,
    connected_at: now,
    last_sync_at: now,
    pixel_id:
      existingRow?.pixel_id ??
      serializedPixels[0]?.id ??
      (typeof existingMetadata.pixel_id === "string" ? existingMetadata.pixel_id : null),
    launch_domain:
      existingRow?.launch_domain ??
      (typeof existingMetadata.launch_domain === "string" ? existingMetadata.launch_domain : null),
    verification_token:
      existingRow?.verification_token ??
      (typeof existingMetadata.verification_token === "string"
        ? existingMetadata.verification_token
        : null),
    domain_verified: existingRow?.domain_verified ?? existingMetadata.domain_verified === true,
    tracking_status:
      typeof existingRow?.tracking_status === "string"
        ? existingRow.tracking_status
        : typeof existingMetadata.tracking_status === "string"
        ? existingMetadata.tracking_status
        : "not_configured",
    tracking_metadata:
      (existingRow?.tracking_metadata as Json | null) ??
      ((existingMetadata.verification_metadata &&
      typeof existingMetadata.verification_metadata === "object"
        ? (existingMetadata.verification_metadata as unknown as Json)
        : {}) as Json),
    tracking_last_checked_at:
      existingRow?.tracking_last_checked_at ??
      (typeof existingMetadata.tracking_last_checked_at === "string"
        ? existingMetadata.tracking_last_checked_at
        : null),
    connection_metadata: {
      ...existingMetadata,
      provider: "meta",
      mode: "live",
      auth_flow: "oauth",
      graph_account_id: adAccount.id,
      account_id: adAccount.account_id || adAccount.id,
      selected_external_account_id: adAccount.account_id || adAccount.id,
      available_accounts: serializedAccounts,
      available_pixels: serializedPixels,
      token_type: "user_access_token",
    } as unknown as Json,
  };

  if (existingRow?.id) {
    const { error } = await supabase
      .from("marketing_accounts")
      .update(basePayload as never)
      .eq("id", existingRow.id);

    if (error) {
      throw new ApiError(500, error.message, "meta_account_update_failed");
    }

    return existingRow.id;
  }

  const { data, error } = await supabase
    .from("marketing_accounts")
    .insert(basePayload as never)
    .select("id")
    .single();
  const insertedRow = data as { id: string } | null;

  if (error) {
    throw new ApiError(500, error.message, "meta_account_insert_failed");
  }

  if (!insertedRow?.id) {
    throw new ApiError(500, "Meta account record could not be created.", "meta_account_insert_failed");
  }

  return insertedRow.id;
}

export async function handleMetaCallback(code: string, state: string) {
  const env = getMetaEnv();

  if (!env) {
    throw new ApiError(503, "Meta Ads is not configured.", "meta_config_missing");
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(META_STATE_COOKIE)?.value;
  cookieStore.delete(META_STATE_COOKIE);

  if (!expectedState || !metaOAuthStateMatches(state, expectedState)) {
    throw new ApiError(400, "Meta connection state is invalid or expired.", "meta_state_invalid");
  }

  const auth = await getAuthenticatedContext();
  await consumeMetaOAuthStateBinding({
    state,
    userId: auth.userId,
    organizationId: auth.organizationId,
  });
  const context = auth.context;

  const shortLived = await exchangeCodeForAccessToken(code);
  const longLived = await exchangeForLongLivedAccessToken(shortLived.access_token);
  const accessToken = longLived.access_token || shortLived.access_token;
  const expiresIn = longLived.expires_in ?? shortLived.expires_in ?? null;
  const expiresAt =
    typeof expiresIn === "number"
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;
  const adAccounts = await getMetaAdAccounts(accessToken);
  const primaryAccount = adAccounts[0];

  if (!primaryAccount) {
    throw new ApiError(
      400,
      "No Meta ad accounts were returned for this user. Connect a Business Manager account with ad account access and try again.",
      "meta_no_ad_accounts",
    );
  }

  const pixels = await getMetaPixels(
    accessToken,
    primaryAccount.account_id || primaryAccount.id,
  ).catch(() => []);

  await upsertMetaMarketingAccount(
    context.organization.id,
    primaryAccount,
    adAccounts,
    pixels,
    accessToken,
    null,
    expiresAt,
  );

  return {
    organizationId: context.organization.id,
    accountName: primaryAccount.name,
    accountId: primaryAccount.account_id || primaryAccount.id,
    expiresAt,
  };
}
