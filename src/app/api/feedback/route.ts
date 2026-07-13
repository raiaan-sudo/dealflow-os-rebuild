import { z } from "zod";
import { apiSuccess, assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { createSupportTicket } from "@/lib/services/support-ticket-service";
import { logOperationalEvent } from "@/lib/logging";

const feedbackSchema = z.object({
  requestId: z.string().uuid(),
  confusedText: z.string().max(4000).optional().default(""),
  blockerText: z.string().max(4000).optional().default(""),
  page: z.string().max(500).optional().default(""),
}).superRefine((value, context) => {
  if (!value.confusedText.trim() && !value.blockerText.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Tell us what was confusing or what blocked you.",
    });
  }
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
    const ticket = await createSupportTicket({
      supabase: auth.supabase,
      organizationId: auth.organizationId,
      userId: auth.userId,
      input: {
        requestId: body.requestId,
        confusedText: body.confusedText,
        blockerText: body.blockerText,
        page: body.page,
      },
    });

    logOperationalEvent("product_feedback_received", {
      userId: auth.userId,
      organizationId: auth.organizationId,
      page: body.page || null,
      replyRoute: "authenticated_account_email",
      confusedTextPresent: Boolean(body.confusedText.trim()),
      blockerTextPresent: Boolean(body.blockerText.trim()),
      ticketId: ticket.ticketId,
      correlationId: ticket.correlationId,
      operatorNotificationStatus: ticket.operatorNotificationStatus,
    });

    return apiSuccess({ success: true, ...ticket });
  } catch (error) {
    return handleApiError(error, "Feedback");
  }
}
