import { z } from "zod";
import { assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { createBillingCheckoutSession } from "@/lib/services/billing-service";
import { NEW_CHECKOUT_PLAN_TIER } from "@/lib/billing/plans";

const checkoutSchema = z.object({
  planTier: z.literal(NEW_CHECKOUT_PLAN_TIER).default(NEW_CHECKOUT_PLAN_TIER),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "billing-checkout"),
      limit: 10,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const body = await parseJsonBody(request, checkoutSchema);
    const session = await createBillingCheckoutSession({
      planTier: body.planTier,
    });

    return Response.json(session);
  } catch (error) {
    return handleApiError(error, "Billing checkout");
  }
}
