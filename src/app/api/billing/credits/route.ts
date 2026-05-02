import { handleApiError } from "@/lib/api/route";
import { getCreditSummaryForCurrentUser } from "@/lib/services/credit-service";

export async function GET() {
  try {
    const summary = await getCreditSummaryForCurrentUser();
    return Response.json(summary);
  } catch (error) {
    return handleApiError(error, "Billing credits");
  }
}
