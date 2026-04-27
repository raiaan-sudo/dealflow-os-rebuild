import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  handleApiError,
  parseRouteParams,
} from "@/lib/api/route";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { getMetaCampaignSyncSnapshotForCampaign } from "@/lib/services/meta-campaign-sync-service";

const paramsSchema = z.object({
  id: z.string().min(1),
});

type Recommendation = {
  rule: "change_creative" | "pause_ad" | "adjust_targeting" | "scale_budget";
  message: string;
};

function buildRecommendations(params: {
  ctr: number;
  spend: number;
  leads: number;
  cpl: number;
  adCount: number;
  creativeCount: number;
}) {
  const recommendations: Recommendation[] = [];

  if (params.ctr < 1) {
    recommendations.push({
      rule: "change_creative",
      message: "change creative",
    });
  }

  if (params.spend > 0 && params.leads === 0) {
    recommendations.push({
      rule: "pause_ad",
      message: "pause ad",
    });
  }

  if (params.leads > 0 && params.cpl > 0 && params.cpl > 50) {
    recommendations.push({
      rule: "adjust_targeting",
      message: "adjust targeting",
    });
  }

  if (params.adCount > 1 && params.creativeCount > 0 && params.ctr >= 1 && params.leads > 0) {
    recommendations.push({
      rule: "scale_budget",
      message: "scale budget",
    });
  }

  return recommendations;
}

export async function GET(
  _request: Request,
  context: { params: Promise<Record<string, string>> | Record<string, string> },
) {
  try {
    const { id } = await parseRouteParams(context.params, paramsSchema);
    const record = await getCampaignById(id);

    if (!record) {
      throw new ApiError(404, "Campaign was not found.", "campaign_not_found");
    }

    const syncSnapshot = await getMetaCampaignSyncSnapshotForCampaign({
      campaignName: record.campaign.name,
      metaCampaignId: record.launch.runtime.campaignId ?? null,
    }).catch(() => null);

    const spend = Number(syncSnapshot?.deliveryMetrics?.spend ?? 0);
    const impressions = Number(syncSnapshot?.deliveryMetrics?.impressions ?? 0);
    const clicks = Number(syncSnapshot?.deliveryMetrics?.clicks ?? 0);
    const leads = Number(syncSnapshot?.deliveryMetrics?.leads ?? 0);
    const ctr = Number(
      syncSnapshot?.deliveryMetrics?.ctr !== undefined
        ? Number(syncSnapshot.deliveryMetrics.ctr) * 100
        : impressions > 0
          ? (clicks / impressions) * 100
          : 0,
    );
    const cpl = leads > 0 ? spend / leads : 0;

    const recommendations = buildRecommendations({
      ctr,
      spend,
      leads,
      cpl,
      adCount: Array.isArray(record.launch.runtime.metaAdIds)
        ? record.launch.runtime.metaAdIds.length
        : 0,
      creativeCount:
        (Array.isArray(record.creatives.staticAds) ? record.creatives.staticAds.length : 0) +
        (Array.isArray(record.creatives.videoAds) ? record.creatives.videoAds.length : 0),
    });

    return apiSuccess({
      campaign_id: id,
      metrics: {
        ctr,
        spend,
        leads,
        cpl,
      },
      recommendations,
    });
  } catch (error) {
    return handleApiError(error, "Optimize campaign");
  }
}
