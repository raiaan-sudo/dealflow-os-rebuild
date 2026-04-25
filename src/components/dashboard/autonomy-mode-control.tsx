"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import type { AutonomyMode, SystemStatus } from "@/lib/services/autonomy-engine";

type AutonomyModeControlProps = {
  mode: AutonomyMode;
  systemStatus: SystemStatus;
  alert: string | null;
  executionSyncedAt: string | null;
  queuedCount: number;
  appliedCount: number;
  blockedCount: number;
};

const modes: Array<{ value: AutonomyMode; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "assisted", label: "Assisted" },
  { value: "autonomous", label: "Autonomous" },
];

export function AutonomyModeControl({
  mode,
  systemStatus,
  alert,
  executionSyncedAt,
  queuedCount,
  appliedCount,
  blockedCount,
}: AutonomyModeControlProps) {
  const router = useRouter();
  const [pendingMode, setPendingMode] = useState<AutonomyMode | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function updateMode(nextMode: AutonomyMode) {
    setPendingMode(nextMode);

    try {
      await fetch("/api/autonomy", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: nextMode }),
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
        {modes.map((item) => (
          <Button
            key={item.value}
            disabled={pendingMode !== null}
            onClick={() => updateMode(item.value)}
            size="sm"
            variant={mode === item.value ? "default" : "secondary"}
          >
            {pendingMode === item.value ? "Updating..." : item.label}
          </Button>
        ))}
      </div>

      {alert ? (
        <div className="mt-5 rounded-[22px] border border-rose-400/20 bg-rose-400/10 p-4 text-sm leading-6 text-rose-100">
          {alert}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Manual keeps all actions human-driven. Assisted stages high-confidence actions for approval. Autonomous executes safe actions inside the current guardrails.
          </p>
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
      )}

      <div className="mt-5">
        <Button className="w-full" disabled={isRunning} onClick={runCycle} variant="secondary">
          {isRunning ? "Running cycle..." : "Run optimization cycle"}
        </Button>
      </div>
    </Card>
  );
}
