import { z } from "zod";
import { assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { createBillingCheckoutSession } from "@/lib/services/billing-service";
import { normalizeBillingPlanTier } from "@/lib/billing/plans";

const checkoutSchema = z.object({
  planTier: z.enum(["starter", "pro", "growth"]).default("pro"),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const body = await parseJsonBody(request, checkoutSchema);
    const session = await createBillingCheckoutSession({
      planTier: normalizeBillingPlanTier(body.planTier),
    });

    return Response.json(session);
  } catch (error) {
    return handleApiError(error, "Billing checkout");
  }
}
