import { ApiError } from "@/lib/api/route";
import {
  analyzeCampaign,
  buildHeldCampaignAnalysis,
  type CampaignAnalysisInput,
  type CampaignAnalysisResult,
} from "@/lib/services/ai-optimizer";
import {
  evaluateOptimizationEvidence,
  type OptimizationEvidenceMetrics,
} from "@/lib/optimization-engine/safety-policy";
import {
  REALTOR_OPTIMIZATION_POLICY_V1,
  evaluateRealtorOptimizationPolicy,
} from "@/lib/optimization-engine/realtor-policy";
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
import { recordOptimizationDecision } from "@/lib/services/optimization-decision-service";

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

function buildMetrics(params: {
  syncSnapshot: Awaited<ReturnType<typeof getLatestMetaCampaignSyncSnapshot>> | null;
}): OptimizationEvidenceMetrics | null {
  const metrics = params.syncSnapshot?.deliveryMetrics;

  if (metrics && params.syncSnapshot?.syncResult === "success") {
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
      impressions,
      clicks,
    } satisfies OptimizationEvidenceMetrics;
  }

  return null;
}

function buildPendingActions(
  result: CampaignAnalysisResult,
  market: string,
  blockedReason: string,
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
    budgetChangePercent: 0,
    blockedReason,
  }));
}

export async function evaluateAutonomy(
  campaignId?: string | null,
  options?: { persistDecision?: boolean },
) {
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
  });
  const sourceStatus = !syncSnapshot
    ? "missing"
    : syncSnapshot.syncResult === "success"
      ? "confirmed"
      : syncSnapshot.syncResult === "partial_success"
        ? "partial"
        : "failed";
  const customerDailyBudgetCeiling = Number((plan.monthlyBudget / 30).toFixed(2));
  const provisionalShadowPolicy = {
    ...REALTOR_OPTIMIZATION_POLICY_V1,
    customerDailyBudgetCeiling,
    campaignAgeHours: null,
  };
  const evidenceDecision = evaluateOptimizationEvidence({
    sourceStatus,
    syncedAt: syncSnapshot?.syncedAt ?? null,
    metrics,
    // The recovered policy may generate a deterministic shadow proposal. Its
    // provisional authority can never grant a provider mutation.
    approvedPolicy: provisionalShadowPolicy,
  });
  const realtorPolicyEvaluation = evaluateRealtorOptimizationPolicy({
    sourceStatus,
    syncedAt: syncSnapshot?.syncedAt ?? null,
    metrics,
    dailyBudget: customerDailyBudgetCeiling,
    customerDailyBudgetCeiling,
    switches: {
      global: true,
      account: false,
      campaign: false,
      emergencyStop: false,
    },
  });
  const analysisInput: CampaignAnalysisInput | null = metrics
    ? {
        ctr: metrics.ctr,
        cpc: metrics.cpc,
        cpl: metrics.cpl,
        frequency: metrics.frequency,
        spend: metrics.spend,
        leads: metrics.leads,
        lp_cvr: metrics.lp_cvr,
      }
    : null;
  const result = analysisInput && evidenceDecision.canGenerateShadowProposal
    ? analyzeCampaign(analysisInput, {
        creativeStrategy: plan.creativeStrategy,
        audience: plan.audience,
        market: plan.market,
        propertyType: plan.propertyType,
        keyOffer: plan.keyOffer,
        currentAngles: plan.ads.map((ad) => ad.variant),
        winningAngle: null,
        budget: Number((plan.monthlyBudget / 30).toFixed(2)),
      })
    : buildHeldCampaignAnalysis(
        "Optimization is on hold until a confirmed delivery snapshot is available.",
      );

  const blockedReason =
    evidenceDecision.decisionState === "HOLD_NO_ACTION"
      ? `HOLD_NO_ACTION: ${evidenceDecision.blockers.join(", ")}.`
      : "Shadow proposal only; provider execution requires a separate explicit authorization.";
  const pendingActions = buildPendingActions(
    result,
    plan.market,
    blockedReason,
  );
  const recommendations = result.actions.map((action, index) => ({
    id: `${plan.id}-recommendation-${index + 1}`,
    title: action,
    reason: result.reasons[0] ?? "Performance analysis generated a recommendation.",
    focus: result.recommendationFocus ?? "monitor",
    blocked: true,
    blockedReason,
  }));
  const snapshot: AutonomySnapshot = {
    mode: "assisted",
    systemStatus:
      metrics && (metrics.spend > 0 || metrics.leads > 0 || Boolean(plan.runtime.campaignId))
        ? "healthy"
        : "degraded",
    pendingActions,
    recentActions: [],
  };
  const decisionRecord = options?.persistDecision
    ? await recordOptimizationDecision({
        campaignId: plan.id,
        sourceStatus,
        sourceTimestamp: syncSnapshot?.syncedAt ?? null,
        metrics,
        evidence: evidenceDecision,
        approvedPolicy: provisionalShadowPolicy,
        proposedActions: evidenceDecision.canGenerateShadowProposal ? result.actions : [],
      })
    : null;

  return {
    campaignId: plan.id,
    metrics,
    recommendations,
    actions: result.actions,
    optimizerResult: result,
    optimizationEvidence: evidenceDecision,
    realtorPolicyEvaluation,
    decisionRecord,
    snapshot,
  };
}
