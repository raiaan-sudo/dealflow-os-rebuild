import Link from "next/link";
import {
  buildCampaignScopedPath,
  resolveActiveCampaignRecord,
} from "@/lib/paywall-access";
import { PageHeader } from "@/components/app/page-header";
import { CampaignDashboardView } from "@/components/dashboard/campaign-dashboard-view";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import {
  getDefaultMetaConnectionState,
  getMetaConnectionState,
} from "@/lib/integrations/meta/service";
import {
  getCampaignExperienceStage,
  getExpectedOutcomes,
  getNextActions,
} from "@/lib/services/campaign-plan-service";
import { analyzeCampaign, type CampaignAnalysisInput } from "@/lib/services/ai-optimizer";
import {
  getLatestMetaCampaignSyncSnapshot,
  getMetaCampaignSyncSnapshotForCampaign,
} from "@/lib/services/meta-campaign-sync-service";
import {
  getCampaignLaunchRecordForCampaign,
  getLatestCampaignLaunchRecord,
} from "@/lib/services/campaign-launch-audit-service";
import { logError } from "@/lib/logging";
import { getDashboardData } from "@/lib/services/dashboard-service";

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
  routeError: boolean;
};

function hasRealDashboardData(
  dashboardData: Awaited<ReturnType<typeof getDashboardData>> | null,
) {
  if (!dashboardData) {
    return false;
  }

  const metrics = dashboardData.metrics;

  return Boolean(
    dashboardData.recentLeads.length ||
      dashboardData.recentAppointments.length ||
      dashboardData.recentDeals.length ||
      dashboardData.chartSeries.length ||
      metrics.totalLeads > 0 ||
      metrics.appointmentsBooked > 0 ||
      metrics.totalSpend > 0 ||
      metrics.revenue > 0,
  );
}

function DashboardFallback({ campaignId = null }: { campaignId?: string | null }) {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Results"
        title="Results"
        description="The results page hit a loading problem. Use one of the safe entry points below while the issue is isolated."
      />
      <EmptyState
        title="Dashboard temporarily unavailable"
        description="A server-side load failed while preparing the results view. The route is now failing safe instead of returning an internal server error."
      />
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={buildCampaignScopedPath("/preview", campaignId)}>Open Preview</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={campaignId ? `/launch?campaignId=${encodeURIComponent(campaignId)}` : "/launch"}>
            Open Launch Setup
          </Link>
        </Button>
      </div>
    </div>
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
    const [metaConnection, syncSnapshot, launchRecord, dashboardData] = await Promise.all([
      getMetaConnectionState().catch(() => getDefaultMetaConnectionState()),
      record
        ? getMetaCampaignSyncSnapshotForCampaign({
            campaignName: record.businessName,
            metaCampaignId,
          }).catch(() => null)
        : Promise.resolve(null),
      record
        ? getCampaignLaunchRecordForCampaign({
            campaignName: record.businessName,
            metaCampaignId,
          }).catch(() => null)
        : Promise.resolve(null),
      getDashboardData(resolvedCampaign?.campaignId ?? campaignId ?? record?.id ?? null).catch(
        () => null,
      ),
    ]);

    return {
      campaignId: resolvedCampaign?.campaignId ?? campaignId ?? record?.id ?? null,
      plan: record,
      metaConnection,
      syncSnapshot,
      launchRecord,
      dashboardData,
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
  const requestedCampaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0
      ? params.campaignId
      : null;
  const state = await loadDashboardStateForCampaign(requestedCampaignId);

  if (state.routeError) {
    return <DashboardFallback campaignId={state.campaignId} />;
  }

  if (!state.plan || !hasRealDashboardData(state.dashboardData)) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Results"
          title="Results"
          description="This dashboard is connected to live data and will populate as leads, appointments, and campaign delivery records arrive."
        />
        <EmptyState
          title="No live dashboard data yet"
          description="No leads, appointments, or campaign performance records exist for this workspace/campaign yet."
        />
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={buildCampaignScopedPath("/preview", state.campaignId)}>
              Open Preview
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link
              href={
                state.campaignId
                  ? `/launch?campaignId=${encodeURIComponent(state.campaignId)}`
                  : "/launch"
              }
            >
              Open Launch Setup
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const bookingSummary = state.dashboardData?.recentAppointments?.[0]
    ? {
        status: state.dashboardData.recentAppointments[0].status,
        scheduled_at: state.dashboardData.recentAppointments[0].scheduled_at,
      }
    : null;
  const creativePerformanceSummary = null;
  const autonomySnapshot = null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Results"
        title="Results"
        description="See live delivery status, real metrics, and the current top performer."
      />
      <CampaignDashboardView
        plan={state.plan}
        metaConnection={state.metaConnection}
        syncSnapshot={state.syncSnapshot}
        launchRecord={state.launchRecord}
        expectedOutcomes={getExpectedOutcomes(state.plan)}
        nextActions={getNextActions(state.plan)}
        workspaceMetrics={state.dashboardData!.metrics}
        bookingSummary={bookingSummary}
        recentLeads={state.dashboardData!.recentLeads}
        recentAppointments={state.dashboardData!.recentAppointments}
        recentDeals={state.dashboardData!.recentDeals}
        creativePerformanceSummary={creativePerformanceSummary}
        autonomySnapshot={autonomySnapshot}
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
    </div>
  );
}
