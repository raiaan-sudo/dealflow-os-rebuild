import { assertInternalSystemRequest, apiSuccess, handleApiError } from "@/lib/api/route";
import { processGhlProviderWorkerFromEnvironment } from "@/lib/services/ghl-provider-worker-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertInternalSystemRequest(request);
    const result = await processGhlProviderWorkerFromEnvironment({
      maxProvisioningSteps: 25,
      maxLeadItems: 25,
    });
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error, "GHL provider worker");
  }
}
