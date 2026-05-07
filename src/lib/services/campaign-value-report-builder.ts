import type { CampaignAnalysisResult } from "@/lib/services/ai-optimizer";
import type { CampaignLaunchRecord } from "@/lib/services/campaign-launch-audit-service";
import type { CampaignPlan } from "@/lib/services/campaign-plan-service";
import type { CreativePerformanceSummary } from "@/lib/services/creative-performance-service";
import type { DashboardMetrics } from "@/lib/services/dashboard-service";
import type { FirstWeekSuccessState } from "@/lib/services/first-week-success-service";
import type { MetaConnectionState, MetaCampaignSyncSnapshot } from "@/lib/integrations/meta/types";

type RecentLeadStatus = {
  status: string | null;
  source: string | null;
  created_at: string;
};

export type CampaignValueReport = {
  reportKey: string;
  reportType: "weekly_value";
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  headline: string;
  summary: string;
  status: "setup" | "collecting" | "active" | "needs_attention";
  campaign: {
    campaignId: string;
    mode: string;
    market: string;
    audience: string;
    funnelStatus: "generated" | "missing";
    launchStatus: string;
  };
  assets: {
    staticAdsGenerated: number;
    videoAdsGenerated: number;
    selectedAds: number;
    selectedAdHeadline: string | null;
  };
  meta: {
    connectionStatus: string;
    launchStatus: string;
    lastSyncedAt: string | null;
    campaignStatus: string | null;
  };
  leadLoop: {
    totalLeads: number;
    recentLeadStatuses: Array<{ status: string; count: number }>;
    leadLoopVerified: boolean;
    lastLeadAt: string | null;
  };
  metrics: {
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    ctr: number;
    cpl: number;
    appointmentsBooked: number;
  };
  creativeInsights: {
    winner: string | null;
    underperformer: string | null;
    learned: string[];
  };
  recommendations: string[];
  nextAction: string;
  monitoringNext: string[];
  emptyState: string | null;
};

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function buildReportWindow(now: Date) {
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const periodStart = new Date(periodEnd.getTime() - 6 * 24 * 60 * 60 * 1000);

  return {
    periodStart: toDateOnly(periodStart),
    periodEnd: toDateOnly(periodEnd),
    reportKey: `weekly_value:${toDateOnly(periodEnd)}`,
  };
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getSyncTimestamp(snapshot: MetaCampaignSyncSnapshot | null | undefined) {
  const value = snapshot?.syncedAt ?? snapshot?.lastSyncedAt ?? null;
  return typeof value === "string" ? value : null;
}

function getDeliveryMetrics(params: {
  syncSnapshot?: MetaCampaignSyncSnapshot | null;
  metrics: DashboardMetrics;
}) {
  const live = params.syncSnapshot?.deliveryMetrics ?? null;
  const spend = Number(live?.spend ?? params.metrics.totalSpend ?? 0);
  const impressions = Number(live?.impressions ?? 0);
  const clicks = Number(live?.clicks ?? 0);
  const leads = Number(live?.leads ?? params.metrics.totalLeads ?? 0);
  const ctr = live?.ctr !== undefined ? Number(live.ctr) : impressions > 0 ? clicks / impressions : 0;
  const cpl = live?.cpl !== undefined ? Number(live.cpl) : leads > 0 ? spend / leads : 0;

  return {
    spend: Number(spend.toFixed(2)),
    impressions,
    clicks,
    leads,
    ctr: Number(ctr.toFixed(4)),
    cpl: Number(cpl.toFixed(2)),
    appointmentsBooked: Number(params.metrics.appointmentsBooked ?? 0),
  };
}

function getRecentLeadStatuses(recentLeads: RecentLeadStatus[]) {
  const counts = new Map<string, number>();

  for (const lead of recentLeads) {
    const status = lead.status?.trim() || "new";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
}

function getLastLeadAt(recentLeads: RecentLeadStatus[]) {
  const timestamps = recentLeads
    .map((lead) => new Date(lead.created_at).getTime())
    .filter((timestamp) => Number.isFinite(timestamp));

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function getNextAction(params: {
  firstWeekSuccess?: FirstWeekSuccessState | null;
  optimizerResult: CampaignAnalysisResult;
  metaConnected: boolean;
  launched: boolean;
  hasMetrics: boolean;
  hasLeads: boolean;
}) {
  if (params.firstWeekSuccess?.nextAction) {
    return params.firstWeekSuccess.nextAction;
  }

  if (!params.metaConnected) {
    return "Connect Meta so DealFlow can launch and monitor delivery.";
  }

  if (!params.launched) {
    return "Complete launch readiness and launch the campaign when billing and Meta selections are ready.";
  }

  if (!params.hasMetrics) {
    return "Let delivery data accumulate, then refresh Meta sync before making optimization decisions.";
  }

  if (!params.hasLeads) {
    return "Review the funnel promise and lead form if spend or clicks are arriving without lead submissions.";
  }

  return params.optimizerResult.actions[0] ?? "Review the latest recommendation and keep monitoring campaign delivery.";
}

function getReportStatus(params: {
  metaConnected: boolean;
  launched: boolean;
  hasMetrics: boolean;
  hasLeads: boolean;
  optimizerStatus: CampaignAnalysisResult["status"];
}) {
  if (params.optimizerStatus === "kill") {
    return "needs_attention";
  }

  if (params.hasLeads) {
    return "active";
  }

  if (params.launched || params.hasMetrics) {
    return "collecting";
  }

  return params.metaConnected ? "collecting" : "setup";
}

function getEmptyState(params: {
  metaConnected: boolean;
  launched: boolean;
  hasMetrics: boolean;
  hasLeads: boolean;
}) {
  if (!params.metaConnected) {
    return "No live report data yet. Connect Meta to start delivery tracking.";
  }

  if (!params.launched) {
    return "No live delivery yet. Launch the campaign to begin weekly reporting.";
  }

  if (!params.hasMetrics) {
    return "Campaign is launched, but Meta has not returned delivery metrics yet.";
  }

  if (!params.hasLeads) {
    return "Traffic data is available, but no verified lead has arrived yet.";
  }

  return null;
}

export function buildCampaignProgressReport(params: {
  plan: CampaignPlan;
  metaConnection: MetaConnectionState;
  syncSnapshot?: MetaCampaignSyncSnapshot | null;
  launchRecord?: CampaignLaunchRecord | null;
  metrics: DashboardMetrics;
  recentLeads?: RecentLeadStatus[];
  creativePerformanceSummary?: CreativePerformanceSummary | null;
  optimizerResult: CampaignAnalysisResult;
  nextActions: string[];
  selectedAdSummary?: { id: string; headline: string; primaryText: string } | null;
  leadLoopVerified?: boolean;
  firstWeekSuccess?: FirstWeekSuccessState | null;
  now?: Date;
}): CampaignValueReport {
  const now = params.now ?? new Date();
  const window = buildReportWindow(now);
  const deliveryMetrics = getDeliveryMetrics({
    syncSnapshot: params.syncSnapshot ?? null,
    metrics: params.metrics,
  });
  const metaConnected = params.metaConnection.connectionStatus === "connected" || params.metaConnection.hasAccessToken;
  const launched = Boolean(
    params.plan.runtime.campaignId ||
      params.launchRecord?.metaCampaignId ||
      params.plan.runtime.status === "live" ||
      params.plan.runtime.metaPushStatus === "published",
  );
  const hasMetrics =
    deliveryMetrics.spend > 0 ||
    deliveryMetrics.impressions > 0 ||
    deliveryMetrics.clicks > 0 ||
    deliveryMetrics.leads > 0;
  const hasLeads = deliveryMetrics.leads > 0 || Number(params.metrics.totalLeads ?? 0) > 0;
  const status = getReportStatus({
    metaConnected,
    launched,
    hasMetrics,
    hasLeads,
    optimizerStatus: params.optimizerResult.status,
  });
  const staticAdsGenerated = Array.isArray(params.plan.creatives.staticAds)
    ? params.plan.creatives.staticAds.length
    : 0;
  const videoAdsGenerated = Array.isArray(params.plan.creatives.videoAds)
    ? params.plan.creatives.videoAds.length
    : 0;
  const selectedAds = params.selectedAdSummary ? 1 : 0;
  const funnelStatus =
    params.plan.funnel?.headline || params.plan.funnel?.sections?.length || params.plan.funnelSteps?.length
      ? "generated"
      : "missing";
  const winner = params.creativePerformanceSummary?.winners[0] ?? params.creativePerformanceSummary?.rankedCreatives[0] ?? null;
  const underperformer = params.creativePerformanceSummary?.underperformers[0] ?? null;
  const nextAction = getNextAction({
    firstWeekSuccess: params.firstWeekSuccess ?? null,
    optimizerResult: params.optimizerResult,
    metaConnected,
    launched,
    hasMetrics,
    hasLeads,
  });
  const recommendations = unique([
    nextAction,
    ...params.optimizerResult.actions,
    ...(params.optimizerResult.testingRecommendations ?? []),
    ...params.nextActions,
  ]).slice(0, 5);
  const monitoringNext = unique([
    ...(params.firstWeekSuccess?.monitoring ?? []),
    "Campaign/funnel availability",
    "Meta delivery signals",
    "Lead capture and lead-loop status",
    "Creative winner/loser movement",
  ]).slice(0, 5);
  const leadLoopVerified = Boolean(params.leadLoopVerified || params.firstWeekSuccess?.leadLoopVerified);
  const report: CampaignValueReport = {
    reportKey: window.reportKey,
    reportType: "weekly_value",
    generatedAt: now.toISOString(),
    periodStart: window.periodStart,
    periodEnd: window.periodEnd,
    headline:
      status === "active"
        ? "Campaign is producing measurable activity"
        : status === "needs_attention"
          ? "Campaign needs attention before more spend"
          : status === "collecting"
            ? "Campaign is collecting early signals"
            : "Campaign setup is almost ready for reporting",
    summary:
      status === "active"
        ? `DealFlow is tracking ${deliveryMetrics.leads} lead signal${deliveryMetrics.leads === 1 ? "" : "s"}, ${deliveryMetrics.clicks} click${deliveryMetrics.clicks === 1 ? "" : "s"}, and ${staticAdsGenerated + videoAdsGenerated} built asset${staticAdsGenerated + videoAdsGenerated === 1 ? "" : "s"}.`
        : "DealFlow has built the campaign foundation and is waiting for the next launch or delivery signal before reporting performance.",
    status,
    campaign: {
      campaignId: params.plan.id,
      mode: String(params.plan.intent),
      market: params.plan.market,
      audience: params.plan.audience,
      funnelStatus,
      launchStatus: params.launchRecord?.resultStatus ?? params.plan.runtime.metaPushStatus ?? params.plan.runtime.status ?? "draft",
    },
    assets: {
      staticAdsGenerated,
      videoAdsGenerated,
      selectedAds,
      selectedAdHeadline: params.selectedAdSummary?.headline ?? null,
    },
    meta: {
      connectionStatus: params.metaConnection.connectionStatus,
      launchStatus: params.launchRecord?.resultStatus ?? params.plan.runtime.status ?? "not_launched",
      lastSyncedAt: getSyncTimestamp(params.syncSnapshot ?? null),
      campaignStatus: typeof params.syncSnapshot?.campaignStatus === "string" ? params.syncSnapshot.campaignStatus : null,
    },
    leadLoop: {
      totalLeads: Number(params.metrics.totalLeads ?? deliveryMetrics.leads ?? 0),
      recentLeadStatuses: getRecentLeadStatuses(params.recentLeads ?? []),
      leadLoopVerified,
      lastLeadAt: getLastLeadAt(params.recentLeads ?? []),
    },
    metrics: deliveryMetrics,
    creativeInsights: {
      winner: winner?.headline ?? null,
      underperformer: underperformer?.headline ?? null,
      learned: params.creativePerformanceSummary?.learned.slice(0, 3) ?? [],
    },
    recommendations,
    nextAction,
    monitoringNext,
    emptyState: getEmptyState({
      metaConnected,
      launched,
      hasMetrics,
      hasLeads,
    }),
  };

  return report;
}
