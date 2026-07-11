import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseRouteParams,
} from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { getMetaWorkspaceCredentials } from "@/lib/integrations/meta/service";
import { getNextEligibleLaunchAt, LAUNCH_TIME_ZONE } from "@/lib/launch-schedule";
import { assertCampaignCanLaunch } from "@/lib/services/campaign-entitlements";
import { scheduleCampaignLaunch } from "@/lib/services/campaign-launch-audit-service";
import { getCampaignById } from "@/lib/services/campaign-persistence";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string>> | Record<string, string> },
) {
  try {
    assertSameOriginRequest(request);
    const { id } = await parseRouteParams(context.params, paramsSchema);
    const record = await getCampaignById(id);

    if (!record) {
      throw new ApiError(404, "Campaign not found.", "campaign_not_found");
    }
    await assertCampaignCanLaunch(id);

    if (!record.publish.slug) {
      throw new ApiError(
        409,
        "Publish the campaign funnel before scheduling Meta launch.",
        "campaign_funnel_not_published",
      );
    }

    // This reads tenant-scoped prerequisites only. It does not call Meta or
    // perform a provider mutation.
    await getMetaWorkspaceCredentials();

    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "meta-launch-schedule", id),
      limit: 6,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const scheduledFor = getNextEligibleLaunchAt(new Date(), LAUNCH_TIME_ZONE);
    const schedule = await scheduleCampaignLaunch({
      campaignId: id,
      campaignName: record.campaign.name,
      scheduledFor: scheduledFor.toISOString(),
      timeZone: LAUNCH_TIME_ZONE,
    });

    return apiSuccess({
      campaignId: id,
      scheduleId: schedule.id,
      status: schedule.resultStatus,
      scheduledFor: schedule.scheduledFor,
      timeZone: LAUNCH_TIME_ZONE,
      providerMutationPerformed: false,
    });
  } catch (error) {
    return handleApiError(error, "Schedule campaign launch");
  }
}
