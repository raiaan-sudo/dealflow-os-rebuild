import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
  parseRouteParams,
} from "@/lib/api/route";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import {
  creativeIntakeAnswersSchema,
  isCreativeChatIntakeEnabled,
  persistCreativeChatIntake,
  readCreativeChatIntakeFromPlan,
  type CreativeIntakeCampaignDefaults,
} from "@/lib/services/creative-chat-intake-service";

const paramsSchema = z.object({
  id: z.string().min(1),
});

const postBodySchema = z.object({
  action: z.enum(["save_answers", "approve", "revise"]),
  answers: creativeIntakeAnswersSchema.optional(),
  revisionMessage: z.string().max(800).optional(),
});

function buildDefaults(record: Awaited<ReturnType<typeof getCampaignById>>): CreativeIntakeCampaignDefaults {
  if (!record) {
    throw new ApiError(404, "Campaign not found.", "campaign_not_found");
  }

  const plan = canonicalCampaignToPlan(record);

  return {
    campaignId: record.campaign.id,
    market: plan.market,
    audience: plan.audience,
    offer: plan.offerSummary || plan.keyOffer,
    propertyType: plan.propertyType,
    campaignType: plan.intent,
    cta: record.funnel.cta || plan.funnel?.cta || null,
    brand: plan.businessName,
  };
}

function assertCampaignAccess(record: Awaited<ReturnType<typeof getCampaignById>>, auth: Awaited<ReturnType<typeof getAuthenticatedContext>>) {
  if (!record) {
    throw new ApiError(404, "Campaign not found.", "campaign_not_found");
  }

  if (
    record.campaign.user_id !== auth.userId &&
    record.campaign.organization_id !== auth.organizationId
  ) {
    throw new ApiError(404, "Campaign not found.", "campaign_not_found");
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<Record<string, string>> },
) {
  try {
    const auth = await getAuthenticatedContext();
    const { id } = await parseRouteParams(context.params, paramsSchema);
    const record = await getCampaignById(id);
    assertCampaignAccess(record, auth);
    const { data, error } = await auth.supabase
      .from("campaign_plans")
      .select("plan,user_id,organization_id")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const intakeRow = data as { plan?: unknown } | null;

    return apiSuccess({
      enabled: isCreativeChatIntakeEnabled(),
      campaignId: id,
      defaults: buildDefaults(record),
      intake: readCreativeChatIntakeFromPlan(intakeRow?.plan ?? null),
    });
  } catch (error) {
    return handleApiError(error, "Creative intake");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string>> },
) {
  try {
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const { id } = await parseRouteParams(context.params, paramsSchema);
    const body = await parseJsonBody(request, postBodySchema);
    const record = await getCampaignById(id);
    assertCampaignAccess(record, auth);

    if (!isCreativeChatIntakeEnabled()) {
      throw new ApiError(409, "Guided creative intake is not enabled for this workspace.", "creative_intake_disabled");
    }

    const intake = await persistCreativeChatIntake({
      supabase: auth.supabase as never,
      campaignId: id,
      userId: auth.userId,
      organizationId: auth.organizationId,
      defaults: buildDefaults(record),
      answers: body.answers,
      action: body.action,
      revisionMessage: body.revisionMessage,
    });

    return apiSuccess({
      success: true,
      campaignId: id,
      intake,
      staticRenderQueue: body.action === "approve"
        ? {
            queued: false,
            reusedExistingJob: false,
            jobId: null,
            blockedReason: "manual_render_required",
            launchReadyCount: 0,
            missingCount: 3,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error, "Creative intake");
  }
}
