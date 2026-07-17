"use client";

import {
  isInvestorCampaignIntent,
  isSellerCampaignIntent,
} from "@/lib/campaign-intent";
import { Card } from "@/components/ui/card";
import { MetaSyncRefreshButton } from "@/components/dashboard/meta-sync-refresh-button";
import { MetaOptimizationPolicyControl } from "@/components/dashboard/meta-optimization-policy-control";
import { MetaReportingPortfolioCard } from "@/components/dashboard/meta-reporting-portfolio-card";
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
import { resolveCampaignDeliveryMetricTruth } from "@/lib/dashboard/campaign-delivery-metrics";
import {
  resolveSelectedMetaAccountCurrency,
} from "@/lib/dashboard/meta-account-currency";
import { formatStableDashboardUtcTimestamp } from "@/lib/dashboard/stable-utc-date-format";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import { getProductIntlLocale, type ProductLocale } from "@/lib/i18n/config";
import type { ProductMessageKey } from "@/lib/i18n/messages";
import {
  buildMetaReportingPortfolio,
  type LeadOutcomePortfolio,
} from "@/lib/integrations/meta/reporting-portfolio-contract";

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
  renderedAt?: string;
  leadOutcomePortfolio?: LeadOutcomePortfolio;
};

function formatDateTime(value: string, locale: ProductLocale) {
  return formatStableDashboardUtcTimestamp({
    value,
    locale,
    includeTime: true,
  });
}

