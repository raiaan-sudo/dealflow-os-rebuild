import { ApiError } from "@/lib/api/route";
import { getMetaEnv } from "@/lib/env";
import { createMetaApiError, mapMetaError } from "@/lib/integrations/meta/error-mapper";
import { decryptSecret } from "@/lib/integrations/meta-crypto";
import { fetchMetaJson } from "@/lib/integrations/meta/request";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/services/app-context";
import type {
  MetaAvailableAdAccount,
  MetaAvailablePage,
  MetaAvailablePixel,
  MetaConnectionRecord,
  MetaConnectionState,
  MetaConnectionStatus,
  MetaConnectionMetadata,
  MetaWorkspaceTrackingConfig,
  MetaWorkspaceTrackingStatus,
  MetaWorkspaceTrackingUpdate,
} from "@/lib/integrations/meta/types";

export type MetaWorkspaceCredentials = {
  workspaceId: string;
  connectionId: string;
  adAccountId: string;
  pageId: string;
  pixelId: string;
  accessToken: string;
};

export type MetaLaunchPreflightState = {
  checkedAt: string;
  tokenValid: boolean;
  accountValid: boolean;
  pageValid: boolean;
  pixelValid: boolean;
  domainValid: boolean;
  trackingValid: boolean;
  errors: string[];
  ready: boolean;
};

function formatMetaSelectionInvalidMessage(detail?: string | null) {
  const normalizedDetail = detail?.trim();

  if (!normalizedDetail) {
    return "Your Meta selection is no longer valid. Re-select the ad account, Facebook Page, and pixel before launch.";
  }

  const diagnostic = mapMetaError({
    context: "preflight",
    message: normalizedDetail,
  });

  return `${diagnostic.userMessage} ${diagnostic.recommendedAction}`;
}

function mapStatus(value: string | null | undefined): MetaConnectionStatus {
  if (value === "connecting") {
    return "connecting";
  }

  if (value === "connected") {
    return "connected";
  }

  if (value === "connection_failed") {
    return "connection_failed";
  }

  return "not_connected";
}

function getReadinessMessage(status: MetaConnectionStatus, accountName?: string | null) {
  if (status === "connected") {
    return `${accountName ?? "Meta ad account"} is connected. Launch will still re-check the token, ad account, Page, and pixel before anything is sent to Meta.`;
  }

  if (status === "connecting") {
    return "Connection is being prepared so launch can move into a real ad account structure.";
  }

  if (status === "connection_failed") {
    return "The last connection attempt failed. Retry the account link to restore launch readiness.";
  }

  return "Connect a Meta ad account to make campaign launch feel tied to a real ad environment.";
}

export function getDefaultMetaConnectionState(): MetaConnectionState {
  return {
    id: null,
    platform: "meta_ads",
    hasAccessToken: false,
    accountId: null,
    accountName: null,
    availableAccounts: [],
    pageId: null,
    pageName: null,
    availablePages: [],
    availablePixels: [],
    connectionStatus: "not_connected",
    connectedAt: null,
    lastSyncAt: null,
    readinessMessage: getReadinessMessage("not_connected"),
    tracking: {
      pixelId: null,
      launchDomain: null,
      verificationToken: null,
      domainVerified: false,
      verificationMetadata: null,
      missingFields: ["pixel ID", "launch domain", "domain verification"],
      trackingStatus: "not_configured",
      updatedAt: null,
    },
  };
}

export function normalizeMetaConnectionMetadata(
  metadata: MetaConnectionRecord["connection_metadata"],
): MetaConnectionMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as MetaConnectionMetadata;
}

function readMetadataString(metadata: MetaConnectionMetadata, key: keyof MetaConnectionMetadata) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readMetadataBoolean(metadata: MetaConnectionMetadata, key: keyof MetaConnectionMetadata) {
  return metadata[key] === true;
}

