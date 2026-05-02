import { ApiError } from "@/lib/api/route";
import { createClient } from "@/lib/supabase/server";
import type { MetaCampaignSyncSnapshot, MetaEntityStatus } from "@/lib/integrations/meta/types";
import { getAppContext } from "@/lib/services/app-context";
import { buildExecutableCampaign } from "@/lib/services/campaign-execution-service";
import {
  getCreativeIntelligenceProfile,
  recordCreativeIntelligenceFeedback,
} from "@/lib/services/creative-intelligence-service";
import { getLatestCreativePerformanceSummary } from "@/lib/services/creative-performance-service";
import { getCategoryRulePack } from "@/lib/services/campaign-category-rule-packs";
import { getTargetingIntelligenceProfile } from "@/lib/services/targeting-intelligence-service";
import {
  getLatestCampaignPlan,
  persistCampaignPlan,
  type CampaignAd,
  type CampaignCreativeStrategy,
  type CampaignPlan,
} from "@/lib/services/campaign-plan-service";
import { getLatestMetaCampaignSyncSnapshot } from "@/lib/services/meta-campaign-sync-service";
import { logInfo } from "@/lib/logging";
import type { Json } from "@/lib/supabase/types";
import { evaluateMediaBuyingDecision } from "@/lib/optimization-engine/media-buying-rules";

type ActionSupabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export type CampaignActionStatus =
  | "suggested"
  | "approved"
  | "applying"
  | "applied"
  | "dismissed";

export type CampaignActionType =
  | "pause_low_performing_ad"
  | "test_new_creative_angle"
  | "increase_budget_on_winner"
  | "adjust_targeting"
  | "refresh_headline";

export type CampaignActionSuggestion = {
  id: string;
  campaignId: string;
  type: CampaignActionType;
  title: string;
  reason: string;
  expectedImpact: string;
  status: CampaignActionStatus;
  syncSnapshotId: string | null;
  context: Record<string, unknown>;
  createdAt: string;
};

type DraftAction = Omit<CampaignActionSuggestion, "id" | "createdAt">;

function mapActionStatus(value: unknown): CampaignActionStatus {
  return value === "approved" ||
    value === "applying" ||
    value === "applied" ||
    value === "dismissed"
    ? value
    : "suggested";
}

function mapActionType(value: unknown): CampaignActionType {
  switch (value) {
    case "pause_low_performing_ad":
    case "test_new_creative_angle":
    case "increase_budget_on_winner":
    case "adjust_targeting":
    case "refresh_headline":
      return value;
    default:
      return "refresh_headline";
  }
}

function mapSuggestion(row: Record<string, unknown>): CampaignActionSuggestion {
  return {
    id: String(row.id),
    campaignId: String(row.meta_campaign_id ?? ""),
    type: mapActionType(row.action_type),
    title: String(row.title ?? ""),
    reason: String(row.reason ?? ""),
    expectedImpact: String(row.expected_impact ?? ""),
    status: mapActionStatus(row.status),
    syncSnapshotId: typeof row.sync_snapshot_id === "string" ? row.sync_snapshot_id : null,
    context:
      row.context && typeof row.context === "object"
        ? (row.context as Record<string, unknown>)
        : {},
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

async function getActionContext() {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for this route.", "unauthorized");
  }

  return { context, supabase: supabase as ActionSupabase };
}

async function setSuggestionStatus(params: {
  supabase: ActionSupabase;
  organizationId: string;
  userId: string;
  id: string;
  status: CampaignActionStatus;
}) {
  const { data, error } = await params.supabase
    .from("campaign_action_suggestions")
    .update({ status: params.status } as never)
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .eq("id", params.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "campaign_action_suggestion_update_failed");
  }

  if (!data) {
    throw new ApiError(404, "Campaign action was not found.", "campaign_action_not_found");
  }

  return mapSuggestion(data as unknown as Record<string, unknown>);
}

