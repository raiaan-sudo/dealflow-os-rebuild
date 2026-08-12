import { ApiError, apiSuccess, assertSameOriginRequest, parseOptionalJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { createMetaFailureResponse } from "@/lib/integrations/meta/error-mapper";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { syncMetaCampaignStatus } from "@/lib/services/meta-campaign-sync-service";
import { runTrackedSystemJob } from "@/lib/services/system-job-service";
import { isMetaProviderIncluded } from "@/lib/release/approved-launch-profile";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    if (!isMetaProviderIncluded()) {
      throw new ApiError(409, "Meta is not included in this release.", "meta_provider_excluded");
    }
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "meta-sync", `${auth.organizationId}:${auth.userId}`),
      limit: 10,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const body = (await parseOptionalJsonBody(request, { parse: (input) => input }, null)) as {
      campaignId?: unknown;
    } | null;
    const campaignId =
      typeof body?.campaignId === "string" && body.campaignId.trim().length > 0
        ? body.campaignId.trim()
        : null;
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
