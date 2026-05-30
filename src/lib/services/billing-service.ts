import Stripe from "stripe";
import { ApiError } from "@/lib/api/route";
import { isBillingAdminOverrideEmail, isBillingAdminOverrideEnabled } from "@/lib/env";
import { logError, logOperationalEvent, logWarn } from "@/lib/logging";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/services/app-context";
import {
  buildStripeCheckoutMetadata,
  getBillingPortalUrls,
  getCheckoutUrls,
  getPlanTierFromSubscriptionPriceIds,
  getStripePlanPriceConfiguration,
} from "@/lib/integrations/stripe/service";
import { getStripeBillingProvider } from "@/lib/integrations/stripe/provider";
import {
  hasFeatureAccess,
  getSelfServeTrialPeriodDays,
  normalizeBillingPlanTier,
  type BillingFeature,
  type BillingPlanTier,
} from "@/lib/billing/plans";
import {
  CREDIT_TOP_UP_MINIMUM_CENTS,
  grantUserCredits,
} from "@/lib/services/credit-service";
import {
  evaluateCampaignEntitlements,
  getQaBillingAcceptanceOverrideMatch,
  type BillingLaunchOverrideSource,
  type BillingLifecycleState,
} from "@/lib/services/campaign-entitlements";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { queueSubscriptionSuspensionJobsForOrganization } from "@/lib/services/subscription-suspension-service";
import type { Database, Json } from "@/lib/supabase/types";

type BillingRow = Database["public"]["Tables"]["billing_subscriptions"]["Row"];
type BillingInsert = Database["public"]["Tables"]["billing_subscriptions"]["Insert"];
type StripeWebhookEventRow = Database["public"]["Tables"]["stripe_webhook_events"]["Row"];
type StripeWebhookEventInsert = Database["public"]["Tables"]["stripe_webhook_events"]["Insert"];

type BillingSubscriptionWebhookApplyResult = {
  applied: boolean;
  ignored_reason: string | null;
  latest_event_created: number | null;
};

export type BillingSummary = {
  planTier: BillingPlanTier;
  subscriptionStatus: string;
  billingState: BillingLifecycleState;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  launchAllowed: boolean;
  launchOverride: boolean;
  launchOverrideSource: BillingLaunchOverrideSource;
  launchOverrideMatchedBy: string[];
  canKeepFunnelLive: boolean;
  canCaptureLeads: boolean;
  canSendLeadAlerts: boolean;
  canRunOptimization: boolean;
  canRunAutonomy: boolean;
  requiresSuspension: boolean;
  suspensionReason: string | null;
};

const BILLING_ACTIVE_STATUSES = new Set(["active", "trialing"]);
const STRIPE_WEBHOOK_HANDLED_STATUSES = new Set(["processed", "ignored"]);
const STRIPE_WEBHOOK_PROCESSING_STALE_MS = 5 * 60_000;
const CHECKOUT_SESSION_REUSE_MS = 30 * 60_000;

type StripeWebhookClaimResult =
  | {
      status: "claimed";
      row: StripeWebhookEventRow | null;
    }
  | {
      status: "duplicate";
      row: StripeWebhookEventRow | null;
    };

type StripeSubscriptionSyncSource = {
  eventId: string | null;
  eventCreated: number | null;
  eventType: string | null;
};

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string" &&
      (error as { code: string }).code === "23505",
  );
}

function isStripeCustomerModeMismatch(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /No such customer:.*similar object exists in (test|live) mode/i.test(error.message);
}

function getStripeCustomerIdFromSession(session: Stripe.Checkout.Session) {
  if (typeof session.customer === "string") {
    return session.customer;
  }

  return session.customer?.id ?? null;
}

function getStripeSubscriptionFromSession(session: Stripe.Checkout.Session) {
  if (!session.subscription || typeof session.subscription === "string") {
    return null;
  }

  return session.subscription.object === "subscription" ? session.subscription : null;
}

function getStripeSubscriptionIdFromSession(session: Stripe.Checkout.Session) {
  if (typeof session.subscription === "string") {
    return session.subscription;
  }

  return session.subscription?.id ?? null;
}

function normalizeCheckoutCampaignId(campaignId?: string | null) {
  return typeof campaignId === "string" && campaignId.trim() ? campaignId.trim() : null;
}

function getBillingAdminOverrideEmail(context: Awaited<ReturnType<typeof getAppContext>>) {
  if (!context || !isBillingAdminOverrideEnabled()) {
    return null;
  }

  const email = context.user.email ?? context.profile?.email ?? null;
  return isBillingAdminOverrideEmail(email) ? email : null;
}

function logBillingAdminOverrideGrant(params: {
  source: string;
  organizationId: string;
  userId: string;
  email: string | null;
  planTier: BillingPlanTier;
  subscriptionStatus: string;
}) {
  logOperationalEvent("billing_admin_override_launch_access_granted", {
    source: params.source,
    organizationId: params.organizationId,
    userId: params.userId,
    email: params.email,
    planTier: params.planTier,
    subscriptionStatus: params.subscriptionStatus,
  });
}

function logQaBillingAcceptanceOverrideGrant(params: {
  source: string;
  organizationId: string;
  userId: string | null;
  campaignId: string | null;
  planTier: BillingPlanTier;
  subscriptionStatus: string;
  matchedBy: string[];
}) {
  logOperationalEvent("qa_billing_acceptance_override_launch_access_granted", {
    source: params.source,
    organizationId: params.organizationId,
    userId: params.userId,
    campaignId: params.campaignId,
    planTier: params.planTier,
    subscriptionStatus: params.subscriptionStatus,
    matchedBy: params.matchedBy,
  });
}

async function createStripeCustomerForCheckout(params: {
  stripeProvider: ReturnType<typeof getStripeBillingProvider>;
  organizationId: string;
  userId: string;
  email?: string | null;
  name?: string | null;
}) {
  return params.stripeProvider.execute({
    action: "create_customer",
    idempotencyKey: `dealflow_customer_${params.organizationId}`,
    params: {
      email: params.email || undefined,
      name: params.name || undefined,
      metadata: {
        organization_id: params.organizationId,
        user_id: params.userId,
      },
    },
  }) as Promise<Stripe.Customer>;
}

function getStripeObjectId(event: Stripe.Event) {
  const object = event.data.object;
  return object && typeof object === "object" && "id" in object && typeof object.id === "string"
    ? object.id
    : null;
}

