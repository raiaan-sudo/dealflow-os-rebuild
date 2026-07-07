import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import { ApiError } from "@/lib/api/route";
import {
  getAccessKeyHashPepper,
  getAccessKeyRevealEncryptionKey,
  getPublicAppUrl,
  isAccessKeyCheckoutEnabled,
} from "@/lib/env";
import { getStripeBillingProvider } from "@/lib/integrations/stripe/provider";
import {
  buildStripeCheckoutMetadata,
  getStripePriceId,
} from "@/lib/integrations/stripe/service";
import {
  claimStripeWebhookEvent,
  markStripeWebhookEvent,
  syncBillingSubscriptionFromStripe,
} from "@/lib/services/billing-service";
import { normalizeBillingPlanTier, type BillingPlanTier } from "@/lib/billing/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError, logOperationalEvent, logWarn } from "@/lib/logging";
import type { AppContext } from "@/types/app";
import type { Json } from "@/lib/supabase/types";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type AccessKeyRow = {
  id: string;
  key_hash: string;
  key_prefix: string;
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  plan_tier: BillingPlanTier;
  partner_id: string | null;
  partner_slug: string | null;
  claim_token_hash: string | null;
  preclaimed_email: string | null;
  preclaimed_at: string | null;
  claimed_by_user_id: string | null;
  claimed_organization_id: string | null;
  claimed_at: string | null;
  expires_at: string | null;
  metadata: Record<string, Json>;
  created_at: string;
  updated_at: string;
};

type AccessKeyEventRow = {
  id: string;
  access_key_id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_organization_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  metadata: Record<string, Json>;
  created_at: string;
};

type PartnerBillingBundle = {
  partnerId: string | null;
  partnerSlug: string | null;
  commissionRate: number | null;
};

const ACCESS_KEY_PREFIX = process.env.STRIPE_FORCE_TEST_MODE === "true" ? "df_test" : "df_live";
const ACCESS_KEY_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;
const CLAIM_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

function requireAccessKeyFeature() {
  if (!isAccessKeyCheckoutEnabled()) {
    throw new ApiError(404, "Access-key checkout is not enabled.", "access_key_checkout_disabled");
  }
}

function requireAdminClient() {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  return admin;
}

function requireAccessKeyPepper() {
  const pepper = getAccessKeyHashPepper();

  if (!pepper) {
    throw new ApiError(503, "Access-key hashing is not configured.", "access_key_pepper_missing");
  }

  return pepper;
}

function requireRevealKey() {
  const key = getAccessKeyRevealEncryptionKey();

  if (!key) {
    throw new ApiError(503, "Access-key reveal encryption is not configured.", "access_key_reveal_key_missing");
  }

  return key;
}

function normalizeEmail(value?: string | null) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function normalizeOptionalText(value?: string | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asMetadata(value: unknown): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

function getDatabaseErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : "Access-key database operation failed.";
}

function isAccessKeySchemaMissingError(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "";
  const message = getDatabaseErrorMessage(error).toLowerCase();

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    ((message.includes("billing_access_keys") || message.includes("billing_access_key_events")) &&
      (message.includes("schema cache") || message.includes("relation") || message.includes("table")))
  );
}

function throwAccessKeyDatabaseError(error: unknown, fallbackCode: string): never {
  if (isAccessKeySchemaMissingError(error)) {
    throw new ApiError(
      503,
      "Access-key database schema is not configured.",
      "access_key_schema_missing",
    );
  }

  throw new ApiError(500, getDatabaseErrorMessage(error), fallbackCode);
}

