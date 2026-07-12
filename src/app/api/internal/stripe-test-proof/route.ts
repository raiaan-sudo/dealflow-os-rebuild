import Stripe from "stripe";
import { z } from "zod";
import {
  ApiError,
  assertInternalSystemRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { getPublicAppUrl } from "@/lib/env";
import {
  getDeploymentTarget,
  isExplicitNonProductionDeployment,
} from "@/lib/deployment-target";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STRIPE_API_VERSION = "2026-04-22.dahlia";

const stripeHarnessRequestSchema = z.object({
  requestId: z.string().uuid(),
  qaOrganizationId: z.string().uuid(),
}).strict();

function assertStripeHarnessEnabled() {
  if (!isExplicitNonProductionDeployment()) {
    throw new ApiError(
      404,
      "Stripe test harness requires an explicitly attested nonproduction deployment target.",
      "stripe_test_harness_target_blocked",
    );
  }

  if (process.env.STRIPE_TEST_HARNESS_ENABLED !== "true") {
    throw new ApiError(404, "Stripe test harness is not enabled.", "stripe_test_harness_disabled");
  }
}

function getAllowedQaOrganizationIds() {
  return new Set(
    (process.env.STRIPE_TEST_QA_ORGANIZATION_IDS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function assertQaOrganizationAllowed(organizationId: string) {
  if (!getAllowedQaOrganizationIds().has(organizationId.toLowerCase())) {
    throw new ApiError(
      403,
      "Stripe test harness organization is not on the isolated QA allowlist.",
      "stripe_test_qa_organization_not_allowed",
    );
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

function assertTestModeEvent(event: Stripe.Event) {
  assertTestModeObject(event, "Webhook event");
  const object = event.data.object as { livemode?: boolean };
  assertTestModeObject(object, "Webhook data object");
}

function idPrefix(id: string | null | undefined) {
  if (!id) {
    return null;
  }

  return id.split("_").slice(0, 2).join("_");
}

export async function POST(request: Request) {
  let stripe: Stripe | null = null;
  let customerId: string | null = null;
  let checkoutSessionId: string | null = null;
  let cleanupAttempted = false;
  let cleanupComplete = false;

  try {
    assertInternalSystemRequest(request);
    assertStripeHarnessEnabled();
    const body = await parseJsonBody(request, stripeHarnessRequestSchema);
    assertQaOrganizationAllowed(body.qaOrganizationId);

    const env = getStripeTestHarnessEnv();
    stripe = new Stripe(env.secretKey, {
      apiVersion: STRIPE_API_VERSION,
    });
    const appUrl = getPublicAppUrl();
    const requestId = body.requestId;
    const qaMetadata = {
      source: "dealflow_internal_stripe_test_harness",
      request_id: requestId,
      qa_organization_id: body.qaOrganizationId,
      deployment_target: getDeploymentTarget(),
    };
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
      metadata: qaMetadata,
    }, {
      idempotencyKey: `dealflow_stripe_test_harness_customer_${requestId}`,
    });
    customerId = customer.id;
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
        metadata: qaMetadata,
        subscription_data: {
          metadata: qaMetadata,
        },
      },
      {
        idempotencyKey: `dealflow_stripe_test_harness_checkout_${requestId}`,
      },
    );
    checkoutSessionId = checkoutSession.id;
    assertTestModeObject(checkoutSession, "Checkout session");

    if (!checkoutSession.id.startsWith("cs_test_")) {
      throw new ApiError(500, "Checkout session did not use a test-mode id.", "stripe_checkout_not_test");
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${appUrl}/settings?billing=portal-test`,
    });

    const webhookPayload = JSON.stringify({
      id: `evt_test_dealflow_${requestId.replaceAll("-", "")}`,
      object: "event",
      api_version: STRIPE_API_VERSION,
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 0,
      type: "checkout.session.completed",
      data: {
        object: {
          ...checkoutSession,
          livemode: false,
          metadata: qaMetadata,
        },
      },
    });
    const webhookSignature = Stripe.webhooks.generateTestHeaderString({
      payload: webhookPayload,
      secret: requireTestEnv("STRIPE_TEST_WEBHOOK_SECRET"),
    });
    const verifiedEvent = stripe.webhooks.constructEvent(
      webhookPayload,
      webhookSignature,
      requireTestEnv("STRIPE_TEST_WEBHOOK_SECRET"),
    );
    assertTestModeEvent(verifiedEvent);

    cleanupAttempted = true;
    if (checkoutSession.status === "open") {
      const expired = await stripe.checkout.sessions.expire(checkoutSession.id);
      assertTestModeObject(expired, "Expired checkout session");
    }
    checkoutSessionId = null;
    const deletedCustomer = await stripe.customers.del(customer.id);
    if (!deletedCustomer.deleted) {
      throw new ApiError(
        500,
        "Stripe QA customer cleanup did not return a deletion receipt.",
        "stripe_test_cleanup_unproven",
      );
    }
    customerId = null;
    cleanupComplete = true;

    return Response.json(
      {
        success: true,
        requestId,
        mode: "test",
        deploymentTarget: getDeploymentTarget(),
        qaOrganizationAllowlisted: true,
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
        webhookAcceptance: {
          signatureVerified: true,
          eventType: verifiedEvent.type,
          livemode: verifiedEvent.livemode,
          objectLivemode: (verifiedEvent.data.object as { livemode?: boolean }).livemode,
        },
        cleanup: {
          attempted: cleanupAttempted,
          complete: cleanupComplete,
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
    let finalError = error;
    if (stripe && (checkoutSessionId || customerId)) {
      cleanupAttempted = true;
      let checkoutCleanupComplete = !checkoutSessionId;
      let customerCleanupComplete = !customerId;
      if (checkoutSessionId) {
        const expired = await stripe.checkout.sessions.expire(checkoutSessionId).catch(() => null);
        checkoutCleanupComplete = Boolean(expired && expired.status === "expired");
      }
      if (customerId) {
        const deleted = await stripe.customers.del(customerId).catch(() => null);
        customerCleanupComplete = Boolean(deleted && "deleted" in deleted && deleted.deleted);
      }
      cleanupComplete = checkoutCleanupComplete && customerCleanupComplete;
      if (!cleanupComplete) {
        finalError = new ApiError(
          500,
          "Stripe test harness failed and deterministic cleanup could not be proven.",
          "stripe_test_cleanup_unproven",
        );
      }
    }
    return handleApiError(finalError, "Internal Stripe test proof harness");
  }
}
