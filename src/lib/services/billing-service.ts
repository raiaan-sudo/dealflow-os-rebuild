import Stripe from "stripe";
import { ApiError } from "@/lib/api/route";
import {
  getStripeEnv,
  isBillingAdminOverrideEnabled,
  isInternalAdminEmail,
} from "@/lib/env";
import { logError, logOperationalEvent, logWarn } from "@/lib/logging";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/services/app-context";
import {
  buildStripeCheckoutMetadata,
  getBillingPortalUrls,
  getCheckoutUrls,
  getStripePriceId,
} from "@/lib/integrations/stripe/service";
import { getStripeBillingProvider } from "@/lib/integrations/stripe/provider";
import {
  hasFeatureAccess,
  type BillingFeature,
  type BillingPlanTier,
} from "@/lib/billing/plans";
import {
  getStripeSubscriptionPersistenceDecision,
  resolveStripeSubscriptionPlanTier,
} from "@/lib/billing/stripe-plan-resolution";
import {
  CREDIT_TOP_UP_MINIMUM_CENTS,
  recordCommercialActivationWithInitialCredit,
} from "@/lib/services/credit-service";
import {
  evaluateCampaignEntitlements,
  type BillingLifecycleState,
} from "@/lib/services/campaign-entitlements";
import {
  evaluateCommercialActivationCandidate,
  type CommercialActivationCandidate,
} from "@/lib/commercial-activation-policy";
import type { Database, Json } from "@/lib/supabase/types";

type BillingRow = Database["public"]["Tables"]["billing_subscriptions"]["Row"];
type BillingInsert = Database["public"]["Tables"]["billing_subscriptions"]["Insert"];
type StripeWebhookEventRow = Database["public"]["Tables"]["stripe_webhook_events"]["Row"];

type BillingSubscriptionWebhookApplyResult = {
  applied: boolean;
  ignored_reason: string | null;
  latest_event_created: number | null;
};

export type BillingSummary = {
  billingState: BillingLifecycleState;
  planTier: BillingPlanTier;
  subscriptionStatus: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  launchAllowed: boolean;
  launchOverride: boolean;
};

const STRIPE_WEBHOOK_PROCESSING_STALE_MS = 5 * 60_000;
const CHECKOUT_SESSION_REUSE_MS = 30 * 60_000;

