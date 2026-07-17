import { subDays } from "date-fns";
import { cookies, headers } from "next/headers";
import { slugify } from "@/lib/utils";
import { logError, logWarn } from "@/lib/logging";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import type { AppContext } from "@/types/app";
import { isExplicitNonProductionDeployment } from "@/lib/deployment-target";
import {
  GHL_EMBED_CAPABILITY_COOKIE,
  verifyGhlEmbedCapability,
} from "@/lib/white-label/ghl-embed-capability";
import {
  PARTNER_ATTRIBUTION_COOKIE,
  resolveVerifiedPartnerAttribution,
  type VerifiedPartnerDomainContext,
} from "@/lib/white-label/verified-partner-domain";
import {
  buildDefaultAppointmentSeeds,
  buildDefaultCampaignSnapshots,
  buildDefaultDealSeeds,
  buildDefaultHealthScores,
  buildDefaultInsights,
  buildDefaultLeadSeeds,
  buildDefaultRecommendations,
  DEFAULT_MARKETING_ACCOUNTS,
  DEFAULT_MARKETS,
  DEFAULT_SERVICE_AREAS,
  DEFAULT_SERVICE_TYPES,
} from "@/lib/data/defaults";

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createRouteHandlerClient>>>;
type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export class AccountDeletionWorkspaceSuspendedError extends Error {
  readonly code = "account_deletion_workspace_suspended";

  constructor() {
    super("This workspace is suspended for verified account deletion.");
    this.name = "AccountDeletionWorkspaceSuspendedError";
  }
}

export class WorkspaceSelectionRequiredError extends Error {
  readonly code = "workspace_selection_required";

  constructor() {
    super("Select a workspace before continuing.");
    this.name = "WorkspaceSelectionRequiredError";
  }
}

export class WorkspaceSelectionDeniedError extends Error {
  readonly code = "workspace_selection_denied";

  constructor() {
    super("The selected workspace is not available to this user.");
    this.name = "WorkspaceSelectionDeniedError";
  }
}

export const ACTIVE_WORKSPACE_COOKIE = "dealflow_active_workspace";
const ACTIVE_WORKSPACE_HEADER = "x-dealflow-selected-workspace";
export const WORKSPACE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function assertAccountDeletionWorkspaceAccess(
  admin: SupabaseClient | null,
  userId: string,
) {
  if (!admin) {
    throw new Error("Account deletion access fence requires server-side authority.");
  }

  const [membershipResult, ownershipResult] = await Promise.all([
    (admin as any)
      .from("organization_memberships")
      .select("organization_id")
      .eq("user_id", userId),
    (admin as any)
      .from("organizations")
      .select("id")
      .eq("owner_user_id", userId),
  ]);
  if (membershipResult.error || ownershipResult.error) {
    throw new Error("Account deletion access fence could not resolve workspace authority.");
  }
  const organizationIds = new Set<string>();
  for (const candidate of membershipResult.data ?? []) {
    if (typeof candidate.organization_id === "string") {
      organizationIds.add(candidate.organization_id);
    }
  }
  for (const candidate of ownershipResult.data ?? []) {
    if (typeof candidate.id === "string") organizationIds.add(candidate.id);
  }
  if (organizationIds.size === 0) return;

  const suspensionResult = await (admin as any)
    .from("account_deletion_suspensions")
    .select("organization_id")
    .in("organization_id", [...organizationIds])
    .limit(1);
  if (suspensionResult.error) {
    throw new Error("Account deletion access fence is unavailable.");
  }
  if ((suspensionResult.data ?? []).length > 0) {
    throw new AccountDeletionWorkspaceSuspendedError();
  }
}

function isDuplicateKeyError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? error.code : null;
  const message = "message" in error ? error.message : null;

  return code === "23505" || /duplicate key value|unique constraint/i.test(String(message ?? ""));
}

function buildUserDisplayName(user: AppContext["user"]) {
  return (
    [user.user_metadata?.first_name, user.user_metadata?.last_name]
      .filter(Boolean)
      .join(" ") ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "New User"
  );
}

function buildWorkspaceName(profile: Pick<Row<"users">, "full_name" | "email">) {
  return `${profile.full_name ?? "DealFlow"} Group`;
}

function buildWorkspaceSlug(email: string | null) {
  return slugify(`${(email ?? "workspace").split("@")[0]}-group`);
}

function getBootstrapErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Unknown bootstrap error");
  }

  return "Unknown bootstrap error";
}

function isDemoWorkspaceSeedingEnabled() {
  if (process.env.ENABLE_DEMO_WORKSPACE_SEEDING === "true") {
    return true;
  }

  return process.env.NODE_ENV !== "production" && process.env.ENABLE_DEMO_WORKSPACE_SEEDING !== "false";
}

