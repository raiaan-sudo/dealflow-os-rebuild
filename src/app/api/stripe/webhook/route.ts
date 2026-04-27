import Stripe from "stripe";
import { headers } from "next/headers";
import { apiSuccess, handleApiError } from "@/lib/api/route";
import { getStripeBillingProvider } from "@/lib/integrations/stripe/provider";
import { handleStripeBillingEvent } from "@/lib/services/billing-service";

export async function POST(request: Request) {
  try {
    const stripe = getStripeBillingProvider();

    if (!stripe.isConfigured()) {
      throw new Error("Stripe is not configured yet.");
    }

    const rawBody = await request.text();
    const headerStore = await headers();
    const signature = headerStore.get("stripe-signature");

    if (!signature) {
      throw new Error("Missing Stripe signature.");
    }

    const event = (await stripe.execute({
      action: "construct_webhook_event",
      payload: rawBody,
      signature,
    })) as Stripe.Event;

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
