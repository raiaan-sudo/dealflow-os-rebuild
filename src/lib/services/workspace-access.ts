import "server-only";
import { cookies } from "next/headers";
import { isInternalAdminEmail } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";
import type { AppContext } from "@/types/app";

type SupabaseLike = {
  from: (table: string) => any;
};

type WorkspaceRow = {
  id: string;
  name?: string | null;
  slug?: string | null;
  owner_user_id?: string | null;
  plan_tier?: string | null;
  partner_id?: string | null;
  created_at?: string | null;
};

export const ACTIVE_WORKSPACE_COOKIE = "dealflow_active_workspace_id";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function getActiveWorkspaceCookie() {
  try {
    const cookieStore = await cookies();
    return text(cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value);
  } catch {
    return null;
  }
}

async function userHasOrganizationMembership(supabase: SupabaseLike, userId: string, organizationId: string) {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("id,role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data as { id?: string | null; role?: string | null } | null;
}

async function userHasPartnerAccountAccess(supabase: SupabaseLike, userId: string, organizationId: string) {
  const { data: memberships, error: membershipError } = await supabase
    .from("partner_memberships")
    .select("partner_id,role,status")
    .eq("user_id", userId)
    .eq("status", "active");

  if (membershipError || !Array.isArray(memberships) || memberships.length === 0) {
    return null;
  }

  const partnerIds = memberships
    .map((row: { partner_id?: string | null }) => text(row.partner_id))
    .filter(Boolean);

  if (partnerIds.length === 0) {
    return null;
  }

  const { data: account, error: accountError } = await supabase
    .from("partner_accounts")
    .select("partner_id,account_id")
    .eq("account_id", organizationId)
    .in("partner_id", partnerIds)
    .maybeSingle();

  if (accountError || !account?.partner_id) {
    return null;
  }

  return {
    partnerId: String(account.partner_id),
    role: memberships.find((row: { partner_id?: string | null }) => row.partner_id === account.partner_id)?.role ?? "partner_viewer",
  };
}

export async function resolveWorkspaceAccessForUser(
  supabase: SupabaseLike,
  profile: { id: string; email?: string | null },
  organizationId: string,
): Promise<{ organization: WorkspaceRow; access: NonNullable<AppContext["activeWorkspaceAccess"]>; membership?: AppContext["membership"] | null } | null> {
  const requestedWorkspaceId = text(organizationId);
  if (!requestedWorkspaceId) {
    return null;
  }

  const { data: organizationRaw, error: organizationError } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", requestedWorkspaceId)
    .maybeSingle();

  if (organizationError || !organizationRaw?.id) {
    return null;
  }

  const organization = organizationRaw as WorkspaceRow;
  if (organization.owner_user_id === profile.id) {
    return { organization, access: "owner" };
  }

  const directMembership = await userHasOrganizationMembership(supabase, profile.id, organization.id);
  if (directMembership) {
    return {
      organization,
      access: "member",
      membership: {
        id: directMembership.id ?? `member-${organization.id}-${profile.id}`,
        organization_id: organization.id,
        user_id: profile.id,
        role: directMembership.role ?? "member",
      },
    };
  }

  if (isInternalAdminEmail(profile.email ?? null)) {
    return {
      organization,
      access: "platform_admin",
      membership: {
        id: `platform-admin-${organization.id}-${profile.id}`,
        organization_id: organization.id,
        user_id: profile.id,
        role: "platform_admin",
      },
    };
  }

  const partnerAccess = await userHasPartnerAccountAccess(supabase, profile.id, organization.id);
  if (partnerAccess) {
    return {
      organization,
      access: "partner",
      membership: {
        id: `partner-${partnerAccess.partnerId}-${organization.id}-${profile.id}`,
        organization_id: organization.id,
        user_id: profile.id,
        role: partnerAccess.role,
      },
    };
  }

  return null;
}

export async function resolveRequestedWorkspaceForUser(
  supabase: SupabaseLike,
  profile: { id: string; email?: string | null },
): Promise<{ organization: WorkspaceRow; access: NonNullable<AppContext["activeWorkspaceAccess"]>; membership?: AppContext["membership"] | null } | null> {
  const requestedWorkspaceId = await getActiveWorkspaceCookie();
  if (!requestedWorkspaceId) {
    return null;
  }
  return resolveWorkspaceAccessForUser(supabase, profile, requestedWorkspaceId);
}

export async function resolveCampaignWorkspaceForUser(
  supabase: SupabaseLike,
  profile: { id: string; email?: string | null },
  campaignId: string | null,
): Promise<{ organization: WorkspaceRow; access: NonNullable<AppContext["activeWorkspaceAccess"]>; membership?: AppContext["membership"] | null } | null> {
  const requestedCampaignId = text(campaignId);
  if (!requestedCampaignId) {
    return null;
  }

  const { data: campaignRaw, error: campaignError } = await supabase
    .from("campaign_plans")
    .select("id,organization_id")
    .eq("id", requestedCampaignId)
    .maybeSingle();

  if (campaignError || !campaignRaw?.organization_id) {
    return null;
  }

  return resolveWorkspaceAccessForUser(supabase, profile, String(campaignRaw.organization_id));
}

export type ManagedWorkspaceOption = {
  id: string;
  name: string;
  partnerId: string | null;
  partnerName: string | null;
  active: boolean;
};

async function listPartnerManagedWorkspaces(
  supabase: SupabaseLike,
  userId: string,
  currentOrganizationId: string,
): Promise<ManagedWorkspaceOption[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from("partner_memberships")
    .select("partner_id,status")
    .eq("user_id", userId)
    .eq("status", "active");

  if (membershipError || !Array.isArray(memberships) || memberships.length === 0) {
    return [];
  }

  const partnerIds = memberships
    .map((row: { partner_id?: string | null }) => text(row.partner_id))
    .filter(Boolean);

  if (partnerIds.length === 0) {
    return [];
  }

  const { data: accounts, error: accountError } = await supabase
    .from("partner_accounts")
    .select("account_id,partner_id")
    .in("partner_id", partnerIds)
    .limit(200);

  if (accountError || !Array.isArray(accounts) || accounts.length === 0) {
    return [];
  }

  const accountIds = Array.from(new Set(accounts.map((row: { account_id?: string | null }) => text(row.account_id)).filter(Boolean)));
  if (accountIds.length === 0) {
    return [];
  }

  const [{ data: organizations }, { data: partners }] = await Promise.all([
    supabase.from("organizations").select("id,name,partner_id").in("id", accountIds),
    supabase.from("partners").select("id,brand_name").in("id", partnerIds),
  ]);

  const partnerNameById = new Map(
    (Array.isArray(partners) ? partners : []).map((row: { id?: string | null; brand_name?: string | null }) => [
      String(row.id),
      text(row.brand_name),
    ]),
  );

  return (Array.isArray(organizations) ? organizations : [])
    .filter((row: { id?: string | null }) => Boolean(row.id))
    .map((row: { id: string; name?: string | null; partner_id?: string | null }) => ({
      id: row.id,
      name: text(row.name) ?? "Client workspace",
      partnerId: text(row.partner_id),
      partnerName: row.partner_id ? partnerNameById.get(String(row.partner_id)) ?? null : null,
      active: row.id === currentOrganizationId,
    }));
}

async function listAdminManagedWorkspaces(
  supabase: SupabaseLike,
  currentOrganizationId: string,
): Promise<ManagedWorkspaceOption[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id,name,partner_id")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !Array.isArray(data)) {
    return [];
  }

  return data
    .filter((row: { id?: string | null }) => Boolean(row.id))
    .map((row: { id: string; name?: string | null; partner_id?: string | null }) => ({
      id: row.id,
      name: text(row.name) ?? "Client workspace",
      partnerId: text(row.partner_id),
      partnerName: null,
      active: row.id === currentOrganizationId,
    }));
}

export async function listManagedWorkspacesForContext(
  supabase: SupabaseLike | null,
  context: AppContext | null,
): Promise<ManagedWorkspaceOption[]> {
  if (!supabase || !context?.organization?.id) {
    return [];
  }

  const email = context.user.email ?? context.profile?.email ?? null;
  const options = isInternalAdminEmail(email)
    ? await listAdminManagedWorkspaces(supabase, context.organization.id)
    : await listPartnerManagedWorkspaces(supabase, context.user.id, context.organization.id);

  const unique = new Map(options.map((option) => [option.id, option]));
  return Array.from(unique.values()).sort((a, b) => {
    if (a.active) return -1;
    if (b.active) return 1;
    return a.name.localeCompare(b.name);
  });
}
