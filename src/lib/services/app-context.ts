import { subDays } from "date-fns/subDays";
import { slugify } from "@/lib/utils";
import { logError, logOperationalEvent, logWarn } from "@/lib/logging";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePartnerAttributionForWorkspace } from "@/lib/white-label/attribution";
import { resolveRequestedWorkspaceForUser } from "@/lib/services/workspace-access";
import type { Database } from "@/lib/supabase/types";
import type { AppContext } from "@/types/app";
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
          plan_tier: "starter",
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
          plan_tier: "starter",
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
    logOperationalEvent("membership_bootstrap_owner_second_pass", {
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
      logOperationalEvent("membership_bootstrap_synthesized_owner_context", {
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

  const { data: recoveredBusinessProfileRaw, error: recoveredBusinessProfileError } =
    await supabase
      .from("business_profiles")
      .select("*")
      .eq("organization_id", organization.id)
      .maybeSingle();

  if (recoveredBusinessProfileError) {
    throw recoveredBusinessProfileError;
  }

  return (recoveredBusinessProfileRaw as Row<"business_profiles"> | null) ?? null;
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
    const bootstrapSupabase = (createAdminClient() as SupabaseClient | null) ?? supabase;
    const profile = await ensureUserProfile(bootstrapSupabase, user);
    const requestedWorkspace = await resolveRequestedWorkspaceForUser(bootstrapSupabase, profile);
    const organization = requestedWorkspace?.organization ?? await ensureWorkspace(bootstrapSupabase, profile);
    const membership = requestedWorkspace?.membership ?? await ensureMembership(bootstrapSupabase, profile, organization);
    const businessProfile =
      requestedWorkspace?.access && requestedWorkspace.access !== "owner"
        ? ((await bootstrapSupabase
            .from("business_profiles")
            .select("*")
            .eq("organization_id", organization.id)
            .maybeSingle()).data as Row<"business_profiles"> | null)
        : await ensureBusinessProfile(bootstrapSupabase, organization, profile);
    const partnerId =
      requestedWorkspace?.access && requestedWorkspace.access !== "owner"
        ? organization.partner_id ?? null
        : await ensurePartnerAttributionForWorkspace({
            supabase: bootstrapSupabase,
            user,
            organization,
          });
    let partner: AppContext["partner"] = null;
    if (partnerId) {
      const { data: partnerRow } = await bootstrapSupabase
        .from("partners")
        .select("id,slug,brand_name,legal_name,logo_url,favicon_url,primary_color,secondary_color,accent_color,support_email,support_phone,powered_by_dealflow,status")
        .eq("id", partnerId)
        .maybeSingle();
      partner = (partnerRow as AppContext["partner"]) ?? null;
    }

    const context: AppContext = {
      user,
      profile,
      organization,
      membership,
      businessProfile,
      partner,
      activeWorkspaceAccess: requestedWorkspace?.access ?? "owner",
    };

    try {
      await ensureOrganizationSeedData(bootstrapSupabase, context);
    } catch (seedError) {
      logWarn("Organization seed data bootstrap skipped", {
        userId: user.id,
        organizationId: organization.id,
        message: seedError instanceof Error ? seedError.message : "Unknown seed bootstrap error",
      });
    }

    return context;
  } catch (error) {
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
