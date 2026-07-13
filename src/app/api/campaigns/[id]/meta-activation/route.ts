import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseRouteParams,
} from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import {
  cancelMetaCampaignActivationPreauthorization,
  getMetaCampaignActivationAuthorizationStatus,
} from "@/lib/services/meta-campaign-activation-authority-service";
import { getCampaignById } from "@/lib/services/campaign-persistence";

const paramsSchema = z.object({ id: z.string().uuid() });
const cancelSchema = z.object({
  authorizationId: z.string().uuid(),
  confirmation: z.literal("CANCEL_META_CAMPAIGN_ACTIVATION"),
}).strict();

async function requireCampaign(id: string) {
  const campaign = await getCampaignById(id);
  if (!campaign) throw new ApiError(404, "Campaign not found.", "campaign_not_found");
  return campaign;
}

export async function GET(_request: Request, context: { params: Promise<Record<string, string>> | Record<string, string> }) {
  try {
    const { id } = await parseRouteParams(context.params, paramsSchema);
    await requireCampaign(id);
    return apiSuccess({ campaignId: id, authorization: await getMetaCampaignActivationAuthorizationStatus(id) });
  } catch (error) {
    return handleApiError(error, "Get Meta activation authorization");
  }
}

export async function DELETE(request: Request, context: { params: Promise<Record<string, string>> | Record<string, string> }) {
  try {
    assertSameOriginRequest(request);
    const { id } = await parseRouteParams(context.params, paramsSchema);
    await requireCampaign(id);
    const body = cancelSchema.parse(await request.json());
    const cancelled = await cancelMetaCampaignActivationPreauthorization(id, body.authorizationId);
    if (!cancelled) throw new ApiError(409, "Activation can no longer be cancelled automatically.", "meta_activation_cancellation_fenced");
    return apiSuccess({ campaignId: id, authorizationId: body.authorizationId, status: "cancelled", providerMutationPerformed: false });
  } catch (error) {
    return handleApiError(error, "Cancel Meta campaign activation");
  }
}
