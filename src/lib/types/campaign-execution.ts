import type { Json } from "@/lib/supabase/types";

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
  organizationId?: string | null;
  objective?: CampaignLaunchObjective;
  status?: string;
  adSets?: CampaignExecutionAdSet[];
  logs?: CampaignExecutionLog[];
  metadata?: Record<string, Json | undefined>;
};

export type CampaignLaunchInput = {
  campaignId: string;
  organizationId?: string | null;
  mode?: string;
  objective?: CampaignLaunchObjective;
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
  valid: boolean;
  errors: string[];
  warnings?: string[];
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
  account: LaunchableMetaAdAccount;
  objective: CampaignLaunchObjective;
  destinationUrl?: string | null;
  budget?: number | null;
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
  creativePayload: Record<string, Json | undefined>;
  adPayload: Record<string, Json | undefined>;
};
