export type ClosedLoopAutonomyAction = {
  actionKey: string;
  title: string;
  reason: string;
  targetMarket?: string | null;
  actionType: string;
  confidenceScore: number;
  budgetChangePercent: number;
  blockedReason?: string | null;
};
