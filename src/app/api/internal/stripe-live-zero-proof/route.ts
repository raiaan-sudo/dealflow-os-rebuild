import Stripe from "stripe";
import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertInternalSystemRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { getPublicAppUrl } from "@/lib/env";
import { getStripePlanPriceConfiguration } from "@/lib/integrations/stripe/service";
import type { BillingPlanTier } from "@/lib/billing/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleStripeBillingEvent } from "@/lib/services/billing-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STRIPE_API_VERSION = "2026-04-22.dahlia";
const PROOF_GATE = "STRIPE_LIVE_ZERO_PROOF_ENABLED";
const PROOF_PRICE_ENV = "STRIPE_LIVE_ZERO_PROOF_PRICE_ID";
const DEFAULT_PROOF_RUN_ID = "stripe_live_zero_proof_20260618_01";
const TARGET_ORGANIZATION_ID = "2e3b0144-23a9-483a-9e11-61173b4099c4";
const TARGET_CAMPAIGN_ID = "acbf7508-b782-479e-bc0e-841ffc421818";
const PROOF_EMAIL = "qa+stripe-live-zero-proof-20260618-01@example.com";

const billingPlanSchema = z.enum(["starter", "pro", "growth", "performance"]);

const bodySchema = z.object({
  action: z.enum([
    "createZeroPrice",
    "snapshot",
    "createCheckout",
    "createCouponCheckout",
    "retrieve",
    "simulateDuplicateWebhook",
    "simulateCancellationWebhook",
    "cancel",
  ]),
  proofRunId: z.string().trim().min(12).max(120).default(DEFAULT_PROOF_RUN_ID),
  planTier: billingPlanSchema.default("starter"),
  productId: z.string().trim().startsWith("prod_").optional(),
  priceId: z.string().trim().startsWith("price_").optional(),
  sessionId: z.string().trim().startsWith("cs_live_").optional(),
  subscriptionId: z.string().trim().startsWith("sub_").optional(),
}).strict();

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type UntypedAdminClient = {
  from: (table: string) => any;
};

const AUDITED_TABLES = [
  "billing_subscriptions",
  "stripe_webhook_events",
  "system_jobs",
  "lead_crm_sync_events",
  "provider_usage_events",
] as const;

function db(admin: AdminClient) {
  return admin as unknown as UntypedAdminClient;
}

function getAdminClient() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service-role client is not configured.", "service_role_missing");
  }

  return admin;
}

function assertProofEnabled() {
  if (process.env[PROOF_GATE] !== "true") {
    throw new ApiError(404, "Stripe live zero-dollar proof harness is not enabled.", "stripe_live_zero_proof_disabled");
  }
}

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new ApiError(503, "Stripe live secret key is not configured.", "stripe_live_secret_missing");
  }

  if (!secretKey.startsWith("sk_live_") && !secretKey.startsWith("rk_live_")) {
    throw new ApiError(503, "Stripe proof requires a live-mode key.", "stripe_live_key_required");
  }

  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
  });
}

function getConfiguredProofPriceId(bodyPriceId: string | null | undefined, planTier: BillingPlanTier) {
  const priceConfig = getStripePlanPriceConfiguration(planTier, null);
  const priceId = bodyPriceId?.trim() || process.env[PROOF_PRICE_ENV]?.trim() || priceConfig?.primaryPriceId;
  if (!priceId) {
    throw new ApiError(503, "Stripe live proof price is not configured.", "stripe_live_proof_price_missing");
  }

  if (!priceId.startsWith("price_")) {
    throw new ApiError(503, "Stripe live proof price is invalid.", "stripe_live_proof_price_invalid");
  }

  if (priceConfig && priceId !== priceConfig.primaryPriceId) {
    throw new ApiError(409, "Proof price must match the configured DealFlow billing price.", "stripe_live_proof_price_not_configured");
  }

  return {
    priceId,
    priceConfig,
  };
}

function idPrefix(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.split("_").slice(0, 2).join("_");
}

function maskExternalId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : "***";
}

async function assertZeroLivePrice(stripe: Stripe, priceId: string) {
  const price = await assertLiveRecurringPrice(stripe, priceId);

  if (price.unitAmount !== 0) {
    throw new ApiError(409, "Configured proof price is not zero dollars.", "stripe_live_zero_price_not_zero");
  }

  return price;
}

