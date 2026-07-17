import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import Stripe from "stripe";
import { ApiError } from "@/lib/api/route";
import {
  getAccessKeyHashPepper,
  getAccessKeyRevealEncryptionKey,
  getPublicAppUrl,
  getStripeAccessKeyPrefix,
  isAccessKeyCheckoutEnabled,
} from "@/lib/env";
import { getStripeBillingProvider } from "@/lib/integrations/stripe/provider";
import {
  buildStripeCheckoutMetadata,
  getStripePriceId,
} from "@/lib/integrations/stripe/service";
import {
  assertStripeObjectRuntimeMode,
  claimStripeWebhookEvent,
  markStripeWebhookEvent,
  projectStripeCheckoutLifecycleEvent,
  syncBillingSubscriptionFromStripe,
} from "@/lib/services/billing-service";
import { getStripeCheckoutPromotionPolicy } from "@/lib/billing/stripe-promotion-policy";
import { evaluateCommercialActivationCandidate } from "@/lib/commercial-activation-policy";
import { recordCommercialActivationWithInitialCredit } from "@/lib/services/credit-service";
import {
  type BillingPlanTier,
  NEW_CHECKOUT_PLAN_TIER,
  type NewCheckoutPlanTier,
} from "@/lib/billing/plans";
import {
  validateAccessKeyCheckoutSessionEnvelope,
  validateAccessKeyCheckoutSessionBinding,
  validateAccessKeyStripeActivationBinding,
  requireAccessKeyPlanTier,
} from "@/lib/billing/access-key-checkout-binding";
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
  claim_token_expires_at: string | null;
  claim_reconciliation_status: string;
  claim_reconciliation_lease_token: string | null;
  claim_reconciliation_locked_until: string | null;
  claim_reconciliation_generation: number;
  claim_reconciliation_last_error_code: string | null;
  reveal_verifier_hash: string | null;
  reveal_verifier_expires_at: string | null;
  reveal_consumed_at: string | null;
  reveal_delivery_token_hash: string | null;
  reveal_delivery_started_at: string | null;
  reveal_delivery_expires_at: string | null;
  reveal_delivery_generation: number;
  reveal_ack_token_hash: string | null;
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

export type PublicPartnerCheckout = {
  slug: string;
  brandName: string;
};

const ACCESS_KEY_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;
const CLAIM_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
const REVEAL_VERIFIER_EXPIRY_MS = 24 * 60 * 60 * 1000;
const CLAIM_RECONCILIATION_LEASE_MS = 10 * 60_000;
const REVEAL_DELIVERY_LEASE_MS = 5 * 60_000;

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

function normalizeNonnegativeInteger(value: unknown) {
  const normalized = Number(value ?? 0);
  return Number.isSafeInteger(normalized) && normalized >= 0 ? normalized : 0;
}

type AccessKeyCommercialPaymentProof = {
  sourceEventId: string;
  sourceEventCreated: number;
  amountPaidCents: number;
  paymentStatus: string;
  sourcePaymentId: string | null;
  currency: string | null;
};

function readAccessKeyCommercialPaymentProof(row: AccessKeyRow): AccessKeyCommercialPaymentProof {
  const value = row.metadata.commercial_activation_payment_proof;
  const proof =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, Json>)
      : null;
  const sourceEventId =
    typeof proof?.source_event_id === "string" ? proof.source_event_id.trim() : "";
  const sourceEventCreated = Number(proof?.source_event_created ?? 0);
  const amountPaidCents = Number(proof?.amount_paid_cents ?? 0);
  const paymentStatus =
    typeof proof?.payment_status === "string" ? proof.payment_status : "";

  if (
    !sourceEventId ||
    !Number.isInteger(sourceEventCreated) ||
    sourceEventCreated <= 0 ||
    !Number.isInteger(amountPaidCents) ||
    amountPaidCents <= 0 ||
    paymentStatus !== "paid"
  ) {
    throw new ApiError(
      409,
      "The access key does not carry a qualifying initial-payment proof for workspace activation.",
      "access_key_commercial_activation_proof_missing",
    );
  }

  return {
    sourceEventId,
    sourceEventCreated,
    amountPaidCents,
    paymentStatus,
    sourcePaymentId:
      typeof proof?.source_payment_id === "string" ? proof.source_payment_id : null,
    currency: typeof proof?.currency === "string" ? proof.currency : null,
  };
}

