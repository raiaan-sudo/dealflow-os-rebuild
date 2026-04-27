import { getAppContext } from "@/lib/services/app-context";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
type DealRow = Database["public"]["Tables"]["deals"]["Row"];
type InsightRow = Database["public"]["Tables"]["insights"]["Row"];
type RecommendationRow = Database["public"]["Tables"]["recommendations"]["Row"];
type SnapshotRow = Database["public"]["Tables"]["campaign_snapshots"]["Row"];

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
      "id, lead_id, scheduled_at, status, appointment_type, notes, created_at",
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
      "id, title, contact_name, deal_type, stage, status, estimated_value, closed_value, commission_revenue, source, closed_at, created_at",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(8);

  const snapshotsQuery = supabase
    .from("campaign_snapshots")
    .select("snapshot_date, spend, leads, booked_jobs, revenue")
    .eq("organization_id", organizationId)
    .order("snapshot_date", { ascending: true });

  if (scopedCampaignId) {
    snapshotsQuery.eq("campaign_id", scopedCampaignId);
  }

  const [
    leadsResult,
    appointmentsResult,
    dealsResult,
    snapshotsResult,
    insightsResult,
    recommendationsResult,
  ] = await Promise.all([
    leadsQuery,
    appointmentsQuery,
    scopedCampaignId ? Promise.resolve({ data: [], count: 0 } as const) : dealsQuery,
    snapshotsQuery,
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
  ]);

  const leadRows = (leadsResult.data ?? []) as LeadRow[];
  const appointmentRows = (appointmentsResult.data ?? []) as AppointmentRow[];
  const dealRows = (dealsResult.data ?? []) as DealRow[];
  const snapshotRows = (snapshotsResult.data ?? []) as SnapshotRow[];

  const totalSpend = snapshotRows.reduce((sum, row) => sum + row.spend, 0);
  const totalLeads = leadsResult.count ?? 0;
  const appointmentsBooked = (appointmentsResult.count ?? appointmentRows.length) || 0;
  const activeDeals = dealRows.filter((deal) => deal.status === "active").length;
  const closedDeals = dealRows.filter((deal) => deal.status === "closed_won").length;
  const pipelineValue = dealRows
    .filter((deal) => deal.status === "active")
    .reduce((sum, deal) => sum + deal.estimated_value, 0);
  const closedVolume = dealRows
    .filter((deal) => deal.status === "closed_won")
    .reduce((sum, deal) => sum + (deal.closed_value ?? 0), 0);
  const commissionRevenue = dealRows
    .filter((deal) => deal.status === "closed_won")
    .reduce((sum, deal) => sum + (deal.commission_revenue ?? 0), 0);
  const totalDeals = dealsResult.count ?? 0;

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
    chartSeries: snapshotRows.map((row) => ({
      label: row.snapshot_date,
      spend: row.spend,
      leads: row.leads,
      appointmentsBooked: row.booked_jobs,
      commissionRevenue: row.revenue,
      bookedJobs: row.booked_jobs,
      revenue: row.revenue,
    })),
    insights: (insightsResult.data ?? []) as InsightRow[],
    recommendations: (recommendationsResult.data ?? []) as RecommendationRow[],
  };
}