async function writeActionAuditLog(params: {
  supabase: ActionSupabase;
  organizationId: string;
  userId: string;
  action: CampaignActionSuggestion;
  plan: CampaignPlan;
}) {
  await params.supabase.from("audit_logs").insert({
    organization_id: params.organizationId,
    actor_user_id: params.userId,
    entity_type: "campaign_action",
    entity_id: params.action.id,
    action: "campaign_action_applied",
    details: {
      title: params.action.title,
      type: params.action.type,
      expectedImpact: params.action.expectedImpact,
      campaignId: params.action.campaignId,
      market: params.plan.market,
    } as Json,
  } as never);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function capitalize(value: string) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function resolveStrategyAngle(plan: CampaignPlan, preferredWinner: string | null = null) {
  const rulePack = getCategoryRulePack(plan.creativeStrategy.campaignCategory);
  const winner = (preferredWinner ?? "").trim().toLowerCase();
  return (
    rulePack.winningAngles.find((angle) => angle.toLowerCase() !== winner) ??
    rulePack.winningAngles[0] ??
    null
  );
}

function ctaFromStyle(plan: CampaignPlan) {
  switch (plan.creativeStrategy.ctaStyle) {
    case "analysis":
      return "Review the numbers";
    case "exclusive":
      return "Request private access";
    case "low_friction":
      return "See the update";
    default:
      return plan.intent === "buyer" ? "Get my matching list" : "See the next step";
  }
}

function buildSuggestions(params: {
  snapshot: MetaCampaignSyncSnapshot;
  audience: string;
  propertyType: string;
  keyOffer: string;
  market: string;
  creativeStrategy: CampaignCreativeStrategy;
  targetingIntelligence?: Awaited<ReturnType<typeof getTargetingIntelligenceProfile>> | null;
  creativeSummary?: Awaited<ReturnType<typeof getLatestCreativePerformanceSummary>> | null;
}): DraftAction[] {
  const { snapshot, audience, propertyType, keyOffer, market, targetingIntelligence, creativeSummary } = params;
  const creativeStrategy = params.creativeStrategy;
  const rulePack = getCategoryRulePack(creativeStrategy.campaignCategory);
  const preferredAngle = resolveStrategyAngle(
    {
      audience,
      propertyType,
      keyOffer,
      market,
      creativeStrategy,
    } as CampaignPlan,
    creativeSummary?.winners[0]?.angle ?? null,
  );
  const ctr =
    snapshot.deliveryMetrics.impressions > 0
      ? snapshot.deliveryMetrics.clicks / snapshot.deliveryMetrics.impressions
      : 0;
  const spend = snapshot.deliveryMetrics.spend;
  const clicks = snapshot.deliveryMetrics.clicks;
  const status =
    typeof snapshot.campaignStatus === "string" ? snapshot.campaignStatus.toUpperCase() : "";
  const adStatuses: MetaEntityStatus[] = Array.isArray(snapshot.adStatuses)
    ? snapshot.adStatuses.flatMap((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return [];
        }

        const row = item as Record<string, unknown>;

        return [
          {
            id: String(row.id ?? `ad-${index}`),
            name: String(row.name ?? `Ad ${index + 1}`),
            status: String(row.status ?? "UNKNOWN"),
          },
        ];
      })
    : [];
  const metaCampaignId =
    typeof snapshot.metaCampaignId === "string" ? snapshot.metaCampaignId : "";
  const syncSnapshotId = typeof snapshot.id === "string" ? snapshot.id : null;
  const activeAds = adStatuses.filter((item) => item.status.toUpperCase().includes("ACTIVE")).length;
  const suggestions: DraftAction[] = [];
  const topWinner = creativeSummary?.winners[0];
  const topLoser = creativeSummary?.underperformers[0];
  const bestAudience = targetingIntelligence?.recommendedAudience ?? null;
  const bestLocation = targetingIntelligence?.recommendedLocation ?? null;
  const bestPattern = targetingIntelligence?.recommendedTargetingPattern ?? null;
  const mediaDecision = evaluateMediaBuyingDecision({
    ctr,
    cpc: snapshot.deliveryMetrics.cpc,
    cpl: snapshot.deliveryMetrics.cpl,
    frequency: snapshot.deliveryMetrics.frequency,
    spend,
    leads: snapshot.deliveryMetrics.leads,
    lp_cvr: 0,
    hoursElapsed: null,
  });

  if (topWinner && topLoser && topWinner.angle !== topLoser.angle) {
    suggestions.push({
      campaignId: metaCampaignId,
      type: "pause_low_performing_ad",
      title: "Pause low-performing ad",
      reason: `${capitalize(topWinner.angle)} messaging is clearly ahead of ${topLoser.angle} in this account. "${topWinner.hook}" is winning because it stays closer to ${creativeStrategy.mechanism} and ${creativeStrategy.proofStyle}, while "${topLoser.hook}" is consuming delivery without matching that strategy.`,
      expectedImpact: "Pause the weakest angle, protect the current winner, and keep spend concentrated on the mechanism-led proof path.",
      status: "suggested",
      syncSnapshotId,
      context: {
        campaignCategory: creativeStrategy.campaignCategory,
        triggerCondition: creativeStrategy.triggerCondition,
        mechanism: creativeStrategy.mechanism,
        proofStyle: creativeStrategy.proofStyle,
        winnerAngle: topWinner.angle,
        loserAngle: topLoser.angle,
        winnerCreativeId: topWinner.creativeId,
        loserCreativeId: topLoser.creativeId,
      },
    });
  }

  if (mediaDecision.action === "kill" && adStatuses.length >= 1) {
    suggestions.push({
      campaignId: metaCampaignId,
      type: "pause_low_performing_ad",
      title: "Pause low-performing ad",
      reason: `${snapshot.campaignName} hit a media-buyer kill rule: ${mediaDecision.reasons.join(" ")} Keep spend away from weak creatives and protect the ${creativeStrategy.mechanism} proof path.`,
      expectedImpact: "Reduce wasted spend and concentrate delivery on the strongest active ad before testing the next strategy-aligned angle.",
      status: "suggested",
      syncSnapshotId,
      context: {
        campaignCategory: creativeStrategy.campaignCategory,
        spend,
        clicks,
        cpl: snapshot.deliveryMetrics.cpl,
        cpc: snapshot.deliveryMetrics.cpc,
        frequency: snapshot.deliveryMetrics.frequency,
        mediaBuyingRules: mediaDecision.reasons,
        adStatuses,
      },
    });
  }

  if (ctr < 0.005 && snapshot.deliveryMetrics.impressions >= 1500) {
    suggestions.push({
      campaignId: metaCampaignId,
      type: "refresh_headline",
      title: "Refresh headline",
      reason: `${audience} are only clicking at ${formatPercent(ctr)} after ${snapshot.deliveryMetrics.impressions.toLocaleString()} impressions. This is below the 0.5% CTR kill threshold, so the hook needs to surface ${creativeStrategy.triggerCondition || keyOffer}, ${creativeStrategy.mechanism}, and ${creativeStrategy.proofStyle} faster.`,
      expectedImpact: "Improve click-through rate with a sharper situation-led promise tied directly to the mechanism and proof style.",
      status: "suggested",
      syncSnapshotId,
      context: {
        campaignCategory: creativeStrategy.campaignCategory,
        triggerCondition: creativeStrategy.triggerCondition,
        mechanism: creativeStrategy.mechanism,
        proofStyle: creativeStrategy.proofStyle,
        ctr,
        impressions: snapshot.deliveryMetrics.impressions,
        propertyType,
        keyOffer,
      },
    });
  }

  if (status === "LEARNING" || ctr < 0.015) {
    suggestions.push({
      campaignId: metaCampaignId,
      type: "adjust_targeting",
      title: "Adjust targeting",
      reason: bestAudience || bestLocation || bestPattern
        ? `${snapshot.campaignName} is still ${status || "unstable"} and response from ${audience} is soft. Stored performance data shows ${bestAudience ?? audience} in ${bestLocation ?? market} is converting better, with the strongest pattern tracked as ${bestPattern ?? `${bestAudience ?? audience} in ${bestLocation ?? market}`}. Align targeting more tightly to ${creativeStrategy.triggerCondition || creativeStrategy.internalTension || propertyType}.`
        : `${snapshot.campaignName} is still ${status || "unstable"} and response from ${audience} is soft. Tightening location and audience filters around ${creativeStrategy.triggerCondition || propertyType} should improve signal quality before more spend goes out.`,
      expectedImpact: "Raise lead quality and lower inefficient delivery before more budget is spent on the wrong trigger condition.",
      status: "suggested",
      syncSnapshotId,
      context: {
        campaignCategory: creativeStrategy.campaignCategory,
        status,
        ctr,
        audience,
        propertyType,
        triggerCondition: creativeStrategy.triggerCondition,
        bestAudience,
        bestLocation,
        bestPattern,
      },
    });
  }

  if (mediaDecision.action === "scale_duplicate" && clicks >= 30 && activeAds > 0) {
    suggestions.push({
      campaignId: metaCampaignId,
      type: "increase_budget_on_winner",
      title: "Duplicate winner into scale",
      reason: `${snapshot.campaignName} is overperforming on ${mediaDecision.strongMetrics.join(", ")}. Scale by duplicating the winning creative, not editing it, so ${creativeStrategy.mechanism} and ${creativeStrategy.proofStyle} stay intact.`,
      expectedImpact: "Scale the strongest ad while preserving the validated winner and avoiding edits that reset or weaken performance.",
      status: "suggested",
      syncSnapshotId,
      context: {
        campaignCategory: creativeStrategy.campaignCategory,
        mechanism: creativeStrategy.mechanism,
        proofStyle: creativeStrategy.proofStyle,
        ctr,
        clicks,
        activeAds,
        keyOffer,
        scalingMethod: "duplicate_winner_do_not_edit",
        strongMetrics: mediaDecision.strongMetrics,
      },
    });
  }

  if (suggestions.length < 3) {
    const nextAngle =
      preferredAngle ??
      creativeSummary?.testedAngles.find((item) => item.winnerCount === 0)?.angle ??
      topWinner?.angle ??
      rulePack.winningAngles[0] ??
      "proof";
    suggestions.push({
      campaignId: metaCampaignId,
      type: "test_new_creative_angle",
      title: "Test new creative angle",
      reason: topWinner
        ? `${capitalize(topWinner.angle)} is winning, but the next test should already be in market. Prepare a ${nextAngle} variation that keeps ${creativeStrategy.mechanism} close to the offer while opening a fresh angle around ${creativeStrategy.triggerCondition || creativeStrategy.internalTension || audience}.`
        : `${snapshot.deliveryMetrics.clicks.toLocaleString()} clicks have come through, but the creative set can still be stronger for ${audience} looking for ${propertyType}. Test a ${nextAngle} variant that leads harder with ${keyOffer}, names ${creativeStrategy.mechanism}, and proves it through ${creativeStrategy.proofStyle}.`,
      expectedImpact: "Lift response quality by introducing the next strongest angle before the current creative fatigues, without losing the strategy backbone.",
      status: "suggested",
      syncSnapshotId,
      context: {
        campaignCategory: creativeStrategy.campaignCategory,
        triggerCondition: creativeStrategy.triggerCondition,
        mechanism: creativeStrategy.mechanism,
        proofStyle: creativeStrategy.proofStyle,
        clicks,
        audience,
        propertyType,
        keyOffer,
        suggestedAngle: nextAngle,
      },
    });
  }

  return suggestions.slice(0, 3);
}

