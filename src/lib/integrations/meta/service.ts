import { ApiError } from "@/lib/api/route";
import { getMetaEnv } from "@/lib/env";
import { decryptSecret } from "@/lib/integrations/meta-crypto";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/services/app-context";
import type {
  MetaAvailableAdAccount,
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
  pixelId: string | null;
  accessToken: string;
};

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
    return `${accountName ?? "Meta ad account"} is connected and ready for campaign launch.`;
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

  const response = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json().catch(() => null)) as
    | { data?: Array<{ id?: string; name?: string }> ; error?: { message?: string } }
    | null;

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

function toConnectionState(
  row: MetaConnectionRecord | null | undefined,
): MetaConnectionState {
  const status = mapStatus(row?.status);
  const availableAccounts = getAvailableAccounts(row?.connection_metadata ?? null);
  const metadata = normalizeMetaConnectionMetadata(row?.connection_metadata ?? null);

  return {
    id: row?.id ?? null,
    platform: "meta_ads",
    hasAccessToken: Boolean(row?.access_token_encrypted),
    accountId: row?.external_account_id ?? null,
    accountName: row?.account_name ?? null,
    availableAccounts,
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

  if (!row.external_account_id) {
    throw new ApiError(
      400,
      "This workspace is missing a selected Meta ad account.",
      "meta_ad_account_missing",
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

  if (!row.id || !row.external_account_id || !row.access_token_encrypted) {
    throw new ApiError(
      400,
      "Meta workspace credentials are incomplete.",
      "meta_workspace_credentials_incomplete",
    );
  }

  return {
    workspaceId: context.organization.id,
    connectionId: row.id,
    adAccountId: row.external_account_id,
    pixelId: row.pixel_id ?? null,
    accessToken: decryptSecret(row.access_token_encrypted, env.encryptionKey),
  };
}

export async function selectMetaAdAccount(externalAccountId: string) {
  const { context, supabase } = await getMetaSupabaseContext();
  const existing = await getExistingMetaRecord(context.organization.id);

  if (!existing) {
    throw new ApiError(404, "No Meta connection exists for this workspace.", "meta_connection_missing");
  }

  const availableAccounts = getAvailableAccounts(existing.connection_metadata ?? null);
  const nextAccount =
    availableAccounts.find((account) => account.externalAccountId === externalAccountId) ?? null;

  if (!nextAccount) {
    throw new ApiError(400, "That Meta ad account is not available for this connection.", "meta_account_invalid");
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
    currentPixelId &&
    availablePixels.some((pixel) => pixel.id === currentPixelId)
      ? currentPixelId
      : availablePixels[0]?.id ?? currentPixelId ?? null;
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

export async function updateMetaTrackingConfig(input: MetaWorkspaceTrackingUpdate) {
  const { context, supabase } = await getMetaSupabaseContext();
  const existing = await ensureMetaWorkspaceRecord(context.organization.id);
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
