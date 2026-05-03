import Link from "next/link";
import {
  buildCampaignScopedPath,
  resolveActiveCampaignRecord,
} from "@/lib/paywall-access";
import { PageHeader } from "@/components/app/page-header";
import { CampaignDashboardView } from "@/components/dashboard/campaign-dashboard-view";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { PlanAwareResultsPreview } from "@/components/results/plan-aware-results-preview";
import { normalizeBillingPlanTier } from "@/lib/billing/plans";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import {
  getCampaignPayloadFromPlan,
  getLeadLoopVerifiedFromPlan,
  getSelectedAdIdFromPlan,
  readCampaignPlanDocument,
} from "@/lib/services/campaign-plan-document";
import {
  getDefaultMetaConnectionState,
  getMetaConnectionState,
} from "@/lib/integrations/meta/service";
import { getExpectedOutcomes, getNextActions } from "@/lib/services/campaign-plan-service";
import { analyzeCampaign, type CampaignAnalysisInput } from "@/lib/services/ai-optimizer";
import {
  getLatestMetaCampaignSyncSnapshot,
  getMetaCampaignSyncSnapshotForCampaign,
} from "@/lib/services/meta-campaign-sync-service";
import {
  getCampaignLaunchRecordForCampaign,
  getLatestCampaignLaunchRecord,
} from "@/lib/services/campaign-launch-audit-service";
import {
  getCreativePerformanceSummaryForCampaign,
  getLatestCreativePerformanceSummary,
} from "@/lib/services/creative-performance-service";
import { logError } from "@/lib/logging";
import { getDashboardData, type DashboardMetrics } from "@/lib/services/dashboard-service";
import {
  buildFirstWeekSuccessState,
  persistFirstWeekSuccessState,
  type FirstWeekSuccessState,
} from "@/lib/services/first-week-success-service";
import { createClient } from "@/lib/supabase/server";
import { evaluateAutonomy } from "@/app/api/autonomy/_shared";

const EMPTY_DASHBOARD_METRICS: DashboardMetrics = {
  totalLeads: 0,
  appointmentsBooked: 0,
  activeDeals: 0,
  closedDeals: 0,
  pipelineValue: 0,
  closedVolume: 0,
  commissionRevenue: 0,
  leadToAppointmentRate: 0,
  totalSpend: 0,
  costPerLead: 0,
  costPerAppointment: 0,
  costPerClosedDeal: 0,
  appointmentToDealRate: 0,
  dealCloseRate: 0,
  bookedJobs: 0,
  revenue: 0,
  costPerBookedJob: 0,
};

function withTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs: number) {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function formatLastUpdated(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffSeconds = Math.max(0, Math.round(diffMs / 1000));

  if (diffSeconds <= 1) {
    return "Last updated just now";
  }

  if (diffSeconds < 60) {
    return `Last updated ${diffSeconds} seconds ago`;
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  return `Last updated ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
}

function parseCostPerLeadRange(value: string) {
  const matches = value.match(/(\d+(?:\.\d+)?)/g) ?? [];
  const first = Number(matches[0] ?? 0);
  const second = Number(matches[1] ?? first);

  if (!Number.isFinite(first) || first <= 0) {
    return 20;
  }

  if (!Number.isFinite(second) || second <= 0) {
    return first;
  }

  return Number(((first + second) / 2).toFixed(2));
}

function buildOptimizerInput(params: {
  plan: NonNullable<ReturnType<typeof canonicalCampaignToPlan>>;
  expectedOutcomes: NonNullable<ReturnType<typeof getExpectedOutcomes>>;
  syncSnapshot: Awaited<ReturnType<typeof getLatestMetaCampaignSyncSnapshot>> | null;
}): CampaignAnalysisInput {
  const budgetDailyInput = params.plan.runtime.budgetDailyInput ?? 0;

  if (params.syncSnapshot) {
    const metrics = params.syncSnapshot.deliveryMetrics;
    const ctrPercent = Number((metrics.ctr * 100).toFixed(2));
    const cpc = metrics.clicks > 0 ? Number((metrics.spend / metrics.clicks).toFixed(2)) : 0;
    const cpl = metrics.leads > 0
      ? Number((metrics.spend / metrics.leads).toFixed(2))
      : 0;
    const estimatedFrequency =
      metrics.impressions > 0 && metrics.clicks > 0
        ? Number((metrics.impressions / Math.max(metrics.clicks * 12, 1)).toFixed(2))
        : 1;
    const lpCvr = metrics.clicks > 0
      ? Number(((metrics.leads / metrics.clicks) * 100).toFixed(2))
      : 0;

    return {
      ctr: ctrPercent,
      cpc,
      cpl,
      frequency: estimatedFrequency,
      spend: metrics.spend,
      leads: metrics.leads,
      lp_cvr: lpCvr,
    };
  }

  return {
    ctr: 1,
    cpc: 3,
    cpl: parseCostPerLeadRange(params.expectedOutcomes.costPerLeadRange),
    frequency: 1,
    spend: budgetDailyInput,
    leads: 0,
    lp_cvr: 6,
  };
}

type DashboardLoadState = {
  campaignId: string | null;
  plan: ReturnType<typeof canonicalCampaignToPlan> | null;
  metaConnection: Awaited<ReturnType<typeof getMetaConnectionState>>;
  syncSnapshot: Awaited<ReturnType<typeof getLatestMetaCampaignSyncSnapshot>> | null;
  launchRecord: Awaited<ReturnType<typeof getLatestCampaignLaunchRecord>> | null;
  dashboardData: Awaited<ReturnType<typeof getDashboardData>> | null;
  creativePerformanceSummary: Awaited<ReturnType<typeof getLatestCreativePerformanceSummary>> | null;
  autonomySnapshot: Awaited<ReturnType<typeof evaluateAutonomy>>["snapshot"] | null;
  selectedAdSummary: {
    id: string;
    headline: string;
    primaryText: string;
  } | null;
  leadLoopVerified: boolean;
  firstWeekSuccess: FirstWeekSuccessState | null;
  lastUpdatedAt: string;
  routeError: boolean;
};

async function loadSelectedAdSummary(params: {
  campaignId: string | null;
  plan: ReturnType<typeof canonicalCampaignToPlan> | null;
}) {
  if (!params.campaignId || !params.plan) {
    return null;
  }

  const supabase = await createClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("campaign_plans")
    .select("plan")
    .eq("id", params.campaignId)
    .maybeSingle();

  const planRow = data as { plan?: unknown } | null;
  const rawPlan = readCampaignPlanDocument(planRow?.plan);
  const campaignPayload = getCampaignPayloadFromPlan(rawPlan) as Record<string, unknown> | null;
  const selectedAdId = getSelectedAdIdFromPlan(rawPlan);

  if (!selectedAdId) {
    return null;
  }

  const selectedAd =
    params.plan.creatives.staticAds.find((ad) => ad.id === selectedAdId) ?? null;

  if (!selectedAd) {
    return null;
  }

  return {
    id: selectedAdId,
    headline: selectedAd.headline ?? "Selected ad",
    primaryText: typeof selectedAd.primaryText === "string" ? selectedAd.primaryText : "",
  };
}

async function loadLeadLoopVerified(campaignId: string | null) {
  if (!campaignId) {
    return false;
  }

  const supabase = await createClient();

  if (!supabase) {
    return false;
  }

  const { data } = await supabase
    .from("campaign_plans")
    .select("plan")
    .eq("id", campaignId)
    .maybeSingle();

  const planRow = data as { plan?: unknown } | null;
  return getLeadLoopVerifiedFromPlan(planRow?.plan);
}

function DashboardFallback({ campaignId = null }: { campaignId?: string | null }) {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Dashboard"
        title="Dashboard"
        description="Some dashboard sources are still loading or unavailable. The states below explain what is missing and what to do next."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <EmptyState
          title="Campaign data unavailable"
          description="The saved campaign record could not be loaded for this dashboard view yet."
        />
        <EmptyState
          title="Meta sync not yet complete"
          description="Meta connection or sync data is not fully available, so launch and delivery status may still be catching up."
        />
        <EmptyState
          title="No performance data yet"
          description="Leads, spend, and recommendation quality will improve once delivery data and lead events arrive."
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={campaignId ? `/launch?campaignId=${encodeURIComponent(campaignId)}` : "/launch"}>
            Launch
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={campaignId ? `/preview?campaignId=${encodeURIComponent(campaignId)}` : "/preview"}>
            Review
          </Link>
        </Button>
      </div>
    </PageShell>
  );
}

async function loadDashboardState(): Promise<DashboardLoadState> {
  return loadDashboardStateForCampaign(null);
}

async function loadDashboardStateForCampaign(
  campaignId: string | null,
): Promise<DashboardLoadState> {
  try {
    const resolvedCampaign = await resolveActiveCampaignRecord(campaignId).catch(() => null);
    const record = resolvedCampaign?.record
      ? canonicalCampaignToPlan(resolvedCampaign.record)
      : null;
    const metaCampaignId = record?.runtime.campaignId ?? null;
    const resolvedCampaignId = resolvedCampaign?.campaignId ?? campaignId ?? record?.id ?? null;
    const lastUpdatedAt = new Date().toISOString();
    const [metaConnection, syncSnapshot, launchRecord, dashboardData, creativePerformanceSummary, autonomyResult, selectedAdSummary, leadLoopVerified] = await Promise.all([
      withTimeout(
        getMetaConnectionState().catch(() => getDefaultMetaConnectionState()),
        getDefaultMetaConnectionState(),
        2_500,
      ),
      record
        ? withTimeout(
            getMetaCampaignSyncSnapshotForCampaign({
              campaignName: record.businessName,
              metaCampaignId,
            }).catch(() => null),
            null,
            3_500,
          )
        : Promise.resolve(null),
      record
        ? withTimeout(
            getCampaignLaunchRecordForCampaign({
              campaignName: record.businessName,
              metaCampaignId,
            }).catch(() => null),
            null,
            3_500,
          )
        : Promise.resolve(null),
      withTimeout(
        getDashboardData(resolvedCampaignId).catch(
          () => null,
        ),
        null,
        4_000,
      ),
      resolvedCampaignId
        ? withTimeout(
            getCreativePerformanceSummaryForCampaign(resolvedCampaignId).catch(() => null),
            null,
            3_500,
          )
        : withTimeout(getLatestCreativePerformanceSummary().catch(() => null), null, 3_500),
      resolvedCampaignId
        ? withTimeout(
            evaluateAutonomy(resolvedCampaignId).catch(() => null),
            null,
            3_500,
          )
        : Promise.resolve(null),
      withTimeout(
        loadSelectedAdSummary({
          campaignId: resolvedCampaignId,
          plan: record,
        }).catch(() => null),
        null,
        2_500,
      ),
      withTimeout(loadLeadLoopVerified(resolvedCampaignId).catch(() => false), false, 2_500),
    ]);
    const recentLeads = dashboardData?.recentLeads ?? [];
    const firstWeekSuccess = record
      ? buildFirstWeekSuccessState({
          plan: record,
          metaConnection,
          syncSnapshot,
          launchRecord,
          recentLeads,
          leadLoopVerified,
        })
      : null;

    if (resolvedCampaignId && firstWeekSuccess) {
      await persistFirstWeekSuccessState({
        campaignId: resolvedCampaignId,
        state: firstWeekSuccess,
      }).catch(() => undefined);
    }

    return {
      campaignId: resolvedCampaignId,
      plan: record,
      metaConnection,
      syncSnapshot,
      launchRecord,
      dashboardData,
      creativePerformanceSummary,
      autonomySnapshot: autonomyResult?.snapshot ?? null,
      selectedAdSummary,
      leadLoopVerified,
      firstWeekSuccess,
      lastUpdatedAt,
      routeError: false,
    };
  } catch (error) {
    logError("Dashboard route load failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      campaignId,
      plan: null,
      metaConnection: getDefaultMetaConnectionState(),
      syncSnapshot: null,
      launchRecord: null,
      dashboardData: null,
      creativePerformanceSummary: null,
      autonomySnapshot: null,
      selectedAdSummary: null,
      leadLoopVerified: false,
      firstWeekSuccess: null,
      lastUpdatedAt: new Date().toISOString(),
      routeError: true,
    };
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const requestedPlanTier =
    typeof params.plan === "string"
      ? normalizeBillingPlanTier(params.plan)
      : null;

  if (requestedPlanTier === "starter" || requestedPlanTier === "pro") {
    return (
      <PageShell>
        <PlanAwareResultsPreview
          planTier={requestedPlanTier}
          sourceLabel={params.source === "onboarding" ? "Onboarding draft" : "Safe demo data"}
        />
      </PageShell>
    );
  }

  const requestedCampaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0
      ? params.campaignId
      : null;
  const state = await loadDashboardStateForCampaign(requestedCampaignId);

  if (state.routeError) {
    return <DashboardFallback campaignId={state.campaignId} />;
  }

  if (!state.plan) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Dashboard"
          title="Dashboard"
          description="This dashboard is connected to live data and will populate as leads, appointments, and campaign delivery records arrive."
        />
        <EmptyState
          title="No campaign available yet"
          description="Start onboarding to create a campaign before opening review, launch, or results."
        />
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/onboarding">Start onboarding</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={buildCampaignScopedPath("/builder", state.campaignId)}>Open builder</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  const bookingSummary = state.dashboardData?.recentAppointments?.[0]
    ? {
        status: state.dashboardData.recentAppointments[0].status,
        scheduled_at: state.dashboardData.recentAppointments[0].scheduled_at,
      }
    : null;
  const dashboardMetrics = state.dashboardData?.metrics ?? EMPTY_DASHBOARD_METRICS;
  const recentLeads = state.dashboardData?.recentLeads ?? [];
  const recentAppointments = state.dashboardData?.recentAppointments ?? [];
  const recentDeals = state.dashboardData?.recentDeals ?? [];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Dashboard"
        title="Dashboard"
        description="See campaign status, leads, spend, and the next best actions."
      />
      <p className="text-sm text-muted-foreground">{formatLastUpdated(state.lastUpdatedAt)}</p>
      <CampaignDashboardView
        plan={state.plan}
        metaConnection={state.metaConnection}
        syncSnapshot={state.syncSnapshot}
        launchRecord={state.launchRecord}
        expectedOutcomes={getExpectedOutcomes(state.plan)}
        nextActions={getNextActions(state.plan)}
        workspaceMetrics={dashboardMetrics}
        bookingSummary={bookingSummary}
        recentLeads={recentLeads}
        recentAppointments={recentAppointments}
        recentDeals={recentDeals}
        creativePerformanceSummary={state.creativePerformanceSummary}
        autonomySnapshot={state.autonomySnapshot}
        selectedAdSummary={state.selectedAdSummary}
        leadLoopVerified={state.leadLoopVerified}
        firstWeekSuccess={state.firstWeekSuccess}
        renderedAt={state.lastUpdatedAt}
        optimizerResult={analyzeCampaign(
          buildOptimizerInput({
            plan: state.plan,
            expectedOutcomes: getExpectedOutcomes(state.plan),
            syncSnapshot: state.syncSnapshot,
          }),
          {
            creativeStrategy: state.plan.creativeStrategy,
            audience: state.plan.audience,
            market: state.plan.market,
            propertyType: state.plan.propertyType,
            keyOffer: state.plan.keyOffer,
            budget: Number((state.plan.monthlyBudget / 30).toFixed(2)),
            currentAngles: state.plan.ads.map((ad) => ad.variant),
            winningAngle: null,
          },
        )}
      />
    </PageShell>
  );
}
