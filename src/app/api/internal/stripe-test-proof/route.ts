import Stripe from "stripe";
import {
  ApiError,
  assertInternalSystemRequest,
  handleApiError,
} from "@/lib/api/route";
import { getPublicAppUrl } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STRIPE_API_VERSION = "2026-04-22.dahlia";

function assertStripeHarnessEnabled() {
  if (process.env.NODE_ENV === "production") {
    throw new ApiError(
      404,
      "Stripe test harness is unavailable in production.",
      "stripe_test_harness_production_blocked",
    );
  }

  if (process.env.STRIPE_TEST_HARNESS_ENABLED !== "true") {
    throw new ApiError(404, "Stripe test harness is not enabled.", "stripe_test_harness_disabled");
  }
}

function requireTestEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new ApiError(503, `${name} is not configured.`, "stripe_test_env_missing");
  }

  return value;
}

function getStripeTestHarnessEnv() {
  const secretKey = requireTestEnv("STRIPE_TEST_SECRET_KEY");

  if (!secretKey.startsWith("sk_test_") && !secretKey.startsWith("rk_test_")) {
    throw new ApiError(503, "Stripe test harness key is not a test-mode key.", "stripe_test_key_invalid");
  }

  return {
    secretKey,
    webhookSecretConfigured: Boolean(process.env.STRIPE_TEST_WEBHOOK_SECRET?.trim()),
    starterPriceId: requireTestEnv("STRIPE_TEST_STARTER_PRICE_ID"),
    proPriceId: requireTestEnv("STRIPE_TEST_PRO_PRICE_ID"),
    growthPriceId: requireTestEnv("STRIPE_TEST_GROWTH_PRICE_ID"),
  };
}

function assertTestModeObject(object: { livemode?: boolean }, label: string) {
  if (object.livemode !== false) {
    throw new ApiError(500, `${label} is not in Stripe test mode.`, "stripe_test_mode_required");
  }
}

function idPrefix(id: string | null | undefined) {
  if (!id) {
    return null;
  }

  return id.split("_").slice(0, 2).join("_");
}

export async function POST(request: Request) {
  try {
    assertInternalSystemRequest(request);
    assertStripeHarnessEnabled();

    const env = getStripeTestHarnessEnv();
    const stripe = new Stripe(env.secretKey, {
      apiVersion: STRIPE_API_VERSION,
    });
    const appUrl = getPublicAppUrl();
    const requestId = crypto.randomUUID();
    const [starterPrice, proPrice, growthPrice] = await Promise.all([
      stripe.prices.retrieve(env.starterPriceId),
      stripe.prices.retrieve(env.proPriceId),
      stripe.prices.retrieve(env.growthPriceId),
    ]);

    assertTestModeObject(starterPrice, "Starter price");
    assertTestModeObject(proPrice, "Pro price");
    assertTestModeObject(growthPrice, "Growth price");

    const customer = await stripe.customers.create({
      name: "DealFlow OS QA Test Harness",
      metadata: {
        source: "dealflow_internal_stripe_test_harness",
        request_id: requestId,
      },
    });
    assertTestModeObject(customer, "Customer");

    const checkoutSession = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customer.id,
        line_items: [
          {
            price: env.proPriceId,
            quantity: 1,
          },
        ],
        success_url: `${appUrl}/unlock?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/unlock?checkout=cancelled`,
        metadata: {
          source: "dealflow_internal_stripe_test_harness",
          request_id: requestId,
        },
        subscription_data: {
          metadata: {
            source: "dealflow_internal_stripe_test_harness",
            request_id: requestId,
          },
        },
      },
      {
        idempotencyKey: `dealflow_stripe_test_harness_checkout_${requestId}`,
      },
    );
    assertTestModeObject(checkoutSession, "Checkout session");

    if (!checkoutSession.id.startsWith("cs_test_")) {
      throw new ApiError(500, "Checkout session did not use a test-mode id.", "stripe_checkout_not_test");
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${appUrl}/settings?billing=portal-test`,
    });

    return Response.json(
      {
        success: true,
        requestId,
        mode: "test",
        webhookSecretConfigured: env.webhookSecretConfigured,
        prices: {
          starter: {
            idPrefix: idPrefix(starterPrice.id),
            livemode: starterPrice.livemode,
            recurring: starterPrice.recurring?.interval ?? null,
          },
          pro: {
            idPrefix: idPrefix(proPrice.id),
            livemode: proPrice.livemode,
            recurring: proPrice.recurring?.interval ?? null,
          },
          growth: {
            idPrefix: idPrefix(growthPrice.id),
            livemode: growthPrice.livemode,
            recurring: growthPrice.recurring?.interval ?? null,
          },
        },
        customer: {
          idPrefix: idPrefix(customer.id),
          livemode: customer.livemode,
        },
        checkout: {
          idPrefix: idPrefix(checkoutSession.id),
          status: checkoutSession.status,
          livemode: checkoutSession.livemode,
          urlPresent: Boolean(checkoutSession.url),
          testId: checkoutSession.id.startsWith("cs_test_"),
        },
        portal: {
          idPrefix: idPrefix(portalSession.id),
          urlPresent: Boolean(portalSession.url),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  } catch (error) {
    return handleApiError(error, "Internal Stripe test proof harness");
  }
}