export async function getCampaignActionSuggestions(metaCampaignId?: string | null) {
  const { context, supabase } = await getActionContext();
  let query = supabase
    .from("campaign_action_suggestions")
    .select("*")
    .eq("organization_id", context.organization.id)
    .eq("user_id", context.user.id)
    .order("created_at", { ascending: false })
    .limit(12);

  if (metaCampaignId) {
    query = query.eq("meta_campaign_id", metaCampaignId);
  }

  const { data } = await query;

  return ((data ?? []) as Record<string, unknown>[]).map(mapSuggestion);
}

async function buildCreativeTestAd(plan: CampaignPlan): Promise<CampaignAd> {
  const source = plan.ads[0] ?? plan.ads[plan.ads.length - 1];
  const intelligence = await getCreativeIntelligenceProfile(plan).catch(() => null);
  const currentAngles = new Set(plan.ads.map((ad) => ad.angle).filter(Boolean));
  const rulePack = getCategoryRulePack(plan.creativeStrategy.campaignCategory);
  const nextPattern =
    intelligence?.patterns.find((pattern) => !currentAngles.has(pattern.angle)) ??
    intelligence?.patterns[0] ??
    null;
  const strategyAngle =
    resolveStrategyAngle(plan, nextPattern?.angle ?? null) ??
    rulePack.winningAngles[0] ??
    "proof-led";
  const hook =
    nextPattern?.hook ??
    `${capitalize(plan.creativeStrategy.triggerCondition || strategyAngle)} for ${plan.market} ${plan.propertyType}`;

  return {
    variant: nextPattern ? `${nextPattern.angle} test` : `${strategyAngle} test`,
    angle: nextPattern?.angle,
    sourcePatternId: nextPattern?.id ?? null,
    overlayText: `${hook}`,
    headline: `${capitalize(strategyAngle)} angle for ${plan.audience}: ${plan.keyOffer}`,
    body: `Test a sharper promise for ${plan.audience} looking for ${plan.propertyType}. Lead with ${plan.creativeStrategy.internalTension || plan.creativeStrategy.triggerCondition || plan.keyOffer}, name ${plan.creativeStrategy.mechanism}, and prove it through ${plan.creativeStrategy.proofStyle}.`,
    cta: source?.cta ?? ctaFromStyle(plan),
    image: source?.image ?? plan.ads[0]?.image ?? "",
  };
}

