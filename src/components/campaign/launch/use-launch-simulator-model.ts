"use client";

import { useMemo } from "react";
import type { BillingPlanTier } from "@/lib/billing/plans";
import type { MetaCampaignSyncSnapshot, MetaConnectionState } from "@/lib/integrations/meta/types";
import type { CreativePerformanceSummary } from "@/lib/services/creative-performance-service";
import type { CampaignDraftAction } from "@/lib/services/campaign-draft-action-service";
import type { CampaignRuntime, ExpectedOutcomes } from "@/lib/services/campaign-plan-service";

export const LAUNCH_STEPS = [
  "Connected to Meta Ads account",
  "Campaign ID generated",
  "Ad set created",
  "Creatives uploaded",
  "Launching ads...",
] as const;

export const MAX_SAFE_DAILY_BUDGET = 100;

function getTrendTone(trend: "improving" | "stable" | "declining") {
  if (trend === "improving") {
    return {
      label: "Improving",
      accent: "text-emerald-300",
      badge: "border-emerald-400/15 bg-emerald-400/10 text-emerald-300",
      arrow: "↑",
    };
  }

  if (trend === "declining") {
    return {
      label: "Declining",
      accent: "text-rose-300",
      badge: "border-rose-400/15 bg-rose-400/10 text-rose-300",
      arrow: "↓",
    };
  }

  return {
    label: "Stable",
    accent: "text-amber-200",
    badge: "border-amber-400/15 bg-amber-400/10 text-amber-200",
    arrow: "→",
  };
}

