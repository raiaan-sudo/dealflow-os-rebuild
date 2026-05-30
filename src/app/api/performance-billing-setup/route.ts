import { timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import { ApiError, handleApiError } from "@/lib/api/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STRIPE_API_VERSION = "2026-04-22.dahlia";
const EVENT_NAME = "dealflow_billable_lead";
const PRODUCT_KEY = "dealflow_performance_v1";
const BASE_LOOKUP_KEY = "dealflow_performance_base_monthly_v1";
const LEAD_LOOKUP_KEY = "dealflow_performance_lead_metered_v1";

function assertInternalSystemRequest(request: Request) {
  if (process.env.PERFORMANCE_BILLING_SETUP_ENABLED !== "true") {
    throw new ApiError(404, "Performance billing setup is not enabled.", "performance_billing_setup_disabled");
  }

  const expected = process.env.PERFORMANCE_BILLING_SETUP_SECRET?.trim();
  if (!expected) {
    throw new ApiError(503, "Performance billing setup secret is not configured.", "performance_billing_setup_secret_missing");
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
    ?? request.headers.get("x-performance-billing-setup-key")?.trim()
    ?? "";
  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);

  if (expectedBuffer.length !== tokenBuffer.length || !timingSafeEqual(expectedBuffer, tokenBuffer)) {
    throw new ApiError(401, "Performance billing setup authorization is required.", "performance_billing_setup_unauthorized");
  }
}

function requireSecret(name: string, mode: "test" | "live") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ApiError(503, `${name} is not configured.`, "performance_billing_stripe_secret_missing");
  }

  if (mode === "test" && !value.startsWith("sk_test_")) {
    throw new ApiError(503, `${name} is not a Stripe test-mode key.`, "performance_billing_test_key_invalid");
  }

  if (mode === "live" && !value.startsWith("sk_live_")) {
    throw new ApiError(503, `${name} is not a Stripe live-mode key.`, "performance_billing_live_key_invalid");
  }

  return value;
}

async function ensurePerformanceResources(mode: "test" | "live", secretKey: string) {
  const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
  const expectedLivemode = mode === "live";
  const products = await stripe.products.list({ active: true, limit: 100 });
  let product = products.data.find((candidate) => candidate.metadata?.dealflow_key === PRODUCT_KEY);

  if (!product) {
    product = await stripe.products.create(
      {
        name: "DealFlow Performance",
        description: "$97/mo base plus $3 per qualified lead for DealFlow Performance billing.",
        metadata: { dealflow_key: PRODUCT_KEY, dealflow_mode: mode },
      },
      { idempotencyKey: `dealflow_${mode}_performance_product_v1` },
    );
  }

  const meters = await stripe.billing.meters.list({ limit: 100 });
  let meter = meters.data.find((candidate) => candidate.event_name === EVENT_NAME);

  if (!meter) {
    meter = await stripe.billing.meters.create(
      {
        display_name: "DealFlow qualified leads",
        event_name: EVENT_NAME,
        default_aggregation: { formula: "sum" },
        customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
        value_settings: { event_payload_key: "value" },
      },
      { idempotencyKey: `dealflow_${mode}_performance_meter_v1` },
    );
  }

  const existingBasePrices = await stripe.prices.list({ lookup_keys: [BASE_LOOKUP_KEY], active: true, limit: 1 });
  let basePrice = existingBasePrices.data[0];

  if (!basePrice) {
    basePrice = await stripe.prices.create(
      {
        product: product.id,
        unit_amount: 9700,
        currency: "usd",
        recurring: { interval: "month", usage_type: "licensed" },
        lookup_key: BASE_LOOKUP_KEY,
        metadata: { dealflow_key: BASE_LOOKUP_KEY, dealflow_mode: mode, plan_tier: "performance" },
      },
      { idempotencyKey: `dealflow_${mode}_performance_base_price_v1` },
    );
  }

  const existingLeadPrices = await stripe.prices.list({ lookup_keys: [LEAD_LOOKUP_KEY], active: true, limit: 1 });
  let leadPrice = existingLeadPrices.data[0];

  if (!leadPrice) {
    leadPrice = await stripe.prices.create(
      {
        product: product.id,
        unit_amount: 300,
        currency: "usd",
        recurring: { interval: "month", usage_type: "metered", meter: meter.id },
        lookup_key: LEAD_LOOKUP_KEY,
        metadata: {
          dealflow_key: LEAD_LOOKUP_KEY,
          dealflow_mode: mode,
          plan_tier: "performance",
          meter_event_name: EVENT_NAME,
        },
      },
      { idempotencyKey: `dealflow_${mode}_performance_lead_price_v1` },
    );
  }

  if (product.livemode !== expectedLivemode || meter.livemode !== expectedLivemode || basePrice.livemode !== expectedLivemode || leadPrice.livemode !== expectedLivemode) {
    throw new ApiError(500, `${mode} Stripe resource mode mismatch.`, "performance_billing_resource_mode_mismatch");
  }

  if (basePrice.unit_amount !== 9700 || leadPrice.unit_amount !== 300 || leadPrice.recurring?.usage_type !== "metered") {
    throw new ApiError(500, `${mode} Stripe Performance pricing mismatch.`, "performance_billing_price_mismatch");
  }

  return {
    mode,
    productId: product.id,
    meterId: meter.id,
    eventName: EVENT_NAME,
    basePriceId: basePrice.id,
    leadPriceId: leadPrice.id,
    baseLivemode: basePrice.livemode,
    leadLivemode: leadPrice.livemode,
    leadUsageType: leadPrice.recurring?.usage_type ?? null,
  };
}

