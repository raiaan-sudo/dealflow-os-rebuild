import "server-only";

import { ApiError } from "@/lib/api/route";
import { logOperationalEvent } from "@/lib/logging";
import { createAdminClient } from "@/lib/server/supabase-admin";

type CampaignRow = {
  id: string;
  organization_id: string;
  user_id: string;
  launch_status: string | null;
};

type LaunchRow = {
  id: string;
  organization_id: string;
  user_id: string;
  campaign_id: string;
  result_status: string;
  launch_mode: string;
  meta_campaign_id: string | null;
  meta_ad_set_ids: unknown;
  meta_creative_id: string | null;
  meta_ad_ids: unknown;
};

type MarketingAccountRow = {
  id: string;
  organization_id: string;
  platform: string;
  status: string;
  external_account_id: string | null;
  access_token_encrypted: string | null;
  connection_metadata: Record<string, unknown> | null;
};

type ProvisionedRouteRow = {
  id: string;
  organization_id: string;
  user_id: string;
  campaign_id: string;
  marketing_account_id: string;
  provider_ad_account_id: string;
  provider_page_id: string;
  provider_form_id: string;
  status: string;
};

type OrganizationMembershipRow = {
  organization_id: string;
  user_id: string;
  role: string | null;
};

const META_LEADGEN_ROUTE_ELEVATED_WORKSPACE_ROLES = new Set(["admin"]);

function firstRow<T>(value: unknown): T | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as T) : null;
}

function exactSingleRow<T>(value: unknown, errorCode: string, message: string) {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length !== 1 || !rows[0] || typeof rows[0] !== "object") {
    throw new ApiError(409, message, errorCode);
  }
  return rows[0] as T;
}

function asExactProviderId(value: unknown) {
  return typeof value === "string" && /^\d{5,40}$/.test(value.trim())
    ? value.trim()
    : null;
}

