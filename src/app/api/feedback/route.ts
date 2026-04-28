import { z } from "zod";
import { apiSuccess, assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { logOperationalEvent } from "@/lib/logging";

const feedbackSchema = z.object({
  confusedText: z.string().max(4000).optional().default(""),
  blockerText: z.string().max(4000).optional().default(""),
  email: z.string().email().optional().or(z.literal("")).default(""),
  page: z.string().max(500).optional().default(""),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const body = await parseJsonBody(request, feedbackSchema);

    logOperationalEvent("product_feedback_received", {
      userId: auth.userId,
      organizationId: auth.organizationId,
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
