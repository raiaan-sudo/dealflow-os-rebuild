import { ApiError } from "@/lib/api/route";
import { normalizeCustomLeadQuestions } from "@/lib/leads/custom-question-contract";
import {
  hasFeatureAccess,
  normalizeBillingPlanTier,
  type BillingPlanTier,
} from "@/lib/billing/plans";
import {
  getQaBillingAcceptanceOverridePlanTiers,
  isBillingAdminOverrideEmail,
  isBillingAdminOverrideEnabled,
  isQaBillingAcceptanceOverrideCampaign,
  isQaBillingAcceptanceOverrideEmail,
  isQaBillingAcceptanceOverrideEnabled,
  isQaBillingAcceptanceOverrideOrg,
  isQaBillingAcceptanceOverrideUser,
} from "@/lib/env";
import { getAppContext } from "@/lib/services/app-context";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type BillingRow = Database["public"]["Tables"]["billing_subscriptions"]["Row"];

export type BillingLifecycleState =
  | "active"
  | "payment_issue"
  | "grace_period"
  | "suspended"
  | "read_only";

export type CampaignEntitlementSnapshot = {
  billingState: BillingLifecycleState;
  planTier: BillingPlanTier;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  launchOverride: boolean;
  launchOverrideSource: BillingLaunchOverrideSource;
  launchOverrideMatchedBy: string[];
  canPreview: boolean;
  canLaunch: boolean;
  canKeepFunnelLive: boolean;
  canCaptureLeads: boolean;
  canSendLeadAlerts: boolean;
  canRunOptimization: boolean;
  canRunAutonomy: boolean;
  canSyncMeta: boolean;
  requiresSuspension: boolean;
  suspensionReason: string | null;
};

export type BillingLaunchOverrideSource =
  | "billing_admin_email"
  | "qa_billing_acceptance"
  | null;