function getStripeSubscriptionId(event: Stripe.Event) {
  if (event.data.object.object !== "subscription") {
    return null;
  }

  return typeof event.data.object.id === "string" ? event.data.object.id : null;
}

function getStripeWebhookOrganizationId(event: Stripe.Event) {
  if (event.data.object.object === "checkout.session") {
    const organizationId = event.data.object.metadata?.organization_id;
    return typeof organizationId === "string" && organizationId.length > 0 ? organizationId : null;
  }

  if (event.data.object.object === "subscription") {
    const organizationId = event.data.object.metadata?.organization_id;
    return typeof organizationId === "string" && organizationId.length > 0 ? organizationId : null;
  }

  return null;
}

async function readStripeWebhookEvent(eventId: string) {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await admin
    .from("stripe_webhook_events")
    .select("*")
    .eq("stripe_event_id", eventId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "stripe_webhook_event_fetch_failed");
  }

  return (data as StripeWebhookEventRow | null) ?? null;
}

async function markStripeWebhookEvent(params: {
  eventId: string;
  status: "processed" | "ignored" | "failed";
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const update: Database["public"]["Tables"]["stripe_webhook_events"]["Update"] = {
    status: params.status,
    processed_at: params.status === "failed" ? null : new Date().toISOString(),
    error_code: params.errorCode ?? null,
    error_message: params.errorMessage ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("stripe_webhook_events")
    .update(update as never)
    .eq("stripe_event_id", params.eventId);

  if (error) {
    throw new ApiError(500, error.message, "stripe_webhook_event_update_failed");
  }
}

async function claimStripeWebhookEvent(event: Stripe.Event): Promise<StripeWebhookClaimResult> {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const insertRow: StripeWebhookEventInsert = {
    stripe_event_id: event.id,
    stripe_event_type: event.type,
    stripe_object_id: getStripeObjectId(event),
    organization_id: getStripeWebhookOrganizationId(event),
    stripe_subscription_id: getStripeSubscriptionId(event),
    status: "processing",
    payload: {
      api_version: event.api_version ?? null,
      created: event.created,
      livemode: event.livemode,
    } satisfies Json,
  };

  const { data, error } = await admin
    .from("stripe_webhook_events")
    .insert(insertRow as never)
    .select("*")
    .maybeSingle();

  if (!error) {
    return {
      status: "claimed",
      row: (data as StripeWebhookEventRow | null) ?? null,
    };
  }

  if (!isUniqueViolation(error)) {
    throw new ApiError(500, error.message, "stripe_webhook_event_claim_failed");
  }

  const existingRow = await readStripeWebhookEvent(event.id);

  if (!existingRow) {
    throw new ApiError(500, "Stripe webhook event already exists but could not be read.", "stripe_webhook_event_missing");
  }

  if (STRIPE_WEBHOOK_HANDLED_STATUSES.has(existingRow.status)) {
    return {
      status: "duplicate",
      row: existingRow,
    };
  }

  const staleProcessingBefore = new Date(Date.now() - STRIPE_WEBHOOK_PROCESSING_STALE_MS).toISOString();
  const reclaimableStatuses =
    existingRow.status === "failed" ||
    (existingRow.status === "processing" &&
      typeof existingRow.updated_at === "string" &&
      existingRow.updated_at < staleProcessingBefore)
      ? ["failed", "processing"]
      : ["failed"];

  const { data: reclaimedRow, error: reclaimError } = await admin
    .from("stripe_webhook_events")
    .update({
      status: "processing",
      error_code: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("stripe_event_id", event.id)
    .in("status", reclaimableStatuses)
    .select("*")
    .maybeSingle();

  if (reclaimError) {
    throw new ApiError(500, reclaimError.message, "stripe_webhook_event_reclaim_failed");
  }

  if (reclaimedRow) {
    return {
      status: "claimed",
      row: reclaimedRow as StripeWebhookEventRow,
    };
  }

  if (existingRow.status === "processing") {
    throw new ApiError(
      503,
      "Stripe webhook event is already processing. Stripe should retry this event shortly.",
      "stripe_webhook_event_processing",
    );
  }

  return {
    status: "duplicate",
    row: existingRow,
  };
}

function mapBillingRow(row: BillingRow | null, fallbackPlanTier: string): BillingSummary {
  const normalizedPlanTier = normalizeBillingPlanTier(row?.plan_tier ?? fallbackPlanTier);
  const subscriptionStatus = row?.status ?? "inactive";
  const entitlements = evaluateCampaignEntitlements({
    row,
    fallbackPlanTier: normalizedPlanTier,
  });

  return {
    planTier: normalizedPlanTier,
    subscriptionStatus,
    billingState: entitlements.billingState,
    stripeCustomerId: row?.stripe_customer_id ?? null,
    stripeSubscriptionId: row?.stripe_subscription_id ?? null,
    currentPeriodEnd: row?.current_period_end ?? null,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
    launchAllowed: entitlements.canLaunch,
    launchOverride: false,
    launchOverrideSource: null,
    launchOverrideMatchedBy: [],
    canKeepFunnelLive: entitlements.canKeepFunnelLive,
    canCaptureLeads: entitlements.canCaptureLeads,
    canSendLeadAlerts: entitlements.canSendLeadAlerts,
    canRunOptimization: entitlements.canRunOptimization,
    canRunAutonomy: entitlements.canRunAutonomy,
    requiresSuspension: entitlements.requiresSuspension,
    suspensionReason: entitlements.suspensionReason,
  };
}

function getActivePlanTier(subscription: Stripe.Subscription) {
  const priceIds = subscription.items.data
    .map((item) => (typeof item.price?.id === "string" ? item.price.id : null))
    .filter((priceId): priceId is string => Boolean(priceId));
  const planTier = getPlanTierFromSubscriptionPriceIds(priceIds);

  if (!planTier) {
    throw new ApiError(
      400,
      "Stripe subscription price combination is not configured for DealFlow billing.",
      "stripe_price_unrecognized",
    );
  }

  return planTier;
}

function getSubscriptionItemByPriceId(subscription: Stripe.Subscription, priceId: string | null) {
  if (!priceId) {
    return null;
  }

  return subscription.items.data.find((item) => item.price?.id === priceId) ?? null;
}

function getOrganizationPlanForStatus(planTier: BillingPlanTier, status: string) {
  return status === "active" || status === "trialing" || status === "past_due"
    ? planTier
    : "starter";
}

export async function getBillingSummary() {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for billing access.", "unauthorized");
  }

  const billingClient = createAdminClient() ?? supabase;
  const { data, error } = await billingClient
    .from("billing_subscriptions")
    .select("*")
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "billing_subscription_fetch_failed");
  }

  const summary = mapBillingRow(
    (data as BillingRow | null) ?? null,
    context.organization.plan_tier ?? "starter",
  );

  const launchOverrideEmail = getBillingAdminOverrideEmail(context);
  const launchOverride = Boolean(launchOverrideEmail);

  if (launchOverride && !summary.launchAllowed) {
    logBillingAdminOverrideGrant({
      source: "billing_summary",
      organizationId: context.organization.id,
      userId: context.user.id,
      email: launchOverrideEmail,
      planTier: summary.planTier,
      subscriptionStatus: summary.subscriptionStatus,
    });
  }

  return {
    ...summary,
    launchAllowed: summary.launchAllowed || launchOverride,
    launchOverride,
    launchOverrideSource: launchOverride ? "billing_admin_email" : null,
    launchOverrideMatchedBy: launchOverride ? ["email"] : [],
    canKeepFunnelLive: summary.canKeepFunnelLive || launchOverride,
    canCaptureLeads: summary.canCaptureLeads || launchOverride,
    canSendLeadAlerts: summary.canSendLeadAlerts || launchOverride,
    canRunOptimization: summary.canRunOptimization || launchOverride,
    canRunAutonomy: summary.canRunAutonomy,
    requiresSuspension: launchOverride ? false : summary.requiresSuspension,
    suspensionReason: launchOverride ? null : summary.suspensionReason,
  };
}

export async function getBillingSummaryForOrganization(organizationId: string) {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await admin
    .from("billing_subscriptions")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "billing_subscription_fetch_failed");
  }

  return mapBillingRow((data as BillingRow | null) ?? null, "starter");
}

