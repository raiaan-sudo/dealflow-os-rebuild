import type { Json, Database } from "@/lib/supabase/types";
import type { FullCampaignRecord } from "@/lib/types/campaign-records";

export type CampaignExecutionStepStatus =
  | "info"
  | "success"
  | "failure"
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | (string & {});

export type CampaignExecutionLog = {
  id: string;
  execution_id: string;
  step_key: string;
  step_status: CampaignExecutionStepStatus;
  message?: string | null;
  payload?: Json | null;
  created_at: string;
};

export type CampaignLaunchObjective = string;

export type CampaignLaunchAsset = {
  id: string;
  type?: string;
  url?: string | null;
  name?: string | null;
  creativeId?: string | null;
  copyId?: string | null;
  hook?: string | null;
  angle?: string | null;
  format?: string | null;
  concept?: string | null;
  visualDirection?: string | null;
  primaryText?: string | null;
  script?: string | null;
  headline?: string | null;
  cta?: string | null;
  metadata?: Record<string, Json | undefined> | null;
};

export type CampaignExecutionAd = {
  id: string;
  name?: string;
  headline?: string;
  body?: string;
  creativeId?: string | null;
  creative?: CampaignLaunchAsset | null;
  metadata?: Record<string, Json | undefined>;
};

export type CampaignExecutionAdSet = {
  id: string;
  name?: string;
  ads?: CampaignExecutionAd[];
  metadata?: Record<string, Json | undefined>;
};

export type CampaignExecution = {
  id: string;
  campaignId?: string | null;
  campaign_id?: string | null;
  organizationId?: string | null;
  organization_id?: string | null;
  objective?: CampaignLaunchObjective;
  status?: string;
  meta_ad_account_id?: string | null;
  meta_campaign_external_id?: string | null;
  meta_adset_external_id?: string | null;
  meta_ad_external_id?: string | null;
  destination_url?: string | null;
  budget_type?: "daily" | "lifetime" | string | null;
  daily_budget?: number | null;
  lifetime_budget?: number | null;
  adSets?: CampaignExecutionAdSet[];
  logs?: CampaignExecutionLog[];
  metadata?: Record<string, Json | undefined>;
};

export type CampaignLaunchInput = {
  campaignId?: string;
  organizationId?: string | null;
  mode?: string;
  objective?: CampaignLaunchObjective;
  campaign_id?: string;
  meta_ad_account_id?: string;
  destination_url?: string;
  budget_type?: "daily" | "lifetime" | string;
  daily_budget?: number;
  lifetime_budget?: number;
  start_immediately?: boolean;
  cta_type?: string;
  form_type?: "landing_page" | "website_funnel" | "instant_form" | "meta_instant_form" | string;
  pixel_id?: string | null;
  metadata?: Record<string, Json | undefined>;
};

export type CampaignLaunchResult = {
  execution: CampaignExecution;
  status?: string;
  message?: string;
  metaCampaignId?: string | null;
  metaAdAccountId?: string | null;
  pixelId?: string | null;
  metaAdSetIds?: string[];
  metaAdIds?: string[];
  adSets?: any[];
  ads?: any[];
  creatives?: any[];
  details?: ExecutionDetailRecord[];
  [key: string]: any;
};

export type CampaignStructureBlueprint = {
  name?: string;
  objective?: CampaignLaunchObjective;
  destinationUrl?: string | null;
  adSetName?: string;
  marketType?: string | null;
  audience?: string | null;
  location?: string | null;
  offer?: string | null;
  assets?: CampaignLaunchAsset[];
  campaign?: BuiltMetaCampaignPayload;
  adSets?: BuiltMetaAdSetPayload[];
  ads?: BuiltMetaAdPayload[];
};

export type ExecutionDetailRecord = {
  key: string;
  label?: string;
  value?: string | number | boolean | null;
  metadata?: Record<string, Json | undefined>;
};

export type LaunchValidationResult = {
  ok: boolean;
  errors?: string[];
  warnings?: string[];
  campaign?: FullCampaignRecord | null;
  config?: ValidatedLaunchConfig | null;
  metaAccount?: Database["public"]["Tables"]["marketing_accounts"]["Row"] | null;
  blueprint?: CampaignStructureBlueprint;
};

export type LaunchableMetaAdAccount = {
  id: string;
  name: string;
  accountId?: string | null;
};

export type MetaLaunchPayload = {
  campaign?: BuiltMetaCampaignPayload;
  adSets?: BuiltMetaAdSetPayload[];
  ads?: BuiltMetaAdPayload[];
};

export type ValidatedLaunchConfig = {
  account?: LaunchableMetaAdAccount;
  campaignId?: string;
  metaAdAccountId?: string;
  objective?: CampaignLaunchObjective;
  destinationUrl?: string | null;
  pixelId?: string | null;
  budget?: number | null;
  budgetType?: "daily" | "lifetime";
  dailyBudget?: number | null;
  lifetimeBudget?: number | null;
  startImmediately?: boolean;
  ctaType?: string;
  formType?: "website_funnel" | "meta_instant_form";
  metadata?: Record<string, Json | undefined>;
};

export type BuiltMetaCampaignPayload = Record<string, Json | undefined> & {
  name?: string;
  objective?: string;
  status?: string;
};

export type BuiltMetaAdSetPayload = Record<string, Json | undefined> & {
  name?: string;
  status?: string;
  targeting?: Record<string, Json | undefined>;
};

export type BuiltMetaAdPayload = {
  asset: CampaignLaunchAsset;
  mediaUrl?: string | null;
  creativePayload: Record<string, Json | undefined>;
  adPayload: Record<string, Json | undefined>;
};
