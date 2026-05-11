// @ts-nocheck
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill, getStatusTone } from "@/components/ui/status-pill";
import { formatCompactCurrency, formatDate } from "@/lib/formatters";
import type {
  AutonomyActionCandidate,
  AutonomyFeedEntry,
  AutonomyMode,
} from "@/lib/services/autonomy-engine";
import type { ClosedLoopAutonomyAction } from "@/lib/services/autonomy-execution-service";

type AutonomyActionsFeedProps = {
  mode: AutonomyMode;
  pendingActions: AutonomyActionCandidate[];
  recentActions: AutonomyFeedEntry[];
  executionQueue: ClosedLoopAutonomyAction[];
  appliedExecutionActions: ClosedLoopAutonomyAction[];
  blockedExecutionActions: ClosedLoopAutonomyAction[];
};

function formatDelta(value: number, suffix = "") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${suffix}`;
}

function getExecutionQueueLabel(mode: AutonomyMode) {
  if (mode === "assisted") {
    return "staged";
  }

  if (mode === "manual") {
    return "queued";
  }

  return "planned";
}

function getExecutionQueueCopy(mode: AutonomyMode) {
  if (mode === "assisted") {
    return "These execution actions are staged for operator approval.";
  }

  if (mode === "manual") {
    return "These execution actions were planned, but nothing will run until an operator approves it.";
  }

  return "These execution actions were generated from the latest sync cycle and are eligible to run automatically.";
}

function formatExecutionModeLabel(mode?: string | null) {
  if (!mode) {
    return null;
  }

  if (mode === "sandbox" || mode === "test") {
    return "test mode";
  }

  if (mode === "live") {
    return "live mode";
  }

  return mode.replace(/[_-]+/g, " ");
}

function renderExecutionAction(
  action: ClosedLoopAutonomyAction,
  label: string,
) {
  return (
    <div
      key={action.actionKey}
      className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{action.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {action.targetMarket ?? "Portfolio-wide"} • {action.actionType.replaceAll("_", " ")}
          </p>
        </div>
        <StatusPill tone={getStatusTone(label)}>{label}</StatusPill>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{action.reason}</p>
      {action.blockedReason ? (
        <div className="mt-3 rounded-[18px] border border-rose-400/20 bg-rose-400/10 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-100">
            Why it was blocked
          </p>
          <p className="mt-2 text-sm leading-6 text-rose-100/90">{action.blockedReason}</p>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>Confidence {(action.confidenceScore * 100).toFixed(0)}%</span>
        {action.budgetChangePercent > 0 ? (
          <span>Budget +{action.budgetChangePercent}%</span>
        ) : null}
      </div>
    </div>
  );
}

function renderRecentEntry(entry: AutonomyFeedEntry) {
  const actualOutcomeSummary =
    typeof entry.actualOutcome?.summary === "string" ? entry.actualOutcome.summary : null;
  const actualOutcomeLeadChange =
    typeof entry.actualOutcome?.leadVolumeChange === "number" ? entry.actualOutcome.leadVolumeChange : null;
  const actualOutcomeAppointmentRateChange =
    typeof entry.actualOutcome?.appointmentRateChange === "number"
      ? entry.actualOutcome.appointmentRateChange
      : null;
  const actualOutcomeRevenueDelta =
    typeof entry.actualOutcome?.revenueDelta === "number" ? entry.actualOutcome.revenueDelta : null;
  const providerMutationId =
    typeof entry.guardrailSummary?.mutationId === "string" ? entry.guardrailSummary.mutationId : null;
  const executionMode =
    typeof entry.guardrailSummary?.mode === "string"
      ? formatExecutionModeLabel(entry.guardrailSummary.mode)
      : null;
  const blockedReason =
    typeof entry.guardrailSummary?.blockedReason === "string"
      ? entry.guardrailSummary.blockedReason
      : typeof entry.guardrailSummary?.reason === "string" && entry.status === "blocked"
        ? entry.guardrailSummary.reason
        : null;

  return (
    <div
      key={entry.id}
      className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{entry.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {entry.targetMarket ?? "Portfolio-wide"} • {formatDate(entry.createdAt)} •{" "}
            {entry.executionMode}
          </p>
        </div>
        <StatusPill tone={getStatusTone(entry.status)}>{entry.status}</StatusPill>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{entry.reason}</p>
      {blockedReason ? (
        <div className="mt-3 rounded-[18px] border border-rose-400/20 bg-rose-400/10 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-100">
            Blocked because
          </p>
          <p className="mt-2 text-sm leading-6 text-rose-100/90">{blockedReason}</p>
        </div>
      ) : null}
      {entry.expectedOutcome ? (
        <div className="mt-4 rounded-[18px] border border-white/8 bg-black/20 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Expected outcome
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground/88">
            {entry.expectedOutcome.summary}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {formatDelta(entry.expectedOutcome.leadVolumeChange, " leads")} •{" "}
            {formatDelta(entry.expectedOutcome.appointmentRateChange, "pp appt")} •{" "}
            {formatCompactCurrency(entry.expectedOutcome.revenueDelta)}
          </p>
        </div>
      ) : null}
      {entry.actualOutcome ? (
        <div className="mt-3 rounded-[18px] border border-primary/12 bg-primary/8 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/80">
            {actualOutcomeSummary ? "Actual outcome" : "Execution result"}
          </p>
          {actualOutcomeSummary ? (
            <>
              <p className="mt-2 text-sm leading-6 text-foreground/88">
                {actualOutcomeSummary}
              </p>
              {actualOutcomeLeadChange !== null &&
              actualOutcomeAppointmentRateChange !== null &&
              actualOutcomeRevenueDelta !== null ? (
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {formatDelta(actualOutcomeLeadChange, " leads")} •{" "}
                  {formatDelta(actualOutcomeAppointmentRateChange, "pp appt")} •{" "}
                  {formatCompactCurrency(actualOutcomeRevenueDelta)}
                </p>
              ) : null}
            </>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {executionMode ? <span>{executionMode}</span> : null}
              {providerMutationId ? <span>Update {providerMutationId}</span> : null}
              {typeof entry.guardrailSummary?.applied === "boolean" ? (
                <span>{entry.guardrailSummary.applied ? "applied" : "not applied"}</span>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AutonomyActionsFeed({
  mode,
  pendingActions,
  recentActions,
  executionQueue,
  appliedExecutionActions,
  blockedExecutionActions,
}: AutonomyActionsFeedProps) {
  const queueLabel = getExecutionQueueLabel(mode);

  if (
    recentActions.length === 0 &&
    pendingActions.length === 0 &&
    executionQueue.length === 0 &&
    appliedExecutionActions.length === 0 &&
    blockedExecutionActions.length === 0
  ) {
    return (
      <EmptyState
        title="No autonomous activity yet"
        description="Once the system evaluates live performance, recommendations, staged actions, executed actions, and blocked actions will appear here."
      />
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Autonomous execution
          </p>
          <p className="mt-1 text-lg font-semibold tracking-[-0.03em]">
            What the system recommended, staged, executed, and blocked
          </p>
        </div>
      </div>

      {pendingActions.length > 0 ? (
        <div className="mt-5 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Recommended
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Operator guidance from the intelligence layer before execution decisions are applied.
            </p>
          </div>
          {pendingActions.slice(0, 3).map((action) => (
            <div
              key={action.actionKey}
              className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{action.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {action.targetMarket ?? "Portfolio-wide"} • {action.executionType}
                  </p>
                </div>
                <StatusPill tone="info">recommended</StatusPill>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{action.reason}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Expected {formatDelta(action.expectedOutcome.leadVolumeChange, " leads")} •{" "}
                {formatDelta(action.expectedOutcome.appointmentRateChange, "pp appt")} •{" "}
                {formatCompactCurrency(action.expectedOutcome.revenueDelta)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {executionQueue.length > 0 ? (
        <div className="mt-6 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Execution queue
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{getExecutionQueueCopy(mode)}</p>
          </div>
          {executionQueue.slice(0, 4).map((action) => renderExecutionAction(action, queueLabel))}
        </div>
      ) : null}

      {appliedExecutionActions.length > 0 ? (
        <div className="mt-6 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Executed
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Actions the ad platform actually applied.
            </p>
          </div>
          {appliedExecutionActions.slice(0, 4).map((action) => renderExecutionAction(action, "executed"))}
        </div>
      ) : null}

      {blockedExecutionActions.length > 0 ? (
        <div className="mt-6 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Blocked
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Actions the system refused to run because of guardrails, duplicate protection, or missing ad platform state.
            </p>
          </div>
          {blockedExecutionActions.slice(0, 4).map((action) => renderExecutionAction(action, "blocked"))}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Action history
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Logged outcomes across staged, executed, blocked, and reverted actions.
          </p>
        </div>
        {recentActions.slice(0, 8).map(renderRecentEntry)}
      </div>
    </Card>
  );
}
