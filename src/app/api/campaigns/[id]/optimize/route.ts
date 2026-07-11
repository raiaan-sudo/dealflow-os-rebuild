import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseRouteParams,
} from "@/lib/api/route";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { getMetaCampaignSyncSnapshotForCampaign } from "@/lib/services/meta-campaign-sync-service";
import { evaluateOptimizationEvidence } from "@/lib/optimization-engine/safety-policy";
import { recordOptimizationDecision } from "@/lib/services/optimization-decision-service";

const paramsSchema = z.object({
  id: z.string().min(1),
});

type Recommendation = {
  rule: "change_creative" | "pause_ad" | "adjust_targeting" | "scale_budget";
  message: string;
  status?: "shadow_only";
  blockedReason?: string;
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

export async function GET() {
  await getAuthenticatedContext();

  return Response.json(
    {
      error: "Optimization evaluation is a recorded operation. Use POST so the immutable decision ledger cannot be bypassed.",
      code: "optimization_recorded_post_required",
    },
    {
      status: 405,
      headers: { Allow: "POST" },
    },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string>> | Record<string, string> },
) {
  try {
    assertSameOriginRequest(request);
    const { id } = await parseRouteParams(context.params, paramsSchema);
    const record = await getCampaignById(id);

    if (!record) {
      throw new ApiError(404, "Campaign was not found.", "campaign_not_found");
    }

    const syncSnapshot = await getMetaCampaignSyncSnapshotForCampaign({
      campaignName: record.campaign.name,
      metaCampaignId: record.launch.runtime.campaignId ?? null,
    }).catch(() => null);

    const hasConfirmedSnapshot = syncSnapshot?.syncResult === "success";
    const spend = hasConfirmedSnapshot
      ? Number(syncSnapshot.deliveryMetrics.spend ?? 0)
      : 0;
    const impressions = hasConfirmedSnapshot
      ? Number(syncSnapshot.deliveryMetrics.impressions ?? 0)
      : 0;
    const clicks = hasConfirmedSnapshot
      ? Number(syncSnapshot.deliveryMetrics.clicks ?? 0)
      : 0;
    const leads = hasConfirmedSnapshot
      ? Number(syncSnapshot.deliveryMetrics.leads ?? 0)
      : 0;
    const ctr = Number(
      hasConfirmedSnapshot && syncSnapshot.deliveryMetrics.ctr !== undefined
        ? Number(syncSnapshot.deliveryMetrics.ctr) * 100
        : impressions > 0
          ? (clicks / impressions) * 100
          : 0,
    );
    const cpl = leads > 0 ? spend / leads : 0;

    const sourceStatus = !syncSnapshot
      ? "missing"
      : syncSnapshot.syncResult === "success"
        ? "confirmed"
        : syncSnapshot.syncResult === "partial_success"
          ? "partial"
          : "failed";
    const metrics = hasConfirmedSnapshot
      ? {
          ctr,
          spend,
          leads,
          cpl,
          cpc: clicks > 0 ? spend / clicks : 0,
          frequency: Number(syncSnapshot.deliveryMetrics.frequency ?? 0),
          lp_cvr: clicks > 0 ? (leads / clicks) * 100 : 0,
          impressions,
          clicks,
        }
      : null;
    const evidenceDecision = evaluateOptimizationEvidence({
      sourceStatus,
      syncedAt: syncSnapshot?.syncedAt ?? null,
      metrics,
      approvedPolicy: null,
    });
    const blockedReason =
      evidenceDecision.decisionState === "HOLD_NO_ACTION"
        ? `HOLD_NO_ACTION: ${evidenceDecision.blockers.join(", ")}.`
        : "Shadow proposal only; provider execution requires a separate explicit authorization.";
    const recommendations = evidenceDecision.canGenerateShadowProposal
      ? buildRecommendations({
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
        }).map((recommendation) => ({
          ...recommendation,
          status: "shadow_only" as const,
          blockedReason,
        }))
      : [];
    const decisionRecord = await recordOptimizationDecision({
      campaignId: id,
      sourceStatus,
      sourceTimestamp: syncSnapshot?.syncedAt ?? null,
      metrics,
      evidence: evidenceDecision,
      approvedPolicy: null,
      proposedActions: recommendations.map((recommendation) => recommendation.message),
    });

    return apiSuccess({
      campaign_id: id,
      metrics: hasConfirmedSnapshot ? { ctr, spend, leads, cpl } : null,
      recommendations,
      optimizationEvidence: evidenceDecision,
      decisionRecord,
    });
  } catch (error) {
    return handleApiError(error, "Optimize campaign");
  }
}