async function ensureAccessKeyCommercialActivation(params: {
  row: AccessKeyRow;
  context: AppContext;
  subscription?: Stripe.Subscription;
  syncResult?: Awaited<ReturnType<typeof syncBillingSubscriptionFromStripe>>;
}) {
  const proof = readAccessKeyCommercialPaymentProof(params.row);
  const stripeProvider = getStripeBillingProvider();
  const subscriptionId = params.row.stripe_subscription_id;

  if (!subscriptionId) {
    throw new ApiError(409, "Access-key subscription is missing.", "access_key_subscription_missing");
  }

  const subscription =
    params.subscription ??
    ((await stripeProvider.execute({
      action: "retrieve_subscription",
      subscriptionId,
    })) as Stripe.Subscription);
  assertStripeObjectRuntimeMode(subscription, "Stripe access-key subscription");
  const syncResult =
    params.syncResult ??
    (await syncBillingSubscriptionFromStripe(subscription, {
      eventId: `access_key_claim:${params.row.id}`,
      eventCreated: proof.sourceEventCreated,
      eventType: "access_key_claim",
    }));
  const admin = requireAdminClient();
  const { data: billingRow, error: billingError } = await admin
    .from("billing_subscriptions")
    .select("stripe_subscription_id,status,user_id")
    .eq("organization_id", params.context.organization.id)
    .maybeSingle();

  if (billingError) {
    throwAccessKeyDatabaseError(billingError, "access_key_billing_state_lookup_failed");
  }

  const durableBillingRow = billingRow as {
    stripe_subscription_id?: string | null;
    status?: string | null;
    user_id?: string | null;
  } | null;
  const durableBillingApplied = Boolean(
    durableBillingRow &&
      durableBillingRow.stripe_subscription_id === subscriptionId &&
      durableBillingRow.user_id === params.context.user.id &&
      (durableBillingRow.status === "active" ||
        durableBillingRow.status === "trialing" ||
        durableBillingRow.status === "past_due"),
  );
  const decision = evaluateCommercialActivationCandidate({
    source: "checkout.session.completed",
    billingStateApplied: syncResult.applied || durableBillingApplied,
    organizationId: params.context.organization.id,
    userId: params.context.user.id,
    sourceEventId: proof.sourceEventId,
    sourceEventCreated: proof.sourceEventCreated,
    amountPaidCents: proof.amountPaidCents,
    paymentStatus: proof.paymentStatus,
    invoiceBillingReason: null,
  });

  if (!decision.eligible) {
    throw new ApiError(
      409,
      `Access-key commercial activation is blocked: ${decision.reason}.`,
      "access_key_commercial_activation_blocked",
    );
  }

  return recordCommercialActivationWithInitialCredit({
    organizationId: params.context.organization.id,
    userId: params.context.user.id,
    sourceEventId: proof.sourceEventId,
    sourceEventType: "checkout.session.completed",
    sourceEventCreated: proof.sourceEventCreated,
    sourcePaymentId: proof.sourcePaymentId,
    sourceSubscriptionId: subscriptionId,
    amountPaidCents: proof.amountPaidCents,
    currency: proof.currency,
    metadata: {
      qualification: decision.reason,
      accessKeyId: params.row.id,
      checkoutFlow: "access_key",
    },
  });
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
    plan_tier: requireAccessKeyPlanTier(row.plan_tier),
    partner_id: normalizeOptionalText(row.partner_id as string | null),
    partner_slug: normalizeOptionalText(row.partner_slug as string | null),
    claim_token_hash: normalizeOptionalText(row.claim_token_hash as string | null),
    claim_token_expires_at: normalizeOptionalText(row.claim_token_expires_at as string | null),
    claim_reconciliation_status: String(row.claim_reconciliation_status ?? "not_started"),
    claim_reconciliation_lease_token: normalizeOptionalText(
      row.claim_reconciliation_lease_token as string | null,
    ),
    claim_reconciliation_locked_until: normalizeOptionalText(
      row.claim_reconciliation_locked_until as string | null,
    ),
    claim_reconciliation_generation: normalizeNonnegativeInteger(
      row.claim_reconciliation_generation,
    ),
    claim_reconciliation_last_error_code: normalizeOptionalText(
      row.claim_reconciliation_last_error_code as string | null,
    ),
    reveal_verifier_hash: normalizeOptionalText(row.reveal_verifier_hash as string | null),
    reveal_verifier_expires_at: normalizeOptionalText(row.reveal_verifier_expires_at as string | null),
    reveal_consumed_at: normalizeOptionalText(row.reveal_consumed_at as string | null),
    reveal_delivery_token_hash: normalizeOptionalText(
      row.reveal_delivery_token_hash as string | null,
    ),
    reveal_delivery_started_at: normalizeOptionalText(
      row.reveal_delivery_started_at as string | null,
    ),
    reveal_delivery_expires_at: normalizeOptionalText(
      row.reveal_delivery_expires_at as string | null,
    ),
    reveal_delivery_generation: normalizeNonnegativeInteger(row.reveal_delivery_generation),
    reveal_ack_token_hash: normalizeOptionalText(row.reveal_ack_token_hash as string | null),
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

function buildAccessKeyClaimToken(keyHash: string, email: string) {
  return createHmac("sha256", requireAccessKeyPepper())
    .update("dealflow-access-key-claim:v1:", "utf8")
    .update(keyHash, "utf8")
    .update(":", "utf8")
    .update(email, "utf8")
    .digest("base64url");
}

function secureHashMatches(left: string, right: string) {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
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

function formatResolvedPartnerName(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function loadPublicPartnerCheckout(
  partnerSlug: string | null | undefined,
): Promise<PublicPartnerCheckout | null> {
  requireAccessKeyFeature();
  const normalizedSlug = normalizeOptionalText(partnerSlug);
  if (!normalizedSlug) {
    return null;
  }

  const admin = requireAdminClient();
  const { data: partner, error: partnerError } = await admin
    .from("partners")
    .select("slug,status")
    .eq("slug", normalizedSlug)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (partnerError) {
    throwAccessKeyDatabaseError(partnerError, "partner_lookup_failed");
  }

  const resolvedSlug = normalizeOptionalText(
    (partner as { slug?: string | null } | null)?.slug ?? null,
  );
  if (!resolvedSlug || resolvedSlug !== normalizedSlug) {
    return null;
  }
  const brandName = formatResolvedPartnerName(resolvedSlug);
  if (!brandName) {
    return null;
  }

  return {
    slug: resolvedSlug,
    brandName,
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
  const prefix = getStripeAccessKeyPrefix();

  if (!prefix) {
    throw new ApiError(
      503,
      "Stripe runtime mode is not configured safely.",
      "stripe_runtime_mode_not_configured",
    );
  }

  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

export function hashAccessKey(rawKey: string) {
  return hashWithPepper(rawKey.trim());
}

export async function createAccessKeyCheckoutSession(params: {
  planTier: NewCheckoutPlanTier;
  partnerSlug?: string | null;
  buyerEmail?: string | null;
  buyerName?: string | null;
}) {
  if (params.planTier !== NEW_CHECKOUT_PLAN_TIER) {
    throw new ApiError(
      400,
      "Pro is the only plan available for new DealFlow access keys.",
      "new_checkout_plan_forbidden",
    );
  }

  requireAccessKeyFeature();
  const admin = requireAdminClient();
  const stripeProvider = getStripeBillingProvider();

  if (!stripeProvider.isConfigured()) {
    throw new ApiError(503, "Stripe is not configured yet.", "stripe_not_configured");
  }

  const planTier = params.planTier;
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
  const revealVerifier = randomBytes(32).toString("base64url");
  const revealVerifierHash = hashWithPepper(revealVerifier);
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
      reveal_verifier_hash: revealVerifierHash,
      reveal_verifier_expires_at: new Date(
        now.getTime() + REVEAL_VERIFIER_EXPIRY_MS,
      ).toISOString(),
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
      ...getStripeCheckoutPromotionPolicy({
        surface: "access_key",
        partnerSlug: partnerBilling.partnerSlug,
      }),
      payment_method_collection: "always",
      metadata,
      subscription_data: {
        metadata,
      },
    },
  })) as Stripe.Checkout.Session;
  assertStripeObjectRuntimeMode(session, "Stripe access-key Checkout Session");

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
    revealVerifier,
  };
}

