import { z } from "zod";
import { ApiError, assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { normalizeBillingPlanTier } from "@/lib/billing/plans";
import { createAccessKeyCheckoutSession } from "@/lib/services/access-key-service";
import { isAccessKeyPublicCheckoutEnabled, isBillingCheckoutSafeModeEnabled } from "@/lib/env";

const checkoutSchema = z.object({
  planTier: z.enum(["performance", "starter", "pro", "growth"]).default("pro"),
  partnerSlug: z.string().trim().min(1).max(80).optional(),
  buyerEmail: z.string().trim().email().optional(),
  buyerName: z.string().trim().min(1).max(160).optional(),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "access-key-checkout"),
      limit: 8,
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

    if (!isAccessKeyPublicCheckoutEnabled()) {
      return Response.json(
        {
          error: "Access-key public checkout is not enabled.",
          code: "access_key_public_checkout_disabled",
        },
        { status: 404 },
      );
    }

    const body = await parseJsonBody(request, checkoutSchema);
    const session = await createAccessKeyCheckoutSession({
      planTier: normalizeBillingPlanTier(body.planTier),
      partnerSlug: body.partnerSlug,
      buyerEmail: body.buyerEmail,
      buyerName: body.buyerName,
    });

    return Response.json(session);
  } catch (error) {
    return handleApiError(error, "Access-key checkout");
  }
}