function readMetadataRecord(
  metadata: MetaConnectionMetadata,
  key: keyof MetaConnectionMetadata,
): Record<string, unknown> | null {
  const value = metadata[key];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

async function fetchMetaPixelsForAccount(accessToken: string, externalAccountId: string) {
  const normalizedAccountId = externalAccountId.replace(/^act_/, "");
  const url = new URL(`https://graph.facebook.com/v19.0/act_${normalizedAccountId}/adspixels`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("access_token", accessToken);

  const { response, data } = await fetchMetaJson<
    | { data?: Array<{ id?: string; name?: string }> ; error?: { message?: string } }
    | null
  >(url.toString(), {
    purpose: "preflight",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new ApiError(
      502,
      data?.error?.message ?? "Meta pixels could not be fetched.",
      "meta_pixels_fetch_failed",
    );
  }

  return Array.isArray(data?.data)
    ? data.data
        .map((pixel) => {
          if (!pixel?.id) {
            return null;
          }

          return {
            id: pixel.id,
            name: pixel.name ?? pixel.id,
          };
        })
        .filter((pixel): pixel is { id: string; name: string } => Boolean(pixel))
    : [];
}

async function fetchMetaGraphJson<T>(accessToken: string, path: string, params?: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/v19.0/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", accessToken);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  const { response, data } = await fetchMetaJson<(T & { error?: { message?: string } }) | null>(
    url.toString(),
    {
      purpose: "preflight",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  return {
    ok: response.ok,
    data,
  };
}

function isActiveMetaAdAccountStatus(status: unknown) {
  return String(status ?? "") === "1";
}

function normalizeLaunchDomain(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase().replace(/\/+$/, "");

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return trimmed.split("/")[0] || null;
  }
}

function destinationMatchesLaunchDomain(destinationUrl: string | null | undefined, launchDomain: string | null) {
  if (!destinationUrl || !launchDomain) {
    return Boolean(launchDomain);
  }

  try {
    const destinationHost = new URL(destinationUrl).hostname.toLowerCase();
    const normalizedLaunchDomain = normalizeLaunchDomain(launchDomain);
    return Boolean(
      normalizedLaunchDomain &&
        (destinationHost === normalizedLaunchDomain ||
          destinationHost.endsWith(`.${normalizedLaunchDomain}`)),
    );
  } catch {
    return false;
  }
}

function getTrackingMissingFields(params: {
  pixelId: string | null;
  launchDomain: string | null;
  verificationToken: string | null;
  domainVerified: boolean;
}) {
  const missing: string[] = [];

  if (!params.pixelId) {
    missing.push("pixel ID");
  }

  if (!params.launchDomain) {
    missing.push("launch domain");
  }

  if (!params.domainVerified) {
    missing.push("domain verification");
  }

  return missing;
}

function deriveTrackingStatus(params: {
  pixelId: string | null;
  launchDomain: string | null;
  verificationToken: string | null;
  domainVerified: boolean;
}): MetaWorkspaceTrackingStatus {
  const missingFields = getTrackingMissingFields(params);

  if (missingFields.length === 0) {
    return "configured";
  }

  if (params.pixelId || params.launchDomain || params.verificationToken || params.domainVerified) {
    return "partial";
  }

  return "not_configured";
}

function getRowTrackingMetadata(row: MetaConnectionRecord | null | undefined) {
  if (!row?.tracking_metadata || typeof row.tracking_metadata !== "object" || Array.isArray(row.tracking_metadata)) {
    return null;
  }

  return row.tracking_metadata as Record<string, unknown>;
}

function readWorkspaceTrackingValue(
  rowValue: string | null | undefined,
  metadata: MetaConnectionMetadata,
  key: "pixel_id" | "launch_domain" | "verification_token",
) {
  return rowValue ?? readMetadataString(metadata, key);
}

function getWorkspaceTrackingConfig(
  row: MetaConnectionRecord | null | undefined,
  metadata: MetaConnectionMetadata,
  fallbackUpdatedAt: string | null,
): MetaWorkspaceTrackingConfig {
  const pixelId = readWorkspaceTrackingValue(row?.pixel_id, metadata, "pixel_id");
  const launchDomain = readWorkspaceTrackingValue(row?.launch_domain, metadata, "launch_domain");
  const verificationToken = readWorkspaceTrackingValue(
    row?.verification_token,
    metadata,
    "verification_token",
  );
  const domainVerified = row?.domain_verified ?? readMetadataBoolean(metadata, "domain_verified");
  const verificationMetadata =
    getRowTrackingMetadata(row) ?? readMetadataRecord(metadata, "verification_metadata");
  const derivedTrackingStatus = deriveTrackingStatus({
    pixelId,
    launchDomain,
    verificationToken,
    domainVerified,
  });
  const persistedTrackingStatus =
    ((typeof row?.tracking_status === "string" ? row.tracking_status : null) as MetaWorkspaceTrackingStatus | null) ??
    (readMetadataString(metadata, "tracking_status") as MetaWorkspaceTrackingStatus | null);
  const trackingStatus = (() => {
    if (!persistedTrackingStatus) {
      return derivedTrackingStatus;
    }

    if (
      persistedTrackingStatus === "configured" &&
      derivedTrackingStatus !== "configured"
    ) {
      return derivedTrackingStatus;
    }

    return persistedTrackingStatus;
  })();

  return {
    pixelId,
    launchDomain,
    verificationToken,
    domainVerified,
    verificationMetadata,
    missingFields: getTrackingMissingFields({
      pixelId,
      launchDomain,
      verificationToken,
      domainVerified,
    }),
    trackingStatus,
    updatedAt:
      row?.tracking_last_checked_at ??
      readMetadataString(metadata, "tracking_last_checked_at") ??
      fallbackUpdatedAt,
  };
}

function getAvailableAccounts(metadata: MetaConnectionRecord["connection_metadata"]): MetaAvailableAdAccount[] {
  const normalizedMetadata = normalizeMetaConnectionMetadata(metadata);

  const rawAccounts = Array.isArray(normalizedMetadata.available_accounts)
    ? normalizedMetadata.available_accounts
    : null;

  if (!Array.isArray(rawAccounts)) {
    return [];
  }

  const accounts = rawAccounts
    .map((account) => {
      if (!account || typeof account !== "object" || Array.isArray(account)) {
        return null;
      }

      const id =
        "id" in account && typeof account.id === "string" && account.id.trim()
          ? account.id
          : null;
      const externalAccountId =
        "external_account_id" in account && typeof account.external_account_id === "string" && account.external_account_id.trim()
          ? account.external_account_id
          : null;
      const name =
        "name" in account && typeof account.name === "string" && account.name.trim()
          ? account.name
          : null;

      if (!id || !externalAccountId || !name) {
        return null;
      }

      return {
        id,
        externalAccountId,
        name,
      } satisfies MetaAvailableAdAccount;
    })
    .filter(Boolean) as MetaAvailableAdAccount[];

  return accounts;
}

function getAvailablePages(metadata: MetaConnectionRecord["connection_metadata"]): MetaAvailablePage[] {
  const normalizedMetadata = normalizeMetaConnectionMetadata(metadata);
  const rawPages = Array.isArray(normalizedMetadata.available_pages)
    ? normalizedMetadata.available_pages
    : null;

  if (!rawPages) {
    return [];
  }

  return rawPages
    .map((page) => {
      if (!page || typeof page !== "object" || Array.isArray(page)) {
        return null;
      }

      const id =
        "id" in page && typeof page.id === "string" && page.id.trim()
          ? page.id
          : null;
      const name =
        "name" in page && typeof page.name === "string" && page.name.trim()
          ? page.name
          : null;

      if (!id || !name) {
        return null;
      }

      return { id, name } satisfies MetaAvailablePage;
    })
    .filter(Boolean) as MetaAvailablePage[];
}

function getAvailablePixels(metadata: MetaConnectionRecord["connection_metadata"]): MetaAvailablePixel[] {
  const normalizedMetadata = normalizeMetaConnectionMetadata(metadata);
  const rawPixels = Array.isArray(normalizedMetadata.available_pixels)
    ? normalizedMetadata.available_pixels
    : null;

  if (!rawPixels) {
    return [];
  }

  return rawPixels
    .map((pixel) => {
      if (!pixel || typeof pixel !== "object" || Array.isArray(pixel)) {
        return null;
      }

      const id =
        "id" in pixel && typeof pixel.id === "string" && pixel.id.trim()
          ? pixel.id
          : null;
      const name =
        "name" in pixel && typeof pixel.name === "string" && pixel.name.trim()
          ? pixel.name
          : null;

      if (!id || !name) {
        return null;
      }

      return { id, name } satisfies MetaAvailablePixel;
    })
    .filter(Boolean) as MetaAvailablePixel[];
}

function toConnectionState(
  row: MetaConnectionRecord | null | undefined,
): MetaConnectionState {
  const status = mapStatus(row?.status);
  const availableAccounts = getAvailableAccounts(row?.connection_metadata ?? null);
  const availablePages = getAvailablePages(row?.connection_metadata ?? null);
  const availablePixels = getAvailablePixels(row?.connection_metadata ?? null);
  const metadata = normalizeMetaConnectionMetadata(row?.connection_metadata ?? null);

  return {
    id: row?.id ?? null,
    platform: "meta_ads",
    hasAccessToken: Boolean(row?.access_token_encrypted),
    accountId: row?.external_account_id ?? null,
    accountName: row?.account_name ?? null,
    availableAccounts,
    pageId: readMetadataString(metadata, "selected_page_id"),
    pageName: readMetadataString(metadata, "selected_page_name"),
    availablePages,
    availablePixels,
    connectionStatus: status,
    connectedAt: row?.connected_at ?? null,
    lastSyncAt: row?.last_sync_at ?? row?.token_last_synced_at ?? null,
    readinessMessage: getReadinessMessage(status, row?.account_name),
    tracking: getWorkspaceTrackingConfig(
      row,
      metadata,
      row?.last_sync_at ?? row?.token_last_synced_at ?? row?.connected_at ?? null,
    ),
  };
}

async function getMetaSupabaseContext() {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for this route.", "unauthorized");
  }

  return {
    context,
    supabase,
  };
}

async function getExistingMetaRecord(organizationId: string) {
  const { supabase } = await getMetaSupabaseContext();
  const { data } = await supabase
    .from("marketing_accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("platform", "meta_ads")
    .maybeSingle();

  return (data as MetaConnectionRecord | null) ?? null;
}

async function ensureMetaWorkspaceRecord(organizationId: string) {
  const { supabase } = await getMetaSupabaseContext();
  const existing = await getExistingMetaRecord(organizationId);

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("marketing_accounts")
    .insert({
      organization_id: organizationId,
      name: "Meta Ads",
      account_name: null,
      platform: "meta_ads",
      status: "not_connected",
      connection_metadata: {
        provider: "meta",
        mode: "workspace",
      },
      tracking_status: "not_configured",
      tracking_metadata: {},
    } as never)
    .select("*")
    .single();

  if (error || !data) {
    throw new ApiError(
      500,
      error?.message ?? "Meta workspace record could not be created.",
      "meta_workspace_record_create_failed",
    );
  }

  return data as MetaConnectionRecord;
}

export async function getMetaConnectionState() {
  const { context } = await getMetaSupabaseContext();
  const row = await getExistingMetaRecord(context.organization.id);
  return toConnectionState(row);
}

export async function getMetaWorkspaceCredentials(): Promise<MetaWorkspaceCredentials> {
  const { context } = await getMetaSupabaseContext();
  const row = await getExistingMetaRecord(context.organization.id);

  if (!row) {
    throw new ApiError(
      404,
      "No Meta connection exists for this workspace.",
      "meta_connection_missing",
    );
  }

  const metadata = normalizeMetaConnectionMetadata(row.connection_metadata ?? null);
  const selectedAccountId = readMetadataString(metadata, "selected_external_account_id");

  if (!selectedAccountId) {
    throw new ApiError(
      400,
      "This workspace is missing a selected Meta ad account.",
      "meta_ad_account_missing",
    );
  }
  const availableAccounts = getAvailableAccounts(row.connection_metadata ?? null);
  const selectedAccount =
    availableAccounts.find((account) => account.externalAccountId === selectedAccountId) ?? null;

  if (!selectedAccount?.externalAccountId) {
    throw new ApiError(
      400,
      "This workspace has an invalid selected Meta ad account.",
      "meta_ad_account_invalid",
    );
  }

  const pageId = readMetadataString(metadata, "selected_page_id");
  if (!pageId) {
    throw new ApiError(
      400,
      "This workspace is missing a selected Facebook Page.",
      "meta_page_missing",
    );
  }

  const pixelId = row.pixel_id ?? readMetadataString(metadata, "pixel_id");
  if (!pixelId) {
    throw new ApiError(
      400,
      "This workspace is missing a selected Meta pixel.",
      "meta_pixel_missing",
    );
  }

  if (!row.access_token_encrypted) {
    throw new ApiError(
      400,
      "This workspace is missing a connected Meta access token.",
      "meta_access_token_missing",
    );
  }

  const env = getMetaEnv();

  if (!env?.encryptionKey) {
    throw new ApiError(
      500,
      "Meta token encryption is not configured.",
      "meta_encryption_not_configured",
    );
  }

  if (!row.id || !row.access_token_encrypted) {
    throw new ApiError(
      400,
      "Meta workspace credentials are incomplete.",
      "meta_workspace_credentials_incomplete",
    );
  }

  return {
    workspaceId: context.organization.id,
    connectionId: row.id,
    adAccountId: selectedAccount.externalAccountId,
    pageId,
    pixelId,
    accessToken: decryptSecret(row.access_token_encrypted, env.encryptionKey),
  };
}

export async function validateMetaLaunchSelections(options?: {
  destinationUrl?: string | null;
}): Promise<MetaLaunchPreflightState> {
  const checkedAt = new Date().toISOString();

  try {
    const credentials = await getMetaWorkspaceCredentials();
    const row = await getExistingMetaRecord(credentials.workspaceId);
    const metadata = normalizeMetaConnectionMetadata(row?.connection_metadata ?? null);
    const tracking = getWorkspaceTrackingConfig(
      row,
      metadata,
      row?.last_sync_at ?? row?.token_last_synced_at ?? row?.connected_at ?? null,
    );
    const tokenCheck = await fetchMetaGraphJson<{ id?: string }>(credentials.accessToken, "me", {
      fields: "id",
    });

    if (!tokenCheck.ok || !tokenCheck.data?.id) {
      return {
        checkedAt,
        tokenValid: false,
        accountValid: false,
        pageValid: false,
        pixelValid: false,
        domainValid: false,
        trackingValid: false,
        errors: [
          formatMetaSelectionInvalidMessage(
            tokenCheck.data?.error?.message ?? "Meta token is invalid or expired.",
          ),
        ],
        ready: false,
      };
    }

    const accountCheck = await fetchMetaGraphJson<{ id?: string; name?: string; account_status?: string | number }>(
      credentials.accessToken,
      `act_${credentials.adAccountId.replace(/^act_/, "")}`,
      {
        fields: "id,name,account_status",
      },
    );
    const accountReachable = Boolean(accountCheck.ok && accountCheck.data?.id);
    const accountActive = isActiveMetaAdAccountStatus(accountCheck.data?.account_status);
    const accountValid = accountReachable && accountActive;

    const pageCheck = await fetchMetaGraphJson<{ id?: string; name?: string }>(
      credentials.accessToken,
      credentials.pageId,
      {
        fields: "id,name",
      },
    );
    const pageValid = Boolean(pageCheck.ok && pageCheck.data?.id);

    let availablePixels: Array<{ id: string; name: string }> = [];
    let pixelFetchError: string | null = null;

    try {
      availablePixels = await fetchMetaPixelsForAccount(
        credentials.accessToken,
        credentials.adAccountId,
      );
    } catch (error) {
      pixelFetchError =
        error instanceof Error
          ? error.message
          : "Meta pixels could not be fetched for the selected ad account.";
    }

    const pixelValid = availablePixels.some((pixel) => pixel.id === credentials.pixelId);
    const domainValid =
      tracking.domainVerified &&
      destinationMatchesLaunchDomain(options?.destinationUrl, tracking.launchDomain);

    const errors: string[] = [];

    if (!accountReachable) {
      errors.push(
        formatMetaSelectionInvalidMessage(
          accountCheck.data?.error?.message ?? "Selected Meta ad account is not available.",
        ),
      );
    } else if (!accountActive) {
      errors.push(
        formatMetaSelectionInvalidMessage(
          "Selected Meta ad account is not active. Choose an active ad account in Meta before launching.",
        ),
      );
    }

    if (!pageValid) {
      errors.push(
        formatMetaSelectionInvalidMessage(
          pageCheck.data?.error?.message ?? "Selected Facebook Page is not available.",
        ),
      );
    }

    if (!pixelValid) {
      errors.push(
        formatMetaSelectionInvalidMessage(
          pixelFetchError ?? "Selected Meta pixel is not available for the chosen ad account.",
        ),
      );
    }

    if (!tracking.launchDomain) {
      errors.push("Add a launch domain before sending campaign traffic to Meta.");
    } else if (!tracking.domainVerified) {
      errors.push("Verify the launch domain before sending campaign traffic to Meta.");
    } else if (!domainValid) {
      errors.push("The public funnel URL must match the verified launch domain before Meta launch.");
    }

    const ready = accountValid && pageValid && pixelValid && domainValid;
    return {
      checkedAt,
      tokenValid: true,
      accountValid,
      pageValid,
      pixelValid,
      domainValid,
      trackingValid: pixelValid && domainValid,
      errors,
      ready,
    };
  } catch (error) {
    return {
      checkedAt,
      tokenValid: false,
      accountValid: false,
      pageValid: false,
      pixelValid: false,
      domainValid: false,
      trackingValid: false,
      errors: [
        formatMetaSelectionInvalidMessage(
          error instanceof Error ? error.message : "Meta preflight failed.",
        ),
      ],
      ready: false,
    };
  }
}

export async function selectMetaAdAccount(externalAccountId: string) {
  const { context, supabase } = await getMetaSupabaseContext();
  const existing = await getExistingMetaRecord(context.organization.id);

  if (!existing) {
    throw new ApiError(404, "No Meta connection exists for this workspace.", "meta_connection_missing");
  }

  if (!existing.id) {
    throw new ApiError(500, "Meta workspace record is missing an ID.", "meta_connection_invalid");
  }

  const availableAccounts = getAvailableAccounts(existing.connection_metadata ?? null);
  const nextAccount =
    availableAccounts.find((account) => account.externalAccountId === externalAccountId) ?? null;

  if (!nextAccount) {
    throw createMetaApiError("selection", 400, {
      code: "meta_account_invalid",
      message: "That Meta ad account is not available for this connection.",
    });
  }

  const metadata =
    normalizeMetaConnectionMetadata(existing.connection_metadata ?? null);
  const env = getMetaEnv();
  const availablePixels =
    existing.access_token_encrypted && env?.encryptionKey
      ? await fetchMetaPixelsForAccount(
          decryptSecret(existing.access_token_encrypted, env.encryptionKey),
          nextAccount.externalAccountId ?? "",
        ).catch(() => [])
      : [];
  const currentPixelId = existing.pixel_id ?? readMetadataString(metadata, "pixel_id");
  const nextPixelId =
    currentPixelId && availablePixels.some((pixel) => pixel.id === currentPixelId)
      ? currentPixelId
      : null;
  const nextTrackingStatus = deriveTrackingStatus({
    pixelId: nextPixelId,
    launchDomain: readWorkspaceTrackingValue(existing.launch_domain, metadata, "launch_domain"),
    verificationToken: readWorkspaceTrackingValue(
      existing.verification_token,
      metadata,
      "verification_token",
    ),
    domainVerified: existing.domain_verified ?? readMetadataBoolean(metadata, "domain_verified"),
  });

  const { error } = await supabase
    .from("marketing_accounts")
    .update({
      external_account_id: nextAccount.externalAccountId,
      account_name: nextAccount.name,
      name: nextAccount.name,
      pixel_id: nextPixelId,
      tracking_status: nextTrackingStatus,
      last_sync_at: new Date().toISOString(),
      connection_metadata: {
        ...metadata,
        selected_external_account_id: nextAccount.externalAccountId,
        pixel_id: nextPixelId,
        tracking_status: nextTrackingStatus,
        available_pixels: availablePixels,
      },
    } as never)
    .eq("id", existing.id);

  if (error) {
    throw new ApiError(500, error.message, "meta_account_selection_failed");
  }

  const refreshed = await getExistingMetaRecord(context.organization.id);
  return toConnectionState(refreshed);
}

export async function updateMetaLaunchSelections(input: {
  externalAccountId?: string | null;
  pageId?: string | null;
  pixelId?: string | null;
}) {
  const { context, supabase } = await getMetaSupabaseContext();
  const existing = await getExistingMetaRecord(context.organization.id);

  if (!existing) {
    throw new ApiError(404, "No Meta connection exists for this workspace.", "meta_connection_missing");
  }

  if (!existing.id) {
    throw new ApiError(500, "Meta workspace record is missing an ID.", "meta_connection_invalid");
  }

  const metadata = normalizeMetaConnectionMetadata(existing.connection_metadata ?? null);
  let nextExternalAccountId =
    input.externalAccountId ?? readMetadataString(metadata, "selected_external_account_id");
  let nextPageId =
    input.pageId !== undefined
      ? input.pageId
      : readMetadataString(metadata, "selected_page_id");
  let nextPixelId =
    input.pixelId !== undefined
      ? input.pixelId
      : existing.pixel_id ?? readMetadataString(metadata, "pixel_id");

  const availableAccounts = getAvailableAccounts(existing.connection_metadata ?? null);
  const availablePages = getAvailablePages(existing.connection_metadata ?? null);
  const nextAccount =
    nextExternalAccountId
      ? availableAccounts.find((account) => account.externalAccountId === nextExternalAccountId) ?? null
      : null;

  if (!nextAccount) {
    throw createMetaApiError("selection", 400, {
      code: "meta_account_invalid",
      message: "Select a valid Meta ad account.",
    });
  }

  const nextPage =
    nextPageId ? availablePages.find((page) => page.id === nextPageId) ?? null : null;
  if (!nextPage) {
    throw createMetaApiError("selection", 400, {
      code: "meta_page_invalid",
      message: "Select a valid Facebook Page.",
    });
  }

  const env = getMetaEnv();
  const availablePixels =
    existing.access_token_encrypted && env?.encryptionKey
      ? await fetchMetaPixelsForAccount(
          decryptSecret(existing.access_token_encrypted, env.encryptionKey),
          nextAccount.externalAccountId ?? "",
        ).catch(() => [])
      : [];

  if (!nextPixelId || !availablePixels.some((pixel) => pixel.id === nextPixelId)) {
    throw createMetaApiError("selection", 400, {
      code: "meta_pixel_invalid",
      message: "Select a valid Meta pixel.",
    });
  }

  const nextTrackingStatus = deriveTrackingStatus({
    pixelId: nextPixelId,
    launchDomain: readWorkspaceTrackingValue(existing.launch_domain, metadata, "launch_domain"),
    verificationToken: readWorkspaceTrackingValue(
      existing.verification_token,
      metadata,
      "verification_token",
    ),
    domainVerified: existing.domain_verified ?? readMetadataBoolean(metadata, "domain_verified"),
  });

  const { error } = await supabase
    .from("marketing_accounts")
    .update({
      external_account_id: nextAccount.externalAccountId,
      account_name: nextAccount.name,
      name: nextAccount.name,
      pixel_id: nextPixelId,
      tracking_status: nextTrackingStatus,
      last_sync_at: new Date().toISOString(),
      connection_metadata: {
        ...metadata,
        selected_external_account_id: nextAccount.externalAccountId,
        selected_account_name: nextAccount.name,
        selected_page_id: nextPage.id ?? null,
        selected_page_name: nextPage.name ?? null,
        pixel_id: nextPixelId,
        tracking_status: nextTrackingStatus,
        available_pixels: availablePixels,
      },
    } as never)
    .eq("id", existing.id);

  if (error) {
    throw new ApiError(500, error.message, "meta_selection_update_failed");
  }

  const refreshed = await getExistingMetaRecord(context.organization.id);
  return toConnectionState(refreshed);
}

export async function updateMetaTrackingConfig(input: MetaWorkspaceTrackingUpdate) {
  const { context, supabase } = await getMetaSupabaseContext();
  const existing = await ensureMetaWorkspaceRecord(context.organization.id);

  if (!existing.id) {
    throw new ApiError(500, "Meta workspace record is missing an ID.", "meta_connection_invalid");
  }

  const metadata = normalizeMetaConnectionMetadata(existing.connection_metadata ?? null);

  const nextPixelId =
    input.pixelId !== undefined
      ? input.pixelId
      : readWorkspaceTrackingValue(existing.pixel_id, metadata, "pixel_id");
  const nextLaunchDomain =
    input.launchDomain !== undefined
      ? input.launchDomain
      : readWorkspaceTrackingValue(existing.launch_domain, metadata, "launch_domain");
  const nextVerificationToken =
    input.verificationToken !== undefined
      ? input.verificationToken
      : readWorkspaceTrackingValue(existing.verification_token, metadata, "verification_token");
  const nextDomainVerified =
    input.domainVerified !== undefined
      ? input.domainVerified
      : existing.domain_verified ?? readMetadataBoolean(metadata, "domain_verified");
  const nextVerificationMetadata =
    input.verificationMetadata !== undefined
      ? input.verificationMetadata
      : getRowTrackingMetadata(existing) ?? readMetadataRecord(metadata, "verification_metadata");
  const nextTrackingStatus = deriveTrackingStatus({
    pixelId: nextPixelId ?? null,
    launchDomain: nextLaunchDomain ?? null,
    verificationToken: nextVerificationToken ?? null,
    domainVerified: nextDomainVerified,
  });
  const checkedAt = new Date().toISOString();

  const { error } = await supabase
    .from("marketing_accounts")
    .update({
      pixel_id: nextPixelId ?? null,
      launch_domain: nextLaunchDomain ?? null,
      verification_token: nextVerificationToken ?? null,
      domain_verified: nextDomainVerified,
      tracking_status: nextTrackingStatus,
      tracking_metadata: (nextVerificationMetadata ?? {}) as never,
      tracking_last_checked_at: checkedAt,
      connection_metadata: {
        ...metadata,
        pixel_id: nextPixelId ?? null,
        launch_domain: nextLaunchDomain ?? null,
        verification_token: nextVerificationToken ?? null,
        domain_verified: nextDomainVerified,
        tracking_status: nextTrackingStatus,
        tracking_last_checked_at: checkedAt,
        verification_metadata: nextVerificationMetadata ?? {},
      },
    } as never)
    .eq("id", existing.id);

  if (error) {
    throw new ApiError(500, error.message, "meta_tracking_update_failed");
  }

  const refreshed = await getExistingMetaRecord(context.organization.id);
  return toConnectionState(refreshed);
}
