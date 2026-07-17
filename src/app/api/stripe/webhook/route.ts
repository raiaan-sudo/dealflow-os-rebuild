import Stripe from "stripe";
import { headers } from "next/headers";
import {
  ApiError,
  STRIPE_WEBHOOK_BODY_LIMIT_BYTES,
  apiSuccess,
  handleApiError,
  parseTextBody,
} from "@/lib/api/route";
import { getStripeBillingProvider } from "@/lib/integrations/stripe/provider";
import { handleStripeBillingEvent } from "@/lib/services/billing-service";
import {
  handleAccessKeyStripeEvent,
  isAccessKeyCheckoutSessionObject,
} from "@/lib/services/access-key-service";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getHashedRateLimitIdentifier,
  getRateLimitKey,
  getRequestIp,
} from "@/lib/api/rate-limit";

async function consumeInvalidSignatureBucket(request: Request) {
  const ipHash = getHashedRateLimitIdentifier(getRequestIp(request));
  const rateLimit = await consumeRateLimit({
    key: getRateLimitKey(request, "stripe-webhook:invalid-signature", ipHash),
    limit: 20,
    windowMs: 60_000,
  });

  if (rateLimit && !rateLimit.allowed) {
    return buildRateLimitResponse(rateLimit.resetAt);
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const rawBody = await parseTextBody(request, {
      maxBytes: STRIPE_WEBHOOK_BODY_LIMIT_BYTES,
      code: "stripe_webhook_body_too_large",
    });
    const headerStore = await headers();
    const signature = headerStore.get("stripe-signature");

    if (!signature) {
      const limited = await consumeInvalidSignatureBucket(request);

      if (limited) {
        return limited;
      }

      throw new ApiError(400, "Missing Stripe webhook signature.", "stripe_missing_signature");
    }

    const stripe = getStripeBillingProvider();

    if (!stripe.isConfigured()) {
      throw new Error("Stripe is not configured yet.");
    }

    let event: Stripe.Event;

    try {
      event = (await stripe.execute({
        action: "construct_webhook_event",
        payload: rawBody,
        signature,
      })) as Stripe.Event;
    } catch {
      const limited = await consumeInvalidSignatureBucket(request);

      if (limited) {
        return limited;
      }

      throw new ApiError(400, "Invalid Stripe webhook signature.", "stripe_invalid_signature");
    }

    const result =
      event.data.object.object === "checkout.session" && isAccessKeyCheckoutSessionObject(event.data.object)
        ? await handleAccessKeyStripeEvent(event)
        : await handleStripeBillingEvent(event);

    return apiSuccess({
      received: true,
      duplicate: result.duplicate,
      processed: result.processed,
    });
  } catch (error) {
    return handleApiError(error, "Stripe webhook");
  }
}