async function applyApprovedAction(plan: CampaignPlan, action: CampaignActionSuggestion) {
  if (action.type === "pause_low_performing_ad") {
    const executable = buildExecutableCampaign(plan);
    const candidate =
      executable.adSets
        .flatMap((adSet) => adSet.ads)
        .find((ad) => !plan.runtime.pausedAdIds.includes(ad.id)) ?? null;

    if (!candidate) {
      return {
        plan,
        summary: "No active ad was available to pause.",
        feedbackAds: [] as CampaignAd[],
        feedbackResultTag: "average" as const,
      };
    }

    return {
      plan: {
        ...plan,
        runtime: {
          ...plan.runtime,
          pausedAdIds: Array.from(new Set([...plan.runtime.pausedAdIds, candidate.id])),
          lastAction: `Optimization applied: paused ${candidate.name}.`,
          lastOptimizationAction: action.title,
          lastOptimizationAt: new Date().toISOString(),
        },
      },
      summary: `Paused ${candidate.name} to reduce wasted spend.`,
      feedbackAds: plan.ads.slice(0, 1),
      feedbackResultTag: "loser" as const,
    };
  }

  if (action.type === "increase_budget_on_winner") {
    const nextBudget = Math.round(plan.monthlyBudget * 1.2);

    return {
      plan: {
        ...plan,
        monthlyBudget: nextBudget,
        runtime: {
          ...plan.runtime,
          budgetDailyInput: Math.round(nextBudget / 30),
          budgetDaily: `$${Math.round(nextBudget / 30)}/day`,
          lastAction: `Optimization applied: increased budget to support the current winner.`,
          lastOptimizationAction: action.title,
          lastOptimizationAt: new Date().toISOString(),
        },
      },
      summary: `Increased campaign budget to ${nextBudget}/month.`,
      feedbackAds: plan.ads.slice(0, 1),
      feedbackResultTag: "winner" as const,
    };
  }

  if (action.type === "test_new_creative_angle") {
    const testAd = await buildCreativeTestAd(plan);

    return {
      plan: {
        ...plan,
        ads: [testAd, ...plan.ads].slice(0, 4),
        runtime: {
          ...plan.runtime,
          lastAction: "Optimization applied: added a new creative angle for testing.",
          lastOptimizationAction: action.title,
          lastOptimizationAt: new Date().toISOString(),
        },
      },
      summary: `Added a new creative variant built around ${plan.keyOffer}.`,
      feedbackAds: [testAd],
      feedbackResultTag: "average" as const,
    };
  }

  if (action.type === "refresh_headline") {
    const nextAds = [...plan.ads];
    const primary = nextAds[0];

    if (primary) {
      nextAds[0] = {
        ...primary,
        headline: `${capitalize(plan.creativeStrategy.triggerCondition || plan.audience)}: ${plan.keyOffer}`,
        overlayText: `${plan.creativeStrategy.proofStyle} | ${plan.keyOffer}`,
        body: `Lead directly with ${plan.creativeStrategy.internalTension || plan.creativeStrategy.triggerCondition || plan.audience}, explain ${plan.creativeStrategy.mechanism}, and use ${plan.creativeStrategy.proofStyle} to reduce uncertainty.`,
      };
    }

    return {
      plan: {
        ...plan,
        ads: nextAds,
        runtime: {
          ...plan.runtime,
          lastAction: "Optimization applied: refreshed the lead headline and creative hook.",
          lastOptimizationAction: action.title,
          lastOptimizationAt: new Date().toISOString(),
        },
      },
      summary: "Updated the primary headline to make the offer more explicit.",
      feedbackAds: nextAds.slice(0, 1),
      feedbackResultTag: "average" as const,
    };
  }

  if (action.type === "adjust_targeting") {
    const targetingIntelligence = await getTargetingIntelligenceProfile().catch(() => null);
    const nextAudience =
      targetingIntelligence?.recommendedAudience ?? `${plan.audience} with stronger ${plan.market} intent`;
    const nextLocation = targetingIntelligence?.recommendedLocation ?? plan.market;
    const nextPattern =
      targetingIntelligence?.recommendedTargetingPattern ??
      `${nextAudience} in ${nextLocation}`;

    return {
      plan: {
        ...plan,
        audience: nextAudience,
      targetingSummary: `${nextAudience} in ${nextLocation} for ${plan.propertyType}, anchored around ${plan.keyOffer}. The strongest stored targeting pattern is ${nextPattern}.`,
        creativeStrategy: {
          ...plan.creativeStrategy,
          triggerCondition: plan.creativeStrategy.triggerCondition || nextPattern,
        },
        runtime: {
          ...plan.runtime,
          lastAction: "Optimization applied: tightened the targeting profile around stronger local intent.",
          lastOptimizationAction: action.title,
          lastOptimizationAt: new Date().toISOString(),
        },
      },
      summary: `Adjusted targeting toward ${nextAudience} in ${nextLocation}.`,
      feedbackAds: plan.ads.slice(0, 1),
      feedbackResultTag: "average" as const,
    };
  }

  return {
    plan,
    summary: "No campaign changes were applied.",
    feedbackAds: [] as CampaignAd[],
    feedbackResultTag: "average" as const,
  };
}

