"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import type { BillingPlanTier } from "@/lib/billing/plans";
import type { AutonomyMode, SystemStatus } from "@/lib/services/autonomy-engine";

type AutonomyModeControlProps = {
  campaignId?: string | null;
  mode: AutonomyMode;
  systemStatus: SystemStatus;
  alert: string | null;
  executionSyncedAt: string | null;
  queuedCount: number;
  appliedCount: number;
  blockedCount: number;
  planTier?: BillingPlanTier;
  autonomyEntitled?: boolean;
};

const modes: Array<{
  value: AutonomyMode;
  label: string;
  description: string;
  requiresAutonomyAccess: boolean;
}> = [
  {
    value: "manual",
    label: "Off / manual recommendations",
    description: "DealFlow recommends changes only. Nothing is approved or executed by the system.",
    requiresAutonomyAccess: false,
  },
  {
    value: "assisted",
    label: "Assisted approval",
    description: "High-confidence actions are staged for operator approval before any execution.",
    requiresAutonomyAccess: true,
  },
  {
    value: "auto",
    label: "Autopilot safe actions",
    description: "Only guardrailed safe actions can run; budget and rollback checks still apply.",
    requiresAutonomyAccess: true,
  },
];

export function AutonomyModeControl({
  campaignId = null,
  mode,
  systemStatus,
  alert,
  executionSyncedAt,
  queuedCount,
  appliedCount,
  blockedCount,
  planTier = "starter",
  autonomyEntitled = false,
}: AutonomyModeControlProps) {
  const router = useRouter();
  const [pendingMode, setPendingMode] = useState<AutonomyMode | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const canEnableExecution = planTier !== "starter" && autonomyEntitled;
  const canRunCycle =
    canEnableExecution && (mode === "assisted" || mode === "auto" || mode === "autonomous");
  const entitlementCopy =
    planTier === "starter"
      ? "Starter can review recommendations, but cannot enable execution modes."
      : autonomyEntitled
        ? "This workspace is entitled to assisted and Autopilot controls."
        : "Assisted and Autopilot controls stay hidden or locked until Pro autonomy is entitled.";

  async function updateMode(nextMode: AutonomyMode) {
    setPendingMode(nextMode);

    try {
      await fetch("/api/autonomy", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: nextMode, ...(campaignId ? { campaignId } : {}) }),
      });
    } finally {
      setPendingMode(null);
      router.refresh();
    }
  }

  async function runCycle() {
    setIsRunning(true);

    try {
      await fetch("/api/autonomy/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode, ...(campaignId ? { campaignId } : {}) }),
      });
    } finally {
      setIsRunning(false);
      router.refresh();
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Autonomous optimization
          </p>
          <p className="mt-1 text-lg font-semibold tracking-[-0.03em]">
            Mode and system status
          </p>
        </div>
        <StatusPill
          tone={
            systemStatus === "paused"
              ? "danger"
              : systemStatus === "optimizing"
                ? "warning"
                : "success"
          }
        >
          {systemStatus}
        </StatusPill>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {modes.map((item) => {
          const locked = item.requiresAutonomyAccess && !canEnableExecution;

          return (
            <Button
              key={item.value}
              disabled={pendingMode !== null || locked}
              onClick={() => updateMode(item.value)}
              size="sm"
              title={locked ? entitlementCopy : item.description}
              variant={mode === item.value ? "default" : "secondary"}
            >
              {pendingMode === item.value ? "Updating..." : item.label}
            </Button>
          );
        })}
      </div>

      {alert ? (
        <div className="mt-5 rounded-[22px] border border-rose-400/20 bg-rose-400/10 p-4 text-sm leading-6 text-rose-100">
          {alert}
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Manual keeps all actions human-driven. Assisted stages high-confidence actions for approval. Autopilot can only apply safe actions inside guardrails when the workspace is entitled.
          </p>
          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Plan access
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{entitlementCopy}</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {modes.map((item) => {
              const locked = item.requiresAutonomyAccess && !canEnableExecution;

              return (
                <div
                  key={`${item.value}-detail`}
                  className="rounded-[18px] border border-white/8 bg-white/[0.03] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <StatusPill tone={locked ? "warning" : mode === item.value ? "success" : "neutral"}>
                      {locked ? "locked" : mode === item.value ? "active" : "available"}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
              );
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Queue
              </p>
              <p className="mt-2 text-xl font-semibold">{queuedCount}</p>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Executed
              </p>
              <p className="mt-2 text-xl font-semibold">{appliedCount}</p>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Blocked
              </p>
              <p className="mt-2 text-xl font-semibold">{blockedCount}</p>
            </div>
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {executionSyncedAt
              ? `Last execution cycle synced ${new Date(executionSyncedAt).toLocaleString("en-CA", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}`
              : "No execution cycle has run from live sync yet."}
          </p>
        </div>

      <div className="mt-5">
        <Button
          className="w-full"
          disabled={isRunning || !canRunCycle}
          onClick={runCycle}
          title={!canRunCycle ? entitlementCopy : "Run the current guardrailed optimization cycle."}
          variant="secondary"
        >
          {isRunning ? "Running cycle..." : "Run optimization cycle"}
        </Button>
      </div>
    </Card>
  );
}