export function isAccessKeyCheckoutSessionObject(object: Stripe.Event.Data.Object): object is Stripe.Checkout.Session {
  const checkoutObject = object as { object?: unknown; metadata?: Record<string, string> | null };
  return checkoutObject.object === "checkout.session" && checkoutObject.metadata?.checkout_flow === "access_key";
}

function assertQualifyingAccessKeyCheckout(session: Stripe.Checkout.Session) {
  if (session.status !== "complete") {
    throw new ApiError(409, "Checkout session has not completed yet.", "access_key_checkout_incomplete");
  }

  if (
    session.payment_status !== "paid" ||
    typeof session.amount_total !== "number" ||
    !Number.isInteger(session.amount_total) ||
    session.amount_total <= 0
  ) {
    throw new ApiError(
      409,
      "Access-key activation requires a completed, positive Stripe payment.",
      "access_key_payment_not_qualifying",
    );
  }
}

async function loadAuthoritativeAccessKeyCheckoutSession(params: {
  session: Stripe.Checkout.Session;
  row: AccessKeyRow;
  stripeProvider: ReturnType<typeof getStripeBillingProvider>;
}) {
  const incomingBinding = validateAccessKeyCheckoutSessionEnvelope({
    session: params.session,
    row: params.row,
    allowNullOnlyRecovery: true,
  });
  const authoritativeSession = (await params.stripeProvider.execute({
    action: "retrieve_checkout_session",
    sessionId: params.session.id,
  })) as Stripe.Checkout.Session;
  assertStripeObjectRuntimeMode(
    authoritativeSession,
    "Stripe access-key Checkout Session",
  );
  if (authoritativeSession.id !== params.session.id) {
    throw new ApiError(
      409,
      "Stripe checkout refresh returned a different session.",
      "access_key_checkout_session_refresh_mismatch",
    );
  }

  assertQualifyingAccessKeyCheckout(authoritativeSession);
  const authoritativeBinding = validateAccessKeyCheckoutSessionBinding({
    session: authoritativeSession,
    row: params.row,
    allowNullOnlyRecovery: true,
  });
  if (
    incomingBinding.customerId !== authoritativeBinding.customerId ||
    incomingBinding.subscriptionId !== authoritativeBinding.subscriptionId ||
    incomingBinding.expectedPriceId !== authoritativeBinding.expectedPriceId
  ) {
    throw new ApiError(
      409,
      "Stripe checkout refresh did not preserve the signed binding envelope.",
      "access_key_checkout_session_refresh_mismatch",
    );
  }

  const customer = authoritativeSession.customer;
  if (!customer || typeof customer === "string" || ("deleted" in customer && customer.deleted)) {
    throw new ApiError(
      409,
      "Stripe checkout customer identity could not be verified.",
      "access_key_customer_binding_invalid",
    );
  }
  assertStripeObjectRuntimeMode(customer, "Stripe access-key customer");

  return {
    session: authoritativeSession,
    binding: authoritativeBinding,
  };
}

