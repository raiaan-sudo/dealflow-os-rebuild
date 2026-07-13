import { z } from "zod";
import { ApiError, assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { NEW_CHECKOUT_PLAN_TIER } from "@/lib/billing/plans";
import { createAccessKeyCheckoutSession } from "@/lib/services/access-key-service";
import {
  ACCESS_KEY_REVEAL_COOKIE_MAX_AGE_SECONDS,
  ACCESS_KEY_REVEAL_INDEX_COOKIE_NAME,
  ACCESS_KEY_REVEAL_MAX_IN_FLIGHT,
  appendAccessKeyRevealCookieIndex,
  getAccessKeyRevealCookieName,
  parseAccessKeyRevealCookieIndex,
  readRequestCookie,
  serializeAccessKeyRevealCookie,
  serializeAccessKeyRevealCookieIndex,
} from "@/lib/access-key-reveal-cookie";
import { isAccessKeyPublicCheckoutEnabled, isBillingCheckoutSafeModeEnabled } from "@/lib/env";

const checkoutSchema = z.object({
  planTier: z.literal(NEW_CHECKOUT_PLAN_TIER).default(NEW_CHECKOUT_PLAN_TIER),
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
    const secure =
      process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
    const nowSeconds = Math.floor(Date.now() / 1000);
    const currentRevealIndex = parseAccessKeyRevealCookieIndex(
      readRequestCookie(
        request.headers.get("cookie"),
        ACCESS_KEY_REVEAL_INDEX_COOKIE_NAME,
      ),
      nowSeconds,
    );
    if (currentRevealIndex.length >= ACCESS_KEY_REVEAL_MAX_IN_FLIGHT) {
      throw new ApiError(
        409,
        "Finish one of the existing checkout handoffs before starting another.",
        "access_key_checkout_handoff_capacity",
      );
    }

    const session = await createAccessKeyCheckoutSession({
      planTier: body.planTier,
      partnerSlug: body.partnerSlug,
      buyerEmail: body.buyerEmail,
      buyerName: body.buyerName,
    });
    const { revealVerifier, ...publicSession } = session;
    const nextRevealIndex = appendAccessKeyRevealCookieIndex(
      currentRevealIndex,
      session.sessionId,
      nowSeconds,
    );
    if (!nextRevealIndex) {
      throw new ApiError(
        409,
        "The browser checkout handoff limit was reached.",
        "access_key_checkout_handoff_capacity",
      );
    }
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append(
      "Set-Cookie",
      serializeAccessKeyRevealCookie({
        name: getAccessKeyRevealCookieName(session.sessionId),
        value: revealVerifier,
        path: "/access-key/success",
        maxAgeSeconds: ACCESS_KEY_REVEAL_COOKIE_MAX_AGE_SECONDS,
        secure,
      }),
    );
    headers.append(
      "Set-Cookie",
      serializeAccessKeyRevealCookie({
        name: ACCESS_KEY_REVEAL_INDEX_COOKIE_NAME,
        value: serializeAccessKeyRevealCookieIndex(nextRevealIndex),
        path: "/api/access-keys",
        maxAgeSeconds: ACCESS_KEY_REVEAL_COOKIE_MAX_AGE_SECONDS,
        secure,
      }),
    );

    return Response.json(publicSession, {
      headers,
    });
  } catch (error) {
    return handleApiError(error, "Access-key checkout");
  }
}
