import { ApiError } from "@/lib/api/route";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/services/app-context";
import type { CampaignActionSuggestion } from "@/lib/services/campaign-action-service";
import { getLatestCreativePerformanceSummary } from "@/lib/services/creative-performance-service";
import { buildExecutableCampaign } from "@/lib/services/campaign-execution-service";
import {
  getLatestCampaignPlan,
  persistCampaignPlan,
  type CampaignAd,
  type CampaignPlan,
} from "@/lib/services/campaign-plan-service";
import { logInfo } from "@/lib/logging";
import type { Json } from "@/lib/supabase/types";

type DraftSupabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export type CampaignDraftActionType =
  | "duplicate_winning_ad"
  | "replacement_creative"
  | "headline_test"
  | "creative_angle_test"
  | "campaign_clone_test"
  | "budget_adjustment"
  | "targeting_adjustment";

export type CampaignDraftActionStatus =
  | "draft"
  | "awaiting_approval"
  | "auto_prepared"
  | "approved"
  | "applied"
  | "dismissed";

export type CampaignDraftAction = {
  id: string;
  campaignId: string;
  actionType: CampaignDraftActionType;
  sourceReason: string;
  proposedChange: Record<string, unknown>;
  expectedImpact: string;
  status: CampaignDraftActionStatus;
  createdAt: string;
};

type DraftCandidate = Omit<CampaignDraftAction, "id" | "createdAt"> & {
  autoApply: boolean;
  signature: string;
};

const DUPLICATE_LOOKBACK_MS = 1000 * 60 * 60 * 24;
const AUTO_PREP_COOLDOWN_MS = 1000 * 60 * 20;
const AUTO_APPLY_COOLDOWN_MS = 1000 * 60 * 45;

function buildDraftSignature(
  actionType: CampaignDraftActionType,
  proposedChange: Record<string, unknown>,
) {
  const signatureParts = [
    actionType,
    String(proposedChange.sourceCreativeId ?? ""),
    String(proposedChange.angle ?? ""),
    String(proposedChange.hook ?? ""),
    String(proposedChange.overlayText ?? ""),
    String(proposedChange.headline ?? ""),
    String(proposedChange.proposedAudience ?? ""),
    String(proposedChange.proposedMonthlyBudget ?? ""),
    String(proposedChange.cloneName ?? ""),
    String(proposedChange.focus ?? ""),
  ];

  return signatureParts.join("::").toLowerCase();
}

function getDraftSignature(row: CampaignDraftAction) {
  return typeof row.proposedChange.signature === "string"
    ? row.proposedChange.signature
    : buildDraftSignature(row.actionType, row.proposedChange);
}

function isSafeAutoAction(actionType: CampaignDraftActionType) {
  return (
    actionType === "duplicate_winning_ad" ||
    actionType === "replacement_creative" ||
    actionType === "headline_test" ||
    actionType === "creative_angle_test" ||
    actionType === "campaign_clone_test"
  );
}

async function writeDraftAuditLog(params: {
  supabase: DraftSupabase;
  organizationId: string;
  userId: string;
  draft: CampaignDraftAction;
  action: "created" | "approved" | "auto_applied" | "applied" | "dismissed";
}) {
  await params.supabase.from("audit_logs").insert({
    organization_id: params.organizationId,
    actor_user_id: params.userId,
    entity_type: "campaign_draft_action",
    entity_id: params.draft.id,
    action: `campaign_draft_${params.action}`,
    details: {
      campaignId: params.draft.campaignId,
      actionType: params.draft.actionType,
      status: params.draft.status,
      expectedImpact: params.draft.expectedImpact,
      sourceReason: params.draft.sourceReason,
    } as Json,
  } as never);
}

function isRecent(timestamp: string, windowMs: number) {
  const value = new Date(timestamp).getTime();

  if (Number.isNaN(value)) {
    return false;
  }

  return Date.now() - value < windowMs;
}

