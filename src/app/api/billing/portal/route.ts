import { assertSameOriginRequest, handleApiError } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { createBillingPortalSession } from "@/lib/services/billing-service";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "billing-portal"),
      limit: 10,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const session = await createBillingPortalSession();

    return Response.json(session);
  } catch (error) {
    return handleApiError(error, "Billing portal");
  }
}
