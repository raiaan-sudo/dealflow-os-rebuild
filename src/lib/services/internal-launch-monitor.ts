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
  updated_at: string | null;
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
  const staticAds = Array.isArray(plan.staticAds) ? plan.staticAds : [];

  if (selectedAdId) {
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
    .select("id,user_id,organization_id,created_at,updated_at,public_slug,launch_status,lead_loop_verified,plan")
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
