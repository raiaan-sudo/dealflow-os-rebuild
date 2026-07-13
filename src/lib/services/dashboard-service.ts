import { ApiError } from "@/lib/api/route";
import { getAppContext } from "@/lib/services/app-context";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
type DealRow = Database["public"]["Tables"]["deals"]["Row"];
type InsightRow = Database["public"]["Tables"]["insights"]["Row"];
type RecommendationRow = Database["public"]["Tables"]["recommendations"]["Row"];
type SnapshotRow = Database["public"]["Tables"]["campaign_snapshots"]["Row"];

type CampaignDeliverySnapshotRow = {
  synced_at: string;
  delivery_metrics: Record<string, unknown> | null;
};

export type DashboardMetrics = {
  totalSpend: number;
  totalLeads: number;
  appointmentsBooked: number;
  activeDeals: number;
  closedDeals: number;
  pipelineValue: number;
  closedVolume: number;
  commissionRevenue: number;
  costPerLead: number;
  costPerAppointment: number;
  costPerClosedDeal: number;
  leadToAppointmentRate: number;
  appointmentToDealRate: number;
  dealCloseRate: number;
  bookedJobs: number;
  revenue: number;
  costPerBookedJob: number;
};

export type DashboardData = {
  context: NonNullable<Awaited<ReturnType<typeof getAppContext>>>;
  campaignId: string | null;
  metrics: DashboardMetrics;
  recentLeads: LeadRow[];
  recentAppointments: AppointmentRow[];
  recentDeals: DealRow[];
  recentJobs: Array<{
    id: string;
    title: string;
    customer_name: string;
    status: string;
    revenue: number;
    scheduled_for: string | null;
    created_at: string;
  }>;
  chartSeries: Array<{
    label: string;
    spend: number;
    leads: number;
    appointmentsBooked: number;
    commissionRevenue: number;
    bookedJobs: number;
    revenue: number;
  }>;
  insights: InsightRow[];
  recommendations: RecommendationRow[];
};