export async function getBillingSummaryForCampaign(campaignId: string) {
  const [context, admin] = await Promise.all([getAppContext().catch(() => null), Promise.resolve(createAdminClient())]);

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data: campaign, error: campaignError } = await admin
    .from("campaign_plans")
    .select("id,organization_id,user_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignError) {
    throw new ApiError(500, campaignError.message, "campaign_billing_lookup_failed");
  }

  const campaignRow = campaign as {
    id?: string | null;
    organization_id?: string | null;
    user_id?: string | null;
  } | null;

  if (!campaignRow?.organization_id) {
    throw new ApiError(404, "Campaign was not found.", "campaign_not_found");
  }

  if (context && context.organization.id !== campaignRow.organization_id) {
    throw new ApiError(403, "Campaign billing is not available for this workspace.", "campaign_billing_forbidden");
  }

  const { data: billingRow, error: billingError } = await admin
    .from("billing_subscriptions")
    .select("*")
    .eq("organization_id", campaignRow.organization_id)
    .maybeSingle();

  if (billingError) {
    throw new ApiError(500, billingError.message, "billing_subscription_fetch_failed");
  }

  const summary = mapBillingRow((billingRow as BillingRow | null) ?? null, "starter");
  const email =
    context && context.organization.id === campaignRow.organization_id
      ? context.user.email ?? context.profile?.email ?? null
      : null;
  const adminOverrideEmail = getBillingAdminOverrideEmail(context);
  const adminOverride =
    Boolean(adminOverrideEmail) &&
    context?.organization.id === campaignRow.organization_id;
  const qaOverride = getQaBillingAcceptanceOverrideMatch({
    email,
    userId: campaignRow.user_id,
    organizationId: campaignRow.organization_id,
    campaignId: campaignRow.id,
    planTier: summary.planTier,
  });
  const launchOverride = adminOverride || qaOverride.matched;
  const launchOverrideSource: BillingLaunchOverrideSource = adminOverride
    ? "billing_admin_email"
    : qaOverride.matched
      ? "qa_billing_acceptance"
      : null;
  const launchOverrideMatchedBy = adminOverride
    ? ["email"]
    : qaOverride.matchedBy;

  if (launchOverride && !summary.launchAllowed) {
    if (launchOverrideSource === "billing_admin_email") {
      logBillingAdminOverrideGrant({
        source: "campaign_billing_summary",
        organizationId: campaignRow.organization_id,
        userId: context?.user.id ?? "unknown",
        email: adminOverrideEmail,
        planTier: summary.planTier,
        subscriptionStatus: summary.subscriptionStatus,
      });
    } else if (launchOverrideSource === "qa_billing_acceptance") {
      logQaBillingAcceptanceOverrideGrant({
        source: "campaign_billing_summary",
        organizationId: campaignRow.organization_id,
        userId: campaignRow.user_id ?? null,
        campaignId: campaignRow.id ?? null,
        planTier: summary.planTier,
        subscriptionStatus: summary.subscriptionStatus,
        matchedBy: launchOverrideMatchedBy,
      });
    }
  }

  return {
    ...summary,
    launchAllowed: summary.launchAllowed || launchOverride,
    launchOverride,
    launchOverrideSource,
    launchOverrideMatchedBy,
    canKeepFunnelLive: summary.canKeepFunnelLive || launchOverride,
    canCaptureLeads: summary.canCaptureLeads || launchOverride,
    canSendLeadAlerts: summary.canSendLeadAlerts || launchOverride,
    canRunOptimization: summary.canRunOptimization || launchOverride,
    canRunAutonomy: summary.canRunAutonomy,
    requiresSuspension: launchOverride ? false : summary.requiresSuspension,
    suspensionReason: launchOverride ? null : summary.suspensionReason,
  };
}

export async function assertBillingFeatureAccess(feature: BillingFeature) {
  const summary = await getBillingSummary();

  if (!hasFeatureAccess(summary.planTier, feature)) {
    throw new ApiError(
      403,
      feature === "meta_launch"
        ? "Activate a Performance, Starter, or Pro subscription to launch live campaigns from this app."
        : feature === "campaign_data_import"
          ? "Upgrade to Growth to use campaign data imports and advanced intelligence."
          : "Upgrade to Pro to use the autonomous campaign operator.",
      "billing_feature_restricted",
    );
  }

  return summary;
}