type StripeWebhookClaimResult =
  | {
      status: "claimed";
      row: StripeWebhookEventRow | null;
      claimToken: string;
      claimGeneration: number;
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

export function assertStripeObjectRuntimeMode(
  object: { livemode?: boolean | null },
  objectLabel: string,
) {
  const stripeEnv = getStripeEnv();

  if (!stripeEnv) {
    throw new ApiError(
      503,
      "Stripe runtime mode is not configured safely.",
      "stripe_runtime_mode_not_configured",
    );
  }

  if (object.livemode !== stripeEnv.livemode) {
    throw new ApiError(
      409,
      `${objectLabel} belongs to a different Stripe runtime mode.`,
      "stripe_runtime_mode_mismatch",
    );
  }
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

function getBillingAdminOverrideEmail(context: Awaited<ReturnType<typeof getAppContext>>) {
  if (!context || !isBillingAdminOverrideEnabled()) {
    return null;
  }

  const email = context.user.email ?? context.profile?.email ?? null;
  return isInternalAdminEmail(email) ? email : null;
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

export async function markStripeWebhookEvent(params: {
  eventId: string;
  claimToken: string;
  claimGeneration: number;
  status: "processed" | "ignored" | "failed";
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await (admin as any).rpc(
    "settle_stripe_webhook_event_v2",
    {
      p_stripe_event_id: params.eventId,
      p_claim_token: params.claimToken,
      p_claim_generation: params.claimGeneration,
      p_status: params.status,
      p_error_code: params.errorCode ?? null,
      p_error_message: params.errorMessage ?? null,
    },
  );

  if (error) {
    throw new ApiError(500, error.message, "stripe_webhook_event_update_failed");
  }

  if (data !== true) {
    throw new ApiError(
      409,
      "Stripe webhook processing ownership was lost before settlement.",
      "stripe_webhook_event_lease_lost",
    );
  }
}

export async function claimStripeWebhookEvent(event: Stripe.Event): Promise<StripeWebhookClaimResult> {
  assertStripeObjectRuntimeMode(event, "Stripe webhook event");
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const claimToken = crypto.randomUUID();
  const { data, error } = await (admin as any).rpc(
    "claim_stripe_webhook_event_v2",
    {
      p_stripe_event_id: event.id,
      p_stripe_event_type: event.type,
      p_stripe_object_id: getStripeObjectId(event),
      p_organization_id: getStripeWebhookOrganizationId(event),
      p_stripe_subscription_id: getStripeSubscriptionId(event),
      p_payload: {
        api_version: event.api_version ?? null,
        created: event.created,
        livemode: event.livemode,
      } satisfies Json,
      p_claim_token: claimToken,
      p_lease_ms: STRIPE_WEBHOOK_PROCESSING_STALE_MS,
    },
  );

  if (error) {
    if (/stripe_webhook_event_identity_collision/i.test(error.message)) {
      throw new ApiError(
        409,
        "Stripe event identity conflicts with the existing webhook receipt.",
        "stripe_webhook_event_identity_collision",
      );
    }

    throw new ApiError(500, error.message, "stripe_webhook_event_claim_failed");
  }

  const result = (Array.isArray(data) ? data[0] : data) as {
    claim_outcome?: "claimed" | "duplicate" | "busy";
    receipt_id?: string | null;
    receipt_status?: string | null;
    claim_token?: string | null;
    claim_generation?: number | null;
    locked_until?: string | null;
  } | null;
  const row = result?.receipt_id
    ? ({
        id: result.receipt_id,
        stripe_event_id: event.id,
        stripe_event_type: event.type,
        stripe_object_id: getStripeObjectId(event),
        organization_id: getStripeWebhookOrganizationId(event),
        stripe_subscription_id: getStripeSubscriptionId(event),
        status: result.receipt_status ?? "processing",
        processing_claim_token: result.claim_token ?? null,
        processing_claim_generation: result.claim_generation ?? 0,
        processing_locked_until: result.locked_until ?? null,
      } as StripeWebhookEventRow)
    : null;

  if (result?.claim_outcome === "duplicate") {
    return { status: "duplicate", row };
  }

  if (
    result?.claim_outcome === "claimed" &&
    result.claim_token === claimToken &&
    typeof result.claim_generation === "number" &&
    result.claim_generation >= 1
  ) {
    return {
      status: "claimed",
      row,
      claimToken,
      claimGeneration: result.claim_generation,
    };
  }

  throw new ApiError(
    503,
    "Stripe webhook event is already processing. Stripe should retry this event shortly.",
    "stripe_webhook_event_processing",
  );
}

function mapBillingRow(row: BillingRow | null, fallbackPlanTier: string): BillingSummary {
  const entitlements = evaluateCampaignEntitlements({
    row,
    fallbackPlanTier,
  });

  return {
    billingState: entitlements.billingState,
    planTier: entitlements.planTier,
    subscriptionStatus: entitlements.subscriptionStatus,
    stripeCustomerId: row?.stripe_customer_id ?? null,
    stripeSubscriptionId: row?.stripe_subscription_id ?? null,
    currentPeriodEnd: row?.current_period_end ?? null,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
    launchAllowed: entitlements.canLaunch,
    launchOverride: false,
  };
}

function getActivePlanTier(subscription: Stripe.Subscription) {
  return resolveStripeSubscriptionPlanTier({
    items: subscription.items.data.map((item) => ({
      priceId: typeof item.price?.id === "string" ? item.price.id : null,
      quantity: item.quantity,
    })),
    configuredPriceIds: {
      starter: getStripePriceId("starter"),
      pro: getStripePriceId("pro"),
      growth: getStripePriceId("growth"),
    },
    metadataPlanTier: subscription.metadata.plan_tier,
    legacyTierReconciled:
      subscription.metadata.legacy_plan_tier_reconciled === "true",
  });

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
    billingState: launchOverride ? "active" : summary.billingState,
    launchAllowed: summary.launchAllowed || launchOverride,
    launchOverride,
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

export async function assertActiveBillingFeatureAccess(feature: BillingFeature) {
  const summary = await assertBillingFeatureAccess(feature);

  if (
    summary.billingState === "active" ||
    summary.billingState === "grace_period" ||
    summary.launchOverride
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
    "An active Pro subscription is required before this campaign can launch.",
    "billing_launch_payment_required",
  );
}

export async function assertMetaLaunchBillingAccessForOrganization(
  organizationId: string,
  options?: { allowSessionOverride?: boolean },
) {
  const summary = await getBillingSummaryForOrganization(organizationId);

  if (summary.launchAllowed) {
    return summary;
  }

  if (options?.allowSessionOverride === false) {
    throw new ApiError(
      402,
      "An active Pro subscription is required before this campaign can launch.",
      "billing_launch_payment_required",
    );
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
      billingState: "active",
      launchAllowed: true,
      launchOverride: true,
    };
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

  const billingClient = createAdminClient() ?? supabase;
  const priceId = getStripePriceId(params.planTier);

  if (!priceId) {
    throw new ApiError(503, "The selected plan is not configured in Stripe.", "stripe_price_missing");
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

  const urls = getCheckoutUrls();
  const metadata = buildStripeCheckoutMetadata({
    organizationId: context.organization.id,
    userId: context.user.id,
    planTier: params.planTier,
  });

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

  if (
    customerId &&
    existingBillingRow?.stripe_checkout_session_id &&
    lastCheckoutPlanTier === params.planTier &&
    Number.isFinite(lastCheckoutCreatedAt) &&
    Date.now() - lastCheckoutCreatedAt < CHECKOUT_SESSION_REUSE_MS
  ) {
    try {
      const reusableSession = (await stripeProvider.execute({
        action: "retrieve_checkout_session",
        sessionId: existingBillingRow.stripe_checkout_session_id,
      })) as Stripe.Checkout.Session;
      assertStripeObjectRuntimeMode(reusableSession, "Stripe Checkout Session");
      const sessionCustomerId = getStripeCustomerIdFromSession(reusableSession);

      if (
        reusableSession.status === "open" &&
        reusableSession.url &&
        sessionCustomerId === customerId
      ) {
        logOperationalEvent("billing_checkout_session_reused", {
          organizationId: context.organization.id,
          checkoutSessionId: reusableSession.id,
          planTier: params.planTier,
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

  const createCheckoutSession = async (stripeCustomerId: string) => {
    const createdSession = (await stripeProvider.execute({
      action: "create_checkout_session",
      idempotencyKey: `dealflow_checkout_${context.organization.id}_${params.planTier}_${Math.floor(
        Date.now() / CHECKOUT_SESSION_REUSE_MS,
      )}`,
      params: {
        mode: "subscription",
        customer: stripeCustomerId,
        client_reference_id: context.organization.id,
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
    assertStripeObjectRuntimeMode(createdSession, "Stripe Checkout Session");
    return createdSession;
  };

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

  const billingClient = createAdminClient();

  if (!billingClient) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
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

  const creditTopUpIntentId = crypto.randomUUID();
  const { error: intentError } = await (billingClient as any).rpc(
    "create_credit_top_up_intent_v1",
    {
      p_intent_id: creditTopUpIntentId,
      p_organization_id: context.organization.id,
      p_user_id: context.user.id,
      p_amount_cents: amountCents,
      p_currency: "usd",
      p_stripe_customer_id: customerId,
    },
  );

  if (intentError) {
    throw new ApiError(500, intentError.message, "credit_top_up_intent_create_failed");
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const metadata = {
    checkout_kind: "credit_top_up",
    credit_top_up_intent_id: creditTopUpIntentId,
  };

  const session = (await stripeProvider.execute({
    action: "create_checkout_session",
    idempotencyKey: `dealflow_credit_top_up_${creditTopUpIntentId}`,
    params: {
      mode: "payment",
      customer: customerId,
      client_reference_id: context.organization.id,
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
  assertStripeObjectRuntimeMode(session, "Stripe credit Checkout Session");

  const { error: bindError } = await (billingClient as any).rpc(
    "bind_credit_top_up_checkout_v1",
    {
      p_intent_id: creditTopUpIntentId,
      p_organization_id: context.organization.id,
      p_user_id: context.user.id,
      p_stripe_checkout_session_id: session.id,
    },
  );

  if (bindError) {
    throw new ApiError(500, bindError.message, "credit_top_up_checkout_bind_failed");
  }

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
  assertStripeObjectRuntimeMode(session, "Stripe Checkout Session");

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
  assertStripeObjectRuntimeMode(subscription, "Stripe subscription");

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
  assertStripeObjectRuntimeMode(session, "Stripe Billing Portal Session");

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
  assertStripeObjectRuntimeMode(subscription, "Stripe subscription");
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const organizationId = subscription.metadata.organization_id;

  if (!organizationId) {
    if (subscription.metadata.checkout_flow === "access_key") {
      logOperationalEvent("stripe_access_key_subscription_waiting_for_claim", {
        stripeSubscriptionId: subscription.id,
        accessKeyId: subscription.metadata.access_key_id ?? null,
        sourceEventId: source.eventId,
        sourceEventType: source.eventType,
      });
      return {
        applied: false,
        ignoredReason: "access_key_pending_claim",
        organizationId: null,
        userId: null,
        stripeSubscriptionId: subscription.id,
      };
    }

    throw new ApiError(400, "Stripe subscription is missing organization metadata.", "stripe_metadata_missing");
  }

  const planResolution = getActivePlanTier(subscription);
  const activeSubscriptionItems = subscription.items.data.filter((item) => item.quantity !== 0);
  const subscriptionItem = planResolution.ok
    ? subscription.items.data[planResolution.itemIndex]
    : activeSubscriptionItems.length === 1
      ? activeSubscriptionItems[0]
      : null;
  const priceId = planResolution.ok
    ? planResolution.priceId
    : typeof subscriptionItem?.price?.id === "string"
      ? subscriptionItem.price.id
      : null;
  const persistenceDecision = getStripeSubscriptionPersistenceDecision({
    resolution: planResolution,
    authoritativeStatus: subscription.status,
  });
  const planTier = persistenceDecision.planTier;
  const persistedStatus = persistenceDecision.status;
  const persistedMetadata = planResolution.ok
    ? subscription.metadata
    : {
        ...subscription.metadata,
        billing_reconciliation_reason: planResolution.reason,
        authoritative_subscription_status: subscription.status,
        observed_active_price_ids: activeSubscriptionItems
          .map((item) => item.price?.id)
          .filter((price): price is string => typeof price === "string")
          .join(","),
      };
  const subscriptionRow: BillingInsert = {
    organization_id: organizationId,
    user_id: subscription.metadata.user_id || null,
    stripe_customer_id:
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    plan_tier: planTier,
    status: persistedStatus,
    current_period_start: planResolution.ok && subscriptionItem?.current_period_start
      ? new Date(subscriptionItem.current_period_start * 1000).toISOString()
      : null,
    current_period_end: planResolution.ok && subscriptionItem?.current_period_end
      ? new Date(subscriptionItem.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: planResolution.ok && subscription.cancel_at_period_end,
    metadata: persistedMetadata,
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
      organizationId,
      userId: subscription.metadata.user_id || null,
      stripeSubscriptionId: subscription.id,
    };
  }

  if (!planResolution.ok) {
    logError("stripe_subscription_operator_reconciliation_required", {
      eventId: source.eventId,
      eventType: source.eventType,
      eventCreated: source.eventCreated,
      organizationId,
      stripeSubscriptionId: subscription.id,
      reason: planResolution.reason,
      observedActivePriceIds: activeSubscriptionItems
        .map((item) => item.price?.id)
        .filter((price): price is string => typeof price === "string"),
    });
  }

  return {
    applied: true,
    ignoredReason: null,
    organizationId,
    userId: subscription.metadata.user_id || null,
    stripeSubscriptionId: subscription.id,
    reconciliationReason: planResolution.ok ? null : planResolution.reason,
  };
}

export async function retrieveAuthoritativeStripeSubscriptionForEvent(
  event: Stripe.Event,
  retrieveSubscription: (subscriptionId: string) => Promise<Stripe.Subscription> = async (
    subscriptionId,
  ) => {
    const provider = getStripeBillingProvider();
    return (await provider.execute({
      action: "retrieve_subscription",
      subscriptionId,
    })) as Stripe.Subscription;
  },
) {
  assertStripeObjectRuntimeMode(event, "Stripe webhook event");
  const object = event.data.object;
  const stripeObject = object as { object?: string; subscription?: unknown };
  let subscriptionId: string | null = null;

  if (stripeObject.object === "subscription") {
    subscriptionId = typeof (object as Stripe.Subscription).id === "string"
      ? (object as Stripe.Subscription).id
      : null;
  }

  if (stripeObject.object === "checkout.session") {
    subscriptionId =
      typeof stripeObject.subscription === "string"
        ? stripeObject.subscription
        : stripeObject.subscription &&
            typeof stripeObject.subscription === "object" &&
            "id" in stripeObject.subscription &&
            typeof stripeObject.subscription.id === "string"
          ? stripeObject.subscription.id
          : null;
  }

  if (stripeObject.object === "invoice") {
    if (typeof stripeObject.subscription === "string") {
      subscriptionId = stripeObject.subscription;
    } else {
      const invoiceRecord = stripeObject as Record<string, unknown>;
      const parent =
        invoiceRecord.parent && typeof invoiceRecord.parent === "object"
          ? (invoiceRecord.parent as Record<string, unknown>)
          : null;
      const subscriptionDetails =
        parent?.subscription_details && typeof parent.subscription_details === "object"
          ? (parent.subscription_details as Record<string, unknown>)
          : null;
      const parentSubscription = subscriptionDetails?.subscription;
      subscriptionId =
        typeof parentSubscription === "string"
          ? parentSubscription
          : parentSubscription && typeof parentSubscription === "object" && "id" in parentSubscription && typeof parentSubscription.id === "string"
            ? parentSubscription.id
            : null;
    }
  }

  if (!subscriptionId) {
    return null;
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await retrieveSubscription(subscriptionId);
  } catch {
    logWarn("stripe_subscription_authoritative_refresh_ambiguous", {
      eventId: event.id,
      eventType: event.type,
      subscriptionId,
    });
    throw new ApiError(
      503,
      "Stripe subscription truth could not be confirmed. Stripe must retry this event.",
      "stripe_subscription_refresh_ambiguous",
    );
  }

  assertStripeObjectRuntimeMode(subscription, "Stripe subscription");
  return subscription;
}

async function syncBillingSubscriptionFromEventObject(event: Stripe.Event) {
  const source = {
    eventId: event.id,
    eventCreated: event.created,
    eventType: event.type,
  };
  const subscription = await retrieveAuthoritativeStripeSubscriptionForEvent(event);

  if (!subscription) {
    return {
      applied: false,
      ignoredReason: "subscription_missing",
      organizationId: null,
      userId: null,
      stripeSubscriptionId: null,
    };
  }

  return syncBillingSubscriptionFromStripe(subscription, source);
}

type BillingSyncResult = {
  applied: boolean;
  ignoredReason: string | null;
  organizationId: string | null;
  userId: string | null;
  stripeSubscriptionId: string | null;
  reconciliationReason?: string | null;
};

function getCommercialActivationCandidate(
  event: Stripe.Event,
  syncResult: BillingSyncResult,
): (CommercialActivationCandidate & {
  sourcePaymentId: string | null;
  sourceSubscriptionId: string | null;
  currency: string | null;
}) | null {
  const object = event.data.object as unknown as Stripe.Event.Data.Object & Record<string, unknown>;

  if (event.type === "checkout.session.completed" && object.object === "checkout.session") {
    const session = object as unknown as Stripe.Checkout.Session;
    assertStripeObjectRuntimeMode(session, "Stripe Checkout Session");
    return {
      source: "checkout.session.completed",
      billingStateApplied: syncResult.applied,
      organizationId: syncResult.organizationId,
      userId: syncResult.userId,
      sourceEventId: event.id,
      sourceEventCreated: event.created,
      amountPaidCents: typeof session.amount_total === "number" ? session.amount_total : 0,
      paymentStatus: session.payment_status ?? null,
      invoiceBillingReason: null,
      sourcePaymentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
      sourceSubscriptionId: syncResult.stripeSubscriptionId,
      currency: session.currency ?? null,
    };
  }

  if (event.type === "invoice.payment_succeeded" && object.object === "invoice") {
    const invoice = object as Record<string, unknown>;
    const payments =
      invoice.payments && typeof invoice.payments === "object"
        ? (invoice.payments as Record<string, unknown>)
        : null;
    const firstPayment = Array.isArray(payments?.data)
      ? (payments.data.find(
          (item) => item && typeof item === "object" && (item as Record<string, unknown>).status === "paid",
        ) as Record<string, unknown> | undefined)
      : undefined;
    const payment =
      firstPayment?.payment && typeof firstPayment.payment === "object"
        ? (firstPayment.payment as Record<string, unknown>)
        : null;
    const paymentIntent = invoice.payment_intent ?? payment?.payment_intent;
    return {
      source: "invoice.payment_succeeded",
      billingStateApplied: syncResult.applied,
      organizationId: syncResult.organizationId,
      userId: syncResult.userId,
      sourceEventId: event.id,
      sourceEventCreated: event.created,
      amountPaidCents: typeof invoice.amount_paid === "number" ? invoice.amount_paid : 0,
      paymentStatus: invoice.status === "paid" ? "paid" : null,
      invoiceBillingReason:
        typeof invoice.billing_reason === "string" ? invoice.billing_reason : null,
      sourcePaymentId:
        typeof paymentIntent === "string"
          ? paymentIntent
          : paymentIntent && typeof paymentIntent === "object" && "id" in paymentIntent && typeof paymentIntent.id === "string"
            ? paymentIntent.id
            : null,
      sourceSubscriptionId: syncResult.stripeSubscriptionId,
      currency: typeof invoice.currency === "string" ? invoice.currency : null,
    };
  }

  return null;
}

async function applyCommercialActivationFromStripePayment(
  event: Stripe.Event,
  syncResult: BillingSyncResult,
) {
  const candidate = getCommercialActivationCandidate(event, syncResult);

  if (!candidate) return null;

  const decision = evaluateCommercialActivationCandidate(candidate);

  if (!decision.eligible) {
    logOperationalEvent("commercial_activation_payment_ignored", {
      eventId: event.id,
      eventType: event.type,
      organizationId: candidate.organizationId,
      reason: decision.reason,
    });

    if (decision.reason === "identity_missing") {
      throw new ApiError(
        409,
        "Qualifying Stripe payment is missing the workspace user identity required for atomic activation credit.",
        "commercial_activation_identity_missing",
      );
    }

    return null;
  }

  const result = await recordCommercialActivationWithInitialCredit({
    organizationId: candidate.organizationId as string,
    userId: candidate.userId as string,
    sourceEventId: candidate.sourceEventId,
    sourceEventType: candidate.source,
    sourceEventCreated: candidate.sourceEventCreated,
    sourcePaymentId: candidate.sourcePaymentId,
    sourceSubscriptionId: candidate.sourceSubscriptionId,
    amountPaidCents: candidate.amountPaidCents,
    currency: candidate.currency,
    metadata: {
      livemode: event.livemode,
      qualification: decision.reason,
    },
  });

  logOperationalEvent("commercial_activation_payment_applied", {
    eventId: event.id,
    eventType: event.type,
    organizationId: candidate.organizationId,
    activationId: result.activationId,
    activationCreated: result.activationCreated,
    initialCreditGranted: result.initialCreditGranted,
    initialCreditAmountCents: result.initialCreditAmountCents,
    reusedExisting: result.reusedExisting,
  });

  return result;
}

async function resolveCommercialActivationBillingState(
  syncResult: BillingSyncResult,
): Promise<BillingSyncResult> {
  if (syncResult.applied || !/stale|older|out.of.order/i.test(syncResult.ignoredReason ?? "")) {
    return syncResult;
  }

  if (!syncResult.organizationId || !syncResult.stripeSubscriptionId) {
    return syncResult;
  }

  const admin = createAdminClient();
  if (!admin) {
    return syncResult;
  }

  const { data, error } = await admin
    .from("billing_subscriptions")
    .select("organization_id,user_id,stripe_subscription_id")
    .eq("organization_id", syncResult.organizationId)
    .eq("stripe_subscription_id", syncResult.stripeSubscriptionId)
    .maybeSingle();
  const row = data as
    | {
        organization_id?: string | null;
        user_id?: string | null;
        stripe_subscription_id?: string | null;
      }
    | null;

  if (
    error ||
    row?.organization_id !== syncResult.organizationId ||
    row?.stripe_subscription_id !== syncResult.stripeSubscriptionId ||
    !row?.user_id
  ) {
    return syncResult;
  }

  return {
    ...syncResult,
    applied: true,
    ignoredReason: "historical_payment_identity_verified",
    userId: row.user_id,
  };
}

function isCreditTopUpCheckoutSession(object: Stripe.Event.Data.Object): object is Stripe.Checkout.Session {
  const checkoutObject = object as { object?: unknown; metadata?: Record<string, string> | null };

  return (
    checkoutObject.object === "checkout.session" &&
    checkoutObject.metadata?.checkout_kind === "credit_top_up"
  );
}

async function applyCreditTopUpCheckoutSession(session: Stripe.Checkout.Session, event: Stripe.Event) {
  assertStripeObjectRuntimeMode(session, "Stripe credit Checkout Session");

  if (session.mode !== "payment") {
    throw new ApiError(400, "Credit top-up checkout session is not a payment session.", "credit_checkout_mode_invalid");
  }

  if (session.payment_status !== "paid") {
    throw new ApiError(409, "Credit top-up checkout session has not been paid.", "credit_checkout_unpaid");
  }

  if (session.status !== "complete") {
    throw new ApiError(409, "Credit top-up checkout session is incomplete.", "credit_checkout_incomplete");
  }

  const intentId =
    typeof session.metadata?.credit_top_up_intent_id === "string"
      ? session.metadata.credit_top_up_intent_id
      : null;
  const amountCents = typeof session.amount_total === "number" ? session.amount_total : null;
  const currency = typeof session.currency === "string" ? session.currency.toLowerCase() : null;
  const stripeCustomerId = getStripeCustomerIdFromSession(session);
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  if (
    !intentId ||
    !stripeCustomerId ||
    !Number.isInteger(amountCents) ||
    (amountCents as number) < CREDIT_TOP_UP_MINIMUM_CENTS ||
    currency !== "usd"
  ) {
    throw new ApiError(
      400,
      "Credit top-up authoritative payment fields are invalid.",
      "credit_checkout_payment_invalid",
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await (admin as any).rpc(
    "complete_credit_top_up_intent_v1",
    {
      p_intent_id: intentId,
      p_stripe_checkout_session_id: session.id,
      p_stripe_customer_id: stripeCustomerId,
      p_stripe_payment_intent_id: paymentIntentId,
      p_stripe_event_id: event.id,
      p_amount_total: amountCents,
      p_currency: currency,
      p_metadata: {
        livemode: event.livemode,
      },
    },
  );

  if (error) {
    throw new ApiError(409, error.message, "credit_top_up_intent_settlement_failed");
  }

  const result = (Array.isArray(data) ? data[0] : data) as {
    organization_id: string;
    user_id: string;
    amount_cents: number;
    balance: number;
    ledger_id: string;
    reused_existing: boolean;
  } | null;

  if (!result?.ledger_id) {
    throw new ApiError(500, "Credit top-up settlement returned no ledger receipt.", "credit_top_up_ledger_missing");
  }

  logOperationalEvent("stripe_credit_top_up_processed", {
    eventId: event.id,
    checkoutSessionId: session.id,
    organizationId: result.organization_id,
    userId: result.user_id,
    amountCents: result.amount_cents,
    ledgerId: result.ledger_id,
    reusedExisting: result.reused_existing,
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

  const settleClaim = (params: {
    status: "processed" | "ignored" | "failed";
    errorCode?: string | null;
    errorMessage?: string | null;
  }) =>
    markStripeWebhookEvent({
      eventId: event.id,
      claimToken: claim.claimToken,
      claimGeneration: claim.claimGeneration,
      ...params,
    });

  try {
    if (
      event.type === "checkout.session.completed" &&
      isCreditTopUpCheckoutSession(event.data.object)
    ) {
      await applyCreditTopUpCheckoutSession(event.data.object, event);
      await settleClaim({
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
      const activationSyncResult = await resolveCommercialActivationBillingState(syncResult);
      const activationResult = await applyCommercialActivationFromStripePayment(
        event,
        activationSyncResult,
      );

      if (!syncResult.applied) {
        if (activationResult) {
          await settleClaim({
            status: "processed",
          });
          logOperationalEvent("stripe_historical_payment_activation_processed", {
            eventId: event.id,
            eventType: event.type,
            organizationId: activationSyncResult.organizationId,
            stripeSubscriptionId: activationSyncResult.stripeSubscriptionId,
            subscriptionSyncIgnoredReason: syncResult.ignoredReason,
          });
          return {
            duplicate: false,
            processed: true,
          };
        }

        await settleClaim({
          status: "ignored",
          errorMessage:
            syncResult.ignoredReason === "subscription_missing"
              ? "No subscription was attached to this Stripe event."
              : syncResult.ignoredReason === "access_key_pending_claim"
                ? "Access-key subscription is waiting for account claim."
                : "A newer Stripe subscription event has already been applied.",
        });

        return {
          duplicate: false,
          processed: false,
        };
      }

      await settleClaim({
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

    await settleClaim({
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
    await settleClaim({
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
