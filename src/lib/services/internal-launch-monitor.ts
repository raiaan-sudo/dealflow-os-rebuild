import { ApiError } from "@/lib/api/route";
import { getPublicAppUrl, isInternalAdminEmail } from "@/lib/env";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { getAppContext } from "@/lib/services/app-context";
import { getCampaignPlanConsistencyStatus } from "@/lib/services/campaign-plan-persistence-service";

type RawCampaignPlanRow = {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  created_at: string | null;
  public_slug: string | null;
  launch_status: string | null;
  lead_loop_verified: boolean | null;
  plan: unknown;
};

type RawMarketingAccountRow = {
  organization_id: string | null;
  status: string | null;
  account_name: string | null;
  external_account_id: string | null;
  pixel_id: string | null;
  last_sync_at: string | null;
  connection_metadata: unknown;
};

type RawLeadRow = {
  id: string;
  campaign_id: string | null;
  organization_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  created_at: string;
};

type RawUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type RawOrganizationRow = {
  id: string;
  name: string | null;
};

type RawSystemJobRow = {
  id: string;
  organization_id: string | null;
  campaign_id: string | null;
  kind: string | null;
  status: string | null;
  error_message: string | null;
  last_error_code: string | null;
  dead_letter_reason: string | null;
  created_at: string | null;
  updated_at?: string | null;
  locked_until: string | null;
  dead_lettered_at: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  resolution_note?: string | null;
};

type RawStripeWebhookEventRow = {
  id: string;
  stripe_event_id: string;
  stripe_event_type: string | null;
  status: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  resolution_note?: string | null;
};