function ensureCopyContext(
  text: string,
  context: {
    audience: string;
    propertyType: string;
    keyOffer: string;
  },
) {
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();
  const missingParts = [
    normalized.includes(context.audience.toLowerCase()) ? null : context.audience,
    normalized.includes(context.propertyType.toLowerCase()) ? null : context.propertyType,
    normalized.includes(context.keyOffer.toLowerCase()) ? null : context.keyOffer,
  ].filter((value): value is string => Boolean(value));

  if (missingParts.length === 0) {
    return trimmed;
  }

  return `${trimmed} For ${context.audience} looking for ${context.propertyType}: ${context.keyOffer}.`;
}

function capitalize(value: string) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function findSourceAd(plan: CampaignPlan, proposedChange: Record<string, unknown>) {
  const sourcePatternId = String(proposedChange.sourcePatternId ?? "");
  const sourceOverlayText = String(proposedChange.sourceOverlayText ?? "");
  const sourceHeadline = String(proposedChange.sourceHeadline ?? "");
  const sourceAngle = String(proposedChange.angle ?? "");

  return (
    plan.ads.find((ad) => sourcePatternId && ad.sourcePatternId === sourcePatternId) ??
    plan.ads.find((ad) => sourceOverlayText && ad.overlayText === sourceOverlayText) ??
    plan.ads.find((ad) => sourceHeadline && ad.headline === sourceHeadline) ??
    plan.ads.find((ad) => sourceAngle && ad.angle === sourceAngle) ??
    plan.ads[0] ??
    null
  );
}

function buildAppendedAd(plan: CampaignPlan, draft: CampaignDraftAction): CampaignAd | null {
  const source = findSourceAd(plan, draft.proposedChange);
  const audienceLabel = plan.audience;
  const propertyLabel = plan.propertyType;
  const offerLabel = plan.keyOffer;
  const marketLabel = plan.market;
  const context = {
    audience: audienceLabel,
    propertyType: propertyLabel,
    keyOffer: offerLabel,
  };

  if (!source) {
    return null;
  }

  if (draft.actionType === "duplicate_winning_ad") {
    return {
      ...source,
      variant: `${source.variant} follow-up`,
      overlayText: ensureCopyContext(
        `${source.overlayText} Now tightened for ${marketLabel} ${propertyLabel}.`,
        context,
      ),
      headline: ensureCopyContext(
        `Still the strongest message for ${audienceLabel} looking for ${propertyLabel} in ${marketLabel}: ${offerLabel}.`,
        context,
      ),
      body: ensureCopyContext(
        `${source.body} This follow-up variation keeps the winning promise but adds a faster close for ${audienceLabel}.`,
        context,
      ),
    };
  }

  if (draft.actionType === "replacement_creative") {
    const angle = String(draft.proposedChange.angle ?? "approval");
    return {
      ...source,
      variant: `${angle} replacement`,
      angle: angle as CampaignAd["angle"],
      overlayText: ensureCopyContext(
        `Stop missing ${marketLabel} ${propertyLabel}. ${offerLabel}.`,
        context,
      ),
      headline: ensureCopyContext(
        `${audienceLabel} who want ${propertyLabel} in ${marketLabel} should act on ${offerLabel}.`,
        context,
      ),
      body: ensureCopyContext(
        `This replacement creative speaks more directly to ${audienceLabel} who are tired of low-fit ${propertyLabel} options and want ${offerLabel}.`,
        context,
      ),
    };
  }

  if (draft.actionType === "headline_test") {
    const headline = String(draft.proposedChange.headline ?? "").trim();
    return {
      ...source,
      variant: `${source.variant} headline test`,
      overlayText: ensureCopyContext(headline || source.overlayText, context),
      headline: ensureCopyContext(
        headline || `${audienceLabel} can move faster on ${propertyLabel} with ${offerLabel}.`,
        context,
      ),
      body: ensureCopyContext(
        `${source.body} This variation tests a lower-friction headline while keeping the same offer for ${audienceLabel}.`,
        context,
      ),
    };
  }

  if (draft.actionType === "creative_angle_test") {
    const angle = String(draft.proposedChange.angle ?? "approval");
    return {
      ...source,
      variant: `${angle} test`,
      angle: angle as CampaignAd["angle"],
      overlayText: ensureCopyContext(
        String(draft.proposedChange.overlayText ?? `New ${angle} hook for ${audienceLabel}`),
        context,
      ),
      headline: ensureCopyContext(
        `${capitalize(angle)} message for ${audienceLabel} searching ${marketLabel} ${propertyLabel} with ${offerLabel}.`,
        context,
      ),
      body: ensureCopyContext(
        `This queued ${angle} variation gives ${audienceLabel} another way into ${offerLabel} without changing the destination.`,
        context,
      ),
    };
  }

  if (draft.actionType === "campaign_clone_test") {
    return {
      ...source,
      variant: `${source.variant} clone test`,
      angle: (String(draft.proposedChange.angle ?? source.angle ?? "approval") as CampaignAd["angle"]),
      overlayText: ensureCopyContext(
        String(
          draft.proposedChange.overlayText ??
            `Follow-up angle for ${audienceLabel} in ${marketLabel}: ${offerLabel}.`,
        ),
        context,
      ),
      headline: ensureCopyContext(
        String(
          draft.proposedChange.headline ??
            `New follow-up for ${audienceLabel} chasing ${propertyLabel} in ${marketLabel}.`,
        ),
        context,
      ),
      body: ensureCopyContext(
        `${source.body} This clone keeps the current winner intact while queuing a separate campaign-style test around ${offerLabel}.`,
        context,
      ),
    };
  }

  return null;
}

