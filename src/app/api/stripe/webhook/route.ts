import Stripe from "stripe";
import { headers } from "next/headers";
import { ApiError, apiSuccess, handleApiError } from "@/lib/api/route";
import { getStripeBillingProvider } from "@/lib/integrations/stripe/provider";
import { handleStripeBillingEvent } from "@/lib/services/billing-service";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const headerStore = await headers();
    const signature = headerStore.get("stripe-signature");

    if (!signature) {
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
      throw new ApiError(400, "Invalid Stripe webhook signature.", "stripe_invalid_signature");
    }

    const result = await handleStripeBillingEvent(event);

    return apiSuccess({
      received: true,
      duplicate: result.duplicate,
      processed: result.processed,
    });
  } catch (error) {
    return handleApiError(error, "Stripe webhook");
  }
}