async function assertLiveRecurringPrice(stripe: Stripe, priceId: string) {
  const price = await stripe.prices.retrieve(priceId, {
    expand: ["product"],
  });

  if (price.livemode !== true) {
    throw new ApiError(409, "Configured proof price is not live mode.", "stripe_live_zero_price_not_live");
  }

  if (price.active !== true) {
    throw new ApiError(409, "Configured proof price is not active.", "stripe_live_zero_price_inactive");
  }

  if (price.type !== "recurring" || !price.recurring) {
    throw new ApiError(409, "Configured proof price is not recurring.", "stripe_live_zero_price_not_recurring");
  }

  return {
    idPrefix: idPrefix(price.id),
    rawId: price.id,
    livemode: price.livemode,
    active: price.active,
    unitAmount: price.unit_amount,
    currency: price.currency,
    recurring: {
      interval: price.recurring.interval,
      usageType: price.recurring.usage_type,
    },
    productName:
      typeof price.product === "object" && "name" in price.product
        ? price.product.name
        : null,
  };
}

function couponIdForProofRun(proofRunId: string) {
  const safe = proofRunId.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  return `df_zero_${safe}`;
}

async function createOrRetrieveProofCoupon(stripe: Stripe, proofRunId: string) {
  const couponId = couponIdForProofRun(proofRunId);
  try {
    const existing = await stripe.coupons.retrieve(couponId);
    if (existing.deleted) {
      throw new ApiError(409, "Proof coupon was deleted.", "stripe_live_coupon_deleted");
    }
    if (existing.livemode !== true || existing.percent_off !== 100 || existing.duration !== "forever") {
      throw new ApiError(409, "Existing proof coupon is not a live 100% forever coupon.", "stripe_live_coupon_invalid");
    }
    return existing;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (!(error instanceof Stripe.errors.StripeInvalidRequestError) || error.statusCode !== 404) {
      throw error;
    }
  }

  return stripe.coupons.create(
    {
      id: couponId,
      percent_off: 100,
      duration: "forever",
      name: "DealFlow Live Billing Proof 100% Off",
      metadata: {
        proof_type: "stripe_live_zero_coupon_proof",
        created_by: "codex_operator_proof",
        date: "20260618",
        proof_run_id: proofRunId,
      },
    },
    {
      idempotencyKey: `dealflow_stripe_live_zero_coupon:${proofRunId}`,
    },
  );
}

async function createZeroPrice(params: {
  stripe: Stripe;
  proofRunId: string;
  productId: string;
}) {
  const product = await params.stripe.products.retrieve(params.productId);
  if (product.livemode !== true) {
    throw new ApiError(409, "Configured proof product is not live mode.", "stripe_live_zero_product_not_live");
  }
  if (product.active !== true) {
    throw new ApiError(409, "Configured proof product is not active.", "stripe_live_zero_product_inactive");
  }

  const price = await params.stripe.prices.create(
    {
      product: params.productId,
      unit_amount: 0,
      currency: "usd",
      recurring: {
        interval: "month",
      },
      nickname: "DealFlow Live Billing Proof $0",
      metadata: {
        proof_type: "stripe_live_zero_dollar_proof",
        created_by: "codex_operator_proof",
        date: "20260618",
        proof_run_id: params.proofRunId,
      },
    },
    {
      idempotencyKey: `dealflow_stripe_live_zero_price:${params.proofRunId}:${params.productId}`,
    },
  );

  return {
    product: {
      id: maskExternalId(product.id),
      idPrefix: idPrefix(product.id),
      name: product.name,
      livemode: product.livemode,
      active: product.active,
    },
    price: {
      id: maskExternalId(price.id),
      rawIdForEnv: price.id,
      idPrefix: idPrefix(price.id),
      livemode: price.livemode,
      active: price.active,
      unitAmount: price.unit_amount,
      currency: price.currency,
      recurring: {
        interval: price.recurring?.interval ?? null,
        usageType: price.recurring?.usage_type ?? null,
      },
      metadataKeys: Object.keys(price.metadata ?? {}).sort(),
    },
    amountExposureCents: 0,
  };
}

