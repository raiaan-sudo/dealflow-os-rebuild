import { z } from "zod";
import { assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { preclaimAccessKey } from "@/lib/services/access-key-service";

const preclaimSchema = z.object({
  accessKey: z.string().trim().min(12).max(160),
  email: z.string().trim().email(),
  partnerSlug: z.string().trim().min(1).max(80).optional(),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "access-key-preclaim"),
      limit: 12,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const body = await parseJsonBody(request, preclaimSchema);
    const result = await preclaimAccessKey({
      rawKey: body.accessKey,
      email: body.email,
      partnerSlug: body.partnerSlug,
    });

    return Response.json(result);
  } catch (error) {
    return handleApiError(error, "Access-key preclaim");
  }
}
