import { z } from "zod";
import { apiSuccess, assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { logOperationalEvent } from "@/lib/logging";

const feedbackSchema = z.object({
  category: z.enum([
    "confusing_ux",
    "billing",
    "onboarding",
    "creative_quality",
    "meta_connect",
    "lead_funnel",
    "bug",
    "cancellation_refund",
  ]).default("confusing_ux"),
  confusedText: z.string().max(4000).optional().default(""),
  blockerText: z.string().max(4000).optional().default(""),
  email: z.string().email().optional().or(z.literal("")).default(""),
  page: z.string().max(500).optional().default(""),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "feedback", `${auth.organizationId}:${auth.userId}`),
      limit: 10,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const body = await parseJsonBody(request, feedbackSchema);

    logOperationalEvent("product_feedback_received", {
      userId: auth.userId,
      organizationId: auth.organizationId,
      category: body.category,
      page: body.page || null,
      emailPresent: Boolean(body.email),
      confusedTextPresent: Boolean(body.confusedText.trim()),
      blockerTextPresent: Boolean(body.blockerText.trim()),
    });

    return apiSuccess({ success: true });
  } catch (error) {
    return handleApiError(error, "Feedback");
  }
}
