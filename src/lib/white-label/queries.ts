import "server-only";
import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePartnerPricingConfig } from "@/lib/white-label/partner-billing-config";

function cents(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? Math.round(numberValue) : 0;
}

function timestamp(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function safeArray<T = Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function getPartnerDashboardSummary(partnerId: string) {
  const admin = createAdminClient();
  if (!admin) {
    return {
      signups: 0,
      activeTrials: 0,
      paidCustomers: 0,
      attributedMrrCents: 0,
      churnedCustomers: 0,
      commissionPendingCents: 0,
      commissionApprovedCents: 0,
      commissionPaidCents: 0,
      inviteLinks: [],
      campaignStatusSummary: { total: 0, live: 0, launchReady: 0, blocked: 0 },
      warnings: ["Partner dashboard service client is unavailable."],
    };
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

  const warningSources = [
    { label: "accounts", result: accountsResult },
    { label: "billing", result: billingResult },
    { label: "commissions", result: commissionsResult },
    { label: "invites", result: invitesResult },
    { label: "campaigns", result: campaignsResult },
  ];
  const warnings = warningSources
    .filter(({ result }) => result.error)
    .map(({ label, result }) => `${label} unavailable: ${result.error?.message ?? "query failed"}`);

  const billingRows = (billingResult.error ? [] : billingResult.data ?? []) as Array<{ status?: string | null; plan_tier?: string | null }>;
  const commissionRows = (commissionsResult.error ? [] : commissionsResult.data ?? []) as Array<{ status?: string | null; commission_amount?: number | null }>;
  const campaignRows = (campaignsResult.error ? [] : campaignsResult.data ?? []) as Array<{ launch_status?: string | null }>;

  return {
    signups: accountsResult.error ? 0 : accountsResult.count ?? accountsResult.data?.length ?? 0,
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
    inviteLinks: invitesResult.error ? [] : invitesResult.data ?? [],
    campaignStatusSummary: {
      total: campaignRows.length,
      live: campaignRows.filter((row) => row.launch_status === "live").length,
      launchReady: campaignRows.filter((row) => row.launch_status === "launch_ready").length,
      blocked: campaignRows.filter((row) => row.launch_status === "blocked").length,
    },
    warnings,
  };
}

export async function getPlatformPartnerDetail(partnerId: string) {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const [
    partnerResult,
    brandingResult,
    domainsResult,
    accountsResult,
    billingResult,
    attributionResult,
    commissionsResult,
    leadsResult,
    leadBillingResult,
    auditResult,
  ] = await Promise.all([
    admin
      .from("partners")
      .select("id,slug,brand_name,legal_name,logo_url,favicon_url,primary_color,secondary_color,accent_color,support_email,support_phone,commission_rate,status,created_at,updated_at")
      .eq("id", partnerId)
      .maybeSingle(),
    admin
      .from("partner_branding")
      .select("theme_json,copy_json,pricing_json,feature_flags_json,updated_at")
      .eq("partner_id", partnerId)
      .maybeSingle(),
    admin
      .from("partner_domains")
      .select("id,domain,type,verification_status,ssl_status,dns_target,last_checked_at,created_at,updated_at")
      .eq("partner_id", partnerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("partner_accounts")
      .select("id,account_id,user_id,attribution_source,attribution_detail,locked,created_at,updated_at")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("billing_subscriptions")
      .select("id,organization_id,user_id,status,plan_tier,stripe_customer_id,stripe_subscription_id,partner_product_name,partner_plan_label,partner_price_ids,commission_rate_snapshot,current_period_start,current_period_end,cancel_at_period_end,created_at,updated_at")
      .eq("partner_id", partnerId)
      .order("updated_at", { ascending: false })
      .limit(500),
    admin
      .from("partner_billing_attribution")
      .select("id,account_id,stripe_customer_id,stripe_subscription_id,stripe_invoice_id,pricing_plan_key,attribution_source,metadata_json,created_at,updated_at")
      .eq("partner_id", partnerId)
      .order("updated_at", { ascending: false })
      .limit(100),
    admin
      .from("partner_commission_events")
      .select("id,account_id,stripe_customer_id,stripe_subscription_id,stripe_invoice_id,event_type,gross_amount,net_amount,commission_rate,commission_amount,currency,status,notes,metadata_json,created_at,updated_at")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("leads")
      .select("id,campaign_id,email,phone,status,created_at")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("lead_billing_events")
      .select("id,campaign_id,lead_id,status,amount_cents,skip_reason,created_at,reported_at")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("partner_audit_logs")
      .select("id,actor_user_id,actor_role,action,target_type,target_id,metadata_json,created_at")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const results = [
    partnerResult,
    brandingResult,
    domainsResult,
    accountsResult,
    billingResult,
    attributionResult,
    commissionsResult,
    leadsResult,
    leadBillingResult,
    auditResult,
  ];
  for (const result of results) {
    if (result.error) {
      throw new ApiError(500, result.error.message, "partner_detail_query_failed");
    }
  }

  if (!partnerResult.data) {
    throw new ApiError(404, "Partner not found.", "partner_not_found");
  }

  const partner = partnerResult.data as Record<string, unknown>;
  const branding = (brandingResult.data ?? null) as Record<string, unknown> | null;
  const accounts = safeArray(accountsResult.data);
  const billingRows = safeArray(billingResult.data);
  const commissionRows = safeArray(commissionsResult.data);
  const leadRows = safeArray(leadsResult.data);
  const leadBillingRows = safeArray(leadBillingResult.data);

  const activeStatuses = new Set(["active", "trialing", "past_due"]);
  const activeSubscriptions = billingRows.filter((row) => activeStatuses.has(String(row.status ?? "")));
  const failedSubscriptions = billingRows.filter((row) => ["past_due", "unpaid", "incomplete"].includes(String(row.status ?? "")));
  const baseMrrCents = activeSubscriptions.reduce((sum, row) => {
    const tier = String(row.plan_tier ?? "");
    if (tier === "pro") return sum + 29700;
    if (tier === "starter") return sum + 14700;
    if (tier === "performance") return sum + 9700;
    return sum;
  }, 0);
  const leadRevenueCents = leadBillingRows
    .filter((row) => row.status === "reported")
    .reduce((sum, row) => sum + cents(row.amount_cents), 0);
  const grossRevenueCents = commissionRows
    .filter((row) => ["pending", "approved", "paid"].includes(String(row.status ?? "")))
    .reduce((sum, row) => sum + cents(row.gross_amount), 0);
  const commissionPendingCents = commissionRows
    .filter((row) => row.status === "pending" || row.status === "approved")
    .reduce((sum, row) => sum + cents(row.commission_amount), 0);
  const commissionPaidCents = commissionRows
    .filter((row) => row.status === "paid")
    .reduce((sum, row) => sum + cents(row.commission_amount), 0);
  const lastPaid = commissionRows.find((row) => row.status === "paid") ?? null;

  const latestSignup = accounts
    .map((row) => timestamp(row.created_at))
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  return {
    partner,
    branding,
    pricing: parsePartnerPricingConfig(branding?.pricing_json),
    domains: domainsResult.data ?? [],
    accounts,
    billingRows,
    attributions: attributionResult.data ?? [],
    commissions: commissionRows,
    leads: leadRows,
    leadBillingEvents: leadBillingRows,
    auditLogs: auditResult.data ?? [],
    metrics: {
      totalSignups: accounts.length,
      activeCustomers: activeSubscriptions.length,
      trialingCustomers: billingRows.filter((row) => row.status === "trialing").length,
      canceledCustomers: billingRows.filter((row) => row.status === "canceled").length,
      pastDueCustomers: billingRows.filter((row) => row.status === "past_due").length,
      failedSubscriptions: failedSubscriptions.length,
      latestSignup,
      baseMrrCents,
      leadRevenueCents,
      grossRevenueCents,
      estimatedCommissionCents: commissionPendingCents,
      paidCommissionCents: commissionPaidCents,
      unpaidCommissionBalanceCents: commissionPendingCents,
      lastPayoutAmountCents: lastPaid ? cents(lastPaid.commission_amount) : 0,
      lastPayoutAt: lastPaid ? timestamp(lastPaid.updated_at) ?? timestamp(lastPaid.created_at) : null,
      leadCount: leadRows.length,
      billableLeadEvents: leadBillingRows.filter((row) => row.status === "reported").length,
      pendingLeadBillingEvents: leadBillingRows.filter((row) => row.status === "pending").length,
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
