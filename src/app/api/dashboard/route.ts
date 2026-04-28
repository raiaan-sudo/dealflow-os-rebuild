import { apiSuccess, handleApiError, unauthorizedOrConfigError } from "@/lib/api/route";
import { getDashboardData } from "@/lib/services/dashboard-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    const data = await getDashboardData(campaignId);

    if (!data) {
      throw unauthorizedOrConfigError();
    }

    return apiSuccess(data);
  } catch (error) {
    return handleApiError(error, "Dashboard request");
  }
}
