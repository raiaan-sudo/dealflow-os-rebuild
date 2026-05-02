import { z } from "zod";
import { assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { createCreditTopUpCheckoutSession } from "@/lib/services/billing-service";
import { CREDIT_TOP_UP_MINIMUM_CENTS } from "@/lib/services/credit-service";

const checkoutSchema = z.object({
  amountCents: z.number().int().min(CREDIT_TOP_UP_MINIMUM_CENTS).max(100_000),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "billing-credit-checkout"),
      limit: 10,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const body = await parseJsonBody(request, checkoutSchema);
    const session = await createCreditTopUpCheckoutSession({
      amountCents: body.amountCents,
    });

    return Response.json(session);
  } catch (error) {
    return handleApiError(error, "Billing credit checkout");
  }
}
