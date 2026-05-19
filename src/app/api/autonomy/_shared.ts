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
import {
  assertCampaignCanRunAutonomy,
  getCampaignEntitlementsForCampaign,
} from "@/lib/services/campaign-entitlements";
import { getLatestCampaignPlan } from "@/lib/services/campaign-plan-service";
import {
  getLatestMetaCampaignSyncSnapshot,
  getMetaCampaignSyncSnapshotForCampaign,
} from "@/lib/services/meta-campaign-sync-service";
import { createAdminClient } from "@/lib/supabase/admin";

type AutonomySettingsState = {
  mode: Extract<AutonomyMode, "manual" | "assisted" | "auto">;
  customerAutopilotEnabled: boolean;
  killSwitchEnabled: boolean;
  dailyBudgetCapCents: number | null;
  monthlyBudgetCapCents: number | null;
  guardReasons: string[];
};

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

function normalizeStoredMode(mode?: AutonomyMode | null): AutonomySettingsState["mode"] {
  if (mode === "auto" || mode === "autonomous") {
    return "auto";
  }

  if (mode === "assisted") {
    return "assisted";
  }

  return "manual";
}

function centsOrNull(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function firstCents(...values: unknown[]) {
  for (const value of values) {
    const cents = centsOrNull(value);
    if (cents !== null) {
      return cents;
    }
  }

  return null;
}

async function getAutonomySettingsState(params: {
  organizationId: string;
  campaignId: string;
}): Promise<AutonomySettingsState> {
  const admin = createAdminClient() as any;

  if (!admin) {
    return {
      mode: "manual",
      customerAutopilotEnabled: false,
      killSwitchEnabled: true,
      dailyBudgetCapCents: null,
      monthlyBudgetCapCents: null,
      guardReasons: ["Autopilot settings cannot be loaded because the service role is unavailable."],
    };
  }

  const [customerResult, campaignResult] = await Promise.all([
    admin
      .from("customer_autonomy_settings")
      .select("mode,daily_budget_cap_cents,monthly_budget_cap_cents,kill_switch_enabled")
      .eq("organization_id", params.organizationId)
      .maybeSingle(),
    admin
      .from("campaign_autonomy_settings")
      .select("mode,daily_budget_cap_cents,monthly_budget_cap_cents,kill_switch_enabled")
      .eq("organization_id", params.organizationId)
      .eq("campaign_id", params.campaignId)
      .maybeSingle(),
  ]);

  if (customerResult.error || campaignResult.error) {
    return {
      mode: "manual",
      customerAutopilotEnabled: false,
      killSwitchEnabled: true,
      dailyBudgetCapCents: null,
      monthlyBudgetCapCents: null,
      guardReasons: ["Autopilot settings lookup failed, so execution remains disabled."],
    };
  }

  const customer = customerResult.data as Record<string, unknown> | null;
  const campaign = campaignResult.data as Record<string, unknown> | null;
  const mode = normalizeStoredMode((campaign?.mode ?? customer?.mode) as AutonomyMode | null);
  const killSwitchEnabled = Boolean(customer?.kill_switch_enabled) || Boolean(campaign?.kill_switch_enabled);

  return {
    mode,
    customerAutopilotEnabled: mode === "auto" && !killSwitchEnabled,
    killSwitchEnabled,
    dailyBudgetCapCents: firstCents(campaign?.daily_budget_cap_cents, customer?.daily_budget_cap_cents),
    monthlyBudgetCapCents: firstCents(campaign?.monthly_budget_cap_cents, customer?.monthly_budget_cap_cents),
    guardReasons: killSwitchEnabled ? ["Customer Autopilot kill switch is enabled."] : [],
  };
}

function getApprovedDailyBudgetCapCents(params: {
  settings: AutonomySettingsState;
  monthlyBudget: number;
}) {
  const planMonthlyBudgetCents = Math.round(Math.max(0, params.monthlyBudget) * 100);
  const approvedMonthlyBudgetCents = params.settings.monthlyBudgetCapCents ?? planMonthlyBudgetCents;
  const dailyFromMonthly =
    approvedMonthlyBudgetCents > 0 ? Math.floor(approvedMonthlyBudgetCents / 30) : null;

  if (params.settings.dailyBudgetCapCents !== null && dailyFromMonthly !== null) {
    return Math.min(params.settings.dailyBudgetCapCents, dailyFromMonthly);
  }

  return params.settings.dailyBudgetCapCents ?? dailyFromMonthly;
}

function staleSyncReason(syncSnapshot: Awaited<ReturnType<typeof getLatestMetaCampaignSyncSnapshot>> | null) {
  const syncedAt =
    typeof syncSnapshot?.syncedAt === "string"
      ? syncSnapshot.syncedAt
      : typeof syncSnapshot?.lastSyncedAt === "string"
        ? syncSnapshot.lastSyncedAt
        : null;

  if (!syncedAt) {
    return "Current Meta sync snapshot is missing.";
  }

  const timestamp = Date.parse(syncedAt);
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > 30 * 60 * 1000) {
    return "Current Meta sync snapshot is stale.";
  }

  return null;
}