export async function assertActiveBillingFeatureAccess(feature: BillingFeature) {
  const summary = await assertBillingFeatureAccess(feature);

  if (
    summary.launchOverride ||
    summary.billingState === "active" ||
    summary.billingState === "grace_period"
  ) {
    return summary;
  }

  throw new ApiError(
    402,
    feature === "autonomy_access"
      ? "An active Pro subscription is required before autonomous campaign operation can run."
      : "An active subscription is required before this feature can run.",
    "billing_feature_payment_required",
  );
}

export async function assertMetaLaunchBillingAccess() {
  const summary = await getBillingSummary();

  if (summary.launchAllowed) {
    return summary;
  }

  throw new ApiError(
    402,
    "An active subscription is required before this campaign can launch.",
    "billing_launch_payment_required",
  );
}

export async function assertMetaLaunchBillingAccessForOrganization(organizationId: string) {
  const summary = await getBillingSummaryForOrganization(organizationId);

  if (summary.launchAllowed) {
    return summary;
  }

  const context = await getAppContext();
  const launchOverrideEmail =
    context?.organization.id === organizationId ? getBillingAdminOverrideEmail(context) : null;
  const launchOverride = Boolean(launchOverrideEmail);

  if (launchOverride) {
    logBillingAdminOverrideGrant({
      source: "organization_launch_assertion",
      organizationId,
      userId: context?.user.id ?? "unknown",
      email: launchOverrideEmail,
      planTier: summary.planTier,
      subscriptionStatus: summary.subscriptionStatus,
    });

    return {
      ...summary,
      launchAllowed: true,
      launchOverride: true,
      canKeepFunnelLive: true,
      canCaptureLeads: true,
      canSendLeadAlerts: true,
      canRunOptimization: true,
      canRunAutonomy: summary.canRunAutonomy,
      requiresSuspension: false,
      suspensionReason: null,
    };
  }

  throw new ApiError(
    402,
    "An active subscription is required before this campaign can launch.",
    "billing_launch_payment_required",
  );
}

