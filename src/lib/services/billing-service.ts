import Stripe from "stripe";
import { ApiError } from "@/lib/api/route";
import { isInternalAdminEmail } from "@/lib/env";
import { logError, logOperationalEvent, logWarn } from "@/lib/logging";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/services/app-context";
import {
  buildStripeCheckoutMetadata,
  getCheckoutUrls,
  getPlanTierFromPriceId,
  getStripePriceId,
} from "@/lib/integrations/stripe/service";
import { getStripeBillingProvider } from "@/lib/integrations/stripe/provider";
import {
  hasFeatureAccess,
  normalizeBillingPlanTier,
  type BillingFeature,
  type BillingPlanTier,
} from "@/lib/billing/plans";
import type { Database, Json } from "@/lib/supabase/types";

type BillingRow = Database["public"]["Tables"]["billing_subscriptions"]["Row"];
type BillingInsert = Database["public"]["Tables"]["billing_subscriptions"]["Insert"];
type StripeWebhookEventRow = Database["public"]["Tables"]["stripe_webhook_events"]["Row"];
type StripeWebhookEventInsert = Database["public"]["Tables"]["stripe_webhook_events"]["Insert"];

export type BillingSummary = {
  planTier: BillingPlanTier;
  subscriptionStatus: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  launchAllowed: boolean;
  launchOverride: boolean;
};

const BILLING_ACTIVE_STATUSES = new Set(["active", "trialing"]);
const STRIPE_WEBHOOK_HANDLED_STATUSES = new Set(["processed", "ignored", "processing"]);