export async function refreshCampaignActionSuggestions(snapshot?: MetaCampaignSyncSnapshot | null) {
  const [{ context, supabase }, plan, resolvedSnapshot, creativeSummary, targetingIntelligence] = await Promise.all([
    getActionContext(),
    getLatestCampaignPlan(),
    snapshot ? Promise.resolve(snapshot) : getLatestMetaCampaignSyncSnapshot(),
    getLatestCreativePerformanceSummary().catch(() => null),
    getTargetingIntelligenceProfile().catch(() => null),
  ]);

  if (!plan || !resolvedSnapshot?.metaCampaignId) {
    return [];
  }

  const suggestions = buildSuggestions({
    snapshot: resolvedSnapshot,
    audience: plan.audience,
    propertyType: plan.propertyType,
    keyOffer: plan.keyOffer,
    market: plan.market,
    creativeStrategy: plan.creativeStrategy,
    targetingIntelligence,
    creativeSummary,
  });

  await supabase
    .from("campaign_action_suggestions")
    .delete()
    .eq("organization_id", context.organization.id)
    .eq("user_id", context.user.id)
    .eq("meta_campaign_id", resolvedSnapshot.metaCampaignId)
    .eq("status", "suggested");

  if (suggestions.length === 0) {
    return [];
  }

  const { error } = await supabase.from("campaign_action_suggestions").insert(
    suggestions.map((suggestion) => ({
      organization_id: context.organization.id,
      user_id: context.user.id,
      sync_snapshot_id: suggestion.syncSnapshotId,
      meta_campaign_id: suggestion.campaignId,
      action_type: suggestion.type,
      title: suggestion.title,
      reason: suggestion.reason,
      expected_impact: suggestion.expectedImpact,
      status: suggestion.status,
      context: suggestion.context as Json,
    })) as never,
  );

  if (error) {
    throw new ApiError(500, error.message, "campaign_action_suggestion_insert_failed");
  }

  return getCampaignActionSuggestions();
}

