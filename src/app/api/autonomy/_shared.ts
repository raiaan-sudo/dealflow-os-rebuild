import { ApiError } from "@/lib/api/route";
import {
  analyzeCampaign,
  type CampaignAnalysisInput,
  type CampaignAnalysisResult,
} from "@/lib/services/ai-optimizer";
import {
  type AutonomyActionCandidate,
  type AutonomySnapshot,
} from "@/lib/services/autonomy-engine";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { getLatestCampaignPlan } from "@/lib/services/campaign-plan-service";
import {
  getLatestMetaCampaignSyncSnapshot,
  getMetaCampaignSyncSnapshotForCampaign,
} from "@/lib/services/meta-campaign-sync-service";

function mapActionType(focus: CampaignAnalysisResult["recommendationFocus"], action: string) {
  if (focus === "pause") {
    return "pause";
  }

  if (focus === "promote") {
    return "scale";
  }

  if (focus === "iterate") {
    return "creative_refresh";
  }

  if (/budget/i.test(action)) {
    return "budget_adjustment";
  }

  return "monitor";
}

function mapBudgetChangePercent(
  focus: CampaignAnalysisResult["recommendationFocus"],
  action: string,
) {
  if (focus === "promote" || /increase budget|scale/i.test(action)) {
    return 20;
  }

  if (focus === "pause") {
    return -100;
  }

  return 0;
}

function buildMetrics(params: {
  syncSnapshot: Awaited<ReturnType<typeof getLatestMetaCampaignSyncSnapshot>> | null;
  monthlyBudget: number;
}) {
  const metrics = params.syncSnapshot?.deliveryMetrics;

  if (metrics) {
    const impressions = Number(metrics.impressions ?? 0);
    const clicks = Number(metrics.clicks ?? 0);
    const spend = Number(metrics.spend ?? 0);
    const leads = Number(metrics.leads ?? 0);

    return {
      ctr:
        metrics.ctr !== undefined
          ? Number((Number(metrics.ctr) * 100).toFixed(2))
          : impressions > 0
            ? Number(((clicks / impressions) * 100).toFixed(2))
            : 0,
      cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0,
      cpl: leads > 0 ? Number((spend / leads).toFixed(2)) : 0,
      frequency: Number(metrics.frequency ?? 1),
      spend,
      leads,
      lp_cvr: clicks > 0 ? Number(((leads / clicks) * 100).toFixed(2)) : 0,
    } satisfies CampaignAnalysisInput;
  }

  return {
    ctr: 0,
    cpc: 0,
    cpl: 0,
    frequency: 0,
    spend: 0,
    leads: 0,
    lp_cvr: 0,
  } satisfies CampaignAnalysisInput;
}

function buildPendingActions(
  result: CampaignAnalysisResult,
  audience: string,
  market: string,
): AutonomyActionCandidate[] {
  return result.actions.map((action, index) => ({
    actionKey: `${result.status}-${index + 1}`,
    title: action,
    reason: result.reasons[0] ?? "Performance analysis generated a recommendation.",
    targetMarket: market || null,
    actionType: mapActionType(result.recommendationFocus, action),
    confidenceScore:
      result.status === "scale"
        ? 0.86
        : result.status === "kill"
          ? 0.82
          : result.status === "iterate"
            ? 0.74
            : 0.62,
    budgetChangePercent: mapBudgetChangePercent(result.recommendationFocus, action),
    blockedReason:
      /pause|duplicate|increase budget|scale/i.test(action)
        ? "Autonomy routes are recommendations-only right now."
        : null,
  }));
}

export async function evaluateAutonomy(campaignId?: string | null) {
  const record = campaignId
    ? await getCampaignById(campaignId)
    : null;
  const plan = record ? canonicalCampaignToPlan(record) : await getLatestCampaignPlan();

  if (!plan) {
    throw new ApiError(404, "No campaign is available for autonomy analysis.", "campaign_not_found");
  }

  const syncSnapshot = plan.runtime.campaignId
    ? await getMetaCampaignSyncSnapshotForCampaign({
        campaignName: plan.businessName,
        metaCampaignId: plan.runtime.campaignId,
      }).catch(() => null)
    : await getLatestMetaCampaignSyncSnapshot().catch(() => null);

  const metrics = buildMetrics({
    syncSnapshot,
    monthlyBudget: plan.monthlyBudget,
  });
  const result = analyzeCampaign(metrics, {
    creativeStrategy: plan.creativeStrategy,
    audience: plan.audience,
    market: plan.market,
    propertyType: plan.propertyType,
    keyOffer: plan.keyOffer,
    currentAngles: plan.ads.map((ad) => ad.variant),
    winningAngle: null,
    budget: Number((plan.monthlyBudget / 30).toFixed(2)),
  });

  const pendingActions = buildPendingActions(result, plan.audience, plan.market);
  const recommendations = result.actions.map((action, index) => ({
    id: `${plan.id}-recommendation-${index + 1}`,
    title: action,
    reason: result.reasons[0] ?? "Performance analysis generated a recommendation.",
    focus: result.recommendationFocus ?? "monitor",
    blocked: true,
  }));
  const snapshot: AutonomySnapshot = {
    mode: "assisted",
    systemStatus:
      metrics.spend > 0 || metrics.leads > 0 || Boolean(plan.runtime.campaignId)
        ? "healthy"
        : "idle",
    pendingActions,
    recentActions: [],
  };

  return {
    campaignId: plan.id,
    metrics,
    recommendations,
    actions: result.actions,
    optimizerResult: result,
    snapshot,
  };
}