async function countRows(admin: AdminClient) {
  const entries = await Promise.all(
    AUDITED_TABLES.map(async (table) => {
      const { count, error } = await db(admin).from(table).select("id", { count: "exact", head: true });
      if (error) {
        throw new ApiError(500, error.message, `${table}_count_failed`);
      }

      return [table, count ?? 0] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<(typeof AUDITED_TABLES)[number], number>;
}

function diffCounts(before: Record<string, number>, after: Record<string, number>) {
  return Object.fromEntries(AUDITED_TABLES.map((table) => [table, (after[table] ?? 0) - (before[table] ?? 0)]));
}

async function loadProofWorkspace(admin: AdminClient) {
  const { data: campaign, error: campaignError } = await db(admin)
    .from("campaign_plans")
    .select("id,organization_id,user_id,public_slug")
    .eq("id", TARGET_CAMPAIGN_ID)
    .eq("organization_id", TARGET_ORGANIZATION_ID)
    .maybeSingle();

  if (campaignError) {
    throw new ApiError(500, campaignError.message, "stripe_proof_campaign_lookup_failed");
  }

  if (!campaign?.id || !campaign.user_id) {
    throw new ApiError(409, "Approved Stripe proof campaign/workspace is unavailable.", "stripe_proof_workspace_unavailable");
  }

  const { data: organization, error: organizationError } = await db(admin)
    .from("organizations")
    .select("id,name,plan_tier,partner_id")
    .eq("id", TARGET_ORGANIZATION_ID)
    .maybeSingle();

  if (organizationError) {
    throw new ApiError(500, organizationError.message, "stripe_proof_organization_lookup_failed");
  }

  if (!organization?.id) {
    throw new ApiError(409, "Approved Stripe proof organization is unavailable.", "stripe_proof_organization_missing");
  }

  return {
    organizationId: TARGET_ORGANIZATION_ID,
    userId: campaign.user_id as string,
    campaignId: TARGET_CAMPAIGN_ID,
    organizationName: typeof organization.name === "string" ? organization.name : "DealFlow proof workspace",
    partnerId: typeof organization.partner_id === "string" ? organization.partner_id : null,
  };
}

async function readBillingRow(admin: AdminClient, organizationId: string) {
  const { data, error } = await db(admin)
    .from("billing_subscriptions")
    .select("organization_id,user_id,plan_tier,status,stripe_customer_id,stripe_subscription_id,stripe_checkout_session_id,current_period_end,cancel_at_period_end,metadata,updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "stripe_proof_billing_lookup_failed");
  }

  return data as {
    organization_id: string;
    user_id: string | null;
    plan_tier: string | null;
    status: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    stripe_checkout_session_id: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean | null;
    metadata: Record<string, unknown> | null;
    updated_at: string | null;
  } | null;
}

function summarizeBillingRow(row: Awaited<ReturnType<typeof readBillingRow>>) {
  if (!row) {
    return null;
  }

  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    planTier: row.plan_tier,
    status: row.status,
    stripeCustomer: maskExternalId(row.stripe_customer_id),
    stripeSubscription: maskExternalId(row.stripe_subscription_id),
    stripeCheckoutSession: idPrefix(row.stripe_checkout_session_id),
    currentPeriodEndPresent: Boolean(row.current_period_end),
    cancelAtPeriodEnd: row.cancel_at_period_end,
    metadataKeys: Object.keys(row.metadata ?? {}).sort(),
    proofRunId: typeof row.metadata?.proof_run_id === "string" ? row.metadata.proof_run_id : null,
    updatedAt: row.updated_at,
  };
}

function assertNoBlockingExistingBilling(row: Awaited<ReturnType<typeof readBillingRow>>, proofRunId: string) {
  if (!row) {
    return;
  }

  const rowProofRunId = typeof row.metadata?.proof_run_id === "string" ? row.metadata.proof_run_id : null;
  const hasExistingSubscription = Boolean(row.stripe_subscription_id);
  const isActive = row.status === "active" || row.status === "trialing" || row.status === "past_due";

  if ((hasExistingSubscription || isActive) && rowProofRunId !== proofRunId) {
    throw new ApiError(
      409,
      "Target workspace already has non-proof billing state. Refusing to run zero-dollar proof.",
      "stripe_proof_workspace_has_billing",
    );
  }
}

function buildMetadata(params: {
  proofRunId: string;
  organizationId: string;
  userId: string;
  campaignId: string;
  priceId: string;
  planTier?: BillingPlanTier;
  proofMode?: "zero_price" | "recognized_price_coupon";
}) {
  const planTier = params.planTier ?? "starter";
  return {
    source: "dealflow_stripe_live_zero_proof",
    proof_run_id: params.proofRunId,
    organization_id: params.organizationId,
    user_id: params.userId,
    campaign_id: params.campaignId,
    plan_tier: planTier,
    internal_plan_tier: planTier,
    billing_model: "licensed_subscription",
    price_signature: params.priceId,
    price_ids: params.priceId,
    proof_mode: params.proofMode ?? "zero_price",
    zero_dollar_proof: "true",
  };
}

async function createCheckout(params: {
  stripe: Stripe;
  admin: AdminClient;
  proofRunId: string;
  priceId: string;
}) {
  const workspace = await loadProofWorkspace(params.admin);
  const existingBilling = await readBillingRow(params.admin, workspace.organizationId);
  assertNoBlockingExistingBilling(existingBilling, params.proofRunId);

  const metadata = buildMetadata({
    proofRunId: params.proofRunId,
    organizationId: workspace.organizationId,
    userId: workspace.userId,
    campaignId: workspace.campaignId,
    priceId: params.priceId,
  });
  const idempotencyKey = [
    "dealflow_stripe_live_zero_proof_checkout",
    params.proofRunId,
    workspace.organizationId,
    workspace.userId,
    params.priceId,
  ].join(":");
  const beforeCounts = await countRows(params.admin);
  const customer = await params.stripe.customers.create(
    {
      email: PROOF_EMAIL,
      name: "DealFlow Stripe Live Zero Proof",
      metadata,
    },
    {
      idempotencyKey: idempotencyKey.replace("checkout", "customer"),
    },
  );

  if (customer.livemode !== true) {
    throw new ApiError(500, "Stripe customer was not created in live mode.", "stripe_live_customer_required");
  }

  const appUrl = getPublicAppUrl();
  const session = await params.stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customer.id,
      client_reference_id: workspace.organizationId,
      line_items: [
        {
          price: params.priceId,
          quantity: 1,
        },
      ],
      payment_method_collection: "if_required",
      success_url: `${appUrl}/unlock?checkout=success&session_id={CHECKOUT_SESSION_ID}&proof=stripe-live-zero`,
      cancel_url: `${appUrl}/unlock?checkout=cancelled&proof=stripe-live-zero`,
      metadata,
      subscription_data: {
        metadata,
      },
    },
    {
      idempotencyKey,
    },
  );

  if (session.livemode !== true || !session.id.startsWith("cs_live_")) {
    throw new ApiError(500, "Stripe checkout session was not created in live mode.", "stripe_live_checkout_required");
  }

  const afterCounts = await countRows(params.admin);

  return {
    workspace,
    beforeCounts,
    afterCounts,
    rowDeltas: diffCounts(beforeCounts, afterCounts),
    customer: {
      id: maskExternalId(customer.id),
      idPrefix: idPrefix(customer.id),
      livemode: customer.livemode,
    },
    checkout: {
      id: maskExternalId(session.id),
      idPrefix: idPrefix(session.id),
      status: session.status,
      livemode: session.livemode,
      amountTotal: session.amount_total,
      currency: session.currency,
      urlPresent: Boolean(session.url),
      url: session.url,
      paymentStatus: session.payment_status,
      mode: session.mode,
    },
    existingBillingBefore: summarizeBillingRow(existingBilling),
    billingAfter: summarizeBillingRow(await readBillingRow(params.admin, workspace.organizationId)),
    amountExposureCents: 0,
  };
}