function readPartnerAttributionMetadataToken(user: AppContext["user"]) {
  const value = user.user_metadata?.partner_attribution_token;
  return typeof value === "string" && value.length <= 4_096 ? value : null;
}

async function resolveRequestPartnerAttribution(user: AppContext["user"]) {
  const metadataAttribution = await resolveVerifiedPartnerAttribution(
    readPartnerAttributionMetadataToken(user),
  );
  if (metadataAttribution) return metadataAttribution;

  try {
    const cookieStore = await cookies();
    return resolveVerifiedPartnerAttribution(
      cookieStore.get(PARTNER_ATTRIBUTION_COOKIE)?.value ?? null,
    );
  } catch {
    return null;
  }
}

async function resolveVerifiedEmbeddedWorkspace(params: {
  admin: SupabaseClient;
  user: AppContext["user"];
  profile: Row<"users">;
}) {
  const requestHeaders = await headers();
  const assertedOrganizationId = requestHeaders.get(
    "x-dealflow-ghl-embed-organization",
  );
  if (!assertedOrganizationId) return null;

  const partnerHost = requestHeaders.get("x-dealflow-verified-partner-domain");
  const cookieStore = await cookies();
  const capability = partnerHost
    ? await verifyGhlEmbedCapability(
        cookieStore.get(GHL_EMBED_CAPABILITY_COOKIE)?.value ?? null,
        {
          expectedHost: partnerHost,
          expectedDealflowUserId: params.user.id,
          requiredStage: "authenticated",
        },
      )
    : null;
  if (
    !capability ||
    capability.organizationId !== assertedOrganizationId ||
    params.user.email?.trim().toLowerCase() !== capability.ghlEmail ||
    params.profile.partner_id !== capability.partnerId
  ) {
    throw new Error("Verified GHL embed workspace context is invalid.");
  }

  const allowedEnvironments = isExplicitNonProductionDeployment()
    ? ["sandbox", "test"]
    : ["production"];
  const [organizationResult, membershipResult, tenantResult, mappingResult, ghlUserResult] =
    await Promise.all([
      (params.admin as any)
        .from("organizations")
        .select("*")
        .eq("id", capability.organizationId)
        .eq("partner_id", capability.partnerId)
        .limit(2),
      (params.admin as any)
        .from("organization_memberships")
        .select("*")
        .eq("organization_id", capability.organizationId)
        .eq("user_id", params.user.id)
        .limit(2),
      (params.admin as any)
        .from("ghl_workspace_tenants")
        .select("organization_id,partner_id,tenant_kind,status")
        .eq("organization_id", capability.organizationId)
        .eq("partner_id", capability.partnerId)
        .eq("tenant_kind", "partner_child")
        .eq("status", "active")
        .limit(2),
      (params.admin as any)
        .from("ghl_location_mappings")
        .select("id,organization_id,partner_id,installation_id,environment,provider_location_id,status")
        .eq("organization_id", capability.organizationId)
        .eq("partner_id", capability.partnerId)
        .eq("provider_location_id", capability.locationId)
        .eq("status", "active")
        .in("environment", allowedEnvironments)
        .limit(2),
      (params.admin as any)
        .from("workspace_ghl_users")
        .select("workspace_id,partner_id,ghl_location_id,ghl_user_id,email,invite_status")
        .eq("workspace_id", capability.organizationId)
        .eq("partner_id", capability.partnerId)
        .eq("ghl_location_id", capability.locationId)
        .eq("ghl_user_id", capability.ghlUserId)
        .ilike("email", capability.ghlEmail)
        .eq("invite_status", "active")
        .limit(2),
    ]);
  const exactOne = (result: { data?: unknown; error?: unknown }) =>
    !result.error && Array.isArray(result.data) && result.data.length === 1;
  if (
    !exactOne(organizationResult) ||
    !exactOne(membershipResult) ||
    !exactOne(tenantResult) ||
    !exactOne(mappingResult) ||
    !exactOne(ghlUserResult)
  ) {
    throw new Error("Verified GHL embed tenant binding is no longer active.");
  }

  const mapping = mappingResult.data[0] as Record<string, unknown>;
  const installationResult = await (params.admin as any)
    .from("ghl_installations")
    .select("id,environment,partner_id,provider_agency_id,status")
    .eq("id", mapping.installation_id)
    .eq("environment", mapping.environment)
    .eq("partner_id", capability.partnerId)
    .eq("provider_agency_id", capability.companyId)
    .eq("status", "active")
    .limit(2);
  if (!exactOne(installationResult)) {
    throw new Error("Verified GHL embed installation binding is no longer active.");
  }

  return {
    capability,
    organization: organizationResult.data[0] as Row<"organizations">,
    membership: membershipResult.data[0] as Row<"organization_memberships">,
  };
}

