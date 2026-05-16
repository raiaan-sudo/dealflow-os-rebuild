"use client";

import {
  getCampaignIntentLabel,
  isCommercialCampaignIntent,
  isInvestorCampaignIntent,
  isSellerCampaignIntent,
} from "@/lib/campaign-intent";
import { Card } from "@/components/ui/card";
import { MetaSyncRefreshButton } from "@/components/dashboard/meta-sync-refresh-button";
import {
  ChartLegend,
  DashboardChartPanel,
  DashboardVisualMarker,
  MetricTile,
  MiniBarChart,
  NextActionPanel,
  StatusPill,
  TrendAreaChart,
} from "@/components/dashboard/dashboard-primitives";
import type { MetaConnectionState } from "@/lib/integrations/meta/types";
import type { Database } from "@/lib/supabase/types";
import type {
  CampaignPlan,
  ExpectedOutcomes,
} from "@/lib/services/campaign-plan-service";
import type { CampaignAnalysisResult } from "@/lib/services/ai-optimizer";
import type { CreativePerformanceSummary } from "@/lib/services/creative-performance-service";
import type { MetaCampaignSyncSnapshot } from "@/lib/integrations/meta/types";
import type { CampaignLaunchRecord } from "@/lib/services/campaign-launch-audit-service";
import type { AutonomySnapshot } from "@/lib/services/autonomy-engine";
import type { DashboardMetrics } from "@/lib/services/dashboard-service";
import type { FirstWeekSuccessState } from "@/lib/services/first-week-success-service";
import type { CampaignValueReport } from "@/lib/services/campaign-value-report-builder";

type AppointmentSummary = Pick<
  Database["public"]["Tables"]["appointments"]["Row"],
  "status" | "scheduled_at"
>;

type RecentLead = Pick<
  Database["public"]["Tables"]["leads"]["Row"],
  | "id"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "campaign_id"
  | "status"
  | "source"
  | "estimated_value"
  | "created_at"
>;

type RecentAppointment = Pick<
  Database["public"]["Tables"]["appointments"]["Row"],
  "id" | "scheduled_at" | "status" | "appointment_type" | "created_at"
>;

type RecentDeal = Pick<
  Database["public"]["Tables"]["deals"]["Row"],
  "id" | "title" | "status" | "stage" | "estimated_value" | "closed_value" | "created_at"
>;

type Props = {
  plan: CampaignPlan;
  metaConnection: MetaConnectionState;
  syncSnapshot?: MetaCampaignSyncSnapshot | null;
  expectedOutcomes: ExpectedOutcomes;
  nextActions: string[];
  optimizerResult: CampaignAnalysisResult;
  workspaceMetrics: DashboardMetrics;
  bookingSummary?: AppointmentSummary | null;
  recentLeads?: RecentLead[];
  recentAppointments?: RecentAppointment[];
  recentDeals?: RecentDeal[];
  creativePerformanceSummary?: CreativePerformanceSummary | null;
  launchRecord?: CampaignLaunchRecord | null;
  autonomySnapshot?: AutonomySnapshot | null;
  selectedAdSummary?: {
    id: string;
    headline: string;
    primaryText: string;
  } | null;
  leadLoopVerified?: boolean;
  firstWeekSuccess?: FirstWeekSuccessState | null;
  valueReport?: CampaignValueReport | null;
  renderedAt?: string;
};

function currency(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-CA", {
    timeZone: "UTC",
  });
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function formatLastVerified(value: string | null | undefined, nowMs: number) {
  if (!value) {
    return "not verified yet";
  }

  const diffMs = nowMs - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60_000));

  if (diffMinutes <= 1) {
    return "just now";
  }

  return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
}

const META_SYNC_STALE_MS = 30 * 60 * 1000;

function isStaleSync(value: string | null | undefined, nowMs: number) {
  if (!value) {
    return true;
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return nowMs - timestamp > META_SYNC_STALE_MS;
}

function sanitizeCustomerActionText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\bkill rule\b/gi, "spend protection rule")
    .replace(/\bkilling\b/gi, "stopping scale")
    .replace(/\bkill\b/gi, "stop scaling")
    .replace(/\bestimated local state\b/gi, "pending Meta confirmation")
    .trim();
}

function getCustomerOptimizerLabel(value: string | null | undefined) {
  const normalized = (value ?? "").toLowerCase();

  if (normalized === "kill" || normalized.includes("pause")) {
    return "Needs review";
  }

  if (normalized.includes("scale") || normalized.includes("healthy")) {
    return "Ready to scale";
  }

  return "Monitoring";
}

function getStatusToneForDashboard(value: string | null | undefined): "neutral" | "success" | "warning" | "danger" | "info" | "accent" {
  const normalized = (value ?? "").toLowerCase();

  if (normalized.includes("confirmed") || normalized.includes("connected") || normalized.includes("active") || normalized.includes("live")) {
    return "success";
  }

  if (normalized.includes("waiting") || normalized.includes("pending") || normalized.includes("collecting") || normalized.includes("review")) {
    return "warning";
  }

  if (normalized.includes("failed") || normalized.includes("issue") || normalized.includes("missing")) {
    return "danger";
  }

  return "accent";
}

function includesRecommendation(
  haystack: string[],
  patterns: RegExp[],
) {
  const combined = haystack.join(" ").toLowerCase();
  return patterns.some((pattern) => pattern.test(combined));
}

type LaunchState = "draft" | "ready" | "live" | "paused";
type DataSourceState = "disconnected" | "collecting" | "active";

function getLaunchState(plan: CampaignPlan): LaunchState {
  if (plan.runtime.safetyState === "paused") {
    return "paused";
  }

  if (plan.runtime.metaPushStatus === "published" || plan.runtime.status === "live") {
    return "live";
  }

  if (plan.runtime.status === "launch_ready" || plan.runtime.status === "connected") {
    return "ready";
  }

  return "draft";
}

