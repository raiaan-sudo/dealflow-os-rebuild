import "server-only";
import Stripe from "stripe";
import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parsePartnerPricingConfig,
  serializePartnerPricingConfig,
  type PartnerPricingConfig,
} from "@/lib/white-label/partner-billing-config";

const STRIPE_API_VERSION = "2026-04-22.dahlia";
const DEFAULT_PRODUCT_NAME = "EGEN ACCELERATOR";
const DEFAULT_CHECKOUT_HEADLINE = "EGEN Accelerator";
const DEFAULT_PERFORMANCE_LABEL = "EGEN Accelerator";

export type PartnerStripeSetupMode = "test" | "live";

export type PartnerStripeSetupResult = {
  mode: PartnerStripeSetupMode;
  partnerId: string;
  partnerSlug: string;
  product: {
    id: string;
    name: string;
    livemode: boolean;
  };
  prices: {
    performanceBasePriceId: string;
    immediateLeadChargeAmountCents: number;
  };
  configWritten: boolean;
};

type SetupOptions = {
  partnerId: string;
  mode: PartnerStripeSetupMode;
  productName?: string | null;
  checkoutHeadline?: string | null;
  performanceLabel?: string | null;
  baseAmountCents?: number | null;
  leadAmountCents?: number | null;
};

type PartnerSetupRow = {
  id: string;
  slug: string;
  brand_name?: string | null;
  status?: string | null;
};

function requireSecretKey(mode: PartnerStripeSetupMode) {
  const key = mode === "test" ? process.env.STRIPE_TEST_SECRET_KEY : process.env.STRIPE_SECRET_KEY;
  if (!key?.trim()) {
    throw new ApiError(
      503,
      `${mode === "test" ? "STRIPE_TEST_SECRET_KEY" : "STRIPE_SECRET_KEY"} is not configured.`,
      "stripe_secret_missing",
    );
  }

  const trimmed = key.trim();
  if (mode === "test" && !trimmed.startsWith("sk_test_") && !trimmed.startsWith("rk_test_")) {
    throw new ApiError(503, "Stripe test setup requires a test-mode key.", "stripe_test_key_invalid");
  }
  if (mode === "live" && !trimmed.startsWith("sk_live_") && !trimmed.startsWith("rk_live_")) {
    throw new ApiError(503, "Stripe live setup requires a live-mode key.", "stripe_live_key_invalid");
  }

  return trimmed;
}

function assertPositiveCents(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ApiError(400, `${label} must be a positive integer cents amount.`, "invalid_stripe_amount");
  }
}