export async function updateCampaignActionSuggestionStatus(params: {
  id: string;
  status: Extract<CampaignActionStatus, "approved" | "dismissed">;
}) {
  const { context, supabase } = await getActionContext();
  const updated = await setSuggestionStatus({
    supabase,
    organizationId: context.organization.id,
    userId: context.user.id,
    id: params.id,
    status: params.status,
  });

  if (params.status === "dismissed") {
    return updated;
  }

  await setSuggestionStatus({
    supabase,
    organizationId: context.organization.id,
    userId: context.user.id,
    id: params.id,
    status: "applying",
  });

  const plan = await getLatestCampaignPlan();

  if (!plan) {
    throw new ApiError(400, "Campaign plan is required before applying an action.", "campaign_plan_missing");
  }

  const applied = await applyApprovedAction(plan, updated);
  const persistedPlan = await persistCampaignPlan(applied.plan);

  if (applied.feedbackAds.length > 0) {
    await recordCreativeIntelligenceFeedback({
      plan: persistedPlan,
      ads: applied.feedbackAds,
      resultTag: applied.feedbackResultTag,
      notes: `${updated.title}: ${applied.summary}`,
    });
  }

  await writeActionAuditLog({
    supabase,
    organizationId: context.organization.id,
    userId: context.user.id,
    action: updated,
    plan: persistedPlan,
  });

  const appliedSuggestion = await setSuggestionStatus({
    supabase,
    organizationId: context.organization.id,
    userId: context.user.id,
    id: params.id,
    status: "applied",
  });

  logInfo("Campaign action applied", {
    organizationId: context.organization.id,
    userId: context.user.id,
    actionId: appliedSuggestion.id,
    actionType: appliedSuggestion.type,
    campaignId: appliedSuggestion.campaignId,
  });

  return appliedSuggestion;
}
