export type AutonomyMode = "manual" | "assisted" | "auto" | "autonomous" | (string & {});

export type SystemStatus =
  | "healthy"
  | "degraded"
  | "offline"
  | "idle"
  | "paused"
  | "optimizing"
  | (string & {});

export type AutonomyExecutionType =
  | "manual_recommendation"
  | "assisted_approval_required"
  | "autopilot_safe_action"
  | "high_impact_approval_required";

export type AutonomyActionStatus =
  | "recommended"
  | "staged"
  | "eligible"
  | "applied"
  | "blocked"
  | "skipped";

export type AutonomyActionCandidate = {
  actionKey: string;
  title: string;
  reason: string;
  targetMarket?: string | null;
  actionType: string;
  confidenceScore: number;
  score?: number;
  budgetChangePercent: number;
  blockedReason?: string | null;
  executionType?: AutonomyExecutionType;
  status?: AutonomyActionStatus;
  idempotencyKey?: string;
  lockKey?: string;
  customerExplanation?: string;
  auditSummary?: string;
  approvalRequired?: boolean;
  rollbackRequired?: boolean;
};

export type AutonomyFeedEntry = {
  id: string;
  title: string;
  reason: string;
  status: string;
  executionMode: AutonomyMode;
  targetMarket?: string | null;
  createdAt: string;
  expectedOutcome?: {
    summary: string;
    leadVolumeChange: number;
    appointmentRateChange: number;
    revenueDelta: number;
  } | null;
  actualOutcome?: {
    summary?: string;
    leadVolumeChange?: number;
    appointmentRateChange?: number;
    revenueDelta?: number;
  } | null;
  guardrailSummary?: {
    mutationId?: string;
    mode?: string;
    blockedReason?: string;
    reason?: string;
    applied?: boolean;
  } | null;
};

export type AutonomySnapshot = {
  mode: AutonomyMode;
  systemStatus?: SystemStatus;
  pendingActions?: AutonomyActionCandidate[];
  recentActions?: AutonomyFeedEntry[];
  executionSyncedAt?: string | null;
  queuedCount?: number;
  appliedCount?: number;
  blockedCount?: number;
  alert?: string | null;
};
