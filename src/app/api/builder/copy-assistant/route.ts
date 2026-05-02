import {
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseOptionalJsonBody,
} from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { generateCreativeCopyAssistant } from "@/lib/services/copy-engine";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "builder-copy-assistant", `${auth.organizationId}:${auth.userId}`),
      limit: 30,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const body = await parseOptionalJsonBody(request, { parse: (input) => input }, {});
    const assistant = generateCreativeCopyAssistant(body as never);

    return apiSuccess(assistant);
  } catch (error) {
    return handleApiError(error, "Builder copy assistant");
  }
}