async function autoApplySafeDraft(params: {
  draft: CampaignDraftAction;
  supabase: DraftSupabase;
  organizationId: string;
  userId: string;
}) {
  const plan = await getLatestCampaignPlan();

  if (!plan) {
    return null;
  }

  const nextAd = buildAppendedAd(plan, params.draft);

  if (!nextAd && params.draft.actionType !== "campaign_clone_test") {
    return null;
  }

  const cloneName =
    typeof params.draft.proposedChange.cloneName === "string" &&
    params.draft.proposedChange.cloneName.trim().length > 0
      ? params.draft.proposedChange.cloneName.trim()
      : `${plan.businessName} follow-up clone`;
  const cloneFocus =
    typeof params.draft.proposedChange.focus === "string" &&
    params.draft.proposedChange.focus.trim().length > 0
      ? params.draft.proposedChange.focus.trim()
      : "Winner-led follow-up test";

  const updatedPlan = await persistCampaignPlan({
    ...plan,
    ads: nextAd ? [...plan.ads, nextAd] : plan.ads,
    runtime: {
      ...plan.runtime,
      queuedCampaignClones:
        params.draft.actionType === "campaign_clone_test"
          ? [
              {
                id: params.draft.id,
                name: cloneName,
                status: "queued" as const,
                reason: params.draft.sourceReason,
                focus: cloneFocus,
                createdAt: new Date().toISOString(),
                clonedFromCampaignId: plan.id,
              },
              ...plan.runtime.queuedCampaignClones.filter(
                (item) => item.id !== params.draft.id,
              ),
            ].slice(0, 6)
          : plan.runtime.queuedCampaignClones,
      lastAction:
        params.draft.actionType === "campaign_clone_test"
          ? `Jarvis queued a cloned campaign test: ${cloneName}.`
          : `Jarvis auto-applied ${params.draft.actionType.replaceAll("_", " ")} and queued a new safe variation.`,
      lastOptimizationAction:
        params.draft.actionType === "campaign_clone_test"
          ? "Auto-prepared campaign clone test"
          : `Auto-applied ${params.draft.actionType.replaceAll("_", " ")}`,
      lastOptimizationAt: new Date().toISOString(),
      statusUpdatedAt: new Date().toISOString(),
    },
  });

  const { data, error } = await params.supabase
    .from("campaign_draft_actions")
    .update({ status: "applied" } as never)
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .eq("id", params.draft.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "campaign_draft_action_apply_failed");
  }

  const appliedDraft = data ? mapDraft(data as unknown as Record<string, unknown>) : params.draft;

  await writeDraftAuditLog({
    supabase: params.supabase,
    organizationId: params.organizationId,
    userId: params.userId,
    draft: appliedDraft,
    action: "auto_applied",
  });

  return {
    draft: appliedDraft,
    plan: updatedPlan,
  };
}

