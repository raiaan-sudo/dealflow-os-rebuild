import { ApiError } from "@/lib/api/route";
import {
  analyzeCampaign,
  type CampaignAnalysisResult,
} from "@/lib/services/ai-optimizer";
import {
  type AutonomyActionCandidate,
  type AutonomyMode,
  type AutonomySnapshot,
} from "@/lib/services/autonomy-engine";
import {
  buildAutonomyExecutionPlan,
  type AutonomyExecutionMetrics,
} from "@/lib/services/autonomy-execution-service";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { assertCampaignCanRunAutonomy } from "@/lib/services/campaign-entitlements";
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
}): AutonomyExecutionMetrics {
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
      leadQualityScore: estimateLeadQualityScore({
        ctr:
          metrics.ctr !== undefined
            ? Number((Number(metrics.ctr) * 100).toFixed(2))
            : impressions > 0
              ? Number(((clicks / impressions) * 100).toFixed(2))
              : 0,
        cpl: leads > 0 ? Number((spend / leads).toFixed(2)) : 0,
        lp_cvr: clicks > 0 ? Number(((leads / clicks) * 100).toFixed(2)) : 0,
        leads,
      }),
    } satisfies AutonomyExecutionMetrics;
  }

  return {
    ctr: 0,
    cpc: 0,
    cpl: 0,
    frequency: 0,
    spend: 0,
    leads: 0,
    lp_cvr: 0,
    leadQualityScore: null,
  } satisfies AutonomyExecutionMetrics;
}

function estimateLeadQualityScore(params: {
  ctr: number;
  cpl: number;
  lp_cvr: number;
  leads: number;
}) {
  if (params.leads <= 0) {
    return null;
  }

  let score = 0.55;

  if (params.ctr >= 1.5) score += 0.1;
  if (params.lp_cvr >= 8) score += 0.15;
  if (params.cpl > 0 && params.cpl <= 35) score += 0.1;
  if (params.cpl >= 100) score -= 0.15;
  if (params.lp_cvr > 0 && params.lp_cvr < 3) score -= 0.1;

  return Math.min(1, Math.max(0, Number(score.toFixed(2))));
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
    blockedReason: null,
  }));
}

function centsFromEnv(name: string) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function dailyBudgetCentsFromRuntime(value: unknown, monthlyBudget: number) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value * 100);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed * 100);
    }
  }

  return Math.round(Math.max(0, monthlyBudget) / 30 * 100);
}

function normalizeMode(mode?: AutonomyMode | null): AutonomyMode {
  if (mode === "manual" || mode === "assisted" || mode === "auto" || mode === "autonomous") {
    return mode;
  }

  return "assisted";
}

export async function evaluateAutonomy(
  campaignId?: string | null,
  options?: {
    mode?: AutonomyMode | null;
  },
) {
  const record = campaignId
    ? await getCampaignById(campaignId)
    : null;
  const plan = record ? canonicalCampaignToPlan(record) : await getLatestCampaignPlan();

  if (!plan) {
    throw new ApiError(404, "No campaign is available for autonomy analysis.", "campaign_not_found");
  }

  await assertCampaignCanRunAutonomy(plan.id);

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
  const executionPlan = buildAutonomyExecutionPlan({
    mode: normalizeMode(options?.mode),
    campaign: {
      organizationId: plan.organizationId,
      campaignId: plan.id,
      campaignName: plan.businessName,
      targetMarket: plan.market,
      monthlyBudget: plan.monthlyBudget,
      currentDailyBudgetCents: dailyBudgetCentsFromRuntime(
        plan.runtime.budgetDailyInput ?? plan.runtime.budgetDaily,
        plan.monthlyBudget,
      ),
      dailyBudgetCapCents:
        centsFromEnv("META_DAILY_BUDGET_CAP_CENTS"),
    },
    metrics,
    candidates: pendingActions,
  });
  const recommendations = result.actions.map((action, index) => ({
    id: `${plan.id}-recommendation-${index + 1}`,
    title: action,
    reason: result.reasons[0] ?? "Performance analysis generated a recommendation.",
    focus: result.recommendationFocus ?? "monitor",
    blocked: executionPlan.blockedExecutionActions.some((candidate) => candidate.actionKey === pendingActions[index]?.actionKey),
  }));
  const snapshot: AutonomySnapshot = {
    mode: executionPlan.mode,
    systemStatus:
      executionPlan.appliedExecutionActions.length > 0
        ? "optimizing"
        : executionPlan.blockedExecutionActions.length > 0
          ? "degraded"
          : metrics.spend > 0 || metrics.leads > 0 || Boolean(plan.runtime.campaignId)
        ? "healthy"
        : "idle",
    pendingActions: executionPlan.executionQueue,
    recentActions: executionPlan.auditLogs.map((log) => ({
      id: log.idempotencyKey,
      title: pendingActions.find((action) => action.actionKey === log.actionKey)?.title ?? log.actionKey,
      reason: log.reason,
      status: log.status,
      executionMode: executionPlan.mode,
      targetMarket: plan.market,
      createdAt: log.createdAt,
      guardrailSummary: {
        mode: log.executionType,
        blockedReason: log.status === "blocked" ? log.reason : undefined,
        reason: log.auditSummary,
        applied: log.status === "applied",
      },
    })),
    executionSyncedAt: executionPlan.generatedAt,
    queuedCount: executionPlan.executionQueue.length,
    appliedCount: executionPlan.appliedExecutionActions.length,
    blockedCount: executionPlan.blockedExecutionActions.length,
    alert: executionPlan.alert,
  };

  return {
    campaignId: plan.id,
    metrics,
    recommendations,
    actions: result.actions,
    optimizerResult: result,
    executionPlan,
    executionQueue: executionPlan.executionQueue,
    appliedExecutionActions: executionPlan.appliedExecutionActions,
    blockedExecutionActions: executionPlan.blockedExecutionActions,
    snapshot,
  };
}
