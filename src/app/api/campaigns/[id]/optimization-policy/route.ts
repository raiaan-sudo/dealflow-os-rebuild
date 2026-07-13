import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseRouteParams,
} from "@/lib/api/route";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import {
  authorizeMetaOptimizationPolicy,
  getMetaOptimizationPolicyStatus,
  revokeMetaOptimizationPolicy,
} from "@/lib/services/meta-optimization-policy-service";

const paramsSchema = z.object({ id: z.string().uuid() });
const authorizeSchema = z.object({
  customerDailyBudgetCeilingMinor: z.number().int().min(100).max(100_000_000),
  approvedCurrency: z.enum(["USD", "CAD"]),
  confirmation: z.literal("ENABLE_AUTONOMOUS_META_OPTIMIZATION"),
}).strict();
const revokeSchema = z.object({
  authorizationId: z.string().uuid(),
  confirmation: z.literal("DISABLE_AUTONOMOUS_META_OPTIMIZATION"),
}).strict();

async function requireCampaign(id: string) {
  const campaign = await getCampaignById(id);
  if (!campaign) throw new ApiError(404, "Campaign not found.", "campaign_not_found");
}

export async function GET(
  _request: Request,
  context: { params: Promise<Record<string, string>> | Record<string, string> },
) {
  try {
    const { id } = await parseRouteParams(context.params, paramsSchema);
    await requireCampaign(id);
    return apiSuccess({ campaignId: id, authorization: await getMetaOptimizationPolicyStatus(id) });
  } catch (error) {
    return handleApiError(error, "Get Meta optimization policy");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string>> | Record<string, string> },
) {
  try {
    assertSameOriginRequest(request);
    const { id } = await parseRouteParams(context.params, paramsSchema);
    await requireCampaign(id);
    const body = authorizeSchema.parse(await request.json());
    const authorization = await authorizeMetaOptimizationPolicy({
      campaignId: id,
      customerDailyBudgetCeilingMinor: body.customerDailyBudgetCeilingMinor,
      approvedCurrency: body.approvedCurrency,
    });
    return apiSuccess({ campaignId: id, authorization, providerMutationPerformed: false });
  } catch (error) {
    return handleApiError(error, "Authorize Meta optimization policy");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<Record<string, string>> | Record<string, string> },
) {
  try {
    assertSameOriginRequest(request);
    const { id } = await parseRouteParams(context.params, paramsSchema);
    await requireCampaign(id);
    const body = revokeSchema.parse(await request.json());
    const revoked = await revokeMetaOptimizationPolicy(id, body.authorizationId);
    if (!revoked) throw new ApiError(409, "Optimization can no longer be disabled automatically.", "meta_optimization_revocation_fenced");
    return apiSuccess({ campaignId: id, authorizationId: body.authorizationId, status: "revoked", providerMutationPerformed: false });
  } catch (error) {
    return handleApiError(error, "Revoke Meta optimization policy");
  }
}
