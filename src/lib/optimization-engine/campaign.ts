import { buildCreativePlan, type CreativePlan } from "@/lib/optimization-engine/creative";
import { buildFunnelConfig, type FunnelConfig } from "@/lib/optimization-engine/funnel";
import { KPI, type KpiThresholds } from "@/lib/optimization-engine/kpi";
import type { OptimizationDecision } from "@/lib/optimization-engine/decision";
import type { CampaignInput } from "@/lib/optimization-engine/index";

export type AudienceStrategy = {
  defaultTargeting: "broad";
  retargetingPools: string[];
  notes: string[];
};

export type CampaignStructure = {
  budgetModel: "CBO" | "ABO+CBO";
  adSetStrategy: string;
  scaleStrategy: string;
  scalingRules: string[];
  killRules: string[];
};

export type MarketingOptimizationBlueprint = {
  funnelConfig: FunnelConfig;
  creativePlan: CreativePlan;
  campaignStructure: CampaignStructure;
  audienceStrategy: AudienceStrategy;
  kpiExpectations: KpiThresholds;
  optimizationNotes: string[];
  refreshLogic: string[];
  currentDecision?: OptimizationDecision;
};

export function buildCampaignStructure(input: CampaignInput): CampaignStructure {
  if (input.budget < 100) {
    return {
      budgetModel: "CBO",
      adSetStrategy: "Run one broad ad set with multiple creatives.",
      scaleStrategy: "Keep winners inside the same campaign until they validate further.",
      scalingRules: [
        "Duplicate winners before editing them.",
        "Only raise budget after a winner clears two strong metrics.",
      ],
      killRules: [
        "Kill weak creatives fast on CTR/CPL/frequency failure.",
        "Do not keep funding no-lead spend once kill thresholds are hit.",
      ],
    };
  }

  return {
    budgetModel: "ABO+CBO",
    adSetStrategy: "Use one ABO test campaign and one separate CBO scale campaign.",
    scaleStrategy: "Move validated winners into the scale campaign without editing the original.",
    scalingRules: [
      "Duplicate winning creatives into the scale campaign.",
      "Do not over-edit winners after validation.",
      "Budget increases happen only after validation, not before.",
    ],
    killRules: [
      "Kill weak tests quickly on hard threshold failures.",
      "Rotate fatigued creatives once frequency or CPL crosses the cap.",
    ],
  };
}

export function buildAudienceStrategy(input: CampaignInput): AudienceStrategy {
  return {
    defaultTargeting: "broad",
    retargetingPools: [
      `${input.location} 75% video viewers`,
      `${input.location} landing-page engagers`,
    ],
    notes: [
      "Start broad unless there is a proven targeting segment worth isolating.",
      "Retarget users who watched at least 75% of the video creative.",
    ],
  };
}

export function buildMarketingOptimizationBlueprint(
  input: CampaignInput,
  options?: {
    surveyEnabled?: boolean;
    currentDecision?: OptimizationDecision;
  },
): MarketingOptimizationBlueprint {
  const funnelConfig = buildFunnelConfig(input, {
    surveyEnabled: options?.surveyEnabled,
  });
  const creativePlan = buildCreativePlan(input);
  const campaignStructure = buildCampaignStructure(input);
  const audienceStrategy = buildAudienceStrategy(input);

  return {
    funnelConfig,
    creativePlan,
    campaignStructure,
    audienceStrategy,
    kpiExpectations: KPI,
    optimizationNotes: [
      "Cold traffic goes to a simple opt-in landing page only.",
      `${creativePlan.totalCreatives} creatives launch by default with at least ${creativePlan.videoCreatives} video assets.`,
      `Use ${campaignStructure.budgetModel} based on the current budget level.`,
      "Duplicate winners before editing them.",
      "Refresh hooks every 30 days and refresh the full concept when performance declines.",
    ],
    refreshLogic: [
      "Refresh hooks every 30 days.",
      "Refresh the full creative concept when performance declines.",
      "Refresh the full creative concept when market context shifts.",
    ],
    currentDecision: options?.currentDecision,
  };
}
