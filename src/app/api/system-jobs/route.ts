import { apiSuccess, handleApiError } from "@/lib/api/route";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { listSystemJobs } from "@/lib/services/system-job-service";

export const dynamic = "force-dynamic";

function parseStatuses(value: string | null) {
  if (!value) {
    return undefined;
  }

  const statuses = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return statuses.length > 0 ? (statuses as Array<"pending" | "processing" | "completed" | "failed">) : undefined;
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedContext();
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    const statuses = parseStatuses(url.searchParams.get("status"));
    const jobs = await listSystemJobs({
      userId: auth.userId,
      organizationId: auth.organizationId,
      campaignId,
      statuses,
    });

    return apiSuccess({
      jobs,
    });
  } catch (error) {
    return handleApiError(error, "System jobs list");
  }
}
