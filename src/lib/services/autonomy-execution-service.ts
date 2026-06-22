import { createHash } from "node:crypto";
import type {
  AutonomyActionCandidate,
  AutonomyActionStatus,
  AutonomyExecutionType,
  AutonomyMode,
} from "@/lib/services/autonomy-engine";

export const AUTONOMY_EXECUTION_ENABLED_ENV = "AUTONOMY_EXECUTION_ENABLED";
export const AUTOPILOT_SAFE_ACTIONS_ENV = "AUTONOMY_AUTOPILOT_ENABLED";
export const AUTONOMY_META_MUTATIONS_ENABLED_ENV = "AUTONOMY_META_MUTATIONS_ENABLED";
export const AUTONOMY_DRY_RUN_ONLY_ENV = "AUTONOMY_DRY_RUN_ONLY";

export type AutonomyActionClassification =
  | "manual"
  | "assisted"
  | "autopilot_safe"
  | "high_impact";

export type AutonomyExecutionMetrics = {
  ctr: number;
  cpc: number;
  cpl: number;
  frequency: number;
  spend: number;
  leads: number;
  lp_cvr: number;
  leadQualityScore?: number | null;
};

export type AutonomyCampaignExecutionContext = {
  organizationId: string;
  campaignId: string;
  campaignName: string;
  targetMarket?: string | null;
  monthlyBudget: number;
  currentDailyBudgetCents?: number | null;
  dailyBudgetCapCents?: number | null;
};

export type AutonomyExecutionEnvironment = Record<string, string | undefined>;

export type AutonomyLockInput = {
  lockKey: string;
  lockedUntil: string;
};

export type AutonomyIdempotencyInput = {
  idempotencyKey: string;
  status: "started" | "applied" | "blocked" | "failed";
};

export type AutonomyBudgetGuard = {
  currentDailyBudgetCents: number;
  proposedDailyBudgetCents: number;
  dailyBudgetCapCents: number | null;
  withinCap: boolean;
  reason: string | null;
};

export type AutonomyRollbackRecord = {
  rollbackKey: string;
  idempotencyKey: string;
  actionKey: string;
  campaignId: string;
  requiredBeforeMutation: true;
  writtenBeforeMutation: boolean;
  payload: {
    previousState: Record<string, unknown>;
    proposedState: Record<string, unknown>;
    rollbackNotes: string;
  };
  createdAt: string;
};

export type AutonomyActionAuditLog = {
  idempotencyKey: string;
  actionKey: string;
  status: AutonomyActionStatus;
  classification: AutonomyActionClassification;
  executionType: AutonomyExecutionType;
  customerExplanation: string;
  auditSummary: string;
  reason: string;
  createdAt: string;
};

export type AutonomyLockRecord = {
  lockKey: string;
  idempotencyKey: string;
  campaignId: string;
  actionKey: string;
  status: "acquired" | "blocked";
  lockedUntil: string;
  reason: string | null;
};

export type AutonomyIdempotencyRecord = {
  idempotencyKey: string;
  campaignId: string;
  actionKey: string;
  actionPayloadHash: string;
  status: "planned" | "started" | "applied" | "blocked" | "skipped";
  createdAt: string;
};

export type ClosedLoopAutonomyAction = AutonomyActionCandidate & {
  classification: AutonomyActionClassification;
  executionType: AutonomyExecutionType;
  status: AutonomyActionStatus;
  score: number;
  idempotencyKey: string;
  lockKey: string;
  budgetGuard: AutonomyBudgetGuard;
  rollback: AutonomyRollbackRecord;
  customerExplanation: string;
  auditSummary: string;
  approvalRequired: boolean;
  rollbackRequired: boolean;
  leadQualityInfluence: {
    leadQualityScore: number | null;
    scoreDelta: number;
    reason: string;
  };
};

export type AutonomyExecutionPlan = {
  runKey: string;
  mode: AutonomyMode;
  generatedAt: string;
  campaign: AutonomyCampaignExecutionContext;
  executionQueue: ClosedLoopAutonomyAction[];
  appliedExecutionActions: ClosedLoopAutonomyAction[];
  blockedExecutionActions: ClosedLoopAutonomyAction[];
  auditLogs: AutonomyActionAuditLog[];
  rollbacks: AutonomyRollbackRecord[];
  locks: AutonomyLockRecord[];
  idempotencyRecords: AutonomyIdempotencyRecord[];
  customerExplanations: string[];
  alert: string | null;
};

export type SyntheticAutonomyMutationAdapter = {
  applySafeAction: (action: ClosedLoopAutonomyAction) => Promise<{
    mutationId: string;
    applied: boolean;
    mode: "synthetic";
    summary?: string;
  }>;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

function sha256Short(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 24);
}