function safeDivide(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function finiteMetric(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export async function getDashboardData(
  campaignId: string | null = null,
): Promise<DashboardData | null> {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);

  if (!context || !supabase) {
    return null;
  }

  const organizationId = context.organization.id;
  const scopedCampaignId = campaignId ?? null;

  const leadsQuery = supabase
    .from("leads")
    .select(
      "id, first_name, last_name, email, phone, campaign_id, status, source, estimated_value, created_at",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (scopedCampaignId) {
    leadsQuery.eq("campaign_id", scopedCampaignId);
  }

  const appointmentsQuery = supabase
    .from("appointments")
    .select(
      "id, lead_id, campaign_id, scheduled_at, status, appointment_type, notes, created_at",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .order("scheduled_at", { ascending: false })
    .limit(5);

  if (scopedCampaignId) {
    appointmentsQuery.eq("campaign_id", scopedCampaignId);
  }

  const dealsQuery = supabase
    .from("deals")
    .select(
      "id, campaign_id, title, contact_name, deal_type, stage, status, estimated_value, closed_value, commission_revenue, source, closed_at, created_at",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (scopedCampaignId) {
    dealsQuery.eq("campaign_id", scopedCampaignId);
  }

  const snapshotsQuery = supabase
    .from("campaign_snapshots")
    .select("snapshot_date, spend, leads, booked_jobs, revenue")
    .eq("organization_id", organizationId)
    .order("snapshot_date", { ascending: true });

  const campaignDeliverySnapshotsQuery = scopedCampaignId
    ? supabase
        .from("campaign_sync_snapshots")
        .select("synced_at,delivery_metrics")
        .eq("organization_id", organizationId)
        .eq("campaign_id", scopedCampaignId)
        .eq("delivery_metrics_confirmed", true)
        .order("synced_at", { ascending: true })
        .limit(90)
    : null;

  const [
    leadsResult,
    appointmentsResult,
    dealsResult,
    snapshotsResult,
    insightsResult,
    recommendationsResult,
    aggregatesResult,
  ] = await Promise.all([
    leadsQuery,
    appointmentsQuery,
    dealsQuery,
    campaignDeliverySnapshotsQuery ?? snapshotsQuery,
    supabase
      .from("insights")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .from("recommendations")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(4),
    (supabase as any).rpc("get_campaign_dashboard_aggregates_v1", {
      p_organization_id: organizationId,
      p_campaign_id: scopedCampaignId,
    }),
  ]);

  const failedQuery = [
    [leadsResult.error, "dashboard_leads_lookup_failed"],
    [appointmentsResult.error, "dashboard_appointments_lookup_failed"],
    [dealsResult.error, "dashboard_deals_lookup_failed"],
    [snapshotsResult.error, "dashboard_reporting_lookup_failed"],
    [insightsResult.error, "dashboard_insights_lookup_failed"],
    [recommendationsResult.error, "dashboard_recommendations_lookup_failed"],
    [aggregatesResult.error, "dashboard_aggregates_lookup_failed"],
  ].find(([error]) => Boolean(error));
  if (failedQuery) {
    const [error, code] = failedQuery as [{ message?: string }, string];
    throw new ApiError(
      500,
      error?.message ?? "Dashboard data could not be loaded.",
      code,
    );
  }

  const leadRows = (leadsResult.data ?? []) as LeadRow[];
  const appointmentRows = (appointmentsResult.data ?? []) as AppointmentRow[];
  const dealRows = (dealsResult.data ?? []) as DealRow[];
  const legacySnapshotRows = scopedCampaignId
    ? []
    : ((snapshotsResult.data ?? []) as SnapshotRow[]);
  const campaignDeliverySnapshotRows = scopedCampaignId
    ? ((snapshotsResult.data ?? []) as CampaignDeliverySnapshotRow[])
    : [];
  const aggregateRow = (Array.isArray(aggregatesResult.data)
    ? aggregatesResult.data[0]
    : aggregatesResult.data) as Record<string, unknown> | null;
  if (!aggregateRow || typeof aggregateRow !== "object") {
    throw new ApiError(
      500,
      "Dashboard aggregates were not returned.",
      "dashboard_aggregates_missing",
    );
  }

  const latestCampaignDeliveryMetrics =
    campaignDeliverySnapshotRows.at(-1)?.delivery_metrics ?? null;
  const totalSpend = scopedCampaignId
    ? finiteMetric(latestCampaignDeliveryMetrics?.spend)
    : legacySnapshotRows.reduce((sum, row) => sum + finiteMetric(row.spend), 0);
  const totalLeads = leadsResult.count ?? 0;
  const appointmentsBooked = finiteMetric(aggregateRow.appointments_booked);
  const activeDeals = finiteMetric(aggregateRow.active_deals);
  const closedDeals = finiteMetric(aggregateRow.closed_deals);
  const pipelineValue = finiteMetric(aggregateRow.pipeline_value);
  const closedVolume = finiteMetric(aggregateRow.closed_volume);
  const commissionRevenue = finiteMetric(aggregateRow.commission_revenue);
  const totalDeals = finiteMetric(aggregateRow.total_deals);

  return {
    context,
    campaignId: scopedCampaignId,
    metrics: {
      totalSpend,
      totalLeads,
      appointmentsBooked,
      activeDeals,
      closedDeals,
      pipelineValue,
      closedVolume,
      commissionRevenue,
      costPerLead: safeDivide(totalSpend, totalLeads),
      costPerAppointment: safeDivide(totalSpend, appointmentsBooked),
      costPerClosedDeal: safeDivide(totalSpend, closedDeals),
      leadToAppointmentRate: safeDivide(appointmentsBooked, totalLeads),
      appointmentToDealRate: safeDivide(totalDeals, appointmentsBooked),
      dealCloseRate: safeDivide(closedDeals, totalDeals),
      bookedJobs: appointmentsBooked,
      revenue: commissionRevenue,
      costPerBookedJob: safeDivide(totalSpend, appointmentsBooked),
    },
    recentLeads: leadRows,
    recentAppointments: appointmentRows,
    recentDeals: dealRows,
    recentJobs: dealRows.map((deal) => ({
      id: deal.id,
      title: deal.title,
      customer_name: deal.contact_name,
      status: deal.status,
      revenue: deal.commission_revenue ?? 0,
      scheduled_for: deal.closed_at,
      created_at: deal.created_at,
    })),
    chartSeries: scopedCampaignId
      ? campaignDeliverySnapshotRows.map((row) => ({
          label: row.synced_at,
          spend: finiteMetric(row.delivery_metrics?.spend),
          leads: finiteMetric(row.delivery_metrics?.leads),
          appointmentsBooked: finiteMetric(row.delivery_metrics?.appointments),
          commissionRevenue: 0,
          bookedJobs: finiteMetric(row.delivery_metrics?.appointments),
          revenue: 0,
        }))
      : legacySnapshotRows.map((row) => ({
          label: row.snapshot_date,
          spend: finiteMetric(row.spend),
          leads: finiteMetric(row.leads),
          appointmentsBooked: finiteMetric(row.booked_jobs),
          commissionRevenue: finiteMetric(row.revenue),
          bookedJobs: finiteMetric(row.booked_jobs),
          revenue: finiteMetric(row.revenue),
        })),
    insights: (insightsResult.data ?? []) as InsightRow[],
    recommendations: (recommendationsResult.data ?? []) as RecommendationRow[],
  };
}