type StripeWebhookClaimResult =
  | {
      status: "claimed";
      row: StripeWebhookEventRow | null;
    }
  | {
      status: "duplicate";
      row: StripeWebhookEventRow | null;
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
  if (event.data.object.object !== "subscription") {
    return null;
  }

  const organizationId = event.data.object.metadata?.organization_id;
  return typeof organizationId === "string" && organizationId.length > 0 ? organizationId : null;
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

  const { data: reclaimedRow, error: reclaimError } = await admin
    .from("stripe_webhook_events")
    .update({
      status: "processing",
      error_code: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("stripe_event_id", event.id)
    .eq("status", "failed")
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

  return {
    status: "duplicate",
    row: existingRow,
  };
}

function mapBillingRow(row: BillingRow | null, fallbackPlanTier: string): BillingSummary {
  const normalizedPlanTier = normalizeBillingPlanTier(row?.plan_tier ?? fallbackPlanTier);
  const subscriptionStatus = row?.status ?? "inactive";

  return {
    planTier: normalizedPlanTier,
    subscriptionStatus,
    stripeCustomerId: row?.stripe_customer_id ?? null,
    stripeSubscriptionId: row?.stripe_subscription_id ?? null,
    currentPeriodEnd: row?.current_period_end ?? null,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
    launchAllowed:
      BILLING_ACTIVE_STATUSES.has(subscriptionStatus) && hasFeatureAccess(normalizedPlanTier, "meta_launch"),
    launchOverride: false,
  };
}

function getActivePlanTier(subscription: Stripe.Subscription) {
  const firstItem = subscription.items.data[0];
  const priceId = typeof firstItem?.price?.id === "string" ? firstItem.price.id : null;
  const metadataTier = subscription.metadata.plan_tier;
  return normalizeBillingPlanTier(metadataTier || getPlanTierFromPriceId(priceId));
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

  const { data, error } = await supabase
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

  const launchOverride = isInternalAdminEmail(context.user.email ?? context.profile?.email ?? null);

  return {
    ...summary,
    launchAllowed: summary.launchAllowed || launchOverride,
    launchOverride,
  };
}

export async function assertBillingFeatureAccess(feature: BillingFeature) {
  const summary = await getBillingSummary();

  if (!hasFeatureAccess(summary.planTier, feature)) {
    throw new ApiError(
      403,
      feature === "meta_launch"
        ? "Upgrade to Pro to launch live campaigns from this app."
        : feature === "campaign_data_import"
          ? "Upgrade to Growth to use campaign data imports and advanced intelligence."
          : "Upgrade to Pro to use the autonomous campaign operator.",
      "billing_feature_restricted",
    );
  }

  return summary;
}

export async function assertMetaLaunchBillingAccess() {
  const summary = await getBillingSummary();

  if (summary.launchAllowed) {
    return summary;
  }

  throw new ApiError(
    402,
    "An active Pro subscription is required before this campaign can launch.",
    "billing_launch_payment_required",
  );
}

export async function createBillingCheckoutSession(params: {
  planTier: BillingPlanTier;
  customerName?: string;
  customerEmail?: string;
}) {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);
  const stripeProvider = getStripeBillingProvider();

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for checkout.", "unauthorized");
  }

  if (!stripeProvider.isConfigured()) {
    throw new ApiError(503, "Stripe is not configured yet.", "stripe_not_configured");
  }

  const priceId = getStripePriceId(params.planTier);

  if (!priceId) {
    throw new ApiError(503, "The selected plan is not configured in Stripe.", "stripe_price_missing");
  }

  const { data: existingSubscription, error: existingSubscriptionError } = await supabase
    .from("billing_subscriptions")
    .select("*")
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (existingSubscriptionError) {
    throw new ApiError(500, existingSubscriptionError.message, "billing_subscription_fetch_failed");
  }

  let customerId = (existingSubscription as BillingRow | null)?.stripe_customer_id ?? null;

  if (!customerId) {
    const customer = await stripeProvider.execute({
      action: "create_customer",
      params: {
        email: params.customerEmail || context.user.email || undefined,
        name: params.customerName || context.organization.name || undefined,
        metadata: {
          organization_id: context.organization.id,
          user_id: context.user.id,
        },
      },
    });
    customerId = customer.id;
  }

  const urls = getCheckoutUrls();
  const metadata = buildStripeCheckoutMetadata({
    organizationId: context.organization.id,
    userId: context.user.id,
    planTier: params.planTier,
  });
  const session = (await stripeProvider.execute({
    action: "create_checkout_session",
    params: {
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: urls.successUrl,
      cancel_url: urls.cancelUrl,
      allow_promotion_codes: true,
      metadata,
      subscription_data: {
        metadata,
      },
    },
  })) as Stripe.Checkout.Session;

  const upsertRow: BillingInsert = {
    organization_id: context.organization.id,
    user_id: context.user.id,
    stripe_customer_id: customerId,
    stripe_checkout_session_id: session.id,
    plan_tier: params.planTier,
    status: "checkout_started",
    metadata: {
      last_checkout_session_id: session.id,
    },
  };

  const { error: upsertError } = await supabase.from("billing_subscriptions").upsert(upsertRow as never, {
    onConflict: "organization_id",
  });

  if (upsertError) {
    throw new ApiError(500, upsertError.message, "billing_subscription_upsert_failed");
  }

  return { url: session.url, sessionId: session.id };
}

export async function syncBillingSubscriptionFromStripe(subscription: Stripe.Subscription) {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const organizationId = subscription.metadata.organization_id;

  if (!organizationId) {
    throw new ApiError(400, "Stripe subscription is missing organization metadata.", "stripe_metadata_missing");
  }

  const firstItem = subscription.items.data[0];
  const priceId = typeof firstItem?.price?.id === "string" ? firstItem.price.id : null;
  const planTier = getActivePlanTier(subscription);
  const subscriptionRow: BillingInsert = {
    organization_id: organizationId,
    user_id: subscription.metadata.user_id || null,
    stripe_customer_id:
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    plan_tier: planTier,
    status: subscription.status,
    current_period_start: subscription.items.data[0]?.current_period_start
      ? new Date(subscription.items.data[0].current_period_start * 1000).toISOString()
      : null,
    current_period_end: subscription.items.data[0]?.current_period_end
      ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    metadata: subscription.metadata,
  };

  const { error: billingError } = await admin.from("billing_subscriptions").upsert(subscriptionRow as never, {
    onConflict: "organization_id",
  });

  if (billingError) {
    throw new ApiError(500, billingError.message, "billing_subscription_sync_failed");
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
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await syncBillingSubscriptionFromStripe(event.data.object as Stripe.Subscription);
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