type RawProviderUsageEventRow = {
  id: string;
  organization_id: string | null;
  campaign_id: string | null;
  provider: string | null;
  operation: string | null;
  status: string | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type RawSupportTicketRow = {
  id: string;
  correlation_id: string | null;
  category: string | null;
  subject: string | null;
  message: string | null;
  route_path: string | null;
  status: string | null;
  created_at: string | null;
};

type RawSupportInboxRow = {
  id: string;
  created_at: string | null;
  ticket: RawSupportTicketRow | RawSupportTicketRow[] | null;
};

export type LaunchMonitorRow = {
  campaignId: string;
  userLabel: string;
  organizationLabel: string;
  createdAt: string | null;
  onboardingStatus: string;
  funnelStatus: string;
  creativeStatus: string;
  metaConnectionStatus: string;
  selectedAdAccount: string;
  selectedPage: string;
  selectedPixel: string;
  preflightStatus: string;
  launchStep: string;
  launchStatus: string;
  lastError: string;
  lastSyncTime: string;
  publicSlug: string;
  funnelUrl: string | null;
  leadCount: number;
  leadLoopVerified: boolean;
  consistencyMismatch: boolean;
  consistencyMismatchCount: number;
  consistencyMissingFields: string[];
  recentLeads: Array<{
    id: string;
    name: string;
    contact: string;
    status: string;
    createdAt: string;
  }>;
};

export type OperatorIssueRow = {
  id: string;
  source:
    | "system_job"
    | "stripe_webhook"
    | "provider_usage"
    | "campaign_plan"
    | "support_ticket";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  status: "open" | "monitoring" | "resolved";
  createdAt: string | null;
  route: string | null;
  rawReference: string;
};

export async function assertInternalOperatorAccess() {
  const context = await getAppContext();

  if (!context) {
    throw new ApiError(401, "Authentication is required.", "unauthorized");
  }

  const email = context.user.email ?? context.profile?.email ?? null;

  if (!isInternalAdminEmail(email)) {
    throw new ApiError(
      403,
      "This internal route is restricted to approved operator accounts.",
      "forbidden",
    );
  }

  return context;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asBoolean(value: unknown) {
  return value === true;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readPlanRoot(plan: unknown) {
  return asRecord(plan) ?? {};
}

function readCampaignPayload(plan: Record<string, unknown>) {
  return asRecord(plan.campaign_payload) ?? {};
}

function readLaunchRuntime(plan: Record<string, unknown>) {
  return asRecord(plan.launch_runtime) ?? {};
}

function readAssetDiscovery(metadata: Record<string, unknown>) {
  return asRecord(metadata.asset_discovery) ?? {};
}

function formatStatusLabel(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  return value.replace(/_/g, " ");
}

function deriveOnboardingStatus(plan: Record<string, unknown>) {
  if (asString(plan.onboarding_idempotency_key)) {
    return "completed";
  }

  return "created";
}

function deriveFunnelStatus(plan: Record<string, unknown>) {
  if (asRecord(plan.funnel)) {
    return "generated";
  }

  return "missing";
}

function deriveCreativeStatus(plan: Record<string, unknown>) {
  const selectedAdId = asString(plan.selected_ad_id) ?? asString(readCampaignPayload(plan).selected_ad_id);
  const payload = readCampaignPayload(plan);
  const selectedAdIds =
    asArray(plan.selected_ad_ids).length > 0
      ? asArray(plan.selected_ad_ids)
      : asArray(payload.selected_ad_ids);
  const staticAds = Array.isArray(plan.staticAds) ? plan.staticAds : [];

  if (selectedAdId || selectedAdIds.length > 0) {
    return "selected";
  }

  if (staticAds.length > 0) {
    return "generated";
  }

  return "missing";
}

function derivePreflightStatus(account: RawMarketingAccountRow | null, plan: Record<string, unknown>) {
  const metadata = asRecord(account?.connection_metadata) ?? {};
  const discovery = readAssetDiscovery(metadata);
  const launchRuntime = readLaunchRuntime(plan);

  if (launchRuntime.status === "completed") {
    return "passed before launch";
  }

  if (launchRuntime.status === "failed" && asString(launchRuntime.error)) {
    return "failed";
  }

  if (discovery.ready === true) {
    return "selection saved";
  }

  if (Array.isArray(discovery.errors) && discovery.errors.length > 0) {
    return "asset discovery incomplete";
  }

  return "not verified";
}

function deriveLastError(account: RawMarketingAccountRow | null, plan: Record<string, unknown>) {
  const launchRuntime = readLaunchRuntime(plan);
  const launchError = asString(launchRuntime.error);

  if (launchError) {
    return launchError;
  }

  const metadata = asRecord(account?.connection_metadata) ?? {};
  const discovery = readAssetDiscovery(metadata);
  const discoveryErrors = Array.isArray(discovery.errors)
    ? discovery.errors.map((item) => asString(item)).filter(Boolean)
    : [];

  if (discoveryErrors.length > 0) {
    return discoveryErrors.join(" | ");
  }

  return "None";
}

function formatLeadName(row: RawLeadRow) {
  const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return fullName || "Unnamed lead";
}

function formatLeadContact(row: RawLeadRow) {
  return row.email || row.phone || "No contact";
}

export async function loadLaunchMonitorRows(limit = 50): Promise<LaunchMonitorRow[]> {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(
      503,
      "Supabase service role is not configured for the internal operator monitor.",
      "service_role_missing",
    );
  }

  const { data: campaignRowsRaw, error: campaignError } = await admin
    .from("campaign_plans")
    .select("id,user_id,organization_id,created_at,public_slug,launch_status,lead_loop_verified,plan")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (campaignError) {
    throw new ApiError(500, campaignError.message, "launch_monitor_campaigns_failed");
  }

  const campaignRows = (campaignRowsRaw ?? []) as RawCampaignPlanRow[];
  const organizationIds = Array.from(
    new Set(campaignRows.map((row) => row.organization_id).filter((value): value is string => Boolean(value))),
  );
  const userIds = Array.from(
    new Set(campaignRows.map((row) => row.user_id).filter((value): value is string => Boolean(value))),
  );
  const campaignIds = campaignRows.map((row) => row.id);

  const [organizationsResult, usersResult, accountsResult, leadsResult] = await Promise.all([
    organizationIds.length > 0
      ? admin.from("organizations").select("id,name").in("id", organizationIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? admin.from("users").select("id,email,full_name").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    organizationIds.length > 0
      ? admin
          .from("marketing_accounts")
          .select("organization_id,status,account_name,external_account_id,pixel_id,last_sync_at,connection_metadata")
          .eq("platform", "meta_ads")
          .in("organization_id", organizationIds)
      : Promise.resolve({ data: [], error: null }),
    campaignIds.length > 0
      ? admin
          .from("leads")
          .select("id,campaign_id,organization_id,first_name,last_name,email,phone,status,created_at")
          .in("campaign_id", campaignIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (organizationsResult.error) {
    throw new ApiError(500, organizationsResult.error.message, "launch_monitor_orgs_failed");
  }

  if (usersResult.error) {
    throw new ApiError(500, usersResult.error.message, "launch_monitor_users_failed");
  }

  if (accountsResult.error) {
    throw new ApiError(500, accountsResult.error.message, "launch_monitor_accounts_failed");
  }

  if (leadsResult.error) {
    throw new ApiError(500, leadsResult.error.message, "launch_monitor_leads_failed");
  }

  const orgMap = new Map(
    ((organizationsResult.data ?? []) as RawOrganizationRow[]).map((row) => [row.id, row]),
  );
  const userMap = new Map(
    ((usersResult.data ?? []) as RawUserRow[]).map((row) => [row.id, row]),
  );
  const accountMap = new Map(
    ((accountsResult.data ?? []) as RawMarketingAccountRow[]).map((row) => [row.organization_id ?? "", row]),
  );
  const leadsByCampaign = new Map<string, RawLeadRow[]>();

  for (const lead of (leadsResult.data ?? []) as RawLeadRow[]) {
    const existing = leadsByCampaign.get(lead.campaign_id ?? "") ?? [];
    existing.push(lead);
    leadsByCampaign.set(lead.campaign_id ?? "", existing);
  }

  return campaignRows.map((row) => {
    const plan = readPlanRoot(row.plan);
    const payload = readCampaignPayload(plan);
    const launchRuntime = readLaunchRuntime(plan);
    const consistency = getCampaignPlanConsistencyStatus(row);
    const account = accountMap.get(row.organization_id ?? "") ?? null;
    const metadata = asRecord(account?.connection_metadata) ?? {};
    const user = row.user_id ? userMap.get(row.user_id) ?? null : null;
    const organization = row.organization_id ? orgMap.get(row.organization_id) ?? null : null;
    const leads = leadsByCampaign.get(row.id) ?? [];
    const selectedPageName = asString(metadata.selected_page_name) ?? "Not selected";
    const selectedPixelId =
      asString(metadata.pixel_id) ?? account?.pixel_id ?? "Not selected";
    const publicSlug = row.public_slug ?? "";

    return {
      campaignId: row.id,
      userLabel: user?.full_name || user?.email || row.user_id || "Unknown user",
      organizationLabel: organization?.name || row.organization_id || "Unknown workspace",
      createdAt: row.created_at,
      onboardingStatus: deriveOnboardingStatus(plan),
      funnelStatus: deriveFunnelStatus(plan),
      creativeStatus: deriveCreativeStatus(plan),
      metaConnectionStatus: formatStatusLabel(account?.status, "not connected"),
      selectedAdAccount: account?.account_name || account?.external_account_id || "Not selected",
      selectedPage: selectedPageName,
      selectedPixel: selectedPixelId,
      preflightStatus: derivePreflightStatus(account, plan),
      launchStep: formatStatusLabel(asString(launchRuntime.current_stage), "not started"),
      launchStatus: formatStatusLabel(asString(launchRuntime.status), "not launched"),
      lastError: deriveLastError(account, plan),
      lastSyncTime: account?.last_sync_at || "Never",
      publicSlug,
      funnelUrl: publicSlug ? `${getPublicAppUrl()}/f/${publicSlug}` : null,
      leadCount: leads.length,
      leadLoopVerified: asBoolean(plan.lead_loop_verified),
      consistencyMismatch: !consistency.rowMatchesPlan,
      consistencyMismatchCount: consistency.mismatchedFields.length,
      consistencyMissingFields: consistency.missingCriticalFields,
      recentLeads: leads.slice(0, 5).map((lead) => ({
        id: lead.id,
        name: formatLeadName(lead),
        contact: formatLeadContact(lead),
        status: lead.status ?? "new",
        createdAt: lead.created_at,
      })),
    } satisfies LaunchMonitorRow;
  });
}

function issueSeverityFromJob(row: RawSystemJobRow): OperatorIssueRow["severity"] {
  if (row.dead_lettered_at) {
    return "critical";
  }

  if (row.status === "failed") {
    return "high";
  }

  if (row.status === "processing" && row.locked_until) {
    const lockedUntil = new Date(row.locked_until);
    if (!Number.isNaN(lockedUntil.getTime()) && lockedUntil.getTime() < Date.now()) {
      return "high";
    }
  }

  return "medium";
}

function issueSeverityFromStripe(row: RawStripeWebhookEventRow): OperatorIssueRow["severity"] {
  if (row.error_code === "signature_verification_failed") {
    return "critical";
  }

  return row.status === "failed" ? "high" : "medium";
}

export async function loadIssueLogRows(
  limit = 80,
  preloadedCampaigns?: LaunchMonitorRow[],
): Promise<OperatorIssueRow[]> {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(
      503,
      "Supabase service role is not configured for the internal issue log.",
      "service_role_missing",
    );
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const [jobsResult, stripeResult, providerResult, supportResult, campaigns] = await Promise.all([
    admin
      .from("system_jobs")
      .select("id,organization_id,campaign_id,kind,status,error_message,last_error_code,dead_letter_reason,created_at,locked_until,dead_lettered_at,reviewed_at,reviewed_by,resolution_note")
      .or("status.eq.failed,status.eq.processing,dead_lettered_at.not.is.null")
      .is("reviewed_at", null)
      .order("created_at", { ascending: false })
      .limit(limit * 2),
    admin
      .from("stripe_webhook_events")
      .select("id,stripe_event_id,stripe_event_type,status,error_code,error_message,created_at,updated_at,reviewed_at,reviewed_by,resolution_note")
      .eq("status", "failed")
      .is("reviewed_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit),
    admin
      .from("provider_usage_events")
      .select("id,organization_id,campaign_id,provider,operation,status,metadata,created_at,updated_at")
      .in("status", ["failed", "reserved"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit),
    (admin as any)
      .from("support_operator_inbox")
      .select("id,created_at,ticket:support_tickets!inner(id,correlation_id,category,subject,message,route_path,status,created_at)")
      .in("status", ["unread", "acknowledged"])
      .in("ticket.status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(limit),
    preloadedCampaigns
      ? Promise.resolve(preloadedCampaigns)
      : loadLaunchMonitorRows(Math.min(limit, 50)).catch(() => []),
  ]);

  if (jobsResult.error) {
    throw new ApiError(500, jobsResult.error.message, "issue_log_jobs_failed");
  }

  if (stripeResult.error) {
    throw new ApiError(500, stripeResult.error.message, "issue_log_stripe_failed");
  }

  if (providerResult.error) {
    throw new ApiError(500, providerResult.error.message, "issue_log_provider_failed");
  }

  if (supportResult.error) {
    throw new ApiError(500, supportResult.error.message, "issue_log_support_failed");
  }

  const jobIssues = ((jobsResult.data ?? []) as RawSystemJobRow[])
    .filter((row) => {
      if (row.status === "failed" || row.dead_lettered_at) {
        return true;
      }

      if (row.status !== "processing" || !row.locked_until) {
        return false;
      }

      const lockedUntil = new Date(row.locked_until);
      return !Number.isNaN(lockedUntil.getTime()) && lockedUntil.getTime() < Date.now();
    })
    .map((row) => ({
      id: `job:${row.id}`,
      source: "system_job" as const,
      severity: issueSeverityFromJob(row),
      title: `${formatStatusLabel(row.kind, "unknown job")} ${formatStatusLabel(row.status, "unknown status")}`,
      detail:
        row.dead_letter_reason ||
        row.error_message ||
        row.last_error_code ||
        (row.status === "processing"
          ? `Job lock expired at ${row.locked_until}; worker recovery or manual review is required.`
          : "Job is in a failed or dead-lettered state without a detailed error message."),
      status: row.dead_lettered_at || row.status === "processing" ? ("open" as const) : ("monitoring" as const),
      createdAt: row.created_at,
      route: row.campaign_id ? `/admin/launch-monitor?campaignId=${encodeURIComponent(row.campaign_id)}` : "/admin/launch-monitor",
      rawReference: row.id,
    }));

  const stripeIssues = ((stripeResult.data ?? []) as RawStripeWebhookEventRow[]).map((row) => ({
    id: `stripe:${row.stripe_event_id}`,
    source: "stripe_webhook" as const,
    severity: issueSeverityFromStripe(row),
    title: `${formatStatusLabel(row.stripe_event_type, "Stripe event")} failed`,
    detail: row.error_message || row.error_code || "Stripe webhook event failed without a detailed error message.",
    status: "open" as const,
    createdAt: row.updated_at || row.created_at,
    route: "/admin/command-center",
    rawReference: row.stripe_event_id,
  }));

  const providerIssues = ((providerResult.data ?? []) as RawProviderUsageEventRow[])
    .filter((row) => {
      if (row.status === "failed") {
        return true;
      }

      if (row.status !== "reserved" || !row.created_at) {
        return false;
      }

      const createdAt = new Date(row.created_at);
      return !Number.isNaN(createdAt.getTime()) && Date.now() - createdAt.getTime() > 30 * 60 * 1000;
    })
    .map((row) => ({
      id: `provider:${row.id}`,
      source: "provider_usage" as const,
      severity: row.status === "failed" ? ("high" as const) : ("medium" as const),
      title: `${formatStatusLabel(row.provider, "Provider")} ${formatStatusLabel(row.operation, "operation")} ${formatStatusLabel(row.status, "issue")}`,
      detail:
        row.status === "reserved"
          ? "Provider usage reservation has been open for more than 30 minutes and needs release, retry, or review."
          : "Provider usage event failed and may require operator review before retry.",
      status: "open" as const,
      createdAt: row.updated_at || row.created_at,
      route: row.campaign_id ? `/admin/launch-monitor?campaignId=${encodeURIComponent(row.campaign_id)}` : "/admin/issues",
      rawReference: row.id,
    }));

  const campaignIssues = campaigns
    .filter((row) => row.consistencyMismatch || row.consistencyMissingFields.length > 0)
    .map((row) => ({
      id: `campaign:${row.campaignId}`,
      source: "campaign_plan" as const,
      severity: row.consistencyMismatch ? ("high" as const) : ("medium" as const),
      title: `Campaign plan consistency alert`,
      detail: row.consistencyMismatch
        ? `${row.consistencyMismatchCount} row/plan fields are out of sync.`
        : `Missing critical fields: ${row.consistencyMissingFields.join(", ")}`,
      status: "monitoring" as const,
      createdAt: row.createdAt,
      route: `/admin/launch-monitor?campaignId=${encodeURIComponent(row.campaignId)}`,
      rawReference: row.campaignId,
    }));

  const supportIssues = ((supportResult.data ?? []) as RawSupportInboxRow[]).flatMap((inbox) => {
    const row = Array.isArray(inbox.ticket) ? inbox.ticket[0] : inbox.ticket;
    if (!row || !["open", "in_progress"].includes(row.status ?? "")) {
      return [];
    }

    return [{
    id: `support:${row.id}`,
    source: "support_ticket" as const,
    severity: row.category === "product_blocker" ? ("high" as const) : ("medium" as const),
    title: row.subject || "Product support ticket",
    detail: row.message || "Support ticket was recorded without message text.",
    status: row.status === "in_progress" ? ("monitoring" as const) : ("open" as const),
    createdAt: inbox.created_at || row.created_at,
    route:
      row.route_path && row.route_path.startsWith("/") && !row.route_path.startsWith("//")
        ? row.route_path
        : "/admin/issues",
    rawReference: row.correlation_id || row.id,
    }];
  });

  return [...jobIssues, ...stripeIssues, ...providerIssues, ...campaignIssues, ...supportIssues]
    .sort((first, second) => {
      const firstTime = first.createdAt ? new Date(first.createdAt).getTime() : 0;
      const secondTime = second.createdAt ? new Date(second.createdAt).getTime() : 0;
      return secondTime - firstTime;
    })
    .slice(0, limit);
}
