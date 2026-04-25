import Stripe from "stripe";
import { ApiError } from "@/lib/api/route";
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
import type { Database } from "@/lib/supabase/types";

type BillingRow = Database["public"]["Tables"]["billing_subscriptions"]["Row"];
type BillingInsert = Database["public"]["Tables"]["billing_subscriptions"]["Insert"];

export type BillingSummary = {
  planTier: BillingPlanTier;
  subscriptionStatus: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

function mapBillingRow(row: BillingRow | null, fallbackPlanTier: string): BillingSummary {
  return {
    planTier: normalizeBillingPlanTier(row?.plan_tier ?? fallbackPlanTier),
    subscriptionStatus: row?.status ?? "inactive",
    stripeCustomerId: row?.stripe_customer_id ?? null,
    stripeSubscriptionId: row?.stripe_subscription_id ?? null,
    currentPeriodEnd: row?.current_period_end ?? null,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
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

  return mapBillingRow((data as BillingRow | null) ?? null, context.organization.plan_tier);
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
        name: params.customerName || context.organization.name,
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