async function createCouponCheckout(params: {
  stripe: Stripe;
  admin: AdminClient;
  proofRunId: string;
  priceId: string;
  planTier: BillingPlanTier;
}) {
  const workspace = await loadProofWorkspace(params.admin);
  const existingBilling = await readBillingRow(params.admin, workspace.organizationId);
  assertNoBlockingExistingBilling(existingBilling, params.proofRunId);

  const price = await assertLiveRecurringPrice(params.stripe, params.priceId);
  if (price.rawId !== params.priceId || !price.unitAmount || price.unitAmount < 1) {
    throw new ApiError(409, "Coupon proof requires a configured non-zero recurring live price.", "stripe_live_coupon_price_invalid");
  }

  const metadata = buildMetadata({
    proofRunId: params.proofRunId,
    organizationId: workspace.organizationId,
    userId: workspace.userId,
    campaignId: workspace.campaignId,
    priceId: params.priceId,
    planTier: params.planTier,
    proofMode: "recognized_price_coupon",
  });
  const coupon = await createOrRetrieveProofCoupon(params.stripe, params.proofRunId);
  if (coupon.livemode !== true || coupon.percent_off !== 100 || coupon.duration !== "forever") {
    throw new ApiError(409, "Proof coupon is not a live 100% forever coupon.", "stripe_live_coupon_invalid");
  }

  const idempotencyKey = [
    "dealflow_stripe_live_zero_coupon_checkout",
    params.proofRunId,
    workspace.organizationId,
    workspace.userId,
    params.planTier,
    params.priceId,
  ].join(":");
  const beforeCounts = await countRows(params.admin);
  const customer = await params.stripe.customers.create(
    {
      email: PROOF_EMAIL,
      name: "DealFlow Stripe Live Zero Coupon Proof",
      metadata,
    },
    {
      idempotencyKey: idempotencyKey.replace("checkout", "customer"),
    },
  );

  if (customer.livemode !== true) {
    throw new ApiError(500, "Stripe customer was not created in live mode.", "stripe_live_customer_required");
  }

  const appUrl = getPublicAppUrl();
  const session = await params.stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customer.id,
      client_reference_id: workspace.organizationId,
      line_items: [
        {
          price: params.priceId,
          quantity: 1,
        },
      ],
      discounts: [
        {
          coupon: coupon.id,
        },
      ],
      payment_method_collection: "if_required",
      success_url: `${appUrl}/unlock?checkout=success&session_id={CHECKOUT_SESSION_ID}&proof=stripe-live-zero-coupon`,
      cancel_url: `${appUrl}/unlock?checkout=cancelled&proof=stripe-live-zero-coupon`,
      metadata,
      subscription_data: {
        metadata,
      },
    },
    {
      idempotencyKey,
    },
  );

  if (session.livemode !== true || !session.id.startsWith("cs_live_")) {
    throw new ApiError(500, "Stripe checkout session was not created in live mode.", "stripe_live_checkout_required");
  }
  if ((session.amount_total ?? 0) !== 0) {
    throw new ApiError(409, "Stripe coupon proof checkout is not zero dollars.", "stripe_live_coupon_checkout_not_zero");
  }

  const afterCounts = await countRows(params.admin);

  return {
    workspace,
    beforeCounts,
    afterCounts,
    rowDeltas: diffCounts(beforeCounts, afterCounts),
    coupon: {
      id: maskExternalId(coupon.id),
      idPrefix: idPrefix(coupon.id),
      livemode: coupon.livemode,
      percentOff: coupon.percent_off,
      duration: coupon.duration,
    },
    customer: {
      id: maskExternalId(customer.id),
      idPrefix: idPrefix(customer.id),
      livemode: customer.livemode,
    },
    checkout: {
      id: maskExternalId(session.id),
      idPrefix: idPrefix(session.id),
      status: session.status,
      livemode: session.livemode,
      amountTotal: session.amount_total,
      currency: session.currency,
      urlPresent: Boolean(session.url),
      url: session.url,
      paymentStatus: session.payment_status,
      mode: session.mode,
    },
    existingBillingBefore: summarizeBillingRow(existingBilling),
    billingAfter: summarizeBillingRow(await readBillingRow(params.admin, workspace.organizationId)),
    recognizedPriceUnitAmountCents: price.unitAmount,
    amountExposureCents: 0,
  };
}