export async function createBillingCheckoutSession(params: {
  planTier: BillingPlanTier;
  campaignId?: string | null;
  customerName?: string;
  customerEmail?: string;
}) {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);
  const stripeProvider = getStripeBillingProvider();
  const requestedCampaignId = normalizeCheckoutCampaignId(params.campaignId);

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for checkout.", "unauthorized");
  }

  const launchOverrideEmail = getBillingAdminOverrideEmail(context);
  if (launchOverrideEmail) {
    logBillingAdminOverrideGrant({
      source: "billing_checkout_bypass",
      organizationId: context.organization.id,
      userId: context.user.id,
      email: launchOverrideEmail,
      planTier: params.planTier,
      subscriptionStatus: "override",
    });
    const bypassParams = new URLSearchParams({
      checkout: "override",
      plan: params.planTier,
    });
    if (requestedCampaignId) {
      bypassParams.set("campaignId", requestedCampaignId);
    }
    return { url: `/unlock?${bypassParams.toString()}`, sessionId: null };
  }

  if (!stripeProvider.isConfigured()) {
    throw new ApiError(503, "Stripe is not configured yet.", "stripe_not_configured");
  }

  const billingClient = createAdminClient() ?? supabase;
  const priceConfig = getStripePlanPriceConfiguration(params.planTier);

  if (!priceConfig) {
    throw new ApiError(503, "The selected plan is not configured in Stripe.", "stripe_price_missing");
  }

  if (requestedCampaignId) {
    const requestedCampaign = await getCampaignById(requestedCampaignId).catch(() => null);

    if (!requestedCampaign) {
      throw new ApiError(
        400,
        "The selected campaign is no longer available for checkout.",
        "checkout_campaign_invalid",
      );
    }
  }

  const { data: existingSubscription, error: existingSubscriptionError } = await billingClient
    .from("billing_subscriptions")
    .select("*")
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (existingSubscriptionError) {
    throw new ApiError(500, existingSubscriptionError.message, "billing_subscription_fetch_failed");
  }

  const existingBillingRow = (existingSubscription as BillingRow | null) ?? null;
  const existingMetadata =
    existingBillingRow?.metadata &&
    typeof existingBillingRow.metadata === "object" &&
    !Array.isArray(existingBillingRow.metadata)
      ? (existingBillingRow.metadata as Record<string, Json>)
      : {};
  let customerId = existingBillingRow?.stripe_customer_id ?? null;

  if (!customerId) {
    const customer = await createStripeCustomerForCheckout({
      stripeProvider,
      organizationId: context.organization.id,
      userId: context.user.id,
      email: params.customerEmail || context.user.email || undefined,
      name: params.customerName || context.organization.name || undefined,
    });
    customerId = customer.id;
  }

  const urls = getCheckoutUrls({
    campaignId: requestedCampaignId,
    planTier: params.planTier,
  });
  const checkoutTrialPeriodDays = getSelfServeTrialPeriodDays(params.planTier);
  const metadata = buildStripeCheckoutMetadata({
    organizationId: context.organization.id,
    userId: context.user.id,
    planTier: params.planTier,
    campaignId: requestedCampaignId,
    trialPeriodDays: checkoutTrialPeriodDays,
  });
  const checkoutMetadata = {
    ...metadata,
    price_signature: priceConfig.priceSignature,
    price_ids: priceConfig.priceIds.join(","),
    ...(priceConfig.meteredPriceId
      ? {
          performance_metered_price_id: priceConfig.meteredPriceId,
          performance_meter_event_name: priceConfig.meterEventName ?? "dealflow_billable_lead",
        }
      : {}),
  };

  if (
    existingBillingRow &&
    (existingBillingRow.status === "active" ||
      existingBillingRow.status === "trialing" ||
      existingBillingRow.status === "past_due")
  ) {
    const portalSession = await createBillingPortalSession();
    logOperationalEvent("billing_checkout_existing_subscription_redirected_to_portal", {
      organizationId: context.organization.id,
      subscriptionStatus: existingBillingRow.status,
      planTier: existingBillingRow.plan_tier,
      requestedPlanTier: params.planTier,
    });
    return { url: portalSession.url, sessionId: existingBillingRow.stripe_checkout_session_id ?? null };
  }

  const lastCheckoutCreatedAt =
    typeof existingMetadata.last_checkout_session_created_at === "string"
      ? Date.parse(existingMetadata.last_checkout_session_created_at)
      : 0;
  const lastCheckoutPlanTier =
    typeof existingMetadata.last_checkout_plan_tier === "string"
      ? existingMetadata.last_checkout_plan_tier
      : null;
  const lastCheckoutCampaignId = normalizeCheckoutCampaignId(
    typeof existingMetadata.last_checkout_campaign_id === "string"
      ? existingMetadata.last_checkout_campaign_id
      : null,
  );
  const lastCheckoutTrialPeriodDays =
    typeof existingMetadata.last_checkout_trial_period_days === "string"
      ? Number.parseInt(existingMetadata.last_checkout_trial_period_days, 10)
      : null;
  const lastCheckoutPriceSignature =
    typeof existingMetadata.last_checkout_price_signature === "string"
      ? existingMetadata.last_checkout_price_signature
      : null;

  if (
    customerId &&
    existingBillingRow?.stripe_checkout_session_id &&
    lastCheckoutPlanTier === params.planTier &&
    lastCheckoutCampaignId === requestedCampaignId &&
    lastCheckoutTrialPeriodDays === checkoutTrialPeriodDays &&
    lastCheckoutPriceSignature === priceConfig.priceSignature &&
    Number.isFinite(lastCheckoutCreatedAt) &&
    Date.now() - lastCheckoutCreatedAt < CHECKOUT_SESSION_REUSE_MS
  ) {
    try {
      const reusableSession = (await stripeProvider.execute({
        action: "retrieve_checkout_session",
        sessionId: existingBillingRow.stripe_checkout_session_id,
      })) as Stripe.Checkout.Session;
      const sessionCustomerId = getStripeCustomerIdFromSession(reusableSession);

      if (
        reusableSession.status === "open" &&
        reusableSession.url &&
        sessionCustomerId === customerId &&
        normalizeCheckoutCampaignId(reusableSession.metadata?.campaign_id ?? null) === requestedCampaignId &&
        reusableSession.metadata?.price_signature === priceConfig.priceSignature &&
        Number.parseInt(reusableSession.metadata?.trial_period_days ?? "0", 10) ===
          (checkoutTrialPeriodDays ?? 0)
      ) {
        logOperationalEvent("billing_checkout_session_reused", {
          organizationId: context.organization.id,
          checkoutSessionId: reusableSession.id,
          planTier: params.planTier,
          hasCampaignId: Boolean(requestedCampaignId),
        });
        return { url: reusableSession.url, sessionId: reusableSession.id };
      }
    } catch (error) {
      logWarn("Stored checkout session could not be reused; creating a replacement.", {
        organizationId: context.organization.id,
        checkoutSessionId: existingBillingRow.stripe_checkout_session_id,
        message: error instanceof Error ? error.message : "Unknown checkout retrieval failure",
      });
    }
  }

  const createCheckoutSession = async (stripeCustomerId: string) =>
    (await stripeProvider.execute({
      action: "create_checkout_session",
      idempotencyKey: `dealflow_checkout_${context.organization.id}_${params.planTier}_${
        requestedCampaignId ?? "workspace"
      }_${priceConfig.priceSignature.replace(/[^a-zA-Z0-9_-]/g, "_")}_trial${checkoutTrialPeriodDays ?? 0}_${Math.floor(
        Date.now() / CHECKOUT_SESSION_REUSE_MS,
      )}`,
      params: {
        mode: "subscription",
        customer: stripeCustomerId,
        client_reference_id: context.organization.id,
        line_items: priceConfig.lineItems,
        success_url: urls.successUrl,
        cancel_url: urls.cancelUrl,
        allow_promotion_codes: true,
        metadata: checkoutMetadata,
        subscription_data: {
          ...(checkoutTrialPeriodDays ? { trial_period_days: checkoutTrialPeriodDays } : {}),
          metadata: checkoutMetadata,
        },
      },
    })) as Stripe.Checkout.Session;

  let session: Stripe.Checkout.Session;
  try {
    session = await createCheckoutSession(customerId);
  } catch (error) {
    if (!customerId || !isStripeCustomerModeMismatch(error)) {
      throw error;
    }

    logWarn("Stored Stripe customer belongs to a different mode; creating a replacement customer for checkout.", {
      organizationId: context.organization.id,
    });
    const replacementCustomer = await createStripeCustomerForCheckout({
      stripeProvider,
      organizationId: context.organization.id,
      userId: context.user.id,
      email: params.customerEmail || context.user.email || undefined,
      name: params.customerName || context.organization.name || undefined,
    });
    customerId = replacementCustomer.id;
    session = await createCheckoutSession(customerId);
  }

  const metadataPatch = {
    ...existingMetadata,
    last_checkout_session_id: session.id,
    last_checkout_session_created_at: new Date().toISOString(),
    last_checkout_plan_tier: params.planTier,
    last_checkout_campaign_id: requestedCampaignId,
    last_checkout_trial_period_days: checkoutTrialPeriodDays === null ? null : String(checkoutTrialPeriodDays),
    last_checkout_price_signature: priceConfig.priceSignature,
    last_checkout_price_ids: priceConfig.priceIds,
  } satisfies Json;

  const upsertRow: BillingInsert = {
    organization_id: context.organization.id,
    user_id: context.user.id,
    stripe_customer_id: customerId,
    stripe_checkout_session_id: session.id,
    plan_tier: params.planTier,
    status: "checkout_started",
    metadata: metadataPatch,
  };

  const { error: upsertError } = await billingClient.from("billing_subscriptions").upsert(upsertRow as never, {
    onConflict: "organization_id",
  });

  if (upsertError) {
    throw new ApiError(500, upsertError.message, "billing_subscription_upsert_failed");
  }

  return { url: session.url, sessionId: session.id };
}

