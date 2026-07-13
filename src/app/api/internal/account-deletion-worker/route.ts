import { assertInternalSystemRequest, handleApiError } from "@/lib/api/route";
import { processAccountDeletionWork } from "@/lib/services/account-deletion-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertInternalSystemRequest(request);
    const result = await processAccountDeletionWork({ maxTasks: 25 });
    return Response.json(result);
  } catch (error) {
    return handleApiError(error, "Account deletion worker");
  }
}