type EvaluationInput = {
  row?: Pick<
    BillingRow,
    "plan_tier" | "status" | "current_period_end" | "cancel_at_period_end"
  > | null;
  fallbackPlanTier?: string | null;
  launchOverride?: boolean;
  launchOverrideSource?: BillingLaunchOverrideSource;
  launchOverrideMatchedBy?: string[];
  commerciallyActivated?: boolean;
  now?: Date;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const PAYMENT_ISSUE_STATUSES = new Set(["past_due", "incomplete"]);
const SUSPENDED_SUBSCRIPTION_STATUSES = new Set([
  "canceled",
  "cancelled",
  "unpaid",
  "incomplete_expired",
  "paused",
]);

function parseTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function evaluateCampaignEntitlements(input: EvaluationInput): CampaignEntitlementSnapshot {
  const now = input.now ?? new Date();
  const row = input.row ?? null;
  const planTier = normalizeBillingPlanTier(row?.plan_tier ?? input.fallbackPlanTier ?? "starter");
  const subscriptionStatus = row?.status ?? "inactive";
  const currentPeriodEnd = row?.current_period_end ?? null;
  const cancelAtPeriodEnd = row?.cancel_at_period_end ?? false;
  const periodEndMs = parseTime(currentPeriodEnd);
  const hasUnexpiredPaidPeriod = typeof periodEndMs === "number" && periodEndMs > now.getTime();
  const launchOverride = input.launchOverride === true;
  const launchOverrideSource = launchOverride ? input.launchOverrideSource ?? null : null;
  const launchOverrideMatchedBy = launchOverride ? input.launchOverrideMatchedBy ?? [] : [];
  const commerciallyActivated = input.commerciallyActivated !== false;

  let billingState: BillingLifecycleState = "read_only";
  let suspensionReason: string | null = "subscription_inactive";

  if (launchOverride) {
    billingState = "active";
    suspensionReason = null;
  } else if (!commerciallyActivated) {
    billingState = "read_only";
    suspensionReason = "commercial_activation_required";
  } else if (ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    if (cancelAtPeriodEnd && periodEndMs !== null && periodEndMs <= now.getTime()) {
      billingState = "suspended";
      suspensionReason = "subscription_period_ended";
    } else {
      billingState = cancelAtPeriodEnd ? "grace_period" : "active";
      suspensionReason = null;
    }
  } else if (PAYMENT_ISSUE_STATUSES.has(subscriptionStatus)) {
    billingState = "payment_issue";
    suspensionReason = "payment_issue";
  } else if (SUSPENDED_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    if (hasUnexpiredPaidPeriod && cancelAtPeriodEnd) {
      billingState = "grace_period";
      suspensionReason = null;
    } else {
      billingState = "suspended";
      suspensionReason = subscriptionStatus === "unpaid" ? "subscription_unpaid" : "subscription_inactive";
    }
  }

  const operationalAccess =
    billingState === "active" ||
    billingState === "grace_period" ||
    billingState === "payment_issue";
  const paidLaunchAccess = billingState === "active" || billingState === "grace_period";
  const launchFeatureAllowed = hasFeatureAccess(planTier, "meta_launch");
  const autonomyFeatureAllowed = hasFeatureAccess(planTier, "autonomy_access");

  return {
    billingState,
    planTier,
    subscriptionStatus,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    launchOverride,
    launchOverrideSource,
    launchOverrideMatchedBy,
    canPreview: true,
    canLaunch: (paidLaunchAccess || launchOverride) && launchFeatureAllowed,
    canKeepFunnelLive: operationalAccess || launchOverride,
    canCaptureLeads: operationalAccess || launchOverride,
    canSendLeadAlerts: operationalAccess || launchOverride,
    canRunOptimization: paidLaunchAccess || launchOverride,
    canRunAutonomy: (paidLaunchAccess || launchOverride) && autonomyFeatureAllowed,
    canSyncMeta: operationalAccess || launchOverride,
    requiresSuspension: billingState === "suspended" && !launchOverride,
    suspensionReason,
  };
}

type QaBillingAcceptanceOverrideInput = {
  email?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  campaignId?: string | null;
  planTier?: string | null;
};

export type QaBillingAcceptanceOverrideMatch = {
  matched: boolean;
  source: "qa_billing_acceptance" | null;
  matchedBy: string[];
  planTier: BillingPlanTier;
};

export function getQaBillingAcceptanceOverrideMatch(
  input: QaBillingAcceptanceOverrideInput,
): QaBillingAcceptanceOverrideMatch {
  const planTier = normalizeBillingPlanTier(input.planTier ?? "starter");

  if (!isQaBillingAcceptanceOverrideEnabled()) {
    return { matched: false, source: null, matchedBy: [], planTier };
  }

  const allowedPlanTiers = getQaBillingAcceptanceOverridePlanTiers()
    .map((value) => normalizeBillingPlanTier(value));
  if (allowedPlanTiers.length > 0 && !allowedPlanTiers.includes(planTier)) {
    return { matched: false, source: null, matchedBy: [], planTier };
  }

  const matchedBy = [
    ...(isQaBillingAcceptanceOverrideEmail(input.email) ? ["email"] : []),
    ...(isQaBillingAcceptanceOverrideUser(input.userId) ? ["user_id"] : []),
    ...(isQaBillingAcceptanceOverrideOrg(input.organizationId) ? ["organization_id"] : []),
    ...(isQaBillingAcceptanceOverrideCampaign(input.campaignId) ? ["campaign_id"] : []),
  ];

  return {
    matched: matchedBy.length > 0,
    source: matchedBy.length > 0 ? "qa_billing_acceptance" : null,
    matchedBy,
    planTier,
  };
}
export async function getCampaignEntitlementsForOrganization(params: {
  organizationId: string;
  fallbackPlanTier?: string | null;
  launchOverride?: boolean;
  launchOverrideSource?: BillingLaunchOverrideSource;
  launchOverrideMatchedBy?: string[];
  campaignId?: string | null;
  userId?: string | null;
  email?: string | null;
}) {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const [billingResult, activationResult] = await Promise.all([
    admin
      .from("billing_subscriptions")
      .select("plan_tier,status,current_period_end,cancel_at_period_end,metadata")
      .eq("organization_id", params.organizationId)
      .maybeSingle(),
    (admin as any)
      .from("commercial_activations")
      .select("id")
      .eq("organization_id", params.organizationId)
      .maybeSingle(),
  ]);
  const { data, error } = billingResult;

  if (error) {
    throw new ApiError(500, error.message, "billing_subscription_fetch_failed");
  }
  if (activationResult.error) {
    throw new ApiError(500, activationResult.error.message, "commercial_activation_fetch_failed");
  }

  const billingRow =
    (data as (Pick<BillingRow, "plan_tier" | "status" | "current_period_end" | "cancel_at_period_end" | "metadata">) | null) ?? null;
  const billingMetadata =
    billingRow?.metadata && typeof billingRow.metadata === "object" && !Array.isArray(billingRow.metadata)
      ? billingRow.metadata as Record<string, unknown>
      : {};
  const commerciallyActivated =
    Boolean(
      activationResult.data &&
      typeof activationResult.data === "object" &&
      "id" in activationResult.data &&
      typeof activationResult.data.id === "string"
    ) ||
    billingMetadata.legacy_commercial_activation_reconciled === true ||
    billingMetadata.legacy_commercial_activation_reconciled === "true";
  const qaOverride = getQaBillingAcceptanceOverrideMatch({
    email: params.email,
    userId: params.userId,
    organizationId: params.organizationId,
    campaignId: params.campaignId,
    planTier: billingRow?.plan_tier ?? params.fallbackPlanTier,
  });
  const launchOverride = params.launchOverride === true || qaOverride.matched;
  const launchOverrideSource =
    params.launchOverrideSource ??
    (qaOverride.matched ? qaOverride.source : null);
  const launchOverrideMatchedBy =
    params.launchOverrideMatchedBy ??
    (qaOverride.matched ? qaOverride.matchedBy : []);

  return evaluateCampaignEntitlements({
    row: billingRow,
    fallbackPlanTier: params.fallbackPlanTier,
    launchOverride,
    launchOverrideSource,
    launchOverrideMatchedBy,
    commerciallyActivated,
  });
}

async function getCurrentBillingOverrideForOrganization(params: {
  organizationId: string;
  campaignId?: string | null;
  userId?: string | null;
  planTier?: string | null;
}) {
  const context = await getAppContext().catch(() => null);
  if (!isBillingAdminOverrideEnabled()) {
    const qaOverride = getQaBillingAcceptanceOverrideMatch({
      email:
        context && context.organization.id === params.organizationId
          ? context.user.email ?? context.profile?.email ?? null
          : null,
      userId: params.userId,
      organizationId: params.organizationId,
      campaignId: params.campaignId,
      planTier: params.planTier,
    });
    return {
      launchOverride: qaOverride.matched,
      launchOverrideSource: qaOverride.source,
      launchOverrideMatchedBy: qaOverride.matchedBy,
      email: null,
    };
  }

  if (context && context.organization.id === params.organizationId) {
    const email = context.user.email ?? context.profile?.email ?? null;
    if (isBillingAdminOverrideEmail(email)) {
      return {
        launchOverride: true,
        launchOverrideSource: "billing_admin_email" as const,
        launchOverrideMatchedBy: ["email"],
        email,
      };
    }
  }

  const qaOverride = getQaBillingAcceptanceOverrideMatch({
    email:
      context && context.organization.id === params.organizationId
        ? context.user.email ?? context.profile?.email ?? null
        : null,
    userId: params.userId,
    organizationId: params.organizationId,
    campaignId: params.campaignId,
    planTier: params.planTier,
  });
  return {
    launchOverride: qaOverride.matched,
    launchOverrideSource: qaOverride.source,
    launchOverrideMatchedBy: qaOverride.matchedBy,
    email: null,
  };
}

export async function getCampaignEntitlementsForCampaign(campaignId: string) {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await admin
    .from("campaign_plans")
    .select("organization_id,user_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "campaign_entitlement_lookup_failed");
  }

  const row = data as { organization_id?: string | null; user_id?: string | null } | null;
  const organizationId = row?.organization_id ?? null;

  if (!organizationId) {
    throw new ApiError(404, "Campaign was not found.", "campaign_not_found");
  }

  const launchOverride = await getCurrentBillingOverrideForOrganization({
    organizationId,
    campaignId,
    userId: row?.user_id ?? null,
  });

  return getCampaignEntitlementsForOrganization({
    organizationId,
    campaignId,
    userId: row?.user_id ?? null,
    launchOverride: launchOverride.launchOverride,
    launchOverrideSource: launchOverride.launchOverrideSource,
    launchOverrideMatchedBy: launchOverride.launchOverrideMatchedBy,
  });
}

export async function getPublicFunnelEntitlements(params: {
  campaignId?: string | null;
  funnelSlug?: string | null;
}) {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  let query = admin
    .from("campaign_plans")
    .select("id,organization_id,plan")
    .eq("publish_state", "published");

  if (params.campaignId?.trim()) {
    query = query.eq("id", params.campaignId.trim());
  } else if (params.funnelSlug?.trim()) {
    query = query.eq("public_slug", params.funnelSlug.trim().toLowerCase());
  } else {
    throw new ApiError(400, "campaignId or funnel slug is required.", "validation_error");
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "public_funnel_entitlement_lookup_failed");
  }

  const row = data as {
    id?: string | null;
    organization_id?: string | null;
    plan?: unknown;
  } | null;

  if (!row?.id || !row.organization_id) {
    throw new ApiError(404, "Published funnel not found.", "funnel_not_found");
  }

  const entitlements = await getCampaignEntitlementsForOrganization({
    organizationId: row.organization_id,
    campaignId: row.id,
  });
  const plan =
    row.plan && typeof row.plan === "object" && !Array.isArray(row.plan)
      ? (row.plan as Record<string, unknown>)
      : {};
  const funnel =
    plan.funnel && typeof plan.funnel === "object" && !Array.isArray(plan.funnel)
      ? (plan.funnel as Record<string, unknown>)
      : {};
  const customLeadFormQuestions = normalizeCustomLeadQuestions(
    plan.lead_form_questions ?? funnel.customLeadFormQuestions,
  );

  return {
    campaignId: row.id,
    organizationId: row.organization_id,
    entitlements,
    customLeadFormQuestions,
  };
}

