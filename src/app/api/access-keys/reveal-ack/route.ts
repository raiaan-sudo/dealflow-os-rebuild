import { z } from "zod";
import { assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import {
  ACCESS_KEY_REVEAL_COOKIE_MAX_AGE_SECONDS,
  ACCESS_KEY_REVEAL_INDEX_COOKIE_NAME,
  getAccessKeyRevealCookieName,
  parseAccessKeyRevealCookieIndex,
  readRequestCookie,
  removeAccessKeyRevealCookieIndex,
  serializeAccessKeyRevealCookie,
  serializeAccessKeyRevealCookieIndex,
} from "@/lib/access-key-reveal-cookie";
import { acknowledgeAccessKeyRevealDelivery } from "@/lib/services/access-key-service";

const acknowledgementSchema = z.object({
  sessionId: z.string().trim().min(10).max(255),
  deliveryToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const body = await parseJsonBody(request, acknowledgementSchema);
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "access-key-reveal-ack", body.sessionId),
      limit: 12,
      windowMs: 60_000,
    });
    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const result = await acknowledgeAccessKeyRevealDelivery(body);
    const secure =
      process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
    const currentIndex = parseAccessKeyRevealCookieIndex(
      readRequestCookie(
        request.headers.get("cookie"),
        ACCESS_KEY_REVEAL_INDEX_COOKIE_NAME,
      ),
    );
    const nextIndex = removeAccessKeyRevealCookieIndex(currentIndex, body.sessionId);
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append(
      "Set-Cookie",
      serializeAccessKeyRevealCookie({
        name: getAccessKeyRevealCookieName(body.sessionId),
        value: "",
        path: "/access-key/success",
        maxAgeSeconds: 0,
        secure,
      }),
    );
    headers.append(
      "Set-Cookie",
      serializeAccessKeyRevealCookie({
        name: ACCESS_KEY_REVEAL_INDEX_COOKIE_NAME,
        value: serializeAccessKeyRevealCookieIndex(nextIndex),
        path: "/api/access-keys",
        maxAgeSeconds: nextIndex.length
          ? ACCESS_KEY_REVEAL_COOKIE_MAX_AGE_SECONDS
          : 0,
        secure,
      }),
    );

    return Response.json(result, { headers });
  } catch (error) {
    return handleApiError(error, "Access-key reveal acknowledgement");
  }
}
