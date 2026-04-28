import { ApiError, apiSuccess, assertSameOriginRequest } from "@/lib/api/route";
import { createMetaFailureResponse } from "@/lib/integrations/meta/error-mapper";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { syncMetaCampaignStatus } from "@/lib/services/meta-campaign-sync-service";
import { runTrackedSystemJob } from "@/lib/services/system-job-service";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOriginRequest(request);
    const body = (await request.json().catch(() => null)) as { campaignId?: unknown } | null;
    const campaignId =
      typeof body?.campaignId === "string" && body.campaignId.trim().length > 0
        ? body.campaignId.trim()
        : null;
    const auth = await getAuthenticatedContext();
    const { output, jobId, correlationId } = await runTrackedSystemJob({
      organizationId: auth.organizationId,
      userId: auth.userId,
      campaignId,
      kind: "meta_sync",
      requestId,
      maxRetries: 1,
      payload: {
        source: "api.integrations.meta.sync",
      },
      operation: async () => syncMetaCampaignStatus({ campaignId }),
      summarizeResult: (snapshot) =>
        ({
          status: snapshot?.status ?? snapshot?.syncStatus ?? null,
          hasCampaignId: Boolean(snapshot?.campaignId),
        }) as never,
    });
    return apiSuccess({
      snapshot: output,
      job: {
        id: jobId,
        correlationId,
      },
    });
  } catch (error) {
    return createMetaFailureResponse({
      context: "sync",
      status: error instanceof ApiError ? error.status : 500,
      requestId,
      error,
    });
  }
}