async function readExplicitSelectedWorkspaceId() {
  const requestHeaders = await headers();
  const headerSelection = requestHeaders.get(ACTIVE_WORKSPACE_HEADER)?.trim();
  if (headerSelection) return headerSelection;

  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value.trim() || null;
}

export async function resolveMembershipFirstWorkspace(
  supabase: SupabaseClient,
  profile: Row<"users">,
  selectedOrganizationId: string | null,
) {
  if (selectedOrganizationId) {
    if (!WORKSPACE_ID_PATTERN.test(selectedOrganizationId)) {
      throw new WorkspaceSelectionDeniedError();
    }

    const { data: selectedMembershipRaw, error: selectedMembershipError } = await supabase
      .from("organization_memberships")
      .select("*")
      .eq("organization_id", selectedOrganizationId)
      .eq("user_id", profile.id)
      .maybeSingle();

    if (selectedMembershipError) throw selectedMembershipError;
    if (!selectedMembershipRaw) throw new WorkspaceSelectionDeniedError();

    const { data: selectedOrganizationRaw, error: selectedOrganizationError } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", selectedOrganizationId)
      .maybeSingle();

    if (selectedOrganizationError) throw selectedOrganizationError;
    if (!selectedOrganizationRaw) throw new WorkspaceSelectionDeniedError();

    return {
      organization: selectedOrganizationRaw as Row<"organizations">,
      membership: selectedMembershipRaw as Row<"organization_memberships">,
    };
  }

  const { data: membershipRowsRaw, error: membershipRowsError } = await supabase
    .from("organization_memberships")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: true })
    .limit(2);

  if (membershipRowsError) throw membershipRowsError;
  const memberships = (membershipRowsRaw ?? []) as Row<"organization_memberships">[];
  if (memberships.length > 1) throw new WorkspaceSelectionRequiredError();
  if (memberships.length === 0) return null;

  const membership = memberships[0];
  const { data: organizationRaw, error: organizationError } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", membership.organization_id)
    .maybeSingle();

  if (organizationError) throw organizationError;
  if (!organizationRaw) {
    throw new Error("Active workspace membership references an unavailable organization.");
  }

  return {
    organization: organizationRaw as Row<"organizations">,
    membership,
  };
}

async function applyVerifiedPartnerAttribution(params: {
  admin: SupabaseClient;
  profile: Row<"users">;
  organization: Row<"organizations">;
  attribution: VerifiedPartnerDomainContext;
}) {
  const { admin, profile, organization, attribution } = params;
  const { data, error } = await (admin as any).rpc(
    "bind_verified_partner_attribution_v1",
    {
      p_user_id: profile.id,
      p_organization_id: organization.id,
      p_partner_id: attribution.partnerId,
      p_verified_domain: attribution.domain,
    },
  );
  if (error) throw error;
  const binding = (Array.isArray(data) ? data[0] : data) as {
    binding_status?: string;
    resolved_partner_id?: string | null;
    resolved_user_partner_id?: string | null;
    resolved_organization_partner_id?: string | null;
    attribution_active?: boolean;
  } | null;
  const accepted =
    (binding?.binding_status === "bound" ||
      binding?.binding_status === "already_bound") &&
    binding.resolved_partner_id === attribution.partnerId &&
    binding.resolved_user_partner_id === attribution.partnerId &&
    binding.resolved_organization_partner_id === attribution.partnerId &&
    binding.attribution_active === true;
  if (!accepted) {
    logWarn("Verified partner attribution preserved existing workspace authority", {
      userId: profile.id,
      organizationId: organization.id,
      bindingStatus: binding?.binding_status ?? "missing_receipt",
    });
    return null;
  }

  const [profileResult, organizationResult] = await Promise.all([
    admin.from("users").select("*").eq("id", profile.id).single(),
    admin.from("organizations").select("*").eq("id", organization.id).single(),
  ]);
  if (profileResult.error || organizationResult.error) {
    throw profileResult.error ?? organizationResult.error;
  }
  const refreshedProfile = profileResult.data as Row<"users">;
  const refreshedOrganization = organizationResult.data as Row<"organizations">;
  if (
    refreshedProfile.partner_id !== attribution.partnerId ||
    refreshedOrganization.partner_id !== attribution.partnerId
  ) {
    throw new Error("Verified partner attribution refresh did not match its atomic receipt.");
  }
  return {
    profile: refreshedProfile,
    organization: refreshedOrganization,
  };
}

