export type ImagePromptConfig = {
  aspectRatio: "1:1" | "4:5" | "9:16" | "16:9";
  style?: string | null;
  lighting?: string | null;
  composition?: string | null;
  avoid?: string[] | null;
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
