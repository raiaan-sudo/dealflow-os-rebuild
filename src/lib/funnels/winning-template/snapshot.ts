import { buildWinningFunnel } from "@/lib/funnels/winning-template/build-winning-funnel";
import {
  WINNING_FUNNEL_TEMPLATE_ID,
  type WinningFunnelBlueprint,
} from "@/lib/funnels/winning-template/schema";
import { validateWinningFunnel } from "@/lib/funnels/winning-template/validation";
import type { FunnelEngineInput } from "@/lib/services/funnel-engine";

export type WinningFunnelStateSnapshot = {
  draftFunnel: WinningFunnelBlueprint;
  approvedFunnelSnapshot: WinningFunnelBlueprint | null;
  publishedFunnelSnapshot: WinningFunnelBlueprint | null;
  selectedLaunchPackage: unknown | null;
  draftUpdatedAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
};

export function createWinningFunnelDraft(input?: FunnelEngineInput | null) {
  return buildWinningFunnel(input);
}

export function createWinningFunnelState(input?: FunnelEngineInput | null): WinningFunnelStateSnapshot {
  return {
    draftFunnel: createWinningFunnelDraft(input),
    approvedFunnelSnapshot: null,
    publishedFunnelSnapshot: null,
    selectedLaunchPackage: null,
    draftUpdatedAt: new Date().toISOString(),
    approvedAt: null,
    publishedAt: null,
  };
}

export function approveWinningFunnelDraft(state: WinningFunnelStateSnapshot): WinningFunnelStateSnapshot {
  const validation = validateWinningFunnel(state.draftFunnel);

  if (!validation.ok) {
    throw new Error(`Cannot approve invalid winning funnel: ${validation.blockers.join(", ")}`);
  }

  return {
    ...state,
    approvedFunnelSnapshot: structuredClone(state.draftFunnel),
    approvedAt: new Date().toISOString(),
  };
}

export function publishApprovedWinningFunnel(state: WinningFunnelStateSnapshot): WinningFunnelStateSnapshot {
  if (!state.approvedFunnelSnapshot || state.approvedFunnelSnapshot.funnelTemplateId !== WINNING_FUNNEL_TEMPLATE_ID) {
    throw new Error("Cannot publish without an approved winning funnel snapshot.");
  }

  return {
    ...state,
    publishedFunnelSnapshot: structuredClone(state.approvedFunnelSnapshot),
    publishedAt: new Date().toISOString(),
  };
}

export function winningFunnelSnapshotsMatch(params: {
  approvedFunnelSnapshot: unknown;
  publishedFunnelSnapshot: unknown;
}) {
  return JSON.stringify(params.approvedFunnelSnapshot) === JSON.stringify(params.publishedFunnelSnapshot);
}