export async function ensureUserProfile(supabase: SupabaseClient, user: AppContext["user"]) {
  const { data: existingProfileRaw } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  const existingProfile = existingProfileRaw as Row<"users"> | null;

  if (existingProfile) {
    return existingProfile;
  }

  const fullName = buildUserDisplayName(user);

  try {
    const { data: insertedProfileRaw, error } = await supabase
      .from("users")
      .insert({
        id: user.id,
        email: user.email ?? "unknown@example.com",
        full_name: fullName,
        avatar_url: user.user_metadata?.avatar_url ?? null,
      } as never)
      .select("*")
      .single();
    const insertedProfile = insertedProfileRaw as Row<"users"> | null;

    if (error) {
      throw error;
    }

    if (!insertedProfile) {
      throw new Error("User profile could not be created.");
    }

    return insertedProfile;
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const { data: recoveredProfileRaw, error: recoveredProfileError } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    const recoveredProfile = recoveredProfileRaw as Row<"users"> | null;

    if (recoveredProfileError) {
      throw recoveredProfileError;
    }

    if (!recoveredProfile) {
      const { data: upsertedProfileRaw, error: upsertedProfileError } = await supabase
        .from("users")
        .upsert({
          id: user.id,
          email: user.email ?? "unknown@example.com",
          full_name: fullName,
          avatar_url: user.user_metadata?.avatar_url ?? null,
        } as never, { onConflict: "id" })
        .select("*")
        .single();
      const upsertedProfile = upsertedProfileRaw as Row<"users"> | null;

      if (upsertedProfileError) {
        throw upsertedProfileError;
      }

      if (!upsertedProfile) {
        throw new Error("User profile could not be recovered.");
      }

      return upsertedProfile;
    }

    return recoveredProfile;
  }
}

export async function ensureWorkspace(
  supabase: SupabaseClient,
  profile: Row<"users">,
) {
  const organizationName = buildWorkspaceName(profile);
  const organizationSlug = buildWorkspaceSlug(profile.email);
  const fallbackOrganizationSlug = `${organizationSlug}-${profile.id.slice(0, 8)}`;

  const { data: existingOrganizationRaw, error: existingOrganizationError } = await supabase
    .from("organizations")
    .select("*")
    .eq("owner_user_id", profile.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingOrganizationError) {
    throw existingOrganizationError;
  }

  let organization = existingOrganizationRaw as Row<"organizations"> | null;

  if (!organization) {
    try {
      const { data: organizationRaw, error: organizationError } = await supabase
        .from("organizations")
        .insert({
          name: organizationName,
          slug: organizationSlug,
          owner_user_id: profile.id,
          plan_tier: "pro",
        } as never)
        .select("*")
        .single();

      if (organizationError) {
        throw organizationError;
      }

      organization = organizationRaw as Row<"organizations"> | null;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const { data: organizationRaw, error: fallbackOrganizationError } = await supabase
        .from("organizations")
        .insert({
          name: organizationName,
          slug: fallbackOrganizationSlug,
          owner_user_id: profile.id,
          plan_tier: "pro",
        } as never)
        .select("*")
        .single();

      if (fallbackOrganizationError) {
        throw fallbackOrganizationError;
      }

      organization = organizationRaw as Row<"organizations"> | null;
    }
  }

  if (!organization) {
    throw new Error("Organization could not be created.");
  }

  return organization;
}

