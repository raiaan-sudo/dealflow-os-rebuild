import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getMetaEnvOrThrow, getPublicAppUrl } from "@/lib/env";
import { debugLog } from "@/lib/debug";
import { encryptSecret } from "@/lib/integrations/meta-crypto";
import { fetchMetaJson } from "@/lib/integrations/meta/request";
import {
  logMetaError,
  logMetaWarning,
} from "@/lib/integrations/meta/error-mapper";
import { verifyMetaOAuthState } from "@/lib/integrations/meta/oauth-state";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { getAppContext } from "@/lib/services/app-context";

type MetaAdAccount = {
  id?: string;
  account_id?: string;
  name?: string;
  account_status?: string | number;
  currency?: string;
  timezone_name?: string;
};

type MetaPixel = {
  id?: string;
  name?: string;
};

type MetaPage = {
  id?: string;
  name?: string;
};

type MetaDiscoveryStatus = "success" | "failed" | "skipped";

const META_STATE_COOKIE = "dealflow_meta_oauth_state";
const META_RETURN_TO_COOKIE = "dealflow_meta_oauth_return_to";

export const dynamic = "force-dynamic";

function getSafeRedirectBase(value: string | null, appUrl: string) {
  const fallback = new URL("/launch", appUrl);

  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  const resolved = new URL(value, appUrl);
  const appOrigin = new URL(appUrl).origin;

  return resolved.origin === appOrigin ? resolved : fallback;
}

async function resolveOrganizationIdForMetaCallback(): Promise<string | null> {
  const context = await getAppContext();
  return context?.organization?.id ?? null;
}

function getMetaErrorMessage(value: unknown, fallback: string) {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    value.error &&
    typeof value.error === "object" &&
    "message" in value.error &&
    typeof value.error.message === "string" &&
    value.error.message.trim().length > 0
  ) {
    return value.error.message;
  }

  return fallback;
}

function getConnectionMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const appUrl = getPublicAppUrl();
    const url = req.nextUrl;
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const cookieStore = await cookies();
    const storedState = cookieStore.get(META_STATE_COOKIE)?.value ?? null;
    const cookieReturnTo = cookieStore.get(META_RETURN_TO_COOKIE)?.value ?? "/launch";
    const env = getMetaEnvOrThrow();
    const verifiedState = verifyMetaOAuthState(returnedState, env.encryptionKey);
    const stateMatchesCookie = Boolean(returnedState && storedState && returnedState === storedState);
    const stateVerified = stateMatchesCookie && Boolean(verifiedState);
    const returnTo = verifiedState?.returnTo ?? cookieReturnTo;
    const redirectBase = getSafeRedirectBase(returnTo, appUrl);
    const redirectWithMetaError = (metaErrorCode: string) => {
      const nextUrl = new URL(redirectBase.toString());
      nextUrl.searchParams.set("meta_error", metaErrorCode);
      nextUrl.searchParams.set("meta_request_id", requestId);
      return NextResponse.redirect(nextUrl);
    };

    if (error) {
      debugLog("meta_callback_error", { error });
      return redirectWithMetaError(error);
    }

    if (!code) {
      debugLog("meta_callback_missing_code");
      return redirectWithMetaError("no_code");
    }

    if (!returnedState || !storedState || !stateVerified) {
      return redirectWithMetaError("invalid_state");
    }

    cookieStore.delete(META_STATE_COOKIE);
    cookieStore.delete(META_RETURN_TO_COOKIE);

    const tokenBody = new URLSearchParams({
      client_id: env.appId,
      client_secret: env.appSecret,
      redirect_uri: env.redirectUri,
      code,
    });
    const { response: tokenRes, data: tokenData } = await fetchMetaJson<{ access_token?: string }>(
      `https://graph.facebook.com/${env.apiVersion}/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenBody,
        purpose: "oauth",
        requestId,
      },
    );

    if (!tokenRes.ok || !tokenData?.access_token) {
      return redirectWithMetaError("no_token");
    }

    const routeSupabase = await createRouteHandlerClient();
    const organizationId = verifiedState?.organizationId ?? (await resolveOrganizationIdForMetaCallback());

    if (!routeSupabase) {
      return redirectWithMetaError("supabase_unavailable");
    }

    if (!organizationId) {
      throw new Error("Missing workspace context");
    }

    const supabase = createAdminClient();

    if (!supabase) {
      return redirectWithMetaError("supabase_unavailable");
    }

    const access_token = tokenData.access_token;
    const encryptedAccessToken = encryptSecret(access_token, env.encryptionKey);
    const now = new Date().toISOString();

    const { data: existing, error: existingError } = await supabase
      .from("marketing_accounts")
      .select("id, pixel_id, name, account_name, external_account_id, connection_metadata")
      .eq("organization_id", organizationId)
      .eq("platform", "meta_ads")
      .maybeSingle();

    if (existingError) {
      logMetaError({
        context: "oauth_callback",
        requestId,
        error: existingError,
        message: "Meta token store lookup failed.",
      });
      return redirectWithMetaError("token_store_failed");
    }

    const existingRow =
      (existing as {
      id?: string;
      pixel_id?: string | null;
      name?: string | null;
      account_name?: string | null;
      external_account_id?: string | null;
      connection_metadata?: unknown;
    } | null) ?? null;
    const preservedConnectionMetadata = getConnectionMetadata(existingRow?.connection_metadata);

    const tokenPayload = {
      organization_id: organizationId,
      platform: "meta_ads",
      access_token_encrypted: encryptedAccessToken,
      status: "connected",
      name: existingRow?.name ?? "Meta Ads",
      account_name: existingRow?.account_name ?? "Meta Ads",
      connected_at: now,
      last_sync_at: now,
      token_last_synced_at: now,
      connection_metadata: {
        ...preservedConnectionMetadata,
        provider: "meta",
        auth_flow: "oauth",
      },
    };

    let marketingAccountRowId = existingRow?.id ?? null;
    let storedMarketingRow = existingRow;

    if (marketingAccountRowId) {
      const { data: updatedRow, error: updateError } = await supabase
        .from("marketing_accounts")
        .update(tokenPayload as never)
        .eq("id", marketingAccountRowId)
        .select("id, pixel_id, name, account_name, external_account_id, connection_metadata")
        .maybeSingle();

      if (updateError || !updatedRow) {
        logMetaError({
          context: "oauth_callback",
          requestId,
          error: updateError ?? new Error("Meta token update returned no row."),
          message: "Meta token update failed.",
        });
        return redirectWithMetaError("token_store_failed");
      }

      storedMarketingRow = updatedRow as typeof existingRow;
    } else {
      const { data: insertedRow, error: insertError } = await supabase
        .from("marketing_accounts")
        .insert({
          ...tokenPayload,
          created_at: now,
          updated_at: now,
        } as never)
        .select("id, pixel_id, name, account_name, external_account_id, connection_metadata")
        .maybeSingle();

      if (insertError || !insertedRow) {
        logMetaError({
          context: "oauth_callback",
          requestId,
          error: insertError ?? new Error("Meta token insert returned no row."),
          message: "Meta token insert failed.",
        });
        return redirectWithMetaError("token_store_failed");
      }

      storedMarketingRow = insertedRow as typeof existingRow;
      marketingAccountRowId =
        typeof storedMarketingRow?.id === "string" ? storedMarketingRow.id : null;
    }

    const existingMetadata = getConnectionMetadata(storedMarketingRow?.connection_metadata);
    const selectedExternalAccountId =
      typeof existingMetadata.selected_external_account_id === "string"
        ? existingMetadata.selected_external_account_id
        : typeof storedMarketingRow?.external_account_id === "string"
          ? storedMarketingRow.external_account_id
        : null;
    const selectedPageId =
      typeof existingMetadata.selected_page_id === "string"
        ? existingMetadata.selected_page_id
        : null;
    const existingSelectedPixelId =
      typeof existingMetadata.pixel_id === "string"
        ? existingMetadata.pixel_id
        : typeof storedMarketingRow?.pixel_id === "string"
          ? storedMarketingRow.pixel_id
          : null;
    let accountsError: string | null = null;
    let pagesError: string | null = null;
    let pixelsError: string | null = null;
    let accountsStatus: MetaDiscoveryStatus = "success";
    let pagesStatus: MetaDiscoveryStatus = "success";
    let pixelsStatus: MetaDiscoveryStatus = "skipped";
    let availableAccounts: Array<{
      id: string | null;
      external_account_id: string | null;
      name: string | null;
      status: string | null;
      currency: string | null;
      timezone_name: string | null;
    }> = [];
    let availablePages: Array<{ id: string; name: string }> = [];
    let availablePixels: Array<{ id: string; name: string }> = [];

    try {
      const { response: accountsRes, data: accounts } = await fetchMetaJson<
        { data?: MetaAdAccount[]; error?: unknown } | null
      >(
        `https://graph.facebook.com/${env.apiVersion}/me/adaccounts` +
          `?fields=id,name,account_status,currency,timezone_name` +
          `&access_token=${encodeURIComponent(access_token)}`,
        {
          purpose: "discovery",
          requestId,
        },
      );

      if (!accountsRes.ok) {
        throw new Error(getMetaErrorMessage(accounts, "Meta ad account discovery failed."));
      }

      availableAccounts = Array.isArray(accounts?.data)
        ? (accounts.data as MetaAdAccount[]).map((account) => ({
            id: account.id ?? null,
            external_account_id: account.id ?? null,
            name: account.name ?? null,
            status:
              typeof account.account_status !== "undefined"
                ? String(account.account_status)
                : null,
            currency: account.currency ?? null,
            timezone_name: account.timezone_name ?? null,
          }))
        : [];
    } catch (discoveryError) {
      accountsStatus = "failed";
      accountsError =
        discoveryError instanceof Error ? discoveryError.message : "Meta ad account discovery failed.";
      logMetaWarning({
        context: "asset_fetch",
        requestId,
        message: accountsError,
        extra: { stage: "ad_accounts" },
      });
    }

    try {
      const { response: pagesRes, data: pages } = await fetchMetaJson<
        { data?: MetaPage[]; error?: unknown } | null
      >(
        `https://graph.facebook.com/${env.apiVersion}/me/accounts` +
          `?fields=id,name` +
          `&access_token=${encodeURIComponent(access_token)}`,
        {
          purpose: "discovery",
          requestId,
        },
      );

      if (!pagesRes.ok) {
        throw new Error(getMetaErrorMessage(pages, "Meta Page discovery failed."));
      }

      availablePages = Array.isArray(pages?.data)
        ? (pages.data as MetaPage[])
            .map((page) => {
              if (!page.id || !page.name) {
                return null;
              }

              return {
                id: page.id,
                name: page.name,
              };
            })
            .filter((page): page is { id: string; name: string } => Boolean(page))
        : [];
    } catch (discoveryError) {
      pagesStatus = "failed";
      pagesError =
        discoveryError instanceof Error ? discoveryError.message : "Meta Page discovery failed.";
      logMetaWarning({
        context: "asset_fetch",
        requestId,
        message: pagesError,
        extra: { stage: "pages" },
      });
    }

    const selectedAccount =
      selectedExternalAccountId
        ? availableAccounts.find(
            (account) => account.id === selectedExternalAccountId,
          ) ?? null
        : null;

    if (selectedExternalAccountId) {
      if (selectedAccount?.id) {
        try {
          const { response: pixelsRes, data: pixelsData } = await fetchMetaJson<
            { data?: MetaPixel[]; error?: unknown } | null
          >(
            `https://graph.facebook.com/${env.apiVersion}/act_${selectedAccount.id.replace(/^act_/, "")}/adspixels` +
              `?fields=id,name` +
              `&access_token=${encodeURIComponent(access_token)}`,
            {
              purpose: "discovery",
              requestId,
            },
          );

          if (!pixelsRes.ok) {
            throw new Error(getMetaErrorMessage(pixelsData, "Meta pixel discovery failed."));
          }

          availablePixels = Array.isArray(pixelsData?.data)
            ? (pixelsData.data as MetaPixel[])
                .map((pixel) => {
                  if (!pixel.id) {
                    return null;
                  }

                  return {
                    id: pixel.id,
                    name: pixel.name ?? pixel.id,
                  };
                })
                .filter((pixel): pixel is { id: string; name: string } => Boolean(pixel))
            : [];
          pixelsStatus = "success";
        } catch (discoveryError) {
          pixelsStatus = "failed";
          pixelsError =
            discoveryError instanceof Error ? discoveryError.message : "Meta pixel discovery failed.";
          logMetaWarning({
            context: "asset_fetch",
            requestId,
            message: pixelsError,
            extra: { stage: "pixels" },
          });
        }
      } else {
        pixelsStatus = accountsStatus === "failed" ? "skipped" : "failed";
        pixelsError =
          accountsStatus === "failed"
            ? "Meta pixel discovery skipped because ad account discovery failed."
            : "Selected Meta ad account could not be found during pixel discovery.";
      }
    }

    const selectedPixelId =
      existingSelectedPixelId && availablePixels.some((pixel) => pixel.id === existingSelectedPixelId)
        ? existingSelectedPixelId
        : null;
    const selectedPage =
      selectedPageId
        ? availablePages.find((page) => page.id === selectedPageId) ?? null
        : null;
    const discoveryErrors = [accountsError, pagesError, pixelsError].filter(
      (value): value is string => Boolean(value),
    );
    const discoveryReady =
      accountsStatus === "success" &&
      pagesStatus === "success" &&
      (pixelsStatus === "success" || pixelsStatus === "skipped");

    const storedColumns = [
      "organization_id",
      "platform",
      "access_token_encrypted",
      "status",
      "connected_at",
      "last_sync_at",
      "token_last_synced_at",
      "name",
      "account_name",
      "external_account_id",
      "pixel_id",
      "connection_metadata",
    ];

    const accountPayload = {
      organization_id: organizationId,
      platform: "meta_ads",
      access_token_encrypted: encryptedAccessToken,
      status: "connected",
      connected_at: now,
      last_sync_at: now,
      token_last_synced_at: now,
      name: selectedAccount?.name ?? storedMarketingRow?.name ?? "Meta Ads",
      account_name: selectedAccount?.name ?? storedMarketingRow?.account_name ?? "Meta Ads",
      external_account_id: selectedAccount?.id ?? selectedExternalAccountId,
      pixel_id: selectedPixelId,
      connection_metadata: {
        ...existingMetadata,
        provider: "meta",
        auth_flow: "oauth",
        asset_discovery: {
          ad_accounts: {
            status: accountsStatus,
            error: accountsError,
          },
          pages: {
            status: pagesStatus,
            error: pagesError,
          },
          pixels: {
            status: pixelsStatus,
            error: pixelsError,
          },
          ready: discoveryReady,
          errors: discoveryErrors,
          last_checked_at: now,
        },
        selected_external_account_id: selectedAccount?.id ?? selectedExternalAccountId,
        selected_account_name:
          selectedAccount?.name ??
          (typeof existingMetadata.selected_account_name === "string"
            ? existingMetadata.selected_account_name
            : null),
        selected_page_id: selectedPage?.id ?? selectedPageId,
        selected_page_name:
          selectedPage?.name ??
          (typeof existingMetadata.selected_page_name === "string"
            ? existingMetadata.selected_page_name
            : null),
        available_accounts: availableAccounts,
        available_pages: availablePages,
        available_pixels: availablePixels,
        pixel_id: selectedPixelId,
      },
    };

    if (marketingAccountRowId) {
      const { error: accountUpdateError } = await supabase
        .from("marketing_accounts")
        .update(accountPayload as never)
        .eq("id", marketingAccountRowId);
      if (accountUpdateError) {
        logMetaError({
          context: "oauth_callback",
          requestId,
          error: accountUpdateError,
          message: "Meta asset metadata update failed.",
        });
        return redirectWithMetaError("asset_store_failed");
      }
    } else {
      const { error: accountInsertError } = await supabase
        .from("marketing_accounts")
        .insert({
          ...accountPayload,
          created_at: now,
          updated_at: now,
        } as never);
      if (accountInsertError) {
        logMetaError({
          context: "oauth_callback",
          requestId,
          error: accountInsertError,
          message: "Meta asset metadata insert failed.",
        });
        return redirectWithMetaError("asset_store_failed");
      }
    }

    const redirectUrl = new URL(redirectBase.toString());

    if (discoveryReady) {
      redirectUrl.searchParams.set("meta_connected", "1");
    } else {
      redirectUrl.searchParams.set("meta_warning", "asset_discovery_incomplete");
      redirectUrl.searchParams.set("meta_request_id", requestId);
      if (accountsStatus !== "success") {
        redirectUrl.searchParams.set("meta_accounts_status", accountsStatus);
      }
      if (pagesStatus !== "success") {
        redirectUrl.searchParams.set("meta_pages_status", pagesStatus);
      }
      if (pixelsStatus !== "success") {
        redirectUrl.searchParams.set("meta_pixels_status", pixelsStatus);
      }
    }

    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    debugLog("meta_callback_crash", {
      message: err instanceof Error ? err.message : "Unknown error",
    });
    logMetaError({
      context: "oauth_callback",
      requestId,
      error: err,
      message: err instanceof Error ? err.message : "Unknown Meta callback error.",
    });
    const fallbackUrl = new URL("/launch", getPublicAppUrl());
    fallbackUrl.searchParams.set(
      "meta_error",
      err instanceof Error && err.message === "Missing workspace context" ? "missing_workspace_context" : "crash",
    );
    fallbackUrl.searchParams.set("meta_request_id", requestId);
    return NextResponse.redirect(fallbackUrl);
  }
}
