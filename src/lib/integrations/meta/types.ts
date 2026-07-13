import type { Json } from "@/lib/supabase/types";

export type MetaConnectionStatus =
  | "not_connected"
  | "connecting"
  | "partial"
  | "connected"
  | "connection_failed"
  | (string & {});

export type MetaWorkspaceTrackingStatus =
  | "not_configured"
  | "partial"
  | "configured"
  | (string & {});

export type MetaSyncMode = "manual" | "scheduled" | "live" | (string & {});
export type MetaSyncError = string;
export type MetaDeployStatus =
  | "idle"
  | "draft"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "published"
  | (string & {});
export type MetaEntityLifecycleStatus =
  | "draft"
  | "active"
  | "paused"
  | "archived"
  | "failed"
  | (string & {});
export type MetaEntityStatus = {
  id: string;
  name: string;
  status: MetaEntityLifecycleStatus;
  configuredStatus?: string | null;
  effectiveStatus?: string | null;
};
export type MetaLaunchMode = "draft" | "publish" | "simulate" | (string & {});
export type MetaCampaignSyncStatus =
  | "idle"
  | "scheduled"
  | "syncing"
  | "synced"
  | "failed"
  | (string & {});

export type MetaAvailableAdAccount = {
  id?: string;
  name?: string;
  accountId?: string | null;
  externalAccountId?: string;
  externalAccountName?: string;
  status?: string | null;
  currency?: string | null;
  timezoneName?: string | null;
  [key: string]: any;
};

export type MetaAvailablePage = {
  id?: string;
  name?: string;
  [key: string]: any;
};

export type MetaAvailablePixel = {
  id?: string;
  name?: string;
  [key: string]: any;
};

export type MetaDeliveryMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  appointments: number;
  cpl: number;
  cpa: number;
  ctr: number;
  cpc: number;
  frequency: number;
  reach: number;
  [key: string]: Json | undefined;
};

export type MetaConnectionMetadata = {
  available_accounts?: MetaAvailableAdAccount[];
  available_pages?: MetaAvailablePage[];
  selected_page_id?: string | null;
  selected_page_name?: string | null;
  available_pixels?: Array<{ id: string; name: string }>;
  pixel_id?: string | null;
  launch_domain?: string | null;
  verification_token?: string | null;
  domain_verified?: boolean;
  verification_metadata?: { [key: string]: Json | undefined } | null;
  sync_status?: MetaCampaignSyncStatus | null;
  [key: string]: Json | undefined;
};

export type MetaWorkspaceTrackingConfig = {
  pixelId: string | null;
  launchDomain: string | null;
  verificationToken: string | null;
  domainVerified: boolean;
  verificationMetadata: Record<string, unknown> | null;
  missingFields: string[];
  trackingStatus: MetaWorkspaceTrackingStatus;
  updatedAt: string | null;
};

export type MetaWorkspaceTrackingUpdate = Partial<{
  pixelId: string | null;
  launchDomain: string | null;
  verificationToken: string | null;
  domainVerified: boolean;
  verificationMetadata: { [key: string]: Json | undefined } | null;
}>;

export type MetaConnectionRecord = {
  id?: string;
  organization_id?: string | null;
  user_id?: string | null;
  platform?: string | null;
  connection_status?: string | null;
  external_account_id?: string | null;
  external_account_name?: string | null;
  metaAdAccountId?: string | null;
  access_token_encrypted?: string | null;
  pixel_id?: string | null;
  pixelId?: string | null;
  launch_domain?: string | null;
  domain?: string | null;
  verification_token?: string | null;
  domain_verified?: boolean | null;
  domainVerificationStatus?: string | null;
  tracking_status?: string | null;
  tracking_metadata?: Record<string, unknown> | null;
  tracking_last_checked_at?: string | null;
  status?: string | null;
  connected_at?: string | null;
  last_sync_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  connection_metadata?: MetaConnectionMetadata | null;
  [key: string]: any;
};

export type MetaConnectionState = {
  id: string | null;
  platform: string;
  hasAccessToken: boolean;
  accountId: string | null;
  accountName: string | null;
  availableAccounts: MetaAvailableAdAccount[];
  pageId: string | null;
  pageName: string | null;
  availablePages: MetaAvailablePage[];
  availablePixels: MetaAvailablePixel[];
  connectionStatus: MetaConnectionStatus;
  connectedAt: string | null;
  lastSyncAt: string | null;
  readinessMessage: string | null;
  tracking: MetaWorkspaceTrackingConfig;
};

export type MetaCampaignSyncSnapshot = {
  id?: string;
  internalCampaignId?: string | null;
  campaignId?: string | null;
  adSetIds?: string[];
  adIds?: string[];
  status?: MetaCampaignSyncStatus | null;
  syncStatus?: MetaCampaignSyncStatus | null;
  syncResult?: "success" | "partial_success" | "failed";
  entityStatus?: MetaEntityStatus | null;
  deployStatus?: MetaDeployStatus | null;
  metaCampaignId?: string | null;
  metaAdSetIds?: string[];
  metaAdIds?: string[];
  campaignStatus?: string | null;
  campaignEntityId?: string | null;
  campaignConfiguredStatus?: string | null;
  campaignEffectiveStatus?: string | null;
  adSetStatuses?: MetaEntityStatus[];
  adStatuses?: MetaEntityStatus[];
  syncErrors?: string[];
  deliveryMetricsConfirmed?: boolean;
  latestAttemptAt?: string | null;
  latestAttemptResult?: "success" | "partial_success" | "failed" | null;
  latestAttemptDeliveryMetricsConfirmed?: boolean | null;
  latestAttemptErrors?: string[];
  metrics: MetaDeliveryMetrics;
  deliveryMetrics: MetaDeliveryMetrics;
  lastSyncedAt?: string | null;
  syncedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: Json | undefined;
};