function safeNumber(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function envEnabled(env: AutonomyExecutionEnvironment, key: string) {
  return /^(1|true|yes|on)$/i.test(env[key]?.trim() ?? "");
}

export function isAutopilotSafeActionsEnabled(env: AutonomyExecutionEnvironment = process.env) {
  if (env[AUTONOMY_DRY_RUN_ONLY_ENV] !== "false") {
    return false;
  }

  return (
    envEnabled(env, AUTONOMY_EXECUTION_ENABLED_ENV) &&
    envEnabled(env, AUTOPILOT_SAFE_ACTIONS_ENV)
  );
}

export function classifyAutonomyAction(action: Pick<AutonomyActionCandidate, "actionType" | "budgetChangePercent" | "title">): AutonomyActionClassification {
  const actionText = `${action.actionType} ${action.title}`.toLowerCase();
  const budgetDelta = safeNumber(action.budgetChangePercent);

  if (
    budgetDelta > 0 ||
    /\b(scale|increase|launch|provider|credits|audience|ad set|targeting|publish|new ad|duplicate|switch funnel|sms|stripe|billing|delete)\b/.test(actionText)
  ) {
    return "high_impact";
  }

  if (budgetDelta < 0 || /\b(monitor|snapshot|learning_memory|learning memory|observe|report|pause|reduce|alert|classify|winner|loser|inconclusive)\b/.test(actionText)) {
    return "autopilot_safe";
  }

  if (/\b(creative|headline|targeting|duplicate|refresh|test|iterate|funnel)\b/.test(actionText)) {
    return "assisted";
  }

  return "manual";
}

function executionTypeForClassification(classification: AutonomyActionClassification): AutonomyExecutionType {
  if (classification === "high_impact") return "high_impact_approval_required";
  if (classification === "assisted") return "assisted_approval_required";
  if (classification === "autopilot_safe") return "autopilot_safe_action";
  return "manual_recommendation";
}

function currentDailyBudgetCents(campaign: AutonomyCampaignExecutionContext) {
  const explicit = safeNumber(campaign.currentDailyBudgetCents ?? null, 0);
  if (explicit > 0) return Math.round(explicit);

  return Math.round(Math.max(0, campaign.monthlyBudget) / 30 * 100);
}

function buildBudgetGuard(
  action: AutonomyActionCandidate,
  campaign: AutonomyCampaignExecutionContext,
): AutonomyBudgetGuard {
  const current = currentDailyBudgetCents(campaign);
  const budgetDelta = safeNumber(action.budgetChangePercent);
  const proposed = Math.max(0, Math.round(current * (1 + budgetDelta / 100)));
  const cap = campaign.dailyBudgetCapCents == null ? null : Math.max(0, Math.round(campaign.dailyBudgetCapCents));

  if (budgetDelta <= 0) {
    return {
      currentDailyBudgetCents: current,
      proposedDailyBudgetCents: proposed,
      dailyBudgetCapCents: cap,
      withinCap: true,
      reason: null,
    };
  }

  if (cap === null || cap <= 0) {
    return {
      currentDailyBudgetCents: current,
      proposedDailyBudgetCents: proposed,
      dailyBudgetCapCents: cap,
      withinCap: false,
      reason: "Budget increases require a configured daily cap before staging or execution.",
    };
  }

  return {
    currentDailyBudgetCents: current,
    proposedDailyBudgetCents: proposed,
    dailyBudgetCapCents: cap,
    withinCap: proposed <= cap,
    reason: proposed <= cap ? null : "Proposed daily budget would exceed the configured cap.",
  };
}

function leadQualityInfluence(metrics: AutonomyExecutionMetrics) {
  const leadQualityScore =
    metrics.leadQualityScore == null || !Number.isFinite(metrics.leadQualityScore)
      ? null
      : clamp(Number(metrics.leadQualityScore), 0, 1);

  if (leadQualityScore === null) {
    return {
      leadQualityScore,
      scoreDelta: 0,
      reason: "No lead quality signal is available yet.",
    };
  }

  if (leadQualityScore >= 0.75) {
    return {
      leadQualityScore,
      scoreDelta: 8,
      reason: "Recent leads are high quality, so confidence receives a positive adjustment.",
    };
  }

  if (leadQualityScore < 0.5) {
    return {
      leadQualityScore,
      scoreDelta: -18,
      reason: "Recent leads are low quality, so scale and automation confidence is reduced.",
    };
  }

  return {
    leadQualityScore,
    scoreDelta: -4,
    reason: "Lead quality is mixed, so confidence is slightly reduced.",
  };
}

function buildActionPayload(action: AutonomyActionCandidate, campaign: AutonomyCampaignExecutionContext, budgetGuard: AutonomyBudgetGuard) {
  return {
    actionKey: action.actionKey,
    actionType: action.actionType,
    title: action.title,
    campaignId: campaign.campaignId,
    organizationId: campaign.organizationId,
    targetMarket: action.targetMarket ?? campaign.targetMarket ?? null,
    budgetChangePercent: action.budgetChangePercent,
    currentDailyBudgetCents: budgetGuard.currentDailyBudgetCents,
    proposedDailyBudgetCents: budgetGuard.proposedDailyBudgetCents,
  };
}

export function buildAutonomyIdempotencyKey(params: {
  organizationId: string;
  campaignId: string;
  actionKey: string;
  actionType: string;
  payload: Record<string, unknown>;
}) {
  const payloadHash = sha256Short(params.payload);
  return [
    "autonomy",
    params.organizationId,
    params.campaignId,
    params.actionType,
    params.actionKey,
    payloadHash,
  ].join(":");
}

function lockKeyFor(campaign: AutonomyCampaignExecutionContext, action: AutonomyActionCandidate) {
  return ["autonomy", campaign.organizationId, campaign.campaignId, action.actionType, action.actionKey].join(":");
}

function isActiveLock(lock: AutonomyLockInput, nowMs: number) {
  const parsed = Date.parse(lock.lockedUntil);
  return Number.isFinite(parsed) && parsed > nowMs;
}

function customerExplanationFor(action: AutonomyActionCandidate, executionType: AutonomyExecutionType, status: AutonomyActionStatus) {
  if (executionType === "high_impact_approval_required") {
    return `${action.title} is staged for approval because it can affect spend, delivery, or campaign availability.`;
  }

  if (executionType === "assisted_approval_required") {
    return `${action.title} is prepared as an assisted optimization and waits for operator approval before any customer-facing change.`;
  }

  if (executionType === "autopilot_safe_action" && status === "eligible") {
    return `${action.title} is eligible for autopilot because it only updates internal learning, reporting, or monitoring state.`;
  }

  if (executionType === "autopilot_safe_action" && status === "blocked") {
    return `${action.title} was not executed because autopilot safe-action execution is disabled or blocked by a guardrail.`;
  }

  return `${action.title} remains a manual recommendation for review.`;
}

function auditSummaryFor(action: AutonomyActionCandidate, classification: AutonomyActionClassification, status: AutonomyActionStatus) {
  return `Autonomy classified ${action.actionKey} as ${classification}; final planned status is ${status}.`;
}

function statusFor(params: {
  mode: AutonomyMode;
  classification: AutonomyActionClassification;
  autopilotEnabled: boolean;
  blockedReason: string | null;
}) {
  if (params.blockedReason) return "blocked" as const;
  if (params.mode === "manual") return "recommended" as const;
  if (params.classification === "high_impact" || params.classification === "assisted") return "staged" as const;
  if (params.classification === "autopilot_safe") {
    if ((params.mode === "auto" || params.mode === "autonomous") && params.autopilotEnabled) return "eligible" as const;
    if (params.mode === "auto" || params.mode === "autonomous") return "blocked" as const;
    return "recommended" as const;
  }

  return "recommended" as const;
}

function blockedReasonFor(params: {
  action: AutonomyActionCandidate;
  classification: AutonomyActionClassification;
  mode: AutonomyMode;
  metrics: AutonomyExecutionMetrics;
  budgetGuard: AutonomyBudgetGuard;
  activeLock: boolean;
  idempotencyHit: AutonomyIdempotencyInput | null;
  autopilotEnabled: boolean;
}) {
  if (params.action.blockedReason) return params.action.blockedReason;
  if (params.activeLock) return "An active autonomy lock already exists for this campaign action.";
  if (params.idempotencyHit?.status === "applied") return "This autonomy action was already applied with the same idempotency key.";
  if (params.budgetGuard.reason) return params.budgetGuard.reason;

  const leadQualityScore = params.metrics.leadQualityScore;
  if (
    params.classification === "high_impact" &&
    safeNumber(params.action.budgetChangePercent) > 0 &&
    leadQualityScore != null &&
    Number.isFinite(leadQualityScore) &&
    Number(leadQualityScore) < 0.65
  ) {
    return "Budget increases require lead quality of at least 0.65 before they can be staged.";
  }

  if (
    params.classification === "autopilot_safe" &&
    (params.mode === "auto" || params.mode === "autonomous") &&
    !params.autopilotEnabled
  ) {
    return `Customer Autopilot settings plus ${AUTONOMY_EXECUTION_ENABLED_ENV}=true, ${AUTOPILOT_SAFE_ACTIONS_ENV}=true, and ${AUTONOMY_DRY_RUN_ONLY_ENV}=false are required before autopilot safe actions can execute.`;
  }

  return null;
}

export function buildAutonomyExecutionPlan(params: {
  mode: AutonomyMode;
  campaign: AutonomyCampaignExecutionContext;
  metrics: AutonomyExecutionMetrics;
  candidates: AutonomyActionCandidate[];
  env?: AutonomyExecutionEnvironment;
  customerAutopilotEnabled?: boolean;
  now?: Date;
  existingLocks?: AutonomyLockInput[];
  existingIdempotencyRecords?: AutonomyIdempotencyInput[];
}): AutonomyExecutionPlan {
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const lockUntil = new Date(nowMs + 10 * 60 * 1000).toISOString();
  const autopilotEnabled = isAutopilotSafeActionsEnabled(params.env ?? process.env);
  const customerAutopilotEnabled = params.customerAutopilotEnabled === true;
  const qualityInfluence = leadQualityInfluence(params.metrics);
  const existingLocks = params.existingLocks ?? [];
  const existingIdempotencyRecords = params.existingIdempotencyRecords ?? [];
  const actions: ClosedLoopAutonomyAction[] = [];
  const locks: AutonomyLockRecord[] = [];
  const idempotencyRecords: AutonomyIdempotencyRecord[] = [];
  const rollbacks: AutonomyRollbackRecord[] = [];
  const auditLogs: AutonomyActionAuditLog[] = [];

  for (const candidate of params.candidates) {
    const classification = classifyAutonomyAction(candidate);
    const executionType = executionTypeForClassification(classification);
    const budgetGuard = buildBudgetGuard(candidate, params.campaign);
    const payload = buildActionPayload(candidate, params.campaign, budgetGuard);
    const idempotencyKey = buildAutonomyIdempotencyKey({
      organizationId: params.campaign.organizationId,
      campaignId: params.campaign.campaignId,
      actionKey: candidate.actionKey,
      actionType: candidate.actionType,
      payload,
    });
    const lockKey = lockKeyFor(params.campaign, candidate);
    const activeLock = existingLocks.some((lock) => lock.lockKey === lockKey && isActiveLock(lock, nowMs));
    const idempotencyHit =
      existingIdempotencyRecords.find((record) => record.idempotencyKey === idempotencyKey) ?? null;
    const blockedReason = blockedReasonFor({
      action: candidate,
      classification,
      mode: params.mode,
      metrics: params.metrics,
      budgetGuard,
      activeLock,
      idempotencyHit,
      autopilotEnabled: autopilotEnabled && customerAutopilotEnabled,
    });
    const status = statusFor({
      mode: params.mode,
      classification,
      autopilotEnabled: autopilotEnabled && customerAutopilotEnabled,
      blockedReason,
    });
    const score = clamp(Math.round(safeNumber(candidate.confidenceScore) * 100 + qualityInfluence.scoreDelta), 0, 100);
    const customerExplanation = customerExplanationFor(candidate, executionType, status);
    const auditSummary = auditSummaryFor(candidate, classification, status);
    const rollback: AutonomyRollbackRecord = {
      rollbackKey: `rollback:${idempotencyKey}`,
      idempotencyKey,
      actionKey: candidate.actionKey,
      campaignId: params.campaign.campaignId,
      requiredBeforeMutation: true,
      writtenBeforeMutation: status === "eligible",
      payload: {
        previousState: {
          dailyBudgetCents: budgetGuard.currentDailyBudgetCents,
          actionStatus: "before_autonomy_action",
        },
        proposedState: payload,
        rollbackNotes:
          "Rollback must restore the previous in-app planning state before any external provider mutation is attempted. Real Meta, SMS, Stripe, or provider calls are not performed by this service.",
      },
      createdAt: nowIso,
    };
    const closedLoopAction: ClosedLoopAutonomyAction = {
      ...candidate,
      classification,
      executionType,
      status,
      score,
      confidenceScore: score / 100,
      idempotencyKey,
      lockKey,
      budgetGuard,
      rollback,
      customerExplanation,
      auditSummary,
      approvalRequired:
        executionType === "assisted_approval_required" || executionType === "high_impact_approval_required",
      rollbackRequired: true,
      blockedReason,
      leadQualityInfluence: qualityInfluence,
    };

    actions.push(closedLoopAction);
    rollbacks.push(rollback);
    locks.push({
      lockKey,
      idempotencyKey,
      campaignId: params.campaign.campaignId,
      actionKey: candidate.actionKey,
      status: activeLock ? "blocked" : "acquired",
      lockedUntil: lockUntil,
      reason: activeLock ? "Existing active lock blocks duplicate work." : null,
    });
    idempotencyRecords.push({
      idempotencyKey,
      campaignId: params.campaign.campaignId,
      actionKey: candidate.actionKey,
      actionPayloadHash: sha256Short(payload),
      status:
        idempotencyHit?.status === "applied"
          ? "skipped"
          : status === "eligible"
            ? "started"
            : status === "blocked"
              ? "blocked"
              : "planned",
      createdAt: nowIso,
    });
    auditLogs.push({
      idempotencyKey,
      actionKey: candidate.actionKey,
      status,
      classification,
      executionType,
      customerExplanation,
      auditSummary,
      reason: blockedReason ?? candidate.reason,
      createdAt: nowIso,
    });
  }

  const executionQueue = actions.filter((action) => action.status === "recommended" || action.status === "staged" || action.status === "eligible");
  const blockedExecutionActions = actions.filter((action) => action.status === "blocked" || action.status === "skipped");

  return {
    runKey: `autonomy-run:${params.campaign.organizationId}:${params.campaign.campaignId}:${sha256Short({ now: nowIso, candidates: actions.map((action) => action.idempotencyKey) })}`,
    mode: params.mode,
    generatedAt: nowIso,
    campaign: params.campaign,
    executionQueue,
    appliedExecutionActions: [],
    blockedExecutionActions,
    auditLogs,
    rollbacks,
    locks,
    idempotencyRecords,
    customerExplanations: auditLogs.map((log) => log.customerExplanation),
    alert: blockedExecutionActions.length > 0 ? "One or more autonomy actions were blocked by guardrails." : null,
  };
}

export async function executeAutonomyPlanWithSyntheticAdapter(
  plan: AutonomyExecutionPlan,
  adapter: SyntheticAutonomyMutationAdapter,
): Promise<AutonomyExecutionPlan> {
  const applied: ClosedLoopAutonomyAction[] = [];
  const blocked = [...plan.blockedExecutionActions];
  const queued: ClosedLoopAutonomyAction[] = [];
  const auditLogs = [...plan.auditLogs];
  const idempotencyRecords = [...plan.idempotencyRecords];

  for (const action of plan.executionQueue) {
    if (action.status !== "eligible") {
      queued.push(action);
      continue;
    }

    if (!action.rollback.writtenBeforeMutation) {
      const blockedAction = {
        ...action,
        status: "blocked" as const,
        blockedReason: "Rollback payload was not written before mutation.",
      };
      blocked.push(blockedAction);
      auditLogs.push({
        idempotencyKey: action.idempotencyKey,
        actionKey: action.actionKey,
        status: "blocked",
        classification: action.classification,
        executionType: action.executionType,
        customerExplanation: "Autopilot stopped before mutation because rollback evidence was missing.",
        auditSummary: "Rollback-before-mutation guard blocked execution.",
        reason: blockedAction.blockedReason,
        createdAt: new Date().toISOString(),
      });
      continue;
    }

    const result = await adapter.applySafeAction(action);
    const appliedAction = {
      ...action,
      status: result.applied ? ("applied" as const) : ("blocked" as const),
      blockedReason: result.applied ? null : "Synthetic adapter declined the safe action.",
    };

    if (result.applied) {
      applied.push(appliedAction);
    } else {
      blocked.push(appliedAction);
    }

    idempotencyRecords.push({
      idempotencyKey: action.idempotencyKey,
      campaignId: action.rollback.campaignId,
      actionKey: action.actionKey,
      actionPayloadHash: sha256Short(action.rollback.payload.proposedState),
      status: result.applied ? "applied" : "blocked",
      createdAt: new Date().toISOString(),
    });
    auditLogs.push({
      idempotencyKey: action.idempotencyKey,
      actionKey: action.actionKey,
      status: appliedAction.status,
      classification: action.classification,
      executionType: action.executionType,
      customerExplanation: result.summary ?? action.customerExplanation,
      auditSummary: `Synthetic mutation ${result.mutationId} completed with applied=${result.applied}.`,
      reason: action.reason,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    ...plan,
    executionQueue: queued,
    appliedExecutionActions: applied,
    blockedExecutionActions: blocked,
    auditLogs,
    idempotencyRecords,
    alert: blocked.length > 0 ? "One or more autonomy actions were blocked by guardrails." : plan.alert,
  };
}