function mapActionType(value: unknown): CampaignDraftActionType {
  switch (value) {
    case "duplicate_winning_ad":
    case "replacement_creative":
    case "headline_test":
    case "creative_angle_test":
    case "campaign_clone_test":
    case "budget_adjustment":
    case "targeting_adjustment":
      return value;
    default:
      return "creative_angle_test";
  }
}

function mapStatus(value: unknown): CampaignDraftActionStatus {
  return value === "draft" ||
    value === "awaiting_approval" ||
    value === "auto_prepared" ||
    value === "approved" ||
    value === "applied" ||
    value === "dismissed"
    ? value
    : "draft";
}

function mapDraft(row: Record<string, unknown>): CampaignDraftAction {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id ?? ""),
    actionType: mapActionType(row.action_type),
    sourceReason: String(row.source_reason ?? ""),
    proposedChange:
      row.proposed_change && typeof row.proposed_change === "object"
        ? (row.proposed_change as Record<string, unknown>)
        : {},
    expectedImpact: String(row.expected_impact ?? ""),
    status: mapStatus(row.status),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

async function getDraftContext() {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for this route.", "unauthorized");
  }

  return { context, supabase: supabase as DraftSupabase };
}

export async function getCampaignDraftActions(campaignId?: string | null) {
  const { context, supabase } = await getDraftContext();
  let query = supabase
    .from("campaign_draft_actions")
    .select("*")
    .eq("organization_id", context.organization.id)
    .eq("user_id", context.user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }

  const { data } = await query;

  return ((data ?? []) as Record<string, unknown>[]).map(mapDraft);
}

