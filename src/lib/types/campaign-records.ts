import type {
  CampaignAd,
  CampaignCreatives,
  CampaignPlan,
  CampaignRuntime,
} from "@/lib/services/campaign-plan-service";
import type { BuiltCampaign, CampaignStrategyInput } from "@/lib/services/campaign-orchestrator";
import type { FunnelBlueprint } from "@/lib/services/funnel-engine";

export type CampaignPublishState = "draft" | "staged" | "published";

export type Campaign = {
  id: string;
  user_id: string;
  organization_id?: string | null;
  name: string;
  location: string | null;
  audience: string | null;
  offer: string | null;
  price_point: string | null;
  market_type: string | null;
  funnel_goal: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignCreative = {
  id: string;
  campaign_id: string;
  hook: string;
  angle: string;
  format: string;
  concept: string;
  visual_direction: string;
  created_at: string;
};

export type CampaignCopy = {
  id: string;
  campaign_id: string;
  hook: string;
  primary_text: string;
  script: string;
  headline: string;
  cta: string;
  created_at: string;
};

export type CampaignFunnel = FunnelBlueprint;

export type CampaignOptimization = {
  ctr: number | null;
  cpc: number | null;
  cpl: number | null;
  frequency: number | null;
  spend: number | null;
  leads: number | null;
  lp_cvr: number | null;
  status: string | null;
  reasons: string[];
  actions: string[];
  created_at: string | null;
};

export type FullCampaignRecord = {
  campaign: Campaign;
  strategy: CampaignStrategyInput;
  plan: CampaignPlan["creativeBrief"] extends never
    ? Record<string, never>
    : {
        intent: CampaignPlan["intent"];
        market: string;
        audience: string;
        offer: string;
        property_type: string;
        business_name: string;
        client_name: string;
        primary_goal: string;
        timeline: string;
        mechanism: string;
        creative_strategy: CampaignPlan["creativeStrategy"];
        pain_points: string[];
        monthly_budget: number;
        summary: string;
        targeting_summary: string;
        offer_summary: string;
        funnel_type: string;
        funnel_steps: string[];
      };
  funnel: CampaignFunnel;
  creatives: {
    items: BuiltCampaign["items"];
    ideas: CampaignCreative[];
    copy: CampaignCopy[];
    ads: CampaignAd[];
    staticAds: CampaignCreatives["staticAds"];
    videoAds: CampaignCreatives["videoAds"];
  };
  launch: {
    runtime: CampaignRuntime;
  };
  results: {
    optimizations: CampaignOptimization[];
  };
  publish: {
    state: CampaignPublishState;
    slug: string | null;
    stagedAt: string | null;
    publishedAt: string | null;
    hasStagedSnapshot: boolean;
    hasPublishedSnapshot: boolean;
  };
};

export type SaveCampaignPayload = {
  campaignId?: string | null;
  name: string;
  campaign: BuiltCampaign;
  plan?: Partial<FullCampaignRecord["plan"]> | null;
  funnel?: Partial<CampaignFunnel> | null;
  creatives?: Array<Partial<CampaignCreative> & Record<string, unknown>> | null;
  copy?: Array<Partial<CampaignCopy> & Record<string, unknown>> | null;
  ads?: CampaignAd[] | null;
  launch?: FullCampaignRecord["launch"] | null;
  results?: FullCampaignRecord["results"] | null;
};

export type SaveCampaignResult = {
  success: boolean;
  campaignId: string;
};