async function retrieveProofState(params: {
  stripe: Stripe;
  admin: AdminClient;
  proofRunId: string;
  sessionId?: string;
  subscriptionId?: string;
}) {
  const workspace = await loadProofWorkspace(params.admin);
  const counts = await countRows(params.admin);
  const billing = await readBillingRow(params.admin, workspace.organizationId);
  let session: Stripe.Checkout.Session | null = null;
  let subscription: Stripe.Subscription | null = null;

  if (params.sessionId) {
    session = await params.stripe.checkout.sessions.retrieve(params.sessionId, {
      expand: ["subscription", "customer"],
    });
  }

  const subscriptionId =
    params.subscriptionId ??
    (typeof session?.subscription === "string"
      ? session.subscription
      : session?.subscription?.id ?? billing?.stripe_subscription_id ?? null);

  if (subscriptionId) {
    subscription = await params.stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price", "customer"],
    });
  }

  const { data: webhooks, error: webhookError } = await db(params.admin)
    .from("stripe_webhook_events")
    .select("stripe_event_id,stripe_event_type,stripe_object_id,stripe_subscription_id,organization_id,status,error_code,processed_at,created_at,reviewed_at")
    .or(`organization_id.eq.${workspace.organizationId},stripe_subscription_id.eq.${subscriptionId ?? "__none__"}`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (webhookError) {
    throw new ApiError(500, webhookError.message, "stripe_proof_webhook_lookup_failed");
  }

  return {
    workspace,
    counts,
    billing: summarizeBillingRow(billing),
    session: session
      ? {
          id: maskExternalId(session.id),
          idPrefix: idPrefix(session.id),
          livemode: session.livemode,
          status: session.status,
          paymentStatus: session.payment_status,
          amountTotal: session.amount_total,
          subscription: maskExternalId(
            typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
          ),
        }
      : null,
    subscription: subscription
      ? {
          id: maskExternalId(subscription.id),
          idPrefix: idPrefix(subscription.id),
          livemode: subscription.livemode,
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          metadataProofRunId: subscription.metadata.proof_run_id ?? null,
          metadataOrganizationMatches: subscription.metadata.organization_id === workspace.organizationId,
          metadataUserMatches: subscription.metadata.user_id === workspace.userId,
          priceUnitAmounts: subscription.items.data.map((item) => item.price?.unit_amount ?? null),
        }
      : null,
    webhooks: (Array.isArray(webhooks) ? webhooks : []).map((row) => ({
      eventId: maskExternalId(row.stripe_event_id),
      eventType: row.stripe_event_type,
      object: maskExternalId(row.stripe_object_id),
      subscription: maskExternalId(row.stripe_subscription_id),
      organizationId: row.organization_id,
      status: row.status,
      errorCode: row.error_code,
      processed: Boolean(row.processed_at),
      reviewed: Boolean(row.reviewed_at),
      createdAt: row.created_at,
    })),
  };
}

