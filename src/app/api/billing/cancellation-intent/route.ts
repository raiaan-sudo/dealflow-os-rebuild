import { z } from "zod";
import { assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import {
  BILLING_CANCELLATION_REASON_CODES,
  recordBillingCancellationIntent,
} from "@/lib/services/billing-cancellation-intent-service";

const cancellationIntentSchema = z.object({
  reasonCode: z.enum(BILLING_CANCELLATION_REASON_CODES).default("not_provided"),
  reasonDetail: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "billing-cancellation-intent"),
      limit: 8,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const body = await parseJsonBody(request, cancellationIntentSchema);
    const result = await recordBillingCancellationIntent({
      reasonCode: body.reasonCode,
      reasonDetail: body.reasonDetail,
      source: "settings_portal_entry",
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    return handleApiError(error, "Billing cancellation intent");
  }
}