async function runStripeTestModeProof(secretKey: string, resources: Awaited<ReturnType<typeof ensurePerformanceResources>>) {
  const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
  const proofId = crypto.randomUUID();
  const customer = await stripe.customers.create(
    {
      name: "DealFlow Performance Test Proof",
      metadata: {
        source: "dealflow_performance_setup_proof",
        proof_id: proofId,
      },
    },
    { idempotencyKey: `dealflow_performance_test_customer_${proofId}` },
  );

  if (customer.livemode !== false) {
    throw new ApiError(500, "Stripe proof customer was not test mode.", "performance_billing_test_customer_mode");
  }

  const checkoutSession = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customer.id,
      line_items: [
        { price: resources.basePriceId, quantity: 1 },
        { price: resources.leadPriceId },
      ],
      success_url: "https://app.agentdealflow.io/unlock?checkout=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://app.agentdealflow.io/unlock?checkout=cancelled",
      metadata: {
        source: "dealflow_performance_setup_proof",
        proof_id: proofId,
        plan_tier: "performance",
      },
      subscription_data: {
        metadata: {
          source: "dealflow_performance_setup_proof",
          proof_id: proofId,
          plan_tier: "performance",
        },
      },
    },
    { idempotencyKey: `dealflow_performance_test_checkout_${proofId}` },
  );

  if (checkoutSession.livemode !== false || !checkoutSession.id.startsWith("cs_test_")) {
    throw new ApiError(500, "Stripe proof checkout was not test mode.", "performance_billing_test_checkout_mode");
  }

  const meterEvent = await stripe.billing.meterEvents.create(
    {
      event_name: resources.eventName,
      identifier: `dealflow_performance_test_meter_${proofId}`,
      payload: {
        stripe_customer_id: customer.id,
        value: "1",
        proof_id: proofId,
      },
    },
    { idempotencyKey: `dealflow_performance_test_meter_${proofId}` },
  );

  return {
    proofId,
    customerId: customer.id,
    checkoutSessionId: checkoutSession.id,
    checkoutLivemode: checkoutSession.livemode,
    checkoutUrlPresent: Boolean(checkoutSession.url),
    lineItemCount: 2,
    meterEventIdentifier: "identifier" in meterEvent ? meterEvent.identifier : `dealflow_performance_test_meter_${proofId}`,
  };
}

export async function POST(request: Request) {
  try {
    assertInternalSystemRequest(request);

    const testSecret = requireSecret("STRIPE_TEST_SECRET_KEY", "test");
    const [testResources, liveResources] = await Promise.all([
      ensurePerformanceResources("test", testSecret),
      ensurePerformanceResources("live", requireSecret("STRIPE_SECRET_KEY", "live")),
    ]);
    const testProof = await runStripeTestModeProof(testSecret, testResources);

    return Response.json(
      {
        success: true,
        resources: [testResources, liveResources],
        testProof,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  } catch (error) {
    return handleApiError(error, "Performance billing setup");
  }
}
