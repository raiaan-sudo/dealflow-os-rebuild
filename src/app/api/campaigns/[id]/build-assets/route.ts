import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  handleApiError,
  parseRouteParams,
} from "@/lib/api/route";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

const paramsSchema = z.object({
  id: z.string().min(1),
});

async function loadStoredCampaignPayload(campaignId: string) {
  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase is not configured.", "config_missing");
  }

  const { data, error } = await supabase
    .from("campaign_plans")
    .select("plan")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = (data as { plan?: unknown } | null) ?? null;

  const plan =
    row?.plan && typeof row.plan === "object" && !Array.isArray(row.plan)
      ? (row.plan as Record<string, unknown>)
      : null;

  if (
    plan?.campaign_payload &&
    typeof plan.campaign_payload === "object" &&
    !Array.isArray(plan.campaign_payload)
  ) {
    return plan.campaign_payload as Record<string, unknown>;
  }

  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<Record<string, string>> | Record<string, string> },
) {
  try {
    const { id } = await parseRouteParams(context.params, paramsSchema);
    const [record, storedPayload] = await Promise.all([
      getCampaignById(id),
      loadStoredCampaignPayload(id),
    ]);

    if (!record) {
      throw new ApiError(404, "Campaign plan was not found.", "campaign_plan_not_found");
    }

    const campaignPayload =
      storedPayload ??
      {
        campaign_id: record.campaign.id,
        business_profile: {
          business_name: record.plan.business_name,
          client_name: record.plan.client_name,
          business_type: record.plan.intent,
          location: record.plan.market,
          service: record.plan.offer,
        },
        offer: {
          summary: record.plan.offer_summary,
          key_offer: record.plan.offer,
          mechanism: record.plan.mechanism,
        },
        targeting_plan: {
          summary: record.plan.targeting_summary,
          audience: record.plan.audience,
          market: record.plan.market,
          intent: record.plan.intent,
        },
        budget_plan: {
          monthly_budget: record.plan.monthly_budget,
          estimated_daily_budget: Math.max(1, Math.round(record.plan.monthly_budget / 30)),
        },
      };

    return apiSuccess({
      funnel: record.funnel,
      creatives: {
        items: record.creatives.items,
        ideas: record.creatives.ideas,
        copy: record.creatives.copy,
        ads: record.creatives.ads,
        staticAds: record.creatives.staticAds,
        videoAds: record.creatives.videoAds,
      },
      campaign_payload: campaignPayload,
    });
  } catch (error) {
    return handleApiError(error, "Build assets");
  }
}