function asAccessKeyRow(value: unknown): AccessKeyRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    key_hash: String(row.key_hash ?? ""),
    key_prefix: String(row.key_prefix ?? ""),
    status: String(row.status ?? "created"),
    stripe_checkout_session_id: normalizeOptionalText(row.stripe_checkout_session_id as string | null),
    stripe_customer_id: normalizeOptionalText(row.stripe_customer_id as string | null),
    stripe_subscription_id: normalizeOptionalText(row.stripe_subscription_id as string | null),
    stripe_price_id: normalizeOptionalText(row.stripe_price_id as string | null),
    plan_tier: normalizeBillingPlanTier(row.plan_tier),
    partner_id: normalizeOptionalText(row.partner_id as string | null),
    partner_slug: normalizeOptionalText(row.partner_slug as string | null),
    claim_token_hash: normalizeOptionalText(row.claim_token_hash as string | null),
    preclaimed_email: normalizeEmail(row.preclaimed_email as string | null),
    preclaimed_at: normalizeOptionalText(row.preclaimed_at as string | null),
    claimed_by_user_id: normalizeOptionalText(row.claimed_by_user_id as string | null),
    claimed_organization_id: normalizeOptionalText(row.claimed_organization_id as string | null),
    claimed_at: normalizeOptionalText(row.claimed_at as string | null),
    expires_at: normalizeOptionalText(row.expires_at as string | null),
    metadata: asMetadata(row.metadata),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function asAccessKeyEventRow(value: unknown): AccessKeyEventRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    access_key_id: String(row.access_key_id ?? ""),
    event_type: String(row.event_type ?? ""),
    actor_user_id: normalizeOptionalText(row.actor_user_id as string | null),
    actor_organization_id: normalizeOptionalText(row.actor_organization_id as string | null),
    stripe_checkout_session_id: normalizeOptionalText(row.stripe_checkout_session_id as string | null),
    stripe_customer_id: normalizeOptionalText(row.stripe_customer_id as string | null),
    stripe_subscription_id: normalizeOptionalText(row.stripe_subscription_id as string | null),
    metadata: asMetadata(row.metadata),
    created_at: String(row.created_at ?? ""),
  };
}

function hashWithPepper(value: string) {
  return createHash("sha256")
    .update(value)
    .update(":")
    .update(requireAccessKeyPepper())
    .digest("hex");
}

function constantTimeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function deriveRevealKey() {
  return createHash("sha256").update(requireRevealKey()).digest();
}