function getDataSourceState(params: {
  metaConnection: MetaConnectionState;
  syncSnapshot?: MetaCampaignSyncSnapshot | null;
  creativePerformanceSummary?: CreativePerformanceSummary | null;
}): DataSourceState {
  if (params.metaConnection.connectionStatus !== "connected") {
    return "disconnected";
  }

  const metrics = params.syncSnapshot?.deliveryMetrics;
  const hasLiveVolume = Boolean(
    metrics &&
    (
      Number(metrics.impressions ?? 0) > 0 ||
      Number(metrics.clicks ?? 0) > 0 ||
      Number(metrics.leads ?? 0) > 0 ||
      Number(metrics.spend ?? 0) > 0
    ),
  );
  const hasRankedPerformance = Boolean(params.creativePerformanceSummary?.rankedCreatives?.length);

  if (!hasLiveVolume && !hasRankedPerformance) {
    return "collecting";
  }

  if (Number(metrics?.leads ?? 0) > 0 || hasRankedPerformance) {
    return "active";
  }

  return "collecting";
}

export function CampaignDashboardView({
  plan,
  metaConnection,
  syncSnapshot = null,
  expectedOutcomes,
  nextActions,
  optimizerResult,
  workspaceMetrics,
  bookingSummary = null,
  recentLeads = [],
  recentAppointments = [],
  recentDeals = [],
  creativePerformanceSummary = null,
  launchRecord = null,
  autonomySnapshot = null,
  selectedAdSummary = null,
  leadLoopVerified = false,
  firstWeekSuccess = null,
  valueReport = null,
  renderedAt,
}: Props) {
  const renderedAtMs = new Date(renderedAt ?? "1970-01-01T00:00:00.000Z").getTime();
  const stableNowMs = Number.isFinite(renderedAtMs) ? renderedAtMs : 0;
  const launchState = getLaunchState(plan);
  const dataSourceState = getDataSourceState({
    metaConnection,
    syncSnapshot,
    creativePerformanceSummary,
  });
  const liveMetrics = syncSnapshot?.deliveryMetrics;
  const hasLivePerformance = launchState === "live" && dataSourceState === "active";
  const hasRealDeliveryData = Boolean(
    liveMetrics &&
      (Number(liveMetrics.spend ?? 0) > 0 ||
        Number(liveMetrics.impressions ?? 0) > 0 ||
        Number(liveMetrics.clicks ?? 0) > 0 ||
        Number(liveMetrics.leads ?? 0) > 0),
  );
  const missingPerformanceData =
    launchState === "live" &&
    (!syncSnapshot ||
      (Number(liveMetrics?.spend ?? 0) <= 0 &&
        Number(liveMetrics?.leads ?? 0) <= 0 &&
        Number(liveMetrics?.impressions ?? 0) <= 0 &&
        Number(liveMetrics?.clicks ?? 0) <= 0));
  const displayedLeads = hasLivePerformance
    ? Number(liveMetrics?.leads ?? 0)
    : Number(workspaceMetrics.totalLeads ?? 0);
  const displayedAppointments = Number(workspaceMetrics.appointmentsBooked ?? 0);
  const displayedSpend = hasLivePerformance
    ? Number(liveMetrics?.spend ?? 0)
    : Number(workspaceMetrics.totalSpend ?? 0);
  const displayedCpl =
    displayedLeads > 0 ? displayedSpend / Math.max(displayedLeads, 1) : 0;
  const displayedAppointmentRate = `${Math.round(
    Number(workspaceMetrics.leadToAppointmentRate ?? 0) * 100,
  )}%`;
  const rankedTopCreative = creativePerformanceSummary?.rankedCreatives?.[0] ?? null;
  const liveCtrPercent = Number(((liveMetrics?.ctr ?? 0) * 100).toFixed(2));
  const liveCplValue =
    Number(liveMetrics?.leads ?? 0) > 0
      ? Number(
          (
            Number(liveMetrics?.spend ?? 0) /
            Math.max(Number(liveMetrics?.leads ?? 0), 1)
          ).toFixed(2),
        )
      : 0;
  const strategySummary = optimizerResult.strategySummary ?? [];
  const testingRecommendations = optimizerResult.testingRecommendations ?? [];
  const regenerationSuggestions = optimizerResult.regenerationSuggestions ?? [];
  const optimizerCopy = [
    ...strategySummary,
    ...testingRecommendations,
    ...regenerationSuggestions,
    ...(optimizerResult.reasons ?? []),
    ...(optimizerResult.actions ?? []),
  ];
  const recommendationCards = [
    {
      title: "CTR warning → change creative",
      description: "Recommendation: refresh the lead ad before more budget is spent on a weak message.",
      active:
        includesRecommendation(optimizerCopy, [/change creative/, /refresh creative/, /swap creative/]) ||
        (liveCtrPercent > 0 && liveCtrPercent < 1),
      priority: 1,
      sourceLabel:
        liveCtrPercent > 0 && liveCtrPercent < 1
          ? `Live data: CTR ${liveCtrPercent.toFixed(2)}%`
          : "Recommendation",
    },
    {
      title: "CPL warning → adjust targeting",
      description: "Recommendation: tighten audience and geo settings before scaling spend further.",
      active:
        includesRecommendation(optimizerCopy, [/adjust targeting/, /tighten targeting/, /high cpl/]) ||
        (liveCplValue > 0 && liveCplValue > Number(plan.monthlyBudget / 100)),
      priority: 2,
      sourceLabel:
        liveCplValue > 0 && liveCplValue > Number(plan.monthlyBudget / 100)
          ? `Live data: CPL ${currency(liveCplValue)}`
          : "Recommendation",
    },
    {
      title: "No-lead warning → pause or fix ad",
      description: "Recommendation: if spend is accruing without leads, pause the ad and fix the offer or creative.",
      active:
        includesRecommendation(optimizerCopy, [/pause ad/, /no leads/, /no lead/, /spend without leads/]) ||
        (Number(liveMetrics?.spend ?? 0) > 0 && Number(liveMetrics?.leads ?? 0) === 0),
      priority: 3,
      sourceLabel:
        Number(liveMetrics?.spend ?? 0) > 0 && Number(liveMetrics?.leads ?? 0) === 0
          ? `Live data: ${currency(Number(liveMetrics?.spend ?? 0))} spent, 0 leads`
          : "Recommendation",
    },
    {
      title: "Best ad suggestion → scale budget",
      description: "Recommendation: shift more budget into the best current performer while results stay efficient.",
      active:
        includesRecommendation(optimizerCopy, [/scale budget/, /increase budget/, /winner/, /winning ad/]) ||
        Boolean(rankedTopCreative && rankedTopCreative.ctr >= 1.5),
      priority: 4,
      sourceLabel:
        rankedTopCreative && rankedTopCreative.ctr >= 1.5
          ? `Live data: top CTR ${rankedTopCreative.ctr.toFixed(2)}%`
          : "Recommendation",
    },
  ];
  const highlightedRecommendations = recommendationCards
    .filter((card) => card.active)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 1);
  const topPerformer =
    (rankedTopCreative
      ? plan.ads.find((ad) => {
          const headlineMatches =
            normalizeText(ad.headline) === normalizeText(rankedTopCreative.headline);
          const overlayMatches =
            normalizeText(ad.overlayText) === normalizeText(rankedTopCreative.hook);
          const bodyMatches =
            normalizeText(ad.body) === normalizeText(rankedTopCreative.headline);

          return headlineMatches || overlayMatches || bodyMatches;
        })
      : null) ??
    null;
  const statusText =
    dataSourceState === "disconnected"
      ? "Disconnected"
      : launchState !== "live" || dataSourceState === "collecting"
        ? "Collecting"
        : "Active";
  const smsPrompt = dataSourceState === "active"
    ? isSellerCampaignIntent(plan.intent)
      ? "Saved seller follow-up logic is available for connected lead handling."
      : isCommercialCampaignIntent(plan.intent)
        ? "Saved commercial follow-up logic is available for connected lead handling."
      : isInvestorCampaignIntent(plan.intent)
        ? "Saved investor follow-up logic is available for connected lead handling."
        : "Saved buyer follow-up logic is available for connected lead handling."
    : "No live follow-up activity is being reported yet.";
  const bookingText = bookingSummary?.scheduled_at
    ? `Next booking: ${formatDateTime(bookingSummary.scheduled_at)}`
    : "No booking record yet.";
  const runtimeMetaCampaignId = plan.runtime.campaignId ?? null;
  const runtimeMetaAdSetIds = Array.isArray(plan.runtime.metaAdSetIds) ? plan.runtime.metaAdSetIds : [];
  const runtimeMetaAdIds = Array.isArray(plan.runtime.metaAdIds) ? plan.runtime.metaAdIds : [];
  const hasRecordedMetaLaunch = Boolean(launchRecord?.metaCampaignId || runtimeMetaCampaignId);
  const syncedCampaignStatus = String(syncSnapshot?.campaignStatus ?? "").toLowerCase();
  const syncShowsActiveDelivery = syncedCampaignStatus.includes("active") && !syncedCampaignStatus.includes("inactive");
  const hasRecordedPausedLaunch = hasRecordedMetaLaunch && !hasRealDeliveryData && !syncShowsActiveDelivery;
  const launchStatusLabel = hasRecordedPausedLaunch
    ? "Paused launch recorded"
    : hasRecordedMetaLaunch
      ? launchRecord?.resultStatus || plan.runtime.metaPushStatus || "Meta launch recorded"
    : "Launch record missing";
  const syncedMetaCampaignId =
    typeof syncSnapshot?.metaCampaignId === "string" ? syncSnapshot.metaCampaignId : null;
  const syncedAt =
    typeof syncSnapshot?.syncedAt === "string"
      ? syncSnapshot.syncedAt
      : typeof syncSnapshot?.lastSyncedAt === "string"
        ? syncSnapshot.lastSyncedAt
        : null;
  const syncIsStale = isStaleSync(syncedAt, stableNowMs);
  const syncStateLabel = !syncedAt
    ? hasRecordedPausedLaunch
      ? "Paused launch recorded"
      : hasRecordedMetaLaunch
        ? "Estimated state only"
      : "Estimated state only"
    : syncIsStale
      ? "Confirmed state is stale"
      : "Confirmed in Meta";
  const syncStateDescription = !syncedAt
    ? hasRecordedPausedLaunch
      ? "Paused Meta objects are recorded locally. No live delivery is implied until a fresh Meta sync confirms delivery state."
      : hasRecordedMetaLaunch
        ? "Local launch records exist, but no fresh Meta sync has confirmed the live state yet."
      : "No fresh Meta sync has confirmed the live state yet."
    : syncIsStale
      ? "A prior Meta sync exists, but it is stale. Treat current delivery and status as estimated until a fresh sync completes."
      : "Recent Meta sync data is available. Campaign status and delivery details below are confirmed from Meta.";
  const syncedMetaAdSetIds = Array.isArray(syncSnapshot?.metaAdSetIds) ? syncSnapshot.metaAdSetIds : [];
  const syncedMetaAdIds = Array.isArray(syncSnapshot?.metaAdIds) ? syncSnapshot.metaAdIds : [];
  const launchedMetaAdSetIds = Array.isArray(launchRecord?.metaAdSetIds) ? launchRecord.metaAdSetIds : [];
  const launchedMetaAdIds = Array.isArray(launchRecord?.metaAdIds) ? launchRecord.metaAdIds : [];
  const resolvedMetaCampaignId =
    syncedMetaCampaignId ?? launchRecord?.metaCampaignId ?? runtimeMetaCampaignId;
  const resolvedMetaAdSetIds =
    syncedMetaAdSetIds.length > 0
      ? syncedMetaAdSetIds
      : launchedMetaAdSetIds.length > 0
        ? launchedMetaAdSetIds
        : runtimeMetaAdSetIds;
  const resolvedMetaAdIds =
    syncedMetaAdIds.length > 0
      ? syncedMetaAdIds
      : launchedMetaAdIds.length > 0
        ? launchedMetaAdIds
        : runtimeMetaAdIds;
  const lineageItems = [
    { label: "Saved campaign", value: plan.id || "Unavailable" },
    { label: "Launch status", value: launchStatusLabel },
    { label: "Meta campaign", value: resolvedMetaCampaignId || "Not assigned" },
    {
      label: "Meta ad sets",
      value: resolvedMetaAdSetIds.length > 0 ? resolvedMetaAdSetIds.join(", ") : "Not assigned",
    },
    {
      label: "Meta ads",
      value: resolvedMetaAdIds.length > 0 ? resolvedMetaAdIds.join(", ") : "Not assigned",
    },
    {
      label: "Last live sync",
      value: syncedAt ? formatDateTime(syncedAt) : "No live sync yet",
    },
  ];
  const campaignSummaryItems = [
    { label: "Campaign", value: plan.businessName || "Untitled campaign" },
    { label: "Intent", value: getCampaignIntentLabel(plan.intent) },
    { label: "Market", value: plan.market || "Not set" },
    { label: "Audience", value: plan.audience || "Not set" },
    { label: "Stage", value: plan.runtime.status || "draft" },
    { label: "Meta connection", value: metaConnection.accountName || "Not connected" },
  ];
  const metaStatusText = metaConnection.hasAccessToken
    ? `Connected (last verified ${formatLastVerified(metaConnection.lastSyncAt ?? metaConnection.connectedAt, stableNowMs)})`
    : "Not connected";
  const metaSelectionMissingText = metaConnection.hasAccessToken
    ? "Selection required before launch"
    : "Not selected";
  const metaAccountText = metaConnection.accountName || metaSelectionMissingText;
  const metaPageText = metaConnection.pageName || metaSelectionMissingText;
  const metaPixelText = metaConnection.tracking.pixelId || metaSelectionMissingText;
  const creativesGeneratedCount =
    (Array.isArray(plan.creatives.staticAds) ? plan.creatives.staticAds.length : 0) +
    (Array.isArray(plan.creatives.videoAds) ? plan.creatives.videoAds.length : 0);
  const funnelGenerated = Boolean(
    plan.funnel?.headline ||
    plan.funnel?.sections?.length ||
    plan.funnelSteps?.length,
  );
  const campaignCreated = Boolean(resolvedMetaCampaignId);
  const adSetCreated = resolvedMetaAdSetIds.length > 0;
  const adCreated = resolvedMetaAdIds.length > 0;
  const operationalStatusItems = [
    {
      label: "Campaign status",
      value: plan.runtime.status || "draft",
    },
    {
      label: "Meta connected",
      value: metaStatusText,
    },
    {
      label: "Selected ad account",
      value: metaAccountText,
    },
    {
      label: "Selected Page",
      value: metaPageText,
    },
    {
      label: "Selected pixel",
      value: metaPixelText,
    },
    {
      label: "Campaign created",
      value: campaignCreated ? "Paused campaign object recorded" : "No local campaign created yet",
    },
    {
      label: "Ad set created",
      value: adSetCreated ? "Paused ad set object recorded" : "No local ad set record yet",
    },
    {
      label: "Ad created",
      value: adCreated ? "Paused ad object recorded" : "No local ad record yet",
    },
    {
      label: "Creatives generated",
      value: String(creativesGeneratedCount),
    },
    {
      label: "Funnel generated",
      value: funnelGenerated ? "Yes" : "No",
    },
    {
      label: "Selected ad",
      value: selectedAdSummary?.headline || "No ad selected",
    },
    {
      label: "Lead loop verified",
      value: leadLoopVerified ? "✔ Lead loop verified" : "⚠ Not yet verified",
    },
    {
      label: "Launch status",
      value: launchStatusLabel,
    },
  ];
  const creativeSummaryItems = creativePerformanceSummary
    ? [
        { label: "Synced at", value: formatDateTime(creativePerformanceSummary.syncedAt) },
        { label: "Winners", value: String(creativePerformanceSummary.winners.length) },
        { label: "Underperformers", value: String(creativePerformanceSummary.underperformers.length) },
        { label: "Ranked creatives", value: String(creativePerformanceSummary.rankedCreatives.length) },
      ]
    : [];
  const reportStatusClass =
    valueReport?.status === "active"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : valueReport?.status === "needs_attention"
        ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
        : valueReport?.status === "collecting"
          ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
          : "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";
  const reportMetricItems = valueReport
    ? [
        { label: "Spend", value: currency(valueReport.metrics.spend) },
        { label: "Clicks", value: valueReport.metrics.clicks.toLocaleString() },
        { label: "Leads", value: valueReport.metrics.leads.toLocaleString() },
        {
          label: "CTR",
          value: valueReport.metrics.ctr > 0 ? `${(valueReport.metrics.ctr * 100).toFixed(2)}%` : "Waiting for data",
        },
      ]
    : [];
  const reportAssetItems = valueReport
    ? [
        { label: "Funnel", value: valueReport.campaign.funnelStatus },
        { label: "Static ads", value: String(valueReport.assets.staticAdsGenerated) },
        { label: "Video ads", value: String(valueReport.assets.videoAdsGenerated) },
        { label: "Selected ads", value: String(valueReport.assets.selectedAds) },
      ]
    : [];

  const metrics = [
    { label: "Total leads", value: String(displayedLeads) },
    { label: "Total appointments", value: String(displayedAppointments) },
    { label: "Spend", value: currency(displayedSpend) },
    { label: "Cost per lead", value: currency(displayedCpl) },
  ];
  const hasMetricData =
    displayedLeads > 0 ||
    displayedSpend > 0 ||
    Number(liveMetrics?.impressions ?? 0) > 0 ||
    Number(liveMetrics?.clicks ?? 0) > 0;
  const firstWeekLastVerifiedText = firstWeekSuccess?.lastVerifiedAt
    ? formatDateTime(firstWeekSuccess.lastVerifiedAt)
    : "Not verified yet";
  const firstWeekLastSyncText = firstWeekSuccess?.lastSyncAt
    ? formatDateTime(firstWeekSuccess.lastSyncAt)
    : "No live sync yet";
  const lifecycleStatusTone =
    firstWeekSuccess?.firstLead
      ? "border-emerald-400/20 bg-emerald-400/10"
      : launchState === "live"
        ? "border-amber-400/20 bg-amber-400/10"
        : "border-white/8 bg-white/[0.03]";
  const primaryNextAction = sanitizeCustomerActionText(
    valueReport?.nextAction ??
      firstWeekSuccess?.nextAction ??
      highlightedRecommendations[0]?.description ??
      nextActions[0] ??
      "Monitor the campaign.",
  );
  const customerOptimizerStatus = getCustomerOptimizerLabel(optimizerResult.status);
  const customerValueReportNextAction = sanitizeCustomerActionText(valueReport?.nextAction);
  const customerValueReportRecommendations = (valueReport?.recommendations ?? []).map(sanitizeCustomerActionText);
  const customerOptimizerActions = optimizerResult.actions.map(sanitizeCustomerActionText);
  const waitingForFirstDeliveryCopy = "Waiting for first delivery data";
  const primaryStatusDescription =
    dataSourceState === "disconnected"
      ? "Connect Meta before live results can be reported."
      : hasRecordedPausedLaunch
        ? "Paused Meta launch objects are recorded. Live delivery stays blocked until tracking, funds, and owner approval are complete."
      : launchState !== "live"
        ? "Launch the campaign to begin collecting delivery data."
        : hasMetricData
          ? "Live results are available from synced delivery data."
          : "Delivery is collecting. The dashboard is ready for the first synced Meta delivery metrics.";
  const headlineMetrics = [
    { label: "Leads", value: String(displayedLeads) },
    { label: "Cost per lead", value: displayedLeads > 0 ? currency(displayedCpl) : "Pending" },
    { label: "Spend", value: displayedSpend > 0 ? currency(displayedSpend) : "Pending" },
  ];
  const chartPoints = hasMetricData
    ? [
        { label: "Launch", spend: 0, leads: 0, actual: true },
        {
          label: "Current",
          spend: Number(displayedSpend.toFixed(2)),
          leads: displayedLeads,
          actual: true,
        },
      ]
    : [
        { label: "Day 0", spend: 0, leads: 0, actual: false },
        { label: "First sync", spend: 0, leads: 0, actual: false },
        { label: "First lead", spend: 0, leads: 0, actual: false },
        { label: "Scale review", spend: 0, leads: 0, actual: false },
      ];
  const funnelBars = [
    {
      label: "Impressions",
      value: Number(liveMetrics?.impressions ?? 0),
      detail: hasMetricData ? "Synced from Meta" : "Pending first delivery sync",
      tone: "info" as const,
    },
    {
      label: "Clicks",
      value: Number(liveMetrics?.clicks ?? 0),
      detail: hasMetricData ? `${liveCtrPercent.toFixed(2)}% CTR` : "Pending first click",
      tone: "accent" as const,
    },
    {
      label: "Leads",
      value: displayedLeads,
      detail: displayedLeads > 0 ? "Captured lead signals" : "Pending first verified lead",
      tone: "success" as const,
    },
    {
      label: "Appointments",
      value: displayedAppointments,
      detail: displayedAppointments > 0 ? "Booked from lead flow" : "Pending first booking",
      tone: "warning" as const,
    },
  ];
  const maxFunnelValue = Math.max(...funnelBars.map((item) => item.value), 1);
  const dashboardStatusTone = getStatusToneForDashboard(statusText);
  const metaDashboardTone = metaConnection.hasAccessToken ? "success" : "warning";
  const syncDashboardTone = getStatusToneForDashboard(syncStateLabel);
  const guidedStatusItems = [
    {
      label: "Campaign status",
      value: plan.runtime.status || statusText,
      detail: launchStatusLabel,
    },
    {
      label: "Meta connection",
      value: metaConnection.hasAccessToken ? "Connected" : "Not connected",
      detail: metaConnection.accountName || "Account not selected",
    },
    {
      label: "Spend",
      value: displayedSpend > 0 ? currency(displayedSpend) : "No spend yet",
      detail: hasLivePerformance ? "Synced from Meta" : "Saved workspace total",
    },
    {
      label: "Leads",
      value: String(displayedLeads),
      detail: `${displayedAppointments} appointments`,
    },
    {
      label: "CPL",
      value: displayedLeads > 0 ? currency(displayedCpl) : "Pending",
      detail: displayedLeads > 0 ? "Based on current spend" : "Waiting for first lead",
    },
    {
      label: "Next action",
      value: primaryNextAction,
      detail: customerOptimizerStatus,
    },
  ];

  return (
    <div className="space-y-5 text-[15px]">
      <DashboardVisualMarker />
      <Card className="rounded-[28px] border-cyan-300/15 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.18),transparent_34%),linear-gradient(135deg,rgba(9,16,32,0.98),rgba(8,13,27,0.9))] p-5 shadow-[0_32px_110px_-70px_rgba(34,211,238,0.65)] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={dashboardStatusTone}>Campaign health: {statusText}</StatusPill>
              <StatusPill tone={metaDashboardTone}>Meta {metaConnection.hasAccessToken ? "connected" : "needs connection"}</StatusPill>
              <StatusPill tone={syncDashboardTone}>{syncStateLabel}</StatusPill>
              {!hasMetricData ? <StatusPill tone="warning">{waitingForFirstDeliveryCopy}</StatusPill> : null}
            </div>
            <h3 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">
              {plan.businessName || "Campaign command center"}
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
              {primaryStatusDescription}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <MetaSyncRefreshButton campaignId={plan.id ?? null} />
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Spend"
            value={displayedSpend > 0 ? currency(displayedSpend) : "$0"}
            detail={hasLivePerformance ? "Synced from Meta delivery metrics" : "No synced spend yet"}
            tone={displayedSpend > 0 ? "accent" : "neutral"}
          />
          <MetricTile
            label="Leads"
            value={String(displayedLeads)}
            detail={displayedLeads > 0 ? `${displayedAppointments} appointments booked` : "No verified leads yet"}
            tone={displayedLeads > 0 ? "success" : "neutral"}
          />
          <MetricTile
            label="Cost per lead"
            value={displayedLeads > 0 ? currency(displayedCpl) : "Pending"}
            detail={displayedLeads > 0 ? "Spend divided by verified leads" : "Calculated after the first lead"}
            tone={displayedLeads > 0 ? "success" : "warning"}
          />
          <MetricTile
            label="Meta status"
            value={String(syncSnapshot?.campaignStatus ?? (resolvedMetaCampaignId ? "Paused launch recorded" : "Launch record missing"))}
            detail={syncedAt ? `Last sync ${formatLastVerified(syncedAt, stableNowMs)}` : "No Meta sync yet"}
            tone={syncDashboardTone}
          />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
          <DashboardChartPanel
            title="Performance trend"
            subtitle={hasMetricData ? "Actual synced snapshot values are plotted from launch baseline to the current Meta sync." : "Empty chart scaffold is shown as a launch baseline until live delivery arrives."}
            badge={hasMetricData ? "Live data" : "Day 0 baseline"}
          >
            <TrendAreaChart points={chartPoints} empty={!hasMetricData} />
            <div className="mt-4">
              <ChartLegend />
            </div>
          </DashboardChartPanel>

          <DashboardChartPanel
            title="Funnel movement"
            subtitle="Bars stay honest: zero means DealFlow has not received that signal yet."
            badge={hasMetricData ? "Synced" : "Pending"}
          >
            <MiniBarChart items={funnelBars.map((item) => ({ ...item, max: maxFunnelValue }))} />
          </DashboardChartPanel>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <NextActionPanel
            title="Next best action"
            action={primaryNextAction}
            detail={customerOptimizerStatus}
            tone={hasMetricData ? "accent" : "warning"}
          />
          <div className="grid gap-3 md:grid-cols-3">
            {guidedStatusItems.slice(0, 3).map((item) => (
              <div key={item.label} className="min-w-0 rounded-[20px] border border-white/8 bg-white/[0.035] p-4">
                <p className="truncate text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                <p className="mt-3 truncate text-lg font-semibold text-foreground">{item.value}</p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <details className="rounded-[24px] border border-white/8 bg-card p-5">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Raw details and activity
        </summary>
        <div className="mt-5 space-y-5">

      {valueReport ? (
        <Card className="rounded-[24px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Weekly value report</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{valueReport.headline}</h3>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                {valueReport.summary}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Reporting window: {valueReport.periodStart} to {valueReport.periodEnd}
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${reportStatusClass}`}>
              {valueReport.status.replaceAll("_", " ")}
            </span>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            {reportMetricItems.map((item) => (
              <div key={item.label} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{item.value}</p>
              </div>
            ))}
          </div>

          {valueReport.emptyState ? (
            <div className="mt-5 rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current reporting state</p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{valueReport.emptyState}</p>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Assets built</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {reportAssetItems.map((item) => (
                  <div key={item.label} className="rounded-[16px] border border-white/8 bg-black/10 px-4 py-3">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                Selected creative: {valueReport.assets.selectedAdHeadline ?? "No selected creative saved yet."}
              </p>
            </div>

            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Next recommended action</p>
              <p className="mt-3 text-lg font-semibold leading-7 text-foreground">{customerValueReportNextAction}</p>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-[16px] border border-white/8 bg-black/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Creative signal</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Winner: {valueReport.creativeInsights.winner ?? "Waiting for enough data."}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Watch: {valueReport.creativeInsights.underperformer ?? "No underperformer identified yet."}
                  </p>
                </div>
                <div className="rounded-[16px] border border-white/8 bg-black/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Lead loop</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {valueReport.leadLoop.leadLoopVerified ? "Lead loop verified." : "Lead loop not verified yet."}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Recent statuses: {valueReport.leadLoop.recentLeadStatuses.length > 0
                      ? valueReport.leadLoop.recentLeadStatuses.map((item) => `${item.status} ${item.count}`).join(", ")
                      : "No recent leads."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recommendations</p>
              <div className="mt-3 space-y-2">
                {customerValueReportRecommendations.map((item) => (
                  <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">DealFlow is monitoring</p>
              <div className="mt-3 space-y-2">
                {valueReport.monitoringNext.map((item) => (
                  <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="rounded-[24px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Meta sync</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{syncStateLabel}</h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
              {syncStateDescription}
            </p>
          </div>
          <MetaSyncRefreshButton campaignId={plan.id ?? null} />
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Last sync time</p>
            <p className="mt-3 text-sm leading-6">
              {syncedAt ? formatDateTime(syncedAt) : "No Meta sync yet"}
            </p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Freshness</p>
            <p className="mt-3 text-sm leading-6">
              {syncedAt ? `Last verified ${formatLastVerified(syncedAt, stableNowMs)}` : "Not verified yet"}
            </p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">State type</p>
            <p className="mt-3 text-sm leading-6">
              {syncIsStale ? "Estimated until refreshed" : "Confirmed from live Meta sync"}
            </p>
          </div>
        </div>
        {syncIsStale ? (
          <p className="mt-4 rounded-[18px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Meta sync is stale. Launch status and delivery metrics may lag behind the actual account until you refresh.
          </p>
        ) : null}
      </Card>

      {firstWeekSuccess ? (
        <Card className="rounded-[24px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">First-week success</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{firstWeekSuccess.currentStatus}</h3>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                {firstWeekSuccess.explanation}
              </p>
            </div>
            <div className={`rounded-[20px] border px-4 py-3 text-sm ${lifecycleStatusTone}`}>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Next expected milestone</p>
              <p className="mt-2 font-medium text-foreground">{firstWeekSuccess.nextMilestone}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current status</p>
              <p className="mt-3 text-sm leading-6">{firstWeekSuccess.currentStatus}</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Last verified action</p>
              <p className="mt-3 text-sm leading-6">{firstWeekSuccess.lastVerifiedAction}</p>
              <p className="mt-2 text-xs text-muted-foreground">{firstWeekLastVerifiedText}</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Last sync</p>
              <p className="mt-3 text-sm leading-6">{firstWeekLastSyncText}</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Next action</p>
              <p className="mt-3 text-sm leading-6">{firstWeekSuccess.nextAction}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Launch timeline</p>
              <div className="mt-4 space-y-3">
                {firstWeekSuccess.milestones.map((item) => (
                  <div key={item.key} className="rounded-[18px] border border-white/8 bg-black/10 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <span className={item.status === "complete" ? "text-emerald-400" : "text-amber-300"}>
                        {item.status === "complete" ? "Complete" : "Pending"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Automated checks</p>
                <div className="mt-4 space-y-3">
                  {firstWeekSuccess.lifecycleEvents.map((event) => (
                    <div key={event.key} className="rounded-[18px] border border-white/8 bg-black/10 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">{event.label}</p>
                        <span className={event.status === "complete" ? "text-emerald-400" : "text-amber-300"}>
                          {event.status === "complete" ? "Complete" : "Pending"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{event.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">What we are monitoring</p>
                <div className="mt-3 space-y-2">
                  {firstWeekSuccess.monitoring.map((item) => (
                    <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
                  ))}
                </div>
              </div>

              {firstWeekSuccess.firstLead ? (
                <div className="rounded-[20px] border border-emerald-400/20 bg-emerald-400/10 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">First lead</p>
                  <p className="mt-3 text-lg font-semibold text-foreground">{firstWeekSuccess.firstLead.name}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {firstWeekSuccess.firstLead.contact} • received{" "}
                    {formatDateTime(firstWeekSuccess.firstLead.receivedAt)}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    Recommended follow-up: {firstWeekSuccess.firstLead.recommendedFollowUp}
                  </p>
                </div>
              ) : (
                <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">No lead yet</p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    No lead has been verified yet. The system is watching delivery, funnel availability, and form capture without inventing performance that does not exist.
                  </p>
                </div>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      {!hasLivePerformance ? (
        <Card className="rounded-[24px] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Live reporting</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
            {dataSourceState === "disconnected"
              ? "Not connected"
              : missingPerformanceData
                ? "Waiting for delivery data"
                : "Collecting"}
          </h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            {dataSourceState === "disconnected"
              ? "Launch and connect Meta to start collecting results."
              : hasRecordedPausedLaunch
                ? "Paused launch objects are recorded. Live reporting begins only after explicit activation and Meta sync."
              : missingPerformanceData
                ? "Campaign live, waiting for delivery data."
              : launchState !== "live"
                ? "Launch the campaign to begin collecting delivery data."
                : "Meta is connected and delivery is underway, but there is not enough live data yet to report performance."}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.9fr))]">
        <Card className="rounded-[24px] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Results status
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
            {dataSourceState === "disconnected"
              ? "Not connected"
              : dataSourceState === "collecting"
                ? "Collecting"
                : "Active"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {dataSourceState === "disconnected"
              ? "Meta is not connected, so no live metrics can be reported."
              : dataSourceState === "collecting"
                ? "Delivery is running, but results are still below the threshold for trustworthy reporting."
                : "Live delivery data is available and results are grounded in synced metrics."}
          </p>
        </Card>
        <Card className="rounded-[24px] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Meta connection
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{metaStatusText}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {metaConnection.hasAccessToken
              ? "Meta access is connected for this campaign."
              : "Meta access has not been connected for this campaign yet."}
          </p>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>Account: {metaAccountText}</p>
            <p>Page: {metaPageText}</p>
            <p>Pixel: {metaPixelText}</p>
          </div>
        </Card>
        {headlineMetrics.map((metric) => (
          <Card key={metric.label} className="rounded-[24px] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {metric.label}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{metric.value}</p>
            {!hasMetricData ? (
              <p className="mt-2 text-sm text-muted-foreground">Waiting for data</p>
            ) : null}
          </Card>
        ))}
      </div>

      <Card className="rounded-[24px] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Status</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
              Campaign overview
            </h3>
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          {operationalStatusItems.map((item) => (
            <div
              key={item.label}
              className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-3 break-words text-sm leading-6">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      {creativePerformanceSummary ? (
        <Card className="rounded-[24px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Creative performance</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Ad results</h3>
            </div>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            {creativeSummaryItems.map((item) => (
              <div key={item.label} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                <p className="mt-3 break-words text-sm leading-6">{item.value}</p>
              </div>
            ))}
          </div>
          {creativePerformanceSummary.learned.length > 0 ? (
            <div className="mt-5 space-y-2 rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">What is working</p>
              {creativePerformanceSummary.learned.slice(0, 3).map((item) => (
                <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="rounded-[24px] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Campaign</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">What you launched</h3>
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {campaignSummaryItems.map((item) => (
            <div key={item.label} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
              <p className="mt-3 break-words text-sm leading-6">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-[24px] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Launch</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Launch results</h3>
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {lineageItems.map((item) => (
            <div key={item.label} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
              <p className="mt-3 break-words text-sm leading-6">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-[24px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Review</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">What to do next</h3>
          </div>
          <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {customerOptimizerStatus}
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {recommendationCards.map((card) => {
            const isHighlighted = highlightedRecommendations.some((item) => item.title === card.title);

            return (
              <div
                key={card.title}
                className={`rounded-[20px] border p-5 ${
                  isHighlighted
                    ? "border-primary/30 bg-primary/10"
                    : "border-white/8 bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white/90">{card.title}</p>
                  {isHighlighted ? (
                    <span className="rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                      Top recommendation
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{card.description}</p>
                <div className="mt-4 rounded-[16px] border border-white/8 bg-black/10 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {hasRealDeliveryData ? "Live recommendation" : "Planning recommendation"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{card.sourceLabel}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-4">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Plan</p>
              <div className="mt-3 space-y-2">
                {strategySummary.map((item) => (
                  <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Why</p>
                <div className="mt-3 space-y-2">
                  {optimizerResult.reasons.length > 0 ? optimizerResult.reasons.map((reason) => (
                    <p key={reason} className="text-sm leading-7 text-muted-foreground">{reason}</p>
                  )) : (
                    <p className="text-sm leading-7 text-muted-foreground">No critical warning is active. Keep monitoring live performance and protect the current mechanism.</p>
                  )}
                </div>
              </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Actions</p>
                <div className="mt-3 space-y-2">
                  {customerOptimizerActions.map((action) => (
                    <p key={action} className="text-sm leading-7 text-muted-foreground">{action}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Review</p>
              <div className="mt-3 space-y-2">
                {testingRecommendations.map((item) => (
                  <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Generate</p>
              <div className="mt-3 space-y-2">
                {regenerationSuggestions.map((item) => (
                  <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Next</p>
              <div className="mt-3 space-y-2">
                {nextActions.map((action) => (
                  <p key={action} className="text-sm leading-7 text-muted-foreground">{action}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {metrics.slice(1, 3).map((metric) => (
          <Card key={metric.label} className="rounded-[24px] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {metric.label}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{metric.value}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {metric.label === "Spend"
                ? hasLivePerformance
                  ? "Synced live campaign spend."
                  : "Saved campaign spend from recent snapshots."
                : `Lead-to-appointment rate: ${displayedAppointmentRate}.`}
            </p>
          </Card>
        ))}
      </div>

      {autonomySnapshot ? (
        <Card className="rounded-[24px] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Results</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Recommendations and recent actions</h3>
            </div>
            <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {autonomySnapshot.mode}
            </div>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recommendation status</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                {autonomySnapshot.systemStatus ?? "idle"}
              </p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recommendations</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                {autonomySnapshot.pendingActions?.length ?? 0}
              </p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recent updates</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                {autonomySnapshot.recentActions?.length ?? 0}
              </p>
            </div>
          </div>
          {(autonomySnapshot.pendingActions?.length ?? 0) > 0 ? (
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {autonomySnapshot.pendingActions!.slice(0, 4).map((action) => (
                <div key={action.actionKey} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
                  <p className="text-sm font-semibold">{action.title}</p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{action.reason}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <span>{action.actionType.replaceAll("_", " ")}</span>
                    <span>Confidence {(action.confidenceScore * 100).toFixed(0)}%</span>
                    {action.targetMarket ? <span>{action.targetMarket}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm leading-7 text-muted-foreground">
              {missingPerformanceData
                ? "Waiting for delivery data."
                : "No autonomy recommendations are available yet."}
            </p>
          )}
        </Card>
      ) : null}

      {hasLivePerformance && topPerformer ? (
        <Card className="rounded-[24px] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current top performer</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{topPerformer.headline}</h3>
            </div>
            {dataSourceState === "active" && rankedTopCreative ? (
              <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                🔥 Best performer
              </div>
            ) : null}
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className="overflow-hidden rounded-[20px] border border-white/8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={topPerformer.image}
                alt={topPerformer.headline}
                className="aspect-[16/11] h-full w-full object-cover"
              />
            </div>
            <div className="space-y-3 rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-sm font-semibold text-white/90">{topPerformer.overlayText}</p>
              <p className="text-sm leading-6 text-muted-foreground">{topPerformer.body}</p>
              {dataSourceState === "active" && rankedTopCreative ? (
                <div className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
                  <span className="rounded-full border border-white/10 px-3 py-1">
                    Combined {rankedTopCreative.combinedScore.toFixed(1)}
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1">
                    CTR {rankedTopCreative.ctr.toFixed(2)}%
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1">
                    CPL {rankedTopCreative.cpl !== null ? currency(rankedTopCreative.cpl) : "—"}
                  </span>
                </div>
              ) : null}
              <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {topPerformer.cta}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="rounded-[24px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Follow-up</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Lead follow-up</h3>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">SMS</p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{smsPrompt}</p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Booking</p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{bookingText}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-[24px] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Leads</p>
          <div className="mt-5 space-y-3">
            {recentLeads.length > 0 ? recentLeads.map((lead) => {
              const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || "Unnamed lead";
              const sourceCampaign =
                lead.campaign_id === plan.id
                  ? plan.businessName || plan.clientName || plan.id
                  : lead.campaign_id || "Unassigned";
              return (
                <div key={lead.id} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold">{fullName}</p>
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <p>Email: {lead.email || "No email"}</p>
                    <p>Phone: {lead.phone || "No phone"}</p>
                    <p>Source campaign: {sourceCampaign}</p>
                    <p>Status: {lead.status || "new"}{lead.source ? ` • ${lead.source}` : ""}</p>
                    <p>
                      {lead.estimated_value ? `Value ${currency(lead.estimated_value)} • ` : ""}
                      {formatDateTime(lead.created_at)}
                    </p>
                  </div>
                </div>
              );
            }) : (
              <p className="text-sm leading-7 text-muted-foreground">No leads have been captured for this workspace yet.</p>
            )}
          </div>
        </Card>

        <Card className="rounded-[24px] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recent appointments</p>
          <div className="mt-5 space-y-3">
            {recentAppointments.length > 0 ? recentAppointments.map((appointment) => (
              <div key={appointment.id} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold">{appointment.appointment_type || "Appointment"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{appointment.status || "scheduled"}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {appointment.scheduled_at
                    ? formatDateTime(appointment.scheduled_at)
                    : formatDate(appointment.created_at)}
                </p>
              </div>
            )) : (
              <p className="text-sm leading-7 text-muted-foreground">No appointments have been booked for this workspace yet.</p>
            )}
          </div>
        </Card>

        <Card className="rounded-[24px] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recent deals</p>
          <div className="mt-5 space-y-3">
            {recentDeals.length > 0 ? recentDeals.map((deal) => (
              <div key={deal.id} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold">{deal.title || "Untitled deal"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {deal.status || "active"}{deal.stage ? ` • ${deal.stage}` : ""}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {deal.closed_value
                    ? `Closed ${currency(deal.closed_value)}`
                    : deal.estimated_value
                      ? `Pipeline ${currency(deal.estimated_value)}`
                      : "No value recorded"} • {formatDate(deal.created_at)}
                </p>
              </div>
            )) : (
              <p className="text-sm leading-7 text-muted-foreground">No deals have been created for this workspace yet.</p>
            )}
          </div>
        </Card>
      </div>
        </div>
      </details>
    </div>
  );
}

export default CampaignDashboardView;
