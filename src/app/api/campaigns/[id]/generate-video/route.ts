import { ApiError, assertSameOriginRequest, handleApiError } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "generate-video", `${auth.organizationId}:${auth.userId}`),
      limit: 6,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    throw new ApiError(
      503,
      "Video generation is disabled until HeyGen credentials and launch limits are confirmed.",
      "video_generation_disabled",
    );
  } catch (error) {
    return handleApiError(error, "Generate video");
  }
}