function encryptRevealSecret(rawKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveRevealKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(rawKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

function decryptRevealSecret(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const [version, ivRaw, tagRaw, ciphertextRaw] = value.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !ciphertextRaw) {
    return null;
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveRevealKey(), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function getStripeCustomerIdFromSession(session: Stripe.Checkout.Session) {
  if (typeof session.customer === "string") {
    return session.customer;
  }

  return session.customer?.id ?? null;
}

function getStripeSubscriptionIdFromSession(session: Stripe.Checkout.Session) {
  if (typeof session.subscription === "string") {
    return session.subscription;
  }

  return session.subscription?.id ?? null;
}

function getPrimaryPriceIdFromSubscription(subscription: Stripe.Subscription) {
  return subscription.items.data[0]?.price?.id ?? null;
}

async function recordAccessKeyEvent(params: {
  admin: AdminClient;
  accessKeyId: string;
  eventType: string;
  actorUserId?: string | null;
  actorOrganizationId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  metadata?: Record<string, Json>;
}) {
  const { error } = await params.admin.from("billing_access_key_events" as never).insert({
    access_key_id: params.accessKeyId,
    event_type: params.eventType,
    actor_user_id: params.actorUserId ?? null,
    actor_organization_id: params.actorOrganizationId ?? null,
    stripe_checkout_session_id: params.stripeCheckoutSessionId ?? null,
    stripe_customer_id: params.stripeCustomerId ?? null,
    stripe_subscription_id: params.stripeSubscriptionId ?? null,
    metadata: params.metadata ?? {},
  } as never);

  if (error) {
    logWarn("billing_access_key_event_insert_failed", {
      accessKeyId: params.accessKeyId,
      eventType: params.eventType,
      message: error.message,
    });
  }
}

async function loadPartnerBillingBundle(
  admin: AdminClient,
  partnerSlug?: string | null,
): Promise<PartnerBillingBundle> {
  const normalizedSlug = normalizeOptionalText(partnerSlug);
  if (!normalizedSlug) {
    return { partnerId: null, partnerSlug: null, commissionRate: null };
  }

  const { data: partner, error: partnerError } = await admin
    .from("partners")
    .select("id,slug,commission_rate,status")
    .eq("slug", normalizedSlug)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (partnerError) {
    throw new ApiError(500, partnerError.message, "partner_lookup_failed");
  }

  const partnerRow = partner as { id?: string | null; slug?: string | null; commission_rate?: number | string | null } | null;
  if (!partnerRow?.id || !partnerRow.slug) {
    throw new ApiError(404, "Partner checkout is not available.", "partner_not_found");
  }

  return {
    partnerId: partnerRow.id,
    partnerSlug: partnerRow.slug,
    commissionRate: Number(partnerRow.commission_rate ?? 0),
  };
}

function buildAccessKeyCheckoutUrls() {
  const baseUrl = getPublicAppUrl();
  return {
    successUrl: `${baseUrl}/access-key/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}/access-key/cancel`,
  };
}

export function generateAccessKey() {
  return `${ACCESS_KEY_PREFIX}_${randomBytes(24).toString("base64url")}`;
}

export function hashAccessKey(rawKey: string) {
  return hashWithPepper(rawKey.trim());
}

export async function createAccessKeyCheckoutSession(params: {
  planTier: BillingPlanTier;
  partnerSlug?: string | null;
  buyerEmail?: string | null;
  buyerName?: string | null;
}) {
  requireAccessKeyFeature();
  const admin = requireAdminClient();
  const stripeProvider = getStripeBillingProvider();

  if (!stripeProvider.isConfigured()) {
    throw new ApiError(503, "Stripe is not configured yet.", "stripe_not_configured");
  }

  const planTier = normalizeBillingPlanTier(params.planTier);
  const partnerBilling = await loadPartnerBillingBundle(admin, params.partnerSlug);
  const priceId = getStripePriceId(planTier);

  if (!priceId) {
    throw new ApiError(
      503,
      "The selected plan is not configured in Stripe.",
      "stripe_price_missing",
    );
  }

  const rawKey = generateAccessKey();
  const keyHash = hashAccessKey(rawKey);
  const keyPrefix = rawKey.slice(0, 18);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACCESS_KEY_EXPIRY_MS).toISOString();

  const { data: inserted, error: insertError } = await admin
    .from("billing_access_keys" as never)
    .insert({
      key_hash: keyHash,
      key_prefix: keyPrefix,
      status: "created",
      plan_tier: planTier,
      partner_id: partnerBilling.partnerId,
      partner_slug: partnerBilling.partnerSlug,
      expires_at: expiresAt,
      metadata: {
        reveal_ciphertext: encryptRevealSecret(rawKey),
        created_source: "access_key_checkout",
        price_ids: [priceId],
        commission_rate_snapshot: partnerBilling.commissionRate,
      },
    } as never)
    .select("*")
    .maybeSingle();

  if (insertError) {
    throwAccessKeyDatabaseError(insertError, "access_key_create_failed");
  }

  const accessKey = asAccessKeyRow(inserted);
  if (!accessKey) {
    throw new ApiError(500, "Access key could not be created.", "access_key_create_failed");
  }

  const customer = (await stripeProvider.execute({
    action: "create_customer",
    idempotencyKey: `dealflow_access_key_customer_${accessKey.id}`,
    params: {
      email: normalizeEmail(params.buyerEmail) ?? undefined,
      name: normalizeOptionalText(params.buyerName) ?? undefined,
      metadata: {
        checkout_flow: "access_key",
        access_key_id: accessKey.id,
        partner_id: partnerBilling.partnerId ?? "",
        partner_slug: partnerBilling.partnerSlug ?? "",
      },
    },
  })) as Stripe.Customer;

  const metadata = {
    ...buildStripeCheckoutMetadata({
      organizationId: "",
      userId: "",
      planTier,
    }),
    checkout_flow: "access_key",
    access_key_id: accessKey.id,
    organization_id: "",
    user_id: "",
    internal_plan_tier: planTier,
    partner_id: partnerBilling.partnerId ?? "",
    partner_slug: partnerBilling.partnerSlug ?? "",
    partner_attribution_source: "access_key_checkout",
    price_ids: priceId,
  };

  const urls = buildAccessKeyCheckoutUrls();
  const session = (await stripeProvider.execute({
    action: "create_checkout_session",
    idempotencyKey: `dealflow_access_key_checkout_${accessKey.id}`,
    params: {
      mode: "subscription",
      customer: customer.id,
      client_reference_id: accessKey.id,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: urls.successUrl,
      cancel_url: urls.cancelUrl,
      allow_promotion_codes: true,
      payment_method_collection: "always",
      metadata,
      subscription_data: {
        metadata,
      },
    },
  })) as Stripe.Checkout.Session;

  const updateMetadata = {
    ...accessKey.metadata,
    stripe_checkout_session_created_at: new Date().toISOString(),
  } satisfies Record<string, Json>;

  const { error: updateError } = await admin
    .from("billing_access_keys" as never)
    .update({
      status: "pending_payment",
      stripe_checkout_session_id: session.id,
      stripe_customer_id: customer.id,
      metadata: updateMetadata,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", accessKey.id);

  if (updateError) {
    throwAccessKeyDatabaseError(updateError, "access_key_checkout_persist_failed");
  }

  await recordAccessKeyEvent({
    admin,
    accessKeyId: accessKey.id,
    eventType: "checkout_started",
    stripeCheckoutSessionId: session.id,
    stripeCustomerId: customer.id,
    metadata: {
      plan_tier: planTier,
      partner_slug: partnerBilling.partnerSlug,
    },
  });

  logOperationalEvent("access_key_checkout_started", {
    accessKeyId: accessKey.id,
    keyPrefix,
    planTier,
    partnerSlug: partnerBilling.partnerSlug,
    stripeCheckoutSessionId: session.id,
  });

  return {
    url: session.url,
    sessionId: session.id,
    keyPrefix,
  };
}

export function isAccessKeyCheckoutSessionObject(object: Stripe.Event.Data.Object): object is Stripe.Checkout.Session {
  const checkoutObject = object as { object?: unknown; metadata?: Record<string, string> | null };
  return checkoutObject.object === "checkout.session" && checkoutObject.metadata?.checkout_flow === "access_key";
}

export async function activateAccessKeyFromCheckoutSession(
  session: Stripe.Checkout.Session,
  source?: { eventId?: string | null; eventCreated?: number | null },
) {
  const accessKeyId = normalizeOptionalText(session.metadata?.access_key_id ?? null);
  if (!accessKeyId) {
    throw new ApiError(400, "Access-key checkout session is missing key metadata.", "access_key_metadata_missing");
  }

  if (session.status !== "complete") {
    throw new ApiError(409, "Checkout session has not completed yet.", "access_key_checkout_incomplete");
  }

  const admin = requireAdminClient();
  const stripeProvider = getStripeBillingProvider();
  const subscriptionId = getStripeSubscriptionIdFromSession(session);
  const customerId = getStripeCustomerIdFromSession(session);

  if (!subscriptionId) {
    throw new ApiError(409, "Checkout session completed without a subscription.", "access_key_subscription_missing");
  }

  const subscription = (await stripeProvider.execute({
    action: "retrieve_subscription",
    subscriptionId,
  })) as Stripe.Subscription;
  const priceId = getPrimaryPriceIdFromSubscription(subscription);

  const { data: existing, error: existingError } = await admin
    .from("billing_access_keys" as never)
    .select("*")
    .eq("id", accessKeyId)
    .maybeSingle();

  if (existingError) {
    throwAccessKeyDatabaseError(existingError, "access_key_fetch_failed");
  }

  const existingRow = asAccessKeyRow(existing);
  if (!existingRow) {
    throw new ApiError(404, "Access key was not found.", "access_key_not_found");
  }

  if (existingRow.status === "claimed" || existingRow.status === "active" || existingRow.status === "preclaimed") {
    return existingRow;
  }

  const metadata = {
    ...existingRow.metadata,
    activated_at: new Date().toISOString(),
    stripe_event_id: source?.eventId ?? null,
  } satisfies Record<string, Json>;

  const { data: updated, error: updateError } = await admin
    .from("billing_access_keys" as never)
    .update({
      status: "active",
      stripe_checkout_session_id: session.id,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: priceId,
      metadata,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", accessKeyId)
    .in("status", ["created", "pending_payment"])
    .select("*")
    .maybeSingle();

  if (updateError) {
    throwAccessKeyDatabaseError(updateError, "access_key_activation_failed");
  }

  const row = asAccessKeyRow(updated) ?? existingRow;
  await recordAccessKeyEvent({
    admin,
    accessKeyId,
    eventType: "activated",
    stripeCheckoutSessionId: session.id,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    metadata: {
      stripe_event_id: source?.eventId ?? null,
      stripe_event_created: source?.eventCreated ?? null,
    },
  });

  logOperationalEvent("access_key_checkout_completed", {
    accessKeyId,
    keyPrefix: row.key_prefix,
    stripeCheckoutSessionId: session.id,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });

  return row;
}

export async function handleAccessKeyStripeEvent(event: Stripe.Event) {
  const claim = await claimStripeWebhookEvent(event);

  if (claim.status === "duplicate") {
    return {
      duplicate: true,
      processed: false,
    };
  }

  try {
    if (event.type === "checkout.session.completed" && isAccessKeyCheckoutSessionObject(event.data.object)) {
      await activateAccessKeyFromCheckoutSession(event.data.object, {
        eventId: event.id,
        eventCreated: event.created,
      });
      await markStripeWebhookEvent({ eventId: event.id, status: "processed" });
      return {
        duplicate: false,
        processed: true,
      };
    }

    await markStripeWebhookEvent({
      eventId: event.id,
      status: "ignored",
      errorMessage: "Event was not an access-key checkout event.",
    });
    return {
      duplicate: false,
      processed: false,
    };
  } catch (error) {
    await markStripeWebhookEvent({
      eventId: event.id,
      status: "failed",
      errorCode: error instanceof ApiError ? error.code : "access_key_webhook_failed",
      errorMessage: error instanceof Error ? error.message : "Access-key webhook failed.",
    }).catch(() => undefined);
    throw error;
  }
}

export async function preclaimAccessKey(params: {
  rawKey: string;
  email: string;
  partnerSlug?: string | null;
}) {
  requireAccessKeyFeature();
  const admin = requireAdminClient();
  const keyHash = hashAccessKey(params.rawKey);
  const email = normalizeEmail(params.email);

  if (!email) {
    throw new ApiError(400, "Email is required before using an access key.", "access_key_email_required");
  }

  const { data, error } = await admin
    .from("billing_access_keys" as never)
    .select("*")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error) {
    throwAccessKeyDatabaseError(error, "access_key_fetch_failed");
  }

  const row = asAccessKeyRow(data);
  if (!row || !constantTimeEquals(row.key_hash, keyHash)) {
    throw new ApiError(400, "Access key is invalid or unavailable.", "access_key_invalid");
  }

  const now = Date.now();
  if (row.expires_at && Date.parse(row.expires_at) <= now) {
    throw new ApiError(400, "Access key is invalid or unavailable.", "access_key_expired");
  }

  const claimExpiresAt =
    typeof row.metadata.claim_token_expires_at === "string"
      ? Date.parse(row.metadata.claim_token_expires_at)
      : 0;
  if (row.status === "preclaimed" && row.preclaimed_email && row.preclaimed_email !== email && claimExpiresAt > now) {
    throw new ApiError(400, "Access key is invalid or unavailable.", "access_key_unavailable");
  }

  if (row.status !== "active" && row.status !== "preclaimed") {
    throw new ApiError(400, "Access key is invalid or unavailable.", "access_key_unavailable");
  }

  if (params.partnerSlug && row.partner_slug && row.partner_slug !== params.partnerSlug) {
    throw new ApiError(400, "Access key is not valid for this checkout portal.", "access_key_partner_mismatch");
  }

  const claimToken = randomBytes(32).toString("base64url");
  const claimTokenHash = hashWithPepper(claimToken);
  const claimTokenExpiresAt = new Date(Date.now() + CLAIM_TOKEN_EXPIRY_MS).toISOString();
  const metadata = {
    ...row.metadata,
    claim_token_expires_at: claimTokenExpiresAt,
  } satisfies Record<string, Json>;

  const { data: updated, error: updateError } = await admin
    .from("billing_access_keys" as never)
    .update({
      status: "preclaimed",
      claim_token_hash: claimTokenHash,
      preclaimed_email: email,
      preclaimed_at: new Date().toISOString(),
      metadata,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", row.id)
    .in("status", ["active", "preclaimed"])
    .select("*")
    .maybeSingle();

  if (updateError) {
    throwAccessKeyDatabaseError(updateError, "access_key_preclaim_failed");
  }

  const updatedRow = asAccessKeyRow(updated);
  if (!updatedRow) {
    throw new ApiError(409, "Access key is invalid or unavailable.", "access_key_preclaim_conflict");
  }

  await recordAccessKeyEvent({
    admin,
    accessKeyId: row.id,
    eventType: "preclaimed",
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    metadata: {
      key_prefix: row.key_prefix,
      partner_slug: row.partner_slug,
    },
  });

  logOperationalEvent("access_key_preclaimed", {
    accessKeyId: row.id,
    keyPrefix: row.key_prefix,
    partnerSlug: row.partner_slug,
  });

  return {
    claimToken,
    partnerSlug: row.partner_slug,
    keyPrefix: row.key_prefix,
    planTier: row.plan_tier,
  };
}

async function clearUserClaimMetadata(admin: AdminClient, context: AppContext) {
  const metadata = { ...(context.user.user_metadata ?? {}) };
  metadata.access_key_claim_token = null;
  metadata.access_key_partner_slug = null;
  metadata.access_key_claim_consumed_at = new Date().toISOString();

  await admin.auth.admin.updateUserById(context.user.id, {
    user_metadata: metadata,
  }).catch((error) => {
    logWarn("access_key_claim_metadata_clear_failed", {
      userId: context.user.id,
      message: error instanceof Error ? error.message : "Unknown metadata clear failure",
    });
  });
}

export async function claimPendingAccessKeyForCurrentUser(context: AppContext) {
  const claimToken =
    typeof context.user.user_metadata?.access_key_claim_token === "string"
      ? context.user.user_metadata.access_key_claim_token.trim()
      : "";

  if (!claimToken) {
    return {
      claimed: false,
      reason: "no_pending_claim",
    };
  }

  if (!isAccessKeyCheckoutEnabled()) {
    return {
      claimed: false,
      reason: "feature_disabled",
    };
  }

  const admin = requireAdminClient();
  const stripeProvider = getStripeBillingProvider();
  const claimTokenHash = hashWithPepper(claimToken);

  const { data, error } = await admin
    .from("billing_access_keys" as never)
    .select("*")
    .eq("claim_token_hash", claimTokenHash)
    .maybeSingle();

  if (error) {
    throwAccessKeyDatabaseError(error, "access_key_claim_fetch_failed");
  }

  const row = asAccessKeyRow(data);
  if (!row) {
    await clearUserClaimMetadata(admin, context);
    return {
      claimed: false,
      reason: "claim_not_found",
    };
  }

  if (row.status === "claimed" && row.claimed_by_user_id === context.user.id) {
    await clearUserClaimMetadata(admin, context);
    return {
      claimed: true,
      reason: "already_claimed",
      accessKeyId: row.id,
    };
  }

  const now = Date.now();
  const claimTokenExpiresAt =
    typeof row.metadata.claim_token_expires_at === "string"
      ? Date.parse(row.metadata.claim_token_expires_at)
      : 0;

  const failClaim = async (reason: string) => {
    await recordAccessKeyEvent({
      admin,
      accessKeyId: row.id,
      eventType: "claim_failed",
      actorUserId: context.user.id,
      actorOrganizationId: context.organization.id,
      stripeCheckoutSessionId: row.stripe_checkout_session_id,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      metadata: { reason },
    });
    logWarn("access_key_claim_failed", {
      accessKeyId: row.id,
      keyPrefix: row.key_prefix,
      organizationId: context.organization.id,
      userId: context.user.id,
      reason,
    });
    await clearUserClaimMetadata(admin, context);
    return { claimed: false, reason, accessKeyId: row.id };
  };

  if (row.status !== "preclaimed") {
    return failClaim("invalid_status");
  }

  if (row.expires_at && Date.parse(row.expires_at) <= now) {
    return failClaim("expired");
  }

  if (!claimTokenExpiresAt || claimTokenExpiresAt <= now) {
    return failClaim("claim_token_expired");
  }

  const userEmail = normalizeEmail(context.user.email ?? context.profile?.email ?? null);
  if (row.preclaimed_email && userEmail && row.preclaimed_email !== userEmail) {
    return failClaim("email_mismatch");
  }

  if (!row.stripe_subscription_id) {
    return failClaim("subscription_missing");
  }

  const partnerId = row.partner_id;
  const partnerSlug = row.partner_slug;
  const existingSubscription = (await stripeProvider.execute({
    action: "retrieve_subscription",
    subscriptionId: row.stripe_subscription_id,
  })) as Stripe.Subscription;
  const metadataPatch = {
    ...existingSubscription.metadata,
    organization_id: context.organization.id,
    user_id: context.user.id,
    checkout_flow: "access_key",
    access_key_id: row.id,
    plan_tier: row.plan_tier,
    internal_plan_tier: row.plan_tier,
    partner_id: partnerId ?? "",
    partner_slug: partnerSlug ?? "",
    partner_attribution_source: "access_key_checkout",
  };

  if (row.stripe_customer_id) {
    await stripeProvider.execute({
      action: "update_customer",
      customerId: row.stripe_customer_id,
      idempotencyKey: `dealflow_access_key_customer_claim_${row.id}_${context.organization.id}`,
      params: {
        metadata: metadataPatch,
      },
    });
  }

  const updatedSubscription = (await stripeProvider.execute({
    action: "update_subscription",
    subscriptionId: row.stripe_subscription_id,
    idempotencyKey: `dealflow_access_key_subscription_claim_${row.id}_${context.organization.id}`,
    params: {
      metadata: metadataPatch,
    },
  })) as Stripe.Subscription;

  const { data: claimed, error: claimError } = await admin
    .from("billing_access_keys" as never)
    .update({
      status: "claimed",
      claimed_by_user_id: context.user.id,
      claimed_organization_id: context.organization.id,
      claimed_at: new Date().toISOString(),
      partner_id: partnerId,
      partner_slug: partnerSlug,
      metadata: {
        ...row.metadata,
        claimed_source: "app_context_bootstrap",
      },
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", row.id)
    .eq("status", "preclaimed")
    .eq("claim_token_hash", claimTokenHash)
    .is("claimed_by_user_id", null)
    .select("*")
    .maybeSingle();

  if (claimError) {
    throwAccessKeyDatabaseError(claimError, "access_key_claim_failed");
  }

  const claimedRow = asAccessKeyRow(claimed);
  if (!claimedRow) {
    return failClaim("claim_conflict");
  }

  const subscription = (await stripeProvider.execute({
    action: "retrieve_subscription",
    subscriptionId: updatedSubscription.id,
  })) as Stripe.Subscription;

  const syncResult = await syncBillingSubscriptionFromStripe(subscription, {
    eventId: `access_key_claim:${row.id}`,
    eventCreated: Math.floor(Date.now() / 1000),
    eventType: "access_key_claim",
  });

  if (!syncResult.applied) {
    logError("access_key_subscription_sync_failed", {
      accessKeyId: row.id,
      keyPrefix: row.key_prefix,
      organizationId: context.organization.id,
      stripeSubscriptionId: row.stripe_subscription_id,
      ignoredReason: syncResult.ignoredReason,
    });
  }

  await recordAccessKeyEvent({
    admin,
    accessKeyId: row.id,
    eventType: "claimed",
    actorUserId: context.user.id,
    actorOrganizationId: context.organization.id,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    metadata: {
      sync_applied: syncResult.applied,
      sync_ignored_reason: syncResult.ignoredReason ?? null,
    },
  });

  logOperationalEvent("access_key_claimed", {
    accessKeyId: row.id,
    keyPrefix: row.key_prefix,
    organizationId: context.organization.id,
    userId: context.user.id,
    stripeSubscriptionId: row.stripe_subscription_id,
  });

  await clearUserClaimMetadata(admin, context);

  return {
    claimed: true,
    reason: "claimed",
    accessKeyId: row.id,
  };
}

export async function loadAccessKeyCheckoutSuccess(sessionId: string) {
  requireAccessKeyFeature();
  const normalizedSessionId = normalizeOptionalText(sessionId);
  if (!normalizedSessionId) {
    throw new ApiError(400, "Checkout session id is required.", "access_key_session_required");
  }

  const admin = requireAdminClient();
  const stripeProvider = getStripeBillingProvider();
  const session = (await stripeProvider.execute({
    action: "retrieve_checkout_session",
    sessionId: normalizedSessionId,
  })) as Stripe.Checkout.Session;

  if (!isAccessKeyCheckoutSessionObject(session)) {
    throw new ApiError(404, "Access-key checkout session was not found.", "access_key_session_not_found");
  }

  const row = await activateAccessKeyFromCheckoutSession(session, {
    eventId: `checkout_success:${session.id}`,
    eventCreated: session.created,
  }).catch(async (error) => {
    if (error instanceof ApiError && error.code === "access_key_checkout_incomplete") {
      const { data } = await admin
        .from("billing_access_keys" as never)
        .select("*")
        .eq("stripe_checkout_session_id", session.id)
        .maybeSingle();
      return asAccessKeyRow(data);
    }
    throw error;
  });

  if (!row) {
    throw new ApiError(404, "Access key was not found.", "access_key_not_found");
  }

  const revealKey =
    (row.status === "active" || row.status === "preclaimed") && !row.metadata.revealed_at
      ? decryptRevealSecret(row.metadata.reveal_ciphertext)
      : null;

  if (revealKey) {
    const revealMetadata = {
      ...row.metadata,
      reveal_ciphertext: null,
      revealed_at: new Date().toISOString(),
    } satisfies Record<string, Json>;
    await admin
      .from("billing_access_keys" as never)
      .update({
        metadata: revealMetadata,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", row.id)
      .is("claimed_at", null)
      .then(({ error }) => {
        if (error) {
          logWarn("access_key_reveal_metadata_update_failed", {
            accessKeyId: row.id,
            keyPrefix: row.key_prefix,
            message: error.message,
          });
        }
      });
    await recordAccessKeyEvent({
      admin,
      accessKeyId: row.id,
      eventType: "revealed",
      stripeCheckoutSessionId: row.stripe_checkout_session_id,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      metadata: {
        key_prefix: row.key_prefix,
      },
    });
    logOperationalEvent("access_key_revealed", {
      accessKeyId: row.id,
      keyPrefix: row.key_prefix,
    });
  }

  return {
    status: row.status,
    keyPrefix: row.key_prefix,
    rawKey: revealKey,
    planTier: row.plan_tier,
    partnerSlug: row.partner_slug,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
  };
}

export async function listAccessKeysForAdmin(params: {
  limit?: number;
  search?: string | null;
  status?: string | null;
} = {}) {
  const admin = requireAdminClient();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const { data, error } = await admin
    .from("billing_access_keys" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throwAccessKeyDatabaseError(error, "access_key_admin_list_failed");
  }

  let rows = (Array.isArray(data) ? data : [])
    .map((row) => asAccessKeyRow(row))
    .filter((row): row is AccessKeyRow => Boolean(row));
  const search = normalizeOptionalText(params.search)?.toLowerCase();
  const status = normalizeOptionalText(params.status);

  if (status) {
    rows = rows.filter((row) => row.status === status);
  }

  if (search) {
    rows = rows.filter((row) =>
      [
        row.id,
        row.key_prefix,
        row.status,
        row.plan_tier,
        row.partner_slug,
        row.stripe_checkout_session_id,
        row.stripe_customer_id,
        row.stripe_subscription_id,
        row.claimed_by_user_id,
        row.claimed_organization_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    );
  }

  return rows.slice(0, limit);
}

export async function listAccessKeyEventsForAdmin(accessKeyIds: string[]) {
  const admin = requireAdminClient();
  const ids = Array.from(new Set(accessKeyIds.map((id) => normalizeOptionalText(id)).filter((id): id is string => Boolean(id))));
  if (!ids.length) {
    return new Map<string, AccessKeyEventRow[]>();
  }

  const { data, error } = await admin
    .from("billing_access_key_events" as never)
    .select("*")
    .in("access_key_id", ids)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throwAccessKeyDatabaseError(error, "access_key_admin_events_failed");
  }

  const events = (Array.isArray(data) ? data : [])
    .map((row) => asAccessKeyEventRow(row))
    .filter((row): row is AccessKeyEventRow => Boolean(row));
  const byKey = new Map<string, AccessKeyEventRow[]>();
  for (const event of events) {
    const existing = byKey.get(event.access_key_id) ?? [];
    existing.push(event);
    byKey.set(event.access_key_id, existing);
  }

  return byKey;
}

export async function revokeAccessKey(params: {
  id: string;
  actorUserId: string;
  actorOrganizationId: string;
  reason?: string | null;
}) {
  const admin = requireAdminClient();
  const accessKeyId = normalizeOptionalText(params.id);
  if (!accessKeyId) {
    throw new ApiError(400, "Access key id is required.", "access_key_id_required");
  }

  const { data, error } = await admin
    .from("billing_access_keys" as never)
    .update({
      status: "revoked",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", accessKeyId)
    .in("status", ["created", "pending_payment", "active", "preclaimed"])
    .select("*")
    .maybeSingle();

  if (error) {
    throwAccessKeyDatabaseError(error, "access_key_revoke_failed");
  }

  const row = asAccessKeyRow(data);
  if (!row) {
    throw new ApiError(409, "Access key cannot be revoked.", "access_key_revoke_unavailable");
  }

  await recordAccessKeyEvent({
    admin,
    accessKeyId,
    eventType: "revoked",
    actorUserId: params.actorUserId,
    actorOrganizationId: params.actorOrganizationId,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    metadata: {
      reason: normalizeOptionalText(params.reason),
    },
  });

  logOperationalEvent("access_key_revoked", {
    accessKeyId,
    keyPrefix: row.key_prefix,
    actorUserId: params.actorUserId,
  });

  return row;
}