async function simulateDuplicateWebhook(params: {
  stripe: Stripe;
  proofRunId: string;
  subscriptionId: string;
}) {
  const subscription = await params.stripe.subscriptions.retrieve(params.subscriptionId);
  if (subscription.livemode !== true) {
    throw new ApiError(409, "Subscription is not live mode.", "stripe_live_subscription_required");
  }

  if (subscription.metadata.proof_run_id !== params.proofRunId) {
    throw new ApiError(403, "Subscription does not belong to this proof run.", "stripe_proof_subscription_forbidden");
  }

  const eventId = `evt_dealflow_zero_${params.proofRunId.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const event = {
    id: eventId,
    object: "event",
    api_version: STRIPE_API_VERSION,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: subscription.id,
        object: "subscription",
      },
    },
    livemode: true,
    pending_webhooks: 0,
    request: null,
    type: "customer.subscription.updated",
  } as unknown as Stripe.Event;

  const first = await handleStripeBillingEvent(event);
  const second = await handleStripeBillingEvent(event);

  return {
    eventId: maskExternalId(eventId),
    first,
    second,
    duplicateHandled: first.duplicate === false && second.duplicate === true,
  };
}

async function simulateCancellationWebhook(params: {
  stripe: Stripe;
  proofRunId: string;
  subscriptionId: string;
}) {
  const subscription = await params.stripe.subscriptions.retrieve(params.subscriptionId);
  if (subscription.livemode !== true) {
    throw new ApiError(409, "Subscription is not live mode.", "stripe_live_subscription_required");
  }

  if (subscription.metadata.proof_run_id !== params.proofRunId) {
    throw new ApiError(403, "Subscription does not belong to this proof run.", "stripe_proof_subscription_forbidden");
  }

  const eventId = `evt_dealflow_zero_cancel_${params.proofRunId.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const event = {
    id: eventId,
    object: "event",
    api_version: STRIPE_API_VERSION,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: subscription.id,
        object: "subscription",
      },
    },
    livemode: true,
    pending_webhooks: 0,
    request: null,
    type: "customer.subscription.deleted",
  } as unknown as Stripe.Event;

  const first = await handleStripeBillingEvent(event);
  const second = await handleStripeBillingEvent(event);

  return {
    eventId: maskExternalId(eventId),
    first,
    second,
    duplicateHandled: first.duplicate === false && second.duplicate === true,
  };
}