function normalizeText(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function stripeSearchEscape(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function findOrCreateProduct(params: {
  stripe: Stripe;
  mode: PartnerStripeSetupMode;
  partnerSlug: string;
  productName: string;
}) {
  const products = await params.stripe.products.search({
    query: `name:'${stripeSearchEscape(params.productName)}' AND active:'true'`,
    limit: 10,
  });
  const existing = products.data.find((product) => product.name === params.productName);
  if (existing) {
    return existing;
  }

  return params.stripe.products.create(
    {
      name: params.productName,
      description: "Partner-branded DealFlow performance subscription.",
      metadata: {
        dealflow_partner_slug: params.partnerSlug,
        dealflow_product_role: "partner_performance",
      },
    },
    { idempotencyKey: `partner_stripe_product:${params.mode}:${params.partnerSlug}:${params.productName}` },
  );
}

async function findRecurringPrice(params: {
  stripe: Stripe;
  productId: string;
  role: string;
  unitAmount: number;
  usageType: "licensed" | "metered";
}) {
  const prices = await params.stripe.prices.list({
    product: params.productId,
    active: true,
    limit: 100,
  });

  return prices.data.find((price) =>
    price.metadata?.dealflow_price_role === params.role &&
    price.currency === "usd" &&
    price.unit_amount === params.unitAmount &&
    price.recurring?.interval === "month" &&
    price.recurring?.usage_type === params.usageType,
  ) ?? null;
}

async function findOrCreateBasePrice(params: {
  stripe: Stripe;
  mode: PartnerStripeSetupMode;
  partnerSlug: string;
  productId: string;
  productName: string;
  baseAmountCents: number;
}) {
  const existing = await findRecurringPrice({
    stripe: params.stripe,
    productId: params.productId,
    role: "performance_base",
    unitAmount: params.baseAmountCents,
    usageType: "licensed",
  });
  if (existing) {
    return existing;
  }

  return params.stripe.prices.create(
    {
      product: params.productId,
      currency: "usd",
      unit_amount: params.baseAmountCents,
      recurring: {
        interval: "month",
        usage_type: "licensed",
      },
      nickname: `${params.productName} base`,
      metadata: {
        dealflow_partner_slug: params.partnerSlug,
        dealflow_price_role: "performance_base",
        internal_plan_tier: "performance",
      },
    },
    { idempotencyKey: `partner_stripe_base_price:${params.mode}:${params.partnerSlug}:${params.baseAmountCents}` },
  );
}

function updatePricingForMode(params: {
  existing: PartnerPricingConfig;
  mode: PartnerStripeSetupMode;
  productName: string;
  checkoutHeadline: string;
  performanceLabel: string;
  basePriceId: string;
  leadAmountCents: number;
}) {
  const liveConfig = {
    displayProductName: params.productName,
    checkoutHeadline: params.checkoutHeadline,
    visiblePlans: ["performance"],
    allowDefaultDealFlowPrices: false,
    plans: {
      performance: {
        label: params.performanceLabel,
        basePriceId: params.basePriceId,
      },
    },
    billingModel: "base_plus_immediate_lead_charge",
    leadChargeAmountCents: params.leadAmountCents,
  } satisfies PartnerPricingConfig;

  if (params.mode === "live") {
    return serializePartnerPricingConfig(liveConfig);
  }

  const serializedExisting = serializePartnerPricingConfig(params.existing);
  const existingRecord =
    serializedExisting && typeof serializedExisting === "object" && !Array.isArray(serializedExisting)
      ? serializedExisting
      : {};

  return {
    ...existingRecord,
    stripeTestSetup: {
      displayProductName: params.productName,
      checkoutHeadline: params.checkoutHeadline,
      performanceLabel: params.performanceLabel,
      basePriceId: params.basePriceId,
      leadChargeAmountCents: params.leadAmountCents,
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function setupPartnerStripeProducts(options: SetupOptions): Promise<PartnerStripeSetupResult> {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data: partnerData, error: partnerError } = await admin
    .from("partners")
    .select("id,slug,brand_name,status")
    .eq("id", options.partnerId)
    .maybeSingle();
  if (partnerError) {
    throw new ApiError(500, partnerError.message, "partner_stripe_setup_partner_lookup_failed");
  }
  const partner = partnerData as PartnerSetupRow | null;
  if (!partner?.id || !partner.slug) {
    throw new ApiError(404, "Partner not found.", "partner_not_found");
  }

  const baseAmountCents = options.baseAmountCents ?? 9700;
  const leadAmountCents = options.leadAmountCents ?? 300;
  assertPositiveCents(baseAmountCents, "Base subscription amount");
  assertPositiveCents(leadAmountCents, "Lead usage amount");

  const productName = normalizeText(options.productName, DEFAULT_PRODUCT_NAME);
  const checkoutHeadline = normalizeText(options.checkoutHeadline, DEFAULT_CHECKOUT_HEADLINE);
  const performanceLabel = normalizeText(options.performanceLabel, DEFAULT_PERFORMANCE_LABEL);
  const stripe = new Stripe(requireSecretKey(options.mode), {
    apiVersion: STRIPE_API_VERSION,
  });

  const product = await findOrCreateProduct({
    stripe,
    mode: options.mode,
    partnerSlug: partner.slug,
    productName,
  });
  const basePrice = await findOrCreateBasePrice({
    stripe,
    mode: options.mode,
    partnerSlug: partner.slug,
    productId: product.id,
    productName,
    baseAmountCents,
  });
  const { data: branding } = await admin
    .from("partner_branding")
    .select("pricing_json,theme_json")
    .eq("partner_id", partner.id)
    .maybeSingle();
  const existingPricing = parsePartnerPricingConfig((branding as { pricing_json?: unknown } | null)?.pricing_json);
  const nextPricing = updatePricingForMode({
    existing: existingPricing,
    mode: options.mode,
    productName,
    checkoutHeadline,
    performanceLabel,
    basePriceId: basePrice.id,
    leadAmountCents,
  });

  const { error: brandingError } = await admin.from("partner_branding").upsert(
    {
      partner_id: partner.id,
      theme_json: (branding as { theme_json?: unknown } | null)?.theme_json ?? {},
      pricing_json: nextPricing,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "partner_id" },
  );
  if (brandingError) {
    throw new ApiError(500, brandingError.message, "partner_stripe_setup_config_write_failed");
  }

  await admin.from("partner_audit_logs").insert({
    partner_id: partner.id,
    actor_role: "platform_admin",
    action: "partner_stripe_setup_completed",
    target_type: "partner",
    target_id: partner.id,
    metadata_json: {
      mode: options.mode,
      product_id: product.id,
      base_price_id: basePrice.id,
      immediate_lead_charge_amount_cents: leadAmountCents,
      config_written_to_checkout: options.mode === "live",
    },
  } as never);

  return {
    mode: options.mode,
    partnerId: partner.id,
    partnerSlug: partner.slug,
    product: {
      id: product.id,
      name: product.name,
      livemode: product.livemode,
    },
    prices: {
      performanceBasePriceId: basePrice.id,
      immediateLeadChargeAmountCents: leadAmountCents,
    },
    configWritten: options.mode === "live",
  };
}