function buildExecutionGuardReasons(params: {
  requestedMode: AutonomyMode;
  settings: AutonomySettingsState;
  entitlements: Awaited<ReturnType<typeof getCampaignEntitlementsForCampaign>>;
  plan: ReturnType<typeof canonicalCampaignToPlan>;
  record: Awaited<ReturnType<typeof getCampaignById>> | null;
  syncSnapshot: Awaited<ReturnType<typeof getLatestMetaCampaignSyncSnapshot>> | null;
}) {
  if (params.requestedMode !== "auto" && params.requestedMode !== "autonomous") {
    return [];
  }

  const reasons = [...params.settings.guardReasons];

  if (!params.entitlements.canRunAutonomy) {
    reasons.push("Active Pro billing is required before Autopilot execution.");
  }

  if (!params.settings.customerAutopilotEnabled) {
    reasons.push("Customer Autopilot mode is not enabled for this campaign.");
  }

  if (params.plan.runtime.safetyState === "blocked" || params.plan.runtime.safetyState === "failed") {
    reasons.push("Operator or launch safety state is blocking automation.");
  }

  const publish = params.record?.publish ?? null;
  if (!publish?.slug || publish.state !== "published" || !publish.hasPublishedSnapshot) {
    reasons.push("A current published funnel snapshot is required before Autopilot execution.");
  }

  if (params.plan.runtime.campaignId) {
    const staleReason = staleSyncReason(params.syncSnapshot);
    if (staleReason) {
      reasons.push(staleReason);
    }

    if (
      syncSnapshotHasDifferentCampaign(params.syncSnapshot, params.plan.runtime.campaignId)
    ) {
      reasons.push("Meta/app campaign identity drift blocks automation.");
    }
  }

  return reasons;
}

function syncSnapshotHasDifferentCampaign(
  syncSnapshot: Awaited<ReturnType<typeof getLatestMetaCampaignSyncSnapshot>> | null,
  metaCampaignId: string,
) {
  const syncedMetaCampaignId =
    typeof syncSnapshot?.metaCampaignId === "string" ? syncSnapshot.metaCampaignId : null;

  return Boolean(syncedMetaCampaignId && syncedMetaCampaignId !== metaCampaignId);
}

function applyExecutionGuardReasons(
  candidates: AutonomyActionCandidate[],
  guardReasons: string[],
) {
  if (guardReasons.length === 0) {
    return candidates;
  }

  const blockedReason = guardReasons.join(" ");
  return candidates.map((candidate) => ({
    ...candidate,
    blockedReason: candidate.blockedReason ?? blockedReason,
  }));
}

export async function updateCampaignAutonomyMode(params: {
  organizationId: string;
  campaignId: string;
  mode: AutonomyMode;
}) {
  const admin = createAdminClient() as any;

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const mode = normalizeStoredMode(params.mode);
  const { error } = await admin
    .from("campaign_autonomy_settings")
    .upsert(
      {
        organization_id: params.organizationId,
        campaign_id: params.campaignId,
        mode,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,campaign_id" },
    );

  if (error) {
    throw new ApiError(500, error.message, "autonomy_settings_update_failed");
  }
}

export async function assertAutonomyExecutionAccess(campaignId: string) {
  return assertCampaignCanRunAutonomy(campaignId);
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

  const entitlements = await getCampaignEntitlementsForCampaign(plan.id);

  if (!entitlements.canRunOptimization && !entitlements.canRunAutonomy) {
    throw new ApiError(
      402,
      "Optimization recommendations require active billing.",
      "billing_optimization_payment_required",
    );
  }

  const syncSnapshot = plan.runtime.campaignId
    ? await getMetaCampaignSyncSnapshotForCampaign({
        campaignName: plan.businessName,
        metaCampaignId: plan.runtime.campaignId,
      }).catch(() => null)
    : await getLatestMetaCampaignSyncSnapshot().catch(() => null);
  const settings = await getAutonomySettingsState({
    organizationId: plan.organizationId,
    campaignId: plan.id,
  });
  const requestedMode = normalizeMode(options?.mode ?? settings.mode);
  const effectiveMode = entitlements.canRunAutonomy ? requestedMode : "manual";
  const executionGuardReasons = buildExecutionGuardReasons({
    requestedMode,
    settings,
    entitlements,
    plan,
    record,
    syncSnapshot,
  });

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
  const guardedPendingActions = applyExecutionGuardReasons(
    pendingActions,
    effectiveMode === "manual" ? [] : executionGuardReasons,
  );
  const envDailyBudgetCapCents = centsFromEnv("META_DAILY_BUDGET_CAP_CENTS");
  const approvedDailyBudgetCapCents = getApprovedDailyBudgetCapCents({
    settings,
    monthlyBudget: plan.monthlyBudget,
  });
  const executionPlan = buildAutonomyExecutionPlan({
    mode: effectiveMode,
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
        envDailyBudgetCapCents !== null && approvedDailyBudgetCapCents !== null
          ? Math.min(envDailyBudgetCapCents, approvedDailyBudgetCapCents)
          : approvedDailyBudgetCapCents ?? envDailyBudgetCapCents,
    },
    metrics,
    candidates: guardedPendingActions,
    customerAutopilotEnabled: settings.customerAutopilotEnabled && executionGuardReasons.length === 0,
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