export async function refreshCampaignDraftActions(pendingSuggestions?: CampaignActionSuggestion[]) {
  const [{ context, supabase }, plan, creativeSummary] = await Promise.all([
    getDraftContext(),
    getLatestCampaignPlan(),
    getLatestCreativePerformanceSummary().catch(() => null),
  ]);

  if (!plan || !creativeSummary) {
    return [];
  }

  const campaign = buildExecutableCampaign(plan);
  const campaignId = campaign.id;
  const suggestions = pendingSuggestions ?? [];
  const winner = creativeSummary.winners[0] ?? null;
  const loser = creativeSummary.underperformers[0] ?? null;
  const nextUntestedAngle =
    creativeSummary.testedAngles.find((item) => item.winnerCount === 0)?.angle ?? "approval";
  const existingDrafts = await getCampaignDraftActions();
  const drafts: DraftCandidate[] = [];

  const pushCandidate = (
    draft: Omit<DraftCandidate, "signature">,
  ) => {
    const signature = buildDraftSignature(draft.actionType, draft.proposedChange);
    const hasDuplicate = existingDrafts.some(
      (item) =>
        item.status !== "dismissed" &&
        getDraftSignature(item) === signature &&
        isRecent(item.createdAt, DUPLICATE_LOOKBACK_MS),
    );

    if (hasDuplicate) {
      return;
    }

    drafts.push({
      ...draft,
      signature,
    });
  };

  if (winner) {
    pushCandidate({
      campaignId,
      actionType: "duplicate_winning_ad",
      sourceReason: `${winner.angle} is the current winner and "${winner.hook}" is leading the set.`,
      proposedChange: {
        sourceCreativeId: winner.creativeId,
        hook: winner.hook,
        angle: winner.angle,
        sourceOverlayText: winner.hook,
        instruction: "Duplicate the winning ad into a new variation with a tighter close.",
        signature: "",
      },
      expectedImpact: "Extend the strongest current message into a new variation without changing the winning core hook.",
      status: "auto_prepared",
      autoApply: true,
    });
  }

  if (winner) {
    pushCandidate({
      campaignId,
      actionType: "campaign_clone_test",
      sourceReason: `${winner.angle} is winning, so Jarvis prepared a cloned campaign test around "${winner.hook}" before performance flattens out.`,
      proposedChange: {
        cloneName: `${plan.businessName} ${capitalize(winner.angle)} clone`,
        focus: `${capitalize(winner.angle)} follow-up campaign`,
        sourceCreativeId: winner.creativeId,
        angle: winner.angle,
        hook: winner.hook,
        overlayText: `Second-wave ${winner.angle} push for ${plan.audience}: ${plan.keyOffer}.`,
        headline: `Launch a follow-up campaign for ${plan.audience} using the current winner.`,
        instruction: "Queue a cloned campaign built around the strongest current hook and angle.",
        signature: "",
      },
      expectedImpact: "Keep momentum moving by preparing a follow-up campaign test built on the current winner, without touching spend or live delivery.",
      status: "auto_prepared",
      autoApply: true,
    });
  }

  if (loser) {
    pushCandidate({
      campaignId,
      actionType: "replacement_creative",
      sourceReason: `${loser.angle} is underperforming, so Jarvis prepared a replacement creative before delivery softens further.`,
      proposedChange: {
        sourceCreativeId: loser.creativeId,
        sourceOverlayText: loser.hook,
        angle: winner?.angle ?? nextUntestedAngle,
        hook: winner?.hook ?? loser.hook,
        instruction: `Generate a replacement creative that keeps ${plan.keyOffer} but replaces the low-performing ${loser.angle} angle.`,
        signature: "",
      },
      expectedImpact: "Replace a weak creative with a safer variation before wasted delivery compounds.",
      status: "auto_prepared",
      autoApply: true,
    });
  }

  if (winner && suggestions.some((item) => item.type === "refresh_headline")) {
    pushCandidate({
      campaignId,
      actionType: "headline_test",
      sourceReason: `${winner.angle} is carrying the strongest response, so the next headline should lean harder into that winning promise.`,
      proposedChange: {
        basedOnWinner: winner.hook,
        replacesAngle: loser?.angle ?? null,
        headline: `Most ${plan.audience} looking for ${plan.market} ${plan.propertyType} still miss the best options without ${plan.keyOffer}.`,
        instruction: `Draft a lower-friction headline variation based on ${winner.angle}.`,
        sourceCreativeId: winner.creativeId,
        sourceOverlayText: winner.hook,
        signature: "",
      },
      expectedImpact: "Improve click-through rate by adapting the headline around the winning angle.",
      status: "auto_prepared",
      autoApply: true,
    });
  }

  if (suggestions.some((item) => item.type === "test_new_creative_angle")) {
    pushCandidate({
      campaignId,
      actionType: "creative_angle_test",
      sourceReason: `CTR pressure suggests the next open testing slot should move into ${nextUntestedAngle}.`,
      proposedChange: {
        angle: nextUntestedAngle,
        overlayText: `${capitalize(nextUntestedAngle)} angle for ${plan.audience} looking for ${plan.propertyType}: ${plan.keyOffer}.`,
        instruction: `Prepare a ${nextUntestedAngle} variation using the current offer ${plan.keyOffer}.`,
        signature: "",
      },
      expectedImpact: "Keep the experimentation queue moving with the next best angle instead of waiting for manual ideation.",
      status: "auto_prepared",
      autoApply: true,
    });
  }

  if (suggestions.some((item) => item.type === "increase_budget_on_winner")) {
    const currentDailyBudget = Math.round(plan.monthlyBudget / 30);
    const proposedMonthlyBudget = Math.round(plan.monthlyBudget * 1.15);
    const proposedDailyBudget = Math.round(proposedMonthlyBudget / 30);

    pushCandidate({
      campaignId,
      actionType: "budget_adjustment",
      sourceReason: "Current delivery suggests the strongest message can support more spend.",
      proposedChange: {
        currentBudget: plan.monthlyBudget,
        currentDailyBudget,
        proposedDailyBudget,
        proposedMonthlyBudget,
        signature: "",
      },
      expectedImpact: "Prepare a controlled budget increase without applying it until approved.",
      status: "draft",
      autoApply: false,
    });
  }

  if (suggestions.some((item) => item.type === "adjust_targeting")) {
    pushCandidate({
      campaignId,
      actionType: "targeting_adjustment",
      sourceReason: "Campaign feedback suggests the audience needs a tighter local intent profile.",
      proposedChange: {
        currentAudience: plan.audience,
        proposedAudience: `${plan.audience} with stronger ${plan.market} intent`,
        signature: "",
      },
      expectedImpact: "Reduce wasted delivery by preparing a tighter targeting profile before it is applied.",
      status: "awaiting_approval",
      autoApply: false,
    });
  }

  if (drafts.length === 0) {
    return existingDrafts;
  }

  const latestCreated = existingDrafts[0]?.createdAt ?? null;
  if (latestCreated && isRecent(latestCreated, AUTO_PREP_COOLDOWN_MS)) {
    return existingDrafts;
  }

  const insertRows = drafts.map((draft) => ({
      organization_id: context.organization.id,
      user_id: context.user.id,
      campaign_id: draft.campaignId,
      action_type: draft.actionType,
      source_reason: draft.sourceReason,
      proposed_change: {
        ...draft.proposedChange,
        signature: draft.signature,
      } as Json,
      expected_impact: draft.expectedImpact,
      status: draft.status,
    }));
  const { data, error } = await supabase
    .from("campaign_draft_actions")
    .insert(insertRows as never)
    .select("*");

  if (error) {
    throw new ApiError(500, error.message, "campaign_draft_action_insert_failed");
  }

  const insertedDrafts = ((data ?? []) as Record<string, unknown>[]).map(mapDraft);
  await Promise.all(
    insertedDrafts.map((draft) =>
      writeDraftAuditLog({
        supabase,
        organizationId: context.organization.id,
        userId: context.user.id,
        draft,
        action: "created",
      }),
    ),
  );
  const recentAppliedSafe = existingDrafts.some(
    (item) =>
      item.status === "applied" &&
      isSafeAutoAction(item.actionType) &&
      isRecent(item.createdAt, AUTO_APPLY_COOLDOWN_MS),
  );
  const nextAutoApply = recentAppliedSafe
    ? null
    : insertedDrafts.find(
        (item) =>
          item.status === "auto_prepared" &&
          drafts.some(
            (candidate) =>
              candidate.autoApply &&
              candidate.signature === getDraftSignature(item),
          ),
      ) ?? null;

  if (nextAutoApply) {
    await autoApplySafeDraft({
      draft: nextAutoApply,
      supabase,
      organizationId: context.organization.id,
      userId: context.user.id,
    });
  }

  return getCampaignDraftActions();
}