async function recoverNullOnlyAccessKeyCheckoutBinding(params: {
  admin: AdminClient;
  row: AccessKeyRow;
  session: Stripe.Checkout.Session;
  customerId: string;
}) {
  if (params.row.stripe_checkout_session_id !== null) {
    return params.row;
  }

  const { data: recovered, error: recoveryError } = await params.admin
    .from("billing_access_keys" as never)
    .update({
      status: "pending_payment",
      stripe_checkout_session_id: params.session.id,
      stripe_customer_id: params.customerId,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", params.row.id)
    .eq("status", "created")
    .is("stripe_checkout_session_id", null)
    .is("stripe_customer_id", null)
    .is("stripe_subscription_id", null)
    .is("stripe_price_id", null)
    .select("*")
    .maybeSingle();

  if (recoveryError) {
    throwAccessKeyDatabaseError(
      recoveryError,
      "access_key_checkout_binding_recovery_failed",
    );
  }

  const recoveredRow = asAccessKeyRow(recovered);
  if (recoveredRow) {
    return recoveredRow;
  }

  const { data: current, error: currentError } = await params.admin
    .from("billing_access_keys" as never)
    .select("*")
    .eq("id", params.row.id)
    .maybeSingle();
  if (currentError) {
    throwAccessKeyDatabaseError(currentError, "access_key_fetch_failed");
  }
  const currentRow = asAccessKeyRow(current);
  if (
    !currentRow ||
    currentRow.stripe_checkout_session_id !== params.session.id ||
    currentRow.stripe_customer_id !== params.customerId
  ) {
    throw new ApiError(
      409,
      "The access-key checkout binding could not be recovered safely.",
      "access_key_checkout_binding_recovery_conflict",
    );
  }
  return currentRow;
}

export async function activateAccessKeyFromCheckoutSession(
  session: Stripe.Checkout.Session,
  source?: { eventId?: string | null; eventCreated?: number | null },
) {
  assertStripeObjectRuntimeMode(session, "Stripe access-key Checkout Session");
  const accessKeyId = normalizeOptionalText(session.metadata?.access_key_id ?? null);
  if (!accessKeyId) {
    throw new ApiError(400, "Access-key checkout session is missing key metadata.", "access_key_metadata_missing");
  }

  assertQualifyingAccessKeyCheckout(session);

  const admin = requireAdminClient();
  const stripeProvider = getStripeBillingProvider();

  const { data: existing, error: existingError } = await admin
    .from("billing_access_keys" as never)
    .select("*")
    .eq("id", accessKeyId)
    .maybeSingle();

  if (existingError) {
    throwAccessKeyDatabaseError(existingError, "access_key_fetch_failed");
  }

  let existingRow = asAccessKeyRow(existing);
  if (!existingRow) {
    throw new ApiError(404, "Access key was not found.", "access_key_not_found");
  }

  const authoritative = await loadAuthoritativeAccessKeyCheckoutSession({
    session,
    row: existingRow,
    stripeProvider,
  });
  existingRow = await recoverNullOnlyAccessKeyCheckoutBinding({
    admin,
    row: existingRow,
    session: authoritative.session,
    customerId: authoritative.binding.customerId,
  });
  const subscription = (await stripeProvider.execute({
    action: "retrieve_subscription",
    subscriptionId: authoritative.binding.subscriptionId,
  })) as Stripe.Subscription;
  assertStripeObjectRuntimeMode(subscription, "Stripe access-key subscription");
  const binding = validateAccessKeyStripeActivationBinding({
    session: authoritative.session,
    subscription,
    row: existingRow,
  });

  if (
    existingRow.status === "claimed" ||
    existingRow.status === "active" ||
    existingRow.status === "preclaimed"
  ) {
    return existingRow;
  }
  if (
    existingRow.status !== "created" &&
    existingRow.status !== "pending_payment" &&
    existingRow.status !== "payment_failed"
  ) {
    throw new ApiError(
      409,
      "Access key is not eligible for Stripe activation.",
      "access_key_activation_unavailable",
    );
  }

  const metadata = {
    ...existingRow.metadata,
    activated_at: new Date().toISOString(),
    stripe_event_id: source?.eventId ?? null,
    commercial_activation_payment_proof: {
      source_event_id: source?.eventId || `checkout_session:${authoritative.session.id}`,
      source_event_created: source?.eventCreated ?? authoritative.session.created,
      amount_paid_cents: authoritative.session.amount_total,
      payment_status: authoritative.session.payment_status,
      source_payment_id:
        typeof authoritative.session.payment_intent === "string"
          ? authoritative.session.payment_intent
          : authoritative.session.payment_intent?.id ?? null,
      currency: authoritative.session.currency ?? null,
    },
  } satisfies Record<string, Json>;

  const { data: updated, error: updateError } = await admin
    .from("billing_access_keys" as never)
    .update({
      status: "active",
      stripe_checkout_session_id: authoritative.session.id,
      stripe_customer_id: binding.customerId,
      stripe_subscription_id: binding.subscriptionId,
      stripe_price_id: binding.priceId,
      metadata,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", accessKeyId)
    .eq("stripe_checkout_session_id", authoritative.session.id)
    .eq("stripe_customer_id", binding.customerId)
    .is("stripe_subscription_id", null)
    .is("stripe_price_id", null)
    .in("status", ["created", "pending_payment", "payment_failed"])
    .select("*")
    .maybeSingle();

  if (updateError) {
    throwAccessKeyDatabaseError(updateError, "access_key_activation_failed");
  }

  let row = asAccessKeyRow(updated);
  if (!row) {
    const { data: current, error: currentError } = await admin
      .from("billing_access_keys" as never)
      .select("*")
      .eq("id", accessKeyId)
      .maybeSingle();
    if (currentError) {
      throwAccessKeyDatabaseError(currentError, "access_key_fetch_failed");
    }
    row = asAccessKeyRow(current);
    if (
      !row ||
      !["active", "preclaimed", "claimed"].includes(row.status)
    ) {
      throw new ApiError(
        409,
        "Access-key activation lost its compare-and-set race.",
        "access_key_activation_conflict",
      );
    }
    validateAccessKeyStripeActivationBinding({
      session: authoritative.session,
      subscription,
      row,
    });
    return row;
  }
  await recordAccessKeyEvent({
    admin,
    accessKeyId,
    eventType: "activated",
    stripeCheckoutSessionId: authoritative.session.id,
    stripeCustomerId: binding.customerId,
    stripeSubscriptionId: binding.subscriptionId,
    metadata: {
      stripe_event_id: source?.eventId ?? null,
      stripe_event_created: source?.eventCreated ?? null,
    },
  });

  logOperationalEvent("access_key_checkout_completed", {
    accessKeyId,
    keyPrefix: row.key_prefix,
    stripeCheckoutSessionId: authoritative.session.id,
    stripeCustomerId: binding.customerId,
    stripeSubscriptionId: binding.subscriptionId,
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
    const lifecycle = await projectStripeCheckoutLifecycleEvent(event);
    if (lifecycle?.normalized.flow === "access_key") {
      if (lifecycle.normalized.paymentState === "succeeded") {
        await activateAccessKeyFromCheckoutSession(event.data.object as Stripe.Checkout.Session, {
          eventId: event.id,
          eventCreated: event.created,
        });
      }
      await settleClaim({ status: "processed" });
      return {
        duplicate: false,
        processed: true,
      };
    }

    await settleClaim({
      status: "ignored",
      errorMessage: "Event was not an access-key checkout event.",
    });
    return {
      duplicate: false,
      processed: false,
    };
  } catch (error) {
    await settleClaim({
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

  // The same raw key + normalized email produces the same opaque claim token.
  // A failed or ambiguous signup can therefore retry without invalidating the
  // token already stored on an account whose signup actually succeeded.
  const claimToken = buildAccessKeyClaimToken(keyHash, email);
  const claimTokenHash = hashWithPepper(claimToken);
  const claimTokenExpiresAt = new Date(Date.now() + CLAIM_TOKEN_EXPIRY_MS).toISOString();
  const { data: updated, error: updateError } = await (admin as any).rpc(
    "preclaim_billing_access_key",
    {
      p_key_hash: keyHash,
      p_email: email,
      p_partner_slug: normalizeOptionalText(params.partnerSlug),
      p_claim_token_hash: claimTokenHash,
      p_claim_token_expires_at: claimTokenExpiresAt,
    },
  );
  if (updateError) {
    throwAccessKeyDatabaseError(updateError, "access_key_preclaim_failed");
  }

  const updatedRow = asAccessKeyRow(Array.isArray(updated) ? updated[0] : updated);
  if (!updatedRow) {
    throw new ApiError(409, "Access key is invalid or unavailable.", "access_key_preclaim_conflict");
  }

  await recordAccessKeyEvent({
    admin,
    accessKeyId: updatedRow.id,
    eventType: "preclaimed",
    stripeCheckoutSessionId: updatedRow.stripe_checkout_session_id,
    stripeCustomerId: updatedRow.stripe_customer_id,
    stripeSubscriptionId: updatedRow.stripe_subscription_id,
    metadata: {
      key_prefix: updatedRow.key_prefix,
      partner_slug: updatedRow.partner_slug,
    },
  });

  logOperationalEvent("access_key_preclaimed", {
    accessKeyId: updatedRow.id,
    keyPrefix: updatedRow.key_prefix,
    partnerSlug: updatedRow.partner_slug,
  });

  return {
    claimToken,
    partnerSlug: updatedRow.partner_slug,
    keyPrefix: updatedRow.key_prefix,
    planTier: updatedRow.plan_tier,
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

async function completeClaimedAccessKey(params: {
  admin: AdminClient;
  context: AppContext;
  row: AccessKeyRow;
  reason: "claimed" | "already_claimed";
  leaseToken: string;
  leaseGeneration: number;
}) {
  const { admin, context, row } = params;
  const stripeProvider = getStripeBillingProvider();
  const subscriptionId = row.stripe_subscription_id;

  if (
    row.claim_reconciliation_status !== "processing" ||
    row.claim_reconciliation_lease_token !== params.leaseToken ||
    row.claim_reconciliation_generation !== params.leaseGeneration
  ) {
    throw new ApiError(
      409,
      "Access-key reconciliation is owned by another request.",
      "access_key_reconciliation_lease_lost",
    );
  }

  if (!subscriptionId) {
    throw new ApiError(409, "Access-key subscription is missing.", "access_key_subscription_missing");
  }

  try {
    let subscription = (await stripeProvider.execute({
      action: "retrieve_subscription",
      subscriptionId,
    })) as Stripe.Subscription;
    assertStripeObjectRuntimeMode(subscription, "Stripe access-key subscription");

    if (row.metadata.provider_sync_status !== "completed") {
      const metadataPatch = {
        ...subscription.metadata,
        organization_id: context.organization.id,
        user_id: context.user.id,
        checkout_flow: "access_key",
        access_key_id: row.id,
        plan_tier: row.plan_tier,
        internal_plan_tier: row.plan_tier,
        partner_id: row.partner_id ?? "",
        partner_slug: row.partner_slug ?? "",
        partner_attribution_source: "access_key_checkout",
      };

      if (row.stripe_customer_id) {
        await stripeProvider.execute({
          action: "update_customer",
          customerId: row.stripe_customer_id,
          idempotencyKey: `dealflow_access_key_customer_claim_${row.id}_${context.organization.id}`,
          params: { metadata: metadataPatch },
        });
      }

      subscription = (await stripeProvider.execute({
        action: "update_subscription",
        subscriptionId,
        idempotencyKey: `dealflow_access_key_subscription_claim_${row.id}_${context.organization.id}`,
        params: { metadata: metadataPatch },
      })) as Stripe.Subscription;
      assertStripeObjectRuntimeMode(subscription, "Stripe access-key subscription");
    }

    const syncResult = await syncBillingSubscriptionFromStripe(subscription, {
      eventId: `access_key_claim:${row.id}`,
      eventCreated: Math.floor(Date.now() / 1000),
      eventType: "access_key_claim",
    });
    const activationResult = await ensureAccessKeyCommercialActivation({
      row,
      context,
      subscription,
      syncResult,
    });

    const { data: completionAccepted, error: completionError } = await (admin as any).rpc(
      "complete_billing_access_key_reconciliation",
      {
        p_access_key_id: row.id,
        p_user_id: context.user.id,
        p_organization_id: context.organization.id,
        p_lease_token: params.leaseToken,
        p_lease_generation: params.leaseGeneration,
        p_metadata_patch: {
          provider_sync_status: "completed",
          provider_sync_completed_at: new Date().toISOString(),
          provider_sync_last_error_code: null,
        },
      },
    );

    if (completionError) {
      throwAccessKeyDatabaseError(completionError, "access_key_claim_completion_persist_failed");
    }
    if (completionAccepted !== true) {
      throw new ApiError(
        409,
        "Access-key reconciliation was superseded before completion.",
        "access_key_reconciliation_lease_lost",
      );
    }

    if (!syncResult.applied) {
      logError("access_key_subscription_sync_failed", {
        accessKeyId: row.id,
        keyPrefix: row.key_prefix,
        organizationId: context.organization.id,
        stripeSubscriptionId: subscriptionId,
        ignoredReason: syncResult.ignoredReason,
      });
    }

    await recordAccessKeyEvent({
      admin,
      accessKeyId: row.id,
      eventType: params.reason === "claimed" ? "claimed" : "claim_reconciled",
      actorUserId: context.user.id,
      actorOrganizationId: context.organization.id,
      stripeCheckoutSessionId: row.stripe_checkout_session_id,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: subscriptionId,
      metadata: {
        sync_applied: syncResult.applied,
        sync_ignored_reason: syncResult.ignoredReason ?? null,
        commercial_activation_id: activationResult.activationId,
        initial_credit_granted: activationResult.initialCreditGranted,
      },
    });

    logOperationalEvent("access_key_claimed", {
      accessKeyId: row.id,
      keyPrefix: row.key_prefix,
      organizationId: context.organization.id,
      userId: context.user.id,
      stripeSubscriptionId: subscriptionId,
      commercialActivationId: activationResult.activationId,
      initialCreditGranted: activationResult.initialCreditGranted,
      reconciliation: params.reason === "already_claimed",
    });

    await clearUserClaimMetadata(admin, context);
    return { claimed: true, reason: params.reason, accessKeyId: row.id };
  } catch (error) {
    const errorCode = error instanceof ApiError ? error.code : "access_key_provider_reconciliation_failed";
    await (admin as any).rpc("fail_billing_access_key_reconciliation", {
      p_access_key_id: row.id,
      p_user_id: context.user.id,
      p_organization_id: context.organization.id,
      p_lease_token: params.leaseToken,
      p_lease_generation: params.leaseGeneration,
      p_error_code: errorCode,
    }).then(() => undefined, () => undefined);
    throw error;
  }
}

export async function claimPendingAccessKeyForCurrentUser(context: AppContext) {
  const claimToken =
    typeof context.user.user_metadata?.access_key_claim_token === "string"
      ? context.user.user_metadata.access_key_claim_token.trim()
      : "";
  const hasPendingClaimToken = Boolean(claimToken);

  if (!isAccessKeyCheckoutEnabled()) {
    return {
      claimed: false,
      reason: "feature_disabled",
    };
  }

  const admin = requireAdminClient();
  const claimTokenHash = hashWithPepper(
    claimToken || `workspace-recovery:${context.user.id}:${context.organization.id}`,
  );
  const userEmail = normalizeEmail(context.user.email ?? context.profile?.email ?? null);
  if (!userEmail) {
    if (hasPendingClaimToken) {
      await clearUserClaimMetadata(admin, context);
      return { claimed: false, reason: "claim_email_missing" };
    }
    return { claimed: false, reason: "no_pending_claim" };
  }

  const { data, error } = await (admin as any).rpc(
    "claim_billing_access_key_reconciliation",
    {
      p_claim_token_hash: claimTokenHash,
      p_user_id: context.user.id,
      p_organization_id: context.organization.id,
      p_email: userEmail,
      p_lease_ms: CLAIM_RECONCILIATION_LEASE_MS,
    },
  );

  if (error) {
    throwAccessKeyDatabaseError(error, "access_key_claim_failed");
  }

  const result = data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
  const outcome = typeof result.outcome === "string" ? result.outcome : "invalid";
  const accessKeyId = typeof result.access_key_id === "string" ? result.access_key_id : null;

  if (outcome === "in_progress") {
    return {
      claimed: false,
      reason: "claim_reconciliation_in_progress",
      ...(accessKeyId ? { accessKeyId } : {}),
    };
  }

  if (outcome === "ambiguous_recovery") {
    logWarn("access_key_claim_recovery_ambiguous", {
      organizationId: context.organization.id,
      userId: context.user.id,
    });
    return { claimed: false, reason: "claim_reconciliation_ambiguous" };
  }

  if (outcome === "completed") {
    await clearUserClaimMetadata(admin, context);
    return {
      claimed: true,
      reason: "already_claimed" as const,
      ...(accessKeyId ? { accessKeyId } : {}),
    };
  }

  if (outcome !== "acquired" && outcome !== "recovered") {
    if (outcome === "not_found" && !hasPendingClaimToken) {
      return { claimed: false, reason: "no_pending_claim" };
    }
    if (accessKeyId) {
      await recordAccessKeyEvent({
        admin,
        accessKeyId,
        eventType: "claim_failed",
        actorUserId: context.user.id,
        actorOrganizationId: context.organization.id,
        metadata: { reason: outcome },
      });
    }
    logWarn("access_key_claim_failed", {
      accessKeyId,
      organizationId: context.organization.id,
      userId: context.user.id,
      reason: outcome,
    });
    if (hasPendingClaimToken) {
      await clearUserClaimMetadata(admin, context);
    }
    return {
      claimed: false,
      reason: outcome,
      ...(accessKeyId ? { accessKeyId } : {}),
    };
  }

  const row = asAccessKeyRow(result.access_key);
  if (
    !row ||
    row.status !== "claimed" ||
    row.claimed_by_user_id !== context.user.id ||
    row.claimed_organization_id !== context.organization.id ||
    row.claim_reconciliation_status !== "processing" ||
    !row.claim_reconciliation_lease_token ||
    row.claim_reconciliation_generation <= 0
  ) {
    throw new ApiError(
      500,
      "The database returned an incomplete access-key reconciliation claim.",
      "access_key_reconciliation_claim_invalid",
    );
  }

  return completeClaimedAccessKey({
    admin,
    context,
    row,
    reason: outcome === "recovered" ? "already_claimed" : "claimed",
    leaseToken: row.claim_reconciliation_lease_token,
    leaseGeneration: row.claim_reconciliation_generation,
  });
}

export async function loadAccessKeyCheckoutSuccess(
  sessionId: string,
  revealVerifier: string | null | undefined,
) {
  requireAccessKeyFeature();
  const normalizedSessionId = normalizeOptionalText(sessionId);
  if (!normalizedSessionId) {
    throw new ApiError(400, "Checkout session id is required.", "access_key_session_required");
  }
  const normalizedVerifier = revealVerifier?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(normalizedVerifier)) {
    throw new ApiError(
      404,
      "Access-key checkout handoff is not available.",
      "access_key_reveal_verifier_missing",
    );
  }
  const revealVerifierHash = hashWithPepper(normalizedVerifier);

  const admin = requireAdminClient();
  const stripeProvider = getStripeBillingProvider();
  const session = (await stripeProvider.execute({
    action: "retrieve_checkout_session",
    sessionId: normalizedSessionId,
  })) as Stripe.Checkout.Session;
  assertStripeObjectRuntimeMode(session, "Stripe access-key Checkout Session");

  if (!isAccessKeyCheckoutSessionObject(session)) {
    throw new ApiError(404, "Access-key checkout session was not found.", "access_key_session_not_found");
  }

  const row = await activateAccessKeyFromCheckoutSession(session, {
    eventId: `checkout_success:${session.id}`,
    eventCreated: session.created,
  });

  if (!row) {
    throw new ApiError(404, "Access key was not found.", "access_key_not_found");
  }

  const deliveryToken = randomBytes(32).toString("base64url");
  const deliveryTokenHash = hashWithPepper(deliveryToken);
  const { data: delivery, error: deliveryError } = await (admin as any).rpc(
    "begin_billing_access_key_reveal_delivery",
    {
      p_checkout_session_id: normalizedSessionId,
      p_reveal_verifier_hash: revealVerifierHash,
      p_delivery_token_hash: deliveryTokenHash,
      p_lease_ms: REVEAL_DELIVERY_LEASE_MS,
    },
  );
  if (deliveryError) {
    throwAccessKeyDatabaseError(deliveryError, "access_key_reveal_delivery_failed");
  }
  const deliveryRow = (Array.isArray(delivery) ? delivery[0] : delivery) as
    | { access_key_id?: unknown; reveal_ciphertext?: unknown; delivery_generation?: unknown }
    | null;
  if (!deliveryRow) {
    return {
      status: row.status,
      keyPrefix: row.key_prefix,
      rawKey: null,
      deliveryToken: null,
      planTier: row.plan_tier,
      partnerSlug: row.partner_slug,
      stripeCheckoutSessionId: row.stripe_checkout_session_id,
    };
  }

  const releaseDelivery = () =>
    (admin as any).rpc("release_billing_access_key_reveal_delivery", {
      p_checkout_session_id: normalizedSessionId,
      p_delivery_token_hash: deliveryTokenHash,
    }).then(() => undefined, () => undefined);
  const revealKey =
    typeof deliveryRow.reveal_ciphertext === "string"
      ? decryptRevealSecret(deliveryRow.reveal_ciphertext)
      : null;
  const revealedHash = revealKey ? hashAccessKey(revealKey) : "";

  if (
    deliveryRow.access_key_id !== row.id ||
    !revealKey ||
    !revealKey.startsWith(row.key_prefix) ||
    !secureHashMatches(revealedHash, row.key_hash)
  ) {
    await releaseDelivery();
    throw new ApiError(
      503,
      "The access-key handoff could not be verified. No reveal was consumed; retry after configuration is repaired.",
      "access_key_reveal_integrity_failed",
    );
  }

  return {
    status: row.status,
    keyPrefix: row.key_prefix,
    rawKey: revealKey,
    deliveryToken,
    planTier: row.plan_tier,
    partnerSlug: row.partner_slug,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
  };
}

export async function acknowledgeAccessKeyRevealDelivery(params: {
  sessionId: string;
  deliveryToken: string;
}) {
  requireAccessKeyFeature();
  const sessionId = normalizeOptionalText(params.sessionId);
  const deliveryToken = params.deliveryToken.trim();
  if (!sessionId || !/^[A-Za-z0-9_-]{43}$/.test(deliveryToken)) {
    throw new ApiError(400, "Access-key reveal acknowledgement is invalid.", "access_key_reveal_ack_invalid");
  }

  const admin = requireAdminClient();
  const { data, error } = await (admin as any).rpc(
    "ack_billing_access_key_reveal_delivery",
    {
      p_checkout_session_id: sessionId,
      p_delivery_token_hash: hashWithPepper(deliveryToken),
    },
  );
  if (error) {
    throwAccessKeyDatabaseError(error, "access_key_reveal_ack_failed");
  }
  if (data !== "acknowledged" && data !== "already_acknowledged") {
    throw new ApiError(
      409,
      "Access-key reveal acknowledgement was superseded or expired.",
      "access_key_reveal_ack_rejected",
    );
  }

  if (data === "acknowledged") {
    const { data: rawRow, error: rowError } = await admin
      .from("billing_access_keys" as never)
      .select("*")
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();
    if (rowError) {
      throwAccessKeyDatabaseError(rowError, "access_key_reveal_ack_lookup_failed");
    }
    const row = asAccessKeyRow(rawRow);
    if (row) {
      await recordAccessKeyEvent({
        admin,
        accessKeyId: row.id,
        eventType: "revealed",
        stripeCheckoutSessionId: row.stripe_checkout_session_id,
        stripeCustomerId: row.stripe_customer_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        metadata: { key_prefix: row.key_prefix, delivery_acknowledged: true },
      });
      logOperationalEvent("access_key_revealed", {
        accessKeyId: row.id,
        keyPrefix: row.key_prefix,
      });
    }
  }

  return { acknowledged: true, alreadyAcknowledged: data === "already_acknowledged" };
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