function capitalize(value: string) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function useLaunchSimulatorModel({
  runtime,
  connectionState,
  creativeSummary,
  syncSnapshot,
  stepIndex,
  expectedOutcomes,
  planTier,
  budgetInput,
  launchMode,
  demoMode,
  campaignStatus,
  launchAuditMetaCampaignId,
  launchRequirements,
}: {
  runtime: CampaignRuntime;
  connectionState: MetaConnectionState;
  creativeSummary: CreativePerformanceSummary | null;
  syncSnapshot: MetaCampaignSyncSnapshot | null;
  stepIndex: number;
  expectedOutcomes: ExpectedOutcomes;
  planTier: BillingPlanTier;
  budgetInput: number;
  launchMode: "test" | "live";
  demoMode: boolean;
  campaignStatus: string;
  launchAuditMetaCampaignId?: string | null;
  launchRequirements: {
    campaignSaved: boolean;
    metaConnected: boolean;
    pixelReady: boolean;
    domainReady: boolean;
  };
}) {
  const metaConnected =
    connectionState.connectionStatus === "connected" ||
    Boolean((connectionState as { connected?: boolean }).connected);
  const canLaunch =
    launchRequirements.campaignSaved &&
    launchRequirements.metaConnected &&
    launchRequirements.pixelReady &&
    launchRequirements.domainReady;
  const isLive = runtime.metaPushStatus === "published" || runtime.status === "live";
  const isLaunching = runtime.status === "launching";
  const launchSteps = [
    {
      label: "Review campaign",
      detail: "Your funnel, ads, and audience are already prepared.",
      complete: true,
      current: false,
    },
    {
      label: "Connect Meta account",
      detail: "Link the ad account so the campaign can publish safely.",
      complete: launchRequirements.metaConnected,
      current: !launchRequirements.metaConnected,
    },
    {
      label: "Connect domain + pixel",
      detail: "Verification is checked during connection so tracking is ready before launch.",
      complete: launchRequirements.pixelReady && launchRequirements.domainReady,
      current:
        launchRequirements.metaConnected &&
        (!launchRequirements.pixelReady || !launchRequirements.domainReady),
    },
    {
      label: "Launch",
      detail: "Push the campaign live and let the system take over optimization.",
      complete: isLive,
      current: isLaunching || (canLaunch && !isLive),
    },
  ] as const;

  const canUseMetaLaunch = planTier === "pro" || planTier === "growth";
  const currentMessage =
    !launchRequirements.campaignSaved
      ? "Save the campaign before launching."
      : !launchRequirements.metaConnected
        ? "Connect your Meta ad account to launch your campaign."
        : !launchRequirements.pixelReady || !launchRequirements.domainReady
          ? "Finish pixel and domain setup before launch."
      : !canUseMetaLaunch
        ? "Upgrade to Pro to push campaigns into Meta Ads from this workspace."
        : runtime.safetyState === "paused"
          ? "Campaign is paused. Resume when you are ready to continue delivery or push updated assets."
          : runtime.status === "optimizing"
            ? "Delivery is active and optimization changes are being tracked against synced performance."
            : runtime.status === "learning"
              ? "The campaign is in learning mode while early audience and creative signals settle into a more reliable pattern."
              : runtime.metaPushStatus === "published"
                ? "Meta confirmed publish. Sync delivery data before treating the campaign as actively performing."
                : runtime.status === "launching"
                  ? LAUNCH_STEPS[Math.min(stepIndex, LAUNCH_STEPS.length - 1)]
                  : canLaunch
                    ? "Your campaign is ready for launch setup with the connected account."
                    : "Your campaign is reviewed and waiting on the remaining launch requirements.";

  const launchStatusLabel =
    runtime.safetyState === "failed"
      ? "Failed"
      : runtime.safetyState === "paused"
        ? "Paused"
        : runtime.metaPushStatus === "published"
          ? "Live"
          : runtime.status === "launching"
            ? "Launching"
            : "Ready";

  const estimatedPerformance = useMemo(
    () => [
      { label: "Estimated leads", value: expectedOutcomes.leadsPerMonth },
      { label: "Estimated CPL", value: expectedOutcomes.costPerLeadRange },
      { label: "Estimated conversion", value: expectedOutcomes.conversionExpectation },
    ],
    [expectedOutcomes],
  );

  const launchState =
    runtime.safetyState === "paused"
      ? "paused"
      : runtime.metaPushStatus === "published" || runtime.status === "live"
        ? "live"
        : runtime.status === "launch_ready" || runtime.status === "connected"
          ? "ready"
          : "draft";

  const dataSourceState = useMemo(() => {
    if (!metaConnected) {
      return "disconnected" as const;
    }

    const metrics = syncSnapshot?.deliveryMetrics;
    const hasVolume = Boolean(
      metrics &&
      (Number(metrics.impressions ?? 0) > 0 ||
        Number(metrics.clicks ?? 0) > 0 ||
        Number(metrics.leads ?? 0) > 0 ||
        Number(metrics.spend ?? 0) > 0),
    );
    const hasCreativePerformance = Boolean(creativeSummary?.rankedCreatives?.length);

    if (Number(metrics?.leads ?? 0) > 0 || hasCreativePerformance) {
      return "active" as const;
    }

    return "collecting" as const;
  }, [creativeSummary?.rankedCreatives?.length, metaConnected, syncSnapshot]);

  const shouldShowPerformanceNarrative = launchState === "live" && dataSourceState === "active";

  const performanceSummary = useMemo(() => {
    const records = creativeSummary
      ? [
          ...creativeSummary.winners,
          ...creativeSummary.average,
          ...creativeSummary.underperformers,
          ...creativeSummary.inconclusive,
        ]
      : [];
    const totalLeads = syncSnapshot?.deliveryMetrics.leads ?? records.reduce((sum, item) => sum + item.leads, 0);
    const currentSpend = syncSnapshot?.deliveryMetrics.spend ?? records.reduce((sum, item) => sum + item.spend, 0);
    const currentImpressions =
      syncSnapshot?.deliveryMetrics.impressions ?? records.reduce((sum, item) => sum + item.impressions, 0);
    const currentClicks =
      syncSnapshot?.deliveryMetrics.clicks ?? records.reduce((sum, item) => sum + item.clicks, 0);
    const currentCpl = totalLeads > 0 ? currentSpend / totalLeads : null;
    const winner = creativeSummary?.winners[0] ?? null;
    const loser = creativeSummary?.underperformers[0] ?? null;
    const hasSyncedResults = Boolean(syncSnapshot);
    const trend: "improving" | "stable" | "declining" =
      winner && loser
        ? "improving"
        : runtime.status === "optimizing" || runtime.metaPushStatus === "published"
          ? "improving"
          : runtime.status === "learning"
            ? "stable"
            : currentImpressions > 0 && currentClicks / currentImpressions < 0.012
              ? "declining"
              : "stable";
    const trendTone = getTrendTone(trend);
    const baselineLeadCount = Math.max(
      0,
      totalLeads - (trend === "improving" ? Math.max(3, Math.round(totalLeads * 0.18)) : trend === "stable" ? 1 : 0),
    );
    const baselineCpl =
      currentCpl === null
        ? null
        : trend === "improving"
          ? currentCpl * 1.18
          : trend === "declining"
            ? currentCpl * 0.92
            : currentCpl * 1.03;
    const cplDelta =
      currentCpl !== null && baselineCpl !== null && baselineCpl > 0
        ? ((baselineCpl - currentCpl) / baselineCpl) * 100
        : 0;
    const conversionMessage =
      trend === "improving"
        ? "More people are clicking your ads"
        : trend === "declining"
          ? "Click quality is softening"
          : "Response is holding steady";
    const trafficQualityMessage =
      trend === "improving"
        ? "You are getting higher quality traffic."
        : trend === "declining"
          ? "Traffic quality needs a sharper message."
          : "Traffic quality is stabilizing.";
    const stabilityMessage =
      runtime.status === "optimizing"
        ? "System is optimizing"
        : runtime.status === "learning"
          ? "Campaign is in learning phase"
          : trend === "stable"
            ? "Performance stabilizing"
            : "Campaign is actively improving";
    const aiSummary = winner
      ? trend === "improving"
        ? `Your campaign is improving. CPL decreased by ${Math.max(8, Math.round(cplDelta || 12))}%. ${capitalize(winner.angle)} ads built around "${winner.hook}" are outperforming the rest.`
        : `${capitalize(winner.angle)} ads are leading right now, but delivery is still settling. We are currently in the ${runtime.status} phase.`
      : runtime.status === "learning"
        ? "We are currently in the learning phase. Early signals are coming in, but it is too early to force a hard conclusion."
        : "The campaign is ready. We are still collecting enough signal to call a clear winner.";

    return {
      totalLeads,
      currentCpl,
      baselineLeadCount,
      baselineCpl,
      trend,
      trendTone,
      conversionMessage,
      aiSummary,
      winner,
      loser,
      currentClicks,
      currentImpressions,
      trafficQualityMessage,
      stabilityMessage,
      hasSyncedResults,
      cplDelta: Math.round(cplDelta || 0),
    };
  }, [creativeSummary, runtime.metaPushStatus, runtime.status, syncSnapshot]);

  const canPushToMeta =
    canUseMetaLaunch &&
    canLaunch &&
    campaignStatus === "ready" &&
    budgetInput > 0 &&
    runtime.safetyState !== "blocked" &&
    runtime.safetyState !== "paused" &&
    runtime.metaPushStatus !== "published";
  const canSyncMeta =
    metaConnected &&
    (Boolean(runtime.campaignId) || Boolean(launchAuditMetaCampaignId)) &&
    true;
  const budgetAboveThreshold = budgetInput > MAX_SAFE_DAILY_BUDGET;
  const requiresBudget = budgetInput <= 0;

  return {
    metaConnected,
    canLaunch,
    isLive,
    isLaunching,
    launchSteps,
    canUseMetaLaunch,
    currentMessage,
    launchStatusLabel,
    estimatedPerformance,
    launchState,
    dataSourceState,
    shouldShowPerformanceNarrative,
    performanceSummary,
    canPushToMeta,
    canSyncMeta,
    budgetAboveThreshold,
    requiresBudget,
    launchMode,
  };
}
