import "server-only";
import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getPartnerDashboardSummary(partnerId: string) {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const [
    accountsResult,
    billingResult,
    commissionsResult,
    invitesResult,
    campaignsResult,
  ] = await Promise.all([
    admin.from("partner_accounts").select("id,account_id,created_at", { count: "exact" }).eq("partner_id", partnerId),
    admin.from("billing_subscriptions").select("organization_id,status,plan_tier,metadata").eq("partner_id", partnerId),
    admin.from("partner_commission_events").select("status,commission_amount,currency").eq("partner_id", partnerId),
    admin.from("partner_invites").select("id,status,use_count,max_uses,created_at").eq("partner_id", partnerId),
    admin.from("campaign_plans").select("id,launch_status,created_at").eq("partner_id", partnerId).limit(500),
  ]);

  for (const result of [accountsResult, billingResult, commissionsResult, invitesResult, campaignsResult]) {
    if (result.error) {
      throw new ApiError(500, result.error.message, "partner_dashboard_query_failed");
    }
  }

  const billingRows = (billingResult.data ?? []) as Array<{ status?: string | null; plan_tier?: string | null }>;
  const commissionRows = (commissionsResult.data ?? []) as Array<{ status?: string | null; commission_amount?: number | null }>;
  const campaignRows = (campaignsResult.data ?? []) as Array<{ launch_status?: string | null }>;

  return {
    signups: accountsResult.count ?? accountsResult.data?.length ?? 0,
    activeTrials: billingRows.filter((row) => row.status === "trialing").length,
    paidCustomers: billingRows.filter((row) => row.status === "active" || row.status === "past_due").length,
    attributedMrrCents: billingRows.filter((row) => row.status === "active" || row.status === "past_due").length * 9700,
    churnedCustomers: billingRows.filter((row) => row.status === "canceled").length,
    commissionPendingCents: commissionRows
      .filter((row) => row.status === "pending")
      .reduce((sum, row) => sum + (row.commission_amount ?? 0), 0),
    commissionApprovedCents: commissionRows
      .filter((row) => row.status === "approved")
      .reduce((sum, row) => sum + (row.commission_amount ?? 0), 0),
    commissionPaidCents: commissionRows
      .filter((row) => row.status === "paid")
      .reduce((sum, row) => sum + (row.commission_amount ?? 0), 0),
    inviteLinks: invitesResult.data ?? [],
    campaignStatusSummary: {
      total: campaignRows.length,
      live: campaignRows.filter((row) => row.launch_status === "live").length,
      launchReady: campaignRows.filter((row) => row.launch_status === "launch_ready").length,
      blocked: campaignRows.filter((row) => row.launch_status === "blocked").length,
    },
  };
}

export async function listPlatformPartners() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await admin
    .from("partners")
    .select("id,slug,brand_name,status,support_email,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new ApiError(500, error.message, "partners_list_failed");
  }

  return data ?? [];
}
