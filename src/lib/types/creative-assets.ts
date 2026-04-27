import type {
  CampaignCopy,
  CampaignCreative,
  CampaignFunnel,
} from "@/lib/types/campaign-records";

export type ImagePromptConfig = {
  aspectRatio: "1:1" | "4:5" | "9:16" | "16:9";
  prompt?: string | null;
  negativePrompt?: string | null;
  style?: string | null;
  lighting?: string | null;
  composition?: string | null;
  avoid?: string[] | null;
};

export type CreativeAssetLogStatus =
  | "started"
  | "success"
  | "failure"
  | "info";

export type CaptionSegment = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
};

export type RenderBlueprintScene = {
  id: string;
  type: "hook" | "benefit" | "proof" | "cta" | string;
  text: string;
  durationMs: number;
  overlayText: string;
  imagePrompt: ImagePromptConfig | null;
};

export type RenderBlueprint = {
  aspectRatio: CreativeAssetFormat;
  headline: string;
  cta: string;
  frames: RenderBlueprintScene[];
  captions: CaptionSegment[];
  voiceoverTrack: {
    script: string;
    config: {
      profile?: string | null;
      provider?: string | null;
      speed: number;
      tone: string;
    };
  };
  ctaOutro: {
    text: string;
    durationMs: number;
  };
};

export type CreativeProductionPlan = {
  creative: CampaignCreative;
  copy: CampaignCopy;
  funnel: CampaignFunnel | null;
  assetType: string;
  formats: CreativeAssetFormat[];
  normalizedScript: {
    hook: string;
    script: string;
    headline: string;
    cta: string;
  };
  voiceoverConfig: {
    profile?: string | null;
    provider?: string | null;
    speed: number;
    tone: string;
  };
  thumbnailPrompt: ImagePromptConfig | null;
  metadata: Record<string, unknown>;
  renderBlueprints: RenderBlueprint[];
};

export type CreativeBuildInput = {
  campaign_id: string;
  selected_creative_ids?: string[] | null;
  selected_copy_ids?: string[] | null;
  formats?: CreativeAssetFormat[] | null;
  voice_profile?: string | null;
  avatar_profile_id?: string | null;
  generate_thumbnails?: boolean;
  auto_render?: boolean;
};

export type CreativeRenderJob = {
  id: string;
  creative_asset_id?: string | null;
  status?: string | null;
  provider_name?: string | null;
  provider_job_id?: string | null;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

export type CampaignCreativeAssetRecord = {
  asset: CreativeAsset;
  creative: CampaignCreative | null;
  copy: CampaignCopy | null;
  jobs: CreativeRenderJob[];
  logs: Array<{
    id: string;
    creative_asset_id?: string | null;
    step_key?: string | null;
    step_status: CreativeAssetLogStatus;
    message?: string | null;
    payload?: Record<string, unknown> | null;
    created_at?: string | null;
  }>;
};

export type CreativeBuildResult = {
  assets: CreativeAsset[];
  renderJobs: CreativeRenderJob[];
  logs: CampaignCreativeAssetRecord["logs"];
  summary: {
    totalAssets: number;
    readyAssets: number;
    failedAssets: number;
    requiresReviewAssets: number;
  };
};

export type CreativeAssetFormat =
  | "square"
  | "vertical"
  | "story"
  | "reel"
  | "feed"
  | string;

export type CreativeAsset = {
  id: string;
  campaign_id?: string | null;
  creative_id?: string | null;
  copy_id?: string | null;
  asset_type?: string | null;
  format?: string | null;
  generation_method?: string | null;
  status?: string | null;
  provider_name?: string | null;
  provider_asset_id?: string | null;
  file_url?: string | null;
  thumbnail_url?: string | null;
  metadata?: Record<string, unknown> | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProviderRenderRequest = {
  campaignId?: string | null;
  creativeId?: string | null;
  prompt?: string | null;
  script?: string | null;
  provider?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: any;
};

export type ProviderRenderResult = {
  ok?: boolean;
  id?: string | null;
  status?: string | null;
  url?: string | null;
  fileUrl?: string | null;
  thumbnailUrl?: string | null;
  providerName?: string | null;
  providerAssetId?: string | null;
  metadata?: Record<string, unknown> | null;
  error?: string | null;
};

export type LaunchReadyCreativeMedia = {
  creativeId?: string | null;
  copyId?: string | null;
  fileUrl?: string | null;
  thumbnailUrl?: string | null;
  format?: string | null;
  assetType?:
    | "ugc_video"
    | "image_frame"
    | "thumbnail"
    | "video"
    | "image"
    | string
    | null;
};