export async function ensureMembership(
  supabase: SupabaseClient,
  profile: Row<"users">,
  organization: Row<"organizations">,
) {
  if (organization.owner_user_id !== profile.id) {
    throw new Error("Workspace bootstrap refused to create membership for a non-owned organization.");
  }

  const { data: directMembershipRaw, error: directMembershipError } = await supabase
    .from("organization_memberships")
    .select("*")
    .eq("organization_id", organization.id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (directMembershipError) {
    throw directMembershipError;
  }

  if (directMembershipRaw) {
    return directMembershipRaw as Row<"organization_memberships">;
  }

  const { data: existingMembershipRaw, error: existingMembershipError } = await supabase
    .from("organization_memberships")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingMembershipError) {
    throw existingMembershipError;
  }

  if (existingMembershipRaw) {
    const existingMembership = existingMembershipRaw as Row<"organization_memberships">;

    const { data: linkedOrganizationRaw } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", existingMembership.organization_id)
      .maybeSingle();

    if (!linkedOrganizationRaw) {
      logWarn("Bootstrap recovered missing workspace from stale membership", {
        userId: profile.id,
        missingOrganizationId: existingMembership.organization_id,
        recoveredOrganizationId: organization.id,
      });
    }
  }

  try {
    const { error: membershipUpsertError } = await supabase
      .from("organization_memberships")
      .upsert(
        {
          organization_id: organization.id,
          user_id: profile.id,
          role: "owner",
        } as never,
        { onConflict: "organization_id,user_id" },
      );

    if (membershipUpsertError && !isDuplicateKeyError(membershipUpsertError)) {
      throw membershipUpsertError;
    }
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  const { data: recoveredMembershipRaw, error: recoveredMembershipError } = await supabase
    .from("organization_memberships")
    .select("*")
    .eq("organization_id", organization.id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (recoveredMembershipError) {
    throw recoveredMembershipError;
  }

  if (!recoveredMembershipRaw) {
    logWarn("Membership bootstrap recovery required a second-pass owner check", {
      userId: profile.id,
      organizationId: organization.id,
    });

    const { data: ownerOrganizationRaw, error: ownerOrganizationError } = await supabase
      .from("organizations")
      .select("id, owner_user_id")
      .eq("id", organization.id)
      .eq("owner_user_id", profile.id)
      .maybeSingle();

    if (ownerOrganizationError) {
      throw ownerOrganizationError;
    }

    if (!ownerOrganizationRaw) {
      throw new Error("Organization membership could not be recovered.");
    }

    const { error: fallbackInsertError } = await supabase
      .from("organization_memberships")
      .insert({
        organization_id: organization.id,
        user_id: profile.id,
        role: "owner",
      } as never);

    if (fallbackInsertError && !isDuplicateKeyError(fallbackInsertError)) {
      throw fallbackInsertError;
    }

    const { data: finalMembershipRaw, error: finalMembershipError } = await supabase
      .from("organization_memberships")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("user_id", profile.id)
      .maybeSingle();

    if (finalMembershipError) {
      throw finalMembershipError;
    }

    if (!finalMembershipRaw) {
      logWarn("Falling back to synthesized owner membership during bootstrap", {
        userId: profile.id,
        organizationId: organization.id,
      });

      const now = new Date().toISOString();

      return {
        id: `owner-fallback-${organization.id}-${profile.id}`,
        organization_id: organization.id,
        user_id: profile.id,
        role: "owner",
        created_at: now,
        updated_at: now,
      } as Row<"organization_memberships">;
    }

    return finalMembershipRaw as Row<"organization_memberships">;
  }

  return recoveredMembershipRaw as Row<"organization_memberships">;
}

export async function ensureBusinessProfile(
  supabase: SupabaseClient,
  organization: Row<"organizations">,
  profile: Row<"users">,
) {
  const existingBusinessProfile = await readBusinessProfile(supabase, organization);

  if (existingBusinessProfile) {
    return existingBusinessProfile;
  }

  try {
    const { data: businessProfileRaw, error: businessProfileError } = await supabase
      .from("business_profiles")
      .insert({
        organization_id: organization.id,
        legal_name: buildWorkspaceName(profile),
        industry: "real_estate",
        primary_goal: "Increase booked jobs and revenue efficiency",
      } as never)
      .select("*")
      .single();

    if (businessProfileError) {
      throw businessProfileError;
    }

    if (businessProfileRaw) {
      return businessProfileRaw as Row<"business_profiles">;
    }
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  return readBusinessProfile(supabase, organization);
}

export async function readBusinessProfile(
  supabase: SupabaseClient,
  organization: Row<"organizations">,
) {
  const { data: existingBusinessProfileRaw, error: existingBusinessProfileError } =
    await supabase
      .from("business_profiles")
      .select("*")
      .eq("organization_id", organization.id)
      .maybeSingle();

  if (existingBusinessProfileError) {
    throw existingBusinessProfileError;
  }

  if (existingBusinessProfileRaw) {
    return existingBusinessProfileRaw as Row<"business_profiles">;
  }

  return null;
}

export function hasCanonicalOwnerWorkspaceAuthority(params: {
  profile: Row<"users">;
  organization: Row<"organizations">;
  membership: Row<"organization_memberships">;
}) {
  return (
    params.organization.owner_user_id === params.profile.id &&
    params.membership.organization_id === params.organization.id &&
    params.membership.user_id === params.profile.id &&
    params.membership.role?.trim().toLowerCase() === "owner"
  );
}

export function isWorkspaceBootstrapReadOnly(params: {
  isEmbeddedWorkspace: boolean;
  isMembershipWorkspace: boolean;
  profile: Row<"users">;
  organization: Row<"organizations">;
  membership: Row<"organization_memberships">;
}) {
  if (params.isEmbeddedWorkspace) return true;
  return (
    params.isMembershipWorkspace &&
    !hasCanonicalOwnerWorkspaceAuthority(params)
  );
}

export async function ensureAppContext() {
  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  try {
    const adminClient = createAdminClient() as SupabaseClient | null;
    await assertAccountDeletionWorkspaceAccess(adminClient, user.id);
    const bootstrapSupabase = adminClient ?? supabase;
    let profile = await ensureUserProfile(bootstrapSupabase, user);
    const embeddedWorkspace = adminClient
      ? await resolveVerifiedEmbeddedWorkspace({
          admin: adminClient,
          user,
          profile,
        })
      : null;
    const membershipWorkspace = embeddedWorkspace
      ? null
      : await resolveMembershipFirstWorkspace(
          bootstrapSupabase,
          profile,
          await readExplicitSelectedWorkspaceId(),
        );
    let organization = embeddedWorkspace?.organization ??
      membershipWorkspace?.organization ??
      await ensureWorkspace(bootstrapSupabase, profile);
    const partnerAttribution = embeddedWorkspace
      ? null
      : await resolveRequestPartnerAttribution(user);
    if (partnerAttribution) {
      if (!adminClient) {
        throw new Error("Verified partner attribution requires server-side workspace authority.");
      }
      const refreshed = await applyVerifiedPartnerAttribution({
        admin: adminClient,
        profile,
        organization,
        attribution: partnerAttribution,
      });
      if (refreshed) {
        profile = refreshed.profile;
        organization = refreshed.organization;
      }
    }
    const membership = embeddedWorkspace?.membership ??
      membershipWorkspace?.membership ??
      await ensureMembership(bootstrapSupabase, profile, organization);
    const workspaceBootstrapIsReadOnly = isWorkspaceBootstrapReadOnly({
      isEmbeddedWorkspace: Boolean(embeddedWorkspace),
      isMembershipWorkspace: Boolean(membershipWorkspace),
      profile,
      organization,
      membership,
    });
    const businessProfile = workspaceBootstrapIsReadOnly
      ? await readBusinessProfile(bootstrapSupabase, organization)
      : await ensureBusinessProfile(bootstrapSupabase, organization, profile);

    const context: AppContext = {
      user,
      profile,
      organization,
      membership,
      businessProfile,
    };

    if (!workspaceBootstrapIsReadOnly) {
      try {
        const { claimPendingAccessKeyForCurrentUser } = await import("@/lib/services/access-key-service");
        await claimPendingAccessKeyForCurrentUser(context);
      } catch (claimError) {
        logWarn("Access-key claim bootstrap skipped", {
          userId: user.id,
          organizationId: organization.id,
          message: claimError instanceof Error ? claimError.message : "Unknown access-key claim error",
        });
      }
    }

    // Capability-bound GHL workspaces are pre-provisioned. Never claim a
    // top-level checkout or create demo/default data in a member iframe.
    if (!workspaceBootstrapIsReadOnly) {
      try {
        await ensureOrganizationSeedData(bootstrapSupabase, context);
      } catch (seedError) {
        logWarn("Organization seed data bootstrap skipped", {
          userId: user.id,
          organizationId: organization.id,
          message: seedError instanceof Error ? seedError.message : "Unknown seed bootstrap error",
        });
      }
    }

    return context;
  } catch (error) {
    if (error instanceof AccountDeletionWorkspaceSuspendedError) {
      logWarn("Suspended account deletion workspace access denied", {
        userId: user.id,
        code: error.code,
      });
      throw error;
    }
    logError("App context bootstrap failed", {
      userId: user.id,
      email: user.email ?? null,
      message: getBootstrapErrorMessage(error),
    });
    throw error;
  }
}

async function ensureOrganizationSeedData(
  supabase: SupabaseClient,
  context: Pick<AppContext, "organization" | "user">,
) {
  if (!isDemoWorkspaceSeedingEnabled()) {
    return;
  }

  const organizationId = context.organization.id;

  const [
    serviceTypesResult,
    serviceAreasResult,
    marketingAccountsResult,
    marketsResult,
    leadsResult,
    appointmentsResult,
    dealsResult,
    insightsResult,
    recommendationsResult,
    healthScoresResult,
  ] = await Promise.all([
    supabase
      .from("service_types")
      .select("id, name")
      .eq("organization_id", organizationId),
    supabase.from("service_areas").select("id").eq("organization_id", organizationId),
    supabase
      .from("marketing_accounts")
      .select("id, name")
      .eq("organization_id", organizationId),
    supabase
      .from("markets")
      .select("id, name")
      .eq("organization_id", organizationId),
    supabase.from("leads").select("id").eq("organization_id", organizationId).limit(1),
    supabase
      .from("appointments")
      .select("id")
      .eq("organization_id", organizationId)
      .limit(1),
    supabase.from("deals").select("id").eq("organization_id", organizationId).limit(1),
    supabase.from("insights").select("id").eq("organization_id", organizationId).limit(1),
    supabase
      .from("recommendations")
      .select("id")
      .eq("organization_id", organizationId)
      .limit(1),
    supabase
      .from("health_scores")
      .select("id")
      .eq("organization_id", organizationId)
      .limit(1),
  ]);

  let serviceTypes = (serviceTypesResult.data ?? []) as Array<{
    id: string;
    name: string;
  }>;
  if (serviceTypes.length === 0) {
    const { data } = await supabase
      .from("service_types")
      .upsert(
        DEFAULT_SERVICE_TYPES.map((name) => ({
          organization_id: organizationId,
          name,
          category: "core",
          active: true,
        })) as never,
        { onConflict: "organization_id,name" },
      )
      .select("id, name");

    serviceTypes = (data ?? []) as Array<{ id: string; name: string }>;
  }

  if ((serviceAreasResult.data ?? []).length === 0) {
    await supabase.from("service_areas").insert(
      DEFAULT_SERVICE_AREAS.map((area) => ({
        organization_id: organizationId,
        city: area.city,
        region: area.region,
        postal_code: area.postalCode,
        country: area.country,
      })) as never,
    );
  }

  let marketingAccounts = (marketingAccountsResult.data ?? []) as Array<{
    id: string;
    name: string;
  }>;
  if (marketingAccounts.length === 0) {
    const { data } = await supabase
      .from("marketing_accounts")
      .upsert(
        DEFAULT_MARKETING_ACCOUNTS.map((account) => ({
          organization_id: organizationId,
          name: account.name,
          platform: account.platform,
          status: "connected",
        })) as never,
        { onConflict: "organization_id,platform" },
      )
      .select("id, name");

    marketingAccounts = (data ?? []) as Array<{ id: string; name: string }>;
  }

  let markets = (marketsResult.data ?? []) as Array<{ id: string; name: string }>;
  if (markets.length === 0) {
    const { data } = await supabase
      .from("markets")
      .insert(
        DEFAULT_MARKETS.map((market) => ({
          organization_id: organizationId,
          name: market.name,
          city: market.city,
          region: market.region,
          status: market.status,
          priority_level: market.priorityLevel,
        })) as never,
      )
      .select("id, name");

    markets = (data ?? []) as Array<{ id: string; name: string }>;
  }

  const googleAccount = marketingAccounts[0]?.id ?? null;
  const metaAccount = marketingAccounts[1]?.id ?? null;
  if (googleAccount && metaAccount) {
    const { count } = await supabase
      .from("campaign_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);

    if (!count) {
      await supabase.from("campaign_snapshots").upsert(
        buildDefaultCampaignSnapshots([googleAccount, metaAccount]).map((snapshot) => ({
          organization_id: organizationId,
          ...snapshot,
        })) as never,
        { onConflict: "marketing_account_id,snapshot_date" },
      );
    }
  }

  if ((leadsResult.data ?? []).length === 0 && serviceTypes.length > 0) {
    const serviceTypeIdMap = new Map(
      serviceTypes.map((serviceType) => [serviceType.name, serviceType.id]),
    );
    const marketingAccountIdMap = new Map(
      marketingAccounts.map((account) => [account.name, account.id]),
    );
    const marketIdMap = new Map(markets.map((market) => [market.name, market.id]));
    const leadSeedRows = buildDefaultLeadSeeds();

    const { data: insertedLeadsRaw } = await supabase
      .from("leads")
      .insert(
        leadSeedRows.map((lead) => ({
          organization_id: organizationId,
          service_type_id: serviceTypeIdMap.get(lead.serviceType) ?? serviceTypes[0]?.id ?? null,
          assigned_user_id: context.user.id,
          marketing_account_id:
            marketingAccountIdMap.get(lead.marketingAccount) ?? googleAccount ?? null,
          source: lead.source,
          first_name: lead.firstName,
          last_name: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          status: lead.status,
          estimated_value: lead.estimatedValue,
          notes: lead.notes,
          metadata: { seeded_demo: true },
          created_at: subDays(new Date(), lead.daysAgo).toISOString(),
        })) as never,
      )
      .select("id, first_name, last_name, service_type_id, email");
    const insertedLeads = (insertedLeadsRaw ?? []) as Array<{
      id: string;
      first_name: string;
      last_name: string;
      service_type_id: string | null;
      email: string | null;
    }>;
    const leadIdByKey = new Map(
      leadSeedRows.flatMap((lead) => {
        const inserted = insertedLeads.find((item) => item.email === lead.email);
        return inserted ? [[lead.key, inserted.id] as const] : [];
      }),
    );

    if (insertedLeads?.length) {
      if ((appointmentsResult.data ?? []).length === 0) {
        const appointmentSeedRows = buildDefaultAppointmentSeeds();
        const { data: appointmentRowsRaw } = await supabase
          .from("appointments")
          .insert(
            appointmentSeedRows.map((appointment) => {
              const createdAt = subDays(new Date(), appointment.daysAgo);
              return {
                organization_id: organizationId,
                lead_id: leadIdByKey.get(appointment.leadKey) ?? null,
                scheduled_at: subDays(
                  new Date(),
                  Math.max(appointment.daysAgo - appointment.scheduledOffsetDays, 0),
                ).toISOString(),
                status: appointment.status,
                appointment_type: appointment.appointmentType,
                notes: appointment.notes,
                created_at: createdAt.toISOString(),
              };
            }) as never,
          )
          .select("id, lead_id");
        const appointmentRows = (appointmentRowsRaw ?? []) as Array<{
          id: string;
          lead_id: string | null;
        }>;
        const appointmentIdByKey = new Map(
          appointmentSeedRows.flatMap((appointment) => {
            const leadId = leadIdByKey.get(appointment.leadKey);
            const inserted = appointmentRows.find((item) => item.lead_id === leadId);
            return inserted ? [[appointment.key, inserted.id] as const] : [];
          }),
        );

        if ((dealsResult.data ?? []).length === 0) {
          await supabase.from("deals").insert(
            buildDefaultDealSeeds().map((deal) => ({
              organization_id: organizationId,
              lead_id: leadIdByKey.get(deal.leadKey) ?? null,
              appointment_id: deal.appointmentKey
                ? appointmentIdByKey.get(deal.appointmentKey) ?? null
                : null,
              title: deal.title,
              contact_name: deal.contactName,
              deal_type: deal.dealType,
              stage: deal.stage,
              status: deal.status,
              estimated_value: deal.estimatedValue,
              closed_value: deal.closedValue ?? null,
              commission_revenue: deal.commissionRevenue ?? null,
              market_id: marketIdMap.get(deal.marketName) ?? markets[0]?.id ?? null,
              source: deal.source,
              closed_at:
                deal.closedOffsetDays !== undefined && deal.closedOffsetDays !== null
                  ? subDays(new Date(), deal.closedOffsetDays).toISOString()
                  : null,
              notes: deal.notes,
              created_at: subDays(new Date(), deal.daysAgo).toISOString(),
            })) as never,
          );
        }
      }

      await supabase.from("jobs").insert([
        {
          organization_id: organizationId,
          lead_id: leadIdByKey.get("mia-investor-current-1") ?? insertedLeads[0]?.id ?? null,
          service_type_id: insertedLeads[0]?.service_type_id ?? null,
          assigned_user_id: context.user.id,
          title: "Legacy Miami acquisition workflow",
          customer_name: "Grace Mills",
          status: "booked",
          scheduled_for: subDays(new Date(), 2).toISOString(),
          revenue: 13350,
          address: "88 Biscayne Blvd, Miami, FL",
          notes: "Legacy compatibility record for the referral-driven Miami close.",
        },
        {
          organization_id: organizationId,
          lead_id: leadIdByKey.get("austin-buyer-current-1") ?? insertedLeads[1]?.id ?? null,
          service_type_id: insertedLeads[1]?.service_type_id ?? null,
          assigned_user_id: context.user.id,
          title: "Legacy Austin buyer progression",
          customer_name: "Chloe Jenkins",
          status: "completed",
          scheduled_for: subDays(new Date(), 6).toISOString(),
          revenue: 11100,
          address: "300 Bowie St, Austin, TX",
          notes: "Legacy compatibility record for current Austin pipeline activity.",
        },
      ] as never);
    }
  }

  if ((insightsResult.data ?? []).length === 0) {
    await supabase.from("insights").insert(
      buildDefaultInsights().map((insight) => ({
        organization_id: organizationId,
        ...insight,
      })) as never,
    );
  }

  if ((recommendationsResult.data ?? []).length === 0) {
    await supabase.from("recommendations").insert(
      buildDefaultRecommendations().map((recommendation) => ({
        organization_id: organizationId,
        ...recommendation,
      })) as never,
    );
  }

  if ((healthScoresResult.data ?? []).length === 0) {
    await supabase.from("health_scores").insert(
      buildDefaultHealthScores().map((score) => ({
        organization_id: organizationId,
        ...score,
      })) as never,
    );
  }
}

export async function getAppContext() {
  return ensureAppContext();
}