function formatDate(value: string, locale: ProductLocale) {
  return formatStableDashboardUtcTimestamp({
    value,
    locale,
    includeTime: false,
  });
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function formatLastVerified(
  value: string | null | undefined,
  nowMs: number,
  locale: ProductLocale,
) {
  if (!value) {
    return new Intl.RelativeTimeFormat(getProductIntlLocale(locale), { numeric: "auto" }).format(0, "minute");
  }

  const diffMs = nowMs - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60_000));

  if (diffMinutes <= 1) {
    return new Intl.RelativeTimeFormat(getProductIntlLocale(locale), { numeric: "auto" }).format(0, "minute");
  }

  return new Intl.RelativeTimeFormat(getProductIntlLocale(locale), { numeric: "auto" }).format(-diffMinutes, "minute");
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
  renderedAt,
  leadOutcomePortfolio = null,
}: Props) {
  const { currency: formatCurrency, locale, t } = useProductI18n();
  const localizedStatus = (value: string | null | undefined) => {
    const statusKeys: Record<string, ProductMessageKey> = {
      active: "common.active",
      complete: "common.complete",
      connected: "common.active",
      collecting: "common.collecting",
      disconnected: "common.disconnected",
      draft: "common.draft",
      degraded: "dashboard.system.degraded",
      idle: "common.idle",
      launch_ready: "common.ready",
      live: "common.live",
      new: "common.new",
      healthy: "dashboard.system.healthy",
      offline: "dashboard.system.offline",
      paused: "common.paused",
      pending: "common.pending",
      scheduled: "common.scheduled",
    };
    const normalized = (value ?? "").trim().toLowerCase();
    return statusKeys[normalized] ? t(statusKeys[normalized]) : value || t("common.notSet");
  };
  const localizedAutonomyMode = (value: string) => {
    const modeKeys: Record<string, ProductMessageKey> = {
      manual: "dashboard.autonomyMode.manual",
      assisted: "dashboard.autonomyMode.assisted",
      auto: "dashboard.autonomyMode.auto",
    };
    return modeKeys[value] ? t(modeKeys[value]) : value;
  };
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
  const deliveryMetricTruth = resolveCampaignDeliveryMetricTruth({
    campaignDeliveryMetrics: liveMetrics,
    workspaceMetrics,
  });
  const selectedMetaCurrency = resolveSelectedMetaAccountCurrency(metaConnection);
  const currency = (value: number) =>
    selectedMetaCurrency
      ? formatCurrency(value, selectedMetaCurrency, { maximumFractionDigits: 2 })
      : t("common.unavailable");
  const localizedDateTime = (value: string) => formatDateTime(value, locale);
  const localizedDate = (value: string) => formatDate(value, locale);
  const displayedLeads = deliveryMetricTruth.leads;
  const displayedAppointments = Number(workspaceMetrics.appointmentsBooked ?? 0);
  const displayedSpend = deliveryMetricTruth.spend;
  const displayedCpl = deliveryMetricTruth.cpl;
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
  // Optimizer prose is persisted generated output. Until that output carries a
  // locale receipt, non-English product routes render reviewed localized truth
  // instead of leaking English or pretending the generated prose was translated.
  const displayedStrategySummary = locale === "en" || strategySummary.length === 0
    ? strategySummary
    : [t("dashboard.localizedStrategy")];
  const displayedTestingRecommendations = locale === "en" || testingRecommendations.length === 0
    ? testingRecommendations
    : [t("dashboard.localizedTesting")];
  const displayedRegenerationSuggestions = locale === "en" || regenerationSuggestions.length === 0
    ? regenerationSuggestions
    : [t("dashboard.localizedRegeneration")];
  const displayedOptimizerReasons = locale === "en" || optimizerResult.reasons.length === 0
    ? optimizerResult.reasons
    : [t("dashboard.localizedStrategy")];
  const displayedOptimizerActions = locale === "en" || optimizerResult.actions.length === 0
    ? optimizerResult.actions
    : [t("dashboard.localizedActions")];
  const displayedNextActions = locale === "en" || nextActions.length === 0
    ? nextActions
    : [t("dashboard.localizedActions")];
  const optimizerCopy = [
    ...strategySummary,
    ...testingRecommendations,
    ...regenerationSuggestions,
    ...(optimizerResult.reasons ?? []),
    ...(optimizerResult.actions ?? []),
  ];
  const recommendationCards = [
    {
      title: t("dashboard.rec.ctrTitle"),
      description: t("dashboard.rec.ctrBody"),
      active:
        includesRecommendation(optimizerCopy, [/change creative/, /refresh creative/, /swap creative/]) ||
        (liveCtrPercent > 0 && liveCtrPercent < 1),
      priority: 1,
      sourceLabel:
        liveCtrPercent > 0 && liveCtrPercent < 1
          ? t("dashboard.rec.liveCtr", { value: liveCtrPercent.toFixed(2) })
          : t("dashboard.rec.label"),
    },
    {
      title: t("dashboard.rec.cplTitle"),
      description: t("dashboard.rec.cplBody"),
      active:
        includesRecommendation(optimizerCopy, [/adjust targeting/, /tighten targeting/, /high cpl/]) ||
        (liveCplValue > 0 && liveCplValue > Number(plan.monthlyBudget / 100)),
      priority: 2,
      sourceLabel:
        liveCplValue > 0 && liveCplValue > Number(plan.monthlyBudget / 100)
          ? t("dashboard.rec.liveCpl", { value: currency(liveCplValue) })
          : t("dashboard.rec.label"),
    },
    {
      title: t("dashboard.rec.noLeadTitle"),
      description: t("dashboard.rec.noLeadBody"),
      active:
        includesRecommendation(optimizerCopy, [/pause ad/, /no leads/, /no lead/, /spend without leads/]) ||
        (Number(liveMetrics?.spend ?? 0) > 0 && Number(liveMetrics?.leads ?? 0) === 0),
      priority: 3,
      sourceLabel:
        Number(liveMetrics?.spend ?? 0) > 0 && Number(liveMetrics?.leads ?? 0) === 0
          ? t("dashboard.rec.liveSpend", { value: currency(Number(liveMetrics?.spend ?? 0)) })
          : t("dashboard.rec.label"),
    },
    {
      title: t("dashboard.rec.scaleTitle"),
      description: t("dashboard.rec.scaleBody"),
      active:
        includesRecommendation(optimizerCopy, [/scale budget/, /increase budget/, /winner/, /winning ad/]) ||
        Boolean(rankedTopCreative && rankedTopCreative.ctr >= 0.015),
      priority: 4,
      sourceLabel:
        rankedTopCreative && rankedTopCreative.ctr >= 0.015
          ? t("dashboard.rec.liveTopCtr", { value: (rankedTopCreative.ctr * 100).toFixed(2) })
          : t("dashboard.rec.label"),
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
      ? t("common.disconnected")
      : launchState !== "live" || dataSourceState === "collecting"
        ? t("common.collecting")
        : t("common.active");
  const smsPrompt = dataSourceState === "active"
    ? isSellerCampaignIntent(plan.intent)
      ? t("dashboard.smsSeller")
      : isInvestorCampaignIntent(plan.intent)
        ? t("dashboard.smsInvestor")
        : t("dashboard.smsBuyer")
    : t("dashboard.smsNone");
  const bookingText = bookingSummary?.scheduled_at
    ? `${t("dashboard.booking")}: ${localizedDateTime(bookingSummary.scheduled_at)}`
    : t("dashboard.noBooking");
  const runtimeMetaCampaignId = plan.runtime.campaignId ?? null;
  const runtimeMetaAdSetIds = Array.isArray(plan.runtime.metaAdSetIds) ? plan.runtime.metaAdSetIds : [];
  const runtimeMetaAdIds = Array.isArray(plan.runtime.metaAdIds) ? plan.runtime.metaAdIds : [];
  const syncedMetaCampaignId =
    typeof syncSnapshot?.metaCampaignId === "string" ? syncSnapshot.metaCampaignId : null;
  const syncedAt =
    typeof syncSnapshot?.syncedAt === "string"
      ? syncSnapshot.syncedAt
      : typeof syncSnapshot?.lastSyncedAt === "string"
        ? syncSnapshot.lastSyncedAt
        : null;
  const syncIsStale = isStaleSync(syncedAt, stableNowMs);
  const latestAttemptAt =
    typeof syncSnapshot?.latestAttemptAt === "string"
      ? syncSnapshot.latestAttemptAt
      : null;
  const latestAttemptFailed = Boolean(
    latestAttemptAt &&
      syncSnapshot?.latestAttemptDeliveryMetricsConfirmed === false &&
      (!syncedAt || Date.parse(latestAttemptAt) > Date.parse(syncedAt)),
  );
  const confirmedSnapshotDegraded = Boolean(
    syncedAt && syncSnapshot?.syncResult !== "success",
  );
  const syncStateLabel = !syncedAt
    ? t("dashboard.sync.estimated")
    : latestAttemptFailed
      ? t("dashboard.sync.lastConfirmed")
    : confirmedSnapshotDegraded
      ? t("dashboard.sync.degraded")
    : syncIsStale
      ? t("dashboard.sync.stale")
      : t("dashboard.sync.confirmed");
  const syncStateDescription = !syncedAt
    ? t("dashboard.sync.estimatedBody")
    : latestAttemptFailed
      ? t("dashboard.sync.lastConfirmedBody")
    : confirmedSnapshotDegraded
      ? t("dashboard.sync.degradedBody")
    : syncIsStale
      ? t("dashboard.sync.staleBody")
      : t("dashboard.sync.confirmedBody");
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
    { label: t("common.campaign"), value: plan.id || t("common.unavailable") },
    { label: t("launch.campaignStatus"), value: launchRecord?.resultStatus || plan.runtime.metaPushStatus || t("common.notLaunched") },
    { label: t("dashboard.metaCampaign"), value: resolvedMetaCampaignId || t("dashboard.notAssigned") },
    {
      label: t("dashboard.metaAdSets"),
      value: resolvedMetaAdSetIds.length > 0 ? resolvedMetaAdSetIds.join(", ") : t("dashboard.notAssigned"),
    },
    {
      label: t("dashboard.metaAds"),
      value: resolvedMetaAdIds.length > 0 ? resolvedMetaAdIds.join(", ") : t("dashboard.notAssigned"),
    },
    {
      label: t("dashboard.lastLiveSync"),
      value: syncedAt ? localizedDateTime(syncedAt) : t("common.notVerified"),
    },
  ];
  const campaignSummaryItems = [
    { label: t("common.campaign"), value: plan.businessName || t("common.unavailable") },
    { label: t("dashboard.intent"), value: t(`dashboard.intent.${plan.intent}` as ProductMessageKey) },
    { label: t("common.market"), value: plan.market || t("common.notSet") },
    { label: t("common.audience"), value: plan.audience || t("common.notSet") },
    { label: t("dashboard.stage"), value: localizedStatus(plan.runtime.status || "draft") },
    { label: "Meta", value: metaConnection.accountName || t("common.notConnected") },
  ];
  const metaStatusText = metaConnection.hasAccessToken
    ? `Meta · ${formatLastVerified(metaConnection.lastSyncAt ?? metaConnection.connectedAt, stableNowMs, locale)}`
    : t("common.notConnected");
  const metaSelectionMissingText = metaConnection.hasAccessToken
    ? t("dashboard.selectionRequired")
    : t("dashboard.notSelected");
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
      label: t("launch.campaignStatus"),
      value: localizedStatus(plan.runtime.status || "draft"),
    },
    {
      label: t("dashboard.metaConnected"),
      value: metaStatusText,
    },
    {
      label: t("dashboard.selectedAdAccount"),
      value: metaAccountText,
    },
    {
      label: t("dashboard.selectedPage"),
      value: metaPageText,
    },
    {
      label: t("dashboard.selectedPixel"),
      value: metaPixelText,
    },
    {
      label: t("dashboard.campaignCreated"),
      value: campaignCreated ? t("dashboard.campaignCreatedYes") : t("dashboard.campaignCreatedNo"),
    },
    {
      label: t("dashboard.adSetCreated"),
      value: adSetCreated ? t("dashboard.adSetCreatedYes") : t("dashboard.adSetCreatedNo"),
    },
    {
      label: t("dashboard.adCreated"),
      value: adCreated ? t("dashboard.adCreatedYes") : t("dashboard.adCreatedNo"),
    },
    {
      label: t("dashboard.creativesGenerated"),
      value: String(creativesGeneratedCount),
    },
    {
      label: t("dashboard.funnelGenerated"),
      value: funnelGenerated ? t("common.yes") : t("common.no"),
    },
    {
      label: t("dashboard.selectedAd"),
      value: selectedAdSummary?.headline || t("dashboard.noAdSelected"),
    },
    {
      label: t("dashboard.leadLoopVerified"),
      value: leadLoopVerified ? t("dashboard.leadLoopYes") : t("dashboard.leadLoopNo"),
    },
    {
      label: t("dashboard.launchStatus"),
      value: localizedStatus(launchRecord?.resultStatus || plan.runtime.metaPushStatus || ""),
    },
  ];
  const creativeSummaryItems = creativePerformanceSummary
    ? [
        { label: t("dashboard.lastSync"), value: localizedDateTime(creativePerformanceSummary.syncedAt) },
        { label: t("dashboard.winners"), value: String(creativePerformanceSummary.winners.length) },
        { label: t("dashboard.underperformers"), value: String(creativePerformanceSummary.underperformers.length) },
        { label: t("dashboard.rankedCreatives"), value: String(creativePerformanceSummary.rankedCreatives.length) },
      ]
    : [];

  const reportingPortfolio = buildMetaReportingPortfolio({
    snapshot: syncSnapshot,
    outcomes: leadOutcomePortfolio,
    now: new Date(renderedAt ?? "1970-01-01T00:00:00.000Z"),
  });
  const metrics = [
    { label: t("dashboard.totalLeads"), value: displayedLeads === null ? t("common.unavailable") : String(displayedLeads) },
    { label: t("dashboard.totalAppointments"), value: String(displayedAppointments) },
    { label: t("dashboard.spend"), value: displayedSpend === null ? t("common.unavailable") : currency(displayedSpend) },
    { label: t("dashboard.cpl"), value: displayedCpl === null ? t("common.unavailable") : currency(displayedCpl) },
  ];
  const hasMetricData =
    Number(displayedLeads ?? 0) > 0 ||
    Number(displayedSpend ?? 0) > 0 ||
    Number(liveMetrics?.impressions ?? 0) > 0 ||
    Number(liveMetrics?.clicks ?? 0) > 0;
  const headlineMetrics = [
    { label: t("dashboard.leads"), value: displayedLeads === null ? t("common.unavailable") : String(displayedLeads) },
    { label: t("dashboard.cpl"), value: displayedCpl !== null ? currency(displayedCpl) : t("common.waitingForData") },
    { label: t("dashboard.spend"), value: displayedSpend !== null ? currency(displayedSpend) : t("common.waitingForData") },
  ];
  const firstWeekLastVerifiedText = firstWeekSuccess?.lastVerifiedAt
    ? localizedDateTime(firstWeekSuccess.lastVerifiedAt)
    : t("common.notVerified");
  const firstWeekLastSyncText = firstWeekSuccess?.lastSyncAt
    ? localizedDateTime(firstWeekSuccess.lastSyncAt)
    : t("common.notVerified");
  const lifecycleStatusTone =
    firstWeekSuccess?.firstLead
      ? "border-emerald-400/20 bg-emerald-400/10"
      : launchState === "live"
        ? "border-amber-400/20 bg-amber-400/10"
        : "border-white/8 bg-white/[0.03]";

  return (
    <div className="space-y-6">
      <p className="text-sm font-medium text-muted-foreground">{statusText}</p>

      {metaConnection.hasAccessToken && !selectedMetaCurrency ? (
        <Card className="rounded-[24px] border-amber-400/30 bg-amber-400/10 p-5">
          <p className="text-sm font-semibold text-amber-100">{t("dashboard.currencyUnavailable")}</p>
          <p className="mt-2 text-sm leading-6 text-amber-50/80">
            {t("dashboard.currencyHelp")}
          </p>
        </Card>
      ) : null}

      <Card className="rounded-[24px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.metaSync")}</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{syncStateLabel}</h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
              {syncStateDescription}
            </p>
          </div>
          <MetaSyncRefreshButton campaignId={plan.id ?? null} />
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.lastSyncTime")}</p>
            <p className="mt-3 text-sm leading-6">
              {syncedAt ? localizedDateTime(syncedAt) : t("common.notVerified")}
            </p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.freshness")}</p>
            <p className="mt-3 text-sm leading-6">
              {syncedAt ? formatLastVerified(syncedAt, stableNowMs, locale) : t("common.notVerified")}
            </p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.stateType")}</p>
            <p className="mt-3 text-sm leading-6">
              {latestAttemptFailed
                ? t("dashboard.sync.priorRetained")
                : confirmedSnapshotDegraded
                  ? t("dashboard.sync.partial")
                : syncIsStale
                  ? t("dashboard.sync.estimatedUntil")
                  : t("dashboard.sync.confirmedFrom")}
            </p>
          </div>
        </div>
        {syncIsStale ? (
          <p className="mt-4 rounded-[18px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {t("dashboard.sync.staleWarning")}
          </p>
        ) : null}
        {latestAttemptFailed ? (
          <p className="mt-4 rounded-[18px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {t("dashboard.sync.failedWarning")}
          </p>
        ) : null}
      </Card>

      <MetaReportingPortfolioCard
        portfolio={reportingPortfolio}
        currency={currency}
        labels={{
          title: t("dashboard.reportingPortfolio.title"),
          description: t("dashboard.reportingPortfolio.description"),
          providerDelivery: t("dashboard.reportingPortfolio.providerDelivery"),
          businessOutcomes: t("dashboard.reportingPortfolio.businessOutcomes"),
          state: {
            current: t("dashboard.reportingPortfolio.state.current"),
            delayed: t("dashboard.reportingPortfolio.state.delayed"),
            stale: t("dashboard.reportingPortfolio.state.stale"),
            partial: t("dashboard.reportingPortfolio.state.partial"),
            missing: t("dashboard.reportingPortfolio.state.missing"),
            failed: t("dashboard.reportingPortfolio.state.failed"),
          },
          spend: t("dashboard.spend"),
          impressions: t("dashboard.impressions"),
          clicks: t("dashboard.clicks"),
          leads: t("dashboard.leads"),
          conversations: t("dashboard.reportingPortfolio.conversations"),
          appointments: t("dashboard.totalAppointments"),
          qualified: t("dashboard.reportingPortfolio.qualified"),
          closedWon: t("dashboard.reportingPortfolio.closedWon"),
          unavailable: t("common.unavailable"),
        }}
      />

      {firstWeekSuccess ? (
        <Card className="rounded-[24px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.firstWeek")}</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                {locale === "en" ? firstWeekSuccess.currentStatus : t("dashboard.firstWeek.localizedStatus")}
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                {locale === "en" ? firstWeekSuccess.explanation : t("dashboard.firstWeek.localizedExplanation")}
              </p>
            </div>
            <div className={`rounded-[20px] border px-4 py-3 text-sm ${lifecycleStatusTone}`}>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.nextMilestone")}</p>
              <p className="mt-2 font-medium text-foreground">
                {locale === "en" ? firstWeekSuccess.nextMilestone : t("dashboard.firstWeek.localizedNext")}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.currentStatus")}</p>
              <p className="mt-3 text-sm leading-6">
                {locale === "en" ? firstWeekSuccess.currentStatus : t("dashboard.firstWeek.localizedStatus")}
              </p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.lastAction")}</p>
              <p className="mt-3 text-sm leading-6">
                {locale === "en" ? firstWeekSuccess.lastVerifiedAction : t("dashboard.firstWeek.localizedStatus")}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{firstWeekLastVerifiedText}</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.lastSync")}</p>
              <p className="mt-3 text-sm leading-6">{firstWeekLastSyncText}</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.nextAction")}</p>
              <p className="mt-3 text-sm leading-6">
                {locale === "en" ? firstWeekSuccess.nextAction : t("dashboard.firstWeek.localizedAction")}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.launchTimeline")}</p>
              <div className="mt-4 space-y-3">
                {firstWeekSuccess.milestones.map((item) => (
                  <div key={item.key} className="rounded-[18px] border border-white/8 bg-black/10 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {locale === "en"
                          ? item.label
                          : t(`dashboard.firstWeek.milestone.${item.key}` as ProductMessageKey)}
                      </p>
                      <span className={item.status === "complete" ? "text-emerald-400" : "text-amber-300"}>
                        {item.status === "complete" ? t("common.complete") : t("common.pending")}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {locale === "en"
                        ? item.detail
                        : t(item.status === "complete"
                          ? "dashboard.firstWeek.milestoneComplete"
                          : "dashboard.firstWeek.milestonePending")}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.automatedChecks")}</p>
                <div className="mt-4 space-y-3">
                  {firstWeekSuccess.lifecycleEvents.map((event) => (
                    <div key={event.key} className="rounded-[18px] border border-white/8 bg-black/10 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">
                          {locale === "en"
                            ? event.label
                            : t(`dashboard.firstWeek.event.${event.key}` as ProductMessageKey)}
                        </p>
                        <span className={event.status === "complete" ? "text-emerald-400" : "text-amber-300"}>
                          {event.status === "complete" ? t("common.complete") : t("common.pending")}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {locale === "en"
                          ? event.detail
                          : t(event.status === "complete"
                            ? "dashboard.firstWeek.eventComplete"
                            : "dashboard.firstWeek.eventPending")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.monitoring")}</p>
                <div className="mt-3 space-y-2">
                  {(locale === "en" ? firstWeekSuccess.monitoring : [t("dashboard.firstWeek.localizedMonitoring")]).map((item) => (
                    <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
                  ))}
                </div>
              </div>

              {firstWeekSuccess.firstLead ? (
                <div className="rounded-[20px] border border-emerald-400/20 bg-emerald-400/10 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.firstLead")}</p>
                  <p className="mt-3 text-lg font-semibold text-foreground">{firstWeekSuccess.firstLead.name}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {firstWeekSuccess.firstLead.contact} • {t("dashboard.received", {
                      value: localizedDateTime(firstWeekSuccess.firstLead.receivedAt),
                    })}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {t("dashboard.recommendedFollowUp")}
                  </p>
                </div>
              ) : (
                <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.noLeadYet")}</p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {t("dashboard.noLeadBody")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      {!hasLivePerformance ? (
        <Card className="rounded-[24px] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.liveReporting")}</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
            {dataSourceState === "disconnected"
              ? t("common.notConnected")
              : missingPerformanceData
                ? t("common.waitingForData")
                : t("common.collecting")}
          </h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            {dataSourceState === "disconnected"
              ? t("dashboard.connectToCollect")
              : missingPerformanceData
                ? t("dashboard.liveWaiting")
              : launchState !== "live"
                ? t("dashboard.launchToCollect")
                : t("dashboard.collectingBody")}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.9fr))]">
        <Card className="rounded-[24px] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {t("dashboard.resultsStatus")}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
            {dataSourceState === "disconnected"
              ? t("common.notConnected")
              : dataSourceState === "collecting"
                ? t("common.collecting")
                : t("common.active")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {dataSourceState === "disconnected"
              ? t("dashboard.disconnectedBody")
              : dataSourceState === "collecting"
                ? t("dashboard.belowThreshold")
                : t("dashboard.liveGrounded")}
          </p>
        </Card>
        <Card className="rounded-[24px] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {t("dashboard.metaConnection")}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{metaStatusText}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {metaConnection.hasAccessToken
              ? t("dashboard.metaAccessYes")
              : t("dashboard.metaAccessNo")}
          </p>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>{t("dashboard.account")}: {metaAccountText}</p>
            <p>{t("dashboard.page")}: {metaPageText}</p>
            <p>{t("dashboard.pixel")}: {metaPixelText}</p>
          </div>
        </Card>
        {headlineMetrics.map((metric) => (
          <Card key={metric.label} className="rounded-[24px] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {metric.label}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{metric.value}</p>
            {!hasMetricData ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("common.waitingForData")}</p>
            ) : null}
          </Card>
        ))}
      </div>

      <Card className="rounded-[24px] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("common.status")}</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
              {t("dashboard.overview")}
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
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.creativePerformance")}</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{t("dashboard.adResults")}</h3>
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
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.whatWorking")}</p>
              {(locale === "en"
                ? creativePerformanceSummary.learned.slice(0, 3)
                : [t("dashboard.localizedStrategy")]
              ).map((item) => (
                <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="rounded-[24px] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("common.campaign")}</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{t("dashboard.whatLaunched")}</h3>
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
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("nav.goLive")}</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{t("dashboard.launchResults")}</h3>
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
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("common.review")}</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{t("dashboard.whatNext")}</h3>
          </div>
          <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {t(`dashboard.optimizer.${optimizerResult.status}` as ProductMessageKey)}
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
                      {t("dashboard.topRecommendation")}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{card.description}</p>
                <div className="mt-4 rounded-[16px] border border-white/8 bg-black/10 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {hasRealDeliveryData ? t("dashboard.liveRecommendation") : t("dashboard.estimatedRecommendation")}
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
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("common.plan")}</p>
              <div className="mt-3 space-y-2">
                {displayedStrategySummary.map((item) => (
                  <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("common.why")}</p>
                <div className="mt-3 space-y-2">
                  {displayedOptimizerReasons.length > 0 ? displayedOptimizerReasons.map((reason) => (
                    <p key={reason} className="text-sm leading-7 text-muted-foreground">{reason}</p>
                  )) : (
                    <p className="text-sm leading-7 text-muted-foreground">{t("dashboard.noCritical")}</p>
                  )}
                </div>
              </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("common.actions")}</p>
                <div className="mt-3 space-y-2">
                  {displayedOptimizerActions.map((action) => (
                    <p key={action} className="text-sm leading-7 text-muted-foreground">{action}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("common.review")}</p>
              <div className="mt-3 space-y-2">
                {displayedTestingRecommendations.map((item) => (
                  <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("common.generate")}</p>
              <div className="mt-3 space-y-2">
                {displayedRegenerationSuggestions.map((item) => (
                  <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("common.next")}</p>
              <div className="mt-3 space-y-2">
                {displayedNextActions.map((action) => (
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
              {metric.label === t("dashboard.spend")
                ? hasLivePerformance
                  ? t("dashboard.spendLive")
                  : t("dashboard.spendSaved")
                : t("dashboard.appointmentRate", { value: displayedAppointmentRate })}
            </p>
          </Card>
        ))}
      </div>

      {autonomySnapshot ? (
        <Card className="rounded-[24px] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("common.results")}</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{t("dashboard.recommendations")}</h3>
            </div>
            <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {localizedAutonomyMode(autonomySnapshot.mode)}
            </div>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.recommendationStatus")}</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                {localizedStatus(autonomySnapshot.systemStatus ?? "idle")}
              </p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.recommendations")}</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                {autonomySnapshot.pendingActions?.length ?? 0}
              </p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.recentUpdates")}</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                {autonomySnapshot.recentActions?.length ?? 0}
              </p>
            </div>
          </div>
          {(autonomySnapshot.pendingActions?.length ?? 0) > 0 ? (
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {autonomySnapshot.pendingActions!.slice(0, 4).map((action) => (
                <div key={action.actionKey} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
                  <p className="text-sm font-semibold">
                    {locale === "en" ? action.title : t("dashboard.autonomyAction")}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {locale === "en" ? action.reason : t("dashboard.autonomyReason")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <span>{locale === "en" ? action.actionType.replaceAll("_", " ") : t("dashboard.autonomyAction")}</span>
                    <span>{t("dashboard.confidence", { value: (action.confidenceScore * 100).toFixed(0) })}</span>
                    {action.targetMarket ? <span>{action.targetMarket}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm leading-7 text-muted-foreground">
              {missingPerformanceData
                ? t("dashboard.autonomyWaiting")
                : t("dashboard.autonomyNone")}
            </p>
          )}
        </Card>
      ) : null}

      <Card className="rounded-[24px] p-6">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.optimizationSafety")}</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{t("dashboard.optimizationAuthority")}</h3>
        <MetaOptimizationPolicyControl campaignId={plan.id} />
      </Card>

      {hasLivePerformance && topPerformer ? (
        <Card className="rounded-[24px] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.topPerformer")}</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{topPerformer.headline}</h3>
            </div>
            {dataSourceState === "active" && rankedTopCreative ? (
              <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {t("dashboard.bestPerformer")}
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
                    {t("dashboard.combined")} {rankedTopCreative.combinedScore.toFixed(1)}
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1">
                    CTR {(rankedTopCreative.ctr * 100).toFixed(2)}%
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
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.followUp")}</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{t("dashboard.leadFollowUp")}</h3>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.sms")}</p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{smsPrompt}</p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.booking")}</p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{bookingText}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-[24px] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.leads")}</p>
          <div className="mt-5 space-y-3">
            {recentLeads.length > 0 ? recentLeads.map((lead) => {
              const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || t("dashboard.unnamedLead");
              const sourceCampaign =
                lead.campaign_id === plan.id
                  ? plan.businessName || plan.clientName || plan.id
                  : lead.campaign_id || t("dashboard.unassigned");
              return (
                <div key={lead.id} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold">{fullName}</p>
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <p>{t("common.email")}: {lead.email || t("dashboard.noEmail")}</p>
                    <p>{t("dashboard.phone")}: {lead.phone || t("dashboard.noPhone")}</p>
                    <p>{t("dashboard.sourceCampaign")}: {sourceCampaign}</p>
                    <p>{t("common.status")}: {localizedStatus(lead.status || "new")}{lead.source ? ` • ${lead.source}` : ""}</p>
                    <p>
                      {lead.estimated_value ? `${t("dashboard.value", { value: currency(lead.estimated_value) })} • ` : ""}
                      {localizedDateTime(lead.created_at)}
                    </p>
                  </div>
                </div>
              );
            }) : (
              <p className="text-sm leading-7 text-muted-foreground">{t("dashboard.noLeads")}</p>
            )}
          </div>
        </Card>

        <Card className="rounded-[24px] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.appointments")}</p>
          <div className="mt-5 space-y-3">
            {recentAppointments.length > 0 ? recentAppointments.map((appointment) => (
              <div key={appointment.id} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold">{appointment.appointment_type || t("dashboard.appointment")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{localizedStatus(appointment.status || "scheduled")}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {appointment.scheduled_at
                    ? localizedDateTime(appointment.scheduled_at)
                    : localizedDate(appointment.created_at)}
                </p>
              </div>
            )) : (
              <p className="text-sm leading-7 text-muted-foreground">{t("dashboard.noAppointments")}</p>
            )}
          </div>
        </Card>

        <Card className="rounded-[24px] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.deals")}</p>
          <div className="mt-5 space-y-3">
            {recentDeals.length > 0 ? recentDeals.map((deal) => (
              <div key={deal.id} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold">{deal.title || t("dashboard.untitledDeal")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {localizedStatus(deal.status || "active")}{deal.stage ? ` • ${deal.stage}` : ""}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {deal.closed_value
                    ? t("dashboard.closed", { value: currency(deal.closed_value) })
                    : deal.estimated_value
                      ? t("dashboard.pipeline", { value: currency(deal.estimated_value) })
                      : t("common.unavailable")} • {localizedDate(deal.created_at)}
                </p>
              </div>
            )) : (
              <p className="text-sm leading-7 text-muted-foreground">{t("dashboard.noDeals")}</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default CampaignDashboardView;