export async function provisionMetaLeadgenRouteForCampaign(params: {
  actorUserId: string;
  organizationId: string;
  campaignId: string;
  providerFormId: string;
}) {
  const providerFormId = asExactProviderId(params.providerFormId);
  if (!providerFormId) {
    throw new ApiError(
      400,
      "A valid Meta Instant Form ID is required.",
      "meta_leadgen_form_id_invalid",
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(
      503,
      "Meta leadgen route storage is not configured.",
      "meta_leadgen_storage_unavailable",
    );
  }

  const [
    { data: organization, error: organizationError },
    { data: membershipData, error: membershipError },
    { data: campaignData, error: campaignError },
  ] =
    await Promise.all([
      admin
        .from("organizations")
        .select("id,owner_user_id")
        .eq("id", params.organizationId)
        .maybeSingle(),
      admin
        .from("organization_memberships")
        .select("organization_id,user_id,role")
        .eq("organization_id", params.organizationId)
        .eq("user_id", params.actorUserId)
        .maybeSingle(),
      admin
        .from("campaign_plans")
        .select("id,organization_id,user_id,launch_status")
        .eq("id", params.campaignId)
        .eq("organization_id", params.organizationId)
        .maybeSingle(),
    ]);
  const organizationOwner =
    organization && typeof (organization as { owner_user_id?: unknown }).owner_user_id === "string"
      ? (organization as { owner_user_id: string }).owner_user_id
      : null;
  const membership = membershipData as OrganizationMembershipRow | null;
  const campaign = campaignData as CampaignRow | null;

  if (organizationError || membershipError || campaignError) {
    throw new ApiError(
      503,
      organizationError?.message ??
        membershipError?.message ??
        campaignError?.message ??
        "Meta leadgen authorization lookup failed.",
      campaignError
        ? "meta_leadgen_campaign_lookup_failed"
        : "meta_leadgen_membership_lookup_failed",
    );
  }
  if (!campaign) {
    throw new ApiError(404, "Campaign not found.", "campaign_not_found");
  }

  const actorIsOrganizationOwner = organizationOwner === params.actorUserId;
  const membershipRole = membership?.role?.trim().toLowerCase() ?? null;

  if (!actorIsOrganizationOwner && !membership) {
    throw new ApiError(
      403,
      "Current workspace membership is required to configure Meta leadgen routing.",
      "meta_leadgen_membership_required",
    );
  }
  if (
    !actorIsOrganizationOwner &&
    params.actorUserId !== campaign.user_id &&
    (!membershipRole || !META_LEADGEN_ROUTE_ELEVATED_WORKSPACE_ROLES.has(membershipRole))
  ) {
    throw new ApiError(
      403,
      "Campaign ownership or workspace admin access is required to configure Meta leadgen routing.",
      "meta_leadgen_route_role_required",
    );
  }
  if (campaign.launch_status !== "provider_paused") {
    throw new ApiError(
      409,
      "The campaign must have a successful provider-paused launch receipt before native lead routing is configured.",
      "meta_leadgen_campaign_not_launch_ready",
    );
  }

  const [{ data: launchRows, error: launchError }, { data: accountRows, error: accountError }] =
    await Promise.all([
      admin
        .from("campaign_launch_records")
        .select(
          "id,organization_id,user_id,campaign_id,result_status,launch_mode,meta_campaign_id,meta_ad_set_ids,meta_creative_id,meta_ad_ids",
        )
        .eq("organization_id", params.organizationId)
        .eq("user_id", campaign.user_id)
        .eq("campaign_id", campaign.id)
        .eq("result_status", "success")
        .order("updated_at", { ascending: false })
        .limit(2),
      admin
        .from("marketing_accounts")
        .select(
          "id,organization_id,platform,status,external_account_id,access_token_encrypted,connection_metadata",
        )
        .eq("organization_id", params.organizationId)
        .eq("platform", "meta_ads")
        .eq("status", "connected")
        .limit(2),
    ]);

  if (launchError || accountError) {
    throw new ApiError(
      503,
      launchError?.message ?? accountError?.message ?? "Meta launch readiness lookup failed.",
      "meta_leadgen_readiness_lookup_failed",
    );
  }

  const launch = exactSingleRow<LaunchRow>(
    launchRows,
    "meta_leadgen_launch_receipt_ambiguous",
    "Exactly one successful campaign launch receipt is required.",
  );
  const account = exactSingleRow<MarketingAccountRow>(
    accountRows,
    "meta_leadgen_marketing_account_ambiguous",
    "Exactly one connected Meta account is required for the workspace.",
  );
  const metaAdSetIds = Array.isArray(launch.meta_ad_set_ids)
    ? launch.meta_ad_set_ids.map(String).filter(Boolean)
    : [];
  const metaAdIds = Array.isArray(launch.meta_ad_ids)
    ? launch.meta_ad_ids.map(String).filter(Boolean)
    : [];

  if (
    !["provider_paused", "scheduled_provider_paused"].includes(launch.launch_mode) ||
    !asExactProviderId(launch.meta_campaign_id) ||
    metaAdSetIds.length !== 1 ||
    !asExactProviderId(metaAdSetIds[0]) ||
    !asExactProviderId(launch.meta_creative_id) ||
    metaAdIds.length !== 1 ||
    !asExactProviderId(metaAdIds[0])
  ) {
    throw new ApiError(
      409,
      "The successful launch receipt does not contain one complete provider object lineage.",
      "meta_leadgen_launch_receipt_incomplete",
    );
  }

  const providerAdAccountId = asExactProviderId(
    account.external_account_id?.replace(/^act_/, ""),
  );
  const providerPageId = asExactProviderId(account.connection_metadata?.selected_page_id);
  if (
    !providerAdAccountId ||
    !providerPageId ||
    !account.access_token_encrypted?.trim()
  ) {
    throw new ApiError(
      409,
      "The connected Meta account is missing its authoritative ad-account, Page, or token selection.",
      "meta_leadgen_meta_selection_incomplete",
    );
  }

  const { data: routeData, error: routeError } = await (admin as any).rpc(
    "upsert_meta_leadgen_route",
    {
      p_organization_id: params.organizationId,
      p_actor_user_id: params.actorUserId,
      p_user_id: campaign.user_id,
      p_campaign_id: campaign.id,
      p_marketing_account_id: account.id,
      p_provider_ad_account_id: providerAdAccountId,
      p_provider_page_id: providerPageId,
      p_provider_form_id: providerFormId,
      p_status: "active",
    },
  );
  const route = firstRow<ProvisionedRouteRow>(routeData);

  if (routeError || !route?.id) {
    throw new ApiError(
      503,
      routeError?.message ?? "Meta leadgen route was not returned.",
      "meta_leadgen_route_provision_failed",
    );
  }
  if (
    route.organization_id !== params.organizationId ||
    route.user_id !== campaign.user_id ||
    route.campaign_id !== campaign.id ||
    route.marketing_account_id !== account.id ||
    route.provider_ad_account_id.replace(/^act_/, "") !== providerAdAccountId ||
    route.provider_page_id !== providerPageId ||
    route.provider_form_id !== providerFormId ||
    route.status !== "active"
  ) {
    throw new ApiError(
      409,
      "Meta leadgen route result does not match the authoritative campaign and Meta selection.",
      "meta_leadgen_route_result_mismatch",
    );
  }

  logOperationalEvent("meta_leadgen.route_provisioned", {
    actorUserId: params.actorUserId,
    organizationId: params.organizationId,
    campaignId: campaign.id,
    routeId: route.id,
    replaySafe: true,
    providerCallPerformed: false,
  });

  return {
    id: route.id,
    organizationId: route.organization_id,
    campaignId: route.campaign_id,
    providerAdAccountId,
    providerPageId,
    providerFormId,
    status: route.status,
  };
}
