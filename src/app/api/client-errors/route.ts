import { z } from "zod";
import { apiSuccess, assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { recordClientErrorEvent } from "@/lib/services/client-error-telemetry-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clientErrorSchema = z.object({
  source: z.string().min(1).max(80).optional(),
  routePath: z.string().min(1).max(500).optional(),
  errorName: z.string().max(160).optional(),
  message: z.string().min(1).max(1800),
  stack: z.string().max(6000).optional(),
  componentStack: z.string().max(6000).optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  browser: z.string().max(160).optional(),
  viewport: z.string().max(80).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "client-errors"),
      limit: 30,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const body = await parseJsonBody(request, clientErrorSchema, {
      maxBytes: 18 * 1024,
      code: "client_error_body_too_large",
    });
    const result = await recordClientErrorEvent(body);

    return apiSuccess({ success: true, recorded: result.recorded });
  } catch (error) {
    return handleApiError(error, "Client error telemetry");
  }
}
