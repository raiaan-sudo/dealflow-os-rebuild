import { assertSameOriginRequest, handleApiError } from "@/lib/api/route";
import { createBillingPortalSession } from "@/lib/services/billing-service";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await createBillingPortalSession();

    return Response.json(session);
  } catch (error) {
    return handleApiError(error, "Billing portal");
  }
}
