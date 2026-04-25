export type AutonomyMode = "manual" | "assisted" | "auto" | (string & {});

export type SystemStatus = "healthy" | "degraded" | "offline" | "idle" | (string & {});

export type AutonomyActionCandidate = {
  actionKey: string;
  title: string;
  reason: string;
  targetMarket?: string | null;
  actionType: string;
  confidenceScore: number;
  budgetChangePercent: number;
  blockedReason?: string | null;
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
};