export async function updateCampaignDraftActionStatus(params: {
  id: string;
  status: Extract<CampaignDraftActionStatus, "approved" | "dismissed">;
}) {
  const { context, supabase } = await getDraftContext();
  const { data: existingRow, error: existingError } = await supabase
    .from("campaign_draft_actions")
    .select("*")
    .eq("organization_id", context.organization.id)
    .eq("user_id", context.user.id)
    .eq("id", params.id)
    .maybeSingle();

  if (existingError) {
    throw new ApiError(500, existingError.message, "campaign_draft_action_fetch_failed");
  }

  if (!existingRow) {
    throw new ApiError(404, "Draft action was not found.", "campaign_draft_action_not_found");
  }

  const existingDraft = mapDraft(existingRow as unknown as Record<string, unknown>);

  if (params.status === "approved" && isSafeAutoAction(existingDraft.actionType)) {
    const applied = await autoApplySafeDraft({
      draft: existingDraft,
      supabase,
      organizationId: context.organization.id,
      userId: context.user.id,
    });

    if (applied) {
      await writeDraftAuditLog({
        supabase,
        organizationId: context.organization.id,
        userId: context.user.id,
        draft: applied.draft,
        action: "applied",
      });
      logInfo("Campaign draft action applied", {
        organizationId: context.organization.id,
        userId: context.user.id,
        draftId: applied.draft.id,
        actionType: applied.draft.actionType,
        campaignId: applied.draft.campaignId,
      });
      return applied.draft;
    }
  }

  const { data, error } = await supabase
    .from("campaign_draft_actions")
    .update({ status: params.status } as never)
    .eq("organization_id", context.organization.id)
    .eq("user_id", context.user.id)
    .eq("id", params.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "campaign_draft_action_update_failed");
  }

  if (!data) {
    throw new ApiError(404, "Draft action was not found.", "campaign_draft_action_not_found");
  }

  const updatedDraft = mapDraft(data as unknown as Record<string, unknown>);

  await writeDraftAuditLog({
    supabase,
    organizationId: context.organization.id,
    userId: context.user.id,
    draft: updatedDraft,
    action: params.status === "approved" ? "approved" : "dismissed",
  });

  return updatedDraft;
}