export async function assertCampaignCanLaunch(campaignId: string) {
  const entitlements = await getCampaignEntitlementsForCampaign(campaignId);

  if (entitlements.canLaunch) {
    return entitlements;
  }

  throw new ApiError(
    402,
    "An active subscription is required before this campaign can launch.",
    "billing_launch_payment_required",
  );
}

export async function assertCampaignCanRunOptimization(campaignId: string) {
  const entitlements = await getCampaignEntitlementsForCampaign(campaignId);

  if (entitlements.canRunOptimization) {
    return entitlements;
  }

  throw new ApiError(
    402,
    "Optimization is paused until this workspace has active billing.",
    "billing_optimization_payment_required",
  );
}

export async function assertCampaignCanRunAutonomy(campaignId: string) {
  const entitlements = await getCampaignEntitlementsForCampaign(campaignId);

  if (entitlements.canRunAutonomy) {
    return entitlements;
  }

  throw new ApiError(
    402,
    "Autonomous campaign operation requires an active Pro subscription.",
    "billing_autonomy_payment_required",
  );
}

export async function assertCampaignCanPublishFunnel(campaignId: string) {
  const entitlements = await getCampaignEntitlementsForCampaign(campaignId);

  if (entitlements.canKeepFunnelLive) {
    return entitlements;
  }

  throw new ApiError(
    402,
    "Reactivate billing before publishing this funnel.",
    "billing_funnel_payment_required",
  );
}
