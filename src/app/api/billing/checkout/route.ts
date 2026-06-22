import { z } from "zod";
import { ApiError, assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { createBillingCheckoutSession } from "@/lib/services/billing-service";
import { normalizeBillingPlanTier } from "@/lib/billing/plans";
import { recordActivationEventForCurrentUser } from "@/lib/services/activation-telemetry-service";
import { isBillingCheckoutSafeModeEnabled } from "@/lib/env";

const checkoutSchema = z.object({
  planTier: z.enum(["performance", "starter", "pro", "growth"]).default("pro"),
  campaignId: z.string().min(1).optional(),
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

    if (isBillingCheckoutSafeModeEnabled()) {
      throw new ApiError(
        503,
        "Billing checkout is temporarily unavailable while billing monitoring is degraded.",
        "billing_checkout_safe_mode",
      );
    }

    const body = await parseJsonBody(request, checkoutSchema);
    const session = await createBillingCheckoutSession({
      planTier: normalizeBillingPlanTier(body.planTier),
      campaignId: body.campaignId,
    });
    await recordActivationEventForCurrentUser({
      eventName: "checkout_started",
      campaignId: body.campaignId ?? null,
      source: "billing_checkout_route",
      metadata: {
        planTier: normalizeBillingPlanTier(body.planTier),
        hasCampaignId: Boolean(body.campaignId),
      },
      idempotencyKey: session.sessionId
        ? `checkout_started:${session.sessionId}`
        : `checkout_started:${body.campaignId ?? "workspace"}:${normalizeBillingPlanTier(body.planTier)}`,
    }).catch(() => undefined);

    return Response.json(session);
  } catch (error) {
    return handleApiError(error, "Billing checkout");
  }
}