async function cancelProofSubscription(params: {
  stripe: Stripe;
  proofRunId: string;
  subscriptionId: string;
}) {
  const subscription = await params.stripe.subscriptions.retrieve(params.subscriptionId);
  if (subscription.livemode !== true) {
    throw new ApiError(409, "Subscription is not live mode.", "stripe_live_subscription_required");
  }

  if (subscription.metadata.proof_run_id !== params.proofRunId) {
    throw new ApiError(403, "Subscription does not belong to this proof run.", "stripe_proof_subscription_forbidden");
  }

  if (subscription.status === "canceled") {
    return {
      id: maskExternalId(subscription.id),
      idPrefix: idPrefix(subscription.id),
      livemode: subscription.livemode,
      status: subscription.status,
      alreadyCanceled: true,
    };
  }

  const canceled = await params.stripe.subscriptions.cancel(params.subscriptionId, {
    invoice_now: false,
    prorate: false,
  });

  return {
    id: maskExternalId(canceled.id),
    idPrefix: idPrefix(canceled.id),
    livemode: canceled.livemode,
    status: canceled.status,
    alreadyCanceled: false,
  };
}

export async function POST(request: Request) {
  try {
    assertInternalSystemRequest(request);
    assertProofEnabled();

    if (process.env.GHL_CONTACT_WRITES_ENABLED === "true" || process.env.GHL_OPPORTUNITY_WRITES_ENABLED === "true") {
      throw new ApiError(409, "GHL write gates must remain disabled for Stripe proof.", "ghl_write_gate_enabled");
    }
    if (process.env.GHL_AUTO_PROVISIONING_ENABLED === "true" || process.env.GHL_PROVISIONING_WRITES_ENABLED === "true") {
      throw new ApiError(409, "GHL provisioning gates must remain disabled for Stripe proof.", "ghl_provisioning_gate_enabled");
    }
    if (process.env.GHL_WORKFLOW_ENROLLMENT_ENABLED === "true") {
      throw new ApiError(409, "GHL workflow enrollment must remain disabled for Stripe proof.", "ghl_workflow_gate_enabled");
    }
    if (process.env.INTERNAL_LEAD_SMS_ENABLED === "true") {
      throw new ApiError(409, "SMS/email lead notifications must remain disabled for Stripe proof.", "lead_sms_gate_enabled");
    }

    const body = await parseJsonBody(request, bodySchema);
    const admin = getAdminClient();
    const stripe = getStripeClient();
    const { priceId, priceConfig } = body.action === "createZeroPrice"
      ? { priceId: null, priceConfig: null }
      : getConfiguredProofPriceId(body.priceId, body.planTier);
    const price = priceId
      ? body.action === "createCheckout"
        ? await assertZeroLivePrice(stripe, priceId)
        : await assertLiveRecurringPrice(stripe, priceId)
      : {
          idPrefix: null,
          livemode: true,
          active: true,
          unitAmount: 0,
          currency: "usd",
          recurring: {
            interval: "month",
            usageType: "licensed",
          },
          productName: null,
        };

    const base = {
      success: true,
      proofRunId: body.proofRunId,
      action: body.action,
      price,
      gates: {
        stripeLiveZeroProof: true,
        ghlContactWrites: process.env.GHL_CONTACT_WRITES_ENABLED === "true",
        ghlOpportunityWrites: process.env.GHL_OPPORTUNITY_WRITES_ENABLED === "true",
        ghlProvisioning: process.env.GHL_PROVISIONING_WRITES_ENABLED === "true",
        ghlWorkflowEnrollment: process.env.GHL_WORKFLOW_ENROLLMENT_ENABLED === "true",
        internalLeadSms: process.env.INTERNAL_LEAD_SMS_ENABLED === "true",
      },
      billingConfig: priceConfig
        ? {
            planTier: priceConfig.planTier,
            priceSignature: priceConfig.priceSignature,
            priceIds: priceConfig.priceIds.map(idPrefix),
          }
        : null,
      secretsExposed: false,
      tokensExposed: false,
    };

    if (body.action === "createZeroPrice") {
      if (!body.productId) {
        throw new ApiError(400, "productId is required to create the zero-dollar proof price.", "product_id_required");
      }

      return apiSuccess({
        ...base,
        ...(await createZeroPrice({
          stripe,
          proofRunId: body.proofRunId,
          productId: body.productId,
        })),
      });
    }

    if (!priceId) {
      throw new ApiError(503, "Stripe live zero-dollar proof price is not configured.", "stripe_live_zero_price_missing");
    }

    if (body.action === "snapshot") {
      const workspace = await loadProofWorkspace(admin);
      return apiSuccess({
        ...base,
        workspace,
        counts: await countRows(admin),
        billing: summarizeBillingRow(await readBillingRow(admin, workspace.organizationId)),
        amountExposureCents: 0,
      });
    }

    if (body.action === "createCheckout") {
      return apiSuccess({
        ...base,
        ...(await createCheckout({
          stripe,
          admin,
          proofRunId: body.proofRunId,
          priceId,
        })),
      });
    }

    if (body.action === "createCouponCheckout") {
      return apiSuccess({
        ...base,
        ...(await createCouponCheckout({
          stripe,
          admin,
          proofRunId: body.proofRunId,
          priceId,
          planTier: body.planTier,
        })),
      });
    }

    if (body.action === "retrieve") {
      return apiSuccess({
        ...base,
        ...(await retrieveProofState({
          stripe,
          admin,
          proofRunId: body.proofRunId,
          sessionId: body.sessionId,
          subscriptionId: body.subscriptionId,
        })),
      });
    }

    if (body.action === "simulateDuplicateWebhook") {
      if (!body.subscriptionId) {
        throw new ApiError(400, "subscriptionId is required.", "subscription_id_required");
      }

      return apiSuccess({
        ...base,
        duplicateWebhook: await simulateDuplicateWebhook({
          stripe,
          proofRunId: body.proofRunId,
          subscriptionId: body.subscriptionId,
        }),
        state: await retrieveProofState({
          stripe,
          admin,
          proofRunId: body.proofRunId,
          subscriptionId: body.subscriptionId,
        }),
      });
    }

    if (body.action === "simulateCancellationWebhook") {
      if (!body.subscriptionId) {
        throw new ApiError(400, "subscriptionId is required.", "subscription_id_required");
      }

      return apiSuccess({
        ...base,
        cancellationWebhook: await simulateCancellationWebhook({
          stripe,
          proofRunId: body.proofRunId,
          subscriptionId: body.subscriptionId,
        }),
        state: await retrieveProofState({
          stripe,
          admin,
          proofRunId: body.proofRunId,
          subscriptionId: body.subscriptionId,
        }),
      });
    }

    if (!body.subscriptionId) {
      throw new ApiError(400, "subscriptionId is required.", "subscription_id_required");
    }

    return apiSuccess({
      ...base,
      cancellation: await cancelProofSubscription({
        stripe,
        proofRunId: body.proofRunId,
        subscriptionId: body.subscriptionId,
      }),
      state: await retrieveProofState({
        stripe,
        admin,
        proofRunId: body.proofRunId,
        subscriptionId: body.subscriptionId,
      }),
    });
  } catch (error) {
    return handleApiError(error, "Stripe live zero-dollar proof");
  }
}
