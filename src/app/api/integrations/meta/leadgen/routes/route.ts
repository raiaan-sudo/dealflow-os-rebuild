import { z } from "zod";
import {
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getRateLimitKey,
} from "@/lib/api/rate-limit";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { provisionMetaLeadgenRouteForCampaign } from "@/lib/services/meta-leadgen-route-service";

const provisionSchema = z
  .object({
    campaignId: z.string().uuid(),
    providerFormId: z.string().trim().regex(/^\d{5,40}$/),
  })
  .strict();

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(
        request,
        "meta-leadgen-route-provision",
        `${auth.organizationId}:${auth.userId}`,
      ),
      limit: 10,
      windowMs: 60_000,
    });
    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const body = await parseJsonBody(request, provisionSchema, {
      maxBytes: 4 * 1024,
      code: "meta_leadgen_route_body_too_large",
    });
    const route = await provisionMetaLeadgenRouteForCampaign({
      actorUserId: auth.userId,
      organizationId: auth.organizationId,
      campaignId: body.campaignId,
      providerFormId: body.providerFormId,
    });

    return apiSuccess({ route });
  } catch (error) {
    return handleApiError(error, "Meta leadgen route provisioning");
  }
}