export async function createCreditTopUpCheckoutSession(params: {
  amountCents: number;
  customerName?: string;
  customerEmail?: string;
}) {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);
  const stripeProvider = getStripeBillingProvider();

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for credit checkout.", "unauthorized");
  }

  if (!stripeProvider.isConfigured()) {
    throw new ApiError(503, "Stripe is not configured yet.", "stripe_not_configured");
  }

  const amountCents = Math.floor(params.amountCents);
  if (!Number.isFinite(amountCents) || amountCents < CREDIT_TOP_UP_MINIMUM_CENTS) {
    throw new ApiError(
      400,
      `Credit top-up minimum is $${(CREDIT_TOP_UP_MINIMUM_CENTS / 100).toFixed(2)}.`,
      "credit_top_up_minimum_not_met",
    );
  }

  const billingClient = createAdminClient() ?? supabase;
  const { data: existingSubscription, error: existingSubscriptionError } = await billingClient
    .from("billing_subscriptions")
    .select("*")
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (existingSubscriptionError) {
    throw new ApiError(500, existingSubscriptionError.message, "billing_subscription_fetch_failed");
  }

  const existingBillingRow = (existingSubscription as BillingRow | null) ?? null;
  let customerId = existingBillingRow?.stripe_customer_id ?? null;

  if (!customerId) {
    const customer = await createStripeCustomerForCheckout({
      stripeProvider,
      organizationId: context.organization.id,
      userId: context.user.id,
      email: params.customerEmail || context.user.email || undefined,
      name: params.customerName || context.organization.name || undefined,
    });
    customerId = customer.id;
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const metadata = {
    checkout_kind: "credit_top_up",
    organization_id: context.organization.id,
    user_id: context.user.id,
    credit_amount_cents: String(amountCents),
  };

  const session = (await stripeProvider.execute({
    action: "create_checkout_session",
    idempotencyKey: `dealflow_credit_top_up_${context.organization.id}_${context.user.id}_${amountCents}_${Math.floor(
      Date.now() / CHECKOUT_SESSION_REUSE_MS,
    )}`,
      params: {
        mode: "payment",
        customer: customerId,
        client_reference_id: context.organization.id,
        payment_method_types: ["card"],
        line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: "DealFlow OS generation credits",
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/settings?credits=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/settings?credits=cancelled`,
      metadata,
      payment_intent_data: {
        metadata,
      },
    },
  })) as Stripe.Checkout.Session;

  return { url: session.url, sessionId: session.id };
}

export async function reconcileBillingCheckoutSuccess(sessionId: string) {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);
  const stripeProvider = getStripeBillingProvider();

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for checkout reconciliation.", "unauthorized");
  }

  if (!stripeProvider.isConfigured()) {
    throw new ApiError(503, "Stripe is not configured yet.", "stripe_not_configured");
  }

  const session = (await stripeProvider.execute({
    action: "retrieve_checkout_session",
    sessionId,
  })) as Stripe.Checkout.Session;

  if (session.mode !== "subscription") {
    throw new ApiError(400, "Checkout session is not a subscription checkout.", "checkout_mode_invalid");
  }

  if (session.status !== "complete") {
    throw new ApiError(409, "Checkout session has not completed yet.", "checkout_session_incomplete");
  }

  const sessionOrganizationId =
    typeof session.metadata?.organization_id === "string" ? session.metadata.organization_id : null;

  if (sessionOrganizationId !== context.organization.id) {
    throw new ApiError(403, "Checkout session does not belong to this workspace.", "checkout_session_forbidden");
  }

  const sessionSubscriptionId = getStripeSubscriptionIdFromSession(session);
  if (!sessionSubscriptionId) {
    throw new ApiError(
      409,
      "Checkout session completed without an attached subscription.",
      "checkout_subscription_missing",
    );
  }

  const billingClient = createAdminClient() ?? supabase;
  const { data: existingSubscription, error: existingSubscriptionError } = await billingClient
    .from("billing_subscriptions")
    .select("stripe_customer_id,stripe_checkout_session_id")
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (existingSubscriptionError) {
    throw new ApiError(500, existingSubscriptionError.message, "billing_subscription_fetch_failed");
  }

  const existingBillingRow =
    (existingSubscription as Pick<BillingRow, "stripe_customer_id" | "stripe_checkout_session_id"> | null) ??
    null;
  const sessionCustomerId = getStripeCustomerIdFromSession(session);

  if (
    existingBillingRow?.stripe_customer_id &&
    sessionCustomerId &&
    existingBillingRow.stripe_customer_id !== sessionCustomerId
  ) {
    throw new ApiError(403, "Checkout session customer does not match this workspace.", "checkout_customer_forbidden");
  }

  if (
    existingBillingRow?.stripe_checkout_session_id &&
    existingBillingRow.stripe_checkout_session_id !== session.id
  ) {
    logWarn("checkout_success_reconciliation_session_mismatch", {
      organizationId: context.organization.id,
      expectedSessionId: existingBillingRow.stripe_checkout_session_id,
      actualSessionId: session.id,
    });
    throw new ApiError(
      409,
      "Checkout session is no longer the current session for this workspace.",
      "checkout_session_stale",
    );
  }

  const expandedSubscription = getStripeSubscriptionFromSession(session);
  const subscription =
    expandedSubscription ??
    ((await stripeProvider.execute({
      action: "retrieve_subscription",
      subscriptionId: sessionSubscriptionId,
    })) as Stripe.Subscription);

  if (subscription.metadata.organization_id !== context.organization.id) {
    throw new ApiError(
      403,
      "Checkout subscription does not belong to this workspace.",
      "checkout_subscription_forbidden",
    );
  }

  const syncResult = await syncBillingSubscriptionFromStripe(subscription, {
    eventId: `checkout_session:${session.id}`,
    eventCreated: session.created,
    eventType: "checkout.success_reconciliation",
  });

  logOperationalEvent("checkout_success_reconciled", {
    organizationId: context.organization.id,
    checkoutSessionId: session.id,
    stripeSubscriptionId: subscription.id,
    applied: syncResult.applied,
    ignoredReason: syncResult.ignoredReason,
  });

  return syncResult;
}

export async function createBillingPortalSession() {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);
  const stripeProvider = getStripeBillingProvider();

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for billing portal access.", "unauthorized");
  }

  if (!stripeProvider.isConfigured()) {
    throw new ApiError(503, "Stripe is not configured yet.", "stripe_not_configured");
  }

  const billingClient = createAdminClient() ?? supabase;
  const { data, error } = await billingClient
    .from("billing_subscriptions")
    .select("stripe_customer_id")
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "billing_subscription_fetch_failed");
  }

  const billingRow = data as Pick<BillingRow, "stripe_customer_id"> | null;
  const customerId =
    typeof billingRow?.stripe_customer_id === "string" ? billingRow.stripe_customer_id : null;

  if (!customerId) {
    throw new ApiError(
      409,
      "A Stripe customer does not exist for this workspace yet.",
      "billing_portal_customer_missing",
    );
  }

  const urls = getBillingPortalUrls();
  const session = (await stripeProvider.execute({
    action: "create_billing_portal_session",
    idempotencyKey: `dealflow_portal_${context.organization.id}_${crypto.randomUUID()}`,
    params: {
      customer: customerId,
      return_url: urls.returnUrl,
    },
  })) as Stripe.BillingPortal.Session;

  return { url: session.url };
}

export async function syncBillingSubscriptionFromStripe(
  subscription: Stripe.Subscription,
  source: StripeSubscriptionSyncSource = {
    eventId: null,
    eventCreated: Math.floor(Date.now() / 1000),
    eventType: null,
  },
) {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const organizationId = subscription.metadata.organization_id;

  if (!organizationId) {
    throw new ApiError(400, "Stripe subscription is missing organization metadata.", "stripe_metadata_missing");
  }

  const planTier = getActivePlanTier(subscription);
  const priceConfig = getStripePlanPriceConfiguration(planTier);
  if (!priceConfig) {
    throw new ApiError(
      400,
      "Stripe subscription plan is missing required DealFlow price configuration.",
      "stripe_price_missing",
    );
  }
  const primaryItem = getSubscriptionItemByPriceId(subscription, priceConfig.primaryPriceId);
  const meteredItem = getSubscriptionItemByPriceId(subscription, priceConfig.meteredPriceId);
  if (planTier === "performance" && (!priceConfig.meteredPriceId || !meteredItem)) {
    throw new ApiError(
      400,
      "Performance subscription is missing the metered lead subscription item.",
      "stripe_performance_metered_item_missing",
    );
  }
  const periodItem = primaryItem ?? subscription.items.data[0];
  const priceId = priceConfig.primaryPriceId;
  const periodEnd =
    subscription.status === "trialing" && subscription.trial_end
      ? subscription.trial_end
      : periodItem?.current_period_end;
  const currentPeriodEndIso = periodEnd
    ? new Date(periodEnd * 1000).toISOString()
    : null;
  const subscriptionMetadata = {
    ...subscription.metadata,
    price_signature: priceConfig.priceSignature,
    price_ids: priceConfig.priceIds,
    ...(planTier === "performance"
      ? {
          performance_base_price_id: priceConfig.primaryPriceId,
          performance_base_subscription_item_id: primaryItem?.id ?? null,
          performance_metered_price_id: priceConfig.meteredPriceId,
          performance_subscription_item_id: meteredItem?.id ?? null,
          performance_meter_event_name: priceConfig.meterEventName ?? "dealflow_billable_lead",
        }
      : {}),
  } satisfies Json;
  const subscriptionRow: BillingInsert = {
    organization_id: organizationId,
    user_id: subscription.metadata.user_id || null,
    stripe_customer_id:
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    plan_tier: planTier,
    status: subscription.status,
    current_period_start: periodItem?.current_period_start
      ? new Date(periodItem.current_period_start * 1000).toISOString()
      : null,
    current_period_end: currentPeriodEndIso,
    cancel_at_period_end: subscription.cancel_at_period_end,
    metadata: subscriptionMetadata,
  };

  const { data: applyRows, error: billingError } = await (admin as any).rpc(
    "apply_billing_subscription_webhook",
    {
      p_organization_id: subscriptionRow.organization_id,
      p_user_id: subscriptionRow.user_id,
      p_stripe_customer_id: subscriptionRow.stripe_customer_id,
      p_stripe_subscription_id: subscriptionRow.stripe_subscription_id,
      p_stripe_price_id: subscriptionRow.stripe_price_id,
      p_plan_tier: subscriptionRow.plan_tier,
      p_status: subscriptionRow.status,
      p_current_period_start: subscriptionRow.current_period_start,
      p_current_period_end: subscriptionRow.current_period_end,
      p_cancel_at_period_end: subscriptionRow.cancel_at_period_end,
      p_metadata: subscriptionRow.metadata,
      p_stripe_event_id: source.eventId,
      p_stripe_event_created: source.eventCreated,
    },
  );

  if (billingError) {
    throw new ApiError(500, billingError.message, "billing_subscription_sync_failed");
  }

  const applyResult = Array.isArray(applyRows)
    ? (applyRows[0] as BillingSubscriptionWebhookApplyResult | undefined)
    : (applyRows as BillingSubscriptionWebhookApplyResult | null);

  if (applyResult && !applyResult.applied) {
    logWarn("stripe_subscription_stale_event_ignored", {
      eventId: source.eventId,
      eventType: source.eventType,
      eventCreated: source.eventCreated,
      latestEventCreated: applyResult.latest_event_created,
      organizationId,
      stripeSubscriptionId: subscription.id,
      reason: applyResult.ignored_reason,
    });
    return {
      applied: false,
      ignoredReason: applyResult.ignored_reason ?? "stale_event",
    };
  }

  const { error: organizationError } = await admin
    .from("organizations")
    .update({
      plan_tier: getOrganizationPlanForStatus(planTier, subscription.status),
    } as never)
    .eq("id", organizationId);

  if (organizationError) {
    throw new ApiError(500, organizationError.message, "organization_plan_update_failed");
  }

  const entitlementState = evaluateCampaignEntitlements({
    row: {
      plan_tier: subscriptionRow.plan_tier,
      status: subscriptionRow.status ?? "inactive",
      current_period_end: subscriptionRow.current_period_end,
      cancel_at_period_end: subscriptionRow.cancel_at_period_end ?? false,
    },
    fallbackPlanTier: planTier,
  });

  if (entitlementState.requiresSuspension) {
    await queueSubscriptionSuspensionJobsForOrganization({
      organizationId,
      reason: entitlementState.suspensionReason ?? "subscription_inactive",
      source: source.eventType ?? "stripe_subscription_sync",
      stripeSubscriptionId: subscription.id,
      billingEndedAt: currentPeriodEndIso ?? new Date().toISOString(),
    }).catch((error) => {
      logError("subscription_suspension_queue_failed", {
        organizationId,
        stripeSubscriptionId: subscription.id,
        eventId: source.eventId,
        message: error instanceof Error ? error.message : "Unknown suspension queue failure",
      });
    });
  }

  return {
    applied: true,
    ignoredReason: null,
  };
}

async function syncBillingSubscriptionFromEventObject(event: Stripe.Event) {
  const object = event.data.object;
  const stripeObject = object as { object?: string; subscription?: unknown };
  const source = {
    eventId: event.id,
    eventCreated: event.created,
    eventType: event.type,
  };

  if (stripeObject.object === "subscription") {
    const subscriptionId = typeof (object as Stripe.Subscription).id === "string"
      ? (object as Stripe.Subscription).id
      : null;

    if (subscriptionId) {
      try {
        const provider = getStripeBillingProvider();
        const subscription = (await provider.execute({
          action: "retrieve_subscription",
          subscriptionId,
        })) as Stripe.Subscription;
        return syncBillingSubscriptionFromStripe(subscription, source);
      } catch (error) {
        logWarn("stripe_subscription_refresh_failed_using_event_payload", {
          eventId: event.id,
          eventType: event.type,
          subscriptionId,
          message: error instanceof Error ? error.message : "Unknown subscription refresh failure",
        });
      }
    }

    return syncBillingSubscriptionFromStripe(object as Stripe.Subscription, source);
  }

  let subscriptionId: string | null = null;
  if (stripeObject.object === "checkout.session" && typeof stripeObject.subscription === "string") {
    subscriptionId = stripeObject.subscription;
  }
  if (stripeObject.object === "invoice" && typeof stripeObject.subscription === "string") {
    subscriptionId = stripeObject.subscription;
  }

  if (!subscriptionId) {
    return {
      applied: false,
      ignoredReason: "subscription_missing",
    };
  }

  const provider = getStripeBillingProvider();
  const subscription = (await provider.execute({
    action: "retrieve_subscription",
    subscriptionId,
  })) as Stripe.Subscription;

  return syncBillingSubscriptionFromStripe(subscription, source);
}

function isCreditTopUpCheckoutSession(object: Stripe.Event.Data.Object): object is Stripe.Checkout.Session {
  const checkoutObject = object as { object?: unknown; metadata?: Record<string, string> | null };

  return (
    checkoutObject.object === "checkout.session" &&
    checkoutObject.metadata?.checkout_kind === "credit_top_up"
  );
}

async function applyCreditTopUpCheckoutSession(session: Stripe.Checkout.Session, event: Stripe.Event) {
  if (session.mode !== "payment") {
    throw new ApiError(400, "Credit top-up checkout session is not a payment session.", "credit_checkout_mode_invalid");
  }

  if (session.payment_status !== "paid") {
    throw new ApiError(409, "Credit top-up checkout session has not been paid.", "credit_checkout_unpaid");
  }

  const organizationId =
    typeof session.metadata?.organization_id === "string" ? session.metadata.organization_id : null;
  const userId = typeof session.metadata?.user_id === "string" ? session.metadata.user_id : null;
  const amountCents = Number.parseInt(session.metadata?.credit_amount_cents ?? "", 10);

  if (!organizationId || !userId || !Number.isFinite(amountCents) || amountCents < CREDIT_TOP_UP_MINIMUM_CENTS) {
    throw new ApiError(400, "Credit top-up checkout metadata is invalid.", "credit_checkout_metadata_invalid");
  }

  const result = await grantUserCredits({
    userId,
    organizationId,
    amount: amountCents,
    reason: "stripe_credit_top_up",
    referenceType: "stripe_checkout_session",
    referenceId: session.id,
    idempotencyKey: `stripe_credit_top_up:${session.id}`,
    metadata: {
      stripeEventId: event.id,
      paymentIntent:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
      livemode: event.livemode,
    },
  });

  logOperationalEvent("stripe_credit_top_up_processed", {
    eventId: event.id,
    checkoutSessionId: session.id,
    organizationId,
    userId,
    amountCents,
    ledgerId: result.ledgerId,
    reusedExisting: result.reusedExisting,
  });

  return result;
}

export async function handleStripeBillingEvent(event: Stripe.Event) {
  const claim = await claimStripeWebhookEvent(event);

  if (claim.status === "duplicate") {
    logOperationalEvent("stripe_webhook_duplicate_ignored", {
      eventId: event.id,
      eventType: event.type,
      persistedStatus: claim.row?.status ?? null,
    });
    return {
      duplicate: true,
      processed: false,
    };
  }

  try {
    if (
      event.type === "checkout.session.completed" &&
      isCreditTopUpCheckoutSession(event.data.object)
    ) {
      await applyCreditTopUpCheckoutSession(event.data.object, event);
      await markStripeWebhookEvent({
        eventId: event.id,
        status: "processed",
      });

      return {
        duplicate: false,
        processed: true,
      };
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted" ||
      event.type === "checkout.session.completed" ||
      event.type === "invoice.payment_succeeded" ||
      event.type === "invoice.payment_failed"
    ) {
      const syncResult = await syncBillingSubscriptionFromEventObject(event);

      if (!syncResult.applied) {
        await markStripeWebhookEvent({
          eventId: event.id,
          status: "ignored",
          errorMessage:
            syncResult.ignoredReason === "subscription_missing"
              ? "No subscription was attached to this Stripe event."
              : "A newer Stripe subscription event has already been applied.",
        });

        return {
          duplicate: false,
          processed: false,
        };
      }

      await markStripeWebhookEvent({
        eventId: event.id,
        status: "processed",
      });

      logOperationalEvent("stripe_webhook_processed", {
        eventId: event.id,
        eventType: event.type,
        organizationId: getStripeWebhookOrganizationId(event),
        stripeSubscriptionId: getStripeSubscriptionId(event),
      });

      return {
        duplicate: false,
        processed: true,
      };
    }

    await markStripeWebhookEvent({
      eventId: event.id,
      status: "ignored",
    });

    logWarn("stripe_webhook_ignored", {
      eventId: event.id,
      eventType: event.type,
      reason: "unsupported_event_type",
    });

    return {
      duplicate: false,
      processed: false,
    };
  } catch (error) {
    await markStripeWebhookEvent({
      eventId: event.id,
      status: "failed",
      errorCode:
        error instanceof ApiError
          ? error.code ?? "stripe_webhook_processing_failed"
          : "stripe_webhook_processing_failed",
      errorMessage: error instanceof Error ? error.message : "Unknown Stripe webhook error.",
    });

    logError("stripe_webhook_processing_failed", {
      eventId: event.id,
      eventType: event.type,
      organizationId: getStripeWebhookOrganizationId(event),
      stripeSubscriptionId: getStripeSubscriptionId(event),
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}
